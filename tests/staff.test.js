// Staff: producing buildings need people, people come from residents, and a
// town that is short works slower. Also the promise that games saved before
// staff existed can still be continued.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { createGame, execute, getSummary, loadGame, saveGame, staffing } from '../src/sim/index.js';
import { addedSteps, compileRules, rulesStamp, stableText } from '../src/sim/rules.js';
import { createAdvisor } from '../src/ui/advice.js';
import { panelModel } from '../src/ui/panelModel.js';
import { buildingBlurb, staffSourceText, staffText } from '../src/ui/text.js';
import { runBot } from '../tools/bot/bot.js';
import { loadOrder } from '../tools/tune.mjs';
import { buildMarket, dataBefore, fillHouse, HOUSE_SITES, line, place, richGame, road, run, snapshot, testGame } from './helpers.js';

const throughText = (value) => JSON.parse(JSON.stringify(value));
const noStaffRule = (data) => { delete data.config.workforce; };

// Lumberjacks along two sides of the forest, all on one road to the
// warehouse. Each needs 2 staff. Up to 8 fit.
const JACK_SITES = [[7, 7], [6, 7], [5, 7], [4, 7], [8, 6], [8, 5], [8, 4], [8, 3]];
function lumberjacks(game, count) {
  const built = JACK_SITES.slice(0, count).map(([x, y]) => place(game, 'lumberjack', x, y));
  road(game, [...line(10, 8, 4, 8), ...line(9, 7, 9, 3)]);
  return built;
}

// Full Farmer houses near a market: 4 residents each.
function fullHouses(game, count) {
  buildMarket(game);
  const houses = HOUSE_SITES.slice(0, count).map(([x, y]) => place(game, 'house', x, y));
  for (const house of houses) fillHouse(game, house);
  return houses;
}

// ---- the rule in the data ------------------------------------------------------------

test('every producer needs staff, nothing else does, and the town starts with a crew', () => {
  const { rules } = createGame(loadData());
  for (const def of Object.values(rules.buildings)) {
    if (def.production) assert.ok(Number.isInteger(def.staff) && def.staff >= 1, `${def.id} needs no staff`);
    else assert.equal(def.staff, 0, `${def.id} is not a producer and needs staff`);
  }
  assert.deepEqual(rules.workforce, { base: 12, perResidentMilli: 500 });
  // Bigger workshops need more people than a hut in the woods.
  assert.ok(rules.buildings.bakery.staff > rules.buildings.lumberjack.staff);
  assert.ok(rules.buildings.weaver.staff > rules.buildings.sheepfarm.staff - 1);
});

// ---- counting ----------------------------------------------------------------------

test('a new town has its starting crew and needs nobody', () => {
  const game = testGame();
  assert.deepEqual(staffing(game), { on: true, needed: 0, available: 12, ratioMilli: 1000 });
  assert.deepEqual(getSummary(game).staff, { on: true, needed: 0, available: 12, percent: 100, short: false });
});

test('only producers linked to a warehouse need staff', () => {
  const game = richGame();
  place(game, 'lumberjack', 7, 7);
  place(game, 'lumberjack', 6, 7);
  assert.equal(staffing(game).needed, 0, 'a producer with no road needs no staff: it is not working');
  road(game, line(10, 8, 6, 8));
  assert.equal(staffing(game).needed, 4);
  // A market, a house and a second warehouse need none.
  buildMarket(game);
  place(game, 'house', 16, 11);
  place(game, 'warehouse', 20, 4);
  assert.equal(staffing(game).needed, 4);
  // Demolishing a producer frees its staff at once.
  assert.equal(execute(game, { action: 'demolish', x: 6, y: 7 }).ok, true);
  assert.equal(staffing(game).needed, 2);
});

test('every two residents add one to the staff', () => {
  const game = richGame();
  const [first] = fullHouses(game, 1);
  assert.equal(first.house.residents, 4);
  assert.equal(staffing(game).available, 14);
  const more = place(game, 'house', 16, 13);
  fillHouse(game, more);
  assert.equal(staffing(game).available, 16);
  // Half a person does not count: 3 residents add 1.
  more.house.residents = 3;
  assert.equal(staffing(game).available, 12 + Math.floor(7 / 2));
});

// ---- working slower ------------------------------------------------------------------

test('a town with enough staff works at full speed, exactly as it would with no staff rule', () => {
  const game = richGame();
  const twin = richGame({ change: noStaffRule });
  lumberjacks(game, 6); // 12 staff, and 12 in the starting crew
  lumberjacks(twin, 6);
  game.state.goods.wood = 0;
  twin.state.goods.wood = 0;
  assert.equal(staffing(game).ratioMilli, 1000);
  run(game, 400);
  run(twin, 400);
  assert.equal(game.state.goods.wood, 6 * 8);
  assert.equal(game.state.staffClock, 0);
  assert.equal(snapshot(game), snapshot(twin));
});

test('a town that is short works slower by the same share: 12 staff for 16 jobs is 75%', () => {
  const game = richGame();
  lumberjacks(game, 8);
  game.state.goods.wood = 0;
  assert.deepEqual(staffing(game), { on: true, needed: 16, available: 12, ratioMilli: 750 });
  assert.deepEqual(getSummary(game).staff, { on: true, needed: 16, available: 12, percent: 75, short: true });
  run(game, 400);
  // At full speed each of the 8 would have cut 8 logs. At 75% each cut 6.
  assert.equal(game.state.goods.wood, 8 * 6);
  // And over a longer time it stays at exactly three quarters.
  game.state.goods.wood = 0;
  run(game, 400);
  assert.equal(game.state.goods.wood, 8 * 6);
});

test('seven lumberjacks on a crew of twelve: 14 jobs, 85% speed', () => {
  const game = richGame();
  lumberjacks(game, 7);
  game.state.goods.wood = 0;
  assert.equal(staffing(game).ratioMilli, 857);
  assert.equal(getSummary(game).staff.percent, 85);
  run(game, 700);
  // 700 ticks at 857 in 1000 is 599 worked ticks: 11 logs each. At full speed it would be 14 each.
  assert.equal(game.state.goods.wood, 7 * 11);
  assert.equal(game.state.staffClock, (700 * 857) % 1000);
  for (let i = 0; i < 50; i++) {
    run(game, 1);
    assert.ok(game.state.staffClock >= 0 && game.state.staffClock < 1000);
  }
});

test('more houses end a shortage, and losing the residents brings it back', () => {
  const game = richGame();
  lumberjacks(game, 8);
  assert.equal(staffing(game).ratioMilli, 750);
  const houses = fullHouses(game, 2); // 8 residents: 4 more staff
  assert.deepEqual(staffing(game), { on: true, needed: 16, available: 16, ratioMilli: 1000 });
  game.state.goods.wood = 0;
  const before = game.state.tick;
  run(game, 400);
  assert.equal(game.state.goods.wood, 64, `full speed again after tick ${before}`);
  execute(game, { action: 'demolish', x: houses[0].x, y: houses[0].y });
  assert.equal(staffing(game).ratioMilli, 875);
});

test('nothing ever stops dead, however short the town is', () => {
  const game = richGame({ change: (d) => { d.buildings.lumberjack.staff = 100; } });
  lumberjacks(game, 8);
  game.state.goods.wood = 0;
  const staff = staffing(game);
  assert.equal(staff.needed, 800);
  assert.equal(staff.ratioMilli, 15);
  run(game, 3400); // 51 worked ticks: one log each
  assert.equal(game.state.goods.wood, 8);
  // Even at an absurd shortage the speed is never nothing.
  const worse = richGame({ change: (d) => { d.buildings.lumberjack.staff = 1000000; } });
  lumberjacks(worse, 1);
  assert.equal(staffing(worse).ratioMilli, 1);
});

test('a shortage slows every producer alike, and houses still eat at their usual pace', () => {
  const game = richGame();
  const twin = richGame({ change: noStaffRule });
  for (const g of [game, twin]) {
    lumberjacks(g, 8);
    buildMarket(g);
    place(g, 'house', 16, 11);
    g.state.goods.fish = 100;
  }
  run(game, 3000);
  run(twin, 3000);
  // The same people ate the same fish: only making things is slowed.
  assert.equal(game.state.goods.fish, twin.state.goods.fish);
  assert.deepEqual(game.state.buildings.filter((b) => b.house), twin.state.buildings.filter((b) => b.house));
  assert.equal(game.state.coinsMilli, twin.state.coinsMilli, 'upkeep and taxes do not depend on staff');
});

test('with the rule taken out of the data there is no staff at all', () => {
  const game = richGame({ change: noStaffRule });
  lumberjacks(game, 8);
  game.state.goods.wood = 0;
  assert.equal(game.rules.workforce, null);
  assert.deepEqual(staffing(game), { on: false, needed: 0, available: 0, ratioMilli: 1000 });
  assert.equal(getSummary(game).staff.on, false);
  run(game, 400);
  assert.equal(game.state.goods.wood, 64);
  assert.equal(game.state.staffClock, 0);
  assert.deepEqual(buildingBlurb(game.rules, 'lumberjack').filter((l) => /staff/i.test(l)), []);
  assert.equal(panelModel(game, game.state.buildings[1]).lines.some((l) => l.label === 'Staff'), false);
});

test('the same short-staffed game played twice is the same game', () => {
  const play = () => {
    const game = richGame();
    lumberjacks(game, 7);
    place(game, 'sawmill', 13, 13);
    road(game, [[12, 10], [12, 11], [12, 12], [12, 13]]);
    game.state.goods.wood = 0;
    game.state.goods.planks = 0;
    run(game, 1234);
    return snapshot(game);
  };
  assert.equal(play(), play());
});

// ---- saved games -----------------------------------------------------------------------

test('a game saved while short of staff carries on exactly where it was', () => {
  const game = richGame();
  lumberjacks(game, 7);
  game.state.goods.wood = 0;
  run(game, 333);
  assert.ok(game.state.staffClock > 0, 'the test needs a half-saved-up tick of work');
  const loaded = loadGame(loadData(), throughText(saveGame(game)));
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.equal(loaded.game.state.staffClock, game.state.staffClock);
  run(game, 500);
  run(loaded.game, 500);
  assert.equal(snapshot(loaded.game), snapshot(game));
});

test('the stamps that saved games out in the world carry are still recognised', () => {
  // These two are the stamps of Normal games saved before Phase 12 and in
  // Phases 12 to 14. If this fails, a rule those games were played under has
  // changed, and every game saved back then will be refused. Be sure you mean it.
  const rules = compileRules(loadData());
  assert.deepEqual(rules.olderStamps.map((o) => o.stamp), ['6fe08f1bee9bb754', 'b16fd0a9142282c9']);
  assert.deepEqual(rules.olderStamps.map((o) => o.configAdded), [['milestones', 'workforce'], ['workforce']]);
  assert.equal(createGame(dataBefore(1)).rules.stamp, 'b16fd0a9142282c9');
  assert.equal(createGame(dataBefore(0)).rules.stamp, '6fe08f1bee9bb754');
  // A Hard game of Phases 12 to 14.
  assert.equal(createGame(dataBefore(1), { difficulty: 'hard' }).rules.stamp, 'd002f8878cb41b57');
  assert.equal(createGame(loadData(), { difficulty: 'hard' }).rules.olderStamps[1].stamp, 'd002f8878cb41b57');
  assert.notEqual(rules.stamp, 'b16fd0a9142282c9', 'adding staff is a change of rules');
});

test('the list of later additions may be one round or several', () => {
  assert.deepEqual(addedSteps(undefined), []);
  assert.deepEqual(addedSteps({ goods: ['wool'] }), [{ goods: ['wool'] }]);
  assert.deepEqual(addedSteps([{ goods: ['wool'] }, { config: ['workforce'] }]).length, 2);
  const data = loadData();
  const steps = data.config.addedLater;
  assert.equal(rulesStamp(data, steps[1]), rulesStamp(data, [steps[1]]));
  assert.equal(rulesStamp(data, steps), '6fe08f1bee9bb754');
  assert.equal(rulesStamp(data, steps.slice(1)), 'b16fd0a9142282c9');
});

test('a game saved before staff existed can be continued, with everything it had', () => {
  const before = createGame(dataBefore(1));
  runBot(before, loadOrder('standard'), { maxMinutes: 18 });
  const save = throughText(saveGame(before));
  delete save.state.staffClock; // a save that old has no such entry
  assert.equal(save.rulesStamp, 'b16fd0a9142282c9');

  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  const game = loaded.game;
  assert.equal(game.state.staffClock, 0);
  assert.equal(game.rules.buildings.bakery.staff, 5, 'the continued game is played under the staff rule');
  const staff = getSummary(game).staff;
  assert.equal(staff.on, true);
  assert.equal(staff.short, false, 'a sensible town from before has enough staff');

  // With enough staff it runs on exactly as the old game does.
  run(before, 3000);
  run(game, 3000);
  assert.equal(stableText(game.state), stableText(before.state));

  // And it saves and loads from here on as a game of today.
  const again = loadGame(loadData(), throughText(saveGame(game)));
  assert.equal(again.ok, true);
  assert.equal(again.game.rules.stamp, compileRules(loadData()).stamp);
  assert.equal(snapshot(again.game), snapshot(game));
});

test('a finished game from before staff keeps its win, its Artisans goal and its cloth', () => {
  const before = createGame(dataBefore(1));
  const order = loadOrder('artisans');
  const result = runBot(before, order, { pastWin: true });
  assert.notEqual(result.milestones[0].reachedAtMinutes, null);
  const save = throughText(saveGame(before));
  delete save.state.staffClock;

  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  const game = loaded.game;
  assert.equal(game.state.won, true);
  assert.deepEqual(game.state.milestones, before.state.milestones, 'a goal already reached is not taken back');
  assert.notEqual(game.state.milestones[0], null);
  assert.deepEqual(game.state.goods, before.state.goods);
  // This town has more workshops than its residents can run: it is told so, and it still works.
  const staff = getSummary(game).staff;
  assert.equal(staff.short, true);
  assert.ok(staff.percent >= 70, `production fell to ${staff.percent}%`);
  const coins = game.state.coinsMilli;
  run(game, 6000);
  assert.ok(game.state.coinsMilli > coins, 'the town went on earning');
  assert.ok(getSummary(game).milestones[0].current >= 100, 'the Artisans left');
});

test('a game saved before Artisans existed still loads, two rounds of additions later', () => {
  const before = createGame(dataBefore(0));
  runBot(before, loadOrder('standard'), { maxMinutes: 12 });
  const save = throughText(saveGame(before));
  delete save.state.staffClock;
  delete save.state.milestones;
  delete save.state.undo;
  assert.equal(save.rulesStamp, '6fe08f1bee9bb754');
  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.deepEqual(loaded.game.state.milestones, [null]);
  assert.equal(loaded.game.state.staffClock, 0);
  assert.equal(loaded.game.state.goods.cloth, 0);
});

test('a Hard game saved before staff existed loads as a Hard game', () => {
  const before = createGame(dataBefore(1), { difficulty: 'hard' });
  runBot(before, loadOrder('standard'), { maxMinutes: 10 });
  const save = throughText(saveGame(before));
  delete save.state.staffClock;
  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.equal(loaded.game.rules.difficulty, 'hard');
  assert.equal(loaded.game.rules.start.coinsMilli, 350000);
  // It is not mistaken for a Normal game, and a Normal save is not mistaken for it.
  assert.equal(loadGame(loadData(), { ...save, difficulty: 'normal' }).reason, 'rules_changed');
});

test('an older save is still refused if a rule it was played under has changed', () => {
  const before = createGame(dataBefore(1));
  runBot(before, loadOrder('standard'), { maxMinutes: 8 });
  const save = throughText(saveGame(before));
  const changed = loadData();
  changed.buildings.bakery.upkeepPerMinute = 7;
  assert.equal(loadGame(changed, save).reason, 'rules_changed');
  // Changing a staff number does not matter to it: it was saved with no staff rule.
  const tuned = loadData();
  tuned.buildings.bakery.staff = 9;
  tuned.config.workforce.base = 20;
  assert.equal(loadGame(tuned, save).ok, true);
  // A save of today is refused by that same change.
  const today = throughText(saveGame(createGame(loadData())));
  assert.equal(loadGame(tuned, today).reason, 'rules_changed');
});

test('a save with a wrong staff timer is refused as damaged', () => {
  const game = createGame(loadData());
  run(game, 100);
  for (const value of [-1, 1000, 1.5, 'soon', null]) {
    const save = throughText(saveGame(game));
    save.state.staffClock = value;
    assert.equal(loadGame(loadData(), save).reason, 'damaged', `staff timer ${value}`);
  }
});

// ---- data mistakes -----------------------------------------------------------------------

test('mistakes in the staff numbers are refused with a clear message', () => {
  const bad = [
    [(d) => { d.buildings.bakery.staff = -1; }, /buildings\.bakery\.staff/],
    [(d) => { d.buildings.bakery.staff = 2.5; }, /buildings\.bakery\.staff/],
    [(d) => { d.buildings.bakery.staff = 'four'; }, /buildings\.bakery\.staff/],
    [(d) => { d.buildings.house.staff = 2; }, /buildings\.house\.staff: only producers need staff/],
    [(d) => { d.config.workforce = 12; }, /config\.workforce must be an object/],
    [(d) => { d.config.workforce.base = 0; }, /config\.workforce\.base/],
    [(d) => { d.config.workforce.base = 1.5; }, /config\.workforce\.base/],
    [(d) => { d.config.workforce.perResident = -0.5; }, /config\.workforce\.perResident/],
    [(d) => { delete d.config.workforce.perResident; }, /config\.workforce\.perResident/],
    [(d) => { d.config.addedLater[1].buildingSettings = 'staff'; }, /addedLater\[1\]\.buildingSettings must be a list of names/],
  ];
  for (const [change, pattern] of bad) assert.throws(() => testGame({ change }), pattern, String(change));
  // A producer with no staff number needs none, and a house may say 0.
  const game = testGame({ change: (d) => { delete d.buildings.bakery.staff; d.buildings.house.staff = 0; } });
  assert.equal(game.rules.buildings.bakery.staff, 0);
});

// ---- on screen ---------------------------------------------------------------------------

test('the top bar says how many staff are spare, or how many short and how slow', () => {
  const game = richGame();
  lumberjacks(game, 5);
  let text = staffText(game.rules, getSummary(game).staff);
  assert.equal(text.value, '2 spare');
  assert.equal(text.short, false);
  assert.equal(text.title, 'Your producing buildings need 10 staff. The town has 12 (12 to begin with, and 1 for every 2 residents). Every producer works at full speed.');

  const short = richGame();
  lumberjacks(short, 8);
  text = staffText(short.rules, getSummary(short).staff);
  assert.equal(text.value, '4 short');
  assert.equal(text.short, true);
  assert.match(text.title, /need 16 staff\. The town has 12 .*Every producer works at 75% speed\. Build more houses, or close a building you can spare\.$/);

  // Exactly enough is "0 spare", not a shortage.
  const even = richGame();
  lumberjacks(even, 6);
  assert.equal(staffText(even.rules, getSummary(even).staff).value, '0 spare');
});

test('where staff come from is said with the numbers in the data', () => {
  const words = (workforce) => staffSourceText(testGame({ change: (d) => { d.config.workforce = workforce; } }).rules);
  assert.equal(words({ base: 12, perResident: 0.5 }), '12 to begin with, and 1 for every 2 residents');
  assert.equal(words({ base: 5, perResident: 1 }), '5 to begin with, and 1 for every resident');
  assert.equal(words({ base: 5, perResident: 0.25 }), '5 to begin with, and 1 for every 4 residents');
  assert.equal(words({ base: 5, perResident: 0.4 }), '5 to begin with, and 0.4 for every resident');
  assert.equal(words({ base: 30, perResident: 0 }), '30');
});

test('the build menu says how many staff each producer needs', () => {
  const { rules } = testGame();
  assert.deepEqual(buildingBlurb(rules, 'sawmill').slice(0, 2), ['Turns 2 wood into 1 plank every 16 s.', 'Needs 3 staff.']);
  assert.ok(buildingBlurb(rules, 'weaver').includes('Needs 5 staff.'));
  for (const id of ['house', 'market', 'warehouse', 'road']) {
    assert.deepEqual(buildingBlurb(rules, id).filter((l) => /staff/i.test(l)), [], `${id} should not mention staff`);
  }
});

test('a producer\'s panel says how many staff it needs, and when the town is short', () => {
  const game = richGame();
  const [jack] = lumberjacks(game, 6);
  const line6 = panelModel(game, jack).lines.find((l) => l.label === 'Staff');
  assert.deepEqual(line6, { label: 'Staff', value: 'Needs 2' });

  const short = richGame();
  const [slow] = lumberjacks(short, 8);
  assert.deepEqual(panelModel(short, slow).lines.find((l) => l.label === 'Staff'),
    { label: 'Staff', value: 'Needs 2. Town is short: 75% speed', level: 'warn' });
  // A producer that is not connected is not slowed by the shortage: it is not working at all.
  const idle = place(short, 'lumberjack', 4, 2);
  assert.deepEqual(panelModel(short, idle).lines.find((l) => l.label === 'Staff'), { label: 'Staff', value: 'Needs 2' });
  // Houses and markets have no staff line.
  buildMarket(short);
  const house = place(short, 'house', 16, 11);
  assert.equal(panelModel(short, house).lines.some((l) => l.label === 'Staff'), false);
});

test('tips: a town short of staff is told to build houses, before anything about goods', () => {
  const game = richGame();
  lumberjacks(game, 8);
  game.state.goods.planks = 0; // a good that would otherwise earn a tip of its own
  const advisor = createAdvisor(game.rules);
  const tipAfter = (seconds) => {
    let tip = null;
    for (let i = 0; i < seconds * game.rules.ticksPerSecond; i++) {
      run(game, 1);
      tip = advisor.update(game);
    }
    return tip;
  };
  assert.equal(tipAfter(20), null, 'it waits before speaking');
  assert.equal(tipAfter(15), 'Your buildings are short of staff and work at 75% speed. Build more houses, or close a building you can spare.');
  // Houses fill, the shortage ends, and the tip moves on to the next thing.
  game.state.goods.planks = 100;
  fullHouses(game, 2);
  game.state.goods.planks = 0;
  const next = tipAfter(40);
  assert.doesNotMatch(String(next), /staff/);
  assert.match(String(next), /plank/i);
});

// ---- the whole game ------------------------------------------------------------------------

test('GATE: a sensible town is never short of staff, on any difficulty, and wins when it did before', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (const name of ['standard', 'careless']) {
      const withStaff = runBot(createGame(loadData(), { difficulty }), loadOrder(name));
      const data = loadData();
      noStaffRule(data);
      const without = runBot(createGame(data, { difficulty }), loadOrder(name));
      assert.equal(withStaff.won, true, `${name} on ${difficulty} did not win`);
      assert.equal(withStaff.shortStaffMinutes, 0, `${name} on ${difficulty} was short of staff`);
      assert.equal(withStaff.wonAtMinutes, without.wonAtMinutes, `${name} on ${difficulty}`);
      // And with room to spare at the end, so one more workshop is not a punishment.
      const staff = withStaff.summary.staff;
      assert.ok(staff.available - staff.needed >= 8, `${name} on ${difficulty} ends with ${staff.available - staff.needed} spare`);
    }
  }
});

test('GATE: a lopsided town, workshops first and houses later, is held back but still wins', () => {
  const data = loadData();
  noStaffRule(data);
  const without = runBot(createGame(data), loadOrder('bread-first'));
  const withStaff = runBot(createGame(loadData()), loadOrder('bread-first'));
  assert.equal(withStaff.won, true);
  assert.ok(withStaff.shortStaffMinutes >= 3, `short for only ${withStaff.shortStaffMinutes.toFixed(1)} minutes`);
  assert.ok(withStaff.lowestStaffPercent < 70 && withStaff.lowestStaffPercent >= 30, `slowest was ${withStaff.lowestStaffPercent}%`);
  assert.ok(withStaff.wonAtMinutes > without.wonAtMinutes, 'the staff rule cost it nothing');
  assert.ok(withStaff.wonAtMinutes < without.wonAtMinutes + 15, `it lost ${(withStaff.wonAtMinutes - without.wonAtMinutes).toFixed(1)} minutes`);
});

test('GATE: the second act runs short of staff, never badly, and still reaches 100 Artisans', () => {
  const order = loadOrder('artisans');
  const game = createGame(loadData());
  const result = runBot(game, order, { pastWin: true });
  assert.notEqual(result.milestones[0].reachedAtMinutes, null);
  assert.ok(result.shortStaffMinutes >= 5, 'staff never mattered in the second act');
  assert.ok(result.lowestStaffPercent >= 70, `production fell to ${result.lowestStaffPercent}%`);
  // The shortage begins after the win, not before it.
  const first = result.samples.find((s) => s.staff.short);
  assert.ok(first.minute > result.wonAtMinutes, `short of staff at minute ${first.minute}, before the win`);
  // Eleven more Farmer houses would end it: houses are always the way out.
  const staff = getSummary(game).staff;
  assert.equal(staff.short, true);
  const housesNeeded = Math.ceil((staff.needed - staff.available) / (game.rules.tiers.farmer.capacity * 0.5));
  assert.ok(housesNeeded <= 12, `${housesNeeded} houses needed`);
});
