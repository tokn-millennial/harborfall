// A "monkey test": thousands of random clicks, drags, scrolls and key presses
// thrown at the real UI, to find anything that crashes it or corrupts the game.
// The actions are random but seeded, so a failure can be repeated exactly.
//
// After every action it checks that the game still makes sense: coins are not
// negative, goods are whole numbers, no house holds more than its capacity,
// every building sits exactly on the tiles it claims, and the camera is sane.
//
// Run it from the browser's console:
//   const { monkey } = await import('/tools/ui-monkey.js');
//   monkey(window.harborfall, { actions: 20000, seed: 1 });

import { createRng } from '../src/sim/rng.js';
import { getSummary } from '../src/sim/index.js';
import { MAX_ZOOM, MIN_ZOOM } from '../src/render/camera.js';

const KEYS = ['Escape', ' ', '1', '2', '3', 'c', 'w', 'a', 's', 'd', '+', '-', 'Home', 'ArrowLeft', 'ArrowUp', 'q', 'r', 'h', 'm', 'l', 'f', 'u', 'x', 'x', 'Shift'];

export function monkey({ game, camera, renderer, ui }, { actions = 5000, seed = 1 } = {}) {
  const { rules, state } = game;
  const canvas = document.getElementById('game');
  const random = createRng(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const errors = [];
  const tally = {};
  const count = (name) => { tally[name] = (tally[name] ?? 0) + 1; };

  const onError = (event) => errors.push(`uncaught: ${event.message ?? event.reason?.message ?? event.reason}`);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onError);

  const point = () => ({ x: random() * renderer.view.width, y: random() * renderer.view.height });
  const pointer = (type, p, button = 0) => {
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent(type, {
      clientX: rect.left + p.x, clientY: rect.top + p.y, button, buttons: type === 'pointerup' ? 0 : 1,
      pointerId: 1, pointerType: 'mouse', bubbles: true, cancelable: true,
    }));
  };
  const key = (name, type) => window.dispatchEvent(new KeyboardEvent(type, { key: name, code: name.length === 1 ? '' : name, bubbles: true }));

  const moves = [
    [22, 'menu button', () => pick([...document.querySelectorAll('#menu .tool')]).click()],
    [30, 'click map', () => { const p = point(); pointer('pointermove', p); pointer('pointerdown', p); pointer('pointerup', p); }],
    [6, 'right-click map', () => { const p = point(); pointer('pointerdown', p, 2); pointer('pointerup', p, 2); }],
    [12, 'drag', () => {
      const a = point();
      const b = point();
      const button = pick([0, 0, 0, 1, 2]);
      pointer('pointerdown', a, button);
      pointer('pointermove', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, button);
      pointer('pointermove', b, button);
      pointer('pointerup', b, button);
    }],
    [5, 'half a drag, then a key', () => { const a = point(); pointer('pointerdown', a); pointer('pointermove', point()); key(pick(KEYS), 'keydown'); pointer('pointerup', point()); }],
    [8, 'wheel', () => {
      const p = point();
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new WheelEvent('wheel', { clientX: rect.left + p.x, clientY: rect.top + p.y, deltaY: (random() - 0.5) * 900, bubbles: true, cancelable: true }));
    }],
    [10, 'key', () => { const k = pick(KEYS); key(k, 'keydown'); key(k, 'keyup'); }],
    [8, 'panel button', () => {
      const buttons = [...document.querySelectorAll('#info button, #win button, #help-toggle')].filter((b) => !b.disabled && b.offsetParent !== null && b.id !== 'new-game');
      if (buttons.length) pick(buttons).click();
    }],
    [25, 'time passes', () => ui.frame(random() * 0.6)],
    [2, 'pointer leaves', () => canvas.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1, bubbles: true }))],
    [1, 'window resize', () => renderer.resize()],
  ];
  const totalWeight = moves.reduce((sum, m) => sum + m[0], 0);

  function check(step, name, deep) {
    const fail = (message) => errors.push(`after action ${step} (${name}): ${message}`);
    if (!Number.isInteger(state.coinsMilli) || state.coinsMilli < 0) fail(`coins are ${state.coinsMilli}`);
    for (const [good, n] of Object.entries(state.goods)) {
      if (!Number.isInteger(n) || n < 0) fail(`${good} is ${n}`);
    }
    if (![camera.x, camera.y, camera.zoom].every(Number.isFinite)) fail(`camera is ${JSON.stringify(camera)}`);
    if (camera.zoom < MIN_ZOOM - 1e-9 || camera.zoom > MAX_ZOOM + 1e-9) fail(`zoom is ${camera.zoom}`);
    if (!deep) return;

    const summary = getSummary(game);
    if (!Number.isFinite(summary.income.net)) fail('income is not a number');
    const claimed = new Map();
    let storage = 0;
    for (const b of state.buildings) {
      const def = rules.buildings[b.type];
      storage += def.storagePerGood;
      if (b.house) {
        const capacity = rules.tiers[b.house.tier].capacity;
        if (b.house.residents < 0 || b.house.residents > capacity) fail(`house ${b.id} has ${b.house.residents} of ${capacity}`);
      }
      for (let dy = 0; dy < def.h; dy++) {
        for (let dx = 0; dx < def.w; dx++) {
          const i = (b.y + dy) * state.map.width + b.x + dx;
          if (state.occupancy[i] !== b.id) fail(`building ${b.id} does not hold its tile ${b.x + dx},${b.y + dy}`);
          if (state.roads[i]) fail(`a road is under building ${b.id}`);
          if (!rules.map.terrain[state.map.terrain[i]].buildable) fail(`building ${b.id} stands on ${state.map.terrain[i]}`);
          claimed.set(i, b.id);
        }
      }
    }
    for (let i = 0; i < state.occupancy.length; i++) {
      if (state.occupancy[i] !== 0 && claimed.get(i) !== state.occupancy[i]) fail(`tile ${i} is claimed by a building that is gone`);
      if (state.roads[i] && !rules.map.terrain[state.map.terrain[i]].buildable) fail(`a road is on ${state.map.terrain[i]}`);
    }
    if (storage !== state.storageCap) fail(`storage limit is ${state.storageCap}, buildings add up to ${storage}`);
    if (storage === 0) fail('there is no warehouse left');
    if (ui.selectedId === null && !document.getElementById('info').hidden) fail('the info panel is open with nothing selected');
  }

  const started = performance.now();
  let done = 0;
  for (; done < actions && errors.length < 10; done++) {
    let roll = random() * totalWeight;
    const move = moves.find((m) => (roll -= m[0]) < 0) ?? moves[0];
    try {
      move[2]();
      // Let the UI catch up now and then, as a real frame would.
      if (done % 3 === 0) ui.frame(0.016);
    } catch (error) {
      errors.push(`after action ${done} (${move[1]}): threw ${error.message}`);
    }
    count(move[1]);
    check(done, move[1], done % 200 === 0);
  }
  ui.frame(0.016);
  check(done, 'end', true);

  window.removeEventListener('error', onError);
  window.removeEventListener('unhandledrejection', onError);

  const summary = getSummary(game);
  return {
    seed,
    actionsDone: done,
    errors,
    seconds: +((performance.now() - started) / 1000).toFixed(1),
    gameMinutes: +(summary.seconds / 60).toFixed(1),
    buildings: state.buildings.length,
    roadTiles: state.roads.reduce((sum, r) => sum + r, 0),
    coins: summary.coins,
    residents: summary.residents,
    tally,
  };
}
