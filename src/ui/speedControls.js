// Pause and speed buttons. Space pauses and resumes. Keys 1, 2, 3 pick a speed.

import { el } from './dom.js';

export function createSpeedControls(root, loop, speeds) {
  let resumeSpeed = speeds[0] ?? 1;
  const buttons = [];

  const setSpeed = (value) => {
    if (value > 0) resumeSpeed = value;
    loop.setSpeed(value);
    refresh();
  };
  const togglePause = () => setSpeed(loop.speed === 0 ? resumeSpeed : 0);

  const pause = el('button', { class: 'speed', type: 'button', title: 'Pause or resume (Space)' }, 'Pause');
  pause.addEventListener('click', togglePause);
  root.append(pause);
  speeds.forEach((value, index) => {
    const button = el('button', { class: 'speed', type: 'button', title: `Speed ${value}x (key ${index + 1})` }, `${value}x`);
    button.addEventListener('click', () => setSpeed(value));
    buttons.push({ value, button });
    root.append(button);
  });

  function refresh() {
    pause.classList.toggle('active', loop.speed === 0);
    pause.textContent = loop.speed === 0 ? 'Paused' : 'Pause';
    for (const { value, button } of buttons) button.classList.toggle('active', loop.speed === value);
  }

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Space' || event.key === ' ') {
      togglePause();
      event.preventDefault();
    } else {
      const index = ['1', '2', '3', '4', '5'].indexOf(event.key);
      if (index !== -1 && index < speeds.length) setSpeed(speeds[index]);
    }
  });

  refresh();
  return { setSpeed, togglePause, refresh };
}
