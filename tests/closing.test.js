// Closing a producer for now: it makes nothing, needs no staff, and can be
// reopened. The second way out of a staff shortage, after building houses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { buildingIssue, createGame, execute, getSummary, loadGame, saveGame, staffing, undoStatus } from '../src/sim/index.js';
import { createAdvisor } from '../src/ui/advice.js';
import { panelModel } from '../src/ui/panelModel.js';
import { reasonText, staffText, undoLabel } from '../src/ui/text.js';
import { runBot } from '../tools/bot/bot.js';
import { loadOrder } from '../tools/tune.mjs';
import { buildMarket, line, place, richGame, road, run, snapshot, withoutCarts } from './helpers.js';

const throughText = (value) => JSON.parse(JSON.stringify(value));
const close = (game, building) => execute(game, { action: 'close', id: building.id });
const reopen = (game, building) => execute(game, { action: 'reopen', id: building.id });

// Lumberjacks along two sides of the forest, all on one road to the
// warehouse, with the wood store emptied. Each needs 2 staff. Up to 8 fit.
const JACK_SITES = [[7, 7], [6, 7], [5, 7], [4, 7], [8, 6], [8, 5], [8, 4], [8, 3]];
function lumberjacks(game, count) {
  const built = JACK_SITES.slice(0, count).map(([x, y]) => place(game, 'lumberjack', x, y));
  road(game, [...line(10, 8, 4, 8), ...line(9, 7, 9, 3)]);
  game.state.goods.wood = 0;
  return built;
}

// ---- what closing does ---------------------------------------------------------------

test('a closed producer makes nothing, and says it is closed', () => {
  const game = richGame();
  const [a, b] = lumberjacks(game, 2);
  assert.deepEqual(close(game, a), { ok: true });
  assert.equal(a.production.closed, true);
  assert.equal(a.production.status, 'closed');
  assert.equal(b.production.closed, undefined, 'an open producer carries no closed mark at all');
  run(game, 400);
  assert.equal(game.state.goods.wood, 8, 'only the open lumberjack cut wood');
  assert.equal(a.production.status, 'closed');
  assert.equal(buildingIssue(game, a), null, 'a building closed on purpose is not a problem to flag');
  assert.equal(getSummary(game).closedProducers, 1);
});

test('reopening puts it back to work, and work in hand was kept', () => {
  const game = richGame();
  const [jack] = lumberjacks(game, 1);
  run(game, 30); // 30 of the 50 ticks a log takes
  assert.equal(jack.production.progress, 30);
  close(game, jack);
  run(game, 500);
  assert.equal(jack.production.progress, 30, 'the half-cut log waits');
  assert.equal(game.state.goods.wood, 0);
  assert.deepEqual(reopen(game, jack), { ok: true });
  assert.equal('closed' in jack.production, false);
  assert.equal(jack.production.status, 'working');
  run(game, 19);
  assert.equal(game.state.goods.wood, 0);
  run(game, 1);
  assert.equal(game.state.goods.wood, 1, 'the log is finished 20 ticks after reopening');
  assert.equal(getSummary(game).closedProducers, 0);
});

test('a closed workshop takes nothing from the stockpile', () => {
  const game = richGame();
  const mill = place(game, 'sawmill', 13, 13);
  road(game, [[12, 10], [12, 11], [12, 12], [12, 13]]);
  close(game, mill);
  game.state.goods.wood = 50;
  game.state.goods.planks = 0;
  run(game, 1000);
  assert.equal(game.state.goods.wood, 50);
  assert.equal(game.state.goods.planks, 0);
  reopen(game, mill);
  run(game, 160);
  assert.equal(game.state.goods.planks, 1);
  assert.equal(game.state.goods.wood, 48, 'two logs went into the one plank');
  run(game, 1);
  assert.equal(game.state.goods.wood, 46, 'and the next plank is begun');
});

test('a closed producer still costs its upkeep', () => {
  const game = richGame();
  const twin = richGame();
  const [jack] = lumberjacks(game, 3);
  lumberjacks(twin, 3);
  close(game, jack);
  run(game, 1200);
  run(twin, 1200);
  assert.equal(game.state.coinsMilli, twin.state.coinsMilli);
  assert.equal(game.state.lastIncome.upkeepMilli, twin.state.lastIncome.upkeepMilli);
});

// ---- staff -----------------------------------------------------------------------------

test('a closed producer needs no staff, so closing two of eight ends the shortage', () => {
  const game = richGame();
  const jacks = lumberjacks(game, 8);
  assert.deepEqual(staffing(game), { on: true, needed: 16, available: 12, ratioMilli: 750 });
  close(game, jacks[0]);
  assert.equal(staffing(game).ratioMilli, 857);
  close(game, jacks[1]);
  assert.deepEqual(staffing(game), { on: true, needed: 12, available: 12, ratioMilli: 1000 });
  run(game, 400);
  // Six at full speed cut 8 each. Eight at 75% would have cut 6 each: the same 48.
  assert.equal(game.state.goods.wood, 48);
  reopen(game, jacks[0]);
  assert.equal(staffing(game).needed, 14);
});

test('the others work exactly as if the closed one had never been built', () => {
  const game = richGame();
  const twin = richGame();
  const jacks = lumberjacks(game, 4);
  lumberjacks(twin, 3);
  close(game, jacks[3]);
  run(game, 777);
  run(twin, 777);
  assert.equal(game.state.goods.wood, twin.state.goods.wood);
  assert.deepEqual(game.state.buildings.slice(1, 4), twin.state.buildings.slice(1, 4));
});

// ---- roads -----------------------------------------------------------------------------

test('a producer can be closed before it has a road, and stays closed when the road comes', () => {
  const game = richGame();
  const jack = place(game, 'lumberjack', 7, 7);
  assert.equal(close(game, jack).ok, true);
  assert.equal(jack.production.status, 'no_road');
  assert.equal(buildingIssue(game, jack), 'no_road', 'no road is still the thing to flag');
  road(game, line(10, 8, 7, 8));
  assert.equal(jack.production.status, 'closed');
  game.state.goods.wood = 0;
  run(game, 300);
  assert.equal(game.state.goods.wood, 0);
});

test('a closed producer cut off from the warehouse and joined again is still closed', () => {
  const game = richGame();
  const [jack] = lumberjacks(game, 1);
  close(game, jack);
  assert.equal(execute(game, { action: 'demolish', x: 10, y: 8 }).ok, true);
  assert.equal(jack.production.status, 'no_road');
  assert.equal(jack.production.closed, true);
  road(game, [[10, 8]]);
  assert.equal(jack.production.status, 'closed');
  assert.equal(staffing(game).needed, 0);
});

// ---- what cannot be closed ---------------------------------------------------------------

test('only producers can be closed, and a refused command changes nothing', () => {
  const game = richGame();
  const [jack] = lumberjacks(game, 1);
  game.state.goods.wood = 100;
  const market = buildMarket(game);
  const house = place(game, 'house', 16, 11);
  const warehouse = game.state.buildings[0];
  game.state.undo = null;
  const before = snapshot(game);
  for (const building of [market, house, warehouse]) {
    assert.deepEqual(close(game, building), { ok: false, reason: 'not_a_producer' });
    assert.deepEqual(reopen(game, building), { ok: false, reason: 'not_a_producer' });
  }
  for (const id of [999, -1, 1.5, 'jack', null, undefined]) {
    assert.deepEqual(execute(game, { action: 'close', id }), { ok: false, reason: 'not_a_producer' }, `id ${id}`);
  }
  assert.deepEqual(reopen(game, jack), { ok: false, reason: 'not_closed' });
  assert.equal(snapshot(game), before);
  close(game, jack);
  game.state.undo = null;
  const closedState = snapshot(game);
  assert.deepEqual(close(game, jack), { ok: false, reason: 'already_closed' });
  assert.equal(snapshot(game), closedState);
});

// ---- undo ------------------------------------------------------------------------------

test('undoing a close or a reopen leaves the game exactly as it was', () => {
  const game = richGame();
  const [jack, other] = lumberjacks(game, 2);
  run(game, 17);
  game.state.undo = null;
  let before = snapshot(game);
  close(game, jack);
  assert.deepEqual(undoStatus(game), { ok: true, kind: 'close', type: 'lumberjack', count: null, ticksLeft: 300, steps: 1 });
  assert.deepEqual(execute(game, { action: 'undo' }), { ok: true, undone: 'close' });
  assert.equal(snapshot(game), before);

  close(game, jack);
  run(game, 40);
  game.state.undo = null;
  before = snapshot(game);
  reopen(game, jack);
  assert.equal(undoStatus(game).kind, 'reopen');
  assert.deepEqual(execute(game, { action: 'undo' }), { ok: true, undone: 'reopen' });
  assert.equal(snapshot(game), before);
  assert.equal(jack.production.closed, true);

  // A producer waiting on full storage gets that word back, not a fresh "working".
  game.state.goods.wood = game.state.storageCap;
  run(game, 60);
  assert.equal(other.production.status, 'storage_full');
  game.state.undo = null;
  before = snapshot(game);
  close(game, other);
  execute(game, { action: 'undo' });
  assert.equal(snapshot(game), before);
});

test('a close can be undone for 30 seconds and no longer', () => {
  const game = richGame();
  const [jack] = lumberjacks(game, 1);
  close(game, jack);
  run(game, 301);
  assert.deepEqual(execute(game, { action: 'undo' }), { ok: false, reason: 'undo_expired' });
  assert.equal(jack.production.closed, true);
});

test('a closed building that is demolished and brought back by undo is still closed', () => {
  const game = richGame();
  const [jack] = lumberjacks(game, 1);
  close(game, jack);
  game.state.undo = null;
  const before = snapshot(game);
  assert.equal(execute(game, { action: 'demolish', x: jack.x, y: jack.y }).ok, true);
  assert.equal(getSummary(game).closedProducers, 0);
  assert.equal(execute(game, { action: 'undo' }).ok, true);
  assert.equal(snapshot(game), before);
});

// ---- saved games -----------------------------------------------------------------------

test('a game with closed buildings is saved and comes back exactly', () => {
  const game = richGame();
  const jacks = lumberjacks(game, 5);
  run(game, 123);
  close(game, jacks[1]);
  close(game, jacks[3]);
  run(game, 77);
  const loaded = loadGame(withoutCarts(loadData()), throughText(saveGame(game)));
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.equal(snapshot(loaded.game), snapshot(game));
  run(game, 900);
  run(loaded.game, 900);
  assert.equal(snapshot(loaded.game), snapshot(game));
  // Saved right after a close, the undo comes back too.
  close(game, jacks[0]);
  const fresh = loadGame(withoutCarts(loadData()), throughText(saveGame(game)));
  assert.equal(fresh.ok, true, `${fresh.reason}: ${fresh.detail}`);
  assert.equal(execute(fresh.game, { action: 'undo' }).ok, true);
  assert.equal(fresh.game.state.buildings.find((b) => b.id === jacks[0].id).production.closed, undefined);
});

test('a save with a wrong closed mark is refused as damaged', () => {
  const game = richGame();
  const [jack, other] = lumberjacks(game, 2);
  close(game, jack);
  run(game, 400); // long enough that the close can no longer be undone
  const at = (save, building) => save.state.buildings.find((b) => b.id === building.id);
  const tampers = {
    'a closed mark that is not "true"': (s) => { at(s, jack).production.closed = 'yes'; },
    'a closed mark of false': (s) => { at(s, other).production.closed = false; },
    'closed, but said to be working': (s) => { at(s, jack).production.status = 'working'; },
    'open, but said to be closed': (s) => { at(s, other).production.status = 'closed'; },
    'an undo that closes a house': (s) => { s.state.undo = { kind: 'close', id: 999, status: 'working', untilTick: 9999 }; },
    'an undo with an unknown status word': (s) => { s.state.undo = { kind: 'close', id: jack.id, status: 'asleep', untilTick: 9999 }; },
    'an undo of a close on an open building': (s) => { s.state.undo = { kind: 'close', id: other.id, status: 'working', untilTick: 9999 }; },
    'an undo of a reopen on a closed building': (s) => { s.state.undo = { kind: 'reopen', id: jack.id, status: 'closed', untilTick: 9999 }; },
  };
  for (const [name, tamper] of Object.entries(tampers)) {
    const save = throughText(saveGame(game));
    tamper(save);
    assert.equal(loadGame(withoutCarts(loadData()), save).reason, 'damaged', name);
  }
  assert.equal(loadGame(withoutCarts(loadData()), throughText(saveGame(game))).ok, true);
});

test('a game in which nothing is ever closed holds no trace of closing', () => {
  // So a game saved before closing existed is a game of today, with no change.
  const game = createGame(loadData());
  runBot(game, loadOrder('standard'), { maxMinutes: 12 });
  assert.equal(snapshot(game).includes('closed'), false);
  assert.equal(getSummary(game).closedProducers, 0);
});

test('the same game with closings played twice is the same game', () => {
  const play = () => {
    const game = richGame();
    const jacks = lumberjacks(game, 8);
    run(game, 100);
    close(game, jacks[2]);
    run(game, 333);
    close(game, jacks[5]);
    reopen(game, jacks[2]);
    run(game, 500);
    return snapshot(game);
  };
  assert.equal(play(), play());
});

// ---- on screen ---------------------------------------------------------------------------

test('a producer\'s panel offers to close it, and a closed one offers to reopen', () => {
  const game = richGame();
  const [jack] = lumberjacks(game, 1);
  let model = panelModel(game, jack);
  assert.deepEqual(model.actions.map((a) => a.id), ['closeBuilding', 'demolish']);
  assert.deepEqual(model.actions[0], { id: 'closeBuilding', label: 'Close for now', detail: 'Frees its 2 staff. It makes nothing and still costs its upkeep.', enabled: true, reason: null });

  close(game, jack);
  model = panelModel(game, jack);
  assert.deepEqual(model.lines[0], { label: 'Status', value: 'Closed. It makes nothing.', level: 'warn' });
  assert.deepEqual(model.lines.find((l) => l.label === 'Staff'), { label: 'Staff', value: 'None while closed (2 when open)' });
  assert.deepEqual(model.actions.map((a) => a.id), ['reopenBuilding', 'demolish']);
  assert.deepEqual(model.actions[0], { id: 'reopenBuilding', label: 'Reopen', detail: 'It goes back to work. Needs 2 staff.', enabled: true, reason: null });
  assert.equal(model.level, 'ok', 'a closed building is not shown as a problem');

  // Houses, markets and warehouses have no such button.
  game.state.goods.wood = 100;
  const market = buildMarket(game);
  const house = place(game, 'house', 16, 11);
  for (const building of [market, house, game.state.buildings[0]]) {
    assert.equal(panelModel(game, building).actions.some((a) => /Building$/.test(a.id)), false);
  }
});

test('a closed producer with no road says the road is the problem', () => {
  const game = richGame();
  const jack = place(game, 'lumberjack', 7, 7);
  close(game, jack);
  const model = panelModel(game, jack);
  assert.deepEqual(model.lines[0], { label: 'Status', value: 'Not connected to a warehouse by road.', level: 'bad' });
  assert.equal(model.actions[0].id, 'reopenBuilding');
});

test('with no staff rule a producer can still be closed, and the button does not mention staff', () => {
  const game = richGame({ change: (d) => { delete d.config.workforce; } });
  const [jack] = lumberjacks(game, 1);
  assert.equal(panelModel(game, jack).actions[0].detail, 'It makes nothing and still costs its upkeep.');
  close(game, jack);
  assert.equal(panelModel(game, jack).actions[0].detail, 'It goes back to work.');
  run(game, 300);
  assert.equal(game.state.goods.wood, 0);
});

test('a closed town short of staff: the slowed line shows only on open buildings', () => {
  const game = richGame();
  const jacks = lumberjacks(game, 8);
  close(game, jacks[0]);
  assert.equal(panelModel(game, jacks[0]).lines.find((l) => l.label === 'Staff').value, 'None while closed (2 when open)');
  assert.equal(panelModel(game, jacks[1]).lines.find((l) => l.label === 'Staff').value, 'Needs 2. Town is short: 85% speed');
});

test('the words for closing: the top bar, the undo button and refusals', () => {
  const game = richGame();
  const jacks = lumberjacks(game, 8);
  close(game, jacks[0]);
  let summary = getSummary(game);
  let text = staffText(game.rules, summary.staff, summary.closedProducers);
  assert.equal(text.value, '2 short');
  assert.match(text.title, /85% speed\. Build more houses, or close a building you can spare\. 1 building is closed and needs none\.$/);
  // After the word, how many steps Undo has waiting (the lumberjacks were just built).
  assert.match(undoLabel(game.rules, undoStatus(game)), /^Closing \(\d+\)$/);

  close(game, jacks[1]);
  close(game, jacks[2]);
  summary = getSummary(game);
  text = staffText(game.rules, summary.staff, summary.closedProducers);
  assert.equal(text.value, '2 spare');
  assert.match(text.title, /full speed\. 3 buildings are closed and need none\.$/);
  reopen(game, jacks[2]);
  assert.match(undoLabel(game.rules, undoStatus(game)), /^Reopening \(\d+\)$/);
  // With nothing closed the hover text does not mention closing at all.
  assert.doesNotMatch(staffText(game.rules, getSummary(richGame()).staff, 0).title, /closed/);

  assert.equal(reasonText(game, 'not_a_producer'), 'Only buildings that make things can be closed.');
  assert.equal(reasonText(game, 'already_closed'), 'It is already closed.');
  assert.equal(reasonText(game, 'not_closed'), 'It is not closed.');
});

test('tips: closing buildings ends the staff tip, and a closed maker is named when its good runs out', () => {
  const game = richGame();
  const jacks = lumberjacks(game, 8);
  game.state.goods.wood = 100;
  const advisor = createAdvisor(game.rules);
  const tipAfter = (seconds) => {
    let tip = null;
    for (let i = 0; i < seconds * game.rules.ticksPerSecond; i++) {
      run(game, 1);
      tip = advisor.update(game);
    }
    return tip;
  };
  assert.equal(tipAfter(35), 'Your buildings are short of staff and work at 75% speed. Build more houses, or close a building you can spare.');
  close(game, jacks[0]);
  close(game, jacks[1]);
  assert.equal(tipAfter(5), null);

  // Every lumberjack closed and no wood left: the tip is to reopen, not to build another.
  for (const jack of jacks.slice(2)) close(game, jack);
  game.state.goods.wood = 0;
  assert.equal(tipAfter(40), 'Your lumberjack is closed. Reopen it.');
  reopen(game, jacks[4]);
  assert.doesNotMatch(String(tipAfter(40)), /closed/);
});
