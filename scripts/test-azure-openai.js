// Prueba puntual del destilador Azure OpenAI (GPT) contra el recurso real.
// El endpoint y el deployment NO son secretos y van por entorno; la clave (si se
// usa) se lee de data/config.json (api_keys['azure-openai'], con fallback a
// api_keys['azure-whisper'] porque es el MISMO recurso) o de AZURE_OPENAI_API_KEY.
// Sin clave, cae a Managed Identity / Entra ID (DefaultAzureCredential): en local
// conviene `az login` con acceso al recurso.
//
// Uso (PowerShell):
//   $env:AZURE_OPENAI_ENDPOINT='https://aoai-speech-to-prompt.openai.azure.com'
//   $env:LLM_MODEL='gpt-4.1'   # = nombre del deployment
//   node scripts/test-azure-openai.js
import { getConfig } from '../src/services/config-store.js';
import { AzureOpenAIProvider } from '../src/providers/llm/azure-openai.js';

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const deployment = process.env.LLM_MODEL || 'gpt-4.1';
if (!endpoint) {
  console.error('Falta AZURE_OPENAI_ENDPOINT (https://<recurso>.openai.azure.com).');
  process.exit(1);
}

const cfg = getConfig();
// Mismo recurso que Whisper → si no hay clave propia de azure-openai, reusa la de azure-whisper.
const key = cfg.api_keys['azure-openai'] || cfg.api_keys['azure-whisper'];

console.log('Endpoint:', endpoint);
console.log('Deployment:', deployment);
console.log('Auth:', key ? 'API key' : 'Managed Identity / Entra ID (DefaultAzureCredential)');

const provider = new AzureOpenAIProvider(key);
const text = 'Necesito un endpoint que reciba un audio, lo transcriba y devuelva el texto. ' +
  'Usa Express y guarda el resultado en disco.';
const systemPrompt = 'Eres un asistente que reescribe notas dictadas como un prompt claro y conciso. ' +
  'Responde solo con el prompt resultante.';

try {
  const { prompt, usage, truncated } = await provider.distill(text, deployment, systemPrompt);
  console.log('\n--- PROMPT DESTILADO ---\n');
  console.log(prompt);
  console.log('\n--- USAGE ---');
  console.log(usage, truncated ? '(TRUNCADO)' : '');
} catch (err) {
  console.error('\nERROR:', err.message);
  process.exit(1);
}
