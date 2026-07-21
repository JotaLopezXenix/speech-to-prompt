import { api, getCachedToken } from '@/api/client'

// Cliente de telemetría de captura (SPEC-04; port de public/js/diagnostics.js).
// Un único intento de grabación = un capture_run. Buffer en memoria + envío por
// lotes al backend. TODO es best-effort: cualquier fallo de red se traga; la
// grabación NUNCA debe romperse por esto. Singleton de módulo, como el viejo.

const FLUSH_AT = 50 // tamaño de buffer que dispara un flush
const BUFFER_CAP = 500 // tope defensivo si la red está caída (descarta lo más viejo)
const MAX_BATCH = 100 // troceo por POST: el servidor rechaza lotes > 200 (413)
const BEACON_MAX = 200 // el beacon envía a lo sumo los últimos 200 (evita 413 en descarga)

// Eventos que, al registrarse, fuerzan un flush inmediato (son los relevantes
// para el diagnóstico y no queremos perderlos si la pestaña se cierra).
const SUSPICIOUS = new Set(['recorder_stop_external', 'recorder_error', 'track_ended', 'mediasession_action'])

type DiagEvent = {
  captureRunId: string
  seq: number
  type: string
  payload: unknown
  clientTs: string
  sessionId: number | null
}

let captureRunId: string | null = null
let seq = 0
let sessionId: number | null = null
let buffer: DiagEvent[] = []
let runActive = false // true mientras hay una grabación en curso
let flushing = false // guarda anti-concurrencia para flush()

function isSuspicious(type: string, payload: unknown): boolean {
  if (SUSPICIOUS.has(type)) return true
  // Una activación de botón no fiable (sintética) es señal fuerte de H1.
  return (
    type === 'record_button_activated' &&
    !!payload &&
    (payload as { isTrusted?: boolean }).isTrusted === false
  )
}

// Genera un id de intento. Resetea el contador de orden y marca el run activo.
export function startCaptureRun(): string {
  captureRunId = crypto?.randomUUID?.() || `run-${Date.now()}-${Math.floor(performance.now())}`
  seq = 0
  runActive = true
  return captureRunId
}

// Cierra el intento de grabación (intencional o por corte) y vacía el buffer.
export function endCaptureRun(): void {
  runActive = false
  void flush()
}

// Asocia la sesión (creada lazy) a los eventos siguientes.
export function setSessionId(id: number | null): void {
  sessionId = id == null ? null : Number(id)
}

export function logEvent(type: string, payload: unknown = {}): void {
  if (!captureRunId) startCaptureRun()
  buffer.push({
    captureRunId: captureRunId!,
    seq: seq++,
    type,
    payload,
    clientTs: new Date().toISOString(),
    sessionId,
  })
  if (buffer.length > BUFFER_CAP) buffer.splice(0, buffer.length - BUFFER_CAP)
  if (isSuspicious(type, payload) || buffer.length >= FLUSH_AT) void flush()
}

// Envía el buffer pendiente en tandas de <= MAX_BATCH (el servidor rechaza > 200).
// Cada tanda se reclama ANTES del await (así flushBeacon no la reenvía) y, si falla,
// se re-encola por delante y se corta (reintento en el próximo flush). Nunca lanza.
// La guarda `flushing` evita envíos solapados (logEvent llama a flush sin await).
export async function flush(): Promise<void> {
  if (flushing || buffer.length === 0) return
  flushing = true
  try {
    while (buffer.length > 0) {
      const batch = buffer.slice(0, MAX_BATCH)
      buffer = buffer.slice(batch.length) // reclama la tanda antes del await
      try {
        await api.postDiagnostics(batch as Parameters<typeof api.postDiagnostics>[0])
      } catch {
        buffer = batch.concat(buffer) // re-encola lo no enviado por delante
        if (buffer.length > BUFFER_CAP) buffer.splice(0, buffer.length - BUFFER_CAP)
        break
      }
    }
  } finally {
    flushing = false
  }
}

// Variante para descargas en cierre de pestaña: usa fetch con keepalive, que el
// navegador deja terminar aunque la página se esté descargando. Envía a lo sumo
// los últimos BEACON_MAX eventos en un único POST a /api/v1/diagnostics.
// DELTA sobre el viejo (que enviaba todo en un POST → 413 garantizado en buffers
// grandes): telemetría best-effort, fuera de R1 (SPEC-04 §3.3/§7).
export function flushBeacon(): void {
  if (buffer.length === 0) return
  const batch = buffer.slice(-BEACON_MAX)
  buffer = []
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    // El middleware del cliente tipado no corre aquí: adjuntamos el token cacheado
    // de forma síncrona si lo hay (devBypass no tiene token; se envía sin él).
    const token = getCachedToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
    void fetch('/api/v1/diagnostics', {
      method: 'POST',
      headers,
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* best-effort: si ni eso, se pierde el lote */
  }
}

// Cambios de visibilidad / cierre de pestaña (registro único de módulo). La
// suspensión por visibilidad es una hipótesis del corte (H2): si hay un run
// activo, se registra el cambio; al ocultarse, además se descarga el buffer.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushBeacon)
  document.addEventListener('visibilitychange', () => {
    if (runActive) logEvent('visibility_change', { visibilityState: document.visibilityState })
    if (document.visibilityState === 'hidden') flushBeacon()
  })
}

// Fachada agrupada (espejo del `import * as diag` del viejo).
export const diag = {
  startCaptureRun,
  endCaptureRun,
  setSessionId,
  logEvent,
  flush,
  flushBeacon,
}
