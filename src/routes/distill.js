import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { getSession, updateSession } from '../services/session-store.js';
import { getConfig } from '../services/config-store.js';
import { createLLMProvider } from '../providers/llm/index.js';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = join(__dirname, '../prompts/distill-system.md');

let systemPrompt;
try {
  systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
} catch {
  systemPrompt = 'Eres un destilador de prompts. Transforma el texto recibido en un prompt limpio, denso y estructurado. Solo devuelve el prompt, sin preámbulo.';
}

router.post('/:id/distill', async (req, res) => {
  const { id } = req.params;

  try {
    const session = getSession(id);
    if (!session) {
      return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada' } });
    }

    const textToDistill = session.transcription_edited || session.transcription_raw;
    if (!textToDistill) {
      return res.status(400).json({ error: { code: 'NO_TRANSCRIPTION', message: 'No hay transcripción para destilar' } });
    }

    const config = getConfig();
    const llmProvider = config.defaults.llm_provider;
    const llmModel = config.defaults.llm_model;

    if (!config.api_keys[llmProvider]) {
      return res.status(400).json({
        error: { code: 'MISSING_API_KEY', message: `Falta la API key de ${llmProvider}. Configúrala en Ajustes.` },
      });
    }

    const provider = createLLMProvider(llmProvider, config.api_keys[llmProvider]);
    const { prompt, usage, truncated } = await provider.distill(textToDistill, llmModel, systemPrompt);

    const updated = updateSession(id, {
      prompt_distilled: prompt,
      llm_provider: llmProvider,
      llm_model: llmModel,
    });

    res.json({ prompt_distilled: prompt, usage, truncated: !!truncated, session: updated });
  } catch (err) {
    console.error('Distillation error:', err);
    res.status(500).json({ error: { code: 'LLM_FAILED', message: err.message } });
  }
});

export default router;
