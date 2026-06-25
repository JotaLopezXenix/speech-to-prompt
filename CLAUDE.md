# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Metodología (JCC)

Este proyecto se desarrolla con la metodología JCC. Doc: `C:\11.IA\ClaudeCode\metodologia-claude-code\docs\JCC_Agentic_Dev_Methodology_v1_1.md`.

- **Fase actual:** cambio `azure-sql-multiusuario` **COMPLETO** (flujos 1-6 implementados; `docs/cambios/20260623_azure-sql-multiusuario/`). El **flujo 6** (provisión Azure SQL/Storage + VNet/Private Endpoints + Managed Identity, **secretless**, + cierre de perímetro por IP) se implementó y **verificó E2E en Azure el 25-jun** (bitácora `20260625_Fase_06_Implementada.md`); la app corre en producción secretless por red privada. SPEC del cambio: 01/02/03/05/06; el 4 en bitácora. **Pendientes menores** (no núcleo): limpiar la UI de Ajustes (muestra proveedores legacy Anthropic/Groq/Gemini; ya no aplican con Azure/MI) y añadir la IP de Agustín al firewall de SQL/Storage. Sin cambio activo en curso → el siguiente trabajo arranca con `/jcc-design` o `/jcc-spec` según toque.
- **Operas como COPILOTO.** En las transiciones de fase, recuerda y ofrece el command que toca (`/jcc-design`, `/jcc-spec`, `/jcc-implement`, `/jcc-review`); **no bloquees**, el usuario decide. Las decisiones **estructurales o difíciles de revertir** (modelo de datos, abstracciones, contratos, stack) van a la **mesa común**: no las absorbas en silencio.
- **Reconciliación al arrancar.** Antes de seguir, contrasta la "Fase actual" de arriba con los artefactos reales del repo (¿qué SPEC existen?, ¿qué flujos están implementados/verificados?). Si no cuadran, **dilo**. Nota viva: el flujo 6 ya pasó por `/jcc-spec` (SPEC-06); el siguiente paso coherente es `/jcc-implement` sobre ese SPEC.

## Commands

```bash
npm start          # Start the server (loads .env if present); opens the browser
npm run dev        # --watch + loads .env and .env.dev (sets STP_NO_OPEN → no auto-open; open http://localhost:3000 manually)
npm run migrate    # Apply pending SQL migrations (migrations/NNN_*.sql) to the DB; tracked in schema_migrations
npm run seed-prompts  # Sync distillation prompts from src/prompts/<family>/<mode>.md into dbo.model_prompts (upsert)
```

All scripts load env with `--env-file-if-exists` (Node 24). Locally, `.env` holds the SQL connection (`SQL_*`), a dev identity (`DEV_USER_*`), and the Azure processor config (`AZURE_OPENAI_*`, `LLM_PROVIDER`, `LLM_MODEL`); Azure uses App Settings instead (no `.env`). **A SQL Server database is required** (local: `db-speech-to-prompt`); on first setup run `npm run migrate` then `npm run seed-prompts`.

No build step. No test suite. The frontend uses native ES modules served directly by Express — changes to `public/` are live on browser refresh.

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

Schema lives in `migrations/NNN_*.sql` (applied by `npm run migrate`, tracked in `schema_migrations`): `users` (JIT-provisioned on first login), `sessions` (per-`owner_id` isolation), `segments`, `session_shares` (schema-only hook, no feature yet), `usage_events` (append-only cost/usage), `model_prices`, and `model_prompts` + `llm_models` (see Distillation).

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
- **limpio** — faithful cleaner+structurer: cleans/orders/densifies, flags ambiguities & inferences with `[inferido]` and a final "❓ Preguntas abiertas" section, but does NOT resolve or synthesize. Produces a `brief-crudo.md` for a later Socratic design interview.

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
