// The guide's small panel: the step you are on, why it matters, and how far
// along you are. It can be opened out to show every step, or hidden.

import { el } from './dom.js';
import { createGuideTracker } from './guide.js';

const CHECK_EVERY_SECONDS = 0.25; // the steps are looked at four times a second, not every frame

// options:
//   root     the panel's element
//   toggle   a button elsewhere (the ? panel) that hides and shows the guide
//   hidden   { get(), set(bool) } remembers whether the player hid it
export function createGuidePanel({ root, toggle, game, guide, hidden }) {
  const tracker = createGuideTracker(game, guide);
  // A game picked up after every step was done (a won game) has no use for the guide.
  const finishedAtStart = tracker.update().finished;
  let shown = null; // which steps were ticked when the panel was last drawn
  let showAll = false;
  let wait = 0;

  const count = el('span', 'guide-count');
  const text = el('p', 'guide-text');
  const why = el('p', 'guide-why');
  const list = el('ol', 'guide-list');
  const all = el('button', { class: 'guide-link', type: 'button' }, 'All steps');
  const hide = el('button', { class: 'close', type: 'button', title: 'Hide the guide. The ? panel brings it back.', 'aria-label': 'Hide the guide' }, '×');
  root.append(el('div', 'guide-head', [el('span', 'guide-title', 'First steps'), count, hide]), text, why, list, all);

  function render(model) {
    count.textContent = `${Math.min(model.at + 1, model.total)} of ${model.total}`;
    if (model.finished) {
      count.textContent = 'Done';
      text.textContent = 'That is every step. The island is yours.';
      why.textContent = '';
    } else {
      text.textContent = model.current.text;
      why.textContent = model.current.why;
    }
    list.replaceChildren(...model.steps.map((step, i) => el('li', step.done ? 'done' : i === model.at ? 'now' : null, step.text)));
    list.hidden = !showAll;
    all.textContent = showAll ? 'Fewer' : 'All steps';
  }

  function show() {
    const model = tracker.update();
    const visible = model.total > 0 && !finishedAtStart && !hidden.get();
    root.hidden = !visible;
    toggle.hidden = model.total === 0 || finishedAtStart;
    toggle.textContent = hidden.get() ? 'Show the guide' : 'Hide the guide';
    const ticks = model.steps.map((step) => (step.done ? 'x' : '.')).join('');
    if (visible && ticks !== shown) {
      shown = ticks;
      render(model);
    }
    return model;
  }

  all.addEventListener('click', () => {
    showAll = !showAll;
    shown = null;
    show();
  });
  hide.addEventListener('click', () => {
    hidden.set(true);
    show();
  });
  toggle.addEventListener('click', () => {
    hidden.set(!hidden.get());
    shown = null;
    show();
  });

  show();
  return {
    // Call once a frame with the seconds since the last one.
    frame(dt) {
      wait -= dt;
      if (wait > 0) return;
      wait = CHECK_EVERY_SECONDS;
      show();
    },
  };
}
