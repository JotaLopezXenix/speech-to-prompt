import { Router } from 'express';
import { createSession, getSession, updateSession, listSessions } from '../services/session-store.js';
import { getSessionUsage } from '../services/usage-store.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const session = await createSession(req.user.id);
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: { code: 'SESSION_CREATE_ERROR', message: err.message } });
  }
});

router.get('/', async (req, res) => {
  try {
    const sessions = await listSessions(req.user.id);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: { code: 'SESSION_LIST_ERROR', message: err.message } });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const session = await getSession(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada' } });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: { code: 'SESSION_READ_ERROR', message: err.message } });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const session = await updateSession(req.params.id, req.body, req.user.id);
    if (!session) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada' } });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: { code: 'SESSION_UPDATE_ERROR', message: err.message } });
  }
});

// Uso + coste estimado de una sesión (propia).
router.get('/:id/usage', async (req, res) => {
  try {
    const session = await getSession(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada' } });
    const usage = await getSessionUsage(req.params.id, req.user.id);
    res.json(usage);
  } catch (err) {
    res.status(500).json({ error: { code: 'USAGE_READ_ERROR', message: err.message } });
  }
});

export default router;
