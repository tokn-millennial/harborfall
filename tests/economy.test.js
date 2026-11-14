import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, getSummary } from '../src/sim/index.js';
import { testGame, richGame, place, road, line, run, buildMarket, fillHouse, coins } from './helpers.js';

const interval = (game) => game.rules.economy.incomeIntervalTicks;
// What one settlement should pay, worked out from the summary's per-minute rate.
const duePerSettlement = (game) =>
  Math.round((getSummary(game).income.net * 1000 * interval(game)) / game.rules.ticksPerMinute);

test('a new game earns the base income minus the warehouse upkeep', () => {
  const game = testGame();
  const { income } = getSummary(game);
  assert.equal(income.base, game.rules.economy.baseIncomeMilliPerMinute / 1000);
  assert.equal(income.upkeep, game.rules.buildings.warehouse.upkeepMilliPerMinute / 1000);
  assert.equal(income.taxes, 0);
  assert.equal(income.net, income.base - income.upkeep);
});

test('income is settled once per interval, to the thousandth of a coin', () => {
  const game = testGame();
  const start = game.state.coinsMilli;
  const due = duePerSettlement(game);
  run(game, interval(game) - 1);
  assert.equal(game.state.coinsMilli, start, 'nothing before the interval is up');
  run(game, 1);
  assert.equal(game.state.coinsMilli, start + due);
  assert.equal(game.state.lastIncome.paidMilli, due);
});

test('every resident pays the tax rate of their tier', () => {
  const game = richGame();
  buildMarket(game);
  const house = fillHouse(game, place(game, 'house', 16, 11));
  const { farmer, worker } = game.rules.tiers;
  assert.equal(getSummary(game).income.taxes, (farmer.capacity * farmer.taxMilliPerMinute) / 1000);

  assert.equal(execute(game, { action: 'upgrade', id: house.id }).ok, true);
  assert.equal(getSummary(game).income.taxes, (farmer.capacity * worker.taxMilliPerMinute) / 1000, 'same people, worker rate');
  fillHouse(game, house);
  assert.equal(getSummary(game).income.taxes, (worker.capacity * worker.taxMilliPerMinute) / 1000);
});

test('one minute of steady income adds up exactly', () => {
  const game = richGame();
  buildMarket(game);
  fillHouse(game, place(game, 'house', 16, 11));
  while (game.state.incomeTimer !== 0) run(game, 1); // line up with a settlement
  const start = game.state.coinsMilli;
  const due = duePerSettlement(game);
  run(game, game.rules.ticksPerMinute);
  assert.equal(game.state.coinsMilli, start + due * (game.rules.ticksPerMinute / interval(game)));
});

test('an hour of steady income has no rounding drift', () => {
  const game = richGame();
  buildMarket(game);
  fillHouse(game, place(game, 'house', 16, 11));
  while (game.state.incomeTimer !== 0) run(game, 1);
  const start = game.state.coinsMilli;
  const due = duePerSettlement(game);
  const ticks = game.rules.ticksPerMinute * 60;
  run(game, ticks);
  assert.equal(game.state.coinsMilli, start + due * (ticks / interval(game)));
  assert.ok(Number.isInteger(game.state.coinsMilli));
});

test('upkeep is charged for every building, working or not', () => {
  const game = richGame();
  const before = getSummary(game).income.upkeep;
  const mill = place(game, 'sawmill', 15, 12); // no road
  assert.equal(mill.connected, false);
  assert.equal(getSummary(game).income.upkeep, before + game.rules.buildings.sawmill.upkeepMilliPerMinute / 1000);
});

test('demolishing a building removes its upkeep', () => {
  const game = richGame();
  const before = getSummary(game).income.upkeep;
  place(game, 'sawmill', 15, 12);
  execute(game, { action: 'demolish', x: 15, y: 12 });
  assert.equal(getSummary(game).income.upkeep, before);
});

test('coins stop at zero, unpaid upkeep is forgiven, and buildings keep running', () => {
  const game = richGame({ change: (d) => { d.config.economy.baseIncomePerMinute = 0; } });
  place(game, 'lumberjack', 8, 4);
  road(game, [...line(10, 8, 10, 4), [9, 4]]);
  game.state.goods.wood = 0;
  game.state.coinsMilli = 50; // a twentieth of a coin
  assert.ok(getSummary(game).income.net < 0, 'this town loses money');

  run(game, interval(game));
  assert.equal(game.state.coinsMilli, 0);
  assert.equal(game.state.lastIncome.paidMilli, -50, 'only what was there is taken');
  assert.ok(game.state.lastIncome.dueMilli < -50);

  run(game, game.rules.buildings.lumberjack.production.cycleTicks * 5);
  assert.equal(game.state.coinsMilli, 0, 'never negative');
  assert.ok(game.state.goods.wood >= 4, 'the lumberjack kept working');
});

test('at zero coins building is refused, then works again once income returns', () => {
  const game = testGame({ coins: 0 });
  assert.ok(getSummary(game).income.net > 0, 'base income keeps a bare island in profit');
  assert.equal(execute(game, { action: 'place', building: 'house', x: 16, y: 11 }).reason, 'not_enough_coins');
  assert.equal(execute(game, { action: 'road', tiles: [[12, 9]] }).reason, 'not_enough_coins');

  const price = game.rules.buildings.house.cost.coinsMilli;
  let ticks = 0;
  while (game.state.coinsMilli < price && ticks < 100000) {
    run(game, 1);
    ticks++;
  }
  assert.ok(game.state.coinsMilli >= price, 'income eventually covers a house');
  assert.equal(execute(game, { action: 'place', building: 'house', x: 16, y: 11 }).ok, true);
});

test('the summary reports coins, goods, storage, residents and win progress', () => {
  const game = richGame();
  buildMarket(game);
  fillHouse(game, place(game, 'house', 16, 11));
  const s = getSummary(game);
  assert.equal(s.tick, game.state.tick);
  assert.equal(s.seconds, game.state.tick / game.rules.ticksPerSecond);
  assert.equal(s.coins, Math.floor(coins(game)));
  assert.deepEqual(s.goods, game.state.goods);
  assert.equal(s.storageCap, game.state.storageCap);
  assert.deepEqual(s.residents, { farmer: game.rules.tiers.farmer.capacity, worker: 0, artisan: 0 });
  assert.deepEqual(s.housing, { farmer: game.rules.tiers.farmer.capacity, worker: 0, artisan: 0 });
  assert.deepEqual(s.milestones, [{ tier: 'artisan', target: 100, title: 'A city of Artisans', current: 0, reachedAtTick: null, reachedAtSeconds: null }]);
  assert.deepEqual(s.win, {
    tier: game.rules.win.tier, target: game.rules.win.residents, current: 0,
    won: false, wonAtTick: null, wonAtSeconds: null, medal: null,
  });
  s.goods.fish = -1;
  assert.notEqual(game.state.goods.fish, -1, 'the summary is a copy, not the live state');
});
