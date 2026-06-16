// Prueba puntual del proveedor Azure OpenAI Whisper contra un audio en disco.
// La clave se lee de data/config.json (api_keys['azure-whisper']) para no pasarla
// por línea de comandos. El endpoint y el deployment NO son secretos y van por env.
//
// Uso (PowerShell):
//   $env:AZURE_OPENAI_ENDPOINT='https://<recurso>.openai.azure.com'
//   $env:AZURE_OPENAI_STT_DEPLOYMENT='whisper'
//   node scripts/test-azure-whisper.js [ruta-audio.webm]
//
// Sin ruta, usa el primer .webm que encuentre en data/audio.
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { AUDIO_DIR } from '../src/utils/paths.js';
import { getConfig } from '../src/services/config-store.js';
import { AzureWhisperProvider } from '../src/providers/stt/azure-whisper.js';

const arg = process.argv[2];
let audioPath = arg;
if (!audioPath) {
  const webms = readdirSync(AUDIO_DIR).filter(f => f.endsWith('.webm'));
  if (webms.length === 0) {
    console.error('No hay .webm en data/audio. Pasa una ruta como argumento.');
    process.exit(1);
  }
  audioPath = join(AUDIO_DIR, webms[0]);
}

const key = getConfig().api_keys['azure-whisper'];
if (!key) {
  console.error('Falta api_keys["azure-whisper"] en data/config.json (o AZURE_OPENAI_API_KEY).');
  process.exit(1);
}

console.log('Audio:', audioPath);
console.log('Endpoint:', process.env.AZURE_OPENAI_ENDPOINT);
console.log('Deployment:', process.env.AZURE_OPENAI_STT_DEPLOYMENT);

const provider = new AzureWhisperProvider(key);
const buffer = readFileSync(audioPath);
try {
  const { text } = await provider.transcribe(buffer, 'audio/webm');
  console.log('\n--- TRANSCRIPCIÓN ---\n');
  console.log(text);
} catch (err) {
  console.error('\nERROR:', err.message);
  process.exit(1);
}
