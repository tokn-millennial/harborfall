// Isometric math. Pure numbers, no canvas, so it is tested in Node.
//
// Three kinds of position:
//   tile    grid coordinates. Tile (3,5) covers the square from (3,5) to (4,6).
//   world   pixels on an endless flat drawing of the island, at zoom 1.
//   screen  pixels on the canvas, after the camera's pan and zoom.
//
// A tile is drawn as a diamond TILE_W wide and TILE_H tall ("2:1 isometric").
// Moving +1 in tile x goes right and down. Moving +1 in tile y goes left and down.

export const TILE_W = 64;
export const TILE_H = 32;
export const HEIGHT_UNIT = 30; // pixels of rise, at zoom 1, per unit of a building's visual height

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

// The world position of grid point (tx, ty). For a whole-number tile this is
// the top (north) corner of its diamond. Fractions work too: (3.5, 5.5) is a tile centre.
export function tileToWorld(tx, ty) {
  return { x: (tx - ty) * HALF_W, y: (tx + ty) * HALF_H };
}

// The reverse. Returns fractional tile coordinates; floor them to get the tile.
export function worldToTile(wx, wy) {
  const a = wx / HALF_W;
  const b = wy / HALF_H;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

// The four corners of the diamond covering a w-by-h block of tiles: north, east, south, west.
export function footprintCorners(x, y, w, h) {
  return [tileToWorld(x, y), tileToWorld(x + w, y), tileToWorld(x + w, y + h), tileToWorld(x, y + h)];
}

// The outline of a box standing on that footprint, `risePx` tall, as seen on
// screen: six points, clockwise from the raised west corner.
export function boxSilhouette(x, y, w, h, risePx) {
  const [n, e, s, wst] = footprintCorners(x, y, w, h);
  return [
    { x: wst.x, y: wst.y - risePx },
    { x: n.x, y: n.y - risePx },
    { x: e.x, y: e.y - risePx },
    e,
    s,
    wst,
  ];
}

export function pointInPolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// Things nearer the viewer must be drawn later. For anything standing on a
// block of tiles, the sum of its far corner's coordinates gives the order.
export function depthOf(x, y, w = 1, h = 1) {
  return x + w + y + h;
}

// The world-space rectangle that contains the whole map.
export function mapBounds(map) {
  return {
    left: -map.height * HALF_W,
    right: map.width * HALF_W,
    top: 0,
    bottom: (map.width + map.height) * HALF_H,
  };
}
