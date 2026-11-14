// What comes after the win: wool and cloth, Artisan houses, and a second goal.
// Also the promise that a game saved before these existed can still be continued.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { canPlace, canUpgrade, createGame, execute, getSummary, loadGame, saveGame, step } from '../src/sim/index.js';
import { compileRules, rulesStamp, stableText } from '../src/sim/rules.js';
import { createAdvisor } from '../src/ui/advice.js';
import { currentGoal, milestoneMessage, reasonText, upgradePathText, winMessage } from '../src/ui/text.js';
import { runBot } from '../tools/bot/bot.js';
import { loadOrder } from '../tools/tune.mjs';
import { buildMarket, dataBefore, fillHouse, HOUSE_SITES, line, place, richGame, road, run, runSeconds, snapshot, testGame } from './helpers.js';

const throughText = (value) => JSON.parse(JSON.stringify(value));

// The data files as they were before wool, cloth and Artisans were added
// (and so before everything added after them, too).
const olderData = () => dataBefore(0);

// ---- the new chain ---------------------------------------------------------------

test('the new goods, buildings and tier are in the data, with a key and a drawing each', () => {
  const { rules } = createGame(loadData());
  assert.deepEqual(rules.goodIds, ['wood', 'planks', 'fish', 'grain', 'bread', 'wool', 'cloth']);
  assert.deepEqual(Object.keys(rules.tiers), ['farmer', 'worker', 'artisan']);
  for (const id of ['sheepfarm', 'weaver']) {
    const def = rules.buildings[id];
    assert.equal(def.category, 'producer');
    assert.ok(def.visual.art && def.key, `${id} needs a drawing and a key`);
  }
  // No two buildings share a shortcut key.
  const keys = Object.values(rules.buildings).map((b) => b.key);
  assert.equal(new Set(keys).size, keys.length, `two buildings share a key: ${keys.join(' ')}`);
  assert.deepEqual(rules.tiers.farmer.andAbove, ['farmer', 'worker', 'artisan']);
  assert.deepEqual(rules.tiers.worker.andAbove, ['worker', 'artisan']);
  assert.deepEqual(rules.tiers.artisan.andAbove, ['artisan']);
});

test('a sheep farm makes wool and a weaver turns two wool into one cloth', () => {
  const game = testGame({ coins: 5000, goods: { wood: 100, planks: 100 } });
  road(game, line(12, 10, 12, 14));
  const farm = place(game, 'sheepfarm', 13, 11);
  const weaver = place(game, 'weaver', 13, 13);
  assert.equal(farm.connected && weaver.connected, true);
  assert.equal(game.state.goods.wool, 0);
  assert.equal(weaver.production.status, 'working');
  run(game, 1);
  assert.equal(weaver.production.status, 'missing_input', 'the weaver waits for wool');

  const cycle = game.rules.buildings.sheepfarm.production.cycleTicks;
  run(game, cycle * 2);
  // Two wool made, and both taken by the weaver for its first cloth.
  assert.equal(weaver.production.active, true);
  assert.equal(game.state.goods.wool, 0);
  run(game, game.rules.buildings.weaver.production.cycleTicks);
  assert.equal(game.state.goods.cloth, 1);

  // Over a long stretch nothing is created or lost: every cloth cost two wool.
  runSeconds(game, 600);
  const woolMade = Math.floor(game.state.tick / cycle);
  const inTheLoom = weaver.production.active ? 2 : 0;
  assert.equal(game.state.goods.wool + game.state.goods.cloth * 2 + inTheLoom, woolMade);
});

test('a sheep farm needs pasture, and says so', () => {
  const game = richGame();
  assert.equal(canPlace(game, 'sheepfarm', 13, 11).ok, true);
  const crowded = richGame({ change: (d) => { d.buildings.sheepfarm.placement.terrainInRadius.minTiles = 500; } });
  const check = canPlace(crowded, 'sheepfarm', 13, 11);
  assert.deepEqual(check, { ok: false, reason: 'needs_grass' });
  assert.equal(reasonText(crowded, check.reason, { building: 'sheepfarm' }), 'Needs 500 or more grass tiles within 3 tiles.');
});

// ---- Artisans ----------------------------------------------------------------------

function workerHouse() {
  const game = richGame();
  buildMarket(game);
  const house = fillHouse(game, place(game, 'house', HOUSE_SITES[0][0], HOUSE_SITES[0][1]));
  assert.equal(execute(game, { action: 'upgrade', id: house.id }).ok, true);
  fillHouse(game, house);
  return { game, house };
}

test('a full Worker house becomes an Artisan house, for coins and planks, once there is cloth', () => {
  const { game, house } = workerHouse();
  const cost = game.rules.tiers.worker.upgrade.cost;
  game.state.goods.cloth = 0;
  assert.deepEqual(canUpgrade(game, house.id), { ok: false, reason: 'no_cloth' });
  assert.equal(reasonText(game, 'no_cloth'), 'No cloth in stock.');
  game.state.goods.cloth = 5;
  game.state.goods.planks = 20;
  const coinsBefore = game.state.coinsMilli;
  assert.equal(execute(game, { action: 'upgrade', id: house.id }).ok, true);
  assert.equal(house.house.tier, 'artisan');
  assert.equal(house.house.residents, 8, 'the Workers stay');
  assert.equal(game.state.coinsMilli, coinsBefore - cost.coinsMilli);
  assert.equal(game.state.goods.planks, 20 - cost.goods.planks);
  fillHouse(game, house);
  assert.equal(house.house.residents, 12);
  assert.ok('cloth' in house.house.met);
});

test('Artisans need fish, bread and cloth, and leave without cloth', () => {
  const { game, house } = workerHouse();
  execute(game, { action: 'upgrade', id: house.id });
  fillHouse(game, house);
  const artisan = game.rules.tiers.artisan;
  assert.deepEqual(Object.keys(artisan.needs), ['fish', 'bread', 'cloth']);
  // Twelve Artisans eat cloth at the rate in the data: 0.05 each a minute.
  game.state.goods.cloth = 50;
  run(game, 20 * game.rules.ticksPerMinute);
  const eaten = 50 - game.state.goods.cloth;
  assert.ok(Math.abs(eaten - 12 * 0.05 * 20) <= 1, `12 Artisans used ${eaten} cloth in 20 minutes`);

  // Plenty of everything but cloth.
  for (let i = 0; i < artisan.needs.cloth.hungerThreshold + game.rules.population.declineTicks * 4; i++) {
    game.state.goods.cloth = 0;
    step(game);
  }
  assert.equal(house.house.met.cloth, false);
  assert.ok(house.house.residents < 12, 'nobody left although there was no cloth');
  assert.equal(house.house.tier, 'artisan', 'a house never moves back down');
});

test('an Artisan pays more tax than a Worker, who pays more than a Farmer', () => {
  const { tiers } = createGame(loadData()).rules;
  assert.ok(tiers.artisan.taxMilliPerMinute > tiers.worker.taxMilliPerMinute);
  assert.ok(tiers.worker.taxMilliPerMinute > tiers.farmer.taxMilliPerMinute);
  assert.ok(tiers.artisan.capacity > tiers.worker.capacity);
});

// ---- the win, and the goal after it ----------------------------------------------

// A town with residents set by hand: [tier, residents] for each house.
function townOf(houses) {
  const game = richGame();
  buildMarket(game);
  houses.forEach(([tier, residents], i) => {
    const house = place(game, 'house', HOUSE_SITES[i][0], HOUSE_SITES[i][1]);
    house.house.tier = tier;
    house.house.residents = residents;
  });
  return game;
}

test('the win counts Workers or better, so upgrading to Artisans never moves it away', () => {
  // Capacities are ignored here: only the counting is under test.
  let game = townOf([['worker', 60], ['artisan', 39], ['farmer', 500]]);
  run(game, 1);
  assert.equal(game.state.won, false, '99 Workers or better is not enough, and Farmers do not count');
  assert.equal(getSummary(game).win.current, 99);

  game = townOf([['worker', 60], ['artisan', 40]]);
  run(game, 1);
  assert.equal(game.state.won, true);
  assert.equal(getSummary(game).win.current, 100);

  game = townOf([['artisan', 100]]);
  run(game, 1);
  assert.equal(game.state.won, true, 'a hundred Artisans and no Workers is still a win');
});

test('the goal after the win is reached at 100 Artisans, recorded once, and never taken back', () => {
  const game = townOf([['worker', 100], ['artisan', 99]]);
  run(game, 3);
  assert.equal(game.state.won, true);
  assert.deepEqual(game.state.milestones, [null]);
  let goal = getSummary(game).milestones[0];
  assert.deepEqual([goal.tier, goal.target, goal.current, goal.reachedAtTick], ['artisan', 100, 99, null]);

  game.state.buildings.find((b) => b.house?.tier === 'artisan').house.residents = 100;
  run(game, 1);
  const reachedAt = game.state.tick;
  assert.deepEqual(game.state.milestones, [reachedAt]);
  run(game, 50);
  game.state.buildings.find((b) => b.house?.tier === 'artisan').house.residents = 3;
  run(game, 50);
  assert.deepEqual(game.state.milestones, [reachedAt], 'the goal was taken back or recorded again');
  goal = getSummary(game).milestones[0];
  assert.equal(goal.reachedAtSeconds, reachedAt / game.rules.ticksPerSecond);
});

test('the goal bar follows the win first, then the goal after it', () => {
  const game = townOf([['worker', 40]]);
  run(game, 1);
  const { rules } = game;
  assert.deepEqual(currentGoal(rules, getSummary(game)), { tier: 'worker', target: 100, current: 40, reached: false, title: null });

  game.state.buildings.find((b) => b.house).house.residents = 100;
  run(game, 1);
  assert.deepEqual(currentGoal(rules, getSummary(game)), { tier: 'artisan', target: 100, current: 0, reached: false, title: 'A city of Artisans' });

  const house = game.state.buildings.find((b) => b.house);
  house.house.tier = 'artisan';
  run(game, 1);
  const done = currentGoal(rules, getSummary(game));
  assert.deepEqual([done.tier, done.current, done.reached], ['artisan', 100, true]);

  // A game with no goals after the win stays on the win.
  const plain = richGame({ change: (d) => { delete d.config.milestones; } });
  plain.state.won = true;
  plain.state.wonAtTick = 5;
  assert.equal(currentGoal(plain.rules, getSummary(plain)).tier, 'worker');
  assert.deepEqual(plain.state.milestones, []);
});

test('the win screen says what comes next, and the last goal says there is no more', () => {
  const game = townOf([['worker', 100]]);
  run(game, 1);
  const { rules } = game;
  const win = winMessage(rules, getSummary(game), game.state.buildings.length);
  assert.equal(win.title, 'You win!');
  assert.match(win.detail, /^100 Workers live on your island\. It took 0:00 of game time\.$/);
  assert.match(win.stats, /coins and \d+ buildings\.$/);
  assert.equal(win.next, 'There is more, if you want it. Next goal: 100 Artisans.');

  game.state.buildings.find((b) => b.house).house.tier = 'artisan';
  run(game, 1);
  const last = milestoneMessage(rules, getSummary(game), 0, game.state.buildings.length);
  assert.equal(last.title, 'A city of Artisans');
  assert.match(last.detail, /^100 Artisans live on your island\./);
  assert.equal(last.next, 'That was the last goal. The island is yours.');
  assert.equal(win.medal, null, 'the standard game has no medals');
  for (const text of [win.title, win.detail, win.stats, win.next, ...Object.values(last)]) assert.doesNotMatch(String(text), /undefined|null|_/);

  assert.equal(upgradePathText(rules), 'Farmer to Worker, Worker to Artisan');
});

test('the tip line follows a cloth shortage back to wool', () => {
  const { game, house } = workerHouse();
  execute(game, { action: 'upgrade', id: house.id });
  game.state.goods.cloth = 0;
  const advisor = createAdvisor(game.rules, { patienceSeconds: 5 });
  const tipAfter = (seconds) => {
    let tip = null;
    for (let i = 0; i < seconds * game.rules.ticksPerSecond; i++) {
      game.state.goods.cloth = Math.min(game.state.goods.cloth, 0);
      step(game);
      tip = advisor.update(game);
    }
    return tip;
  };
  assert.equal(tipAfter(60), 'Nobody is making cloth. Build a weaver.');
  road(game, line(12, 12, 12, 15));
  place(game, 'weaver', 10, 13);
  game.state.goods.wool = 0;
  assert.equal(tipAfter(60), 'Nobody is making wool. Build a sheep farm.');
});

// ---- balance, as played by the bot -------------------------------------------------

let played = null;
const artisansGame = () => (played ??= (() => {
  const game = createGame(loadData());
  const result = runBot(game, loadOrder('artisans'), { maxMinutes: 120 });
  return { game, result };
})());

test('GATE: the bot still wins in 25 to 40 minutes, then reaches 100 Artisans 15 to 30 minutes later', () => {
  const { result } = artisansGame();
  assert.equal(result.won, true);
  assert.ok(result.wonAtMinutes >= 25 && result.wonAtMinutes <= 40, `won at ${result.wonAtMinutes.toFixed(1)} minutes`);
  const goal = result.milestones[0];
  assert.notEqual(goal.reachedAtMinutes, null, `only ${goal.current} Artisans after ${result.endedAtMinutes.toFixed(0)} minutes`);
  const after = goal.reachedAtMinutes - result.wonAtMinutes;
  assert.ok(after >= 15 && after <= 30, `the goal came ${after.toFixed(1)} minutes after the win`);
  assert.equal(result.stepsDone, result.stepsTotal);
});

test('the first act is untouched: the same order wins at the same moment with or without the second act', () => {
  const standard = createGame(loadData());
  const first = runBot(standard, loadOrder('standard'));
  assert.equal(artisansGame().result.wonAtMinutes, first.wonAtMinutes);
});

test('the second act never runs the town out of coins, and it ends richer than it began', () => {
  const { result } = artisansGame();
  assert.equal(result.zeroCoinMinutes, 0);
  assert.equal(result.lossMinutes, 0);
  const afterWin = result.samples.filter((s) => s.minute > Math.ceil(result.wonAtMinutes));
  const lowest = Math.min(...afterWin.map((s) => s.net));
  assert.ok(lowest >= 10, `income fell to ${lowest.toFixed(1)} a minute after the win`);
  const atWin = result.samples.find((s) => s.minute === Math.ceil(result.wonAtMinutes)).net;
  assert.ok(result.summary.income.net > atWin, `income ended at ${result.summary.income.net.toFixed(1)}, no better than ${atWin.toFixed(1)} at the win`);
  assert.equal(result.stalls.filter((s) => s.doneAtSeconds / 60 > result.wonAtMinutes).length, 0, 'a step after the win waited more than 5 minutes');
});

test('the second act also works on other islands', () => {
  for (const seed of [42, 7, 2025]) {
    const game = createGame(loadData(), { seed });
    const result = runBot(game, loadOrder('artisans'), { maxMinutes: 120 });
    const goal = result.milestones[0];
    assert.notEqual(goal.reachedAtMinutes, null, `island ${seed}: only ${goal.current} Artisans, stuck on ${result.stuckOn?.label} (${result.stuckOn?.waitedFor})`);
    assert.ok(goal.reachedAtMinutes - result.wonAtMinutes <= 35, `island ${seed}: ${(goal.reachedAtMinutes - result.wonAtMinutes).toFixed(1)} minutes after the win`);
  }
});

// ---- saved games from before -------------------------------------------------------

test('the stamp of the data without the later additions is the stamp older saves carry', () => {
  const now = compileRules(loadData());
  assert.ok(now.olderStamps.length >= 1);
  assert.notEqual(now.olderStamps[0].stamp, now.stamp);
  assert.equal(rulesStamp(olderData()), now.olderStamps[0].stamp);
  assert.deepEqual(compileRules(olderData()).olderStamps, [], 'data with no additions listed has no older stamps');
});

test('a game saved before Artisans existed can be continued, and plays on as it would have', () => {
  const before = createGame(olderData());
  runBot(before, loadOrder('standard'), { maxMinutes: 18 });
  assert.deepEqual(Object.keys(before.state.goods), ['wood', 'planks', 'fish', 'grain', 'bread']);
  assert.equal('milestones' in before.state && before.state.milestones.length, 0);
  const save = throughText(saveGame(before));
  delete save.state.milestones; // a save that old has no such list at all
  delete save.state.undo;
  delete save.state.staffClock;

  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  const game = loaded.game;
  assert.equal(game.state.goods.wool, 0);
  assert.equal(game.state.goods.cloth, 0);
  assert.deepEqual(game.state.milestones, [null]);
  assert.ok(game.rules.buildings.weaver, 'the continued game has the new buildings to build');

  // Left alone, it runs exactly as the old game does.
  run(before, 4000);
  run(game, 4000);
  const shared = (state) => {
    const copy = throughText(state);
    delete copy.goods.wool;
    delete copy.goods.cloth;
    delete copy.milestones;
    delete copy.undo; // the old game still remembers its last action, long since too late to undo
    // Entries added back on loading come last, so compare what is there, not the order.
    return stableText(copy);
  };
  assert.equal(shared(game.state), shared(before.state));

  // And it saves and loads from here on as a game of today.
  const again = loadGame(loadData(), throughText(saveGame(game)));
  assert.equal(again.ok, true);
  assert.equal(snapshot(again.game), snapshot(game));
});

test('a won game from before can go on to the new goal', () => {
  const before = createGame(olderData());
  assert.equal(runBot(before, loadOrder('standard')).won, true);
  const loaded = loadGame(loadData(), throughText(saveGame(before)));
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  const game = loaded.game;
  assert.equal(game.state.won, true);
  assert.deepEqual(game.state.milestones, [null]);
  // The second act of the build order, played from here.
  const order = loadOrder('artisans');
  const second = { ...order, steps: order.steps.slice(order.steps.findIndex((s) => s.build === 'sheepfarm') - 1) };
  const result = runBot(game, second, { maxMinutes: 120 });
  assert.notEqual(result.milestones[0].reachedAtMinutes, null, `only ${result.milestones[0].current} Artisans: stuck on ${result.stuckOn?.label} (${result.stuckOn?.waitedFor})`);
});

test('an older save is still refused if one of the old rules has changed', () => {
  const before = createGame(olderData());
  runBot(before, loadOrder('standard'), { maxMinutes: 8 });
  const save = throughText(saveGame(before));
  const changed = loadData();
  changed.buildings.house.cost.coins = 12;
  assert.equal(loadGame(changed, save).reason, 'rules_changed');
  // Changing one of the new numbers does not matter to it: it has none of the new things.
  const tuned = loadData();
  tuned.buildings.weaver.cost.coins = 200;
  tuned.population.tiers.artisan.capacity = 14;
  assert.equal(loadGame(tuned, save).ok, true);
  // A save of today is refused by that same change, as any rule change refuses it.
  const today = throughText(saveGame(createGame(loadData())));
  assert.equal(loadGame(tuned, today).reason, 'rules_changed');
});

test('a save with a wrong list of goals after the win is refused as damaged', () => {
  const game = createGame(loadData());
  run(game, 100);
  for (const tamper of [(s) => { s.milestones = []; }, (s) => { s.milestones = [null, null]; }, (s) => { s.milestones = ['soon']; }, (s) => { s.milestones = [-4]; }, (s) => { delete s.milestones; }]) {
    const save = throughText(saveGame(game));
    tamper(save.state);
    assert.equal(loadGame(loadData(), save).reason, 'damaged', String(tamper));
  }
});

// ---- data mistakes -----------------------------------------------------------------

test('mistakes in the new parts of the data files are refused with a clear message', () => {
  const bad = [
    [(d) => { d.config.milestones = 'later'; }, /milestones must be a list/],
    [(d) => { d.config.milestones[0].tier = 'noble'; }, /milestones\[0\]\.tier names an unknown tier "noble"/],
    [(d) => { d.config.milestones[0].residents = 0; }, /milestones\[0\]\.residents/],
    [(d) => { d.config.milestones[0].title = 5; }, /title must be text/],
    [(d) => { d.config.addedLater[0].spells = ['fire']; }, /addedLater\[0\] has an unknown entry "spells"/],
    [(d) => { d.config.addedLater[0].goods = 'wool'; }, /addedLater\[0\]\.goods must be a list of names/],
    [(d) => { d.config.addedLater = { spells: ['fire'] }; }, /addedLater has an unknown entry "spells"/],
    [(d) => { d.config.addedLater = [5]; }, /addedLater\[0\] must be an object/],
    [(d) => { d.population.tiers.artisan.upgrade = { to: 'farmer', cost: { coins: 1, goods: {} } }; }, /upgrades in a circle|must not hold fewer/],
    [(d) => { d.population.tiers.artisan.needs.silk = 0.1; }, /unknown good "silk"/],
    [(d) => { d.buildings.weaver.production.inputs = { yarn: 1 }; }, /unknown good "yarn"/],
  ];
  for (const [change, pattern] of bad) assert.throws(() => testGame({ change }), pattern, String(change));
});
