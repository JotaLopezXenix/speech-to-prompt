import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync, cpSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');

// Single source of truth for the data directory. In Azure App Service we set
// DATA_DIR=/home/data (persistent disk, outside wwwroot). With no env var,
// behaviour is identical to local: data/ inside the project root.
const BASE_DIR = process.env.DATA_DIR || join(PROJECT_ROOT, 'data');
const SESSIONS_DIR = join(BASE_DIR, 'sessions');
const AUDIO_DIR = join(BASE_DIR, 'audio');
const CONFIG_FILE = join(BASE_DIR, 'config.json');

// Legacy path from previous versions
const LEGACY_DIR = join(homedir(), '.speech-to-prompt');

export function ensureDirectories() {
  for (const dir of [BASE_DIR, SESSIONS_DIR, AUDIO_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // Migrate from legacy ~/.speech-to-prompt/ if it exists and data/ is empty
  if (existsSync(LEGACY_DIR) && !existsSync(CONFIG_FILE)) {
    try {
      cpSync(LEGACY_DIR, BASE_DIR, { recursive: true });
      console.log(`Migrados datos desde ${LEGACY_DIR} → ${BASE_DIR}`);
    } catch (err) {
      console.warn(`No se pudieron migrar datos legacy: ${err.message}`);
    }
  }
}

export { BASE_DIR, SESSIONS_DIR, AUDIO_DIR, CONFIG_FILE };
