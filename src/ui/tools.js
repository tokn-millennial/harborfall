// What the build, road and demolish tools would do at a given spot.
// These only read the game, through the same checks the commands use, so the
// preview always agrees with what a click will do. Tested in Node.

import { buildingAt, canPlace, canUpgrade, inMarketRange, siteReason } from '../sim/index.js';
import { MILLI } from '../sim/rules.js';

// An L-shaped line of tiles from A to B: along the longer side first.
// `flip` puts the corner on the other side (the shorter side first).
export function roadLine(ax, ay, bx, by, flip = false) {
  const tiles = [];
  const sx = Math.sign(bx - ax);
  const sy = Math.sign(by - ay);
  if (Math.abs(bx - ax) >= Math.abs(by - ay) !== flip) {
    for (let x = ax; ; x += sx) {
      tiles.push([x, ay]);
      if (x === bx) break;
    }
    for (let y = ay; y !== by;) {
      y += sy;
      tiles.push([bx, y]);
    }
  } else {
    for (let y = ay; ; y += sy) {
      tiles.push([ax, y]);
      if (y === by) break;
    }
    for (let x = ax; x !== bx;) {
      x += sx;
      tiles.push([x, by]);
    }
  }
  return tiles;
}

// Where a building's top-left tile goes so the building is centred on the
// pointer. (gx, gy) is the fractional ground position under the pointer.
export function anchorFor(def, gx, gy) {
  return { x: Math.round(gx - def.w / 2), y: Math.round(gy - def.h / 2) };
}

// Preview of placing `building` with its top-left tile at (x, y).
//   ok       a click here will place it
//   reason   why not, as a code (site problems first, then cost)
//   siteOk   the site itself is fine, whatever the cost
//   hints    things that are legal but probably a mistake
export function previewBuild(game, building, x, y) {
  const { rules } = game;
  const def = rules.buildings[building];
  const site = siteReason(game, building, x, y);
  const check = site ? { ok: false, reason: site } : canPlace(game, building, x, y);
  const hints = [];
  if (!site && def.housingTier && !inMarketRange(game, x, y, def.w, def.h)) hints.push('no_market');
  return { building, x, y, w: def.w, h: def.h, ok: check.ok, reason: check.ok ? null : check.reason, siteOk: !site, hints };
}

// Preview of laying road on a list of tiles, in order.
// Each tile is 'new' (will be built), 'existing' (already road, free),
// 'bad' (cannot take a road) or 'unaffordable' (coins run out before it).
export function previewRoad(game, tiles) {
  const { rules, state } = game;
  const map = state.map;
  const price = rules.buildings.road.cost.coinsMilli;
  let budget = price > 0 ? Math.floor(state.coinsMilli / price) : Infinity;
  const out = [];
  let newCount = 0;
  let firstProblem = null;
  for (const [x, y] of tiles) {
    const onMap = x >= 0 && y >= 0 && x < map.width && y < map.height;
    if (onMap && state.roads[y * map.width + x]) {
      out.push({ x, y, state: 'existing' });
      continue;
    }
    const reason = siteReason(game, 'road', x, y);
    if (reason) {
      out.push({ x, y, state: 'bad', reason });
      firstProblem ??= reason;
    } else if (budget <= 0) {
      out.push({ x, y, state: 'unaffordable', reason: 'not_enough_coins' });
      firstProblem ??= 'not_enough_coins';
    } else {
      out.push({ x, y, state: 'new' });
      budget--;
      newCount++;
    }
  }
  return { tiles: out, newCount, costCoins: (newCount * price) / MILLI, reason: firstProblem };
}

// What a demolish click at ground tile (x, y) would remove.
// `pointed` is the building under the pointer, if any (a roof counts).
export function previewDemolish(game, x, y, pointed = null) {
  const { rules, state } = game;
  const map = state.map;
  const building = pointed ?? buildingAt(game, x, y);
  if (building) {
    const def = rules.buildings[building.type];
    const last = def.category === 'storage' && state.buildings.filter((b) => rules.buildings[b.type].category === 'storage').length === 1;
    return { kind: 'building', building, x: building.x, y: building.y, w: def.w, h: def.h, ok: !last, reason: last ? 'last_warehouse' : null };
  }
  const onMap = x >= 0 && y >= 0 && x < map.width && y < map.height;
  if (onMap && state.roads[y * map.width + x]) return { kind: 'road', x, y, w: 1, h: 1, ok: true, reason: null };
  return { kind: 'none', x, y, w: 1, h: 1, ok: false, reason: 'nothing_here' };
}

// The tiles a building's range covers, for drawing: a market's supply radius
// or the radius of a "needs terrain nearby" rule. Empty if it has neither.
export function rangeTiles(game, building, x, y) {
  const { rules, state } = game;
  const def = rules.buildings[building];
  const radius = def.marketRadius > 0 ? def.marketRadius : def.placement?.terrainInRadius?.radius ?? 0;
  if (radius <= 0) return [];
  const only = def.marketRadius > 0 ? null : def.placement.terrainInRadius.terrain;
  const cx = x + def.w / 2;
  const cy = y + def.h / 2;
  const map = state.map;
  const tiles = [];
  for (let ty = Math.floor(cy - radius); ty <= Math.ceil(cy + radius); ty++) {
    for (let tx = Math.floor(cx - radius); tx <= Math.ceil(cx + radius); tx++) {
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
      const dx = tx + 0.5 - cx;
      const dy = ty + 0.5 - cy;
      if (dx * dx + dy * dy > radius * radius) continue;
      if (only && map.terrain[ty * map.width + tx] !== only) continue;
      tiles.push([tx, ty]);
    }
  }
  return tiles;
}

// The terrain a building's placement rule points at ("fertile" for a farm,
// "coast" for a fisherman), or null if it can go on any buildable ground.
export function requiredTerrain(rules, building) {
  const rule = rules.buildings[building].placement;
  return rule?.footprintTerrain ?? rule?.adjacentTerrain ?? null;
}

// Every tile of one terrain. The map never changes, so callers may keep the result.
export function terrainTiles(game, terrain) {
  const map = game.state.map;
  const tiles = [];
  for (let i = 0; i < map.terrain.length; i++) {
    if (map.terrain[i] === terrain) tiles.push([i % map.width, Math.floor(i / map.width)]);
  }
  return tiles;
}

// What an upgrade click on `building` would do.
export function previewUpgrade(game, building) {
  if (!building?.house) return { kind: 'none', building: null, ok: false, reason: 'not_a_house', cost: null };
  const { rules } = game;
  const tier = rules.tiers[building.house.tier];
  const def = rules.buildings[building.type];
  const check = canUpgrade(game, building.id);
  return {
    kind: 'house', building, x: building.x, y: building.y, w: def.w, h: def.h,
    ok: check.ok, reason: check.ok ? null : check.reason,
    cost: tier.upgrade?.cost ?? null, to: tier.upgrade?.to ?? null,
  };
}
