// The ground: textured tiles, a raised shoreline with shallows, trees, roads
// and open water.
//
// The ground and the forest never change, so their shapes are worked out once
// per map and kept. Each frame then only has to fill those ready-made shapes
// (or draw a picture made from them). All variation comes from hash2, so the
// island looks the same every time.

import { tileToWorld } from '../iso.js';
import { hash2, tone } from './kit.js';

export const CLIFF = 6;          // pixels the island stands above the water
const CLIFF_LIT = '#cdb58a';
const CLIFF_SHADE = '#a8906a';
const SHALLOW = ['rgba(150, 215, 225, 0.42)', 'rgba(130, 200, 220, 0.2)'];
const CLIFF_FOOT = 'rgba(70, 55, 35, 0.35)';
const FOAM = 'rgba(255, 255, 255, 0.75)';
const WASH = 'rgba(235, 250, 252, 0.28)';
const GRID = 'rgba(0, 0, 0, 0.09)';
const FLOWER_COLORS = ['rgba(255, 250, 225, 0.95)', '#f0d25a', '#e7a2b6'];
const TREE = { pine: '#2f6b3f', pineShade: '#21502f', leaf: '#4f8f42', leafShade: '#3a7234', trunk: '#6b4a32', shadow: 'rgba(15, 35, 20, 0.22)' };

const isLand = (map, x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.terrain[y * map.width + x] !== 'water';

function diamond(path, x, y) {
  const n = tileToWorld(x, y);
  const e = tileToWorld(x + 1, y);
  const s = tileToWorld(x + 1, y + 1);
  const w = tileToWorld(x, y + 1);
  path.moveTo(n.x, n.y);
  path.lineTo(e.x, e.y);
  path.lineTo(s.x, s.y);
  path.lineTo(w.x, w.y);
  path.closePath();
}

// Smooth noise from 0 to 1: a value on a coarse lattice every `cell` tiles,
// blended softly between lattice points, so neighbouring tiles get nearly the
// same value and the ground shows broad patches instead of a checkerboard.
function smoothNoise(x, y, cell, salt) {
  const fx = x / cell;
  const fy = y / cell;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const top = hash2(ix, iy, salt) + (hash2(ix + 1, iy, salt) - hash2(ix, iy, salt)) * sx;
  const bottom = hash2(ix, iy + 1, salt) + (hash2(ix + 1, iy + 1, salt) - hash2(ix, iy + 1, salt)) * sx;
  return top + (bottom - top) * sy;
}

// How light a tile of ground is: a factor for its color, from 0.94 to 1.06,
// in small steps so the edge between two patches is hard to see.
const LEVELS = 13;
export function groundShade(x, y) {
  const n = 0.75 * smoothNoise(x + 0.5, y + 0.5, 9, 11) + 0.25 * smoothNoise(x + 0.5, y + 0.5, 4, 12);
  const t = Math.max(0, Math.min(1, (n - 0.22) / 0.56));
  return 0.94 + (Math.round(t * (LEVELS - 1)) * 0.12) / (LEVELS - 1);
}

// A thin strip inside a tile, given in tile units (u across x, v across y).
function strip(path, x, y, u0, v0, u1, v1) {
  const a = tileToWorld(x + u0, y + v0);
  const b = tileToWorld(x + u1, y + v0);
  const c = tileToWorld(x + u1, y + v1);
  const d = tileToWorld(x + u0, y + v1);
  path.moveTo(a.x, a.y);
  path.lineTo(b.x, b.y);
  path.lineTo(c.x, c.y);
  path.lineTo(d.x, d.y);
  path.closePath();
}

// How many tiles each water tile is from land (1 or 2), for the shallows. 0 elsewhere.
export function shallowsOf(map) {
  const near = new Uint8Array(map.width * map.height);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isLand(map, x, y)) continue;
      let best = 0;
      for (let dy = -2; dy <= 2 && best !== 1; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (!isLand(map, x + dx, y + dy)) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (best === 0 || d < best) best = d;
        }
      }
      near[y * map.width + x] = best;
    }
  }
  return near;
}

// The shallows are the same every time for a given island, so they are worked out once.
const shallowsMemo = new WeakMap();
function shallowsFor(map) {
  if (!shallowsMemo.has(map)) shallowsMemo.set(map, shallowsOf(map));
  return shallowsMemo.get(map);
}

// The part of the map a painter covers: the given range of tiles kept on the
// map, or the whole map. { x0, y0, x1, y1 }, both ends included.
function tilesToPaint(map, range) {
  if (!range) return { x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1 };
  return { x0: Math.max(0, range.x0), y0: Math.max(0, range.y0), x1: Math.min(map.width - 1, range.x1), y1: Math.min(map.height - 1, range.y1) };
}

// Works out every shape of the ground once. paint(ctx, scale) then fills them;
// `scale` is the zoom of the context, so thin lines stay thin.
// With a `range` of tiles, only that part of the map is worked out, which is
// quick enough to do afresh for a close-up view.
export function createTerrainPainter(map, colors, range = null) {
  const shallows = shallowsFor(map);
  const area = tilesToPaint(map, range);

  // 1. Shallows: paler water close to the shore.
  const shallowPaths = [new Path2D(), new Path2D()];
  // 2. The edge of the island: a short cliff on the two sides facing the
  //    viewer, with a line of foam at its foot, and foam where the far sides
  //    meet the water. A soft wash of white lies a little out from every shore.
  const cliffLit = new Path2D();
  const cliffShade = new Path2D();
  const cliffFoot = new Path2D();
  const lip = new Path2D();
  const foam = new Path2D();
  const wash = new Path2D();
  const wetSand = new Path2D();
  // 3. The tiles, in broad soft patches of lighter and darker ground.
  const fills = new Map();
  // 4. Small details that say what each ground is.
  const furrows = new Path2D();
  const tufts = new Path2D();
  const tuftsLight = new Path2D();
  const sand = new Path2D();
  const flowers = FLOWER_COLORS.map(() => new Path2D());
  const bushes = new Path2D();
  const bushesLit = new Path2D();
  const stones = new Path2D();
  const origin = tileToWorld(0, 0);
  // Moves a line on an edge out over the water, `by` pixels, toward the tile (dx, dy).
  const outward = (dx, dy, by) => {
    const p = tileToWorld(dx, dy);
    const len = Math.hypot(p.x - origin.x, p.y - origin.y);
    return { x: ((p.x - origin.x) / len) * by, y: ((p.y - origin.y) / len) * by };
  };
  const shoreLine = (path, a, b, shift) => {
    path.moveTo(a.x + shift.x, a.y + shift.y);
    path.lineTo(b.x + shift.x, b.y + shift.y);
  };

  for (let y = area.y0; y <= area.y1; y++) {
    for (let x = area.x0; x <= area.x1; x++) {
      const terrain = map.terrain[y * map.width + x];
      if (terrain === 'water') {
        const level = shallows[y * map.width + x];
        if (level) diamond(shallowPaths[level - 1], x, y);
        continue;
      }

      const n = tileToWorld(x, y);
      const e = tileToWorld(x + 1, y);
      const s = tileToWorld(x + 1, y + 1);
      const w = tileToWorld(x, y + 1);
      const down = { x: 0, y: CLIFF };
      if (!isLand(map, x, y + 1)) {
        cliffLit.moveTo(w.x, w.y); cliffLit.lineTo(s.x, s.y); cliffLit.lineTo(s.x, s.y + CLIFF); cliffLit.lineTo(w.x, w.y + CLIFF); cliffLit.closePath();
        cliffFoot.moveTo(w.x, w.y + CLIFF - 2); cliffFoot.lineTo(s.x, s.y + CLIFF - 2); cliffFoot.lineTo(s.x, s.y + CLIFF); cliffFoot.lineTo(w.x, w.y + CLIFF); cliffFoot.closePath();
        shoreLine(lip, w, s, { x: 0, y: 0.5 });
        shoreLine(foam, w, s, down);
        const o = outward(0, 1, 5);
        shoreLine(wash, w, s, { x: o.x, y: o.y + CLIFF });
      }
      if (!isLand(map, x + 1, y)) {
        cliffShade.moveTo(s.x, s.y); cliffShade.lineTo(e.x, e.y); cliffShade.lineTo(e.x, e.y + CLIFF); cliffShade.lineTo(s.x, s.y + CLIFF); cliffShade.closePath();
        cliffFoot.moveTo(s.x, s.y + CLIFF - 2); cliffFoot.lineTo(e.x, e.y + CLIFF - 2); cliffFoot.lineTo(e.x, e.y + CLIFF); cliffFoot.lineTo(s.x, s.y + CLIFF); cliffFoot.closePath();
        shoreLine(lip, s, e, { x: 0, y: 0.5 });
        shoreLine(foam, s, e, down);
        const o = outward(1, 0, 5);
        shoreLine(wash, s, e, { x: o.x, y: o.y + CLIFF });
      }
      // The far sides have no cliff to show, only foam where land meets water.
      if (!isLand(map, x, y - 1)) {
        shoreLine(foam, n, e, outward(0, -1, 1));
        shoreLine(wash, n, e, outward(0, -1, 5));
      }
      if (!isLand(map, x - 1, y)) {
        shoreLine(foam, n, w, outward(-1, 0, 1));
        shoreLine(wash, n, w, outward(-1, 0, 5));
      }
      // Sand darkened by the waves, just inside the water's edge.
      if (terrain === 'coast') {
        if (!isLand(map, x, y + 1)) strip(wetSand, x, y, 0, 0.84, 1, 1);
        if (!isLand(map, x + 1, y)) strip(wetSand, x, y, 0.84, 0, 1, 1);
        if (!isLand(map, x, y - 1)) strip(wetSand, x, y, 0, 0, 1, 0.16);
        if (!isLand(map, x - 1, y)) strip(wetSand, x, y, 0, 0, 0.16, 1);
      }

      const shade = groundShade(x, y);
      const key = `${terrain}|${shade}`;
      if (!fills.has(key)) fills.set(key, { path: new Path2D(), color: tone(colors[terrain], shade) });
      diamond(fills.get(key).path, x, y);

      if (terrain === 'fertile') {
        for (const v of [0.25, 0.5, 0.75]) {
          const a = tileToWorld(x + 0.12, y + v);
          const b = tileToWorld(x + 0.88, y + v);
          furrows.moveTo(a.x, a.y);
          furrows.lineTo(b.x, b.y);
        }
      } else if (terrain === 'grass') {
        const count = Math.floor(hash2(x, y, 2) * 4);
        for (let i = 0; i < count; i++) {
          const p = tileToWorld(x + 0.15 + hash2(x, y, 10 + i) * 0.7, y + 0.15 + hash2(x, y, 20 + i) * 0.7);
          const into = hash2(x, y, 25 + i) < 0.35 ? tuftsLight : tufts;
          into.moveTo(p.x - 2, p.y);
          into.lineTo(p.x - 1, p.y - 3);
          into.moveTo(p.x, p.y);
          into.lineTo(p.x + 1, p.y - 3.5);
          into.moveTo(p.x + 2, p.y);
          into.lineTo(p.x + 2.5, p.y - 2.5);
        }
        // Flowers grow in drifts: many where the meadow is in flower, few elsewhere.
        const meadow = smoothNoise(x + 0.5, y + 0.5, 5, 13) > 0.64;
        const flowerCount = hash2(x, y, 3) < (meadow ? 0.6 : 0.06) ? 1 + Math.floor(hash2(x, y, 6) * (meadow ? 4 : 2)) : 0;
        const color = Math.floor(hash2(x, y, 7) * FLOWER_COLORS.length);
        for (let i = 0; i < flowerCount; i++) {
          const p = tileToWorld(x + 0.15 + hash2(x, y, 80 + i) * 0.7, y + 0.15 + hash2(x, y, 90 + i) * 0.7);
          flowers[color].moveTo(p.x + 1.2, p.y);
          flowers[color].arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        }
        // Now and then a low bush or a stone.
        const odd = hash2(x, y, 8);
        if (odd < 0.03) {
          const p = tileToWorld(x + 0.3 + hash2(x, y, 4) * 0.4, y + 0.3 + hash2(x, y, 5) * 0.4);
          bushes.moveTo(p.x + 4, p.y - 2);
          bushes.ellipse(p.x, p.y - 2, 4, 3, 0, 0, Math.PI * 2);
          bushesLit.moveTo(p.x + 1.5, p.y - 3);
          bushesLit.ellipse(p.x - 1, p.y - 3, 2.5, 1.8, 0, 0, Math.PI * 2);
        } else if (odd < 0.045) {
          const p = tileToWorld(x + 0.3 + hash2(x, y, 4) * 0.4, y + 0.3 + hash2(x, y, 5) * 0.4);
          stones.moveTo(p.x + 2.4, p.y);
          stones.ellipse(p.x, p.y, 2.4, 1.5, 0, 0, Math.PI * 2);
          stones.moveTo(p.x + 4.6, p.y + 1);
          stones.ellipse(p.x + 3.4, p.y + 1, 1.2, 0.8, 0, 0, Math.PI * 2);
        }
      } else if (terrain === 'coast') {
        for (let i = 0; i < 4; i++) {
          const p = tileToWorld(x + 0.15 + hash2(x, y, 30 + i) * 0.7, y + 0.15 + hash2(x, y, 40 + i) * 0.7);
          sand.moveTo(p.x + 0.9, p.y);
          sand.arc(p.x, p.y, 0.9, 0, Math.PI * 2);
        }
      }
    }
  }

  const furrowColor = tone(colors.fertile, 0.82);
  const tuftColor = tone(colors.grass, 0.78);
  const tuftLightColor = tone(colors.grass, 1.14);
  const sandColor = tone(colors.coast, 0.84);
  const wetSandColor = tone(colors.coast, 0.86);
  const bushColor = tone(colors.forest ?? colors.grass, 0.85);
  const bushLitColor = tone(colors.grass, 0.95);

  return {
    paint(ctx, scale = 1) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.fillStyle = SHALLOW[1];
      ctx.fill(shallowPaths[1]);
      ctx.fillStyle = SHALLOW[0];
      ctx.fill(shallowPaths[0]);

      ctx.strokeStyle = WASH;
      ctx.lineWidth = 2.6;
      ctx.stroke(wash);

      ctx.fillStyle = CLIFF_LIT;
      ctx.fill(cliffLit);
      ctx.fillStyle = CLIFF_SHADE;
      ctx.fill(cliffShade);
      ctx.fillStyle = CLIFF_FOOT;
      ctx.fill(cliffFoot);
      ctx.strokeStyle = FOAM;
      ctx.lineWidth = 1.8;
      ctx.stroke(foam);

      for (const { path, color } of fills.values()) {
        ctx.fillStyle = color;
        ctx.fill(path);
        ctx.strokeStyle = color; // a hairline in the same color closes gaps between tiles
        ctx.lineWidth = 1.2 / scale;
        ctx.stroke(path);
      }

      ctx.fillStyle = wetSandColor;
      ctx.fill(wetSand);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke(lip);

      ctx.strokeStyle = furrowColor;
      ctx.lineWidth = 1.3;
      ctx.stroke(furrows);
      ctx.strokeStyle = tuftColor;
      ctx.lineWidth = 0.9;
      ctx.stroke(tufts);
      ctx.strokeStyle = tuftLightColor;
      ctx.stroke(tuftsLight);
      ctx.fillStyle = sandColor;
      ctx.fill(sand);
      FLOWER_COLORS.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fill(flowers[i]);
      });
      ctx.fillStyle = 'rgba(15, 35, 20, 0.2)';
      ctx.fill(bushes);
      ctx.fillStyle = bushColor;
      ctx.fill(bushes);
      ctx.fillStyle = bushLitColor;
      ctx.fill(bushesLit);
      ctx.fillStyle = '#a7a39a';
      ctx.fill(stones);
    },
  };
}

// The grid, shown only while placing something, so tiles can be counted.
// Drawn each frame over the land tiles in view (`range`), as one long line
// for each stretch of land along a row or column of tile edges: far quicker
// than an outline round every tile.
export function gridLines(map, range) {
  const area = tilesToPaint(map, range);
  const lines = [];
  // Edges running along x, at y = b: between the rows b - 1 and b.
  for (let b = area.y0; b <= area.y1 + 1; b++) {
    let start = null;
    for (let x = area.x0; x <= area.x1 + 1; x++) {
      const on = x <= area.x1 && (isLand(map, x, b - 1) || isLand(map, x, b));
      if (on && start === null) start = x;
      if (!on && start !== null) {
        lines.push([start, b, x, b]);
        start = null;
      }
    }
  }
  // Edges running along y, at x = b.
  for (let b = area.x0; b <= area.x1 + 1; b++) {
    let start = null;
    for (let y = area.y0; y <= area.y1 + 1; y++) {
      const on = y <= area.y1 && (isLand(map, b - 1, y) || isLand(map, b, y));
      if (on && start === null) start = y;
      if (!on && start !== null) {
        lines.push([b, start, b, y]);
        start = null;
      }
    }
  }
  return lines; // [x0, y0, x1, y1] in tiles
}

export function paintGrid(ctx, map, range, zoom) {
  const grid = new Path2D();
  for (const [x0, y0, x1, y1] of gridLines(map, range)) {
    const a = tileToWorld(x0, y0);
    const b = tileToWorld(x1, y1);
    grid.moveTo(a.x, a.y);
    grid.lineTo(b.x, b.y);
  }
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1 / zoom;
  ctx.stroke(grid);
}

// Where a tree stands and how it looks, worked out from its tile alone.
function treeShape(x, y) {
  const c = tileToWorld(x + 0.5 + (hash2(x, y, 6) - 0.5) * 0.3, y + 0.5 + (hash2(x, y, 7) - 0.5) * 0.3);
  return { cx: c.x, cy: c.y, size: 0.85 + hash2(x, y, 8) * 0.4, leafy: hash2(x, y, 9) < 0.22 };
}

// Adds one tree's shapes to a set of paths, one path per color.
function addTree(paths, x, y) {
  const { cx, cy, size, leafy } = treeShape(x, y);
  paths.shadow.moveTo(cx + 13 * size, cy + 1);
  paths.shadow.ellipse(cx + 4 * size, cy + 1, 9 * size, 4 * size, 0, 0, Math.PI * 2);
  paths.trunk.rect(cx - 1.3, cy - 5 * size, 2.6, 6 * size);
  if (leafy) {
    // A round leafy tree.
    paths.leafShade.moveTo(cx + 1.5 + 8.5 * size, cy - 13 * size);
    paths.leafShade.arc(cx + 1.5, cy - 13 * size, 8.5 * size, 0, Math.PI * 2);
    paths.leaf.moveTo(cx - 1.5 + 6.5 * size, cy - 15 * size);
    paths.leaf.arc(cx - 1.5, cy - 15 * size, 6.5 * size, 0, Math.PI * 2);
    return;
  }
  // A pine: three tiers, lit on the left and shaded on the right.
  for (let tier = 0; tier < 3; tier++) {
    const base = cy - (4 + tier * 7) * size;
    const top = base - 11 * size;
    const half = (9.5 - tier * 2.2) * size;
    paths.pineShade.moveTo(cx, top);
    paths.pineShade.lineTo(cx + half, base);
    paths.pineShade.lineTo(cx, base);
    paths.pineShade.closePath();
    paths.pine.moveTo(cx, top);
    paths.pine.lineTo(cx - half, base);
    paths.pine.lineTo(cx, base);
    paths.pine.closePath();
  }
}

const newTreePaths = () => ({ shadow: new Path2D(), trunk: new Path2D(), pineShade: new Path2D(), pine: new Path2D(), leafShade: new Path2D(), leaf: new Path2D() });

function fillTreePaths(ctx, paths) {
  ctx.fillStyle = TREE.shadow;
  ctx.fill(paths.shadow);
  ctx.fillStyle = TREE.trunk;
  ctx.fill(paths.trunk);
  ctx.fillStyle = TREE.pineShade;
  ctx.fill(paths.pineShade);
  ctx.fillStyle = TREE.pine;
  ctx.fill(paths.pine);
  ctx.fillStyle = TREE.leafShade;
  ctx.fill(paths.leafShade);
  ctx.fillStyle = TREE.leaf;
  ctx.fill(paths.leaf);
}

// A few trees drawn together. Used for the trees that stand close to a
// building and so have to be drawn in order with it. `tiles` is a list of
// { x, y }, far to near.
export function paintTrees(ctx, tiles) {
  if (tiles.length === 0) return;
  const paths = newTreePaths();
  for (const tile of tiles) addTree(paths, tile.x, tile.y);
  fillTreePaths(ctx, paths);
}

export function paintTree(ctx, x, y) {
  paintTrees(ctx, [{ x, y }]);
}

// The whole forest, worked out once. Trees are added far to near, so nearer
// ones overlap farther ones.
export function createForestPainter(map, range = null) {
  const area = tilesToPaint(map, range);
  const tiles = [];
  for (let y = area.y0; y <= area.y1; y++) {
    for (let x = area.x0; x <= area.x1; x++) {
      if (map.terrain[y * map.width + x] === 'forest') tiles.push([x, y]);
    }
  }
  tiles.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);
  // Row by row from the back, each row as its own set of paths, so a near row
  // of trees covers the row behind it.
  const rows = [];
  let depth = null;
  for (const [x, y] of tiles) {
    if (x + y !== depth) {
      depth = x + y;
      rows.push(newTreePaths());
    }
    addTree(rows[rows.length - 1], x, y);
  }
  return {
    count: tiles.length,
    paint(ctx) {
      for (const row of rows) fillTreePaths(ctx, row);
    },
  };
}

// Open water. The soft top-to-bottom shade never changes, so it is given to
// the page as the canvas's background, which costs nothing per frame.
export function waterBackground(color) {
  return `linear-gradient(180deg, ${tone(color, 0.86)}, ${tone(color, 1.08)})`;
}

// The moving part of the water: glints that drift and fade. Drawn in screen
// pixels on a cleared canvas, under the island.
export function paintWater(ctx, view, camera, time) {
  ctx.clearRect(0, 0, view.width, view.height);

  // Glints sit on a loose grid in world space, so they stay put as the view moves.
  const zoom = camera.zoom;
  const cell = zoom < 0.6 ? 220 : 130;
  const left = camera.x - view.width / 2 / zoom;
  const top = camera.y - view.height / 2 / zoom;
  const cols = Math.ceil(view.width / zoom / cell) + 1;
  const rows = Math.ceil(view.height / zoom / (cell / 2)) + 1;
  const gx0 = Math.floor(left / cell);
  const gy0 = Math.floor(top / (cell / 2));
  const thickness = Math.max(1, 1.2 * zoom);
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const gx = gx0 + i;
      const gy = gy0 + j;
      const phase = hash2(gx, gy, 50);
      const wave = Math.sin(time * 0.9 + phase * 6.283);
      const wx = (gx + hash2(gx, gy, 51)) * cell + wave * 5;
      const wy = (gy + hash2(gx, gy, 52)) * (cell / 2);
      const sx = (wx - camera.x) * zoom + view.width / 2;
      const sy = (wy - camera.y) * zoom + view.height / 2;
      const length = (7 + hash2(gx, gy, 53) * 9) * Math.max(0.6, zoom);
      paths[Math.min(2, Math.floor((wave + 1) * 1.5))].rect(sx - length, sy, length * 2, thickness);
    }
  }
  [0.07, 0.14, 0.24].forEach((alpha, i) => {
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fill(paths[i]);
  });
}

// Roads that join up: each road tile is a pad in the middle with an arm
// toward every neighbouring road or building. The shapes are rebuilt only
// when a road or building is added or removed.
export function createRoadPainter(color) {
  let stamp = null;
  let lastState = null;
  let shapes = null;

  function build(state) {
    const map = state.map;
    const edge = new Path2D();
    const surface = new Path2D();
    const pebbles = new Path2D();
    const joins = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && (state.roads[y * map.width + x] === 1 || state.occupancy[y * map.width + x] !== 0);
    const rect = (path, x, y, u0, v0, u1, v1) => {
      const a = tileToWorld(x + u0, y + v0);
      const b = tileToWorld(x + u1, y + v0);
      const c = tileToWorld(x + u1, y + v1);
      const d = tileToWorld(x + u0, y + v1);
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
      path.lineTo(c.x, c.y);
      path.lineTo(d.x, d.y);
      path.closePath();
    };
    let count = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!state.roads[y * map.width + x]) continue;
        count++;
        for (const [path, inset] of [[edge, 0.13], [surface, 0.2]]) {
          const lo = inset;
          const hi = 1 - inset;
          rect(path, x, y, lo, lo, hi, hi);
          if (joins(x + 1, y)) rect(path, x, y, hi - 0.01, lo, 1.01, hi);
          if (joins(x - 1, y)) rect(path, x, y, -0.01, lo, lo + 0.01, hi);
          if (joins(x, y + 1)) rect(path, x, y, lo, hi - 0.01, hi, 1.01);
          if (joins(x, y - 1)) rect(path, x, y, lo, -0.01, hi, lo + 0.01);
        }
        for (let i = 0; i < 3; i++) {
          const p = tileToWorld(x + 0.3 + hash2(x, y, 60 + i) * 0.4, y + 0.3 + hash2(x, y, 70 + i) * 0.4);
          pebbles.moveTo(p.x + 1, p.y);
          pebbles.arc(p.x, p.y, 1, 0, Math.PI * 2);
        }
      }
    }
    return { edge, surface, pebbles, count };
  }

  return {
    paint(ctx, state) {
      // Roads and buildings only change through commands, and each one changes at least one of these.
      let roads = 0;
      for (let i = 0; i < state.roads.length; i++) if (state.roads[i]) roads = (Math.imul(roads, 31) + i + 1) | 0;
      const now = `${roads}|${state.buildings.length}|${state.nextId}`;
      // A different game altogether (one was loaded, or a new one begun) always rebuilds.
      if (now !== stamp || state !== lastState) {
        stamp = now;
        lastState = state;
        shapes = build(state);
      }
      if (shapes.count === 0) return;
      ctx.fillStyle = tone(color, 0.7);
      ctx.fill(shapes.edge);
      ctx.fillStyle = color;
      ctx.fill(shapes.surface);
      ctx.fillStyle = tone(color, 0.82);
      ctx.fill(shapes.pebbles);
    },
  };
}
