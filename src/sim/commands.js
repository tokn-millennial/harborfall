// Commands are the only way the player (or the bot) changes the game.
// Every command returns { ok: true, ... } or { ok: false, reason }.
// A failed command changes nothing.

import { inBounds, tileIndex } from './grid.js';
import { addBuilding, buildingAt, buildingById, removeBuilding } from './buildings.js';
import { upgradeHouse, upgradeReason } from './population.js';
import { canPlace } from './placement.js';
import { pay, refund } from './economy.js';
import { refresh } from './refresh.js';
import { producerStatuses, remember, undoLast } from './undo.js';
import { syncProductionStatus } from './production.js';
import { setTradeOrder, tradeOrderReason } from './trade.js';
import { HOME, islandAt, islandOf, paysFrom } from './islands.js';
import { setShipOrder, shipOrderReason } from './ship.js';

const fail = (reason) => ({ ok: false, reason });

export function execute(game, command) {
  if (command === null || typeof command !== 'object') return fail('unknown_command');
  switch (command.action) {
    case 'place': return place(game, command);
    case 'road': return road(game, command);
    case 'demolish': return demolish(game, command);
    case 'upgrade': return upgrade(game, command);
    case 'close': return setClosed(game, command, true);
    case 'reopen': return setClosed(game, command, false);
    case 'trade': return trade(game, command);
    case 'ship': return ship(game, command);
    case 'undo': return undoLast(game);
    default: return fail('unknown_command');
  }
}

// { action: 'place', building, x, y }   (x, y is the top-left tile)
function place(game, { building, x, y }) {
  const { rules } = game;
  if (rules.buildings[building]?.category === 'road') {
    const result = road(game, { tiles: [[x, y]] });
    return result.ok ? { ok: true } : fail(result.reason);
  }
  const check = canPlace(game, building, x, y);
  if (!check.ok) return check;
  const from = paysFrom(game, islandAt(game.state.map, x, y));
  pay(game, rules.buildings[building].cost, from);
  const created = addBuilding(game, building, x, y);
  refresh(game);
  remember(game, { kind: 'place', id: created.id, from });
  return { ok: true, id: created.id };
}

// { action: 'road', tiles: [[x, y], ...] }
// Lays as many of the tiles as it can, in order. Tiles that are already road
// are skipped for free. `ok` is true only when every tile ends up as road.
function road(game, { tiles }) {
  const { rules, state } = game;
  if (!Array.isArray(tiles)) return fail('bad_command');
  let placed = 0;
  let failed = 0;
  let reason = null;
  const laid = [];
  for (const tile of tiles) {
    const [x, y] = Array.isArray(tile) ? tile : [];
    if (inBounds(state.map, x, y) && state.roads[tileIndex(state.map, x, y)]) continue;
    const check = canPlace(game, 'road', x, y);
    if (!check.ok) {
      failed++;
      reason ??= check.reason;
      continue;
    }
    pay(game, rules.buildings.road.cost, paysFrom(game, islandAt(state.map, x, y)));
    state.roads[tileIndex(state.map, x, y)] = 1;
    laid.push([x, y]);
    placed++;
  }
  if (placed > 0) {
    refresh(game);
    remember(game, { kind: 'road', tiles: laid });
  }
  return failed === 0 ? { ok: true, placed } : { ok: false, reason, placed, failed };
}

// { action: 'demolish', x, y }
function demolish(game, { x, y }) {
  const { rules, state } = game;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(state.map, x, y)) return fail('out_of_bounds');
  const ratio = rules.economy.demolishRefundRatio;
  const statuses = producerStatuses(game); // as they are before anything is cut off

  const building = buildingAt(game, x, y);
  if (building) {
    const def = rules.buildings[building.type];
    if (def.category === 'storage' && islandOf(game, building) === HOME && homeWarehouses(game) === 1) return fail('last_warehouse');
    const index = state.buildings.indexOf(building);
    const to = paysFrom(game, islandOf(game, building)); // where its goods came from, worked out before it goes
    const carts = JSON.parse(JSON.stringify(state.carts)); // a demolish can send carts home, or take them away
    removeBuilding(game, building);
    refresh(game);
    // The free starting building cost nothing, so it returns nothing.
    const given = building.free ? { coinsMilli: 0, goods: {} } : refund(game, def.cost, ratio, to);
    remember(game, { kind: 'demolish', building: JSON.parse(JSON.stringify(building)), index, given, statuses, carts, from: to });
    return { ok: true, removed: building.type };
  }

  const i = tileIndex(state.map, x, y);
  if (state.roads[i]) {
    const to = paysFrom(game, islandAt(state.map, x, y));
    state.roads[i] = 0;
    refresh(game);
    const given = refund(game, rules.buildings.road.cost, ratio, to);
    remember(game, { kind: 'unroad', x, y, given, statuses, from: to });
    return { ok: true, removed: 'road' };
  }
  return fail('nothing_here');
}

// { action: 'upgrade', id }   (id of a house)
function upgrade(game, { id }) {
  const building = buildingById(game, id);
  const reason = upgradeReason(game, building);
  if (reason) return fail(reason);
  const before = JSON.parse(JSON.stringify(building.house));
  const from = paysFrom(game, islandOf(game, building));
  upgradeHouse(game, building);
  remember(game, { kind: 'upgrade', id: building.id, house: before, from });
  return { ok: true, tier: building.house.tier };
}

// { action: 'close', id } and { action: 'reopen', id }   (id of a producer)
// A closed producer makes nothing and needs no staff. It still costs its upkeep.
function setClosed(game, { id }, closed) {
  const building = buildingById(game, id);
  if (!building?.production) return fail('not_a_producer');
  const p = building.production;
  if (Boolean(p.closed) === closed) return fail(closed ? 'already_closed' : 'not_closed');
  const status = p.status;
  if (closed) p.closed = true;
  else delete p.closed;
  syncProductionStatus(game);
  remember(game, { kind: closed ? 'close' : 'reopen', id: building.id, status });
  return { ok: true };
}

// Warehouses on the home island. The last one cannot be demolished.
function homeWarehouses(game) {
  return game.state.buildings.filter((b) => game.rules.buildings[b.type].category === 'storage' && islandOf(game, b) === HOME).length;
}

// { action: 'ship', good, way }
// What your own ship carries: way is 'out' (from home to the second island),
// 'back' (from the second island home) or 'off' (it does not carry that good).
function ship(game, { good, way }) {
  const reason = shipOrderReason(game, good, way);
  if (reason) return fail(reason);
  const before = game.state.ship.orders[good] ?? 'off';
  if (before === way) return fail('no_change');
  setShipOrder(game, good, way);
  remember(game, { kind: 'ship', good, before });
  return { ok: true };
}

// { action: 'trade', good, mode, level }
// A standing order for the trade ship. mode is 'sell' (sell everything above
// `level`), 'buy' (buy up to `level`) or 'off' (no order; level is ignored).
function trade(game, { good, mode, level }) {
  const reason = tradeOrderReason(game, good, mode, level);
  if (reason) return fail(reason);
  const before = game.state.trade.orders[good] ?? null;
  const next = mode === 'off' ? null : { mode, level };
  if ((before === null && next === null) || (before && next && before.mode === next.mode && before.level === next.level)) return fail('no_change');
  setTradeOrder(game, good, next);
  remember(game, { kind: 'trade', good, before: before ? { mode: before.mode, level: before.level } : null });
  return { ok: true };
}
