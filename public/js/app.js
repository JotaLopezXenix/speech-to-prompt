import { api } from './api-client.js';
import { renderPhase1 } from './phases/phase1-capture.js';
import { renderPhase2 } from './phases/phase2-transcribe.js';
import { renderPhase3 } from './phases/phase3-review-raw.js';
import { renderPhase4 } from './phases/phase4-distill.js';
import { renderPhase5 } from './phases/phase5-result.js';
import { renderSettings } from './components/settings-panel.js';
import { renderHistory } from './components/history-panel.js';

// State
let state = {
  phase: 1,
  sessionId: null,
  audioBlob: null,
  transcriptionRaw: null,
};

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
        onComplete: async (audioBlob, meta = {}) => {
          state.audioBlob = audioBlob;
          state.audioDuration = meta.durationSeconds || 0;
          const session = await api.createSession();
          state.sessionId = session.id;
          goToPhase(2);
        },
      });
      break;

    case 2:
      await renderPhase2(phaseContainer, {
        sessionId: state.sessionId,
        audioBlob: state.audioBlob,
        audioDuration: state.audioDuration,
        onComplete: (transcriptionRaw) => {
          state.transcriptionRaw = transcriptionRaw;
          goToPhase(3);
        },
      });
      break;

    case 3:
      renderPhase3(phaseContainer, {
        sessionId: state.sessionId,
        transcriptionRaw: state.transcriptionRaw,
        onComplete: () => {
          goToPhase(4);
        },
      });
      break;

    case 4:
      await renderPhase4(phaseContainer, {
        sessionId: state.sessionId,
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
      });
      break;
  }
}

// Reset to phase 1
function resetApp() {
  state = { phase: 1, sessionId: null, audioBlob: null, transcriptionRaw: null };
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
