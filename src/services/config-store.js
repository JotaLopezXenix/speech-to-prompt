import { readFileSync, writeFileSync, existsSync } from 'fs';
import { CONFIG_FILE } from '../utils/paths.js';

const DEFAULTS = {
  api_keys: {
    anthropic: '',
    groq: '',
    google: '',
  },
  defaults: {
    llm_provider: 'anthropic',
    llm_model: 'claude-sonnet-4-6',
    stt_provider: 'groq',
    stt_model: 'whisper-large-v3',
  },
};

function load() {
  if (!existsSync(CONFIG_FILE)) {
    return structuredClone(DEFAULTS);
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function save(config) {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfig() {
  return load();
}

export function updateConfig(partial) {
  const current = load();
  const merged = {
    api_keys: { ...current.api_keys, ...partial.api_keys },
    defaults: { ...current.defaults, ...partial.defaults },
  };
  save(merged);
  return merged;
}

// Returns config with API keys masked except last 4 chars
export function getConfigMasked() {
  const config = load();
  const masked = structuredClone(config);
  for (const [provider, key] of Object.entries(masked.api_keys)) {
    if (key && key.length > 4) {
      masked.api_keys[provider] = '•'.repeat(key.length - 4) + key.slice(-4);
    }
  }
  return masked;
}

export function isConfigured() {
  const config = load();
  return !!(config.api_keys.anthropic && config.api_keys.groq);
}
