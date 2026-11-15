// The title screen: shows a title model and reports which button was chosen.
// A button that would replace a saved game must be pressed twice.

import { el } from './dom.js';
import { islandNumberFrom } from './titleModel.js';

const CONFIRM_SECONDS = 4;

// Returns a promise for { choice, difficulty, scenario, seed }: the id of the
// chosen button ('continue', 'new', 'random', 'scenario' or 'island'), the
// difficulty picked for a new game, for a scenario its id, and for an island
// chosen by number that number.
export function showTitle(root, model, { demoHref }) {
  return new Promise((resolve) => {
    root.replaceChildren();
    let armed = null; // { button, timer }: pressed once, waiting for the second press
    let difficulty = model.difficulty;

    // The difficulty for a new game: a row of small buttons, one lit.
    const about = el('p', 'title-about');
    const levels = model.difficulties.map((d) => {
      const button = el('button', { class: 'title-level', type: 'button', 'data-difficulty': d.id, title: d.about }, d.name);
      button.addEventListener('click', () => {
        difficulty = d.id;
        showLevel();
      });
      return { ...d, button };
    });
    function showLevel() {
      for (const level of levels) level.button.classList.toggle('active', level.id === difficulty);
      about.textContent = levels.find((level) => level.id === difficulty)?.about ?? '';
      // New game says the best time on the standard island at this difficulty.
      if (standardDetail && !armed) standardDetail.textContent = standardText();
    }
    let standardDetail = null;
    const standardText = () => {
      const base = model.buttons.find((b) => b.id === 'new')?.detail ?? '';
      const best = model.standardBest?.[difficulty ?? 'normal'] ?? null;
      return best ? `${base}. ${best}` : base;
    };

    const disarm = () => {
      if (!armed) return;
      clearTimeout(armed.timer);
      armed.button.classList.remove('armed');
      armed.detail.textContent = armed.text;
      armed = null;
    };

    // A press on a button: the first press arms it if it would replace a saved
    // game, and the second (or the only) one makes the choice.
    const press = (button, detail, text, confirm, result) => {
      if (confirm && armed?.button !== button) {
        disarm();
        armed = { button, detail, text, timer: setTimeout(disarm, CONFIRM_SECONDS * 1000) };
        button.classList.add('armed');
        detail.textContent = confirm;
        return;
      }
      if (armed) clearTimeout(armed.timer);
      root.hidden = true;
      root.replaceChildren();
      resolve(result());
    };

    const buttons = model.buttons.map((b) => {
      const detail = el('span', 'title-detail', b.id === 'new' ? standardText() : b.detail);
      if (b.id === 'new') standardDetail = detail;
      const button = el('button', { class: b.id === model.primary ? 'title-button primary' : 'title-button', type: 'button', 'data-choice': b.id }, [
        el('span', 'title-label', b.label),
        detail,
      ]);
      button.addEventListener('click', () => press(button, detail, b.id === 'new' ? standardText() : b.detail, b.confirm, () => ({ choice: b.id, difficulty, scenario: null, seed: null })));
      return button;
    });
    showLevel();

    // An island by its number: a box and a button. A number out of range is said so.
    let islandRow = null;
    if (model.island) {
      const { min, max, confirm } = model.island;
      const input = el('input', { class: 'title-island-number', type: 'text', inputmode: 'numeric', maxlength: String(String(max).length), placeholder: `${min} to ${max}`, 'aria-label': 'Island number' });
      const note = el('span', 'title-detail title-island-note', '');
      const go = el('button', { class: 'title-level', type: 'button', 'data-choice': 'island' }, 'Play');
      const choose = () => {
        const seed = islandNumberFrom(input.value);
        if (seed === null) {
          note.textContent = `Type a whole number from ${min} to ${max}.`;
          return;
        }
        press(go, note, '', confirm, () => ({ choice: 'island', difficulty, scenario: null, seed }));
      };
      go.addEventListener('click', choose);
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') choose(); });
      islandRow = el('div', 'title-island', [el('span', 'title-levels-label', 'Or island number'), input, go, note]);
    }

    // Scenarios: smaller buttons under the rest, each with its goal and the best time so far.
    const scenarios = (model.scenarios ?? []).map((s) => {
      const text = `${s.goal} ${s.best ?? s.medals}`;
      const detail = el('span', 'title-detail', text);
      const button = el('button', { class: 'title-button title-scenario', type: 'button', 'data-scenario': s.id, title: `${s.about} ${s.medals}` }, [
        el('span', 'title-label', s.name),
        detail,
      ]);
      button.addEventListener('click', () => press(button, detail, text, s.confirm, () => ({ choice: 'scenario', difficulty, scenario: s.id, seed: null })));
      return button;
    });

    root.append(el('div', 'title-box', [
      el('h1', 'title-name', 'Harborfall'),
      el('p', 'title-tagline', 'Settle the island. Grow it to a town of 100 Workers.'),
      ...model.notices.map((text) => el('p', 'title-notice', text)),
      el('div', 'title-buttons', buttons),
      levels.length ? el('div', 'title-levels', [el('span', 'title-levels-label', 'A new game is'), ...levels.map((level) => level.button)]) : null,
      levels.length ? about : null,
      islandRow,
      scenarios.length ? el('p', 'title-heading', 'Or try a scenario') : null,
      scenarios.length ? el('div', 'title-buttons title-scenarios', scenarios) : null,
      el('p', 'title-foot', [
        model.footnote ? el('span', null, `${model.footnote} `) : null,
        el('a', { href: demoHref }, 'Watch a finished town'),
      ]),
    ]));
    root.hidden = false;
    buttons[0].focus();
  });
}
