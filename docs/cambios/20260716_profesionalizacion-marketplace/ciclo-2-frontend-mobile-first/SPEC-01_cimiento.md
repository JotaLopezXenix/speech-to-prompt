# SPEC-01 — Cimiento del frontend nuevo (`web/`)

**Ciclo:** 2 `frontend-mobile-first` · **Sub-ciclo:** 2b (construcción) · **Fecha:** 20-jul-2026 · **Fase JCC:** especificación.
**DESIGN (fuente del porqué):** `DESIGN.md` (ciclo, decisiones estructurales), `DESIGN-2a.md` (decisiones de diseño/UX), `DESIGN-SYSTEM-2a.md` (tokens y handoff). **Trazas:** stack ratificado (ciclo §4.3); "cosechar" (ciclo §4.4); navegación guiada fluida (2a §3.3); tema ambos default claro (2a §3.4); build step nuevo = R5 (ciclo §6).
**Es el primero de varios SPEC de 2b** (02 API tipada · 03 auth/login · 04 captura+salvaguardas · 05 resto del flujo · 06 marco). Cadencia acordada: 01 ahora, resto just-in-time.

> **ADDENDUM 2026-07-20 — stack moderno (decisión de mesa común durante la implementación).** Al scaffoldear, `create-vite` instaló **React 19.2 / Vite 8 / TypeScript 6 / oxlint**, y `shadcn/ui` hoy asume **Tailwind v4**. Ratificado: construir con **React 19 + Tailwind v4 + shadcn** (en lugar de React 18 / Vite 5 / Tailwind v3 de §2). Esto **sustituye** el detalle de versiones y de cableado de tokens en §2, §3.1 y §4.1:
> - **Tailwind v4 es CSS-first:** plugin **`@tailwindcss/vite`** (no `postcss.config.js` ni `tailwind.config.ts`). Tokens y dark mode se declaran en `web/src/index.css` con `@import "tailwindcss"`, **`@theme`** (`--color-paper`, `--color-accent`, `--radius-card`, `--font-display`, …) y **`@custom-variant dark`**. Los **valores** (hex, radios, fuentes) de `DESIGN-SYSTEM-2a` NO cambian; solo el mecanismo.
> - **Vite** se fija a la versión estable que soporten los plugins (`@vitejs/plugin-react`, `vite-plugin-pwa`); si `vite-plugin-pwa` no soporta aún Vite 8, se baja Vite a la mayor versión compatible. Se reporta la versión final elegida.
> - **Lint:** `oxlint` (lo que trae el scaffold), no eslint.
> - Lo demás del SPEC (estructura de carpetas, navegación, tema por clase → `@custom-variant dark`, i18n, PWA, delta `/app`, "qué se PRESERVA", verificación y regresión) se mantiene.

## 1. Resumen
Crear el **cimiento del frontend nuevo** como app **React + Vite + TypeScript + Tailwind + shadcn/ui** en la subcarpeta **`web/`**: design system (tokens/tema/fuentes de `DESIGN-SYSTEM-2a`), PWA instalable, andamiaje i18n (español por defecto), **shell con stepper y navegación guiada fluida**, primitivos base y pantallas *placeholder* cableadas a la navegación, y el **pipeline de build/deploy** que sirve el build en Azure en una ruta **temporal `/app`** (para desprender R5) sin tocar el frontend viejo en `/`.

## 2. Stack y arquitectura

**Decisiones estructurales (ya ratificadas en mesa común):**
- **Layout:** app en `web/` con su propio `package.json` (deps de front aisladas); el backend Node/Express se queda intacto en la raíz.
- **Entrega:** merge incremental a `main`; **prod sigue sirviendo `public/` (viejo) en `/`** hasta un cutover final. SPEC-01 expone el nuevo en **`/app` temporal** solo como verificación.

**Decisiones reversibles (tomadas aquí, documentadas):**
- **React 18 + TypeScript**, **Vite 5**.
- **Tailwind CSS v3.4** (`darkMode: 'class'`) — maduro y con soporte shadcn de sobra. Migrar a v4 más adelante es reversible.
- **shadcn/ui** (Radix + CVA) — los primitivos se **copian** al repo (`web/src/components/ui`) y se estilan con nuestros tokens. No se copian los primitivos de los mockups de Claude Design.
- **react-router-dom v6** — rutas reales por fase (URL + botón atrás nativos; encaja con móvil). La navegación guiada fluida se expresa como rutas con un stepper, **sin bloqueo rígido** (ir/volver libre).
- **Fuentes self-hosted** vía `@fontsource` (`@fontsource-variable/source-serif-4`, `@fontsource/ibm-plex-mono`). Sin CDN (privacidad/offline/PWA).
- **PWA** con `vite-plugin-pwa` (`registerType: 'autoUpdate'`, manifest + service worker).
- **i18n** con `i18next` + `react-i18next`; `lng` y `fallbackLng` = `es`; strings en `web/src/i18n/locales/es/*.json`. Sin traducciones reales aún.
- **Estado**: React context/hooks (tema, y más adelante sesión/flujo). Sin librería de estado global por ahora.
- **Cliente HTTP tipado**: NO en este SPEC (llega en SPEC-02). El placeholder de verificación usa `fetch('/api/health/db')`.

**Cómo encaja en lo existente:** el backend Express y `/api/*` no se tocan (salvo el delta de servir `/app`). El frontend viejo (`public/`) sigue intacto y sirviéndose en `/`. En Azure, Oryx sigue instalando las deps del `package.json` **raíz** en el servidor; el build de `web/` se hace en **GitHub Actions** y se envía ya construido (`web/dist`).

## 3. Estructura / Delta

### 3.1 ADDED — árbol nuevo de `web/`
```
web/
  package.json            # deps y scripts de la app (dev/build/preview/lint/typecheck)
  vite.config.ts          # plugin react + PWA; base:'/app/'; alias '@'→src; proxy /api→:3000 en dev
  tsconfig.json           # (+ tsconfig.node.json para vite.config)
  tailwind.config.ts      # darkMode:'class'; theme.extend con tokens; tailwindcss-animate
  postcss.config.js       # tailwindcss + autoprefixer
  components.json         # config de shadcn (style, alias, tailwind)
  index.html              # <div id="root">; lang="es"; <meta name="theme-color">
  public/                 # iconos PWA (192/512), favicon, manifest assets
  src/
    main.tsx              # monta App; importa index.css, fuentes, i18n, ThemeProvider, RouterProvider
    index.css            # @tailwind base/components/utilities + tokens (:root/.dark) + mapeo shadcn
    App.tsx               # define el router y el layout del shell
    lib/utils.ts          # cn() de shadcn (clsx + tailwind-merge)
    theme/
      ThemeProvider.tsx   # aplica '.dark' a <html>; persiste en localStorage; default 'light'
      useTheme.ts
    i18n/
      index.ts            # init i18next (es)
      locales/es/common.json
    components/
      ui/                 # primitivos shadcn (button, input, sheet, switch, toggle-group, badge…)
      shell/
        AppShell.tsx      # Header + Stepper + <Outlet/>
        Header.tsx        # wordmark + acceso a Historial/Ajustes + avatar
        Stepper.tsx       # Captura·Revisión·Destilado·Resultado (activo/hecho/pendiente)
      brand/
        Wordmark.tsx
    routes/
      paths.ts            # constantes de ruta + orden de fases del flujo
      Capture.tsx  Review.tsx  Distill.tsx  Result.tsx   # placeholders (fase)
      History.tsx  Settings.tsx  Login.tsx               # placeholders (marco)
```
> Los componentes "propios" ricos (RecordButton, SegmentChip, ModeCard, SafeguardBanner, InfoSheet, Avatar) y el contenido real de cada pantalla llegan en sus SPEC (04/05/06). SPEC-01 deja las pantallas como *placeholders* con título i18n y navegación operativa.

### 3.2 MODIFIED — backend/infra (delta mínimo)
- **`server.js`**: servir el build de `web/` en `/app`, **antes** del catch-all `app.get('*')`, con guarda de existencia para no romper local sin build:
  ```js
  import { existsSync } from 'fs';
  const webDist = join(__dirname, 'web', 'dist');
  if (existsSync(webDist)) {
    app.use('/app', express.static(webDist));
    app.get('/app/*', (req, res) => res.sendFile(join(webDist, 'index.html')));
  }
  ```
  El `app.get('*')` → `public/index.html` (viejo) **no cambia**: `/` sigue sirviendo el frontend actual.
- **`.github/workflows/azure-deploy.yml`**: añadir, **antes** del paso `Deploy to Azure Web App`:
  ```yaml
  - name: Setup Node
    uses: actions/setup-node@v4
    with:
      node-version: '20'
  - name: Build web (Vite)
    run: |
      cd web
      npm ci
      npm run build
      rm -rf node_modules
  ```
  El paso `azure/webapps-deploy@v3` con `package: .` envía el repo **ya con `web/dist`** y **sin `web/node_modules`** (borrado). El backend lo sigue construyendo Oryx en el servidor (`SCM_DO_BUILD_DURING_DEPLOYMENT=true`), sin cambios.
- **`.gitignore`** (raíz): asegurar `web/node_modules/` y `web/dist/` (artefactos; `dist` se construye en CI).
- **`package.json`** (raíz): opcional, script de conveniencia `"build:web": "npm --prefix web ci && npm --prefix web run build"`. No lo usa el deploy (que hace el build en CI), solo comodidad local.

### 3.3 REMOVED
- Nada. `public/` y todo el backend se conservan.

## 4. Interfaces y contratos

### 4.1 Tokens y tema (verbatim de `DESIGN-SYSTEM-2a`)
`web/src/index.css` define los tokens como custom properties en `:root` (claro) y `.dark` (oscuro cálido), y **mapea** los semánticos de shadcn a ellos:
```css
@tailwind base; @tailwind components; @tailwind utilities;
:root{
  --paper:#F3EFE7; --surface:#FBF8F2; --surface-elevated:#FFFFFF;
  --ink:#201E19; --muted:#6B6456; --hairline:#E7E0D2;
  --accent:#2F5D50; --accent-hover:#274E43; --accent-soft:#E4ECE7;
  --success:#3E7C58; --warning:#B7791F; --error:#B4472E;
  /* mapeo shadcn */
  --background:var(--paper); --foreground:var(--ink);
  --card:var(--surface-elevated); --muted-foreground:var(--muted);
  --border:var(--hairline); --input:var(--hairline);
  --primary:var(--accent); --primary-foreground:#FBF8F2; --ring:var(--accent);
}
.dark{
  --paper:#1C1A16; --surface:#24211C; --surface-elevated:#2C2822;
  --ink:#F1ECE2; --muted:#A79E8D; --hairline:#332F28;
  --accent:#6FB59F; --accent-soft:#22302B;
}
```
`tailwind.config.ts` → `theme.extend`: `colors` mapeando a `var(--*)` (paper/surface/surface-elevated/ink/muted/hairline/accent{DEFAULT,hover,soft}/success/warning/error), `borderRadius:{input:'12px',card:'14px'}`, `fontFamily:{display:['"Source Serif 4"',…],sans:['system-ui',…],mono:['"IBM Plex Mono"',…]}`, plugin `tailwindcss-animate`. `darkMode:'class'`, `content:['./index.html','./src/**/*.{ts,tsx}']`.

**Contrato de tema:** `ThemeProvider` lee `localStorage['stp-theme']` (`'light'|'dark'`), default `'light'`; aplica/quita la clase `dark` en `document.documentElement`; expone `useTheme() → { theme, setTheme, toggle }`. Todo componente lee **tokens**, nunca hex directos.

### 4.2 Navegación guiada fluida
`routes/paths.ts` exporta las rutas y el **orden de fases**:
```ts
export const PHASES = ['capture','review','distill','result'] as const;
export const PATHS = { capture:'/capture', review:'/review', distill:'/distill',
  result:'/result', history:'/history', settings:'/settings', login:'/login' };
```
- `App.tsx`: `<BrowserRouter basename="/app">` con `AppShell` como layout de las 4 fases (rutas anidadas) + rutas sueltas `history`/`settings`/`login`. Redirección por defecto `/` → `/capture`.
- `Stepper` resalta la fase activa (derivada de la ruta), marca las previas como "hecho" y permite **navegar libremente** a cualquier fase (ir/volver). El gating por dependencia de datos (no destilar sin captura) es comportamiento que llega con las pantallas reales (04/05); aquí la navegación es libre.
- `basename="/app"` acopla el router a la ruta temporal; en el **cutover** se cambia a `/` (y `vite.config` `base` de `'/app/'` a `'/'`). Es el único punto de acoplamiento a `/app`.

### 4.3 i18n
`i18n/index.ts` inicializa i18next con `resources: { es: { common } }`, `lng:'es'`, `fallbackLng:'es'`, `interpolation.escapeValue:false`. Las pantallas usan `useTranslation('common')` y claves (`t('capture.title')`…). Español por defecto; estructura lista para añadir locales sin refactor.

### 4.4 Servir `/app` (contrato de despliegue)
- Local: `web/` en dev vía `npm --prefix web run dev` (Vite en :5173, proxy `/api`→`http://localhost:3000`); o build (`npm --prefix web run build`) y Express sirve `/app` desde `web/dist`.
- Azure: CI construye `web/dist`; Express lo sirve en `/app`. `/` intacto (viejo).

## 5. Qué se PRESERVA (regresión)
- **Frontend viejo en `/`:** `public/**` y el `app.get('*') → public/index.html` **no cambian**. El sitio actual sigue funcionando idéntico en prod tras el merge.
- **Backend y API `/api/*`:** sin cambios de comportamiento ni de contrato. El único delta en `server.js` es añadir el bloque `/app` **antes** del catch-all; no altera el orden ni el gating de `identity` de las rutas API.
- **Pipeline de deploy del backend:** Oryx sigue instalando las deps raíz en el servidor; el arranque en Azure (`WEBSITE_HOSTNAME`, `PORT`) no cambia. El nuevo paso de CI es **aditivo** y previo al deploy.
- **Migraciones/BD:** no se tocan.

## 6. Migración de datos
No aplica (SPEC sin cambios de esquema ni de datos).

## 7. Fuera de alcance
- Cliente API tipado y OpenAPI (SPEC-02).
- Auth/login MSAL real (SPEC-03) — `Login.tsx` es placeholder.
- Captura y **salvaguardas** (SPEC-04) — `Capture.tsx` es placeholder; no se porta aún `audio-recorder`/`audio-guards`/`diagnostics`.
- Revisión/Destilado/Resultado reales (SPEC-05) e Historial/Ajustes reales (SPEC-06).
- **Cutover** de `/` al nuevo frontend y retirada de `public/` (SPEC futuro).
- Componentes "propios" ricos y su lógica.

## 8. Verificación (extremo a extremo)
**Local:**
1. `npm --prefix web install` y `npm --prefix web run build` → genera `web/dist` sin errores; `npm --prefix web run typecheck` (tsc) y `lint` verdes.
2. `npm --prefix web run dev` → carga en :5173 sin errores de consola; se ve el **shell** (header + stepper), navegación entre `/capture ↔ /review ↔ /distill ↔ /result` con el stepper y con atrás/adelante del navegador; `/history`,`/settings`,`/login` accesibles.
3. **Tema:** toggle claro↔oscuro aplica la clase y cambia los tokens; recarga conserva la preferencia (localStorage).
4. **i18n:** los textos salen de `locales/es/common.json` (cambiar una clave cambia la UI).
5. **PWA:** el build emite manifest + service worker; el navegador ofrece "Instalar".
6. **Express sirve `/app`:** con `web/dist` presente, `npm start` y `GET /app` devuelve la app; `GET /` sigue devolviendo el **frontend viejo** (regresión).
7. **Placeholder e2e:** la pantalla mínima hace `GET /api/health/db` y muestra el resultado (prueba el lazo front→backend).

**Regresión (obligatoria):**
8. Con el build presente y sin él, `GET /` y las rutas `/api/*` responden **igual que antes** (la guarda `existsSync` evita 500 si falta `web/dist`).
9. `npm test` (raíz) sigue **verde** (no se toca backend testeado).

**CI/Azure (R5, el punto crítico):**
10. En la rama, el workflow ejecuta el paso "Build web (Vite)" **sin fallar** y el deploy termina OK.
11. Tras el deploy: **`https://…/` sigue sirviendo el frontend viejo** (regresión en prod) y **`https://…/app` sirve el nuevo** (verificación R5 en Azure real).
12. Revisar el log de Oryx: que **no** intente construir `web/` (solo el `package.json` raíz). Si lo intentara, acotar Oryx al backend (p. ej. `PROJECT`/`.deployment`) — anotar como ajuste.

**Rollback R5:** revertir el commit del cambio de `azure-deploy.yml` (y el bloque `/app` de `server.js`) restaura el pipeline previo; `/` nunca dependió de lo nuevo.
