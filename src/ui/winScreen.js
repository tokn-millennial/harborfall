// The screen for a goal reached: the win, and each goal after it. It appears
// once per goal, pauses the game, and lets the player carry on.

import { el } from './dom.js';

export function createWinScreen(root, { onContinue }) {
  const title = el('h2', null, 'You win!');
  const detail = el('p');
  const stats = el('p', 'win-stats');
  const next = el('p', 'win-next');
  const button = el('button', { class: 'action', type: 'button' }, 'Keep playing');
  button.addEventListener('click', () => {
    root.hidden = true;
    onContinue();
  });
  root.append(el('div', 'win-box', [title, detail, stats, next, button]));

  return {
    get visible() {
      return !root.hidden;
    },
    // message: { title, detail, stats, next } (see winMessage in text.js)
    show(message) {
      title.textContent = message.title;
      detail.textContent = message.detail;
      stats.textContent = message.stats;
      next.textContent = message.next ?? '';
      next.hidden = !message.next;
      root.hidden = false;
      button.focus();
    },
  };
}
