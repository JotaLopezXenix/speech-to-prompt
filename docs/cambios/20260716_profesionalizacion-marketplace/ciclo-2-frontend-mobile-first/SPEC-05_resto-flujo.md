# SPEC-05 — Resto del flujo: Revisión · Destilado · Resultado

**Programa:** `profesionalizacion-marketplace` · **Ciclo:** 2 `frontend-mobile-first` · **Sub-ciclo:** 2b (construcción).
**Fecha:** 22-jul-2026 · **Fase JCC:** especificación.
**Fuente de verdad del porqué:** `DESIGN.md` de este ciclo (§3 alcance 2b, §5 qué se preserva) y `DESIGN-2a.md` (§3.3 flujo guiado fluido, §4 "hueco visible" destino/formato, "solo hueco" para costes). Si SPEC y DESIGN chocan, **manda el SPEC**.
**Depende de:** SPEC-01 (cimiento React/Vite/TS + design system), SPEC-02 (cliente tipado `/api/v1`), SPEC-03 (auth MSAL + devBypass), **SPEC-04** (contexto `ActiveSession`, fachadas `distill`/`getSegmentAudio`/`updateSession`, `useCapture`, Stepper y rutas del flujo).

Maquetas de referencia (Claude Design, 2a): `diseno-claude-design/{Revision,Destilado,Resultado}.dc.html`.
Comportamiento heredado a preservar: fases viejas `public/js/phases/{phase3-review-raw,phase4-distill,phase5-result}.js` (mismo contrato de backend).

---

## 1. Resumen

Construir las **tres pantallas reales** que cierran el flujo guiado tras la Captura (SPEC-04): **Revisión** (`/review`), **Destilado** (`/distill`) y **Resultado** (`/result`), reemplazando los placeholders actuales. Consumen el contexto `ActiveSession` (creado en SPEC-04) y el contrato `/api/v1` existente (`updateSession`, `distill`, `getSegmentAudio`) **sin tocar el backend**. Alcance funcional acordado (mesa común): Destilado ofrece **selección de modo** (4 modos, default `limpio`) y dispara la destilación; los controles de **destino/formato y los ajustes de formato** se dejan como **hueco visual "Próximamente"** (ciclo 4) y el **coste** como hueco "Próximamente" (ciclo 5); **no** hay editor de system prompt en el front nuevo (sigue en `/` hasta el cutover). Revisión permite **editar la transcripción** y **reproducir el audio de cada tramo** (consume `getSegmentAudio`, diferido de SPEC-04). Se añade la **hidratación de `useCapture` desde `ActiveSession`** para que "Añadir tramo" reanude la misma sesión.

---

## 2. Stack y arquitectura

Stack fijado (SPEC-01/02/03), sin novedades de tooling ni dependencias nuevas: React 19 + Vite 8 + TS 6 + Tailwind v4 (CSS-first) + shadcn + react-router 7 + oxlint; cliente tipado `openapi-fetch` (`baseUrl:/api/v1`). Se reutilizan primitivas shadcn ya presentes en `web/src/components/ui/` (`sheet`, `badge`, `button`, `toggle-group`, `switch`).

**Modelo de navegación (DESIGN-2a §3.3):** flujo guiado **fluido** — un paso en foco cada vez (`Captura → Revisión → Destilado → Resultado`) con ir/volver libre por el **Stepper** (ya montado en `AppShell`) y reapertura desde Historial (SPEC-06). Las rutas siguen **sin parámetros** (`routes/paths.ts` intacto).

**Fuente de datos entre fases:** las tres pantallas leen la sesión activa vía `useActiveSession()` (contexto `ActiveSession` de SPEC-04). Ninguna pantalla vuelve a pedir la sesión por id; operan sobre `active.session` y la **refrescan** con lo que devuelven las mutaciones (`updateSession`, `distill` devuelven la `Session` completa → `active.setSession(...)`).

**Guardas de dependencia de datos (deep-link / recarga):** el flujo es libre pero cada pantalla exige el dato mínimo para tener sentido:
- `/review` y `/distill`: si `active.sessionId == null` → `<Navigate to={PATHS.capture} replace/>`.
- `/result`: si `active.sessionId == null` → `/capture`; si hay sesión pero `!active.session?.prompt_distilled` → `<Navigate to={PATHS.distill} replace/>`.

**Regla de tokens/tema:** referenciar los tokens semánticos de `web/src/index.css` (`--primary`/pine, `--surface`, `--card`, `--muted-foreground`, `--warning`, `--success`, `--border`, `--accent`…) vía utilidades Tailwind (`text-muted-foreground`, `bg-surface`, `border-warning/40`…). **No** hardcodear los hex de las maquetas. El badge "Próximamente" del mock (ámbar `#B7791F` sobre `#FBF3E4`/`#EAD9B4`) se compone con `--warning` + opacidad o con tokens `--warning-soft`/`--warning-border` si ya existen (SPEC-04 los previó). Respetar `prefers-reduced-motion` (spinners/toast).

**Capas de archivos:**

```
web/src/routes/Review.tsx     ← pantalla real (reemplaza placeholder)   (MODIFIED)
web/src/routes/Distill.tsx    ← pantalla real (reemplaza placeholder)   (MODIFIED)
web/src/routes/Result.tsx     ← pantalla real (reemplaza placeholder)   (MODIFIED)
web/src/capture/useCapture.ts ← + hidratación desde ActiveSession        (MODIFIED)
web/src/i18n/locales/es/common.json ← claves reales review/distill/result (MODIFIED)
web/src/routes/Placeholder.tsx ← (sin cambios; deja de usarse en estas 3 rutas)
```

Subcomponentes de pantalla (tarjetas de modo, chip de tramo con play, sheet informativo, toast de copiado) viven **dentro de su fichero de ruta** salvo que resulten reutilizables; no se exige extraerlos.

---

## 3. Delta

### 3.1 MODIFIED — `web/src/routes/Review.tsx` (pantalla "Revisión")

Reemplaza el placeholder por la vista del mock `Revision.dc.html`. Estructura dentro del `<main>` del `AppShell`:

- **Guarda:** ver §2.
- **Encabezado:** título `review.heading` ("Revisa tu dictado") + subtítulo con recuento de tramos (`review.subtitle` con `{{count}} = session.segments.length`, plural i18n).
- **Chips de tramos** (fila con scroll-x): uno por `session.segments[i]`. Cada chip: check + `review.tramo {{n:i+1}}` (+ marca "importado" si `source==='imported'`) + duración `formatTime(duration_seconds)` (`—` si null). **Reproducción de audio** (§4.3): tocar un chip con `audio_file != null` reproduce/pausa su audio; indicar visualmente el chip en reproducción (icono play/pause + estado de carga). Chips sin `audio_file` no son interactivos.
- **Transcripción editable:** etiqueta `review.transcript` + metadatos (recuento de palabras; duración total opcional). `<textarea>` sembrado con `session.transcription_edited ?? session.transcription_raw ?? ''`. El recuento de palabras se recalcula en vivo. **Persistencia:** el texto editado se guarda con `api.updateSession(id, { transcription_edited })` **en `onBlur`** (solo si cambió respecto a lo persistido) **y** antes de navegar a Destilar; la respuesta refresca `active.setSession(updated)`. (Semántica heredada: `transcription_edited` prevalece sobre `transcription_raw`; ver §5.)
- **Barra de acciones (al fondo, `mt-auto`):**
  - **"Añadir tramo"** (secundario) → `navigate(PATHS.capture)`. `ActiveSession` ya contiene la sesión → `useCapture` la **hidrata** (§3.4) y sigue anexando tramos a la misma sesión.
  - **"Destilar"** (primario) → guarda `transcription_edited` si procede y `navigate(PATHS.distill)`. **Deshabilitado** si el texto quedó vacío (evita el `400 NO_TRANSCRIPTION` del backend).

### 3.2 MODIFIED — `web/src/routes/Distill.tsx` (pantalla "Destilado")

Reemplaza el placeholder por la vista del mock `Destilado.dc.html`.

- **Guarda:** ver §2.
- **Encabezado:** título `distill.heading` ("Afina tu destilado") + botón **"¿Qué es destilar?"** → abre un **Sheet** (shadcn, lateral inferior en móvil) con el contenido explicativo (`distill.whatIs.title` + `distill.whatIs.body`, texto del mock).
- **Selección de modo** (`distill.modeLabel`): 4 tarjetas (grid 2×2) — **limpio · completo · ligero · literal** —, cada una con etiqueta + microcopy corta (del mock: Limpio "Sin muletillas", Completo "Estructurado y detallado", Ligero "Breve y directo", Literal "Fiel a tus palabras") + indicador de selección. **Estado local** `mode`, sembrado de `session.distill_mode` si existe (reapertura) o **`'limpio'` por defecto** (default documentado; el `completo` que preseleccionaba el mock era del prototipo).
- **Hueco "Próximamente" (ciclo 4/5):** las secciones **"Ajustes"** (rol / restricciones / nivel de detalle) y **"Destino y formato"** del mock se renderizan **atenuadas y NO interactivas**, con badge **"Próximamente"** (`distill.soon`). Sin estado ni handlers: son anticipación visual del ciclo 4 (DESIGN-2a §4 "hueco visible"). La implementación puede compactarlas en un solo bloque; lo normativo es que **no sean funcionales**.
- **Barra de acciones (al fondo):** botón primario **"Ver resultado"** que **dispara la destilación** (§4.2). Estado **destilando** en vivo (spinner + `distill.distilling {{mode}}`); en éxito → `active.setSession(result.session)` + `navigate(PATHS.result, { state: { truncated: result.truncated } })`; en error → mensaje `distill.error {{msg}}` + permanecer en la pantalla (reintento = volver a pulsar). El botón "Regen." del mock se pliega en esta misma acción (re-destila con el modo elegido); no es un control separado obligatorio.

### 3.3 MODIFIED — `web/src/routes/Result.tsx` (pantalla "Resultado")

Reemplaza el placeholder por la vista del mock `Resultado.dc.html`.

- **Guarda:** ver §2.
- **Encabezado:** `result.heading` ("Tu prompt está listo") + `result.subtitle`.
- **Prompt destilado:** tarjeta con `active.session.prompt_distilled`. Vista de lectura (`whitespace-pre-wrap`); **"Editar"** conmuta a `<textarea>` editable; al guardar (o al salir de edición) persiste con `api.updateSession(id, { prompt_distilled })` + `active.setSession(updated)`. **Metadatos:** `result.meta` = etiqueta del modo (`session.distill_mode`) + recuento de palabras. (No se muestran tokens/proveedor: son detalle de coste, ciclo 5.)
- **Aviso de truncado (salvaguarda funcional, preservado):** si `useLocation().state?.truncated === true` → banner `result.truncated.*` ("La destilación alcanzó el límite de longitud y puede estar incompleta…"). Al reabrir la sesión más tarde (sin `state`) no se muestra: el aviso es de la destilación recién hecha.
- **Hueco de coste "Próximamente" (ciclo 5):** caja discontinua `result.cost` + badge "Próximamente" + `— · —` (no se consume `getSessionUsage`; DESIGN-2a §4).
- **Barra de acciones (al fondo):**
  - **"Copiar prompt"** (primario) → `navigator.clipboard.writeText(prompt)` + toast `result.copied` (transitorio ~1,9 s; respeta reduce-motion). Fallback `result.copyError` si el portapapeles falla.
  - **"Editar"** (secundario) → activa la edición del prompt (arriba).
  - **"Nuevo dictado"** (secundario) → `active.reset()` + `navigate(PATHS.capture)` (sesión nueva; `useCapture` monta en limpio al no haber sesión activa).

### 3.4 MODIFIED — `web/src/capture/useCapture.ts` (hidratación desde `ActiveSession`)

**Único cambio:** al montar, si ya hay una sesión activa con segmentos, **sembrar el estado del hook desde ella** para que "Añadir tramo" (Revisión → `/capture`) reanude la misma sesión en vez de crear una nueva. En el efecto de montaje (una sola vez, antes de cualquier grabación), leyendo `active.session` en ese momento:

```
if (active.session && active.session.segments?.length) {
  sessionIdRef.current = active.session.id
  setSegments(active.session.segments)
  setMergedTranscript(active.session.transcription_edited || active.session.transcription_raw || '')
  diag.setSessionId(active.session.id)
}
```

Efecto: `canFinalize` queda `true` y la vista arranca en "live layout" con los tramos existentes; grabar/importar un tramo llama a `commitSegment`, que — al ya existir `sessionIdRef.current` — **omite la creación lazy** y hace `addSegment` sobre la sesión activa. **No** se toca nada más del hook: recorder, guards, diagnostics, salvaguardas R1 y el resto de la orquestación quedan **idénticos** (regresión R1 intacta). La ruta "sesión nueva" (sin `ActiveSession`, o tras "Nuevo dictado" que hace `reset()`) sigue igual que en SPEC-04.

### 3.5 MODIFIED — `web/src/i18n/locales/es/common.json`

Reemplazar los bloques placeholder `review.*` / `distill.*` / `result.*` por las claves reales (textos exactos a fijar en implementación; **lista mínima orientativa**, autoconsistente como en SPEC-03/04):

- `review.heading`, `review.subtitle_one`/`_other` (`{{count}}` tramos), `review.transcript`, `review.words_one`/`_other`, `review.tramo` (`{{n}}`), `review.imported`, `review.addSegment`, `review.distill`, `review.empty`, `review.play`/`review.pause` (aria), `review.audioError`.
- `distill.heading`, `distill.whatIs`, `distill.whatIs.title`, `distill.whatIs.body`, `distill.modeLabel`, `distill.mode.{limpio,completo,ligero,literal}.{label,desc}`, `distill.soon`, `distill.future.title` (Destino y formato), `distill.settings.title` (Ajustes) + sus etiquetas atenuadas, `distill.cta` ("Ver resultado"), `distill.distilling` (`{{mode}}`), `distill.error` (`{{msg}}`).
- `result.heading`, `result.subtitle`, `result.copy`, `result.copied`, `result.copyError`, `result.edit`, `result.save`, `result.newDictation`, `result.meta`, `result.mode.{limpio,completo,ligero,literal}` (o reutilizar `distill.mode.*.label`), `result.truncated.title`, `result.truncated.body`, `result.cost`, `result.soon`.

Se conservan `phases.*` (etiquetas del Stepper) y `capture.*` (SPEC-04) sin cambios.

### 3.6 REMOVED

- El uso de `Placeholder` en `Review.tsx`/`Distill.tsx`/`Result.tsx` (el componente `Placeholder.tsx` permanece; lo siguen usando History/Settings hasta SPEC-06).
- Las claves i18n `review.placeholder`/`distill.placeholder`/`result.placeholder`.

Nada más se elimina. `public/` viejo, `server.js`, `openapi/`, backend, migraciones, `client.ts`, `ActiveSessionProvider`, Stepper/AppShell y todo lo de SPEC-01…04: **intactos** (salvo la hidratación de §3.4).

---

## 4. Interfaces y contratos (comportamiento a preservar)

### 4.1 Contrato de datos (backend sin cambios; ya en `openapi/speech-to-prompt.yaml`)

- `PUT /api/v1/sessions/{id}` body `SessionUpdate` (lista blanca; aquí se usan **solo** `transcription_edited` y `prompt_distilled`) → `Session`. Fusión superficial; los segmentos **no** se gestionan aquí.
- `POST /api/v1/sessions/{id}/distill` body `{ mode }` (sin `systemPrompt`) → `DistillResult { prompt_distilled, usage, truncated, session }`. El backend destila `transcription_edited || transcription_raw` con el LLM activo y persiste `prompt_distilled`, `distill_mode`, `distill_prompt_used` (el prompt por defecto de la familia/modo; el front **no** envía override). Errores relevantes: `400 NO_TRANSCRIPTION`, `400 MODEL_DISABLED`, `400 MISSING_API_KEY`, `500 LLM_FAILED`.
- `GET /api/v1/sessions/{id}/audio/{ordinal}` (`ordinal` 1-based por posición del segmento) → `audio/webm` binario. `404 AUDIO_NOT_FOUND` si el segmento no tiene audio.
- **No** se consumen en este SPEC: `getSessionUsage` (coste, ciclo 5), `getPrompts` (no hay editor de prompt), `reprocess` (rescate = Historial, SPEC-06).

Todas las llamadas usan la fachada tipada `api` de `client.ts` (SPEC-02/04) y el helper `unwrap` para ergonomía "throw".

### 4.2 Destilación (pantalla Destilado) — [preservar comportamiento de `phase4-distill.js`]

- Se dispara **al pulsar "Ver resultado"** (no al montar). Estado `busy` local: deshabilita el botón, muestra spinner + `distill.distilling`. `prefers-reduced-motion` respetado.
- `const r = await unwrap(api.distill(sessionId, { mode }))`. Éxito: `active.setSession(r.session)`; `navigate(PATHS.result, { state: { truncated: r.truncated } })`.
- Error: mostrar `distill.error {{msg}}` y **permanecer** en Destilado con el botón rearmado (reintentar = volver a pulsar); no navegar. Equivale al "Reintentar" del viejo `phase4`.
- Re-destilar: volver a Destilado (Stepper) con la sesión ya destilada, cambiar el modo y pulsar de nuevo → sobrescribe `prompt_distilled`/`distill_mode`. `mode` se siembra de `session.distill_mode` al montar.

### 4.3 Reproducción de audio por tramo (pantalla Revisión)

- Un único elemento de audio por pantalla (`HTMLAudioElement` en ref o `new Audio()`). Estado `playingOrdinal: number | null` + carga por chip.
- Al tocar el chip `i` (ordinal `i+1`), si ya suena ese ordinal → pausar; si no → `const blob = await unwrap(api.getSegmentAudio(sessionId, i+1))`, crear `URL.createObjectURL(blob)`, asignar a `audio.src`, `audio.play()`. **Cachear** el object URL por ordinal (Map) para no re-descargar; **revocar todos** los URLs en el `cleanup` del desmontaje. Solo un tramo suena a la vez (al iniciar otro, pausar el anterior).
- Al terminar (`ended`) → `playingOrdinal = null`. Error de descarga/reproducción → aviso inline no bloqueante `review.audioError`; el resto de la pantalla sigue operativo (best-effort, como las salvaguardas).

### 4.4 Edición y persistencia de texto

- **Transcripción (Revisión):** `transcription_edited` se persiste en `onBlur` del textarea (si cambió) y antes de "Destilar". La respuesta de `updateSession` refresca `active.setSession`. Semántica heredada: `transcription_edited` es un override manual; añadir tramos recalcula `transcription_raw` pero **no** fusiona automáticamente en `transcription_edited` (ver §5, comportamiento preservado del modelo de datos existente).
- **Prompt (Resultado):** `prompt_distilled` se persiste al guardar la edición; "Copiar" copia el texto **actual** del editor (editado o no).

### 4.5 Transiciones del flujo (react-router `useNavigate`)

- Captura "Finalizar" → `/review` (ya en SPEC-04, sin cambios).
- Revisión "Añadir tramo" → `/capture` (misma sesión, §3.4) · "Destilar" → `/distill`.
- Destilado "Ver resultado" → `/result` (tras destilar OK).
- Resultado "Nuevo dictado" → `active.reset()` + `/capture` (sesión nueva).
- El Stepper permite saltar entre fases; las guardas (§2) protegen los saltos sin datos.

---

## 5. Qué se PRESERVA (superficie de regresión)

**Frontend viejo (`public/`) intacto:** sigue sirviéndose en `/` sin cambios (incl. `phase3/4/5`, editor de system prompt, coste en resultado, reprocess en Historial). SPEC-05 solo modifica ficheros en `web/`.

**Backend / API / esquema intactos:** `server.js`, routers `/api/*` + alias `/api/v1`, `identity`, `openapi/speech-to-prompt.yaml`, migraciones: **no se tocan**. El contrato de sesión (`segments[]` + `transcription_raw/edited` materializados, `prompt_distilled`, `distill_mode`, `distill_prompt_used`) se **consume**, no se cambia.

**Salvaguardas de captura (criterio DURO, R1) — intactas:** la hidratación de §3.4 solo **siembra** estado de render/refs antes de grabar; no altera el recorder, `audio-guards`, `diagnostics`, la distinción parada intencional vs externa, los banners (safeguard/retry/suspect), el warm-up, la telemetría ni el aviso "sin señal". La verificación R1 de SPEC-04 debe seguir pasando.

**Flujo de 4 fases y su comportamiento (heredado de `phase3/4/5`):**
- Revisión edita el texto y persiste `transcription_edited`; el destilado usa `transcription_edited || transcription_raw`.
- Modos de destilado: `completo`/`ligero`/`literal`/`limpio`, **default `limpio`** en la UI.
- Aviso de **truncado** cuando el LLM alcanza el límite de longitud.
- Copiar al portapapeles del prompt final; edición y guardado del prompt (`prompt_distilled`).
- **Semántica `edited` vs `raw`:** `transcription_edited` prevalece; añadir tramos actualiza `raw` (no `edited`). Es el modelo existente; **no** se rediseña aquí (sería un cambio estructural de datos, fuera de alcance).

**Auth (SPEC-03) y `ActiveSession` (SPEC-04):** devBypass local; MSAL en prod; costura de token/401 de `client.ts` intacta. `ActiveSessionProvider` sin cambios (se consume `setSession`/`reset`/`sessionId`/`session`).

**Rutas y Stepper (SPEC-01/04):** `routes/paths.ts`, `AppShell`, `Stepper` sin cambios; las 3 rutas ya existen (se rellenan).

---

## 6. Migración de datos

**No aplica.** Sin cambios de esquema. Todas las columnas usadas (`transcription_edited`, `prompt_distilled`, `distill_mode`, `distill_prompt_used`, `segments`) y endpoints ya existen desde cambios previos.

---

## 7. Fuera de alcance

- **Historial y Ajustes reales** (SPEC-06). Aquí no se tocan (siguen en placeholder).
- **Editor de system prompt** en el front nuevo, y **ajustes de formato** (rol/restricciones/nivel de detalle) y **destino/formato**: son **ciclo 4** (`destilado-destino`); en SPEC-05 solo **hueco visual "Próximamente"**. `getPrompts` queda sin consumir.
- **Coste visible** (desglose STT/LLM): **ciclo 5** (`uso-y-costes`); hueco "Próximamente". `getSessionUsage` sin consumir.
- **`reprocess` (rescate):** es una acción de **Historial** (SPEC-06) en el modelo actual; no entra en Revisión.
- **Rediseño del modelo `edited` vs `raw`** (fusión automática al añadir tramos tras editar): cambio estructural de datos, fuera.
- **Backend / prompts / lógica de destilado:** sin cambios.
- **Tooling de test nuevo en `web/`** (vitest): no se introduce (verificación e2e con el navegador, como en SPEC-01…04).
- **Cutover final `/app→/`:** cierre del ciclo 2b, tras SPEC-06.

---

## 8. Verificación (extremo a extremo, incl. regresión)

### 8.1 Estático / build / lint

- `cd web && npm run build` (tsc + vite) verde; `npm run lint` (oxlint) sin errores nuevos (los 3 warnings benignos preexistentes son aceptables).
- `cd web && npm ci` reproducible. **SPEC-05 no añade deps** → el lock no cambia (gotcha del desincronizado de lock no debería aplicar; validar igualmente que `npm ci` pasa).
- **Regresión backend:** `npm test` (raíz) sigue **14/14** (no se toca backend).

### 8.2 Flujo funcional e2e (feliz) — `/app`

Backend local (devBypass) + `web` dev + BD local (`npm run migrate`). Con micro real o stub de captura (como en SPEC-04):
1. Capturar ≥1 tramo → "Finalizar" → aterriza en `/review` con la transcripción y los chips de tramos poblados desde `ActiveSession`.
2. **Editar** la transcripción → `blur` dispara `PUT /sessions/{id}` con `transcription_edited`; recargar/volver mantiene la edición.
3. **Reproducir** el audio de un tramo (tocar chip) → `GET /sessions/{id}/audio/{ordinal}` 200, suena; segundo toque pausa; iniciar otro pausa el anterior.
4. "Destilar" → `/distill`. Elegir un modo (verificar default `limpio`) → "Ver resultado" → `POST /sessions/{id}/distill` con `{mode}`; estado *destilando*; éxito → `/result` con `prompt_distilled`.
5. `/result`: metadatos (modo + palabras); **Editar** el prompt → `PUT` `prompt_distilled`; **Copiar** → portapapeles + toast; **Nuevo dictado** → `reset()` + `/capture` en limpio.

### 8.3 "Añadir tramo" reanuda la misma sesión (hidratación §3.4)

Desde `/review` de una sesión con N tramos → "Añadir tramo" → `/capture`: la vista arranca en "live layout" con los N tramos; grabar/importar 1 → **NO** se crea una sesión nueva (`POST /sessions` **no** se repite), `addSegment` va sobre el mismo `id`; "Finalizar" vuelve a `/review` con N+1 tramos. En BD: una sola sesión con N+1 segmentos.

### 8.4 Guardas de deep-link

- Navegar directo a `/app/review`, `/app/distill`, `/app/result` **sin sesión activa** (recarga dura) → redirige a `/app/capture`.
- `/app/result` con sesión sin `prompt_distilled` → redirige a `/app/distill`.

### 8.5 Errores y estados

- Destilar con transcripción vacía → el botón "Destilar" de Revisión está deshabilitado (no se llega al `400`).
- Forzar fallo del LLM (p. ej. `MODEL_DISABLED`/parar backend) → Destilado muestra el error y **permanece**; reintentar tras restaurar funciona.
- Audio de tramo inexistente (`404`) → aviso inline `review.audioError`, resto operativo.
- **Truncado:** si el LLM devuelve `truncated:true` → aviso en Resultado.

### 8.6 Render / tema / no regresión del viejo

- `/app/review|distill|result` renderizan en **claro y oscuro**, **0 errores de consola** (ojo al SW de la PWA: hard-reload/incógnito si sirve build cacheado). Hueco "Próximamente" visible y no interactivo en Destilado y Resultado.
- **Viejo (`/`):** sigue sirviendo el frontend vanilla sin cambios (fases 3/4/5, editor de prompt, coste, reprocess intactos).
- **R1 de captura (SPEC-04):** repro de parada externa / intencional / aviso "sin señal" sigue pasando (la hidratación no la altera).

### 8.7 Cierre en Azure (diferido, como en SPEC-01…04)

Tras merge y deploy: `/app/review|distill|result` sirven el build nuevo; las mutaciones golpean `/api/v1/*`. **El usuario** hace un **smoke logueado real**: capturar → revisar/editar → añadir tramo → destilar (modo `limpio`) → copiar el prompt → nuevo dictado; comprobar en móvil. La prueba de fuego del cold-start sigue siendo pendiente **de `robustez-coldstart-sql`**, no de éste.

---

## 9. Notas de implementación (no normativas)

- `Date.now()`, `setTimeout`, `crypto.*`, `URL.createObjectURL` se usan en runtime de navegador (no en workflows) — sin restricción.
- StrictMode dev doble-invoca efectos: el efecto de hidratación de `useCapture` (§3.4) y la carga de audio deben ser idempotentes (la hidratación solo siembra si `sessionIdRef.current == null`; revocar object URLs en cleanup evita fugas al remontar).
- El toast de copiado y el spinner de destilado son estados locales transitorios; respetar `prefers-reduced-motion` (sin animación de entrada si está activo).
- Las tarjetas de modo y el chip-con-play pueden apoyarse en `button`/`toggle-group`/`badge` de shadcn ya presentes; el Sheet informativo, en `components/ui/sheet.tsx`.
- El orden visual de las tarjetas de modo puede seguir el del mock (Completo/Ligero/Literal/Limpio) o poner Limpio primero; lo normativo es el **default `limpio`**, no la posición.

---

## ADDENDUM 2026-07-22 — implementación (Fase 3)

**Desviación menor sobre §2 ("client.ts intacto"): fix de tipo de la fachada `distill`.** El `requestBody` de `/sessions/{id}/distill` es **opcional** en el OpenAPI, así que el tipo que SPEC-04 dio a la fachada (`paths[...]['requestBody'] extends { content: {...} } ? B : never`) colapsaba a **`never`** (la unión `{content} | undefined` no extiende `{content}`), dejando `api.distill(id, { mode })` **incallable**. Era un bug latente (la fachada nunca se había invocado). Se corrigió tipándola directo con el schema: `body?: components['schemas']['DistillRequest']` (+ import de `components`). Es un fix técnico reversible, sin cambio de contrato ni de comportamiento; se sube aquí para no mentir el rastro (§coherencia del `/jcc-implement`).

**Resultado de la verificación (§8) — local, con evidencia real:**
- **Estático:** `web` build (tsc+vite) ✓, lint (0 nuevos; 3 warnings preexistentes) ✓, `npm test` raíz **14/14** ✓.
- **e2e (Browser integrado, devBypass + BD local, stub de `getUserMedia` con tono sintético):** guardas de deep-link (3/3 redirigen a `/capture`) ✓; captura→revisión (tramo transcrito, "Finalizar") ✓; Revisión (subtítulo plural, chips, recuento, **edición + `PUT transcription_edited`**, **reproducción `GET /audio/1`**) ✓; **"Añadir tramo" reanuda la misma sesión** (1 `POST /sessions` + 2 `POST /segments`, sin duplicar) ✓; Destilado (4 modos, **default `limpio`**, huecos "Próximamente") ✓; **camino de error del LLM** (Azure OpenAI 403 *public access disabled* desde local → error inline, permanece en `/distill`, reintento) ✓; Resultado (render del prompt, meta "Limpio · N palabras", hueco de coste, **Editar + `PUT prompt_distilled`**, **Nuevo dictado → `reset` + `/capture`**) ✓; dark mode (tokens oscuros aplican) ✓; **0 errores de consola**; **no-regresión del viejo en `/`** (200, ES modules) ✓.
- **Diferido al smoke logueado en Azure (§8.7), no verificable en local:** (a) **happy-path real del destilado** — el endpoint de Azure OpenAI es de **red privada**, inalcanzable desde local (para verificar Resultado se sembró `prompt_distilled` por el backend real y se refrescó `ActiveSession`); (b) **copiado real al portapapeles + toast** — la Clipboard API está bloqueada en el pane automatizado (se verificó que el handler corre y renderiza el fallback de error); (c) **aviso de truncado con estado real** de la destilación (condicional trivial, verificado por construcción); (d) capturas visuales (el pane no compositaba frames).
