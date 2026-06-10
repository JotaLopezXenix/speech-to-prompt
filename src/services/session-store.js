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
    segments: [],
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
        // Para la UI de historial: si hay audio en disco pero ninguna transcripción,
        // la sesión es recuperable con "Reprocesar".
        has_transcription: !!session.transcription_raw,
        has_audio: getSegments(session).some(s => s.audio_file),
        segment_count: getSegments(session).length,
      };
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// --- Modelo multi-segmento ---------------------------------------------------

// Devuelve los segmentos de una sesión. Para sesiones antiguas (sin `segments`)
// sintetiza un único segmento a partir de los campos planos, de modo que el resto
// del código pueda tratar TODAS las sesiones por igual.
export function getSegments(session) {
  if (Array.isArray(session.segments) && session.segments.length > 0) {
    return session.segments;
  }
  if (session.audio_file || session.transcription_raw) {
    return [{
      audio_file: session.audio_file || null,
      transcription_raw: session.transcription_raw || null,
      transcription_edited: null,
      duration_seconds: null,
      source: 'recorded',
      created_at: session.timestamp || null,
    }];
  }
  return [];
}

// La transcripción "bruta" a nivel de sesión es una vista materializada:
// la concatenación, en orden, del texto de cada segmento (editado si lo hay).
export function recomputeTranscription(segments) {
  return segments
    .map(s => (s.transcription_edited || s.transcription_raw || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

// Añade un segmento a la sesión y reproyecta los campos derivados:
//  - `segments[]`        ← se le hace push del nuevo segmento
//  - `transcription_raw` ← concatenación de todos los segmentos (vista materializada)
//  - `audio_file`        ← espejo del primer segmento (compatibilidad con lectores legacy)
//  - `transcription_edited` ← si existía edición manual, se le anexa el nuevo texto
//    para no dejarla obsoleta respecto al audio capturado.
export function addSegment(id, segment) {
  const session = getSession(id);
  if (!session) return null;

  const segments = getSegments(session).slice();
  segments.push(segment);

  const patch = {
    segments,
    transcription_raw: recomputeTranscription(segments),
    audio_file: segments[0]?.audio_file || null,
  };

  const newText = (segment.transcription_edited || segment.transcription_raw || '').trim();
  if (session.transcription_edited && newText) {
    patch.transcription_edited = `${session.transcription_edited.trim()}\n\n${newText}`;
  }

  return updateSession(id, patch);
}

// Reemplaza la lista de segmentos por completo (p. ej. tras reprocesar el audio en
// disco) y reproyecta los campos derivados. No toca `transcription_edited` salvo que
// se pase explícitamente, porque el reproceso regenera el texto bruto.
export function replaceSegments(id, segments) {
  const session = getSession(id);
  if (!session) return null;
  return updateSession(id, {
    segments,
    transcription_raw: recomputeTranscription(segments),
    audio_file: segments[0]?.audio_file || null,
  });
}

// Número del siguiente segmento (1-based) para nombrar su archivo de audio.
export function nextSegmentNumber(session) {
  return getSegments(session).length + 1;
}
