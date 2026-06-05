# Speech-to-Prompt — Estado actual (as-built) y análisis para producto

**Fecha:** 2026-06-05
**Versión del producto descrita:** v1.0.0 (rama `main`, repo `github.com/JotaLopezXenix/speech-to-prompt`)
**Propósito de este documento:** dar al proyecto de diseño en Claude una descripción precisa y completa de lo que existe HOY, más un análisis prospectivo de qué haría falta para convertirlo en un **servicio vendible a terceros** (app móvil Android/iOS + web pública), de modo que se pueda decidir con fundamento **evolucionar esta aplicación o rehacer una nueva** tomándola como aprendizaje.

> **Trazabilidad.** Este documento continúa los dos documentos de diseño originales que están en esta misma carpeta:
> - `docs/Speech-to-prompt. Análisis y diseño inicial - 20260409.md`
> - `docs/Speech-to-prompt. Diseño solo Windows en local - 20260410.md`
>
> Aquí se describe **lo construido** a partir de aquel diseño, señalando dónde la implementación final se desvió de la propuesta inicial (notablemente: el diseño inicial sugería autenticación con Google; la v1 quedó **local sin autenticación**).

> **Nota de seguridad.** Este documento **no contiene ninguna API key ni secreto de acceso**. Las claves viven en `data/config.json`, que está gitignored y fuera de este documento. Sí se incluye, en el Anexo A, el *system prompt* de destilación: es lógica de producto (un activo calibrado), no un secreto de acceso.

---

## 1. Resumen ejecutivo

**Speech-to-Prompt** es una herramienta web **local, monousuario**, que convierte un **dictado de voz** en un **prompt limpio, denso y estructurado** listo para pegar en Claude (Opus, modo extended thinking / socrático) e iniciar una conversación de diseño.

- **Stack:** Node.js (≥20, ESM) + Express en el backend; frontend **SPA en JavaScript vanilla** (ES modules nativos, **sin framework y sin build**) servido estáticamente por el propio Express.
- **Flujo de 5 fases:** `1-captura → 2-transcripción → 3-revisión → 4-destilación → 5-resultado`.
- **Cadena de IA:** el navegador graba audio (WebM/Opus) → se transcribe con **Groq Whisper** → la transcripción se destila a prompt con **Anthropic Claude**.
- **Persistencia:** ficheros **JSON locales** (una sesión por fichero) + el audio en disco. Sin base de datos.
- **Ejecución:** `127.0.0.1` (solo localhost), arranque silencioso en Windows con atajo de teclado, *single-instance guard* y *fallback* de puerto.
- **Madurez:** v1.0.0 en uso personal real y continuado (decenas de sesiones desde 2026-04). Código pequeño (~1.700–1.800 líneas de fuente), 4 dependencias npm, **sin tests ni CI**.

El producto resuelve bien un problema concreto para **un** usuario en **su** máquina. Convertirlo en servicio multiusuario es un salto de arquitectura (auth, nube, base de datos, gestión de claves/costes), no una ampliación incremental — se detalla en la sección 11.

---

## 2. Propósito y perfil de usuario

### 2.1 Problema que resuelve

Capturar pensamiento de diseño hablando con naturalidad (sin estructura previa) y obtener automáticamente un **prompt de alta densidad** que sirva de punto de partida para una conversación profunda con Claude. Evita el coste de teclear y estructurar manualmente ideas dictadas.

### 2.2 Perfil del usuario (para el que está calibrado)

- Arquitecto de software senior, en transición hacia *AI Solutions Architect*.
- Ecosistema principal: Anthropic (Claude, Claude Code, API).
- **Habla español con abundante terminología técnica en inglés** (code-switching, anglicismos) y **deletrea siglas** ("ele ele eme" → "LLM", "a pe i" → "API").
- El *system prompt* de destilación (Anexo A) está específicamente calibrado para este perfil: preserva el español con términos en inglés, corrige siglas deletreadas, elimina muletillas y densifica, **sin añadir opinión propia**.

### 2.3 Requisitos de plataforma del diseño original

El análisis inicial planteaba funcionar en **Windows 11 Pro (x86)**, **Windows 11 Home ARM (Surface Pro, Snapdragon X Plus)** y **Android (Chrome)**. La v1 construida es **web local** servida en localhost; en la práctica corre en navegador (cualquier plataforma con un navegador moderno apuntando al servidor local), con **utilidades de lanzamiento específicas de Windows**. La compatibilidad ARM motivó una decisión firme: **no usar ffmpeg** (ver 8).

---

## 3. Arquitectura general

```
┌─────────────────────────── Navegador (SPA vanilla) ───────────────────────────┐
│  Fase 1 Captura        Fase 2 Transcripción     Fase 3 Revisión                │
│  MediaRecorder ──────► POST /transcribe ──┐     (editar texto)                 │
│  (WebM/Opus 32kbps)                       │                                    │
│  Fase 4 Destilación    Fase 5 Resultado   │                                    │
│  POST /distill ◄───────(copiar prompt)    │                                    │
└───────────────────────────────────────────┼────────────────────────────────────┘
                                            │ HTTP (localhost)
┌──────────────────────── Backend Express (127.0.0.1) ──────────┼──────────────────┐
│  /api/config   /api/sessions   /api/sessions/:id/transcribe   /…/distill         │
│        │              │                  │                          │            │
│  config-store    session-store     STT provider (Groq)       LLM provider (Anthropic)
│        │              │                  │                          │            │
│   data/config.json  data/sessions/*.json │                          │            │
│                     data/audio/*.webm  ──┘                          │            │
└──────────────────────────────────────────┼──────────────────────────┼────────────┘
                                            │                          │
                                   ┌────────▼────────┐        ┌────────▼─────────┐
                                   │  Groq Whisper   │        │ Anthropic Claude │
                                   │  (STT, nube)    │        │   (LLM, nube)    │
                                   └─────────────────┘        └──────────────────┘
```

**Características arquitectónicas clave:**

- Backend Express minimalista que (a) sirve el frontend estático desde `public/` y (b) expone una API JSON pequeña.
- Frontend SPA: un único punto de entrada (`app.js`) que importa módulos ES nativos; **el navegador carga los `.js` directamente, sin bundler**.
- **Abstracción de proveedores** (requisito firme de diseño): toda integración LLM y STT pasa por clases base; añadir un proveedor = un fichero nuevo + una línea en el registro.
- Sin base de datos, sin autenticación, sin estado de servidor más allá de los ficheros en `data/`.

---

## 4. Backend

### 4.1 `server.js` (punto de entrada, ~79 líneas)

- **Express** con `express.json()` y `express.static('public')`.
- **Montaje de rutas:**
  - `/api/config` → `configRouter`
  - `/api/sessions` → `sessionsRouter`, `transcribeRouter`, `distillRouter` (los tres montados bajo el mismo prefijo).
- **Fallback SPA:** `app.get('*')` devuelve `public/index.html` para cualquier ruta no-API.
- **Arranque con fallback de puerto:** intenta `3000`; si `EADDRINUSE` y `port < 3010`, prueba el siguiente (3000→3009). Escucha en **`127.0.0.1`** (solo localhost).
- **Single-instance guard:** antes de arrancar, hace `fetch('http://localhost:3000')` con timeout de 500 ms; si responde, asume que ya hay una instancia, **abre el navegador y termina** (`process.exit(0)`). Si no, arranca el servidor.
- **Apertura automática del navegador** con el paquete `open`.
- Llama a `ensureDirectories()` al inicio (crea `data/`, `data/sessions/`, `data/audio/` y migra datos legacy si procede).

### 4.2 Superficie de API (8 endpoints — verificado contra el código)

| Método | Ruta | Entrada | Salida (200) | Errores |
|---|---|---|---|---|
| GET | `/api/config` | — | `{ config (enmascarado), llmProviders, sttProviders, configured }` | 500 `CONFIG_READ_ERROR` |
| PUT | `/api/config` | JSON `{ api_keys?, defaults? }` | config enmascarada | 500 `CONFIG_WRITE_ERROR` |
| POST | `/api/sessions` | — | sesión nueva (201) | 500 `SESSION_CREATE_ERROR` |
| GET | `/api/sessions` | — | `[{ id, timestamp, preview, has_prompt }]` (orden desc.) | 500 `SESSION_LIST_ERROR` |
| GET | `/api/sessions/:id` | — | objeto sesión completo | 404 `SESSION_NOT_FOUND`, 500 |
| PUT | `/api/sessions/:id` | JSON parcial (merge) | sesión actualizada | 404 `SESSION_NOT_FOUND`, 500 |
| POST | `/api/sessions/:id/transcribe` | multipart, campo `audio` | `{ transcription_raw, session }` | 400 `MISSING_AUDIO` / `MISSING_API_KEY`, 404, 500 `STT_FAILED` |
| POST | `/api/sessions/:id/distill` | JSON (vacío) | `{ prompt_distilled, usage, truncated, session }` | 400 `NO_TRANSCRIPTION` / `MISSING_API_KEY`, 404, 500 `LLM_FAILED` |

> **No existe** endpoint para descargar/servir el audio (`/api/sessions/:id/audio` **no** está implementado). El audio se persiste en disco durante la transcripción, pero la API no lo expone. (Relevante para móvil/web: habría que añadirlo.)

**Detalle de `transcribe`:** usa `multer` con destino temporal en `tmpdir()/stp-audio`; copia el fichero a `data/audio/{id}.webm`; lee el buffer; llama al proveedor STT; actualiza la sesión con `audio_file`, `transcription_raw`, `stt_provider`, `stt_model`; borra el temporal en `finally`. **No hay límite de tamaño configurado en multer**: el límite efectivo lo impone Groq (~25 MB, devuelve 413).

**Detalle de `distill`:** usa `transcription_edited` si existe, si no `transcription_raw`; carga el *system prompt* desde `src/prompts/distill-system.md` (cacheado en memoria al iniciar, con *fallback* embebido si falta el fichero); llama al proveedor LLM; guarda `prompt_distilled`, `llm_provider`, `llm_model`.

### 4.3 Capa de proveedores (`src/providers/`)

**Requisito de diseño firme:** todas las integraciones pasan por clases base abstractas.

- **LLM — `llm/base.js`:** `distill(text, model, systemPrompt) → { prompt, usage: { input_tokens, output_tokens } }` (la implementación Anthropic añade además `truncated`), más getters `name`, `models` y `validateApiKey()`.
  - Registro/factory en `llm/index.js`: `{ anthropic, gemini }`, `createLLMProvider(name, apiKey)`, `listLLMProviders()`.
  - **`anthropic.js` (implementado):** usa `@anthropic-ai/sdk`. Modelos: `claude-sonnet-4-6` (por defecto), `claude-opus-4-7`, `claude-haiku-4-5`. **`max_tokens: 16000`** (subido desde 2048, que truncaba prompts largos). Valida que la key empiece por `sk-ant-`. Llamada no-streaming.
  - **`gemini.js` (stub):** modelos declarados (`gemini-2.0-flash`, `gemini-2.5-pro`) pero `distill()` lanza "no implementado en V1".
- **STT — `stt/base.js`:** `transcribe(audioBuffer, mimeType, model) → { text }`, más getters `name`, `models`.
  - Registro/factory en `stt/index.js`: `{ groq }`, `createSTTProvider(name, apiKey)`, `listSTTProviders()`.
  - **`groq.js` (implementado):** `POST https://api.groq.com/openai/v1/audio/transcriptions` (compatible OpenAI), con `FormData` (`file`, `model`, `language: 'es'` **fijo**, `response_format: 'json'`), header `Authorization: Bearer`. Modelos: `whisper-large-v3` (por defecto), `whisper-large-v3-turbo`. Detecta extensión por mimeType. Propaga el código de error de Groq (incluido el **413**).

### 4.4 Servicios y utilidades

- **`services/session-store.js`:** `createSession()`, `getSession(id)`, `updateSession(id, partial)` (merge), `listSessions()` (lee todos los JSON, devuelve `{id, timestamp, preview, has_prompt}` ordenado por timestamp desc.). ID = `new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)`. Persistencia: JSON indentado, UTF-8.
- **`services/config-store.js`:** `getConfig()`, `updateConfig(partial)` (merge profundo de `api_keys` y `defaults`), `getConfigMasked()` (enmascara keys salvo últimos 4), `isConfigured()` (true si hay key de Anthropic **y** de Groq). *Fallback* a `DEFAULTS` si el fichero no existe o está corrupto.
- **`utils/paths.js`:** **única fuente de verdad** de rutas (`BASE_DIR=<root>/data`, `SESSIONS_DIR`, `AUDIO_DIR`, `CONFIG_FILE`). `ensureDirectories()` crea los directorios y **migra** datos legacy desde `~/.speech-to-prompt/` si existe y `data/config.json` aún no.

---

## 5. Modelo de datos

Todo en **ficheros JSON locales** dentro de `data/` (gitignored). No hay base de datos ni índices.

```
data/
  config.json            # claves de API + defaults de proveedor/modelo
  sessions/<id>.json     # una sesión por fichero
  audio/<id>.webm        # audio crudo por sesión
```

**ID de sesión / nombre de audio:** timestamp ISO con `:` y `.` sustituidos por `-`, truncado a segundos. Ej.: `2026-06-05T11-17-38` → `data/sessions/2026-06-05T11-17-38.json` y `data/audio/2026-06-05T11-17-38.webm`.

**Esquema de sesión (10 campos):**

```json
{
  "id": "2026-06-05T11-17-38",
  "timestamp": "2026-06-05T11:17:38.936Z",
  "audio_file": "2026-06-05T11-17-38.webm",   // o null
  "transcription_raw": "…",                     // o null  (salida de Whisper)
  "transcription_edited": "…",                  // o null  (edición del usuario en fase 3)
  "prompt_distilled": "…",                       // o null  (salida del LLM)
  "llm_provider": "anthropic",                   // o null
  "llm_model": "claude-sonnet-4-6",              // o null
  "stt_provider": "groq",                        // o null
  "stt_model": "whisper-large-v3"                // o null
}
```

**Esquema de config:**

```json
{
  "api_keys":  { "anthropic": "…", "groq": "…", "google": "" },
  "defaults":  {
    "llm_provider": "anthropic",
    "llm_model":    "claude-sonnet-4-6",
    "stt_provider": "groq",
    "stt_model":    "whisper-large-v3"
  }
}
```

---

## 6. Frontend (SPA vanilla)

- **`public/index.html`:** cabecera fija (botones Historial y Ajustes), **indicador visual de las 5 fases**, `#phase-container` (donde se renderiza cada fase), y paneles laterales `settings` e `history` con overlay. Carga un único `<script type="module" src="/js/app.js">`.
- **`public/js/app.js` (controlador, máquina de estados):** objeto `state` (`phase`, `sessionId`, `audioBlob`, `audioDuration`, `transcriptionRaw`, `promptDistilled`). `goToPhase(phase)` renderiza el módulo de cada fase con callbacks `onComplete`. La sesión se crea en backend **tras** grabar (al pasar de fase 1 a 2). `resetApp()` reinicia. `loadHistoricalSession(id)` reanuda una sesión histórica: si tiene `prompt_distilled` → fase 5; si tiene transcripción pero no prompt → **fase 3** (revisión); si no, fase 5. `checkFirstRun()` abre Ajustes si no hay claves configuradas.
- **Fases (`public/js/phases/`):**
  - **1 Captura:** selector de micrófono (persistido en `localStorage`), **medidor de nivel RMS en vivo** (Web Audio API), grabar/parar, pausa/reanudación, contador de duración, detección de micro mudo. Devuelve `audioBlob` + duración.
  - **2 Transcripción:** **guardas previas** — si bytes/seg es muy bajo avisa de "audio silencioso" (Whisper alucina con audio mudo); si el blob supera ~24 MB avisa de límite de Groq. Ambas con opción "Enviar igualmente". Sube vía multipart; al recibir, muestra preview. En error **413** muestra mensaje amigable en español (no el error crudo).
  - **3 Revisión:** textarea editable de la transcripción + contador de palabras; guarda `transcription_edited` (PUT) y pasa a destilar.
  - **4 Destilación:** llama a `distill`, muestra spinner y luego el uso de tokens y proveedor/modelo; si la respuesta llegó al tope (`truncated`), avisa de que el prompt puede estar incompleto en vez de guardarlo en silencio.
  - **5 Resultado:** textarea del prompt destilado, **copiar al portapapeles**, guardar cambios (PUT `prompt_distilled`), y "Nueva sesión".
- **`public/js/audio-recorder.js`:** clase `AudioRecorder` sobre `MediaRecorder`. mimeType preferido `audio/webm;codecs=opus` (con *fallbacks*), **`audioBitsPerSecond: 32000`**, `start(250)` (chunks cada 250 ms), pausa/reanudación con acumulado de tiempo, `stop()→Blob`, `getElapsedSeconds()`. Helper `formatTime`.
- **`public/js/api-client.js`:** wrapper `fetch` con base `/api`. Métodos: `getConfig`, `updateConfig`, `createSession`, `listSessions`, `getSession`, `updateSession`, `transcribe` (multipart), `distill`. Lanza `Error` con el mensaje del backend en respuestas no-OK.
- **Componentes (`public/js/components/`):** `settings-panel.js` (claves de API en campos password —Google deshabilitado/stub—, selección de modelo LLM y STT; solo envía claves si se escriben) e `history-panel.js` (lista de sesiones con badge "Completada"/"Borrador", click para reanudar).
- **Estilos:** `public/css/style.css` (tema claro con variables CSS, ~360–415 líneas). Sin framework CSS.
- **APIs de navegador usadas:** `MediaRecorder`, Web Audio (`AudioContext`/`AnalyserNode`), `getUserMedia`/`enumerateDevices`, Clipboard, `localStorage`, `fetch`, `FormData`. Requiere navegador moderno (Chromium/Firefox/Safari recientes).

---

## 7. Infraestructura de lanzamiento (Windows)

- **`launcher.vbs`:** ejecuta `launcher.bat` con ventana oculta (arranque "silencioso", sin terminal visible).
- **`launcher.bat`:** comprueba con `curl` si ya hay servidor en `:3000`; si responde 200, abre el navegador y sale; si no, ejecuta `node server.js` desde el directorio del proyecto.
- **`install-shortcut.bat`:** crea un acceso directo en el Escritorio (`Speech to Prompt.lnk`) apuntando a `launcher.vbs`, con **hotkey** (p. ej. `CTRL+ALT+V`); resuelve la ruta real del Escritorio vía PowerShell (compatible con OneDrive).
- **Guard en `server.js`** (ver 4.1): complementa al `.bat` evitando segundas instancias.

> Esta capa es **específica de Windows** y desaparecería en un servicio web/móvil; se documenta por completitud y como aprendizaje de UX (arranque de cero fricción).

---

## 8. Decisiones de diseño firmes y su porqué

1. **Abstracción de proveedores LLM/STT** — para poder cambiar/añadir proveedor sin tocar el resto. Es el activo arquitectónico más reutilizable.
2. **Cero ffmpeg** — el audio se graba como WebM/Opus nativo del navegador y se envía **sin conversión**. Intencional por **compatibilidad con Windows ARM** (evita binario nativo). Implicación: el chunking/recompresión de audios largos no es trivial en cliente.
3. **Zero-build frontend** — ES modules nativos servidos por Express; cambios en `public/` se ven al refrescar. Sin webpack/vite/TS.
4. **Local-only, sin autenticación** — la v1 final es monousuario en localhost (el diseño inicial sí sugería Google sign-in). Las claves se guardan **en claro** en `data/config.json`.
5. **Grabación a 32 kbps Opus** — transparente para Whisper (que reduce a 16 kHz mono), ~4× más ligero que el ~128 kbps por defecto del navegador; sube el techo de duración a ~2 h bajo el límite de ~25 MB de Groq.
6. **Densidad sobre exhaustividad en la destilación** — el *system prompt* (Anexo A) instruye a producir un prompt **denso** (funde ideas, no reproduce el dictado casi literal), de modo que la salida se autolimita; es un punto de partida para conversar, no una transcripción reestructurada. `max_tokens = 16000` actúa solo como **techo de seguridad** (un tope previo de 2048 cortaba a media palabra; el problema de fondo no se resolvía subiendo el tope sino con el contrato de densidad). Si aun así se alcanzara el tope, el proveedor reporta `truncated` y la UI **avisa** en lugar de guardar un prompt cortado en silencio.
7. **Mitigación de alucinaciones de Whisper en audio mudo** — selector de micro + medidor RMS + guarda de bytes/seg, porque con audio silencioso Whisper inventa frases tipo "Gracias por ver el vídeo".

---

## 9. Dependencias externas y límites

- **Groq (STT):** Whisper large v3 / v3-turbo. Idioma fijado a `'es'`. Tier gratuito con **límite ~25 MB por fichero** (devuelve 413). Sin reintentos ni *backoff*.
- **Anthropic (LLM):** Claude Sonnet 4.6 (por defecto), Opus 4.7, Haiku 4.5. Requiere API key válida del usuario.
- **Runtime:** Node ≥ 20 (ESM). **4 dependencias** de producción: `@anthropic-ai/sdk`, `express`, `multer`, `open`. Sin dependencias de desarrollo, sin build, sin tests.
- **Scripts:** `npm start` (`node server.js`), `npm run dev` (`node --watch server.js`), `npm run launch` (`launcher.bat`). Utilidad `scripts/transcribe-file.js <sessionId> <ruta> [mime]` para transcribir un audio ya en disco hacia una sesión (rescate de grabaciones atascadas).

---

## 10. Limitaciones y deuda técnica (estado actual)

- **Sin autenticación** y **monousuario**: no hay concepto de cuenta, sesión de usuario ni aislamiento.
- **Local-only** (`127.0.0.1`): no accesible en red; sin CORS, sin rate-limiting, sin HTTPS.
- **Persistencia en ficheros JSON**: sin índices, transacciones, concurrencia ni backup; no escala a muchos usuarios/sesiones.
- **Claves en claro** en disco.
- **Sin tests, sin CI/CD.**
- **Sin descarga de audio por API** (el audio queda en disco pero no se sirve).
- **Manejo de errores básico** (mensajes genéricos; sin reintentos ante fallos de proveedor).
- **Frontend sin framework**: ágil para una SPA pequeña, pero limita reutilización en móvil y crecimiento de UI.
- **Audios muy largos**: aunque 32 kbps sube el techo a ~2 h, no hay *chunking* real; >25 MB sigue requiriendo intervención.

---

## 11. Análisis prospectivo: de herramienta local a servicio (móvil + web, multiusuario)

Esta es la sección decisiva para el proyecto de diseño. Se organiza en: qué se reutiliza, qué hay que rehacer, móvil, web, negocio y recomendación.

### 11.1 Qué es reutilizable casi tal cual

- **La abstracción de proveedores LLM/STT** (clases base + registries). Es el corazón portable; sobrevive a cualquier rediseño de backend.
- **El *system prompt* de destilación** (Anexo A): el activo de producto más valioso y diferencial. Independiente de plataforma.
- **El modelo conceptual de 5 fases y su UX** (capturar → transcribir → revisar → destilar → resultado), incluida la lógica de reanudación de borradores.
- **Los contratos de API** (Anexo B): un buen punto de partida para una API pública, aunque haya que versionar y endurecer.
- **Aprendizajes de robustez de audio**: 32 kbps, guardas de tamaño/silencio, mitigación de alucinaciones. Aplicables directamente al cliente móvil/web.

### 11.2 Qué hay que rehacer o añadir para un SaaS multiusuario

- **Identidad y autenticación.** Inexistente hoy. Necesario: registro/login (el diseño inicial ya apuntaba a Google sign-in; valorar OAuth con Google/Apple para alinear con móvil), sesiones de usuario, y aislamiento de datos por usuario (multi-tenant).
- **Backend en la nube.** Hoy es un proceso local en localhost. Necesario: despliegue gestionado (contenedor/serverless), HTTPS, CORS, **rate-limiting** y *quotas* por usuario.
- **Base de datos real.** Sustituir los ficheros JSON por una BD (relacional o documental) con el concepto **usuario → sesiones → (audio, transcripción, prompt)**, índices, y consultas de historial paginadas. Migrar el esquema de sesión actual (sección 5) a tablas/colecciones con `user_id`.
- **Almacenamiento de audio.** Hoy el audio se guarda en el disco del servidor y **ni siquiera se sirve por API**. En la nube: almacenamiento de objetos (S3/GCS/Blob) con URLs firmadas, ciclo de vida/retención, y un endpoint de subida pensado para clientes remotos (idealmente *resumable*/multipart para audios largos).
- **Gestión de claves y costes — decisión de negocio clave.** Hoy el usuario pone **sus propias** claves de Groq/Anthropic. Para un servicio hay dos modelos:
  - **(a) Claves del servicio** (el proveedor paga STT+LLM y cobra al cliente): requiere medición de uso, cuotas, planes y control de abuso. Mejor experiencia, más riesgo/coste operativo.
  - **(b) BYOK (*bring your own key*)**: el cliente pone sus claves; menos riesgo de coste pero peor onboarding y fricción.
  - Probablemente un híbrido (plan gratuito limitado con claves del servicio + opción BYOK para power users).
- **Seguridad.** Cifrado en reposo de datos sensibles y claves (nada en claro), HTTPS extremo a extremo, validación/límites de subida (hoy multer no limita tamaño), protección de los endpoints.
- **Observabilidad y operación.** Logging estructurado, métricas de uso (tokens/minutos de audio por usuario para facturación), trazas de error, alertas. Hoy inexistente.
- **Robustez de proveedor.** Reintentos con *backoff*, manejo de 429/5xx, *fallback* de modelo, y **chunking real de audios largos** (lo que hoy se evita por la regla "cero ffmpeg" habrá que resolverlo en servidor o con un decodificador en cliente).

### 11.3 Apps móviles (Android seguro, iOS casi seguro)

- **Reutilización del backend:** si se construye la API pública (11.2), las apps móviles serían **clientes** de esa API; el destilado y la transcripción siguen en servidor. El *system prompt* y los contratos se reutilizan.
- **Captura de audio nativa:** cada plataforma graba en sus formatos (Android: típicamente AAC/M4A o Opus; iOS: AAC/M4A). **No se puede asumir WebM/Opus** como en el navegador. Implicación: el backend STT debe aceptar varios formatos (Groq acepta varios) y/o normalizar; revisar el `mimeType`/extensión que hoy asume `groq.js`.
- **Audios largos:** imprescindible **subida por trozos**/resumable y posiblemente *chunking* de la transcripción, dado el límite de Groq y las redes móviles.
- **Offline / reintentos:** colas de subida, estado de sesión sincronizable.
- **Decisión de tecnología móvil** (a tomar en el proyecto Claude): nativo por plataforma vs. multiplataforma (p. ej. React Native/Flutter) vs. PWA. La SPA vanilla actual **no** es base para móvil; el frontend habría que rehacerlo.

### 11.4 Web pública

- Frontend web nuevo (framework con build, a diferencia del vanilla actual) consumiendo la API pública.
- Despliegue con dominio, CDN para estáticos, HTTPS, y la misma capa de auth/quotas que móvil.
- La PWA podría unificar parte de web y móvil si se acepta su captura de audio.

### 11.5 Modelo de negocio y coste

- **Costes variables por uso:** minutos de audio (STT) + tokens (LLM). Hay que medirlos por usuario para fijar precio y márgenes.
- **Tiers de proveedor:** el tier gratuito de Groq (~25 MB/fichero) no es base para producción; planes de pago de Groq y Anthropic con sus límites de tasa.
- **Pricing al cliente:** por suscripción (minutos/destilaciones incluidos) y/o por uso; o BYOK con tarifa plana de software.
- **Control de abuso/coste:** *quotas*, límites por minuto, detección de uso anómalo.

### 11.6 Recomendación estructurada (evolucionar vs. rehacer)

| Pieza | Veredicto para el servicio |
|---|---|
| *System prompt* de destilación | **Reutilizar** (activo central) |
| Abstracción de proveedores LLM/STT | **Reutilizar** (portar a la nube tal cual) |
| Contratos de API + modelo de 5 fases | **Reutilizar como base**, versionar y endurecer |
| Aprendizajes de audio (32 kbps, guardas, anti-alucinación) | **Reutilizar** (conocimiento) |
| Backend Express local + ficheros JSON | **Rehacer** (nube + BD + auth + storage) |
| Frontend SPA vanilla | **Rehacer** (framework web + apps móviles) |
| Lanzadores Windows (`.vbs`/`.bat`) | **Descartar** (no aplican a servicio) |

**Lectura:** lo que da valor diferencial (la destilación calibrada y la abstracción de proveedores) es ligero y portable; lo que hay que rehacer es la "infraestructura de producto" (auth, nube, BD, storage, clientes). En la práctica el camino más razonable es **"rehacer la cáscara, conservar el núcleo"**: nuevo backend de servicio y nuevos clientes (web/móvil), reutilizando el *system prompt*, la lógica de proveedores y los aprendizajes. La decisión formal (evolucionar el repo actual vs. iniciar uno nuevo) conviene tomarla en el proyecto Claude con esta tabla como guía; dado el tamaño del cambio, **partir de un proyecto nuevo importando el núcleo** suele ser más limpio que evolucionar el actual in situ.

---

## 12. Inventario de archivos (sin `node_modules` ni `data/`)

```
speech-to-prompt/
├── server.js                         # Express + single-instance guard (~79)
├── launcher.vbs / launcher.bat       # arranque silencioso Windows
├── install-shortcut.bat              # acceso directo + hotkey
├── package.json                      # ESM, 4 deps, sin build/tests
├── CLAUDE.md                         # guía para Claude Code (arquitectura/decisiones)
├── .gitignore                        # ignora node_modules/, data/, .claude/
├── src/
│   ├── routes/        config.js · sessions.js · transcribe.js · distill.js
│   ├── providers/
│   │   ├── llm/        base.js · index.js · anthropic.js · gemini.js(stub)
│   │   └── stt/        base.js · index.js · groq.js
│   ├── services/      session-store.js · config-store.js
│   ├── utils/         paths.js
│   └── prompts/       distill-system.md   ← activo de producto (Anexo A)
├── public/
│   ├── index.html · css/style.css
│   └── js/
│       ├── app.js · api-client.js · audio-recorder.js
│       ├── phases/    phase1-capture · phase2-transcribe · phase3-review-raw · phase4-distill · phase5-result
│       └── components/ settings-panel · history-panel
├── scripts/           transcribe-file.js   # rescate de audio en disco
└── docs/              (análisis/diseño inicial + este documento)
```

Tamaño aproximado: ~1.700–1.800 líneas de fuente (backend ~500, frontend ~1.200–1.400), JavaScript ESM + HTML + CSS + Markdown.

---

## 13. Historial y estado de git

- Rama única **`main`**, remoto `https://github.com/JotaLopezXenix/speech-to-prompt.git`.
- Hitos:
  1. `feat: initial release of Speech-to-Prompt v1` — flujo de 5 fases, abstracción de proveedores, frontend zero-build.
  2. `chore: refresh Claude model catalog to 4.6/4.7 family` — Sonnet 4.6 por defecto, Opus 4.7, Haiku 4.5.
  3. `feat: add silent launcher and single-instance guard` — `launcher.vbs/.bat`, guard, `CLAUDE.md`.
  4. `fix: prevent Whisper silent-audio hallucinations in capture phase` — selector de micro, medidor RMS, guardas.
  5. `feat: handle long dictations without hitting Groq's 25MB limit` — 32 kbps, mensaje 413 amigable, reanudación en fase 3, `scripts/transcribe-file.js`.
  6. `fix: raise distillation max_tokens to avoid truncated prompts` — `max_tokens` 2048 → 16000.
  7. `fix: stop distilled prompts from truncating; restore missing model field` — contrato de densidad en el *system prompt*, flag `truncated` + aviso en UI, y restauración del campo `model` (regresión introducida en el commit 6).

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
- `GET /api/config` → `{ config (con keys enmascaradas), llmProviders: [{id, models}], sttProviders: [{id, models}], configured: boolean }`.
- `PUT /api/config` ← `{ api_keys?: {anthropic?, groq?, google?}, defaults?: {llm_provider?, llm_model?, stt_provider?, stt_model?} }` → config enmascarada (merge).

### Sessions
- `POST /api/sessions` → 201, objeto sesión nuevo (todos los campos `null` salvo `id`/`timestamp`).
- `GET /api/sessions` → `[{ id, timestamp, preview, has_prompt }]` (orden desc.).
- `GET /api/sessions/:id` → objeto sesión completo | 404.
- `PUT /api/sessions/:id` ← JSON parcial (merge) → sesión actualizada | 404. Campos típicos: `transcription_edited`, `prompt_distilled`.

### Transcribe
- `POST /api/sessions/:id/transcribe` (multipart/form-data, campo `audio`) → `{ transcription_raw, session }`.
- Errores: 400 `MISSING_AUDIO` / `MISSING_API_KEY`, 404 `SESSION_NOT_FOUND`, 500 `STT_FAILED` (incluye el 413 de Groq si el audio supera ~25 MB).

### Distill
- `POST /api/sessions/:id/distill` (JSON vacío; usa la sesión + config) → `{ prompt_distilled, usage: {input_tokens, output_tokens}, truncated, session }`. `truncated` es `true` si la salida alcanzó `max_tokens`.
- Errores: 400 `NO_TRANSCRIPTION` / `MISSING_API_KEY`, 404 `SESSION_NOT_FOUND`, 500 `LLM_FAILED`.

### Firmas de los proveedores (para portar el núcleo)
- LLM: `distill(text: string, model: string, systemPrompt: string) → { prompt: string, truncated: boolean, usage: { input_tokens, output_tokens } }`.
- STT: `transcribe(audioBuffer: Buffer, mimeType: string, model: string) → { text: string }`.
- Factories: `createLLMProvider(name, apiKey)`, `createSTTProvider(name, apiKey)`; listados: `listLLMProviders()`, `listSTTProviders()`.
```
