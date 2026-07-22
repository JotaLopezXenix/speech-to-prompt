# REVIEW-SPEC-05 — Revisión adversarial independiente (Fase 4 JCC)

**Cambio revisado:** SPEC-05 `resto-flujo` (Revisión · Destilado · Resultado).
**Rama:** `2b-05-resto-flujo` · **commit:** `d9ad65e`.
**Contrato:** `SPEC-05_resto-flujo.md` (incl. ADDENDUM 22-jul) · `CLAUDE.md` · `DESIGN.md`/`DESIGN-2a.md` del ciclo.
**Revisor:** independiente, no escribió el código. Postura: escéptica (intentar refutar).
**Fecha:** 22-jul-2026.

Diff revisado (`git diff main...HEAD`): 9 ficheros, +873/-19. Solo docs + `web/`:
`CLAUDE.md`, README del cambio, SPEC nuevo (docs); `web/src/api/client.ts`, `web/src/capture/useCapture.ts`, `web/src/i18n/locales/es/common.json`, `web/src/routes/{Review,Distill,Result}.tsx` (código).

---

## 0. Veredicto (resumen)

**SÍ cumple el SPEC y NO rompe nada.** Verificación estática en verde (build tsc+vite ✓, lint 0 errores / 3 warnings preexistentes ✓, `npm test` **14/14** ✓). Las salvaguardas R1 quedan intactas (el único cambio en `useCapture.ts` es el bloque de hidratación, idempotente y guardado). El fix de tipo de `client.ts` es solo de tipo y no toca otras fachadas. Todos los puntos normativos del §3/§4 están implementados; todas las claves i18n usadas existen; ninguna dependencia añadida; backend/OpenAPI/migraciones/`public/` sin tocar.

**Hallazgos:** 0 ALTA · 0 MEDIA · 2 BAJA (ambos cosméticos/inocuos, no bloquean). Detalle abajo.

---

## 1. Regresión (crítico) — resultado: SIN REGRESIÓN

### 1.1 Salvaguardas de captura R1 (`useCapture.ts`) — INTACTAS ✓

El diff en `useCapture.ts` es **exactamente** el bloque de hidratación del §3.4, insertado dentro del efecto de cableado `[]` (líneas 444-453), antes de `api.warmup()`. Nada más cambia: recorder, `audio-guards`, `diagnostics`, distinción parada intencional vs externa, banners (safeguard/retry/suspect), warm-up, aviso "sin señal", cleanup — **byte-idénticos** al `main`.

Verificaciones adversariales concretas:

- **¿Se re-siembra en remount/StrictMode?** No. Guarda `sessionIdRef.current == null` (línea 448). En StrictMode dev (mount→cleanup→mount) `sessionIdRef` es un ref de la misma instancia de hook y **persiste** entre las dobles invocaciones; el cleanup (líneas 463-479) **no** lo resetea → la segunda invocación salta la siembra. Idempotente. `diag.setSessionId` opera sobre un singleton de módulo (`diagnostics.ts:28,58`) que tampoco se limpia en `endCaptureRun` → sin pérdida.
- **¿Pisa una grabación en curso?** No. La siembra corre en el efecto de montaje, antes de cualquier grabación (grabar exige acción de usuario posterior). En un remount real el `AudioRecorder` es una instancia nueva (`useCapture.ts:67-69`); el cleanup del efecto para la grabación previa. No hay grabación viva que pisar.
- **¿Rompe la ruta "sesión nueva" (sin ActiveSession)?** No. La condición `active.session && active.session.segments?.length` cortocircuita con `session == null`. Tras "Nuevo dictado" (`reset()` → `session=null`) y navegar a `/capture`, la siembra no dispara; `commitSegment` (líneas 285-291) crea la sesión lazy como en SPEC-04.
- **¿El guard `sessionIdRef.current == null` es correcto?** Sí. En montaje fresco arranca `null`; garantiza una sola siembra y no interfiere con la creación lazy (que usa la misma condición, línea 286). Tras sembrar, `canFinalize` (línea 505) queda `true` y `commitSegment` omite el `POST /sessions` y hace `addSegment` sobre la misma sesión → cumple §8.3 (1 `POST /sessions` + N `POST /segments`).

### 1.2 Backend / API / esquema / OpenAPI / migraciones — INTACTOS ✓

`git diff --name-only main...HEAD` no incluye `server.js`, `routes/`, `openapi/`, `migrations/` ni nada de backend. Confirmado.

### 1.3 Frontend viejo `public/` — INTACTO ✓

No aparece en el diff. Sigue sirviéndose en `/`.

### 1.4 `client.ts` — cambio SOLO de tipo, sin daño colateral ✓

Diff = (a) `import type { paths, components }` (antes solo `paths`); (b) la fachada `distill` pasa de un condicional que colapsaba a `never` a `body?: components['schemas']['DistillRequest']`.

- **(a) ¿es solo de tipo?** Sí. El cuerpo de `distill` sigue siendo `client.POST('/sessions/{id}/distill', { params, body })`; no cambia el runtime ni el contrato.
- **(b) ¿rompe otras fachadas?** No. `updateSession`, `addSegment`, `getSegmentAudio`, `getSessionUsage`, `reprocess`, `createSession`, `postDiagnostics`, etc. quedan idénticas (el diff toca solo esas 2 líneas + el import). `paths` sigue importado y usado.
- **(c) ¿import de `components` correcto?** Sí; el tipo `DistillRequest` existe en `schema.d.ts:432` con `mode?: "completo"|"ligero"|"literal"|"limpio"`. El build tipa OK, lo que confirma que el condicional anterior efectivamente daba `never` (fachada incallable, bug latente) y ahora es invocable con `{ mode }`. Coincide con lo declarado en el ADDENDUM.

---

## 2. Cumplimiento del SPEC (§3/§4) — COMPLETO

Contraste punto por punto (todo verificado por lectura):

**Guardas de deep-link (§2):**
- `/review` y `/distill`: `if (!session) return <Navigate to={PATHS.capture} replace/>` (Review.tsx:24, Distill.tsx:27). En `ActiveSessionProvider.tsx:12` `sessionId = session?.id ?? null`, así que `!session` ⟺ `sessionId == null` (equivalente al texto del SPEC). ✓
- `/result`: `!session → /capture`; `!session.prompt_distilled → /distill` (Result.tsx:22-23). ✓
- El proveedor guarda la sesión solo en memoria (sin carga async ni persistencia), así que recarga dura / deep-link → `session=null` → redirige. Cumple §8.4. ✓

**Revisión (§3.1, §4.3, §4.4):**
- Encabezado + subtítulo plural `review.subtitle` con `{count: segments.length}` (Review.tsx:122). ✓
- Chips con scroll-x, uno por segmento; `review.tramo {{n}}` + marca importado + `formatTime`/`—`; reproducción por chip vía `getSegmentAudio`; chips sin `audio_file` no interactivos (`<div>` en vez de `<button>`, TramoChip líneas 212-222). ✓
- Un solo `HTMLAudioElement` (líneas 44,50-53), cache de object URLs por ordinal en `Map` (línea 45,73-79), revocación de **todos** en cleanup (líneas 55-60), un tramo a la vez, `ended → playing=null`, error inline no bloqueante `review.audioError` (líneas 84-85,141). ✓
- Transcripción editable sembrada de `edited || raw` (línea 37); recuento en vivo; persiste `transcription_edited` en `onBlur` solo si cambió (`persist`, líneas 94-109) y antes de navegar (`onAddSegment`/`onDistill`, 111-116); refresca `setSession`. ✓
- "Destilar" deshabilitado si vacío (`disabled={words === 0 || saving}`, línea 166) → evita el `400 NO_TRANSCRIPTION`. ✓

**Destilado (§3.2, §4.2):**
- 4 modos, **default `limpio`** (`MODES=['limpio',...]`, `initialMode` cae a `'limpio'`, Distill.tsx:16,19-21,36). Se siembra de `session.distill_mode` en reapertura. ✓
- Sheet "¿Qué es destilar?" (shadcn `Sheet`, side bottom, líneas 58-76). ✓
- Hueco "Próximamente" NO interactivo: bloque con `aria-hidden pointer-events-none select-none opacity-60` (línea 92), sin handlers ni estado; badge `distill.soon` en Ajustes y Destino/formato. ✓
- Destila al pulsar "Ver resultado" con estado `busy` (deshabilita botón + spinner `distill.distilling {{mode}}`, líneas 40-52,121-133); éxito → `setSession(r.session)` + `navigate(result, {state:{truncated}})`; error → `distill.error {{msg}}` inline y **permanece** en pantalla, reintento = volver a pulsar (no navega). ✓

**Resultado (§3.3, §4.4):**
- Prompt destilado en lectura `whitespace-pre-wrap` (línea 112); "Editar" conmuta a `<textarea>`; "Guardar" persiste `prompt_distilled` si cambió + `setSession` (líneas 63-79). ✓
- Metadatos `result.meta` = etiqueta de modo + recuento de palabras (línea 115); sin tokens/proveedor. ✓
- Aviso de truncado vía `useLocation().state?.truncated === true` (línea 33,93-100); no se muestra al reabrir sin state. ✓
- Hueco de coste "Próximamente" (`— · —`, líneas 121-133); no consume `getSessionUsage`. ✓
- "Copiar prompt" → `navigator.clipboard.writeText(text)` + toast transitorio ~1,9 s con `motion-safe` + fallback `result.copyError` (líneas 51-61,136-139). Copia el texto **actual** del editor. ✓
- "Nuevo dictado" → `reset()` + `navigate(capture)` (líneas 81-84). ✓

**i18n (§3.5):** todas las claves referenciadas por las 3 pantallas existen en `common.json`:
`review.{heading,subtitle_one/_other,transcript,words_one/_other,tramo,imported,play,pause,audioError,saveError,empty,addSegment,distill}`; `distill.{heading,whatIs,whatIsTitle,whatIsBody,modeLabel,mode.*.{label,desc},soon,settingsTitle,settings.{role,constraints,detail},futureTitle,futureHint,cta,distilling,error}`; `result.{heading,subtitle,copy,copied,copyError,edit,save,newDictation,meta,truncatedTitle,truncatedBody,cost,soon}`. Los plurales `_one/_other` con `{count}` resuelven correctamente en i18next. **Sin claves faltantes (missing key).** ✓

> Nota: `Result.tsx` reutiliza `t('review.words', …)` y `t('review.saveError', …)`. No es cross-namespace real: todo vive en el mismo namespace `common`. Ambas claves existen. Sin problema.

---

## 3. Correctitud / casos límite

- **Reglas de hooks en los wrappers con guarda:** patrón canónico seguro. `Review`/`Distill`/`Result` llaman `useActiveSession()` (único hook) **antes** del early-return; el resto de hooks vive en `*Inner`, siempre invocados. oxlint (con reglas react-hooks) pasa 0 errores. ✓
- **Fugas de object URLs:** cache en `Map` + `URL.revokeObjectURL` de todos en el cleanup del efecto `[]` (Review.tsx:54-60). `urls` se captura del ref estable. Sin fuga en remonte. ✓
- **Stale closures en efectos `[]`:** el efecto de hidratación lee `active.session` en montaje; en el flujo "Añadir tramo" la sesión ya está en contexto en el primer render (Review no la resetea), así que la lectura es correcta. El efecto de audio usa setters estables. ✓
- **`edited` vs `raw`:** se preserva la semántica heredada (edited prevalece; añadir tramos recalcula raw pero no fusiona en edited). Es el modelo existente, fuera de alcance del rediseño (SPEC §5/§7). Correcto no tocarlo. ✓
- **Doble-submit del destilado:** botón `disabled={busy}` (Distill.tsx:121); `busy` se pone `true` de forma síncrona al entrar en `onDistill`. Un segundo click tras el re-render está bloqueado; aun si dos POST se colaran, el backend last-wins (inocuo). ✓
- **Navegación/estado `truncated`:** tipado defensivo `(location.state as {truncated?:boolean}|null)?.truncated === true`. ✓
- **Errores de `getSegmentAudio`/`updateSession`/`distill`:** `getSegmentAudio` → `catch` inline `review.audioError`, resto operativo; `updateSession` → `catch` `review.saveError` y `persist` devuelve `false` (no navega, no pierde edición); `distill` → `catch` `distill.error` y permanece. ✓

### Hallazgos

**BAJA-1 — `persist()` doble (PUT redundante) al pulsar "Destilar"/"Añadir tramo".**
`web/src/routes/Review.tsx:112,115,153`. Tipo: **bug** (inocuo).
Al hacer click en un botón con el `<textarea>` enfocado, el `onBlur` dispara `void persist()` y el `onClick` dispara `await persist()`. Ninguno consulta un flag de "persist en vuelo" (el `saving` solo deshabilita botones, no gatea `persist`), y `savedRef` aún no se actualizó → se emiten **dos** `PUT /sessions/{id}` idénticos. Sin corrupción (merge idempotente, misma respuesta, la navegación espera al `persist` del click). Solo una petición de red de más, y solo cuando el texto cambió. No es regresión ni incumplimiento; anotado para constancia.

**BAJA-2 — duración `0` de un tramo se muestra como `—` en vez de `0:00`.**
`web/src/routes/Review.tsx:208`. Tipo: bug cosmético.
`seconds ? formatTime(seconds) : '—'` trata `duration_seconds === 0` como nulo. El SPEC pide `—` solo si `null`. Caso degenerado (los guards rechazan audio mudo/minúsculo, no debería haber tramos de 0 s). Impacto nulo en la práctica.

*(Observación, no hallazgo)*: el `sessionId` de telemetría es un singleton de módulo (`diagnostics.ts:28`) que no se limpia en `reset()`/`endCaptureRun`; tras "Nuevo dictado" los primeros eventos de diag de la nueva captura podrían llevar el `sessionId` viejo hasta que `commitSegment` cree la sesión y lo reasigne. Es comportamiento **preexistente de SPEC-04** (no lo introduce SPEC-05), telemetría best-effort con soft-ref. No cuenta como regresión de este cambio.

---

## 4. Verificación (ejecutada de verdad)

### 4.1 `cd web && npm run build` (tsc + vite) — ✓ VERDE

```
✓ built in 681ms
dist/assets/index-BZAKaUl8.js   650.38 kB │ gzip: 191.01 kB
PWA v1.3.0  precache 6 entries (681.56 KiB)  dist/sw.js generado
(!) Some chunks are larger than 500 kB after minification  ← warning benigno preexistente
```
tsc sin errores; vite construye. El aviso de tamaño de chunk es preexistente (no introducido por SPEC-05).

### 4.2 `cd web && npm run lint` (oxlint) — ✓ 0 ERRORES

```
warning react(only-export-components)  src/components/ui/toggle.tsx:45:18
warning react(only-export-components)  src/components/ui/button.tsx:64:18
warning react(only-export-components)  src/components/ui/badge.tsx:48:17
```
3 warnings, **todos en `components/ui/*` preexistentes** (ninguno en los ficheros de SPEC-05). Coincide con lo declarado en §8.1 del SPEC.

### 4.3 `npm test` (raíz, backend) — ✓ 14/14

```
ℹ tests 14
ℹ pass 14
ℹ fail 0
```
Sin regresión backend (esperable: no se tocó backend).

### 4.4 e2e de navegador (§8.2-§8.6) — NO EJECUTADA

**No ejecuté** la e2e de navegador (requiere levantar backend + `web` dev + BD local + stub de `getUserMedia`), según lo autorizado en el encargo. Evaluación por lectura: el código haría lo que el SPEC afirma —guardas de deep-link, edición/persistencia, reproducción de audio, hidratación de "Añadir tramo", 4 modos con default `limpio`, huecos "Próximamente", destilado con estado busy/error, copiado con fallback, aviso de truncado—. El ADDENDUM del SPEC reporta esta e2e como ejecutada en verde con el Browser integrado (con las salvedades diferidas al smoke logueado en Azure: happy-path real del LLM por red privada, copiado real al portapapeles, truncado con estado real). Coherente con lo que se lee.

---

## 5. Fuera de alcance (§7) — RESPETADO

`grep` sobre las 3 rutas + `useCapture.ts`: **no** se consumen `getPrompts`, `getSessionUsage`, `reprocess` ni `systemPrompt`. Los huecos "Ajustes"/"Destino y formato" son no funcionales (`aria-hidden pointer-events-none`, sin handlers). No hay editor de system prompt. Sin dependencias nuevas (`package.json`/`package-lock.json` no aparecen en el diff → `npm ci` reproducible, gotcha de lock no aplica). Sin cambios de backend. ✓

---

## 6. ¿El SPEC dejó algo crítico fuera? (marcado aparte, no es incumplimiento)

- **`/distill` no exige transcripción no vacía en su guarda.** La protección "Destilar deshabilitado si vacío" vive en Revisión, pero saltando por el Stepper a `/distill` con una sesión de texto vacío y pulsando "Ver resultado" se llega al `400 NO_TRANSCRIPTION`, que se muestra inline y permanece en pantalla. Es una decisión de diseño coherente (el error se queda visible), no un fallo de implementación; lo dejo señalado por si se quisiera endurecer en un ciclo futuro.

---

## 7. VEREDICTO

**SÍ — cumple el SPEC-05 y no rompe nada.**

- Regresión: **ninguna**. R1 (salvaguardas de captura) intactas; el único cambio en `useCapture.ts` es la hidratación idempotente y guardada. Backend/OpenAPI/migraciones/`public/` sin tocar. `client.ts` = fix solo de tipo sin daño colateral.
- Cumplimiento §3/§4: **completo**, sin quedarse a medias. i18n sin claves faltantes.
- Verificación: build ✓, lint 0 errores (3 warnings preexistentes) ✓, `npm test` 14/14 ✓.
- Huecos: 2 hallazgos **BAJA** cosméticos/inocuos (double-persist redundante; duración 0→`—`), **no bloqueantes**. Pendiente el smoke logueado real en Azure (happy-path del LLM, copiado real al portapapeles) que el propio SPEC difiere a §8.7, no verificable en local por la red privada de Azure OpenAI.

Recomendación: **aprobar**. Los dos BAJA pueden atenderse oportunísticamente (no exigen re-revisión). Proceder al smoke logueado en Azure antes del cierre.

---

## 8. Cierre del bucle 3↔4 (2026-07-22)

A elección del usuario, los **2 BAJA se corrigieron** en el commit `5b3de28` (`fix(web): SPEC-05 review — 2 BAJA en Review.tsx`):
- **BAJA-1**: `persist()` reusa la promesa del `PUT` en vuelo (`inFlightRef`) → sin `PUT` redundante al pulsar Destilar/Añadir tramo con el textarea enfocado.
- **BAJA-2**: el chip de tramo usa `seconds != null` → `—` solo si es `null` (00:00 para duración 0).

Re-verificado: `web` build (tsc+vite) verde + lint 0 errores; cambios frontend-only, backend intacto. **Veredicto tras el bucle: SÍ, limpio, 0 hallazgos abiertos.** Único pendiente = smoke logueado en Azure (§8.7 del SPEC), no bloqueante para el veredicto de código.
