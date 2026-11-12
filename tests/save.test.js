// Saving and loading. The promise: a game that is saved, turned into text,
// read back and played on ends up exactly where it would have without saving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { createGame, execute, loadGame, saveGame, step, SAVE_FORMAT } from '../src/sim/index.js';
import { rulesStamp, withSeed } from '../src/sim/rules.js';
import { runBot } from '../tools/bot/bot.js';
import { loadOrder } from '../tools/tune.mjs';
import { mapFromRows, run, snapshot, testGame, TEST_ISLAND } from './helpers.js';
import { playMiniCity } from './scenario.js';

// A save as it would come back from storage: through text and out again.
const throughText = (save) => JSON.parse(JSON.stringify(save));

function reload(game, data = loadData()) {
  const result = loadGame(data, throughText(saveGame(game)));
  assert.equal(result.ok, true, `a good save was refused: ${result.reason} (${result.detail})`);
  return result.game;
}

// A real game on the shipped island, stopped part-way through.
function botGame(minutes, seed) {
  const game = createGame(loadData(), seed === undefined ? {} : { seed });
  runBot(game, loadOrder('standard'), { maxMinutes: minutes });
  return game;
}

test('a new game saves and loads to exactly the same state', () => {
  const game = createGame(loadData());
  const loaded = reload(game);
  assert.deepEqual(loaded.state, game.state);
  assert.equal(snapshot(loaded), snapshot(game));
  assert.deepEqual(loaded.rules, game.rules);
});

test('the state survives being turned into text with nothing lost', () => {
  const game = botGame(12);
  // deepStrictEqual would notice a value that text cannot carry, such as "undefined".
  assert.deepStrictEqual(JSON.parse(JSON.stringify(game.state)), game.state);
});

test('a save is plain text of a sensible size', () => {
  const text = JSON.stringify(saveGame(botGame(25)));
  assert.ok(text.length > 1000);
  assert.ok(text.length < 400000, `a save is ${text.length} characters, which is large for browser storage`);
});

for (const minutes of [3, 10, 20]) {
  test(`a real game saved at ${minutes} minutes plays on exactly as if it had never been saved`, () => {
    const original = botGame(minutes);
    const loaded = reload(original);
    assert.equal(snapshot(loaded), snapshot(original));
    run(original, 6000);
    run(loaded, 6000);
    assert.equal(snapshot(loaded), snapshot(original));
  });
}

test('a won game saves and loads, and stays won', () => {
  const game = createGame(loadData());
  const result = runBot(game, loadOrder('standard'));
  assert.equal(result.won, true);
  const loaded = reload(game);
  assert.equal(loaded.state.won, true);
  assert.equal(loaded.state.wonAtTick, game.state.wonAtTick);
  run(game, 1200);
  run(loaded, 1200);
  assert.equal(snapshot(loaded), snapshot(game));
});

test('commands work the same on a loaded game', () => {
  const original = botGame(8);
  const loaded = reload(original);
  for (const game of [original, loaded]) {
    game.state.coinsMilli += 500000;
    const house = game.state.buildings.find((b) => b.house);
    assert.equal(execute(game, { action: 'demolish', x: house.x, y: house.y }).ok, true);
    run(game, 900);
  }
  assert.equal(snapshot(loaded), snapshot(original));
});

test('every moment of the scripted mini-city can be saved and loaded', () => {
  const data = loadData();
  const game = createGame(data, { map: mapFromRows(TEST_ISLAND) });
  let checked = 0;
  playMiniCity(game, () => {
    if (game.state.tick % 97 !== 0) return;
    const result = loadGame(data, throughText(saveGame(game)));
    assert.equal(result.ok, true, `refused at tick ${game.state.tick}: ${result.reason} (${result.detail})`);
    assert.equal(snapshot(result.game), snapshot(game));
    checked++;
  });
  assert.ok(checked > 20, `only ${checked} moments were checked`);
});

test('saving never changes the game, and a save shares nothing with it', () => {
  const game = botGame(6);
  const before = snapshot(game);
  const save = saveGame(game);
  assert.equal(snapshot(game), before);
  save.state.coinsMilli = 1;
  save.state.buildings.length = 0;
  save.state.map.terrain[0] = 'grass';
  assert.equal(snapshot(game), before);

  const fresh = saveGame(game);
  const loaded = loadGame(loadData(), fresh).game;
  loaded.state.goods.wood = 77;
  assert.notEqual(fresh.state.goods.wood, 77, 'the loaded game is still tied to the save it came from');
});

test('a save carries its format number and the stamp of the rules', () => {
  const game = createGame(loadData());
  const save = saveGame(game);
  assert.equal(save.format, SAVE_FORMAT);
  assert.equal(save.rulesStamp, game.rules.stamp);
  assert.equal(save.rulesStamp, rulesStamp(loadData()));
  assert.match(save.rulesStamp, /^[0-9a-f]{16}$/);
});

// ---- other islands -------------------------------------------------------------

test('asking for another seed gives another island, and leaves the data alone', () => {
  const data = loadData();
  const standard = createGame(data);
  const other = createGame(data, { seed: 42 });
  assert.equal(data.map.seed, 1407);
  assert.notDeepEqual(other.state.map.terrain, standard.state.map.terrain);
  assert.equal(other.rules.map.seed, 42);
  // The same as changing the seed in map.json.
  assert.equal(snapshot(other), snapshot(createGame(withSeed(loadData(), 42))));
  // The rules are otherwise the same, so the stamp is too.
  assert.equal(other.rules.stamp, standard.rules.stamp);
});

test('a game on another island loads back onto that island', () => {
  const original = botGame(10, 4242);
  const loaded = reload(original); // the data files still name the standard island
  assert.equal(loaded.rules.map.seed, 4242);
  assert.deepEqual(loaded.state.map, original.state.map);
  run(original, 3000);
  run(loaded, 3000);
  assert.equal(snapshot(loaded), snapshot(original));
});

// ---- refusing what should be refused -------------------------------------------

test('things that are not saves are refused, without an error', () => {
  const data = loadData();
  for (const junk of [null, undefined, 7, 'hello', [], {}, { app: 'other', format: 1 }, { app: 'harborfall' }, { app: 'harborfall', format: 'one' }, { app: 'harborfall', format: 0 }]) {
    const result = loadGame(data, junk);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not_a_save', `for ${JSON.stringify(junk)}`);
  }
});

test('a save from a newer version of the game is refused', () => {
  const save = saveGame(createGame(loadData()));
  save.format = SAVE_FORMAT + 1;
  assert.equal(loadGame(loadData(), save).reason, 'newer_version');
});

test('a save is refused once a rule in the data files has changed', () => {
  const save = throughText(saveGame(botGame(5)));
  const changes = [
    (d) => { d.buildings.house.cost.coins = 12; },
    (d) => { d.population.tiers.farmer.capacity = 3; },
    (d) => { d.config.economy.baseIncomePerMinute = 25; },
    (d) => { d.buildings.lumberjack.production.cycleSeconds = 4; },
    (d) => { d.map.terrain.forest.buildable = true; },
    (d) => { d.goods.stone = { name: 'Stone', color: '#888888' }; },
  ];
  for (const change of changes) {
    const data = loadData();
    change(data);
    assert.equal(loadGame(data, save).reason, 'rules_changed', String(change));
  }
});

test('a save still loads after changes that only affect looks, names, notes or the standard island', () => {
  const original = botGame(5);
  const save = throughText(saveGame(original));
  const data = loadData();
  data.buildings.house.visual.color = '#123456';
  data.buildings.house.name = 'Hut';
  data.buildings.sawmill.key = 'Z';
  data.goods.fish.color = '#abcdef';
  data.map.terrain.grass.color = '#00ff00';
  data.config._about = 'a different note';
  data.map.seed = 99;
  const result = loadGame(data, save);
  assert.equal(result.ok, true, `${result.reason} (${result.detail})`);
  assert.equal(snapshot(result.game), snapshot(original));
  assert.equal(result.game.rules.buildings.house.name, 'Hut');
});

test('the stamp ignores the order of entries and the seed, and notices a changed number', () => {
  const data = loadData();
  const reordered = loadData();
  reordered.config = Object.fromEntries(Object.entries(reordered.config).reverse());
  reordered.buildings.house = Object.fromEntries(Object.entries(reordered.buildings.house).reverse());
  assert.equal(rulesStamp(reordered), rulesStamp(data));
  assert.equal(rulesStamp(withSeed(data, 5)), rulesStamp(data));
  const changed = loadData();
  changed.buildings.market.market.radius = 9;
  assert.notEqual(rulesStamp(changed), rulesStamp(data));
});

test('a save that does not describe a possible game is refused as damaged', () => {
  const game = botGame(15);
  const house = game.state.buildings.findIndex((b) => b.house);
  const producer = game.state.buildings.findIndex((b) => b.production);
  const tampering = {
    'negative coins': (s) => { s.coinsMilli = -5; },
    'a fraction of a good': (s) => { s.goods.wood = 3.5; },
    'a good the rules do not have': (s) => { s.goods.gold = 10; },
    'a missing good': (s) => { delete s.goods.fish; },
    'a clock that is not a number': (s) => { s.tick = 'late'; },
    'too many residents': (s) => { s.buildings[house].house.residents = 99; },
    'a building of an unknown type': (s) => { s.buildings[producer].type = 'castle'; },
    'a road in the building list': (s) => { s.buildings[producer].type = 'road'; },
    'a building moved without its tiles': (s) => { s.buildings[house].x += 1; },
    'a building off the island': (s) => { s.buildings[house].x = 500; },
    'a repeated building number': (s) => { s.buildings[1].id = s.buildings[0].id; },
    'a building missing from the list': (s) => { s.buildings.splice(house, 1); },
    'a house with no house record': (s) => { delete s.buildings[house].house; },
    'a short road list': (s) => { s.roads.pop(); },
    'an island of the wrong size': (s) => { s.map.width = 10; },
    'unknown ground': (s) => { s.map.terrain[5] = 'lava'; },
    'a wrong road connection': (s) => { s.buildings[producer].connected = !s.buildings[producer].connected; },
    'a wrong storage limit': (s) => { s.storageCap += 100; },
    'won with no win time': (s) => { s.won = true; },
    'no state at all': (s) => { for (const key of Object.keys(s)) delete s[key]; },
  };
  for (const [what, tamper] of Object.entries(tampering)) {
    const save = throughText(saveGame(game));
    tamper(save.state);
    const result = loadGame(loadData(), save);
    assert.equal(result.ok, false, `${what} was accepted`);
    assert.equal(result.reason, 'damaged', what);
    assert.ok(result.detail.length > 0, `${what} gave no detail`);
  }
  // The untouched save is fine, so the refusals above are about the tampering.
  assert.equal(loadGame(loadData(), throughText(saveGame(game))).ok, true);
});

test('a game on a hand-made island saves and loads too', () => {
  const game = testGame();
  playMiniCity(game);
  const loaded = reload(game);
  assert.equal(snapshot(loaded), snapshot(game));
  for (let i = 0; i < 2000; i++) { step(game); step(loaded); }
  assert.equal(snapshot(loaded), snapshot(game));
});
