import { Router } from 'express';
import { withRetry, query } from '../services/db.js';

// Warm-up de la BD (cambio robustez-coldstart-sql). Montado SIN identity: un
// SELECT 1 no toca datos de usuario y solo pretende despertar la Serverless
// pausada. El front lo llama fire-and-forget al empezar a grabar, para que el
// guardado al Detener no vea el arranque en frío.
const router = Router();

// GET /api/health/db → 200 {ok:true} cuando la BD responde; 503 si no levanta.
router.get('/db', async (_req, res) => {
  try {
    await withRetry(() => query('SELECT 1 AS ok'));
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: { code: 'DB_UNAVAILABLE', message: err.message } });
  }
});

export default router;
