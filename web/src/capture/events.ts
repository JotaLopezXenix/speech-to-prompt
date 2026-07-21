// Inventario CERRADO de nombres de evento de telemetría de captura (SPEC-04).
// Portado del comportamiento de public/js/{audio-recorder,phase1-capture,diagnostics}.js.
// No se inventan tipos nuevos: el aviso "sin señal" es UI, no telemetría.

export const CAPTURE_EVENTS = {
  // Emitidos por audio-recorder.ts (vía onDiag)
  recorderStarted: 'recorder_started',
  recorderStopExternal: 'recorder_stop_external',
  recorderError: 'recorder_error',
  trackEnded: 'track_ended',
  trackMuted: 'track_muted',
  trackUnmuted: 'track_unmuted',

  // Emitidos por useCapture (orquestación)
  recordButtonActivated: 'record_button_activated',
  captureStarted: 'capture_started',
  chunksPreserved: 'chunks_preserved',
  recoveredSegmentKept: 'recovered_segment_kept',
  recoveredSegmentDiscarded: 'recovered_segment_discarded',
  recoveredSegmentEmpty: 'recovered_segment_empty',
  uploadRetry: 'upload_retry',
  uploadRetryDiscarded: 'upload_retry_discarded',
  mediasessionAction: 'mediasession_action',

  // Emitido por diagnostics.ts
  visibilityChange: 'visibility_change',
} as const

export type CaptureEventType = (typeof CAPTURE_EVENTS)[keyof typeof CAPTURE_EVENTS]
