// Modos de destilación y utilidades. Los TEXTOS de los prompts ya NO viven aquí:
// están en BD (dbo.model_prompts) por FAMILIA de modelo × modo, servidos por
// services/prompts.js y sembrados desde src/prompts/<familia>/<modo>.md con
// `npm run seed-prompts`. Aquí quedan la lista de modos, resolveMode y un respaldo
// mínimo por si faltara la fila en BD (no debería, tras sembrar).

// Modos válidos, en orden.
export const DISTILL_MODES = ['completo', 'ligero', 'literal', 'limpio'];

// Respaldo de emergencia por modo si la BD no tuviera el prompt. El prompt real y
// afinado vive en BD/ficheros por familia.
export const FALLBACK_PROMPTS = {
  completo: 'Eres un destilador de prompts. Transforma el texto recibido en un prompt limpio, denso y estructurado. Solo devuelve el prompt, sin preámbulo.',
  ligero: 'Eres un editor de transcripciones. Limpia el texto (siglas deletreadas, muletillas, repeticiones) sin reestructurar ni resumir. Solo devuelve el texto limpio.',
  literal: 'Devuelve la transcripción palabra por palabra, corrigiendo solo las siglas deletreadas. No cambies nada más. Solo devuelve el texto.',
  limpio: 'Eres un limpiador y estructurador de transcripciones. Limpia, ordena y densifica fielmente; marca ambigüedades e inferencias con [inferido] y recógelas en una sección final "❓ Preguntas abiertas / supuestos a confirmar". NO resuelvas ni sintetices nada. Solo devuelve el documento.',
};

// Devuelve un modo válido o 'completo' por defecto. Retrocompat: una petición sin
// modo, o con un modo desconocido (front antiguo), nunca rompe; cae al de siempre.
export function resolveMode(mode) {
  return DISTILL_MODES.includes(mode) ? mode : 'completo';
}
