import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../src/sim/index.js';
import { richGame, testGame, place, road, line, coins } from './helpers.js';

// The free warehouse covers x 10..11, y 9..10 on the test island.

test('a warehouse is always connected', () => {
  const game = richGame();
  assert.equal(game.state.buildings[0].connected, true);
});

test('a building is not connected until a road links it to a warehouse', () => {
  const game = richGame();
  const mill = place(game, 'sawmill', 15, 9);
  assert.equal(mill.connected, false);
  road(game, line(12, 9, 13, 9));
  assert.equal(mill.connected, false, 'road stops one tile short');
  road(game, [[14, 9]]);
  assert.equal(mill.connected, true);
});

test('standing next to a warehouse without a road is not a connection', () => {
  const game = richGame();
  const mill = place(game, 'sawmill', 12, 9);
  assert.equal(mill.connected, false);
});

test('a road that does not touch a warehouse connects nothing', () => {
  const game = richGame();
  const mill = place(game, 'sawmill', 15, 9);
  road(game, line(13, 9, 14, 9));
  assert.equal(mill.connected, false);
});

test('roads and buildings do not connect diagonally', () => {
  const game = richGame();
  // Road ends at (13,9). The sawmill's nearest corner is (14,10): a diagonal touch only.
  const mill = place(game, 'sawmill', 14, 10);
  road(game, line(12, 9, 13, 9));
  assert.equal(mill.connected, false);

  // Two road tiles that only touch at a corner are not joined either.
  const other = richGame();
  const far = place(other, 'sawmill', 15, 11);
  road(other, [[12, 9], [13, 10], [14, 11]]);
  assert.equal(far.connected, false);
});

test('roads can turn corners', () => {
  const game = richGame();
  const mill = place(game, 'sawmill', 16, 13);
  road(game, [...line(12, 10, 15, 10), ...line(15, 11, 15, 13)]);
  assert.equal(mill.connected, true);
});

test('removing one road tile cuts off what is behind it', () => {
  const game = richGame();
  const near = place(game, 'sawmill', 13, 7);  // touches the road at (13,9) from above
  const far = place(game, 'sawmill', 17, 9);
  road(game, line(12, 9, 16, 9));
  assert.equal(near.connected, true);
  assert.equal(far.connected, true);
  execute(game, { action: 'demolish', x: 15, y: 9 });
  assert.equal(near.connected, true);
  assert.equal(far.connected, false);
});

test('demolishing a warehouse disconnects its network', () => {
  const game = richGame();
  place(game, 'warehouse', 18, 12);
  const mill = place(game, 'sawmill', 15, 12);
  road(game, [[17, 12]]);
  assert.equal(mill.connected, true);
  execute(game, { action: 'demolish', x: 18, y: 12 });
  assert.equal(mill.connected, false);
});

test('the road command charges per new tile and skips existing road for free', () => {
  const game = richGame();
  const price = game.rules.buildings.road.cost.coinsMilli / 1000;
  const start = coins(game);
  const first = road(game, line(12, 9, 16, 9));
  assert.equal(first.placed, 5);
  assert.equal(coins(game), start - 5 * price);
  const second = road(game, line(14, 9, 19, 9));
  assert.equal(second.placed, 3, 'three of the six tiles were already road');
  assert.equal(coins(game), start - 8 * price);
});

test('the road command stops paying when coins run out', () => {
  const game = testGame({ coins: 3 });
  const result = execute(game, { action: 'road', tiles: line(12, 9, 17, 9) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_enough_coins');
  assert.equal(result.placed, 3);
  assert.equal(result.failed, 3);
  assert.equal(coins(game), 0);
});

test('the road command lays the valid tiles and reports the bad ones', () => {
  const game = richGame();
  // (4,7) to (4,2): crosses forest at y 6..3.
  const result = execute(game, { action: 'road', tiles: line(4, 8, 4, 2) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_buildable');
  assert.equal(result.placed, 3, '(4,8), (4,7) and (4,2) are grass');
  assert.equal(result.failed, 4);
});

test('a badly formed road command is refused', () => {
  const game = richGame();
  assert.equal(execute(game, { action: 'road' }).reason, 'bad_command');
  assert.equal(execute(game, { action: 'road', tiles: ['nonsense'] }).ok, false);
});
