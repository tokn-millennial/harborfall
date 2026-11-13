import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, countResidents, isSatisfied } from '../src/sim/index.js';
import { richGame, place, road, run, runSeconds, buildMarket, fillHouse, HOUSE_SITES } from './helpers.js';

const farmer = (game) => game.rules.tiers.farmer;
const fishThreshold = (game) => farmer(game).needs.fish.hungerThreshold;

test('a house with no market in range stays empty and buys nothing', () => {
  const game = richGame();
  const house = place(game, 'house', 16, 11);
  const fish = game.state.goods.fish;
  runSeconds(game, 120);
  assert.equal(house.house.served, false);
  assert.equal(house.house.residents, 0);
  assert.equal(game.state.goods.fish, fish);
  assert.equal(isSatisfied(house.house), false);
});

test('a market only serves houses once it is connected by road', () => {
  const game = richGame();
  place(game, 'market', 13, 11);
  const house = place(game, 'house', 16, 11);
  runSeconds(game, 60);
  assert.equal(house.house.served, false);
  assert.equal(house.house.residents, 0);
  road(game, [[12, 10], [12, 11]]);
  assert.equal(house.house.served, true, 'coverage updates at once');
});

test('market range: a house is served if any of its tiles is within the radius', () => {
  // Market centre is (14,12). With radius 8, tile (6,11) is inside and tile (5,13) is outside.
  const game = richGame({ change: (d) => { d.buildings.market.market.radius = 8; } });
  buildMarket(game);
  const inside = place(game, 'house', 5, 11);  // its tile (6,11) is 7.5 across, 0.5 up
  const outside = place(game, 'house', 4, 13); // its nearest tile (5,13) is 8.5 across
  assert.equal(inside.house.served, true);
  assert.equal(outside.house.served, false);
});

test('a served house buys its first fish at once, then fills one resident at a time', () => {
  const game = richGame();
  buildMarket(game);
  const house = place(game, 'house', 16, 11);
  game.state.goods.fish = 50;
  const { growthTicks } = game.rules.population;
  const capacity = farmer(game).capacity;

  run(game, 1);
  assert.equal(game.state.goods.fish, 49, 'first fish bought on the first tick');
  assert.equal(house.house.met.fish, true);
  assert.equal(house.house.residents, 0);

  run(game, growthTicks - 2);
  assert.equal(house.house.residents, 0, 'one tick before the first resident');
  run(game, 1);
  assert.equal(house.house.residents, 1);
  run(game, growthTicks * (capacity - 1));
  assert.equal(house.house.residents, capacity);
  run(game, growthTicks * 5);
  assert.equal(house.house.residents, capacity, 'never more than the house holds');
});

test('with no fish in stock nobody moves in', () => {
  const game = richGame();
  buildMarket(game);
  const house = place(game, 'house', 16, 11);
  game.state.goods.fish = 0;
  runSeconds(game, 120);
  assert.equal(house.house.served, true);
  assert.equal(house.house.met.fish, false);
  assert.equal(house.house.residents, 0);
});

test('a full house eats at exactly the rate in the data', () => {
  const game = richGame();
  buildMarket(game);
  const house = fillHouse(game, place(game, 'house', 16, 11));
  game.state.goods.fish = 50;
  // Over one "threshold" of ticks, each resident eats exactly one unit.
  run(game, fishThreshold(game));
  assert.equal(game.state.goods.fish, 50 - house.house.residents);
});

test('when fish runs out residents leave one by one down to the floor, then come back', () => {
  const game = richGame();
  buildMarket(game);
  const house = fillHouse(game, place(game, 'house', 16, 11));
  const { declineTicks, growthTicks, minResidents } = game.rules.population;
  const capacity = farmer(game).capacity;

  game.state.goods.fish = 0;
  run(game, fishThreshold(game)); // long enough for the next purchase to come due and fail
  assert.equal(house.house.met.fish, false);
  run(game, declineTicks * capacity);
  assert.equal(house.house.residents, minResidents);
  run(game, declineTicks * 5);
  assert.equal(house.house.residents, minResidents, 'never below the floor');
  assert.equal(house.house.tier, 'farmer', 'houses never downgrade');

  game.state.goods.fish = 50;
  run(game, growthTicks * capacity + 1);
  assert.equal(house.house.residents, capacity);
});

test('losing the market makes residents leave', () => {
  const game = richGame();
  buildMarket(game);
  const house = fillHouse(game, place(game, 'house', 16, 11));
  execute(game, { action: 'demolish', x: 13, y: 11 });
  assert.equal(house.house.served, false);
  const fish = game.state.goods.fish;
  run(game, game.rules.population.declineTicks * farmer(game).capacity);
  assert.equal(house.house.residents, game.rules.population.minResidents);
  assert.equal(game.state.goods.fish, fish, 'an unserved house buys nothing');
});

test('when stock is short the oldest house eats first', () => {
  const game = richGame();
  buildMarket(game);
  const older = place(game, 'house', 16, 11);
  const newer = place(game, 'house', 16, 13);
  game.state.goods.fish = 1;
  run(game, 1);
  assert.equal(game.state.goods.fish, 0);
  assert.equal(older.house.met.fish, true);
  assert.equal(newer.house.met.fish, false);
});

test('goods never go negative however many houses are hungry', () => {
  const game = richGame();
  buildMarket(game);
  for (const [x, y] of HOUSE_SITES) place(game, 'house', x, y);
  game.state.goods.fish = 3;
  for (let i = 0; i < 3000; i++) {
    run(game, 1);
    assert.ok(game.state.goods.fish >= 0);
  }
});

test('residents are counted per tier, and a demolished house takes its residents with it', () => {
  const game = richGame();
  buildMarket(game);
  fillHouse(game, place(game, 'house', 16, 11));
  fillHouse(game, place(game, 'house', 16, 13));
  const capacity = farmer(game).capacity;
  assert.deepEqual(countResidents(game), { farmer: capacity * 2, worker: 0, artisan: 0 });
  execute(game, { action: 'demolish', x: 16, y: 13 });
  assert.deepEqual(countResidents(game), { farmer: capacity, worker: 0, artisan: 0 });
});

test('a worker house needs bread as well as fish to fill, and empties without it', () => {
  const game = richGame();
  buildMarket(game);
  const house = fillHouse(game, place(game, 'house', 16, 11));
  assert.equal(execute(game, { action: 'upgrade', id: house.id }).ok, true);
  const worker = game.rules.tiers.worker;
  assert.equal(house.house.residents, farmer(game).capacity, 'existing residents stay');

  fillHouse(game, house);
  assert.equal(house.house.residents, worker.capacity);

  // Plenty of fish, no bread.
  game.state.goods.bread = 0;
  game.state.goods.fish = game.state.storageCap;
  run(game, worker.needs.bread.hungerThreshold + game.rules.population.declineTicks * worker.capacity);
  assert.equal(house.house.met.fish, true);
  assert.equal(house.house.met.bread, false);
  assert.equal(house.house.residents, game.rules.population.minResidents);
  assert.equal(house.house.tier, 'worker', 'houses never downgrade');
});
