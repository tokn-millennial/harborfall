// Difficulty: Easy, Normal and Hard. Normal must be exactly the game as it was,
// and every difficulty must be winnable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { createGame, execute, getSummary, loadGame, saveGame } from '../src/sim/index.js';
import { rulesStamp, withDifficulty } from '../src/sim/rules.js';
import { savedGameLine, titleModel } from '../src/ui/titleModel.js';
import { runBot } from '../tools/bot/bot.js';
import { loadOrder } from '../tools/tune.mjs';
import { run, snapshot, testGame } from './helpers.js';

const throughText = (value) => JSON.parse(JSON.stringify(value));
const play = (orderName, difficulty, maxMinutes = 150) => {
  const game = createGame(loadData(), { difficulty });
  return { game, result: runBot(game, loadOrder(orderName), { maxMinutes }) };
};

test('there are three difficulties, and a new game is Normal unless told otherwise', () => {
  const game = createGame(loadData());
  assert.deepEqual(game.rules.difficulties.map((d) => d.id), ['easy', 'normal', 'hard']);
  assert.equal(game.rules.defaultDifficulty, 'normal');
  assert.equal(game.rules.difficulty, 'normal');
  for (const d of game.rules.difficulties) {
    assert.ok(d.name.length > 2 && d.about.length > 10, `${d.id} needs a name and a line about it`);
  }
});

test('Normal is exactly the game as it was before difficulties existed', () => {
  const data = loadData();
  const before = loadData();
  delete before.config.difficulties;
  delete before.config.defaultDifficulty;
  const old = createGame(before);
  assert.equal(old.rules.difficulty, null);
  assert.equal(snapshot(createGame(data)), snapshot(old));
  assert.equal(snapshot(createGame(data, { difficulty: 'normal' })), snapshot(old));
  assert.equal(createGame(data).rules.stamp, old.rules.stamp, 'the rules stamp moved, so saved games would be refused');
  assert.equal(rulesStamp(data), rulesStamp(before));
  // And it plays the same: the bot wins at the same moment.
  const a = runBot(createGame(data), loadOrder('standard'));
  const b = runBot(old, loadOrder('standard'));
  assert.equal(a.wonAtMinutes, b.wonAtMinutes);
});

test('Easy gives more coins, more base income and more tax, and Hard gives fewer coins and less tax', () => {
  const data = loadData();
  const normal = createGame(data).rules;
  const easy = createGame(data, { difficulty: 'easy' }).rules;
  const hard = createGame(data, { difficulty: 'hard' }).rules;
  assert.equal(normal.start.coinsMilli, 500000);
  assert.equal(easy.start.coinsMilli, 800000);
  assert.equal(hard.start.coinsMilli, 350000);
  assert.ok(easy.economy.baseIncomeMilliPerMinute > normal.economy.baseIncomeMilliPerMinute);
  assert.equal(hard.economy.baseIncomeMilliPerMinute, normal.economy.baseIncomeMilliPerMinute, 'Hard keeps the safety-net income');
  for (const tier of Object.keys(normal.tiers)) {
    assert.equal(easy.tiers[tier].taxMilliPerMinute, Math.round(normal.tiers[tier].taxMilliPerMinute * 1.15), tier);
    assert.equal(hard.tiers[tier].taxMilliPerMinute, Math.round(normal.tiers[tier].taxMilliPerMinute * 0.9), tier);
    // Nothing else about a tier moves.
    assert.deepEqual({ ...easy.tiers[tier], taxMilliPerMinute: 0 }, { ...normal.tiers[tier], taxMilliPerMinute: 0 });
  }
  assert.deepEqual(easy.buildings, normal.buildings);
  assert.deepEqual(hard.buildings, normal.buildings);
  assert.equal(createGame(data, { difficulty: 'easy' }).state.coinsMilli, 800000);
  // The data files as loaded are left alone.
  assert.deepEqual(data, loadData());
});

test('a difficulty that does not exist is refused, and data with none is left as it is', () => {
  assert.throws(() => createGame(loadData(), { difficulty: 'nightmare' }), /no difficulty called "nightmare"/);
  const none = loadData();
  delete none.config.difficulties;
  assert.equal(withDifficulty(none, 'easy'), none);
});

test('each difficulty has its own rules stamp, so a saved game cannot be loaded as another', () => {
  const data = loadData();
  const stamps = ['easy', 'normal', 'hard'].map((difficulty) => createGame(data, { difficulty }).rules.stamp);
  assert.equal(new Set(stamps).size, 3);

  const easy = createGame(data, { difficulty: 'easy', seed: 77 });
  run(easy, 500);
  const save = throughText(saveGame(easy));
  assert.equal(save.difficulty, 'easy');
  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.equal(loaded.game.rules.difficulty, 'easy');
  assert.equal(loaded.game.rules.start.coinsMilli, 800000);
  assert.equal(snapshot(loaded.game), snapshot(easy));
  run(easy, 3000);
  run(loaded.game, 3000);
  assert.equal(snapshot(loaded.game), snapshot(easy));

  for (const swap of ['hard', 'normal']) assert.equal(loadGame(loadData(), { ...save, difficulty: swap }).reason, 'rules_changed', swap);
  assert.equal(loadGame(loadData(), { ...save, difficulty: 'nightmare' }).reason, 'rules_changed');
});

test('a game saved before difficulties existed loads as Normal', () => {
  const game = createGame(loadData());
  run(game, 800);
  const save = throughText(saveGame(game));
  delete save.difficulty;
  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.equal(loaded.game.rules.difficulty, 'normal');
  assert.equal(snapshot(loaded.game), snapshot(game));
});

test('changing what Easy means refuses saved Easy games and leaves Normal ones alone', () => {
  const easy = throughText(saveGame(createGame(loadData(), { difficulty: 'easy' })));
  const normal = throughText(saveGame(createGame(loadData())));
  const changed = loadData();
  changed.config.difficulties.easy.startCoins = 2000;
  assert.equal(loadGame(changed, easy).reason, 'rules_changed');
  assert.equal(loadGame(changed, normal).ok, true);
  // A new name or description is not a change of rules.
  const renamed = loadData();
  renamed.config.difficulties.easy.name = 'Gentle';
  renamed.config.difficulties.easy.about = 'Take your time.';
  assert.equal(loadGame(renamed, easy).ok, true);
});

test('GATE: the sensible build orders win on every difficulty', () => {
  const times = {};
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (const order of ['standard', 'careless']) {
      const { result } = play(order, difficulty);
      assert.equal(result.won, true, `${order} on ${difficulty} did not win: stuck on ${result.stuckOn?.label} (${result.stuckOn?.waitedFor})`);
      assert.equal(result.zeroCoinMinutes, 0, `${order} on ${difficulty} ran out of coins`);
      times[`${order}/${difficulty}`] = result.wonAtMinutes;
    }
  }
  assert.ok(times['standard/normal'] >= 25 && times['standard/normal'] <= 40);
  assert.ok(times['standard/hard'] > times['standard/normal'], 'Hard is no slower than Normal');
  assert.ok(times['standard/hard'] <= 45, `Hard takes ${times['standard/hard'].toFixed(1)} minutes`);
  assert.ok(times['standard/easy'] <= times['standard/normal']);
  assert.ok(times['careless/easy'] <= times['careless/normal']);
});

test('Easy forgives the reckless opening that Normal only just survives', () => {
  const easy = play('bread-first', 'easy').result;
  const normal = play('bread-first', 'normal').result;
  assert.equal(easy.won && normal.won, true);
  assert.ok(easy.wonAtMinutes <= 40, `the reckless opening took ${easy.wonAtMinutes.toFixed(1)} minutes on Easy`);
  assert.ok(easy.wonAtMinutes < normal.wonAtMinutes - 10);
});

test('on Hard a reckless opening can strand a town, and demolishing is the way out', () => {
  const { game, result } = play('bread-first', 'hard', 60);
  assert.equal(result.won, false);
  const stuck = getSummary(game);
  assert.ok(stuck.coins < 10 && stuck.income.net <= 0, `expected a stranded town, got ${stuck.coins} coins at ${stuck.income.net} a minute`);

  // What the game tells the player to do: demolish what is costing money.
  for (const b of [...game.state.buildings]) {
    const type = game.rules.buildings[b.type];
    if (b.type === 'bakery' || b.type === 'farm') assert.equal(execute(game, { action: 'demolish', x: b.x, y: b.y }).ok, true, type.name);
  }
  const after = getSummary(game);
  assert.ok(after.income.net > 0, `still losing ${after.income.net} a minute after demolishing`);
  assert.ok(after.coins > stuck.coins, 'demolishing gave nothing back');
  // From there a sensible order wins: a market and houses first, for the taxes,
  // then the rest of the standard order.
  const steps = [{ build: 'market' }, { build: 'house', count: 5 }, { build: 'fisherman' }, ...loadOrder('standard').steps.slice(6)];
  const rescue = runBot(game, { name: 'rescue', steps }, { maxMinutes: 260 });
  assert.equal(rescue.won, true, `not rescued: stuck on ${rescue.stuckOn?.label} (${rescue.stuckOn?.waitedFor})`);
});

test('the second act is reachable on every difficulty', () => {
  for (const difficulty of ['easy', 'hard']) {
    const { result } = play('artisans', difficulty);
    const goal = result.milestones[0];
    assert.notEqual(goal.reachedAtMinutes, null, `${difficulty}: only ${goal.current} Artisans`);
    // Hard loosened in Phase 20 from 40 to 45 minutes: with materials carried, its
    // second act takes 41, and the bot can rarely spare coins for another warehouse.
    const limit = difficulty === 'hard' ? 45 : 40;
    assert.ok(goal.reachedAtMinutes - result.wonAtMinutes <= limit, `${difficulty}: ${(goal.reachedAtMinutes - result.wonAtMinutes).toFixed(1)} minutes after the win`);
  }
});

test('mistakes in the difficulties are refused with a clear message', () => {
  const bad = [
    [(d) => { d.config.difficulties = {}; }, /at least one difficulty/],
    [(d) => { d.config.difficulties.easy = 'yes'; }, /difficulties\.easy must be an object/],
    [(d) => { delete d.config.difficulties.hard.name; }, /difficulties\.hard needs a name/],
    [(d) => { d.config.difficulties.hard.taxMultiplier = 0; }, /taxMultiplier/],
    [(d) => { d.config.difficulties.hard.startCoins = 'few'; }, /startCoins/],
    [(d) => { d.config.difficulties.hard.luck = 2; }, /unknown setting "luck"/],
    [(d) => { d.config.defaultDifficulty = 'medium'; }, /defaultDifficulty names an unknown difficulty "medium"/],
  ];
  for (const [change, pattern] of bad) assert.throws(() => testGame({ change }), pattern, String(change));
});

// ---- on the title screen ----------------------------------------------------------

test('the title screen offers the difficulties, starting on Normal', () => {
  const { rules } = createGame(loadData());
  const model = titleModel({ saved: null, canSave: true, rules });
  assert.deepEqual(model.difficulties.map((d) => d.name), ['Easy', 'Normal', 'Hard']);
  assert.equal(model.difficulty, 'normal');
  assert.ok(model.difficulties.every((d) => d.about.length > 10));
  // With one difficulty, or none, there is nothing to choose.
  const one = testGame({ change: (d) => { d.config.difficulties = { normal: { name: 'Normal' } }; } }).rules;
  assert.deepEqual(titleModel({ saved: null, canSave: true, rules: one }).difficulties, []);
  assert.deepEqual(titleModel({ saved: null, canSave: true }).difficulties, []);
});

test('Continue names the difficulty of a saved game when it is not Normal', () => {
  const hard = createGame(loadData(), { difficulty: 'hard' });
  run(hard, 600);
  assert.match(savedGameLine(hard), /^1:00 played, 0 of 100 Workers, \d+ coins, Hard$/);
  const normal = createGame(loadData());
  run(normal, 600);
  assert.match(savedGameLine(normal), /^1:00 played, 0 of 100 Workers, \d+ coins$/);
});
