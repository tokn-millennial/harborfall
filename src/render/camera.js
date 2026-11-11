// The camera: where on the island the screen is looking, and how closely.
// A camera is { x, y, zoom }, where (x, y) is the world point at the centre of
// the screen. A view is { width, height } of the canvas in screen pixels.
// Pure math, tested in Node.

import { mapBounds, tileToWorld, worldToTile } from './iso.js';

export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 3;

export function createCamera(map) {
  const camera = { x: 0, y: 0, zoom: 1 };
  const focus = map.start ?? { x: map.width / 2, y: map.height / 2 };
  centerOnTile(camera, focus.x + 1, focus.y + 1);
  return camera;
}

export function centerOnTile(camera, tx, ty) {
  const world = tileToWorld(tx, ty);
  camera.x = world.x;
  camera.y = world.y;
}

export function worldToScreen(camera, view, wx, wy) {
  return {
    x: (wx - camera.x) * camera.zoom + view.width / 2,
    y: (wy - camera.y) * camera.zoom + view.height / 2,
  };
}

export function screenToWorld(camera, view, sx, sy) {
  return {
    x: (sx - view.width / 2) / camera.zoom + camera.x,
    y: (sy - view.height / 2) / camera.zoom + camera.y,
  };
}

// The tile on the ground under a screen point (fractional; floor for the tile).
export function screenToTile(camera, view, sx, sy) {
  const world = screenToWorld(camera, view, sx, sy);
  return worldToTile(world.x, world.y);
}

// Drag the island by a number of screen pixels.
export function panByScreen(camera, dx, dy) {
  camera.x -= dx / camera.zoom;
  camera.y -= dy / camera.zoom;
}

// Zoom in or out while keeping the world point under (sx, sy) fixed on screen.
export function zoomAt(camera, view, sx, sy, factor) {
  const before = screenToWorld(camera, view, sx, sy);
  camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor));
  const after = screenToWorld(camera, view, sx, sy);
  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
}

// Keep the centre of the screen over the map, so the island cannot be lost.
export function clampToMap(camera, map) {
  const b = mapBounds(map);
  camera.x = Math.min(b.right, Math.max(b.left, camera.x));
  camera.y = Math.min(b.bottom, Math.max(b.top, camera.y));
}

// The block of tiles that could be on screen: x0..x1 and y0..y1 inclusive,
// with `margin` extra tiles so tall things at the edges are not cut off.
export function visibleTileRange(camera, view, map, margin = 3) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [sx, sy] of [[0, 0], [view.width, 0], [0, view.height], [view.width, view.height]]) {
    const t = screenToTile(camera, view, sx, sy);
    minX = Math.min(minX, t.x);
    maxX = Math.max(maxX, t.x);
    minY = Math.min(minY, t.y);
    maxY = Math.max(maxY, t.y);
  }
  return {
    x0: Math.max(0, Math.floor(minX) - margin),
    x1: Math.min(map.width - 1, Math.floor(maxX) + margin),
    y0: Math.max(0, Math.floor(minY) - margin),
    y1: Math.min(map.height - 1, Math.floor(maxY) + margin),
  };
}
