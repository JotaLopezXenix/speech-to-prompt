import { Router } from 'express';
import { recordDiagnosticEvents } from '../services/diagnostics-store.js';

// Telemetría de captura (cambio grabacion-stop-espontaneo). Recibe lotes de
// eventos de diagnóstico del front y los persiste (append-only). Owner-scoped
// vía el middleware `identity` (montado en server.js). Best-effort en el cliente:
// si esto falla, la grabación NO se interrumpe.

const router = Router();

const MAX_EVENTS = 200;       // tope de eventos por lote
const MAX_PAYLOAD_CHARS = 8192; // ~8 KB de JSON por evento

// Serializa el payload a JSON y lo trunca si excede el tope (no descarta el evento:
// marca _truncated para que el rastro no mienta).
function serializePayload(payload) {
  if (payload == null) return null;
  let json;
  try {
    json = JSON.stringify(payload);
  } catch {
    json = JSON.stringify({ _unserializable: true });
  }
  if (json.length > MAX_PAYLOAD_CHARS) {
    return JSON.stringify({ _truncated: true, raw: json.slice(0, MAX_PAYLOAD_CHARS) });
  }
  return json;
}

// --- POST /api/diagnostics ---------------------------------------------------
router.post('/', async (req, res) => {
  const events = req.body?.events;

  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Falta el array de eventos' } });
  }
  if (events.length > MAX_EVENTS) {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: `Máximo ${MAX_EVENTS} eventos por lote` } });
  }

  const sanitized = events
    .filter((ev) => ev && ev.type && ev.captureRunId)
    .map((ev) => ({
      captureRunId: ev.captureRunId,
      seq: ev.seq,
      type: ev.type,
      payload: serializePayload(ev.payload),
      clientTs: ev.clientTs,
      sessionId: ev.sessionId,
    }));

  if (sanitized.length === 0) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Ningún evento válido (faltan type/captureRunId)' } });
  }

  try {
    const { inserted } = await recordDiagnosticEvents(req.user.id, sanitized);
    res.json({ inserted });
  } catch (err) {
    console.error('Diagnostics insert error:', err);
    res.status(500).json({ error: { code: 'DIAG_FAILED', message: 'No se pudieron guardar los diagnósticos' } });
  }
});

export default router;
