import { getRequest, sql } from './db.js';
import { summarizeCost } from './pricing.js';

// Registro append-only del consumo de modelos (STT/LLM). Guarda cantidades
// crudas; el coste se deriva con pricing.js.

export async function recordUsage({
  sessionId,
  segmentId = null,
  kind,
  provider,
  model,
  inputTokens = null,
  outputTokens = null,
  audioSeconds = null,
}) {
  const req = await getRequest();
  req.input('session_id', sql.Int, Number(sessionId));
  req.input('segment_id', sql.Int, segmentId == null ? null : Number(segmentId));
  req.input('kind', sql.VarChar(10), kind);
  req.input('provider', sql.VarChar(40), provider);
  req.input('model', sql.VarChar(60), model);
  req.input('input_tokens', sql.Int, inputTokens == null ? null : Math.round(inputTokens));
  req.input('output_tokens', sql.Int, outputTokens == null ? null : Math.round(outputTokens));
  req.input('audio_seconds', sql.Int, audioSeconds == null ? null : Math.round(audioSeconds));
  await req.query(`
    INSERT INTO dbo.usage_events
      (session_id, segment_id, kind, provider, model, input_tokens, output_tokens, audio_seconds)
    VALUES
      (@session_id, @segment_id, @kind, @provider, @model, @input_tokens, @output_tokens, @audio_seconds)
  `);
}

// Eventos de uso + coste estimado de una sesión. Aislamiento por dueño (D5):
// JOIN con sessions filtrando por owner_id cuando se pasa callerId.
export async function getSessionUsage(sessionId, callerId) {
  const req = await getRequest();
  req.input('sid', sql.Int, Number(sessionId));
  let where = 'u.session_id = @sid';
  if (callerId != null) {
    req.input('caller', sql.Int, callerId);
    where += ' AND s.owner_id = @caller';
  }
  const r = await req.query(`
    SELECT u.id, u.kind, u.provider, u.model, u.input_tokens, u.output_tokens, u.audio_seconds, u.created_at
    FROM dbo.usage_events u
    JOIN dbo.sessions s ON s.id = u.session_id
    WHERE ${where}
    ORDER BY u.created_at
  `);
  const events = r.recordset;
  const cost = await summarizeCost(events);
  return { events, cost };
}
