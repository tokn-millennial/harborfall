// Scenarios: games with their own island, start and goal, picked on the title
// screen. The standard game must not notice that they exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from '../src/platform/loadData.node.js';
import { createRecords } from '../src/platform/records.js';
import { createGame, getSummary, loadGame, medalFor, saveGame, staffing } from '../src/sim/index.js';
import { compileRules, rulesStamp, withScenario } from '../src/sim/rules.js';
import { currentGoal, medalTimesText, scenarioGoalText, staffSourceText, winMessage } from '../src/ui/text.js';
import { savedGameLine, titleModel } from '../src/ui/titleModel.js';
import { runBot } from '../tools/bot/bot.js';
import { loadOrder } from '../tools/tune.mjs';
import { run, snapshot, testGame } from './helpers.js';

const throughText = (value) => JSON.parse(JSON.stringify(value));
const paces = JSON.parse(readFileSync(new URL('../tools/bot/paces.json', import.meta.url), 'utf8'));
const IDS = ['fishing-village', 'weavers-guild', 'short-handed'];
// The build order written for each scenario.
const ORDER = { 'fishing-village': 'village', 'weavers-guild': 'guild', 'short-handed': 'standard' };
const play = (scenario, options = {}) => {
  const game = createGame(loadData(), { scenario });
  const result = runBot(game, loadOrder(ORDER[scenario]), options);
  return { game, result };
};

// A stand-in for the browser's storage box.
function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => { items.set(k, String(v)); }, items };
}

// ---- what a scenario is ------------------------------------------------------------

test('three scenarios are offered, each with a name, a goal and medal times', () => {
  const { rules } = createGame(loadData());
  assert.deepEqual(rules.scenarios.map((s) => s.id), IDS);
  for (const s of rules.scenarios) {
    assert.ok(s.name.length > 3 && s.about.length > 20, `${s.id} needs a name and a description`);
    assert.ok(rules.tiers[s.win.tier], `${s.id} has a goal`);
    assert.ok(s.medals.goldTicks > 0 && s.medals.silverTicks > s.medals.goldTicks, `${s.id} needs medal times`);
    assert.doesNotMatch(`${s.name} ${s.about}`, /undefined|null|_/);
  }
  assert.deepEqual(rules.scenarios.map((s) => scenarioGoalText(rules, s)), ['120 Farmers', '60 Artisans', '100 Workers']);
  // The standard game is not a scenario and has no medals.
  assert.equal(rules.scenario, null);
  assert.equal(rules.medals, null);
});

test('the fishing village: the standard island and start, 120 Farmers to win, nothing after', () => {
  const standard = createGame(loadData());
  const game = createGame(loadData(), { scenario: 'fishing-village' });
  assert.equal(game.rules.scenario, 'fishing-village');
  assert.deepEqual(game.rules.win, { tier: 'farmer', residents: 120 });
  assert.deepEqual(game.rules.milestones, []);
  assert.deepEqual(game.state.milestones, []);
  assert.deepEqual(game.rules.medals, { goldTicks: 7800, silverTicks: 12000 });
  assert.equal(game.state.map.seed, standard.state.map.seed);
  assert.equal(game.state.coinsMilli, standard.state.coinsMilli);
  assert.deepEqual(game.state.goods, standard.state.goods);
  assert.deepEqual(game.rules.workforce, standard.rules.workforce);
});

test('the weavers\' guild: its own island, a well-off start, 60 Artisans to win', () => {
  const game = createGame(loadData(), { scenario: 'weavers-guild' });
  assert.deepEqual(game.rules.win, { tier: 'artisan', residents: 60 });
  assert.equal(game.state.map.seed, 42);
  assert.equal(game.state.coinsMilli, 1000000);
  assert.equal(game.state.goods.wood, 60);
  assert.equal(game.state.goods.planks, 60);
  assert.equal(game.state.goods.fish, 0);
  assert.deepEqual(game.rules.milestones, []);
});

test('short-handed: a larger first crew, and only 1 resident in 4 works', () => {
  const standard = createGame(loadData());
  const game = createGame(loadData(), { scenario: 'short-handed' });
  assert.deepEqual(game.rules.workforce, { base: 16, perResidentMilli: 250 });
  assert.equal(staffSourceText(game.rules), '16 to begin with, and 1 for every 4 residents');
  assert.deepEqual(staffing(game), { on: true, needed: 0, available: 16, ratioMilli: 1000 });
  assert.equal(game.state.map.seed, 2024);
  assert.deepEqual(game.rules.win, standard.rules.win, 'the goal is the standard one');
  assert.equal(game.state.coinsMilli, standard.state.coinsMilli);
});

test('asking for an island by number still works in a scenario', () => {
  assert.equal(createGame(loadData(), { scenario: 'weavers-guild', seed: 7 }).state.map.seed, 7);
});

test('applying a scenario leaves the data files as they were', () => {
  const data = loadData();
  const before = JSON.stringify(data);
  const applied = withScenario(data, 'weavers-guild');
  assert.equal(JSON.stringify(data), before);
  assert.notEqual(applied, data);
  assert.equal(applied.config.start.coins, 1000);
  assert.equal(data.config.start.coins, 500);
  assert.equal(withScenario(data, null), data, 'no scenario: the very same data');
  assert.throws(() => withScenario(data, 'moon-base'), /no scenario called "moon-base"/);
  assert.throws(() => createGame(loadData(), { scenario: 'constructor' }), /no scenario called "constructor"/);
});

// ---- the standard game does not notice -----------------------------------------------

test('the standard game is the same game with or without the scenarios in the data', () => {
  const without = loadData();
  delete without.config.scenarios;
  assert.equal(rulesStamp(loadData()), rulesStamp(without));
  const a = createGame(loadData());
  const b = createGame(without);
  assert.equal(a.rules.stamp, b.rules.stamp);
  run(a, 500);
  run(b, 500);
  assert.equal(snapshot(a), snapshot(b));
  assert.equal(getSummary(a).win.medal, null);
});

test('each scenario is played under rules of its own, and its looks do not count', () => {
  const stamps = [null, ...IDS].map((scenario) => createGame(loadData(), { scenario }).rules.stamp);
  assert.equal(new Set(stamps).size, 4, 'two of the four games share a rules stamp');
  // Names, descriptions and medal times can change without touching a saved game.
  const looks = loadData();
  looks.config.scenarios['fishing-village'].name = 'Herring town';
  looks.config.scenarios['fishing-village'].about = 'Another description.';
  looks.config.scenarios['fishing-village'].medals = { gold: 5, silver: 6 };
  assert.equal(createGame(looks, { scenario: 'fishing-village' }).rules.stamp, stamps[1]);
  // Its goal cannot.
  const goal = loadData();
  goal.config.scenarios['fishing-village'].win.residents = 130;
  assert.notEqual(createGame(goal, { scenario: 'fishing-village' }).rules.stamp, stamps[1]);
});

// ---- medals --------------------------------------------------------------------------

test('a medal goes by the time of the win: gold, silver, and bronze for any later finish', () => {
  const { rules } = createGame(loadData(), { scenario: 'fishing-village' });
  assert.equal(medalFor(rules, null), null, 'no medal before the win');
  assert.equal(medalFor(rules, 1), 'gold');
  assert.equal(medalFor(rules, 7800), 'gold', '13 minutes exactly is still gold');
  assert.equal(medalFor(rules, 7801), 'silver');
  assert.equal(medalFor(rules, 12000), 'silver');
  assert.equal(medalFor(rules, 12001), 'bronze');
  assert.equal(medalFor(rules, 999999), 'bronze');
  assert.equal(medalFor(createGame(loadData()).rules, 100), null, 'the standard game has no medals');
  assert.equal(medalTimesText(rules, rules.medals), 'Gold within 13 minutes, silver within 20.');
  assert.equal(medalTimesText(rules, null), '');
  const halves = createGame(loadData(), { scenario: 'weavers-guild' }).rules;
  assert.equal(medalTimesText(halves, { goldTicks: 4500, silverTicks: 9000 }), 'Gold within 7.5 minutes, silver within 15.');
});

// ---- the whole game, by the bot --------------------------------------------------------

test('GATE: every scenario can be won, for gold at a brisk hand and silver at a slow one', () => {
  for (const scenario of IDS) {
    const { game, result } = play(scenario);
    const medals = game.rules.medals;
    assert.equal(result.won, true, `${scenario}: stuck on ${result.stuckOn?.label} (${result.stuckOn?.waitedFor})`);
    assert.equal(result.summary.win.medal, 'gold', `${scenario} took ${result.wonAtMinutes.toFixed(1)} minutes`);
    assert.ok(result.zeroCoinMinutes < 0.5, `${scenario} ran out of coins for ${result.zeroCoinMinutes.toFixed(1)} minutes`);
    // Gold must be earned: the bot, which never hesitates, has no more than a third of the time to spare.
    assert.ok(game.state.wonAtTick > medals.goldTicks * 0.66, `${scenario}: gold is too easy (${result.wonAtMinutes.toFixed(1)} minutes)`);

    const typical = play(scenario, { pace: { seed: 1, ...paces.typical } });
    assert.equal(typical.result.summary.win.medal, 'gold', `${scenario} at a typical pace took ${typical.result.wonAtMinutes?.toFixed(1)} minutes`);
    const slow = play(scenario, { pace: { seed: 1, ...paces.slow } });
    assert.equal(slow.result.won, true, `${scenario} at a slow pace did not win`);
    assert.notEqual(slow.result.summary.win.medal, 'bronze', `${scenario} at a slow pace took ${slow.result.wonAtMinutes.toFixed(1)} minutes`);
  }
});

test('the fishing village is won with Farmers alone, in about ten minutes', () => {
  const { game, result } = play('fishing-village');
  assert.ok(result.wonAtMinutes > 8 && result.wonAtMinutes < 13, `won at ${result.wonAtMinutes.toFixed(1)} minutes`);
  const summary = getSummary(game);
  assert.deepEqual(summary.residents, { farmer: 120, worker: 0, artisan: 0 });
  assert.deepEqual(summary.milestones, []);
  // With no goal after the win, the goal bar stays on the win.
  assert.deepEqual(currentGoal(game.rules, summary), { tier: 'farmer', target: 120, current: 120, reached: true, title: null });
});

test('short-handed is short of staff for much of the game, as its name says', () => {
  const { result } = play('short-handed');
  assert.ok(result.shortStaffMinutes > 10, `short for only ${result.shortStaffMinutes.toFixed(1)} minutes`);
  assert.ok(result.lowestStaffPercent >= 60, `production fell to ${result.lowestStaffPercent}%`);
  // The same build order on the standard game is never short.
  const standard = createGame(loadData());
  assert.equal(runBot(standard, loadOrder('standard')).shortStaffMinutes, 0);
});

test('the weavers\' guild stalls without Farmer houses to staff it, and houses set it going again', () => {
  const order = loadOrder('guild');
  const bare = { ...order, steps: order.steps.filter((s) => !(s.build === 'house' && s.count === 4)) };
  assert.equal(bare.steps.length, order.steps.length - 1);
  const game = createGame(loadData(), { scenario: 'weavers-guild' });
  const stalled = runBot(game, bare, { maxMinutes: 45 });
  assert.equal(stalled.won, false, 'the guild won with no one to staff it');
  assert.equal(getSummary(game).staff.short, true);
  // Not a dead end: four more houses, and the town reaches its goal.
  const rescued = runBot(game, { name: 'rescue', steps: [{ build: 'house', count: 4 }] }, { maxMinutes: 75 });
  assert.equal(rescued.won, true, `still stuck with ${getSummary(game).win.current} Artisans`);
});

// ---- saved games -----------------------------------------------------------------------

test('a scenario game is saved with its scenario and comes back exactly', () => {
  for (const scenario of IDS) {
    const game = createGame(loadData(), { scenario });
    runBot(game, loadOrder(ORDER[scenario]), { maxMinutes: 6 });
    const save = throughText(saveGame(game));
    assert.equal(save.scenario, scenario);
    const loaded = loadGame(loadData(), save);
    assert.equal(loaded.ok, true, `${scenario}: ${loaded.reason} ${loaded.detail}`);
    assert.equal(loaded.game.rules.scenario, scenario);
    assert.deepEqual(loaded.game.rules.win, game.rules.win);
    assert.equal(snapshot(loaded.game), snapshot(game));
    run(game, 700);
    run(loaded.game, 700);
    assert.equal(snapshot(loaded.game), snapshot(game));
  }
});

test('a standard game saved before scenarios existed still loads as a standard game', () => {
  const game = createGame(loadData());
  runBot(game, loadOrder('standard'), { maxMinutes: 8 });
  const save = throughText(saveGame(game));
  assert.equal(save.scenario, null);
  delete save.scenario; // a save that old has no such entry
  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.equal(loaded.game.rules.scenario, null);
  assert.equal(snapshot(loaded.game), snapshot(game));
});

test('a scenario save is refused when its scenario is gone or its rules have changed, not when its looks have', () => {
  const game = createGame(loadData(), { scenario: 'weavers-guild' });
  run(game, 200);
  const save = throughText(saveGame(game));

  const gone = loadData();
  delete gone.config.scenarios['weavers-guild'];
  assert.equal(loadGame(gone, save).reason, 'rules_changed');
  const none = loadData();
  delete none.config.scenarios;
  assert.equal(loadGame(none, save).reason, 'rules_changed');

  const changed = loadData();
  changed.config.scenarios['weavers-guild'].startCoins = 1200;
  assert.equal(loadGame(changed, save).reason, 'rules_changed');

  const looks = loadData();
  looks.config.scenarios['weavers-guild'].medals = { gold: 20, silver: 30 };
  looks.config.scenarios['weavers-guild'].name = 'The guild';
  assert.equal(loadGame(looks, save).ok, true);

  // It is not mistaken for another scenario, or for the standard game.
  assert.equal(loadGame(loadData(), { ...save, scenario: 'fishing-village' }).reason, 'rules_changed');
  assert.equal(loadGame(loadData(), { ...save, scenario: null }).reason, 'rules_changed');
  assert.equal(loadGame(loadData(), { ...save, scenario: 7 }).reason, 'rules_changed');
  // And a change to another scenario does not touch it.
  const other = loadData();
  other.config.scenarios['fishing-village'].win.residents = 200;
  assert.equal(loadGame(other, save).ok, true);
});

// ---- data mistakes -----------------------------------------------------------------------

test('mistakes in a scenario are refused with a clear message, even if that scenario is not being played', () => {
  const at = (d) => d.config.scenarios['fishing-village'];
  const bad = [
    [(d) => { d.config.scenarios = ['village']; }, /config\.scenarios must be an object/],
    [(d) => { d.config.scenarios.broken = 'yes'; }, /config\.scenarios\.broken must be an object/],
    [(d) => { delete at(d).name; }, /scenarios\.fishing-village needs a name/],
    [(d) => { at(d).about = 5; }, /about must be text/],
    [(d) => { at(d).seed = 1.5; }, /scenarios\.fishing-village\.seed/],
    [(d) => { at(d).startCoins = -5; }, /scenarios\.fishing-village\.startCoins/],
    [(d) => { at(d).startGoods = { gold: 5 }; }, /unknown good "gold"/],
    [(d) => { at(d).win = { tier: 'noble', residents: 10 }; }, /win\.tier names an unknown tier "noble"/],
    [(d) => { at(d).win = { tier: 'farmer', residents: 0 }; }, /win\.residents/],
    [(d) => { at(d).win = 'many'; }, /win must be an object/],
    [(d) => { at(d).milestones = 'later'; }, /milestones must be a list/],
    [(d) => { at(d).milestones = [{ tier: 'noble', residents: 5 }]; }, /milestones\[0\]\.tier names an unknown tier/],
    [(d) => { at(d).workforce = { base: 0, perResident: 0.5 }; }, /workforce\.base/],
    [(d) => { at(d).medals = { gold: 20, silver: 10 }; }, /silver must be a longer time than gold/],
    [(d) => { at(d).medals = { gold: 0, silver: 10 }; }, /medals\.gold/],
    [(d) => { at(d).medals = 'shiny'; }, /medals must be an object/],
    [(d) => { at(d).taxMultiplier = 2; }, /has an unknown setting "taxMultiplier"/],
  ];
  for (const [change, pattern] of bad) assert.throws(() => testGame({ change }), pattern, String(change));
  // A note inside a scenario is allowed, and a scenario with no medals has none.
  const game = createGame((() => { const d = loadData(); at(d)._note = 'a note'; delete at(d).medals; return d; })(), { scenario: 'fishing-village' });
  assert.equal(game.rules.medals, null);
  assert.equal(game.rules.scenarios[0].medals, null);
});

// ---- the title screen and the win screen -------------------------------------------------

test('the title screen lists the scenarios with their goals and medal times', () => {
  const { rules } = createGame(loadData());
  const model = titleModel({ saved: null, canSave: true, rules });
  assert.deepEqual(model.scenarios.map((s) => [s.id, s.name, s.goal, s.medals, s.best, s.confirm]), [
    ['fishing-village', 'Fishing village', 'Goal: 120 Farmers.', 'Gold within 13 minutes, silver within 20.', null, null],
    ['weavers-guild', 'The weavers\' guild', 'Goal: 60 Artisans.', 'Gold within 24 minutes, silver within 32.', null, null],
    ['short-handed', 'Short-handed', 'Goal: 100 Workers.', 'Gold within 35 minutes, silver within 45.', null, null],
  ]);
  // The usual buttons are as they were.
  assert.deepEqual(model.buttons.map((b) => b.id), ['new', 'random']);
  // With no rules to read them from, none are offered.
  assert.deepEqual(titleModel({ saved: null, canSave: true }).scenarios, []);
});

test('the title screen shows the best time in each scenario, and warns before replacing a saved game', () => {
  const { rules } = createGame(loadData());
  const records = createRecords(fakeStorage());
  records.report('fishing-village', 6320, 'gold');
  records.report('short-handed', 26000, 'silver');
  const saved = { ok: true, game: createGame(loadData()) };
  const model = titleModel({ saved, canSave: true, rules, records });
  assert.deepEqual(model.scenarios.map((s) => s.best), ['Your best: 10:32, gold.', null, 'Your best: 43:20, silver.']);
  for (const s of model.scenarios) assert.equal(s.confirm, 'Press again. This replaces your saved game.');
});

test('a saved scenario game is named on the Continue button', () => {
  const { game } = play('fishing-village', { maxMinutes: 5 });
  const line = savedGameLine(game);
  assert.match(line, /^Fishing village, 5:0\d played, \d+ of 120 Farmers, \d+ coins$/);
  assert.doesNotMatch(savedGameLine(createGame(loadData())), /village|guild|handed/);
});

test('the win screen names the medal in a scenario, and has none in the standard game', () => {
  const { game } = play('fishing-village');
  const message = winMessage(game.rules, getSummary(game), game.state.buildings.length);
  assert.equal(message.title, 'You win!');
  assert.match(message.detail, /^120 Farmers live on your island\. It took 10:\d\d of game time\.$/);
  assert.deepEqual(message.medal, { kind: 'gold', text: 'Gold medal. Gold within 13 minutes, silver within 20.' });
  assert.equal(message.next, null, 'this scenario has no goal after the win');

  // A slow finish is bronze.
  const late = createGame(loadData(), { scenario: 'fishing-village' });
  runBot(late, loadOrder('village'), { pace: { seed: 3, ...paces.slow, thinkSeconds: [20, 30] } });
  assert.equal(late.state.won, true);
  assert.equal(winMessage(late.rules, getSummary(late), 1).medal.kind, 'bronze');
  assert.match(winMessage(late.rules, getSummary(late), 1).medal.text, /^Bronze medal\. /);

  const standard = createGame(loadData());
  runBot(standard, loadOrder('standard'));
  assert.equal(winMessage(standard.rules, getSummary(standard), 1).medal, null);
});

// ---- best times --------------------------------------------------------------------------

test('the best time in a scenario is kept, and only a faster win replaces it', () => {
  const storage = fakeStorage();
  const records = createRecords(storage);
  assert.equal(records.best('fishing-village'), null);
  assert.equal(records.report('fishing-village', 9000, 'silver'), true);
  assert.deepEqual(records.best('fishing-village'), { ticks: 9000, medal: 'silver' });
  assert.equal(records.report('fishing-village', 9500, 'silver'), false, 'a slower win replaced the record');
  assert.equal(records.report('fishing-village', 9000, 'silver'), false, 'an equal time is not a new best');
  assert.equal(records.report('fishing-village', 7000, 'gold'), true);
  assert.deepEqual(records.best('fishing-village'), { ticks: 7000, medal: 'gold' });
  assert.equal(records.best('short-handed'), null, 'one scenario does not set another\'s record');
  // It is still there on the next visit.
  assert.deepEqual(createRecords(storage).best('fishing-village'), { ticks: 7000, medal: 'gold' });
});

test('records survive a browser that will not store, and stored nonsense', () => {
  const none = createRecords(null);
  assert.equal(none.report('fishing-village', 100, 'gold'), true);
  assert.deepEqual(none.best('fishing-village'), { ticks: 100, medal: 'gold' });

  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  const still = createRecords(broken);
  assert.equal(still.best('fishing-village'), null);
  assert.equal(still.report('fishing-village', 100, 'gold'), true);
  assert.deepEqual(still.best('fishing-village'), { ticks: 100, medal: 'gold' });

  for (const junk of ['not json', '[1,2]', '"text"', '{"fishing-village":"fast"}', '{"fishing-village":{"ticks":-5}}', '{"fishing-village":{"ticks":1.5}}']) {
    const records = createRecords(fakeStorage({ 'harborfall.scenarios': junk }));
    assert.equal(records.best('fishing-village'), null, junk);
    assert.equal(records.report('fishing-village', 500, 'gold'), true, junk);
  }
  const records = createRecords(fakeStorage());
  for (const [id, ticks] of [[5, 100], ['a', -1], ['a', 1.5], ['a', 'fast'], [null, 100]]) assert.equal(records.report(id, ticks, 'gold'), false);
  assert.equal(records.best('constructor'), null);
  assert.equal(records.best('toString'), null);
});
