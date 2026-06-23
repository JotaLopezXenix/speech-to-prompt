// Abstracción de almacenamiento de blobs (audio). Interfaz mínima y opaca:
// la clave (`key`) identifica el blob; el backend decide dónde vive.
// Implementaciones: FileBlobStore (local) y AzureBlobStore (Azure Blob Storage).
export class BlobStore {
  // Nombre del backend ('file' | 'azure').
  get name() {
    throw new Error('No implementado');
  }

  // Guarda `buffer` bajo `key` con el content-type dado.
  async put(_key, _buffer, _contentType) {
    throw new Error('No implementado');
  }

  // Descarga el blob a un fichero local (ffmpeg/STT necesitan una ruta).
  async downloadToFile(_key, _destPath) {
    throw new Error('No implementado');
  }

  // Devuelve un stream de lectura del blob (para servir por HTTP).
  async openReadStream(_key) {
    throw new Error('No implementado');
  }

  async exists(_key) {
    throw new Error('No implementado');
  }

  async delete(_key) {
    throw new Error('No implementado');
  }
}
