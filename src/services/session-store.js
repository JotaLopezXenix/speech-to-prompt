import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { SESSIONS_DIR } from '../utils/paths.js';

function sessionPath(id) {
  return join(SESSIONS_DIR, `${id}.json`);
}

export function createSession() {
  const now = new Date();
  const id = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const session = {
    id,
    timestamp: now.toISOString(),
    audio_file: null,
    transcription_raw: null,
    transcription_edited: null,
    prompt_distilled: null,
    llm_provider: null,
    llm_model: null,
    stt_provider: null,
    stt_model: null,
  };
  writeFileSync(sessionPath(id), JSON.stringify(session, null, 2), 'utf-8');
  return session;
}

export function getSession(id) {
  const path = sessionPath(id);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function updateSession(id, partial) {
  const session = getSession(id);
  if (!session) return null;
  const updated = { ...session, ...partial };
  writeFileSync(sessionPath(id), JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

export function listSessions() {
  if (!existsSync(SESSIONS_DIR)) return [];
  return readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const id = f.replace('.json', '');
      const session = JSON.parse(readFileSync(join(SESSIONS_DIR, f), 'utf-8'));
      return {
        id,
        timestamp: session.timestamp,
        preview: session.prompt_distilled
          ? session.prompt_distilled.slice(0, 100)
          : session.transcription_raw
          ? session.transcription_raw.slice(0, 100)
          : null,
        has_prompt: !!session.prompt_distilled,
      };
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
