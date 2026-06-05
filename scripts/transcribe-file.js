// Utilidad de mantenimiento: transcribe un archivo de audio ya existente
// en disco y guarda el resultado en una sesión.
//
// Útil para rescatar grabaciones que fallaron en la transcripción online
// (p. ej. un .webm demasiado grande para Groq que se ha comprimido a mano).
//
// Uso:
//   node scripts/transcribe-file.js <sessionId> <rutaAudio> [mimeType]
//
// Ejemplo:
//   node scripts/transcribe-file.js 2026-06-05T11-17-38 data/audio/_recover.webm
//
import { readFileSync, existsSync } from 'fs';
import { basename } from 'path';
import { getConfig } from '../src/services/config-store.js';
import { getSession, updateSession } from '../src/services/session-store.js';
import { createSTTProvider } from '../src/providers/stt/index.js';

const [, , sessionId, audioPath, mimeArg] = process.argv;

if (!sessionId || !audioPath) {
  console.error('Uso: node scripts/transcribe-file.js <sessionId> <rutaAudio> [mimeType]');
  process.exit(1);
}

if (!existsSync(audioPath)) {
  console.error(`No existe el archivo de audio: ${audioPath}`);
  process.exit(1);
}

const session = getSession(sessionId);
if (!session) {
  console.error(`No existe la sesión: ${sessionId}`);
  process.exit(1);
}

const config = getConfig();
const sttProvider = config.defaults.stt_provider;
const apiKey = config.api_keys[sttProvider];
if (!apiKey) {
  console.error(`Falta la API key de ${sttProvider}. Configúrala en Ajustes.`);
  process.exit(1);
}

const mimeType = mimeArg || 'audio/webm';
const buf = readFileSync(audioPath);
console.log(`Transcribiendo ${basename(audioPath)} (${(buf.length / 1024 / 1024).toFixed(1)} MB) con ${sttProvider}/${config.defaults.stt_model}...`);

const provider = createSTTProvider(sttProvider, apiKey);
const { text } = await provider.transcribe(buf, mimeType, config.defaults.stt_model);

updateSession(sessionId, {
  // Mantiene la referencia al audio original de la sesión.
  audio_file: session.audio_file || `${sessionId}.webm`,
  transcription_raw: text,
  stt_provider: sttProvider,
  stt_model: config.defaults.stt_model,
});

console.log(`OK: ${text.length} caracteres guardados en la sesión ${sessionId}.`);
console.log(`Vista previa: ${text.slice(0, 200)}${text.length > 200 ? '…' : ''}`);
