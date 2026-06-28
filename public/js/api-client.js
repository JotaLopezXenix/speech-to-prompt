const BASE = '/api';

async function request(method, path, body, isMultipart = false) {
  const options = { method };
  if (body && !isMultipart) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  } else if (isMultipart) {
    options.body = body; // FormData
  }

  const res = await fetch(`${BASE}${path}`, options);
  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.message || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  // Config
  getConfig: () => request('GET', '/config'),
  updateConfig: (payload) => request('PUT', '/config', payload),

  // Sessions
  createSession: () => request('POST', '/sessions'),
  listSessions: () => request('GET', '/sessions'),
  getSession: (id) => request('GET', `/sessions/${id}`),
  updateSession: (id, payload) => request('PUT', `/sessions/${id}`, payload),

  // Uso + coste estimado de una sesión → { events, cost: { currency, stt, llm, total, unpriced } }.
  getSessionUsage: (id) => request('GET', `/sessions/${id}/usage`),

  // Segments: sube un audio (grabado o importado), lo transcribe y lo añade
  // como un nuevo segmento de la sesión. Devuelve { segment, transcription_raw, session }.
  addSegment: (sessionId, audioBlob, { source = 'recorded', filename = 'audio.webm' } = {}) => {
    const form = new FormData();
    form.append('audio', audioBlob, filename);
    form.append('source', source);
    return request('POST', `/sessions/${sessionId}/segments`, form, true);
  },

  // Re-transcribe el audio ya guardado en disco de una sesión (rescate).
  reprocess: (sessionId) => request('POST', `/sessions/${sessionId}/reprocess`),

  // Distillation. `mode` = completo|ligero|literal|limpio; `systemPrompt` = override
  // editado en el front (opcional; si no, el backend usa el default del modo).
  distill: (sessionId, { mode, systemPrompt } = {}) =>
    request('POST', `/sessions/${sessionId}/distill`, { mode, systemPrompt }),

  // System prompts por defecto de cada modo, para verlos/editarlos antes de destilar.
  getPrompts: () => request('GET', '/prompts'),

  // Telemetría de captura (lote de eventos de diagnóstico). Best-effort: el
  // llamador (diagnostics.js) ignora los errores para no romper la grabación.
  postDiagnostics: (events) => request('POST', '/diagnostics', { events }),
};
