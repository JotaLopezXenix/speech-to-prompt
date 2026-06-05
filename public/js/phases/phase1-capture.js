import { AudioRecorder, formatTime } from '../audio-recorder.js';

const PREFERRED_MIC_KEY = 'stp.preferredMicId';

export function renderPhase1(container, { onComplete }) {
  const recorder = new AudioRecorder();
  let audioBlob = null;
  let recordedSeconds = 0;

  // Preview state (independent of recording)
  let previewStream = null;
  let previewCtx = null;
  let previewRafId = null;
  let peakSinceReset = 0;
  let selectedDeviceId = localStorage.getItem(PREFERRED_MIC_KEY) || '';

  container.innerHTML = `
    <div class="phase-content phase-capture">
      <h2 class="phase-title">Grabación</h2>
      <p class="phase-desc">Habla con naturalidad y el detalle que quieras. Para sesiones muy largas (más de ~2 h) conviene dividir el dictado en varias grabaciones.</p>

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
          <span class="record-label" id="record-label">Pulsa para grabar</span>
        </button>
        <div class="timer" id="timer" aria-live="polite">00:00</div>
        <button class="btn-pause" id="btn-pause" hidden aria-label="Pausar grabación">Pausar</button>
      </div>

      <div class="error-box" id="error-box" hidden></div>

      <div class="phase-actions" id="phase-actions" hidden>
        <button class="btn-primary" id="btn-continue">Procesar esta grabación</button>
        <button class="btn-ghost" id="btn-retry">Desechar esta grabación y grabar de nuevo</button>
      </div>
    </div>
  `;

  const btnRecord = container.querySelector('#btn-record');
  const recordLabel = container.querySelector('#record-label');
  const timer = container.querySelector('#timer');
  const btnPause = container.querySelector('#btn-pause');
  const errorBox = container.querySelector('#error-box');
  const phaseActions = container.querySelector('#phase-actions');
  const btnContinue = container.querySelector('#btn-continue');
  const btnRetry = container.querySelector('#btn-retry');
  const micSelect = container.querySelector('#mic-select');
  const meterBar = container.querySelector('#mic-meter-bar');
  const micStatus = container.querySelector('#mic-status');

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  function hideError() {
    errorBox.hidden = true;
  }

  function updateUI() {
    if (recorder.isRecording) {
      btnRecord.classList.add('recording');
      btnRecord.classList.remove('paused');
      recordLabel.textContent = 'Pulsa para detener';
      btnPause.hidden = false;
      btnPause.textContent = 'Pausar';
      btnPause.setAttribute('aria-label', 'Pausar grabación');
    } else if (recorder.isPaused) {
      btnRecord.classList.remove('recording');
      btnRecord.classList.add('paused');
      recordLabel.textContent = 'Pulsa para detener';
      btnPause.hidden = false;
      btnPause.textContent = 'Reanudar';
      btnPause.setAttribute('aria-label', 'Reanudar grabación');
    } else {
      btnRecord.classList.remove('recording', 'paused');
      recordLabel.textContent = 'Pulsa para grabar';
      btnPause.hidden = true;
      timer.textContent = '00:00';
    }
  }

  recorder.onTimeUpdate = (seconds) => {
    timer.textContent = formatTime(seconds);
  };

  // --- Mic preview / level meter ---

  function stopPreview() {
    if (previewRafId) {
      cancelAnimationFrame(previewRafId);
      previewRafId = null;
    }
    if (previewCtx) {
      previewCtx.close().catch(() => {});
      previewCtx = null;
    }
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
      previewStream = null;
    }
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
      for (let i = 0; i < data.length; i++) {
        const x = (data[i] - 128) / 128;
        sum += x * x;
      }
      const rms = Math.sqrt(sum / data.length);
      const pct = Math.min(100, rms * 300);
      meterBar.style.width = `${pct}%`;
      if (rms > peakSinceReset) peakSinceReset = rms;

      // After 3s of preview, if peak is still ~0, surface a hint
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

  async function populateDeviceList() {
    let tmpStream = null;
    try {
      // Permission needed to get device labels
      tmpStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      showError(err.name === 'NotAllowedError'
        ? 'Se necesita acceso al micrófono. Permite el acceso en el navegador y recarga la página.'
        : `No se pudo acceder al micrófono: ${err.message}`);
      return;
    } finally {
      // Release immediately; preview will reopen with the chosen device
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

    // Pick saved preference if still available, else default
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

  btnRecord.addEventListener('click', async () => {
    hideError();

    if (recorder.isRecording || recorder.isPaused) {
      btnRecord.disabled = true;
      btnPause.hidden = true;
      recordLabel.textContent = 'Procesando...';
      recordedSeconds = recorder.getElapsedSeconds();
      audioBlob = await recorder.stop();
      btnRecord.disabled = false;
      updateUI();
      phaseActions.hidden = false;
      // Resume preview so the user can see the mic working before re-recording
      await startPreview(selectedDeviceId);
    } else {
      // Stop preview before recording (avoid two getUserMedia on same device)
      stopPreview();
      try {
        await recorder.start(selectedDeviceId || null);
        updateUI();
        phaseActions.hidden = true;
        audioBlob = null;
        // Attach meter to the recording stream too
        attachMeterToStream(recorder.stream);
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          showError('Se necesita acceso al micrófono. Permite el acceso en el navegador y vuelve a intentarlo.');
        } else {
          showError(`Error al iniciar la grabación: ${err.message}`);
        }
        // Try to restore preview
        await startPreview(selectedDeviceId);
      }
    }
  });

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
      for (let i = 0; i < data.length; i++) {
        const x = (data[i] - 128) / 128;
        sum += x * x;
      }
      const rms = Math.sqrt(sum / data.length);
      meterBar.style.width = `${Math.min(100, rms * 300)}%`;
      previewRafId = requestAnimationFrame(tick);
    }
    tick();
  }

  btnPause.addEventListener('click', () => {
    if (recorder.isRecording) {
      recorder.pause();
    } else if (recorder.isPaused) {
      recorder.resume();
    }
    updateUI();
  });

  btnContinue.addEventListener('click', () => {
    if (audioBlob) {
      stopPreview();
      onComplete(audioBlob, { durationSeconds: recordedSeconds });
    }
  });

  btnRetry.addEventListener('click', () => {
    audioBlob = null;
    recordedSeconds = 0;
    phaseActions.hidden = true;
    hideError();
  });

  // Kick off device enumeration + preview
  populateDeviceList();
}
