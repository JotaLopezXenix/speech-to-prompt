# SPEC-03 — Auth / Login MSAL real (`web/`)

**Ciclo:** 2 `frontend-mobile-first` · **Sub-ciclo:** 2b (construcción) · **Fecha:** 20-jul-2026 · **Fase JCC:** especificación.
**DESIGN (fuente del porqué):** `DESIGN.md` §2 (usuario profesional individual), §4 (marco Login/Historial/Ajustes incluido), §5 (identidad = consume el contrato bearer del ciclo 1; devBypass local sigue), §6 R2 (integración de ramas identidad↔frontend). `DESIGN-2a.md` §33-34 (Capa 2 marco = Login MSAL; shell con avatar/menú). Diseño de la pantalla: `diseno-claude-design/Login.dc.html`.
**Es el 3.º de 6 SPEC de 2b** (01 cimiento ✓ · 02 API tipada ✓ · **03 auth/login** · 04 captura+salvaguardas · 05 resto flujo · 06 marco).

**Decisiones estructurales confirmadas en mesa común (20-jul):**
- **MSAL vía `@azure/msal-browser` + `@azure/msal-react`** (wrapper oficial de React: `MsalProvider` + hooks). Estado de auth reactivo para el shell; menos código a mano. (Alternativa contexto propio imperativo sobre msal-browser: descartada — reimplementaría lo que msal-react ya da.)
- **Persistencia `sessionStorage`** (más seguro; coincide con el frontend viejo; MSAL re-establece SSO en silencio vía cookies cuando puede). (Alternativa localStorage "seguir logueado": descartada por seguridad, dictados sensibles.)
- **Flujo `redirect`** (no popup): robusto en móvil/PWA; es lo que usa el frontend viejo.

---

## 1. Resumen
Reemplazar el placeholder de Login por **autenticación real MSAL** en la app `web/`, consumiendo el contrato bearer del ciclo 1 (Entra multi-tenant + MSA): bootstrap de MSAL desde `/api/auth-config`, pantalla de Login según el diseño, **gating** de las rutas de la app (login público, resto tras guard), cableado del token al cliente tipado de SPEC-02 (`setTokenProvider` → `acquireTokenSilent`; 401 → re-adquisición interactiva), y **avatar + logout** del usuario real. En **local (`devBypass`)** no se monta MSAL ni se gatea (espejo del backend). El backend NO se toca.

## 2. Stack y arquitectura

**Contexto (código existente que se respeta):**
- Backend ciclo 1 valida el access token *stateless* (`src/services/token-verify.js`: RS256, JWKS de `login.microsoftonline.com/common`, audiencia `ENTRA_API_AUDIENCE`, issuer validado contra `tid` en v2.0, scope `access_as_user`) → devuelve `{tid,oid,email,name}`. `src/middleware/identity.js` aplica lista blanca y JIT. **No se modifica nada de esto.**
- `GET /api/auth-config` (público) devuelve `{devBypass:true}` en local, o `{clientId, authority, apiScope}` en Azure (prod: clientId `f6e24391-…`, authority `…/common`, apiScope `api://f6e24391-…/access_as_user`).
- `web/`: SPEC-01 (shell/router/tema/i18n/PWA) + SPEC-02 (cliente tipado `web/src/api/client.ts` con la costura `setTokenProvider`, hoy no-op). El `Header` tiene el avatar hardcodeado ("JL") a sustituir.
- Referencia a **cosechar** (no copiar textual; re-expresar en React): `public/js/auth.js` (initAuth/login/logout/getToken/acquireInteractive con `loginRedirect`/`acquireTokenSilent`/`acquireTokenRedirect`/`handleRedirectPromise`, cache sessionStorage).

**Decisiones técnicas (reversibles, documentadas):**
- **Config MSAL en runtime:** clientId/authority/apiScope vienen de `/api/auth-config` (no se hornean en el build). `redirectUri = window.location.origin + import.meta.env.BASE_URL` (→ `…/app/` en 2b; `…/` tras el cutover, sin cambio de código). `cache.cacheLocation = 'sessionStorage'`. `scopes = [apiScope]` en login y en adquisición de token.
- **Bootstrap async:** antes de renderizar el router hay que (a) leer auth-config, (b) si devBypass → modo bypass; si no → crear `PublicClientApplication`, `initialize()`, `handleRedirectPromise()`. El `AuthProvider` hace esto y no renderiza hijos hasta `ready`.
- **Abstracción `useAuth()`** que unifica prod (MSAL) y devBypass, para que pantallas/shell NO importen MSAL directamente. En modo MSAL, el `AuthProvider` envuelve a los hijos en `<MsalProvider>` y usa hooks de msal-react internamente.
- **Cableado al cliente tipado:** el `AuthProvider` llama `setTokenProvider(async () => <accessToken|null>)` (vía `acquireTokenSilent`) y `setUnauthorizedHandler(() => acquireTokenRedirect(...))` (nuevo seam en `client.ts`, sin acoplar el cliente a MSAL). En devBypass, ambos quedan no-op (token null, sin handler).
- **Gating:** `/login` público; el resto tras `RequireAuth`. En devBypass, `RequireAuth` es passthrough.

**Cómo encaja:** todo vive en `web/src/auth/` + retoques en `main.tsx`/`App.tsx`/`Login.tsx`/`Header.tsx`/`client.ts`/i18n. El backend y el frontend viejo no se tocan.

## 3. Estructura / Delta

### 3.1 ADDED — `web/src/auth/`
```
web/src/auth/
  config.ts          # loadAuthConfig(): usa api.getAuthConfig() (cliente tipado); cachea el resultado
  msal.ts            # createMsalInstance(cfg): PublicClientApplication (sessionStorage, redirectUri)
  AuthProvider.tsx   # bootstrap async; ramifica devBypass|MSAL; MsalProvider; useAuth(); cablea client seams
  useAuth.ts         # hook + tipo AuthContextValue (o re-export desde AuthProvider)
  RequireAuth.tsx    # guard: !ready→loading; no autenticado→<Navigate to=/login>; devBypass/auth→children
```

### 3.2 MODIFIED
- **`web/src/main.tsx`** — envolver `<App/>` en `<AuthProvider>` (dentro de `<ThemeProvider>`). El pre-paint del tema no cambia.
- **`web/src/App.tsx`** — `/login` fuera del guard; envolver el bloque `<AppShell>` (fases + history + settings) en `<RequireAuth>`. Si autenticado y ruta = `/login` → `Navigate` a `capture`. El `*` sigue a `capture` (que ya pasará por el guard).
- **`web/src/routes/Login.tsx`** — pantalla real según `Login.dc.html`: wordmark, titular serif (`login.tagline`), subtítulo (`login.subtitle`), botón "Entrar con Microsoft" (logo 4 colores) que llama `useAuth().login()`, nota de términos (`login.terms`). Deshabilitar el botón mientras `inProgress`. Sin la nota de placeholder.
- **`web/src/components/shell/Header.tsx`** — el avatar muestra las **iniciales reales** de `useAuth().user`; menú mínimo (o botón) con **logout** (`useAuth().logout()`). En devBypass, iniciales "DEV" o del `DEV_USER_NAME` (informativo).
- **`web/src/api/client.ts`** — añadir el seam `setUnauthorizedHandler(fn)` + middleware `onResponse` que, ante **401** (y con handler registrado), lo invoca una vez. NO importa MSAL (el handler lo registra `AuthProvider`). El `setTokenProvider` ya existe (SPEC-02).
- **`web/src/i18n/locales/es/common.json`** — `login`: +`tagline`, `subtitle`, `terms`, `microsoft` ("Entrar con Microsoft"), `loading`; `auth`: `signingIn`, `error`, `logout`. Quitar `login.placeholder`.
- **`web/package.json`** — `dependencies += @azure/msal-browser, @azure/msal-react`.

### 3.3 REMOVED
- Nada. El frontend viejo (`public/`, incl. `public/js/auth.js` y `public/vendor/msal-browser.min.js`) se conserva intacto (sigue sirviéndose en `/` hasta el cutover).

## 4. Interfaces y contratos

### 4.1 `useAuth()` (contrato del hook)
```ts
type AuthUser = { name: string | null; email: string | null; initials: string }
type AuthContextValue = {
  ready: boolean            // bootstrap terminado (config leída + MSAL init/redirect resueltos)
  isDevBypass: boolean      // local: sin MSAL ni gating
  isAuthenticated: boolean  // devBypass → true; MSAL → hay cuenta activa
  user: AuthUser | null
  login: () => void         // MSAL loginRedirect(scopes); devBypass → no-op
  logout: () => void        // MSAL logoutRedirect(); devBypass → no-op
}
```
- `initials`: de `user.name` (2 iniciales) o, si no, de `email`; fallback "?".
- `isAuthenticated` en MSAL = `accounts.length > 0` (cuenta activa fijada en el bootstrap tras `handleRedirectPromise`/`getAllAccounts`).

### 4.2 Configuración MSAL (`msal.ts`)
```ts
new PublicClientApplication({
  auth: {
    clientId: cfg.clientId,
    authority: cfg.authority,                                   // …/common (multi-tenant + MSA)
    redirectUri: window.location.origin + import.meta.env.BASE_URL, // …/app/ (2b)
  },
  cache: { cacheLocation: 'sessionStorage' },
})
```
Tras `initialize()`: `const r = await instance.handleRedirectPromise()`; fijar cuenta activa (`r?.account ?? instance.getAllAccounts()[0]`) con `setActiveAccount`.

### 4.3 Cableado al cliente tipado (SPEC-02)
- **Token:** `setTokenProvider(async () => { const a = instance.getActiveAccount(); if(!a) return null; try { return (await instance.acquireTokenSilent({ scopes:[apiScope], account:a })).accessToken } catch { return null } })`.
- **401:** `setUnauthorizedHandler(() => instance.acquireTokenRedirect({ scopes:[apiScope] }))`. En devBypass no se registra (el backend acepta al usuario dev; nunca hay 401).
- Contrato del nuevo seam en `client.ts`: `export function setUnauthorizedHandler(fn: (() => void) | null): void`. El middleware `onResponse` invoca `fn()` cuando `response.status === 401` y `fn` está registrado (una vez por respuesta; sin bucle).

### 4.4 Bootstrap y gating
- `AuthProvider`: estado `ready=false`; en montaje `loadAuthConfig()`; si `devBypass` → set modo bypass, `ready=true`. Si no → `createMsalInstance`, `initialize`, `handleRedirectPromise`, fijar cuenta, cablear seams, `ready=true`, y renderizar `<MsalProvider instance>{children}</MsalProvider>`.
- `RequireAuth`: si `!ready` → pantalla de carga (`auth.loading`); si `isDevBypass || isAuthenticated` → `children`; si no → `<Navigate to={PATHS.login} replace/>`.

## 5. Qué se PRESERVA (regresión)
- **Contrato de token y backend:** `token-verify.js`, `identity.js`, `/api/auth-config` y todas las rutas `/api/*` + `/api/v1` **sin cambios**. El frontend nuevo solo consume el contrato existente.
- **Frontend viejo en `/`:** `public/**` intacto, incluido su `public/js/auth.js` y el MSAL vendorizado. El login del sitio viejo sigue funcionando idéntico (usa `redirectUri = origin` = raíz, que sigue registrada en Entra).
- **Desarrollo local (devBypass):** sin `WEBSITE_HOSTNAME` y sin token, la app nueva NO monta MSAL ni gatea; el backend usa `DEV_USER_*`. El flujo de desarrollo no se frena.
- **Cliente tipado (SPEC-02):** el contrato de `client.ts`/`api` y `schema.d.ts` no cambian salvo **añadir** `setUnauthorizedHandler` (aditivo) y el uso real de `setTokenProvider` (ya existía). El `baseUrl:/api/v1` y la fachada no cambian.
- **Cimiento SPEC-01:** shell, stepper, tema, i18n, PWA, servido en `/app` intactos salvo los retoques de §3.2.
- **Contrato de sesión, flujo de 4 fases, Ajustes/Historial:** no se tocan (siguen placeholders hasta 05/06).

## 6. Migración de datos
No aplica (sin cambios de esquema ni de datos). **Ops de configuración (no es migración):** añadir a los **SPA redirect URIs** del registro de app Entra (`f6e24391-…`) la(s) URI(s) del frontend nuevo: `https://speech-to-prompt-xenix-hnc4ccfbfkdcdjem.westeurope-01.azurewebsites.net/app/` (prod) y, si se desarrolla en local, `http://localhost:5173/app/` (Vite). **Aditivo** (no se retiran los orígenes raíz `http://localhost:3000` / `https://…azurewebsites.net` que usa el frontend viejo). Vía `az ad app update` en la fase de implementación, con confirmación del usuario (cambio de configuración de cuenta). Reversible: quitar las URIs añadidas.

## 7. Fuera de alcance
- **Traducciones i18n reales** (solo se añaden claves en español).
- **Captura y salvaguardas** (SPEC-04), contenido real de Revisión/Destilado/Resultado (SPEC-05) e Historial/Ajustes (SPEC-06) — siguen placeholders; el gating los cubre pero su contenido no cambia.
- **Cutover** (base `/app`→`/`, retirar `public/` y `public/js/auth.js`).
- **Gestión de cuenta/perfil**, refresco de lista blanca, o cualquier cambio en el backend de identidad.
- **Menú de avatar rico** (submenús, ajustes de cuenta): solo lo mínimo para logout.

## 8. Verificación (extremo a extremo)

**Local (sin login real; el usuario no desarrolla en local ahora → build/lógica):**
1. `cd web && npm ci` reproducible; `npm run build` (tsc+vite) y `npm run lint` (oxlint) **verdes** con las nuevas deps y `web/src/auth/*`.
2. **devBypass** (montando la app contra un backend local que devuelve `{devBypass:true}`, o comprobación de código): `RequireAuth` es passthrough, la app entra directa a `/capture` sin pantalla de login, el avatar muestra el usuario dev, `setTokenProvider` queda no-op (las llamadas van sin `Authorization`). *(Requiere backend local; si no hay, se verifica por lectura + los checks de Azure.)*

**Azure (prod; login real, lo hace el usuario — como ciclo 1):**
3. Añadidas las redirect URIs `/app/` a Entra, ir a `https://…/app/` sin sesión → `RequireAuth` redirige a `/login`; la pantalla de Login se ve según diseño.
4. Pulsar "Entrar con Microsoft" → `loginRedirect` → autenticación Entra → vuelta a `/app/` autenticado → `RequireAuth` deja pasar → `/capture`. El avatar muestra las iniciales reales.
5. **Token real al backend:** una llamada autenticada del cliente tipado (p. ej. `api.healthDb()` sigue OK; y cuando exista un consumidor autenticado, `GET /api/v1/sessions` con el token devuelve 200 con datos). El `setTokenProvider` adjunta el `Authorization: Bearer`.
6. **401 → re-adquisición:** forzar expiración/invalidez → el `onResponse` dispara `acquireTokenRedirect` (re-login silencioso o interactivo). Sin bucle.
7. **Logout:** desde el avatar → `logoutRedirect` → vuelta a `/login`.

**Regresión (obligatoria, reutilizable):**
8. `https://…/` (frontend **viejo**) sigue autenticando con su propio `auth.js` (redirectUri = raíz, aún registrada) y muestra sus sesiones — **sin cambios**.
9. Las rutas `/api/*` y `/api/v1/*` responden igual que antes (el contrato de token no cambió). `npm test` (raíz) sigue **verde**.
10. En local, el bypass `DEV_USER_*` sigue permitiendo usar el backend sin token.

**Rollback:** revertir el commit (el frontend nuevo vuelve a placeholders de login; nada en `/` ni en el backend dependía de esto) y quitar las redirect URIs `/app/` añadidas a Entra. El frontend viejo en `/` nunca dependió de lo nuevo.
