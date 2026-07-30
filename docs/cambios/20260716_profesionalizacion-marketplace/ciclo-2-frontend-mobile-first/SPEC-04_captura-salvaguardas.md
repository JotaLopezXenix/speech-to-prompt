# SPEC-04 — Captura + salvaguardas (R1)

**Programa:** `profesionalizacion-marketplace` · **Ciclo:** 2 `frontend-mobile-first` · **Sub-ciclo:** 2b (construcción).
**Fecha:** 21-jul-2026 · **Fase JCC:** especificación.
**Fuente de verdad del porqué:** `DESIGN.md` de este ciclo (§4.4 cosechar, §5 salvaguardas, §6 R1) y `../DESIGN.md` del programa (§5.6, §6). Si SPEC y DESIGN chocan, **manda el SPEC**.
**Depende de:** SPEC-01 (cimiento React/Vite/TS + design system), SPEC-02 (cliente tipado `/api/v1`), SPEC-03 (auth MSAL + devBypass). Es el **hueso del ciclo** (R1: re-expresar las salvaguardas sin perder comportamiento).

Comportamiento heredado (contratos que se preservan al pie de la letra): cambios previos
`docs/cambios/20260628_grabacion-stop-espontaneo/` (telemetría + salvaguarda de stop externo) y
`docs/cambios/20260710_robustez-coldstart-sql/` (warm-up de BD + banner Reintentar).

---

## 1. Resumen

Portar el flujo de **captura multi-segmento** del frontend viejo (`public/js/{audio-recorder,audio-guards,diagnostics}.js` + orquestación en `public/js/phases/phase1-capture.js`) al frontend nuevo en `web/` (React + TS), construyendo la pantalla de Captura del diseño 2a (estados Listo / Grabando / Transcribiendo / Salvaguarda) y **re-expresando** las salvaguardas de captura **preservando su comportamiento**: no perder audio ante corte externo (banner Guardar/Descartar), warm-up de BD, banner Reintentar, telemetría `diagnostic_events`, y **cero falsos positivos** en parada intencional. Se añade la mitigación acordada contra "speech no grabado por micro inactivo" (aviso de sonido en vivo universal + selector/medidor solo en escritorio). Cierra el diferido de SPEC-02: fachadas tipadas `addSegment` (multipart) y `getSegmentAudio` (binario) en `web/src/api/client.ts`.

---

## 2. Stack y arquitectura

Stack fijado (SPEC-01/02/03), sin novedades de tooling: React 19 + Vite 8 + TS 6 + Tailwind v4 (CSS-first) + shadcn + react-router 7 + oxlint; cliente tipado `openapi-fetch` (`baseUrl:/api/v1`).

**Principio de porte (DESIGN §4.4):** los **módulos hoja** (recorder, guards, diagnostics) son **lógica de navegador agnóstica de UI** → se portan **verbatim** a TS (misma forma, mismos nombres, mismos umbrales, mismos efectos); solo se añaden tipos. La **orquestación** (hoy incrustada en `phase1-capture.js`) se **re-expresa** como un hook React `useCapture()`, siendo `Capture.tsx` una vista fina.

**Encaje en el flujo guiado:** la sesión activa se comparte entre fases mediante un **contexto React `ActiveSession`** (decisión de mesa común), que Captura crea/actualiza y que Revisión/Resultado (SPEC-05) e Historial (SPEC-06) consumirán. Las rutas siguen **sin parámetros** (como `routes/paths.ts` actual).

**Capas de arquitectura:**

```
web/src/capture/
  audio-recorder.ts   ← port verbatim de audio-recorder.js (clase AudioRecorder, formatTime)
  audio-guards.ts     ← port verbatim de audio-guards.js (checkAudio + constantes)
  diagnostics.ts      ← port verbatim de diagnostics.js (singleton de telemetría)
  mic-meter.ts        ← extrae la lógica de analyser/RMS de phase1-capture.js (MicMeter)
  events.ts           ← nombres de evento de telemetría como constantes tipadas
  useCapture.ts       ← re-expresión de la orquestación de phase1-capture.js (el hook R1)
web/src/session/
  ActiveSessionProvider.tsx  ← contexto { sessionId, session } + useActiveSession()
web/src/routes/Capture.tsx   ← vista (reemplaza el placeholder actual)
web/src/api/client.ts        ← + fachadas addSegment / getSegmentAudio (MODIFIED)
```

**Regla de tokens/tema:** referenciar los tokens semánticos ya existentes en `web/src/index.css` (`--primary`/pine, `--accent`, `--surface`, `--surface-elevated`, `--success`, `--warning`, `--error`, `--muted-foreground`, `--border`) vía utilidades Tailwind (`text-warning`, `bg-surface`, …). **No** hardcodear los hex del snapshot de diseño. Si el banner ámbar necesita el fondo/borde suaves del mock (`#FBF3E4`/`#EAD9B4`), añadir tokens `--warning-soft`/`--warning-border` (claro+oscuro) en `index.css`; en caso contrario, componer con `--warning` + opacidad. Respetar `prefers-reduced-motion` (ya hay precedente en el design system) para waveform/anillos/spinners.

---

## 3. Delta

### 3.1 ADDED — `web/src/capture/audio-recorder.ts`

Port **verbatim** de `public/js/audio-recorder.js`, tipado. Preserva línea a línea:

- `class AudioRecorder` con campos: `mediaRecorder`, `stream`, `chunks: Blob[]`, `startTime`, `_elapsedBeforePause = 0`, `_timerInterval`, `onTimeUpdate?: (s:number)=>void`, `onDiag?: (type:string, payload?:unknown)=>void`, `onExternalStop?: (blob:Blob, meta:ExternalStopMeta)=>void`, `_intentionalStop = false`, `_stopResolve?: (b:Blob|null)=>void`.
- `async start(deviceId: string|null = null): Promise<void>` — `getUserMedia({ audio: deviceId ? {deviceId:{exact:deviceId}} : true })`; MIME preferido `audio/webm;codecs=opus` → `audio/webm` → `audio/ogg;codecs=opus`; `new MediaRecorder(stream,{ mimeType, audioBitsPerSecond: 32000 })`; resetea `chunks/_elapsedBeforePause/startTime/_intentionalStop`; `ondataavailable` empuja `e.data` si `size>0`; **un solo `onstop` persistente** (ver §4.2); `onerror` → `onDiag('recorder_error', {name,message})`; por cada `stream.getAudioTracks()`: `onended`→`track_ended`, `onmute`→`track_muted`, `onunmute`→`track_unmuted`; `mediaRecorder.start(250)` (timeslice 250 ms); `onDiag('recorder_started',{mimeType})`; timer `setInterval(1000)` que llama `onTimeUpdate(_elapsedBeforePause + floor((now-startTime)/1000))` **solo si `onTimeUpdate` y `!isPaused`**.
- `pause()` — no-op salvo `state==='recording'`; acumula `_elapsedBeforePause += floor((now-startTime)/1000)` y `mediaRecorder.pause()`.
- `resume()` — no-op salvo `state==='paused'`; `startTime = Date.now()` y `resume()`.
- `stop(): Promise<Blob|null>` — si `!mediaRecorder || state==='inactive'` → `resolve(null)`; si no, `_intentionalStop=true; _stopResolve=resolve; mediaRecorder.stop()`.
- `_cleanup()` — `clearInterval`; para tracks y anula `stream`; **no** toca `startTime`/`_elapsedBeforePause`.
- `get isRecording` (`state==='recording'`), `get isPaused` (`state==='paused'`).
- `getElapsedSeconds()` — `0` si `!startTime`; **si `isPaused` → `_elapsedBeforePause`** (fix del doble-conteo, [preservar]); si no, `_elapsedBeforePause + floor((now-startTime)/1000)`.
- `export function formatTime(seconds): string` → `"MM:SS"`.

Tipo `ExternalStopMeta = { elapsedSeconds:number; chunkCount:number; totalBytes:number; visibilityState:DocumentVisibilityState }`.

### 3.2 ADDED — `web/src/capture/audio-guards.ts`

Port verbatim de `public/js/audio-guards.js`:
- `export const MIN_BYTES_PER_SECOND = 2000`
- `export const MAX_SAFE_BYTES = 24 * 1024 * 1024`
- `export function checkAudio(sizeBytes:number, seconds:number): { level:'ok'|'silent'|'oversize'; message:string|null }` — `secs=max(1,seconds||0)`; `bps=sizeBytes/secs`; **silent antes que oversize**; mensajes idénticos (interpolan KB/secs/bps/umbral). Puro, sin efectos.

### 3.3 ADDED — `web/src/capture/diagnostics.ts`

Port verbatim de `public/js/diagnostics.js` como **singleton de módulo** (estado a nivel de módulo, igual que el viejo). Preserva:
- Constantes: `FLUSH_AT = 50`, `BUFFER_CAP = 500`, `MAX_BATCH = 100`, `SUSPICIOUS = new Set(['recorder_stop_external','recorder_error','track_ended','mediasession_action'])`.
- Estado: `captureRunId`, `seq=0`, `sessionId`, `buffer`, `runActive=false`, `flushing=false`.
- `isSuspicious(type,payload)` — `SUSPICIOUS.has(type)` **o** (`type==='record_button_activated' && payload.isTrusted===false`).
- `startCaptureRun(meta?)` → `crypto.randomUUID()` (fallback `run-${…}`), resetea `seq=0`, `runActive=true`, devuelve el id.
- `endCaptureRun()` → `runActive=false; flush()` (sin await).
- `setSessionId(id)` → `sessionId = id==null ? null : Number(id)`.
- `logEvent(type,payload={})` → si `!captureRunId` llama `startCaptureRun()`; empuja `{captureRunId, seq:seq++, type, payload, clientTs:new Date().toISOString(), sessionId}`; recorta a `BUFFER_CAP`; si `isSuspicious || buffer.length>=FLUSH_AT` → `flush()` (sin await).
- `flush()` — guarda `flushing || buffer vacío` → return; bucle troceando `MAX_BATCH=100`/POST **reclamando el lote antes del await**; en error `buffer = batch.concat(buffer)` + recorte + `break`; `finally flushing=false`; nunca lanza. Usa el cliente tipado (§3.7): `await api.postDiagnostics(batch)`.
- `flushBeacon()` — POST `keepalive` **único** a `/api/v1/diagnostics`. **DELTA sobre el viejo:** enviar como máximo los **últimos 200** eventos (`slice(-200)`) para no provocar un 413 garantizado en buffers grandes al descargar (mejora trivial de telemetría, no toca R1; ver §7). Best-effort (`.catch(()=>{})`). Adjunta `Authorization` si hay token sincrónicamente disponible (ver §4.7); si no, se envía sin token (best-effort, como el viejo).
- Listeners de módulo (guardados por `typeof window!=='undefined'`, registrados una vez): `pagehide`→`flushBeacon`; `visibilitychange`→ si `runActive` `logEvent('visibility_change',{visibilityState})`, y si `hidden` `flushBeacon()`.

Se exporta un objeto `diag` con `startCaptureRun/endCaptureRun/setSessionId/logEvent/flush/flushBeacon`.

### 3.4 ADDED — `web/src/capture/mic-meter.ts`

Extrae la lógica de analyser/RMS hoy en `startPreview/attachMeterToStream` de `phase1-capture.js`, como clase agnóstica de UI:
- `class MicMeter { start(stream: MediaStream): void; stop(): void; onLevel?: (rms:number)=>void; get peakSinceReset(): number; resetPeak(): void }`
- Internamente: `AudioContext` + `AnalyserNode` (`fftSize=512`), bucle `requestAnimationFrame` que calcula RMS del dominio temporal (misma fórmula que el viejo), actualiza `peakSinceReset = max(peak, rms)` y llama `onLevel(rms)`. `stop()` cancela el RAF, cierra el `AudioContext` y para tracks propios (si abrió uno para preview).
- Dos usos: (a) **preview pre-grabación** en escritorio (abre su propio `getUserMedia(deviceId)`), (b) **medición en vivo** durante la grabación (recibe `recorder.stream`, no abre stream propio).

### 3.5 ADDED — `web/src/capture/events.ts`

Constantes tipadas de los nombres de evento (inventario cerrado, para que la telemetría no dependa de literales sueltos):

```
recorder_started, recorder_stop_external, recorder_error, track_ended, track_muted, track_unmuted,
record_button_activated, capture_started, chunks_preserved,
recovered_segment_kept, recovered_segment_discarded, recovered_segment_empty,
upload_retry, upload_retry_discarded, mediasession_action, visibility_change
```

(Todos preservados del viejo; **no se inventan nuevos tipos** — el aviso de "sin señal" es UI, no telemetría nueva.)

### 3.6 ADDED — `web/src/session/ActiveSessionProvider.tsx`

Contexto React de la sesión activa del flujo:
- `type ActiveSession = { sessionId: number|null; session: Session|null }` (`Session` = tipo generado del OpenAPI, `paths`/`components['schemas']['Session']`).
- `useActiveSession()` → `{ sessionId, session, setSession(s:Session):void, reset():void }`. `setSession` fija `session` y deriva `sessionId=s.id`.
- Se monta **dentro de `RequireAuth`**, envolviendo `AppShell`/`<Outlet/>`, para que todas las fases lo lean. No persiste (memoria de la SPA); Historial (SPEC-06) lo rellenará al reabrir.

### 3.7 MODIFIED — `web/src/api/client.ts`

Añadir al objeto `api` (cierra el diferido de SPEC-02; los tipos ya existen en `schema.d.ts`):

```ts
// Añadir un segmento (multipart). openapi-fetch: bodySerializer construye el FormData.
addSegment: (
  id: number,
  audio: Blob,
  { source = 'recorded', filename = 'audio.webm' }:
    { source?: 'recorded' | 'imported'; filename?: string } = {},
) =>
  client.POST('/sessions/{id}/segments', {
    params: { path: { id } },
    body: { audio: audio as unknown as string, source },
    bodySerializer: (body: { audio: unknown; source?: string }) => {
      const fd = new FormData()
      fd.append('audio', audio, filename)
      if (body.source) fd.append('source', body.source)
      return fd
    },
  }),

// Descargar el audio de un segmento (binario). Se cablea aquí; se consume en SPEC-05.
getSegmentAudio: (id: number, ordinal: number) =>
  client.GET('/sessions/{id}/audio/{ordinal}', {
    params: { path: { id, ordinal } },
    parseAs: 'blob',
  }),
```

`warmup`, `createSession`, `postDiagnostics`, `distill`, `reprocess` **ya existen** — se reutilizan sin cambios.

### 3.8 ADDED (reemplaza placeholder) — `web/src/routes/Capture.tsx`

Vista fina que consume `useCapture()` y pinta el diseño 2a. Reemplaza el placeholder actual (que solo sondeaba `healthDb`). Layout dentro del `<main flex-1>` de `AppShell`: columna flex a altura completa; contenido central (transcripción + tramos) con scroll propio; **barra de controles al fondo** (`mt-auto`) alcanzable en móvil.

Estados (mapa a `useCapture()`):
- **Listo** (idle, 0 segmentos): héroe «¿Qué tienes en mente?» + subtítulo + botón grande "Pulsa para dictar". En **escritorio** (viewport `md`+): además selector de micro + medidor pre-grabación (§4.6).
- **Live layout** (grabando, o busy, o ≥1 segmento): timer (mono), waveform en vivo (§4.5), panel de Transcripción (texto = `mergedTranscript`) con pie "N tramos" y línea de estado (escuchando / transcribiendo), fila de chips de Tramos, y la barra de controles (Pausar · botón principal Grabar/Detener/spinner · Finalizar).
- **Salvaguarda** (stop externo): banner ámbar Guardar/Descartar (§4.3) dentro del live layout.
- **Reintentar** (fallo de subida): banner Reintentar/Descartar (§4.4).
- **Sin señal** (grabando y sin pico ≥ umbral tras ~3 s): aviso inline no bloqueante (§4.6).

### 3.9 MODIFIED — `web/src/main.tsx` (o donde se compongan los providers)

Envolver el árbol con `<ActiveSessionProvider>` dentro de `RequireAuth`/`AppShell` según §3.6. (Si el orden actual de providers lo hace más simple envolver en `App.tsx`, aceptable siempre que quede **bajo** la puerta de auth.)

### 3.10 MODIFIED — `web/src/i18n/locales/es/common.json`

Reemplazar el bloque `capture.*` placeholder por las claves reales (textos exactos a fijar en implementación; lista mínima): `capture.hero.title`, `capture.hero.subtitle`, `capture.cta.start` ("Pulsa para dictar"), `capture.record`, `capture.stop`, `capture.pause`, `capture.resume`, `capture.finalize`, `capture.import`, `capture.transcribing`, `capture.listening`, `capture.segments_count`, `capture.mic.select`, `capture.mic.detected`, `capture.mic.noSignalPreview`, `capture.warn.noSignalLive`, `capture.guard.suspect.*` (heading + Enviar igualmente/Descartar), `capture.safeguard.*` (heading + Guardar tramo/Descartar), `capture.retry.*` (heading + Reintentar/Descartar), `capture.error.mic`, `capture.error.start`. (Nombres orientativos; que sean autoconsistentes, como en SPEC-03.)

### 3.11 REMOVED

- El cuerpo placeholder de `Capture.tsx` (sondeo `healthDb` + textos "en construcción"). El `healthDb`/`warmup` sigue disponible en `client.ts`; el warm-up real ahora lo dispara `useCapture` (§4.1).
- Claves i18n `capture.placeholder`/`capture.subtitle` placeholder (sustituidas).

Nada más se elimina. `public/` viejo, `server.js`, `openapi/`, backend, migraciones: **intactos**.

---

## 4. Interfaces y contratos (comportamiento a preservar)

### 4.1 `useCapture()` — la orquestación (re-expresión de `phase1-capture.js`)

Firma: `useCapture(): CaptureState & CaptureActions`.

Estado interno (equivalente al closure del viejo; el recorder vive en un `useRef`, no en `useState`):
- `recorderRef` (instancia única `AudioRecorder`, creada una vez), `sessionId` (lazy), `segments: Segment[]`, `mergedTranscript: string`, `busy: boolean`, `pendingRetry: {blob:Blob; opts:CommitOpts} | null` (**slot único**), `banner: null | {kind:'suspect'|'safeguard'|'retry'; message}` (los tres banners comparten "canal", como el `warnBox` viejo), `elapsed: number` (para el timer), `liveLevel: number` + `noSignal: boolean`, `selectedDeviceId: string` (localStorage `stp.preferredMicId`).

Cableado inicial (efecto de montaje, **una sola vez**):
- `recorder.onTimeUpdate = (s)=> setElapsed(s)`.
- `recorder.onDiag = (type,payload)=> diag.logEvent(type,payload)`.
- `recorder.onExternalStop = handleExternalStop`.
- **`api.warmup()` al montar** (fire-and-forget) [preservar].
- En **dev** (`import.meta.env.DEV`): `window.__stpCapture = { recorder, diag }` (semilla de prueba, §8.2).
- Cleanup: parar recorder/meter/preview; quitar el seam dev.

Acciones expuestas: `toggleRecord()`, `pauseResume()`, `finalize()`, `importFile(file)`, `setDevice(id)`, banner resolvers (`keepSafeguard/discardSafeguard`, `sendSuspect/discardSuspect`, `retryUpload/discardRetry`).

**`toggleRecord()`** (equivale al handler de `btnRecord`):
1. Siempre primero: `diag.logEvent('record_button_activated', { isTrusted, detail, pointerType, viaKeyboard: detail===0, activeElement, recorderState })`. En React el `onClick` recibe el `React.MouseEvent`; usar `e.nativeEvent` para `isTrusted/detail/pointerType`. [preservar la instrumentación H1]
2. Si `busy` → return.
3. **Rama parar** (`isRecording||isPaused`): `seconds = recorder.getElapsedSeconds()` (antes de parar); `blob = await recorder.stop()`; `stopMediaSessionProbe()`; parar la medición en vivo; si `blob && blob.size>0` → `await commitSegment(blob,{source:'recorded',seconds})`; si no → refrescar UI + reanudar preview (escritorio). Luego `diag.endCaptureRun()`.
4. **Rama empezar** (else): **`api.warmup()`** (2º warm-up, al pulsar Grabar) [preservar]; parar preview; `diag.startCaptureRun()`; `diag.logEvent('capture_started',{deviceId, userAgent, visibilityState})`; `try { await recorder.start(selectedDeviceId||null); startMediaSessionProbe(); iniciar medición en vivo sobre recorder.stream (resetPeak, armar el aviso "sin señal"); } catch { diag.endCaptureRun(); showError(NotAllowedError → mensaje de permiso, else genérico); reanudar preview }`.

**`commitSegment(blob, opts)`** (async; `opts = { source='recorded', seconds=0, filename='audio.webm', skipGuard=false }`):
1. Ocultar error/banner de error.
2. **Guard** solo si `source==='recorded' && !skipGuard`: `v = checkAudio(blob.size, seconds)`; si `v.level!=='ok'` → mostrar banner **suspect** y esperar decisión; si "Descartar" → refrescar UI y **return** (no sube). [preservar]
3. `busy=true`; estado "Transcribiendo"; parar preview.
4. `try`: **creación lazy de sesión** — si `!sessionId` → `res=await api.createSession(); sessionId=res.data.id; setActiveSession(res.data); diag.setSessionId(sessionId)`; luego `r = await api.addSegment(sessionId, blob, {source, filename})`; `segments = r.data.session.segments ?? segments`; `mergedTranscript = r.data.transcription_raw ?? mergedTranscript`; `setActiveSession(r.data.session)`; `clearRetry()`.
5. `catch(err)`: `pendingRetry={blob,opts}`; mostrar banner **retry** con el mensaje. [audio retenido, NO se pierde]
6. `finally`: `busy=false`; ocultar "Transcribiendo"; refrescar UI; reanudar preview (escritorio).

Nota: **no se envía duración** al backend (la deriva el servidor); `seconds` solo alimenta el guard. [preservar]

**`importFile(file)`** — `await commitSegment(file, { source:'imported', filename:file.name||'import.webm' })`. Los importados **no** pasan el guard (`source!=='recorded'`). [preservar]

**`finalize()`** — si `segments.length===0 || !sessionId` → no-op; si no, parar preview y **navegar a `/review`** (react-router `useNavigate`). `ActiveSession` ya está poblado.

**`pauseResume()`** — `isRecording→recorder.pause()`; `isPaused→recorder.resume()`; refrescar UI (timer congela por `getElapsedSeconds`). [preservar]

### 4.2 Contrato `onstop` (intencional vs externo) — [CRÍTICO, preservar]

Un solo `onstop` persistente. Construye `blob = new Blob(chunks,{type:mimeType})` y `meta` **antes** de `_cleanup()`. Ramifica por `_intentionalStop`:
- **intencional** (`true`): `_cleanup()`; `resolve = _stopResolve; _stopResolve=null; resolve?.(blob)`. **No** dispara `onDiag`/`onExternalStop`. → resuelve la promesa de `stop()`.
- **externo** (`false`): `onDiag('recorder_stop_external', meta)`; `_cleanup()`; `onExternalStop(blob, meta)`.

La distinción descansa **solo** en `_intentionalStop`, puesto **solo** dentro de `stop()`. Cualquier parada iniciada por el navegador (track muerto, error, suspensión) deja el flag en `false` y va a la rama externa. **Esto es lo que evita el falso positivo** y **lo que recupera el audio** (el `blob` se construye de `chunks`, que aún tiene el audio del último `ondataavailable`, antes de que un futuro `start()` haga `chunks=[]`).

### 4.3 Salvaguarda de stop externo — `handleExternalStop(blob, meta)` — [CRÍTICO, preservar]

Async, cableado a `recorder.onExternalStop`. Solo dispara cuando el recorder para sin `stop()`:
1. `stopMediaSessionProbe()`.
2. `diag.logEvent('chunks_preserved', { chunkCount: meta.chunkCount, totalBytes: meta.totalBytes })`.
3. Refrescar UI (el recorder ya está inactivo → **descongela** botón/timer).
4. Si `blob && blob.size>0`: mostrar banner **safeguard** («La grabación se detuvo. ¿Guardar este tramo o descartarlo?») y esperar: **Guardar** → `diag.logEvent('recovered_segment_kept',{totalBytes})` + `await commitSegment(blob,{source:'recorded', seconds: meta.elapsedSeconds||0, skipGuard:true})`; **Descartar** → `diag.logEvent('recovered_segment_discarded',{})` + refrescar UI + reanudar preview.
5. Si blob vacío: `diag.logEvent('recovered_segment_empty',{})` + refrescar UI + reanudar preview.
6. Siempre al final: `diag.endCaptureRun()`.

### 4.4 Banner Reintentar (slot único, no idempotente) — [preservar; trade-off A2]

- `pendingRetry` es **un solo slot**; un 2º fallo consecutivo sobrescribe el blob retenido; un éxito en cualquier punto llama `clearRetry()`.
- `retryUpload()` — si `!pendingRetry` return; `diag.logEvent('upload_retry',{totalBytes: blob?.size ?? 0})`; `await commitSegment(blob,{...opts, skipGuard:true})` (**fuerza `skipGuard`** para no re-disparar el guard).
- `discardRetry()` — `diag.logEvent('upload_retry_discarded',{})`; `clearRetry()`; refrescar UI.
- **A2 (preservar, NO arreglar aquí):** el Reintentar **no es idempotente** — en la ventana estrecha "el POST commiteó pero se perdió la respuesta", reintentar puede duplicar un segmento u orfanar una sesión. Trade-off **aceptado** ("no perder audio" > "duplicado raro"). La idempotencia real (id de intento cliente + dedup en `addSegment` con migración) es **estructural y queda fuera** (cambio futuro de robustez; ver §7).

### 4.5 Waveform en vivo

Durante la grabación, el waveform del diseño se **cablea a niveles reales** del micro vía `MicMeter` sobre `recorder.stream` (sustituye la animación semilla del mock). Contrato mínimo: las barras reflejan el nivel reciente; en pausa/idle, estado plano. Respeta `prefers-reduced-motion`. (Detalle de mapeo de barras libre en implementación.)

### 4.6 Mitigación "speech no grabado por micro inactivo/erróneo" — defensa en capas (decisión de mesa común)

1. **Aviso de sonido EN VIVO (todas las plataformas):** al empezar a grabar, `MicMeter.resetPeak()` y armar un temporizador `SILENCE_ARM_MS = 3000`. Si transcurrido ese tiempo `peakSinceReset < PEAK_MIN (0.01)` → `noSignal=true` → aviso inline **no bloqueante** «No se detecta sonido del micrófono. Comprueba que el micro correcto esté activo.» La grabación **continúa**. En cuanto `peakSinceReset >= PEAK_MIN` en cualquier momento → `signalDetected` latcheado → el aviso **no reaparece** (inmune a pausas naturales del habla). No emite telemetría nueva (es UI). Umbrales reutilizados del preview viejo.
2. **Selector de micro + medidor pre-grabación SOLO en escritorio** (`matchMedia('(min-width: 768px)')`, el breakpoint `md`): en Listo, `populateDeviceList()` (enumerar `audioinput`, poblar select, persistir `selectedDeviceId` en `localStorage['stp.preferredMicId']`) + preview con `MicMeter` propio y heurística de detección ("Sin señal…"/"Micrófono detectado ✓"). En **móvil** (`<768px`) estos controles **no se renderizan** (micro único; pantalla limpia del diseño); `selectedDeviceId` queda por defecto (`''` = micro del sistema).
3. **Guard de audio mudo post-grabación** (`checkAudio`, §4.1 paso 2) — se conserva como último filtro.
4. **Importar** — control secundario siempre disponible (§4.1 `importFile`).

### 4.7 Telemetría — endpoint y auth

- Flush con vida: `diag.flush()` usa `api.postDiagnostics(batch)` (cliente tipado → `/api/v1/diagnostics`, token vía middleware de `client.ts`). Contrato de lote: ≤200 ev/POST server-side, pero el cliente trocea a `MAX_BATCH=100`. Best-effort: un fallo **nunca** rompe la grabación.
- Beacon (`pagehide`/`hidden`): `flushBeacon()` hace **un** POST `keepalive` a `/api/v1/diagnostics` con los **últimos ≤200** eventos. Para adjuntar `Authorization` sin `await` en descarga: el `AuthProvider`/costura de token cachea de forma **síncrona** el último token conocido (p.ej. `getCachedToken(): string|null`) que `flushBeacon` lee; si no hay, se envía sin token (best-effort, como el viejo). En **devBypass** no hay token (el backend acepta al usuario dev). *(Cache síncrono = pequeña adición a la costura de auth de SPEC-03; no cambia el flujo interactivo.)*

### 4.8 Media Session probe — [preservar]

`startMediaSessionProbe()`: si `navigator.mediaSession?.setActionHandler`, registra `['play','pause','stop']` → cada uno `diag.logEvent('mediasession_action',{action})` (solo-log, sin cambiar comportamiento), con try/catch por acción. `stopMediaSessionProbe()`: pone los tres a `null`. Se registra al empezar a grabar, se limpia en parada intencional y al inicio de `handleExternalStop`.

### 4.9 Ciclo de vida del capture-run (resumen, preservar)

- `diag.startCaptureRun()` — rama empezar de `toggleRecord` (implícito también en `logEvent` si no hay run).
- `diag.endCaptureRun()` — rama parar de `toggleRecord`, **catch del fallo de `start()`** (evita `visibility_change` huérfano), y final de `handleExternalStop`.
- `diag.setSessionId(id)` — solo tras la creación lazy en `commitSegment`.

### 4.10 Contrato de datos (sin cambios de backend)

- `POST /api/v1/sessions` → `{ data: Session }` (creación lazy).
- `POST /api/v1/sessions/{id}/segments` (multipart `audio` + `source`) → `{ data: AddSegmentResult { segment, transcription_raw, session } }`.
- `GET /api/v1/health/db` — warm-up (fire-and-forget).
- `POST /api/v1/diagnostics` (`{events}`) — telemetría best-effort.
- `GET /api/v1/sessions/{id}/audio/{ordinal}` — fachada añadida, **consumida en SPEC-05**.

---

## 5. Qué se PRESERVA (superficie de regresión)

**Frontend viejo (`public/`) intacto:** sigue sirviéndose en `/` sin cambios (incl. `phase1-capture.js`, `audio-recorder.js`, `auth.js`). SPEC-04 solo añade/cambia ficheros en `web/` (+ `client.ts`).

**Backend / API / esquema intactos:** `server.js`, routers `/api/*` + alias `/api/v1`, `identity`, `openapi/speech-to-prompt.yaml`, migraciones (incl. `005_diagnostics.sql`) y `dbo.diagnostic_events`: **no se tocan**. El contrato de sesión (`segments[]` + `transcription_raw/edited` materializados) se consume, no se cambia.

**Comportamiento de captura (criterio DURO, R1) — se re-expresa preservando:**
- Distinción parada intencional vs externa vía `_intentionalStop`; **cero falsos positivos** en parada intencional (no dispara salvaguarda).
- Recuperación del blob ante stop externo **sin pérdida de audio** (blob de `chunks` antes de cualquier `start()`), con banner Guardar/Descartar.
- Warm-up de BD fire-and-forget al montar la captura y al pulsar Grabar.
- Banner Reintentar (slot único) que retiene el blob ante fallo de subida; **no idempotente (A2 aceptado)**.
- Guard de audio mudo/oversize (`checkAudio`) en la ruta grabada no-skip.
- Telemetría `diagnostic_events`: nombres de evento exactos, `seq` monotónico por run, batching (`MAX_BATCH=100` con vida; `flushing` anti-concurrencia; beacon `keepalive`), suspicious-flush, listeners `pagehide`/`visibilitychange`, best-effort (nunca rompe la grabación).
- Fix del doble-conteo del cronómetro en pausa (`getElapsedSeconds`).
- Contrato `stop(): Promise<Blob|null>`.
- Instrumentación H1 del botón (`record_button_activated` con `isTrusted/viaKeyboard/…`) y Media Session probe (log-only).
- Persistencia de micro preferido (`stp.preferredMicId`) **en escritorio**.

**Flujo multi-segmento:** grabar/importar un segmento, transcripción inline por segmento, transcripción unificada corriente, avanzar a Revisión con la sesión creada. Creación lazy de sesión en el primer segmento commiteado.

**Auth (SPEC-03):** devBypass local; MSAL en prod; costura de token/401 de `client.ts` intacta (se añade solo un cache síncrono de token para el beacon, sin tocar el flujo interactivo).

---

## 6. Migración de datos

**No aplica.** No hay cambios de esquema. La tabla `dbo.diagnostic_events` y el endpoint `/api/diagnostics` (+ alias `/api/v1/diagnostics`) ya existen desde el cambio `grabacion-stop-espontaneo`. SPEC-04 solo los consume desde el frontend nuevo.

---

## 7. Fuera de alcance

- **Revisión / Destilado / Resultado / Historial / Ajustes reales** (SPEC-05/06). Aquí solo: la fachada `getSegmentAudio` (cableada, consumida en SPEC-05) y el contexto `ActiveSession` (creado aquí, consumido después).
- **Idempotencia real del Reintentar (A2):** id de intento cliente + dedup en `addSegment` con migración → **cambio futuro de robustez**. No re-abrir aquí.
- **UX de recuperación pulida:** multi-blob en cola, persistencia local (IndexedDB) de audio sin enviar, recuperación entre recargas → cambio futuro de robustez.
- **Prevención por causa** del stop espontáneo (anti-activación accidental, reconexión de micro, device-change), `maxDuration`/rotación automática de segmentos largos → cambio futuro (cosechar `diagnostic_events` primero).
- **Backend / prompts / destilado:** sin cambios.
- **PWA/offline de audio, reprocess desde Captura:** fuera (reprocess es rescate de Revisión).
- **Tooling de test nuevo en `web/`** (vitest): no se introduce en este SPEC (ver §8; verificación R1 = repro con MediaRecorder real vía Playwright, coherente con su ciclo original y con SPEC-01/02/03).

---

## 8. Verificación (extremo a extremo, incl. regresión)

### 8.1 Estático / build / lint

- `cd web && npm run build` (tsc + vite) verde; `npm run lint` (oxlint) sin errores nuevos (los 3 warnings benignos preexistentes son aceptables).
- `cd web && npm ci` reproducible. **Gotcha conocido** (SPEC-02/03): si el lock se desincroniza tras instalar deps, regenerar (`rm -rf node_modules package-lock.json && npm install`) y validar con `npm ci`. *(SPEC-04 no añade deps de runtime → puede que no aplique.)*
- **Regresión backend:** `npm test` (raíz) sigue **14/14** (no se toca backend).

### 8.2 Repro de las salvaguardas con MediaRecorder real (R1 — criterio duro)

Levantar backend local (devBypass, sin necesidad de BD para el mecanismo del recorder) + `web` dev (`npm run dev`), abrir `/app/capture`. Conducir con **Playwright** (chromium con fake-media: `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`), usando la semilla dev `window.__stpCapture`:

1. **Parada intencional = sin falso positivo:** iniciar grabación (clic en el botón principal), parar con el botón (clic). Aserciones: la promesa de `stop()` resuelve un `blob` con `size>0`; **NO** aparece el banner de salvaguarda; el recorder queda `inactive`; se intenta `commitSegment` (subida del segmento).
2. **Stop externo = recuperación sin pérdida:** iniciar grabación; forzar el corte con `window.__stpCapture.recorder.stream.getAudioTracks()[0].stop()`. Aserciones: se registran eventos `recorder_stop_external` (y `track_ended` si el fake-device lo emite); la UI **no** queda congelada (botón vuelve a "Grabar"); aparece el banner **Guardar/Descartar** con `meta.totalBytes>0`; **Guardar** → `recovered_segment_kept` + se añade el segmento recuperado (bytes>0); **Descartar** → `recovered_segment_discarded`.
3. **Aviso "sin señal":** con fake-device silencioso (o mock del `MicMeter` a nivel 0), grabar ~4 s → aparece el aviso inline "No se detecta sonido…"; inyectar un pico → el aviso desaparece y no reaparece.

*Fallback si el harness Playwright no permite fake-media:* conducir el mismo guion **manualmente en navegador** (como en verificaciones de SPEC-01/03) con `window.__stpCapture.recorder.stream.getAudioTracks()[0].stop()` en consola. Documentar la evidencia real (bytes recuperados, eventos, banners) en la bitácora, sin dar por bueno lo no ejecutado.

### 8.3 Banner Reintentar (fallo de subida)

Grabar un segmento y forzar el fallo de `addSegment` (parar el backend a mitad de `POST`, o interceptar la ruta en Playwright para devolver 5xx). Aserción: aparece el banner **Reintentar/Descartar**, el blob queda retenido (`pendingRetry`), la grabación no se pierde; al restaurar el backend, **Reintentar** guarda el mismo audio sin re-grabar (`upload_retry`), **Descartar** limpia el slot (`upload_retry_discarded`).

### 8.4 Warm-up + telemetría

- Al abrir `/app/capture`: se observa `GET /api/v1/health/db` (warm-up al montar); al pulsar Grabar, un segundo `GET /api/v1/health/db`.
- Tras una sesión de captura: `POST /api/v1/diagnostics` con lotes ≤100; en la BD, filas en `dbo.diagnostic_events` con `capture_run_id` consistente y `seq` contiguo sin duplicados (owner-scoped). Best-effort: si diagnostics falla, la grabación **no** se interrumpe.

### 8.5 Flujo funcional e2e (feliz) + no regresión del viejo

- **Nuevo (`/app`):** grabar 2 tramos (transcripción inline y unificada visibles) → importar 1 → "Finalizar" navega a `/review` con `ActiveSession` poblado (sessionId real). En BD: exactamente los segmentos esperados (sin duplicados en la ruta feliz). Escritorio: selector de micro visible y persistente; móvil (viewport <768px): sin selector/medidor, aviso en vivo operativo.
- **Viejo (`/`):** sigue sirviendo el frontend vanilla sin cambios (captura y salvaguardas del viejo intactas).
- **Render/tema:** `/app/capture` renderiza los 4 estados en claro y oscuro, 0 errores de consola (ojo al SW de la PWA: hard-reload/incógnito si sirve build cacheado).

### 8.6 Cierre en Azure (diferido, como en SPEC-01/02/03)

Tras merge y deploy: `/app/capture` sirve el build nuevo; warm-up y diagnostics golpean `/api/v1/*`; **el usuario** hace un smoke logueado real (grabar → finalizar → la sesión aparece en Historial del viejo/consulta directa) y, si se coordina, un drive del banner de stop externo. La **prueba de fuego del cold-start** (§8.3 de `robustez-coldstart-sql`, pausar la BD real) sigue siendo un pendiente **de aquel** cambio, no de éste.

---

## 9. Notas de implementación (no normativas)

- `Date.now()` y `crypto.randomUUID()` se usan en runtime de navegador (no en workflows) — sin restricción.
- StrictMode dev doble-invoca efectos: el efecto de montaje de `useCapture` debe ser idempotente (crear el recorder una vez vía ref; no duplicar warm-up de forma dañina — es fire-and-forget).
- El singleton `diag` persiste entre navegaciones de la SPA; los runs se aíslan por `captureRunId`. Al desmontar la Captura, `endCaptureRun()` + `flush()`.
- Los tres banners (suspect/safeguard/retry) comparten "canal" visual (como el `warnBox` viejo) pero son estados distintos de `banner.kind`.
