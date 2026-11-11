import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, getSummary } from '../src/sim/index.js';
import { richGame, place, run, buildMarket, fillHouse } from './helpers.js';

// Fourteen 2x2 house sites on the test island.
const SITES = [
  [2, 11], [4, 11], [6, 11], [8, 11], [2, 13], [4, 13], [6, 13], [8, 13],
  [14, 11], [16, 11], [18, 11], [20, 11], [14, 13], [16, 13],
];

// Builds houses and sets their tier and residents directly, to test only the win check.
function townWith(tier, residentsPerHouse) {
  const game = richGame();
  residentsPerHouse.forEach((residents, i) => {
    const house = place(game, 'house', SITES[i][0], SITES[i][1]);
    house.house.tier = tier;
    house.house.residents = residents;
  });
  return game;
}

test('the shipped win target is 100 Workers', () => {
  const game = richGame();
  assert.deepEqual(game.rules.win, { tier: 'worker', residents: 100 });
});

test('99 Workers is not a win, 100 is', () => {
  const target = richGame().rules.win.residents;
  const houses = new Array(13).fill(8); // 104
  houses[0] = 8 - (104 - (target - 1)); // bring the total to one short of the target
  const game = townWith('worker', houses);
  assert.equal(getSummary(game).win.current, target - 1);
  run(game, 1);
  assert.equal(game.state.won, false);

  game.state.buildings.find((b) => b.house).house.residents += 1;
  run(game, 1);
  assert.equal(game.state.won, true);
  assert.equal(game.state.wonAtTick, 2);
  assert.equal(getSummary(game).win.wonAtSeconds, 2 / game.rules.ticksPerSecond);
});

test('Farmers do not count toward the win', () => {
  const game = townWith('farmer', new Array(14).fill(8)); // 112 farmers
  run(game, 1);
  assert.equal(getSummary(game).residents.farmer, 112);
  assert.equal(game.state.won, false);
});

test('the win is recorded once and the game carries on', () => {
  const game = townWith('worker', new Array(13).fill(8));
  run(game, 1);
  assert.equal(game.state.wonAtTick, 1);
  const coinsAtWin = game.state.coinsMilli;
  run(game, game.rules.ticksPerMinute);
  assert.equal(game.state.won, true);
  assert.equal(game.state.wonAtTick, 1, 'the win time does not move');
  assert.notEqual(game.state.coinsMilli, coinsAtWin, 'the economy is still running');
});

test('a win reached through real play: one upgraded house with a small target', () => {
  const game = richGame({ change: (d) => { d.config.win.residents = d.population.tiers.worker.capacity; } });
  buildMarket(game);
  const house = fillHouse(game, place(game, 'house', 16, 11));
  assert.equal(game.state.won, false);
  assert.equal(execute(game, { action: 'upgrade', id: house.id }).ok, true);
  run(game, 1);
  assert.equal(game.state.won, false, 'four Workers is not eight');
  fillHouse(game, house);
  assert.equal(game.state.won, true);
  assert.equal(game.state.wonAtTick, game.state.tick);
});
