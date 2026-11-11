import test from 'node:test';
import assert from 'node:assert/strict';
import { getSummary, siteReason, step } from '../src/sim/index.js';
import { loadData } from '../src/platform/loadData.node.js';
import { createGame } from '../src/sim/index.js';
import { DIRS4, perimeter } from '../src/sim/grid.js';
import { testGame, run } from './helpers.js';
import { playMiniCity } from './scenario.js';

test('full chain from the real starting resources: wood, planks, fish, grain, bread, a Worker house', () => {
  const game = testGame();
  const produced = {};
  let previous = { ...game.state.goods };

  const { workerHouse } = playMiniCity(game, () => {
    for (const good of game.rules.goodIds) {
      assert.ok(game.state.goods[good] >= 0, `${good} went negative`);
      assert.ok(game.state.goods[good] <= game.state.storageCap, `${good} went over the storage limit`);
      if (game.state.goods[good] > previous[good]) produced[good] = true;
    }
    assert.ok(game.state.coinsMilli >= 0, 'coins went negative');
    previous = { ...game.state.goods };
  });

  assert.deepEqual(Object.keys(produced).sort(), [...game.rules.goodIds].sort(), 'every good was produced at least once');
  assert.equal(workerHouse.house.tier, 'worker');
  assert.equal(workerHouse.house.residents, game.rules.tiers.worker.capacity);
  assert.equal(getSummary(game).residents.worker, game.rules.tiers.worker.capacity);
  for (const b of game.state.buildings) {
    if (b.production) assert.equal(b.connected, true, `${b.type} is connected`);
  }
  assert.ok(getSummary(game).seconds < 20 * 60, `took ${Math.round(getSummary(game).seconds)} game seconds`);
});

// ---- the real, generated island -------------------------------------------

// Every tile a road could reach from the free warehouse.
function roadReach(game) {
  const { map } = game.state;
  const start = game.state.buildings[0];
  const def = game.rules.buildings[start.type];
  const seen = new Set();
  const queue = [];
  const visit = (x, y) => {
    const key = y * map.width + x;
    if (seen.has(key) || siteReason(game, 'road', x, y) !== null) return;
    seen.add(key);
    queue.push([x, y]);
  };
  for (const [x, y] of perimeter(start.x, start.y, def.w, def.h)) visit(x, y);
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    for (const [dx, dy] of DIRS4) visit(x + dx, y + dy);
  }
  return seen;
}

// How many sites for `type` could be built and then joined to the warehouse by road.
function reachableSites(game, type, reach) {
  const { map } = game.state;
  const def = game.rules.buildings[type];
  let count = 0;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (siteReason(game, type, x, y) !== null) continue;
      if (perimeter(x, y, def.w, def.h).some(([px, py]) => reach.has(py * map.width + px))) count++;
    }
  }
  return count;
}

test('the real island starts with the free warehouse and the starting stock', () => {
  const game = createGame(loadData());
  const s = getSummary(game);
  assert.equal(game.state.buildings.length, 1);
  assert.equal(game.state.buildings[0].type, 'warehouse');
  assert.deepEqual({ x: game.state.buildings[0].x, y: game.state.buildings[0].y }, game.state.map.start);
  assert.equal(s.coins, 500);
  assert.equal(s.goods.wood, 40);
  assert.equal(s.goods.planks, 20);
});

test('on the real island every kind of building has sites that a road can reach from the start', () => {
  const game = createGame(loadData());
  const reach = roadReach(game);
  assert.ok(reach.size >= 500, `only ${reach.size} tiles are reachable by road`);
  const need = { lumberjack: 10, fisherman: 10, farm: 12, sawmill: 50, bakery: 50, market: 50, house: 100 };
  for (const [type, min] of Object.entries(need)) {
    const sites = reachableSites(game, type, reach);
    assert.ok(sites >= min, `${type}: only ${sites} reachable sites, want at least ${min}`);
  }
});

test('an untouched real island runs for 40 game minutes without trouble', () => {
  const game = createGame(loadData());
  const start = game.state.coinsMilli;
  const net = getSummary(game).income.net;
  const ticks = 40 * game.rules.ticksPerMinute;
  for (let i = 0; i < ticks; i++) step(game);
  assert.equal(game.state.tick, ticks);
  assert.equal(game.state.coinsMilli, start + net * 1000 * 40);
  assert.equal(game.state.won, false);
});
