import { api } from '../api-client.js';

export async function renderSettings(container, { onClose, onSaved }) {
  container.innerHTML = `
    <div class="panel-header">
      <h2 class="panel-title">Ajustes</h2>
      <button class="btn-icon panel-close" id="settings-close" aria-label="Cerrar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="panel-body">
      <div class="spinner-area" id="settings-spinner">
        <div class="spinner"></div>
      </div>
      <div id="settings-form" hidden>
        <section class="settings-section">
          <h3 class="settings-section-title">API Keys</h3>
          <label class="settings-label">
            Anthropic (Claude)
            <input type="password" class="settings-input" id="key-anthropic" placeholder="sk-ant-..." autocomplete="off" />
          </label>
          <label class="settings-label">
            Groq (Whisper STT)
            <input type="password" class="settings-input" id="key-groq" placeholder="gsk_..." autocomplete="off" />
          </label>
          <label class="settings-label">
            Google Gemini <span class="badge-stub">V2</span>
            <input type="password" class="settings-input" id="key-google" placeholder="..." autocomplete="off" disabled />
          </label>
        </section>

        <section class="settings-section">
          <h3 class="settings-section-title">Modelo LLM por defecto</h3>
          <label class="settings-label">
            Proveedor LLM
            <select class="settings-select" id="llm-provider">
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
          <label class="settings-label">
            Modelo
            <select class="settings-select" id="llm-model">
              <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
              <option value="claude-opus-4-5">Claude Opus 4.5</option>
              <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
            </select>
          </label>
        </section>

        <section class="settings-section">
          <h3 class="settings-section-title">Modelo STT por defecto</h3>
          <label class="settings-label">
            Modelo Whisper
            <select class="settings-select" id="stt-model">
              <option value="whisper-large-v3">Whisper Large v3</option>
              <option value="whisper-large-v3-turbo">Whisper Large v3 Turbo</option>
            </select>
          </label>
        </section>

        <div class="error-box" id="settings-error" hidden></div>
        <div class="settings-footer">
          <button class="btn-primary" id="btn-save-settings">Guardar</button>
          <div class="save-feedback" id="save-feedback" hidden>✓ Guardado</div>
        </div>
      </div>
    </div>
  `;

  const spinner = container.querySelector('#settings-spinner');
  const form = container.querySelector('#settings-form');
  const errorBox = container.querySelector('#settings-error');
  const saveFeedback = container.querySelector('#save-feedback');
  const btnSave = container.querySelector('#btn-save-settings');
  const btnClose = container.querySelector('#settings-close');

  btnClose.addEventListener('click', onClose);

  // Load current config
  try {
    const { config, defaults: _ } = await api.getConfig();
    spinner.hidden = true;
    form.hidden = false;

    // Populate fields (masked values shown as-is — don't overwrite unless user types)
    const keyAnthropicEl = container.querySelector('#key-anthropic');
    const keyGroqEl = container.querySelector('#key-groq');
    const llmModelEl = container.querySelector('#llm-model');
    const sttModelEl = container.querySelector('#stt-model');

    if (config.api_keys.anthropic) keyAnthropicEl.placeholder = config.api_keys.anthropic;
    if (config.api_keys.groq) keyGroqEl.placeholder = config.api_keys.groq;

    llmModelEl.value = config.defaults.llm_model || 'claude-sonnet-4-5';
    sttModelEl.value = config.defaults.stt_model || 'whisper-large-v3';

    btnSave.addEventListener('click', async () => {
      errorBox.hidden = true;
      btnSave.disabled = true;

      const payload = {
        defaults: {
          llm_provider: 'anthropic',
          llm_model: llmModelEl.value,
          stt_provider: 'groq',
          stt_model: sttModelEl.value,
        },
      };

      // Only update keys if the user actually typed something
      const api_keys = {};
      if (keyAnthropicEl.value) api_keys.anthropic = keyAnthropicEl.value;
      if (keyGroqEl.value) api_keys.groq = keyGroqEl.value;
      if (Object.keys(api_keys).length > 0) payload.api_keys = api_keys;

      try {
        await api.updateConfig(payload);
        saveFeedback.hidden = false;
        keyAnthropicEl.value = '';
        keyGroqEl.value = '';
        setTimeout(() => { saveFeedback.hidden = true; }, 2000);
        if (onSaved) onSaved();
      } catch (err) {
        errorBox.textContent = `Error al guardar: ${err.message}`;
        errorBox.hidden = false;
      } finally {
        btnSave.disabled = false;
      }
    });
  } catch (err) {
    spinner.hidden = true;
    errorBox.textContent = `Error al cargar la configuración: ${err.message}`;
    errorBox.hidden = false;
    form.hidden = false;
  }
}
