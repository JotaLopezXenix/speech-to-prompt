// Comparación de destilación: gpt-4.1 (Azure OpenAI, crédito) vs claude-sonnet-4-6
// (Anthropic directo, línea base). Cada modelo usa el prompt de SU familia desde BD
// (openai vs claude), que es como se ejecutará en producción. Uso puntual de dev.
//
// Uso (PowerShell, con .env para AZURE_OPENAI_ENDPOINT + conexión SQL):
//   node --env-file-if-exists=.env scripts/compare-distill.js <sessionId> [modo]
//   (modo: limpio | completo | ligero | literal; def. limpio)
import { readFileSync } from 'fs';
import { join } from 'path';
import { SESSIONS_DIR } from '../src/utils/paths.js';
import { getConfig } from '../src/services/config-store.js';
import { resolveMode } from '../src/prompts/index.js';
import { getPrompt } from '../src/services/prompts.js';
import { AzureOpenAIProvider } from '../src/providers/llm/azure-openai.js';
import { AnthropicProvider } from '../src/providers/llm/anthropic.js';

const sessionId = process.argv[2];
const mode = resolveMode(process.argv[3] || 'limpio');
if (!sessionId) {
  console.error('uso: node scripts/compare-distill.js <sessionId> [modo]');
  process.exit(1);
}

const j = JSON.parse(readFileSync(join(SESSIONS_DIR, sessionId + '.json'), 'utf-8'));
const text = j.transcription_edited || j.transcription_raw;
const cfg = getConfig();
const words = (s) => (s || '').split(/\s+/).filter(Boolean).length;

const openaiPrompt = await getPrompt('openai', mode);
const claudePrompt = await getPrompt('claude', mode);

console.log(`Sesión: ${sessionId} | modo: ${mode} | palabras de entrada: ${words(text)}`);
console.log('(cada modelo usa el prompt de su familia: gpt-4.1→openai, sonnet→claude)');

const azure = new AzureOpenAIProvider(cfg.api_keys['azure-openai']);
const anthropic = new AnthropicProvider(cfg.api_keys['anthropic']);

const [g, s] = await Promise.all([
  azure.distill(text, 'gpt-4.1', openaiPrompt)
    .then((r) => ({ ...r, who: 'gpt-4.1 (Azure OpenAI) · familia openai' }))
    .catch((e) => ({ err: e.message, who: 'gpt-4.1 (Azure OpenAI)' })),
  anthropic.distill(text, 'claude-sonnet-4-6', claudePrompt)
    .then((r) => ({ ...r, who: 'claude-sonnet-4-6 (Anthropic) · familia claude' }))
    .catch((e) => ({ err: e.message, who: 'claude-sonnet-4-6 (Anthropic)' })),
]);

for (const r of [g, s]) {
  console.log('\n' + '#'.repeat(72));
  const meta = r.err
    ? 'ERROR'
    : `usage ${JSON.stringify(r.usage)}${r.truncated ? ' (TRUNCADO)' : ''} | ${words(r.prompt)} palabras`;
  console.log(`### ${r.who} — ${meta}`);
  console.log('#'.repeat(72));
  console.log(r.err || r.prompt);
}
