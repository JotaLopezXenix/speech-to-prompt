# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Start the server and auto-open browser at http://localhost:3000
npm run dev      # Start with --watch (auto-restart on file changes)
```

No build step. No test suite. The frontend uses native ES modules served directly by Express — changes to `public/` are live on browser refresh.

## Architecture

**Node.js + Express backend** serving a **vanilla JS single-page frontend** on localhost. Zero build tooling — the browser loads `.js` files as ES modules directly.

### Data flow

Sessions are **multi-segment**: one session holds an ordered array of audio
segments (recorded or imported), each transcribed separately; the session-level
transcription is the concatenation. Capture is iterative — record a segment, read
the partial transcription, keep recording, all without losing the session.

```
Browser (MediaRecorder, per segment) → POST audio → /api/sessions/:id/segments
  → audio-normalize (ffmpeg, optional) → Groq Whisper API
  → segment appended; session.transcription_raw recomputed (= join of segments)

Re-transcribe on-disk audio (rescue)  → POST → /api/sessions/:id/reprocess
Browser (textarea, merged transcript) → POST → /api/sessions/:id/distill
  → Anthropic Claude API → distilled prompt saved to session JSON
```

`/api/sessions/:id/transcribe` still exists as a back-compat alias of `/segments`.

### Provider abstraction (firm architectural requirement)

All LLM and STT integrations go through abstract base classes:

- `src/providers/llm/base.js` — `LLMProvider` with `distill(text, model, systemPrompt)` → `{ prompt, usage }`
- `src/providers/stt/base.js` — `STTProvider` with `transcribe(audioBuffer, mimeType, model)` → `{ text }`
- `src/providers/llm/index.js` and `src/providers/stt/index.js` — registries/factories

Adding a new provider = one new file extending the base class + one line in the registry.

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

### Single source of truth for paths

`src/utils/paths.js` is the **only** place that defines where data lives (`data/` in the project root). All other modules import from it. If the data directory ever needs to change, only this file changes.

### Frontend phase machine

`public/js/app.js` is the main controller. It manages a 4-phase wizard state and renders phase modules into `#phase-container`. Each phase module exports a single `render*` function.

Phases: 1-capture → 3-review-raw → 4-distill → 5-result

Internal phase numbers keep the gap (1/3/4/5) for code stability. **`phase1-capture.js` is now an iterative multi-segment workspace** that owns session creation (lazy, on the first committed segment), records/imports segments, transcribes each inline (the old standalone `phase2-transcribe` screen was retired), and shows the running merged transcript before advancing to review. Audio sanity guards (silent/oversize) live in the shared `public/js/audio-guards.js`.

### Persistence

Sessions and audio are stored locally in `data/` (gitignored):
```
data/
  config.json                 # API keys + provider/model defaults (never commit)
  sessions/<id>.json          # One JSON file per session (with a segments[] array)
  audio/<id>__seg-N.webm      # One audio file per segment (1-based)
  audio/<id>.webm             # Legacy: single audio of v1.0 sessions
```

Session IDs are ISO timestamps with colons replaced by dashes (e.g. `2026-04-10T14-30-00`).

**Session schema (multi-segment, backward-compatible).** Each session has a
`segments[]` array (`{ audio_file, transcription_raw, transcription_edited,
duration_seconds, source, created_at }`). The session-level `transcription_raw`
is a **materialized view** — the join of the segments — so existing consumers
(`distill.js`, `listSessions`, the review/result phases) keep reading
`transcription_raw`/`transcription_edited` unchanged. Old flat-field sessions (no
`segments`) are handled by `getSegments(session)`, which synthesizes a single
segment — **no data migration needed**.

`src/services/session-store.js` owns this model: `getSegments`,
`recomputeTranscription`, `addSegment` (push + reproject derived fields),
`replaceSegments` (used by reprocess + the `scripts/transcribe-file.js` rescue
tool), and `nextSegmentNumber`. `updateSession` does a shallow merge, which is why
adding `segments` was additive.

### Audio format & normalization

The app records in **WebM/Opus** via `MediaRecorder`. `src/services/audio-normalize.js`
sanitizes each audio before sending it to Groq, using **ffmpeg only if present**
(`detectFfmpeg()`): remux (`-c copy`, writes the duration that MediaRecorder's
streaming WebM lacks), re-encode to 32 kbps Opus mono if oversized, and time-split
into chunks if still over Groq's ~25 MB limit. **ffmpeg is optional** — if it's
absent the audio is sent as-is (the original v1.0 behavior). This keeps ARM Windows
compatibility by degrading gracefully instead of requiring the binary. The stored
`audio_file` is always the raw upload; normalization outputs are temporary
(transcription-only). `probeDuration` must measure the *normalized* file, not the
raw one (the raw `.webm` reports no duration).

> Note: a known recorder quirk was fixed — stopping while paused used to
> double-count elapsed time, which fired a false "silent audio" warning. See
> `audio-recorder.js#getElapsedSeconds`.

### Distillation system prompt

`src/prompts/distill-system.md` is loaded at server startup. It is calibrated for the user profile: Spanish-speaking software architect who code-switches heavily with English technical terms and dictates spoken acronyms (e.g. "ele ele eme" → "LLM"). Edit this file to tune distillation quality — no code change needed.
