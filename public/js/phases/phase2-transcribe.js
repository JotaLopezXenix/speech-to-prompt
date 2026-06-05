import { api } from '../api-client.js';

// WebM/Opus of pure silence runs ~1-2 KB/s. Real speech is typically 4-8+ KB/s.
// Below this threshold we suspect a muted mic and warn the user before spending Groq cuota.
const MIN_BYTES_PER_SECOND = 2000;

// Groq (tier gratuito) rechaza archivos de más de ~25 MB con un 413.
// Avisamos por debajo de ese límite para no gastar el intento en un envío que fallará.
const MAX_SAFE_BYTES = 24 * 1024 * 1024;

export async function renderPhase2(container, { sessionId, audioBlob, audioDuration = 0, onComplete }) {
  container.innerHTML = `
    <div class="phase-content phase-transcribe">
      <h2 class="phase-title">Transcripción</h2>
      <div class="spinner-area" id="spinner-area">
        <div class="spinner"></div>
        <p class="spinner-label">Transcribiendo audio con Whisper...</p>
      </div>
      <div class="result-area" id="result-area" hidden>
        <p class="phase-desc">Transcripción completada. Continúa para revisarla.</p>
        <div class="transcription-preview" id="transcription-preview"></div>
        <div class="phase-actions">
          <button class="btn-primary" id="btn-continue">Revisar transcripción</button>
        </div>
      </div>
      <div class="warn-box" id="warn-box" hidden></div>
      <div class="error-box" id="error-box" hidden></div>
    </div>
  `;

  const spinnerArea = container.querySelector('#spinner-area');
  const resultArea = container.querySelector('#result-area');
  const preview = container.querySelector('#transcription-preview');
  const errorBox = container.querySelector('#error-box');
  const warnBox = container.querySelector('#warn-box');
  const btnContinue = container.querySelector('#btn-continue');

  // Audio sanity check before sending to Groq
  const sizeBytes = audioBlob.size;
  const seconds = Math.max(1, audioDuration);
  const bytesPerSecond = sizeBytes / seconds;

  console.log(`[transcribe] audio: ${sizeBytes} bytes, ${seconds}s, ${bytesPerSecond.toFixed(0)} B/s`);

  if (bytesPerSecond < MIN_BYTES_PER_SECOND) {
    spinnerArea.hidden = true;
    warnBox.hidden = false;
    warnBox.innerHTML = `
      <strong>El audio parece silencioso.</strong>
      <p>Tamaño: ${(sizeBytes / 1024).toFixed(1)} KB para ${seconds}s
      (${bytesPerSecond.toFixed(0)} B/s; lo normal con voz es &gt; ${MIN_BYTES_PER_SECOND} B/s).</p>
      <p>Whisper suele responder con frases inventadas como "Gracias por el vídeo." cuando el audio está mudo.
      Revisa el micrófono seleccionado en la pantalla anterior y vuelve a grabar.</p>
      <div class="phase-actions">
        <button class="btn-primary" id="btn-send-anyway">Enviar igualmente</button>
      </div>
    `;
    const btnAnyway = warnBox.querySelector('#btn-send-anyway');
    await new Promise((resolve) => {
      btnAnyway.addEventListener('click', () => {
        warnBox.hidden = true;
        spinnerArea.hidden = false;
        resolve();
      });
    });
  }

  // Size guard: a recording over Groq's limit would fail with a 413 after a long upload.
  if (sizeBytes > MAX_SAFE_BYTES) {
    spinnerArea.hidden = true;
    warnBox.hidden = false;
    warnBox.innerHTML = `
      <strong>La grabación es muy larga para el plan gratuito de Groq.</strong>
      <p>Tamaño: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB (el límite de Groq es ~25 MB).</p>
      <p>Para evitar el error, divide el dictado en dos grabaciones más cortas.
      Si aun así quieres intentarlo, puedes enviarlo igualmente.</p>
      <div class="phase-actions">
        <button class="btn-primary" id="btn-send-oversize">Enviar igualmente</button>
      </div>
    `;
    const btnOversize = warnBox.querySelector('#btn-send-oversize');
    await new Promise((resolve) => {
      btnOversize.addEventListener('click', () => {
        warnBox.hidden = true;
        spinnerArea.hidden = false;
        resolve();
      });
    });
  }

  try {
    const result = await api.transcribe(sessionId, audioBlob);
    spinnerArea.hidden = true;
    preview.textContent = result.transcription_raw.slice(0, 300) + (result.transcription_raw.length > 300 ? '…' : '');
    resultArea.hidden = false;

    btnContinue.addEventListener('click', () => {
      onComplete(result.transcription_raw);
    });
  } catch (err) {
    spinnerArea.hidden = true;
    const isTooLarge = /413|too large|request_too_large/i.test(err.message);
    errorBox.textContent = isTooLarge
      ? 'La grabación supera el límite de tamaño de Groq (~25 MB). Divide el dictado en dos grabaciones más cortas y vuelve a intentarlo.'
      : `Error en la transcripción: ${err.message}`;
    errorBox.hidden = false;

    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn-ghost';
    retryBtn.textContent = 'Reintentar';
    retryBtn.style.marginTop = '1rem';
    retryBtn.addEventListener('click', () => {
      renderPhase2(container, { sessionId, audioBlob, audioDuration, onComplete });
    });
    errorBox.after(retryBtn);
  }
}
