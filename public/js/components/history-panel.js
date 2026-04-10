import { api } from '../api-client.js';

export async function renderHistory(container, { onClose, onLoadSession }) {
  container.innerHTML = `
    <div class="panel-header">
      <h2 class="panel-title">Historial de sesiones</h2>
      <button class="btn-icon panel-close" id="history-close" aria-label="Cerrar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="panel-body">
      <div class="spinner-area" id="history-spinner">
        <div class="spinner"></div>
      </div>
      <div id="history-list" hidden></div>
      <div class="error-box" id="history-error" hidden></div>
    </div>
  `;

  const spinner = container.querySelector('#history-spinner');
  const list = container.querySelector('#history-list');
  const errorBox = container.querySelector('#history-error');
  const btnClose = container.querySelector('#history-close');

  btnClose.addEventListener('click', onClose);

  try {
    const sessions = await api.listSessions();
    spinner.hidden = true;
    list.hidden = false;

    if (sessions.length === 0) {
      list.innerHTML = '<p class="empty-state">No hay sesiones anteriores.</p>';
      return;
    }

    list.innerHTML = sessions.map(s => `
      <div class="history-item" data-id="${s.id}">
        <div class="history-meta">
          <span class="history-date">${formatDate(s.timestamp)}</span>
          ${s.has_prompt ? '<span class="badge-complete">Completada</span>' : '<span class="badge-draft">Borrador</span>'}
        </div>
        <p class="history-preview">${s.preview ? escapeHtml(s.preview) + '…' : '(sin contenido)'}</p>
      </div>
    `).join('');

    list.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        onLoadSession(item.dataset.id);
        onClose();
      });
    });
  } catch (err) {
    spinner.hidden = true;
    errorBox.textContent = `Error al cargar el historial: ${err.message}`;
    errorBox.hidden = false;
  }
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
