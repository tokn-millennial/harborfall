// Materials travel by cart too: a workshop works only from its own small store,
// and a cart going to it takes materials out and brings what it made back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { buildingIssue, createGame, execute, getSummary, loadGame, saveGame } from '../src/sim/index.js';
import { createAdvisor } from '../src/ui/advice.js';
import { panelModel } from '../src/ui/panelModel.js';
import { runBot } from '../tools/bot/bot.js';
import { loadOrder } from '../tools/tune.mjs';
import { dataBefore, line, place, richGame, road, run, snapshot, testGame } from './helpers.js';

const throughText = (value) => JSON.parse(JSON.stringify(value));

// A sawmill four road tiles from the warehouse, the stockpile full of wood and
// empty of planks, and the undo note cleared.
const NEAR = [[12, 10], [12, 11], [12, 12], [12, 13]];
function sawmillTown({ change } = {}) {
  const game = richGame({ carts: true, change });
  const mill = place(game, 'sawmill', 13, 13);
  road(game, NEAR);
  game.state.goods.wood = 100; // (building the sawmill took 5)
  game.state.goods.planks = 0;
  game.state.undo = null;
  return { game, mill };
}
const outCarts = (game) => game.state.carts.filter((c) => c.phase === 'out');

// ---- the rule in the data ------------------------------------------------------------

test('a workshop keeps a store of materials, room for 6 of each', () => {
  const { rules } = createGame(loadData());
  assert.deepEqual(rules.materials, { store: 6 });
  const workshops = Object.values(rules.buildings).filter((d) => d.production && Object.keys(d.production.inputs).length > 0).map((d) => d.id);
  assert.deepEqual(workshops.sort(), ['bakery', 'sawmill', 'weaver', 'winery']);
  assert.deepEqual(createGame(loadData()).state.buildings[0].production, undefined, 'a warehouse keeps no store');
});

// ---- one workshop, tick by tick ---------------------------------------------------------

test('a workshop works only from its own store: with the stockpile full of wood and its store empty, it waits for a cart', () => {
  const { game, mill } = sawmillTown();
  assert.equal(mill.production.haul.tiles, 4);
  assert.equal(game.state.goods.wood, 100);
  run(game, 1);
  assert.equal(mill.production.status, 'missing_input', 'it took wood from the stockpile');
  const [cart] = outCarts(game);
  assert.deepEqual(cart.load, { wood: 4 }, 'the cart takes wood with it');
  assert.equal(game.state.goods.wood, 96, 'the wood leaves the stockpile when the cart sets out');
  run(game, 20);
  assert.deepEqual(mill.production.store, { wood: 4 }, 'four tiles at half a second a tile');
  assert.equal(cart.phase, 'back');
  assert.deepEqual(cart.load, {}, 'nothing to bring back yet');
  run(game, 1);
  assert.equal(mill.production.active, true, 'the sawmill starts at once');
  assert.deepEqual(mill.production.store, { wood: 2 });
});

test('one trip does both jobs: materials out, finished goods back', () => {
  const { game, mill } = sawmillTown();
  mill.production.store = { wood: 3 };
  mill.production.yard = { planks: 2 };
  mill.production.active = true;
  run(game, 1);
  const [cart] = outCarts(game);
  assert.deepEqual(cart.load, { wood: 3 }, 'the store is topped up to 6');
  run(game, 20);
  assert.deepEqual(mill.production.store, { wood: 6 });
  assert.deepEqual(cart.load, { planks: 2 });
  run(game, 20);
  assert.equal(game.state.goods.planks, 2);
});

test('a store never holds more than 6 of a material, and a cart never carries more than 4', () => {
  const { game, mill } = sawmillTown();
  for (let i = 0; i < 3000; i++) {
    run(game, 1);
    assert.ok((mill.production.store.wood ?? 0) <= 6);
    for (const c of game.state.carts) assert.ok(Object.values(c.load).reduce((a, n) => a + n, 0) <= 4);
    game.state.goods.planks = 0;
  }
  assert.ok(game.state.goods.wood < 100, 'the sawmill never got any wood');
});

test('a workshop that has run out is served before a fuller yard', () => {
  const { game, mill } = sawmillTown();
  const jack = place(game, 'lumberjack', 7, 7);
  road(game, line(10, 8, 7, 8));
  game.state.goods.wood = 50;
  jack.production.yard = { wood: 5 };
  game.state.carts.splice(1); // one cart
  run(game, 1);
  assert.equal(game.state.carts[0].target, mill.id, 'the cart went for the fuller yard first');
});

test('a closed workshop is sent no materials', () => {
  const { game, mill } = sawmillTown();
  execute(game, { action: 'close', id: mill.id });
  run(game, 300);
  assert.deepEqual(mill.production.store, {});
  assert.equal(game.state.goods.wood, 100);
  execute(game, { action: 'reopen', id: mill.id });
  run(game, 1);
  assert.equal(outCarts(game).length, 1);
});

test('materials on a cart whose workshop is demolished come back to the stockpile', () => {
  const { game, mill } = sawmillTown();
  run(game, 6);
  assert.equal(game.state.goods.wood, 96);
  execute(game, { action: 'demolish', x: mill.x, y: mill.y });
  const [cart] = game.state.carts.filter((c) => c.phase !== 'home');
  assert.deepEqual({ phase: cart.phase, load: cart.load, left: cart.left }, { phase: 'back', load: { wood: 4 }, left: 5 });
  run(game, 5);
  assert.ok(game.state.goods.wood >= 96, 'the wood was lost');
});

test('undoing the demolish of a workshop with materials on the way puts everything back exactly', () => {
  const { game, mill } = sawmillTown();
  run(game, 8);
  game.state.undo = null;
  const before = snapshot(game);
  execute(game, { action: 'demolish', x: mill.x, y: mill.y });
  assert.equal(execute(game, { action: 'undo' }).ok, true);
  assert.equal(snapshot(game), before);
});

test('a far workshop waits longer for its first materials', () => {
  const firstPlank = (roadTiles) => {
    const game = richGame({ carts: true });
    const mill = place(game, 'sawmill', 5, 9);
    road(game, roadTiles);
    game.state.goods.planks = 0;
    let ticks = 0;
    while (Object.keys(mill.production.yard).length === 0 && ticks < 5000) { run(game, 1); ticks++; }
    return { ticks, haul: mill.production.haul.tiles };
  };
  const near = firstPlank(line(10, 8, 4, 8));
  const far = firstPlank([...line(12, 9, 16, 9), ...line(16, 10, 16, 12), ...line(15, 12, 3, 12), ...line(3, 11, 3, 8), ...line(4, 8, 7, 8)]);
  assert.ok(far.haul > 20 && near.haul < 8, `hauls ${near.haul} and ${far.haul}`);
  // 160 ticks of sawing, after a cart has driven out with the wood.
  assert.equal(near.ticks, 1 + near.haul * 5 + 160);
  assert.equal(far.ticks, 1 + far.haul * 5 + 160);
});

// ---- saved games ------------------------------------------------------------------------------

test('a game with materials in stores and on carts is saved and comes back exactly', () => {
  const game = createGame(loadData());
  runBot(game, loadOrder('standard'), { maxMinutes: 14 });
  assert.ok(game.state.buildings.some((b) => Object.keys(b.production?.store ?? {}).length > 0), 'the test needs a store with something in it');
  const loaded = loadGame(loadData(), throughText(saveGame(game)));
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.equal(snapshot(loaded.game), snapshot(game));
  run(game, 2000);
  run(loaded.game, 2000);
  assert.equal(snapshot(loaded.game), snapshot(game));
});

test('a game saved before materials travelled loads, with every workshop\'s store empty', () => {
  const before = createGame(dataBefore(4));
  runBot(before, loadOrder('standard'), { maxMinutes: 15 });
  const save = throughText(saveGame(before));
  for (const b of save.state.buildings) if (b.production) delete b.production.store;
  assert.equal(save.rulesStamp, 'c7dd0d43d8d2ffb8');
  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  for (const b of loaded.game.state.buildings) if (b.production) assert.deepEqual(b.production.store, {});
  run(loaded.game, 600);
  assert.ok(loaded.game.state.buildings.some((b) => Object.keys(b.production?.store ?? {}).length > 0), 'no cart brought any materials');
});

test('a save with a wrong store or a cart carrying the wrong things is refused as damaged', () => {
  const { game, mill } = sawmillTown();
  run(game, 3);
  const save = () => throughText(saveGame(game));
  const data = () => { const d = loadData(); return d; };
  // The sawmill town is built with the real data files, so it loads against them.
  assert.equal(loadGame(data(), save()).ok, true);
  const at = (s) => s.state.buildings.find((b) => b.id === mill.id);
  const tampers = {
    'a store of a good it does not use': (s) => { at(s).production.store = { fish: 2 }; },
    'a store holding too much': (s) => { at(s).production.store = { wood: 7 }; },
    'a store that is a list': (s) => { at(s).production.store = []; },
    'a cart on its way out with fish': (s) => { s.state.carts.find((c) => c.phase === 'out').load = { fish: 1 }; },
  };
  for (const [name, tamper] of Object.entries(tampers)) {
    const s = save();
    tamper(s);
    assert.equal(loadGame(data(), s).reason, 'damaged', name);
  }
});

// ---- switching it off, and data mistakes ----------------------------------------------------------

test('with materials taken out of the data, workshops take straight from the stockpile, as in Phase 19', () => {
  const { game, mill } = sawmillTown({ change: (d) => { delete d.config.materials; } });
  assert.equal(game.rules.materials, null);
  run(game, 1);
  assert.equal(mill.production.active, true);
  assert.equal(game.state.goods.wood, 98);
  assert.equal(outCarts(game).length, 0);
});

test('mistakes in the materials settings are refused with a clear message', () => {
  const bad = [
    [(d) => { d.config.materials = 'lots'; }, /config\.materials must be an object/],
    [(d) => { d.config.materials.store = 0; }, /config\.materials\.store/],
    [(d) => { d.config.materials.store = 1; }, /buildings\.sawmill uses 2 wood a cycle, more than config\.materials\.store holds/],
    [(d) => { delete d.config.carts; d.buildings.warehouse.carts = 0; }, /config\.materials needs config\.carts/],
  ];
  for (const [change, pattern] of bad) assert.throws(() => testGame({ carts: true, change }), pattern, String(change));
});

// ---- on screen --------------------------------------------------------------------------------

test('a workshop\'s panel shows its materials, and says when it waits for a cart to bring them', () => {
  const { game, mill } = sawmillTown();
  run(game, 1);
  const model = panelModel(game, mill);
  assert.deepEqual(model.lines[0], { label: 'Status', value: 'Waiting for a cart to bring wood.', level: 'warn' });
  assert.equal(model.lines.find((l) => l.label === 'Materials').value, '0 wood (room for 6)');
  run(game, 20);
  assert.equal(panelModel(game, mill).lines.find((l) => l.label === 'Materials').value, '4 wood (room for 6)');
  // A lumberjack takes no materials, and has no such line.
  const jack = place(game, 'lumberjack', 7, 7);
  assert.equal(panelModel(game, jack).lines.some((l) => l.label === 'Materials'), false);
  // With no wood anywhere, it says so plainly.
  const empty = sawmillTown().game;
  empty.state.goods.wood = 0;
  run(empty, 1);
  assert.equal(panelModel(empty, empty.state.buildings.find((b) => b.type === 'sawmill')).lines[0].value, 'Waiting for wood.');
});

test('tips: workshops starved of materials the stockpile has count as carts not keeping up', () => {
  const game = richGame({ carts: true });
  const far = [...line(12, 9, 16, 9), ...line(16, 10, 16, 12), ...line(15, 12, 3, 12)];
  for (const [x, y] of [[4, 10], [6, 10], [8, 10]]) place(game, 'sawmill', x, y);
  road(game, far);
  game.state.carts.splice(1); // one cart for three far sawmills
  const advisor = createAdvisor(game.rules);
  let tip = null;
  for (let i = 0; i < 900; i++) { run(game, 1); tip = advisor.update(game); game.state.goods.planks = 0; }
  assert.equal(tip, 'Your carts cannot keep up. Build another warehouse near your workshops.');
  assert.ok(game.state.buildings.some((b) => b.type === 'sawmill' && buildingIssue(game, b) === 'missing_input'));
});

// ---- the whole game -----------------------------------------------------------------------------

test('GATE: the second act reaches 100 Artisans 25 to 45 minutes after the win, on four islands', () => {
  for (const seed of [undefined, 42, 7, 2025]) {
    const game = createGame(loadData(), { seed });
    const result = runBot(game, loadOrder('artisans'), { pastWin: true, maxMinutes: 120 });
    const goal = result.milestones[0].reachedAtMinutes;
    assert.notEqual(goal, null, `island ${seed ?? 'standard'}: stuck on ${result.stuckOn?.label} (${result.stuckOn?.waitedFor})`);
    const after = goal - result.wonAtMinutes;
    // Moved in Phase 23 from 15 to 30 to 25 to 45: the second act now settles the second
    // island and waits for its wine before Artisan houses fill.
    assert.ok(after >= 25 && after <= 45, `island ${seed ?? 'standard'}: ${after.toFixed(1)} minutes after the win`);
  }
});

test('GATE: the bot builds a warehouse where carts struggle, as a player answering the tip would, and in the first act at most one, late', () => {
  const second = createGame(loadData(), { seed: 2025 });
  const result = runBot(second, loadOrder('artisans'), { pastWin: true, maxMinutes: 120 });
  assert.ok(result.log.some((e) => /carts struggling/.test(e.label)), 'it never answered struggling carts');
  // The standard first act needs at most one more, near its end.
  const first = createGame(loadData());
  const standard = runBot(first, loadOrder('standard'));
  const added = standard.log.filter((e) => /carts struggling/.test(e.label));
  assert.ok(added.length <= 1, `${added.length} warehouses added in the first act`);
  for (const e of added) assert.ok(e.doneAtSeconds / 60 > 20, `a warehouse was needed at ${(e.doneAtSeconds / 60).toFixed(1)} minutes`);
  assert.ok(standard.wonAtMinutes >= 25 && standard.wonAtMinutes <= 30, `won at ${standard.wonAtMinutes.toFixed(1)}`);
  assert.ok(getSummary(first).carts.total <= 6);
});
