import { api } from '../api-client.js';

export function renderPhase5(container, { sessionId, promptDistilled, onNewSession }) {
  const wordCount = promptDistilled.trim().split(/\s+/).filter(Boolean).length;

  container.innerHTML = `
    <div class="phase-content phase-result">
      <h2 class="phase-title">Prompt destilado</h2>
      <p class="phase-desc">
        Revisa y edita el prompt final. Cuando esté listo, cópialo al portapapeles.
      </p>
      <div class="textarea-header">
        <span class="word-count" id="word-count">${wordCount} palabras</span>
        <button class="btn-copy" id="btn-copy" title="Copiar al portapapeles">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copiar
        </button>
      </div>
      <textarea
        class="main-textarea"
        id="prompt-textarea"
        placeholder="Prompt destilado..."
        spellcheck="true"
        lang="es"
      >${promptDistilled}</textarea>
      <div class="copy-feedback" id="copy-feedback" hidden>¡Copiado al portapapeles!</div>
      <div class="error-box" id="error-box" hidden></div>
      <div class="phase-actions">
        <button class="btn-ghost" id="btn-save">Guardar cambios</button>
        <button class="btn-primary" id="btn-new">Nueva sesión</button>
      </div>
    </div>
  `;

  const textarea = container.querySelector('#prompt-textarea');
  const wordCountEl = container.querySelector('#word-count');
  const btnCopy = container.querySelector('#btn-copy');
  const copyFeedback = container.querySelector('#copy-feedback');
  const errorBox = container.querySelector('#error-box');
  const btnSave = container.querySelector('#btn-save');
  const btnNew = container.querySelector('#btn-new');

  textarea.addEventListener('input', () => {
    const count = textarea.value.trim().split(/\s+/).filter(Boolean).length;
    wordCountEl.textContent = `${count} palabras`;
  });

  btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
      copyFeedback.hidden = false;
      btnCopy.classList.add('copied');
      setTimeout(() => {
        copyFeedback.hidden = true;
        btnCopy.classList.remove('copied');
      }, 2500);
    } catch {
      errorBox.textContent = 'No se pudo copiar al portapapeles. Selecciona el texto manualmente.';
      errorBox.hidden = false;
    }
  });

  btnSave.addEventListener('click', async () => {
    try {
      await api.updateSession(sessionId, { prompt_distilled: textarea.value });
      btnSave.textContent = 'Guardado';
      setTimeout(() => { btnSave.textContent = 'Guardar cambios'; }, 1500);
    } catch (err) {
      errorBox.textContent = `Error al guardar: ${err.message}`;
      errorBox.hidden = false;
    }
  });

  btnNew.addEventListener('click', onNewSession);
}
