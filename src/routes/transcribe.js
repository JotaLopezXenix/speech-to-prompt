import { Router } from 'express';
import multer from 'multer';
import { readFileSync, copyFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { AUDIO_DIR } from '../utils/paths.js';
import { getSession, updateSession } from '../services/session-store.js';
import { getConfig } from '../services/config-store.js';
import { createSTTProvider } from '../providers/stt/index.js';

const router = Router();
const upload = multer({ dest: join(tmpdir(), 'stp-audio') });

router.post('/:id/transcribe', upload.single('audio'), async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: { code: 'MISSING_AUDIO', message: 'No se recibió audio' } });
  }

  const tmpPath = req.file.path;

  try {
    const session = getSession(id);
    if (!session) {
      return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada' } });
    }

    const config = getConfig();
    if (!config.api_keys.groq) {
      return res.status(400).json({ error: { code: 'MISSING_API_KEY', message: 'Falta la API key de Groq. Configúrala en Ajustes.' } });
    }

    // Persist audio file
    const audioFilename = `${id}.webm`;
    const audioDest = join(AUDIO_DIR, audioFilename);
    copyFileSync(tmpPath, audioDest);

    // Transcribe
    const provider = createSTTProvider(
      config.defaults.stt_provider,
      config.api_keys[config.defaults.stt_provider]
    );
    const audioBuffer = readFileSync(audioDest);
    const mimeType = req.file.mimetype || 'audio/webm';
    const { text } = await provider.transcribe(audioBuffer, mimeType, config.defaults.stt_model);

    // Update session
    const updated = updateSession(id, {
      audio_file: audioFilename,
      transcription_raw: text,
      stt_provider: config.defaults.stt_provider,
      stt_model: config.defaults.stt_model,
    });

    res.json({ transcription_raw: text, session: updated });
  } catch (err) {
    console.error('Transcription error:', err);
    res.status(500).json({ error: { code: 'STT_FAILED', message: err.message } });
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
});

export default router;
