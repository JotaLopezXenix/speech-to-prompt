import { api } from './api-client.js';

// Cliente de telemetría de captura (cambio grabacion-stop-espontaneo).
// Un único intento de grabación = un capture_run. Buffer en memoria + envío por
// lotes al backend. TODO es best-effort: cualquier fallo de red se traga; la
// grabación NUNCA debe romperse por esto.

const FLUSH_AT = 50;       // tamaño de buffer que dispara un flush
const BUFFER_CAP = 500;    // tope defensivo si la red está caída (descarta lo más viejo)
const MAX_BATCH = 100;     // troceo por POST: el servidor rechaza lotes > 200 (413)

// Eventos que, al registrarse, fuerzan un flush inmediato (son los relevantes
// para el diagnóstico y no queremos perderlos si la pestaña se cierra).
const SUSPICIOUS = new Set([
  'recorder_stop_external',
  'recorder_error',
  'track_ended',
  'mediasession_action',
]);

let captureRunId = null;
let seq = 0;
let sessionId = null;
let buffer = [];
let runActive = false; // true mientras hay una grabación en curso
let flushing = false;  // guarda anti-concurrencia para flush()

function isSuspicious(type, payload) {
  if (SUSPICIOUS.has(type)) return true;
  // Una activación de botón no fiable (sintética) es señal fuerte de H1.
  return type === 'record_button_activated' && payload && payload.isTrusted === false;
}

// Genera un id de intento. Resetea el contador de orden y marca el run activo.
export function startCaptureRun(meta = {}) {
  captureRunId = (crypto?.randomUUID?.() || `run-${Date.now()}-${Math.floor(performance.now())}`);
  seq = 0;
  runActive = true;
  return captureRunId;
}

// Cierra el intento de grabación (intencional o por corte) y vacía el buffer.
export function endCaptureRun() {
  runActive = false;
  flush();
}

// Asocia la sesión (creada lazy) a los eventos siguientes.
export function setSessionId(id) {
  sessionId = id == null ? null : Number(id);
}

export function logEvent(type, payload = {}) {
  if (!captureRunId) startCaptureRun();
  buffer.push({
    captureRunId,
    seq: seq++,
    type,
    payload,
    clientTs: new Date().toISOString(),
    sessionId,
  });
  if (buffer.length > BUFFER_CAP) buffer.splice(0, buffer.length - BUFFER_CAP);
  if (isSuspicious(type, payload) || buffer.length >= FLUSH_AT) flush();
}

// Envía el buffer pendiente en tandas de <= MAX_BATCH (el servidor rechaza > 200).
// Cada tanda se reclama ANTES del await (así flushBeacon no la reenvía) y, si falla,
// se re-encola por delante y se corta (reintento en el próximo flush). Nunca lanza.
// La guarda `flushing` evita envíos solapados (logEvent llama a flush sin await).
export async function flush() {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  try {
    while (buffer.length > 0) {
      const batch = buffer.slice(0, MAX_BATCH);
      buffer = buffer.slice(batch.length); // reclama la tanda antes del await
      try {
        await api.postDiagnostics(batch);
      } catch {
        buffer = batch.concat(buffer); // re-encola lo no enviado por delante
        if (buffer.length > BUFFER_CAP) buffer.splice(0, buffer.length - BUFFER_CAP);
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

// Variante para descargas en cierre de pestaña: usa fetch con keepalive, que el
// navegador deja terminar aunque la página se esté descargando.
export function flushBeacon() {
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  try {
    fetch('/api/diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* best-effort: si ni eso, se pierde el lote */
  }
}

// Cambios de visibilidad / cierre de pestaña (registro único de módulo). La
// suspensión por visibilidad es una hipótesis del corte (H2): si hay un run
// activo, se registra el cambio; al ocultarse, además se descarga el buffer.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushBeacon);
  document.addEventListener('visibilitychange', () => {
    if (runActive) logEvent('visibility_change', { visibilityState: document.visibilityState });
    if (document.visibilityState === 'hidden') flushBeacon();
  });
}
