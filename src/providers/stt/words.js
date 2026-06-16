// Reconstruye el transcript uniendo `words[]`. Cada palabra suele traer pegada su
// puntuación de cierre ("Platform,", "pasado.", "¿vale?"), así que basta con unir
// por espacios y pegar la puntuación suelta. Devuelve null si no hay palabras.
//
// Se usa como fuente principal en Groq (cuyo campo `text` trunca los acentos) y
// como red de seguridad en proveedores cuyo `text` ya sale limpio (Azure OpenAI).
export function textFromWords(words) {
  if (!Array.isArray(words) || words.length === 0) return null;
  return words
    .map(w => (w.word || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.;:!?…%)\]}»])/g, '$1')   // sin espacio ANTES de puntuación de cierre
    .replace(/([(¡¿«[{])\s+/g, '$1')           // sin espacio DESPUÉS de apertura
    .trim();
}
