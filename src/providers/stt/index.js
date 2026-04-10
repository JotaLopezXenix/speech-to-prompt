import { GroqProvider } from './groq.js';

const PROVIDERS = {
  groq: GroqProvider,
};

export function createSTTProvider(name, apiKey) {
  const Provider = PROVIDERS[name];
  if (!Provider) throw new Error(`Proveedor STT desconocido: ${name}`);
  return new Provider(apiKey);
}

export function listSTTProviders() {
  return Object.entries(PROVIDERS).map(([id, Provider]) => {
    const p = new Provider('');
    return { id, models: p.models };
  });
}
