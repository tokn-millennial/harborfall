import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, canPlace, buildingAt } from '../src/sim/index.js';
import { testGame, richGame, place, road, coins, snapshot } from './helpers.js';

const tryPlace = (game, building, x, y) => execute(game, { action: 'place', building, x, y });

test('a new game has the free warehouse at the start site', () => {
  const game = testGame();
  assert.equal(game.state.buildings.length, 1);
  const w = game.state.buildings[0];
  assert.equal(w.type, 'warehouse');
  assert.equal(w.free, true);
  assert.equal(buildingAt(game, 10, 9), w);
  assert.equal(buildingAt(game, 11, 10), w);
  assert.equal(buildingAt(game, 12, 9), null);
});

test('a new game has the starting coins and goods from config.json', () => {
  const game = testGame();
  assert.equal(game.state.coinsMilli, game.rules.start.coinsMilli);
  for (const good of game.rules.goodIds) {
    assert.equal(game.state.goods[good], game.rules.start.goods[good] ?? 0, good);
  }
});

test('buildings cannot go on water or forest', () => {
  const game = richGame();
  assert.equal(tryPlace(game, 'house', 0, 0).reason, 'not_buildable');
  assert.equal(tryPlace(game, 'house', 4, 3).reason, 'not_buildable');
  assert.equal(tryPlace(game, 'house', 3, 3).reason, 'not_buildable', 'half on forest');
  assert.equal(tryPlace(game, 'road', 5, 5).reason, 'not_buildable', 'road on forest');
});

test('buildings cannot hang off the map', () => {
  const game = richGame();
  assert.equal(tryPlace(game, 'house', -1, 5).reason, 'out_of_bounds');
  assert.equal(tryPlace(game, 'house', 23, 5).reason, 'out_of_bounds');
  assert.equal(tryPlace(game, 'house', 5, 17).reason, 'out_of_bounds');
  assert.equal(tryPlace(game, 'house', 2.5, 5).reason, 'out_of_bounds');
});

test('buildings cannot overlap buildings or roads', () => {
  const game = richGame();
  assert.equal(tryPlace(game, 'house', 11, 10).reason, 'blocked', 'overlaps the warehouse');
  road(game, [[14, 12]]);
  assert.equal(tryPlace(game, 'house', 13, 11).reason, 'blocked', 'overlaps a road');
  assert.equal(tryPlace(game, 'road', 10, 9).reason, 'blocked', 'road on a building');
  place(game, 'house', 2, 12);
  assert.equal(tryPlace(game, 'house', 3, 13).reason, 'blocked', 'overlaps a house');
});

test('unknown buildings and unknown commands are refused', () => {
  const game = richGame();
  assert.equal(tryPlace(game, 'castle', 5, 10).reason, 'unknown_building');
  assert.equal(execute(game, { action: 'dance' }).reason, 'unknown_command');
  assert.equal(execute(game, null).reason, 'unknown_command');
});

test('a lumberjack needs enough forest within its radius', () => {
  // From (8,4) exactly 13 forest tiles are within radius 4 on the test island.
  const need13 = richGame({ change: (d) => { d.buildings.lumberjack.placement.terrainInRadius = { terrain: 'forest', radius: 4, minTiles: 13 }; } });
  assert.equal(tryPlace(need13, 'lumberjack', 8, 4).ok, true);

  const need14 = richGame({ change: (d) => { d.buildings.lumberjack.placement.terrainInRadius = { terrain: 'forest', radius: 4, minTiles: 14 }; } });
  assert.equal(tryPlace(need14, 'lumberjack', 8, 4).reason, 'needs_forest');

  const game = richGame();
  assert.equal(tryPlace(game, 'lumberjack', 20, 14).reason, 'needs_forest', 'far from any forest');
});

test('a fisherman must share an edge with a coast tile', () => {
  const game = richGame();
  assert.equal(tryPlace(game, 'fisherman', 10, 5).reason, 'needs_coast', 'inland');
  assert.equal(tryPlace(game, 'fisherman', 2, 5).ok, true, 'grass next to the coast');
  assert.equal(tryPlace(game, 'fisherman', 1, 8).ok, true, 'on the coast itself');
  assert.equal(tryPlace(game, 'fisherman', 3, 3).reason, 'needs_coast', 'one tile further in');
});

test('a farm needs every tile on fertile land', () => {
  const game = richGame();
  assert.equal(tryPlace(game, 'farm', 13, 3).reason, 'needs_fertile', 'half on grass');
  assert.equal(tryPlace(game, 'farm', 8, 12).reason, 'needs_fertile', 'all grass');
  assert.equal(tryPlace(game, 'farm', 14, 3).ok, true);
  assert.equal(tryPlace(game, 'farm', 16, 5).ok, true);
});

test('placing a building charges exactly its cost', () => {
  const game = richGame();
  const cost = game.rules.buildings.farm.cost;
  const before = { coins: game.state.coinsMilli, goods: { ...game.state.goods } };
  const farm = place(game, 'farm', 14, 3);
  assert.equal(game.state.coinsMilli, before.coins - cost.coinsMilli);
  for (const good of game.rules.goodIds) {
    assert.equal(game.state.goods[good], before.goods[good] - (cost.goods[good] ?? 0), good);
  }
  for (const [x, y] of [[14, 3], [15, 3], [14, 4], [15, 4]]) assert.equal(buildingAt(game, x, y), farm);
});

test('not enough coins: refused, and nothing changes', () => {
  const game = richGame({ coins: game0Cost('market') - 1 });
  const before = snapshot(game);
  assert.equal(tryPlace(game, 'market', 14, 12).reason, 'not_enough_coins');
  assert.equal(snapshot(game), before);
});

test('not enough goods: refused, and nothing changes', () => {
  const game = richGame({ goods: { planks: 0 } });
  const before = snapshot(game);
  assert.equal(tryPlace(game, 'market', 14, 12).reason, 'not_enough_goods');
  assert.equal(snapshot(game), before);
});

test('exactly enough coins is enough', () => {
  const game = richGame({ coins: game0Cost('market') });
  assert.equal(tryPlace(game, 'market', 14, 12).ok, true);
  assert.equal(coins(game), 0);
});

test('checking a placement never changes the game', () => {
  const game = richGame();
  const before = snapshot(game);
  canPlace(game, 'house', 14, 12);
  canPlace(game, 'house', 0, 0);
  canPlace(game, 'farm', 14, 3);
  assert.equal(snapshot(game), before);
});

test('each warehouse adds storage room', () => {
  const game = richGame();
  const per = game.rules.buildings.warehouse.storagePerGood;
  assert.equal(game.state.storageCap, per);
  place(game, 'warehouse', 14, 12);
  assert.equal(game.state.storageCap, per * 2);
  assert.equal(execute(game, { action: 'demolish', x: 14, y: 12 }).ok, true);
  assert.equal(game.state.storageCap, per);
});

test('demolish returns half the cost, rounded down, and clears the tiles', () => {
  const game = richGame({ goods: { wood: 50, planks: 50 } });
  const def = game.rules.buildings.farm;
  const ratio = game.rules.economy.demolishRefundRatio;
  place(game, 'farm', 14, 3);
  const before = { coins: coins(game), goods: { ...game.state.goods } };
  const result = execute(game, { action: 'demolish', x: 15, y: 4 });
  assert.deepEqual(result, { ok: true, removed: 'farm' });
  assert.equal(coins(game), before.coins + Math.floor((def.cost.coinsMilli / 1000) * ratio));
  for (const [good, amount] of Object.entries(def.cost.goods)) {
    assert.equal(game.state.goods[good], before.goods[good] + Math.floor(amount * ratio), good);
  }
  assert.equal(buildingAt(game, 14, 3), null);
  assert.equal(game.state.buildings.length, 1);
  assert.equal(execute(game, { action: 'place', building: 'farm', x: 14, y: 3 }).ok, true, 'the site can be reused');
});

test('demolishing a road removes it', () => {
  const game = richGame();
  road(game, [[14, 12]]);
  const before = coins(game);
  assert.deepEqual(execute(game, { action: 'demolish', x: 14, y: 12 }), { ok: true, removed: 'road' });
  const roadCost = game.rules.buildings.road.cost.coinsMilli / 1000;
  assert.equal(coins(game), before + Math.floor(roadCost * game.rules.economy.demolishRefundRatio));
  assert.equal(execute(game, { action: 'place', building: 'house', x: 14, y: 12 }).ok, true);
});

test('demolish on an empty tile or off the map is refused', () => {
  const game = richGame();
  assert.equal(execute(game, { action: 'demolish', x: 5, y: 12 }).reason, 'nothing_here');
  assert.equal(execute(game, { action: 'demolish', x: -3, y: 12 }).reason, 'out_of_bounds');
});

test('the last warehouse cannot be demolished', () => {
  const game = richGame();
  const before = snapshot(game);
  assert.equal(execute(game, { action: 'demolish', x: 10, y: 9 }).reason, 'last_warehouse');
  assert.equal(snapshot(game), before);
});

test('with two warehouses, the free one can go, and returns nothing', () => {
  const game = richGame();
  place(game, 'warehouse', 14, 12);
  const before = coins(game);
  assert.equal(execute(game, { action: 'demolish', x: 10, y: 9 }).ok, true);
  assert.equal(coins(game), before, 'the free warehouse gives no refund');
  assert.equal(execute(game, { action: 'demolish', x: 14, y: 12 }).reason, 'last_warehouse');
});

test('building ids are never reused', () => {
  const game = richGame();
  const a = place(game, 'house', 2, 12);
  execute(game, { action: 'demolish', x: 2, y: 12 });
  const b = place(game, 'house', 2, 12);
  assert.notEqual(a.id, b.id);
});

// Coin cost of a building, read from the data files.
function game0Cost(building) {
  return testGame().rules.buildings[building].cost.coinsMilli / 1000;
}
