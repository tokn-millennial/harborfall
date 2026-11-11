// The panel on the right for the selected building. It shows whatever
// panelModel.js says, and reports button clicks.

import { el } from './dom.js';

export function createInfoPanel(root, { onAction, onClose }) {
  let shownKey = null;

  root.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    if (button.dataset.action === 'close') onClose();
    else onAction(button.dataset.action);
  });

  return {
    hide() {
      if (shownKey === null) return;
      shownKey = null;
      root.hidden = true;
      root.replaceChildren();
    },
    // Rebuilds the panel only when what it would say has changed.
    show(model) {
      const key = JSON.stringify(model);
      if (key === shownKey) return;
      shownKey = key;
      root.hidden = false;

      const rows = model.lines.map((line) => {
        const value = el('span', `info-value ${line.level ?? ''}`, line.value);
        const row = el('div', 'info-row', [el('span', 'info-label', line.label), value]);
        if (line.progress !== undefined) {
          const fill = el('div', 'progress-fill');
          fill.style.width = `${Math.round(line.progress * 100)}%`;
          row.append(el('div', 'progress', [fill]));
        }
        return row;
      });

      const actions = model.actions.map((action) => {
        const button = el('button', { class: `action ${action.id}`, type: 'button', 'data-action': action.id }, [
          el('span', 'action-label', action.label),
          el('span', 'action-detail', action.detail),
        ]);
        button.disabled = !action.enabled;
        return el('div', 'info-action', [button, action.reason ? el('div', 'action-reason', action.reason) : null]);
      });

      root.replaceChildren(
        el('div', 'info-head', [
          el('h2', `info-title ${model.level}`, model.title),
          el('button', { class: 'close', type: 'button', 'data-action': 'close', title: 'Close (Esc)' }, '×'),
        ]),
        ...rows,
        ...actions,
      );
    },
  };
}
