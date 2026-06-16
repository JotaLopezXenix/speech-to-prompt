// Carga única (al arrancar) de los system prompts de destilación, uno por modo.
// Es la fuente de verdad compartida por `distill.js` (los usa al destilar) y
// `prompts.js` (los sirve al front para verlos/editarlos).
//
// Editar estos .md afina la destilación sin tocar código. Las ediciones "sobre la
// marcha" desde el navegador NO tocan estos ficheros: viajan en la petición y se
// guardan en el JSON de la sesión (`distill_prompt_used`), nunca aquí.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Modo → fichero + texto de respaldo si el fichero no se pudiera leer.
const SOURCES = {
  completo: {
    file: 'distill-system.md',
    fallback: 'Eres un destilador de prompts. Transforma el texto recibido en un prompt limpio, denso y estructurado. Solo devuelve el prompt, sin preámbulo.',
  },
  ligero: {
    file: 'distill-light.md',
    fallback: 'Eres un editor de transcripciones. Limpia el texto (siglas deletreadas, muletillas, repeticiones) sin reestructurar ni resumir. Solo devuelve el texto limpio.',
  },
  literal: {
    file: 'distill-literal.md',
    fallback: 'Devuelve la transcripción palabra por palabra, corrigiendo solo las siglas deletreadas. No cambies nada más. Solo devuelve el texto.',
  },
};

// Modos válidos, en orden: ['completo', 'ligero', 'literal'].
export const DISTILL_MODES = Object.keys(SOURCES);

function loadPrompt({ file, fallback }) {
  try {
    return readFileSync(join(__dirname, file), 'utf-8');
  } catch {
    return fallback;
  }
}

// Mapa { completo, ligero, literal } → string, cargado una vez al importar el módulo.
export const PROMPTS = Object.fromEntries(
  Object.entries(SOURCES).map(([mode, src]) => [mode, loadPrompt(src)]),
);

// Devuelve un modo válido o 'completo' por defecto. Retrocompat: una petición sin
// modo, o con un modo desconocido (front antiguo), nunca rompe; cae al de siempre.
export function resolveMode(mode) {
  return DISTILL_MODES.includes(mode) ? mode : 'completo';
}
