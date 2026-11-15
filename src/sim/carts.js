// Carts: finished goods travel by road before they reach the stockpile.
//
// A producer puts what it makes in its own yard, which holds only a few units
// (config.json, "carts"). Each warehouse has a few carts (buildings.json,
// "carts"). An idle cart drives along the roads to a producer whose goods are
// waiting, loads what it can carry, drives back, and unloads into the shared
// stockpile. A producer whose yard is full waits for a cart.
//
// Each producer is served by its nearest warehouse by road, as long as that is
// no farther than the carts' reach. A producer beyond reach is never collected.
// Trips take a fixed number of ticks per road tile, set when the cart leaves.
//
// A cart is never sent for goods the stockpile has no room for, counting what
// other carts are already bringing, so carts are never stuck at a full
// warehouse. If the stockpile fills while a cart is on the road anyway (the
// trade ship, a refund), the cart unloads what fits and the rest is lost.
//
// Materials travel too, when config.json has "materials": a workshop (one
// whose production takes inputs) keeps its own small store of them and works
// only from that. A cart setting out for a workshop takes materials from the
// stockpile to top the store up, and comes back with what the workshop made,
// so one trip does both jobs. A workshop that has run out is served first.
// Houses still buy from markets, and building costs still come straight from
// the stockpile.

import { islandOf, stockOf, stockOfBuilding } from './islands.js';
import { DIRS4, inBounds, perimeter, tileIndex } from './grid.js';

export const CART_PHASES = ['home', 'out', 'back'];

export function createCart(home) {
  return { home, phase: 'home', target: null, trip: 0, left: 0, load: {} };
}

// The carts a set of buildings should have, all at home: for a new game, and
// for a game saved before carts existed.
export function cartsFor(rules, buildings) {
  const carts = [];
  if (!rules.carts) return carts;
  for (const b of buildings) for (let i = 0; i < rules.buildings[b.type].carts; i++) carts.push(createCart(b.id));
  return carts;
}

export const unitsIn = (amounts) => Object.values(amounts).reduce((sum, n) => sum + n, 0);

// Adds `n` of a good to a list of amounts, or takes it away when n is negative.
// A good that reaches nothing is removed, so an empty list is always {}.
function change(amounts, good, n) {
  const next = (amounts[good] ?? 0) + n;
  if (next > 0) amounts[good] = next;
  else delete amounts[good];
}

// Whether carts can collect from this producer: linked by road to a warehouse
// within reach. Always true when the rule is off.
export function servedByCarts(rules, building) {
  if (!rules.carts) return true;
  const haul = building.production?.haul;
  return Boolean(haul) && haul.tiles <= rules.carts.reachTiles;
}

// Works out, for every producer, its nearest warehouse by road and how many
// road tiles away it is: production.haul = { from, tiles }, or null with no
// road. Called whenever roads or buildings change, like the road connections.
export function recomputeHauls(game) {
  const { rules, state } = game;
  if (!rules.carts) return;
  const map = state.map;
  const size = map.width * map.height;
  const dist = new Int32Array(size).fill(0);
  const from = new Int32Array(size).fill(0);
  const queue = [];
  // Every road tile beside a warehouse is one tile away from it. Warehouses
  // earlier in the list win ties, so the result never depends on chance.
  for (const b of state.buildings) {
    const def = rules.buildings[b.type];
    if (def.category !== 'storage') continue;
    for (const [x, y] of perimeter(b.x, b.y, def.w, def.h)) {
      if (!inBounds(map, x, y)) continue;
      const i = tileIndex(map, x, y);
      if (state.roads[i] && dist[i] === 0) {
        dist[i] = 1;
        from[i] = b.id;
        queue.push(i);
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % map.width;
    const y = (i - x) / map.width;
    for (const [dx, dy] of DIRS4) {
      if (!inBounds(map, x + dx, y + dy)) continue;
      const n = tileIndex(map, x + dx, y + dy);
      if (state.roads[n] && dist[n] === 0) {
        dist[n] = dist[i] + 1;
        from[n] = from[i];
        queue.push(n);
      }
    }
  }
  for (const b of state.buildings) {
    if (!b.production) continue;
    const def = rules.buildings[b.type];
    let best = null;
    for (const [x, y] of perimeter(b.x, b.y, def.w, def.h)) {
      if (!inBounds(map, x, y)) continue;
      const i = tileIndex(map, x, y);
      if (dist[i] === 0) continue;
      if (!best || dist[i] < best.tiles) best = { from: from[i], tiles: dist[i] };
    }
    b.production.haul = best;
  }
}

// A building has just been placed: a warehouse brings its carts.
export function cartsArrive(game, building) {
  const { rules, state } = game;
  if (!rules.carts) return;
  for (let i = 0; i < rules.buildings[building.type].carts; i++) state.carts.push(createCart(building.id));
}

// A building has just been removed. A warehouse's carts go with it, with
// whatever they carry. Carts on their way to a producer that is gone turn back
// empty, from wherever they had got to.
export function cartsLose(game, building) {
  const { rules, state } = game;
  if (!rules.carts) return;
  state.carts = state.carts.filter((c) => c.home !== building.id);
  for (const c of state.carts) {
    if (c.target !== building.id) continue;
    if (c.phase === 'out') {
      c.phase = 'back';
      c.left = c.trip - c.left;
    }
    c.target = null;
  }
}

// Called once a tick, after production. Carts move, load, unload, and idle
// carts set out for the producers with the most goods waiting.
export function stepCarts(game) {
  const { rules, state } = game;
  if (!rules.carts) return;
  const byId = new Map();
  for (const b of state.buildings) byId.set(b.id, b);

  for (const c of state.carts) {
    if (c.phase === 'home') continue;
    if (c.left > 0) c.left--;
    if (c.left > 0) continue;
    if (c.phase === 'out') {
      const p = byId.get(c.target)?.production;
      // At the workshop: drop off the materials. Room for them was kept when the cart set out.
      for (const [good, n] of Object.entries(c.load)) change(p.store, good, n);
      c.load = {};
      // Then load what it made, as much as the cart takes and the stockpile has room for.
      let room = rules.carts.load;
      for (const good of rules.goodIds) {
        const take = Math.min(room, p.yard[good] ?? 0, spareRoom(game, byId, good, c));
        if (take <= 0) continue;
        change(p.yard, good, -take);
        change(c.load, good, take);
        room -= take;
      }
      c.phase = 'back';
      c.left = c.trip;
      continue;
    }
    // Home: unload into its island's stockpile. What does not fit is lost.
    const stock = stockOfBuilding(game, byId.get(c.home));
    for (const good of rules.goodIds) {
      const n = c.load[good] ?? 0;
      if (n > 0) stock.goods[good] += Math.min(n, Math.max(0, stock.storageCap - stock.goods[good]));
    }
    c.load = {};
    c.phase = 'home';
    c.target = null;
    c.trip = 0;
  }

  // Send idle carts out. The fullest yard is collected first, then the nearest.
  if (!state.carts.some((c) => c.phase === 'home')) return;
  // What is already on its way to each island's stockpile, or soon will be.
  // (A cart on its way out carries materials away from the stockpile, not to it.)
  const targeted = new Set();
  const coming = [{}, {}];
  for (const c of state.carts) {
    const island = islandOf(game, byId.get(c.home));
    if (c.phase === 'back') for (const [good, n] of Object.entries(c.load)) coming[island][good] = (coming[island][good] ?? 0) + n;
    if (c.phase !== 'out') continue;
    targeted.add(c.target);
    const yard = byId.get(c.target)?.production?.yard ?? {};
    for (const [good, n] of Object.entries(yard)) coming[island][good] = (coming[island][good] ?? 0) + Math.min(n, rules.carts.load);
  }
  const roomOn = (island) => (good) => stockOf(game, island).goods[good] + (coming[island][good] ?? 0) < stockOf(game, island).storageCap;
  const waiting = [];
  for (const b of state.buildings) {
    const p = b.production;
    if (!p || targeted.has(b.id) || !servedByCarts(rules, b)) continue;
    const island = islandOf(game, b);
    const units = unitsIn(p.yard);
    const collect = units > 0 && Object.keys(p.yard).every(roomOn(island));
    const urgent = runOut(rules, stockOf(game, island), b);
    if (collect || urgent) waiting.push({ b, units, urgent, island });
  }
  if (waiting.length === 0) return;
  // A workshop that has run out of materials first, then the fullest yard, then the nearest.
  waiting.sort((a, z) => z.urgent - a.urgent || z.units - a.units || a.b.production.haul.tiles - z.b.production.haul.tiles || a.b.id - z.b.id);
  for (const { b, urgent, island } of waiting) {
    const cart = state.carts.find((c) => c.phase === 'home' && c.home === b.production.haul.from);
    if (!cart) continue;
    const stock = stockOf(game, island);
    // Things may have changed with the carts sent so far this tick.
    const collect = unitsIn(b.production.yard) > 0 && Object.keys(b.production.yard).every(roomOn(island));
    if (!collect && !(urgent && runOut(rules, stock, b))) continue;
    if (collect) for (const [good, n] of Object.entries(b.production.yard)) coming[island][good] = (coming[island][good] ?? 0) + Math.min(n, rules.carts.load);
    // Materials to top the workshop's store up, taken from the stockpile now.
    for (const [good, n] of Object.entries(materialsFor(rules, stock, b))) {
      stock.goods[good] -= n;
      change(cart.load, good, n);
    }
    cart.phase = 'out';
    cart.target = b.id;
    cart.trip = b.production.haul.tiles * rules.carts.ticksPerTile;
    cart.left = cart.trip;
  }
}

// Room in the stockpile of a cart's island for a good, counting what other
// carts of that island are already bringing home.
function spareRoom(game, byId, good, except) {
  const island = islandOf(game, byId.get(except.home));
  const stock = stockOf(game, island);
  let coming = 0;
  for (const c of game.state.carts) {
    if (c !== except && c.phase === 'back' && islandOf(game, byId.get(c.home)) === island) coming += c.load[good] ?? 0;
  }
  return Math.max(0, stock.storageCap - stock.goods[good] - coming);
}

// The materials a workshop takes for one cycle, or {} for a producer that takes none.
const inputsOf = (rules, building) => rules.buildings[building.type].production.inputs;

// The materials a cart should take to a workshop to fill its store: as much as
// the store has room for, the stockpile holds, and the cart carries.
// `stock` is the workshop's island's stock (see islands.js).
export function materialsFor(rules, stock, building) {
  if (!rules.materials) return {};
  const store = building.production.store;
  let room = rules.carts.load;
  const out = {};
  for (const good of rules.goodIds) {
    if (!(good in inputsOf(rules, building))) continue;
    const n = Math.min(room, rules.materials.store - (store[good] ?? 0), stock.goods[good]);
    if (n <= 0) continue;
    out[good] = n;
    room -= n;
  }
  return out;
}

// True when a workshop cannot start its next cycle for want of materials, and
// a cart could bring enough of them from the stockpile.
export function runOut(rules, stock, building) {
  if (!rules.materials) return false;
  const p = building.production;
  if (p.active || p.closed) return false;
  const inputs = Object.entries(inputsOf(rules, building));
  if (inputs.length === 0 || inputs.every(([good, n]) => (p.store[good] ?? 0) >= n)) return false;
  const bring = materialsFor(rules, stock, building);
  return inputs.every(([good, n]) => (p.store[good] ?? 0) + (bring[good] ?? 0) >= n);
}

// A read-only picture of the carts for the screen and the bot.
export function cartsSummary(game) {
  const { rules, state } = game;
  if (!rules.carts) return { on: false, total: 0, out: 0, waiting: 0, tooFar: 0 };
  let waiting = 0;
  let tooFar = 0;
  for (const b of state.buildings) {
    if (!b.production || !b.connected) continue;
    if (!servedByCarts(rules, b)) tooFar++;
    else if (b.production.status === 'yard_full') waiting++;
  }
  return {
    on: true,
    total: state.carts.length,
    out: state.carts.filter((c) => c.phase !== 'home').length,
    waiting, // producers waiting for a cart, their yard full
    tooFar,  // producers no cart can reach
  };
}

// For loading a saved game: the first thing wrong with the carts or the
// producers' yards, in words, or null.
export function cartsProblem(rules, state) {
  const isCount = (n) => Number.isInteger(n) && n >= 0;
  const amounts = (a) => a !== null && typeof a === 'object' && !Array.isArray(a)
    && Object.entries(a).every(([good, n]) => rules.goodIds.includes(good) && Number.isInteger(n) && n > 0);
  for (const b of state.buildings) {
    if (!b.production) continue;
    if (!amounts(b.production.yard)) return `building ${b.id} has a wrong yard`;
    const cap = rules.carts ? rules.carts.yard : 0;
    if (unitsIn(b.production.yard) > cap) return `building ${b.id} has more in its yard than it holds`;
    const store = b.production.store;
    if (!amounts(store)) return `building ${b.id} has a wrong store of materials`;
    const inputs = rules.buildings[b.type].production.inputs;
    for (const [good, n] of Object.entries(store)) {
      if (!(good in inputs)) return `building ${b.id} keeps ${good}, which it does not use`;
      if (!rules.materials || n > rules.materials.store) return `building ${b.id} keeps more ${good} than its store holds`;
    }
  }
  if (!Array.isArray(state.carts)) return 'the carts are missing';
  const ids = new Map(state.buildings.map((b) => [b.id, b]));
  const count = new Map();
  for (const c of state.carts) {
    if (c === null || typeof c !== 'object') return 'a cart is not a cart';
    const home = ids.get(c.home);
    if (!home || rules.buildings[home.type].category !== 'storage') return 'a cart belongs to no warehouse';
    count.set(c.home, (count.get(c.home) ?? 0) + 1);
    if (!CART_PHASES.includes(c.phase)) return 'a cart is doing something unknown';
    if (!isCount(c.trip) || !isCount(c.left) || c.left > c.trip) return 'a cart has a wrong journey time';
    if (!amounts(c.load) || unitsIn(c.load) > (rules.carts?.load ?? 0)) return 'a cart carries a wrong load';
    if (c.target !== null && !ids.get(c.target)?.production) return 'a cart is going to something that is not a producer';
    if (c.phase === 'home' && (c.target !== null || c.trip !== 0 || c.left !== 0 || unitsIn(c.load) !== 0)) return 'a cart at home is not at rest';
    if (c.phase === 'back' && c.left === 0) return 'a cart has arrived but not unloaded';
    if (c.phase === 'out' && c.target === null) return 'a cart on its way out is going nowhere';
    if (c.phase === 'out' && unitsIn(c.load) > 0) {
      // On its way out a cart carries only materials for the workshop it is going to.
      const inputs = rules.buildings[ids.get(c.target).type].production.inputs;
      if (!rules.materials || !Object.keys(c.load).every((good) => good in inputs)) return 'a cart on its way out carries something its workshop does not use';
    }
  }
  for (const b of state.buildings) {
    const want = rules.carts ? rules.buildings[b.type].carts : 0;
    if ((count.get(b.id) ?? 0) !== want) return `warehouse ${b.id} has the wrong number of carts`;
  }
  return null;
}
