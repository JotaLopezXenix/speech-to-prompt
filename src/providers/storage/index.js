import { FileBlobStore } from './file.js';
import { AzureBlobStore } from './azure.js';

// Factory memoizada del store de blobs. Por defecto: Azure en el App Service
// (WEBSITE_HOSTNAME presente), ficheros en local. Override con STORAGE_PROVIDER.
let instance = null;

export function getBlobStore() {
  if (instance) return instance;
  const provider = process.env.STORAGE_PROVIDER || (process.env.WEBSITE_HOSTNAME ? 'azure' : 'file');
  instance = provider === 'azure' ? new AzureBlobStore() : new FileBlobStore();
  return instance;
}
