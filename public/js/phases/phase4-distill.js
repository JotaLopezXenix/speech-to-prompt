import { api } from '../api-client.js';

const MODE_LABELS = { completo: 'Completo', ligero: 'Ligero', literal: 'Literal', limpio: 'Limpio' };

export async function renderPhase4(container, { sessionId, mode, systemPrompt, onComplete }) {
  const modeLabel = MODE_LABELS[mode] || 'Completo';

  container.innerHTML = `
    <div class="phase-content phase-distill">
      <h2 class="phase-title">Destilación</h2>
      <div class="spinner-area" id="spinner-area">
        <div class="spinner"></div>
        <p class="spinner-label">Destilando en modo ${modeLabel}...</p>
      </div>
      <div class="result-area" id="result-area" hidden>
        <p class="phase-desc">Destilación completada. Continúa para revisar el prompt.</p>
        <div class="usage-info" id="usage-info"></div>
        <div class="warn-box" id="truncate-warn" hidden></div>
        <div class="phase-actions">
          <button class="btn-primary" id="btn-continue">Revisar prompt</button>
        </div>
      </div>
      <div class="error-box" id="error-box" hidden></div>
    </div>
  `;

  const spinnerArea = container.querySelector('#spinner-area');
  const resultArea = container.querySelector('#result-area');
  const usageInfo = container.querySelector('#usage-info');
  const errorBox = container.querySelector('#error-box');
  const btnContinue = container.querySelector('#btn-continue');

  try {
    const result = await api.distill(sessionId, { mode, systemPrompt });
    spinnerArea.hidden = true;

    if (result.usage) {
      usageInfo.textContent = `Tokens usados: ${result.usage.input_tokens} entrada / ${result.usage.output_tokens} salida — Proveedor: ${result.session.llm_provider} / ${result.session.llm_model}`;
    }

    if (result.truncated) {
      const warn = container.querySelector('#truncate-warn');
      warn.innerHTML = `
        <strong>La destilación alcanzó el límite de longitud y puede estar incompleta.</strong>
        <p>Revisa el final del prompt. Si se ha cortado, prueba a dividir el dictado en partes más cortas.</p>
      `;
      warn.hidden = false;
    }

    resultArea.hidden = false;

    btnContinue.addEventListener('click', () => {
      onComplete(result.prompt_distilled);
    });
  } catch (err) {
    spinnerArea.hidden = true;
    errorBox.textContent = `Error en la destilación: ${err.message}`;
    errorBox.hidden = false;

    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn-ghost';
    retryBtn.textContent = 'Reintentar';
    retryBtn.style.marginTop = '1rem';
    retryBtn.addEventListener('click', () => {
      renderPhase4(container, { sessionId, mode, systemPrompt, onComplete });
    });
    errorBox.after(retryBtn);
  }
}
