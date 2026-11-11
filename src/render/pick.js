// Tile picking: what is under a point on the screen?
// Pure math over the game state, so it is tested in Node.

import { boxSilhouette, depthOf, pointInPolygon } from './iso.js';
import { screenToTile, screenToWorld } from './camera.js';
import { buildingVisual } from './visuals.js';

// Returns:
//   tile      the ground tile under the point, { x, y }, even if off the map
//   onMap     whether that tile is on the map
//   building  the building the pointer is over, or null
//
// Buildings are drawn as boxes that stand up from the ground, so a box can
// cover the tiles behind it. If the point is on a drawn box, that building
// wins, and the nearest box wins if several overlap. Otherwise it is whatever
// stands on the ground tile.
export function pick(game, camera, view, sx, sy) {
  const { rules, state } = game;
  const map = state.map;
  const ground = screenToTile(camera, view, sx, sy);
  const tile = { x: Math.floor(ground.x), y: Math.floor(ground.y) };
  const onMap = tile.x >= 0 && tile.y >= 0 && tile.x < map.width && tile.y < map.height;

  const world = screenToWorld(camera, view, sx, sy);
  let building = null;
  let bestDepth = -Infinity;
  for (const b of state.buildings) {
    const def = rules.buildings[b.type];
    const depth = depthOf(b.x, b.y, def.w, def.h);
    if (depth <= bestDepth) continue;
    const outline = boxSilhouette(b.x, b.y, def.w, def.h, buildingVisual(rules, b).risePx);
    if (pointInPolygon(world.x, world.y, outline)) {
      building = b;
      bestDepth = depth;
    }
  }
  return { tile, onMap, building };
}
