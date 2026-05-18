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

```
Browser (MediaRecorder) → POST audio → /api/sessions/:id/transcribe
  → Groq Whisper API → raw transcription saved to session JSON

Browser (textarea) → POST → /api/sessions/:id/distill
  → Anthropic Claude API → distilled prompt saved to session JSON
```

### Provider abstraction (firm architectural requirement)

All LLM and STT integrations go through abstract base classes:

- `src/providers/llm/base.js` — `LLMProvider` with `distill(text, model, systemPrompt)` → `{ prompt, usage }`
- `src/providers/stt/base.js` — `STTProvider` with `transcribe(audioBuffer, mimeType, model)` → `{ text }`
- `src/providers/llm/index.js` and `src/providers/stt/index.js` — registries/factories

Adding a new provider = one new file extending the base class + one line in the registry.

### Single source of truth for paths

`src/utils/paths.js` is the **only** place that defines where data lives (`data/` in the project root). All other modules import from it. If the data directory ever needs to change, only this file changes.

### Frontend phase machine

`public/js/app.js` is the main controller. It manages a 5-phase wizard state and renders phase modules into `#phase-container`. Each phase module exports a single `render*` function.

Phases: 1-capture → 2-transcribe → 3-review-raw → 4-distill → 5-result

### Persistence

Sessions and audio are stored locally in `data/` (gitignored):
```
data/
  config.json          # API keys + provider/model defaults (never commit)
  sessions/<id>.json   # One JSON file per session
  audio/<id>.webm      # Raw audio per session
```

Session IDs are ISO timestamps with colons replaced by dashes (e.g. `2026-04-10T14-30-00`).

### Audio format

The app records in **WebM/Opus** via `MediaRecorder` and sends it directly to Groq. No conversion, no ffmpeg dependency. This is intentional for ARM Windows compatibility.

### Distillation system prompt

`src/prompts/distill-system.md` is loaded at server startup. It is calibrated for the user profile: Spanish-speaking software architect who code-switches heavily with English technical terms and dictates spoken acronyms (e.g. "ele ele eme" → "LLM"). Edit this file to tune distillation quality — no code change needed.
