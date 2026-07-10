# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Metodología (JCC)

Este proyecto se desarrolla con la metodología JCC. Doc: `C:\11.IA\ClaudeCode\metodologia-claude-code\docs\JCC_Agentic_Dev_Methodology_v1_1.md`.

- **Fase actual:** cambio `robustez-coldstart-sql` en **Fase 4 (Revisión) — review adversarial independiente HECHA (veredicto: PASA con condiciones); hallazgo #1 CORREGIDO y #2 DOCUMENTADO; código en rama `robustez-coldstart-sql`, `npm test` 4/4; pendiente re-verificación independiente + prueba de fuego logueada + despliegue** (10-jul-2026; `docs/cambios/20260710_robustez-coldstart-sql/` DESIGN + SPEC). **Verificación local (real):** `npm test` 4/4 verde (`isTransient` caza el `TimeoutError` de tarn + transitorios SQL + descarta no-transitorios; `buildConfig().pool` trae los timeouts); `GET /api/health/db`→`200 {ok:true}` e2e contra SQL local; la app carga con **0 errores de consola** y el **warm-up dispara al montar** (`GET /api/health/db 200`) desde la app real. **Review adversarial (Fase 4, subagente independiente):** veredicto **PASA con condiciones**; regresión limpia (verificado: `withRetry` no amplía alcance, `session-store.js` fuera del diff, salvaguarda/recorder/diagnostics intactos); 2 huecos MEDIA → **A1** los timeouts del pool eran **inertes** por `propagateCreateError:true` que cablea mssql (tarn rechaza el acquire al 1er create fallido) → **CORREGIDO** con `propagateCreateError:false` (verificado en fuentes mssql/tarn; test reforzado); **A2** el "Reintentar" **no es idempotente** (duplica segmento/orfana sesión en la ventana "commit ok + respuesta perdida") → **trade-off ACEPTADO y documentado** (DESIGN §8/A2 + SPEC §5), idempotencia real diferida al cambio futuro de robustez. Huecos BAJA (warm-up puede colgar; `warnBox` compartido): sin acción. **PENDIENTE (smoke logueado coordinado con Agustín, §8.3):** prueba de fuego pausando la BD real (`az sql db pause`) → guardado espera y tiene éxito sin pérdida; drive completo del banner "Reintentar" (import + interceptar subida); y regresión funcional e2e (flujo normal, salvaguarda de corte externo, sin duplicados). **PENDIENTE despliegue:** `az webapp config set … --always-on true` (D5) + push. **Delta implementado (un solo SPEC):** `db.js` (timeouts del pool `tarn` `acquireTimeoutMillis:120000`/`createTimeoutMillis:60000`/`createRetryIntervalMillis:500`; regex de `isTransient` +`timed out`; exportar `buildConfig`/`isTransient` para test); nuevo `src/routes/health.js` `GET /api/health/db` (sin identity, `withRetry(SELECT 1)`) montado en `server.js`; `api-client.warmup()` fire-and-forget; `phase1-capture.js` (warmup al montar y al pulsar Grabar; slot `pendingRetry` + banner Reintentar/Descartar en `commitSegment`, `commitSegment` pasa a recibir `opts` objeto). NO se amplía el alcance de `withRetry` (sigue solo en `connect()`) para no reintentar transacciones. Verificación: tests unitarios nuevos (`test/db.test.js`, `node --test`) de `isTransient`+`buildConfig`; e2e del endpoint; **prueba de fuego** pausando la BD real (`az sql db pause`) → guardado espera y tiene éxito sin pérdida; regresión (flujo normal, salvaguarda de corte externo, sin duplicados). Infra en implement: `az webapp config set … --always-on true` (D5). **Origen:** incidente del 10-jul (dictado de ~5 min perdido al pulsar Detener con `operation timed out for an unknown reason` = **cold-start de Azure SQL Serverless** `GP_S_Gen5`/`autoPauseDelay:60` + App Service **`alwaysOn:false`** frío; el error lo lanza `tarn`, no la transcripción/red; sesión no llegó al histórico porque murió el `createSession` lazy; ver memoria `project_sql_coldstart_timeout`). **Causa del hueco:** `withRetry`/`isTransient` (`src/services/db.js`) solo envuelve el `connect()` inicial y su regex busca `timeout` (el mensaje dice "timed out", y el `TimeoutError` de tarn no trae `.code`/`.number`); además las `query`/`withTransaction` sobre pool caliente + BD pausada ni pasan por el reintento. **Alcance acordado (criterio DURO: no perder audio; un solo SPEC indivisible, D6):** (1) `isTransient` reconoce el `TimeoutError` de tarn [sub-caso 1: App Service frío]; (2) subir `acquireTimeoutMillis`/`createTimeoutMillis` del pool `mssql` (~90-120s) para absorber la reanudación **sin reintentar transacciones** (evita duplicados) [sub-caso 2: pool caliente + BD pausada]; (3) **warm-up** proactivo de la BD (endpoint ligero solo-lectura `SELECT 1` vía `withRetry`, sin auth) disparado *fire-and-forget* al pulsar Grabar y al montar la Fase 1; (4) **"Reintentar" mínimo** reteniendo el blob ante fallo de subida (banner Reintentar/Descartar reutilizando el patrón de la salvaguarda de corte externo, un solo slot); (5) **`alwaysOn:true`** (gratis en B1: el plan se factura 24/7 igual). **Fuera de alcance (→ cambio futuro de robustez):** UX de recuperación pulida (multi-blob/persistencia local en IndexedDB/recuperación entre recargas), desactivar auto-pausa o subir `autoPauseDelay`, prevención por causa del corte espontáneo. Pistas falsas descartadas: navegador (Chrome vs Edge; grabación es cliente) y duración del dictado (~1,2 MB a 32 kbps). Superficie de regresión: `db.js` es el único acceso a SQL (no romper happy path ni el retry de `connect()` ni la semántica transaccional); en el front, no colisionar con la salvaguarda de corte externo. — Cambio anterior `grabacion-stop-espontaneo` **COMPLETO y desplegado a producción** (28-jun-2026; DESIGN + SPEC + REVIEW en `docs/cambios/20260628_grabacion-stop-espontaneo/`). **Desplegado:** push a `main`→GitHub Actions (run 28321567434, deploy OK); migración `005` aplicada en prod (Azure SQL `sql-speech-to-prompt`, `SQL_AUTH=entra-default`+`az login`); **verificado en prod** `dbo.diagnostic_events` (9 columnas + índices `IX_diag_owner_ts`/`IX_diag_run_seq`) y `005_diagnostics.sql` en `schema_migrations`; App Service `Running`, responde HTTP 401 (Easy Auth). **Smoke funcional logueado CONFIRMADO en prod** (usuario provocó el corte externo y vio el aviso "La grabación se detuvo… ¿Guardar este tramo?" con captura). El veredicto de review fue limpio. Bitácora de cierre: `docs/cambios/20260628_grabacion-stop-espontaneo/HANDOFF.md`. **Trabajo futuro (nuevo ciclo JCC):** cosechar `dbo.diagnostic_events` para clasificar H1 vs H2 y diseñar el fix de robustez definitivo (`/jcc-design`). La revisión adversarial independiente confirmó que cumple el SPEC y no rompe regresión (taxonomía §4.8 completa, `stop()` preserva `Promise→blob`, `_intentionalStop` evita falsos positivos de la salvaguarda); halló 3 huecos de gravedad baja, se corrigieron **① y ②** (③ es hueco del propio SPEC, fiel, se deja): ① `runActive` colgado si falla `recorder.start()` (añadido `endCaptureRun()` en el catch); ② `flush()` enviaba el buffer entero y se atascaba si superaba 200 (servidor 413) → reescrito para **trocear a ≤100/POST** (`MAX_BATCH`) + guarda `flushing` anti-concurrencia. **Re-verificado:** 250 eventos drenan en tandas sin pérdida ni duplicados. **PENDIENTE despliegue:** aplicar migración `005` en prod (Azure SQL: `SQL_AUTH=entra-default`+`az login`; ver memoria de gotchas locales) y smoke en navegador logueado. **Menor:** `track_ended` solo se cazará con muerte real del micro (programático `stop()` no emite `ended`, por spec). Commit inicial `138bb7c`; las correcciones de review en commit aparte. `docs/cambios/20260628_grabacion-stop-espontaneo/` DESIGN + SPEC. **Implementado:** migración `005_diagnostics.sql` aplicada en local; `diagnostics-store.js` + `routes/diagnostics.js` (montado en `server.js` con `identity`); `public/js/diagnostics.js` + `api-client.postDiagnostics`; `audio-recorder.js` con `onstop` persistente (intencional/externo) + `onerror` + track handlers + hooks `onDiag`/`onExternalStop`; `phase1-capture.js` instrumenta `btnRecord`/Media Session + salvaguarda (`onExternalStop`→banner guardar/descartar, `skipGuard` en `commitSegment`, `diag.endCaptureRun`). **Verificación local (sin coste STT):** esquema+store por script Node; ruta HTTP e2e (200/400/413/truncado 8KB) contra server vivo; **mecanismo del recorder con MediaRecorder real vía Playwright** — parada intencional resuelve blob y **NO** dispara salvaguarda (sin falso positivo), parada externa (`track.stop()`) dispara `onExternalStop` con audio recuperado (`bytes>0`) + `recorder_stop_external`; lazo cliente→BD del auto-flush. App arranca sin errores de consola. **PENDIENTE despliegue:** aplicar migración `005` en **prod** (Azure SQL: `SQL_AUTH=entra-default`+`az login`) y smoke en navegador logueado. **Pendiente menor:** `track_ended` solo se cazará con muerte real del micro (programático `stop()` no emite `ended`, por spec). SPEC indivisible (un solo `SPEC.md`): migración `005_diagnostics.sql` (tabla `dbo.diagnostic_events`, `session_id` soft-ref sin FK, `capture_run_id`+`seq` para orden determinista) + `POST /api/diagnostics` (con `identity`, best-effort, ≤200 ev/lote, payload ≤8KB) + `diagnostics-store.js`/`routes/diagnostics.js`; frontend `public/js/diagnostics.js` (buffer+flush por sospechoso/tamaño/pagehide) + `api-client.postDiagnostics`; `audio-recorder.js` con `onstop` persistente (intencional vs externo, **preserva contrato Promise→blob**), `onerror`, track `onended/onmute/onunmute` y hooks `onDiag`/`onExternalStop`; `phase1-capture.js` instrumenta `btnRecord` (isTrusted/teclado/Media Session) y aloja la **salvaguarda** (`onExternalStop`→`updateUI`+banner guardar/descartar, `skipGuard` en `commitSegment`). Verificación: repro determinista del stop externo con `recorder.stream.getAudioTracks()[0].stop()` en consola; regresión = flujo intencional sin falso positivo de salvaguarda. Bug: la grabación se detiene **sola** durante speeches largos (evidenciado en Session 10; usuario con auriculares Bluetooth en Edge/Win11) y posible pérdida del audio del tramo (antes "aparcado", ahora abordado). **Decisión de alcance del usuario: NO se arregla aún** — solo **diagnóstico**, porque hay una sola observación difusa y parchear sería a ciegas. Este cambio = (1) **instrumentación en dos capas** para distinguir hipótesis: *H1 activación accidental del botón* (foco en `btnRecord` + tecla/botón multimedia BT → "como si pulsara Detener", sin pérdida) vs *H2 stop externo real del recorder* (track muerto → UI congelada + pérdida de `chunks` al volver a `start()`); instrumenta lo que falta en `audio-recorder.js` (`onstop` persistente intencional/externo, `onerror`, `track.onended/onmute`, `visibilitychange`) y en `phase1-capture.js` (activaciones de `btnRecord`: `isTrusted`, foco, teclado, Media Session). (2) **Persistencia en backend** [estructural, acordado]: tabla append-only `diagnostic_events` (espejo de `usage_events`) + `POST /api/diagnostics` en lote, owner-scoped vía `identity`. (3) **Salvaguarda mínima**: ante stop externo, recuperar el blob de `chunks` antes de que el siguiente Grabar lo borre + `updateUI()` + ofrecer guardar/descartar reutilizando `confirmSuspectAudio`/`commitSegment`. **Fuera de alcance (→ cambio futuro de robustez):** UX de recuperación pulida, prevención específica por causa, `maxDuration`/rotación; nada de prompts ni backend de destilado. — Cambio anterior `mejorar-destilado-limpio` **COMPLETO y desplegado a producción** (28-jun-2026; `docs/cambios/20260628_mejorar-destilado-limpio/`; DESIGN + SPEC + REVIEW). **Alcance ligero** (el usuario considera que `limpio` funciona bien): `src/prompts/openai/limpio.md` **afinado para GPT** (origen `eval/prompts/limpio-gpt-v4.md`) — mantiene el contrato `limpio` (no resolver/no sintetizar/`[inferido]`/sección "❓ Preguntas abiertas"/no corregir nombres en silencio) y añade **un cambio de comportamiento (estructural, aprobado): preservar la voz/persona del hablante** en vez de neutralizar a impersonal ("se quiere"→1ª persona si el dictado lo es). Endurecidos para GPT los límites que se saltaba "por ayudar": marcar palabras mal transcritas con `[inferido]`, no inflar preguntas con agenda, no convertir suposiciones en preguntas de QA, no filtrar las propias instrucciones como contenido, no usar pasivas perifrásticas. **Modelo `gpt-4.1` se mantiene.** Validado por eval contra **golden fabricado** (Session 10, dictado más largo en prod; no había golden `limpio` reutilizable) con `scripts/eval-distill.mjs` (override nuevo `EVAL_OUT_DIR`); v1→v4 (la **review adversarial independiente** halló en v3 una pregunta-agenda sintetizada y una pasiva; v4 las corrige y pasa los 7 criterios del SPEC §5.3; `REVIEW.md` documenta el bucle 3↔4). **Desplegado a prod:** push a `main`→GitHub Actions (deploy OK); `seed-prompts` del prompt v4 contra la BD Azure (`SQL_SERVER=sql-speech-to-prompt.database.windows.net SQL_DATABASE=db-speech-to-prompt SQL_AUTH=entra-default`+`az login`; ojo: con `npm run` los env inline ganan sobre `.env`); App Service reiniciado. **Verificado en prod:** `dbo.model_prompts (openai, limpio)` **len=8276** con la regla v4 (consulta directa a prod); App Service `Running` y responde (HTTP 401 = Easy Auth activo). **Pendiente menor:** smoke test funcional logueado en el navegador (destilar una sesión larga en `limpio`). **La eval local requirió abrir/re-cerrar `publicNetworkAccess` de `aoai-speech-to-prompt`** (quedó `Disabled`; ver memoria). **Aparcado (no núcleo):** bug de grabación que se detiene sola (evidenciado en la propia transcripción de Session 10; sin temporizador de silencio/maxDuration en `audio-recorder.js` → el stop viene de fuera). — Cambio anterior `mejorar-destilado-gpt` **COMPLETO y desplegado** (26-jun-2026; `docs/cambios/20260626_mejorar-destilado-gpt/`): `completo` afinado para GPT (1ª persona, cerrado, denso, corrige nombres en silencio), modelo `gpt-4.1` elegido por eval contra golden Sonnet sobre 5 sesiones (coste-primero); migración 005 eliminada. **Residuo menor opcional:** añadir "prompt" a la corrección de nombres del prompt `completo`. — Cambio `azure-sql-multiusuario` **COMPLETO** en producción (flujos 1-6, secretless, red privada; `docs/cambios/20260623_azure-sql-multiusuario/`). **Pendientes menores** (no núcleo): limpiar UI de Ajustes (proveedores legacy) y añadir IP de Agustín al firewall.
- **Operas como COPILOTO.** En las transiciones de fase, recuerda y ofrece el command que toca (`/jcc-design`, `/jcc-spec`, `/jcc-implement`, `/jcc-review`); **no bloquees**, el usuario decide. Las decisiones **estructurales o difíciles de revertir** (modelo de datos, abstracciones, contratos, stack) van a la **mesa común**: no las absorbas en silencio. **Mantienes CLAUDE.md actualizado** en cada transición de fase sin que el usuario tenga que pedirlo.
- **Reconciliación al arrancar.** Antes de seguir, contrasta la "Fase actual" de arriba con los artefactos reales del repo (¿qué SPEC existen?, ¿qué flujos están implementados/verificados?). Si no cuadran, **dilo**.

## Commands

```bash
npm start          # Start the server (loads .env if present); opens the browser
npm run dev        # --watch + loads .env and .env.dev (sets STP_NO_OPEN → no auto-open; open http://localhost:3000 manually)
npm run migrate    # Apply pending SQL migrations (migrations/NNN_*.sql) to the DB; tracked in schema_migrations
npm run seed-prompts  # Sync distillation prompts from src/prompts/<family>/<mode>.md into dbo.model_prompts (upsert)
npm test           # Run unit tests (node --test test/**/*.test.js); pure logic only, no DB/network
```

All scripts load env with `--env-file-if-exists` (Node 24). Locally, `.env` holds the SQL connection (`SQL_*`), a dev identity (`DEV_USER_*`), and the Azure processor config (`AZURE_OPENAI_*`, `LLM_PROVIDER`, `LLM_MODEL`); Azure uses App Settings instead (no `.env`). **A SQL Server database is required** (local: `db-speech-to-prompt`); on first setup run `npm run migrate` then `npm run seed-prompts`.

No build step. **Minimal unit tests** for non-trivial pure logic (`npm test` → `node --test`, files in `test/`); no full suite yet. The frontend uses native ES modules served directly by Express — changes to `public/` are live on browser refresh.

## Architecture

**Node.js + Express backend** serving a **vanilla JS single-page frontend** on localhost. Zero build tooling — the browser loads `.js` files as ES modules directly.

> **Major evolution (2026-06).** The app moved from local JSON files + single user to **Azure SQL + Blob Storage + multiuser** (identity, owner isolation, cost tracking) and **Azure-native processors**. Design + specs: `docs/cambios/20260623_azure-sql-multiusuario/`.

### Data flow

Sessions are **multi-segment**: one session holds an ordered array of audio
segments (recorded or imported), each transcribed separately; the session-level
transcription is the concatenation. Capture is iterative — record a segment, read
the partial transcription, keep recording, all without losing the session.

```
Browser (MediaRecorder, per segment) → POST audio → /api/sessions/:id/segments
  → audio-normalize (ffmpeg, optional) → STT provider (Groq Whisper, or Azure OpenAI Whisper)
  → audio stored via blob-store; segment appended; session.transcription_raw recomputed

Re-transcribe stored audio (rescue)   → POST → /api/sessions/:id/reprocess
Browser (textarea, merged transcript) → POST → /api/sessions/:id/distill
  → body { mode, systemPrompt? } → LLM provider (default Azure OpenAI gpt-4.1)
  → prompt + distill_mode + distill_prompt_used persisted (SQL)
```

`/api/sessions/:id/transcribe` still exists as a back-compat alias of `/segments`.

### Provider abstraction (firm architectural requirement)

All LLM and STT integrations go through abstract base classes:

- `src/providers/llm/base.js` — `LLMProvider` with `distill(text, model, systemPrompt)` → `{ prompt, usage }`
- `src/providers/stt/base.js` — `STTProvider` with `transcribe(audioBuffer, mimeType, model)` → `{ text }`
- `src/providers/storage/base.js` — `BlobStore` (file backend locally, Azure Blob in cloud)
- `src/providers/{llm,stt,storage}/index.js` — registries/factories

Adding a new provider = one new file extending the base class + one line in the registry.
LLM providers: `azure-openai` (default), `anthropic` (disabled — see Distillation), `gemini` (stub).
STT providers: `groq`, `azure-whisper`.

> **Groq Whisper `text`-field bug (workaround in `groq.js`).** Groq's assembled
> `text` (and the plain `json` format) deterministically **truncates words at the
> first accented vowel** ("política"→"pol", "está"→"est") and drops punctuation in
> the affected spans — even at high confidence (`avg_logprob ≈ -0.06`), and
> identically across `whisper-large-v3` and `-turbo` (shared encoder/tokenizer). The
> `words[]` array from `verbose_json` + `timestamp_granularities[]=word` decodes
> correctly, so `GroqProvider.transcribe` requests that and **reconstructs the text
> from `words[]`** (joining + fixing spacing around punctuation), with a fallback to
> `text` if no words are returned. Same API cost/latency. Re-running **Reprocesar**
> on old sessions re-transcribes their on-disk audio through this fixed path.
> (Azure OpenAI Whisper does **not** have this bug; its `text` is used directly.)

### Single source of truth for paths

`src/utils/paths.js` is the **only** place that defines where local data lives (`BASE_DIR = process.env.DATA_DIR || data/`). All other modules import from it.

### Frontend phase machine

`public/js/app.js` is the main controller. It manages a 4-phase wizard state and renders phase modules into `#phase-container`. Each phase module exports a single `render*` function.

Phases: 1-capture → 3-review-raw → 4-distill → 5-result

Internal phase numbers keep the gap (1/3/4/5) for code stability. **`phase1-capture.js` is now an iterative multi-segment workspace** that owns session creation (lazy, on the first committed segment), records/imports segments, transcribes each inline (the old standalone `phase2-transcribe` screen was retired), and shows the running merged transcript before advancing to review. Audio sanity guards (silent/oversize) live in the shared `public/js/audio-guards.js`.

### Persistence (Azure SQL + Blob Storage)

Sessions and audio live in **Azure SQL Database** + **Azure Blob Storage** (a major change from v1 local files — see `docs/cambios/20260623_azure-sql-multiusuario/`). Locally, dev runs against a SQL Server DB (`db-speech-to-prompt`) + a file-backed blob store (`AUDIO_DIR`); in Azure it's Azure SQL + a private Blob container, both via **Managed Identity** (secretless). `data/config.json` (API keys + provider/model defaults) and env still hold config; **secrets never go to the DB**. The old `data/sessions/*.json` + `data/audio/*.webm` are **v1 legacy** — the SQL DB started blank (not migrated); they stay on disk only as a rescue source.

Schema lives in `migrations/NNN_*.sql` (applied by `npm run migrate`, tracked in `schema_migrations`): `users` (JIT-provisioned on first login), `sessions` (per-`owner_id` isolation), `segments`, `session_shares` (schema-only hook, no feature yet), `usage_events` (append-only cost/usage), `model_prices`, `model_prompts` + `llm_models` (see Distillation), and `diagnostic_events` (append-only telemetría de captura, owner-scoped, `session_id` soft-ref sin FK; cambio `grabacion-stop-espontaneo`, vía `POST /api/diagnostics`).

**Session contract preserved.** The session object still exposes `segments[]` + a **materialized** `transcription_raw`/`transcription_edited` (the join of segments), so `distill.js`, the history list and the phases read it unchanged. `src/services/session-store.js` keeps its API (`getSegments`, `recomputeTranscription`, `addSegment`/`replaceSegments` — transactional in SQL, recomputing the materialized view atomically — and `updateSession` shallow merge) but is now **async/SQL**. **Owner isolation** is enforced in the data layer: get/list/update take a `callerId`; cross-owner access returns 404. Identity comes from Easy Auth headers in Azure (`src/middleware/identity.js`) or `DEV_USER_*` locally. Audio uses a storage abstraction (`src/providers/storage/{file,azure}.js`); `segments.audio_blob_path` is the store key, served via an authorized endpoint (never a public URL).

### Audio format & normalization

The app records in **WebM/Opus** via `MediaRecorder`. `src/services/audio-normalize.js`
sanitizes each audio before sending it to STT, using **ffmpeg only if present**
(`detectFfmpeg()`): remux (`-c copy`, writes the duration that MediaRecorder's
streaming WebM lacks), re-encode to 32 kbps Opus mono if oversized, and time-split
into chunks if still over Groq's ~25 MB limit. **ffmpeg is optional** — if it's
absent the audio is sent as-is (the original v1.0 behavior). This keeps ARM Windows
compatibility by degrading gracefully instead of requiring the binary. The stored
audio is always the raw upload; normalization outputs are temporary
(transcription-only). `probeDuration` must measure the *normalized* file, not the
raw one (the raw `.webm` reports no duration).

> Note: a known recorder quirk was fixed — stopping while paused used to
> double-count elapsed time, which fired a false "silent audio" warning. See
> `audio-recorder.js#getElapsedSeconds`.

### Distillation modes + editable system prompt

Distillation has **four modes**, chosen on the review screen (phase 3); **limpio** is the default selection:

- **completo** — structured first-person initiator brief. Original behavior.
- **ligero** — light cleanup + polish, no titles/summary, preserves all ideas.
- **literal** — near-verbatim; only de-spells acronyms + fixes spelled letter/number artifacts.
- **limpio** — faithful cleaner+structurer: cleans/orders/densifies, **preserves the speaker's own voice/person** (1st person if the dictation is, never neutralized to impersonal), flags ambiguities & mis-transcriptions with `[inferido]` and a final "❓ Preguntas abiertas" section, but does NOT resolve, synthesize, or silently correct names. Produces a `brief-crudo.md` for a later Socratic design interview. Prompt afinado para GPT en `mejorar-destilado-limpio` (28-jun-2026).

**Prompts are per model FAMILY × mode, stored in the DB** (`dbo.model_prompts`; families `openai`/`claude`/`gemini`). The git-versioned origin is `src/prompts/<family>/<mode>.md`; `npm run seed-prompts` upserts them into the DB, which is the runtime source (editable by SQL now, by a backoffice later). `src/services/prompts.js` reads/caches them; `src/prompts/index.js` now only exports `DISTILL_MODES`, `resolveMode()` and `FALLBACK_PROMPTS`. `routes/distill.js` loads the prompt for `(active model's family, mode)`.

**Model selection + gating** (`dbo.llm_models` via `src/services/models.js`): each model maps to a family and carries `enabled`/`is_default`. The default LLM is **`azure-openai` / `gpt-4.1`**; a request routed to a disabled model is rejected (`400 MODEL_DISABLED`). **Claude is kept (its prompt family + a registry row) but disabled**: it's an Azure Marketplace model, not billable against the subscription credit, so the distiller moved to **Azure OpenAI GPT** (first-party, credit-billable). `routes/prompts.js` (`GET /api/prompts`) serves the active family's prompts to the front.

The front can **override the system prompt per distillation** (phase-3 inline editor): the
edited text is sent in the `distill` body and used if non-empty (else the family/mode default).
**Editing never writes the stored prompts** — the override lives only in the request and in the
session record. The exact prompt used is persisted as `distill_prompt_used` alongside
`distill_mode`. Reopening a session seeds the phase-3 editor with the stored prompt (via
`app.js` state), so re-distilling reuses/tunes it. The editor state (mode + per-mode text)
lives in `app.js` `state` because phase modules are re-rendered on every navigation.

The prompts are calibrated for the user profile: Spanish-speaking software architect who
code-switches heavily with English technical terms and dictates spoken acronyms (e.g. "ele
ele eme" → "LLM").
