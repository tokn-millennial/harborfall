// The ground: textured ground with rounded edges, a raised shoreline with
// shallows, trees, roads and open water.
//
// The ground and the forest never change, so their shapes are worked out once
// per map and kept. Each frame then only has to fill those ready-made shapes
// (or draw a picture made from them). All variation comes from hash2, so the
// island looks the same every time.

import { tileToWorld } from '../iso.js';
import { hash2, mix, tone } from './kit.js';

export const CLIFF = 6;          // pixels the island stands above the water
const CLIFF_LIT = '#cdb58a';
const CLIFF_SHADE = '#a8906a';
const CLIFF_FOOT = 'rgba(70, 55, 35, 0.35)';
const FOAM = 'rgba(255, 255, 255, 0.75)';
const WASH = 'rgba(235, 250, 252, 0.28)';
// The shallows: bands of paler water around every shore, widest and faintest
// first. `reach` is how far out each band goes, in tiles.
export const SHALLOWS = [
  { reach: 3.4, color: 'rgba(140, 205, 220, 0.05)' },
  { reach: 2.4, color: 'rgba(150, 215, 225, 0.07)' },
  { reach: 1.9, color: 'rgba(150, 215, 225, 0.08)' },
  { reach: 1.4, color: 'rgba(150, 215, 225, 0.1)' },
  { reach: 0.95, color: 'rgba(160, 220, 228, 0.12)' },
  { reach: 0.55, color: 'rgba(175, 228, 232, 0.16)' },
];
const GRID = 'rgba(0, 0, 0, 0.09)';
const FLOWER_COLORS = ['rgba(255, 250, 225, 0.95)', '#f0d25a', '#e7a2b6'];
const TREE = { pine: '#2f6b3f', pineShade: '#21502f', leaf: '#4f8f42', leafShade: '#3a7234', trunk: '#6b4a32', shadow: 'rgba(15, 35, 20, 0.22)' };

const isLand = (map, x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.terrain[y * map.width + x] !== 'water';

// ---- rounded edges ----------------------------------------------------------
// Where one kind of ground ends, its corners are rounded off, and where it
// wraps round a corner, a small curved piece fills in. A staircase of tiles
// then reads as a soft, wavy edge. Only the look changes: the tiles, and what
// can be built on them, are exactly as before.

// How far from a corner the rounding begins, in tiles. A half rounds a lone
// tile into a circle and a diagonal staircase into a gentle wave.
export const ROUND = 0.5;
const CURVE_STEPS = 6;
// A tile's corners in tile units, clockwise from the north (the top on screen).
const CORNER = [[0, 0], [1, 0], [1, 1], [0, 1]];
// The side from corner i to corner i + 1 faces this way.
const FACING = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// The two neighbours that share corner i of a tile, and the one across it.
function aroundCorner(x, y, i) {
  const [ax, ay] = FACING[(i + 3) % 4];
  const [bx, by] = FACING[i];
  return { a: [x + ax, y + ay], b: [x + bx, y + by], d: [x + ax + bx, y + ay + by] };
}

// The point `ROUND` along each side from corner i, toward the corners before and after it.
function cornerPoints(x, y, i) {
  const [px, py] = CORNER[i];
  const [qx, qy] = CORNER[(i + 3) % 4];
  const [rx, ry] = CORNER[(i + 1) % 4];
  return {
    p: [x + px, y + py],
    a: [x + px + (qx - px) * ROUND, y + py + (qy - py) * ROUND],
    b: [x + px + (rx - px) * ROUND, y + py + (ry - py) * ROUND],
  };
}

const world = ([tx, ty]) => tileToWorld(tx, ty);

// A tile with some of its corners rounded off.
function roundedTile(path, x, y, round) {
  for (let i = 0; i < 4; i++) {
    const { p, a, b } = cornerPoints(x, y, i);
    const P = world(p);
    if (!round[i]) {
      if (i === 0) path.moveTo(P.x, P.y);
      else path.lineTo(P.x, P.y);
      continue;
    }
    const A = world(a);
    const B = world(b);
    if (i === 0) path.moveTo(A.x, A.y);
    else path.lineTo(A.x, A.y);
    path.quadraticCurveTo(P.x, P.y, B.x, B.y);
  }
  path.closePath();
}

// The small curved piece that fills corner i of a tile from the ground around it.
function fillet(path, x, y, i) {
  const { p, a, b } = cornerPoints(x, y, i);
  const P = world(p);
  const A = world(a);
  const B = world(b);
  path.moveTo(A.x, A.y);
  path.lineTo(P.x, P.y);
  path.lineTo(B.x, B.y);
  path.quadraticCurveTo(P.x, P.y, A.x, A.y);
  path.closePath();
}

// The curve that rounds corner i, as short straight pieces in tile units.
function cornerCurve(x, y, i) {
  const { p, a, b } = cornerPoints(x, y, i);
  const points = [];
  for (let k = 0; k <= CURVE_STEPS; k++) {
    const t = k / CURVE_STEPS;
    const u = 1 - t;
    points.push([u * u * a[0] + 2 * u * t * p[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p[1] + t * t * b[1]]);
  }
  return points;
}

// The shore as short pieces, each with the direction it faces out to sea (in
// tile units): straight along the sides of the tiles, curved at the corners.
// `sand` marks pieces on a beach.
export function shorePieces(map, area) {
  const pieces = [];
  const land = (x, y) => isLand(map, x, y);
  const add = (a, b, nx, ny, sand) => {
    if (a[0] !== b[0] || a[1] !== b[1]) pieces.push({ a, b, nx, ny, sand }); // a side rounded at both ends has no straight part left
  };
  // Adds a curve, facing away from (cx, cy) when `away`, toward it otherwise.
  const addCurve = (points, cx, cy, away, sand) => {
    for (let k = 0; k + 1 < points.length; k++) {
      const [ax, ay] = points[k];
      const [bx, by] = points[k + 1];
      let nx = by - ay;
      let ny = -(bx - ax);
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      const mx = (ax + bx) / 2 - cx;
      const my = (ay + by) / 2 - cy;
      if ((nx * mx + ny * my > 0) !== away) {
        nx = -nx;
        ny = -ny;
      }
      add(points[k], points[k + 1], nx, ny, sand);
    }
  };

  for (let y = area.y0; y <= area.y1; y++) {
    for (let x = area.x0; x <= area.x1; x++) {
      if (land(x, y)) {
        const sand = map.terrain[y * map.width + x] === 'coast';
        for (let i = 0; i < 4; i++) {
          const [fx, fy] = FACING[i];
          if (land(x + fx, y + fy)) continue;
          // A straight side, cut short where a corner at either end is rounded.
          const p0 = CORNER[i];
          const p1 = CORNER[(i + 1) % 4];
          const cut = (corner) => {
            const { a, b, d } = aroundCorner(x, y, corner);
            // The neighbour sharing this corner that is not across this side.
            const other = corner === i ? a : b;
            return !land(...other) || land(...d);
          };
          const s0 = cut(i) ? ROUND : 0;
          const s1 = cut((i + 1) % 4) ? ROUND : 0;
          const dx = p1[0] - p0[0];
          const dy = p1[1] - p0[1];
          add([x + p0[0] + dx * s0, y + p0[1] + dy * s0], [x + p1[0] - dx * s1, y + p1[1] - dy * s1], fx, fy, sand);
        }
        // Rounded corners, facing away from the tile.
        for (let i = 0; i < 4; i++) {
          const { a, b } = aroundCorner(x, y, i);
          if (!land(...a) && !land(...b)) addCurve(cornerCurve(x, y, i), x + 0.5, y + 0.5, true, sand);
        }
      } else {
        // Corners of water filled in by the land around them, facing into the water.
        for (let i = 0; i < 4; i++) {
          const { a, b, d } = aroundCorner(x, y, i);
          if (land(...a) && land(...b) && land(...d)) {
            addCurve(cornerCurve(x, y, i), x + 0.5, y + 0.5, false, map.terrain[a[1] * map.width + a[0]] === 'coast');
          }
        }
      }
    }
  }
  return pieces;
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

// The warmth of a tile of grass: from -WARMTH_LEVELS (a cool, blue-green
// hollow) to WARMTH_LEVELS (a warm, sunny yellow-green rise), in broad patches
// larger than the light and dark ones, so a meadow is not one flat green. The
// steps are small, so the edge between two tiles of a patch is hard to see.
const GRASS_WARM = '#cdbf55';
const GRASS_COOL = '#4a9783';
export const WARMTH_LEVELS = 4;
const WARMTH_STEP = 0.26 / WARMTH_LEVELS;
// The noise changes by at most 0.075 a tile (a lattice every 20 tiles), so 12
// levels across the whole range keeps neighbours within one step of each other.
export function grassWarmth(x, y) {
  const n = smoothNoise(x + 0.5, y + 0.5, 20, 17);
  return Math.max(-WARMTH_LEVELS, Math.min(WARMTH_LEVELS, Math.round((n - 0.5) * 12)));
}
const warmed = (color, warmth) => (warmth === 0 ? color : mix(color, warmth > 0 ? GRASS_WARM : GRASS_COOL, Math.abs(warmth) * WARMTH_STEP));

// The part of the map a painter covers: the given range of tiles kept on the
// map, or the whole map. { x0, y0, x1, y1 }, both ends included.
function tilesToPaint(map, range) {
  if (!range) return { x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1 };
  return { x0: Math.max(0, range.x0), y0: Math.max(0, range.y0), x1: Math.min(map.width - 1, range.x1), y1: Math.min(map.height - 1, range.y1) };
}

// The cliff is shaded by the way each piece of it faces: lit toward +y, in shade toward +x.
const CLIFF_TONES = 5;
const cliffTone = (i) => mix(CLIFF_SHADE, CLIFF_LIT, i / (CLIFF_TONES - 1));

// Works out every shape of the ground once. paint(ctx, scale) then fills them;
// `scale` is the zoom of the context, so thin lines stay thin.
// With a `range` of tiles, only that part of the map is worked out, which is
// quick enough to do afresh for a close-up view.
export function createTerrainPainter(map, colors, range = null) {
  const area = tilesToPaint(map, range);

  // 1. The shore: shallows, a wash of white a little out from it, a short
  //    cliff where it faces the viewer with foam at its foot, and foam on the
  //    water's edge where it faces away.
  const shoreLines = []; // [ax, ay, bx, by] in world pixels, at the water's edge
  const cliffs = Array.from({ length: CLIFF_TONES }, () => new Path2D());
  const cliffFoot = new Path2D();
  const lip = new Path2D();
  const foam = new Path2D();
  const wash = new Path2D();
  const wetSand = new Path2D();
  const landShape = new Path2D();
  // 2. The ground, in layers from the beach up, each in broad soft patches of
  //    lighter and darker ground, with its edges rounded.
  const fills = new Map();
  // 3. Small details that say what each ground is.
  const furrows = new Path2D();
  const tufts = new Path2D();
  const tuftsLight = new Path2D();
  const sand = new Path2D();
  const flowers = FLOWER_COLORS.map(() => new Path2D());
  const bushes = new Path2D();
  const bushesLit = new Path2D();
  const stones = new Path2D();
  const undergrowth = new Path2D();

  // The shore.
  const TILE_SIDE = Math.SQRT1_2 * 64; // one tile along the ground, in pixels of the stretched picture
  for (const { a, b, nx, ny, sand: onSand } of shorePieces(map, area)) {
    const A = world(a);
    const B = world(b);
    // Which way the piece faces, on screen.
    let ox = (nx - ny) * 32;
    let oy = (nx + ny) * 16;
    const olen = Math.hypot(ox, oy) || 1;
    ox /= olen;
    oy /= olen;
    const facing = nx + ny; // above 0: toward the viewer, so its cliff shows
    const line = (path, dx, dy) => {
      path.moveTo(A.x + dx, A.y + dy);
      path.lineTo(B.x + dx, B.y + dy);
    };
    if (facing > 0.001) {
      const lit = Math.max(0, Math.min(1, ny / facing));
      const cliff = cliffs[Math.round(lit * (CLIFF_TONES - 1))];
      cliff.moveTo(A.x, A.y); cliff.lineTo(B.x, B.y); cliff.lineTo(B.x, B.y + CLIFF); cliff.lineTo(A.x, A.y + CLIFF); cliff.closePath();
      cliffFoot.moveTo(A.x, A.y + CLIFF - 2); cliffFoot.lineTo(B.x, B.y + CLIFF - 2); cliffFoot.lineTo(B.x, B.y + CLIFF); cliffFoot.lineTo(A.x, A.y + CLIFF); cliffFoot.closePath();
      line(lip, 0, 0.5);
    }
    // Foam lies at the foot of the cliff where it faces the viewer, and at the
    // water's edge where the shore faces away. Round a curve it moves smoothly
    // from one to the other, so the line of foam does not break.
    const down = Math.max(0, Math.min(1, facing / 0.4));
    line(foam, ox * (1 - down), oy * (1 - down) + CLIFF * down);
    line(wash, ox * 5, oy * 5 + CLIFF * down);
    if (onSand) line(wetSand, 0, 0);
    const drop = facing > 0.001 ? CLIFF : 0;
    shoreLines.push([A.x, A.y + drop, B.x, B.y + drop]);
  }

  // The ground, layer by layer: every kind of ground in the order the data
  // lists them, each over all the kinds that come before it. So the beach lies
  // under everything, grass over the beach, and so on, and where a layer's
  // corner is rounded off, the one beneath shows through.
  const order = Object.keys(colors).filter((t) => t !== 'water');
  const rank = new Map(order.map((t, i) => [t, i]));
  const rankAt = (x, y) => (isLand(map, x, y) ? rank.get(map.terrain[y * map.width + x]) ?? 0 : -1);
  // A tile whose four neighbours all lie in its own layer or above is never
  // rounded, so nothing beneath it can show: it is drawn in its own layer only.
  // Only tiles at the edge of a patch are drawn in the layers below theirs too.
  // That keeps the work close to one shape per tile.
  const lowest = (x, y) => {
    const own = rankAt(x, y);
    return FACING.some(([dx, dy]) => rankAt(x + dx, y + dy) < own) ? 0 : own;
  };
  // Only the tiles beside the water are needed to keep the wet sand on the land.
  const nearWater = (x, y) => FACING.some(([dx, dy]) => !isLand(map, x + dx, y + dy)) || [[1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => !isLand(map, x + dx, y + dy));
  order.forEach((kind, layer) => {
    const inside = (x, y) => rankAt(x, y) >= layer;
    const into = (x, y) => {
      const shade = groundShade(x, y);
      const warmth = kind === 'grass' ? grassWarmth(x, y) : 0;
      const key = `${layer}|${shade}|${warmth}`;
      if (!fills.has(key)) fills.set(key, { path: new Path2D(), color: tone(warmed(colors[kind], warmth), shade) });
      return fills.get(key).path;
    };
    for (let y = area.y0; y <= area.y1; y++) {
      for (let x = area.x0; x <= area.x1; x++) {
        if (inside(x, y)) {
          if (layer < lowest(x, y)) continue;
          const round = [0, 1, 2, 3].map((i) => {
            const { a, b } = aroundCorner(x, y, i);
            return !inside(...a) && !inside(...b);
          });
          roundedTile(into(x, y), x, y, round);
          if (layer === 0 && nearWater(x, y)) roundedTile(landShape, x, y, round);
          continue;
        }
        for (let i = 0; i < 4; i++) {
          const { a, b, d } = aroundCorner(x, y, i);
          if (!inside(...a) || !inside(...b) || !inside(...d)) continue;
          fillet(into(...a), x, y, i);
          if (layer === 0) fillet(landShape, x, y, i);
        }
      }
    }
  });

  // The details.
  for (let y = area.y0; y <= area.y1; y++) {
    for (let x = area.x0; x <= area.x1; x++) {
      const terrain = map.terrain[y * map.width + x];
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
      } else if (terrain === 'forest') {
        // Undergrowth: low dark bushes and ferns on the forest floor, between the trees.
        for (let i = 0; i < 3; i++) {
          const p = tileToWorld(x + 0.15 + hash2(x, y, 110 + i) * 0.7, y + 0.15 + hash2(x, y, 120 + i) * 0.7);
          const r = 2.5 + hash2(x, y, 130 + i) * 2.5;
          undergrowth.moveTo(p.x + r, p.y);
          undergrowth.ellipse(p.x, p.y, r, r * 0.55, 0, 0, Math.PI * 2);
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

  const furrowColor = tone(colors.fertile ?? colors.grass, 0.82);
  const tuftColor = tone(colors.grass, 0.78);
  const tuftLightColor = tone(colors.grass, 1.14);
  const sandColor = tone(colors.coast, 0.84);
  const wetSandColor = tone(colors.coast, 0.86);
  const bushColor = tone(colors.forest ?? colors.grass, 0.85);
  const bushLitColor = tone(colors.grass, 0.95);
  const undergrowthColor = tone(colors.forest ?? colors.grass, 0.82);

  return {
    paint(ctx, scale = 1) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // The shallows: wide soft strokes along the shore, drawn on a picture
      // stretched to twice its height and squashed back, so each band is as
      // wide in tiles whichever way the shore runs.
      if (shoreLines.length) {
        ctx.save();
        ctx.scale(1, 0.5);
        ctx.beginPath();
        for (const [ax, ay, bx, by] of shoreLines) {
          ctx.moveTo(ax, ay * 2);
          ctx.lineTo(bx, by * 2);
        }
        for (const { reach, color } of SHALLOWS) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2 * reach * TILE_SIDE;
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.strokeStyle = WASH;
      ctx.lineWidth = 2.6;
      ctx.stroke(wash);

      cliffs.forEach((path, i) => {
        const color = cliffTone(i);
        ctx.fillStyle = color;
        ctx.fill(path);
        ctx.strokeStyle = color; // closes hairline gaps between the pieces
        ctx.lineWidth = 0.8 / scale;
        ctx.stroke(path);
      });
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

      // Sand darkened by the waves, just inside the water's edge.
      ctx.save();
      ctx.clip(landShape);
      ctx.strokeStyle = wetSandColor;
      ctx.lineWidth = 7;
      ctx.stroke(wetSand);
      ctx.restore();
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
      ctx.fillStyle = undergrowthColor;
      ctx.fill(undergrowth);
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

// The trees of a forest tile: two or three, at loose places, in mixed sizes
// and shades, with now and then a round leafy tree among the pines. A tile at
// the edge of the forest has fewer, smaller trees, more of them leafy, so a
// wood thins out into the meadow instead of stopping at a line. All from
// hash2, so a forest looks the same every time. `edge` says whether the tile
// is at the edge of the forest.
const TREE_TONES = 3;
export function treesOnTile(x, y, edge = false) {
  const count = edge ? 1 + (hash2(x, y, 31) < 0.45 ? 1 : 0) : 2 + (hash2(x, y, 31) < 0.4 ? 1 : 0);
  const trees = [];
  for (let k = 0; k < count; k++) {
    // Spread out round the tile: each tree takes its own part of it.
    const angle = (k / count) * Math.PI * 2 + hash2(x, y, 32) * 6.283;
    const spread = count === 1 ? 0.12 : 0.24;
    const u = 0.5 + Math.cos(angle) * spread + (hash2(x, y, 33 + k) - 0.5) * 0.16;
    const v = 0.5 + Math.sin(angle) * spread + (hash2(x, y, 37 + k) - 0.5) * 0.16;
    const c = tileToWorld(x + u, y + v);
    const grown = hash2(x, y, 41 + k);
    trees.push({
      cx: c.x,
      cy: c.y,
      size: edge ? 0.6 + grown * 0.35 : 0.72 + grown * 0.5,
      leafy: hash2(x, y, 45 + k) < (edge ? 0.38 : 0.16),
      tone: Math.floor(hash2(x, y, 49 + k) * TREE_TONES),
    });
  }
  // Far ones first, so a nearer tree covers the one behind it.
  return trees.sort((a, b) => a.cy - b.cy);
}

// Whether a forest tile has a tile of something else beside it.
const forestEdge = (map, x, y) => FACING.some(([dx, dy]) => {
  const nx = x + dx;
  const ny = y + dy;
  return nx < 0 || ny < 0 || nx >= map.width || ny >= map.height || map.terrain[ny * map.width + nx] !== 'forest';
});

// Shades for pines and for leafy trees: [lit, shaded].
const PINES = [[TREE.pine, TREE.pineShade], ['#3b7d47', '#295c35'], ['#265a37', '#1a4128']];
const LEAVES = [[TREE.leaf, TREE.leafShade], ['#64a04a', '#4a7d38'], ['#78a346', '#5b7f35']];

// Adds one tree's shapes to a set of paths, one path per color.
function addTree(paths, { cx, cy, size, leafy, tone }) {
  paths.shadow.moveTo(cx + 13 * size, cy + 1);
  paths.shadow.ellipse(cx + 4 * size, cy + 1, 9 * size, 4 * size, 0, 0, Math.PI * 2);
  paths.trunk.rect(cx - 1.3, cy - 5 * size, 2.6, 6 * size);
  // Which shades are in use, so the empty ones are not filled.
  paths.used.add(`${leafy ? 'leaf' : 'pine'}${tone}`);
  if (leafy) {
    // A round leafy tree: a shaded crown, a lit one up and to the left, and a highlight.
    const [lit, shade] = [paths.leaf[tone], paths.leafShade[tone]];
    shade.moveTo(cx + 1.5 + 8.5 * size, cy - 13 * size);
    shade.arc(cx + 1.5, cy - 13 * size, 8.5 * size, 0, Math.PI * 2);
    lit.moveTo(cx - 1.5 + 6.5 * size, cy - 15 * size);
    lit.arc(cx - 1.5, cy - 15 * size, 6.5 * size, 0, Math.PI * 2);
    paths.glint.moveTo(cx - 3 + 2.6 * size, cy - 18 * size);
    paths.glint.arc(cx - 3, cy - 18 * size, 2.6 * size, 0, Math.PI * 2);
    return;
  }
  // A pine: three tiers, lit on the left and shaded on the right.
  const [lit, shade] = [paths.pine[tone], paths.pineShade[tone]];
  for (let tier = 0; tier < 3; tier++) {
    const base = cy - (4 + tier * 7) * size;
    const top = base - 11 * size;
    const half = (9.5 - tier * 2.2) * size;
    shade.moveTo(cx, top);
    shade.lineTo(cx + half, base);
    shade.lineTo(cx, base);
    shade.closePath();
    lit.moveTo(cx, top);
    lit.lineTo(cx - half, base);
    lit.lineTo(cx, base);
    lit.closePath();
  }
}

const newTreePaths = () => ({
  shadow: new Path2D(),
  trunk: new Path2D(),
  pine: PINES.map(() => new Path2D()),
  pineShade: PINES.map(() => new Path2D()),
  leaf: LEAVES.map(() => new Path2D()),
  leafShade: LEAVES.map(() => new Path2D()),
  glint: new Path2D(),
  used: new Set(),
});

function fillTreePaths(ctx, paths) {
  ctx.fillStyle = TREE.shadow;
  ctx.fill(paths.shadow);
  ctx.fillStyle = TREE.trunk;
  ctx.fill(paths.trunk);
  PINES.forEach(([lit, shade], i) => {
    if (!paths.used.has(`pine${i}`)) return;
    ctx.fillStyle = shade;
    ctx.fill(paths.pineShade[i]);
    ctx.fillStyle = lit;
    ctx.fill(paths.pine[i]);
  });
  LEAVES.forEach(([lit, shade], i) => {
    if (!paths.used.has(`leaf${i}`)) return;
    ctx.fillStyle = shade;
    ctx.fill(paths.leafShade[i]);
    ctx.fillStyle = lit;
    ctx.fill(paths.leaf[i]);
  });
  if (LEAVES.some((_, i) => paths.used.has(`leaf${i}`))) {
    ctx.fillStyle = 'rgba(255, 255, 220, 0.16)';
    ctx.fill(paths.glint);
  }
}

// A few trees drawn together. Used for the trees that stand close to a
// building and so have to be drawn in order with it. `tiles` is a list of
// { x, y }, far to near; `map`, when given, says which are at the forest's edge.
export function paintTrees(ctx, tiles, map = null) {
  if (tiles.length === 0) return;
  const paths = newTreePaths();
  for (const tile of tiles) {
    for (const tree of treesOnTile(tile.x, tile.y, map ? forestEdge(map, tile.x, tile.y) : false)) addTree(paths, tree);
  }
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
    for (const tree of treesOnTile(x, y, forestEdge(map, x, y))) addTree(rows[rows.length - 1], tree);
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

// Roads that join up, drawn as a band along the middle of each road tile
// toward every neighbouring road or building. Where a road turns, it bends in
// a curve instead of a corner, so a road laid in steps reads as a smooth bend.
// The shapes are rebuilt only when a road or building is added or removed.
//
// A band of the same width on screen is the same width in tiles whichever way
// the road runs, because both directions of the tile grid slope equally.
export const ROAD_WIDTH = 17;      // pixels at zoom 1: 0.6 of a tile
const ROAD_EDGE_WIDTH = 21;       // the darker verge, 0.74 of a tile
export function createRoadPainter(color) {
  let stamp = null;
  let lastState = null;
  let shapes = null;

  function build(state) {
    const map = state.map;
    const middle = new Path2D();
    const squares = new Path2D();
    const driveVerge = new Path2D();
    const drive = new Path2D();
    const pebbles = new Path2D();
    const on = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height;
    const isRoad = (x, y) => on(x, y) && state.roads[y * map.width + x] === 1;
    const isBuilding = (x, y) => on(x, y) && state.roads[y * map.width + x] !== 1 && state.occupancy[y * map.width + x] !== 0;
    const at = (tx, ty) => tileToWorld(tx, ty);
    let count = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!state.roads[y * map.width + x]) continue;
        count++;
        const c = at(x + 0.5, y + 0.5);
        const sides = FACING.filter(([dx, dy]) => isRoad(x + dx, y + dy));
        // A road that runs past a building needs no drive; one that ends at it does.
        const drives = sides.length > 1 ? [] : FACING.filter(([dx, dy]) => isBuilding(x + dx, y + dy));
        const edge = ([dx, dy]) => at(x + 0.5 + dx / 2, y + 0.5 + dy / 2);
        // The pieces of this tile's road, each from a to b, bending round c when `bend`.
        // It bends only between two roads at a corner, and not where the road
        // fills the corner too (a square of road tiles).
        const pieces = [];
        const turn = sides.length === 2 && sides[0][0] + sides[1][0] !== 0 && sides[0][1] + sides[1][1] !== 0;
        if (turn && !isRoad(x + sides[0][0] + sides[1][0], y + sides[0][1] + sides[1][1])) pieces.push({ a: edge(sides[0]), b: edge(sides[1]), bend: c });
        else if (sides.length === 2 && !turn) pieces.push({ a: edge(sides[0]), b: edge(sides[1]) });
        else for (const side of sides) pieces.push({ a: c, b: edge(side) });
        if (pieces.length === 0) pieces.push({ a: c, b: c });
        // A short straight drive to each building at the end of the road, square
        // at the building's end so it stops at the edge of the plot.
        for (const [dx, dy] of drives) {
          for (const [path, half] of [[driveVerge, 0.37], [drive, 0.3]]) {
            const ends = dx !== 0
              ? [[0.5, 0.5 - half], [0.5 + dx / 2, 0.5 - half], [0.5 + dx / 2, 0.5 + half], [0.5, 0.5 + half]]
              : [[0.5 - half, 0.5], [0.5 - half, 0.5 + dy / 2], [0.5 + half, 0.5 + dy / 2], [0.5 + half, 0.5]];
            const points = ends.map(([u, v]) => at(x + u, y + v));
            path.moveTo(points[0].x, points[0].y);
            for (const p of points.slice(1)) path.lineTo(p.x, p.y);
            path.closePath();
          }
        }
        // Where four road tiles meet round a corner, the corner is road too.
        for (let i = 0; i < 4; i++) {
          const { a, b, d } = aroundCorner(x, y, i);
          if (!isRoad(...a) || !isRoad(...b) || !isRoad(...d)) continue;
          const [px, py] = CORNER[i];
          const ends = [[0.5, 0], [0, 0.5], [-0.5, 0], [0, -0.5]].map(([u, v]) => at(x + px + u, y + py + v));
          squares.moveTo(ends[0].x, ends[0].y);
          for (const p of ends.slice(1)) squares.lineTo(p.x, p.y);
          squares.closePath();
        }
        for (const { a, b, bend } of pieces) {
          middle.moveTo(a.x, a.y);
          if (bend) middle.quadraticCurveTo(bend.x, bend.y, b.x, b.y);
          else middle.lineTo(b.x + (a.x === b.x && a.y === b.y ? 0.01 : 0), b.y);
        }
        // A few pebbles, on the road itself.
        for (let i = 0; i < 3; i++) {
          const { a, b, bend } = pieces[Math.floor(hash2(x, y, 60 + i) * pieces.length)];
          const t = 0.15 + hash2(x, y, 70 + i) * 0.7;
          const u = 1 - t;
          const mid = bend ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const px = u * u * a.x + 2 * u * t * mid.x + t * t * b.x + (hash2(x, y, 80 + i) - 0.5) * 9;
          const py = u * u * a.y + 2 * u * t * mid.y + t * t * b.y + (hash2(x, y, 90 + i) - 0.5) * 5;
          pebbles.moveTo(px + 1, py);
          pebbles.arc(px, py, 1, 0, Math.PI * 2);
        }
      }
    }
    return { middle, squares, driveVerge, drive, pebbles, count };
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
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const verge = tone(color, 0.7);
      ctx.strokeStyle = verge;
      ctx.lineWidth = ROAD_EDGE_WIDTH;
      ctx.stroke(shapes.middle);
      ctx.fillStyle = verge;
      ctx.fill(shapes.driveVerge);
      ctx.strokeStyle = color;
      ctx.lineWidth = ROAD_WIDTH;
      ctx.stroke(shapes.middle);
      ctx.fillStyle = color;
      ctx.fill(shapes.drive);
      ctx.fill(shapes.squares);
      ctx.fillStyle = tone(color, 0.82);
      ctx.fill(shapes.pebbles);
    },
  };
}
