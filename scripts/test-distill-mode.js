// Prueba puntual de un modo de destilado contra un texto de ejemplo, con el modelo
// activo por defecto (gpt-4.1, Azure OpenAI) y el prompt de su familia (openai) leído de BD.
//
// Uso (PowerShell, con .env para AZURE_OPENAI_ENDPOINT + conexión SQL):
//   node --env-file-if-exists=.env scripts/test-distill-mode.js [modo]
//   (modo = completo|ligero|literal|limpio; def. limpio)
import { getConfig } from '../src/services/config-store.js';
import { resolveMode } from '../src/prompts/index.js';
import { getPrompt } from '../src/services/prompts.js';
import { AzureOpenAIProvider } from '../src/providers/llm/azure-openai.js';

const mode = resolveMode(process.argv[2] || 'limpio');

// Transcripción de ejemplo: desordenada, con (i) contradicción, (ii) nombre dudoso
// para forzar [inferido], (iii) muletillas/arranques en falso, (iv) sigla deletreada.
const SAMPLE = `Bueno, eh, a ver, lo que quiero montar es un servicio que, o sea, reciba
eventos y los procese, ¿vale? Para la cola pensaba en usar Kafka, sí, Kafka seguro... bueno,
no sé, igual con una a pe i rest sencilla y Rabbit nos vale, déjalo en Rabbit. La base de datos
sería Postgres. Lo de la autenticación lo metemos con, eh, el Auth ese de... el F5 Advanced
Board Protection creo que se llamaba, o algo así. Y nada, eh, o sea, que sea rápido. Ah, y los
datos hay que guardarlos, digo, los eventos, durante un año, perdón, durante seis meses. Eso.`;

if (!process.env.AZURE_OPENAI_ENDPOINT) {
  console.error('Falta AZURE_OPENAI_ENDPOINT (arranca con node --env-file-if-exists=.env ...).');
  process.exit(1);
}
const cfg = getConfig();
const key = cfg.api_keys['azure-openai'] || cfg.api_keys['azure-whisper']; // mismo recurso

const systemPrompt = await getPrompt('openai', mode);
console.log(`=== MODO: ${mode} (gpt-4.1 / familia openai) ===\n`);
const provider = new AzureOpenAIProvider(key);
const { prompt, usage } = await provider.distill(SAMPLE, 'gpt-4.1', systemPrompt);
console.log(prompt);
console.log(`\n--- usage: in=${usage.input_tokens} out=${usage.output_tokens} ---`);
