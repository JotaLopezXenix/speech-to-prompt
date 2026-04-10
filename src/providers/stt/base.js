export class STTProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  get name() { throw new Error('Not implemented'); }
  get models() { throw new Error('Not implemented'); }

  /**
   * Transcribe audio buffer
   * @param {Buffer} audioBuffer
   * @param {string} mimeType
   * @param {string} model
   * @returns {Promise<{ text: string }>}
   */
  async transcribe(audioBuffer, mimeType, model) {
    throw new Error('Not implemented');
  }
}
