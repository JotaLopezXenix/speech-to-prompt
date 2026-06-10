// Capa de normalización de audio OPCIONAL basada en ffmpeg.
//
// Filosofía: ffmpeg es una mejora, no un requisito. Si está instalado, saneamos
// el contenedor (remux que escribe la duración real), comprimimos los imports
// grandes y, si hace falta, los troceamos por debajo del límite de Groq. Si NO
// está instalado, todo degrada con gracia al comportamiento de siempre: enviar el
// archivo tal cual. Esto respeta la decisión de portabilidad (ARM) de CLAUDE.md.
//
// Las salidas de normalización son SIEMPRE temporales: el audio canónico que se
// guarda en disco es el original subido por el usuario. La normalización solo
// existe para alimentar a Whisper de forma fiable en el momento de transcribir.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { statSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { tmpdir } from 'os';

const execFileAsync = promisify(execFile);

// Límite de subida de Groq (tier gratuito ~25 MB). Dejamos margen.
export const DEFAULT_MAX_BYTES = 24 * 1024 * 1024;

let _ffmpegAvailable = null; // cache: null = sin comprobar, true/false = resuelto

// ¿Está ffmpeg disponible en el PATH? Se comprueba una sola vez y se cachea.
export async function detectFfmpeg() {
  if (_ffmpegAvailable !== null) return _ffmpegAvailable;
  try {
    await execFileAsync('ffmpeg', ['-version']);
    _ffmpegAvailable = true;
  } catch {
    _ffmpegAvailable = false;
  }
  return _ffmpegAvailable;
}

// Duración real en segundos (vía ffprobe). Devuelve null si no se puede determinar.
export async function probeDuration(path) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1',
      path,
    ]);
    const seconds = parseFloat(String(stdout).trim());
    return Number.isFinite(seconds) ? Math.round(seconds) : null;
  } catch {
    return null;
  }
}

function sizeOf(path) {
  try { return statSync(path).size; } catch { return 0; }
}

function tmpPathFor(inputPath, suffix) {
  const base = basename(inputPath, extname(inputPath));
  // Sufijo aleatorio-light derivado del nombre para no chocar entre llamadas.
  return join(tmpdir(), `stp-norm-${base}${suffix}`);
}

// Prepara el audio para enviarlo a la STT. Devuelve la lista de archivos a
// transcribir (1, salvo que haya hecho falta trocear) y una función `cleanup`
// que borra los temporales generados.
//
//   sin ffmpeg            → [inputPath]                        (no-op)
//   con ffmpeg y cabe     → [remux]   (remux -c copy, escribe duración)
//   con ffmpeg y no cabe  → [reenc]   (libopus 32k mono)
//   si aún no cabe         → [parte-1, parte-2, ...]           (troceo por tiempo)
export async function normalizeForUpload(inputPath, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const noop = { files: [inputPath], cleanup: () => {} };

  const hasFfmpeg = await detectFfmpeg();
  if (!hasFfmpeg) return noop;

  const created = [];
  const cleanup = () => {
    for (const f of created) {
      try { if (existsSync(f)) unlinkSync(f); } catch {}
    }
  };

  try {
    // 1) Remux sin recodificar: sanea el contenedor y escribe la duración.
    const remux = tmpPathFor(inputPath, '.remux.webm');
    await execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-c', 'copy', remux]);
    created.push(remux);
    if (sizeOf(remux) <= maxBytes) return { files: [remux], cleanup };

    // 2) Recodificar a Opus 32k mono (lo mismo que graba el navegador) para encoger.
    const reenc = tmpPathFor(inputPath, '.opus.webm');
    await execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', reenc]);
    created.push(reenc);
    if (sizeOf(reenc) <= maxBytes) return { files: [reenc], cleanup };

    // 3) Trocear por tiempo en N partes que quepan bajo el límite.
    const duration = (await probeDuration(reenc)) || (await probeDuration(inputPath)) || 0;
    const parts = Math.max(2, Math.ceil(sizeOf(reenc) / maxBytes));
    const segmentTime = duration > 0 ? Math.ceil(duration / parts) : 600; // fallback 10 min
    const pattern = tmpPathFor(inputPath, '.part-%03d.webm');
    await execFileAsync('ffmpeg', [
      '-y', '-i', reenc,
      '-f', 'segment', '-segment_time', String(segmentTime),
      '-c', 'copy', '-reset_timestamps', '1',
      pattern,
    ]);

    // Recoger las partes generadas (part-000, part-001, ...) en orden.
    const dir = dirname(pattern);
    const prefix = basename(pattern).replace('%03d', '');
    const chunks = readdirSync(dir)
      .filter(f => f.startsWith(prefix.split('part-')[0] + 'part-') && f.endsWith('.webm'))
      .sort()
      .map(f => join(dir, f));
    chunks.forEach(c => created.push(c));

    if (chunks.length > 0) return { files: chunks, cleanup };

    // Si por lo que sea no salieron partes, intentamos con el recodificado entero.
    return { files: [reenc], cleanup };
  } catch (err) {
    // Cualquier fallo de ffmpeg → degradar al original (resiliencia ante todo).
    cleanup();
    console.warn(`[audio-normalize] ffmpeg falló, se envía el original: ${err.message}`);
    return noop;
  }
}
