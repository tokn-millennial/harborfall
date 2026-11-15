// Life on the map: people walking the roads, carts taking goods to a
// warehouse, a boat for every fisherman, and the trade ship at each harbour.
//
// This is decoration. It reads the game and never changes it, and nothing in
// the game depends on it: goods still move the instant they are made. The
// little figures only show what the game already knows.
//   - Walkers: more of them the more residents there are. About half are on
//              an errand: they walk the shortest way by road from their house
//              to a workshop or the market and go in. The rest stroll.
//   - Carts:   with the cart rule on (config.json, "carts"), these are the real
//              carts of the game, drawn where the game says they are. With it
//              off, one sets out for show when a producer finishes a batch.
//   - Boats:   out at sea while the fisherman is working, home when he is not.
//   - Ships:   sailing in as the trade ship's call comes due, tied up at the
//              harbour for a moment after it, then sailing away.
//
// It moves with game time, so it stops when the game is paused and hurries
// at 4x. There is no canvas code here, so it is tested in Node. Positions are
// in tiles: tile (3, 5) covers x 3 to 4 and y 5 to 6, and its middle is (3.5, 5.5).

const RESIDENTS_PER_WALKER = 5;
const MAX_WALKERS = 40;
const WALK_SPEED = 0.07;           // tiles per tick, so 0.7 tiles a second at 1x
const WALKER_LIFE_TICKS = [300, 1100];
const WALKER_SIDE_STEP = 0.2;      // how far from the middle of the road a walker keeps, in tiles
const SPAWN_CHANCE_PER_TICK = 0.25; // while there are fewer walkers than the town calls for
const ERRAND_SHARE = 0.5;          // of new walkers, the share with somewhere to go
const ERRAND_MIN_TILES = 4;        // a shorter errand is not worth showing
const ERRAND_TRIES = 3;            // places tried before a walker strolls instead

const MAX_CARTS = 14;
const CART_SPEED = 0.11;
const CART_REST_TICKS = 100;       // one producer sends at most one cart in this time
const CART_MIN_TILES = 3;          // shorter trips are not worth showing

const BOAT_REACH = 6;              // how far from the hut a boat goes, in tiles
const BOAT_OUT_UNTIL = 0.4;        // share of the work cycle spent rowing out
const BOAT_BACK_FROM = 0.6;        // and the share after which it rows home

const SHIP_REACH = 10;             // how far out the trade ship is first seen, in tiles
const SHIP_IN_TICKS = 200;         // it sails in over the last 20 game seconds before its call
const SHIP_STAY_TICKS = 80;        // stays tied up for 8 seconds after it
const SHIP_OUT_TICKS = 200;        // and takes 20 to sail away

// If the game jumps by more than this (a test stepping it directly), start afresh.
const MAX_CATCH_UP_TICKS = 600;

const NEAR = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// A small repeatable random source. The game's own is not used: this must not
// be able to disturb it.
function randomSource(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// `sea` gives the few things about islands and your ship that this layer may
// not work out for itself (it imports nothing): { islandAt, seaPath, shipHarbour }
// from src/sim/index.js. Without it, every harbour is on the home island and
// your ship is not drawn.
export function createLife(rules, seed = 7, sea = null) {
  let random = randomSource(seed);
  let watching = null;   // the game state this belongs to
  let lastTick = 0;
  let nextId = 1;
  let walkers = [];
  let carts = [];
  let cartRoutes = new Map();     // "warehouse>producer" -> the road tiles between them
  let routesFor = null;           // the roads those routes were worked out on
  let seen = new Map();          // producer id -> its work timer last time
  let cartSentAt = new Map();    // producer id -> tick its last cart left
  let boatWaters = new Map();    // fisherman id -> { home, out } or null
  let shipWaters = new Map();    // harbour id -> { home, out } or null
  const HOME = 0;
  const SECOND = 1;
  let ownRoute = null;           // { key, path }: the sea path of your own ship between its harbours
  let actors = [];
  let fresh = true;              // nothing has been shown yet for this game

  const isStorage = (type) => rules.buildings[type].category === 'storage';
  const hasBoat = (def) => Boolean(def.production) && def.placement?.adjacentTerrain !== undefined;

  function reset(state) {
    random = randomSource(seed);
    watching = state;
    lastTick = state.tick;
    nextId = 1;
    walkers = [];
    carts = [];
    seen = new Map();
    cartSentAt = new Map();
    boatWaters = new Map();
    shipWaters = new Map();
    ownRoute = null;
    cartRoutes = new Map();
    routesFor = null;
    fresh = true;
  }

  // ---- reading the map -----------------------------------------------------------
  const inside = (map, x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height;
  const isRoad = (state, x, y) => inside(state.map, x, y) && state.roads[y * state.map.width + x] === 1;
  const buildingIdAt = (state, x, y) => (inside(state.map, x, y) ? state.occupancy[y * state.map.width + x] : 0);
  const isWater = (map, x, y) => inside(map, x, y) && map.terrain[y * map.width + x] === 'water';
  const nextToBuilding = (state, x, y) => NEAR.some(([dx, dy]) => buildingIdAt(state, x + dx, y + dy) !== 0);

  // Road tiles touching a building's plot.
  function roadsBeside(state, building) {
    const def = rules.buildings[building.type];
    const tiles = [];
    for (let y = building.y; y < building.y + def.h; y++) {
      for (let x = building.x; x < building.x + def.w; x++) {
        for (const [dx, dy] of NEAR) {
          const tx = x + dx;
          const ty = y + dy;
          if (isRoad(state, tx, ty) && !tiles.some((t) => t[0] === tx && t[1] === ty)) tiles.push([tx, ty]);
        }
      }
    }
    return tiles;
  }

  function anyRoad(state) {
    const all = [];
    for (let i = 0; i < state.roads.length; i++) if (state.roads[i] === 1) all.push(i);
    if (all.length === 0) return null;
    const i = all[Math.floor(random() * all.length)];
    return [i % state.map.width, Math.floor(i / state.map.width)];
  }

  // ---- walkers -------------------------------------------------------------------
  // Where a walker standing on (x, y) and coming from (px, py) goes next: any
  // road onward, and back the way it came only at a dead end.
  function nextStep(state, x, y, px, py) {
    const onward = [];
    for (const [dx, dy] of NEAR) {
      const tx = x + dx;
      const ty = y + dy;
      if ((tx !== px || ty !== py) && isRoad(state, tx, ty)) onward.push([tx, ty]);
    }
    if (onward.length) return onward[Math.floor(random() * onward.length)];
    return isRoad(state, px, py) && (px !== x || py !== y) ? [px, py] : null;
  }

  // Somewhere for a walker leaving `house` from `start` to go: a road route
  // to a workshop or the market, or null to stroll instead.
  // A few places are tried, since some are out of reach or too close.
  function errandFrom(state, start, house, places) {
    if (places.length === 0 || random() >= ERRAND_SHARE) return null;
    for (let tries = 0; tries < ERRAND_TRIES; tries++) {
      const goal = places[Math.floor(random() * places.length)];
      if (house && goal.id === house.id) continue;
      const route = routeBetween(state, [start], new Set([goal.id]));
      if (route && route.length >= ERRAND_MIN_TILES) return route;
    }
    return null;
  }

  // Adds one walker. Returns whether it could.
  function addWalker(state, houses, anywhere, places = []) {
    let start = null;
    let tier = null;
    let home = null;
    if (houses.length) {
      // A walker normally steps out of a house that has a road at its door.
      // Starting from a random house, the first one with a road is used.
      const first = Math.floor(random() * houses.length);
      tier = houses[first].house.tier;
      // To fill an existing town at once, walkers are scattered over the roads instead.
      for (let i = 0; i < houses.length && !anywhere && !start; i++) {
        const house = houses[(first + i) % houses.length];
        const beside = roadsBeside(state, house);
        if (beside.length === 0) continue;
        start = beside[Math.floor(random() * beside.length)];
        tier = house.house.tier;
        home = house;
      }
    }
    start ??= anyRoad(state);
    if (!start) return false;
    // On an errand, the walker follows its route; to fill a town at once, it
    // is put somewhere along the way.
    const route = errandFrom(state, start, home, places);
    const at = route && anywhere ? Math.floor(random() * (route.length - 1)) : 0;
    const from = route ? route[at] : start;
    const to = route ? route[at + 1] : nextStep(state, start[0], start[1], start[0], start[1]);
    if (!to) return false; // a single road tile with nowhere to go
    const [lo, hi] = WALKER_LIFE_TICKS;
    walkers.push({
      id: nextId++,
      tier,
      route,
      routeAt: at,
      fromX: from[0], fromY: from[1], toX: to[0], toY: to[1],
      t: anywhere ? random() : 0,
      sideX: (random() * 2 - 1) * WALKER_SIDE_STEP,
      sideY: (random() * 2 - 1) * WALKER_SIDE_STEP,
      life: Math.round(lo + random() * (hi - lo)) * (anywhere ? random() : 1),
      steps: 0,
      look: Math.floor(random() * 1000),
    });
    return true;
  }

  // Moves one walker. Returns false when it has left the map.
  function moveWalker(state, w, ticks) {
    if (!isRoad(state, w.fromX, w.fromY) || !isRoad(state, w.toX, w.toY)) return false; // its road was removed
    w.life -= ticks;
    let left = ticks * WALK_SPEED;
    while (left > 0) {
      const toGo = 1 - w.t;
      if (left < toGo) {
        w.t += left;
        break;
      }
      left -= toGo;
      w.steps++;
      // Arrived at the next tile. A walker whose time is up goes indoors at the first building it passes.
      if (w.life <= 0 && (nextToBuilding(state, w.toX, w.toY) || w.life < -MAX_CATCH_UP_TICKS)) return false;
      let next;
      if (w.route) {
        // On an errand: the next tile of the route, and in at the end of it.
        w.routeAt++;
        if (w.routeAt >= w.route.length - 1) return false;
        next = w.route[w.routeAt + 1];
        if (!isRoad(state, next[0], next[1])) return false;
      } else {
        next = nextStep(state, w.toX, w.toY, w.fromX, w.fromY);
      }
      if (!next) return false;
      w.fromX = w.toX;
      w.fromY = w.toY;
      w.toX = next[0];
      w.toY = next[1];
      w.t = 0;
    }
    return true;
  }

  // ---- routes --------------------------------------------------------------------
  // The shortest way by road from any of the `starts` tiles to a road tile
  // beside one of the buildings in `goalIds`, as a list of tiles, or null.
  function routeBetween(state, starts, goalIds) {
    const { width, height } = state.map;
    const cameFrom = new Int32Array(width * height).fill(-2);
    const queue = [];
    for (const [x, y] of starts) {
      cameFrom[y * width + x] = -1;
      queue.push(y * width + x);
    }
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head];
      const x = at % width;
      const y = Math.floor(at / width);
      if (NEAR.some(([dx, dy]) => goalIds.has(buildingIdAt(state, x + dx, y + dy)))) {
        const route = [];
        for (let i = at; i !== -1; i = cameFrom[i]) route.push([i % width, Math.floor(i / width)]);
        return route.reverse();
      }
      for (const [dx, dy] of NEAR) {
        const tx = x + dx;
        const ty = y + dy;
        if (!isRoad(state, tx, ty) || cameFrom[ty * width + tx] !== -2) continue;
        cameFrom[ty * width + tx] = at;
        queue.push(ty * width + tx);
      }
    }
    return null;
  }

  // ---- carts ---------------------------------------------------------------------
  // The shortest way by road from a producer to a warehouse, as a list of tiles.
  const routeToStorage = (state, building, storageIds) => routeBetween(state, roadsBeside(state, building), storageIds);

  function moveCart(state, cart, ticks) {
    let left = ticks * CART_SPEED;
    while (left > 0) {
      const next = cart.route[cart.at + 1];
      if (!next || !isRoad(state, next[0], next[1]) || !isRoad(state, cart.route[cart.at][0], cart.route[cart.at][1])) return false;
      const toGo = 1 - cart.t;
      if (left < toGo) {
        cart.t += left;
        break;
      }
      left -= toGo;
      cart.at++;
      cart.t = 0;
      if (cart.at >= cart.route.length - 1) return false; // delivered
    }
    return true;
  }

  // ---- boats ---------------------------------------------------------------------
  // Where a fisherman's boat is kept and where it fishes: the nearest water,
  // and the farthest open water it can row to in a straight line.
  function findWaters(map, building, reach = BOAT_REACH) {
    const def = rules.buildings[building.type];
    const cx = building.x + def.w / 2;
    const cy = building.y + def.h / 2;
    const waters = [];
    for (let y = Math.floor(cy) - reach; y <= Math.floor(cy) + reach; y++) {
      for (let x = Math.floor(cx) - reach; x <= Math.floor(cx) + reach; x++) {
        if (!isWater(map, x, y)) continue;
        const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (distance <= reach) waters.push({ x: x + 0.5, y: y + 0.5, distance });
      }
    }
    if (waters.length === 0) return null;
    waters.sort((a, b) => a.distance - b.distance || a.x - b.x || a.y - b.y);
    const home = waters[0];
    const clearRun = (to) => {
      const steps = Math.ceil(Math.hypot(to.x - home.x, to.y - home.y) * 3);
      for (let i = 1; i <= steps; i++) {
        const x = home.x + ((to.x - home.x) * i) / steps;
        const y = home.y + ((to.y - home.y) * i) / steps;
        if (!isWater(map, Math.floor(x), Math.floor(y))) return false;
      }
      return true;
    };
    let out = home;
    for (let i = waters.length - 1; i > 0; i--) {
      if (clearRun(waters[i])) {
        out = waters[i];
        break;
      }
    }
    return { home: { x: home.x, y: home.y }, out: { x: out.x, y: out.y } };
  }

  const ease = (t) => t * t * (3 - 2 * t);

  // ---- the real carts ------------------------------------------------------------
  // A short fingerprint of the roads and buildings, so routes are worked out
  // again only when either changes.
  function roadsKey(state) {
    let h = state.buildings.length;
    for (let i = 0; i < state.roads.length; i++) if (state.roads[i] === 1) h = (Math.imul(h, 31) + i + 1) >>> 0;
    return h;
  }

  // A cart on its trip goes along the shortest road between its warehouse and
  // the producer, the share of the way the game says it has come.
  function realCarts(state) {
    const key = roadsKey(state);
    if (key !== routesFor) {
      cartRoutes = new Map();
      routesFor = key;
    }
    const byId = new Map(state.buildings.map((b) => [b.id, b]));
    const shown = [];
    state.carts.forEach((c, index) => {
      if (c.phase === 'home' || c.target === null || c.trip === 0) return;
      const producer = byId.get(c.target);
      if (!producer) return;
      const routeKey = `${c.home}>${c.target}`;
      if (!cartRoutes.has(routeKey)) cartRoutes.set(routeKey, routeToStorage(state, producer, new Set([c.home])));
      const route = cartRoutes.get(routeKey);
      if (!route || route.length === 0) return;
      // route[0] is beside the producer and the last tile beside the warehouse.
      const last = route.length - 1;
      const done = 1 - c.left / c.trip; // 0 just set off, 1 arrived
      const at = c.phase === 'out' ? last * (1 - done) : last * done;
      const i0 = Math.min(last, Math.floor(at));
      const i1 = Math.min(last, i0 + 1);
      const t = at - i0;
      const [ax, ay] = route[i0];
      const [bx, by] = route[i1];
      // Heading: towards the producer on the way out, towards the warehouse on the way back.
      const [px, py] = route[Math.max(0, i1 - 1)];
      const [qx, qy] = route[i1];
      const sign = c.phase === 'out' ? -1 : 1;
      const good = rules.goodIds.find((g) => (c.load[g] ?? 0) > 0) ?? null;
      shown.push({
        kind: 'cart', id: `cart-${c.home}-${index}`, good, look: c.home * 7 + index,
        x: ax + (bx - ax) * t + 0.5, y: ay + (by - ay) * t + 0.5,
        dx: (qx - px) * sign, dy: (qy - py) * sign,
        stride: (c.trip - c.left) / rules.carts.ticksPerTile,
      });
    });
    return shown;
  }

  // ---- one update ----------------------------------------------------------------
  // Brings everything up to the game's current time and returns what to draw.
  function update(game) {
    const state = game.state;
    if (state !== watching || state.tick < lastTick || state.tick - lastTick > MAX_CATCH_UP_TICKS) reset(state);
    const ticks = state.tick - lastTick;
    lastTick = state.tick;

    let residents = 0;
    const houses = [];
    const producers = [];
    const storageIds = new Set();
    const places = []; // where errands go: workshops and markets
    for (const b of state.buildings) {
      if (b.production || rules.buildings[b.type].category === 'market') places.push(b);
      if (b.house && b.house.residents > 0) {
        residents += b.house.residents;
        houses.push(b);
      }
      if (b.production) producers.push(b);
      if (isStorage(b.type)) storageIds.add(b.id);
    }

    // Walkers.
    if (ticks > 0) walkers = walkers.filter((w) => moveWalker(state, w, ticks));
    else walkers = walkers.filter((w) => isRoad(state, w.fromX, w.fromY) && isRoad(state, w.toX, w.toY));
    const wanted = Math.min(MAX_WALKERS, Math.floor(residents / RESIDENTS_PER_WALKER));
    if (fresh) {
      // A town that already has people (a loaded game) is filled at once.
      for (let tries = wanted * 4; tries > 0 && walkers.length < wanted; tries--) addWalker(state, houses, true, places);
      fresh = false;
    } else if (walkers.length < wanted && ticks > 0 && random() < SPAWN_CHANCE_PER_TICK * ticks) {
      addWalker(state, houses, false, places);
    }
    // Too many (people moved out): the extra ones head indoors.
    for (let i = wanted; i < walkers.length; i++) walkers[i].life = Math.min(walkers[i].life, 0);

    // Carts for show, when the game has no real ones: a producer whose work
    // timer has dropped back has just delivered.
    const nowSeen = new Map();
    for (const b of rules.carts ? [] : producers) {
      const progress = b.production.progress;
      const before = seen.get(b.id);
      nowSeen.set(b.id, progress);
      if (before === undefined || progress >= before || !b.connected || carts.length >= MAX_CARTS) continue;
      if (state.tick - (cartSentAt.get(b.id) ?? -Infinity) < CART_REST_TICKS) continue;
      const route = routeToStorage(state, b, storageIds);
      if (!route || route.length < CART_MIN_TILES) continue;
      cartSentAt.set(b.id, state.tick);
      const good = Object.keys(rules.buildings[b.type].production.outputs)[0];
      carts.push({ id: nextId++, route, at: 0, t: 0, good, look: Math.floor(random() * 1000) });
    }
    seen = nowSeen;
    if (ticks > 0) carts = carts.filter((c) => moveCart(state, c, ticks));
    else carts = carts.filter((c) => c.route.slice(c.at, c.at + 2).every(([x, y]) => isRoad(state, x, y)));

    // What to draw.
    actors = [];
    for (const w of walkers) {
      actors.push({
        kind: 'walker', id: w.id, tier: w.tier, look: w.look, errand: w.route !== null,
        x: w.fromX + (w.toX - w.fromX) * w.t + 0.5 + w.sideX,
        y: w.fromY + (w.toY - w.fromY) * w.t + 0.5 + w.sideY,
        dx: w.toX - w.fromX, dy: w.toY - w.fromY,
        stride: w.steps + w.t,
      });
    }
    for (const c of carts) {
      const [ax, ay] = c.route[c.at];
      const [bx, by] = c.route[c.at + 1];
      actors.push({
        kind: 'cart', id: c.id, good: c.good, look: c.look,
        x: ax + (bx - ax) * c.t + 0.5, y: ay + (by - ay) * c.t + 0.5,
        dx: bx - ax, dy: by - ay,
        stride: c.at + c.t,
      });
    }
    const boatsNow = new Map();
    for (const b of producers) {
      const def = rules.buildings[b.type];
      if (!hasBoat(def)) continue;
      const waters = boatWaters.has(b.id) ? boatWaters.get(b.id) : findWaters(state.map, b);
      boatsNow.set(b.id, waters);
      if (!waters) continue;
      const p = b.production;
      const share = b.connected && p.active && p.status === 'working' ? p.progress / def.production.cycleTicks : 0;
      let out = 0; // 0 at home, 1 at the fishing spot
      if (share > 0 && share < BOAT_OUT_UNTIL) out = ease(share / BOAT_OUT_UNTIL);
      else if (share >= BOAT_OUT_UNTIL && share <= BOAT_BACK_FROM) out = 1;
      else if (share > BOAT_BACK_FROM) out = ease((1 - share) / (1 - BOAT_BACK_FROM));
      actors.push({
        kind: 'boat', id: b.id, look: b.id,
        x: waters.home.x + (waters.out.x - waters.home.x) * out,
        y: waters.home.y + (waters.out.y - waters.home.y) * out,
        dx: (waters.out.x - waters.home.x) * (share > BOAT_BACK_FROM ? -1 : 1),
        dy: (waters.out.y - waters.home.y) * (share > BOAT_BACK_FROM ? -1 : 1),
        fishing: out === 1,
        manned: share > 0,
      });
    }
    boatWaters = boatsNow;

    // The real carts, each where the game says it is on its trip.
    if (rules.carts && state.carts) actors.push(...realCarts(state));

    // The trade ship: worked out from the ship's own timer and its last call,
    // so it is always in step with the game and needs nothing remembered.
    const shipsNow = new Map();
    if (rules.trade && state.trade) {
      const due = rules.trade.shipTicks;
      const inTicks = Math.min(SHIP_IN_TICKS, Math.floor(due / 3));
      const since = state.trade.last ? state.tick - state.trade.last.tick : Infinity;
      let out = null; // 0 tied up, 1 far out at sea, null not to be seen
      let leaving = false;
      if (since < SHIP_STAY_TICKS) out = 0;
      else if (since < SHIP_STAY_TICKS + SHIP_OUT_TICKS) {
        out = ease((since - SHIP_STAY_TICKS) / SHIP_OUT_TICKS);
        leaving = true;
      } else if (state.trade.timer >= due - inTicks) out = 1 - ease((state.trade.timer - (due - inTicks)) / inTicks);
      for (const b of state.buildings) {
        if (!rules.buildings[b.type].harbor) continue;
        if (sea && sea.islandAt(state.map, b.x, b.y) !== HOME) continue; // the trade ship calls at the home island only
        const waters = shipWaters.has(b.id) ? shipWaters.get(b.id) : findWaters(state.map, b, SHIP_REACH);
        shipsNow.set(b.id, waters);
        if (!waters || out === null || !b.connected) continue;
        const sign = leaving ? 1 : -1;
        actors.push({
          kind: 'ship', id: b.id, look: b.id,
          x: waters.home.x + (waters.out.x - waters.home.x) * out,
          y: waters.home.y + (waters.out.y - waters.home.y) * out,
          dx: (waters.out.x - waters.home.x) * sign,
          dy: (waters.out.y - waters.home.y) * sign,
          docked: out === 0,
        });
      }
    }
    shipWaters = shipsNow;

    // Your own ship, where the game says it is on the crossing.
    if (sea && rules.fleet && state.ship && state.ship.trip > 0) {
      const home = sea.shipHarbour(game, HOME);
      const second = sea.shipHarbour(game, SECOND);
      const key = `${home?.id}>${second?.id}`;
      if (!ownRoute || ownRoute.key !== key || ownRoute.map !== state.map) ownRoute = { key, map: state.map, path: home && second ? sea.seaPath(game, home, second) : null };
      const path = ownRoute.path;
      if (path && path.length > 0) {
        const s = state.ship;
        // Share of the way from home to the second island: 0 at home, 1 there.
        let share;
        if (s.phase === 'sailing') {
          const done = s.trip > 0 ? 1 - s.left / s.trip : 1;
          share = s.at === SECOND ? done : 1 - done;
        } else share = s.at === SECOND ? 1 : 0;
        const along = share * (path.length - 1);
        const i = Math.min(path.length - 2, Math.floor(along));
        const a = path[Math.max(0, i)];
        const b = path[Math.min(path.length - 1, Math.max(0, i) + 1)];
        const f = path.length > 1 ? along - Math.max(0, i) : 0;
        const towardSecond = s.phase === 'sailing' ? s.at === SECOND : s.at === HOME;
        const sign = towardSecond ? 1 : -1;
        actors.push({
          kind: 'ship', own: true, id: 'own', look: 7,
          x: a[0] + 0.5 + (b[0] - a[0]) * f,
          y: a[1] + 0.5 + (b[1] - a[1]) * f,
          dx: (b[0] - a[0]) * sign || 1,
          dy: (b[1] - a[1]) * sign,
          docked: s.phase !== 'sailing',
        });
      }
    }
    return actors;
  }

  return {
    update,
    get actors() {
      return actors;
    },
  };
}
