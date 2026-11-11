// Phase 2 gate: the bot must win a full game inside the target time.
// These tests play whole games on the real island with the shipped data, so
// they are the ones most likely to fail after tuning. That is their job.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { createGame, getSummary } from '../src/sim/index.js';
import { runBot } from '../tools/bot/bot.js';
import { loadOrder } from '../tools/tune.mjs';
import { readFileSync } from 'node:fs';
import { snapshot } from './helpers.js';

const TARGET_MIN = 25;
const TARGET_MAX = 40;

function play(orderName, { seed, maxMinutes } = {}) {
  const data = loadData();
  if (seed !== undefined) data.map.seed = seed;
  const game = createGame(data);
  const result = runBot(game, loadOrder(orderName), { maxMinutes });
  return { game, result };
}

// The standard game on the shipped island is used by several tests. Play it once.
let cached = null;
const standard = () => (cached ??= play('standard'));

test('GATE: the standard build order wins on the shipped island in 25 to 40 minutes', () => {
  const { result } = standard();
  assert.equal(result.won, true, `did not win: stuck on ${result.stuckOn?.label} (${result.stuckOn?.waitedFor})`);
  assert.ok(
    result.wonAtMinutes >= TARGET_MIN && result.wonAtMinutes <= TARGET_MAX,
    `won at ${result.wonAtMinutes.toFixed(1)} minutes`,
  );
});

test('the standard run has no long waits and never sits at zero coins', () => {
  const { result } = standard();
  assert.deepEqual(result.stalls.map((s) => `${s.label}: ${s.waitedFor}`), [], 'no step waits more than 5 minutes');
  assert.ok(result.zeroCoinMinutes < 1, `at zero coins for ${result.zeroCoinMinutes.toFixed(1)} minutes`);
});

test('income at the win is about +40 coins a minute', () => {
  const { result } = standard();
  const net = result.summary.income.net;
  assert.ok(net >= 30 && net <= 50, `net income at the win is ${net.toFixed(1)}`);
});

test('the mid-game dip in income stays above +10 coins a minute', () => {
  const { result } = standard();
  const lowest = Math.min(...result.samples.filter((s) => s.minute >= 5).map((s) => s.net));
  assert.ok(lowest >= 10, `net income fell to ${lowest.toFixed(1)} a minute`);
});

test('everything the bot builds ends up connected, and no road it planned was refused', () => {
  const { game, result } = standard();
  for (const b of game.state.buildings) {
    if (game.rules.buildings[b.type].requiresRoad) assert.equal(b.connected, true, `${b.type} at ${b.x},${b.y}`);
  }
  assert.deepEqual(result.log.filter((e) => e.note).map((e) => e.note), []);
});

test('the bot is repeatable: two runs end in exactly the same game', () => {
  const a = play('standard');
  const b = play('standard');
  assert.equal(snapshot(a.game), snapshot(b.game));
  assert.equal(a.result.wonAtMinutes, b.result.wonAtMinutes);
});

test('the standard order wins in 25 to 40 minutes on five other islands', () => {
  for (const seed of [11, 42, 2024, 7919, 90210]) {
    const { result } = play('standard', { seed });
    assert.equal(result.won, true, `seed ${seed} did not win`);
    assert.ok(
      result.wonAtMinutes >= TARGET_MIN && result.wonAtMinutes <= TARGET_MAX,
      `seed ${seed} won at ${result.wonAtMinutes.toFixed(1)} minutes`,
    );
  }
});

test('a careless order (one lumberjack, late fishermen) still wins inside 40 minutes', () => {
  const { result } = play('careless');
  assert.equal(result.won, true, `did not win: stuck on ${result.stuckOn?.label} (${result.stuckOn?.waitedFor})`);
  assert.ok(result.wonAtMinutes <= TARGET_MAX, `won at ${result.wonAtMinutes.toFixed(1)} minutes`);
});


// ---- no dead ends ----------------------------------------------------------
// Before tuning, both of these stranded the bot at zero coins for good.
// See docs/TESTLOG.md, Phase 2.

test('a reckless order (the whole bread chain before any house) still wins, with no demolishing', () => {
  const { result } = play('bread-first', { maxMinutes: 90 });
  assert.equal(result.won, true, `did not win: stuck on ${result.stuckOn?.label} (${result.stuckOn?.waitedFor})`);
  assert.ok(result.wonAtMinutes <= 60, `won at ${result.wonAtMinutes.toFixed(1)} minutes`);
  assert.ok(result.zeroCoinMinutes < 2, `at zero coins for ${result.zeroCoinMinutes.toFixed(1)} minutes`);
});

test('a player with nothing at all (zero coins, empty stockpile) can still build up and win', () => {
  const game = createGame(loadData());
  game.state.coinsMilli = 0;
  for (const good of game.rules.goodIds) game.state.goods[good] = 0;
  assert.ok(getSummary(game).income.net > 0, 'the bare island earns something');

  // With no planks there can be no market until a sawmill exists, so wood and planks come first.
  const fromNothing = {
    name: 'From nothing',
    steps: [
      { build: 'lumberjack' }, { build: 'sawmill' }, { build: 'fisherman' }, { build: 'market' },
      { build: 'house', count: 5 }, { build: 'lumberjack' }, { build: 'fisherman' }, { build: 'house', count: 5 },
      { build: 'fisherman' }, { build: 'house', count: 4 }, { build: 'farm', count: 2 }, { build: 'bakery' },
      { build: 'fisherman' }, { upgrade: 6 }, { build: 'fisherman' }, { build: 'farm', count: 2 },
      { build: 'bakery' }, { build: 'fisherman' }, { upgrade: 8 },
    ],
  };
  let lowestNet = Infinity;
  const result = runBot(game, fromNothing, { maxMinutes: 120 });
  for (const sample of result.samples) lowestNet = Math.min(lowestNet, sample.net);
  assert.equal(result.won, true, `did not win: stuck on ${result.stuckOn?.label} (${result.stuckOn?.waitedFor})`);
  assert.ok(lowestNet > 0, `income fell to ${lowestNet.toFixed(1)} a minute on the way`);
  assert.ok(result.wonAtMinutes <= 75, `won at ${result.wonAtMinutes.toFixed(1)} minutes`);
});

// ---- a person's pace (added in Phase 6) -----------------------------------------
// The delays in tools/bot/paces.json are guesses about how fast people act.

const paces = JSON.parse(readFileSync(new URL('../tools/bot/paces.json', import.meta.url), 'utf8'));

test('at a typical person\'s pace the standard order still wins inside 40 minutes', () => {
  for (const seed of [1, 2, 3]) {
    const game = createGame(loadData());
    const result = runBot(game, loadOrder('standard'), { pace: { seed, ...paces.typical } });
    assert.equal(result.won, true, `seed ${seed} did not win`);
    assert.ok(result.thinkingMinutes > 4, 'the bot really did pause between actions');
    assert.ok(result.wonAtMinutes <= TARGET_MAX, `seed ${seed} won at ${result.wonAtMinutes.toFixed(1)} minutes`);
  }
});

test('even at a slow pace the standard order wins inside 40 minutes', () => {
  for (const seed of [1, 2, 3]) {
    const game = createGame(loadData());
    const result = runBot(game, loadOrder('standard'), { pace: { seed, ...paces.slow } });
    assert.equal(result.won, true, `seed ${seed} did not win`);
    assert.ok(result.wonAtMinutes <= TARGET_MAX, `seed ${seed} won at ${result.wonAtMinutes.toFixed(1)} minutes`);
  }
});

test('a paced run is repeatable for the same seed and differs for another', () => {
  const run = (seed) => runBot(createGame(loadData()), loadOrder('standard'), { pace: { seed, ...paces.typical } }).wonAtMinutes;
  assert.equal(run(5), run(5));
  assert.notEqual(run(5), run(6));
});
