import { Router } from 'express';
import { getConfig } from '../services/config-store.js';
import { getModel, familyForProvider } from '../services/models.js';
import { getFamilyPrompts } from '../services/prompts.js';

const router = Router();

// GET /api/prompts → los prompts por defecto (por modo) de la FAMILIA del modelo
// activo, para que el front los muestre y permita editarlos antes de destilar.
// La fuente es la BD (dbo.model_prompts). El editor del front no necesita conocer
// las familias todavía (el selector de modelo en la UI es mejora diferida).
router.get('/', async (req, res) => {
  try {
    const config = getConfig();
    const provider = config.defaults.llm_provider;
    const model = config.defaults.llm_model;
    const row = await getModel(provider, model);
    const family = row?.family || familyForProvider(provider);
    const prompts = await getFamilyPrompts(family);
    res.json(prompts);
  } catch (err) {
    res.status(500).json({ error: { code: 'PROMPTS_READ_ERROR', message: err.message } });
  }
});

export default router;
