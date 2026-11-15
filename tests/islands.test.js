// The second island (Phase 22): opening it, settling it, each island's own
// goods, and your own ship between the two.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import {
  HOME, SECOND, buildingById, canPlace, createGame, execute, getSummary, islandAt, loadGame, saveGame, shipSummary, siteReason, step,
} from '../src/sim/index.js';
import { seaTiles } from '../src/sim/ship.js';
import { createPlanner } from '../tools/bot/planner.js';
import { runBot } from '../tools/bot/bot.js';
import { loadOrder } from '../tools/tune.mjs';
import { panelModel } from '../src/ui/panelModel.js';
import { reasonText, winMessage } from '../src/ui/text.js';
import { createLife } from '../src/render/life.js';
import { islandAt as islandAtFn, seaPath, shipHarbour } from '../src/sim/index.js';
import { dataBefore, line, place, road, run } from './helpers.js';

const throughText = (value) => JSON.parse(JSON.stringify(value));

// ---- a small map with two islands ----------------------------------------------
// The home island fills x 1..10 and the second island x 15..24, with four
// columns of sea between them. The second island's box is x 13..25.
//   home:   warehouse (4,5), harbour (9,7), road (6,6) (7,6) (8,6) (8,7)
//   second: warehouse (19,5), harbour (15,7), road (18,6) (17,6) (17,7)
// Between the harbours: water at x 11..14, so the crossing is 5 tiles.
function twoIslands() {
  const width = 26;
  const height = 12;
  const terrain = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inHome = x >= 1 && x <= 10;
      const inSecond = x >= 15 && x <= 24;
      const land = (inHome || inSecond) && y >= 1 && y <= 10;
      if (!land) terrain.push('water');
      else {
        const edge = y === 1 || y === 10 || x === 1 || x === 10 || x === 15 || x === 24;
        // A patch of fertile land on the second island, at x 21..22, y 8..9 (Phase 23).
        const fertile = inSecond && x >= 21 && x <= 22 && y >= 8 && y <= 9;
        terrain.push(edge ? 'coast' : fertile ? 'fertile' : 'grass');
      }
    }
  }
  return { width, height, terrain, start: { x: 4, y: 5 }, second: { x: 13, y: 0, width: 13, height: 12 } };
}

function smallGame({ won = true } = {}) {
  const game = createGame(loadData(), { map: twoIslands() });
  if (won) {
    game.state.won = true;
    game.state.wonAtTick = 0;
  }
  game.state.coinsMilli = 5000 * 1000;
  game.state.goods.wood = 100;
  game.state.goods.planks = 100;
  return game;
}

// Both harbours, the second island's warehouse, and the roads that link them.
function settleSmall(game) {
  const homeHarbour = place(game, 'harbor', 9, 7);
  road(game, [[6, 6], [7, 6], [8, 6], [8, 7]]);
  const warehouse = place(game, 'warehouse', 19, 5);
  const harbour = place(game, 'harbor', 15, 7);
  road(game, [[18, 6], [17, 6], [17, 7]]);
  return { homeHarbour, warehouse, harbour };
}

const order = (game, good, way) => assert.equal(execute(game, { action: 'ship', good, way }).ok, true);

// Runs until the ship is in the given phase at the given island.
function until(game, phase, at, limit = 5000) {
  for (let i = 0; i < limit; i++) {
    const s = game.state.ship;
    if (s.phase === phase && s.at === at) return;
    step(game);
  }
  assert.fail(`the ship never got to ${phase} at ${at}`);
}

// ---- the real map ----------------------------------------------------------------

test('GATE: the first game is exactly the same with the second island on the map', () => {
  const withIsland = createGame(loadData());
  const data = loadData();
  delete data.map.second;
  delete data.config.fleet;
  const without = createGame(data);
  const a = runBot(withIsland, loadOrder('standard'));
  const b = runBot(without, loadOrder('standard'));
  assert.equal(a.won, true);
  assert.equal(a.wonAtMinutes, b.wonAtMinutes);
  // The same town and goods. Only the map is bigger, and since Phase 23 the
  // win brings the settlers' grant.
  assert.equal(JSON.stringify(withIsland.state.buildings), JSON.stringify(without.state.buildings));
  assert.deepEqual(withIsland.state.goods, without.state.goods);
  assert.equal(withIsland.state.coinsMilli, without.state.coinsMilli + withIsland.rules.settlers.grantMilli);
  assert.equal(withIsland.state.buildings.every((b2) => islandAt(withIsland.state.map, b2.x, b2.y) === HOME), true);
});

test('GATE: the second act needs the second island: without its wine the town does not reach 100 Artisans', () => {
  // The Artisans order as it is, settling the island at once: reached.
  const order = loadOrder('artisans');
  const settled = runBot(createGame(loadData()), order, { maxMinutes: 120 });
  assert.notEqual(settled.milestones[0].reachedAtMinutes, null);
  // The same order with every step for the island left out: two hours, and not reached.
  const isIsland = (step) => step.found || step.ship || step.island || step.build === 'winery' || step.trade;
  const game = createGame(loadData());
  const without = runBot(game, { ...order, steps: order.steps.filter((step) => !isIsland(step)) }, { maxMinutes: 120 });
  assert.equal(without.milestones[0].reachedAtMinutes, null, 'reached 100 Artisans with no wine');
  // Its Artisan houses hold 8 each, as many as a Worker house.
  const houses = game.state.buildings.filter((b) => b.house?.tier === 'artisan');
  assert.ok(houses.length > 0);
  assert.ok(houses.every((b) => b.house.residents <= 8));
});

test('the second island cannot be built on before the win, and can after', () => {
  const game = createGame(loadData());
  const s = game.state.map.second;
  let land = 0;
  for (let y = s.y; y < s.y + s.height; y++) {
    for (let x = s.x; x < s.x + s.width; x++) {
      if (game.state.map.terrain[y * game.state.map.width + x] === 'water') continue;
      land++;
      assert.equal(siteReason(game, 'road', x, y), 'island_locked', `${x},${y}`);
    }
  }
  assert.ok(land > 300, 'the second island has room for a town');
  assert.equal(reasonText(game, 'island_locked'), 'The second island opens when you reach the goal.');
  // The home island is not locked.
  const start = game.state.map.start;
  assert.notEqual(siteReason(game, 'road', start.x - 1, start.y), 'island_locked');
  // After the win it is open.
  game.state.won = true;
  game.state.wonAtTick = game.state.tick;
  let open = 0;
  for (let y = s.y; y < s.y + s.height; y++) for (let x = s.x; x < s.x + s.width; x++) if (siteReason(game, 'road', x, y) === null) open++;
  assert.ok(open > 300);
  assert.equal(getSummary(game).second.open, true);
});

test('the win screen says the second island is open', () => {
  const game = createGame(loadData());
  runBot(game, loadOrder('standard'));
  const message = winMessage(game.rules, getSummary(game), game.state.buildings.length);
  assert.match(message.next, /the second island, across the water to the east, is now open to settle\.$/);
});

// ---- settling --------------------------------------------------------------------

test('the first warehouse and harbour there are paid from home; after that, from the island\'s own goods', () => {
  const game = smallGame();
  const home = { ...game.state.goods };
  place(game, 'warehouse', 19, 5);
  assert.equal(game.state.goods.wood, home.wood - 20, 'the first warehouse took home wood');
  assert.equal(game.state.second.goods.wood, 0);
  place(game, 'harbor', 15, 7);
  assert.equal(game.state.goods.wood, home.wood - 40);
  assert.equal(game.state.goods.planks, home.planks - 10);
  // The island has both now: a house there needs the island's own wood.
  const check = canPlace(game, 'house', 20, 2);
  assert.deepEqual(check, { ok: false, reason: 'not_enough_goods' });
  assert.equal(reasonText(game, check.reason, { cost: game.rules.buildings.house.cost, from: SECOND }), 'Need 5 more wood on the second island.');
  game.state.second.goods.wood = 12;
  place(game, 'house', 20, 2);
  assert.equal(game.state.second.goods.wood, 7);
  assert.equal(game.state.goods.wood, home.wood - 40, 'home wood was not touched');
  // Undo gives it back to the island it came from.
  assert.equal(execute(game, { action: 'undo' }).ok, true);
  assert.equal(game.state.second.goods.wood, 12);
  assert.equal(game.state.goods.wood, home.wood - 40);
});

test('each island counts its own storage, and a demolish there pays back there', () => {
  const game = smallGame();
  const { warehouse } = settleSmall(game);
  assert.equal(game.state.storageCap, 100);
  assert.equal(game.state.second.storageCap, 100);
  assert.equal(getSummary(game).second.storageCap, 100);
  // The second island's warehouse can be demolished; the home island's only one cannot.
  const homeWarehouse = game.state.buildings.find((b) => b.type === 'warehouse' && islandAt(game.state.map, b.x, b.y) === HOME);
  assert.equal(execute(game, { action: 'demolish', x: homeWarehouse.x, y: homeWarehouse.y }).reason, 'last_warehouse');
  const before = game.state.second.goods.wood;
  assert.equal(execute(game, { action: 'demolish', x: warehouse.x, y: warehouse.y }).ok, true);
  assert.equal(game.state.second.storageCap, 0);
  assert.equal(game.state.second.goods.wood, before, 'with no storage left, nothing fits, so nothing comes back there');
  assert.equal(execute(game, { action: 'undo' }).ok, true);
  assert.equal(game.state.second.storageCap, 100);
});

test('a market serves houses on its own island only', () => {
  const game = smallGame();
  settleSmall(game);
  // A home market at (7,3) reaches 8 tiles: over the water, as far as x 15.
  place(game, 'market', 7, 3);
  road(game, [[6, 4], [6, 5]]);
  game.state.second.goods.wood = 20;
  const house = place(game, 'house', 15, 3);
  assert.equal(house.house.served, false, 'a market across the water does not serve it');
  const homeHouse = place(game, 'house', 7, 1);
  assert.equal(homeHouse.house.served, true);
});

test('each island keeps its own goods: a lumberjack on the second island fills its own warehouse', () => {
  const game = createGame(loadData());
  game.state.won = true;
  game.state.wonAtTick = 0;
  game.state.coinsMilli = 5000 * 1000;
  game.state.goods.wood = 100;
  game.state.goods.planks = 100;
  // A warehouse and harbour on the second island, as a player would place them.
  const m = game.state.map;
  let site = null;
  for (let x = m.second.x; x < m.second.x + m.second.width && !site; x++) {
    for (let y = m.second.y; y < m.second.y + m.second.height && !site; y++) {
      if (siteReason(game, 'harbor', x, y)) continue;
      for (const [wx, wy, rx, ry] of [[x, y - 3, x, y - 1], [x, y + 3, x, y + 2], [x - 3, y, x - 1, y], [x + 3, y, x + 2, y]]) {
        if (siteReason(game, 'warehouse', wx, wy) || siteReason(game, 'road', rx, ry)) continue;
        site = { x, y, wx, wy, rx, ry };
        break;
      }
    }
  }
  place(game, 'warehouse', site.wx, site.wy);
  place(game, 'harbor', site.x, site.y);
  road(game, [[site.rx, site.ry]]);
  const planner = createPlanner(game, { island: SECOND });
  const plan = planner.plan('lumberjack');
  assert.ok(plan.x !== undefined, plan.reason);
  assert.equal(islandAt(m, plan.x, plan.y), SECOND, 'the bot keeps to the island it is told');
  if (plan.roads.length) road(game, plan.roads);
  place(game, 'lumberjack', plan.x, plan.y);
  const homeWood = game.state.goods.wood;
  run(game, 1800);
  assert.ok(game.state.second.goods.wood > 0, 'wood reached the second island\'s warehouse');
  assert.equal(game.state.goods.wood, homeWood, 'and none of it went home');
  // Without being told, the planner keeps to the home island.
  const homePlan = createPlanner(game).plan('lumberjack');
  assert.equal(islandAt(m, homePlan.x, homePlan.y), HOME);
});

test('the trade ship calls at the home island only', () => {
  const game = smallGame();
  const { homeHarbour, harbour } = settleSmall(game);
  assert.equal(panelModel(game, buildingById(game, harbour.id)).trade, null, 'no trade orders at the second island');
  assert.ok(panelModel(game, buildingById(game, homeHarbour.id)).trade.length > 0);
  execute(game, { action: 'demolish', x: homeHarbour.x, y: homeHarbour.y });
  assert.equal(execute(game, { action: 'trade', good: 'wood', mode: 'sell', level: 10 }).reason, 'no_harbor', 'a harbour on the second island does not bring the trade ship');
});

// ---- your ship -------------------------------------------------------------------

test('your ship sails once each island has a harbour linked to a warehouse', () => {
  const game = smallGame();
  assert.equal(shipSummary(game).route, false);
  run(game, 20);
  assert.equal(game.state.ship.phase, 'idle');
  const { harbour, homeHarbour } = settleSmall(game);
  assert.equal(seaTiles(game, homeHarbour, harbour), 5);
  assert.equal(game.state.ship.trip, 5 * game.rules.fleet.ticksPerTile);
  step(game);
  assert.equal(game.state.ship.phase, 'loading');
  assert.equal(game.state.ship.at, HOME);
  // Cut off by road, there is no route, and it waits.
  execute(game, { action: 'demolish', x: 17, y: 7 });
  assert.equal(game.state.ship.trip, 0);
  step(game);
  assert.equal(game.state.ship.phase, 'idle');
});

test('a harbour one tile back from the water, behind the beach, still has a berth for your ship', () => {
  // Found in the browser: a harbour need only touch the beach, so it may not touch the sea.
  const game = smallGame();
  place(game, 'harbor', 8, 7); // x 8..9; the beach is at x 10, the sea at x 11
  road(game, [[6, 6], [7, 6], [7, 7]]);
  place(game, 'warehouse', 19, 5);
  place(game, 'harbor', 15, 7);
  road(game, [[18, 6], [17, 6], [17, 7]]);
  assert.equal(game.state.ship.trip, 5 * game.rules.fleet.ticksPerTile);
  order(game, 'wood', 'out');
  until(game, 'loading', SECOND);
  assert.ok(game.state.second.goods.wood > 0);
});

test('your ship carries what you order, out and back, taking turns between the goods', () => {
  const game = smallGame();
  settleSmall(game);
  game.state.goods.wood = 100;
  game.state.goods.planks = 4;
  game.state.goods.fish = 100;
  order(game, 'wood', 'out');
  order(game, 'planks', 'out');
  order(game, 'fish', 'out');
  until(game, 'sailing', SECOND);
  // 30 aboard: the planks ran out at 4, so wood and fish shared the rest.
  assert.deepEqual(game.state.ship.cargo, { wood: 13, planks: 4, fish: 13 });
  assert.equal(game.state.goods.planks, 0);
  until(game, 'loading', SECOND);
  assert.deepEqual(game.state.ship.cargo, {});
  assert.equal(game.state.second.goods.wood, 13);
  // Now bring wood back home.
  order(game, 'wood', 'back');
  const homeWood = game.state.goods.wood;
  until(game, 'sailing', HOME);
  assert.deepEqual(game.state.ship.cargo, { wood: 13 });
  until(game, 'loading', HOME);
  assert.equal(game.state.goods.wood, homeWood + 13);
});

test('your ship unloads only what fits, and keeps the rest aboard', () => {
  const game = smallGame();
  settleSmall(game);
  game.state.second.goods.wood = 95;
  game.state.goods.wood = 100;
  order(game, 'wood', 'out');
  until(game, 'loading', SECOND);
  assert.equal(game.state.second.goods.wood, 100);
  assert.deepEqual(game.state.ship.cargo, { wood: 25 }, 'what did not fit stays aboard');
  // On the way home it carries that wood back, and unloads it there.
  order(game, 'wood', 'off');
  const homeWood = game.state.goods.wood;
  until(game, 'loading', HOME);
  assert.equal(game.state.goods.wood, homeWood + 25);
});

test('a crossing takes as long as the sea between the harbours, and loading as long as the data says', () => {
  const game = smallGame();
  settleSmall(game);
  until(game, 'sailing', SECOND);
  let ticks = 0;
  while (game.state.ship.phase === 'sailing') {
    step(game);
    ticks++;
  }
  assert.equal(ticks, game.state.ship.trip);
  let waiting = 0;
  while (game.state.ship.phase === 'loading') {
    step(game);
    waiting++;
  }
  assert.equal(waiting, game.rules.fleet.loadTicks);
});

test('an order for your ship can be undone, and a wrong one is refused', () => {
  const game = smallGame();
  order(game, 'wood', 'out');
  order(game, 'wood', 'back');
  assert.equal(execute(game, { action: 'undo' }).ok, true);
  assert.equal(game.state.ship.orders.wood, 'out');
  assert.equal(execute(game, { action: 'ship', good: 'wood', way: 'out' }).reason, 'no_change');
  assert.equal(execute(game, { action: 'ship', good: 'gold', way: 'out' }).reason, 'unknown_good');
  assert.equal(execute(game, { action: 'ship', good: 'wood', way: 'sideways' }).reason, 'bad_command');
  const one = createGame(loadData(), { map: { ...twoIslands(), second: undefined } });
  assert.equal(execute(one, { action: 'ship', good: 'wood', way: 'out' }).reason, 'no_ship');
});

test('the second island\'s harbour panel sets what your ship carries, and every button works', () => {
  const game = smallGame();
  const { harbour, homeHarbour } = settleSmall(game);
  const model = panelModel(game, buildingById(game, harbour.id));
  assert.equal(model.lines[0].value, 'The second island');
  assert.equal(model.ship.length, game.rules.goodIds.length);
  for (const row of model.ship) {
    assert.equal(row.order, 'Stays');
    const [, good, way] = row.next.split(':');
    assert.equal(execute(game, { action: 'ship', good, way }).ok, true);
  }
  const after = panelModel(game, buildingById(game, harbour.id));
  assert.ok(after.ship.every((row) => row.order === 'Takes over'));
  const home = panelModel(game, buildingById(game, homeHarbour.id));
  assert.equal(home.ship, null);
  assert.ok(home.lines.some((l) => l.label === 'Your ship'));
});

test('a game with your ship at sea is saved and comes back exactly', () => {
  const game = smallGame();
  settleSmall(game);
  order(game, 'wood', 'out');
  until(game, 'sailing', SECOND);
  run(game, 7);
  const loaded = loadGame(loadData(), throughText(saveGame(game)));
  // A hand-made map is saved with the game, second island and all.
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.equal(JSON.stringify(loaded.game.state), JSON.stringify(game.state));
  run(game, 300);
  run(loaded.game, 300);
  assert.equal(JSON.stringify(loaded.game.state), JSON.stringify(game.state));
});

test('a save with a wrong ship or a wrong second stock is refused as damaged', () => {
  const game = smallGame();
  settleSmall(game);
  const tampers = {
    'no ship': (s) => { s.ship = null; },
    'an unknown phase': (s) => { s.ship.phase = 'flying'; },
    'too much aboard': (s) => { s.ship.cargo = { wood: 999 }; },
    'an order for nothing': (s) => { s.ship.orders = { gold: 'out' }; },
    'no second stock': (s) => { s.second = null; },
    'a broken second stock': (s) => { s.second.goods.wood = -3; },
  };
  for (const [name, tamper] of Object.entries(tampers)) {
    const save = throughText(saveGame(game));
    tamper(save.state);
    const loaded = loadGame(loadData(), save);
    assert.equal(loaded.ok, false, name);
    assert.equal(loaded.reason, 'damaged', name);
  }
});

test('a game saved before the second island loads, with the island added across the water', () => {
  const before = createGame(dataBefore(5));
  runBot(before, loadOrder('standard'), { maxMinutes: 12 });
  const save = throughText(saveGame(before));
  delete save.state.second; // a save that old has neither
  delete save.state.ship;
  assert.equal(save.rulesStamp, 'e6ebd7221f59fd55');
  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  const game = loaded.game;
  const fresh = createGame(loadData());
  assert.deepEqual(game.state.map.second, fresh.state.map.second);
  assert.deepEqual(game.state.map.terrain, fresh.state.map.terrain, 'the same second island a new game gets');
  // Every building and road where it was.
  const oldWidth = before.state.map.width;
  for (let y = 0; y < before.state.map.height; y++) {
    for (let x = 0; x < oldWidth; x++) {
      assert.equal(game.state.roads[y * game.state.map.width + x], before.state.roads[y * oldWidth + x]);
      assert.equal(game.state.occupancy[y * game.state.map.width + x], before.state.occupancy[y * oldWidth + x]);
    }
  }
  assert.deepEqual(game.state.second.goods, Object.fromEntries(game.rules.goodIds.map((g) => [g, 0])));
  assert.equal(game.state.ship.phase, 'idle');
  // It plays on exactly as the old game does on the home island.
  run(before, 3000);
  run(game, 3000);
  assert.equal(JSON.stringify(game.state.buildings), JSON.stringify(before.state.buildings));
  // (The goods added since, grapes and wine, are none.)
  for (const good of Object.keys(before.state.goods)) assert.equal(game.state.goods[good], before.state.goods[good], good);
  assert.equal(game.state.coinsMilli, before.state.coinsMilli);
});

test('your ship is drawn on the water between the harbours, and the trade ship only at home', () => {
  const game = smallGame();
  const { homeHarbour } = settleSmall(game);
  order(game, 'wood', 'out');
  const life = createLife(game.rules, 7, { islandAt: islandAtFn, seaPath, shipHarbour });
  until(game, 'sailing', SECOND);
  run(game, Math.floor(game.state.ship.trip / 2));
  const own = life.update(game).find((a) => a.kind === 'ship' && a.own);
  assert.ok(own, 'your ship is drawn');
  const tile = (n) => Math.floor(n);
  assert.equal(game.state.map.terrain[tile(own.y) * game.state.map.width + tile(own.x)], 'water');
  assert.ok(own.x > 10 && own.x < 15, `half way across: x ${own.x.toFixed(1)}`);
  assert.equal(own.docked, false);
  // The trade ship's figure, when it comes, is only ever at the home harbour.
  game.state.trade.timer = game.rules.trade.shipTicks - 5;
  const traders = life.update(game).filter((a) => a.kind === 'ship' && !a.own);
  assert.ok(traders.every((a) => a.id === homeHarbour.id));
});

test('after the win, the tip line says how to settle the second island, until your ship sails', async () => {
  const { createAdvisor } = await import('../src/ui/advice.js');
  const game = smallGame();
  const advisor = createAdvisor(game.rules);
  assert.match(advisor.update(game), /^The second island, to the east, is open\. Build a warehouse and a harbour on its shore\./);
  place(game, 'warehouse', 19, 5);
  assert.equal(advisor.update(game), 'Your ship needs a harbour on each island, each linked by road to a warehouse.');
  place(game, 'harbor', 15, 7);
  road(game, [[18, 6], [17, 6], [17, 7]]);
  place(game, 'harbor', 9, 7);
  road(game, [[6, 6], [7, 6], [8, 6], [8, 7]]);
  assert.equal(advisor.update(game), null, 'with the ship sailing, nothing more to say');
  // Before the win it says nothing about the island.
  const early = smallGame({ won: false });
  assert.equal(createAdvisor(early.rules).update(early), null);
});

// ---- Phase 23: grapes and wine ---------------------------------------------------

// A house of Artisans on the small map's home island, full, by a market.
function artisanHouse(game) {
  place(game, 'market', 7, 3);
  road(game, [[6, 4], [6, 5]]);
  const house = place(game, 'house', 7, 1);
  house.house.tier = 'artisan';
  house.house.residents = 12;
  for (const good of Object.keys(game.rules.tiers.artisan.needs)) {
    house.house.hunger[good] = 0;
    house.house.met[good] = true;
  }
  game.state.goods.fish = 100;
  game.state.goods.bread = 100;
  game.state.goods.cloth = 100;
  return house;
}

test('grapes grow only on the second island\'s fertile land, and wine is made from them anywhere', () => {
  const { rules } = createGame(loadData());
  assert.deepEqual(rules.buildings.vineyard.placement, { footprintTerrain: 'fertile', island: 'second' });
  assert.deepEqual(rules.buildings.vineyard.production.outputs, { grapes: 1 });
  assert.deepEqual(rules.buildings.winery.production.inputs, { grapes: 2 });
  assert.deepEqual(rules.buildings.winery.production.outputs, { wine: 1 });
  assert.equal(rules.buildings.winery.placement, null);
  assert.equal(rules.prices.grapes, undefined, 'the trade ship brings nothing the home island cannot make');
  assert.equal(rules.prices.wine, undefined);
  // On the real map: every fertile site at home is refused, and the second island has room for vineyards.
  const game = createGame(loadData());
  game.state.won = true;
  game.state.wonAtTick = 0;
  const m = game.state.map;
  let home = 0;
  let second = 0;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const reason = siteReason(game, 'vineyard', x, y);
      if (reason === 'needs_second_island') home++;
      if (reason === null) {
        assert.equal(islandAt(m, x, y), SECOND);
        second++;
      }
    }
  }
  assert.ok(home > 20, 'fertile sites at home are refused');
  assert.ok(second >= 5, `${second} vineyard sites on the second island`);
  assert.equal(reasonText(game, 'needs_second_island', { building: 'vineyard' }), 'Grows only on the second island, entirely on fertile land.');
});

test('before the second island opens, Artisans do not miss wine', () => {
  const game = smallGame({ won: false });
  const house = artisanHouse(game);
  run(game, 3000);
  assert.equal(house.house.residents, 12);
  assert.equal(house.house.met.wine, true);
  assert.equal(game.state.goods.wine, 0);
  const model = panelModel(game, house);
  assert.ok(model.lines.some((l) => l.label === 'Wine' && l.value === 'Wanted once the second island opens'));
});

test('once it is open, an Artisan house holds 8 without wine, and 12 with it', () => {
  const game = smallGame();
  const house = artisanHouse(game);
  run(game, 3000);
  assert.equal(house.house.residents, 8, 'without wine it holds 8');
  let model = panelModel(game, house);
  assert.ok(model.lines.some((l) => l.label === 'Residents' && l.value === '8 of 8 (12 with wine)'));
  assert.ok(model.lines.some((l) => l.label === 'Wine' && l.value === 'None in stock. Holds 8 without it'));
  assert.equal(getSummary(game).housing.artisan, 8);
  // With wine it fills again, and drinks it.
  game.state.goods.wine = 50;
  run(game, 1500);
  assert.equal(house.house.residents, 12);
  assert.ok(game.state.goods.wine < 50);
  model = panelModel(game, house);
  assert.ok(model.lines.some((l) => l.label === 'Wine' && l.value === 'Supplied'));
});

test('a Worker house can become an Artisan house before there is any wine', () => {
  const game = smallGame();
  place(game, 'market', 7, 3);
  road(game, [[6, 4], [6, 5]]);
  const house = place(game, 'house', 7, 1);
  house.house.tier = 'worker';
  house.house.residents = 8;
  for (const good of Object.keys(game.rules.tiers.worker.needs)) house.house.met[good] = true;
  game.state.goods.cloth = 10;
  const check = execute(game, { action: 'upgrade', id: house.id });
  assert.equal(check.ok, true, check.reason);
  assert.equal(house.house.tier, 'artisan');
});

test('the win brings 700 coins to settle the second island, and a settled island 10 coins a minute', async () => {
  const { incomeRates } = await import('../src/sim/economy.js');
  const game = createGame(loadData());
  runBot(game, loadOrder('standard'));
  const withIsland = game.state.coinsMilli;
  const data = loadData();
  delete data.map.second;
  const plain = createGame(data);
  runBot(plain, loadOrder('standard'));
  assert.equal(withIsland - plain.state.coinsMilli, 700 * 1000, 'the grant, once, at the win');
  // A settled island adds to the base income.
  const small = smallGame();
  const before = incomeRates(small).baseMilli;
  settleSmall(small);
  assert.equal(incomeRates(small).baseMilli - before, 10 * 1000);
});

test('the tip line says where grapes grow, and that your ship must bring them home', async () => {
  const { createAdvisor } = await import('../src/ui/advice.js');
  const game = smallGame();
  artisanHouse(game);
  settleSmall(game);
  const advisor = createAdvisor(game.rules, { patienceSeconds: 1 });
  const tipAfter = (ticks) => {
    let tip = null;
    for (let i = 0; i < ticks; i++) {
      step(game);
      tip = advisor.update(game);
    }
    return tip;
  };
  assert.equal(tipAfter(1500), 'Nobody is making wine. Build a winery.');
  // A winery at home, joined to the warehouse: now it is the grapes.
  place(game, 'winery', 2, 7);
  road(game, [[4, 7]]);
  assert.equal(tipAfter(40), 'Nobody is making grapes. Build a vineyard on the second island.');
  // A vineyard there: its grapes stay there until the ship is told to bring them.
  game.state.second.goods.wood = 20;
  game.state.second.goods.planks = 20;
  place(game, 'vineyard', 21, 8);
  road(game, [[21, 6], [21, 7]]);
  assert.equal(tipAfter(400), 'You make grapes only on the second island. Set your ship to bring grapes home, in the panel of the harbour there.');
  order(game, 'grapes', 'back');
  assert.notEqual(tipAfter(40), 'You make grapes only on the second island. Set your ship to bring grapes home, in the panel of the harbour there.');
});

test('a game saved in Phase 22, before grapes and wine, loads and plays on', () => {
  const before = createGame(dataBefore(6));
  runBot(before, loadOrder('standard'), { maxMinutes: 12 });
  const save = throughText(saveGame(before));
  assert.equal(save.rulesStamp, '57f32b31a0a7ccda');
  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.equal(loaded.game.state.goods.grapes, 0);
  assert.equal(loaded.game.state.goods.wine, 0);
  assert.equal(loaded.game.state.second.goods.wine, 0);
  run(loaded.game, 600);
  const again = loadGame(loadData(), throughText(saveGame(loaded.game)));
  assert.equal(again.ok, true);
});

// ---- Phase 24: levels your ship keeps back -----------------------------------

test('your ship leaves behind the level you set, on the island it loads from', () => {
  const game = smallGame();
  settleSmall(game);
  game.state.goods.wood = 40;
  order(game, 'wood', 'out');
  assert.equal(execute(game, { action: 'shipKeep', good: 'wood', keep: 25 }).ok, true);
  until(game, 'sailing', SECOND);
  assert.deepEqual(game.state.ship.cargo, { wood: 15 }, 'it took only what was above 25');
  assert.equal(game.state.goods.wood, 25);
  // Bringing a good home keeps the level back on the second island.
  until(game, 'loading', SECOND);
  game.state.second.goods.planks = 18;
  order(game, 'planks', 'back');
  execute(game, { action: 'shipKeep', good: 'planks', keep: 10 });
  until(game, 'sailing', HOME);
  assert.equal(game.state.ship.cargo.planks, 8);
  assert.equal(game.state.second.goods.planks, 10);
});

test('a level to keep back can be undone, and a wrong one is refused', () => {
  const game = smallGame();
  assert.equal(execute(game, { action: 'shipKeep', good: 'wood', keep: 30 }).ok, true);
  assert.equal(execute(game, { action: 'shipKeep', good: 'wood', keep: 40 }).ok, true);
  assert.equal(execute(game, { action: 'undo' }).ok, true);
  assert.equal(game.state.ship.keep.wood, 30);
  assert.equal(execute(game, { action: 'shipKeep', good: 'wood', keep: 30 }).reason, 'no_change');
  assert.equal(execute(game, { action: 'shipKeep', good: 'wood', keep: 0 }).ok, true);
  assert.deepEqual(game.state.ship.keep, {}, 'nothing kept back is not written down');
  for (const keep of [-1, 1.5, 1000, '10']) assert.equal(execute(game, { action: 'shipKeep', good: 'wood', keep }).reason, 'bad_command', String(keep));
  assert.equal(execute(game, { action: 'shipKeep', good: 'gold', keep: 10 }).reason, 'unknown_good');
});

test('the second island\'s harbour panel sets the level to keep back with − and +', () => {
  const game = smallGame();
  const { harbour } = settleSmall(game);
  order(game, 'wood', 'out');
  let row = panelModel(game, buildingById(game, harbour.id)).ship.find((r) => r.good === 'wood');
  assert.equal(row.keep, 'keeps 0');
  assert.equal(row.keepWhere, 'at home');
  assert.equal(row.down, null);
  assert.equal(row.up, 'keep:wood:10');
  const [, good, keep] = row.up.split(':');
  assert.equal(execute(game, { action: 'shipKeep', good, keep: Number(keep) }).ok, true);
  row = panelModel(game, buildingById(game, harbour.id)).ship.find((r) => r.good === 'wood');
  assert.equal(row.keep, 'keeps 10');
  assert.equal(row.down, 'keep:wood:0');
  // Brought home, the level is kept on the second island. A good that stays has no level.
  order(game, 'wood', 'back');
  row = panelModel(game, buildingById(game, harbour.id)).ship.find((r) => r.good === 'wood');
  assert.equal(row.keep, 'keeps 10');
  assert.equal(row.keepWhere, 'on the second island');
  const fish = panelModel(game, buildingById(game, harbour.id)).ship.find((r) => r.good === 'fish');
  assert.deepEqual([fish.keep, fish.down, fish.up], [null, null, null]);
  // The + stops at the island's storage room.
  game.state.ship.keep.wood = 100;
  row = panelModel(game, buildingById(game, harbour.id)).ship.find((r) => r.good === 'wood');
  assert.equal(row.up, null);
});

test('a game saved before levels to keep back loads, keeping nothing back', () => {
  const game = smallGame();
  settleSmall(game);
  order(game, 'wood', 'out');
  const save = throughText(saveGame(game));
  delete save.state.ship.keep;
  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.deepEqual(loaded.game.state.ship.keep, {});
  for (const bad of [{ wood: 0 }, { wood: -5 }, { gold: 10 }, { wood: 1000 }, null]) {
    const tampered = throughText(saveGame(game));
    tampered.state.ship.keep = bad;
    assert.equal(loadGame(loadData(), tampered).reason, 'damaged', JSON.stringify(bad));
  }
});

test('a build order can give your ship an order with a level to keep back', () => {
  const game = smallGame();
  settleSmall(game);
  const start = game.state.tick / game.rules.ticksPerMinute;
  runBot(game, { name: 'keep', steps: [{ ship: 'wood', way: 'out', keep: 30 }] }, { pastWin: true, maxMinutes: start + 1 });
  assert.equal(game.state.ship.orders.wood, 'out');
  assert.equal(game.state.ship.keep.wood, 30);
});
