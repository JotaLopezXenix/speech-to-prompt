# SPEC-07 — Cutover `/app → /` (cierre del ciclo 2b)

**Programa:** `profesionalizacion-marketplace` · **Ciclo:** 2 `frontend-mobile-first` · **Sub-ciclo:** 2b (construcción) — **acto final**.
**Fecha:** 22-jul-2026 · **Fase JCC:** especificación.
**Fuente de verdad del porqué:** `DESIGN.md` de este ciclo (§4.5/§3 "entrega incremental + cutover final") y el **encuadre en `SPEC-06 §7`** (mecánica ya localizada). Si SPEC y DESIGN chocan, **manda el SPEC**.
**Depende de:** SPEC-01…06 **CERRADOS y en producción** (el frontend nuevo cubre el flujo completo y está verificado con smoke logueado). Este SPEC solo **mueve dónde se sirve** ese frontend, de la ruta temporal `/app` a la raíz `/`, y retira el frontend viejo.

---

## 1. Resumen

Promover el frontend nuevo (`web/`) de la ruta **temporal `/app`** a la **raíz `/`**, retirando el frontend vanilla viejo (`public/`). Es un cambio **mecánico de routing/despliegue**, sin tocar lógica de UI ni backend: cambia `vite base` (y el manifest PWA) de `/app/` a `/`, se sirve `web/dist` en `/` en `server.js` (con un redirect transitorio `/app → /`), se elimina `public/`, y — sin tocar código — el `redirectUri` de MSAL y el `basename` del router pasan a la raíz porque ambos derivan de `import.meta.env.BASE_URL`. Cierra el ciclo 2b.

---

## 2. Stack y arquitectura

Sin novedades de stack ni dependencias. El cutover se apoya en que **dos piezas ya derivan de `BASE_URL`** (= `vite base`), así que cambian solas al mover `base`:
- `web/src/auth/msal.ts`: `redirectUri = window.location.origin + import.meta.env.BASE_URL` → pasa de `origin/app/` a `origin/`.
- `web/src/App.tsx`: `BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'` → pasa de `/app` a `/`.

Por eso el DELTA se reduce a `vite.config.ts` (base + PWA), `server.js` (qué se sirve en `/` y el redirect) y **borrar `public/`**. `msal.ts`, `App.tsx`, `routes/paths.ts` y todos los componentes **no se tocan**.

> ⚠️ **PRECONDICIÓN CRÍTICA (mayor fuente de riesgo, externa al código):** el registro de app en **Microsoft Entra** debe tener **`https://<host>/` (raíz) como SPA redirect URI**. Durante 2b la URI registrada/usada era `https://<host>/app/`; tras el cutover MSAL redirige a la raíz. Según el cierre del ciclo 1 (`identidad-entra`) el **origen raíz ya está registrado**. Lo confirma el **smoke logueado en `/`** (§8). Si el login falla ahí, **añadir la SPA redirect URI raíz en el portal de Entra** (acción de portal; usuario/Agustín) — no es un cambio de este repo. `host` de prod = `speech-to-prompt-xenix-hnc4ccfbfkdcdjem.westeurope-01.azurewebsites.net`.

---

## 3. Delta

### 3.1 MODIFIED — `web/vite.config.ts`

- `base: '/app/'` → **`base: '/'`**.
- PWA `manifest.start_url: '/app/'` → **`'/'`**; `manifest.scope: '/app/'` → **`'/'`**.
- El resto (plugins, alias `@`, proxy `/api`→:3000 en dev) **sin cambios**. El icono (`icon.svg`, en `web/public/`) se sirve en `/icon.svg` con `base:'/'`.

### 3.2 MODIFIED — `server.js`

Estado objetivo del bloque de servido del frontend (sustituye al actual `express.static(public)` + bloque `/app` + fallback a `public/index.html`):

- **Eliminar** `app.use(express.static(join(__dirname, 'public')))` (servía el viejo).
- **Eliminar** el bloque `/app`:
  ```js
  app.use('/app', express.static(webDist));
  app.get('/app/*', (req, res) => res.sendFile(join(webDist, 'index.html')));
  ```
- **Eliminar** el fallback viejo `app.get('*', … 'public','index.html')`.
- **Añadir**, tras los routers `/api/*` y `/api/v1/*` (que quedan **intactos**):
  ```js
  const webDist = join(__dirname, 'web', 'dist');

  // Redirect transitorio: el /app del sub-ciclo 2b ya no existe → raíz (302, no permanente).
  app.get(['/app', '/app/*'], (req, res) => {
    res.redirect(302, req.originalUrl.replace(/^\/app(?=\/|$)/, '') || '/');
  });

  // Frontend nuevo servido en la raíz (guarda existsSync: en local sin build, /api sigue vivo).
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (req, res) => res.sendFile(join(webDist, 'index.html')));
  }
  ```
  El redirect va **antes** del fallback SPA para que `/app/*` no lo capture el `*`. El `*` va **después** de los routers `/api` (no los ensombrece; son `app.use('/api/...')` registrados antes).

### 3.3 REMOVED — carpeta `public/`

Borrar `public/` del repo (`git rm -r public/`): `index.html`, `js/`, `css/`, `vendor/`. Es el frontend vanilla viejo, ya cubierto por el nuevo y verificado en prod. **Git conserva el historial** (recuperable si hiciera falta).

### 3.4 SIN CAMBIOS (recalculan de `BASE_URL`)

`web/src/auth/msal.ts`, `web/src/App.tsx`, `web/src/routes/paths.ts`, y todos los componentes/pantallas: **no se editan**. `/api/*` (sin versión) y `/api/v1/*`: **intactos** (la limpieza del alias sin versión, ahora sin consumidores, es un cambio futuro fuera de aquí).

---

## 4. Interfaces y contratos (comportamiento resultante)

- **`GET /`** → sirve `web/dist/index.html` (SPA nueva). Antes servía el vanilla viejo.
- **`GET /<ruta-SPA>`** (`/capture`, `/review`, `/distill`, `/result`, `/history`, `/settings`, `/login`) → `web/dist/index.html` (fallback SPA); el router cliente (basename `/`) resuelve la vista.
- **`GET /assets/*`, `/icon.svg`, `/sw.js`, `/manifest.webmanifest`** → estáticos de `web/dist`.
- **`GET /app` y `GET /app/*`** → **302** a la ruta equivalente en `/` (`/app/review` → `/review`, `/app` → `/`), preservando query. Red transitoria para marcadores/PWA de 2b.
- **`/api/*` y `/api/v1/*`** → sin cambios (mismos routers, mismo `identity`).
- **MSAL:** `redirectUri = origin + '/'`. Login redirige a la raíz. (Requiere la SPA redirect URI raíz en Entra — §2.)
- **PWA:** `scope`/`start_url` = `/`; instalable desde la raíz. El SW nuevo (scope `/`) toma el control; los SW/instalaciones antiguos con scope `/app/` quedan huérfanos (base de instalación ~nula; el redirect 302 los reconduce a `/`).

---

## 5. Qué se PRESERVA (superficie de regresión)

- **Backend / API / esquema / OpenAPI / migraciones:** intactos. `/api/*` y `/api/v1/*` responden igual; `identity`, aislamiento por propietario, contrato de sesión: sin cambios. Regresión backend = `npm test` **14/14**.
- **Frontend nuevo (`web/`) — comportamiento intacto:** solo cambia **dónde** se sirve (raíz en vez de `/app`) y el `redirectUri`/`basename` derivados. Las 4 fases (Captura/Revisión/Destilado/Resultado), Historial, Ajustes, las salvaguardas de captura R1, auth MSAL/devBypass y el tema: **idénticos**. Ningún componente ni ruta cliente se edita.
- **Identidad bearer** (ciclo 1) y **devBypass local**: sin cambios (devBypass no usa MSAL; el cambio de `redirectUri` no le afecta).
- **Cliente tipado, contratos, tokens del design system:** intactos.

---

## 6. Migración de datos

**No aplica** (sin cambios de esquema). Única "migración" operativa: **PWA/Service Worker** — los clientes con la PWA instalada en `/app/` (scope `/app/`) durante 2b quedan reconducidos por el redirect 302 a `/`, donde el SW nuevo (scope `/`) toma el control. No hay datos de usuario en el SW (solo caché de assets). Recomendación de verificación: hard-reload / incógnito para no arrastrar el SW viejo cacheado.

---

## 7. Fuera de alcance

- **Retirar el redirect transitorio `/app → /`** y **limpiar el alias `/api/*` sin versión** (ya sin consumidores tras retirar el viejo): **limpieza futura**, no aquí.
- **Configuración de Entra** (registrar la SPA redirect URI raíz): **precondición externa** (portal), no un cambio de este repo. Se verifica con el smoke.
- **Backend / lógica de negocio / prompts / esquema:** sin cambios.
- **Ciclos 3–7 del programa** (marketplace, destilado-destino, costes, backoffice, publicación): fuera.

---

## 8. Verificación (extremo a extremo, incl. regresión) — runbook del cutover

### 8.1 Estático / build / regresión

- `cd web && npm run build` con `base:'/'` → verde; en `web/dist/index.html` los assets referencian **`/assets/…`** (no `/app/assets/…`).
- `npm run lint` (oxlint) sin errores nuevos.
- **Regresión backend:** `npm test` (raíz) **14/14** (no se toca backend).

### 8.2 Local (build servido por Express)

- Desde la raíz: `npm run build:web` y luego `npm start`; abrir `http://localhost:3000/`:
  - `/` sirve la SPA nueva; deep-links `/review`, `/history`, `/settings` resuelven (fallback SPA).
  - `/app` y `/app/capture` → **302** a `/` y `/capture`.
  - `/api/v1/health/db` → 200; `/api/v1/auth-config` → `{devBypass:true}` en local.
  - **Dev con Vite** (`web && npm run dev`, :5173) sigue igual (base `/` en dev; `/api` proxied). *(Nota: `/` en :3000 requiere `web/dist`; sin build, solo `/api` responde — esperado.)*

### 8.3 Producción (curl, tras merge + deploy)

- `GET /` → 200 y sirve el **bundle nuevo** (`index-*.js`; el hash coincide con el build local); **ya NO** el vanilla viejo (comprobar que no aparece el marcado del viejo).
- Deep-links `GET /review`, `/history`, `/settings` → 200 (index del SPA).
- `GET /app` → 302 → `/`; `GET /app/capture` → 302 → `/capture`.
- `GET /api/v1/health/db` → 200; `GET /api/v1/sessions` sin token → 401; `GET /api/v1/auth-config` → config MSAL de prod.
- `GET /icon.svg`, `/manifest.webmanifest`, `/sw.js` → 200.

### 8.4 Smoke logueado en `/` (definitivo — valida la precondición de Entra)

**El usuario**, en `https://<host>/`: login MSAL en la **raíz** (redirect vuelve a `/`, no a `/app`) → flujo completo (capturar → revisar → destilar → resultado) → Historial/Ajustes → logout. En móvil si se puede. **Si el login falla con error de redirect URI**, añadir `https://<host>/` como SPA redirect URI en Entra y reintentar.

### 8.5 Rollback

Si algo va mal (login roto por Entra, `/` no sirve, etc.): **revertir el commit del cutover + redeploy** — vuelve a servir el nuevo en `/app` y el viejo en `/`, `redirectUri` vuelve a `origin/app/`. Bajo impacto porque el cambio es aditivo/mecánico y `web/` no se modificó.

---

## 9. Notas de implementación (no normativas)

- Tras el cutover, `web/dist` es **obligatorio** para servir `/` (lo genera el CI en el deploy; en local, `npm run build:web`). La guarda `existsSync` evita 500 si falta (solo responde `/api`).
- El redirect usa **302** (temporal) a propósito: al ser transitorio, no queremos que los navegadores lo cacheen de forma permanente (facilita retirarlo luego).
- Sanity-check del workflow de deploy (`.github/workflows/azure-deploy.yml`): no debe depender de `public/` (build de `web/` + deploy del app). Si referenciara `public/`, ajustar.
- SW viejo cacheado (scope `/app/`): verificar en incógnito/hard-reload para no diagnosticar en falso.
