import { query } from './db.js';

// Registro de modelos LLM (dbo.llm_models): a qué familia de prompts mapea cada
// modelo, si está habilitado y cuál es el por defecto. Permite seleccionar el modelo
// activo y RECHAZAR los deshabilitados (p. ej. Claude, conservado pero no ejecutable).
// Caché en memoria, mismo patrón que pricing.js / prompts.js.

let cache = null; // Map 'provider:model' -> row

export async function getModelMap() {
  if (cache) return cache;
  const r = await query(
    'SELECT provider, model, family, enabled, is_default, label FROM dbo.llm_models'
  );
  cache = new Map(
    r.recordset.map((m) => [
      `${m.provider}:${m.model}`,
      { ...m, enabled: !!m.enabled, is_default: !!m.is_default },
    ])
  );
  return cache;
}

export async function getModel(provider, model) {
  return (await getModelMap()).get(`${provider}:${model}`) ?? null;
}

export async function getDefaultModel() {
  for (const m of (await getModelMap()).values()) if (m.is_default) return m;
  return null;
}

// Familia por defecto si el modelo no está dado de alta en el registro (robustez
// ante un LLM_MODEL puesto por entorno que aún no figure en la tabla).
export function familyForProvider(provider) {
  if (provider === 'anthropic') return 'claude';
  if (provider === 'gemini') return 'gemini';
  return 'openai'; // azure-openai y otros de estilo OpenAI
}

export function clearModelCache() {
  cache = null;
}
