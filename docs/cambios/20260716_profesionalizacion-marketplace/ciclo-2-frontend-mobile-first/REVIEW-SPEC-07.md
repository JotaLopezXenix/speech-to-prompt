# REVIEW-SPEC-07 — Revisión adversarial independiente del cutover `/app → /`

**Fecha:** 22-jul-2026 · **Fase JCC:** 4 (revisión) · **Rama revisada:** `2b-07-cutover` (`03575dc`) sobre `main`.
**Revisor:** agente independiente (no escribió el código). Postura: intentar **refutar** que cumple y no rompe.
**Alcance:** solo correctitud, regresión y cumplimiento del SPEC-07. No estilo.

---

## Recuento por gravedad

| Gravedad | Nº | Tipo |
|---|---|---|
| ALTA | 0 | — |
| MEDIA | 1 | bug (bucle de redirect en caso límite) |
| BAJA | 2 | 1 observación pre-existente + 1 nota de proceso |

**Ningún hallazgo deja la app inaccesible ni rompe el login raíz.** El único bug afecta a una forma de URL marginal (`/app` + query sin barra) que no está en la ruta crítica del cutover.

---

## 1. Regresión (crítico en un cutover) — LIMPIO

- **`web/src/**` intacto (0 cambios).** Verificado: `git diff --stat main...HEAD -- web/src/` → vacío. El único fichero de `web/` en el diff es `web/vite.config.ts`.
- **`redirectUri` y `basename` se recalculan solos de `BASE_URL` (afirmación del SPEC §2) — VERIFICADO leyendo el código:**
  - `web/src/auth/msal.ts:13` → `redirectUri: window.location.origin + import.meta.env.BASE_URL`. Sin `/app` hardcodeado. Con `base:'/'` pasa de `origin/app/` a `origin/`. ✔
  - `web/src/App.tsx:18` → `const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'`. Sin `/app` hardcodeado. Pasa de `/app` a `/`. ✔
- **Backend/API — orden de routers correcto (`server.js`):** `/api/health`, `/api/auth-config`, `/api/config`, `/api/sessions` (+transcribe+distill), `/api/prompts`, `/api/diagnostics` y su espejo `/api/v1/*` (líneas 33–72) quedan **byte-idénticos** (no aparecen en el diff salvo por el bloque de servido del frontend que va después). El redirect `/app` (79–81) va **antes** del fallback SPA `*` (88), y ambos van **después** de todos los `/api/*` (no los ensombrecen). Mismo `identity`, mismo orden. ✔
- **`openapi/`, `migrations/`, `src/**` — no en el diff.** Verificado: `git diff --stat main...HEAD -- openapi/ migrations/ src/` → vacío. ✔
- **Regresión backend:** `npm test` (raíz) → **14/14 pass** (ver §Verificación). ✔

**Conclusión:** el cutover es puramente de routing/despliegue; no toca UI, auth, tema, rutas cliente ni backend/esquema/OpenAPI. Sin regresión detectable.

---

## 2. Cumplimiento del SPEC (§3/§4) — CUMPLE

### `web/vite.config.ts`
- `base: '/'` ✔ (antes `'/app/'`).
- PWA `manifest.start_url: '/'` y `manifest.scope: '/'` ✔.
- Resto (plugins, alias, proxy dev) sin cambios ✔.
- **Comprobado en el build:** `dist/manifest.webmanifest` → `"start_url":"/"`, `"scope":"/"`; `dist/index.html` referencia `/icon.svg`, `/assets/…`, `/manifest.webmanifest`, `/registerSW.js` (todo raíz, **0** ocurrencias de `/app/`); `dist/sw.js` → **0** ocurrencias de `/app/`.

### `server.js`
- **Eliminado** `app.use(express.static(join(__dirname,'public')))` ✔ (diff lo muestra como `-`).
- **Eliminado** el bloque `/app` (`express.static(webDist)` + `app.get('/app/*')`) ✔.
- **Eliminado** el fallback viejo `app.get('*', … 'public','index.html')` ✔.
- **Añadido** (server.js:74–89), tras los routers `/api`:
  - `webDist = join(__dirname,'web','dist')`.
  - Redirect **302** `app.get(['/app','/app/*'], …)` con `req.originalUrl.replace(/^\/app(?=\/|$)/, '') || '/'` → mapea `/app`→`/`, `/app/x`→`/x`, preserva query (salvo el caso límite del §3). ✔ (regex `^\/app(?=\/|$)` textualmente igual al SPEC §3.2).
  - `if (existsSync(webDist)) { express.static(webDist); app.get('*', …) }` ✔.
  - `existsSync` sigue importado (server.js:5). ✔

### `public/` — REMOVED
- Carpeta borrada por completo: `index.html`, `js/**`, `css/`, `vendor/` (17 ficheros, −2466 líneas en el diff). `ls public/` → no existe. Historial conservado en git. ✔

### `CLAUDE.md` — sin afirmaciones falsas
- **Architecture** reescrita: backend sin build + SPA de `web/` servida en `/`; el frontend vanilla de `public/` marcado como **retirado**. La sección "Frontend phase machine" (que describía `public/js/app.js`) fue sustituida por "Frontend (`web/`, React SPA)". Coherente con el estado real. ✔
- **"Fase actual"** actualizada como puntero corto: SPEC-07 **IMPLEMENTADO** en rama `2b-07-cutover`, verif. local en verde, **pendiente merge+deploy+smoke para CERRAR**. **No afirma** que esté en prod ni verificado con smoke — correcto (aún no lo está). ✔
- README del cambio actualizado en la misma línea (IMPLEMENTADO, pendiente merge/deploy/smoke). ✔

---

## 3. Correctitud / casos límite

### [MEDIA] Bucle de redirect 302 en `/app` + query sin barra (`/app?x=1`)
- **Qué falla:** `server.js:80` — `req.originalUrl.replace(/^\/app(?=\/|$)/, '') || '/'`. Para `originalUrl = "/app?x=1"`, el look-ahead `(?=\/|$)` exige `/` o fin-de-cadena tras `app`, pero encuentra `?` → **no sustituye** → devuelve `"/app?x=1"` → `res.redirect(302, "/app?x=1")` → **redirect a sí mismo (bucle infinito, `ERR_TOO_MANY_REDIRECTS`)**.
- **Confirmado en vivo** (server real, build servido por Express):
  ```
  /app                 -> 302  Location: /
  /app/                -> 302  Location: /
  /app/review          -> 302  Location: /review
  /app/capture?x=1     -> 302  Location: /capture?x=1
  /app?x=1             -> 302  Location: /app?x=1     <<< BUCLE
  /apple               -> 200  (SPA fallback, sin bucle)
  /appstore            -> 200  (SPA fallback, sin bucle)
  ```
  (Reproducido idéntico con un servidor Express 4 mínimo aislando solo el handler.)
- **Fichero:línea:** `server.js:79-81`.
- **Gravedad:** MEDIA. Es un fallo duro (bucle, no degradación elegante) y el SPEC §4 promete "preservando query" para `/app`. **Pero la probabilidad de disparo es baja:** durante 2b el `redirectUri` de MSAL y el `start_url`/`scope` PWA usaban `/app/` **con barra** (`/app/?…` → funciona bien), y los marcadores de `/app` no llevan query. El disparo requiere una URL externa que anexe query a `/app` **sin** barra. La ruta crítica del cutover (`/`, login raíz, `/app`, `/app/<ruta>`) **no** se ve afectada.
- **Tipo:** bug.
- **Fix trivial (no aplicado — la revisión no corrige):** construir el destino desde `req.path` + query por separado, p.ej.
  ```js
  const rest = req.path.slice(4);                    // quita '/app'
  const qs   = req.originalUrl.slice(req.path.length); // '?...' o ''
  res.redirect(302, (rest || '/') + qs);
  ```
  (Cambiar solo el look-ahead a `(?=\/|\?|$)` **no** basta: daría `Location: ?x=1`, que el navegador resuelve otra vez contra `/app` → sigue en bucle.)

### Resto de casos límite — CORRECTOS
- **`/apple`, `/appstore` NO entran en bucle:** el patrón de ruta de Express 4 `['/app','/app/*']` solo casa el path exacto `/app` o `/app/…`; `/apple` no casa → cae al fallback SPA (200). Confirmado en vivo. ✔
- **`existsSync(webDist)` en local sin build:** si `web/dist` no existe, no se registra ni el estático ni el `*`; `/api/*` sigue vivo. Guarda correcta (server.js:86). ✔
- **`base:'/'` no rompe assets:** `dist/index.html` referencia `/assets/…` y `/icon.svg` (raíz), verificado. ✔
- **Versión de Express = 4.22.1:** los patrones `app.get('*')` y `app.get('/app/*')` son válidos (no aplica la ruptura de path-to-regexp de Express 5). ✔

---

## 4. Verificación (salida real)

### Build — `cd web && npm run build` → **VERDE**
```
dist/assets/index-BUp7uA66.css   48.79 kB │ gzip:  8.98 kB
dist/assets/index-fSNESM5h.js   659.60 kB │ gzip: 193.20 kB
✓ built in 612ms
PWA v1.3.0 — precache 6 entries — dist/sw.js, dist/workbox-*.js
```
(Warning pre-existente de tamaño de chunk >500 kB; no relacionado con el cutover.)

**Refs en `dist/index.html`** (`grep -oE '(src|href)="[^"]*"'`):
```
href="/icon.svg"
src="/assets/index-fSNESM5h.js"
href="/assets/index-BUp7uA66.css"
href="/manifest.webmanifest"
src="/registerSW.js"
```
→ todo raíz, **0** ocurrencias de `/app/`. `manifest.webmanifest` → `start_url:"/"`, `scope:"/"`. `sw.js` → **0** `/app/`. ✔

### Lint — `cd web && npm run lint` (oxlint) → **0 errores** (exit 0)
3 warnings **pre-existentes** (no introducidos por el cutover; `web/src/**` no se tocó):
```
src/components/ui/toggle.tsx:45:18  react(only-export-components)
src/components/ui/badge.tsx:48:17   react(only-export-components)
src/components/ui/button.tsx:64:18  react(only-export-components)
```

### Backend — `npm test` (raíz) → **14/14 pass** (exit 0)
```
ℹ tests 14 · pass 14 · fail 0 · duration_ms ~630
```

### Live routing — `STP_NO_OPEN=1 node --env-file-if-exists=.env server.js` + curl (server matado tras la prueba; puerto 3000 libre)
```
GET /                       -> 200   (SPA nueva: <script type=module src="/assets/index-fSNESM5h.js"> + /registerSW.js)
GET /review                 -> 200   (fallback SPA)
GET /app                    -> 302   Location: /
GET /app/review             -> 302   Location: /review
GET /app/capture?x=1        -> 302   Location: /capture?x=1   (query preservada)
GET /app?x=1                -> 302   Location: /app?x=1        (BUCLE — ver §3)
GET /apple                  -> 200   (fallback SPA, sin bucle)
GET /assets/index-fSNESM5h.js -> 200 (application/javascript)
GET /icon.svg               -> 200
GET /api/v1/auth-config     -> 200   {"devBypass":true}
GET /api/v1/sessions (sin token) -> 200  (*)
```
(\*) En local devuelve **200**, no 401, porque `devBypass` (DEV_USER_*) aporta principal autenticado. El **401** del SPEC §8.3 es la expectativa **en prod** (sin token Easy Auth). Comportamiento local correcto, **no es hallazgo**.

El body de `/` sirve el bundle nuevo (`index-fSNESM5h.js`, hash coincidente con el build); no aparece el marcado vanilla viejo. ✔

---

## 5. Precondición externa de Entra (SPA redirect URI raíz) — bien gestionada por el SPEC

- **El SPEC la documenta y acota:** §2 la marca como "PRECONDICIÓN CRÍTICA (mayor fuente de riesgo, externa al código)"; §7 la declara fuera de alcance (portal, no repo); §8.4 la **valida con el smoke logueado en `/`**; §8.5 da el **rollback** (revertir commit + redeploy → vuelve `redirectUri` a `origin/app/`).
- **Riesgo residual (no es incumplimiento de código):** el SPEC **asume** ("según el cierre del ciclo 1 el origen raíz ya está registrado") que `https://<host>/` ya es SPA redirect URI. La validación (§8.4) ocurre **después** del deploy, en prod → si la asunción es falsa, hay una **ventana con el login roto** hasta añadir la URI en el portal **o** hacer rollback. El SPEC provee **ambos** remedios y el rollback es claro y de bajo impacto (el cambio es aditivo/mecánico y `web/` no se tocó). Aceptable para el estadio del proyecto; **recomendación**: confirmar la URI raíz en Entra **antes** del deploy para evitar esa ventana, no solo detectarla con el smoke.
- No puedo verificar Entra yo; solo evalúo que el SPEC lo gestione — **lo hace correctamente**.

---

## 6. Fuera de alcance (§7) — sin exceso

- **No se tocó `web/src/**`** (UI/auth/tema/rutas): confirmado, 0 cambios.
- **`/api/*` sin versión NO se eliminó** (sigue intacto junto a `/api/v1/*`): correcto, su limpieza es trabajo futuro.
- **Sin cambios en backend/lógica/prompts/esquema/OpenAPI/migraciones.**
- **El redirect transitorio `/app→/` se AÑADIÓ** (no se retiró): correcto, retirarlo es futuro.
- No se detecta "gold-plating" ni trabajo de más.

---

## 7. Observaciones menores (BAJA / notas)

- **[BAJA · pre-existente]** El fallback `app.get('*')` sirve `index.html` (200) para paths `/api/**` **desconocidos** que no casan ningún router montado (p.ej. `/api/v1/typo`), devolviendo HTML en vez de 404 JSON. **No lo introduce el cutover** — el fallback viejo hacía lo mismo con `public/index.html`. Fuera del alcance de SPEC-07; se anota por completitud.
- **[BAJA · proceso]** El SPEC (§9) pide un sanity-check de que `.github/workflows/azure-deploy.yml` no dependa de `public/`. **Verificado:** el workflow **no** referencia `public/` (`grep` → 0). Correcto; sin acción.

---

## VEREDICTO

**SÍ — el cambio cumple el SPEC-07 y no rompe nada crítico.** Es un cutover mecánico y aditivo, correctamente ejecutado:

- `vite base` + PWA a `/`, `web/dist` servido en `/` con guarda `existsSync`, redirect transitorio 302 `/app→/`, `public/` retirado; `msal.ts`/`App.tsx` **realmente** derivan de `BASE_URL` (sin `/app` hardcodeado), así que `redirectUri`/`basename` pasan a la raíz sin editar `web/src`.
- Regresión backend limpia (14/14), build verde con assets raíz, lint 0 errores, y el routing en vivo (`/` SPA nueva, deep-links, `/app`→302, `/api` intacto) es correcto.
- **La app NO queda inaccesible por el código:** `/` se sirve y el login redirige a la raíz. El único riesgo de inaccesibilidad es **externo** (SPA redirect URI en Entra), y el SPEC lo acota con smoke + rollback claro.

**Huecos:**
1. **[MEDIA]** Bucle de redirect en `/app?query` sin barra (`server.js:79-81`) — caso límite de baja probabilidad (no afecta la ruta crítica); fix de una línea disponible. Recomiendo corregirlo antes del merge, o aceptarlo conscientemente como deuda dado su bajo impacto.
2. **[BAJA]** Recomendación de proceso: confirmar la SPA redirect URI raíz en Entra **antes** del deploy (no solo detectarla con el smoke posterior) para evitar una ventana de login roto en prod.

Ninguno de los dos bloquea el merge; el (1) es la única corrección de código que sugeriría considerar.

---

## Cierre del bucle 3↔4 (2026-07-22)

- **MEDIA-1 corregida** en `server.js`: el redirect se calcula sobre `req.path` (sin query) y re-adjunta la query — `req.path.replace(/^\/app/,'') || '/'` + `originalUrl.slice(req.path.length)`. El destino siempre arranca con `/`, así que **no reincide** en la ruta `/app`. Re-verificado con server real: `/app?x=1 → 302 → /?x=1` (antes bucleaba), `/app/review?y=2 → /review?y=2` (query preservada), `/app → /`, `/apple → 200` (sin falso match), `/ → 200`. Build/lint verde, backend 14/14.
- **BAJA (Entra, proceso)**: se **vigila en el smoke logueado en `/`** tras el deploy; si el login fallara por redirect URI, se añade `https://<host>/` en Entra o se revierte (rollback del SPEC). Aceptada como riesgo externo acotado.
- **BAJA (fallback `*` sobre `/api/**` desconocido)**: preexistente, fuera de alcance del cutover. Aceptada.

**Veredicto tras el bucle: SÍ, limpio** (MEDIA-1 corregida; BAJA aceptadas). Apto para merge + deploy; pendiente el smoke logueado en `/` (valida la precondición de Entra).
