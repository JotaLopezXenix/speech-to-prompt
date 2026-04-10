export class LLMProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  get name() { throw new Error('Not implemented'); }
  get models() { throw new Error('Not implemented'); }

  /**
   * Distill raw transcription into an optimized prompt
   * @param {string} text - The transcription text to distill
   * @param {string} model - Model ID to use
   * @param {string} systemPrompt - System prompt for distillation
   * @returns {Promise<{ prompt: string, usage: { input_tokens: number, output_tokens: number } }>}
   */
  async distill(text, model, systemPrompt) {
    throw new Error('Not implemented');
  }

  validateApiKey() {
    throw new Error('Not implemented');
  }
}
