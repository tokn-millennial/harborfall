// Commands are the only way the player (or the bot) changes the game.
// Every command returns { ok: true, ... } or { ok: false, reason }.
// A failed command changes nothing.

import { inBounds, tileIndex } from './grid.js';
import { addBuilding, buildingAt, buildingById, countCategory, removeBuilding } from './buildings.js';
import { upgradeHouse, upgradeReason } from './population.js';
import { canPlace } from './placement.js';
import { pay, refund } from './economy.js';
import { refresh } from './refresh.js';

const fail = (reason) => ({ ok: false, reason });

export function execute(game, command) {
  if (command === null || typeof command !== 'object') return fail('unknown_command');
  switch (command.action) {
    case 'place': return place(game, command);
    case 'road': return road(game, command);
    case 'demolish': return demolish(game, command);
    case 'upgrade': return upgrade(game, command);
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
  pay(game, rules.buildings[building].cost);
  const created = addBuilding(game, building, x, y);
  refresh(game);
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
  for (const tile of tiles) {
    const [x, y] = Array.isArray(tile) ? tile : [];
    if (inBounds(state.map, x, y) && state.roads[tileIndex(state.map, x, y)]) continue;
    const check = canPlace(game, 'road', x, y);
    if (!check.ok) {
      failed++;
      reason ??= check.reason;
      continue;
    }
    pay(game, rules.buildings.road.cost);
    state.roads[tileIndex(state.map, x, y)] = 1;
    placed++;
  }
  if (placed > 0) refresh(game);
  return failed === 0 ? { ok: true, placed } : { ok: false, reason, placed, failed };
}

// { action: 'demolish', x, y }
function demolish(game, { x, y }) {
  const { rules, state } = game;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(state.map, x, y)) return fail('out_of_bounds');
  const ratio = rules.economy.demolishRefundRatio;

  const building = buildingAt(game, x, y);
  if (building) {
    const def = rules.buildings[building.type];
    if (def.category === 'storage' && countCategory(game, 'storage') === 1) return fail('last_warehouse');
    removeBuilding(game, building);
    refresh(game);
    // The free starting building cost nothing, so it returns nothing.
    if (!building.free) refund(game, def.cost, ratio);
    return { ok: true, removed: building.type };
  }

  const i = tileIndex(state.map, x, y);
  if (state.roads[i]) {
    state.roads[i] = 0;
    refresh(game);
    refund(game, rules.buildings.road.cost, ratio);
    return { ok: true, removed: 'road' };
  }
  return fail('nothing_here');
}

// { action: 'upgrade', id }   (id of a house)
function upgrade(game, { id }) {
  const building = buildingById(game, id);
  const reason = upgradeReason(game, building);
  if (reason) return fail(reason);
  upgradeHouse(game, building);
  return { ok: true, tier: building.house.tier };
}
