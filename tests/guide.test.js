// The first-game guide: the steps in data/guide.json, the tests that tick them
// off, and the rule for which step the player is on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { createFlag } from '../src/platform/flagStore.js';
import { createGame, execute, loadGame, saveGame, step } from '../src/sim/index.js';
import { rulesStamp } from '../src/sim/rules.js';
import { conditionMet, createGuideTracker, guideProblems } from '../src/ui/guide.js';
import { runBot } from '../tools/bot/bot.js';
import { loadOrder } from '../tools/tune.mjs';
import { buildMarket, HOUSE_SITES, place, richGame, road, run, snapshot, testGame } from './helpers.js';
import { playMiniCity } from './scenario.js';

const GUIDE = loadData().guide;

test('the shipped guide has no mistakes in it', () => {
  const game = createGame(loadData());
  assert.deepEqual(guideProblems(game.rules, GUIDE), []);
  assert.ok(GUIDE.steps.length >= 8 && GUIDE.steps.length <= 16);
  for (const s of GUIDE.steps) {
    assert.ok(s.text.length <= 70, `"${s.text}" is too long for the panel`);
    assert.ok(typeof s.why === 'string' && s.why.length > 10, `"${s.text}" does not say why`);
    assert.doesNotMatch(s.text + s.why, /_|undefined/);
  }
  // It passes through the win, and ends at the last goal after it.
  assert.equal(GUIDE.steps.filter((s) => s.done.won === true).length, 1);
  assert.deepEqual(GUIDE.steps[GUIDE.steps.length - 1].done, { milestones: game.rules.milestones.length });
});

test('the guide is loaded with the data, and is not one of the rules', () => {
  const data = loadData();
  assert.ok(Array.isArray(data.guide.steps));
  const changed = loadData();
  changed.guide.steps = changed.guide.steps.slice(0, 2);
  changed.guide.steps[0].text = 'Something else entirely';
  assert.equal(rulesStamp(changed), rulesStamp(data), 'editing the guide would make saved games unusable');
  const none = loadData();
  delete none.guide;
  assert.equal(rulesStamp(none), rulesStamp(data));
  // The game itself runs the same with or without it.
  assert.equal(snapshot(createGame(none)), snapshot(createGame(data)));
});

test('a guide with mistakes is refused, with a sentence for each', () => {
  const { rules } = createGame(loadData());
  const ok = { text: 'Build a house', done: { buildings: 'house', atLeast: 1 } };
  assert.deepEqual(guideProblems(rules, { steps: [ok] }), []);
  const bad = [
    [null, /steps/],
    [{}, /steps/],
    [{ steps: [] }, /between 1 and 20/],
    [{ steps: Array(21).fill(ok) }, /between 1 and 20/],
    [{ steps: ['build'] }, /step 1 is not a step/],
    [{ steps: [{ done: ok.done }] }, /step 1 needs "text"/],
    [{ steps: [{ text: 'x'.repeat(91), done: ok.done }] }, /needs "text"/],
    [{ steps: [{ text: 'Go', why: 7, done: ok.done }] }, /"why"/],
    [{ steps: [{ text: 'Go' }] }, /no "done" test/],
    [{ steps: [{ text: 'Go', done: [] }] }, /empty list/],
    [{ steps: [{ text: 'Go', done: {} }] }, /exactly one kind/],
    [{ steps: [{ text: 'Go', done: { people: 4, won: true } }] }, /exactly one kind/],
    [{ steps: [{ text: 'Go', done: { buildings: 'castle', atLeast: 1 } }] }, /unknown building "castle"/],
    [{ steps: [{ text: 'Go', done: { buildings: 'road', atLeast: 1 } }] }, /unknown building "road"/],
    [{ steps: [{ text: 'Go', done: { buildings: 'house' } }] }, /atLeast/],
    [{ steps: [{ text: 'Go', done: { buildings: 'house', atLeast: 1, connected: false } }] }, /connected/],
    [{ steps: [{ text: 'Go', done: { houses: 'noble', atLeast: 1 } }] }, /unknown kind of resident "noble"/],
    [{ steps: [{ text: 'Go', done: { stock: 'gold', atLeast: 1 } }] }, /unknown good "gold"/],
    [{ steps: [{ text: 'Go', done: { stock: 'fish', atLeast: 0 } }] }, /atLeast/],
    [{ steps: [{ text: 'Go', done: { people: 2.5 } }] }, /whole number/],
    [{ steps: [{ text: 'Go', done: { housesServed: -1 } }] }, /whole number/],
    [{ steps: [{ text: 'Go', done: { won: false } }] }, /"won" can only be true/],
    [{ steps: [{ text: 'Go', done: { milestones: 5 } }] }, /"milestones" must be a whole number, at most 1/],
    [{ steps: [ok, { text: 'Go', done: [ok.done, { stock: 'gold', atLeast: 1 }] }] }, /step 2, test 2 names an unknown good/],
  ];
  for (const [guide, pattern] of bad) {
    const problems = guideProblems(rules, guide);
    assert.ok(problems.length >= 1, `accepted: ${JSON.stringify(guide)?.slice(0, 80)}`);
    assert.match(problems.join('\n'), pattern);
  }
});

test('each kind of "done" test counts the right thing', () => {
  const game = richGame();
  const met = (condition) => conditionMet(game, condition);
  assert.equal(met({ buildings: 'lumberjack', atLeast: 1 }), false);
  place(game, 'lumberjack', 8, 4);
  assert.equal(met({ buildings: 'lumberjack', atLeast: 1 }), true);
  assert.equal(met({ buildings: 'lumberjack', atLeast: 2 }), false);
  assert.equal(met({ buildings: 'lumberjack', atLeast: 1, connected: true }), false, 'it has no road yet');
  road(game, [[10, 8], [10, 7], [10, 6], [10, 5], [10, 4], [9, 4]]);
  assert.equal(met({ buildings: 'lumberjack', atLeast: 1, connected: true }), true);

  assert.equal(met({ housesServed: 1 }), false);
  const house = place(game, 'house', HOUSE_SITES[0][0], HOUSE_SITES[0][1]);
  assert.equal(met({ houses: 'farmer', atLeast: 1 }), true);
  assert.equal(met({ housesServed: 1 }), false, 'there is no market yet');
  buildMarket(game);
  assert.equal(met({ housesServed: 1 }), true);
  assert.equal(met({ housesServed: 2 }), false);

  assert.equal(met({ people: 1 }), false);
  house.house.residents = 3;
  assert.equal(met({ people: 3 }), true);
  assert.equal(met({ people: 4 }), false);
  assert.equal(met({ houses: 'worker', atLeast: 1 }), false);
  house.house.tier = 'worker';
  assert.equal(met({ houses: 'worker', atLeast: 1 }), true);

  game.state.goods.bread = 4;
  assert.equal(met({ stock: 'bread', atLeast: 5 }), false);
  game.state.goods.bread = 5;
  assert.equal(met({ stock: 'bread', atLeast: 5 }), true);

  assert.equal(met({ won: true }), false);
  game.state.won = true;
  assert.equal(met({ won: true }), true);

  assert.equal(met({ milestones: 1 }), false);
  game.state.milestones[0] = 12345;
  assert.equal(met({ milestones: 1 }), true);

  // A list needs every test in it.
  assert.equal(met([{ people: 3 }, { stock: 'bread', atLeast: 5 }]), true);
  assert.equal(met([{ people: 3 }, { stock: 'bread', atLeast: 6 }]), false);
  // Something this file does not understand is simply not met.
  assert.equal(met({ dragons: 2 }), false);
});

test('a new game starts on the first step', () => {
  const game = createGame(loadData());
  const model = createGuideTracker(game, GUIDE).update();
  assert.equal(model.total, GUIDE.steps.length);
  assert.equal(model.done, 0);
  assert.equal(model.at, 0);
  assert.equal(model.finished, false);
  assert.equal(model.current.text, GUIDE.steps[0].text);
  assert.equal(model.current.why, GUIDE.steps[0].why);
  assert.equal(model.steps.length, GUIDE.steps.length);
  assert.ok(model.steps.every((s) => s.done === false));
});

test('playing the scripted mini-city ticks every step but the win, and never unticks one', () => {
  const game = testGame();
  const tracker = createGuideTracker(game, GUIDE);
  let last = tracker.update();
  assert.equal(last.at, 0);
  const asked = new Set([0]);
  playMiniCity(game, () => {
    const model = tracker.update();
    assert.ok(model.done >= last.done, 'a step was unticked');
    assert.ok(model.at >= last.at, 'the guide went back to an earlier step');
    model.steps.forEach((s, i) => assert.ok(s.done || !last.steps[i].done, `step ${i + 1} was unticked`));
    asked.add(model.at);
    last = model;
  });
  const winStep = GUIDE.steps.findIndex((s) => s.done.won === true);
  assert.equal(last.done, winStep);
  assert.equal(last.at, winStep, 'after the first upgrade, the win is the step being asked for');
  assert.equal(last.finished, false);
  // The mini-city builds its sawmill early, before anyone has moved in. The
  // guide ticked it then, and still asked for the residents in their turn.
  const index = (test) => GUIDE.steps.findIndex(test);
  assert.ok(asked.has(index((s) => s.done.people)), 'the guide never asked for residents');
  assert.ok(!asked.has(index((s) => s.done.buildings === 'sawmill')), 'the sawmill was asked for after it was built');
});

test('through a full winning game the guide only moves forward, and finishes at the win', () => {
  // The bot cannot be paused and resumed, so the same game is played again to
  // each stopping point. It is the same game every time, only longer.
  let last = 0;
  const places = [];
  for (const minutes of [1, 2, 4, 6, 9, 12, 16, 20, 24, 27]) {
    const game = createGame(loadData());
    runBot(game, loadOrder('standard'), { maxMinutes: minutes });
    const model = createGuideTracker(game, GUIDE).update();
    assert.ok(model.at >= last, `the guide is further back at ${minutes} minutes than before`);
    assert.equal(model.finished, false, `the guide finished at ${minutes} minutes, before the win`);
    last = model.at;
    places.push(model.at);
  }
  // The bot builds its whole opening in the first minute, sawmill included, so
  // a game picked up there is already well along. It then moves on at least once more.
  assert.ok(places[0] >= 4, `after 1 minute the bot is only on step ${places[0] + 1}`);
  assert.ok(new Set(places).size >= 2, `the guide never moved: ${places.join(', ')}`);
  const winStep = GUIDE.steps.findIndex((s) => s.done.won === true);
  assert.equal(last, winStep, 'late in the game the win should be the step asked for');

  const game = createGame(loadData());
  assert.equal(runBot(game, loadOrder('standard')).won, true);
  // At the win the guide moves on to what comes after it.
  const atWin = createGuideTracker(game, GUIDE).update();
  assert.equal(atWin.at, winStep + 1);
  assert.equal(atWin.finished, false);
  assert.match(atWin.current.text, /Sheep farm/);

  // Played on to the last goal, every step is ticked.
  const long = createGame(loadData());
  const result = runBot(long, loadOrder('artisans'), { maxMinutes: 90 });
  assert.notEqual(result.milestones[0].reachedAtMinutes, null);
  const end = createGuideTracker(long, GUIDE).update();
  assert.equal(end.finished, true);
  assert.equal(end.current, null);
  assert.ok(end.steps.every((s) => s.done));
});

test('a step done out of order is ticked, but the guide still asks for the first one missing', () => {
  const game = richGame();
  const tracker = createGuideTracker(game, GUIDE);
  assert.equal(tracker.update().at, 0);
  // A market first, before any lumberjack or fisherman.
  buildMarket(game);
  const marketStep = GUIDE.steps.findIndex((s) => s.done.buildings === 'market');
  let model = tracker.update();
  assert.equal(model.steps[marketStep].done, true);
  assert.equal(model.done, 1);
  assert.equal(model.at, 0, 'the lumberjack is still the step to do');
  assert.equal(model.current.text, GUIDE.steps[0].text);
  // The market is demolished. Its step stays ticked: the guide does not ask for it again.
  execute(game, { action: 'demolish', x: 13, y: 11 });
  assert.equal(game.state.buildings.some((b) => b.type === 'market'), false);
  model = tracker.update();
  assert.equal(model.steps[marketStep].done, true);
  // Doing the first steps moves the guide on, past the market, to the houses.
  place(game, 'lumberjack', 8, 4);
  road(game, [[10, 8], [10, 7], [10, 6], [10, 5], [10, 4], [9, 4]]);
  place(game, 'fisherman', 2, 9);
  road(game, [[9, 9], [8, 9], [7, 9], [6, 9], [5, 9], [4, 9], [3, 9]]);
  model = tracker.update();
  assert.equal(model.at, marketStep + 1);
  assert.equal(model.current.text, GUIDE.steps[marketStep + 1].text);
});

test('a game picked up later starts just past the furthest step that is true', () => {
  const game = createGame(loadData());
  runBot(game, loadOrder('standard'), { maxMinutes: 14 });
  const along = createGuideTracker(game, GUIDE).update();
  assert.ok(along.at >= 6, `a game picked up at 14 minutes starts on step ${along.at + 1}`);
  assert.ok(along.steps.slice(0, along.at).every((s) => s.done));
  // Even a step whose test is no longer true: the people moved out, but the guide does not go back.
  const emptied = loadGame(loadData(), JSON.parse(JSON.stringify(saveGame(game)))).game;
  for (const b of emptied.state.buildings) if (b.house) b.house.residents = 1;
  assert.equal(createGuideTracker(emptied, GUIDE).update().at, along.at);
  // The same after saving and loading, since nothing about the guide is saved.
  const loaded = loadGame(loadData(), JSON.parse(JSON.stringify(saveGame(game)))).game;
  assert.deepEqual(createGuideTracker(loaded, GUIDE).update(), along);
});

test('the guide never changes the game', () => {
  const game = createGame(loadData());
  runBot(game, loadOrder('standard'), { maxMinutes: 10 });
  const tracker = createGuideTracker(game, GUIDE);
  const before = snapshot(game);
  for (let i = 0; i < 50; i++) tracker.update();
  assert.equal(snapshot(game), before);
  const twin = createGame(loadData());
  runBot(twin, loadOrder('standard'), { maxMinutes: 10 });
  for (let i = 0; i < 600; i++) {
    step(game);
    step(twin);
    tracker.update();
  }
  assert.equal(snapshot(game), snapshot(twin));
});

test('no guide, or an empty one, shows nothing and breaks nothing', () => {
  const game = createGame(loadData());
  for (const guide of [undefined, null, {}, { steps: [] }]) {
    const model = createGuideTracker(game, guide).update();
    assert.equal(model.total, 0);
    assert.equal(model.current, null);
    assert.equal(model.finished, true);
  }
});

// ---- remembering that the guide was hidden ------------------------------------

test('a yes-or-no choice is remembered, and bad storage never breaks it', () => {
  const storage = { items: new Map(), getItem(k) { return this.items.get(k) ?? null; }, setItem(k, v) { this.items.set(k, v); } };
  const first = createFlag(storage, 'hidden');
  assert.equal(first.get(), false);
  first.set(true);
  assert.equal(createFlag(storage, 'hidden').get(), true);
  assert.equal(createFlag(storage, 'something-else').get(), false);
  first.set(false);
  assert.equal(createFlag(storage, 'hidden', true).get(), false, 'a stored "no" beats the default');
  assert.equal(createFlag(storage, 'unset', true).get(), true);

  storage.items.set('hidden', 'maybe');
  assert.equal(createFlag(storage, 'hidden').get(), false);

  const none = createFlag(null, 'hidden');
  none.set(true);
  assert.equal(none.get(), true);
  const broken = createFlag({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, 'hidden');
  broken.set(true);
  assert.equal(broken.get(), true);
  broken.set('yes');
  assert.equal(broken.get(), false, 'only true means yes');
  run(createGame(loadData()), 1);
});
