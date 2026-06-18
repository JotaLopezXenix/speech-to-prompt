// Prueba puntual de un modo de destilado contra un texto de ejemplo.
// La clave de Anthropic se lee de data/config.json (api_keys.anthropic).
//
// Uso:  node scripts/test-distill-mode.js [modo]   (modo = completo|ligero|literal|limpio; def. limpio)
import { getConfig } from '../src/services/config-store.js';
import { PROMPTS, resolveMode } from '../src/prompts/index.js';
import { AnthropicProvider } from '../src/providers/llm/anthropic.js';

const mode = resolveMode(process.argv[2] || 'limpio');

// Transcripción de ejemplo: desordenada, con (i) contradicción, (ii) nombre dudoso
// para forzar [inferido], (iii) muletillas/arranques en falso, (iv) sigla deletreada.
const SAMPLE = `Bueno, eh, a ver, lo que quiero montar es un servicio que, o sea, reciba
eventos y los procese, ¿vale? Para la cola pensaba en usar Kafka, sí, Kafka seguro... bueno,
no sé, igual con una a pe i rest sencilla y Rabbit nos vale, déjalo en Rabbit. La base de datos
sería Postgres. Lo de la autenticación lo metemos con, eh, el Auth ese de... el F5 Advanced
Board Protection creo que se llamaba, o algo así. Y nada, eh, o sea, que sea rápido. Ah, y los
datos hay que guardarlos, digo, los eventos, durante un año, perdón, durante seis meses. Eso.`;

const key = getConfig().api_keys.anthropic;
if (!key) {
  console.error('Falta api_keys.anthropic en data/config.json.');
  process.exit(1);
}

console.log(`=== MODO: ${mode} ===\n`);
const provider = new AnthropicProvider(key);
const { prompt, usage } = await provider.distill(SAMPLE, 'claude-sonnet-4-6', PROMPTS[mode]);
console.log(prompt);
console.log(`\n--- usage: in=${usage.input_tokens} out=${usage.output_tokens} ---`);
