# SPEC — `grabacion-stop-espontaneo` (fase de diagnóstico)

> JCC Fase 2 (Especificación). Fecha: 2026-06-28. Fuente de verdad para implementar.
> El **porqué** vive en `DESIGN.md` (mismo directorio). Si SPEC y DESIGN se contradicen,
> manda el SPEC. Cambio sobre **código existente**: se especifica el DELTA.
> **Indivisible → un solo SPEC** (la instrumentación frontend, la persistencia backend y la
> salvaguarda están acopladas; el *fix de robustez* es un cambio FUTURO, fuera de alcance).

## 1. Resumen

Instrumentar la captura para que un corte espontáneo deje **evidencia objetiva y recuperable**
(en una tabla de backend) que distinga las dos hipótesis del DESIGN (H1 activación accidental
del botón vs. H2 stop externo real del recorder), y añadir una **salvaguarda mínima** que evite
perder el audio del tramo cuando el stop sea externo. **No arregla la causa**: la observa.

## 2. Stack y arquitectura

Stack dado (no se elige nada nuevo): Node 24 + Express, frontend vanilla ES modules, Azure SQL
(`mssql`) vía `src/services/db.js`, identidad por `src/middleware/identity.js`, rutas montadas
en `server.js`. El cambio encaja así:

- **Persistencia**: tabla append-only nueva (espejo del patrón `usage_events`), accedida por un
  *store* nuevo (`diagnostics-store.js`) que usa exclusivamente `db.js` (regla del repo: nadie
  habla con `mssql` directamente salvo `db.js`).
- **API**: una ruta nueva `POST /api/diagnostics`, montada **con `identity`** (owner-scoped,
  igual que `/api/sessions`).
- **Frontend**: un cliente de diagnóstico nuevo (`diagnostics.js`) con buffer + envío por lotes;
  `audio-recorder.js` gana handlers de eventos del navegador y dos hooks de callback (sin
  cambiar su API pública); `phase1-capture.js` cablea los hooks, instrumenta el botón y aloja la
  salvaguarda reutilizando su banner y `commitSegment` existentes.

Principio de diseño: la instrumentación y el envío son **best-effort** — un fallo de red o de
BD **nunca** debe romper ni bloquear la grabación.

## 3. Delta (ficheros y módulos)

### ADDED
- `migrations/005_diagnostics.sql` — tabla `dbo.diagnostic_events` + índices.
- `src/services/diagnostics-store.js` — `recordDiagnosticEvents(ownerId, events)` (insert por
  lote en transacción, con validación/límites).
- `src/routes/diagnostics.js` — `POST /` → valida, sella owner/server_ts, delega en el store.
- `public/js/diagnostics.js` — cliente: buffer en memoria, `capture_run_id`, `seq`, política de
  flush, envío por `fetch`/`keepalive`.

### MODIFIED
- `server.js` — importar y montar el router nuevo con `identity`:
  ```js
  import diagnosticsRouter from './src/routes/diagnostics.js';
  app.use('/api/diagnostics', identity);
  app.use('/api/diagnostics', diagnosticsRouter);
  ```
- `public/js/api-client.js` — añadir `postDiagnostics(events)`.
- `public/js/audio-recorder.js` — `onstop` persistente (intencional vs externo), `onerror`,
  handlers de track (`onended/onmute/onunmute`); hooks `onDiag` y `onExternalStop`.
- `public/js/phases/phase1-capture.js` — `startCaptureRun()` + `capture_started`; instrumentar
  la activación de `btnRecord`; registrar handlers de Media Session (solo log); cablear
  `recorder.onDiag` y `recorder.onExternalStop` (salvaguarda); `skipGuard` en `commitSegment`.

### REMOVED
- Nada.

## 4. Interfaces y contratos

### 4.1 Modelo de datos — `dbo.diagnostic_events`

```sql
-- 005_diagnostics.sql — telemetría de captura (append-only) para diagnosticar el
-- corte espontáneo de grabación. Independiente del ciclo de vida de la sesión.
CREATE TABLE dbo.diagnostic_events (
  id             INT IDENTITY(1,1) CONSTRAINT PK_diagnostic_events PRIMARY KEY,
  owner_id       INT NOT NULL,
  session_id     INT NULL,              -- referencia BLANDA (sin FK): la captura puede no
                                        -- tener sesión aún, y la telemetría sobrevive a la sesión
  capture_run_id NVARCHAR(64) NOT NULL, -- agrupa los eventos de un mismo intento de grabación
  seq            INT NOT NULL,          -- orden por-run, fijado en cliente (orden determinista)
  event_type     VARCHAR(40) NOT NULL,
  payload        NVARCHAR(MAX) NULL,    -- JSON serializado (≤ 8 KB)
  client_ts      DATETIME2(3) NULL,     -- reloj del cliente (puede no ser fiable)
  server_ts      DATETIME2(3) NOT NULL CONSTRAINT DF_diag_server_ts DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_diag_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id)
);

CREATE INDEX IX_diag_owner_ts  ON dbo.diagnostic_events(owner_id, server_ts DESC);
CREATE INDEX IX_diag_run_seq   ON dbo.diagnostic_events(capture_run_id, seq);
```

> Nota de implementación: `npm run migrate` aplica las migraciones pendientes (tracked en
> `schema_migrations`). No tocar las 001–004.

### 4.2 Backend — store

```js
// src/services/diagnostics-store.js
// Inserta un lote de eventos de diagnóstico (append-only). Best-effort desde el llamador:
// si lanza, la ruta responde error pero el cliente NO interrumpe la grabación.
export async function recordDiagnosticEvents(ownerId, events) // → { inserted: number }
```
- Recorre `events` dentro de `withTransaction`; un `INSERT` parametrizado por evento
  (tipos explícitos vía `req.input`, patrón de `usage-store.js`).
- Cada evento de entrada: `{ captureRunId, seq, type, payload, clientTs?, sessionId? }`.
  - `payload`: el store recibe el objeto ya serializado a string por la ruta (o lo serializa);
    se **trunca/rechaza** si supera 8 KB (ver ruta).
  - `clientTs`: ISO 8601 → `DATETIME2`; si falta o no parsea, `NULL`.
  - `sessionId`: número o `NULL` (no se valida pertenencia: es referencia blanda de telemetría).

### 4.3 Backend — ruta

```
POST /api/diagnostics            (identity → req.user.id = owner_id)
Body: { events: [ { captureRunId, seq, type, payload, clientTs?, sessionId? }, ... ] }
200 → { inserted: <n> }
400 BAD_REQUEST   → body inválido (sin array events, o vacío)
413 TOO_LARGE     → lote > 200 eventos
500 DIAG_FAILED   → fallo de inserción (el cliente lo ignora; no rompe la grabación)
```
- Validación: `events` debe ser array no vacío, ≤ **200** elementos. Por evento: `type` string
  ≤ 40 chars (truncar), `captureRunId` string ≤ 64 (requerido), `seq` entero, `payload`
  serializado a JSON y **truncado a 8 KB** si excede (no rechazar el evento entero: marcar
  `{ _truncated: true }`).
- Error de inserción → log servidor + `500`, **sin** filtrar detalles internos al cliente.

### 4.4 Frontend — cliente de diagnóstico (`public/js/diagnostics.js`)

```js
// Un único intento de grabación = un capture_run. Buffer en memoria; envío por lotes.
export function startCaptureRun(meta = {})   // genera capture_run_id (crypto.randomUUID), resetea seq, opcional capture_started
export function logEvent(type, payload = {}) // añade al buffer con seq++ y client_ts; flush si type es sospechoso o buffer ≥ 50
export function setSessionId(id)             // asocia la sesión (cuando se crea lazy) a los eventos siguientes
export async function flush()                // POST del buffer pendiente; en éxito vacía; en fallo conserva (reintento en el próximo flush)
export function flushBeacon()                // flush con fetch keepalive (para pagehide/visibilitychange→hidden)
```
- `SUSPICIOUS = new Set(['recorder_stop_external','recorder_error','track_ended','mediasession_action'])`
  más el caso `record_button_activated` con `payload.isTrusted === false`.
- `flush()` y `flushBeacon()` son **best-effort**: capturan cualquier error (`try/catch`) y
  nunca propagan.
- El módulo registra una vez, a nivel de módulo, `addEventListener('pagehide', flushBeacon)` y
  `document.addEventListener('visibilitychange', …)` (flush si `hidden`).
- Tope defensivo del buffer (p.ej. 500 eventos) para no crecer sin límite si la red está caída.

### 4.5 Frontend — `api-client.js`

```js
postDiagnostics: (events) => request('POST', '/diagnostics', { events }),
```

### 4.6 Frontend — `audio-recorder.js` (delta de comportamiento)

API pública **preservada**: `start/pause/resume/stop`, getters `isRecording/isPaused`,
`getElapsedSeconds`, `onTimeUpdate`. Añadidos:

- Propiedades de callback (todas opcionales, default `null`):
  - `onDiag(type, payload)` — el recorder reporta sus eventos de navegador.
  - `onExternalStop(blob, meta)` — invocado **solo** cuando el recorder para sin que el usuario
    llamara a `stop()`. `meta = { elapsedSeconds, chunkCount, totalBytes, visibilityState }`.
- En `start()`, tras crear `this.mediaRecorder`:
  - `this._intentionalStop = false;`
  - Asignar **un** `onstop` persistente:
    ```js
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
      const meta = { elapsedSeconds: this.getElapsedSeconds(),
                     chunkCount: this.chunks.length,
                     totalBytes: blob.size,
                     visibilityState: document.visibilityState };
      if (this._intentionalStop) {
        this._cleanup();
        this._stopResolve?.(blob);            // resuelve la promesa de stop()
      } else {
        this.onDiag?.('recorder_stop_external', meta);
        this._cleanup();
        this.onExternalStop?.(blob, meta);    // salvaguarda en phase1
      }
    };
    ```
  - `this.mediaRecorder.onerror = (e) => this.onDiag?.('recorder_error', { name: e.error?.name, message: e.error?.message });`
  - Para cada track de audio del stream: `onended`, `onmute`, `onunmute` → `onDiag('track_ended'|'track_muted'|'track_unmuted', { label, readyState, muted })`.
- `stop()` se refactoriza para usar el `onstop` persistente, **preservando su contrato**
  (`Promise<Blob|null>`): si está inactivo, `resolve(null)`; si no,
  `this._intentionalStop = true; this._stopResolve = resolve; this.mediaRecorder.stop();`.
- `_cleanup()` sin cambios (clear timer + stop tracks).

### 4.7 Frontend — `phase1-capture.js` (delta)

- `import * as diag from '../diagnostics.js';`
- **Al iniciar grabación** (rama "empezar nuevo segmento"): `diag.startCaptureRun()`, luego
  `diag.logEvent('capture_started', { deviceId: selectedDeviceId || null, userAgent: navigator.userAgent, visibilityState: document.visibilityState })`. Tras `recorder.start()`,
  cablear hooks (si no se hizo ya): `recorder.onDiag = (t,p) => diag.logEvent(t,p);` y
  `recorder.onExternalStop = handleExternalStop;`. Si se crea sesión lazy en `commitSegment`,
  llamar `diag.setSessionId(sessionId)`.
- **Instrumentar el botón**: el listener de `btnRecord` recibe el evento `(e)` y al entrar
  registra `diag.logEvent('record_button_activated', { isTrusted: e.isTrusted, detail: e.detail, pointerType: e.pointerType ?? null, viaKeyboard: e.detail === 0, activeElement: document.activeElement?.id || null, recorderState: recorder.mediaRecorder?.state || 'inactive' })`.
  (Distingue H1: una activación con `isTrusted=false` o `viaKeyboard=true` señala activación no
  manual.)
- **Media Session** (cazar media-keys BT): si `navigator.mediaSession?.setActionHandler` existe,
  registrar `['play','pause','stop']` con handlers que **solo** logan
  `diag.logEvent('mediasession_action', { action })` (no cambian comportamiento). Registrar al
  empezar a grabar; limpiar (`setActionHandler(a, null)`) al parar.
- **Salvaguarda** `handleExternalStop(blob, meta)`:
  1. `diag.logEvent('chunks_preserved', { chunkCount: meta.chunkCount, totalBytes: meta.totalBytes })`.
  2. `updateUI()` (el recorder ya está inactivo → arregla la UI congelada).
  3. Si `blob && blob.size > 0`: mostrar el banner (reutilizar el patrón `confirmSuspectAudio`,
     con mensaje propio: «La grabación se detuvo de forma inesperada. Hemos conservado el audio
     grabado hasta el corte. ¿Guardar este tramo?») → **Guardar** llama
     `commitSegment(blob, { source:'recorded', seconds: meta.elapsedSeconds, skipGuard:true })`
     y loga `recovered_segment_kept`; **Descartar** loga `recovered_segment_discarded`,
     `updateUI()` y `startPreview(selectedDeviceId)`.
  4. Si `blob` vacío: loga `recovered_segment_empty`, `updateUI()`, `startPreview(...)`.
  5. `diag.flush()` (best-effort).
- `commitSegment(blob, { source, seconds, filename, skipGuard = false })`: si `skipGuard`, omite
  el `checkAudio`/`confirmSuspectAudio` (el tramo recuperado se guarda directo). Resto igual.

### 4.8 Taxonomía de `event_type` (cerrada para esta fase)

| event_type | capa | payload principal |
|---|---|---|
| `capture_started` | UI | deviceId, userAgent, visibilityState |
| `record_button_activated` | UI | isTrusted, detail, pointerType, viaKeyboard, activeElement, recorderState |
| `mediasession_action` | UI | action |  *(sospechoso)* |
| `recorder_started` | recorder | mimeType |
| `recorder_stop_external` | recorder | elapsedSeconds, chunkCount, totalBytes, visibilityState | *(sospechoso)* |
| `recorder_error` | recorder | name, message | *(sospechoso)* |
| `track_ended` | stream | label, readyState | *(sospechoso)* |
| `track_muted` / `track_unmuted` | stream | label, muted |
| `visibility_change` | doc | visibilityState |
| `chunks_preserved` | salvaguarda | chunkCount, totalBytes |
| `recovered_segment_kept` / `_discarded` / `_empty` | salvaguarda | — |

`record_button_activated` con `isTrusted=false` cuenta como sospechoso (fuerza flush).

## 5. Qué se PRESERVA (regresión)

- **API pública de `AudioRecorder`** (`start/pause/resume/stop`, `isRecording/isPaused`,
  `getElapsedSeconds`, `onTimeUpdate`): firmas y semántica intactas; `stop()` sigue devolviendo
  `Promise<Blob|null>` y resolviendo con el blob del tramo.
- **Flujo multi-segmento**: grabar → detener (botón) → transcribir → seguir, sin cambios para el
  camino *intencional*. La salvaguarda solo actúa en el camino *externo*.
- **Fix de tiempo en pausa/reanudar** (`getElapsedSeconds` / `_elapsedBeforePause`): sin tocar.
- **Cronómetro, preview/medidor de micrófono, guard de audio sospechoso (silencio/tamaño),
  import**: sin cambios funcionales (el `skipGuard` es opt-in; por defecto `false`).
- **Contrato de `commitSegment`** (sesión lazy, subida, recálculo de transcripción) y el
  contrato del objeto sesión (`segments[]` + `transcription_raw`).
- **`identity` middleware y aislamiento por `owner_id`**: la ruta nueva lo respeta (owner del
  `req.user.id`); no se relaja el aislamiento de `/api/sessions`.
- **Migraciones 001–004** y el resto del esquema: intactas.
- **No** se debe disparar la salvaguarda en un stop intencional (sin falsos positivos): lo
  garantiza el flag `_intentionalStop`.

## 6. Migración de datos

Solo **DDL** (tabla nueva, vacía); no hay backfill ni transformación de datos existentes.
Aplicar con `npm run migrate` (local y prod). Reversión: `DROP TABLE dbo.diagnostic_events`
(sin dependencias externas; nadie más la referencia).

## 7. Fuera de alcance

- El **fix de robustez real** (UX de recuperación pulida, continuación sin fricción/auto-reanudar,
  prevención específica por causa una vez confirmada, `maxDuration`/rotación de segmentos) →
  **cambio futuro**, alimentado por los datos que recoja esta fase.
- Cualquier cambio en **prompts de destilación** o en el **backend de destilado**.
- Panel/visor de diagnósticos en la UI (de momento se consulta por SQL).
- Retención/purga de `diagnostic_events` (volumen despreciable; se decidirá si hace falta).
- `localStorage` como respaldo (se eligió backend en DESIGN).

## 8. Verificación (extremo a extremo)

El proyecto **no tiene test suite** (norma del repo: verificación manual/scriptada). Se sigue esa
norma; donde es barato, se automatiza.

### 8.1 Backend
1. `npm run migrate` → aparece `005_diagnostics` en `schema_migrations` y existe
   `dbo.diagnostic_events` (consulta `INFORMATION_SCHEMA.TABLES`).
2. Arrancar `npm run dev`. POST de prueba (desde consola del navegador ya autenticado, o curl con
   cabeceras `DEV_USER_*` en local):
   ```js
   await fetch('/api/diagnostics', { method:'POST', headers:{'Content-Type':'application/json'},
     body: JSON.stringify({ events:[{ captureRunId:'test-1', seq:0, type:'capture_started', payload:{x:1} }] })});
   ```
   → `{ inserted: 1 }` y una fila en la tabla con `owner_id` del usuario dev y `server_ts` puesto.
3. Validación de límites: lote vacío → `400`; lote > 200 → `413`; payload > 8 KB → fila con
   `payload` truncado y `_truncated:true`.

### 8.2 Frontend — instrumentación + salvaguarda (repro determinista)
1. Empezar a grabar un tramo (hablar unos segundos). En `diagnostic_events` (o tras un flush)
   debe haber `capture_started` y `record_button_activated` con `isTrusted=true`,
   `viaKeyboard=false`.
2. **Forzar un stop externo** sin esperar al bug real: en la consola, con la grabación activa,
   `recorder.stream.getAudioTracks()[0].stop()` (o desde DevTools matar el track). Esperado:
   - eventos `track_ended` y `recorder_stop_external` registrados (y enviados por ser
     sospechosos),
   - la UI **no se queda congelada** (`updateUI()` corre; el botón vuelve a "Grabar"),
   - aparece el banner de salvaguarda; **Guardar** añade el tramo recuperado como segmento
     (transcripción visible) → `recovered_segment_kept`; **Descartar** → `recovered_segment_discarded`.
3. **H1 (activación accidental)**: enfocar el botón y pulsar Espacio/Enter → la activación se
   registra con `viaKeyboard=true`. (Probar `mediasession_action` con un media-key/BT si es
   posible.)

### 8.3 Regresión (debe seguir verde)
- Flujo normal: grabar → **Detener (botón)** → se transcribe y añade segmento; **no** aparece el
  banner de salvaguarda (camino intencional, sin falso positivo); `stop()` devolvió el blob.
- Multi-segmento: encadenar 2–3 tramos; la transcripción acumulada y el contador de segmentos
  correctos.
- Pausa/Reanudar: el cronómetro no cuenta doble (regresión histórica) y el tiempo del tramo es
  correcto.
- Import de audio: añade segmento como antes.
- Caída de red del endpoint de diagnóstico (simular `postDiagnostics` que rechaza): la grabación
  y la transcripción **siguen funcionando** (best-effort; el error solo se loguea).
