import { createReadStream, existsSync, writeFileSync, copyFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { AUDIO_DIR } from '../../utils/paths.js';
import { BlobStore } from './base.js';

// Backend de ficheros para desarrollo local. Raíz = AUDIO_DIR, y la `key` es el
// nombre de fichero — byte-compatible con el comportamiento previo (data/audio).
export class FileBlobStore extends BlobStore {
  get name() {
    return 'file';
  }

  // Las claves se generan en el servidor (`<id>__seg-<n>.webm`); aun así,
  // rechazamos separadores para evitar cualquier escape de directorio.
  _path(key) {
    if (typeof key !== 'string' || /[\\/]|\.\./.test(key)) {
      throw new Error(`Clave de blob no válida: ${key}`);
    }
    return join(AUDIO_DIR, key);
  }

  async put(key, buffer, _contentType) {
    writeFileSync(this._path(key), buffer);
  }

  async downloadToFile(key, destPath) {
    copyFileSync(this._path(key), destPath);
  }

  async openReadStream(key) {
    return createReadStream(this._path(key));
  }

  async exists(key) {
    return existsSync(this._path(key));
  }

  async delete(key) {
    try {
      unlinkSync(this._path(key));
    } catch {
      /* ya no existe */
    }
  }
}
