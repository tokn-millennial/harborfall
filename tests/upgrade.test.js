import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, canUpgrade } from '../src/sim/index.js';
import { richGame, place, run, buildMarket, fillHouse, coins, snapshot } from './helpers.js';

const upgrade = (game, id) => execute(game, { action: 'upgrade', id });

// A fed, full Farmer house next to a connected market.
function readyHouse() {
  const game = richGame();
  buildMarket(game);
  const house = fillHouse(game, place(game, 'house', 16, 11));
  return { game, house };
}

test('a full, fed house with bread in stock can be upgraded', () => {
  const { game, house } = readyHouse();
  const cost = game.rules.tiers.farmer.upgrade.cost;
  const before = { coins: game.state.coinsMilli, goods: { ...game.state.goods } };

  assert.deepEqual(canUpgrade(game, house.id), { ok: true });
  assert.deepEqual(upgrade(game, house.id), { ok: true, tier: 'worker' });

  assert.equal(house.house.tier, 'worker');
  assert.equal(game.state.coinsMilli, before.coins - cost.coinsMilli);
  for (const good of game.rules.goodIds) {
    assert.equal(game.state.goods[good], before.goods[good] - (cost.goods[good] ?? 0), good);
  }
  const breadAfterPaying = game.state.goods.bread;
  run(game, 1);
  assert.equal(game.state.goods.bread, breadAfterPaying - 1, 'the first bread is bought on the next tick');
  assert.equal(house.house.met.bread, true);
});

test('a house that is not full cannot be upgraded', () => {
  const game = richGame();
  buildMarket(game);
  const house = place(game, 'house', 16, 11);
  run(game, 5);
  assert.equal(upgrade(game, house.id).reason, 'house_not_full');
});

test('a house with no market cannot be upgraded', () => {
  const { game, house } = readyHouse();
  execute(game, { action: 'demolish', x: 13, y: 11 });
  assert.equal(upgrade(game, house.id).reason, 'no_market');
});

test('a house whose fish need is unmet cannot be upgraded', () => {
  const { game, house } = readyHouse();
  game.state.goods.fish = 0;
  // Run until the next purchase comes due and fails, one tick at a time,
  // so the house is caught hungry but still full.
  for (let i = 0; i < game.rules.tiers.farmer.needs.fish.hungerThreshold && house.house.met.fish; i++) run(game, 1);
  assert.equal(house.house.met.fish, false);
  assert.equal(house.house.residents, game.rules.tiers.farmer.capacity, 'still full at this moment');
  assert.equal(upgrade(game, house.id).reason, 'needs_unmet');
});

test('no bread in stock: no upgrade', () => {
  const { game, house } = readyHouse();
  game.state.goods.bread = 0;
  assert.equal(upgrade(game, house.id).reason, 'no_bread');
});

test('not enough planks or coins: no upgrade', () => {
  const { game, house } = readyHouse();
  const cost = game.rules.tiers.farmer.upgrade.cost;
  game.state.goods.planks = cost.goods.planks - 1;
  assert.equal(upgrade(game, house.id).reason, 'not_enough_goods');
  game.state.goods.planks = cost.goods.planks;
  game.state.coinsMilli = cost.coinsMilli - 1;
  assert.equal(upgrade(game, house.id).reason, 'not_enough_coins');
  game.state.coinsMilli = cost.coinsMilli;
  assert.equal(upgrade(game, house.id).ok, true);
  assert.equal(coins(game), 0);
});

test('a failed upgrade changes nothing, and checking never changes anything', () => {
  const { game, house } = readyHouse();
  game.state.goods.bread = 0;
  const before = snapshot(game);
  canUpgrade(game, house.id);
  upgrade(game, house.id);
  assert.equal(snapshot(game), before);
});

test('only houses can be upgraded, one step at a time, and not past the top tier', () => {
  const { game, house } = readyHouse();
  const market = game.state.buildings.find((b) => b.type === 'market');
  assert.equal(upgrade(game, market.id).reason, 'not_a_house');
  assert.equal(upgrade(game, 9999).reason, 'not_a_house');
  assert.equal(upgrade(game, house.id).ok, true);
  assert.equal(house.house.tier, 'worker');
  assert.equal(upgrade(game, house.id).reason, 'house_not_full', 'a Worker house must fill up before the next step');
  fillHouse(game, house);
  game.state.goods.cloth = 10;
  game.state.goods.planks = 50;
  game.state.coinsMilli = 1000000;
  assert.equal(upgrade(game, house.id).ok, true);
  assert.equal(house.house.tier, 'artisan');
  fillHouse(game, house);
  assert.equal(house.house.residents, game.rules.tiers.artisan.capacity);
  assert.equal(upgrade(game, house.id).reason, 'max_tier');
});
