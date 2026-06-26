// Evaluación de destilado GPT contra el golden Sonnet.
//
// Re-destila la transcripción del golden (data/sessions/2026-06-06T10-12-24.json)
// con uno o más modelos (deployments) de Azure OpenAI, usando el prompt `completo`
// vigente (src/prompts/openai/completo.md), y guarda cada salida como artefacto
// para compararla contra la destilación de referencia que hizo Sonnet.
//
// Uso:
//   node --env-file-if-exists=.env scripts/eval-distill.mjs gpt-4.1 gpt-5.4 gpt-4.1-mini
//
// `model` es el nombre del *deployment* en Azure OpenAI (debe existir en el recurso).
// El script llama al provider DIRECTAMENTE: no toca la BD ni el gating MODEL_DISABLED,
// así que no hace falta enabled=1 en dbo.llm_models para probar un modelo.
//
// Salidas: docs/cambios/20260626_mejorar-destilado-gpt/eval/out/<modelo>.md
//          docs/cambios/20260626_mejorar-destilado-gpt/eval/golden.md (referencia)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute, basename } from 'node:path';
import { createLLMProvider } from '../src/providers/llm/index.js';
import { getConfig } from '../src/services/config-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Sesión a destilar (con su golden Sonnet dentro): por defecto la primera del
// estudio; override con SESSION_JSON (ruta relativa a la raíz o absoluta).
const sessionRel  = process.env.SESSION_JSON || 'data/sessions/2026-06-06T10-12-24.json';
const GOLDEN_JSON = isAbsolute(sessionRel) ? sessionRel : join(ROOT, sessionRel);
const sessionId   = basename(sessionRel).replace(/\.json$/, '');
// Prompt destilador: por defecto el `completo` vigente; override con EVAL_PROMPT
// (ruta relativa a la raíz del repo o absoluta) para probar variantes.
const promptRel   = process.env.EVAL_PROMPT || 'src/prompts/openai/completo.md';
const PROMPT_MD   = isAbsolute(promptRel) ? promptRel : join(ROOT, promptRel);
const EVAL_DIR    = join(ROOT, 'docs/cambios/20260626_mejorar-destilado-gpt/eval');
const OUT_DIR     = join(EVAL_DIR, 'out');
// Etiqueta opcional para no pisar salidas de otras variantes: out/<modelo>.<tag>.md
const TAG         = process.env.EVAL_TAG ? `.${process.env.EVAL_TAG}` : '';

const models = process.argv.slice(2);
if (models.length === 0) {
  console.error('Uso: node --env-file-if-exists=.env scripts/eval-distill.mjs <deployment> [<deployment> ...]');
  process.exit(1);
}

const session = JSON.parse(await readFile(GOLDEN_JSON, 'utf8'));
const source = (session.transcription_raw ?? '').trim();
const golden = session.prompt_distilled ?? '';
const systemPrompt = await readFile(PROMPT_MD, 'utf8');

if (!source) {
  console.error('No hay transcription_raw en el JSON golden.');
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
// Deja el golden a mano para comparar lado a lado (uno por sesión).
await writeFile(join(EVAL_DIR, `golden__${sessionId}.md`), golden, 'utf8');

// Misma fuente de key que la app (config.json o AZURE_OPENAI_API_KEY). Si está
// vacía, el provider cae a Managed Identity / az login (DefaultAzureCredential).
let apiKey = '';
try { apiKey = getConfig()?.api_keys?.['azure-openai'] || ''; } catch { /* MI */ }
const provider = createLLMProvider('azure-openai', apiKey);

console.log(`Sesión: ${sessionId} | Source: ${source.length} chars | Golden: ${golden.length} chars`);
console.log(`Prompt: ${systemPrompt.length} chars (${promptRel})${TAG ? ` | tag: ${TAG.slice(1)}` : ''}`);
console.log(`Auth: ${apiKey ? 'api-key' : 'Managed Identity / az login'}`);
console.log(`Modelos: ${models.join(', ')}\n`);

const summary = [];
for (const model of models) {
  process.stdout.write(`-> ${model} ... `);
  const t0 = Date.now();
  try {
    const { prompt, usage, truncated } = await provider.distill(source, model, systemPrompt);
    const ms = Date.now() - t0;
    const outPath = join(OUT_DIR, `${sessionId}__${model}${TAG}.md`);
    await writeFile(outPath, prompt, 'utf8');
    summary.push({
      model, ok: true, chars: prompt.length,
      in_tok: usage?.input_tokens, out_tok: usage?.output_tokens,
      truncated: !!truncated, ms,
    });
    console.log(`ok (${prompt.length} chars, ${usage?.output_tokens ?? '?'} out tok${truncated ? ', TRUNCADO!' : ''}, ${ms} ms)`);
  } catch (e) {
    summary.push({ model, ok: false, error: e.message });
    console.log(`ERROR: ${e.message}`);
  }
}

console.log('\n=== Resumen ===');
console.table(summary);
console.log(`\nSalidas en: ${OUT_DIR}`);
console.log(`Golden en:  ${join(EVAL_DIR, 'golden.md')}`);
process.exit(0);
