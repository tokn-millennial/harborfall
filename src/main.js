// Browser start-up: load the data, create the game, and wire the three layers.
//   simulation   src/sim       the rules
//   renderer     src/render    draws the state
//   UI           src/ui        mouse, keyboard and panels

import { loadData } from './platform/loadData.browser.js';
import { createLoop } from './platform/loop.js';
import { createGame, step } from './sim/index.js';
import { createCamera } from './render/camera.js';
import { createRenderer } from './render/renderer.js';
import { createGameUi } from './ui/gameUi.js';

// The longest stretch of real time one frame may account for. Long enough that
// game time stays correct down to one frame a second, short enough that coming
// back to a tab that was hidden does not cause a jump.
const MAX_FRAME_SECONDS = 1;

async function start() {
  const byId = (id) => document.getElementById(id);
  const canvas = byId('game');

  const data = await loadData();
  const game = createGame(data);

  // ?demo shows a finished town, built by the bot.
  const demo = new URLSearchParams(location.search).has('demo');
  if (demo) {
    const [{ runBot }, order] = await Promise.all([
      import('../tools/bot/bot.js'),
      fetch(new URL('../tools/bot/orders/standard.json', import.meta.url)).then((r) => r.json()),
    ]);
    runBot(game, order, { maxMinutes: 40 });
  }
  byId('demo-link').textContent = demo ? 'Start a new game' : 'Show a demo town built by the bot';
  byId('demo-link').href = demo ? './' : './?demo';

  const camera = createCamera(game.state.map);
  const renderer = createRenderer(canvas, game.rules);
  const loop = createLoop({ ticksPerSecond: game.rules.ticksPerSecond, onTick: () => step(game) });
  const ui = createGameUi({
    game, camera, renderer, loop, canvas,
    elements: {
      hud: byId('hud-main'), speed: byId('hud-speed'), menu: byId('menu'), hint: byId('hint'),
      info: byId('info'), win: byId('win'), tip: byId('tip'), message: byId('message'),
    },
  });
  window.addEventListener('resize', () => renderer.resize());

  byId('help-toggle').addEventListener('click', () => { byId('help').hidden = !byId('help').hidden; });
  // A key to the ground colors, straight from map.json.
  byId('legend').append('Ground: ');
  for (const terrain of Object.values(game.rules.map.terrain)) {
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = terrain.color;
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.append(swatch, ` ${terrain.name}`);
    byId('legend').append(item);
  }
  byId('loading').hidden = true;

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000));
    last = now;
    ui.frame(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // For checking things from the browser's console.
  window.harborfall = { game, camera, renderer, loop, ui };
}

start().catch((error) => {
  const box = document.getElementById('error');
  box.hidden = false;
  box.textContent = `Harborfall could not start.\n\n${error.message}`;
  document.getElementById('loading').hidden = true;
  console.error(error);
});
