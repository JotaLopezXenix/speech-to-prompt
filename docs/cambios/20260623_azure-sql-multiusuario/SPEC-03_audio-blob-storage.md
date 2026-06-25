# Flujo 3 — Audio a Blob Storage (abstracción) — SPEC técnico

**Fecha:** 2026-06-23
**Tipo:** delta-spec de implementación del flujo 3 del cambio.
**Depende de:** [`DESIGN.md`](DESIGN.md) (D2) y los flujos 1-2 ya construidos.

> **Trazabilidad.** Concreta el **flujo 3** de `DESIGN.md §9`: el audio sale del FS de la app y pasa a **Azure Blob Storage** (privado), servido **a través de la app con autorización**. **Decisión de dev local (acordada):** abstracción de almacenamiento con **backend de ficheros en local** y **Azure Blob en la nube** (no Azurite).

---

## 1. Objetivo

Que el audio canónico viva en **Blob Storage** (privado) en Azure y en **ficheros** en local, detrás de una **abstracción** fina. `Reprocesar` lee del store (no del disco directo), y se añade un **endpoint autorizado para servir audio** (acceso seguro, sin URLs públicas). El resto del pipeline (normalización ffmpeg, transcripción, segmentos en SQL) no cambia.

---

## 2. La abstracción `BlobStore` (nueva, estilo proveedores)

Coherente con la abstracción LLM/STT. Interfaz mínima y opaca:

- `src/providers/storage/base.js` — clase `BlobStore`:
  - `put(key, buffer, contentType)` — guarda el blob.
  - `downloadToFile(key, destPath)` — descarga a un fichero temporal (ffmpeg/STT necesitan ruta).
  - `createReadStream(key)` — flujo de lectura (para servir por HTTP).
  - `exists(key)` → boolean.
  - `delete(key)`.
  - getter `name`.
- `src/providers/storage/file.js` — `FileBlobStore`: raíz = `AUDIO_DIR` (de `paths.js`); `key` = nombre de fichero. **Byte-compatible con el comportamiento actual** (los audios siguen en `data/audio/<key>`), así que las sesiones de prueba locales siguen resolviendo.
- `src/providers/storage/azure.js` — `AzureBlobStore`: `@azure/storage-blob` + `DefaultAzureCredential` (Managed Identity en Azure, **sin secretos**); contenedor privado.
- `src/providers/storage/index.js` — factory `getBlobStore()` memoizada: Azure (`WEBSITE_HOSTNAME`) → `azure`; si no → `file`. Override por `STORAGE_PROVIDER`.

**Esquema de clave:** `"<session_id>__seg-<ordinal>.webm"` (plano, igual que hoy) → se guarda en `segments.audio_file` (la columna pasa a contener la **clave del store**, que para el backend de ficheros coincide con el nombre actual).

---

## 3. Cambios en `transcribe.js`

**Subida de segmento (`handleAddSegment`):**
- Hoy: `copyFileSync(tmpPath, AUDIO_DIR/<file>)` y normaliza esa copia de disco.
- Nuevo: `key = "<id>__seg-<n>.webm"`; `await blobStore.put(key, readFileSync(tmpPath), mime)`; **normaliza el `tmpPath`** (el fichero temporal de multer, que ya está en disco) para transcribir; `segment.audio_file = key`; limpiar el temporal en `finally`.

**Reprocesar:**
- Hoy: lee `AUDIO_DIR/<audio_file>` de disco (`existsSync`).
- Nuevo: filtra segmentos con `await blobStore.exists(key)`; por cada uno, `downloadToFile(key, tmp)` → `normalizeForUpload(tmp)` → transcribe → limpiar tmp y descargas.

La capa `audio-normalize.js` (ffmpeg opcional) **no cambia**: sigue operando sobre rutas de ficheros temporales.

---

## 4. Endpoint de servir audio (autorizado)

`GET /api/sessions/:id/audio/:ordinal` (en el router de `transcribe`/segments, bajo el middleware `identity`):
- `getSession(id, req.user.id)` → **404** si no existe o no es suya (mismo criterio de aislamiento del flujo 2).
- localiza el segmento por `ordinal` → su `audio_file` (key); si no existe en el store → 404.
- `Content-Type: audio/webm`; `pipe(blobStore.createReadStream(key))` a la respuesta.

> Es el **primitivo de acceso seguro** al audio (en Azure el contenedor es privado: no hay URL pública). El front **aún no lo consume**; un botón de reproducir/descargar en la lista de segmentos es un añadido trivial posterior (fuera de alcance).

---

## 5. Migración de audio: ninguna

Arrancamos en blanco (decisión del flujo 1): no hay audios antiguos que mover. Los audios de las sesiones de prueba locales quedan en `data/audio/` y **siguen funcionando con el backend de ficheros** (misma raíz y claves). En Azure se empieza limpio: el audio nuevo va directo a Blob.

---

## 6. Autenticación / credenciales

- **Azure (`AzureBlobStore`):** `DefaultAzureCredential` (Managed Identity del App Service; rol **Storage Blob Data Contributor**). Sin claves. Variables: `AZURE_STORAGE_ACCOUNT_URL` (p. ej. `https://<cuenta>.blob.core.windows.net`) y `AZURE_STORAGE_CONTAINER` (def. `audio`).
- **Local (`FileBlobStore`):** sin credenciales; raíz `AUDIO_DIR`.

---

## 7. Qué se PRESERVA / qué cambia

**Preservado:** forma del objeto sesión (`audio_file` sigue presente; ahora es la clave del store); `audio-normalize`; transcripción/segmentos en SQL; aislamiento del flujo 2; las 4 fases del front (no se entera del cambio de almacén de audio).

**Cambia:** nuevos `src/providers/storage/{base,file,azure,index}.js`; `transcribe.js` (subida y reprocess vía `blobStore`); nuevo endpoint `GET /…/audio/:ordinal`; nuevas dependencias **`@azure/storage-blob`** y **`@azure/identity`** (deps 5→7; solo las usa el backend Azure). `AUDIO_DIR` deja de escribirse directamente desde `transcribe.js` (lo hace el `FileBlobStore`).

> `src/providers/storage/azure.js` se implementa completo pero **se verifica al provisionar** la cuenta de Storage (flujo 6): en local no hay Blob. El backend de ficheros sí se prueba ahora de extremo a extremo.

---

## 8. Verificación (criterios de aceptación)

- **Round-trip del store de ficheros** (humo): `put` → `exists`=true → `downloadToFile` (contenido idéntico) → `createReadStream` (idéntico) → `delete` → `exists`=false.
- **Subida real** (tu prueba por navegador): grabar un segmento guarda el audio vía store y lo transcribe; el `audio_file` del segmento es la clave.
- **Reprocesar** lee del store y regenera la transcripción.
- **Endpoint de audio**: con la sesión propia devuelve el audio (200, `audio/webm`); sobre una sesión de otro usuario → 404.
- **Azure**: pendiente de verificación al provisionar (flujo 6).

---

## 9. Riesgos

- **`azure.js` sin verificar en local:** se prueba al provisionar Storage; el backend de ficheros cubre el desarrollo. Riesgo acotado (uso estándar del SDK).
- **Dependencias nuevas (`@azure/*`):** crecen la superficie; necesarias para Blob con Managed Identity.
- **Divergencia local/prod:** asumida y baja (interfaz mínima y opaca); fue la decisión acordada frente a Azurite.
- **`audio_file` cambia de semántica** (nombre de fichero → clave del store): coinciden en el backend de ficheros, así que no rompe nada local; en Azure la clave es el nombre del blob.
