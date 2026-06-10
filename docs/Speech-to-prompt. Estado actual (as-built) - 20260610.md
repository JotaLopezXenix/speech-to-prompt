# Speech-to-Prompt — Estado actual (as-built) y análisis para producto

**Fecha:** 2026-06-10
**Versión del producto descrita:** v1.1 (rama `main`, repo `github.com/JotaLopezXenix/speech-to-prompt`) — evolución **multi-segmento** sobre la v1.0.0.
**Propósito de este documento:** dar al proyecto de diseño en Claude una descripción precisa y completa de lo que existe HOY, más un análisis prospectivo de qué haría falta para convertirlo en un **servicio vendible a terceros** (app móvil Android/iOS + web pública), de modo que se pueda decidir con fundamento **evolucionar esta aplicación o rehacer una nueva** tomándola como aprendizaje.

> **Trazabilidad.** Este documento sustituye al snapshot `Estado actual (as-built) - 20260605.md` (preservado en el historial de git) y continúa los dos documentos de diseño originales, en esta misma carpeta:
> - `docs/Speech-to-prompt. Análisis y diseño inicial - 20260409.md`
> - `docs/Speech-to-prompt. Diseño solo Windows en local - 20260410.md`
>
> **Cambio principal frente al 2026-06-05:** la sesión dejó de ser de "una grabación → una transcripción" y pasó a un modelo **multi-segmento** con **captura iterativa no destructiva** (grabar → ver lo transcrito → seguir grabando en la misma sesión), **importación** de audio existente, **reproceso** de audio desde disco, y una capa de **normalización con ffmpeg opcional**. El flujo dejó de tener 5 fases para tener **4** (la transcripción se hace inline dentro de la captura).

> **Nota de seguridad.** Este documento **no contiene ninguna API key ni secreto de acceso**. Las claves viven en `data/config.json`, que está gitignored y fuera de este documento. Sí se incluye, en el Anexo A, el *system prompt* de destilación: es lógica de producto (un activo calibrado), no un secreto de acceso.

---

## 1. Resumen ejecutivo

**Speech-to-Prompt** es una herramienta web **local, monousuario**, que convierte un **dictado de voz** en un **prompt limpio, denso y estructurado** listo para pegar en Claude (Opus, modo extended thinking / socrático) e iniciar una conversación de diseño.

- **Stack:** Node.js (≥20, ESM) + Express en el backend; frontend **SPA en JavaScript vanilla** (ES modules nativos, **sin framework y sin build**) servido estáticamente por el propio Express.
- **Flujo de 4 fases:** `1-captura (iterativa, multi-segmento + transcripción inline) → 3-revisión → 4-destilación → 5-resultado`. (La numeración interna conserva 1/3/4/5 por compatibilidad de código; la antigua fase 2 "transcripción" se absorbió en la captura.)
- **Cadena de IA:** el navegador graba audio (WebM/Opus) por tramos → cada tramo se normaliza (ffmpeg opcional) y se transcribe con **Groq Whisper** → la transcripción unificada se destila a prompt con **Anthropic Claude**.
- **Persistencia:** ficheros **JSON locales** (una sesión por fichero, con array de segmentos) + el audio por segmento en disco. Sin base de datos.
- **Ejecución:** `127.0.0.1` (solo localhost), arranque silencioso en Windows con atajo de teclado, *single-instance guard* y *fallback* de puerto. El lanzador usa `--watch` (auto-recarga del backend).
- **Madurez:** v1.1 en uso personal real y continuado (decenas de sesiones desde 2026-04). Código pequeño (~2.000 líneas de fuente), 4 dependencias npm + ffmpeg **opcional** del sistema, **sin tests ni CI**.

El producto resuelve bien un problema concreto para **un** usuario en **su** máquina. Convertirlo en servicio multiusuario es un salto de arquitectura (auth, nube, base de datos, gestión de claves/costes), no una ampliación incremental — se detalla en la sección 11.

---

## 2. Propósito y perfil de usuario

### 2.1 Problema que resuelve

Capturar pensamiento de diseño hablando con naturalidad (sin estructura previa) y obtener automáticamente un **prompt de alta densidad** que sirva de punto de partida para una conversación profunda con Claude. Evita el coste de teclear y estructurar manualmente ideas dictadas. El modelo multi-segmento añade un caso de uso real: **poder pausar un dictado largo, revisar lo ya transcrito para retomar el hilo, y continuar** sin perder la sesión.

### 2.2 Perfil del usuario (para el que está calibrado)

- Arquitecto de software senior, en transición hacia *AI Solutions Architect*.
- Ecosistema principal: Anthropic (Claude, Claude Code, API).
- **Habla español con abundante terminología técnica en inglés** (code-switching, anglicismos) y **deletrea siglas** ("ele ele eme" → "LLM", "a pe i" → "API").
- El *system prompt* de destilación (Anexo A) está específicamente calibrado para este perfil: preserva el español con términos en inglés, corrige siglas deletreadas, elimina muletillas y densifica, **sin añadir opinión propia**.

### 2.3 Requisitos de plataforma del diseño original

El análisis inicial planteaba funcionar en **Windows 11 Pro (x86)**, **Windows 11 Home ARM (Surface Pro, Snapdragon X Plus)** y **Android (Chrome)**. La v1 construida es **web local** servida en localhost; en la práctica corre en navegador (cualquier plataforma con un navegador moderno apuntando al servidor local), con **utilidades de lanzamiento específicas de Windows**. La compatibilidad ARM motivó la decisión de **no depender de ffmpeg**; en la v1.1 esa regla se relajó a **ffmpeg opcional con degradación elegante** (ver 8): si ffmpeg está presente mejora la robustez, y si no, todo sigue funcionando como antes.

---

## 3. Arquitectura general

```
┌──────────────────────────── Navegador (SPA vanilla) ───────────────────────────┐
│  Fase 1 Captura (iterativa, multi-segmento)        Fase 3 Revisión             │
│   ┌─ grabar tramo ─ pausar ─ DETENER ─┐            (editar texto unificado)    │
│   │  MediaRecorder (WebM/Opus 32kbps) │                                        │
│   │  └─► POST /segments (por tramo) ───┼──► transcribe inline ─► acumula       │
│   │  Importar audio ─► POST /segments  │                                        │
│   └─ "Seguir grabando" (nuevo tramo) ──┘                                        │
│  Fase 4 Destilación        Fase 5 Resultado                                     │
│  POST /distill ◄────────── (copiar prompt)                                      │
└─────────────────────────────────────────────┼──────────────────────────────────┘
                                              │ HTTP (localhost)
┌──────────────────────── Backend Express (127.0.0.1) ─────────┼───────────────────┐
│  /api/config  /api/sessions  /…/segments  /…/reprocess  /…/distill               │
│        │             │              │            │              │                 │
│  config-store   session-store   audio-normalize (ffmpeg opc.)  LLM (Anthropic)   │
│        │             │              │ remux/recodifica/trocea   │                 │
│  data/config.json  data/sessions/*.json   │              STT (Groq) ◄─┘           │
│                    data/audio/<id>__seg-N.webm ◄──────────┘                       │
└──────────────────────────────────────────────┼──────────────────────┼────────────┘
                                              │                       │
                                     ┌────────▼────────┐     ┌────────▼─────────┐
                                     │  Groq Whisper   │     │ Anthropic Claude │
                                     │  (STT, nube)    │     │   (LLM, nube)    │
                                     └─────────────────┘     └──────────────────┘
```

**Características arquitectónicas clave:**

- Backend Express minimalista que (a) sirve el frontend estático desde `public/` y (b) expone una API JSON pequeña.
- Frontend SPA: un único punto de entrada (`app.js`) que importa módulos ES nativos; **el navegador carga los `.js` directamente, sin bundler**.
- **Abstracción de proveedores** (requisito firme de diseño): toda integración LLM y STT pasa por clases base; añadir un proveedor = un fichero nuevo + una línea en el registro.
- **Modelo multi-segmento:** una sesión contiene un array ordenado de segmentos; la transcripción a nivel de sesión es una **vista materializada** (concatenación de los segmentos), lo que mantuvo intactos a los consumidores existentes (destilación, historial, fases de revisión/resultado).
- **Normalización de audio opcional:** cada audio se sanea con ffmpeg antes de transcribir (escribe duración, comprime y trocea si excede el límite de Groq); si ffmpeg no está, se envía tal cual.
- Sin base de datos, sin autenticación, sin estado de servidor más allá de los ficheros en `data/`.

---

## 4. Backend

### 4.1 `server.js` (punto de entrada, ~79 líneas)

- **Express** con `express.json()` y `express.static('public')`.
- **Montaje de rutas:**
  - `/api/config` → `configRouter`
  - `/api/sessions` → `sessionsRouter`, `transcribeRouter`, `distillRouter` (los tres montados bajo el mismo prefijo). `transcribeRouter` expone ahora `/:id/segments`, `/:id/reprocess` y el alias histórico `/:id/transcribe`.
- **Fallback SPA:** `app.get('*')` devuelve `public/index.html` para cualquier ruta no-API.
- **Arranque con fallback de puerto:** intenta `3000`; si `EADDRINUSE` y `port < 3010`, prueba el siguiente (3000→3009). Escucha en **`127.0.0.1`** (solo localhost).
- **Single-instance guard:** antes de arrancar, hace `fetch('http://localhost:3000')` con timeout de 500 ms; si responde, asume que ya hay una instancia, **abre el navegador y termina** (`process.exit(0)`). Si no, arranca el servidor.
- **Apertura automática del navegador** con el paquete `open`.
- Llama a `ensureDirectories()` al inicio (crea `data/`, `data/sessions/`, `data/audio/` y migra datos legacy si procede).

### 4.2 Superficie de API (10 endpoints — verificado contra el código)

| Método | Ruta | Entrada | Salida (200) | Errores |
|---|---|---|---|---|
| GET | `/api/config` | — | `{ config (enmascarado), llmProviders, sttProviders, configured }` | 500 `CONFIG_READ_ERROR` |
| PUT | `/api/config` | JSON `{ api_keys?, defaults? }` | config enmascarada | 500 `CONFIG_WRITE_ERROR` |
| POST | `/api/sessions` | — | sesión nueva (201, con `segments: []`) | 500 `SESSION_CREATE_ERROR` |
| GET | `/api/sessions` | — | `[{ id, timestamp, preview, has_prompt, has_transcription, has_audio, segment_count }]` (orden desc.) | 500 `SESSION_LIST_ERROR` |
| GET | `/api/sessions/:id` | — | objeto sesión completo | 404 `SESSION_NOT_FOUND`, 500 |
| PUT | `/api/sessions/:id` | JSON parcial (merge) | sesión actualizada | 404 `SESSION_NOT_FOUND`, 500 |
| POST | `/api/sessions/:id/segments` | multipart `audio` (+ `source` opcional) | `{ segment, transcription_raw, session }` | 400 `MISSING_AUDIO` / `MISSING_API_KEY`, 404, 500 `STT_FAILED` |
| POST | `/api/sessions/:id/reprocess` | JSON (vacío) | `{ transcription_raw, session }` | 400 `MISSING_API_KEY` / `NO_AUDIO`, 404, 500 `STT_FAILED` |
| POST | `/api/sessions/:id/transcribe` | multipart `audio` | (alias de `/segments`) | igual que `/segments` |
| POST | `/api/sessions/:id/distill` | JSON (vacío) | `{ prompt_distilled, usage, truncated, session }` | 400 `NO_TRANSCRIPTION` / `MISSING_API_KEY`, 404, 500 `LLM_FAILED` |

> **No existe** endpoint para descargar/servir el audio (`/api/sessions/:id/audio` **no** está implementado). El audio se persiste en disco por segmento, pero la API no lo expone. (Relevante para móvil/web: habría que añadirlo.)

**Detalle de `segments`** (`transcribe.js`): usa `multer` con destino temporal en `tmpdir()/stp-audio`; calcula el siguiente nº de segmento; guarda el audio canónico como `data/audio/<id>__seg-N.webm`; llama a `normalizeForUpload` (ffmpeg opcional → remux/recodifica/trocea, salidas **temporales**); transcribe cada salida y une el texto; mide la duración real con `ffprobe` sobre las salidas normalizadas; añade el segmento con `addSegment` (que recalcula `transcription_raw`); registra `stt_provider`/`stt_model`; limpia temporales en `finally`. **multer no impone límite de tamaño**: con ffmpeg, los audios grandes se trocean; sin ffmpeg, el límite lo impone Groq (~25 MB, 413).

**Detalle de `reprocess`:** re-transcribe el/los audio(s) ya en disco de la sesión (vía `getSegments`, que también cubre sesiones legacy), regenera el texto bruto y `transcription_raw`. Expone en API lo que hacía el script de rescate; sirve para recuperar sesiones cuyo audio quedó sin transcribir o mal transcrito.

**Detalle de `distill`:** sin cambios respecto a v1.0. Usa `transcription_edited` si existe, si no `transcription_raw` (que ahora es la concatenación de segmentos); carga el *system prompt* desde `src/prompts/distill-system.md` (cacheado, con *fallback* embebido); guarda `prompt_distilled`, `llm_provider`, `llm_model`.

### 4.3 Capa de proveedores (`src/providers/`)

**Requisito de diseño firme:** todas las integraciones pasan por clases base abstractas. Sin cambios en v1.1.

- **LLM — `llm/base.js`:** `distill(text, model, systemPrompt) → { prompt, usage: { input_tokens, output_tokens } }` (Anthropic añade `truncated`), más getters `name`, `models` y `validateApiKey()`.
  - Registro/factory en `llm/index.js`: `{ anthropic, gemini }`, `createLLMProvider(name, apiKey)`, `listLLMProviders()`.
  - **`anthropic.js` (implementado):** `@anthropic-ai/sdk`. Modelos: `claude-sonnet-4-6` (por defecto), `claude-opus-4-7`, `claude-haiku-4-5`. **`max_tokens: 16000`**. Valida que la key empiece por `sk-ant-`. No-streaming.
  - **`gemini.js` (stub):** modelos declarados pero `distill()` lanza "no implementado en V1".
- **STT — `stt/base.js`:** `transcribe(audioBuffer, mimeType, model) → { text }`, más getters `name`, `models`.
  - Registro/factory en `stt/index.js`: `{ groq }`, `createSTTProvider(name, apiKey)`, `listSTTProviders()`.
  - **`groq.js` (implementado):** `POST https://api.groq.com/openai/v1/audio/transcriptions` (compatible OpenAI), con `FormData` (`file`, `model`, `language: 'es'` **fijo**, `response_format: 'json'`). Modelos: `whisper-large-v3` (por defecto), `whisper-large-v3-turbo`. Propaga el código de error de Groq (incluido el **413**).

### 4.4 Servicios y utilidades

- **`services/session-store.js`:** además de `createSession()` (ahora inicializa `segments: []`), `getSession(id)`, `updateSession(id, partial)` (merge superficial — clave para que el cambio fuera aditivo) y `listSessions()` (añade `has_transcription`, `has_audio`, `segment_count`), incorpora el modelo multi-segmento:
  - `getSegments(session)` — devuelve `session.segments`, o **sintetiza** un segmento único desde los campos planos para sesiones legacy (retrocompatibilidad sin migración).
  - `recomputeTranscription(segments)` — concatena el texto de los segmentos (`\n\n`); es la **vista materializada** que alimenta `transcription_raw`.
  - `addSegment(id, segment)` — hace push, recalcula `transcription_raw`, espeja `audio_file` = `segments[0].audio_file`, y anexa el texto al `transcription_edited` si existía (para no dejar obsoleta la edición manual).
  - `replaceSegments(id, segments)` — reemplaza la lista (usado por reproceso y por el script de rescate).
  - `nextSegmentNumber(session)` — para nombrar `<id>__seg-N.webm`.
- **`services/audio-normalize.js` (NUEVO, ffmpeg opcional):** `detectFfmpeg()` (cacheado), `probeDuration(path)` (vía `ffprobe`), y `normalizeForUpload(input, { maxBytes })` que devuelve `{ files, cleanup }`:
  - sin ffmpeg → `[input]` (no-op, comportamiento de siempre);
  - con ffmpeg → **remux** `-c copy` (sanea contenedor y **escribe la duración**, que el `.webm` crudo de MediaRecorder no lleva); si excede el límite, **recodifica** a Opus 32 k mono; si aún excede, **trocea** por tiempo. Usa `child_process.execFile` (primer uso de proceso externo en el repo).
- **`services/config-store.js`:** sin cambios. `getConfig()`, `updateConfig()` (merge profundo), `getConfigMasked()`, `isConfigured()` (Anthropic **y** Groq). *Fallback* a `DEFAULTS`.
- **`utils/paths.js`:** **única fuente de verdad** de rutas (`BASE_DIR`, `SESSIONS_DIR`, `AUDIO_DIR`, `CONFIG_FILE`). `ensureDirectories()` crea directorios y migra datos legacy desde `~/.speech-to-prompt/`.

---

## 5. Modelo de datos

Todo en **ficheros JSON locales** dentro de `data/` (gitignored). No hay base de datos ni índices.

```
data/
  config.json                    # claves de API + defaults de proveedor/modelo
  sessions/<id>.json             # una sesión por fichero (con array de segmentos)
  audio/<id>__seg-N.webm         # un audio por segmento (recorded o imported)
  audio/<id>.webm                # (legacy) audio único de sesiones v1.0
```

**ID de sesión:** timestamp ISO con `:` y `.` sustituidos por `-`, truncado a segundos (ej. `2026-06-10T08-47-43`). **Audio por segmento:** `<id>__seg-<n>.webm` (1-based). Las sesiones antiguas conservan su `<id>.webm` único.

**Esquema de sesión (multi-segmento, retrocompatible):**

```jsonc
{
  "id": "2026-06-10T08-47-43",
  "timestamp": "2026-06-10T08:47:43.370Z",
  "segments": [                                  // NUEVO; vacío al crear
    {
      "audio_file": "2026-06-10T08-47-43__seg-1.webm",
      "transcription_raw": "…",                  // salida de Whisper para el tramo
      "transcription_edited": null,
      "duration_seconds": 234,                   // medida real (ffprobe sobre el normalizado)
      "source": "recorded",                      // o "imported"
      "created_at": "2026-06-10T08:51:10.000Z"
    }
  ],
  "transcription_raw": "…",                       // VISTA MATERIALIZADA: concatenación de segmentos
  "transcription_edited": "…",                    // o null (edición del usuario en fase 3)
  "prompt_distilled": "…",                         // o null (salida del LLM)
  "llm_provider": "anthropic", "llm_model": "claude-sonnet-4-6",
  "stt_provider": "groq",      "stt_model": "whisper-large-v3",
  "audio_file": "2026-06-10T08-47-43__seg-1.webm" // espejo de segments[0] para lectores legacy
}
```

> **Retrocompatibilidad:** las ~37 sesiones v1.0 (campos planos, sin `segments`) siguen funcionando sin migrar: `getSegments()` las sintetiza como un segmento, y `transcription_raw` ya existe en ellas. La conversión al nuevo formato ocurre de forma natural si se reprocesan.

**Esquema de config:** (sin cambios)

```json
{
  "api_keys":  { "anthropic": "…", "groq": "…", "google": "" },
  "defaults":  { "llm_provider": "anthropic", "llm_model": "claude-sonnet-4-6",
                 "stt_provider": "groq", "stt_model": "whisper-large-v3" }
}
```

---

## 6. Frontend (SPA vanilla)

- **`public/index.html`:** cabecera fija (Historial, Ajustes), **indicador visual de 4 fases** (Captura · Revisión · Destilación · Resultado), `#phase-container` y paneles laterales `settings`/`history` con overlay. Un único `<script type="module" src="/js/app.js">`.
- **`public/js/app.js` (controlador, máquina de estados):** `state` (`phase`, `sessionId`, `transcriptionRaw`, `promptDistilled`). `goToPhase(phase)` con números 1/3/4/5. La **fase 1 crea la sesión** (de forma perezosa) y devuelve `(sessionId, transcriptionRaw)` al terminar la captura; ya no hay fase 2 independiente. `loadHistoricalSession(id)` reanuda: con `prompt_distilled` → fase 5; con transcripción sin prompt → fase 3; si no, fase 5. `checkFirstRun()` abre Ajustes si faltan claves.
- **Fases (`public/js/phases/`):**
  - **1 Captura (workspace iterativo multi-segmento):** selector de micrófono (persistido en `localStorage`), **medidor de nivel RMS en vivo**, **cronómetro del tramo actual** (etiquetado "tramo actual"), grabar/pausar/reanudar, **Detener** (cierra el tramo → lo transcribe inline → lo añade), **Importar audio** (`<input type=file>` → `/segments` con `source=imported`), lista de segmentos con duración/palabras reales, **transcripción acumulada**, **resumen** (nº segmentos · palabras totales · tiempo total), y **Revisar y destilar** (→ fase 3). Guardas de silencio/tamaño antes de subir (helper compartido). Crea la sesión al confirmar el primer segmento (evita sesiones vacías).
  - **3 Revisión:** textarea editable de la transcripción **unificada** + contador de palabras; guarda `transcription_edited` (PUT) y pasa a destilar.
  - **4 Destilación:** llama a `distill`, muestra spinner, uso de tokens y proveedor/modelo; si `truncated`, avisa.
  - **5 Resultado:** textarea del prompt destilado, **copiar al portapapeles**, guardar (PUT `prompt_distilled`), "Volver a la transcripción" y "Nueva sesión".
- **`public/js/audio-recorder.js`:** clase `AudioRecorder` sobre `MediaRecorder`. mimeType preferido `audio/webm;codecs=opus`, `audioBitsPerSecond: 32000`, `start(250)`, pausa/reanudación con acumulado. **Corregido** el bug de doble conteo: `getElapsedSeconds()` devuelve solo `_elapsedBeforePause` en pausa (antes, parar estando en pausa inflaba la duración con el tiempo de pausa y disparaba una falsa alarma de "audio silencioso"). Helper `formatTime`.
- **`public/js/audio-guards.js` (NUEVO):** heurísticas compartidas `checkAudio(bytes, seconds)` → `ok`/`silent`/`oversize` (antes vivían en la fase 2).
- **`public/js/api-client.js`:** wrapper `fetch`. Métodos: `getConfig`, `updateConfig`, `createSession`, `listSessions`, `getSession`, `updateSession`, **`addSegment(sessionId, blob, {source})`** (multipart → `/segments`), **`reprocess(sessionId)`** (→ `/reprocess`), `distill`.
- **Componentes (`public/js/components/`):** `settings-panel.js` (claves de API, modelos LLM/STT) e `history-panel.js` (lista de sesiones con badge "Completada"/"Sin transcribir"/"Borrador", click para reanudar, y **botón "Reprocesar"** en sesiones con audio en disco → rescate en un clic).
- **Estilos:** `public/css/style.css` (tema claro con variables CSS) — añadidas clases para el workspace de captura (lista de segmentos, resumen, acciones), el botón de reproceso y la etiqueta del cronómetro.
- **APIs de navegador:** `MediaRecorder`, Web Audio, `getUserMedia`/`enumerateDevices`, Clipboard, `localStorage`, `fetch`, `FormData`, `<input type=file>`.

---

## 7. Infraestructura de lanzamiento (Windows)

- **`launcher.vbs`:** ejecuta `launcher.bat` con ventana oculta (arranque silencioso).
- **`launcher.bat`:** comprueba con `curl` si ya hay servidor en `:3000`; si responde 200, abre el navegador y sale; si no, ejecuta **`node --watch server.js`** desde el directorio del proyecto (auto-recarga del backend al cambiar `src/`/`server.js`; los cambios de `public/` se ven al refrescar).
- **`install-shortcut.bat`:** crea el acceso directo en el Escritorio (`Speech to Prompt.lnk`) apuntando a `launcher.vbs`, con **hotkey** (p. ej. `CTRL+ALT+V`); resuelve la ruta del Escritorio vía PowerShell (compatible con OneDrive).
- **Guard en `server.js`** (ver 4.1): complementa al `.bat` evitando segundas instancias.

> Esta capa es **específica de Windows** y desaparecería en un servicio web/móvil; se documenta por completitud y como aprendizaje de UX (arranque de cero fricción).

---

## 8. Decisiones de diseño firmes y su porqué

1. **Abstracción de proveedores LLM/STT** — para cambiar/añadir proveedor sin tocar el resto. El activo arquitectónico más reutilizable.
2. **ffmpeg OPCIONAL (relajación de la regla "cero ffmpeg")** — el audio se graba como WebM/Opus nativo del navegador. Si ffmpeg está instalado, se usa para **sanear el contenedor (escribir duración), comprimir y trocear** audios grandes; si no, se envía tal cual (idéntico a v1.0). Mantiene la portabilidad (ARM) al **degradar con gracia** en vez de exigir el binario.
3. **Multi-segmento con merge de TEXTO (no de audio)** — cada tramo se transcribe por separado y se concatenan los textos. Evita pegar blobs WebM (frágil con pausa/resume), mantiene cada tramo bajo el límite de Groq y aísla fallos por segmento. `transcription_raw` a nivel de sesión es una **vista materializada** para no romper a los consumidores existentes.
4. **Zero-build frontend** — ES modules nativos servidos por Express; cambios en `public/` al refrescar. Sin webpack/vite/TS.
5. **Local-only, sin autenticación** — monousuario en localhost. Las claves se guardan **en claro** en `data/config.json`.
6. **Grabación a 32 kbps Opus** — transparente para Whisper (16 kHz mono), ~4× más ligera; con el troceo opcional de ffmpeg, la duración deja de tener un techo práctico.
7. **Densidad sobre exhaustividad en la destilación** — el *system prompt* (Anexo A) produce un prompt **denso**; `max_tokens = 16000` es techo de seguridad; si se alcanza, se reporta `truncated` y la UI avisa.
8. **Mitigación de alucinaciones de Whisper en audio mudo** — selector de micro + medidor RMS + guarda de bytes/seg. (El bug del cronómetro que disparaba esta alarma en falso al parar en pausa quedó corregido en v1.1.)
9. **Captura iterativa no destructiva** — "Detener para ver la transcripción" cierra un tramo en lugar de terminar la sesión; "Grabar" de nuevo continúa. Resuelve el caso de pausar un dictado largo, releer y retomar el hilo.

---

## 9. Dependencias externas y límites

- **Groq (STT):** Whisper large v3 / v3-turbo. Idioma fijado a `'es'`. Tier gratuito con **límite ~25 MB por fichero** (413). El troceo de ffmpeg lo mitiga cuando está disponible. Sin reintentos ni *backoff*.
- **Anthropic (LLM):** Claude Sonnet 4.6 (por defecto), Opus 4.7, Haiku 4.5. Requiere API key del usuario.
- **ffmpeg/ffprobe (OPCIONAL):** binario del sistema en el PATH. Si falta, la normalización es un no-op y la app funciona como v1.0.
- **Runtime:** Node ≥ 20 (ESM). **4 dependencias** de producción: `@anthropic-ai/sdk`, `express`, `multer`, `open`. Sin dependencias de desarrollo, sin build, sin tests.
- **Scripts:** `npm start` (`node server.js`), `npm run dev` (`node --watch server.js`), `npm run launch` (`launcher.bat`, ahora con `--watch`). `scripts/transcribe-file.js <sessionId> <ruta> [mime]` rescata un audio en disco hacia una sesión (alineado con `replaceSegments`).

---

## 10. Limitaciones y deuda técnica (estado actual)

- **Sin autenticación** y **monousuario**: no hay cuentas ni aislamiento.
- **Local-only** (`127.0.0.1`): sin red, sin CORS, sin rate-limiting, sin HTTPS.
- **Persistencia en ficheros JSON**: sin índices, transacciones ni concurrencia; no escala a muchos usuarios.
- **Claves en claro** en disco.
- **Sin tests, sin CI/CD.**
- **Sin descarga de audio por API.**
- **Manejo de errores básico** (sin reintentos ante fallos de proveedor).
- **Frontend sin framework**: ágil para una SPA pequeña, pero limita móvil y crecimiento de UI.
- **Troceo de audios largos:** ya existe, pero **solo si ffmpeg está instalado**; sin ffmpeg, >25 MB sigue requiriendo dividir el dictado.
- **Edición vs. nuevos segmentos:** si se añade un segmento tras editar a mano la transcripción, el texto del nuevo tramo se **anexa** a la edición (mitigación), pero el flujo asume que la edición fina se hace al terminar de capturar.
- **Cada "Detener para ver" cuesta una transcripción de Groq** (no hay *peek* gratis: Whisper de Groq no es streaming).

---

## 11. Análisis prospectivo: de herramienta local a servicio (móvil + web, multiusuario)

Esta es la sección decisiva para el proyecto de diseño. Se organiza en: qué se reutiliza, qué hay que rehacer, móvil, web, negocio y recomendación.

### 11.1 Qué es reutilizable casi tal cual

- **La abstracción de proveedores LLM/STT** (clases base + registries). El corazón portable; sobrevive a cualquier rediseño de backend.
- **El *system prompt* de destilación** (Anexo A): el activo de producto más valioso y diferencial. Independiente de plataforma.
- **El modelo conceptual de fases y su UX**, incluida ahora la **captura iterativa multi-segmento** y la lógica de reanudación de borradores.
- **Los contratos de API** (Anexo B): buen punto de partida para una API pública, aunque haya que versionar y endurecer. El endpoint `/segments` ya está pensado para subir tramos.
- **Aprendizajes de robustez de audio**: 32 kbps, guardas de tamaño/silencio, anti-alucinación, **normalización/troceo con ffmpeg** y **merge de texto por segmentos**. Aplicables directamente al cliente móvil/web y al backend de servicio.

### 11.2 Qué hay que rehacer o añadir para un SaaS multiusuario

- **Identidad y autenticación.** Inexistente hoy. Necesario: registro/login (OAuth Google/Apple para alinear con móvil), sesiones de usuario, aislamiento multi-tenant.
- **Backend en la nube.** Hoy es un proceso local. Necesario: despliegue gestionado, HTTPS, CORS, **rate-limiting** y *quotas* por usuario.
- **Base de datos real.** Sustituir los JSON por una BD con `usuario → sesiones → segmentos → (audio, transcripción)`, índices y paginación. El modelo multi-segmento actual mapea de forma natural a tablas `sessions` + `segments`.
- **Almacenamiento de audio.** Hoy en disco del servidor y **sin servirse por API**. En la nube: almacenamiento de objetos con URLs firmadas y subida *resumable*/multipart (el troceo por tramos ya encaja con subidas parciales).
- **Gestión de claves y costes — decisión de negocio clave.** Hoy el usuario pone **sus** claves. Para un servicio: (a) claves del servicio con medición/cuotas/planes; (b) BYOK; probablemente híbrido.
- **Seguridad.** Cifrado en reposo de datos y claves, HTTPS, validación/límites de subida (multer hoy no limita), protección de endpoints.
- **Observabilidad y operación.** Logging estructurado, métricas (tokens/minutos por usuario para facturación), trazas, alertas.
- **Robustez de proveedor.** Reintentos con *backoff*, manejo de 429/5xx, *fallback* de modelo. El **chunking real ya existe** (ffmpeg opcional); en servicio convendría hacerlo dependencia firme o resolverlo en cliente.

### 11.3 Apps móviles (Android seguro, iOS casi seguro)

- **Reutilización del backend:** con la API pública, las apps serían **clientes**; transcripción y destilado siguen en servidor. *System prompt* y contratos se reutilizan.
- **Captura de audio nativa:** cada plataforma graba en sus formatos (no se puede asumir WebM/Opus). El backend STT debe aceptar varios formatos y/o normalizar (la capa `audio-normalize` con ffmpeg ya da base para ello); revisar el `mimeType`/extensión que asume `groq.js`.
- **Audios largos:** subida por trozos/resumable y *chunking* de la transcripción (el modelo multi-segmento ya lo favorece).
- **Offline / reintentos:** colas de subida, estado de sesión sincronizable.
- **Tecnología móvil** (a decidir): nativo vs. multiplataforma vs. PWA. La SPA vanilla actual **no** es base para móvil; el frontend habría que rehacerlo.

### 11.4 Web pública

- Frontend web nuevo (framework con build) consumiendo la API pública.
- Despliegue con dominio, CDN, HTTPS y la misma capa de auth/quotas que móvil.
- Una PWA podría unificar parte de web y móvil si se acepta su captura de audio.

### 11.5 Modelo de negocio y coste

- **Costes variables por uso:** minutos de audio (STT) + tokens (LLM); medir por usuario para fijar precio/márgenes.
- **Tiers de proveedor:** el gratuito de Groq no es base de producción.
- **Pricing al cliente:** suscripción y/o por uso; o BYOK con tarifa plana.
- **Control de abuso/coste:** *quotas*, límites por minuto, detección de uso anómalo.

### 11.6 Recomendación estructurada (evolucionar vs. rehacer)

| Pieza | Veredicto para el servicio |
|---|---|
| *System prompt* de destilación | **Reutilizar** (activo central) |
| Abstracción de proveedores LLM/STT | **Reutilizar** (portar a la nube tal cual) |
| Modelo multi-segmento + capa de normalización de audio | **Reutilizar como base** (encaja con BD relacional y subidas resumable) |
| Contratos de API + modelo de fases | **Reutilizar como base**, versionar y endurecer |
| Aprendizajes de audio (32 kbps, guardas, anti-alucinación, troceo) | **Reutilizar** (conocimiento) |
| Backend Express local + ficheros JSON | **Rehacer** (nube + BD + auth + storage) |
| Frontend SPA vanilla | **Rehacer** (framework web + apps móviles) |
| Lanzadores Windows (`.vbs`/`.bat`) | **Descartar** (no aplican a servicio) |

**Lectura:** lo que da valor diferencial (la destilación calibrada, la abstracción de proveedores y ahora el núcleo de captura/normalización multi-segmento) es ligero y portable; lo que hay que rehacer es la "infraestructura de producto" (auth, nube, BD, storage, clientes). El camino más razonable sigue siendo **"rehacer la cáscara, conservar el núcleo"**: nuevo backend de servicio y nuevos clientes, reutilizando el *system prompt*, la lógica de proveedores y los aprendizajes. Dado el tamaño del cambio, **partir de un proyecto nuevo importando el núcleo** suele ser más limpio que evolucionar el actual in situ.

---

## 12. Inventario de archivos (sin `node_modules` ni `data/`)

```
speech-to-prompt/
├── server.js                         # Express + single-instance guard (~79)
├── launcher.vbs / launcher.bat       # arranque silencioso Windows (bat usa --watch)
├── install-shortcut.bat              # acceso directo + hotkey
├── package.json                      # ESM, 4 deps, sin build/tests
├── CLAUDE.md                         # guía para Claude Code (arquitectura/decisiones)
├── .gitignore                        # ignora node_modules/, data/, .claude/
├── src/
│   ├── routes/        config.js · sessions.js · transcribe.js(segments/reprocess/alias) · distill.js
│   ├── providers/
│   │   ├── llm/        base.js · index.js · anthropic.js · gemini.js(stub)
│   │   └── stt/        base.js · index.js · groq.js
│   ├── services/      session-store.js(multi-segmento) · config-store.js · audio-normalize.js(NUEVO, ffmpeg opc.)
│   ├── utils/         paths.js
│   └── prompts/       distill-system.md   ← activo de producto (Anexo A)
├── public/
│   ├── index.html(4 fases) · css/style.css
│   └── js/
│       ├── app.js · api-client.js · audio-recorder.js · audio-guards.js(NUEVO)
│       ├── phases/    phase1-capture(workspace) · phase3-review-raw · phase4-distill · phase5-result
│       └── components/ settings-panel · history-panel(+reprocesar)
├── scripts/           transcribe-file.js   # rescate de audio en disco (→ replaceSegments)
└── docs/              (análisis/diseño inicial + este documento)
```

Tamaño aproximado: ~2.000 líneas de fuente (backend ~650, frontend ~1.350), JavaScript ESM + HTML + CSS + Markdown.

---

## 13. Historial y estado de git

- Rama única **`main`**, remoto `https://github.com/JotaLopezXenix/speech-to-prompt.git`.
- Hitos:
  1. `feat: initial release of Speech-to-Prompt v1` — flujo de 5 fases, abstracción de proveedores, frontend zero-build.
  2. `chore: refresh Claude model catalog to 4.6/4.7 family`.
  3. `feat: add silent launcher and single-instance guard`.
  4. `fix: prevent Whisper silent-audio hallucinations in capture phase`.
  5. `feat: handle long dictations without hitting Groq's 25MB limit` — 32 kbps, mensaje 413 amigable, reanudación en fase 3, `scripts/transcribe-file.js`.
  6. `fix: raise distillation max_tokens to avoid truncated prompts` — 2048 → 16000.
  7. `fix: stop distilled prompts from truncating; restore missing model field`.
  8. (commits de afinado de la destilación y botón "Volver a la transcripción").
  9. **Evolución multi-segmento (2026-06-10, en la rama de trabajo):** sesiones con `segments[]` y `transcription_raw` como vista materializada; captura iterativa no destructiva (fase 1 como workspace, absorbe la antigua fase 2); endpoints `/segments` y `/reprocess`; capa `audio-normalize` con ffmpeg opcional (remux/recodifica/trocea); importación de audio y reproceso desde el historial; corrección del bug del cronómetro al parar en pausa; lanzador en modo `--watch`.

---

## Anexo A — System prompt de destilación (verbatim)

> Fuente: `src/prompts/distill-system.md`. Es el activo calibrado del producto; reproducido íntegro para el rediseño.

```markdown
Eres un destilador de prompts. Recibes transcripciones brutas de voz de un arquitecto de software senior que habla español con abundante terminología técnica en inglés (code-switching, acrónimos, anglicismos, siglas deletreadas).

Tu tarea: transformar la transcripción desestructurada en un prompt limpio, denso y bien estructurado. Este prompt se pegará en Claude (Opus, extended thinking, modo socrático) para iniciar una conversación de diseño en profundidad.

## Reglas

- **Solo el prompt destilado.** Sin preámbulo, sin comentarios, sin "Aquí tienes el prompt:".
- **Preserva el idioma del usuario:** base en español con términos técnicos en inglés tal como se usaron.
- **Corrige artefactos de transcripción de siglas deletreadas:**
  - "ele ele eme" → "LLM"
  - "a pe i" → "API"
  - "e ese be" → "ESB"
  - "i de pe" → "IDP"
  - "o auth" / "o a u t" → "OAuth"
  - Aplica el mismo criterio a cualquier sigla deletreada que identifiques.
- **Elimina:** muletillas, arranques en falso, repeticiones, autocorrecciones verbales, divagaciones sin valor sustantivo.
- **Reestructura** en flujo lógico. Usa secciones o listas si el contenido tiene partes diferenciadas.
- **Densidad sobre exhaustividad.** Conserva todos los puntos *sustantivos distintos* (requisitos, restricciones, contexto, decisiones, dudas del usuario), pero exprésalos de la forma más compacta posible: funde ideas relacionadas, no reproduzcas el dictado casi literal y no repitas ejemplos ni reformulaciones. El resultado es un **punto de partida denso para una conversación con Claude**, no una transcripción reestructurada.
- **No añadas** análisis, sugerencias ni opiniones propias. Eres un destilador, no un consultor.
- **Densifica:** cada frase debe aportar información. Elimina redundancias y circunloquios.
- **Longitud:** tan breve como sea posible sin perder ningún punto sustantivo. En dictados largos, comprime con más agresividad (más fusión de ideas, menos detalle por punto); en dictados cortos, una destilación cercana al contenido es aceptable. La densidad prima siempre sobre la longitud.
- **Ambigüedades:** si algo es ambiguo, mantén la interpretación más probable sin señalarlo. El usuario ajustará manualmente.
```

---

## Anexo B — Contratos de API (detalle)

**Convenciones:** base `/api`. Errores con forma `{ "error": { "code": "...", "message": "..." } }`.

### Config
- `GET /api/config` → `{ config (keys enmascaradas), llmProviders: [{id, models}], sttProviders: [{id, models}], configured: boolean }`.
- `PUT /api/config` ← `{ api_keys?, defaults? }` → config enmascarada (merge).

### Sessions
- `POST /api/sessions` → 201, sesión nueva (`segments: []`, resto `null` salvo `id`/`timestamp`).
- `GET /api/sessions` → `[{ id, timestamp, preview, has_prompt, has_transcription, has_audio, segment_count }]` (orden desc.).
- `GET /api/sessions/:id` → objeto sesión completo | 404.
- `PUT /api/sessions/:id` ← JSON parcial (merge) → sesión actualizada | 404. Campos típicos: `transcription_edited`, `prompt_distilled`.

### Segments (captura/importación)
- `POST /api/sessions/:id/segments` (multipart, campo `audio`; campo de texto opcional `source` = `recorded`|`imported`) → `{ segment, transcription_raw, session }`. Normaliza con ffmpeg si está disponible (remux/recodifica/trocea), transcribe y añade el segmento; `transcription_raw` es la transcripción unificada.
- `POST /api/sessions/:id/transcribe` — **alias histórico** del anterior (mismo comportamiento).
- Errores: 400 `MISSING_AUDIO` / `MISSING_API_KEY`, 404 `SESSION_NOT_FOUND`, 500 `STT_FAILED`.

### Reprocess (rescate)
- `POST /api/sessions/:id/reprocess` (JSON vacío) → `{ transcription_raw, session }`. Re-transcribe el/los audio(s) en disco de la sesión y regenera la transcripción.
- Errores: 400 `MISSING_API_KEY` / `NO_AUDIO`, 404 `SESSION_NOT_FOUND`, 500 `STT_FAILED`.

### Distill
- `POST /api/sessions/:id/distill` (JSON vacío) → `{ prompt_distilled, usage: {input_tokens, output_tokens}, truncated, session }`. `truncated` es `true` si la salida alcanzó `max_tokens`.
- Errores: 400 `NO_TRANSCRIPTION` / `MISSING_API_KEY`, 404 `SESSION_NOT_FOUND`, 500 `LLM_FAILED`.

### Firmas de los proveedores (para portar el núcleo)
- LLM: `distill(text, model, systemPrompt) → { prompt, truncated, usage: { input_tokens, output_tokens } }`.
- STT: `transcribe(audioBuffer, mimeType, model) → { text }`.
- Factories: `createLLMProvider(name, apiKey)`, `createSTTProvider(name, apiKey)`; listados: `listLLMProviders()`, `listSTTProviders()`.
- Normalización (servidor): `normalizeForUpload(input, { maxBytes }) → { files, cleanup }`, `probeDuration(path)`, `detectFfmpeg()`.
