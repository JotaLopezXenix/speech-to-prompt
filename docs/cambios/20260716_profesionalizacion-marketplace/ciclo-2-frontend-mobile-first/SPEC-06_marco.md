# SPEC-06 — El marco: Historial · Ajustes

**Programa:** `profesionalizacion-marketplace` · **Ciclo:** 2 `frontend-mobile-first` · **Sub-ciclo:** 2b (construcción).
**Fecha:** 22-jul-2026 · **Fase JCC:** especificación.
**Fuente de verdad del porqué:** `DESIGN.md` de este ciclo (§3 alcance 2b: "Ajustes e Historial" en lo que se preserva; §5) y `DESIGN-2a.md` (§4 Capa 2 "marco": Login/Historial/Ajustes). Si SPEC y DESIGN chocan, **manda el SPEC**.
**Depende de:** SPEC-01 (cimiento + design system + `ThemeProvider`), SPEC-02 (cliente tipado `/api/v1`), SPEC-03 (auth MSAL/devBypass + `useAuth`), SPEC-04 (`ActiveSession`), SPEC-05 (Revisión/Destilado/Resultado, que Historial reabre).

Maquetas de referencia (Claude Design, 2a): `diseno-claude-design/{Historial,Ajustes}.dc.html`.
Comportamiento heredado: el panel de historial del frontend viejo (`public/js/components/history-panel.js`, con reabrir + "Reprocesar") y el mismo contrato de backend.

---

## 1. Resumen

Construir las **dos pantallas del marco** que faltan para completar el frontend nuevo: **Historial** (`/history`) y **Ajustes** (`/settings`), reemplazando los placeholders. Historial lista las sesiones del usuario (`listSessions`), las agrupa/filtra y permite **reabrir** cada una en la fase correcta (cargándola en `ActiveSession`) y **reprocesar** (rescate) las que tengan audio sin transcribir. Ajustes es una pantalla **cliente-pura**: tarjeta de cuenta (de `useAuth`), preferencias (tema, idioma), cerrar sesión y versión — **sin** gestión de proveedores ni claves API (el producto es *secretless*; eso es ops/backoffice del ciclo 6). Sin cambios de backend, esquema ni dependencias. El **cutover final `/app→/`** queda **fuera** de este SPEC y se encuadra en §7 como paso de cierre propio.

---

## 2. Stack y arquitectura

Stack fijado (SPEC-01…03), sin novedades de tooling ni dependencias: React 19 + Vite 8 + TS 6 + Tailwind v4 + shadcn + react-router 7 + oxlint; cliente tipado `openapi-fetch` (`/api/v1`). Se reutilizan primitivas ya presentes (`button`, `badge`, `toggle-group`/segmented, iconos `lucide-react`) y los contextos existentes.

**Ubicación en el shell:** Historial y Ajustes **no** son fases del flujo → el `AppShell` ya oculta el `Stepper` en ellas (`isPhase` es false) y mantiene el `Header` (wordmark + navegación + avatar + logout). Estas pantallas **no** llevan cabecera propia con "volver": el título va en el contenido, y se vuelve por el `Header`/navegación. Rutas ya existentes (`/history`, `/settings` en `routes/paths.ts`), montadas bajo `RequireAuth` + `ActiveSessionProvider`.

**Fuentes de datos:**
- **Historial:** consume `api.listSessions()` (lista resumida), `api.getSession(id)` (al reabrir) y `api.reprocess(id)` (rescate). Escribe en `ActiveSession` (`setSession`/`reset`) para que las fases de SPEC-04/05 lo lean.
- **Ajustes:** **cliente puro**, sin llamadas de red. Cuenta de `useAuth()`; tema de `useTheme()` (`ThemeProvider`, SPEC-01); idioma de i18n (monolingüe hoy).

**Regla de tokens/tema:** solo tokens semánticos de `web/src/index.css` (`bg-card`, `bg-surface`, `text-ink`, `text-muted-foreground`, `border`, `text-success`, `text-primary`, `text-warning`, `text-error`, `bg-accent`…) vía utilidades Tailwind; **sin** hex del mock. Badges de estado compuestos con esos tokens + opacidad. Respetar `prefers-reduced-motion`.

**Capas de archivos:**

```
web/src/routes/History.tsx   ← pantalla real (reemplaza placeholder)   (MODIFIED)
web/src/routes/Settings.tsx  ← pantalla real (reemplaza placeholder)   (MODIFIED)
web/src/i18n/locales/es/common.json ← claves reales history/settings   (MODIFIED)
```

`client.ts` **no se toca** (`listSessions`/`getSession`/`reprocess`/`updateSession` ya existen). Subcomponentes de pantalla viven dentro de su fichero de ruta.

---

## 3. Delta

### 3.1 MODIFIED — `web/src/routes/History.tsx` (pantalla "Historial")

Reemplaza el placeholder por la vista del mock `Historial.dc.html`.

- **Carga:** al montar, `api.listSessions()` → `SessionListItem[]`. Estados **cargando / vacío / error** (con reintento). La lista viene "más recientes primero" del backend.
- **Filtros (cliente):** chips **Todas / En curso / Completadas**. `Completadas` = `has_prompt`; `En curso` = `!has_prompt`; `Todas` = sin filtro.
- **Agrupado por fecha (cliente):** secciones **Hoy / Esta semana / Anteriores**, derivadas de `timestamp` (ISO). Cada sección con su encabezado; se omiten las vacías.
- **Item de sesión** (tarjeta, clicable): 
  - **Título** = `preview` (elipsis a una línea) o un texto de "(sin contenido)" si `preview` es null.
  - **Badge de estado** derivado (§4.2): Completado / En destilado / En captura / Borrador.
  - **Meta:** tiempo relativo + (`{{n}} tramos` si `has_prompt`/completada, o `reanudar` si en curso).
  - **Reabrir** (clic en la tarjeta): §4.3.
  - **"Reprocesar"** (acción secundaria, **solo** si `has_audio && !has_transcription`): §4.4.
- **Barra al fondo:** **"+ Nuevo dictado"** → `active.reset()` + `navigate('/capture')`.

### 3.2 MODIFIED — `web/src/routes/Settings.tsx` (pantalla "Ajustes")

Reemplaza el placeholder por la vista del mock `Ajustes.dc.html`, **sin el bloque "Proveedores/Clave API"** (decisión: producto *secretless*; proveedores/modelos son ops/backoffice del ciclo 6). Pantalla **cliente-pura** (sin red).

- **Tarjeta de cuenta:** avatar (`user.initials`), `user.name` y `user.email`, etiqueta de proveedor de identidad ("Microsoft"; en devBypass, "Cuenta local"). Datos de `useAuth()`.
- **Preferencias:**
  - **Tema** — segmented **Claro / Oscuro** cableado a `useTheme()` (`setTheme('light'|'dark')`, `theme` marca el activo). *(Se descarta "Sistema" para no modificar el `ThemeProvider` de SPEC-01; ver §7.)*
  - **Idioma** — "Español", **solo lectura** (i18n monolingüe hoy; el selector real llega con las traducciones, ligado a ciclo 4/negocio).
- **Cuenta:** **"Cerrar sesión"** → `useAuth().logout()`. **Oculto si `isDevBypass`** (igual que en el `Header`). Debajo, etiqueta de **versión** ("Speech-to-Prompt · vX").
- **NO** incluye: selección de proveedor STT/LLM, entrada/edición de API keys, ni el toggle "guardar sesiones automáticamente" del mock (las sesiones siempre se persisten en el backend; no hay tal ajuste).

### 3.3 MODIFIED — `web/src/i18n/locales/es/common.json`

Reemplazar los bloques placeholder `history.*` / `settings.*` por las claves reales (textos exactos a fijar en implementación; **lista mínima orientativa**, autoconsistente como en SPEC-03…05):

- `history.title`, `history.filters.{all,inProgress,completed}`, `history.groups.{today,week,earlier}`, `history.status.{completed,distilling,capturing,draft}`, `history.meta.segments_one`/`_other` (`{{count}}`), `history.meta.resume`, `history.reprocess`, `history.reprocessing`, `history.reprocessError` (`{{msg}}`), `history.newDictation`, `history.empty`, `history.loadError` (`{{msg}}`), `history.untitled`.
- `settings.title`, `settings.account.provider` (Microsoft), `settings.account.localProvider` (Cuenta local), `settings.prefs.title`, `settings.prefs.theme`, `settings.prefs.themeLight`, `settings.prefs.themeDark`, `settings.prefs.language`, `settings.prefs.languageEs`, `settings.account.title`, `settings.logout`, `settings.version` (`{{v}}`).

Se conservan sin cambios `phases.*`, `capture.*`, `review.*`, `distill.*`, `result.*`, `nav.*`, `auth.*`.

### 3.4 REMOVED

- El uso de `Placeholder` en `History.tsx`/`Settings.tsx` (el componente `Placeholder.tsx` permanece si aún lo usa algo; tras SPEC-06 ya no lo usa ninguna ruta — se puede dejar sin borrar).
- Las claves i18n `history.placeholder` / `settings.placeholder`.

Nada más se elimina. `public/` viejo, `server.js`, `openapi/`, backend, migraciones, `client.ts`, contextos y shell: **intactos**.

---

## 4. Interfaces y contratos (comportamiento a preservar)

### 4.1 Contrato de datos (backend sin cambios; ya en el OpenAPI)

- `GET /api/v1/sessions` → `SessionListItem[]` `{ id, timestamp, preview, has_prompt, has_transcription, has_audio, segment_count }` (más recientes primero).
- `GET /api/v1/sessions/{id}` → `Session` (completa, con `segments`).
- `POST /api/v1/sessions/{id}/reprocess` → `ReprocessResult { transcription_raw, session }` (re-transcribe el audio guardado y reproyecta la transcripción).
- Aislamiento por propietario: el backend ya filtra por `callerId`; el front no añade nada.

Todas vía la fachada `api` de `client.ts` + `unwrap`. **No** se consumen aquí `getConfig`/`updateConfig` (Ajustes es cliente-puro), `distill`, `addSegment`, `getSegmentAudio` ni `getSessionUsage`.

### 4.2 Derivación de estado del item — [criterio del front]

A partir de los flags de `SessionListItem`, en este orden:
- `has_prompt` → **Completado** (tono `success`).
- `!has_prompt && has_transcription` → **En destilado** (tono `primary`; hay transcripción, falta/pendiente destilar).
- `!has_transcription && segment_count > 0` → **En captura** (tono `warning`; audio sin transcribir).
- resto (`segment_count === 0`) → **Borrador** (tono `muted`).

### 4.3 Reabrir una sesión — [preservar el flujo]

Al tocar una tarjeta: `const s = await unwrap(api.getSession(id))` → `active.setSession(s)` → **navegar a la fase** según el estado del `Session` cargado:
- `s.prompt_distilled` → `/result`.
- si no, `s.transcription_edited || s.transcription_raw` → `/review`.
- si no → `/capture` (que **hidrata** desde `ActiveSession`, SPEC-04 §3.4: muestra los tramos existentes y permite añadir/finalizar).

Errores de `getSession` → aviso no bloqueante (no navega). Estado "abriendo" por item para evitar doble clic.

### 4.4 Reprocesar (rescate) — [preservar; consume `reprocess`]

Solo visible en items con `has_audio && !has_transcription`. Acción **"Reprocesar"**: estado ocupado en el item; `const r = await unwrap(api.reprocess(id))`; en éxito `active.setSession(r.session)` + `navigate('/review')` (ya hay transcripción). En error, aviso `history.reprocessError` no bloqueante; la lista sigue operativa. Best-effort en el sentido de que un fallo no rompe la pantalla. *(Requiere STT activo — verificable en local, a diferencia del LLM.)*

### 4.5 Ajustes — contratos de cliente

- **Tema:** `useTheme().setTheme('light'|'dark')`; el segmented refleja `theme`. Persistencia ya la hace `ThemeProvider` (localStorage `stp-theme`), sin trabajo extra.
- **Idioma:** display fijo "Español" (deshabilitado). Sin cambio de i18n.
- **Cuenta / logout:** `useAuth().logout()` (MSAL `logoutRedirect`; en devBypass el botón **no se renderiza**). El avatar/nombre/email salen de `useAuth().user`.

### 4.6 "Nuevo dictado" desde Historial

`active.reset()` + `navigate('/capture')` → Captura arranca limpia (sin hidratación, al no haber sesión activa). Idéntico al "Nuevo dictado" de Resultado (SPEC-05).

---

## 5. Qué se PRESERVA (superficie de regresión)

**Frontend viejo (`public/`) intacto:** su panel de historial y ajustes siguen en `/` sin cambios. SPEC-06 solo modifica ficheros en `web/`.

**Backend / API / esquema / OpenAPI / migraciones intactos:** no se tocan; se consumen `listSessions`/`getSession`/`reprocess` (ya existentes). `client.ts` sin cambios.

**Flujo de 4 fases + `ActiveSession` (SPEC-04/05):** Historial **alimenta** `ActiveSession` al reabrir y navega a la fase correcta; Captura hidrata, Revisión/Resultado leen. No se altera su comportamiento; se reutiliza.

**Auth (SPEC-03):** `useAuth` (MSAL/devBypass), costura de token/401, logout. Ajustes y el avatar consumen `useAuth`; el logout de Ajustes es el mismo `logout()` del `Header`. Oculto en devBypass en ambos sitios.

**Tema (SPEC-01):** `ThemeProvider` (light/dark, localStorage `stp-theme`). El control de Ajustes usa `setTheme` sin cambiar el provider; el toggle del `Header` sigue funcionando.

**Rutas / shell:** `routes/paths.ts`, `AppShell` (oculta Stepper fuera de fases), `Header`, `RequireAuth`, `ActiveSessionProvider`: sin cambios.

---

## 6. Migración de datos

**No aplica.** Sin cambios de esquema; solo lectura de sesiones existentes y `reprocess` (que ya existía).

---

## 7. Fuera de alcance

- **Cutover final `/app→/`** (cierre del ciclo 2b) — **paso propio (SPEC-07 / RUNBOOK)**, tras verificar estas pantallas y el smoke logueado de SPEC-05. **Encuadre** (mecánica ya localizada, para su spec):
  - `web/vite.config.ts`: `base: '/app/' → '/'` y PWA `manifest.start_url`/`scope` `'/app/' → '/'`. `App.tsx` deriva `BASENAME` de `import.meta.env.BASE_URL`, así que se ajusta solo.
  - `server.js`: servir `web/dist` en `/` (hoy en `/app`, líneas 82-83); **retirar** el bloque `/app` y **el `public/` viejo** (`express.static(public)` línea 34 + el fallback `*` → `public/index.html` líneas 87-89), sustituyéndolo por el fallback SPA a `web/dist/index.html`.
  - MSAL `redirectUri` → `origin + '/'` (la raíz ya está registrada en Entra, según el ciclo 1).
  - Verificación **propia**: deep-links en `/…` (no `/app/…`), redirect MSAL a raíz, PWA reinstalable con scope `/`, y el frontend viejo **retirado** sin romper `/api`.
- **Gestión de proveedores/claves** (STT/LLM, API keys) — *secretless*; ops/backoffice (ciclo 6). `getConfig`/`updateConfig` quedan sin consumir en el front nuevo.
- **Selector de idioma real / traducciones** — ligado a ciclo 4/negocio; hoy "Español" fijo.
- **Tema "Sistema"** (prefers-color-scheme) — requeriría extender el `ThemeProvider` de SPEC-01; no se aborda (Claro/Oscuro cubre el caso).
- **Costes / uso por sesión** en Historial — ciclo 5.
- **Compartir sesiones** (`session_shares`) — no hay feature (schema-only).
- **Backend / prompts / esquema / deps nuevas:** sin cambios.
- **Tooling de test nuevo en `web/`** (vitest): no se introduce (verificación e2e con el navegador, como en SPEC-01…05).

---

## 8. Verificación (extremo a extremo, incl. regresión)

### 8.1 Estático / build / lint

- `cd web && npm run build` (tsc + vite) verde; `npm run lint` (oxlint) sin errores nuevos (3 warnings benignos preexistentes aceptables).
- `cd web && npm ci` reproducible (SPEC-06 no añade deps → lock sin cambios).
- **Regresión backend:** `npm test` (raíz) sigue **14/14**.

### 8.2 Historial e2e (`/app/history`)

Backend local (devBypass) + `web` dev + BD local con ≥1 sesión (crear alguna vía el flujo de captura/destilado, o preexistentes):
- Al abrir: `GET /api/v1/sessions` y render de la lista **agrupada por fecha** con **badges de estado** coherentes con los flags; los **filtros** (Todas/En curso/Completadas) acotan la lista en cliente. Estados vacío/error correctos.
- **Reabrir**: tocar una sesión **completada** → `GET /sessions/{id}` → aterriza en `/result` con el prompt; una **con transcripción sin prompt** → `/review`; una **sin transcripción** → `/capture` con los tramos hidratados. En todos, `ActiveSession` poblado (sin volver a pedir la sesión).
- **Reprocesar**: en una sesión con audio sin transcripción, la acción "Reprocesar" → `POST /sessions/{id}/reprocess` → transcripción reproyectada → reabre en `/review` con el texto. (STT local operativo.)
- **"+ Nuevo dictado"** → `/capture` limpio (sin tramos).

### 8.3 Ajustes e2e (`/app/settings`)

- Render de la tarjeta de cuenta con nombre/email/iniciales de `useAuth` (en devBypass, "Dev local" / "Cuenta local", **sin** botón de cerrar sesión).
- **Tema**: el segmented Claro/Oscuro cambia el tema (clase `.dark` en `<html>`, persistida en `localStorage['stp-theme']`) y queda coherente con el toggle del `Header`.
- Idioma "Español" visible y no interactivo. Versión visible. **No** aparece ningún bloque de proveedores/claves.
- (Prod/MSAL, en el smoke) el botón "Cerrar sesión" dispara `logoutRedirect`.

### 8.4 Render / tema / no regresión del viejo

- `/app/history` y `/app/settings` renderizan en **claro y oscuro**, **0 errores de consola**.
- **Viejo (`/`):** sigue sirviendo el frontend vanilla (su historial/ajustes intactos).
- **Flujo 4 fases (SPEC-04/05):** sin regresión — reabrir desde Historial deja `ActiveSession` en el mismo estado que dejaría el flujo natural.

### 8.5 Cierre en Azure (diferido, como en SPEC-01…05)

Tras merge y deploy: `/app/history` lista las sesiones reales del usuario logueado y reabre en la fase correcta; `/app/settings` muestra la cuenta MSAL real y el logout funciona. Parte del **smoke logueado del usuario**.

---

## 9. Notas de implementación (no normativas)

- `Date`/`Intl.RelativeTimeFormat` para el tiempo relativo y el agrupado por fecha se usan en runtime de navegador (no en workflows) — sin restricción. Mantener el cálculo de "Hoy/Esta semana" simple y en zona local.
- Los wrappers de ruta pueden seguir el patrón de SPEC-05 (un `useActiveSession()`/hooks arriba; guardas si hicieran falta) — aunque Historial/Ajustes **no** exigen sesión activa (son accesibles siempre desde el `Header`).
- El badge de versión puede leer un valor estático o de `import.meta.env`; no es contrato.
- Reutilizar el segmented (toggle-group) y `badge` de shadcn ya presentes; iconos de `lucide-react` (p. ej. `Clock`, `Settings`, `LogOut`, `Plus`, `ChevronRight`, `RefreshCw`).
