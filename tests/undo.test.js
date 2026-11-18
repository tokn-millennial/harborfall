// Undo. The promise: undoing an action at once leaves the game exactly as it
// was before the action, down to the last number.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { canPlace, canUpgrade, createGame, execute, loadGame, redoStatus, saveGame, step, undoStatus } from '../src/sim/index.js';
import { rulesStamp } from '../src/sim/rules.js';
import { reasonText, redoLabel, undoLabel } from '../src/ui/text.js';
import { createRng } from '../src/sim/rng.js';
import { fullSnapshot, line, place, richGame, road, run, runSeconds, snapshot, testGame, withoutCarts } from './helpers.js';
import { playMiniCity } from './scenario.js';

const undo = (game) => execute(game, { action: 'undo' });
const redo = (game) => execute(game, { action: 'redo' });

// A working town on the test island with nothing waiting to be undone.
function town() {
  const game = testGame();
  const made = playMiniCity(game);
  game.state.coinsMilli = 5000 * 1000;
  game.state.undo = null;
  return { game, ...made };
}

// Does the action, undoes it in the same instant, and requires the game to be untouched.
function undoneExactly(game, label, action) {
  game.state.undo = null;
  const before = snapshot(game);
  const result = action();
  assert.notEqual(snapshot(game), before, `${label}: the action changed nothing, so the test proves nothing`);
  const undone = undo(game);
  assert.equal(undone.ok, true, `${label}: undo was refused: ${undone.reason}`);
  assert.equal(snapshot(game), before, `${label}: the game is not as it was`);
  return result;
}

test('a new game has nothing to undo', () => {
  const game = createGame(loadData());
  assert.equal(game.state.undo, null);
  assert.deepEqual(undoStatus(game), { ok: false, reason: 'nothing_to_undo' });
  const before = snapshot(game);
  assert.deepEqual(undo(game), { ok: false, reason: 'nothing_to_undo' });
  assert.equal(snapshot(game), before);
});

test('undoing a building at once leaves the game exactly as it was', () => {
  const { game } = town();
  undoneExactly(game, 'a house', () => execute(game, { action: 'place', building: 'house', x: 20, y: 11 }));
  undoneExactly(game, 'a lumberjack', () => execute(game, { action: 'place', building: 'lumberjack', x: 8, y: 6 }));
  // A warehouse changes how much can be stored, which must go back too.
  undoneExactly(game, 'a warehouse', () => execute(game, { action: 'place', building: 'warehouse', x: 20, y: 13 }));
});

test('undoing road at once leaves the game exactly as it was, however much was laid', () => {
  const { game } = town();
  undoneExactly(game, 'one tile', () => execute(game, { action: 'road', tiles: [[20, 15]] }));
  undoneExactly(game, 'a line', () => execute(game, { action: 'road', tiles: line(14, 15, 21, 15) }));
  // A line that runs into something lays what it can. Undo lifts exactly those tiles.
  const result = undoneExactly(game, 'a line that hits a building', () => execute(game, { action: 'road', tiles: line(14, 16, 14, 12) }));
  assert.equal(result.ok, false);
  assert.ok(result.placed > 0 && result.failed > 0);
  // A road placed through the "place" command counts as road.
  undoneExactly(game, 'a road placed as a building', () => execute(game, { action: 'place', building: 'road', x: 21, y: 15 }));
});

test('undoing a demolish at once puts the building back exactly: its work, its residents, its place in line', () => {
  const { game, houses, workerHouse } = town();
  const { state } = game;
  const sawmill = state.buildings.find((b) => b.type === 'sawmill');
  runSeconds(game, 7); // part-way through a batch
  assert.ok(sawmill.production.progress > 0);
  undoneExactly(game, 'a sawmill mid-batch', () => execute(game, { action: 'demolish', x: sawmill.x, y: sawmill.y }));
  assert.ok(workerHouse.house.residents > 0);
  undoneExactly(game, 'a full Worker house', () => execute(game, { action: 'demolish', x: workerHouse.x, y: workerHouse.y }));
  undoneExactly(game, 'a Farmer house', () => execute(game, { action: 'demolish', x: houses[2].x, y: houses[2].y }));
  // The first house built is fed first, so it must come back first in the list, not last.
  const firstHouse = state.buildings.findIndex((b) => b.house);
  const target = state.buildings[firstHouse];
  execute(game, { action: 'demolish', x: target.x, y: target.y });
  undo(game);
  assert.equal(state.buildings.findIndex((b) => b.house), firstHouse);
  assert.equal(state.buildings[firstHouse].id, target.id);
});

test('undoing the removal of a road tile reconnects what it cut off', () => {
  const { game } = town();
  const fisher = game.state.buildings.find((b) => b.type === 'fisherman');
  assert.equal(fisher.connected, true);
  game.state.undo = null;
  const before = snapshot(game);
  assert.equal(execute(game, { action: 'demolish', x: 6, y: 9 }).ok, true);
  assert.equal(fisher.connected, false, 'removing the road should have cut the fisherman off');
  assert.equal(undo(game).ok, true);
  assert.equal(game.state.buildings.find((b) => b.type === 'fisherman').connected, true);
  assert.equal(snapshot(game), before);
});

test('undoing an upgrade at once leaves the house, the coins and the planks exactly as they were', () => {
  const { game, houses } = town();
  const house = houses[1];
  for (let i = 0; i < 20000 && !canUpgrade(game, house.id).ok; i++) step(game);
  assert.equal(canUpgrade(game, house.id).ok, true, 'the second house never became ready to upgrade');
  undoneExactly(game, 'an upgrade', () => execute(game, { action: 'upgrade', id: house.id }));
  assert.equal(house.house.tier, 'farmer');
  assert.equal(canUpgrade(game, house.id).ok, true, 'it can be upgraded again');
});

test('undo gives back the whole cost, where demolish gives back half', () => {
  const a = richGame();
  const b = richGame();
  for (const game of [a, b]) game.state.goods.planks = 50;
  const cost = a.rules.buildings.market.cost;
  place(a, 'market', 13, 11);
  place(b, 'market', 13, 11);
  const coinsBefore = a.state.coinsMilli + cost.coinsMilli;
  undo(a);
  execute(b, { action: 'demolish', x: 13, y: 11 });
  assert.equal(a.state.coinsMilli, coinsBefore);
  assert.equal(a.state.goods.planks, 50);
  assert.equal(b.state.coinsMilli, coinsBefore - cost.coinsMilli / 2);
  assert.equal(b.state.goods.planks, 45);
});

test('undo still works a little later, while time has moved on', () => {
  const { game } = town();
  const cost = game.rules.buildings.house.cost;
  place(game, 'house', 20, 11);
  runSeconds(game, 20);
  const coinsBefore = game.state.coinsMilli;
  const tick = game.state.tick;
  const status = undoStatus(game);
  assert.equal(status.ok, true);
  assert.equal(status.kind, 'place');
  assert.equal(status.type, 'house');
  assert.equal(status.ticksLeft, 100);
  assert.equal(undo(game).ok, true);
  assert.equal(game.state.tick, tick, 'undo must not turn the clock back');
  assert.equal(game.state.coinsMilli, coinsBefore + cost.coinsMilli);
  assert.equal(game.state.buildings.some((b) => b.x === 20 && b.y === 11), false);
  assert.equal(canPlace(game, 'house', 20, 11).ok, true, 'the site is free again');
});

test('after 30 seconds of game time it is too late, and a refused undo changes nothing', () => {
  const { game } = town();
  assert.equal(game.rules.undoTicks, 300);
  place(game, 'house', 20, 11);
  run(game, 300);
  assert.equal(undoStatus(game).ok, true, 'the last moment of the window');
  run(game, 1);
  assert.deepEqual(undoStatus(game), { ok: false, reason: 'undo_expired' });
  const before = snapshot(game);
  assert.deepEqual(undo(game), { ok: false, reason: 'undo_expired' });
  assert.equal(snapshot(game), before);
});

test('time does not run out while the game is paused', () => {
  const { game } = town();
  place(game, 'house', 20, 11);
  // Paused means no ticks. However long the player waits, the status is the same.
  for (let i = 0; i < 1000; i++) assert.equal(undoStatus(game).ticksLeft, 300);
  assert.equal(undo(game).ok, true);
});

test('undo goes back one action at a time, newest first, and a failed action is not counted', () => {
  const { game } = town();
  game.state.undo = null;
  const start = snapshot(game);
  place(game, 'house', 20, 11);
  const one = snapshot(game);
  place(game, 'house', 20, 13);
  // A failed command leaves the last real action as the one to undo.
  assert.equal(execute(game, { action: 'place', building: 'house', x: 0, y: 0 }).ok, false);
  assert.equal(execute(game, { action: 'demolish', x: 0, y: 0 }).ok, false);
  assert.equal(undoStatus(game).kind, 'place');
  assert.equal(undoStatus(game).steps, 2);
  assert.equal(undo(game).ok, true);
  assert.equal(snapshot(game), one, 'the second house is not gone, or more went with it');
  assert.equal(undoStatus(game).steps, 1);
  assert.equal(undo(game).ok, true);
  assert.equal(snapshot(game), start, 'the first house is not gone');
  assert.deepEqual(undo(game), { ok: false, reason: 'nothing_to_undo' });
});

// ---- several steps, and redo (Phase 36) ---------------------------------------------

test('a run of different actions undoes exactly, step by step, back to the start', () => {
  const { game, houses } = town();
  game.state.undo = null;
  const commands = [
    { action: 'place', building: 'house', x: 20, y: 11 },
    { action: 'road', tiles: line(14, 15, 18, 15) },
    { action: 'demolish', x: houses[2].x, y: houses[2].y },
    { action: 'place', building: 'house', x: 20, y: 13 },
    { action: 'demolish', x: 16, y: 15 },
  ];
  const states = [snapshot(game)];
  for (const command of commands) {
    const result = execute(game, command);
    assert.ok(result.ok, `${JSON.stringify(command)} failed: ${result.reason}`);
    states.push(snapshot(game));
  }
  for (let i = commands.length - 1; i >= 0; i--) {
    assert.equal(undo(game).ok, true, `undo of ${commands[i].action} refused`);
    assert.equal(snapshot(game), states[i], `after undoing ${JSON.stringify(commands[i])} the game is not as it was`);
  }
  assert.equal(undoStatus(game).ok, false);
});

test('undo reaches back undoSteps actions, and no further', () => {
  const { game } = town();
  assert.equal(game.rules.undoSteps, 10);
  for (let i = 0; i < 12; i++) road(game, [[14 + (i % 6), 15 + Math.floor(i / 6)]]);
  assert.equal(undoStatus(game).steps, 10);
  let undone = 0;
  while (undo(game).ok) undone++;
  assert.equal(undone, 10);
  assert.equal(game.state.roads.filter(Boolean).length > 0, true);
  // With undoSteps at 1, only the last action can be undone, as before Phase 36.
  const one = testGame({ change: (data) => { data.config.undoSteps = 1; }, coins: 1000 });
  road(one, [[14, 15]]);
  road(one, [[15, 15]]);
  assert.equal(undoStatus(one).steps, 1);
  assert.equal(undo(one).ok, true);
  assert.deepEqual(undo(one), { ok: false, reason: 'nothing_to_undo' });
});

test('each step still runs out on its own: older actions are too late first', () => {
  const { game } = town();
  game.state.undo = null;
  road(game, [[14, 15]]);
  runSeconds(game, 20);
  road(game, [[15, 15]]);
  runSeconds(game, 15);
  // The first road was laid 35 seconds ago, the second 15.
  assert.equal(undoStatus(game).steps, 1);
  assert.equal(undo(game).ok, true);
  assert.deepEqual(undo(game), { ok: false, reason: 'undo_expired' });
});

test('redo does an undone action again, at its full cost, and can itself be undone', () => {
  const { game } = town();
  game.state.undo = null;
  const before = snapshot(game);
  place(game, 'house', 20, 11);
  const built = snapshot(game);
  assert.deepEqual(redoStatus(game), { ok: false, reason: 'nothing_to_redo' });
  assert.equal(undo(game).ok, true);
  assert.equal(snapshot(game), before);
  assert.equal(redoStatus(game).kind, 'place');
  assert.equal(redoStatus(game).type, 'house');
  const result = redo(game);
  assert.equal(result.ok, true);
  assert.equal(result.redone, 'place');
  assert.equal(snapshot(game), built, 'redo did not do exactly the same again');
  assert.deepEqual(redoStatus(game), { ok: false, reason: 'nothing_to_redo' });
  // And the redone action is undone like any other.
  assert.equal(undo(game).ok, true);
  assert.equal(snapshot(game), before);
});

test('several undos can be redone in order, and doing anything new forgets them', () => {
  const { game } = town();
  game.state.undo = null;
  place(game, 'house', 20, 11);
  road(game, line(14, 15, 16, 15));
  place(game, 'house', 20, 13);
  const end = snapshot(game);
  undo(game);
  undo(game);
  undo(game);
  assert.equal(redoStatus(game).steps, 3);
  assert.equal(redoStatus(game).kind, 'place');
  redo(game);
  assert.equal(redoStatus(game).kind, 'road');
  assert.equal(redoStatus(game).count, 3);
  redo(game);
  redo(game);
  assert.equal(snapshot(game), end);
  // Undo twice, then do something else: nothing is left to redo.
  undo(game);
  undo(game);
  assert.equal(redoStatus(game).steps, 2);
  road(game, [[17, 15]]);
  assert.deepEqual(redoStatus(game), { ok: false, reason: 'nothing_to_redo' });
});

test('a redo that cannot be done now changes nothing and stays waiting', () => {
  const { game } = town();
  place(game, 'house', 20, 11);
  undo(game);
  // With no money now, it cannot be paid for again.
  game.state.coinsMilli = 0;
  const before = fullSnapshot(game);
  const result = redo(game);
  assert.equal(result.ok, false);
  assert.equal(fullSnapshot(game), before);
  assert.equal(redoStatus(game).ok, true, 'the redo was lost');
  game.state.coinsMilli = 5000 * 1000;
  assert.equal(redo(game).ok, true);
});

test('the undo and redo lists are saved with the game, and work after loading', () => {
  const { game } = town();
  place(game, 'house', 20, 11);
  place(game, 'house', 20, 13);
  road(game, line(14, 15, 16, 15));
  undo(game);
  const loaded = loadGame(withoutCarts(loadData()), JSON.parse(JSON.stringify(saveGame(game))));
  assert.equal(loaded.ok, true, loaded.detail);
  assert.equal(fullSnapshot(loaded.game), fullSnapshot(game));
  for (const g of [game, loaded.game]) {
    redo(g);
    undo(g);
    undo(g);
    undo(g);
  }
  assert.equal(fullSnapshot(loaded.game), fullSnapshot(game));
});

test('two games given the same commands, undos and redos included, end the same', () => {
  const play = () => {
    const { game } = town();
    place(game, 'house', 20, 11);
    road(game, line(14, 15, 18, 15));
    undo(game);
    run(game, 50);
    redo(game);
    undo(game);
    undo(game);
    redo(game);
    run(game, 100);
    return fullSnapshot(game);
  };
  assert.equal(play(), play());
});

test('a saved game with broken undo or redo lists is refused as damaged', () => {
  const { game } = town();
  place(game, 'house', 20, 11);
  place(game, 'house', 20, 13);
  undo(game);
  const tampering = {
    'older records that are not a list': (s) => { s.undoOlder = 'many'; },
    'more older records than undoSteps allows': (s) => { s.undoOlder = Array.from({ length: 10 }, () => ({ kind: 'place', id: 3, untilTick: 5 })); },
    'an older record of an unknown kind': (s) => { s.undoOlder = [{ kind: 'teleport', untilTick: 5 }]; },
    'a redo list that is not a list': (s) => { s.redo = {}; },
    'a redo with no command': (s) => { s.redo = [{ kind: 'place' }]; },
    'a redo of an undo': (s) => { s.redo = [{ kind: 'undo', command: { action: 'undo' } }]; },
    'a redo whose kind does not fit its command': (s) => { s.redo = [{ kind: 'upgrade', command: { action: 'place', building: 'house', x: 1, y: 1 } }]; },
  };
  for (const [what, tamper] of Object.entries(tampering)) {
    const save = JSON.parse(JSON.stringify(saveGame(game)));
    tamper(save.state);
    const result = loadGame(withoutCarts(loadData()), save);
    assert.equal(result.ok, false, `${what} was accepted`);
    assert.equal(result.reason, 'damaged', what);
  }
});

test('a game saved before Phase 36 loads with nothing older to undo and nothing to redo', () => {
  const { game } = town();
  place(game, 'house', 20, 11);
  const save = JSON.parse(JSON.stringify(saveGame(game)));
  delete save.state.undoOlder;
  delete save.state.redo;
  delete save.state.undo.command;
  const loaded = loadGame(withoutCarts(loadData()), save);
  assert.equal(loaded.ok, true, loaded.detail);
  assert.deepEqual(loaded.game.state.undoOlder, []);
  assert.deepEqual(loaded.game.state.redo, []);
  // Its last action can still be undone, though not redone: the save does not say what it was.
  assert.equal(undo(loaded.game).ok, true);
  assert.deepEqual(redoStatus(loaded.game), { ok: false, reason: 'nothing_to_redo' });
});

test('a demolish cannot be undone once what it gave back has been used', () => {
  const { game } = town();
  const sawmill = game.state.buildings.find((b) => b.type === 'sawmill');
  for (const [label, spend] of [['coins', (s) => { s.coinsMilli = 0; }], ['wood', (s) => { s.goods.wood = 0; }]]) {
    game.state.goods.wood = 20;
    game.state.coinsMilli = 500000;
    assert.equal(execute(game, { action: 'demolish', x: sawmill.x, y: sawmill.y }).ok, true);
    assert.deepEqual(game.state.undo.given, { coinsMilli: 20000, goods: { wood: 2 } });
    spend(game.state);
    const before = snapshot(game);
    assert.deepEqual(undo(game), { ok: false, reason: 'undo_spent' }, label);
    assert.equal(snapshot(game), before, `${label}: a refused undo changed the game`);
    // With the refund back in hand it works.
    game.state.goods.wood = 20;
    game.state.coinsMilli = 500000;
    assert.equal(undo(game).ok, true);
  }
});

test('checking what an undo would do never changes the game', () => {
  const { game } = town();
  execute(game, { action: 'road', tiles: line(14, 15, 18, 15) });
  const before = snapshot(game);
  const status = undoStatus(game);
  assert.deepEqual(status, { ok: true, kind: 'road', type: null, count: 5, ticksLeft: 300, steps: 1 });
  assert.equal(snapshot(game), before);
});

test('undo and the rest of the game still match between two games given the same commands', () => {
  const play = () => {
    const { game } = town();
    place(game, 'house', 20, 11);
    run(game, 50);
    undo(game);
    road(game, line(14, 15, 18, 15));
    run(game, 10);
    undo(game);
    place(game, 'house', 20, 13);
    run(game, 2000);
    return snapshot(game);
  };
  assert.equal(play(), play());
});

test('random actions, each undone at once, always leave the game exactly as it was', () => {
  const game = richGame();
  const random = createRng(2024);
  const { map } = game.state;
  const pick = (n) => Math.floor(random() * n);
  const kinds = Object.keys(game.rules.buildings);
  let undone = 0;
  const kindsTried = {};
  const kindsUndone = {};
  for (let i = 0; i < 800; i++) {
    const x = pick(map.width);
    const y = pick(map.height);
    const roll = pick(13);
    const anyBuilding = () => game.state.buildings[pick(game.state.buildings.length)].id;
    let command;
    if (roll < 5) command = { action: 'place', building: kinds[pick(kinds.length)], x, y };
    else if (roll < 7) command = { action: 'road', tiles: line(x, y, Math.min(map.width - 1, x + pick(6)), y) };
    else if (roll < 10) command = { action: 'demolish', x, y };
    else if (roll < 12) command = { action: 'close', id: anyBuilding() };
    else command = { action: 'reopen', id: anyBuilding() };
    kindsTried[command.action] = (kindsTried[command.action] ?? 0) + 1;

    game.state.undo = null;
    const before = snapshot(game);
    const result = execute(game, command);
    if (snapshot(game) !== before) {
      const back = undo(game);
      assert.equal(back.ok, true, `${JSON.stringify(command)} could not be undone: ${back.reason}`);
      assert.equal(snapshot(game), before, `${JSON.stringify(command)} was not undone exactly`);
      undone++;
      kindsUndone[command.action] = (kindsUndone[command.action] ?? 0) + 1;
      execute(game, command); // do it for real, so the island fills up
    } else {
      // Nothing changed: the command failed, or it was road over road that is already
      // there. Either way there must be nothing to undo.
      assert.equal(game.state.undo, null, `${JSON.stringify(command)} changed nothing but left something to undo`);
      assert.equal(typeof result.ok, 'boolean');
    }
    run(game, pick(40));
    // Keep the game rich, so cost is never why a command fails.
    game.state.coinsMilli = 100000000;
    for (const good of game.rules.goodIds) game.state.goods[good] = game.state.storageCap;
  }
  assert.ok(undone > 150, `only ${undone} actions were undone`);
  for (const action of ['place', 'road', 'demolish', 'close', 'reopen']) {
    assert.ok((kindsUndone[action] ?? 0) >= 5, `only ${kindsUndone[action] ?? 0} ${action} actions were undone, of ${kindsTried[action] ?? 0} tried`);
  }
  assert.ok(game.state.buildings.length > 3, 'the random run built almost nothing');
});

// ---- settings and saving ---------------------------------------------------------

test('undoSeconds comes from config.json, 0 switches undo off, and nonsense is refused', () => {
  const longer = testGame({ change: (d) => { d.config.undoSeconds = 90; } });
  assert.equal(longer.rules.undoTicks, 900);
  const missing = testGame({ change: (d) => { delete d.config.undoSeconds; } });
  assert.equal(missing.rules.undoTicks, 300, 'data without the setting gets 30 seconds');

  const off = richGame({ change: (d) => { d.config.undoSeconds = 0; } });
  place(off, 'house', 16, 11);
  assert.equal(off.state.undo, null);
  assert.deepEqual(undo(off), { ok: false, reason: 'nothing_to_undo' });

  for (const bad of [-5, 'soon', null]) {
    assert.throws(() => testGame({ change: (d) => { d.config.undoSeconds = bad; } }), /undoSeconds/, String(bad));
  }
});

test('changing how long undo lasts does not make a saved game unusable', () => {
  const data = loadData();
  const changed = loadData();
  changed.config.undoSeconds = 120;
  assert.equal(rulesStamp(changed), rulesStamp(data));
  const game = createGame(data);
  run(game, 500);
  assert.equal(loadGame(changed, JSON.parse(JSON.stringify(saveGame(game)))).ok, true);
});

test('what is waiting to be undone is saved with the game, and works after loading', () => {
  const { game } = town();
  const cases = [
    () => place(game, 'house', 20, 11),
    () => road(game, line(14, 15, 18, 15)),
    () => execute(game, { action: 'demolish', x: 13, y: 13 }),
    () => execute(game, { action: 'demolish', x: 6, y: 9 }),
  ];
  for (const act of cases) {
    act();
    run(game, 30);
    const loaded = loadGame(withoutCarts(loadData()), JSON.parse(JSON.stringify(saveGame(game))));
    assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
    assert.equal(snapshot(loaded.game), snapshot(game));
    assert.equal(undo(loaded.game).ok, true);
    assert.equal(undo(game).ok, true);
    assert.equal(snapshot(loaded.game), snapshot(game));
  }
});

test('a game saved before undo existed still loads, with nothing to undo', () => {
  const { game } = town();
  const save = JSON.parse(JSON.stringify(saveGame(game)));
  delete save.state.undo;
  const loaded = loadGame(withoutCarts(loadData()), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.equal(loaded.game.state.undo, null);
  assert.equal(snapshot(loaded.game), snapshot(game));
  assert.equal(undo(loaded.game).reason, 'nothing_to_undo');
});

test('a saved game with a broken undo record is refused as damaged', () => {
  const { game, houses } = town();
  execute(game, { action: 'demolish', x: houses[2].x, y: houses[2].y });
  const tampering = {
    'not a record': (s) => { s.undo = 'yes'; },
    'an unknown kind': (s) => { s.undo.kind = 'teleport'; },
    'no time limit': (s) => { delete s.undo.untilTick; },
    'a building of an unknown type': (s) => { s.undo.building.type = 'castle'; },
    'a building off the island': (s) => { s.undo.building.x = 900; },
    'a building whose number is already in use': (s) => { s.undo.building.id = s.buildings[0].id; },
    'too many residents': (s) => { s.undo.building.house.residents = 50; },
    'a refund of a good that does not exist': (s) => { s.undo.given.goods.gold = 5; },
    'a negative refund': (s) => { s.undo.given.coinsMilli = -1; },
    'a producer status that is not a status': (s) => { s.undo.statuses[1] = 'on fire'; },
    'a road tile off the island': (s) => { s.undo = { kind: 'road', tiles: [[999, 0]], untilTick: 5 }; },
    'an upgrade with no house': (s) => { s.undo = { kind: 'upgrade', id: 3, untilTick: 5 }; },
    'a placed building with no number': (s) => { s.undo = { kind: 'place', untilTick: 5 }; },
  };
  for (const [what, tamper] of Object.entries(tampering)) {
    const save = JSON.parse(JSON.stringify(saveGame(game)));
    tamper(save.state);
    const result = loadGame(withoutCarts(loadData()), save);
    assert.equal(result.ok, false, `${what} was accepted`);
    assert.equal(result.reason, 'damaged', what);
  }
  assert.equal(loadGame(withoutCarts(loadData()), JSON.parse(JSON.stringify(saveGame(game)))).ok, true);
});

// ---- wording ---------------------------------------------------------------------

test('the Undo button says what it would take back', () => {
  const { game, houses } = town();
  const { rules } = game;
  assert.equal(undoLabel(rules, undoStatus(game)), 'Nothing yet');
  place(game, 'house', 20, 11);
  assert.equal(undoLabel(rules, undoStatus(game)), 'House');
  // From the second step on, the label says how many steps are waiting.
  road(game, [[20, 15]]);
  assert.equal(undoLabel(rules, undoStatus(game)), 'Road, 1 tile (2)');
  road(game, line(14, 15, 18, 15));
  assert.equal(undoLabel(rules, undoStatus(game)), 'Road, 5 tiles (3)');
  execute(game, { action: 'demolish', x: 13, y: 13 });
  assert.equal(undoLabel(rules, undoStatus(game)), 'Sawmill back (4)');
  execute(game, { action: 'demolish', x: 20, y: 15 });
  assert.equal(undoLabel(rules, undoStatus(game)), 'Road back (5)');
  // And Redo says what it would do again.
  assert.equal(redoLabel(rules, redoStatus(game)), 'Nothing yet');
  undo(game);
  assert.equal(redoLabel(rules, redoStatus(game)), 'Remove road');
  undo(game);
  assert.equal(redoLabel(rules, redoStatus(game)), 'Remove Sawmill (2)');
  redo(game);
  redo(game);
  assert.equal(undoLabel(rules, undoStatus(game)), 'Road back (5)');
  // The sawmill is gone, so hand over the planks an upgrade needs.
  for (let i = 0; i < 20000 && !canUpgrade(game, houses[1].id).ok; i++) {
    game.state.goods.planks = 20;
    step(game);
  }
  assert.equal(execute(game, { action: 'upgrade', id: houses[1].id }).ok, true);
  assert.equal(undoLabel(rules, undoStatus(game)), 'Upgrade (6)');
  run(game, 301);
  assert.equal(undoLabel(rules, undoStatus(game)), 'Too late');
});

test('each reason an undo can be refused has a plain sentence', () => {
  const game = testGame();
  for (const code of ['nothing_to_undo', 'undo_expired', 'undo_spent']) {
    const text = reasonText(game, code);
    assert.ok(text.length > 10, code);
    assert.doesNotMatch(text, /_|undefined|cannot be done\.$/, `${code}: "${text}"`);
  }
});
