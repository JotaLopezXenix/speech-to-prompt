# SPEC — Ciclo 1 `identidad-entra`

**DESIGN de referencia:** `./DESIGN.md` (y el del programa en `../DESIGN.md`). Si SPEC y DESIGN chocan, manda el SPEC.
**Un solo SPEC** (cutover atómico: backend + esquema + frontend deben aterrizar juntos o la auth se rompe).

## 1. Resumen

Sustituir la identidad basada en Easy Auth (tenant Xenix, confianza en cabeceras) por **validación *stateless* de token bearer** emitido por la plataforma de identidad de Microsoft (Entra multi-tenant + cuentas personales MSA). El backend valida el JWT y aplica una **lista blanca de correos** interina; el frontend obtiene el token con MSAL.js. Se conserva `owner_id`/`callerId` y el aislamiento; cambia **cómo** se resuelve `req.user`, no el contrato que consumen las rutas.

## 2. Stack y arquitectura

Stack dado (no se cambia): Node ≥20 ESM, Express 4, SQL Server (`mssql`), frontend vanilla ES modules sin build, despliegue en Azure App Service.

- **Backend — validación stateless de token bearer** con [`jose`](https://www.npmjs.com/package/jose): firma vía JWKS de Microsoft, `aud` = nuestra API, `exp`/`nbf`, e **issuer multi-tenant** (`iss === https://login.microsoftonline.com/{tid}/v2.0`, reconstruido con el `tid` del propio token; cubre también MSA). Sin sesión de servidor ni cookies. Justificación: sirve igual a web, móvil y landing; es el cimiento del DESIGN.
- **Registro de app Entra** (config de plataforma, no código): uno solo, *supported account types* = **AzureADandPersonalMicrosoftAccount**, plataforma **SPA** con redirect URIs (prod + `http://localhost:3000`), y **Expose an API** con scope `access_as_user`. El SPA pide un **access token** para ese scope; el backend valida ese access token (no el ID token). Móvil (ciclo futuro) será otro registro pidiendo el mismo scope; como `external_id = tid.oid`, la cuenta es idéntica entre clientes.
- **Frontend — interino y mínimo** (el ciclo 2 rehace el frontend con build): [`@azure/msal-browser`](https://www.npmjs.com/package/@azure/msal-browser) **vendorizado** en `public/vendor/` (no hay bundler). Adjunta el bearer en el único `request()` de `api-client.js`. No se invierte en UI de login más allá de lo funcional.
- **Gate a nivel app** sustituye el gate de plataforma de Easy Auth. Público: `/api/health`, `/api/auth-config` (config MSAL no secreta) y el shell/login estático. Protegido (bearer + lista blanca): `/api/sessions`, `/api/diagnostics`, `/api/prompts` y **`/api/config`** (hoy escribe API keys sin protección de app).

**Dependencias nuevas:** backend `jose`; frontend `@azure/msal-browser` (vendorizado, no en `dependencies` de runtime del server).

## 3. Delta

### ADDED
- `migrations/006_identity_multitenant.sql` — `ADD tenant_id`; `DROP CONSTRAINT UQ_users_email`.
- `src/services/token-verify.js` — verificación del access token (jose) y extracción de claims.
- `src/utils/allowlist.js` — normalización + comprobación de la lista blanca (testeable).
- `src/routes/auth-config.js` — `GET /api/auth-config` (público) → config MSAL no secreta.
- `public/js/auth.js` — envoltura MSAL: init, login, `getToken()`, logout.
- `public/vendor/msal-browser.min.js` — build **UMD** vendorizado de MSAL (`window.msal`; v5.17.1). Se carga con `<script>` plano antes del módulo (patrón no-build más robusto que un ESM con imports bare).
- `test/allowlist.test.js`, `test/token-verify.test.js` — tests de lógica pura.

### MODIFIED
- `src/middleware/identity.js` — de leer cabeceras Easy Auth a validar bearer + lista blanca + construir `external_id`; conserva el bypass `DEV_USER_*` en local.
- `src/services/user-store.js` — `ensureUser` casa **solo** por `external_id`, escribe `tenant_id`, elimina la reconciliación por email.
- `server.js` — monta `identity` también en `/api/config` **y en `/api/prompts`**; monta `auth-config` público; `/api/health` sigue público.
- `public/js/api-client.js` — adjunta `Authorization: Bearer`; maneja 401 (refresh silencioso → login interactivo).
- `public/js/app.js` + `public/index.html` — puerta de auth al cargar + pantalla de login mínima.
- `.env`/App Settings (doc, §6/§ops) — nuevas variables `ENTRA_*`, `ALLOWED_EMAILS`.

### REMOVED
- La ruta de lectura de cabeceras `X-MS-CLIENT-PRINCIPAL-*` en `identity.js`.
- La reconciliación por email en `ensureUser`.
- `UQ_users_email` (vía migración `006`).
- **Ops:** Easy Auth (App Service Authentication) se desactiva/deja en "permitir no autenticado" para que la app gestione su propia auth.

## 4. Interfaces y contratos

### `src/services/token-verify.js`
```
verifyAccessToken(bearerToken: string) -> Promise<{ tid, oid, email, name }>
  - createRemoteJWKSet(https://login.microsoftonline.com/common/discovery/v2.0/keys) (cacheado)
  - jwtVerify con audience = ENTRA_API_AUDIENCE, algorithms ['RS256']
  - assert payload.iss === `https://login.microsoftonline.com/${payload.tid}/v2.0`
    ⚠ REQUIERE tokens v2.0: el registro de app debe fijar requestedAccessTokenVersion:2
      (en v1.0 el iss es sts.windows.net/{tid}/ y se rechazaría). Ver guía de Entra.
  - assertScope(payload, ENTRA_REQUIRED_SCOPE ?? 'access_as_user') — el `scp` debe
    contener el scope delegado (hardening; desactivable con ENTRA_REQUIRED_SCOPE='')
  - email = payload.preferred_username || payload.email || payload.upn || null
  - lanza en firma/aud/iss/scope/exp inválidos (el middleware traduce a 401)
buildExternalId(tid, oid) -> `${tid}.${oid}`   // exportada, pura, testeable
```

### `src/utils/allowlist.js`
```
parseAllowlist(raw: string|undefined) -> Set<string>   // split ',', trim, toLowerCase, descarta vacíos
isAllowed(email: string|null, allow: Set<string>) -> boolean
  - fail-closed: email null/'' → false; allow vacío → false
```

### `src/middleware/identity.js` (nuevo flujo)
```
identity(req,res,next):
  1. Bypass local: si !WEBSITE_HOSTNAME y no hay header Authorization →
       principal = { tid: DEV_USER_TID||'dev-tenant', oid: DEV_USER_OID||'dev-oid',
                     email: DEV_USER_EMAIL, name: DEV_USER_NAME }; salta lista blanca.
  2. Si no: Authorization: Bearer <token>; ausente → 401 UNAUTHENTICATED.
  3. verifyAccessToken(token) → {tid,oid,email,name}; error → 401 TOKEN_INVALID.
  4. isAllowed(email, allowlist) === false → 403 NOT_ALLOWLISTED.
  5. externalId = buildExternalId(tid, oid).
  6. id = ensureUser({ externalId, tenantId: tid, email, name }).
  7. req.user = { id, externalId, tenantId: tid, oid, email, name }; next().
```
**Contrato preservado:** `req.user.id` sigue siendo el `users.id` interno que consumen todas las rutas.

### `src/services/user-store.js`
```
ensureUser({ externalId, tenantId, email, name }) -> Promise<users.id>
  1. UPDATE users SET last_login_at=now, email=COALESCE(@email,email),
       display_name=COALESCE(@name,display_name), tenant_id=COALESCE(@tenantId,tenant_id)
       OUTPUT INSERTED.id WHERE external_id=@externalId  → si hay fila, return id.
  2. INSERT (external_id, tenant_id, email, display_name, last_login_at) OUTPUT INSERTED.id.
  3. Carrera: re-SELECT id WHERE external_id=@externalId.
  (SIN paso de reconciliación por email.)
```

### `GET /api/auth-config` (público)
```
200 → { clientId: ENTRA_CLIENT_ID, authority: ENTRA_AUTHORITY||'https://login.microsoftonline.com/common', apiScope: ENTRA_API_SCOPE }
```

### `public/js/auth.js` (MSAL)
```
initAuth() -> Promise<void>          // lee /api/auth-config, crea PublicClientApplication, handleRedirectPromise
getToken() -> Promise<string|null>   // acquireTokenSilent(apiScope); si falla, null (el caller decide interactivo)
login() -> Promise<void>             // loginRedirect(apiScope)
logout() -> void                     // logoutRedirect (client-side; backend stateless)
getAccount() -> AccountInfo|null
```

### `public/js/api-client.js` (delta en `request()`)
```
- const token = await getToken(); si token → headers.Authorization = `Bearer ${token}`
- si res.status === 401: intentar re-adquirir token (interactivo) una vez y reintentar; si sigue 401 → login()
- /api/health y /api/auth-config no requieren token (warmup() ya tolera errores)
```

### Variables de entorno / App Settings
- Backend: `ENTRA_API_AUDIENCE` (client id o `api://{clientid}`), `ENTRA_CLIENT_ID`, `ENTRA_AUTHORITY` (opc.), `ENTRA_API_SCOPE` (`api://{clientid}/access_as_user`), `ALLOWED_EMAILS` (coma-separados).
- Local: `DEV_USER_OID`, `DEV_USER_EMAIL`, `DEV_USER_NAME`, `DEV_USER_TID` (nuevo).

## 5. Qué se PRESERVA (regresión)

- **Aislamiento por propietario:** `owner_id`, `callerId` y los filtros de `session-store.js`, `usage-store.js`, `diagnostics-store.js` — sin cambios. Una sesión de otro owner sigue devolviendo 404.
- **Contrato `req.user.id`:** todas las rutas (`sessions`, `transcribe`, `distill`, `diagnostics`) siguen leyendo `req.user.id`; solo cambia cómo se resuelve.
- **JIT:** `ensureUser` sigue devolviendo `users.id`; cambia la clave (external_id) y desaparece el matching por email.
- **Sesiones/histórico existentes:** preservados vía el backfill (§6).
- **`/api/health`** sigue público y `warmup()` sigue fire-and-forget.
- **Flujo funcional** (grabar → transcribir → destilar → histórico) intacto tras autenticarse.
- **Pipeline secretless** (Managed Identity a SQL/Blob/AOAI) intacto: `@azure/identity` se usa para recursos Azure, no para la auth de usuario.

## 6. Migración de datos

**Migración `006_identity_multitenant.sql`** (idempotente donde se pueda):
```sql
ALTER TABLE dbo.users ADD tenant_id NVARCHAR(200) NULL;
ALTER TABLE dbo.users DROP CONSTRAINT UQ_users_email;
```
Se conserva `UX_users_external_id` (índice único filtrado sobre `external_id`).

**Backfill determinista de usuarios existentes** (paso aparte, verificado — R3). Observación clave: el `external_id` actual **ya es el `oid` a secas** (lo puso Easy Auth desde `X-MS-CLIENT-PRINCIPAL-ID`). Por tanto el valor nuevo es `{XENIX_TID}.{oid}` = `{XENIX_TID}.{external_id_actual}` para las filas con `oid` desnudo:
```sql
-- Ejecutar tras confirmar XENIX_TID y que el token del primer login nuevo
-- produce exactamente ese external_id (log en el paso de verificación).
UPDATE dbo.users
  SET external_id = @XENIX_TID + '.' + external_id,
      tenant_id   = @XENIX_TID
  WHERE external_id IS NOT NULL AND external_id NOT LIKE '%.%';
```
**Orden de cutover (CORREGIDO — review H3):** aplicar `006` → desplegar código → **ejecutar el backfill ANTES del primer login del flujo nuevo** → recién entonces permitir el login. Es determinista (conocemos `XENIX_TID` y el `oid` = `external_id` actual), así que no necesita ver un token primero.
> ⚠ **No invertir el orden.** Si se deja loguear un primer login antes del backfill, `ensureUser` (que casa solo por `external_id`) **no encontraría** la fila vieja (`external_id='OID'`) y **INSERTARÍA una fila nueva** (`external_id='TID.OID'`, histórico vacío); el backfill posterior chocaría con `UX_users_external_id` y **orfanaría** el histórico. Verificación R3 sin crear duplicado: consultar el `external_id` esperado en un entorno de Preview / con una cuenta de prueba distinta, **no** con la cuenta cuyo histórico se migra. Si por error se creó la fila nueva, borrarla antes del backfill.

## 7. Fuera de alcance

- Verja de **suscripción**/gating por plan (ciclo 3) — aquí solo lista blanca interina.
- **Landing del Marketplace** y token de compra (ciclo 3).
- **Rediseño visual** del login (ciclo 2 rehace el frontend; aquí, login funcional mínimo).
- **Google/email**, organizaciones/empresa, compartir sesiones.
- **Rol admin** para `/api/config` (ciclo 6 backoffice); en v1 queda tras bearer + lista blanca.
- Refresh/rotación avanzada, MFA, conditional access.

## 8. Verificación

**Tests unitarios nuevos** (`npm test`, `node --test`, lógica pura):
- `allowlist.test.js`: `parseAllowlist` (trim/lowercase/vacíos); `isAllowed` fail-closed (email null, lista vacía, match case-insensitive, no-match).
- `token-verify.test.js`: `buildExternalId(tid,oid)`; aserción de issuer (payload con `iss`/`tid` coherentes pasa; incoherente falla); extracción de email por precedencia de claims. (La verificación de firma real se cubre en e2e; aquí se aíslan las partes puras.)

**Regresión (debe seguir verde):**
- `npm test` de `db.test.js` (cold-start) intacto.
- Aislamiento: con dos usuarios (dos `external_id`), la sesión de uno da 404 al otro (test manual local con `DEV_USER_*` alternos vía cabecera, o integración contra SQL local).
- Flujo funcional local (grabar/transcribir/destilar/histórico) con bypass `DEV_USER_*` → idéntico a hoy.

**E2E / manual (con registro de app Entra en un entorno de prueba o Preview):**
1. Local con bypass `DEV_USER_*`: la app arranca y funciona sin tokens (0 errores de consola).
2. `GET /api/health` responde sin token; `GET /api/config` sin token → **401**; con token válido de cuenta en lista blanca → 200.
3. Login con cuenta Xenix (en lista blanca) → ve **sus** sesiones; con cuenta Microsoft **fuera** de lista blanca → **403 NOT_ALLOWLISTED**.
4. **Verificación R3:** loguear el `external_id` del primer login real y confirmar `= {XENIX_TID}.{oid}`; ejecutar backfill; confirmar que el histórico previo aparece bajo la cuenta.
5. Cuenta personal MSA en lista blanca → entra y opera aislada (valida issuer MSA).
6. Token expirado → 401 → el front reintenta silencioso y, si falla, manda a login.

**Nota de seguridad (R1):** la validación del token es la nueva frontera de seguridad; la fase de review (`/jcc-review`) debe atacar adversarialmente la validación (aud/iss/firma/expiración, tokens de otro `aud`, algoritmo `none`, JWKS caching/rotación) y el fail-closed de la lista blanca.
