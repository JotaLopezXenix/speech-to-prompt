import { query } from './db.js';

// Prompts de destilación por (familia, modo), leídos de dbo.model_prompts. La BD es
// la fuente en runtime (editable por SQL hoy, por backoffice mañana); el origen
// versionado son los ficheros src/prompts/<familia>/<modo>.md, que se cargan con
// `npm run seed-prompts`. Caché en memoria, mismo patrón que pricing.js.

let cache = null; // Map 'familia:modo' -> text

export async function getPromptMap() {
  if (cache) return cache;
  const r = await query('SELECT family, mode, text FROM dbo.model_prompts');
  cache = new Map(r.recordset.map((p) => [`${p.family}:${p.mode}`, p.text]));
  return cache;
}

export async function getPrompt(family, mode) {
  return (await getPromptMap()).get(`${family}:${mode}`) ?? null;
}

// { modo: text } de una familia. Lo consume routes/prompts.js para sembrar el editor
// del front con los prompts de la familia del modelo activo.
export async function getFamilyPrompts(family) {
  const out = {};
  for (const [key, text] of await getPromptMap()) {
    const [fam, mode] = key.split(':');
    if (fam === family) out[mode] = text;
  }
  return out;
}

// Invalida la caché (tras editar prompts por SQL/seed, o en tests).
export function clearPromptCache() {
  cache = null;
}
