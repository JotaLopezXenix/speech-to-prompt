import { api } from '../api-client.js';

// Metadatos de los cuatro modos de destilación (microcopy del front). El orden
// aquí es el de la UI; `limpio` es el modo por defecto (primero y preseleccionado).
const MODES = [
  { id: 'limpio', label: 'Limpio', desc: 'Limpia y estructura fielmente el audio, marca dudas, sin resolver ni sintetizar. Ideal para iniciar una conversación de análisis con toda la información del audio.' },
  { id: 'completo', label: 'Completo', desc: 'Destilado agresivo: reestructura, resuelve dudas y sintetiza. El resultado ya incorpora interpretaciones y decisiones del modelo sobre lo que dijiste, no solo tu información en bruto.' },
  { id: 'ligero', label: 'Ligero', desc: 'Limpieza y pulido, sin cambios de estructura ni valoraciones.' },
  { id: 'literal', label: 'Literal', desc: 'Casi textual, solo puntúa y arregla siglas deletreadas.' },
];

// Modo por defecto cuando la sesión no trae uno guardado.
const DEFAULT_MODE = 'limpio';

// Fase 3: revisar/editar el texto bruto, elegir el modo de destilación y, si se
// quiere, ver/editar el system prompt que se enviará. El estado durable (modo +
// prompts por modo) vive en app.js; aquí se reporta vía callbacks.
export function renderPhase3(container, {
  sessionId,
  transcriptionRaw,
  mode = null,            // modo preseleccionado (null = usa el defecto, `limpio`)
  prompts = {},           // texto actual del editor por modo
  defaults = {},          // prompts por defecto (para "Restablecer")
  onModeChange,
  onPromptInput,
  onComplete,
}) {
  const wordCount = transcriptionRaw.trim().split(/\s+/).filter(Boolean).length;

  // Copia local editable de los prompts por modo (se reporta a app.js al cambiar).
  const drafts = { ...prompts };
  const promptFor = (m) => (drafts[m] != null ? drafts[m] : (defaults[m] != null ? defaults[m] : ''));
  let selectedMode = MODES.some(x => x.id === mode) ? mode : DEFAULT_MODE;

  // Etiqueta y descripción apiladas: así todas las descripciones arrancan en la
  // misma columna y envuelven alineadas aunque ocupen dos líneas.
  const modeRadios = MODES.map(m => `
    <label class="mode-option">
      <input type="radio" name="distill-mode" value="${m.id}" ${m.id === selectedMode ? 'checked' : ''}>
      <span class="mode-text">
        <span class="mode-label">${m.label}</span>
        <span class="mode-desc">${m.desc}</span>
      </span>
    </label>
  `).join('');

  container.innerHTML = `
    <div class="phase-content phase-review">
      <h2 class="phase-title">Revisión de transcripción</h2>
      <p class="phase-desc">
        Revisa y edita el texto bruto. Elimina fragmentos irrelevantes o corrige errores evidentes de transcripción antes de destilar.
      </p>
      <div class="textarea-header">
        <span class="word-count" id="word-count">${wordCount} palabras</span>
        <button class="btn-copy" id="btn-copy-raw" title="Copiar el texto bruto al portapapeles">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copiar
        </button>
      </div>
      <textarea
        class="main-textarea"
        id="transcription-textarea"
        placeholder="Transcripción..."
        spellcheck="true"
        lang="es"
      >${transcriptionRaw}</textarea>
      <div class="copy-feedback" id="copy-feedback" hidden>¡Copiado al portapapeles!</div>

      <div class="distill-controls">
        <p class="phase-desc">Elige cómo destilar:</p>
        <div class="mode-selector" id="mode-selector">
          ${modeRadios}
        </div>

        <div class="prompt-editor-wrap">
          <button class="btn-ghost" id="btn-toggle-prompt" ${selectedMode ? '' : 'disabled'}>Ver/editar system prompt</button>
          <div class="prompt-editor" id="prompt-editor" hidden>
            <div class="textarea-header">
              <span class="prompt-editor-label">System prompt (modo: <span id="prompt-mode-label">${selectedMode || '—'}</span>)</span>
              <button class="btn-ghost" id="btn-reset-prompt">Restablecer al predeterminado</button>
            </div>
            <textarea
              class="main-textarea prompt-textarea"
              id="system-prompt-textarea"
              placeholder="System prompt..."
              spellcheck="false"
            >${selectedMode ? escapeHtml(promptFor(selectedMode)) : ''}</textarea>
            <div class="prompt-hint" id="prompt-hint" hidden>El prompt está vacío; se usará el predeterminado del modo.</div>
          </div>
        </div>
      </div>

      <div class="error-box" id="error-box" hidden></div>
      <div class="phase-actions">
        <button class="btn-primary" id="btn-distill" ${selectedMode ? '' : 'disabled'}>Destilar prompt</button>
      </div>
    </div>
  `;

  const textarea = container.querySelector('#transcription-textarea');
  const wordCountEl = container.querySelector('#word-count');
  const errorBox = container.querySelector('#error-box');
  const btnDistill = container.querySelector('#btn-distill');
  const btnCopyRaw = container.querySelector('#btn-copy-raw');
  const copyFeedback = container.querySelector('#copy-feedback');
  const btnTogglePrompt = container.querySelector('#btn-toggle-prompt');
  const promptEditor = container.querySelector('#prompt-editor');
  const promptTextarea = container.querySelector('#system-prompt-textarea');
  const promptModeLabel = container.querySelector('#prompt-mode-label');
  const promptHint = container.querySelector('#prompt-hint');
  const btnResetPrompt = container.querySelector('#btn-reset-prompt');

  textarea.addEventListener('input', () => {
    const count = textarea.value.trim().split(/\s+/).filter(Boolean).length;
    wordCountEl.textContent = `${count} palabras`;
  });

  btnCopyRaw.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
      copyFeedback.hidden = false;
      btnCopyRaw.classList.add('copied');
      setTimeout(() => { copyFeedback.hidden = true; btnCopyRaw.classList.remove('copied'); }, 2500);
    } catch {
      errorBox.textContent = 'No se pudo copiar al portapapeles. Selecciona el texto manualmente.';
      errorBox.hidden = false;
    }
  });

  function refreshHint() {
    promptHint.hidden = !(selectedMode && !promptTextarea.value.trim());
  }

  // Selección de modo: habilita controles, carga el prompt del modo en el editor.
  container.querySelectorAll('input[name="distill-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      selectedMode = radio.value;
      btnDistill.disabled = false;
      btnTogglePrompt.disabled = false;
      promptModeLabel.textContent = selectedMode;
      promptTextarea.value = promptFor(selectedMode);
      refreshHint();
      onModeChange?.(selectedMode);
    });
  });

  // Sincroniza el estado durable (app.js) con el modo preseleccionado de inicio
  // (el defecto `limpio`, o el guardado al reabrir una sesión del historial).
  onModeChange?.(selectedMode);

  btnTogglePrompt.addEventListener('click', () => {
    promptEditor.hidden = !promptEditor.hidden;
  });

  promptTextarea.addEventListener('input', () => {
    if (!selectedMode) return;
    drafts[selectedMode] = promptTextarea.value;
    refreshHint();
    onPromptInput?.(selectedMode, promptTextarea.value);
  });

  btnResetPrompt.addEventListener('click', () => {
    if (!selectedMode) return;
    const def = defaults[selectedMode] != null ? defaults[selectedMode] : '';
    drafts[selectedMode] = def;
    promptTextarea.value = def;
    refreshHint();
    onPromptInput?.(selectedMode, def);
  });

  btnDistill.addEventListener('click', async () => {
    const edited = textarea.value.trim();
    if (!edited) {
      errorBox.textContent = 'El texto no puede estar vacío.';
      errorBox.hidden = false;
      return;
    }
    if (!selectedMode) {
      errorBox.textContent = 'Elige un modo de destilación.';
      errorBox.hidden = false;
      return;
    }
    errorBox.hidden = true;
    btnDistill.disabled = true;
    btnDistill.textContent = 'Guardando...';

    try {
      await api.updateSession(sessionId, { transcription_edited: edited });
      onComplete(edited, selectedMode);
    } catch (err) {
      errorBox.textContent = `Error al guardar: ${err.message}`;
      errorBox.hidden = false;
      btnDistill.disabled = false;
      btnDistill.textContent = 'Destilar prompt';
    }
  });
}

// El contenido del prompt va dentro de un <textarea>; escapamos para no romper el
// cierre de la etiqueta ni inyectar markup.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
