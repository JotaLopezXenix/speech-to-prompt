import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { AzureOpenAIProvider } from './azure-openai.js';

const PROVIDERS = {
  anthropic: AnthropicProvider,
  gemini: GeminiProvider,
  'azure-openai': AzureOpenAIProvider,
};

export function createLLMProvider(name, apiKey) {
  const Provider = PROVIDERS[name];
  if (!Provider) throw new Error(`Proveedor LLM desconocido: ${name}`);
  return new Provider(apiKey);
}

export function listLLMProviders() {
  return Object.entries(PROVIDERS).map(([id, Provider]) => {
    const p = new Provider('');
    return { id, models: p.models };
  });
}
