import { AudioRecorder, formatTime } from '../audio-recorder.js';
import { api } from '../api-client.js';
import { checkAudio } from '../audio-guards.js';
import * as diag from '../diagnostics.js';

const PREFERRED_MIC_KEY = 'stp.preferredMicId';

// Workspace de captura ITERATIVA y multi-segmento.
// El usuario graba un tramo, lo detiene (= se transcribe y se añade como segmento),
// lee lo acumulado y sigue grabando otro tramo — sin perder la sesión. También puede
// importar un audio existente. Al terminar, "Revisar y destilar" pasa a la revisión
// con la transcripción unificada de todos los segmentos.
//
// onComplete(sessionId, transcriptionRaw) → avanza a la fase de revisión.
export function renderPhase1(container, { onComplete }) {
  const recorder = new AudioRecorder();

  let sessionId = null;
  let segments = [];          // [{ audio_file, transcription_raw, duration_seconds, source }]
  let mergedTranscript = '';
  let busy = false;           // transcribiendo un segmento

  // Estado del preview de micrófono (independiente de la grabación)
  let previewStream = null;
  let previewCtx = null;
  let previewRafId = null;
  let peakSinceReset = 0;
  let selectedDeviceId = localStorage.getItem(PREFERRED_MIC_KEY) || '';

  container.innerHTML = `
    <div class="phase-content phase-capture">
      <h2 class="phase-title">Captura</h2>
      <p class="phase-desc">Graba por tramos. Pulsa <strong>Detener</strong> para ver lo transcrito y luego
      <strong>Grabar</strong> de nuevo para continuar: la sesión no se pierde al revisar. También puedes
      importar un audio ya guardado. Cuando termines, pasa a revisar y destilar.</p>

      <div class="mic-controls">
        <label class="mic-select-label">
          Micrófono:
          <select id="mic-select" class="mic-select"></select>
        </label>
        <div class="mic-meter-wrap" title="Nivel de entrada del micrófono. Si no se mueve al hablar, el dispositivo está mudo.">
          <div class="mic-meter-bar" id="mic-meter-bar"></div>
        </div>
        <div class="mic-status" id="mic-status" aria-live="polite"></div>
      </div>

      <div class="record-area">
        <button class="btn-record" id="btn-record" aria-label="Iniciar grabación">
          <span class="record-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </span>
          <span class="record-label" id="record-label">Grabar</span>
        </button>
        <div class="timer" id="timer" aria-live="polite">00:00</div>
        <div class="timer-caption">tramo actual</div>
        <button class="btn-pause" id="btn-pause" hidden aria-label="Pausar grabación">Pausar</button>
      </div>

      <div class="warn-box" id="warn-box" hidden></div>
      <div class="error-box" id="error-box" hidden></div>

      <div class="seg-transcribing" id="seg-transcribing" hidden>
        <div class="spinner"></div>
        <span class="spinner-label">Transcribiendo segmento con Whisper…</span>
      </div>

      <div class="capture-actions">
        <button class="btn-ghost" id="btn-import">Importar audio</button>
        <input type="file" id="import-input" accept="audio/*" hidden />
        <button class="btn-primary" id="btn-review" disabled>Revisar y destilar →</button>
      </div>

      <div class="session-zone" id="session-zone" hidden>
        <div class="session-summary" id="session-summary"></div>
        <div class="segment-list" id="segment-list"></div>
        <div class="transcript-accum transcription-preview" id="transcript-accum"></div>
      </div>
    </div>
  `;

  const btnRecord = container.querySelector('#btn-record');
  const recordLabel = container.querySelector('#record-label');
  const timer = container.querySelector('#timer');
  const btnPause = container.querySelector('#btn-pause');
  const errorBox = container.querySelector('#error-box');
  const warnBox = container.querySelector('#warn-box');
  const transcribingBox = container.querySelector('#seg-transcribing');
  const btnImport = container.querySelector('#btn-import');
  const importInput = container.querySelector('#import-input');
  const btnReview = container.querySelector('#btn-review');
  const sessionZone = container.querySelector('#session-zone');
  const sessionSummary = container.querySelector('#session-summary');
  const segmentList = container.querySelector('#segment-list');
  const transcriptAccum = container.querySelector('#transcript-accum');
  const micSelect = container.querySelector('#mic-select');
  const meterBar = container.querySelector('#mic-meter-bar');
  const micStatus = container.querySelector('#mic-status');

  function showError(msg) { errorBox.textContent = msg; errorBox.hidden = false; }
  function hideError() { errorBox.hidden = true; }
  function wordCount(text) { return (text || '').trim().split(/\s+/).filter(Boolean).length; }

  // --- UI de estado ----------------------------------------------------------

  function updateUI() {
    const recording = recorder.isRecording;
    const paused = recorder.isPaused;

    btnRecord.classList.toggle('recording', recording);
    btnRecord.classList.toggle('paused', paused);
    btnRecord.disabled = busy;

    if (recording || paused) {
      recordLabel.textContent = 'Detener';
      btnPause.hidden = false;
      btnPause.textContent = paused ? 'Reanudar' : 'Pausar';
      btnPause.setAttribute('aria-label', paused ? 'Reanudar grabación' : 'Pausar grabación');
    } else {
      recordLabel.textContent = busy ? 'Procesando…' : 'Grabar';
      btnPause.hidden = true;
      if (!busy) timer.textContent = '00:00';
    }

    // Importar/Revisar solo cuando no se está grabando ni transcribiendo.
    const idle = !recording && !paused && !busy;
    btnImport.disabled = !idle;
    btnReview.disabled = !idle || segments.length === 0;
  }

  recorder.onTimeUpdate = (seconds) => { timer.textContent = formatTime(seconds); };

  // Instrumentación + salvaguarda (cambio grabacion-stop-espontaneo).
  recorder.onDiag = (type, payload) => diag.logEvent(type, payload);
  recorder.onExternalStop = handleExternalStop;

  // --- Render de la sesión (segmentos + transcripción acumulada) -------------

  function renderSession() {
    if (segments.length === 0) { sessionZone.hidden = true; return; }
    sessionZone.hidden = false;

    const totalWords = wordCount(mergedTranscript);
    const totalSecs = segments.reduce((a, s) => a + (s.duration_seconds || 0), 0);
    sessionSummary.innerHTML =
      `<strong>${segments.length}</strong> segmento(s) · `
      + `<strong>${totalWords}</strong> palabras · `
      + `<strong>${formatTime(totalSecs)}</strong> de audio`;

    segmentList.innerHTML = segments.map((s, i) => {
      const w = wordCount(s.transcription_edited || s.transcription_raw);
      const dur = s.duration_seconds ? formatTime(s.duration_seconds) : '—';
      const tag = s.source === 'imported' ? ' · importado' : '';
      return `<div class="segment-item">
        <span class="segment-idx">#${i + 1}</span>
        <span class="segment-info">${dur} · ${w} palabras${tag}</span>
      </div>`;
    }).join('');

    transcriptAccum.textContent = mergedTranscript || '(sin texto)';
  }

  // --- Aviso de audio sospechoso (silencio / tamaño) -------------------------
  // Resuelve a true si hay que enviar, false si el usuario descarta.
  function confirmSuspectAudio(message) {
    return new Promise((resolve) => {
      warnBox.hidden = false;
      warnBox.innerHTML = `
        <strong>Revisa este audio.</strong>
        <p>${message}</p>
        <div class="phase-actions">
          <button class="btn-primary" id="btn-send-anyway">Enviar igualmente</button>
          <button class="btn-ghost" id="btn-discard-seg">Descartar</button>
        </div>
      `;
      warnBox.querySelector('#btn-send-anyway').addEventListener('click', () => { warnBox.hidden = true; resolve(true); });
      warnBox.querySelector('#btn-discard-seg').addEventListener('click', () => { warnBox.hidden = true; resolve(false); });
    });
  }

  // Banner de la salvaguarda: la grabación se cortó sola; ofrecemos guardar el
  // tramo recuperado o descartarlo. Resuelve true = guardar.
  function confirmRecoveredAudio() {
    return new Promise((resolve) => {
      warnBox.hidden = false;
      warnBox.innerHTML = `
        <strong>La grabación se detuvo de forma inesperada.</strong>
        <p>Hemos conservado el audio grabado hasta el corte. ¿Guardar este tramo?</p>
        <div class="phase-actions">
          <button class="btn-primary" id="btn-keep-rec">Guardar este tramo</button>
          <button class="btn-ghost" id="btn-discard-rec">Descartar</button>
        </div>
      `;
      warnBox.querySelector('#btn-keep-rec').addEventListener('click', () => { warnBox.hidden = true; resolve(true); });
      warnBox.querySelector('#btn-discard-rec').addEventListener('click', () => { warnBox.hidden = true; resolve(false); });
    });
  }

  // Salvaguarda ante un stop EXTERNO del recorder (lo invoca recorder.onExternalStop).
  // Arregla la UI congelada (updateUI) y rescata el blob en vez de perderlo al
  // volver a Grabar. NO es la UX de recuperación definitiva (eso es el cambio futuro).
  async function handleExternalStop(blob, meta) {
    stopMediaSessionProbe();
    diag.logEvent('chunks_preserved', { chunkCount: meta?.chunkCount, totalBytes: meta?.totalBytes });
    updateUI(); // el recorder ya está inactivo: descongela el botón/cronómetro

    if (blob && blob.size > 0) {
      const keep = await confirmRecoveredAudio();
      if (keep) {
        diag.logEvent('recovered_segment_kept', { totalBytes: blob.size });
        await commitSegment(blob, { source: 'recorded', seconds: meta?.elapsedSeconds || 0, skipGuard: true });
      } else {
        diag.logEvent('recovered_segment_discarded', {});
        updateUI();
        await startPreview(selectedDeviceId);
      }
    } else {
      diag.logEvent('recovered_segment_empty', {});
      updateUI();
      await startPreview(selectedDeviceId);
    }
    diag.endCaptureRun();
  }

  // Sonda de Media Session: registra handlers que SOLO logan, para cazar media-keys
  // (p.ej. de auriculares Bluetooth) que podrían estar activando el botón (H1).
  function startMediaSessionProbe() {
    const ms = navigator.mediaSession;
    if (!ms?.setActionHandler) return;
    for (const action of ['play', 'pause', 'stop']) {
      try { ms.setActionHandler(action, () => diag.logEvent('mediasession_action', { action })); } catch {}
    }
  }

  function stopMediaSessionProbe() {
    const ms = navigator.mediaSession;
    if (!ms?.setActionHandler) return;
    for (const action of ['play', 'pause', 'stop']) {
      try { ms.setActionHandler(action, null); } catch {}
    }
  }

  // --- Confirmar y subir un segmento -----------------------------------------

  async function commitSegment(blob, { source = 'recorded', seconds = 0, filename = 'audio.webm', skipGuard = false }) {
    hideError();

    // Guard solo para grabaciones; un import es deliberado. `skipGuard` lo usa la
    // salvaguarda de corte externo: ese tramo ya se confirmó guardarlo aparte.
    if (source === 'recorded' && !skipGuard) {
      const verdict = checkAudio(blob.size, seconds);
      if (verdict.level !== 'ok') {
        const send = await confirmSuspectAudio(verdict.message);
        if (!send) { updateUI(); return; }
      }
    }

    busy = true;
    transcribingBox.hidden = false;
    updateUI();
    // Pausar el preview/medidor durante la subida
    stopPreview();

    try {
      if (!sessionId) {
        const s = await api.createSession();
        sessionId = s.id;
        diag.setSessionId(sessionId);
      }
      const res = await api.addSegment(sessionId, blob, { source, filename });
      segments = (res.session && res.session.segments) || segments;
      mergedTranscript = res.transcription_raw || mergedTranscript;
      renderSession();
    } catch (err) {
      showError(`Error al transcribir el segmento: ${err.message}`);
    } finally {
      busy = false;
      transcribingBox.hidden = true;
      updateUI();
      await startPreview(selectedDeviceId);
    }
  }

  // --- Grabación -------------------------------------------------------------

  btnRecord.addEventListener('click', async (e) => {
    // Instrumentación: ¿la activación es un click real del usuario o sintética
    // (tecla/botón multimedia BT)? `isTrusted=false` o `detail===0` delata H1.
    diag.logEvent('record_button_activated', {
      isTrusted: e.isTrusted,
      detail: e.detail,
      pointerType: e.pointerType ?? null,
      viaKeyboard: e.detail === 0,
      activeElement: document.activeElement?.id || null,
      recorderState: recorder.mediaRecorder?.state || 'inactive',
    });

    if (busy) return;
    hideError();

    if (recorder.isRecording || recorder.isPaused) {
      // Detener segmento → transcribir
      const seconds = recorder.getElapsedSeconds();
      btnRecord.disabled = true;
      const blob = await recorder.stop();
      stopMediaSessionProbe();
      if (blob && blob.size > 0) {
        await commitSegment(blob, { source: 'recorded', seconds });
      } else {
        updateUI();
        await startPreview(selectedDeviceId);
      }
      diag.endCaptureRun();
    } else {
      // Empezar un nuevo segmento
      stopPreview();
      diag.startCaptureRun();
      diag.logEvent('capture_started', {
        deviceId: selectedDeviceId || null,
        userAgent: navigator.userAgent,
        visibilityState: document.visibilityState,
      });
      try {
        await recorder.start(selectedDeviceId || null);
        startMediaSessionProbe();
        updateUI();
        attachMeterToStream(recorder.stream);
      } catch (err) {
        showError(err.name === 'NotAllowedError'
          ? 'Se necesita acceso al micrófono. Permite el acceso y vuelve a intentarlo.'
          : `Error al iniciar la grabación: ${err.message}`);
        await startPreview(selectedDeviceId);
      }
    }
  });

  btnPause.addEventListener('click', () => {
    if (recorder.isRecording) recorder.pause();
    else if (recorder.isPaused) recorder.resume();
    updateUI();
  });

  // --- Importar audio --------------------------------------------------------

  btnImport.addEventListener('click', () => { if (!btnImport.disabled) importInput.click(); });
  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = ''; // permite reimportar el mismo archivo
    if (!file) return;
    await commitSegment(file, { source: 'imported', filename: file.name || 'import.webm' });
  });

  // --- Revisar y destilar ----------------------------------------------------

  btnReview.addEventListener('click', () => {
    if (segments.length === 0 || !sessionId) return;
    stopPreview();
    onComplete(sessionId, mergedTranscript);
  });

  // --- Mic preview / level meter (reutilizado) -------------------------------

  function stopPreview() {
    if (previewRafId) { cancelAnimationFrame(previewRafId); previewRafId = null; }
    if (previewCtx) { previewCtx.close().catch(() => {}); previewCtx = null; }
    if (previewStream) { previewStream.getTracks().forEach(t => t.stop()); previewStream = null; }
    meterBar.style.width = '0%';
  }

  async function startPreview(deviceId) {
    stopPreview();
    try {
      const constraints = deviceId ? { deviceId: { exact: deviceId } } : true;
      previewStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    } catch (err) {
      micStatus.textContent = `No se pudo abrir el micrófono: ${err.message}`;
      micStatus.classList.add('mic-status-error');
      return;
    }

    micStatus.classList.remove('mic-status-error');
    micStatus.textContent = 'Habla para comprobar el nivel ↑';

    previewCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = previewCtx.createMediaStreamSource(previewStream);
    const analyser = previewCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    peakSinceReset = 0;
    const previewStartedAt = Date.now();

    function tick() {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; sum += x * x; }
      const rms = Math.sqrt(sum / data.length);
      meterBar.style.width = `${Math.min(100, rms * 300)}%`;
      if (rms > peakSinceReset) peakSinceReset = rms;

      if (!recorder.isRecording && Date.now() - previewStartedAt > 3000 && peakSinceReset < 0.01) {
        micStatus.textContent = 'Sin señal: este dispositivo parece mudo. Prueba con otro micrófono.';
        micStatus.classList.add('mic-status-error');
      } else if (peakSinceReset >= 0.01 && !recorder.isRecording) {
        micStatus.textContent = 'Micrófono detectado ✓';
        micStatus.classList.remove('mic-status-error');
      }
      previewRafId = requestAnimationFrame(tick);
    }
    tick();
  }

  function attachMeterToStream(stream) {
    if (previewRafId) cancelAnimationFrame(previewRafId);
    if (previewCtx) { previewCtx.close().catch(() => {}); previewCtx = null; }
    previewCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = previewCtx.createMediaStreamSource(stream);
    const analyser = previewCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; sum += x * x; }
      const rms = Math.sqrt(sum / data.length);
      meterBar.style.width = `${Math.min(100, rms * 300)}%`;
      previewRafId = requestAnimationFrame(tick);
    }
    tick();
  }

  async function populateDeviceList() {
    let tmpStream = null;
    try {
      tmpStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      showError(err.name === 'NotAllowedError'
        ? 'Se necesita acceso al micrófono. Permite el acceso en el navegador y recarga la página.'
        : `No se pudo acceder al micrófono: ${err.message}`);
      return;
    } finally {
      if (tmpStream) tmpStream.getTracks().forEach(t => t.stop());
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');

    micSelect.innerHTML = '';
    mics.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Micrófono ${i + 1}`;
      micSelect.appendChild(opt);
    });

    if (selectedDeviceId && mics.some(m => m.deviceId === selectedDeviceId)) {
      micSelect.value = selectedDeviceId;
    } else if (mics.length > 0) {
      selectedDeviceId = mics[0].deviceId;
      micSelect.value = selectedDeviceId;
    }

    await startPreview(selectedDeviceId);
  }

  micSelect.addEventListener('change', async () => {
    selectedDeviceId = micSelect.value;
    localStorage.setItem(PREFERRED_MIC_KEY, selectedDeviceId);
    await startPreview(selectedDeviceId);
  });

  // Arranque
  updateUI();
  populateDeviceList();
}
