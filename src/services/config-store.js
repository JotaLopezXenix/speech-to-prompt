import { readFileSync, writeFileSync, existsSync } from 'fs';
import { CONFIG_FILE } from '../utils/paths.js';

const DEFAULTS = {
  api_keys: {
    anthropic: '',
    groq: '',
    google: '',
    'azure-whisper': '',
  },
  defaults: {
    llm_provider: 'anthropic',
    llm_model: 'claude-sonnet-4-6',
    stt_provider: 'groq',
    stt_model: 'whisper-large-v3',
  },
};

// API keys can be supplied as environment variables (Azure App Settings). When
// present they win over config.json, so the server never needs the keys on disk.
const ENV_KEY_MAP = {
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  google: 'GOOGLE_API_KEY',
  'azure-whisper': 'AZURE_OPENAI_API_KEY',
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

// Provider/model defaults can also come from the environment (App Settings), so
// the deployed server can pick e.g. azure-whisper without editing config.json.
const ENV_DEFAULT_MAP = {
  llm_provider: 'LLM_PROVIDER',
  llm_model: 'LLM_MODEL',
  stt_provider: 'STT_PROVIDER',
  stt_model: 'STT_MODEL',
};

// Read-time overlay only — env values are never written back by save().
function applyEnvOverrides(config) {
  const api_keys = { ...config.api_keys };
  for (const [provider, envVar] of Object.entries(ENV_KEY_MAP)) {
    if (process.env[envVar]) api_keys[provider] = process.env[envVar];
  }
  const defaults = { ...config.defaults };
  for (const [key, envVar] of Object.entries(ENV_DEFAULT_MAP)) {
    if (process.env[envVar]) defaults[key] = process.env[envVar];
  }
  return { ...config, api_keys, defaults };
}

function save(config) {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfig() {
  return applyEnvOverrides(load());
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
  const config = applyEnvOverrides(load());
  const masked = structuredClone(config);
  for (const [provider, key] of Object.entries(masked.api_keys)) {
    if (key && key.length > 4) {
      masked.api_keys[provider] = '•'.repeat(key.length - 4) + key.slice(-4);
    }
  }
  return masked;
}

export function isConfigured() {
  const config = applyEnvOverrides(load());
  const hasSTT = config.api_keys.groq || config.api_keys['azure-whisper'];
  return !!(config.api_keys.anthropic && hasSTT);
}
