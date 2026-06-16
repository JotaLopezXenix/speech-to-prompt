import { Router } from 'express';
import multer from 'multer';
import { readFileSync, copyFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { AUDIO_DIR } from '../utils/paths.js';
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
import { normalizeForUpload, probeDuration, DEFAULT_MAX_BYTES } from '../services/audio-normalize.js';

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
    const session = getSession(id);
    if (!session) {
      return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada' } });
    }

    const config = getConfig();
    const sttName = config.defaults.stt_provider;
    if (!config.api_keys[sttName]) {
      return res.status(400).json({ error: { code: 'MISSING_API_KEY', message: `Falta la API key del proveedor STT (${sttName}). Configúrala en Ajustes.` } });
    }

    // Guarda el audio canónico del segmento: <id>__seg-N.webm
    const n = nextSegmentNumber(session);
    const audioFilename = `${id}__seg-${n}.webm`;
    const audioDest = join(AUDIO_DIR, audioFilename);
    copyFileSync(tmpPath, audioDest);

    // Normaliza (remux/recodifica/trocea) solo para la transcripción.
    const { files, cleanup } = await normalizeForUpload(audioDest, { maxBytes: DEFAULT_MAX_BYTES });
    cleanupNorm = cleanup;

    const { provider, name, model } = resolveProvider(config);
    const mimeType = req.file.mimetype || 'audio/webm';
    const text = await transcribeFiles(files, provider, model, mimeType);
    const duration = await sumDuration(files);

    const segment = {
      audio_file: audioFilename,
      transcription_raw: text,
      transcription_edited: null,
      duration_seconds: duration,
      source: req.body.source === 'imported' ? 'imported' : 'recorded',
      created_at: new Date().toISOString(),
    };

    addSegment(id, segment);
    const updated = updateSession(id, { stt_provider: name, stt_model: model });

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

// --- POST /api/sessions/:id/reprocess ----------------------------------------
// Re-transcribe el/los audio(s) que ya están en disco para esta sesión.
// Rescata sesiones cuyo audio quedó sin transcribir (o mal transcrito).
router.post('/:id/reprocess', async (req, res) => {
  const { id } = req.params;
  const cleanups = [];

  try {
    const session = getSession(id);
    if (!session) {
      return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada' } });
    }

    const config = getConfig();
    const sttName = config.defaults.stt_provider;
    if (!config.api_keys[sttName]) {
      return res.status(400).json({ error: { code: 'MISSING_API_KEY', message: `Falta la API key del proveedor STT (${sttName}). Configúrala en Ajustes.` } });
    }

    const segments = getSegments(session);
    const onDisk = segments.filter(s => s.audio_file && existsSync(join(AUDIO_DIR, s.audio_file)));
    if (onDisk.length === 0) {
      return res.status(400).json({ error: { code: 'NO_AUDIO', message: 'No hay audio en disco para reprocesar.' } });
    }

    const { provider, name, model } = resolveProvider(config);

    const reprocessed = [];
    for (const seg of segments) {
      const audioPath = seg.audio_file ? join(AUDIO_DIR, seg.audio_file) : null;
      if (!audioPath || !existsSync(audioPath)) {
        reprocessed.push(seg); // conserva lo que haya si el audio no está
        continue;
      }
      const { files, cleanup } = await normalizeForUpload(audioPath, { maxBytes: DEFAULT_MAX_BYTES });
      cleanups.push(cleanup);
      const text = await transcribeFiles(files, provider, model, 'audio/webm');
      const duration = await sumDuration(files);
      reprocessed.push({
        ...seg,
        transcription_raw: text,
        transcription_edited: null, // el reproceso regenera el texto bruto
        duration_seconds: duration ?? seg.duration_seconds ?? null,
        source: seg.source || 'recorded',
        created_at: seg.created_at || session.timestamp,
      });
    }

    replaceSegments(id, reprocessed);
    const updated = updateSession(id, { stt_provider: name, stt_model: model, transcription_edited: null });

    res.json({ transcription_raw: updated.transcription_raw, session: updated });
  } catch (err) {
    console.error('Reprocess error:', err);
    res.status(500).json({ error: { code: 'STT_FAILED', message: err.message } });
  } finally {
    cleanups.forEach(fn => { try { fn(); } catch {} });
  }
});

export default router;
