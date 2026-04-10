import { api } from '../api-client.js';

export async function renderPhase2(container, { sessionId, audioBlob, onComplete }) {
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
      <div class="error-box" id="error-box" hidden></div>
    </div>
  `;

  const spinnerArea = container.querySelector('#spinner-area');
  const resultArea = container.querySelector('#result-area');
  const preview = container.querySelector('#transcription-preview');
  const errorBox = container.querySelector('#error-box');
  const btnContinue = container.querySelector('#btn-continue');

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
    errorBox.textContent = `Error en la transcripción: ${err.message}`;
    errorBox.hidden = false;

    // Add retry button
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn-ghost';
    retryBtn.textContent = 'Reintentar';
    retryBtn.style.marginTop = '1rem';
    retryBtn.addEventListener('click', () => {
      renderPhase2(container, { sessionId, audioBlob, onComplete });
    });
    errorBox.after(retryBtn);
  }
}
