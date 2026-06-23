import { getRequest, withTransaction, sql } from './db.js';

// Almacén de sesiones respaldado por SQL. La API pública y la FORMA del objeto
// sesión se conservan idénticas a la versión de ficheros (ver DESIGN §8 y
// SPEC-01 §5). El aislamiento por propietario (flujo 2) se fuerza AQUÍ, en la
// capa de datos (D5): cuando se pasa `callerId`, las consultas filtran por
// `owner_id`, de modo que una sesión de otro usuario es indistinguible de una
// inexistente (la ruta responde 404).

// --- Ensamblado del objeto canónico ------------------------------------------

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value ?? null;
}

function assembleSegment(s) {
  return {
    audio_file: s.audio_file ?? null,
    transcription_raw: s.transcription_raw ?? null,
    transcription_edited: s.transcription_edited ?? null,
    duration_seconds: s.duration_seconds ?? null,
    source: s.source ?? 'recorded',
    created_at: toIso(s.created_at),
  };
}

function assembleSession(row, segmentRows) {
  const segments = (segmentRows || []).map(assembleSegment);
  return {
    id: row.id,
    timestamp: toIso(row.created_at),
    segments,
    transcription_raw: row.transcription_raw ?? null,
    transcription_edited: row.transcription_edited ?? null,
    prompt_distilled: row.prompt_distilled ?? null,
    distill_mode: row.distill_mode ?? null,
    distill_prompt_used: row.distill_prompt_used ?? null,
    llm_provider: row.llm_provider ?? null,
    llm_model: row.llm_model ?? null,
    stt_provider: row.stt_provider ?? null,
    stt_model: row.stt_model ?? null,
    // Espejo para lectores legacy: el audio del primer segmento.
    audio_file: segments[0]?.audio_file ?? null,
  };
}

async function loadSegmentRows(req, sessionId) {
  req.input('sid', sql.Int, sessionId);
  const r = await req.query(`SELECT * FROM dbo.segments WHERE session_id = @sid ORDER BY ordinal`);
  return r.recordset;
}

// Añade el filtro de propietario a un Request si `callerId` viene definido.
// Devuelve el fragmento de WHERE adicional (' AND owner_id = @caller' o '').
function ownerFilter(req, callerId) {
  if (callerId == null) return '';
  req.input('caller', sql.Int, callerId);
  return ' AND owner_id = @caller';
}

// --- API pública -------------------------------------------------------------

export async function createSession(ownerId) {
  if (ownerId == null) throw new Error('createSession requiere ownerId');
  const req = await getRequest();
  req.input('owner_id', sql.Int, ownerId);
  const res = await req.query(`INSERT INTO dbo.sessions (owner_id) OUTPUT INSERTED.* VALUES (@owner_id)`);
  return assembleSession(res.recordset[0], []);
}

export async function getSession(id, callerId) {
  const sid = Number(id);
  if (!Number.isInteger(sid)) return null;

  const req = await getRequest();
  req.input('id', sql.Int, sid);
  const where = `id = @id${ownerFilter(req, callerId)}`;
  const sRes = await req.query(`SELECT * FROM dbo.sessions WHERE ${where}`);
  if (sRes.recordset.length === 0) return null;

  const segRows = await loadSegmentRows(await getRequest(), sid);
  return assembleSession(sRes.recordset[0], segRows);
}

// Solo se escriben columnas escalares en lista blanca. Los segmentos se
// gestionan con addSegment/replaceSegments (ya NO via updateSession).
const SCALAR_COLUMNS = {
  transcription_raw: sql.NVarChar(sql.MAX),
  transcription_edited: sql.NVarChar(sql.MAX),
  prompt_distilled: sql.NVarChar(sql.MAX),
  distill_mode: sql.VarChar(20),
  distill_prompt_used: sql.NVarChar(sql.MAX),
  llm_provider: sql.VarChar(40),
  llm_model: sql.VarChar(60),
  stt_provider: sql.VarChar(40),
  stt_model: sql.VarChar(60),
};

export async function updateSession(id, partial, callerId) {
  const sid = Number(id);
  if (!Number.isInteger(sid)) return null;

  const keys = Object.keys(partial || {}).filter((k) => k in SCALAR_COLUMNS);
  if (keys.length === 0) return getSession(sid, callerId);

  const req = await getRequest();
  req.input('id', sql.Int, sid);
  const where = `id = @id${ownerFilter(req, callerId)}`;
  const sets = [];
  for (const k of keys) {
    req.input(k, SCALAR_COLUMNS[k], partial[k] ?? null);
    sets.push(`${k} = @${k}`);
  }
  const res = await req.query(`UPDATE dbo.sessions SET ${sets.join(', ')} WHERE ${where}; SELECT @@ROWCOUNT AS n;`);
  if (!res.recordset?.[0]?.n) return null;
  return getSession(sid, callerId);
}

export async function listSessions(callerId) {
  const req = await getRequest();
  const where = callerId == null ? '' : (req.input('caller', sql.Int, callerId), 'WHERE s.owner_id = @caller');
  const res = await req.query(`
    SELECT
      s.id, s.created_at, s.prompt_distilled, s.transcription_raw,
      (SELECT COUNT(*) FROM dbo.segments g WHERE g.session_id = s.id) AS segment_count,
      CASE WHEN EXISTS (SELECT 1 FROM dbo.segments g WHERE g.session_id = s.id AND g.audio_file IS NOT NULL)
           THEN 1 ELSE 0 END AS has_audio
    FROM dbo.sessions s
    ${where}
    ORDER BY s.created_at DESC
  `);
  return res.recordset.map((r) => ({
    id: r.id,
    timestamp: toIso(r.created_at),
    preview: r.prompt_distilled
      ? r.prompt_distilled.slice(0, 100)
      : r.transcription_raw
        ? r.transcription_raw.slice(0, 100)
        : null,
    has_prompt: !!r.prompt_distilled,
    has_transcription: !!r.transcription_raw,
    has_audio: !!r.has_audio,
    segment_count: r.segment_count,
  }));
}

// --- Modelo multi-segmento ---------------------------------------------------

// Puro: los segmentos ya vienen materializados en el objeto sesión.
export function getSegments(session) {
  return Array.isArray(session?.segments) ? session.segments : [];
}

// Puro: vista materializada = concatenación, en orden, del texto de cada segmento.
export function recomputeTranscription(segments) {
  return segments
    .map((s) => (s.transcription_edited || s.transcription_raw || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

const SEGMENT_INSERT = `
  INSERT INTO dbo.segments
    (session_id, ordinal, audio_file, transcription_raw, transcription_edited, duration_seconds, source, created_at)
  VALUES
    (@session_id, @ordinal, @audio_file, @transcription_raw, @transcription_edited, @duration_seconds, @source,
     COALESCE(@created_at, SYSUTCDATETIME()))
`;

function bindSegment(req, sessionId, ordinal, seg) {
  req.input('session_id', sql.Int, sessionId);
  req.input('ordinal', sql.Int, ordinal);
  req.input('audio_file', sql.NVarChar(260), seg.audio_file ?? null);
  req.input('transcription_raw', sql.NVarChar(sql.MAX), seg.transcription_raw ?? null);
  req.input('transcription_edited', sql.NVarChar(sql.MAX), seg.transcription_edited ?? null);
  req.input('duration_seconds', sql.Int, seg.duration_seconds ?? null);
  req.input('source', sql.VarChar(20), seg.source === 'imported' ? 'imported' : 'recorded');
  req.input('created_at', sql.DateTime2, seg.created_at ? new Date(seg.created_at) : null);
}

// Comprueba que la sesión existe Y pertenece al caller (si se pasa). Devuelve la
// fila mínima pedida o null. Pensado para usarse dentro de una transacción.
async function guardSession(tx, sid, callerId, columns = '1') {
  const req = new sql.Request(tx).input('id', sql.Int, sid);
  const where = `id = @id${ownerFilter(req, callerId)}`;
  const r = await req.query(`SELECT ${columns} FROM dbo.sessions WHERE ${where}`);
  return r.recordset[0] ?? null;
}

// Añade un segmento y reproyecta la vista materializada, todo en una transacción.
export async function addSegment(id, segment, callerId) {
  const sid = Number(id);
  if (!Number.isInteger(sid)) return null;

  return withTransaction(async (tx) => {
    const row = await guardSession(tx, sid, callerId, 'transcription_edited');
    if (!row) return null;
    const sessionEdited = row.transcription_edited;

    const ordRes = await new sql.Request(tx)
      .input('id', sql.Int, sid)
      .query(`SELECT ISNULL(MAX(ordinal), 0) + 1 AS next FROM dbo.segments WHERE session_id = @id`);
    const ordinal = ordRes.recordset[0].next;

    const insReq = new sql.Request(tx);
    bindSegment(insReq, sid, ordinal, segment);
    await insReq.query(SEGMENT_INSERT);

    const allSegs = (
      await new sql.Request(tx)
        .input('id', sql.Int, sid)
        .query(`SELECT transcription_raw, transcription_edited FROM dbo.segments WHERE session_id = @id ORDER BY ordinal`)
    ).recordset;
    const newRaw = recomputeTranscription(allSegs);

    // Si había edición manual de sesión, se le anexa el texto nuevo (no dejarla obsoleta).
    const newText = (segment.transcription_edited || segment.transcription_raw || '').trim();
    const upReq = new sql.Request(tx);
    upReq.input('id', sql.Int, sid);
    upReq.input('traw', sql.NVarChar(sql.MAX), newRaw);
    let setEdited = '';
    if (sessionEdited && newText) {
      upReq.input('tedited', sql.NVarChar(sql.MAX), `${sessionEdited.trim()}\n\n${newText}`);
      setEdited = ', transcription_edited = @tedited';
    }
    await upReq.query(`UPDATE dbo.sessions SET transcription_raw = @traw${setEdited} WHERE id = @id`);

    const finalS = await new sql.Request(tx).input('id', sql.Int, sid).query(`SELECT * FROM dbo.sessions WHERE id = @id`);
    const finalSegs = await loadSegmentRows(new sql.Request(tx), sid);
    return assembleSession(finalS.recordset[0], finalSegs);
  });
}

// Reemplaza por completo la lista de segmentos (reproceso/rescate) y reproyecta
// transcription_raw. No toca transcription_edited (la ruta lo hace aparte).
export async function replaceSegments(id, segments, callerId) {
  const sid = Number(id);
  if (!Number.isInteger(sid)) return null;

  return withTransaction(async (tx) => {
    const row = await guardSession(tx, sid, callerId);
    if (!row) return null;

    await new sql.Request(tx).input('id', sql.Int, sid).query(`DELETE FROM dbo.segments WHERE session_id = @id`);

    let ordinal = 1;
    for (const seg of segments) {
      const req = new sql.Request(tx);
      bindSegment(req, sid, ordinal++, seg);
      await req.query(SEGMENT_INSERT);
    }

    const allSegs = (
      await new sql.Request(tx)
        .input('id', sql.Int, sid)
        .query(`SELECT transcription_raw, transcription_edited FROM dbo.segments WHERE session_id = @id ORDER BY ordinal`)
    ).recordset;
    const newRaw = recomputeTranscription(allSegs);

    await new sql.Request(tx)
      .input('id', sql.Int, sid)
      .input('traw', sql.NVarChar(sql.MAX), newRaw)
      .query(`UPDATE dbo.sessions SET transcription_raw = @traw WHERE id = @id`);

    const finalS = await new sql.Request(tx).input('id', sql.Int, sid).query(`SELECT * FROM dbo.sessions WHERE id = @id`);
    const finalSegs = await loadSegmentRows(new sql.Request(tx), sid);
    return assembleSession(finalS.recordset[0], finalSegs);
  });
}

// Número del siguiente segmento (1-based) para nombrar su archivo de audio.
// Puro; el ordinal autoritativo lo fija addSegment dentro de su transacción.
export function nextSegmentNumber(session) {
  return getSegments(session).length + 1;
}
