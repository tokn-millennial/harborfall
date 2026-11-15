// Trade: a ship that calls at the harbour, sells what the island has too much
// of and buys what it lacks.
//
// While the island has a harbour linked to a warehouse, a ship calls at fixed
// intervals (config.json, "trade"). The player gives standing orders, one per
// good: sell everything above a level, or buy up to a level. Prices are fixed
// per good in goods.json, and buying always costs more than selling earns.
// The ship carries a limited number of units per harbour on each call, sold
// and bought together.
//
// The orders belong to the home island, not to one harbour: the ship trades
// with the home island's stockpile. It does not call at the second island.

const MODES = ['sell', 'buy'];
export const MAX_TRADE_LEVEL = 999;

export function createTradeState() {
  return { timer: 0, orders: {}, last: null };
}

// How many harbours are linked to a warehouse right now.
export function countHarbors(game, connectedOnly = true) {
  const { rules, state } = game;
  let n = 0;
  // The trade ship calls at the home island. A harbour on the second island is for your own ship.
  for (const b of state.buildings) if (rules.buildings[b.type].harbor && (b.connected || !connectedOnly) && islandOf(game, b) === HOME) n++;
  return n;
}

// Called once a tick, after the houses have eaten. Counts down to the ship,
// and when it calls, carries out the orders: sales first, in the order the
// goods are listed, then purchases with whatever coins there are by then.
export function stepTrade(game) {
  const { rules, state } = game;
  if (!rules.trade) return;
  const trade = state.trade;
  const harbors = countHarbors(game);
  if (harbors === 0) {
    trade.timer = 0; // no ship sets out for an island with no harbour
    return;
  }
  trade.timer++;
  if (trade.timer < rules.trade.shipTicks) return;
  trade.timer = 0;

  let room = harbors * rules.trade.unitsPerHarbor;
  const sold = {};
  const bought = {};
  let earnedMilli = 0;
  let spentMilli = 0;
  for (const good of rules.goodIds) {
    const order = trade.orders[good];
    const price = rules.prices[good];
    if (!order || order.mode !== 'sell' || !price) continue;
    const amount = Math.min(room, state.goods[good] - order.level);
    if (amount <= 0) continue;
    state.goods[good] -= amount;
    state.coinsMilli += amount * price.sellMilli;
    earnedMilli += amount * price.sellMilli;
    sold[good] = amount;
    room -= amount;
  }
  for (const good of rules.goodIds) {
    const order = trade.orders[good];
    const price = rules.prices[good];
    if (!order || order.mode !== 'buy' || !price) continue;
    const wanted = Math.min(order.level, state.storageCap) - state.goods[good];
    const amount = Math.min(room, wanted, Math.floor(state.coinsMilli / price.buyMilli));
    if (amount <= 0) continue;
    state.goods[good] += amount;
    state.coinsMilli -= amount * price.buyMilli;
    spentMilli += amount * price.buyMilli;
    bought[good] = amount;
    room -= amount;
  }
  trade.last = { tick: state.tick, sold, bought, earnedMilli, spentMilli };
}

// The reason an order cannot be given, or null. `mode` is 'off', 'sell' or 'buy'.
export function tradeOrderReason(game, good, mode, level) {
  const { rules } = game;
  if (!rules.trade || countHarbors(game, false) === 0) return 'no_harbor';
  if (typeof good !== 'string' || !Object.hasOwn(rules.prices, good)) return 'not_tradable';
  if (mode !== 'off' && !MODES.includes(mode)) return 'bad_command';
  if (mode !== 'off' && (!Number.isInteger(level) || level < 0 || level > MAX_TRADE_LEVEL)) return 'bad_command';
  return null;
}

// Sets or clears the order for one good. The orders are kept in the order the
// goods are listed, so the same orders always look the same however they were
// arrived at (undo depends on that).
export function setTradeOrder(game, good, order) {
  const { rules, state } = game;
  const next = {};
  for (const id of rules.goodIds) {
    const value = id === good ? order : state.trade.orders[id];
    if (value) next[id] = { mode: value.mode, level: value.level };
  }
  state.trade.orders = next;
}

// For loading a saved game: the first thing wrong with the trade record, in
// words, or null.
export function tradeProblem(rules, state) {
  const t = state.trade;
  const isCount = (n) => Number.isInteger(n) && n >= 0;
  if (t === null || typeof t !== 'object') return 'the trade record is missing';
  if (!isCount(t.timer) || (rules.trade ? t.timer >= rules.trade.shipTicks : t.timer !== 0)) return 'the trade ship\'s timer is wrong';
  if (t.orders === null || typeof t.orders !== 'object' || Array.isArray(t.orders)) return 'the trade orders are missing';
  for (const [good, order] of Object.entries(t.orders)) {
    if (!Object.hasOwn(rules.prices, good)) return `there is a trade order for "${good}", which cannot be traded`;
    if (order === null || typeof order !== 'object' || !MODES.includes(order.mode)) return `the trade order for ${good} is not an order`;
    if (!isCount(order.level) || order.level > MAX_TRADE_LEVEL) return `the trade order for ${good} has a wrong level`;
  }
  if (t.last !== null) {
    const amounts = (m) => m !== null && typeof m === 'object' && !Array.isArray(m) && Object.entries(m).every(([good, n]) => rules.goodIds.includes(good) && isCount(n));
    if (typeof t.last !== 'object' || !isCount(t.last.tick) || !amounts(t.last.sold) || !amounts(t.last.bought) || !isCount(t.last.earnedMilli) || !isCount(t.last.spentMilli)) {
      return 'the record of the last trade ship is wrong';
    }
  }
  return null;
}

// A read-only picture of trade for the screen and the bot.
export function tradeSummary(game) {
  const { rules, state } = game;
  if (!rules.trade) return { on: false, harbors: 0, capacity: 0, secondsToShip: null, orders: {}, last: null };
  const harbors = countHarbors(game);
  return {
    on: true,
    harbors,
    capacity: harbors * rules.trade.unitsPerHarbor,
    secondsToShip: harbors > 0 ? (rules.trade.shipTicks - state.trade.timer) / rules.ticksPerSecond : null,
    orders: JSON.parse(JSON.stringify(state.trade.orders)),
    last: state.trade.last ? JSON.parse(JSON.stringify(state.trade.last)) : null,
  };
}import { HOME, islandOf } from './islands.js';

