// Your own ship: it sails back and forth between a harbour on the home island
// and one on the second island, carrying the goods you choose each way.
//
// state.ship = { orders, keep, phase, at, left, trip, cargo }
//   orders  what it carries, per good: 'out' from home to the second island,
//           'back' from the second island home. A good not listed stays put.
//   keep    per good, how many to leave behind on the island it loads from
//           (added in Phase 24). A good not listed keeps none back.
//   phase   'idle'     there is no route: an island has no harbour linked to a warehouse
//           'loading'  tied up in the harbour of island `at`
//           'sailing'  on its way to the harbour of island `at`
//   left    ticks left of loading or sailing
//   trip    ticks a crossing takes, worked out from where the two harbours are
//           (0 while there is no route). Kept up to date by refresh.
//   cargo   goods on board
//
// In each harbour it first unloads everything that fits in that island's
// stockpile, then, when its time there is up, loads what is ordered to leave
// that island, taking turns between the goods one at a time until it is full
// or there is nothing more. What does not fit on unloading stays on board.
//
// Switched on by "fleet" in config.json, and only on a map with a second island.

import { DIRS4, footprint, inBounds, tileIndex } from './grid.js';
import { HOME, SECOND, hasSecondIsland, islandOf, stockOf } from './islands.js';

export const SHIP_WAYS = ['off', 'out', 'back'];
export const MAX_KEEP = 999;
const PHASES = ['idle', 'loading', 'sailing'];

export function createShipState() {
  return { orders: {}, keep: {}, phase: 'idle', at: HOME, left: 0, trip: 0, cargo: {} };
}

// The harbour your ship uses on an island: the oldest one linked to a warehouse, or null.
export function shipHarbour(game, island) {
  const { rules, state } = game;
  for (const b of state.buildings) {
    if (rules.buildings[b.type].harbor && b.connected && islandOf(game, b) === island) return b;
  }
  return null;
}

// Where the ship ties up at a harbour: the water touching its sides, or across
// one tile of beach from them. A harbour need only touch the beach (its
// placement rule), so it may stand one tile back from the water.
function waterBeside(game, b) {
  const { rules, state } = game;
  const map = state.map;
  const def = rules.buildings[b.type];
  const isWater = (x, y) => inBounds(map, x, y) && map.terrain[tileIndex(map, x, y)] === 'water';
  const seen = new Set();
  const out = [];
  const add = (x, y) => {
    const i = tileIndex(map, x, y);
    if (!seen.has(i)) {
      seen.add(i);
      out.push([x, y]);
    }
  };
  for (const [x, y] of footprint(b.x, b.y, def.w, def.h)) {
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      if (isWater(nx, ny)) add(nx, ny);
      else if (map.terrain[tileIndex(map, nx, ny)] === 'coast') {
        for (const [ex, ey] of DIRS4) if (isWater(nx + ex, ny + ey)) add(nx + ex, ny + ey);
      }
    }
  }
  return out;
}

// Tiles of sea between two harbours, by the shortest way over water, or 0 if there is none.
export function seaTiles(game, from, to) {
  const map = game.state.map;
  const dist = new Int32Array(map.width * map.height).fill(-1);
  const queue = [];
  for (const [x, y] of waterBeside(game, from)) {
    const i = tileIndex(map, x, y);
    if (dist[i] === -1) {
      dist[i] = 1;
      queue.push(i);
    }
  }
  const goal = new Set(waterBeside(game, to).map(([x, y]) => tileIndex(map, x, y)));
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (goal.has(i)) return dist[i] + 1;
    const x = i % map.width;
    const y = (i - x) / map.width;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const j = tileIndex(map, nx, ny);
      if (dist[j] !== -1 || map.terrain[j] !== 'water') continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  return 0;
}

// The tiles of the shortest way over water between two harbours, first to
// last, or null if there is none. For drawing the ship on its way.
export function seaPath(game, from, to) {
  const map = game.state.map;
  const parent = new Int32Array(map.width * map.height).fill(-2);
  const queue = [];
  for (const [x, y] of waterBeside(game, from)) {
    const i = tileIndex(map, x, y);
    if (parent[i] === -2) {
      parent[i] = -1;
      queue.push(i);
    }
  }
  const goal = new Set(waterBeside(game, to).map(([x, y]) => tileIndex(map, x, y)));
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (goal.has(i)) {
      const path = [];
      for (let at = i; at !== -1; at = parent[at]) path.push([at % map.width, Math.floor(at / map.width)]);
      return path.reverse();
    }
    const x = i % map.width;
    const y = (i - x) / map.width;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const j = tileIndex(map, nx, ny);
      if (parent[j] !== -2 || map.terrain[j] !== 'water') continue;
      parent[j] = i;
      queue.push(j);
    }
  }
  return null;
}

// Called by refresh: how long a crossing takes with the harbours as they are now.
export function recomputeShipRoute(game) {
  const { rules, state } = game;
  if (!rules.fleet || !hasSecondIsland(game)) {
    state.ship.trip = 0;
    return;
  }
  const home = shipHarbour(game, HOME);
  const second = shipHarbour(game, SECOND);
  state.ship.trip = home && second ? seaTiles(game, home, second) * rules.fleet.ticksPerTile : 0;
}

// Called once a tick, after the trade ship.
export function stepShip(game) {
  const { rules, state } = game;
  if (!rules.fleet) return;
  const s = state.ship;
  if (s.trip === 0) {
    // No route. It waits where it is, cargo and all, until there is one again.
    if (s.phase !== 'idle') {
      s.phase = 'idle';
      s.left = 0;
    }
    return;
  }
  if (s.phase === 'idle') {
    arrive(game);
    return;
  }
  if (s.left > 0) s.left--;
  if (s.left > 0) return;
  if (s.phase === 'sailing') {
    arrive(game);
    return;
  }
  // Time to go: load what is ordered to leave this island, and sail for the other.
  load(game);
  s.phase = 'sailing';
  s.at = s.at === HOME ? SECOND : HOME;
  s.left = s.trip;
}

// Tied up at island `at`: unload what fits, and start the time in harbour.
function arrive(game) {
  const { rules, state } = game;
  const s = state.ship;
  const stock = stockOf(game, s.at);
  for (const good of rules.goodIds) {
    const n = Math.min(s.cargo[good] ?? 0, Math.max(0, stock.storageCap - stock.goods[good]));
    if (n <= 0) continue;
    stock.goods[good] += n;
    s.cargo[good] -= n;
    if (s.cargo[good] === 0) delete s.cargo[good];
  }
  s.phase = 'loading';
  s.left = rules.fleet.loadTicks;
}

function load(game) {
  const { rules, state } = game;
  const s = state.ship;
  const way = s.at === HOME ? 'out' : 'back';
  const goods = stockOf(game, s.at).goods;
  const chosen = rules.goodIds.filter((good) => s.orders[good] === way);
  let room = rules.fleet.capacity - unitsAboard(s);
  let took = true;
  while (room > 0 && took) {
    took = false;
    for (const good of chosen) {
      if (room === 0) break;
      // Never below the level kept back on this island.
      if (goods[good] <= (s.keep[good] ?? 0)) continue;
      goods[good]--;
      s.cargo[good] = (s.cargo[good] ?? 0) + 1;
      room--;
      took = true;
    }
  }
}

const unitsAboard = (s) => Object.values(s.cargo).reduce((sum, n) => sum + n, 0);

// Checks an order without giving it. Null when it can be given.
export function shipOrderReason(game, good, way) {
  if (!game.rules.fleet || !hasSecondIsland(game)) return 'no_ship';
  if (typeof good !== 'string' || !game.rules.goodIds.includes(good)) return 'unknown_good';
  if (!SHIP_WAYS.includes(way)) return 'bad_command';
  return null;
}

export function setShipOrder(game, good, way) {
  if (way === 'off') delete game.state.ship.orders[good];
  else game.state.ship.orders[good] = way;
}

// Checks a level to keep back without setting it. Null when it can be set.
export function shipKeepReason(game, good, keep) {
  if (!game.rules.fleet || !hasSecondIsland(game)) return 'no_ship';
  if (typeof good !== 'string' || !game.rules.goodIds.includes(good)) return 'unknown_good';
  if (!Number.isInteger(keep) || keep < 0 || keep > MAX_KEEP) return 'bad_command';
  return null;
}

export function setShipKeep(game, good, keep) {
  if (keep === 0) delete game.state.ship.keep[good];
  else game.state.ship.keep[good] = keep;
}

// A read-only picture of the ship for the screen and the bot.
export function shipSummary(game) {
  const { rules, state } = game;
  const s = state.ship;
  const on = Boolean(rules.fleet) && hasSecondIsland(game);
  return {
    on,
    route: s.trip > 0,
    phase: s.phase,
    at: s.at,
    secondsLeft: s.left / rules.ticksPerSecond,
    crossingSeconds: s.trip / rules.ticksPerSecond,
    cargo: { ...s.cargo },
    units: unitsAboard(s),
    capacity: rules.fleet?.capacity ?? 0,
    orders: { ...s.orders },
    keep: { ...s.keep },
    harbours: { home: shipHarbour(game, HOME)?.id ?? null, second: shipHarbour(game, SECOND)?.id ?? null },
  };
}

// For loading a saved game: the first thing wrong with the ship, in words, or null.
export function shipProblem(rules, state) {
  const s = state.ship;
  const isCount = (n) => Number.isInteger(n) && n >= 0;
  if (s === null || typeof s !== 'object') return 'your ship is missing';
  if (s.orders === null || typeof s.orders !== 'object') return 'the orders for your ship are missing';
  for (const [good, way] of Object.entries(s.orders)) {
    if (!rules.goodIds.includes(good) || (way !== 'out' && way !== 'back')) return 'your ship has an order it cannot carry out';
  }
  if (s.keep === null || typeof s.keep !== 'object') return 'the levels your ship keeps back are missing';
  for (const [good, n] of Object.entries(s.keep)) {
    if (!rules.goodIds.includes(good) || !Number.isInteger(n) || n < 1 || n > MAX_KEEP) return 'your ship keeps back a wrong amount';
  }
  if (!PHASES.includes(s.phase)) return 'your ship is doing something unknown';
  if (s.at !== HOME && s.at !== SECOND) return 'your ship is at an unknown island';
  if (!isCount(s.left) || !isCount(s.trip)) return 'your ship has a wrong journey time';
  if (s.cargo === null || typeof s.cargo !== 'object') return 'your ship has no hold';
  for (const [good, n] of Object.entries(s.cargo)) {
    if (!rules.goodIds.includes(good) || !Number.isInteger(n) || n < 1) return 'your ship carries something wrong';
  }
  if (unitsAboard(s) > (rules.fleet?.capacity ?? 0)) return 'your ship carries more than it holds';
  if (s.phase === 'idle' && s.left !== 0) return 'your ship is waiting with a journey time';
  return null;
}
