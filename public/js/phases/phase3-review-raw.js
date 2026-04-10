import { api } from '../api-client.js';

export function renderPhase3(container, { sessionId, transcriptionRaw, onComplete }) {
  const wordCount = transcriptionRaw.trim().split(/\s+/).filter(Boolean).length;

  container.innerHTML = `
    <div class="phase-content phase-review">
      <h2 class="phase-title">Revisión de transcripción</h2>
      <p class="phase-desc">
        Revisa y edita el texto bruto. Elimina fragmentos irrelevantes o corrige errores evidentes de transcripción antes de destilar.
      </p>
      <div class="textarea-header">
        <span class="word-count" id="word-count">${wordCount} palabras</span>
      </div>
      <textarea
        class="main-textarea"
        id="transcription-textarea"
        placeholder="Transcripción..."
        spellcheck="true"
        lang="es"
      >${transcriptionRaw}</textarea>
      <div class="error-box" id="error-box" hidden></div>
      <div class="phase-actions">
        <button class="btn-primary" id="btn-distill">Destilar prompt</button>
      </div>
    </div>
  `;

  const textarea = container.querySelector('#transcription-textarea');
  const wordCountEl = container.querySelector('#word-count');
  const errorBox = container.querySelector('#error-box');
  const btnDistill = container.querySelector('#btn-distill');

  textarea.addEventListener('input', () => {
    const count = textarea.value.trim().split(/\s+/).filter(Boolean).length;
    wordCountEl.textContent = `${count} palabras`;
  });

  btnDistill.addEventListener('click', async () => {
    const edited = textarea.value.trim();
    if (!edited) {
      errorBox.textContent = 'El texto no puede estar vacío.';
      errorBox.hidden = false;
      return;
    }
    errorBox.hidden = true;
    btnDistill.disabled = true;
    btnDistill.textContent = 'Guardando...';

    try {
      await api.updateSession(sessionId, { transcription_edited: edited });
      onComplete(edited);
    } catch (err) {
      errorBox.textContent = `Error al guardar: ${err.message}`;
      errorBox.hidden = false;
      btnDistill.disabled = false;
      btnDistill.textContent = 'Destilar prompt';
    }
  });
}
