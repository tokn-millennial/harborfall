// Trade: a harbour on the coast, a ship that calls every two minutes, and
// standing orders to sell what the island has too much of and buy what it
// lacks. Buying always costs more than selling earns.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { canTrade, createGame, execute, getSummary, loadGame, saveGame, step, undoStatus } from '../src/sim/index.js';
import { compileRules } from '../src/sim/rules.js';
import { createLife } from '../src/render/life.js';
import { panelModel } from '../src/ui/panelModel.js';
import { buildingBlurb, coinText, reasonText, tradeCallText, tradeOrderText, undoLabel } from '../src/ui/text.js';
import { runBot } from '../tools/bot/bot.js';
import { loadOrder } from '../tools/tune.mjs';
import { dataBefore, line, place, richGame, road, run, snapshot, testGame } from './helpers.js';

const throughText = (value) => JSON.parse(JSON.stringify(value));
const SHIP = 1200; // ticks between calls: 120 game seconds
const order = (game, good, mode, level = 0) => execute(game, { action: 'trade', good, mode, level });

// A harbour on the west shore of the test island, joined to the warehouse.
// It covers x 2..3, y 9..10, and touches the coast at x 1.
function harbor(game) {
  const built = place(game, 'harbor', 2, 9);
  road(game, line(4, 9, 9, 9));
  return built;
}
// A rich game with a harbour, stock and coins set exactly, and the undo note
// cleared. Taxes, base income and upkeep are switched off, so the only coins
// that come or go are the ship's.
function port({ coins = 1000, goods = {} } = {}) {
  const game = richGame({ change: (d) => {
    d.config.economy.baseIncomePerMinute = 0;
    for (const b of Object.values(d.buildings)) if (b && typeof b === 'object' && 'upkeepPerMinute' in b) b.upkeepPerMinute = 0;
  } });
  const h = harbor(game);
  game.state.coinsMilli = coins * 1000;
  for (const good of game.rules.goodIds) game.state.goods[good] = goods[good] ?? 0;
  game.state.undo = null;
  return { game, harbor: h };
}
// Runs to just after the next call of the ship.
const toShip = (game) => run(game, SHIP - game.state.trade.timer);

// ---- the rule in the data ------------------------------------------------------------

test('the harbour is a coast building with no staff, and every good has a price to sell and a dearer one to buy', () => {
  const { rules } = createGame(loadData());
  const h = rules.buildings.harbor;
  assert.equal(h.harbor, true);
  assert.equal(h.staff, 0);
  assert.deepEqual([h.w, h.h], [2, 2]);
  assert.equal(h.placement.adjacentTerrain, 'coast');
  assert.equal(h.requiresRoad, true);
  assert.deepEqual(rules.trade, { shipTicks: SHIP, unitsPerHarbor: 30 });
  assert.deepEqual(Object.keys(rules.prices), rules.goodIds, 'every good can be traded');
  for (const [good, price] of Object.entries(rules.prices)) {
    assert.ok(price.buyMilli > price.sellMilli, `${good}: buying is not dearer than selling`);
    // A good further along a chain is worth more than what it is made from.
  }
  assert.ok(rules.prices.planks.sellMilli > 2 * rules.prices.wood.sellMilli, 'a plank sells for less than the two logs it takes');
  assert.ok(rules.prices.cloth.sellMilli > 2 * rules.prices.wool.sellMilli, 'cloth sells for less than the two wool it takes');
  assert.ok(rules.prices.bread.sellMilli > rules.prices.grain.sellMilli);
});

test('a harbour must touch the coast and needs a road, like a fisherman', () => {
  const game = richGame();
  assert.equal(execute(game, { action: 'place', building: 'harbor', x: 12, y: 12 }).reason, 'needs_coast');
  const built = place(game, 'harbor', 2, 9);
  assert.equal(built.connected, false);
  assert.equal(getSummary(game).trade.harbors, 0, 'a harbour with no road brings no ship');
  road(game, line(4, 9, 9, 9));
  assert.equal(built.connected, true);
  assert.equal(getSummary(game).trade.harbors, 1);
  assert.deepEqual(buildingBlurb(game.rules, 'harbor').slice(0, 2), [
    'A trade ship calls every 2 minutes and carries 30 goods. Set what it sells and buys in the harbour\'s panel.',
    'Must touch a coast tile.',
  ]);
});

// ---- the ship -------------------------------------------------------------------------

test('with no harbour no ship comes, and nothing is traded however long the game runs', () => {
  const game = richGame();
  game.state.goods.wood = 100;
  run(game, SHIP * 3);
  assert.equal(game.state.trade.timer, 0);
  assert.equal(game.state.trade.last, null);
  assert.equal(getSummary(game).trade.secondsToShip, null);
});

test('the ship calls every two minutes and sells everything above the level, at the selling price', () => {
  const { game } = port({ coins: 100, goods: { wood: 100 } });
  assert.deepEqual(order(game, 'wood', 'sell', 60), { ok: true });
  assert.equal(getSummary(game).trade.secondsToShip, 120);
  run(game, SHIP - 1);
  assert.equal(game.state.goods.wood, 100, 'it sold before it arrived');
  run(game, 1);
  assert.equal(game.state.goods.wood, 70, 'a ship carries 30 at a time');
  assert.equal(game.state.coinsMilli, 100000 + 30 * 400);
  assert.deepEqual(game.state.trade.last, { tick: SHIP, sold: { wood: 30 }, bought: {}, earnedMilli: 12000, spentMilli: 0 });
  toShip(game);
  assert.equal(game.state.goods.wood, 60, 'it never sells below the level');
  toShip(game);
  assert.equal(game.state.goods.wood, 60);
  assert.deepEqual(game.state.trade.last.sold, {});
  assert.equal(game.state.coinsMilli, 100000 + 40 * 400, 'nothing more was earned');
});

test('it buys up to the level at the buying price, as far as coins and storage allow', () => {
  const { game } = port({ coins: 1000, goods: { planks: 10 } });
  order(game, 'planks', 'buy', 40);
  toShip(game);
  assert.equal(game.state.goods.planks, 40);
  assert.equal(game.state.coinsMilli, 1000000 - 30 * 6000);
  assert.deepEqual(game.state.trade.last.bought, { planks: 30 });
  toShip(game);
  assert.equal(game.state.goods.planks, 40, 'it never buys above the level');

  // Short of coins: it buys what it can pay for, and never runs the coins below zero.
  const poor = port({ coins: 50, goods: { planks: 0 } }).game;
  order(poor, 'planks', 'buy', 40);
  toShip(poor);
  assert.equal(poor.state.goods.planks, 8);
  assert.equal(poor.state.coinsMilli, 2000);

  // A level above the storage room: it fills the storage and no more.
  const full = port({ coins: 10000, goods: { fish: 90 } }).game;
  order(full, 'fish', 'buy', 500);
  toShip(full);
  assert.equal(full.state.goods.fish, full.state.storageCap);
});

test('one ship\'s room is shared: sales first in the order the goods are listed, then purchases', () => {
  const { game } = port({ coins: 100, goods: { wood: 100, fish: 100, bread: 0 } });
  order(game, 'fish', 'sell', 80);   // 20 above the level
  order(game, 'wood', 'sell', 50);   // 50 above the level
  order(game, 'bread', 'buy', 10);
  toShip(game);
  // Wood comes before fish in the list: 30 wood fills the ship.
  assert.deepEqual(game.state.trade.last.sold, { wood: 30 });
  assert.deepEqual(game.state.trade.last.bought, {}, 'no room was left to buy');
  toShip(game);
  assert.deepEqual(game.state.trade.last.sold, { wood: 20, fish: 10 });
  toShip(game);
  assert.deepEqual(game.state.trade.last.sold, { fish: 10 });
  // Then there is room to buy.
  assert.deepEqual(game.state.trade.last.bought, { bread: 10 });
  assert.equal(game.state.goods.bread, 10);
  // 30 + 20 wood at 0.4, 20 fish at 1.2, less 10 bread at 12.
  assert.equal(game.state.coinsMilli, 100000 + 50 * 400 + 20 * 1200 - 10 * 12000);
});

test('two harbours, twice the room on each call; the ship still calls every two minutes', () => {
  const { game } = port({ goods: { wood: 120, planks: 10 } }); // enough to build a second harbour as well
  place(game, 'harbor', 2, 12);
  road(game, [...line(4, 12, 4, 10)]);
  assert.equal(game.state.goods.wood, 100);
  assert.equal(getSummary(game).trade.capacity, 60);
  order(game, 'wood', 'sell', 0);
  toShip(game);
  assert.equal(game.state.goods.wood, 40);
});

test('cutting the harbour off stops the ship, and the wait starts again when it is joined', () => {
  const { game } = port({ goods: { wood: 100 } });
  order(game, 'wood', 'sell', 0);
  run(game, 900);
  execute(game, { action: 'demolish', x: 6, y: 9 });
  run(game, 50);
  assert.equal(game.state.trade.timer, 0);
  assert.equal(getSummary(game).trade.secondsToShip, null);
  road(game, [[6, 9]]);
  run(game, SHIP - 1);
  assert.equal(game.state.goods.wood, 100);
  run(game, 1);
  assert.equal(game.state.goods.wood, 70);
});

test('orders stay when the last harbour goes, and work again with a new one', () => {
  const { game, harbor: h } = port({ goods: { wood: 100 } });
  order(game, 'wood', 'sell', 40);
  execute(game, { action: 'demolish', x: h.x, y: h.y });
  assert.deepEqual(game.state.trade.orders, { wood: { mode: 'sell', level: 40 } });
  assert.equal(canTrade(game, 'fish', 'sell', 10).reason, 'no_harbor');
  game.state.goods.wood = 20;
  game.state.goods.planks = 10;
  harbor(game);
  game.state.goods.wood = 100;
  toShip(game);
  assert.equal(game.state.goods.wood, 70);
});

// ---- the order command ---------------------------------------------------------------

test('an order can be refused, and a refused order changes nothing', () => {
  const plain = richGame();
  assert.deepEqual(order(plain, 'wood', 'sell', 10), { ok: false, reason: 'no_harbor' });
  const { game } = port();
  const before = snapshot(game);
  const bad = [
    [{ good: 'gold', mode: 'sell', level: 1 }, 'not_tradable'],
    [{ good: 'constructor', mode: 'sell', level: 1 }, 'not_tradable'],
    [{ good: 'wood', mode: 'steal', level: 1 }, 'bad_command'],
    [{ good: 'wood', mode: 'sell', level: -1 }, 'bad_command'],
    [{ good: 'wood', mode: 'sell', level: 2.5 }, 'bad_command'],
    [{ good: 'wood', mode: 'buy', level: 1000 }, 'bad_command'],
    [{ good: 'wood', mode: 'buy' }, 'bad_command'],
    [{ good: 'wood', mode: 'off', level: 0 }, 'no_change'],
  ];
  for (const [command, reason] of bad) {
    assert.deepEqual(execute(game, { action: 'trade', ...command }), { ok: false, reason }, JSON.stringify(command));
  }
  assert.equal(snapshot(game), before);
  order(game, 'wood', 'sell', 30);
  game.state.undo = null;
  const set = snapshot(game);
  assert.deepEqual(order(game, 'wood', 'sell', 30), { ok: false, reason: 'no_change' });
  assert.equal(snapshot(game), set);
});

test('orders are kept in the order the goods are listed, however they were given', () => {
  const { game } = port();
  order(game, 'cloth', 'sell', 5);
  order(game, 'wood', 'buy', 50);
  order(game, 'fish', 'sell', 70);
  assert.deepEqual(Object.keys(game.state.trade.orders), ['wood', 'fish', 'cloth']);
  order(game, 'fish', 'off');
  assert.deepEqual(game.state.trade.orders, { wood: { mode: 'buy', level: 50 }, cloth: { mode: 'sell', level: 5 } });
});

test('undoing an order puts back the one before it exactly, whatever it was', () => {
  const { game } = port();
  const steps = [['wood', 'sell', 60], ['wood', 'buy', 20], ['fish', 'sell', 70], ['wood', 'off', 0], ['cloth', 'buy', 10]];
  for (const [good, mode, level] of steps) {
    run(game, 7);
    game.state.undo = null;
    const before = snapshot(game);
    assert.equal(order(game, good, mode, level).ok, true);
    assert.equal(undoStatus(game).kind, 'trade');
    assert.equal(undoLabel(game.rules, undoStatus(game)), 'Trade order');
    assert.deepEqual(execute(game, { action: 'undo' }), { ok: true, undone: 'trade' });
    assert.equal(snapshot(game), before, `${mode} ${good} was not undone exactly`);
    order(game, good, mode, level);
  }
});

// ---- saved games -----------------------------------------------------------------------

test('a game with orders and a ship on its way is saved and comes back exactly', () => {
  const game = createGame(loadData());
  runBot(game, loadOrder('merchant'), { maxMinutes: 14 });
  assert.ok(game.state.buildings.some((b) => b.type === 'harbor'), 'the merchant order built no harbour');
  assert.ok(game.state.trade.timer > 0);
  assert.notEqual(game.state.trade.last, null);
  const loaded = loadGame(loadData(), throughText(saveGame(game)));
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.equal(snapshot(loaded.game), snapshot(game));
  run(game, 2500);
  run(loaded.game, 2500);
  assert.equal(snapshot(loaded.game), snapshot(game));
});

test('a game saved before trade existed loads, with no orders and no ship on its way', () => {
  const before = createGame(dataBefore(2));
  runBot(before, loadOrder('standard'), { maxMinutes: 15 });
  const save = throughText(saveGame(before));
  delete save.state.trade; // a save that old has no such entry
  assert.equal(save.rulesStamp, '10d0dc80671f7e66');
  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.deepEqual(loaded.game.state.trade, { timer: 0, orders: {}, last: null });
  assert.ok(loaded.game.rules.buildings.harbor, 'the continued game can build a harbour');
  // With no harbour it runs on exactly as the old game does.
  run(before, 3000);
  run(loaded.game, 3000);
  const without = (state) => { const c = throughText(state); delete c.trade; return JSON.stringify(c); };
  assert.equal(without(loaded.game.state), without(before.state));
});

test('a scenario game saved before trade existed loads as that scenario', () => {
  const before = createGame(dataBefore(2), { scenario: 'weavers-guild' });
  runBot(before, loadOrder('guild'), { maxMinutes: 8 });
  const save = throughText(saveGame(before));
  delete save.state.trade;
  const loaded = loadGame(loadData(), save);
  assert.equal(loaded.ok, true, `${loaded.reason}: ${loaded.detail}`);
  assert.equal(loaded.game.rules.scenario, 'weavers-guild');
  assert.equal(loaded.game.state.coinsMilli, before.state.coinsMilli);
});

test('a save with a wrong trade record is refused as damaged', () => {
  // Built from the real data files, so the save is checked against them.
  const game = richGame();
  harbor(game);
  game.state.goods.wood = 100;
  order(game, 'wood', 'sell', 40);
  toShip(game);
  run(game, 400);
  const tampers = {
    'no trade record': (s) => { delete s.trade; s.trade = null; },
    'a timer past the call': (s) => { s.trade.timer = SHIP; },
    'a timer of half a tick': (s) => { s.trade.timer = 0.5; },
    'orders that are a list': (s) => { s.trade.orders = []; },
    'an order for an unknown good': (s) => { s.trade.orders.gold = { mode: 'sell', level: 1 }; },
    'an order of an unknown kind': (s) => { s.trade.orders.wood.mode = 'steal'; },
    'an order with a level of 1000': (s) => { s.trade.orders.wood.level = 1000; },
    'a last call with a negative sale': (s) => { s.trade.last.sold.wood = -3; },
    'a last call for an unknown good': (s) => { s.trade.last.bought = { gold: 3 }; },
    'an undo note for an unknown good': (s) => { s.undo = { kind: 'trade', good: 'gold', before: null, untilTick: 99999 }; },
    'an undo note with a wrong order': (s) => { s.undo = { kind: 'trade', good: 'wood', before: { mode: 'steal', level: 1 }, untilTick: 99999 }; },
  };
  for (const [name, tamper] of Object.entries(tampers)) {
    const save = throughText(saveGame(game));
    tamper(save.state);
    assert.equal(loadGame(loadData(), save).reason, 'damaged', name);
  }
  assert.equal(loadGame(loadData(), throughText(saveGame(game))).ok, true);
});

// ---- switching it off, and data mistakes ----------------------------------------------------

test('with trade taken out of the data, a harbour brings no ship and takes no orders', () => {
  const game = richGame({ change: (d) => { delete d.config.trade; } });
  harbor(game);
  game.state.goods.wood = 100;
  assert.equal(game.rules.trade, null);
  assert.equal(order(game, 'wood', 'sell', 0).reason, 'no_harbor');
  run(game, SHIP * 2);
  assert.equal(game.state.goods.wood, 100);
  assert.equal(getSummary(game).trade.on, false);
  assert.equal(panelModel(game, game.state.buildings.find((b) => b.type === 'harbor')).trade, null);
});

test('mistakes in the trade numbers are refused with a clear message', () => {
  const bad = [
    [(d) => { d.goods.wood.trade = { sell: 2, buy: 2 }; }, /goods\.wood\.trade\.buy must be more than its sell price/],
    [(d) => { d.goods.wood.trade = { sell: 3, buy: 1 }; }, /goods\.wood\.trade\.buy must be more than its sell price/],
    [(d) => { d.goods.wood.trade = { sell: 0, buy: 1 }; }, /goods\.wood\.trade\.sell/],
    [(d) => { d.goods.wood.trade = 'cheap'; }, /goods\.wood\.trade must be an object/],
    [(d) => { d.config.trade = 5; }, /config\.trade must be an object/],
    [(d) => { d.config.trade.shipEverySeconds = 0; }, /config\.trade\.shipEverySeconds/],
    [(d) => { d.config.trade.unitsPerHarbor = 2.5; }, /config\.trade\.unitsPerHarbor/],
    [(d) => { d.buildings.harbor.staff = 3; }, /buildings\.harbor\.staff: only producers need staff/],
  ];
  for (const [change, pattern] of bad) assert.throws(() => testGame({ change }), pattern, String(change));
  // A good with no prices simply cannot be traded.
  const game = testGame({ change: (d) => { delete d.goods.cloth.trade; } });
  assert.equal(game.rules.prices.cloth, undefined);
});

// ---- on screen ---------------------------------------------------------------------------

test('the harbour\'s panel: when the ship comes, what it carries, its last call, and an order for each good', () => {
  const { game, harbor: h } = port({ coins: 100, goods: { wood: 100, planks: 3 } });
  let model = panelModel(game, h);
  const line = (label) => model.lines.find((l) => l.label === label)?.value;
  assert.equal(line('Next ship'), 'in 2:00');
  assert.equal(line('It carries'), '30 goods a call');
  assert.equal(line('Last call'), 'None yet.');
  assert.equal(model.trade.length, 7);
  assert.deepEqual(model.trade[0], {
    good: 'wood', name: 'Wood', stock: 100, prices: 'sells 0.4 · buys 2',
    order: 'Off', mode: 'off', next: 'trade:wood:sell:50', down: null, up: null,
  });

  order(game, 'wood', 'sell', 80);
  order(game, 'planks', 'buy', 20);
  run(game, 300);
  model = panelModel(game, h);
  assert.equal(line('Next ship'), 'in 1:30');
  assert.deepEqual(model.trade.slice(0, 2).map((r) => [r.order, r.next, r.down, r.up]), [
    ['Sell above 80', 'trade:wood:buy:20', 'trade:wood:sell:70', 'trade:wood:sell:90'],
    ['Buy up to 20', 'trade:planks:off:0', 'trade:planks:buy:10', 'trade:planks:buy:30'],
  ]);
  toShip(game);
  model = panelModel(game, h);
  // 20 wood fill two thirds of the ship, and the planks the rest.
  assert.equal(line('Last call'), 'Sold 20 wood for 8 coins, and bought 10 planks for 60 coins.');
  // + stops at the storage room, − at nothing.
  order(game, 'planks', 'buy', 100);
  order(game, 'wood', 'sell', 0);
  model = panelModel(game, h);
  assert.equal(model.trade[1].up, null);
  assert.equal(model.trade[0].down, null);
  // Cut off: the panel says the ship will not come.
  execute(game, { action: 'demolish', x: 6, y: 9 });
  assert.deepEqual(panelModel(game, h).lines.find((l) => l.label === 'Next ship'), { label: 'Next ship', value: 'Not while cut off by road', level: 'warn' });
});

test('every order button in the panel gives a command the game accepts', () => {
  const { game, harbor: h } = port({ goods: { wood: 50 } });
  const commands = new Set();
  const click = (command) => {
    if (!command) return;
    const [, good, mode, level] = command.split(':');
    const result = order(game, good, mode, Number(level));
    assert.ok(result.ok || result.reason === 'no_change', `${command}: ${result.reason}`);
    commands.add(mode);
  };
  // Click the order button of every row round several times, as a player
  // might, with the + and − buttons of each in between.
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < 7; i++) {
      click(panelModel(game, h).trade[i].next);
      click(panelModel(game, h).trade[i].up);
      click(panelModel(game, h).trade[i].up);
      click(panelModel(game, h).trade[i].down);
    }
  }
  assert.deepEqual([...commands].sort(), ['buy', 'off', 'sell']);
});

test('the words for trade', () => {
  const { rules } = createGame(loadData());
  assert.equal(coinText(15000), '15 coins');
  assert.equal(coinText(1000), '1 coin');
  assert.equal(coinText(1200), '1.2 coins');
  assert.equal(coinText(250), '0.25 coins');
  assert.equal(tradeOrderText(null), 'Off');
  assert.equal(tradeOrderText({ mode: 'sell', level: 60 }), 'Sell above 60');
  assert.equal(tradeOrderText({ mode: 'buy', level: 20 }), 'Buy up to 20');
  assert.equal(tradeCallText(rules, null), null);
  assert.equal(tradeCallText(rules, { tick: 5, sold: {}, bought: {}, earnedMilli: 0, spentMilli: 0 }), null);
  assert.equal(tradeCallText(rules, { tick: 5, sold: { wood: 20, fish: 1 }, bought: {}, earnedMilli: 11200, spentMilli: 0 }), 'The trade ship sold 20 wood, 1 fish for 11.2 coins.');
  assert.equal(tradeCallText(rules, { tick: 5, sold: {}, bought: { planks: 1 }, earnedMilli: 0, spentMilli: 6000 }), 'The trade ship bought 1 plank for 6 coins.');
  const game = createGame(loadData());
  assert.equal(reasonText(game, 'no_harbor'), 'Build a harbour first. The trade ship calls there.');
  assert.equal(reasonText(game, 'no_change'), 'That is the order already.');
  assert.equal(reasonText(game, 'not_tradable'), 'That cannot be traded.');
});

// ---- the ship on the map --------------------------------------------------------------------

test('the ship sails in before its call, ties up at the harbour, and sails away, always on the water', () => {
  const game = createGame(loadData());
  runBot(game, loadOrder('merchant'), { maxMinutes: 12 });
  const life = createLife(game.rules);
  const water = (a) => game.state.map.terrain[Math.floor(a.y) * game.state.map.width + Math.floor(a.x)] === 'water';
  const seen = { away: 0, coming: 0, docked: 0, leaving: 0 };
  let lastDistance = null;
  for (let i = 0; i < SHIP + 400; i++) {
    step(game);
    const ships = life.update(game).filter((a) => a.kind === 'ship');
    assert.ok(ships.length <= 1);
    const t = game.state.trade;
    if (ships.length === 0) { seen.away++; continue; }
    const [s] = ships;
    assert.ok(water(s), `the ship is on dry land at ${s.x.toFixed(1)}, ${s.y.toFixed(1)}`);
    if (s.docked) seen.docked++;
    else if (t.timer >= SHIP - 200) {
      seen.coming++;
      const h = game.state.buildings.find((b) => b.type === 'harbor');
      const distance = Math.hypot(s.x - (h.x + 1), s.y - (h.y + 1));
      if (lastDistance !== null) assert.ok(distance <= lastDistance + 1e-9, 'the ship sailed away while coming in');
      lastDistance = distance;
    } else seen.leaving++;
  }
  assert.ok(seen.coming > 150 && seen.docked >= 70 && seen.leaving > 150 && seen.away > 500, JSON.stringify(seen));
});

test('no harbour, or a harbour cut off by road: no ship', () => {
  const game = richGame();
  const life = createLife(game.rules);
  for (let i = 0; i < SHIP; i++) {
    step(game);
    assert.equal(life.update(game).some((a) => a.kind === 'ship'), false);
  }
  const h = place(game, 'harbor', 2, 9);
  game.state.trade.timer = SHIP - 50; // as if the ship were coming
  assert.equal(life.update(game).some((a) => a.kind === 'ship'), false, 'a ship came to a harbour with no road');
  road(game, line(4, 9, 9, 9));
  run(game, 1);
  assert.equal(h.connected, true);
});

// ---- the whole game ------------------------------------------------------------------------

test('GATE: the standard game plays exactly as it did before trade, with or without it in the data', () => {
  const withTrade = createGame(loadData());
  const before = createGame(dataBefore(2));
  const a = runBot(withTrade, loadOrder('standard'));
  const b = runBot(before, loadOrder('standard'));
  assert.equal(a.wonAtMinutes, b.wonAtMinutes);
  assert.equal(snapshot(withTrade), snapshot(before));
});

test('GATE: trade is a help, not a coin machine: no trading order beats the standard one', () => {
  const standard = runBot(createGame(loadData()), loadOrder('standard')).wonAtMinutes;
  const merchant = runBot(createGame(loadData()), loadOrder('merchant'));
  assert.equal(merchant.won, true);
  assert.ok(merchant.wonAtMinutes >= standard && merchant.wonAtMinutes <= 40, `the merchant order won at ${merchant.wonAtMinutes.toFixed(1)} minutes`);
  assert.equal(merchant.zeroCoinMinutes < 0.5, true);
  // A town that builds lumberjacks only to sell the wood does no better.
  const std = loadOrder('standard');
  const at = std.steps.findIndex((s) => s.build === 'sawmill') + 1;
  const baron = { steps: [...std.steps.slice(0, at), { build: 'harbor' }, { build: 'lumberjack', count: 6 }, { trade: 'wood', mode: 'sell', level: 30 }, ...std.steps.slice(at)] };
  const result = runBot(createGame(loadData()), baron, { maxMinutes: 70 });
  assert.ok(!result.won || result.wonAtMinutes > standard, 'selling wood beat building a town');
  // And on paper: no producer, selling all it makes, earns more than a house of Farmers pays in taxes
  // for each pair of staff it needs. A producer that turns goods into goods is credited only for the gain.
  const { rules } = createGame(loadData());
  const farmerTaxPerResident = rules.tiers.farmer.taxMilliPerMinute;
  for (const def of Object.values(rules.buildings)) {
    if (!def.production) continue;
    const perMinute = rules.ticksPerMinute / def.production.cycleTicks;
    const value = (goods, price) => Object.entries(goods).reduce((sum, [g, n]) => sum + n * rules.prices[g][price], 0);
    const earned = perMinute * (value(def.production.outputs, 'sellMilli') - value(def.production.inputs, 'sellMilli')) - def.upkeepMilliPerMinute;
    const housesWorth = (def.staff / rules.workforce.perResidentMilli) * 1000 * farmerTaxPerResident;
    assert.ok(earned < housesWorth, `${def.id} earns ${(earned / 1000).toFixed(1)} a minute by selling, more than the ${(housesWorth / 1000).toFixed(1)} its staff pay in taxes`);
  }
});

test('GATE: a game that only buys bread, never bakes it, is slower than one that bakes', () => {
  const std = loadOrder('standard');
  const at = std.steps.findIndex((s) => s.build === 'sawmill') + 1;
  const buyer = { steps: [...std.steps.filter((s) => s.build !== 'farm' && s.build !== 'bakery').slice(0, at), { build: 'harbor' }, { trade: 'bread', mode: 'buy', level: 40 }, ...std.steps.filter((s) => s.build !== 'farm' && s.build !== 'bakery').slice(at)] };
  const result = runBot(createGame(loadData()), buyer, { maxMinutes: 60 });
  const standard = runBot(createGame(loadData()), std);
  assert.ok(!result.won || result.wonAtMinutes > standard.wonAtMinutes + 3, `buying bread won at ${result.wonAtMinutes?.toFixed(1)} minutes`);
});

test('compiled rules know the prices in thousandths of a coin', () => {
  const rules = compileRules(loadData());
  assert.deepEqual(rules.prices.wood, { sellMilli: 400, buyMilli: 2000 });
  assert.deepEqual(rules.prices.cloth, { sellMilli: 6000, buyMilli: 18000 });
});
