// Balance targets from the brief, checked against the shipped data files.
// If you tune the data and one of these fails, the numbers have drifted away
// from a target. That may be what you want. If so, change the target here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { countResidents, getSummary } from '../src/sim/index.js';
import { testGame, place, road, line, run, buildMarket, HOUSE_SITES } from './helpers.js';

const perMinute = (rules, type, good) => {
  const p = rules.buildings[type].production;
  return (rules.ticksPerMinute / p.cycleTicks) * p.outputs[good];
};

test('starting resources match the brief: 500 coins, 40 wood, 20 planks', () => {
  const s = getSummary(testGame());
  assert.equal(s.coins, 500);
  assert.deepEqual(s.goods, { wood: 40, planks: 20, fish: 0, grain: 0, bread: 0, wool: 0, cloth: 0 });
});

test('on paper, one fisherman feeds about 20 residents', () => {
  const { rules } = testGame();
  const fed = perMinute(rules, 'fisherman', 'fish') / rules.tiers.farmer.needs.fish.perResidentPerMinute;
  assert.ok(fed >= 18 && fed <= 22, `one fisherman feeds ${fed.toFixed(1)} residents`);
});

// One fisherman, one market, and `houses` Farmer houses, run for `minutes`.
function fishingVillage(houses, minutes) {
  const game = testGame({ coins: 100000, goods: { wood: 100, planks: 100, fish: 0 } });
  buildMarket(game);
  place(game, 'fisherman', 2, 9);
  road(game, line(9, 9, 3, 9));
  for (const [x, y] of HOUSE_SITES.slice(0, houses)) place(game, 'house', x, y);
  let lowest = Infinity;
  const settle = 10 * game.rules.ticksPerMinute; // ignore the first ten minutes while people move in
  for (let t = 0; t < minutes * game.rules.ticksPerMinute; t++) {
    run(game, 1);
    if (t >= settle) lowest = Math.min(lowest, countResidents(game).farmer);
  }
  return { game, lowest };
}

test('in play, one fisherman keeps 20 Farmers fed for half an hour with none leaving', () => {
  const { game, lowest } = fishingVillage(5, 30);
  assert.equal(game.rules.tiers.farmer.capacity * 5, 20, 'this test assumes 5 houses hold 20');
  assert.equal(lowest, 20);
});

test('in play, one fisherman cannot keep 24 Farmers fed', () => {
  const { game, lowest } = fishingVillage(6, 30);
  assert.ok(countResidents(game).farmer < 24, 'the sixth house cannot stay full');
  assert.ok(lowest < 24);
  assert.equal(game.state.goods.fish, 0, 'every fish is eaten as it lands');
});

test('on paper, the 104-Worker city from the spec nets about +40 coins a minute', () => {
  const { rules } = testGame();
  const city = { lumberjack: 2, sawmill: 1, fisherman: 6, farm: 4, bakery: 2, market: 2, warehouse: 1 };
  const workers = 13 * rules.tiers.worker.capacity;
  const upkeep = Object.entries(city).reduce((sum, [type, n]) => sum + n * rules.buildings[type].upkeepMilliPerMinute, 0);
  const net = (workers * rules.tiers.worker.taxMilliPerMinute + rules.economy.baseIncomeMilliPerMinute - upkeep) / 1000;
  assert.ok(net >= 30 && net <= 50, `net income is ${net} coins a minute`);

  // The same city must actually feed itself.
  const needs = rules.tiers.worker.needs;
  assert.ok(city.fisherman * perMinute(rules, 'fisherman', 'fish') >= workers * needs.fish.perResidentPerMinute, 'enough fish');
  assert.ok(city.bakery * perMinute(rules, 'bakery', 'bread') >= workers * needs.bread.perResidentPerMinute, 'enough bread');
  const grainUsed = city.bakery * (rules.ticksPerMinute / rules.buildings.bakery.production.cycleTicks) * rules.buildings.bakery.production.inputs.grain;
  assert.ok(city.farm * perMinute(rules, 'farm', 'grain') >= grainUsed, 'enough grain');
});

test('a bare island is always in profit, so a player at zero coins can recover', () => {
  const game = testGame({ coins: 0 });
  assert.ok(getSummary(game).income.net > 0);
});

test('every good can be reached from coins alone, so an empty stockpile is never a dead end', () => {
  const { rules } = testGame();
  const reachable = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const def of Object.values(rules.buildings)) {
      if (!def.production) continue;
      const canBuild = Object.keys(def.cost.goods).every((g) => reachable.has(g));
      const canRun = Object.keys(def.production.inputs).every((g) => reachable.has(g));
      if (!canBuild || !canRun) continue;
      for (const good of Object.keys(def.production.outputs)) {
        if (!reachable.has(good)) {
          reachable.add(good);
          grew = true;
        }
      }
    }
  }
  assert.deepEqual([...reachable].sort(), [...rules.goodIds].sort());
  // Houses, markets and upgrades must be buildable from those goods too.
  for (const def of Object.values(rules.buildings)) {
    for (const good of Object.keys(def.cost.goods)) assert.ok(reachable.has(good), `${def.id} needs ${good}`);
  }
});
