// The save slot (with a stand-in for the browser's storage) and what the title screen offers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { createSaveStore, SAVE_KEY } from '../src/platform/saveStore.js';
import { createGame, loadGame, saveGame } from '../src/sim/index.js';
import { savedGameLine, titleModel } from '../src/ui/titleModel.js';
import { runBot } from '../tools/bot/bot.js';
import { loadOrder } from '../tools/tune.mjs';
import { snapshot } from './helpers.js';

// A stand-in for the browser's storage. `broken` makes every call fail, as a
// blocked or full storage does.
function fakeStorage({ broken = false } = {}) {
  const items = new Map();
  const guard = () => { if (storage.broken) throw new Error('storage is blocked'); };
  const storage = {
    broken,
    items,
    getItem(key) { guard(); return items.has(key) ? items.get(key) : null; },
    setItem(key, text) { guard(); items.set(key, String(text)); },
    removeItem(key) { guard(); items.delete(key); },
  };
  return storage;
}

function playedGame(minutes = 10) {
  const game = createGame(loadData());
  runBot(game, loadOrder('standard'), { maxMinutes: minutes });
  return game;
}

// ---- the save slot -------------------------------------------------------------

test('the slot also remembers where the player was looking, and ignores nonsense', () => {
  const storage = fakeStorage();
  const store = createSaveStore(storage);
  const save = saveGame(createGame(loadData()));
  store.write(save, 5, { x: 120.5, y: -40, zoom: 1.6 });
  assert.deepEqual(store.read().view, { x: 120.5, y: -40, zoom: 1.6 });
  store.write(save, 5);
  assert.equal(store.read().view, null);
  for (const bad of [{ x: 'left', y: 0, zoom: 1 }, { x: 1, y: 2 }, { x: 1, y: 2, zoom: 0 }, { x: null, y: 2, zoom: 1 }, 'somewhere', 7]) {
    storage.items.set(SAVE_KEY, JSON.stringify({ savedAt: 1, view: bad, save }));
    const found = store.read();
    assert.equal(found.view, null, JSON.stringify(bad));
    assert.equal(loadGame(loadData(), found.save).ok, true, 'a bad view must not cost the player the game');
  }
});

test('an empty slot reads as nothing found', () => {
  const store = createSaveStore(fakeStorage());
  assert.deepEqual(store.read(), { found: false });
  assert.equal(store.working, true);
});

test('a game written to the slot comes back and loads as the same game', () => {
  const storage = fakeStorage();
  const game = playedGame();
  assert.equal(createSaveStore(storage).write(saveGame(game), 1234567), true);
  assert.equal(typeof storage.items.get(SAVE_KEY), 'string', 'what is stored is text');

  // A later visit: a new store over the same storage.
  const found = createSaveStore(storage).read();
  assert.equal(found.found, true);
  assert.equal(found.savedAt, 1234567);
  const loaded = loadGame(loadData(), found.save);
  assert.equal(loaded.ok, true);
  assert.equal(snapshot(loaded.game), snapshot(game));
});

test('a second write replaces the first, and clear empties the slot', () => {
  const store = createSaveStore(fakeStorage());
  store.write(saveGame(createGame(loadData())), 1);
  const later = playedGame(5);
  store.write(saveGame(later), 2);
  assert.equal(store.read().save.state.tick, later.state.tick);
  store.clear();
  assert.deepEqual(store.read(), { found: false });
});

test('text in the slot that is not a save is found but unreadable, and is then refused', () => {
  for (const text of ['not json at all', '42', 'null', '{"something":"else"}', '']) {
    const storage = fakeStorage();
    storage.items.set(SAVE_KEY, text);
    const found = createSaveStore(storage).read();
    assert.equal(found.found, true, `for ${JSON.stringify(text)}`);
    assert.equal(found.save, null);
    assert.equal(loadGame(loadData(), found.save).reason, 'not_a_save');
  }
});

test('with no storage at all, nothing is saved and nothing fails', () => {
  const store = createSaveStore(null);
  assert.equal(store.working, false);
  assert.equal(store.write(saveGame(createGame(loadData())), 1), false);
  assert.deepEqual(store.read(), { found: false });
  store.clear();
});

test('a storage that fails never stops the game, and is reported as not working', () => {
  const storage = fakeStorage();
  const store = createSaveStore(storage);
  assert.equal(store.write(saveGame(createGame(loadData())), 1), true);
  storage.broken = true;
  assert.equal(store.write(saveGame(createGame(loadData())), 2), false);
  assert.equal(store.working, false);
  assert.deepEqual(store.read(), { found: false });
  store.clear();
  // If the storage recovers, so does saving.
  storage.broken = false;
  assert.equal(store.write(saveGame(createGame(loadData())), 3), true);
  assert.equal(store.working, true);
});

test('two slots with different names do not see each other', () => {
  const storage = fakeStorage();
  createSaveStore(storage, 'one').write(saveGame(createGame(loadData())), 1);
  assert.deepEqual(createSaveStore(storage, 'two').read(), { found: false });
});

// ---- the title screen ----------------------------------------------------------

const ids = (model) => model.buttons.map((b) => b.id);

test('with no saved game the title offers two new games and nothing to confirm', () => {
  const model = titleModel({ saved: null, canSave: true });
  assert.deepEqual(ids(model), ['new', 'random']);
  assert.equal(model.primary, 'new');
  assert.deepEqual(model.notices, []);
  assert.ok(model.buttons.every((b) => b.confirm === null));
  assert.match(model.footnote, /saves itself/);
});

test('with a saved game, Continue comes first and a new game must be confirmed', () => {
  const game = playedGame(12);
  const model = titleModel({ saved: { ok: true, game }, canSave: true });
  assert.deepEqual(ids(model), ['continue', 'new', 'random']);
  assert.equal(model.primary, 'continue');
  assert.equal(model.buttons[0].confirm, null);
  assert.match(model.buttons[1].confirm, /replaces your saved game/);
  assert.match(model.buttons[2].confirm, /replaces your saved game/);
  assert.equal(model.buttons[0].detail, savedGameLine(game));
});

test('the Continue line gives the time played, progress to the goal, and coins', () => {
  const game = playedGame(12);
  const line = savedGameLine(game);
  assert.match(line, /^12:00 played, \d+ of 100 Workers, \d+ coins$/);
  const workers = game.state.buildings.reduce((n, b) => n + (b.house?.tier === 'worker' ? b.house.residents : 0), 0);
  assert.ok(line.includes(`${workers} of 100 Workers`));
  assert.ok(line.includes(`${Math.floor(game.state.coinsMilli / 1000)} coins`));
});

test('the Continue line for a won game says so', () => {
  const game = createGame(loadData());
  assert.equal(runBot(game, loadOrder('standard')).won, true);
  assert.match(savedGameLine(game), /played, won with \d+ Workers, \d+ coins$/);
});

test('a saved game that cannot be used is explained, cannot be continued, and is still protected', () => {
  for (const reason of ['rules_changed', 'newer_version', 'damaged', 'not_a_save']) {
    const model = titleModel({ saved: { ok: false, reason }, canSave: true });
    assert.deepEqual(ids(model), ['new', 'random'], reason);
    assert.equal(model.notices.length, 1, reason);
    assert.ok(model.notices[0].length > 30, reason);
    assert.ok(model.buttons.every((b) => b.confirm !== null), `${reason}: a new game would replace it without asking`);
  }
  const changed = titleModel({ saved: { ok: false, reason: 'rules_changed' }, canSave: true });
  assert.match(changed.notices[0], /data file/);
  // A reason nobody has written a sentence for still gets one.
  assert.equal(titleModel({ saved: { ok: false, reason: 'something_new' }, canSave: true }).notices.length, 1);
});

test('a browser that will not save is said plainly', () => {
  const model = titleModel({ saved: null, canSave: false });
  assert.equal(model.notices.length, 1);
  assert.match(model.notices[0], /not letting the game save/);
  assert.equal(model.footnote, null);
  assert.deepEqual(ids(model), ['new', 'random']);
});
