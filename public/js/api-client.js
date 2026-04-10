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

  // Transcription
  transcribe: (sessionId, audioBlob) => {
    const form = new FormData();
    form.append('audio', audioBlob, 'audio.webm');
    return request('POST', `/sessions/${sessionId}/transcribe`, form, true);
  },

  // Distillation
  distill: (sessionId) => request('POST', `/sessions/${sessionId}/distill`),
};
