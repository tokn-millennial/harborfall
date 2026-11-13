// Browser start-up: load the data, decide which game to play, and wire the three layers.
//   simulation   src/sim       the rules
//   renderer     src/render    draws the state
//   UI           src/ui        mouse, keyboard and panels
//
// The page opens in one of three ways:
//   (nothing)   the title screen: continue the saved game, or start a new one
//   ?demo       a finished town built by the bot, to look at
//   ?fresh      straight into a new game on the standard island, for the test tools
// Only the first one saves. The other two never touch the saved game.

import { loadData } from './platform/loadData.browser.js';
import { createLoop } from './platform/loop.js';
import { createSaveStore } from './platform/saveStore.js';
import { createAudio } from './platform/audio.js';
import { createSoundSettings } from './platform/soundSettings.js';
import { DEFAULT_VOLUME, SEA, SEA_SHARE, SOUNDS } from './audio/sounds.js';
import { createSoundControls } from './ui/soundControls.js';
import { createGuidePanel } from './ui/guidePanel.js';
import { guideProblems } from './ui/guide.js';
import { createFlag } from './platform/flagStore.js';
import { createGame, loadGame, saveGame, step } from './sim/index.js';
import { createCamera, MAX_ZOOM, MIN_ZOOM } from './render/camera.js';
import { createRenderer } from './render/renderer.js';
import { createGameUi } from './ui/gameUi.js';
import { clock } from './ui/text.js';
import { titleModel } from './ui/titleModel.js';
import { showTitle } from './ui/titleScreen.js';

// The longest stretch of real time one frame may account for. Long enough that
// game time stays correct down to one frame a second, short enough that coming
// back to a tab that was hidden does not cause a jump.
const MAX_FRAME_SECONDS = 1;
// The game also saves when the page is hidden or closed. This is for a crash.
const AUTOSAVE_SECONDS = 10;
const LARGEST_RANDOM_SEED = 999999;
// On the title screen the view sits this far to the right of the start site,
// in world pixels, so the town shows beside the title box and not behind it.
const TITLE_VIEW_SHIFT = 330;

const byId = (id) => document.getElementById(id);

// The page's own storage, or null if the browser will not allow it.
function browserStorage() {
  try {
    const storage = window.localStorage;
    storage.setItem('harborfall.check', '1');
    storage.removeItem('harborfall.check');
    return storage;
  } catch {
    return null;
  }
}

// Shows the title screen over the island. Returns the game to play, and for a
// continued game where the player was looking when it was saved.
async function chooseGame({ data, standard, store, renderer, audio }) {
  const found = store.read();
  const saved = found.found ? loadGame(data, found.save) : null;
  if (saved && !saved.ok) console.warn(`The saved game was not loaded: ${saved.reason}. ${saved.detail}`);

  // Behind the title: the saved town if there is one, otherwise the empty island.
  const preview = saved?.ok ? saved.game : standard;
  const camera = createCamera(preview.state.map);
  camera.x += TITLE_VIEW_SHIFT;
  let showing = true;
  const paint = () => {
    if (!showing) return;
    renderer.draw(preview, camera, {});
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);

  document.body.classList.add('title-open');
  const { choice, difficulty } = await showTitle(byId('title'), titleModel({ saved, canSave: store.working, rules: standard.rules }), { demoHref: './?demo' });
  document.body.classList.remove('title-open');
  showing = false;
  audio.play('pick');

  if (choice === 'continue') return { game: preview, view: found.view };
  if (choice === 'new') return { game: difficulty === standard.rules.difficulty ? standard : createGame(data, { difficulty }), view: null };
  let seed = data.map.seed;
  while (seed === data.map.seed) seed = 1 + Math.floor(Math.random() * LARGEST_RANDOM_SEED);
  return { game: createGame(data, { seed, difficulty }), view: null };
}

async function start() {
  const canvas = byId('game');
  const params = new URLSearchParams(location.search);
  const demo = params.has('demo');
  const fresh = params.has('fresh');
  const titled = !demo && !fresh;

  const data = await loadData();
  const standard = createGame(data);
  const renderer = createRenderer(canvas, standard.rules);
  window.addEventListener('resize', () => renderer.resize());
  byId('loading').hidden = true;

  // Sound. A browser allows none until the player has clicked or pressed a key,
  // so it is switched on at the first of either. The test page stays silent.
  const audio = createAudio({
    Context: window.AudioContext ?? window.webkitAudioContext ?? null,
    sounds: SOUNDS, sea: SEA, seaShare: SEA_SHARE,
    settings: createSoundSettings(browserStorage(), DEFAULT_VOLUME),
    silent: fresh,
  });
  window.addEventListener('pointerdown', () => audio.unlock(), true);
  window.addEventListener('keydown', () => audio.unlock(), true);
  document.addEventListener('visibilitychange', () => audio.setHidden(document.visibilityState === 'hidden'));
  createSoundControls({ button: byId('sound-toggle'), slider: byId('sound-volume'), readout: byId('sound-readout'), audio });
  if (fresh) byId('sound-toggle').title = 'The test page is silent';

  // Only a game begun from the title screen is saved.
  const store = createSaveStore(titled ? browserStorage() : null);

  let game = standard;
  let savedView = null;
  if (demo) {
    byId('loading').hidden = false;
    const [{ runBot }, order] = await Promise.all([
      import('../tools/bot/bot.js'),
      fetch(new URL('../tools/bot/orders/standard.json', import.meta.url)).then((r) => r.json()),
    ]);
    runBot(game, order, { maxMinutes: 40 });
    byId('loading').hidden = true;
  } else if (titled) {
    ({ game, view: savedView } = await chooseGame({ data, standard, store, renderer, audio }));
  }

  const camera = createCamera(game.state.map);
  if (savedView) {
    // The UI keeps the view on the island, so a strange saved position is harmless.
    camera.x = savedView.x;
    camera.y = savedView.y;
    camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, savedView.zoom));
  }
  const loop = createLoop({ ticksPerSecond: game.rules.ticksPerSecond, onTick: () => step(game) });
  const ui = createGameUi({
    game, camera, renderer, loop, canvas,
    onSound: (name) => audio.play(name),
    elements: {
      hud: byId('hud-main'), speed: byId('hud-speed'), menu: byId('menu'), hint: byId('hint'),
      info: byId('info'), win: byId('win'), tip: byId('tip'), message: byId('message'),
    },
  });

  // ---- saving ---------------------------------------------------------------
  const saveNote = byId('save-note');
  const saveNow = () => {
    if (!titled) return false;
    const ok = store.write(saveGame(game), Date.now(), { x: camera.x, y: camera.y, zoom: camera.zoom });
    saveNote.textContent = ok
      ? `Saved in this browser at ${clock(game.state.tick / game.rules.ticksPerSecond)} of game time.`
      : 'This browser is not letting the game save. This game will be lost when you close or refresh the page.';
    saveNote.classList.toggle('warn', !ok);
    return ok;
  };
  if (titled) {
    saveNow(); // a new game takes over the save slot at once
    setInterval(saveNow, AUTOSAVE_SECONDS * 1000);
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveNow();
    });
  } else {
    saveNote.textContent = demo ? 'The demo town is not saved.' : 'This test page does not save.';
  }

  // ---- the ? panel ------------------------------------------------------------
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
  const islandSeed = game.state.map.seed;
  const level = game.rules.difficulties.length > 1 ? game.rules.difficulties.find((d) => d.id === game.rules.difficulty) : null;
  byId('island-note').textContent = (islandSeed === standard.state.map.seed ? `Island ${islandSeed}, the standard island.` : `Island ${islandSeed}.`) + (level ? ` ${level.name}.` : '');
  const toTitle = byId('to-title');
  toTitle.textContent = titled ? 'Save and go to the title screen' : 'Go to the title screen';
  toTitle.addEventListener('click', () => {
    saveNow();
    location.href = './';
  });
  byId('demo-link').hidden = demo;

  // The first-game guide. Not on the demo town or the test page. A guide with a
  // mistake in it is left out, with the reason in the console, and the game goes on.
  let guide = null;
  if (titled) {
    const problems = guideProblems(game.rules, data.guide);
    if (problems.length) console.warn(`The guide is not shown:\n- ${problems.join('\n- ')}`);
    else {
      guide = createGuidePanel({
        root: byId('guide'), toggle: byId('guide-toggle'), game, guide: data.guide,
        hidden: createFlag(browserStorage(), 'harborfall.guideHidden'),
      });
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000));
    last = now;
    ui.frame(dt);
    guide?.frame(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // For checking things from the browser's console.
  window.harborfall = { game, camera, renderer, loop, ui, audio, save: { now: saveNow, store } };
}

start().catch((error) => {
  const box = document.getElementById('error');
  box.hidden = false;
  box.textContent = `Harborfall could not start.\n\n${error.message}`;
  document.getElementById('loading').hidden = true;
  console.error(error);
});
