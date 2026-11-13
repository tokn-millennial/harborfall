// Undo. The promise: undoing an action at once leaves the game exactly as it
// was before the action, down to the last number.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { canPlace, canUpgrade, createGame, execute, loadGame, saveGame, step, undoStatus } from '../src/sim/index.js';
import { rulesStamp } from '../src/sim/rules.js';
import { reasonText, undoLabel } from '../src/ui/text.js';
import { createRng } from '../src/sim/rng.js';
import { line, place, richGame, road, run, runSeconds, snapshot, testGame } from './helpers.js';
import { playMiniCity } from './scenario.js';

const undo = (game) => execute(game, { action: 'undo' });

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

test('only the last action can be undone, an undo cannot be undone, and a failed action is not counted', () => {
  const { game } = town();
  place(game, 'house', 20, 11);
  place(game, 'house', 20, 13);
  // A failed command leaves the last real action as the one to undo.
  assert.equal(execute(game, { action: 'place', building: 'house', x: 0, y: 0 }).ok, false);
  assert.equal(execute(game, { action: 'demolish', x: 0, y: 0 }).ok, false);
  assert.equal(undoStatus(game).kind, 'place');
  assert.equal(undo(game).ok, true);
  assert.equal(game.state.buildings.some((b) => b.x === 20 && b.y === 13), false, 'the second house should be gone');
  assert.equal(game.state.buildings.some((b) => b.x === 20 && b.y === 11), true, 'the first house should remain');
  assert.deepEqual(undo(game), { ok: false, reason: 'nothing_to_undo' });
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
  assert.deepEqual(status, { ok: true, kind: 'road', type: null, count: 5, ticksLeft: 300 });
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
  for (let i = 0; i < 600; i++) {
    const x = pick(map.width);
    const y = pick(map.height);
    const roll = pick(10);
    let command;
    if (roll < 5) command = { action: 'place', building: kinds[pick(kinds.length)], x, y };
    else if (roll < 7) command = { action: 'road', tiles: line(x, y, Math.min(map.width - 1, x + pick(6)), y) };
    else command = { action: 'demolish', x, y };

    game.state.undo = null;
    const before = snapshot(game);
    const result = execute(game, command);
    if (snapshot(game) !== before) {
      const back = undo(game);
      assert.equal(back.ok, true, `${JSON.stringify(command)} could not be undone: ${back.reason}`);
      assert.equal(snapshot(game), before, `${JSON.stringify(command)} was not undone exactly`);
      undone++;
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
    const loaded = loadGame(loadData(), JSON.parse(JSON.stringify(saveGame(game))));
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
  const loaded = loadGame(loadData(), save);
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
    const result = loadGame(loadData(), save);
    assert.equal(result.ok, false, `${what} was accepted`);
    assert.equal(result.reason, 'damaged', what);
  }
  assert.equal(loadGame(loadData(), JSON.parse(JSON.stringify(saveGame(game)))).ok, true);
});

// ---- wording ---------------------------------------------------------------------

test('the Undo button says what it would take back', () => {
  const { game, houses } = town();
  const { rules } = game;
  assert.equal(undoLabel(rules, undoStatus(game)), 'Nothing yet');
  place(game, 'house', 20, 11);
  assert.equal(undoLabel(rules, undoStatus(game)), 'House');
  road(game, [[20, 15]]);
  assert.equal(undoLabel(rules, undoStatus(game)), 'Road, 1 tile');
  road(game, line(14, 15, 18, 15));
  assert.equal(undoLabel(rules, undoStatus(game)), 'Road, 5 tiles');
  execute(game, { action: 'demolish', x: 13, y: 13 });
  assert.equal(undoLabel(rules, undoStatus(game)), 'Sawmill back');
  execute(game, { action: 'demolish', x: 20, y: 15 });
  assert.equal(undoLabel(rules, undoStatus(game)), 'Road back');
  // The sawmill is gone, so hand over the planks an upgrade needs.
  for (let i = 0; i < 20000 && !canUpgrade(game, houses[1].id).ok; i++) {
    game.state.goods.planks = 20;
    step(game);
  }
  assert.equal(execute(game, { action: 'upgrade', id: houses[1].id }).ok, true);
  assert.equal(undoLabel(rules, undoStatus(game)), 'Upgrade');
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
