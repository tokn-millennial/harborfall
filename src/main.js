// Browser start-up: load the data, create the game, and wire the three layers.
//   simulation   src/sim       the rules
//   renderer     src/render    draws the state
//   UI           src/ui        mouse, keyboard and panels

import { loadData } from './platform/loadData.browser.js';
import { createLoop } from './platform/loop.js';
import { createGame, getSummary, step } from './sim/index.js';
import { centerOnTile, clampToMap, createCamera } from './render/camera.js';
import { createRenderer } from './render/renderer.js';
import { pick } from './render/pick.js';
import { createCameraControls } from './ui/cameraControls.js';

// The longest stretch of real time one frame may account for. Long enough that
// game time stays correct down to one frame a second, short enough that coming
// back to a tab that was hidden does not cause a jump.
const MAX_FRAME_SECONDS = 1;

async function start() {
  const canvas = document.getElementById('game');
  const readout = document.getElementById('readout');
  const status = document.getElementById('status');

  const data = await loadData();
  const game = createGame(data);
  const { rules, state } = game;

  // ?demo shows a finished town, built by the bot, so there is something to look at
  // before the build menu exists.
  const demo = new URLSearchParams(location.search).has('demo');
  if (demo) {
    const [{ runBot }, order] = await Promise.all([
      import('../tools/bot/bot.js'),
      fetch(new URL('../tools/bot/orders/standard.json', import.meta.url)).then((r) => r.json()),
    ]);
    runBot(game, order, { maxMinutes: 40 });
  }
  document.getElementById('demo-link').textContent = demo ? 'Show the empty island' : 'Show a demo town';
  document.getElementById('demo-link').href = demo ? './' : './?demo';

  const camera = createCamera(state.map);
  const renderer = createRenderer(canvas, rules);
  const goHome = () => {
    centerOnTile(camera, state.map.start.x + 1, state.map.start.y + 1);
    camera.zoom = 1;
  };
  const controls = createCameraControls({ canvas, camera, view: renderer.view, onHome: goHome });
  window.addEventListener('resize', () => renderer.resize());

  const loop = createLoop({ ticksPerSecond: rules.ticksPerSecond, onTick: () => step(game) });

  const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  function describe(hit) {
    if (!hit || !hit.onMap) return 'Move the mouse over the island.';
    const terrain = rules.map.terrain[state.map.terrain[hit.tile.y * state.map.width + hit.tile.x]].name;
    let text = `Tile ${hit.tile.x}, ${hit.tile.y} · ${terrain}`;
    if (state.roads[hit.tile.y * state.map.width + hit.tile.x]) text += ' · Road';
    if (hit.building) {
      const def = rules.buildings[hit.building.type];
      text += ` · ${hit.building.house ? `${rules.tiers[hit.building.house.tier].name} house` : def.name}`;
      if (hit.building.house) text += ` (${hit.building.house.residents} of ${rules.tiers[hit.building.house.tier].capacity})`;
    }
    return text;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000));
    last = now;

    controls.update(dt);
    clampToMap(camera, state.map);
    loop.advance(dt);

    const hit = controls.pointer.inside && !controls.dragging
      ? pick(game, camera, renderer.view, controls.pointer.x, controls.pointer.y)
      : null;
    renderer.draw(state, camera, {
      hoverTile: hit?.onMap ? hit.tile : null,
      hoverBuilding: hit?.building ?? null,
    });

    const s = getSummary(game);
    readout.textContent = describe(hit);
    status.textContent = `Time ${clock(s.seconds)} · Coins ${s.coins} · Farmers ${s.residents.farmer} · Workers ${s.residents.worker} · Zoom ${camera.zoom.toFixed(2)}x`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // For checking things from the browser's console.
  window.harborfall = { game, camera, renderer, loop };
}

start().catch((error) => {
  const box = document.getElementById('error');
  box.hidden = false;
  box.textContent = `Harborfall could not start.\n\n${error.message}`;
  console.error(error);
});
