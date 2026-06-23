import { Router } from 'express';
import { getSession, updateSession } from '../services/session-store.js';
import { getConfig } from '../services/config-store.js';
import { createLLMProvider } from '../providers/llm/index.js';
import { PROMPTS, resolveMode } from '../prompts/index.js';
import { recordUsage } from '../services/usage-store.js';

const router = Router();

router.post('/:id/distill', async (req, res) => {
  const { id } = req.params;

  try {
    const session = await getSession(id, req.user.id);
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

    // Modo de destilación + system prompt efectivo.
    //  - `mode`: completo | ligero | literal | limpio (desconocido/ausente → completo).
    //  - `systemPrompt`: override editado "sobre la marcha" desde el front. Si viene
    //    no vacío, manda; si no, se usa el prompt por defecto del modo. Los .md en
    //    disco NUNCA se tocan — la edición solo vive en la petición y en el JSON.
    const mode = resolveMode(req.body?.mode);
    const override = req.body?.systemPrompt;
    const systemPrompt = (typeof override === 'string' && override.trim()) ? override : PROMPTS[mode];

    const provider = createLLMProvider(llmProvider, config.api_keys[llmProvider]);
    const { prompt, usage, truncated } = await provider.distill(textToDistill, llmModel, systemPrompt);

    const updated = await updateSession(id, {
      prompt_distilled: prompt,
      llm_provider: llmProvider,
      llm_model: llmModel,
      distill_mode: mode,
      // El system prompt EXACTO usado (override o default). Queda en el JSON para
      // consultar/comparar después y para reusarlo/afinarlo al reabrir la sesión.
      distill_prompt_used: systemPrompt,
    }, req.user.id);

    // Registro de uso (coste) no bloqueante: no debe tumbar la destilación.
    try {
      await recordUsage({
        sessionId: id,
        kind: 'llm',
        provider: llmProvider,
        model: llmModel,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
      });
    } catch (e) {
      console.error('usage log (llm) failed:', e.message);
    }

    res.json({ prompt_distilled: prompt, usage, truncated: !!truncated, session: updated });
  } catch (err) {
    console.error('Distillation error:', err);
    res.status(500).json({ error: { code: 'LLM_FAILED', message: err.message } });
  }
});

export default router;
