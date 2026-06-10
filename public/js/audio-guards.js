// Comprobaciones de cordura sobre el audio ANTES de gastar cuota de Groq.
// Compartidas por el workspace de captura (y antes vivían en phase2-transcribe.js).

// WebM/Opus de silencio puro va a ~1-2 KB/s. Voz real suele ir a 4-8+ KB/s.
// Por debajo de este umbral sospechamos micrófono mudo.
export const MIN_BYTES_PER_SECOND = 2000;

// Groq (tier gratuito) rechaza archivos de más de ~25 MB con un 413.
export const MAX_SAFE_BYTES = 24 * 1024 * 1024;

// Evalúa un blob de audio. Devuelve { level, message } donde level ∈
// 'ok' | 'silent' | 'oversize'. `seconds` es la duración estimada (puede ser 0).
export function checkAudio(sizeBytes, seconds) {
  const secs = Math.max(1, seconds || 0);
  const bytesPerSecond = sizeBytes / secs;

  if (bytesPerSecond < MIN_BYTES_PER_SECOND) {
    return {
      level: 'silent',
      message: `El audio parece silencioso: ${(sizeBytes / 1024).toFixed(1)} KB para ${secs}s `
        + `(${bytesPerSecond.toFixed(0)} B/s; lo normal con voz es > ${MIN_BYTES_PER_SECOND} B/s). `
        + `Revisa el micrófono seleccionado.`,
    };
  }

  // Con ffmpeg el servidor trocea los archivos grandes, pero avisamos igualmente
  // por si no hay ffmpeg: así el usuario sabe que puede fallar.
  if (sizeBytes > MAX_SAFE_BYTES) {
    return {
      level: 'oversize',
      message: `La grabación es grande (${(sizeBytes / 1024 / 1024).toFixed(1)} MB; el límite de Groq es ~25 MB). `
        + `Si hay ffmpeg se troceará automáticamente; si no, podría fallar.`,
    };
  }

  return { level: 'ok', message: null };
}
