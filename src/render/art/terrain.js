// The ground: textured tiles, a raised shoreline with shallows, trees, roads
// and open water.
//
// The ground and the forest never change, so their shapes are worked out once
// per map and kept. Each frame then only has to fill those ready-made shapes
// (or draw a picture made from them). All variation comes from hash2, so the
// island looks the same every time.

import { tileToWorld } from '../iso.js';
import { hash2, tone } from './kit.js';

const CLIFF = 6;                 // pixels the island stands above the water
const CLIFF_LIT = '#cdb58a';
const CLIFF_SHADE = '#a8906a';
const SHALLOW = ['rgba(150, 215, 225, 0.42)', 'rgba(130, 200, 220, 0.2)'];
const FOAM = 'rgba(255, 255, 255, 0.65)';
const GRID = 'rgba(0, 0, 0, 0.055)';
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

// Works out every shape of the ground once. paint(ctx, scale) then fills them;
// `scale` is the zoom of the context, so thin lines stay thin.
export function createTerrainPainter(map, colors) {
  const shallows = shallowsOf(map);

  // 1. Shallows: paler water close to the shore.
  const shallowPaths = [new Path2D(), new Path2D()];
  // 2. The edge of the island: a short cliff on the two sides facing the
  //    viewer, with a line of foam at its foot.
  const cliffLit = new Path2D();
  const cliffShade = new Path2D();
  const foam = new Path2D();
  // 3. The tiles, in a few slightly different shades of each ground color.
  const LEVELS = 4;
  const fills = new Map();
  const grid = new Path2D();
  // 4. Small details that say what each ground is.
  const furrows = new Path2D();
  const tufts = new Path2D();
  const sand = new Path2D();
  const flowers = new Path2D();

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const terrain = map.terrain[y * map.width + x];
      if (terrain === 'water') {
        const level = shallows[y * map.width + x];
        if (level) diamond(shallowPaths[level - 1], x, y);
        continue;
      }

      const e = tileToWorld(x + 1, y);
      const s = tileToWorld(x + 1, y + 1);
      const w = tileToWorld(x, y + 1);
      if (!isLand(map, x, y + 1)) {
        cliffLit.moveTo(w.x, w.y); cliffLit.lineTo(s.x, s.y); cliffLit.lineTo(s.x, s.y + CLIFF); cliffLit.lineTo(w.x, w.y + CLIFF); cliffLit.closePath();
        foam.moveTo(w.x, w.y + CLIFF); foam.lineTo(s.x, s.y + CLIFF);
      }
      if (!isLand(map, x + 1, y)) {
        cliffShade.moveTo(s.x, s.y); cliffShade.lineTo(e.x, e.y); cliffShade.lineTo(e.x, e.y + CLIFF); cliffShade.lineTo(s.x, s.y + CLIFF); cliffShade.closePath();
        foam.moveTo(s.x, s.y + CLIFF); foam.lineTo(e.x, e.y + CLIFF);
      }

      const level = Math.floor(hash2(x, y, 1) * LEVELS);
      const key = `${terrain}|${level}`;
      if (!fills.has(key)) fills.set(key, { path: new Path2D(), color: tone(colors[terrain], 0.955 + level * 0.03) });
      diamond(fills.get(key).path, x, y);
      diamond(grid, x, y);

      if (terrain === 'fertile') {
        for (const v of [0.25, 0.5, 0.75]) {
          const a = tileToWorld(x + 0.12, y + v);
          const b = tileToWorld(x + 0.88, y + v);
          furrows.moveTo(a.x, a.y);
          furrows.lineTo(b.x, b.y);
        }
      } else if (terrain === 'grass') {
        const count = Math.floor(hash2(x, y, 2) * 3);
        for (let i = 0; i < count; i++) {
          const p = tileToWorld(x + 0.2 + hash2(x, y, 10 + i) * 0.6, y + 0.2 + hash2(x, y, 20 + i) * 0.6);
          tufts.moveTo(p.x - 2, p.y);
          tufts.lineTo(p.x - 1, p.y - 3);
          tufts.moveTo(p.x, p.y);
          tufts.lineTo(p.x + 1, p.y - 3.5);
          tufts.moveTo(p.x + 2, p.y);
          tufts.lineTo(p.x + 2.5, p.y - 2.5);
        }
        if (hash2(x, y, 3) < 0.07) {
          const p = tileToWorld(x + 0.3 + hash2(x, y, 4) * 0.4, y + 0.3 + hash2(x, y, 5) * 0.4);
          flowers.moveTo(p.x + 1.3, p.y);
          flowers.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
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
  const sandColor = tone(colors.coast, 0.84);

  return {
    paint(ctx, scale = 1) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.fillStyle = SHALLOW[1];
      ctx.fill(shallowPaths[1]);
      ctx.fillStyle = SHALLOW[0];
      ctx.fill(shallowPaths[0]);

      ctx.fillStyle = CLIFF_LIT;
      ctx.fill(cliffLit);
      ctx.fillStyle = CLIFF_SHADE;
      ctx.fill(cliffShade);
      ctx.strokeStyle = FOAM;
      ctx.lineWidth = 1.6;
      ctx.stroke(foam);

      for (const { path, color } of fills.values()) {
        ctx.fillStyle = color;
        ctx.fill(path);
        ctx.strokeStyle = color; // a hairline in the same color closes gaps between tiles
        ctx.lineWidth = 1.2 / scale;
        ctx.stroke(path);
      }

      ctx.strokeStyle = furrowColor;
      ctx.lineWidth = 1.3;
      ctx.stroke(furrows);
      ctx.strokeStyle = tuftColor;
      ctx.lineWidth = 0.9;
      ctx.stroke(tufts);
      ctx.fillStyle = sandColor;
      ctx.fill(sand);
      ctx.fillStyle = 'rgba(255, 250, 225, 0.9)';
      ctx.fill(flowers);

      // A faint grid, so tiles can still be counted when placing things.
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1 / scale;
      ctx.stroke(grid);
    },
  };
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
export function createForestPainter(map) {
  const tiles = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
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
      if (now !== stamp) {
        stamp = now;
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
