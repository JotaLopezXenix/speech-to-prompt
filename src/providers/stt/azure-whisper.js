import { STTProvider } from './base.js';
import { textFromWords } from './words.js';

// Azure OpenAI – Whisper. Misma API estilo OpenAI que Groq, pero el endpoint es
// el del *deployment* del recurso y la autenticación va por cabecera `api-key`.
// La config del recurso (endpoint, deployment, api-version) llega por variables de
// entorno (App Settings en Azure); la clave llega por el constructor como en el
// resto de proveedores. Datos dentro de Azure/UE (confidencialidad + crédito).
const DEFAULT_API_VERSION = '2024-06-01';

export class AzureWhisperProvider extends STTProvider {
  get name() { return 'azure-whisper'; }

  get models() {
    // En Azure el modelo lo define el *deployment*; se expone una etiqueta única.
    return [{ id: 'whisper', label: 'Azure OpenAI Whisper' }];
  }

  async transcribe(audioBuffer, mimeType, _model) {
    const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
    const deployment = process.env.AZURE_OPENAI_STT_DEPLOYMENT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || DEFAULT_API_VERSION;

    if (!endpoint || !deployment) {
      throw new Error(
        'Azure OpenAI Whisper sin configurar: faltan AZURE_OPENAI_ENDPOINT y/o AZURE_OPENAI_STT_DEPLOYMENT.'
      );
    }
    if (!this.apiKey) {
      throw new Error('Azure OpenAI Whisper sin API key (AZURE_OPENAI_API_KEY).');
    }

    const url = `${endpoint}/openai/deployments/${deployment}/audio/transcriptions?api-version=${apiVersion}`;

    const form = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    form.append('file', blob, `audio.${ext}`);
    form.append('language', 'es');
    // verbose_json + granularidad de palabra: nos da `text` limpio (Azure no tiene
    // el bug de acentos de Groq) y, de regalo, `words[]` como red de seguridad.
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');

    // Reintento ante 429 (rate limit). Los deployments Standard de Whisper traen
    // un RPM bajo (p. ej. 3/min); en uso interactivo es fácil rozarlo. En vez de
    // fallar, esperamos (Retry-After si viene, si no ~20 s) y reintentamos.
    const MAX_ATTEMPTS = 3;
    let response;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'api-key': this.apiKey },
        body: form,
      });

      if (response.status === 429 && attempt < MAX_ATTEMPTS) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '', 10);
        const waitMs = (Number.isFinite(retryAfter) ? retryAfter : 20) * 1000;
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      break;
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Azure OpenAI STT error ${response.status}: ${err}`);
    }

    const data = await response.json();
    // Azure: `text` primero (sale limpio); `words[]` como fallback de seguridad.
    return { text: data.text ?? textFromWords(data.words) };
  }
}
