import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../src/sim/index.js';
import { richGame, place, road, line, run } from './helpers.js';

// Test island layout used here:
//   lumberjack at (8,4), reached by a road up column 10 from the warehouse
//   sawmill at (13,11), reached by (12,10) and (12,11)
const LUMBER_ROAD = [...line(10, 8, 10, 4), [9, 4]];
const MILL_ROAD = [[12, 10], [12, 11]];

// Build first with plenty of everything, then set the stock the test cares about.
const setup = () => richGame();
const stock = (game, goods = {}) => Object.assign(game.state.goods, { wood: 0, planks: 0, ...goods });
const cycle = (game, type) => game.rules.buildings[type].production.cycleTicks;

test('a connected lumberjack makes exactly one batch per cycle', () => {
  const game = setup();
  place(game, 'lumberjack', 8, 4);
  road(game, LUMBER_ROAD);
  stock(game);
  const ticks = cycle(game, 'lumberjack');
  const batch = game.rules.buildings.lumberjack.production.outputs.wood;

  run(game, ticks - 1);
  assert.equal(game.state.goods.wood, 0, 'nothing one tick before the cycle ends');
  run(game, 1);
  assert.equal(game.state.goods.wood, batch);
  run(game, ticks * 9);
  assert.equal(game.state.goods.wood, batch * 10);
});

test('without a road a producer does nothing and says why', () => {
  const game = setup();
  const jack = place(game, 'lumberjack', 8, 4);
  stock(game);
  run(game, cycle(game, 'lumberjack') * 3);
  assert.equal(game.state.goods.wood, 0);
  assert.equal(jack.production.status, 'no_road');
  assert.equal(jack.production.progress, 0);
});

test('a producer starts as soon as it is connected', () => {
  const game = setup();
  const jack = place(game, 'lumberjack', 8, 4);
  stock(game);
  run(game, 50);
  road(game, LUMBER_ROAD);
  assert.equal(jack.production.status, 'working', 'status updates at once, before any tick');
  run(game, cycle(game, 'lumberjack'));
  assert.equal(game.state.goods.wood, 1);
});

test('cutting the road pauses a cycle and reconnecting resumes it', () => {
  const game = setup();
  const jack = place(game, 'lumberjack', 8, 4);
  road(game, LUMBER_ROAD);
  stock(game);
  const ticks = cycle(game, 'lumberjack');
  run(game, ticks - 10);
  execute(game, { action: 'demolish', x: 10, y: 6 });
  assert.equal(jack.production.status, 'no_road');
  run(game, 500);
  assert.equal(game.state.goods.wood, 0);
  assert.equal(jack.production.progress, ticks - 10, 'progress is kept');
  road(game, [[10, 6]]);
  run(game, 9);
  assert.equal(game.state.goods.wood, 0);
  run(game, 1);
  assert.equal(game.state.goods.wood, 1);
});

test('a sawmill takes its inputs when a cycle starts and delivers when it ends', () => {
  const game = setup();
  place(game, 'sawmill', 13, 11);
  road(game, MILL_ROAD);
  stock(game, { wood: 10 });
  const def = game.rules.buildings.sawmill.production;
  run(game, 1);
  assert.equal(game.state.goods.wood, 10 - def.inputs.wood, 'inputs taken on the first tick');
  assert.equal(game.state.goods.planks, 0);
  run(game, def.cycleTicks - 1);
  assert.equal(game.state.goods.planks, def.outputs.planks);
});

test('a sawmill turns wood into planks at the ratio in the data, with nothing lost', () => {
  const game = setup();
  const def = game.rules.buildings.sawmill.production;
  const mill = place(game, 'sawmill', 13, 11);
  road(game, MILL_ROAD);
  stock(game, { wood: def.inputs.wood * 3 });
  run(game, def.cycleTicks * 10);
  assert.equal(game.state.goods.wood, 0);
  assert.equal(game.state.goods.planks, def.outputs.planks * 3);
  assert.equal(mill.production.status, 'missing_input');
});

test('missing input: the producer waits and takes nothing', () => {
  const game = setup();
  const def = game.rules.buildings.sawmill.production;
  const mill = place(game, 'sawmill', 13, 11);
  road(game, MILL_ROAD);
  stock(game, { wood: def.inputs.wood - 1 });
  run(game, def.cycleTicks * 2);
  assert.equal(mill.production.status, 'missing_input');
  assert.equal(game.state.goods.wood, def.inputs.wood - 1, 'a partial input is not taken');
  assert.equal(game.state.goods.planks, 0);

  game.state.goods.wood = def.inputs.wood;
  run(game, def.cycleTicks);
  assert.equal(game.state.goods.planks, def.outputs.planks, 'it resumes when the input arrives');
});

test('storage full: finished goods wait, and are delivered when there is room', () => {
  const game = setup();
  const jack = place(game, 'lumberjack', 8, 4);
  road(game, LUMBER_ROAD);
  const cap = game.state.storageCap;
  const ticks = cycle(game, 'lumberjack');
  game.state.goods.wood = cap;

  run(game, ticks * 3);
  assert.equal(game.state.goods.wood, cap, 'never goes over the limit');
  assert.equal(jack.production.status, 'storage_full');

  game.state.goods.wood = cap - 1;
  run(game, 1);
  assert.equal(game.state.goods.wood, cap, 'the waiting batch is delivered on the next tick');
  assert.equal(jack.production.status, 'working');
});

test('lumberjack and sawmill together: every log is accounted for', () => {
  const game = setup();
  place(game, 'lumberjack', 8, 4);
  const mill = place(game, 'sawmill', 13, 11);
  road(game, [...LUMBER_ROAD, ...MILL_ROAD]);
  stock(game);
  const jackTicks = cycle(game, 'lumberjack');
  const def = game.rules.buildings.sawmill.production;

  const total = jackTicks * 40;
  for (let i = 0; i < total; i++) {
    run(game, 1);
    for (const good of game.rules.goodIds) assert.ok(game.state.goods[good] >= 0, `${good} went negative`);
  }
  const cut = 40; // one log per lumberjack cycle
  const insideMill = mill.production.active ? def.inputs.wood : 0;
  const usedForPlanks = (game.state.goods.planks / def.outputs.planks) * def.inputs.wood;
  assert.equal(game.state.goods.wood + usedForPlanks + insideMill, cut);
  assert.ok(game.state.goods.planks > 0);
});

test('a brand-new producer and good can be added in the data files alone', () => {
  const game = richGame({
    change: (d) => {
      d.goods.stone = { name: 'Stone', color: '#999999' };
      d.buildings.quarry = {
        name: 'Quarry', category: 'producer', size: [1, 1],
        cost: { coins: 5, goods: {} }, upkeepPerMinute: 1, requiresRoad: true,
        production: { cycleSeconds: 2, inputs: {}, outputs: { stone: 3 } },
      };
    },
  });
  game.state.goods.stone = 0;
  place(game, 'quarry', 12, 11);
  road(game, [[12, 10]]);
  run(game, game.rules.buildings.quarry.production.cycleTicks * 2);
  assert.equal(game.state.goods.stone, 6);
});
