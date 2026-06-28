import { sql, withTransaction } from './db.js';

// Registro append-only de telemetría de captura (cambio grabacion-stop-espontaneo).
// Guarda eventos crudos para diagnosticar el corte espontáneo de grabación. El
// llamador (routes/diagnostics.js) ya validó/saneó el lote; aquí solo se inserta.
//
// Cada evento de entrada: { captureRunId, seq, type, payload, clientTs?, sessionId? }
//  - payload llega ya serializado a string JSON (o null).
//  - clientTs: ISO 8601 → DATETIME2; si falta/no parsea, null.
//  - sessionId: número o null (referencia blanda, no se valida pertenencia).

function parseClientTs(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function recordDiagnosticEvents(ownerId, events) {
  if (!Array.isArray(events) || events.length === 0) return { inserted: 0 };

  return withTransaction(async (tx) => {
    let inserted = 0;
    for (const ev of events) {
      const req = new sql.Request(tx);
      req.input('owner_id', sql.Int, Number(ownerId));
      req.input('session_id', sql.Int, ev.sessionId == null ? null : Number(ev.sessionId));
      req.input('capture_run_id', sql.NVarChar(64), String(ev.captureRunId).slice(0, 64));
      req.input('seq', sql.Int, Number.isFinite(ev.seq) ? Math.trunc(ev.seq) : 0);
      req.input('event_type', sql.VarChar(40), String(ev.type).slice(0, 40));
      req.input('payload', sql.NVarChar(sql.MAX), ev.payload == null ? null : String(ev.payload));
      req.input('client_ts', sql.DateTime2, parseClientTs(ev.clientTs));
      await req.query(`
        INSERT INTO dbo.diagnostic_events
          (owner_id, session_id, capture_run_id, seq, event_type, payload, client_ts)
        VALUES
          (@owner_id, @session_id, @capture_run_id, @seq, @event_type, @payload, @client_ts)
      `);
      inserted++;
    }
    return { inserted };
  });
}
