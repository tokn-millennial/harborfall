// The win message. It appears once, pauses the game, and lets the player carry on.

import { el } from './dom.js';

export function createWinScreen(root, { onContinue }) {
  const title = el('h2', null, 'You win!');
  const detail = el('p');
  const stats = el('p', 'win-stats');
  const button = el('button', { class: 'action', type: 'button' }, 'Keep playing');
  button.addEventListener('click', () => {
    root.hidden = true;
    onContinue();
  });
  root.append(el('div', 'win-box', [title, detail, stats, button]));

  return {
    get visible() {
      return !root.hidden;
    },
    show({ target, tierName, time, coins, buildings }) {
      detail.textContent = `${target} ${tierName}s live on your island. It took ${time} of game time.`;
      stats.textContent = `You finished with ${coins} coins and ${buildings} buildings.`;
      root.hidden = false;
      button.focus();
    },
  };
}
