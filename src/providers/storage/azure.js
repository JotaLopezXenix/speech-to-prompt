import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobStore } from './base.js';

// Backend de Azure Blob Storage. Autentica con Managed Identity (sin secretos)
// vía DefaultAzureCredential. Contenedor privado: el acceso al audio es solo a
// través de la app (no hay URLs públicas).
//
// Variables de entorno:
//   AZURE_STORAGE_ACCOUNT_URL  p. ej. https://<cuenta>.blob.core.windows.net
//   AZURE_STORAGE_CONTAINER    nombre del contenedor (def. 'audio')
//
// NOTA: implementado completo, pero se VERIFICA al provisionar Storage (flujo 6);
// en local se usa FileBlobStore.
export class AzureBlobStore extends BlobStore {
  constructor() {
    super();
    const url = process.env.AZURE_STORAGE_ACCOUNT_URL;
    if (!url) throw new Error('Falta AZURE_STORAGE_ACCOUNT_URL');
    const container = process.env.AZURE_STORAGE_CONTAINER || 'audio';
    const service = new BlobServiceClient(url, new DefaultAzureCredential());
    this._container = service.getContainerClient(container);
  }

  get name() {
    return 'azure';
  }

  _blob(key) {
    return this._container.getBlockBlobClient(key);
  }

  async put(key, buffer, contentType) {
    await this._blob(key).uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType || 'application/octet-stream' },
    });
  }

  async downloadToFile(key, destPath) {
    await this._blob(key).downloadToFile(destPath);
  }

  async openReadStream(key) {
    const res = await this._blob(key).download();
    return res.readableStreamBody;
  }

  async exists(key) {
    return this._blob(key).exists();
  }

  async delete(key) {
    await this._blob(key).deleteIfExists();
  }
}
