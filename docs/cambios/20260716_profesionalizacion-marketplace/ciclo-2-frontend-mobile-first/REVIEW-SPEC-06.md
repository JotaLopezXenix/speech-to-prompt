# REVIEW-SPEC-06 — El marco: Historial · Ajustes (revisión adversarial independiente)

**Programa:** `profesionalizacion-marketplace` · **Ciclo:** 2 `frontend-mobile-first` · **Sub-ciclo:** 2b.
**Fecha:** 22-jul-2026 · **Fase JCC:** 4 (revisión adversarial e independiente).
**Contrato revisado:** `SPEC-06_marco.md` · **Rama:** `2b-06-marco` (diff `main...HEAD`).
**Postura:** escéptica. Objetivo = refutar que cumple y no rompe. No revisa estilo ni preferencias.

---

## 0. Alcance del diff (verificado)

`git diff --name-only main...HEAD` → **exactamente** los 5 ficheros esperados, nada más:

```
CLAUDE.md
docs/cambios/20260716_profesionalizacion-marketplace/README.md
web/src/i18n/locales/es/common.json
web/src/routes/History.tsx
web/src/routes/Settings.tsx
```

**Comprobación de ficheros PROHIBIDOS en el diff (todos ausentes → correcto):**
`client.ts`, `server.js`, `openapi/`, `migrations/`, `public/`, `vite.config.ts`, `package.json`/lock, `authContext`/`AuthProvider`, `ActiveSessionProvider`, `AppShell`, `Header`, `Stepper`, `routes/paths.ts` → **NINGUNO aparece**. El cutover `/app→/` no se ha tocado (base sigue en `/app/`). Sin deps nuevas. Sin backend.

---

## 1. Regresión (superficie de "Qué se PRESERVA", SPEC §5)

| Elemento a preservar | Resultado |
|---|---|
| `client.ts` (solo consumir) | **OK** — no está en el diff; `api.listSessions/getSession/reprocess`, `unwrap` se consumen sin tocarlos. |
| `ActiveSession` (SPEC-04/05) | **OK** — `useActiveSession()` expone `setSession`/`reset`; History los usa; no se altera el contexto. |
| `useAuth` (SPEC-03) | **OK** — Settings consume `user`/`isDevBypass`/`logout`; el `logout` es el mismo de MSAL/devBypass. |
| `ThemeProvider` (SPEC-01) | **OK** — Settings usa `theme`/`setTheme` sin modificar el provider; persistencia `stp-theme` intacta. |
| `routes/paths.ts` / `AppShell` / `Header` / `Stepper` | **OK** — no están en el diff. |
| Front viejo `/` + backend | **OK** — `public/`, `server.js`, `openapi/`, migraciones intactos. |
| **Reabrir → hidratación de Captura (SPEC-04 §3.4)** | **OK** — `useCapture.ts:448-453` hidrata desde `active.session` cuando `segments?.length`; `Session.segments` es `Segment[]` requerido en el schema, y `getSession` lo devuelve poblado. La reapertura deja `ActiveSession` en el mismo estado que el flujo natural. |
| Navegación por fase al reabrir | **OK** — `prompt_distilled`→`/result`; `transcription_edited||transcription_raw`→`/review`; si no →`/capture` (SPEC §4.3, verbatim). |

**Sin regresiones detectadas.**

---

## 2. Cumplimiento del SPEC (§3/§4), punto por punto

### 2.1 Historial (`History.tsx`)
- **Carga** con `listSessions` + estados cargando (`items===null`, spinner) / vacío (`history.empty`) / error (`loadError` + botón **Reintentar** → `load()`). **OK** (§3.1).
- **Filtros cliente** Todas/En curso/Completadas: `matchesFilter` → completed=`has_prompt`, inProgress=`!has_prompt`, all=true. **OK** (§3.1/§4).
- **Agrupado por fecha** Hoy/Esta semana/Anteriores, secciones vacías omitidas (`GROUP_ORDER.filter(...length>0)`), `timestamp` null→'earlier'. **OK** (§3.1).
- **Item:** título=`preview ?? untitled` con `truncate` (1 línea); badge derivado; meta = tiempo relativo + (`{{count}} tramos` si completada / `reanudar` si en curso). **OK** (§3.1).
- **Derivación de estado (§4.2)** en el orden y precedencia exactos: `has_prompt`→completed(success); `has_transcription`→distilling(primary); `segment_count>0`→capturing(warning); resto→draft(muted). **OK — precedencia correcta** (una sesión con prompt gana "Completado" aunque no haya transcripción).
- **Reprocesar solo si `has_audio && !has_transcription`** (`canReprocess`, §4.4) → `reprocess` → `setSession(r.session)` → `/review`; error no bloqueante. **OK**. Botón **hermano** (no anidado) del botón de reabrir → sin propagación cruzada ni `<button>` anidado inválido. **OK**.
- **Reabrir (§4.3):** `getSession` → `setSession` → navegación por fase; error → `reopenError` no bloqueante + reset de `openingId` (no navega). Estado "abriendo/reprocesando" por item + guarda global `if (openingId||reprocessingId) return`. **OK**.
- **"+ Nuevo dictado"** → `reset()` + `navigate('/capture')` (§4.6). **OK**.

### 2.2 Ajustes (`Settings.tsx`)
- **Cliente-puro:** no importa `api`; **cero llamadas de red**. **OK** (§3.2/§4.5).
- **Tarjeta de cuenta** de `useAuth()`: iniciales, nombre, email + etiqueta de proveedor (`Microsoft` / `Cuenta local` en devBypass). **OK**.
- **Tema** segmented Claro/Oscuro cableado a `useTheme().setTheme`, refleja `theme` (`aria-pressed`), persistencia la hace el provider. **OK** (§4.5).
- **Idioma** "Español" solo lectura (span, no interactivo). **OK**.
- **Cerrar sesión** → `logout()`, **oculto si `isDevBypass`** (`{!isDevBypass && …}`). **OK**.
- **Versión** visible (`settings.version` con `v`). **OK**.
- **SIN bloque proveedores/claves** ni toggle "guardar sesiones". **OK** (§3.2, §7).

### 2.3 i18n (`common.json`)
- **Todas** las claves usadas por ambas pantallas existen. Verificado 1:1 contra el código.
- Plurales `history.meta.segments_one/_other` correctos; `t('…segments',{count})` resuelve por i18next v4 (config sin `compatibilityJSON`; hay precedente ya en prod: `segmentsCount_one/_other`, `words_one/_other`). **OK**.
- Claves extra sobre la "lista mínima orientativa" del SPEC: `history.reopenError`, `history.retry` — **permitidas** (§3.3 dice lista orientativa/autoconsistente) y ambas están definidas → **no hay missing keys**.
- Bloques `phases/capture/review/distill/result/nav/auth` sin cambios; placeholders `history.placeholder`/`settings.placeholder` eliminados (§3.4). **OK**.

**Cumplimiento: completo. No hay requisitos del SPEC §3/§4 sin implementar.**

---

## 3. Correctitud / casos límite

- **Reglas de hooks:** `useTranslation`/`useNavigate`/`useActiveSession` al tope; `SessionCard`/`StatusBadge` llaman `useTranslation` en el tope de su cuerpo. Sin llamadas condicionales. **OK**.
- **Doble-fetch StrictMode:** `useEffect([])` con `load()` idempotente (GET) → benigno (last-write-wins, mismos datos). **OK**.
- **Reentrada (doble clic):** guarda de función global + `disabled` por item. Correcta para el mismo item; para OTRO item la guarda de función bloquea la acción aunque su botón no aparezca deshabilitado (ver hallazgo B-5). En éxito no se resetea `openingId`/`reprocessingId` (intencional: la navegación desmonta). **OK**.
- **`timestamp` null:** `groupOf`/`relTime` lo tratan (→'earlier' / ''). **OK**.
- **`preview` null:** fallback `history.untitled`. **OK**.
- **`segment_count===0` → Borrador:** correcto; ver hallazgo B-2 sobre reapertura.
- **Precedencia prompt+sin-transcripción:** "Completado" (correcto por §4.2).
- **Errores de `listSessions`/`getSession`/`reprocess`:** no bloqueantes, la pantalla sigue operativa. **OK**.
- **`prefers-reduced-motion`:** spinners con `motion-safe:animate-spin` (normativo §2). **OK**.
- **Tokens semánticos (normativo §2):** solo utilidades sobre tokens de `index.css` (`text-ink`, `bg-card`, `bg-surface`, `text-success/primary/warning/error`, `bg-accent`, `bg-muted`, `border`, `rounded-card`, `font-display`); todos definidos en `index.css` `@theme` y con precedente en rutas ya en prod. **Sin hex del mock.** **OK**.

---

## 4. Verificación ejecutada (salida real)

**`cd web && npm run build`** → **VERDE (exit 0).** `✓ built in 660ms`; genera `dist/` + PWA (`sw.js`). Único aviso: "chunks larger than 500 kB" — **pre-existente y benigno** (tamaño del bundle global, no de SPEC-06).

**`cd web && npm run lint` (oxlint)** → **0 errores**, **3 warnings** — todos **pre-existentes** en primitivas shadcn y **ninguno** en los ficheros nuevos:
```
src/components/ui/badge.tsx:48  react(only-export-components)
src/components/ui/toggle.tsx:45 react(only-export-components)
src/components/ui/button.tsx:64 react(only-export-components)
```
Coincide con lo que el SPEC §8.1 declara aceptable.

**`npm test` (raíz)** → **14/14 PASS**, 0 fail. Regresión backend intacta (§8.1).

**e2e de navegador (§8.2–8.4):** **NO ejecutada** — requiere servidores (backend devBypass + `web` dev) y BD local con sesiones. Evaluación por lectura: el código haría lo que el SPEC afirma (carga/filtros/grupos/badges, reabrir por fase con `ActiveSession` poblado sin re-pedir la sesión, reprocess→/review, tema persistido, logout oculto en devBypass). Queda para el smoke logueado del usuario (§8.5), como en SPEC-01…05.

---

## 5. Fuera de alcance (§7) — verificado

- `getConfig`/`updateConfig`/`getSessionUsage`/`distill`/`addSegment`/`getSegmentAudio` **NO** se consumen en el diff. **OK**.
- Sin proveedores/keys en Ajustes. **OK**.
- Sin cambios de cutover: `vite.config.ts` (base `/app/`), `server.js` (bloque `/app`), `redirectUri` MSAL — **intactos** (no en el diff). **OK**.
- Sin deps nuevas (lock no tocado), sin backend, sin tooling de test nuevo. **OK**.

**No se ha tocado nada de lo prohibido.**

---

## 6. Hallazgos

Ninguno de gravedad ALTA ni MEDIA. Todos BAJA (observaciones; **ninguno es incumplimiento del SPEC ni regresión**).

| # | Hallazgo | Fichero:línea | Gravedad | Tipo |
|---|---|---|---|---|
| B-1 | Estado vacío ambiguo: si un filtro (p. ej. "Completadas") excluye todo pero SÍ hay sesiones, se muestra `history.empty` = "Aún no tienes dictados. Empieza uno nuevo." (mensaje pensado para "sin ninguna sesión"). El SPEC §3.1 solo pide un estado "vacío" genérico, así que no es incumplimiento; es UX. | `web/src/routes/History.tsx:187-189` (`filtered.length === 0`) | BAJA | bug/UX |
| B-2 | Reabrir un **Borrador** (`segment_count===0`) navega a `/capture` pero la hidratación exige `segments?.length>0` (`useCapture.ts:448`), así que no reanuda: al grabar se crea una sesión NUEVA y el borrador vacío queda huérfano. Sin pérdida de datos (el borrador está vacío) y raro en el flujo nuevo (la sesión se crea perezosamente con el 1er tramo). El SPEC §4.3 solo exige navegar a `/capture`. | `web/src/routes/History.tsx:70` + `web/src/capture/useCapture.ts:448` | BAJA | edge/observación |
| B-3 | `relTime` usa el literal `'ahora'` y `Intl.RelativeTimeFormat('es')`/`toLocaleDateString('es')` hardcodeados, fuera de i18n. Aceptable hoy (app monolingüe `es`; SPEC §9 no normativo). A revisar en ciclo 4 al introducir traducciones. | `web/src/routes/History.tsx:44,47,52` | BAJA | observación |
| B-4 | Chips de filtro y badge de estado implementados como `<button>`/`<span>` propios en vez de las primitivas shadcn `toggle-group`/`badge` que §9 sugiere. §9 es **no normativa** y la regla normativa de tokens (§2) se cumple → **no es incumplimiento**. | `web/src/routes/History.tsx:135-152, 258-269` | BAJA | observación |
| B-5 | Mientras un item está "abriendo/reprocesando", los botones de OTROS items no se ven deshabilitados (el `disabled` es por item), aunque la guarda de función global bloquea la acción. Solo cosmético. | `web/src/routes/History.tsx` `SessionCard` `disabled=` | BAJA | cosmético |

**Huecos del propio SPEC (no cuentan como incumplimiento):** el SPEC no distingue "vacío real" de "vacío por filtro" (origen de B-1), ni especifica el comportamiento de reabrir un Borrador de 0 tramos (origen de B-2). Anotados para que el autor decida.

---

## 7. VEREDICTO

**SÍ — cumple el SPEC-06 y no rompe nada.**

- **Regresión:** ninguna. El diff toca solo los 5 ficheros previstos; `client.ts`, backend, `openapi/`, migraciones, `public/`, shell, contextos y el cutover quedan intactos. `ActiveSession`/`useAuth`/`ThemeProvider` solo se consumen. La reapertura deja `ActiveSession` como el flujo natural (hidratación de Captura verificada por lectura).
- **Cumplimiento:** completo. Todo lo exigido en §3/§4 está implementado (filtros, agrupado, derivación de estado con la precedencia correcta, reabrir por fase, reprocess condicionado a `has_audio && !has_transcription`, "Nuevo dictado", Ajustes cliente-puro con tema/cuenta/logout oculto en devBypass, i18n sin missing keys).
- **Verificación:** build VERDE, lint 0 errores (3 warnings pre-existentes), tests **14/14**. La e2e de navegador no se ejecutó (requiere servidores+BD) y queda para el smoke logueado del usuario.
- **Fuera de alcance:** respetado.

**Huecos:** 5 hallazgos, todos **BAJA** (0 ALTA / 0 MEDIA), ninguno incumplimiento ni regresión. B-1 (mensaje de vacío ambiguo con filtro) y B-2 (reabrir Borrador de 0 tramos) son los más sustantivos; el usuario decide si se pulen o se aceptan. Apto para pasar al smoke logueado y, tras él, al cutover (SPEC-07/RUNBOOK).

---

## 8. Cierre del bucle 3↔4 (2026-07-22)

A elección del usuario, se pulieron **B-1 y B-5** en el commit `6e3ad7b`:
- **B-1**: se distingue el vacío-total ("Aún no tienes dictados") del vacío-por-filtro (nueva clave `history.emptyFilter`: "No hay sesiones en este filtro").
- **B-5**: prop `busy` → mientras hay una acción en vuelo (abrir/reprocesar) se deshabilitan **todas** las tarjetas, no solo la del item en acción.

**Aceptados sin acción** (documentados): **B-2** (reabrir un Borrador de 0 tramos no reanuda; edge degenerado — el SPEC §4.3 solo exige navegar a `/capture`; tocar la hidratación R1 de SPEC-04 no compensa), **B-3** (`'ahora'`/locale fuera de i18n; app monolingüe hoy), **B-4** (chips/badge propios en vez de primitivas shadcn; §9 no normativa, regla de tokens §2 cumplida).

Re-verificado: `web` build (tsc+vite) verde + lint 0 errores; cambios frontend-only, backend intacto. **Veredicto tras el bucle: SÍ, limpio, 0 hallazgos abiertos** (B-1/B-5 corregidos; B-2/B-3/B-4 aceptados). Único pendiente = smoke logueado en Azure (§8.5 del SPEC), no bloqueante para el veredicto de código.
