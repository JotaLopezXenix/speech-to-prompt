import { Router } from 'express';
import { createSession, getSession, updateSession, listSessions } from '../services/session-store.js';

const router = Router();

router.post('/', (req, res) => {
  try {
    const session = createSession();
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: { code: 'SESSION_CREATE_ERROR', message: err.message } });
  }
});

router.get('/', (req, res) => {
  try {
    const sessions = listSessions();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: { code: 'SESSION_LIST_ERROR', message: err.message } });
  }
});

router.get('/:id', (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada' } });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: { code: 'SESSION_READ_ERROR', message: err.message } });
  }
});

router.put('/:id', (req, res) => {
  try {
    const session = updateSession(req.params.id, req.body);
    if (!session) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada' } });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: { code: 'SESSION_UPDATE_ERROR', message: err.message } });
  }
});

export default router;
