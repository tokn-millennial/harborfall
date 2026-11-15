// Undo: taking back the last thing the player did.
//
// Only the last successful command can be undone, and only for a short time
// (undoSeconds in config.json). Undoing is not the same as demolishing: it
// puts things back as they were, at no cost.
//   - a building just placed is removed and its whole cost returned
//   - road just laid is lifted and its cost returned
//   - a building just demolished is put back as it was, and what the demolish
//     gave back is taken away again
//   - a house just upgraded goes back to what it was, and the cost is returned
//   - a producer just closed is open again, and one just reopened is closed
//   - a trade order just changed is what it was, and so is an order for your ship
// An undo cannot itself be undone.
//
// What is needed to undo is kept in the state (state.undo), so it is saved
// with the game and two games given the same commands still match exactly.

import { footprint, inBounds, tileIndex } from './grid.js';
import { buildingById, removeBuilding } from './buildings.js';
import { refresh } from './refresh.js';
import { MAX_TRADE_LEVEL, setTradeOrder } from './trade.js';
import { HOME, SECOND, islandAt, islandOf, paysFrom, stockOf } from './islands.js';
import { SHIP_WAYS, setShipOrder } from './ship.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const fail = (reason) => ({ ok: false, reason });
const isCount = (n) => Number.isInteger(n) && n >= 0;

// Called by a command that worked, with what would be needed to take it back.
// With undoSeconds set to 0 nothing is kept, and Undo is off.
export function remember(game, record) {
  const { rules, state } = game;
  state.undo = rules.undoTicks > 0 ? { ...record, untilTick: state.tick + rules.undoTicks } : null;
}

// What an undo would do right now, without doing it. Never changes the game.
// { ok: true, kind, type, count, ticksLeft } or { ok: false, reason }.
//   kind   'place', 'road', 'demolish', 'unroad', 'upgrade', 'close', 'reopen' or 'trade'
//   type   the building involved, for everything but roads
//   count  the number of road tiles, for road
export function undoStatus(game) {
  const { state } = game;
  const u = state.undo ?? null;
  if (!u) return fail('nothing_to_undo');
  if (state.tick > u.untilTick) return fail('undo_expired');
  const status = { ok: true, kind: u.kind, type: null, count: null, ticksLeft: u.untilTick - state.tick };
  if (u.kind === 'place') status.type = buildingById(game, u.id)?.type ?? null;
  if (u.kind === 'demolish') status.type = u.building.type;
  if (u.kind === 'upgrade' || u.kind === 'close' || u.kind === 'reopen') status.type = buildingById(game, u.id)?.type ?? null;
  if (u.kind === 'road') status.count = u.tiles.length;
  return status;
}

// Gives a cost back in full, to the island it was paid from (records from
// before the second island have none: the home island). Goods that do not fit
// in storage are lost, as with any refund.
function giveBack(game, cost, from = HOME) {
  const { state } = game;
  const stock = stockOf(game, from ?? HOME);
  state.coinsMilli += cost.coinsMilli;
  for (const [good, amount] of Object.entries(cost.goods)) {
    stock.goods[good] = Math.min(Math.max(stock.storageCap, stock.goods[good]), stock.goods[good] + amount);
  }
}

// Takes back what a demolish handed out. False if it is no longer all there.
function takeBack(game, given, from = HOME) {
  const { state } = game;
  const goods = stockOf(game, from ?? HOME).goods;
  if (state.coinsMilli < given.coinsMilli) return false;
  for (const [good, amount] of Object.entries(given.goods)) if (goods[good] < amount) return false;
  state.coinsMilli -= given.coinsMilli;
  for (const [good, amount] of Object.entries(given.goods)) goods[good] -= amount;
  return true;
}

// { action: 'undo' }
export function undoLast(game) {
  const { rules, state } = game;
  const check = undoStatus(game);
  if (!check.ok) return check;
  const u = state.undo;

  if (u.kind === 'place') {
    const building = buildingById(game, u.id);
    if (!building) return fail('nothing_to_undo');
    const def = rules.buildings[building.type];
    if (def.category === 'storage' && islandOf(game, building) === HOME && countHome(game, 'storage') === 1) return fail('last_warehouse');
    removeBuilding(game, building);
    // Its number is handed back too, so the game is exactly as it was.
    if (building.id === state.nextId - 1) state.nextId = building.id;
    refresh(game);
    giveBack(game, def.cost, u.from);
  } else if (u.kind === 'road') {
    const cost = rules.buildings.road.cost;
    for (const [x, y] of u.tiles) {
      const i = tileIndex(state.map, x, y);
      if (state.roads[i] !== 1) continue;
      const from = paysFrom(game, islandAt(state.map, x, y));
      state.roads[i] = 0;
      giveBack(game, cost, from);
    }
    refresh(game);
  } else if (u.kind === 'demolish') {
    const building = u.building;
    const def = rules.buildings[building.type];
    for (const [x, y] of footprint(building.x, building.y, def.w, def.h)) {
      const i = tileIndex(state.map, x, y);
      if (state.occupancy[i] !== 0 || state.roads[i] !== 0) return fail('blocked');
    }
    if (!takeBack(game, u.given, u.from)) return fail('undo_spent');
    reconnecting(game, u.statuses, () => {
      // Back into the same place in the list, because older houses are fed first.
      state.buildings.splice(Math.min(u.index, state.buildings.length), 0, copy(building));
      for (const [x, y] of footprint(building.x, building.y, def.w, def.h)) state.occupancy[tileIndex(state.map, x, y)] = building.id;
      // The carts as they were: a warehouse's carts come back, and carts sent home set out again.
      if (Array.isArray(u.carts)) state.carts = copy(u.carts);
    });
  } else if (u.kind === 'unroad') {
    const i = tileIndex(state.map, u.x, u.y);
    if (state.occupancy[i] !== 0 || state.roads[i] !== 0) return fail('blocked');
    if (!takeBack(game, u.given, u.from)) return fail('undo_spent');
    reconnecting(game, u.statuses, () => { state.roads[i] = 1; });
  } else if (u.kind === 'upgrade') {
    const building = buildingById(game, u.id);
    if (!building?.house) return fail('nothing_to_undo');
    const cost = rules.tiers[u.house.tier].upgrade.cost;
    building.house = copy(u.house);
    giveBack(game, cost, u.from);
  } else if (u.kind === 'close' || u.kind === 'reopen') {
    const building = buildingById(game, u.id);
    if (!building?.production) return fail('nothing_to_undo');
    if (u.kind === 'close') delete building.production.closed;
    else building.production.closed = true;
    building.production.status = u.status; // the word it had before, exactly
  } else if (u.kind === 'trade') {
    setTradeOrder(game, u.good, u.before);
  } else if (u.kind === 'ship') {
    setShipOrder(game, u.good, u.before);
  } else {
    return fail('nothing_to_undo');
  }

  state.undo = null;
  return { ok: true, undone: u.kind };
}

function countHome(game, category) {
  return game.state.buildings.filter((b) => game.rules.buildings[b.type].category === category && islandOf(game, b) === HOME).length;
}

// The one-word status of every producer that is linked to a warehouse right
// now. A demolish that cuts producers off keeps this, so that undoing it can
// put the words back exactly ("storage full", not a fresh "working").
export function producerStatuses(game) {
  const statuses = {};
  for (const b of game.state.buildings) {
    if (b.production && b.production.status !== 'no_road') statuses[b.id] = b.production.status;
  }
  return statuses;
}

// Runs `restore` (which puts a building or a road back), then gives the
// producers it reconnects the status they had before they were cut off.
function reconnecting(game, statuses, restore) {
  const cut = game.state.buildings.filter((b) => b.production?.status === 'no_road').map((b) => b.id);
  restore();
  refresh(game);
  for (const id of cut) {
    const building = buildingById(game, id);
    if (building?.connected && statuses[id]) building.production.status = statuses[id];
  }
}

// For loading a saved game: the first thing wrong with a saved undo record, in
// words, or null if it is one this file could have written.
export function undoProblem(rules, state) {
  const u = state.undo;
  if (u === null) return null;
  if (typeof u !== 'object' || !isCount(u.untilTick)) return 'the undo record is not a record';
  const map = state.map;
  const given = (g) => g !== null && typeof g === 'object' && isCount(g.coinsMilli) && g.goods !== null && typeof g.goods === 'object'
    && Object.entries(g.goods).every(([good, amount]) => rules.goodIds.includes(good) && isCount(amount));
  const onMap = (x, y) => Number.isInteger(x) && Number.isInteger(y) && inBounds(map, x, y);
  const STATUS = ['missing_input', 'working', 'storage_full', 'closed', 'yard_full'];
  const statuses = (s) => s !== null && typeof s === 'object' && Object.values(s).every((word) => STATUS.includes(word));

  // Which island's goods a record paid from or was given to. Older records have none.
  if (u.from !== undefined && u.from !== HOME && u.from !== SECOND) return 'the undo record names an unknown island';
  if (u.kind === 'place') return Number.isInteger(u.id) ? null : 'the undo record names no building';
  if (u.kind === 'ship') {
    if (typeof u.good !== 'string' || !rules.goodIds.includes(u.good)) return 'the undo record is for a good your ship cannot carry';
    return SHIP_WAYS.includes(u.before) ? null : 'the undo record for your ship is wrong';
  }
  if (u.kind === 'trade') {
    if (typeof u.good !== 'string' || !Object.hasOwn(rules.prices, u.good)) return 'the undo record is for a good that cannot be traded';
    const b = u.before;
    if (b === null) return null;
    return typeof b === 'object' && ['sell', 'buy'].includes(b.mode) && isCount(b.level) && b.level <= MAX_TRADE_LEVEL ? null : 'the undo record for a trade order is wrong';
  }
  if (u.kind === 'close' || u.kind === 'reopen') {
    const building = state.buildings.find((b) => b?.id === u.id);
    if (!building?.production) return 'the undo record closes something that is not a producer';
    if (!['no_road', ...STATUS].includes(u.status)) return 'the undo record for a closing is wrong';
    return Boolean(building.production.closed) === (u.kind === 'close') ? null : 'the undo record for a closing does not match the building';
  }
  if (u.kind === 'road') {
    return Array.isArray(u.tiles) && u.tiles.every((t) => Array.isArray(t) && onMap(t[0], t[1])) ? null : 'the undo record lists a road tile off the island';
  }
  if (u.kind === 'unroad') return onMap(u.x, u.y) && given(u.given) && statuses(u.statuses) ? null : 'the undo record for a road is wrong';
  if (u.kind === 'upgrade') {
    const h = u.house;
    const tier = h !== null && typeof h === 'object' && Object.hasOwn(rules.tiers, h.tier) ? rules.tiers[h.tier] : null;
    if (!Number.isInteger(u.id) || !tier?.upgrade) return 'the undo record for an upgrade is wrong';
    if (!isCount(h.residents) || h.residents > tier.capacity) return 'the undo record for an upgrade holds an impossible house';
    if (h.hunger === null || typeof h.hunger !== 'object' || h.met === null || typeof h.met !== 'object') return 'the undo record for an upgrade holds a house with no needs';
    return null;
  }
  if (u.kind === 'demolish') {
    const b = u.building;
    if (b === null || typeof b !== 'object' || !given(u.given) || !isCount(u.index) || !statuses(u.statuses)) return 'the undo record for a demolish is wrong';
    if (u.carts !== undefined && !Array.isArray(u.carts)) return 'the undo record for a demolish holds wrong carts';
    const def = Object.hasOwn(rules.buildings, b.type) ? rules.buildings[b.type] : null;
    if (!def || def.category === 'road') return 'the undo record holds an unknown building';
    if (!Number.isInteger(b.id) || b.id < 1 || b.id >= state.nextId || state.buildings.some((other) => other?.id === b.id)) return 'the undo record holds a building with a wrong number';
    if (!Number.isInteger(b.x) || !Number.isInteger(b.y)) return 'the undo record holds a building with no position';
    for (const [x, y] of footprint(b.x, b.y, def.w, def.h)) if (!inBounds(map, x, y)) return 'the undo record holds a building off the island';
    if (Boolean(def.production) !== Boolean(b.production) || Boolean(def.housingTier) !== Boolean(b.house)) return 'the undo record holds a building of the wrong kind';
    if (b.house) {
      const tier = Object.hasOwn(rules.tiers, b.house.tier) ? rules.tiers[b.house.tier] : null;
      if (!tier || !isCount(b.house.residents) || b.house.residents > tier.capacity) return 'the undo record holds an impossible house';
      if (b.house.hunger === null || typeof b.house.hunger !== 'object' || b.house.met === null || typeof b.house.met !== 'object') return 'the undo record holds a house with no needs';
    }
    if (b.production && !isCount(b.production.progress)) return 'the undo record holds a building with a wrong work timer';
    return null;
  }
  return 'the undo record is of an unknown kind';
}
