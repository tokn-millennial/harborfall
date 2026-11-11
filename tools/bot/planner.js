// The bot's eyes: where to put a building, and which road tiles join it up.
//
// The bot lays its town out on a simple pattern so it never walls itself in:
// buildings sit in 2x2 cells, and every third row and column is kept clear as
// a lane for roads. The pattern is anchored on the starting warehouse.
//
// The planner only reads the game. It uses the same public checks a player's
// mouse would (siteReason), so it cannot cheat.

import { siteReason } from '../../src/sim/index.js';

const CELL = 3; // a 2-tile building cell plus a 1-tile lane
const OFF_LANE_COST = 4; // a road tile off the lanes is allowed but discouraged
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const mod = (n, m) => ((n % m) + m) % m;

export function createPlanner(game) {
  const { rules, state } = game;
  const { width: W, height: H } = state.map;
  const origin = state.buildings.find((b) => rules.buildings[b.type].category === 'storage');
  if (!origin) throw new Error('The bot needs a starting warehouse to anchor its layout');
  const ox = origin.x;
  const oy = origin.y;

  const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const isLane = (x, y) => mod(x - ox, CELL) === 2 || mod(y - oy, CELL) === 2;
  const edgeTiles = (x, y, w, h) => {
    const tiles = [];
    for (let dx = 0; dx < w; dx++) tiles.push([x + dx, y - 1], [x + dx, y + h]);
    for (let dy = 0; dy < h; dy++) tiles.push([x - 1, y + dy], [x + w, y + dy]);
    return tiles.filter(([tx, ty]) => inMap(tx, ty));
  };

  // Cheapest road route from the existing network to every tile.
  // Existing road is free, a new lane tile costs 1, a new off-lane tile costs more.
  function roadField() {
    const dist = new Array(W * H).fill(Infinity);
    const prev = new Array(W * H).fill(-1);
    const buckets = [];
    const tileCost = (x, y) => {
      if (state.roads[y * W + x]) return 0;
      if (siteReason(game, 'road', x, y) !== null) return Infinity;
      return isLane(x, y) ? 1 : OFF_LANE_COST;
    };
    const offer = (x, y, base, from) => {
      const cost = tileCost(x, y);
      if (cost === Infinity) return;
      const i = y * W + x;
      const d = base + cost;
      if (d < dist[i]) {
        dist[i] = d;
        prev[i] = from;
        (buckets[d] ??= []).push(i);
      }
    };
    for (const b of state.buildings) {
      const def = rules.buildings[b.type];
      if (def.category !== 'storage') continue;
      for (const [x, y] of edgeTiles(b.x, b.y, def.w, def.h)) offer(x, y, 0, -1);
    }
    for (let d = 0; d < buckets.length; d++) {
      const bucket = buckets[d];
      if (!bucket) continue;
      for (let k = 0; k < bucket.length; k++) {
        const i = bucket[k];
        if (dist[i] !== d) continue;
        const x = i % W;
        const y = (i - x) / W;
        for (const [dx, dy] of DIRS4) if (inMap(x + dx, y + dy)) offer(x + dx, y + dy, d, i);
      }
    }
    return { dist, prev };
  }

  // The new road tiles needed to reach tile index `i`, nearest the network first.
  function routeTo(field, i) {
    const tiles = [];
    for (let at = i; at !== -1; at = field.prev[at]) {
      if (!state.roads[at]) tiles.push([at % W, Math.floor(at / W)]);
    }
    return tiles.reverse();
  }

  function connectedMarkets() {
    const markets = [];
    for (const b of state.buildings) {
      const def = rules.buildings[b.type];
      if (def.marketRadius > 0 && b.connected) markets.push({ cx: b.x + def.w / 2, cy: b.y + def.h / 2, radius: def.marketRadius });
    }
    return markets;
  }
  const inRange = (m, x, y, w, h) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const ex = x + dx + 0.5 - m.cx;
        const ey = y + dy + 0.5 - m.cy;
        if (ex * ex + ey * ey <= m.radius * m.radius) return true;
      }
    }
    return false;
  };

  // Every free spot on the bot's pattern where this building is allowed.
  function candidateSites(type) {
    const def = rules.buildings[type];
    // Buildings tied to terrain (forest, coast, fertile land) have few legal
    // spots, so they may go anywhere. Everything else keeps to the pattern.
    const free = def.placement !== null;
    const sites = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!free && (mod(x - ox, CELL) !== 0 || mod(y - oy, CELL) !== 0)) continue;
        if (siteReason(game, type, x, y) === null) sites.push([x, y]);
      }
    }
    return sites;
  }

  // Picks a site for `type`. Returns { x, y, roads } or { reason } when there is none.
  function plan(type) {
    const def = rules.buildings[type];
    if (!def) return { reason: 'unknown_building' };
    if (def.w > 2 || def.h > 2) return { reason: 'too_big_for_the_bot_layout' };
    const sites = candidateSites(type);
    if (sites.length === 0) return { reason: 'no_site' };
    const distToOrigin = ([x, y]) => Math.hypot(x - ox, y - oy);

    // Houses need a market in range, not a road.
    if (def.category === 'house') {
      const markets = connectedMarkets();
      let best = null;
      for (const [x, y] of sites) {
        let nearest = Infinity;
        for (const m of markets) {
          if (inRange(m, x, y, def.w, def.h)) nearest = Math.min(nearest, Math.hypot(x + def.w / 2 - m.cx, y + def.h / 2 - m.cy));
        }
        if (nearest < (best?.score ?? Infinity)) best = { x, y, score: nearest };
      }
      return best ? { x: best.x, y: best.y, roads: [] } : { reason: 'no_site_in_market_range' };
    }

    if (!def.requiresRoad) {
      const [x, y] = sites.reduce((a, b) => (distToOrigin(b) < distToOrigin(a) ? b : a));
      return { x, y, roads: [] };
    }

    const field = roadField();
    // For a market, count the house sites it would newly cover.
    let houseSites = null;
    let markets = null;
    if (def.marketRadius > 0) {
      const house = Object.values(rules.buildings).find((b) => b.category === 'house');
      markets = connectedMarkets();
      houseSites = candidateSites(house.id)
        .filter(([hx, hy]) => !markets.some((m) => inRange(m, hx, hy, house.w, house.h)))
        .map(([hx, hy]) => ({ hx, hy, w: house.w, h: house.h }));
    }

    let best = null;
    for (const [x, y] of sites) {
      let roadCost = Infinity;
      let entry = -1;
      for (const [ex, ey] of edgeTiles(x, y, def.w, def.h)) {
        const i = ey * W + ex;
        if (field.dist[i] < roadCost) {
          roadCost = field.dist[i];
          entry = i;
        }
      }
      if (entry === -1) continue;
      let score = roadCost + distToOrigin([x, y]) * 0.01;
      if (houseSites) {
        const m = { cx: x + def.w / 2, cy: y + def.h / 2, radius: def.marketRadius };
        const covered = houseSites.filter((s) => inRange(m, s.hx, s.hy, s.w, s.h)).length;
        score = roadCost * 2 - covered;
      }
      if (!best || score < best.score) best = { x, y, score, entry };
    }
    if (!best) return { reason: 'no_site_reachable_by_road' };
    return { x: best.x, y: best.y, roads: routeTo(field, best.entry) };
  }

  return { plan, candidateSites };
}
