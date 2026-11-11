// Works out which buildings are linked to a warehouse by road.
// Roads join along tile edges only, never diagonally.

import { DIRS4, inBounds, perimeter, tileIndex } from './grid.js';

export function recomputeConnections(game) {
  const { rules, state } = game;
  const map = state.map;
  const reached = new Array(map.width * map.height).fill(false);
  const queue = [];

  // Start from every road tile that touches a storage building.
  for (const b of state.buildings) {
    const def = rules.buildings[b.type];
    if (def.category !== 'storage') continue;
    for (const [x, y] of perimeter(b.x, b.y, def.w, def.h)) {
      if (!inBounds(map, x, y)) continue;
      const i = tileIndex(map, x, y);
      if (state.roads[i] && !reached[i]) {
        reached[i] = true;
        queue.push(i);
      }
    }
  }

  // Spread along the roads.
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % map.width;
    const y = (i - x) / map.width;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const n = tileIndex(map, nx, ny);
      if (state.roads[n] && !reached[n]) {
        reached[n] = true;
        queue.push(n);
      }
    }
  }

  // A building is connected when a reached road tile touches one of its edges.
  for (const b of state.buildings) {
    const def = rules.buildings[b.type];
    b.connected =
      def.category === 'storage' ||
      perimeter(b.x, b.y, def.w, def.h).some(([x, y]) => inBounds(map, x, y) && reached[tileIndex(map, x, y)]);
  }
  return reached;
}
