import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData, DATA_FILES } from '../src/platform/loadData.node.js';
import { validateData } from '../src/sim/validate.js';
import { compileRules, stripNotes } from '../src/sim/rules.js';

const fresh = () => stripNotes(loadData());

test('all five data files load', () => {
  const data = loadData();
  assert.deepEqual(Object.keys(data), DATA_FILES);
});

test('the shipped data files pass validation', () => {
  assert.deepEqual(validateData(fresh()), []);
});

test('notes (keys starting with _) are removed at every depth', () => {
  const data = fresh();
  const hasNote = (v) =>
    v !== null && typeof v === 'object' && Object.entries(v).some(([k, c]) => k.startsWith('_') || hasNote(c));
  assert.equal(hasNote(data), false);
});

test('rules convert seconds to ticks and coins to thousandths', () => {
  const data = fresh();
  const rules = compileRules(loadData());
  const tps = data.config.ticksPerSecond;
  for (const [id, b] of Object.entries(data.buildings)) {
    assert.equal(rules.buildings[id].cost.coinsMilli, b.cost.coins * 1000, `${id} cost`);
    if (b.production) assert.equal(rules.buildings[id].production.cycleTicks, Math.round(b.production.cycleSeconds * tps), `${id} cycle`);
  }
  assert.equal(rules.start.coinsMilli, data.config.start.coins * 1000);
  assert.equal(rules.start.freeBuilding, 'warehouse');
});

test('rules cannot be changed after they are built', () => {
  const rules = compileRules(loadData());
  assert.throws(() => { rules.buildings.road.cost.coinsMilli = 0; }, TypeError);
});

// Each case breaks one thing and expects a message that mentions it.
const badCases = [
  ['unknown good in a cost', (d) => { d.buildings.sawmill.cost.goods.gold = 3; }, /sawmill\.cost\.goods names an unknown good "gold"/],
  ['unknown good as a production input', (d) => { d.buildings.bakery.production.inputs = { flour: 1 }; }, /bakery\.production\.inputs names an unknown good "flour"/],
  ['unknown good as a need', (d) => { d.population.tiers.worker.needs.beer = 0.1; }, /worker\.needs names an unknown good "beer"/],
  ['unknown tier on a house', (d) => { d.buildings.house.housing.tier = 'noble'; }, /house\.housing\.tier names an unknown tier "noble"/],
  ['unknown upgrade target', (d) => { d.population.tiers.farmer.upgrade.to = 'noble'; }, /farmer\.upgrade\.to names an unknown tier "noble"/],
  ['unknown win tier', (d) => { d.config.win.tier = 'noble'; }, /config\.win\.tier names an unknown tier "noble"/],
  ['unknown terrain in a placement rule', (d) => { d.buildings.fisherman.placement.adjacentTerrain = 'lava'; }, /fisherman\.placement\.adjacentTerrain names an unknown terrain "lava"/],
  ['negative cost', (d) => { d.buildings.house.cost.coins = -5; }, /house\.cost\.coins must be at least 0/],
  ['zero cycle time', (d) => { d.buildings.farm.production.cycleSeconds = 0; }, /farm\.production\.cycleSeconds must be more than 0/],
  ['text where a number belongs', (d) => { d.buildings.market.upkeepPerMinute = 'five'; }, /market\.upkeepPerMinute must be a number/],
  ['missing road building', (d) => { delete d.buildings.road; }, /must define "road"/],
  ['no storage building', (d) => { delete d.buildings.warehouse; d.config.start.freeBuildings = []; }, /at least one storage building/],
  ['producer without production', (d) => { delete d.buildings.lumberjack.production; }, /lumberjack is a producer and needs "production"/],
  ['unknown free starting building', (d) => { d.config.start.freeBuildings = ['castle']; }, /freeBuildings names an unknown building "castle"/],
  ['refund ratio above 1', (d) => { d.config.economy.demolishRefundRatio = 1.5; }, /demolishRefundRatio must be at most 1/],
  ['missing terrain type', (d) => { delete d.map.terrain.forest; }, /missing the "forest" terrain type/],
  ['a whole file missing', (d) => { delete d.goods; }, /goods\.json is missing/],
];

for (const [name, breakIt, expected] of badCases) {
  test(`bad data is rejected: ${name}`, () => {
    const data = fresh();
    breakIt(data);
    const errors = validateData(data);
    assert.ok(errors.length > 0, 'expected at least one problem');
    assert.match(errors.join('\n'), expected);
    assert.throws(() => compileRules(data), /The data files have/);
  });
}
