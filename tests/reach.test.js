// Phase 25: how far carts reach, shown while placing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { roadReach } from '../src/sim/index.js';
import { cartReachMap, haulIfPlaced } from '../src/ui/tools.js';
import { haulText } from '../src/ui/text.js';
import { line, place, road, testGame } from './helpers.js';

// A long thin island, 44 tiles wide. The free warehouse stands at (2,2),
// covering x 2..3, y 2..3, and a road runs east along y 4 from x 2 to x 41.
const LONG = [
  '~'.repeat(44),
  `~${'c'.repeat(42)}~`,
  `~c${'.'.repeat(40)}c~`,
  `~c${'.'.repeat(40)}c~`,
  `~c${'.'.repeat(40)}c~`,
  `~c${'.'.repeat(40)}c~`,
  `~c${'.'.repeat(40)}c~`,
  `~${'c'.repeat(42)}~`,
  '~'.repeat(44),
];

function longGame({ carts = true } = {}) {
  const game = testGame({ rows: LONG, start: { x: 2, y: 2 }, carts, coins: 5000, goods: { wood: 100, planks: 100 } });
  road(game, line(2, 4, 41, 4));
  return game;
}

test('the road search: a road beside the warehouse is 1, and each tile along it one more', () => {
  const game = longGame();
  const { dist } = roadReach(game);
  const at = (x, y) => dist[y * game.state.map.width + x];
  assert.equal(at(2, 4), 1, 'beside the warehouse');
  assert.equal(at(3, 4), 1, 'also beside it');
  assert.equal(at(10, 4), 8);
  assert.equal(at(41, 4), 39);
  assert.equal(at(10, 5), 0, 'not a road');
});

test('the reach map: roads a cart comes along, and roads too far or joined to no warehouse', () => {
  const game = longGame();
  const reach = game.rules.carts.reachTiles;
  const { tiles } = cartReachMap(game);
  assert.equal(tiles.length, 40);
  for (const t of tiles) assert.equal(t.reached, t.tiles <= reach, `${t.x},${t.y} at ${t.tiles}`);
  assert.ok(tiles.some((t) => !t.reached), 'the far end is beyond reach');
  // A piece of road joined to nothing is not reached.
  road(game, [[20, 6]]);
  const loose = cartReachMap(game).tiles.find((t) => t.x === 20 && t.y === 6);
  assert.deepEqual([loose.tiles, loose.reached], [0, false]);
  // Without carts there is no reach to show.
  assert.deepEqual(cartReachMap(longGame({ carts: false })).tiles, []);
});

test('the distance shown while placing is the distance the building gets once placed', () => {
  const game = longGame();
  for (const x of [5, 20, 33]) {
    const predicted = haulIfPlaced(game, 'sawmill', x, 5);
    const mill = place(game, 'sawmill', x, 5);
    assert.equal(mill.production.haul.tiles, predicted, `a sawmill at x ${x}`);
  }
  // Nothing to say where no road touches the building.
  assert.equal(haulIfPlaced(game, 'sawmill', 20, 1), null);
});

test('the words for the distance', () => {
  const { rules } = longGame();
  assert.equal(haulText(rules, 1), '1 road tile from a warehouse.');
  assert.equal(haulText(rules, 12), '12 road tiles from a warehouse.');
  assert.equal(haulText(rules, 30), '30 road tiles from a warehouse.');
  assert.equal(haulText(rules, 31), 'Too far for carts: 31 road tiles. They come 30.');
  assert.equal(haulText(rules, null), null);
  assert.equal(haulText(longGame({ carts: false }).rules, 12), null, 'no words without carts');
});

test('a sawmill placed where the tip says "too far" really is out of reach', () => {
  const game = longGame();
  const tiles = haulIfPlaced(game, 'sawmill', 36, 5);
  assert.match(haulText(game.rules, tiles), /^Too far for carts/);
  const mill = place(game, 'sawmill', 36, 5);
  assert.ok(mill.production.haul.tiles > game.rules.carts.reachTiles);
});
