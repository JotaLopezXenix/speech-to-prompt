# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Metodología (JCC)

Este proyecto se desarrolla con la metodología JCC. Doc: `C:\11.IA\ClaudeCode\metodologia-claude-code\docs\JCC_Agentic_Dev_Methodology_v1_2.md`.

- **Fase actual:** Programa **`profesionalizacion-marketplace`** (multi-ciclo). **Ciclo 3 `marketplace-transactable` ACTIVO — JCC Fase 1 (diseño) CERRADA**: [`DESIGN.md`](docs/cambios/20260716_profesionalizacion-marketplace/ciclo-3-marketplace-transactable/DESIGN.md) redactado (22-jul; **pendiente visto bueno del usuario**). Decisiones estructurales fijadas: reconciliación identidad-comprador **"misma cuenta"** (bloqueo estricto, sin multi-cuenta) · **entitlement unificado** (marketplace + concesiones manuales con expiración opc.) que **retira la lista blanca `ALLOWED_EMAILS`** y resuelve el hueco H6 · **fulfillment secretless** por credencial federada (cert como plan B) · retención v1-A (bloqueo + ventana 90 d + [Borrar ahora] + purga automática). **Siguiente = `/jcc-spec`** (troceo sugerido en 6 specs, DESIGN §10). En paralelo: track burocrático [`RUNBOOK-partner-center.md`](docs/cambios/20260716_profesionalizacion-marketplace/ciclo-3-marketplace-transactable/RUNBOOK-partner-center.md) (fiscal del Seller pendiente) + confirmaciones en la reunión **Microsoft ISV Success (23-jul)** (credencial federada, superficie de cancelación). (Ciclos 0–2 cerrados y en prod.) Pendientes cross-cutting y evidencia, en los handoffs. — Mapa del cambio activo: [`README`](docs/cambios/20260716_profesionalizacion-marketplace/README.md) · última bitácora: [`handoffs/HANDOFF-2026-07-22-ciclo3-arranque.md`](docs/cambios/20260716_profesionalizacion-marketplace/handoffs/HANDOFF-2026-07-22-ciclo3-arranque.md) · historia completa de TODOS los cambios: [`índice global docs/cambios/README.md`](docs/cambios/README.md). — *Esta línea es SOLO un puntero al trabajo ACTIVO y se sobrescribe (NO acumula historia). El detalle de cada cambio —activo o cerrado— vive en su carpeta `docs/cambios/<fecha>_<slug>/` (con su README/DESIGN/SPEC) y la historia fechada con evidencia en sus `handoffs/`. Reconciliación: contrasta esta línea con los artefactos reales del repo al arrancar.*
- **Operas como COPILOTO.** En las transiciones de fase, recuerda y ofrece el command que toca (`/jcc-design`, `/jcc-spec`, `/jcc-implement`, `/jcc-review`); **no bloquees**, el usuario decide. Las decisiones **estructurales o difíciles de revertir** (modelo de datos, abstracciones, contratos, stack) van a la **mesa común**: no las absorbas en silencio. **Mantienes CLAUDE.md actualizado** en cada transición de fase sin que el usuario tenga que pedirlo — **pero la línea "Fase actual" se SOBRESCRIBE** (puntero corto al trabajo activo, nunca un changelog): la historia con evidencia va a los `handoffs/` del cambio y al índice global [`docs/cambios/README.md`](docs/cambios/README.md), no a esta línea (modelo JCC v1.2).
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

No build step **for the backend**. **The ciclo-2b frontend lives in `web/`** (React + Vite + TypeScript + Tailwind v4 + shadcn/ui): `cd web && npm install`, then `npm run dev` (HMR on :5173, `/api` proxied to :3000), `npm run build` (→ `web/dist`), `npm run lint` (oxlint). From the repo root, `npm run build:web` builds it. **Typed API client (SPEC-02):** the contract is documented spec-first in **`openapi/speech-to-prompt.yaml`** (OpenAPI 3.1, source of truth); `cd web && npm run gen:api` regenerates `web/src/api/schema.d.ts` from it (runs `openapi-typescript` via **`npx`** — a codegen-only CLI, NOT a dep; the peer wants TS 5 and the project is on TS 6). The generated `schema.d.ts` is **committed**; `gen:api` is run **by hand** when the YAML changes — it is **not** part of `build` or CI. The client (`web/src/api/client.ts`, `openapi-fetch`, `baseUrl:/api/v1`) has a no-op token seam wired to MSAL in SPEC-03. Express serves `web/dist` at **`/app`** (ruta temporal de 2b) while `/` keeps serving the legacy `public/` frontend until the final cutover. **Minimal unit tests** for non-trivial pure logic (`npm test` → `node --test`, files in `test/`); no full suite yet. The **legacy** frontend (`public/`) uses native ES modules served directly by Express — changes to `public/` are live on browser refresh.

## Architecture

**Node.js + Express backend** (sin build). Desde el **cutover del ciclo 2b (SPEC-07)**, el frontend es la **SPA de `web/`** (React + Vite + TS + Tailwind v4 + shadcn), construida a `web/dist` y **servida por Express en `/`**. El antiguo frontend vanilla (zero-build, ES modules en `public/`) fue **retirado** en el cutover (queda en el historial de git).

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

### Frontend (`web/`, React SPA — ciclo 2b)

El frontend vive en **`web/`** (React 19 + Vite 8 + TS 6 + Tailwind v4 CSS-first + shadcn + react-router 7), servido en `/` tras el cutover (SPEC-07). Flujo de 4 fases **Captura → Revisión → Destilado → Resultado** + **Historial** y **Ajustes**, como rutas react-router (`web/src/routes/`); la sesión activa se comparte entre fases con el contexto **`ActiveSession`** (`web/src/session/`). Las salvaguardas de captura (R1) se portaron a `web/src/capture/` (recorder/guards/diagnostics + hook `useCapture`). Cliente HTTP tipado en `web/src/api/` (`openapi-fetch`, base `/api/v1`); auth MSAL/devBypass en `web/src/auth/`; tema en `web/src/theme/`. Detalle y decisiones: `docs/cambios/20260716_profesionalizacion-marketplace/ciclo-2-frontend-mobile-first/` (SPEC-01…07). El antiguo `public/js/*` (máquina de fases vanilla 1/3/4/5) fue **retirado** en el cutover.

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
