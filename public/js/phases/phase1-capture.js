import { AudioRecorder, formatTime } from '../audio-recorder.js';

export function renderPhase1(container, { onComplete }) {
  const recorder = new AudioRecorder();
  let audioBlob = null;

  container.innerHTML = `
    <div class="phase-content phase-capture">
      <h2 class="phase-title">Grabación</h2>
      <p class="phase-desc">Habla libremente. No hay límite de tiempo ni estructura impuesta.</p>

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
      // Idle or stopped
      btnRecord.classList.remove('recording', 'paused');
      recordLabel.textContent = 'Pulsa para grabar';
      btnPause.hidden = true;
      timer.textContent = '00:00';
    }
  }

  recorder.onTimeUpdate = (seconds) => {
    timer.textContent = formatTime(seconds);
  };

  btnRecord.addEventListener('click', async () => {
    hideError();

    if (recorder.isRecording || recorder.isPaused) {
      // Stop recording
      btnRecord.disabled = true;
      btnPause.hidden = true;
      recordLabel.textContent = 'Procesando...';
      audioBlob = await recorder.stop();
      btnRecord.disabled = false;
      updateUI();
      phaseActions.hidden = false;
    } else {
      // Start recording
      try {
        await recorder.start();
        updateUI();
        phaseActions.hidden = true;
        audioBlob = null;
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          showError('Se necesita acceso al micrófono. Permite el acceso en el navegador y vuelve a intentarlo.');
        } else {
          showError(`Error al iniciar la grabación: ${err.message}`);
        }
      }
    }
  });

  btnPause.addEventListener('click', () => {
    if (recorder.isRecording) {
      recorder.pause();
    } else if (recorder.isPaused) {
      recorder.resume();
    }
    updateUI();
  });

  btnContinue.addEventListener('click', () => {
    if (audioBlob) onComplete(audioBlob);
  });

  btnRetry.addEventListener('click', () => {
    audioBlob = null;
    phaseActions.hidden = true;
    hideError();
  });
}
