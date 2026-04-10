import { LLMProvider } from './base.js';

// Stub — implementación pendiente para V2
export class GeminiProvider extends LLMProvider {
  get name() { return 'gemini'; }

  get models() {
    return [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ];
  }

  validateApiKey() {
    return typeof this.apiKey === 'string' && this.apiKey.length > 10;
  }

  async distill(text, model, systemPrompt) {
    throw new Error('Gemini no está implementado todavía en V1. Usa Anthropic.');
  }
}
