// Shared helpers for the tests.
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { createGame, execute, step } from '../src/sim/index.js';

const LEGEND = { '~': 'water', c: 'coast', '.': 'grass', f: 'fertile', T: 'forest' };

// A small hand-drawn island used by most tests.
//   ~ water   c coast   . grass   f fertile   T forest
// Forest is x 4..7, y 3..6.   Fertile is x 14..17, y 3..6.
// The free warehouse sits at (10,9) and covers x 10..11, y 9..10.
export const TEST_ISLAND = [
  '~~~~~~~~~~~~~~~~~~~~~~~~',
  '~cccccccccccccccccccccc~',
  '~c....................c~',
  '~c..TTTT......ffff....c~',
  '~c..TTTT......ffff....c~',
  '~c..TTTT......ffff....c~',
  '~c..TTTT......ffff....c~',
  '~c....................c~',
  '~c....................c~',
  '~c....................c~',
  '~c....................c~',
  '~c....................c~',
  '~c....................c~',
  '~c....................c~',
  '~c....................c~',
  '~c....................c~',
  '~cccccccccccccccccccccc~',
  '~~~~~~~~~~~~~~~~~~~~~~~~',
];
export const TEST_START = { x: 10, y: 9 };

export function mapFromRows(rows, start = TEST_START) {
  const width = rows[0].length;
  const terrain = [];
  for (const row of rows) {
    assert.equal(row.length, width, 'every map row must be the same length');
    for (const ch of row) {
      assert.ok(LEGEND[ch], `unknown map character "${ch}"`);
      terrain.push(LEGEND[ch]);
    }
  }
  return { width, height: rows.length, terrain, start };
}

// A game on the test island. Options:
//   change(data)  edit the data files before the game is built
//   coins, goods  override the starting stock
//   rows, start   use a different hand-drawn map
export function testGame({ change, coins, goods, rows = TEST_ISLAND, start = TEST_START } = {}) {
  const data = loadData();
  if (change) change(data);
  const game = createGame(data, { map: mapFromRows(rows, start) });
  if (coins !== undefined) game.state.coinsMilli = coins * 1000;
  if (goods) Object.assign(game.state.goods, goods);
  return game;
}

// A game with plenty of everything, for tests that are not about cost.
export function richGame(options = {}) {
  const game = testGame(options);
  game.state.coinsMilli = (options.coins ?? 100000) * 1000;
  // Stock is capped by storage, so fill to the cap rather than past it.
  for (const good of game.rules.goodIds) game.state.goods[good] = options.goods?.[good] ?? game.state.storageCap;
  return game;
}

export function place(game, building, x, y) {
  const result = execute(game, { action: 'place', building, x, y });
  assert.equal(result.ok, true, `placing ${building} at ${x},${y} failed: ${result.reason}`);
  return game.state.buildings.find((b) => b.id === result.id);
}

export function road(game, tiles) {
  const result = execute(game, { action: 'road', tiles });
  assert.equal(result.ok, true, `road failed: ${result.reason}`);
  return result;
}

// A straight line of tiles from (x0,y0) to (x1,y1), inclusive.
export function line(x0, y0, x1, y1) {
  const tiles = [];
  const dx = Math.sign(x1 - x0);
  const dy = Math.sign(y1 - y0);
  assert.ok(dx === 0 || dy === 0, 'line() only draws straight lines');
  let x = x0;
  let y = y0;
  for (;;) {
    tiles.push([x, y]);
    if (x === x1 && y === y1) break;
    x += dx;
    y += dy;
  }
  return tiles;
}

export function run(game, ticks) {
  for (let i = 0; i < ticks; i++) step(game);
}

export function runSeconds(game, seconds) {
  run(game, Math.round(seconds * game.rules.ticksPerSecond));
}

export const coins = (game) => game.state.coinsMilli / 1000;
export const snapshot = (game) => JSON.stringify(game.state);

// A connected market at (13,11), covering x 13..14, y 11..12. Its centre is (14,12).
export function buildMarket(game) {
  const market = place(game, 'market', 13, 11);
  road(game, [[12, 10], [12, 11]]);
  return market;
}

// Sites for 2x2 houses that are all well inside the market's range.
export const HOUSE_SITES = [[16, 11], [16, 13], [18, 11], [18, 13], [13, 13], [20, 11], [20, 13], [15, 8]];

// Runs the game until the house is full. Fails if it never fills.
export function fillHouse(game, house) {
  const capacity = game.rules.tiers[house.house.tier].capacity;
  for (let i = 0; i < 20000 && house.house.residents < capacity; i++) step(game);
  assert.equal(house.house.residents, capacity, 'the house never filled up');
  return house;
}

// The data files as they were when only the first `rounds` rounds of
// additions (config.addedLater) had been made. 0 is the game as first
// released; 1 is with wool, cloth and Artisans but before staff.
export function dataBefore(rounds) {
  const data = loadData();
  const steps = data.config.addedLater;
  for (const added of steps.slice(rounds)) {
    for (const id of added.goods ?? []) delete data.goods[id];
    for (const id of added.buildings ?? []) delete data.buildings[id];
    for (const id of added.tiers ?? []) delete data.population.tiers[id];
    for (const id of added.upgradesFrom ?? []) delete data.population.tiers[id].upgrade;
    for (const key of added.config ?? []) delete data.config[key];
    for (const key of added.buildingSettings ?? []) {
      for (const b of Object.values(data.buildings)) if (b !== null && typeof b === 'object') delete b[key];
    }
  }
  // Scenarios came after all of these, and one of them needs Artisans.
  if (rounds < steps.length) delete data.config.scenarios;
  if (rounds > 0) data.config.addedLater = steps.slice(0, rounds);
  else delete data.config.addedLater;
  return data;
}
