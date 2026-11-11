// Tile helpers. A map is { width, height, terrain[] } with terrain stored row by row.
// A tile's centre is at (x + 0.5, y + 0.5).

export const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function inBounds(map, x, y) {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function tileIndex(map, x, y) {
  return y * map.width + x;
}

export function terrainAt(map, x, y) {
  return inBounds(map, x, y) ? map.terrain[tileIndex(map, x, y)] : null;
}

// Every tile under a building whose top-left tile is (x, y).
export function footprint(x, y, w, h) {
  const tiles = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) tiles.push([x + dx, y + dy]);
  }
  return tiles;
}

// The tiles that share an edge with a footprint (no corners).
export function perimeter(x, y, w, h) {
  const tiles = [];
  for (let dx = 0; dx < w; dx++) {
    tiles.push([x + dx, y - 1]);
    tiles.push([x + dx, y + h]);
  }
  for (let dy = 0; dy < h; dy++) {
    tiles.push([x - 1, y + dy]);
    tiles.push([x + w, y + dy]);
  }
  return tiles;
}

export function footprintCenter(x, y, w, h) {
  return [x + w / 2, y + h / 2];
}

// Is the centre of tile (tx, ty) within `radius` of the point (cx, cy)?
export function tileWithinRadius(cx, cy, radius, tx, ty) {
  const dx = tx + 0.5 - cx;
  const dy = ty + 0.5 - cy;
  return dx * dx + dy * dy <= radius * radius;
}

// All in-bounds tiles whose centre is within `radius` of the point (cx, cy).
export function tilesInRadius(map, cx, cy, radius) {
  const tiles = [];
  const x0 = Math.floor(cx - radius);
  const x1 = Math.ceil(cx + radius);
  const y0 = Math.floor(cy - radius);
  const y1 = Math.ceil(cy + radius);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (inBounds(map, tx, ty) && tileWithinRadius(cx, cy, radius, tx, ty)) tiles.push([tx, ty]);
    }
  }
  return tiles;
}

// Does any tile of the footprint lie within `radius` of the point (cx, cy)?
export function footprintWithinRadius(cx, cy, radius, x, y, w, h) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (tileWithinRadius(cx, cy, radius, x + dx, y + dy)) return true;
    }
  }
  return false;
}
