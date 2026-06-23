import { Router } from 'express';
import multer from 'multer';
import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getSession,
  getSegments,
  addSegment,
  replaceSegments,
  nextSegmentNumber,
  updateSession,
} from '../services/session-store.js';
import { getConfig } from '../services/config-store.js';
import { createSTTProvider } from '../providers/stt/index.js';
import { getBlobStore } from '../providers/storage/index.js';
import { recordUsage } from '../services/usage-store.js';
import { normalizeForUpload, probeDuration, DEFAULT_MAX_BYTES } from '../services/audio-normalize.js';

// Registro de uso no bloqueante: si falla, se loguea y el flujo continúa
// (no se pierde la transcripción/destilación, solo quizá un evento de coste).
async function logUsageSafe(event) {
  try { await recordUsage(event); } catch (e) { console.error('usage log failed:', e.message); }
}

const router = Router();
const upload = multer({ dest: join(tmpdir(), 'stp-audio') });

// Transcribe una lista de archivos (1, o varios si hubo troceo) y une el texto.
async function transcribeFiles(files, provider, model, mimeType) {
  const parts = [];
  for (const file of files) {
    const buffer = readFileSync(file);
    const { text } = await provider.transcribe(buffer, mimeType, model);
    if (text && text.trim()) parts.push(text.trim());
  }
  return parts.join('\n\n');
}

// Duración total (s) a partir de los archivos NORMALIZADOS (que sí llevan el
// metadato de duración). El .webm crudo de MediaRecorder no lo tiene, así que
// probarlo daría null; por eso se mide sobre la salida de la normalización.
async function sumDuration(files) {
  let total = 0;
  let any = false;
  for (const f of files) {
    const d = await probeDuration(f);
    if (d) { total += d; any = true; }
  }
  return any ? total : null;
}

function resolveProvider(config) {
  const name = config.defaults.stt_provider;
  return { provider: createSTTProvider(name, config.api_keys[name]), name, model: config.defaults.stt_model };
}

// Sube un audio (grabado o importado), lo normaliza (ffmpeg opcional), lo
// transcribe y lo añade como un nuevo segmento de la sesión.
async function handleAddSegment(req, res) {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: { code: 'MISSING_AUDIO', message: 'No se recibió audio' } });
  }

  const tmpPath = req.file.path;
  let cleanupNorm = () => {};

  try {
    const session = await getSession(id, req.user.id);
    if (!session) {
      return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada' } });
    }

    const config = getConfig();
    const sttName = config.defaults.stt_provider;
    if (!config.api_keys[sttName]) {
      return res.status(400).json({ error: { code: 'MISSING_API_KEY', message: `Falta la API key del proveedor STT (${sttName}). Configúrala en Ajustes.` } });
    }

    // Guarda el audio canónico del segmento en el store (clave <id>__seg-N.webm).
    const n = nextSegmentNumber(session);
    const audioKey = `${id}__seg-${n}.webm`;
    const mimeType = req.file.mimetype || 'audio/webm';
    await getBlobStore().put(audioKey, readFileSync(tmpPath), mimeType);

    // Normaliza el temporal de multer (mismos bytes) solo para la transcripción.
    const { files, cleanup } = await normalizeForUpload(tmpPath, { maxBytes: DEFAULT_MAX_BYTES });
    cleanupNorm = cleanup;

    const { provider, name, model } = resolveProvider(config);
    const text = await transcribeFiles(files, provider, model, mimeType);
    const duration = await sumDuration(files);

    const segment = {
      audio_file: audioKey,
      transcription_raw: text,
      transcription_edited: null,
      duration_seconds: duration,
      source: req.body.source === 'imported' ? 'imported' : 'recorded',
      created_at: new Date().toISOString(),
    };

    await addSegment(id, segment, req.user.id);
    const updated = await updateSession(id, { stt_provider: name, stt_model: model }, req.user.id);
    await logUsageSafe({ sessionId: id, kind: 'stt', provider: name, model, audioSeconds: duration });

    res.json({ segment, transcription_raw: updated.transcription_raw, session: updated });
  } catch (err) {
    console.error('Segment transcription error:', err);
    res.status(500).json({ error: { code: 'STT_FAILED', message: err.message } });
  } finally {
    cleanupNorm();
    try { unlinkSync(tmpPath); } catch {}
  }
}

// --- POST /api/sessions/:id/segments -----------------------------------------
router.post('/:id/segments', upload.single('audio'), handleAddSegment);

// --- POST /api/sessions/:id/transcribe (alias histórico) ---------------------
router.post('/:id/transcribe', upload.single('audio'), handleAddSegment);

// --- GET /api/sessions/:id/audio/:ordinal ------------------------------------
// Sirve el audio de un segmento desde el store, con autorización por propietario
// (el contenedor en Azure es privado: este es el único acceso al audio).
router.get('/:id/audio/:ordinal', async (req, res) => {
  try {
    const session = await getSession(req.params.id, req.user.id);
    if (!session) {
      return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada' } });
    }
    const seg = getSegments(session)[Number(req.params.ordinal) - 1];
    const key = seg?.audio_file;
    const store = getBlobStore();
    if (!key || !(await store.exists(key))) {
      return res.status(404).json({ error: { code: 'AUDIO_NOT_FOUND', message: 'Audio no encontrado' } });
    }
    res.setHeader('Content-Type', 'audio/webm');
    const stream = await store.openReadStream(key);
    stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
    stream.pipe(res);
  } catch (err) {
    console.error('Serve audio error:', err);
    if (!res.headersSent) res.status(500).json({ error: { code: 'AUDIO_FAILED', message: err.message } });
  }
});

// --- POST /api/sessions/:id/reprocess ----------------------------------------
// Re-transcribe el/los audio(s) ya guardados en el store para esta sesión.
// Rescata sesiones cuyo audio quedó sin transcribir (o mal transcrito).
router.post('/:id/reprocess', async (req, res) => {
  const { id } = req.params;
  const cleanups = [];

  try {
    const session = await getSession(id, req.user.id);
    if (!session) {
      return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada' } });
    }

    const config = getConfig();
    const sttName = config.defaults.stt_provider;
    if (!config.api_keys[sttName]) {
      return res.status(400).json({ error: { code: 'MISSING_API_KEY', message: `Falta la API key del proveedor STT (${sttName}). Configúrala en Ajustes.` } });
    }

    const store = getBlobStore();
    const segments = getSegments(session);
    // Qué segmentos tienen audio en el store (consulta una sola vez por segmento).
    const present = await Promise.all(
      segments.map((s) => (s.audio_file ? store.exists(s.audio_file) : Promise.resolve(false)))
    );
    if (!present.some(Boolean)) {
      return res.status(400).json({ error: { code: 'NO_AUDIO', message: 'No hay audio para reprocesar.' } });
    }

    const { provider, name, model } = resolveProvider(config);

    const reprocessed = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!present[i]) {
        reprocessed.push(seg); // conserva lo que haya si el audio no está
        continue;
      }
      const tmpAudio = join(tmpdir(), `stp-reproc-${seg.audio_file}`);
      await store.downloadToFile(seg.audio_file, tmpAudio);
      cleanups.push(() => { try { unlinkSync(tmpAudio); } catch {} });

      const { files, cleanup } = await normalizeForUpload(tmpAudio, { maxBytes: DEFAULT_MAX_BYTES });
      cleanups.push(cleanup);
      const text = await transcribeFiles(files, provider, model, 'audio/webm');
      const duration = await sumDuration(files);
      await logUsageSafe({ sessionId: id, kind: 'stt', provider: name, model, audioSeconds: duration });
      reprocessed.push({
        ...seg,
        transcription_raw: text,
        transcription_edited: null, // el reproceso regenera el texto bruto
        duration_seconds: duration ?? seg.duration_seconds ?? null,
        source: seg.source || 'recorded',
        created_at: seg.created_at || session.timestamp,
      });
    }

    await replaceSegments(id, reprocessed, req.user.id);
    const updated = await updateSession(id, { stt_provider: name, stt_model: model, transcription_edited: null }, req.user.id);

    res.json({ transcription_raw: updated.transcription_raw, session: updated });
  } catch (err) {
    console.error('Reprocess error:', err);
    res.status(500).json({ error: { code: 'STT_FAILED', message: err.message } });
  } finally {
    cleanups.forEach(fn => { try { fn(); } catch {} });
  }
});

export default router;
