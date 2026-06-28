# DESIGN — `grabacion-stop-espontaneo` (fase de diagnóstico)

> JCC Fase 1 (Análisis). Fecha: 2026-06-28. Estado: **diseño cerrado, pendiente de SPEC.**
> Cambio sobre código existente (frontend de captura + una adición fina de backend).

## 1. Objetivo y problema

Durante una grabación larga, la captura se **detiene sola** —sin que el usuario toque
teclado ni ratón— y la app se comporta como si se hubiera pulsado "Detener". Evidenciado
en directo en la transcripción de la **Session 10** ("Algo ha pasado que la grabación se
ha detenido sola... ha pasado a la fase de revisar y destilar... le he vuelto a dar al
botón grabar y continúo"). El usuario **no tiene certeza de que el audio grabado antes del
corte se conservara**.

El problema de fondo para diseñar el arreglo es que **solo tenemos una observación difusa**
(memoria del usuario), sin patrón ni datos objetivos. Parchear ahora sería a ciegas.

**Por tanto, este cambio NO arregla el bug todavía.** Su objetivo es:

1. **Instrumentar** la captura para que, cuando vuelva a ocurrir, deje **evidencia objetiva
   y recuperable** que identifique la causa raíz.
2. Añadir una **salvaguarda mínima** para no volver a perder el audio del tramo mientras
   recogemos datos.

El fix de robustez real se diseñará en un **cambio futuro**, alimentado por esos datos.

## 2. Hallazgos de la orientación (código actual verificado)

Verificado leyendo `public/js/audio-recorder.js` y `public/js/phases/phase1-capture.js`.

**`audio-recorder.js`** (wrapper sobre `MediaRecorder`):
- `start(deviceId)` → `getUserMedia` → crea recorder → **`this.chunks = []`** (línea 28) →
  `start(250)` (un `ondataavailable` cada 250 ms empuja a `this.chunks`).
- El **único** `onstop` se asigna **dentro de `stop()`** (línea 65): construye el `Blob`,
  hace `_cleanup()` (para timer y tracks) y resuelve la promesa.
- **No hay** `mediaRecorder.onerror`, **no hay** `track.onended/onmute`, **no hay**
  `maxDuration` ni detección de silencio. El único `setInterval` es el cronómetro, que
  **no consulta el estado del recorder** (solo `!isPaused`).

**`phase1-capture.js`**: todo el flujo lo dispara el click en `btnRecord` (línea 222):
si `isRecording || isPaused` → `stop()` → `commitSegment()`; si no → `recorder.start()`.
**No existe ningún listener** para un stop/onended/onerror disparado por el navegador.

### Dos hipótesis, dos síntomas distintos

El dato clave del usuario: fue **"como si pulsara Detener"** y **casi seguro el cronómetro
se paró**. En el código actual, un stop *externo* del `MediaRecorder` **NO** para el
cronómetro, **NO** hace commit y **NO** llama a `updateUI()`. Un Detener "limpio"
(cronómetro parado, segmento guardado, "Revisar" disponible) **solo ocurre si se ejecuta el
flujo del botón**. De ahí dos hipótesis con firmas observables diferentes:

- **H1 — Activación accidental del botón** (encaja mejor con el síntoma). Tras la última
  pulsación, `btnRecord` queda con el **foco**; un evento lo "activa" sin tocarlo: una tecla
  (Espacio/Enter) o —plausible con los **auriculares Bluetooth** que el usuario llevaba— un
  **botón multimedia** (play/pause) traducido por SO/navegador a una activación. Resultado:
  Detener limpio, segmento guardado, cronómetro parado. **En este caso NO hay pérdida de
  audio** (el segmento se confirma bien); el daño es la interrupción no deseada.
- **H2 — Stop externo real del recorder** (muerte/pérdida del track del micro, suspensión).
  Firma distinta: UI **congelada** en "Detener", cronómetro **corriendo**, y —al volver a
  pulsar Grabar— `start()` resetea `chunks` → **pérdida del tramo**. Aquí sí hay pérdida.

La instrumentación debe **distinguir ambas capas** para no confundirlas.

> Matiz de partida: el material del usuario decía "ha pasado a la fase de revisar y
> destilar". En el código actual no hay auto-navegación; "Revisar" solo se habilita vía
> `updateUI()` con segmentos presentes. Lo tratamos como recuerdo impreciso; la
> instrumentación lo aclarará.

## 3. Alcance

### Dentro de alcance
1. **Instrumentación en dos capas:**
   - *Capa botón/UI* (`phase1-capture.js`): registrar cada activación de `btnRecord` con
     `isTrusted`, origen (puntero vs. teclado, `detail`/`pointerType`), estado de foco
     (`document.activeElement`), eventos de teclado relevantes y acciones de **Media Session**
     si son observables. → discrimina **H1**.
   - *Capa MediaRecorder/stream* (`audio-recorder.js`): `onstop` **persistente** que marque
     si el stop fue **intencional** (vía `stop()`) o **externo**; `onerror`;
     `track.onended/onmute/onunmute`; `visibilitychange` del documento. → discrimina **H2**.
2. **Persistencia en backend**: endpoint nuevo que recibe los eventos **en lote** y los
   guarda en una **tabla append-only** para consulta posterior.
3. **Recuperación de evidencia**: el usuario (o yo, por SQL) puede recuperar los eventos de
   un intento de captura para diagnosticar. Un disparador en cliente para **forzar el envío**
   del buffer ("enviar diagnóstico") además del envío automático al detectar evento
   sospechoso.
4. **Salvaguarda mínima ante stop externo (H2)**: al detectar un stop *externo*, **recuperar
   el blob de `chunks`** antes de que el siguiente `Grabar` lo borre, llamar a `updateUI()`
   (arregla la UI congelada) y **ofrecer guardar o descartar** ese tramo reutilizando el
   banner de aviso existente (`confirmSuspectAudio` / `warn-box`) y el camino `commitSegment`.

### Fuera de alcance (→ cambio futuro de robustez)
- La UX de recuperación "pulida" y la **continuación sin fricción** (auto-reanudar tramo).
- **Prevención específica por causa**: anti-activación accidental del botón (p.ej. quitar
  foco/`type=button` ya está, o ignorar activaciones no `isTrusted`), manejo de cambio de
  dispositivo, reconexión de micro.
- `maxDuration` / rotación automática de segmentos en grabaciones largas.
- Cualquier cambio en **prompts de destilación** o en el **backend de destilado**.
- Panel de administración/visualización de diagnósticos en la UI (de momento se consulta por
  SQL; un visor es opcional y futuro).

## 4. Usuarios y casos de uso

Usuario único real hoy (el arquitecto que dicta). Casos:
- **CU-1 (diagnóstico)**: ocurre un corte espontáneo → la app registra la secuencia de
  eventos con sus firmas → quedan en `diagnostic_events` → se consultan para clasificar
  H1 vs. H2 y la causa concreta.
- **CU-2 (no perder audio)**: ocurre un stop externo (H2) → el tramo grabado **no se pierde**;
  el usuario decide guardarlo o descartarlo y continúa en multi-segmento.
- **CU-3 (envío manual)**: tras un episodio raro, el usuario pulsa "enviar diagnóstico" para
  forzar el volcado del buffer aunque no se haya disparado el envío automático.

## 5. Decisiones acordadas

### Estructurales (decididas en la mesa común)
- **[E1] Persistencia en backend mediante tabla append-only `diagnostic_events`** (no solo
  logs del App Service). Espejo del patrón existente `usage_events`. Campos previstos
  (se afinan en SPEC): `id`, `owner_id`, `session_id` (nullable), `capture_run_id`,
  `event_type`, `payload` (JSON en NVARCHAR(MAX)), `client_ts`, `server_ts`. Migración nueva
  `migrations/NNN_*.sql`, aplicada por `npm run migrate`.
  *Razón*: el usuario necesita datos **objetivos, recuperables y consultables/correlacionables**
  por `capture_run_id` que sustituyan su recuerdo difuso; una tabla lo permite, los logs no
  cómodamente. *Coste*: es modelo de datos (poco reversible en prod) — por eso se acordó
  explícitamente.
- **[E2] Contrato del endpoint `POST /api/diagnostics`**: recibe **un lote** de eventos,
  owner-scoped vía el `identity` middleware existente (Easy Auth en Azure / `DEV_USER_*`
  local). Es un contrato nuevo de API.

### Tácticas (reversibles, decididas por el copiloto técnico — se mencionan)
- **[T1] Buffer en cliente + envío por lotes**: ring-buffer en memoria que se vacía (a) al
  detectar un evento sospechoso (stop externo, error, track ended, activación no `isTrusted`)
  y (b) bajo demanda con un botón. Evita charlatanería de red. Best-effort (no bloquea la
  grabación si el envío falla).
- **[T2] `capture_run_id`** generado en cliente al iniciar cada grabación, para agrupar todos
  los eventos de un mismo intento.
- **[T3] Distinción intencional/externo** en `AudioRecorder` mediante un flag interno puesto
  por `stop()` antes de invocar el stop nativo; el `onstop` persistente lo lee.
- **[T4] La salvaguarda mínima reutiliza** `confirmSuspectAudio`/`warn-box` y `commitSegment`
  existentes; no se crea UX nueva.
- **[T5] Instrumentación siempre activa** (no detrás de flag): el evento es raro y hay que
  cazarlo; el coste es despreciable.

## 6. Superficie de regresión (qué se PRESERVA)

Cambios deben dejar intacto:
- El flujo multi-segmento (grabar → detener → transcribir → seguir) y el contrato de
  `commitSegment` (creación lazy de sesión, subida, recálculo de transcripción).
- El fix de tiempo en pausa/reanudar (`getElapsedSeconds` / `_elapsedBeforePause`).
- El cronómetro, el preview/medidor de micrófono y el guard de audio sospechoso
  (silencio/tamaño) y el import.
- La API de `AudioRecorder` (`start/pause/resume/stop`, getters `isRecording/isPaused`):
  los nuevos handlers se **añaden**, no se cambia la firma pública.
- El `identity` middleware y el aislamiento por `owner_id` (el endpoint nuevo lo respeta).

Riesgos de regresión a vigilar en SPEC/implementación:
- Que un `onstop` persistente no **rompa** el `stop()` actual basado en promesa (debe
  coexistir: el `stop()` sigue resolviendo su blob; el persistente solo actúa en el caso
  externo).
- Que la salvaguarda no dispare **falsos positivos** (tratar un stop intencional como externo).
- Que el envío al backend **no bloquee** ni rompa la captura si falla (best-effort).

## 7. Supuestos, riesgos y preguntas abiertas

**Supuestos**
- Al parar (incluso externamente), el navegador emite un último `ondataavailable` antes del
  `onstop`, por lo que `this.chunks` contiene el audio en el instante del corte (palanca de la
  salvaguarda). *A verificar en implementación con la propia instrumentación.*
- Edge/Windows 11 expone `isTrusted`, foco y, si aplica, Media Session, suficientes para
  discriminar H1.

**Riesgos**
- Que el corte **no se reproduzca** en una ventana razonable (evento raro). Mitigación:
  instrumentación siempre activa y de bajo coste; esperamos a acumular evidencia.
- Que la causa sea una combinación (p.ej. BT que suelta el track *y* genera un media-key).
  La instrumentación de dos capas debería mostrarlo igualmente.

**Preguntas abiertas (para SPEC o para el cambio futuro)**
- ¿Qué exactamente cuenta como "evento sospechoso" que dispara el flush automático? (lista
  inicial en T1; afinable).
- ¿Retención/limpieza de `diagnostic_events`? (probablemente innecesario a este volumen; se
  decide en SPEC si se añade algo).
- Forma final del `payload` (qué campos del entorno capturar: `userAgent`, `deviceId/label`,
  `visibilityState`, etc.) — se concreta en SPEC.

## 8. Decomposición / orden

- **Este cambio (`grabacion-stop-espontaneo`)**: instrumentación + persistencia backend +
  salvaguarda mínima. **No arregla** la causa; la **observa** y protege el audio.
- **Cambio futuro (robustez de captura)**: con los datos recogidos, diseñar el fix definitivo
  (UX de recuperación pulida y/o prevención específica de la causa raíz confirmada).
