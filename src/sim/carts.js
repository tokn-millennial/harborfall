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
// Only finished goods travel. Materials a workshop uses still come straight
// from the stockpile, and houses still buy from markets as before.

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
      // At the producer: load as much as the cart takes, in the order goods are listed.
      const yard = byId.get(c.target)?.production?.yard;
      let room = rules.carts.load;
      for (const good of rules.goodIds) {
        const take = Math.min(room, yard?.[good] ?? 0);
        if (take <= 0) continue;
        change(yard, good, -take);
        change(c.load, good, take);
        room -= take;
      }
      c.phase = 'back';
      c.left = c.trip;
      continue;
    }
    // Home: unload into the stockpile. What does not fit is lost.
    for (const good of rules.goodIds) {
      const n = c.load[good] ?? 0;
      if (n > 0) state.goods[good] += Math.min(n, Math.max(0, state.storageCap - state.goods[good]));
    }
    c.load = {};
    c.phase = 'home';
    c.target = null;
    c.trip = 0;
  }

  // Send idle carts out. The fullest yard is collected first, then the nearest.
  if (!state.carts.some((c) => c.phase === 'home')) return;
  // What is already on its way to the stockpile, or soon will be.
  const targeted = new Set();
  const coming = {};
  for (const c of state.carts) {
    for (const [good, n] of Object.entries(c.load)) coming[good] = (coming[good] ?? 0) + n;
    if (c.phase !== 'out') continue;
    targeted.add(c.target);
    const yard = byId.get(c.target)?.production?.yard ?? {};
    for (const [good, n] of Object.entries(yard)) coming[good] = (coming[good] ?? 0) + Math.min(n, rules.carts.load);
  }
  const room = (good) => state.goods[good] + (coming[good] ?? 0) < state.storageCap;
  const waiting = [];
  for (const b of state.buildings) {
    const p = b.production;
    if (!p || targeted.has(b.id) || !servedByCarts(rules, b)) continue;
    const units = unitsIn(p.yard);
    if (units > 0 && Object.keys(p.yard).every(room)) waiting.push({ b, units });
  }
  if (waiting.length === 0) return;
  waiting.sort((a, z) => z.units - a.units || a.b.production.haul.tiles - z.b.production.haul.tiles || a.b.id - z.b.id);
  for (const { b } of waiting) {
    const cart = state.carts.find((c) => c.phase === 'home' && c.home === b.production.haul.from);
    if (!cart) continue;
    // Room may have run out with the carts sent so far this tick.
    if (!Object.keys(b.production.yard).every(room)) continue;
    for (const [good, n] of Object.entries(b.production.yard)) coming[good] = (coming[good] ?? 0) + Math.min(n, rules.carts.load);
    cart.phase = 'out';
    cart.target = b.id;
    cart.trip = b.production.haul.tiles * rules.carts.ticksPerTile;
    cart.left = cart.trip;
  }
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
    if (c.phase === 'out' && (c.target === null || unitsIn(c.load) !== 0)) return 'a cart on its way out is wrong';
  }
  for (const b of state.buildings) {
    const want = rules.carts ? rules.buildings[b.type].carts : 0;
    if ((count.get(b.id) ?? 0) !== want) return `warehouse ${b.id} has the wrong number of carts`;
  }
  return null;
}
