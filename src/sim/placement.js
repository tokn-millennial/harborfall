// Can this building go here? Answers with a short reason code when it cannot.

import { footprint, footprintCenter, inBounds, perimeter, terrainAt, tileIndex, tilesInRadius } from './grid.js';
import { affordReason } from './economy.js';

// Checks the site only (terrain, overlap, placement rules). Ignores cost.
// Returns null when the site is fine, otherwise a reason code.
export function siteReason(game, type, x, y) {
  const { rules, state } = game;
  const def = rules.buildings[type];
  if (!def) return 'unknown_building';
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'out_of_bounds';

  const map = state.map;
  const tiles = footprint(x, y, def.w, def.h);
  if (!tiles.every(([tx, ty]) => inBounds(map, tx, ty))) return 'out_of_bounds';
  if (!tiles.every(([tx, ty]) => rules.map.terrain[terrainAt(map, tx, ty)].buildable)) return 'not_buildable';
  for (const [tx, ty] of tiles) {
    const i = tileIndex(map, tx, ty);
    if (state.occupancy[i] !== 0 || state.roads[i] !== 0) return 'blocked';
  }

  const rule = def.placement;
  if (rule) {
    if (rule.footprintTerrain && !tiles.every(([tx, ty]) => terrainAt(map, tx, ty) === rule.footprintTerrain)) {
      return `needs_${rule.footprintTerrain}`;
    }
    if (rule.adjacentTerrain) {
      const touching = perimeter(x, y, def.w, def.h).some(([tx, ty]) => terrainAt(map, tx, ty) === rule.adjacentTerrain);
      if (!touching) return `needs_${rule.adjacentTerrain}`;
    }
    if (rule.terrainInRadius) {
      const { terrain, radius, minTiles } = rule.terrainInRadius;
      if (countTerrainInRadius(map, def, x, y, terrain, radius) < minTiles) return `needs_${terrain}`;
    }
  }
  return null;
}

export function countTerrainInRadius(map, def, x, y, terrain, radius) {
  const [cx, cy] = footprintCenter(x, y, def.w, def.h);
  let n = 0;
  for (const [tx, ty] of tilesInRadius(map, cx, cy, radius)) {
    if (terrainAt(map, tx, ty) === terrain) n++;
  }
  return n;
}

// Site and cost together. Never changes the game.
export function canPlace(game, type, x, y) {
  const site = siteReason(game, type, x, y);
  if (site) return { ok: false, reason: site };
  const cost = affordReason(game, game.rules.buildings[type].cost);
  if (cost) return { ok: false, reason: cost };
  return { ok: true };
}
