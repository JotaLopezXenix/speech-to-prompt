# SPEC-02 — Cliente de Fulfillment secretless (app de Entra dedicada + credencial federada)

**Fecha:** 27-jul-2026 · **Fase JCC:** especificación · **Ciclo:** `marketplace-transactable` (spec 2 de 6).

> **Trazabilidad.** Implementa la decisión estructural **[E]5** del [`DESIGN.md`](DESIGN.md) de este ciclo (*fulfillment nativo + app de Entra dedicada single-tenant con credencial federada, secretless*) y el §10.2 del troceo. Depende de SPEC-01 solo conceptualmente (el entitlement que estas llamadas acabarán poblando); **no toca su código**. Es el **transporte** que consumirán SPEC-03 (landing) y SPEC-04 (webhook): aquí no hay rutas HTTP propias ni escritura en BD. Autocontenido: implementable sin releer la conversación de diseño.

## 1. Resumen

Añade un **cliente de las SaaS Fulfillment APIs de Microsoft Marketplace** que se autentica **sin ningún secreto**: la Managed Identity del App Service actúa como **credencial federada** de una **app de Entra dedicada**, cuyo token se canjea contra el recurso de Marketplace. Entrega el módulo de token, el cliente HTTP real, un **doble local con fixtures** (en local no hay Managed Identity) y un script de humo. No expone endpoints ni persiste nada.

## 2. Stack y arquitectura (código existente — se respeta)

- **Node.js 24 + Express**, sin build, ESM. `fetch` nativo. Tests con `node --test` (lógica pura, sin red ni BD).
- **Invariante del proyecto: secretless.** SQL, Blob y Azure OpenAI ya autentican por **Managed Identity asignada por el sistema** del App Service `speech-to-prompt-xenix` (`DefaultAzureCredential` en Storage/AOAI; `azure-active-directory-msi-app-service` en SQL). Este spec **no rompe ese patrón: lo extiende**.
- **Sin dependencias nuevas.** `@azure/identity` **4.13.1** (ya instalado) trae `ManagedIdentityCredential` y `ClientAssertionCredential`, que son exactamente el patrón Node que documenta Microsoft para *managed identity como credencial federada*.
- **Encaje:** un servicio nuevo y aislado en `src/services/fulfillment/`. Nadie lo importa todavía (lo harán SPEC-03/04). Ni `server.js`, ni las rutas, ni el middleware de identidad se tocan.

### 2.1 Por qué una app de Entra **aparte** de la del login

La app del login de usuarios (`ENTRA_CLIENT_ID`) autentica **personas** contra nuestra API. La del fulfillment autentica **nuestro servicio** contra Microsoft (client credentials). Microsoft lo pide separado, y su app ID queda **grabado en la *Technical configuration* de la oferta**: mezclarlas ataría la identidad de nuestros usuarios a la configuración comercial de la oferta. Son ciclos de vida distintos.

### 2.2 Cadena de confianza (el corazón del spec)

```
App Service  ──(1)──>  UAMI dedicada          token con aud = api://AzureADTokenExchange
                          │
                          └──(2)── se presenta como client_assertion ──> app de Entra "fulfillment"
                                                                            │
                                                                   (3) client_credentials
                                                                            ↓
                                            access token para 20e940b3-4c77-4b0b-9a53-9e16a1b010a7
                                                                            ↓
                                            (4) Bearer → https://marketplaceapi.microsoft.com/api/saas
```

La app de Entra **no tiene secreto ni certificado**: confía en la UAMI mediante una *federated identity credential* (FIC). En Azure, los pasos (1)–(3) los hace `@azure/identity`; en local no hay Managed Identity y por eso existe el doble (`mock`).

**Restricción verificada (no negociable):** issuer, subject y audience de la FIC se comparan **carácter a carácter** con los claims del token de la UAMI. Un espacio de más o una mayúscula distinta crea la FIC **sin error** y falla en el intercambio. Además, **la app de Entra y la Managed Identity deben estar en el mismo tenant** — es nuestro caso (ambas en el tenant de Xenix). El error `AADSTS700236` que bloquea este patrón aplica **solo a escenarios cross-tenant**; el nuestro no lo es.

### 2.3 Por qué UAMI y no la Managed Identity de sistema existente

Decisión de mesa común (27-jul). La documentación de Microsoft solo respalda **Managed Identity asignada por el usuario** como sujeto de una FIC (el selector del portal únicamente lista UAMIs). La de sistema funciona en same-tenant según reportes de la comunidad, pero es camino no documentado. Se elige **UAMI dedicada** por camino soportado y porque **sobrevive a que se recree el App Service** (el `principalId` de una MI de sistema cambia y rompería la FIC en silencio). Coste asumido: un recurso Azure más y verificar que añadirla no perturba la resolución de la MI de sistema (ver §5 y §8).

## 3. Delta (ADDED / MODIFIED / REMOVED)

**ADDED**
- `src/services/fulfillment/token.js` — adquisición del token secretless (UAMI → assertion → app → recurso Marketplace).
- `src/services/fulfillment/errors.js` — `FulfillmentError` + helpers puros de clasificación/reintento.
- `src/services/fulfillment/live.js` — cliente HTTP real de las Fulfillment APIs (inyectable para tests).
- `src/services/fulfillment/mock.js` — doble con fixtures deterministas para desarrollo local y SPEC-03.
- `src/services/fulfillment/index.js` — factoría `live`/`mock` + contrato compartido documentado.
- `test/fulfillment.test.js` — tests de lógica pura + del cliente con `fetch` inyectado (sin red).
- `scripts/test-fulfillment.js` — script de humo (idioma de `scripts/test-azure-*.js`): adquiere token y, opcionalmente, llama a la API.

**MODIFIED**
- *(ninguno en código de aplicación).* Solo App Settings en Azure (§6) y, si existiera, documentación de entorno local.

**REMOVED**
- *(nada).*

## 4. Interfaces y contratos

### 4.1 Configuración (entorno)

| Variable | Dónde | Descripción |
|---|---|---|
| `MARKETPLACE_MODE` | ambos (opcional) | `live` \| `mock`. Por defecto: `live` si `WEBSITE_HOSTNAME` está presente (Azure), `mock` si no. Permite forzar cualquiera de los dos. |
| `MARKETPLACE_TENANT_ID` | Azure | Tenant de Xenix (el de la app de Entra y la UAMI; deben coincidir). |
| `MARKETPLACE_APP_CLIENT_ID` | Azure | *Application (client) ID* de la app de Entra **dedicada al fulfillment**. El mismo que se grabará en la *Technical configuration* de la oferta. |
| `MARKETPLACE_MI_CLIENT_ID` | Azure | *Client ID* de la **UAMI** (ojo: para `ManagedIdentityCredential` va el **client ID**; para el `subject` de la FIC va el **principal/object ID**, que es otro GUID). |
| `MARKETPLACE_API_BASE` | ambos (opcional) | Por defecto `https://marketplaceapi.microsoft.com/api/saas`. |
| `MARKETPLACE_API_VERSION` | ambos (opcional) | Por defecto `2018-08-31`. |

En modo `mock` no se lee ninguna de las tres variables de identidad. **Ninguna es un secreto**: son identificadores públicos, van en App Settings en claro y pueden aparecer en logs.

### 4.2 `token.js` — adquisición secretless

```js
import { ClientAssertionCredential, ManagedIdentityCredential } from '@azure/identity';

// Audiencia del token de la Managed Identity que se usará como client assertion
// (nube global; hay variantes USGov/China que aquí no aplican).
const MI_AUDIENCE = 'api://AzureADTokenExchange';

// Recurso de las SaaS Fulfillment APIs de Microsoft Marketplace. Este GUID es fijo
// y global (no es nuestro): identifica la API de Marketplace. El mismo token sirve
// para las Metering APIs, si algún día se usan.
export const MARKETPLACE_SCOPE = '20e940b3-4c77-4b0b-9a53-9e16a1b010a7/.default';

let credential = null; // instancia única: MSAL cachea el token de app internamente

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Fulfillment sin configurar: falta ${name}`);
  return v;
}

function getCredential() {
  if (credential) return credential;
  const mi = new ManagedIdentityCredential({ clientId: required('MARKETPLACE_MI_CLIENT_ID') });
  credential = new ClientAssertionCredential(
    required('MARKETPLACE_TENANT_ID'),
    required('MARKETPLACE_APP_CLIENT_ID'),
    async () => {
      const t = await mi.getToken(`${MI_AUDIENCE}/.default`);
      if (!t?.token) throw new Error('No se pudo obtener el token de la Managed Identity (assertion).');
      return t.token;
    }
  );
  return credential;
}

// Devuelve un access token para las Fulfillment APIs. Cachea vía MSAL.
export async function getFulfillmentToken() {
  const t = await getCredential().getToken(MARKETPLACE_SCOPE);
  if (!t?.token) throw new Error('No se pudo obtener el token de fulfillment (intercambio federado).');
  return t.token;
}

// Solo para tests: descarta la credencial memoizada.
export function _resetCredential() { credential = null; }
```

> **Nota de caché.** No se implementa caché propia: `ClientAssertionCredential` usa MSAL, que cachea el token de aplicación y renueva la assertion cuando toca. Añadir otra capa sería duplicar lógica de expiración. (El token de Marketplace vive 1 h.)

### 4.3 `errors.js` — error tipado y política de reintento

```js
export class FulfillmentError extends Error {
  constructor({ status, message, requestId, correlationId, body }) {
    super(message);
    this.name = 'FulfillmentError';
    this.status = status ?? null;          // HTTP, o null si fue fallo de red
    this.requestId = requestId ?? null;    // x-ms-requestid que enviamos
    this.correlationId = correlationId ?? null;
    this.body = body ?? null;              // cuerpo de respuesta (recortado)
  }
}

// PURO. 429 y 5xx son reintentables; 4xx (salvo 429) no lo son nunca.
export function isRetryableStatus(status) {
  if (status === 429) return true;
  return typeof status === 'number' && status >= 500 && status <= 599;
}

// PURO. Espera en ms para el intento n (0-based), honrando Retry-After si viene.
export function retryDelayMs(attempt, retryAfterHeader) {
  const ra = Number(retryAfterHeader);
  if (Number.isFinite(ra) && ra >= 0) return Math.min(ra * 1000, 30000);
  return Math.min(500 * 2 ** attempt, 8000);
}
```

**Semántica de los errores de Microsoft** (verificada en la doc; se documenta porque SPEC-03/04 dependen de distinguirlos):

| Código | Significado | Reacción |
|---|---|---|
| 400 | En `resolve`: el `x-ms-marketplace-token` falta, está mal formado o **caducó** (vive 24 h). | No reintentar. SPEC-03 muestra el mensaje de "reabre la suscripción y pulsa Configurar cuenta". |
| 401 | Token inválido/expirado, **o el app ID usado no es el de la *Technical configuration* de la oferta**. | No reintentar. Suele ser configuración, no transitorio. |
| 403 | Registro SaaS mal hecho (típicamente falta el service principal del recurso, §6.1). | No reintentar. |
| 404 | Suscripción/operación no encontrada (en `activate`, además: suscripción en *Unsubscribed*). | No reintentar. |
| 409 | En `ackOperation`: ya se cumplió una actualización más reciente. | No reintentar; tratar como "ya resuelto". |
| 429 / 5xx | Transitorio. | Reintentar (§4.4). |

### 4.4 `live.js` — cliente HTTP real

Factoría **inyectable** (`fetchImpl`/`getToken`) para poder testear sin red:

```js
export function createLiveClient({
  fetchImpl = globalThis.fetch,
  getToken = getFulfillmentToken,
  baseUrl = process.env.MARKETPLACE_API_BASE || 'https://marketplaceapi.microsoft.com/api/saas',
  apiVersion = process.env.MARKETPLACE_API_VERSION || '2018-08-31',
  maxAttempts = 3,
  timeoutMs = 20000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) { /* … */ }
```

Reglas de transporte, todas obligatorias:

1. **`api-version` en toda petición** (query), valor `2018-08-31`.
2. **Cabeceras**: `authorization: Bearer <token>`, `content-type: application/json`, `x-ms-requestid`, `x-ms-correlationid`. Ambos IDs se generan con `crypto.randomUUID()`.
3. **`x-ms-requestid` estable entre reintentos** de la misma llamada lógica: es la clave con la que Microsoft deduplica. Regenerarlo en cada intento convertiría un reintento en una operación nueva. El `correlationid` también se mantiene, para poder correlacionar en soporte.
4. **Reintentos**: hasta `maxAttempts` (3) si `isRetryableStatus(status)` o si el `fetch` falla por red/timeout. Espera según `retryDelayMs`. **El token se re-solicita en cada intento** (`getToken()` cachea; si el fallo fue 401 por expiración, el siguiente intento ya lleva uno fresco).
5. **Timeout** por intento con `AbortSignal.timeout(timeoutMs)`.
6. **Nunca se registra el `x-ms-marketplace-token` ni el access token.** Los logs llevan método, ruta (sin query sensible), status, `x-ms-requestid` y `x-ms-correlationid`. Hay un helper `redact()` para el cuerpo de error.
7. **No se reinterpretan los payloads**: el cliente devuelve el JSON de Microsoft **tal cual**. El mapeo a columnas de `entitlements` es responsabilidad de SPEC-03/04, que es donde vive esa decisión.

### 4.5 Contrato del cliente (idéntico en `live` y `mock`)

| Método | HTTP subyacente | Devuelve |
|---|---|---|
| `resolve(marketplaceToken)` | `POST /subscriptions/resolve` con cabecera `x-ms-marketplace-token` | JSON de resolve (ver abajo) |
| `activate(subscriptionId, { planId, quantity })` | `POST /subscriptions/{id}/activate` | `void` (200 sin cuerpo) |
| `getSubscription(subscriptionId)` | `GET /subscriptions/{id}` | Subscription |
| `listSubscriptions({ continuationToken } = {})` | `GET /subscriptions` | `{ subscriptions: [], '@nextLink'? }` — **cuerpo vacío si no hay ninguna** → el cliente normaliza a `{ subscriptions: [] }` |
| `listOperations(subscriptionId)` | `GET /subscriptions/{id}/operations` | `{ operations: [] }` (vacío si no hay pendientes) |
| `getOperation(subscriptionId, operationId)` | `GET /subscriptions/{id}/operations/{opId}` | Operation |
| `ackOperation(subscriptionId, operationId, status)` | `PATCH /subscriptions/{id}/operations/{opId}` body `{ status }` | `void`. `status` ∈ `'Success' \| 'Failure'` (se valida en cliente) |

> El **token de compra debe ir URL-decodificado**: llega URL-encoded en la query de la landing. Decodificarlo es responsabilidad de **SPEC-03** (quien lee la query); el cliente recibe el token ya decodificado y lo manda tal cual en la cabecera.

**Campos del `resolve` que consumirá SPEC-03** (nombres exactos de Microsoft): `id` (subscriptionId), `subscriptionName`, `offerId`, `planId`, `quantity`, y anidado `subscription.{saasSubscriptionStatus, beneficiary:{emailId,objectId,tenantId,puid}, purchaser:{…}, term:{termUnit,startDate,endDate}, isFreeTrial, autoRenew}`. El **match estricto** de la decisión [E]1 se hace contra `subscription.beneficiary.objectId` + `tenantId`.

`saasSubscriptionStatus` ∈ `PendingFulfillmentStart | Subscribed | Suspended | Unsubscribed`. `action` de una operación ∈ `ChangePlan | ChangeQuantity | Reinstate`; su `status` ∈ `NotStarted | InProgress | Failed | Succeeded | Conflict`.

### 4.6 `mock.js` — doble local

Misma interfaz, en memoria, **determinista** (sin relojes ni aleatoriedad que hagan flaky a los tests):

- Sirve una suscripción sembrada cuyo **beneficiario coincide con el usuario dev** (`DEV_USER_OID` / `DEV_USER_TID` / `DEV_USER_EMAIL`), para que SPEC-03 pueda ejercer el camino feliz del match estricto en local.
- `resolve()` reconoce **tokens de control** para provocar los caminos de error sin red: `'expired'` → `FulfillmentError` 400; `'mismatch'` → suscripción con otro beneficiario (ejercita el bloqueo estricto de [E]1); cualquier otro valor → camino feliz.
- `activate()` cambia el estado en memoria de `PendingFulfillmentStart` a `Subscribed`, y **falla con 404 si la suscripción está `Unsubscribed`** (mismo contrato que el real).
- `listOperations()` devuelve vacío salvo que un test siembre una operación con el helper `_seedOperation()`.

### 4.7 `index.js` — factoría

```js
export function getFulfillmentClient() // memoizada; elige live|mock según MARKETPLACE_MODE
export function _resetClient()          // solo tests
```

Al arrancar en modo `live` **no se valida la configuración** (arrancar la app no debe depender del Marketplace): el error aflora en la primera llamada, con un mensaje que nombra la variable que falta. En modo `mock` se emite **un `console.warn` una sola vez** para que nadie confunda un entorno con otro.

## 5. Qué se PRESERVA (superficie de regresión)

- **Todo el código de aplicación existente**: este spec no modifica ni un fichero previo. Rutas, `server.js`, middleware de identidad y gate de SPEC-01 quedan intactos.
- **La Managed Identity de sistema y los tres accesos que dependen de ella** (Azure SQL por `azure-active-directory-msi-app-service`, Blob y Azure OpenAI por `DefaultAzureCredential`). Añadir una UAMI al App Service **no debe alterar** cuál identidad resuelven esas rutas. Por eso el token de fulfillment usa un `ManagedIdentityCredential` **con `clientId` explícito** y **no** se define la variable de entorno `AZURE_CLIENT_ID` (que sí afectaría globalmente a `DefaultAzureCredential`). Verificación obligatoria en §8.
- **El invariante secretless**: no se introduce ningún secreto, certificado ni cadena de conexión, ni en código ni en App Settings.
- **La frontera de seguridad del ciclo 1** (`token-verify.js`): sin relación con este spec, sin cambios.
- **`npm test` verde** (16/16 antes de este spec; suben con los tests nuevos).

## 6. Provisión en Azure (prerrequisito de ops, ordenado)

Estos pasos los ejecuta el usuario (o los hacemos juntos); **son requisito para que §8 pueda verificarse en Azure**. Grupo de recursos `rg-speech-to-prompt`, West Europe, App Service `speech-to-prompt-xenix`.

**6.1 Service principal del recurso de Marketplace** (una vez por tenant; su ausencia es la causa habitual de los 403):
```bash
az ad sp create --id 20e940b3-4c77-4b0b-9a53-9e16a1b010a7
```

**6.2 App de Entra dedicada.** Registro nuevo, nombre sugerido `speech-to-prompt-fulfillment`. **Single tenant** (Microsoft lo recomienda). **Sin secreto y sin certificado.** **No** activar *Allow public client flows* (Microsoft lo prohíbe explícitamente para este escenario). Sin permisos de API: el acceso lo da la *Technical configuration* de la oferta, no un consentimiento.

**6.3 UAMI y asignación al App Service:**
```bash
az identity create -g rg-speech-to-prompt -n id-speech-to-prompt-fulfillment -l westeurope
az webapp identity assign -g rg-speech-to-prompt -n speech-to-prompt-xenix \
  --identities /subscriptions/<subId>/resourceGroups/rg-speech-to-prompt/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-speech-to-prompt-fulfillment
```
Anotar los **dos** GUID de la UAMI: `clientId` (para `MARKETPLACE_MI_CLIENT_ID`) y `principalId` (para el `subject` de la FIC). **No son el mismo valor** y confundirlos produce un fallo que solo aparece en el intercambio de token.

**6.4 Credencial federada en la app** (portal: *Certificates & secrets → Federated credentials → escenario "Managed Identity"*; o CLI):
```bash
az ad app federated-credential create --id <objectId-de-la-app> --parameters '{
  "name": "speech-to-prompt-uami",
  "issuer": "https://login.microsoftonline.com/<tenantId>/v2.0",
  "subject": "<principalId-de-la-UAMI>",
  "audiences": ["api://AzureADTokenExchange"]
}'
```
Sin espacios sobrantes: la comparación es exacta y sensible a mayúsculas.

**6.5 App Settings** del App Service: `MARKETPLACE_TENANT_ID`, `MARKETPLACE_APP_CLIENT_ID`, `MARKETPLACE_MI_CLIENT_ID`. (`MARKETPLACE_MODE` no hace falta: en Azure el valor por defecto ya es `live`.)

**6.6 Partner Center — *Technical configuration* de la oferta `speechtoprompt`:** grabar **el mismo** tenant ID y app ID de 6.2. **Hasta este paso, las llamadas reales a la API devuelven 401/403 por diseño** (Microsoft autoriza comparando el app ID del token con el de la oferta). Los pasos 1–2 de §8.3 sí se pueden verificar antes. Se cruza con el `RUNBOOK-partner-center.md`.

## 7. Fuera de alcance (de este spec)

- **Landing de activación** y **webhook** (SPEC-03/04): aquí no se crea ninguna ruta HTTP ni se escribe en `entitlements`.
- **Marketplace Metering Service API** (reporte de consumo pay-as-you-go). Usa **el mismo token y el mismo recurso**, así que `token.js` ya sirve; el cliente de metering llegará cuando negocio cierre el modelo de precio (ver nota al final).
- **Cambio de plan / cantidad y cancelación iniciados por nosotros** (`PATCH`/`DELETE` de la suscripción): el DESIGN §4 los deja fuera de v1. Sí entra `ackOperation`, que es la respuesta a lo que Microsoft nos pide, no una acción nuestra.
- **Plan B de certificado en Key Vault**: descartado como trabajo — la credencial federada está verificada como viable para nuestro caso (same-tenant). Se reactivaría solo si §8.3 fallase de forma irrecuperable.
- **Retención, purga y pantalla post-baja** (SPEC-05); **configuración de la oferta y Preview** (SPEC-06 / runbook).

## 8. Verificación

### 8.1 Unitario (`npm test`, sin red ni BD)

`test/fulfillment.test.js`, con `fetch` inyectado:

- `isRetryableStatus`: 429 y 500/503 → `true`; 400/401/403/404/409 → `false`; no-numérico → `false`.
- `retryDelayMs`: backoff creciente y acotado; `Retry-After: 2` → 2000 ms; cabecera basura → backoff normal.
- **`x-ms-requestid` estable entre reintentos**: un `fetch` falso que devuelve 503 y luego 200 debe recibir **el mismo** `x-ms-requestid` en ambos intentos (regresión clave: rompe la idempotencia del lado de Microsoft).
- **Reintentos**: 503→503→200 resuelve con 3 llamadas; 400 resuelve con **1** (no reintenta) y lanza `FulfillmentError` con `status: 400`.
- **Cabeceras y URL**: toda petición lleva `api-version=2018-08-31`, `authorization: Bearer …`, `content-type` y ambos IDs; `resolve` añade `x-ms-marketplace-token` con el valor **exacto** recibido.
- **`listSubscriptions` con cuerpo vacío** (caso real cuando no hay suscripciones) → `{ subscriptions: [] }`, no una excepción de parseo.
- **`ackOperation` valida `status`**: un valor distinto de `Success`/`Failure` lanza sin llegar a la red.
- **Redacción**: el helper de log no emite nunca el access token ni el `x-ms-marketplace-token`.
- **Mock**: camino feliz devuelve beneficiario = usuario dev; `'expired'` → 400; `'mismatch'` → otro beneficiario; `activate` transiciona a `Subscribed`.

### 8.2 Local (modo `mock`)

- Con la app arrancada en local, `getFulfillmentClient()` devuelve el mock y **avisa una sola vez** por consola.
- El ciclo `resolve → activate → getSubscription` es coherente en memoria (el estado cambia a `Subscribed`).
- **No se produce ninguna llamada de red** (el mock no importa `token.js`).

### 8.3 Azure — escalera de verificación (`scripts/test-fulfillment.js`)

Ejecutar **desde el App Service** (SSH/consola Kudu), no desde local: el intercambio federado requiere la Managed Identity.

1. **Token de la UAMI** con audiencia `api://AzureADTokenExchange` → se obtiene. *(Falla aquí = la UAMI no está asignada al App Service o el `clientId` es incorrecto.)*
2. **Intercambio federado** → access token para `20e940b3-…`. **Este paso es el corazón del spec: si sale, el secretless está probado.** *(Falla aquí = issuer/subject/audience de la FIC no coinciden exactamente, o se usó el `clientId` de la UAMI donde iba el `principalId`.)* Comprobar en el token decodificado: `aud` = recurso de Marketplace y `appid` = app de fulfillment.
3. **`listSubscriptions()`** → **200 con lista vacía** una vez hecho §6.6. **Antes de §6.6 se espera 401/403: eso NO es un fallo del cliente**, es Microsoft rechazando un app ID que aún no está en la oferta. Se registra el resultado obtenido, sea cual sea.

### 8.4 Regresión (debe seguir verde tras añadir la UAMI)

Este es el único riesgo real que introduce el spec, y hay que comprobarlo **explícitamente tras 6.3**:

- La app **arranca y sirve** con normalidad (`/api/health`).
- **Azure SQL** sigue conectando por la MI de **sistema** (login, historial de sesiones).
- **Blob Storage** sigue sirviendo audio de una sesión existente.
- **Azure OpenAI** sigue destilando (una destilación real de extremo a extremo).
- `npm test` verde.

Si alguna fallase, la causa esperable es que el entorno esté resolviendo la UAMI donde antes resolvía la de sistema; el remedio es fijar explícitamente la identidad en la ruta afectada, **nunca** definir `AZURE_CLIENT_ID` global.

---

## ADDENDUM 2026-07-27 — provisión Azure ejecutada (as-built) + dos enmiendas al §6

La provisión de §6.1–6.5 se ejecutó el 27-jul **antes** de implementar, para que la verificación §8.3/§8.4 no quedara pendiente de ops. Resultado y desviaciones:

**Identificadores as-built** (ninguno es secreto):

| Recurso | Valor |
|---|---|
| Tenant (Xenix) | `3b1870f6-ff96-440e-9d46-a3db343eae1c` |
| Suscripción | `247bb14b-bd75-4dc3-a695-0d22baf00b87` |
| App de Entra `speech-to-prompt-fulfillment` — **client ID** | `a29c76de-8827-4f6a-97e0-7d94e058601b` |
| ídem — object ID / SP object ID | `56f0fa6f-6e1b-4a46-913b-27c5fa9fc15a` / `f5002b4a-7eb5-4f68-9265-fcc027e9f74b` |
| UAMI `id-speech-to-prompt-fulfillment` — **client ID** (→ `MARKETPLACE_MI_CLIENT_ID`) | `8fab969a-f149-4820-bda0-b1acbc61e3ea` |
| ídem — **principal ID** (→ *subject* de la FIC) | `1a63ee6b-af62-45c3-afad-6fb9b555ffec` |
| Credencial federada | `speech-to-prompt-uami` (id `9fd18f7d-…`), issuer `…/3b1870f6-…/v2.0`, audience `api://AzureADTokenExchange` |

**Enmienda 1 — §6.1 ya estaba satisfecho.** El service principal del recurso de Marketplace (`20e940b3-…`, *MarketplaceAPI ISV*) **ya existía** en el tenant; no hubo que crearlo. Queda descartada de antemano la causa habitual de los 403.

**Enmienda 2 — falta un paso: el service principal de NUESTRA app.** El §6.2 describía el registro asumiendo el flujo de portal, que crea el *application object* y su *service principal* juntos. **`az ad app create` crea solo el application object**, y sin service principal el flujo client-credentials no emitiría token. Se añadió `az ad sp create --id <appId>`. Si algún día se rehace la provisión por CLI, este paso es obligatorio.

**Estado secretless verificado:** la app tiene `passwordCredentials: 0` y `keyCredentials: 0`; no se creó ningún secreto ni certificado. `AZURE_CLIENT_ID` **no** se definió (habría alterado `DefaultAzureCredential` globalmente).

**Regresión §8.4 — lo verificado tras enganchar la UAMI** (el App Service pasó de `SystemAssigned` a `SystemAssigned, UserAssigned`, conservando el mismo `principalId` de sistema `2990520e-…`, por lo que los RBAC de Blob/AOAI y el usuario contenido de SQL siguen válidos):

- `GET /api/health/db` → **200 `{"ok":true}`** — Azure SQL sigue autenticando por la MI **de sistema**. Es la pieza de mayor riesgo y está verde.
- `GET /` → **200 text/html** — la SPA arranca y se sirve.
- `GET /api/v1/sessions` sin token → **401 `UNAUTHENTICATED`** — el middleware de identidad y el gate siguen intactos.
- **Azure OpenAI** → **verificado por el usuario** (destilación real, 27-jul). ✔
- **Blob** → pendiente de smoke logueado. **Corrección del método:** el §8.4 pedía "servir audio de una sesión existente", pero **no existe reproductor de audio en la UI** (el endpoint `GET /sessions/:id/audio/:ordinal` existe en backend y en el cliente tipado, pero ninguna pantalla lo consume). Las pruebas válidas son: **grabar un segmento** (escritura, `transcribe.js` → `store.put`) y **Reprocesar** desde Historial (lectura, `store.exists` + re-transcripción del audio guardado). Hacerlo sobre una **sesión nueva desechable**: Reprocesar recalcula la transcripción de la sesión.

**Nota de método:** se intentó verificar los peldaños 1–2 del §8.3 sin desplegar, ejecutando la prueba vía la API de comandos de Kudu. **No es posible:** el contenedor de Kudu **no** recibe el endpoint de Managed Identity (`IDENTITY_ENDPOINT` ausente) y su `node_modules` es un symlink a `/node_modules` del contenedor de la app. La MI solo existe en el contenedor de la aplicación → **el intercambio federado solo se puede probar con código desplegado**. Sí se confirmó que los App Settings se heredan y que el runtime es **Node 24.7**.

**Deuda detectada de paso (fuera de este spec):** el App Service conserva el App Setting `MICROSOFT_PROVIDER_AUTHENTICATION_SECRET`, secreto residual de **Easy Auth**, retirado en el ciclo 1. Antes de borrarlo hay que confirmar que Easy Auth está desactivado a nivel de plataforma. Equivalente a la deuda de `ALLOWED_EMAILS`, ya saldada.

---

### Nota — tensión pendiente con el modelo de precio (mesa común)

En la reunión con Microsoft ISV Success (23-jul) se le comunicó a Microsoft la intención de vender **pay-as-you-go**, y su consultor recomendó *flat rate + metered billing* reportando consumo por API, sugiriendo incorporarlo pronto a la lógica de la aplicación. El **DESIGN §4 de este ciclo deja el metered billing fuera de v1** y asume comprador individual sin `quantity`. **Este spec no se ve afectado** (el transporte y el token son los mismos para cualquier modelo, y `token.js` ya sirve a las Metering APIs), pero **SPEC-03 y SPEC-06 sí lo estarán**. Decisión de negocio a cerrar — anotada como pregunta prioritaria para la reunión del 29-jul.
