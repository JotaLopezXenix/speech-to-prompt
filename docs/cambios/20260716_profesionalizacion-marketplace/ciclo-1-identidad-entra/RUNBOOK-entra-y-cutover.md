# Runbook — Registro de app Entra + cutover (ciclo `identidad-entra`)

Guía paso a paso para (1) crear el registro de app Entra que exige el código, (2) rellenar las App Settings, y (3) hacer el cutover en producción sin perder el histórico. Pensada para operar en el portal de Azure sin dar por supuesto el detalle de cada opción.

> **Dos avisos críticos** (de la review; si se saltan, o no funciona o se pierde histórico):
> - **Tokens v2.0 obligatorios** (H2): si el registro no fuerza `requestedAccessTokenVersion: 2`, el backend rechaza *todos* los tokens (login inservible). Paso 4.
> - **Backfill ANTES del primer login** (H3): ejecutar el UPDATE de migración de tu usuario **antes** de entrar por el flujo nuevo, o tu histórico queda huérfano. Paso 8.

---

## 1. Crear el registro de app

Portal de Azure → **Microsoft Entra ID** → **App registrations** → **New registration**.
- **Name:** p. ej. `speech-to-prompt`.
- **Supported account types:** **"Accounts in any organizational directory (any Microsoft Entra ID tenant - multitenant) and personal Microsoft accounts"** (el valor `AzureADandPersonalMicrosoftAccount`). Esto habilita Entra multi-tenant **+** cuentas personales MSA.
- **Redirect URI:** de momento nada aquí; se configura como SPA en el paso 3.
- **Register.**

Tras crear, apunta de la pestaña **Overview**:
- **Application (client) ID** → será `ENTRA_CLIENT_ID`.
- (El **Directory (tenant) ID** de Xenix es tu `XENIX_TID`, para el backfill del paso 8.)

## 2. Plataforma SPA + redirect URIs

**Authentication** → **Add a platform** → **Single-page application**.
- **Redirect URIs** (añade las dos):
  - `https://<tu-app>.azurewebsites.net` (producción)
  - `http://localhost:3000` (desarrollo, opcional — en local usamos el bypass `DEV_USER_*`, pero sirve para probar MSAL real)
- No marques "Access tokens"/"ID tokens" de flujo implícito (usamos auth-code + PKCE; MSAL.js lo hace solo).
- Guarda.

## 3. Exponer la API (scope propio)

**Expose an API**:
- **Application ID URI:** acepta el sugerido `api://<client-id>` (**Set** / **Add**).
- **Add a scope:**
  - **Scope name:** `access_as_user`
  - **Who can consent:** *Admins and users*.
  - **Consent display name / description:** algo como "Acceder a Speech-to-Prompt como el usuario".
  - **State:** Enabled. **Add scope.**
- El scope completo queda como `api://<client-id>/access_as_user` → será `ENTRA_API_SCOPE`.

## 4. ⚠ Forzar tokens v2.0 (H2 — imprescindible)

**Manifest** (editor de manifiesto del registro):
- Localiza `requestedAccessTokenVersion` y ponlo a **`2`** (si aparece `null`, cámbialo a `2`).
- Guarda.

Sin esto, los access tokens salen en formato v1.0 (issuer `https://sts.windows.net/{tid}/`) y el backend —que exige el issuer v2.0 `https://login.microsoftonline.com/{tid}/v2.0`— los rechaza con 401.

## 5. Permiso de la SPA sobre su propia API

Como la SPA y la API son el mismo registro, autoriza el scope:
- **API permissions** → **Add a permission** → **My APIs** → selecciona `speech-to-prompt` → **Delegated permissions** → marca `access_as_user` → **Add permissions**.
- **Grant admin consent for Xenix** (botón) para que las cuentas del tenant no vean el prompt de consentimiento. (Las cuentas de otros tenants / MSA consentirán ellas la primera vez.)

## 6. (Opcional) Claims de email

El backend saca el email de `preferred_username` → `email` → `upn`. Con tokens v2.0 suele venir `preferred_username`. Si en pruebas ves que falta, en **Token configuration** → **Add optional claim** → tipo **Access** → añade `email` (y activa el permiso `email` si lo pide).

## 7. Rellenar App Settings (App Service → Configuration)

| App Setting | Valor |
|---|---|
| `ENTRA_CLIENT_ID` | el Application (client) ID del paso 1 |
| `ENTRA_API_AUDIENCE` | **`api://<client-id>,<client-id>`** (ambos, separados por coma: el `aud` de un token v2 para API propia puede ser el App ID URI o el client id; aceptar los dos evita sorpresas) |
| `ENTRA_API_SCOPE` | `api://<client-id>/access_as_user` |
| `ENTRA_AUTHORITY` | `https://login.microsoftonline.com/common` (por defecto si se omite) |
| `ENTRA_REQUIRED_SCOPE` | `access_as_user` (por defecto si se omite; `''` para desactivar la comprobación) |
| `ALLOWED_EMAILS` | tu correo y el de Agustín, separados por coma (lista blanca interina) |

> `ENTRA_AUTHORITY` y `ENTRA_REQUIRED_SCOPE` son opcionales (tienen default). `ALLOWED_EMAILS` es **fail-closed**: si se deja vacío en Azure, **nadie entra**.

## 8. Cutover en producción (ORDEN IMPORTANTE)

1. **Aplicar la migración** `006` (`npm run migrate` con las credenciales de la BD de prod, `SQL_AUTH=entra-default` + `az login`; ver gotchas de despliegue).
2. **Desplegar el código** (push → GitHub Actions).
3. **Backfill de tu usuario — ANTES de entrar por el flujo nuevo** (H3). Con `XENIX_TID` (paso 1), ejecutar contra la BD de prod:
   ```sql
   UPDATE dbo.users
     SET external_id = '<XENIX_TID>.' + external_id,
         tenant_id   = '<XENIX_TID>'
     WHERE external_id IS NOT NULL AND external_id NOT LIKE '%.%';
   ```
   (Determinista: el `external_id` actual ya es tu `oid`; el nuevo es `tid.oid`.)
4. **Desactivar Easy Auth**: App Service → **Authentication** → quitar/deshabilitar el proveedor de identidad (o "Allow unauthenticated access") para que la app gestione su propia auth. A partir de aquí el gate lo pone el backend.
5. **Verificación e2e (R3 + seguridad):**
   - Entra con tu cuenta (en `ALLOWED_EMAILS`) → ves **tu histórico** (confirma que el backfill casó).
   - Entra con una cuenta Microsoft **fuera** de la lista → **403**.
   - (Si tienes) cuenta personal MSA en la lista → entra y opera aislada.
   - `GET /api/config` y `/api/prompts` sin token → **401**; `/api/health` responde sin token.

> **Verificar el `external_id` esperado sin duplicar** (R3): si quieres confirmar el `tid.oid` real que emite Entra antes del backfill, hazlo con una **cuenta de prueba distinta** (no con la cuenta cuyo histórico migras). Si por error se creó una fila nueva para tu cuenta, bórrala antes de re-backfillear.

## 9. Rollback

Si algo va mal en el cutover: reactivar Easy Auth (paso 8.4 a la inversa) devuelve el gate de plataforma. El código nuevo, sin `Authorization` y con `WEBSITE_HOSTNAME` presente, responde 401 a las rutas protegidas — así que el rollback real es reactivar Easy Auth **y** revertir el deploy si hace falta. La migración `006` es aditiva (columna nueva + quitar constraint) y no borra datos; no necesita rollback salvo que se quiera restaurar `UQ_users_email`.
