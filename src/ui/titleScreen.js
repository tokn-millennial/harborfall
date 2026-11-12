// The title screen: shows a title model and reports which button was chosen.
// A button that would replace a saved game must be pressed twice.

import { el } from './dom.js';

const CONFIRM_SECONDS = 4;

// Returns a promise for the id of the chosen button: 'continue', 'new' or 'random'.
export function showTitle(root, model, { demoHref }) {
  return new Promise((resolve) => {
    root.replaceChildren();
    let armed = null; // { button, timer }: pressed once, waiting for the second press

    const disarm = () => {
      if (!armed) return;
      clearTimeout(armed.timer);
      armed.button.classList.remove('armed');
      armed.detail.textContent = armed.text;
      armed = null;
    };

    const buttons = model.buttons.map((b) => {
      const detail = el('span', 'title-detail', b.detail);
      const button = el('button', { class: b.id === model.primary ? 'title-button primary' : 'title-button', type: 'button', 'data-choice': b.id }, [
        el('span', 'title-label', b.label),
        detail,
      ]);
      button.addEventListener('click', () => {
        if (b.confirm && armed?.button !== button) {
          disarm();
          armed = { button, detail, text: b.detail, timer: setTimeout(disarm, CONFIRM_SECONDS * 1000) };
          button.classList.add('armed');
          detail.textContent = b.confirm;
          return;
        }
        if (armed) clearTimeout(armed.timer);
        root.hidden = true;
        root.replaceChildren();
        resolve(b.id);
      });
      return button;
    });

    root.append(el('div', 'title-box', [
      el('h1', 'title-name', 'Harborfall'),
      el('p', 'title-tagline', 'Settle the island. Grow it to a town of 100 Workers.'),
      ...model.notices.map((text) => el('p', 'title-notice', text)),
      el('div', 'title-buttons', buttons),
      el('p', 'title-foot', [
        model.footnote ? el('span', null, `${model.footnote} `) : null,
        el('a', { href: demoHref }, 'Watch a finished town'),
      ]),
    ]));
    root.hidden = false;
    buttons[0].focus();
  });
}
