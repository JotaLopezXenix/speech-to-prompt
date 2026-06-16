import { STTProvider } from './base.js';
import { textFromWords } from './words.js';

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

export class GroqProvider extends STTProvider {
  get name() { return 'groq'; }

  get models() {
    return [
      { id: 'whisper-large-v3', label: 'Whisper Large v3' },
      { id: 'whisper-large-v3-turbo', label: 'Whisper Large v3 Turbo' },
    ];
  }

  async transcribe(audioBuffer, mimeType, model = 'whisper-large-v3') {
    const form = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    // Groq needs a filename with extension to detect format
    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    form.append('file', blob, `audio.${ext}`);
    form.append('model', model);
    form.append('language', 'es');
    // verbose_json + granularidad de palabra: el campo `text` (y el `json` plano)
    // de Groq tiene un bug de ensamblado que TRUNCA las palabras en la primera
    // vocal acentuada ("política"→"pol", "está"→"est") y se come la puntuación.
    // El array `words[]` decodifica bien, así que reconstruimos el texto desde ahí.
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');

    const response = await fetch(GROQ_STT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq STT error ${response.status}: ${err}`);
    }

    const data = await response.json();
    // Groq: `words[]` primero (su `text` trunca acentos), `text` como fallback.
    return { text: textFromWords(data.words) ?? data.text };
  }
}
