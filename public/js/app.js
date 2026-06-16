import { api } from './api-client.js';
import { renderPhase1 } from './phases/phase1-capture.js';
import { renderPhase3 } from './phases/phase3-review-raw.js';
import { renderPhase4 } from './phases/phase4-distill.js';
import { renderPhase5 } from './phases/phase5-result.js';
import { renderSettings } from './components/settings-panel.js';
import { renderHistory } from './components/history-panel.js';

// State
let state = {
  phase: 1,
  sessionId: null,
  transcriptionRaw: null,
  distillMode: null,        // modo elegido para esta sesión (completo|ligero|literal)
  distillPrompts: null,     // texto actual del editor por modo { completo, ligero, literal }
  distillDefaults: null,    // prompts por defecto (para "Restablecer"), cargados una vez
};

// Carga (una vez por sesión de app) los prompts por defecto de cada modo y prepara
// la copia editable. Tolerante a fallos: si el endpoint no responde, los editores
// quedan vacíos y el backend cae al prompt por defecto del modo igualmente.
async function ensureDistillPrompts() {
  if (!state.distillDefaults) {
    try {
      state.distillDefaults = await api.getPrompts();
    } catch {
      state.distillDefaults = {};
    }
  }
  if (!state.distillPrompts) {
    state.distillPrompts = { ...state.distillDefaults };
  } else {
    // Rellena con el default los modos que no se hayan sembrado (p. ej. al reabrir).
    for (const m of Object.keys(state.distillDefaults)) {
      if (state.distillPrompts[m] == null) state.distillPrompts[m] = state.distillDefaults[m];
    }
  }
}

// DOM refs
const phaseContainer = document.getElementById('phase-container');
const phaseIndicator = document.getElementById('phase-indicator');
const overlay = document.getElementById('overlay');
const settingsPanel = document.getElementById('settings-panel');
const settingsContainer = document.getElementById('settings-container');
const historyPanel = document.getElementById('history-panel');
const historyContainer = document.getElementById('history-container');

// Phase indicator
function updatePhaseIndicator(phase) {
  phaseIndicator.querySelectorAll('.phase-step').forEach(el => {
    const p = parseInt(el.dataset.phase);
    el.classList.toggle('active', p === phase);
    el.classList.toggle('done', p < phase);
  });
}

// Navigate to phase
async function goToPhase(phase) {
  state.phase = phase;
  updatePhaseIndicator(phase);

  switch (phase) {
    case 1:
      renderPhase1(phaseContainer, {
        // El workspace de captura crea la sesión, graba/importa segmentos y los
        // transcribe; al terminar devuelve el id y la transcripción unificada.
        onComplete: (sessionId, transcriptionRaw) => {
          state.sessionId = sessionId;
          state.transcriptionRaw = transcriptionRaw;
          goToPhase(3);
        },
      });
      break;

    case 3:
      await ensureDistillPrompts();
      renderPhase3(phaseContainer, {
        sessionId: state.sessionId,
        transcriptionRaw: state.transcriptionRaw,
        mode: state.distillMode,
        prompts: state.distillPrompts,
        defaults: state.distillDefaults,
        onModeChange: (mode) => { state.distillMode = mode; },
        onPromptInput: (mode, text) => { state.distillPrompts[mode] = text; },
        onComplete: (edited, mode) => {
          state.distillMode = mode;
          goToPhase(4);
        },
      });
      break;

    case 4:
      await renderPhase4(phaseContainer, {
        sessionId: state.sessionId,
        mode: state.distillMode,
        systemPrompt: state.distillPrompts?.[state.distillMode],
        onComplete: (promptDistilled) => {
          state.promptDistilled = promptDistilled;
          goToPhase(5);
        },
      });
      break;

    case 5:
      renderPhase5(phaseContainer, {
        sessionId: state.sessionId,
        promptDistilled: state.promptDistilled,
        onNewSession: resetApp,
        onBackToTranscription: () => goToPhase(3),
        canReDistill: !!state.transcriptionRaw,
      });
      break;
  }
}

// Reset to phase 1. Conserva los defaults cacheados, pero limpia el modo y las
// ediciones de prompt para que una sesión nueva empiece sin arrastres.
function resetApp() {
  const defaults = state.distillDefaults;
  state = {
    phase: 1,
    sessionId: null,
    transcriptionRaw: null,
    distillMode: null,
    distillPrompts: defaults ? { ...defaults } : null,
    distillDefaults: defaults || null,
  };
  goToPhase(1);
}

// Load a historical session, resuming at the phase that matches its state:
//  - already distilled        → phase 5 (review final prompt)
//  - transcribed, not distilled → phase 3 (review raw, then distill)
//  - nothing yet               → phase 5 (empty, as before)
async function loadHistoricalSession(sessionId) {
  try {
    const session = await api.getSession(sessionId);
    state.sessionId = session.id;
    state.transcriptionRaw = session.transcription_edited || session.transcription_raw || null;
    state.promptDistilled = session.prompt_distilled || session.transcription_edited || session.transcription_raw || '';

    // Siembra el modo y el prompt guardados (si los hay) para poder reusarlos/afinar
    // al volver a la transcripción. Sesiones antiguas (sin estos campos) → defaults.
    await ensureDistillPrompts();
    state.distillPrompts = { ...state.distillDefaults };
    state.distillMode = session.distill_mode || null;
    if (state.distillMode && session.distill_prompt_used) {
      state.distillPrompts[state.distillMode] = session.distill_prompt_used;
    }

    if (!session.prompt_distilled && state.transcriptionRaw) {
      goToPhase(3);
    } else {
      goToPhase(5);
    }
  } catch (err) {
    alert(`No se pudo cargar la sesión: ${err.message}`);
  }
}

// Panel management
function openPanel(panel) {
  overlay.hidden = false;
  panel.hidden = false;
  document.body.classList.add('panel-open');
}

function closePanel(panel) {
  panel.hidden = true;
  overlay.hidden = true;
  document.body.classList.remove('panel-open');
}

// Settings
document.getElementById('btn-settings').addEventListener('click', () => {
  renderSettings(settingsContainer, {
    onClose: () => closePanel(settingsPanel),
    onSaved: () => {},
  });
  openPanel(settingsPanel);
});

// History
document.getElementById('btn-history').addEventListener('click', () => {
  renderHistory(historyContainer, {
    onClose: () => closePanel(historyPanel),
    onLoadSession: loadHistoricalSession,
  });
  openPanel(historyPanel);
});

// Overlay click closes all panels
overlay.addEventListener('click', () => {
  closePanel(settingsPanel);
  closePanel(historyPanel);
});

// Check first-run: if no API keys, open settings immediately
async function checkFirstRun() {
  try {
    const { configured } = await api.getConfig();
    if (!configured) {
      renderSettings(settingsContainer, {
        onClose: () => closePanel(settingsPanel),
        onSaved: () => {},
      });
      openPanel(settingsPanel);
    }
  } catch {
    // Non-blocking — just continue
  }
}

// Init
checkFirstRun();
goToPhase(1);
