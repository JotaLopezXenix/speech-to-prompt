import { Router } from 'express';
import { PROMPTS } from '../prompts/index.js';

const router = Router();

// GET /api/prompts → los system prompts por defecto de cada modo de destilación,
// para que el front los muestre y permita editarlos antes de destilar.
// Son estáticos y viven en memoria (se leen al arrancar): seguro ante concurrencia
// y sin I/O de disco por petición.
router.get('/', (req, res) => {
  res.json(PROMPTS);
});

export default router;
