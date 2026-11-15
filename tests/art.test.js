// The art cannot be judged by a test, but it can be kept honest: every building
// has a drawing, every drawing runs in every state without failing, stays
// roughly where the building is, never produces a broken color, and never
// changes the game. Drawing is done on a stand-in canvas that records what it
// was asked to draw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { createGame } from '../src/sim/index.js';
import { createKit, tone, mix, hash2 } from '../src/render/art/kit.js';
import { ART_USES, BUILDING_ART, LIVE_ART, artFor, artIdFor, artStateKey, houseLook } from '../src/render/art/buildings.js';
import { sharpnessFor } from '../src/render/art/sprites.js';
import { paintBox } from '../src/render/art/box.js';
import { ROUND, WARMTH_LEVELS, createForestPainter, createRoadPainter, createTerrainPainter, grassWarmth, gridLines, groundShade, paintGrid, paintTree, paintTrees, paintWater, shorePieces, treesOnTile, waterBackground } from '../src/render/art/terrain.js';
import { buildingVisual } from '../src/render/visuals.js';
import { paintActors } from '../src/render/art/actors.js';
import { paintDust } from '../src/render/art/dust.js';
import { tileToWorld } from '../src/render/iso.js';
import { boxSilhouette } from '../src/render/iso.js';
import { execute } from '../src/sim/index.js';
import { richGame, place, road, line, snapshot } from './helpers.js';

// ---- a stand-in canvas -----------------------------------------------------------
// Records every point and every color it is given.
function recorder() {
  const points = [];
  const colors = [];
  const note = (x, y) => points.push([x, y]);
  const shapes = [];
  const target = {
    fill: (path) => { if (path) shapes.push(path); },
    stroke: (path) => { if (path) shapes.push(path); },
    moveTo: note, lineTo: note,
    arc: (x, y, r) => { note(x - r, y - r); note(x + r, y + r); },
    ellipse: (x, y, rx, ry) => { note(x - rx, y - ry); note(x + rx, y + ry); },
    rect: (x, y, w, h) => { note(x, y); note(x + w, y + h); },
    fillRect: (x, y, w, h) => { note(x, y); note(x + w, y + h); },
    roundRect: (x, y, w, h) => { note(x, y); note(x + w, y + h); },
    quadraticCurveTo: (cx, cy, x, y) => { note(cx, cy); note(x, y); },
    createLinearGradient: () => ({ addColorStop: (stop, color) => colors.push(color) }),
  };
  const ctx = new Proxy(target, {
    get: (t, key) => (key in t ? t[key] : () => {}),
    set: (t, key, value) => {
      if (key === 'fillStyle' || key === 'strokeStyle') colors.push(value);
      t[key] = value;
      return true;
    },
  });
  return { ctx, points, colors, shapes };
}
// Shapes that are built up before being drawn (the renderer uses these in the browser).
globalThis.Path2D ??= class {
  constructor() { this.points = []; }
  moveTo(x, y) { this.points.push([x, y]); }
  lineTo(x, y) { this.points.push([x, y]); }
  arc(x, y) { this.points.push([x, y]); }
  ellipse(x, y) { this.points.push([x, y]); }
  rect(x, y, w, h) { this.points.push([x, y], [x + w, y + h]); }
  quadraticCurveTo(cx, cy, x, y) { this.points.push([x, y]); this.curves = (this.curves ?? 0) + 1; }
  closePath() {}
};
// How many points were handed to fill() or stroke() as ready-made shapes.
const worldToTileOf = (wx, wy) => ({ x: (wx / 32 + wy / 16) / 2, y: (wy / 16 - wx / 32) / 2 });
const shapePoints = (calls) => calls.reduce((sum, path) => sum + (path?.points?.length ?? 0), 0);

// Whether an "rgb(r, g, b)" color is a light or dark, warm or cool shade of a
// hex color. The kinds of ground in the tests are much further apart than this.
function colorNear(rgb, hex) {
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  const [hr, hg, hb] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.abs(r - hr) <= 26 && Math.abs(g - hg) <= 26 && Math.abs(b - hb) <= 26;
}
const validColor = (c) => typeof c !== 'string' || /^#[0-9a-f]{6}$/i.test(c) || /^rgba?\((\s*\d+(\.\d+)?\s*,){2,3}\s*\d+(\.\d+)?\s*\)$/.test(c);

// ---- colors ---------------------------------------------------------------------

test('tone darkens and lightens a hex color', () => {
  assert.equal(tone('#804020', 0.5), 'rgb(64, 32, 16)');
  assert.equal(tone('#804020', 10), 'rgb(255, 255, 255)');
});

test('mix blends two colors and gives back hex, so the result can be toned or mixed again', () => {
  assert.equal(mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(mix('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mix('#102030', '#304050', 0.5), '#203040');
  // The crop rows once drew black because a mixed color could not be toned.
  assert.equal(tone(mix('#6f9a42', '#e0c04a', 0.5), 1), 'rgb(168, 173, 70)');
});

test('hash2 is repeatable, stays between 0 and 1, and varies', () => {
  const seen = new Set();
  for (let x = 0; x < 30; x++) {
    for (let y = 0; y < 30; y++) {
      const h = hash2(x, y, 3);
      assert.ok(h >= 0 && h < 1);
      assert.equal(h, hash2(x, y, 3));
      seen.add(Math.floor(h * 10));
    }
  }
  assert.equal(seen.size, 10, 'values land in every tenth of the range');
});

// ---- buildings ------------------------------------------------------------------

test('every building and every house tier in the data has drawn art', () => {
  const game = createGame(loadData());
  for (const [id, def] of Object.entries(game.rules.buildings)) {
    if (def.category === 'road') continue; // roads are drawn as part of the ground
    const fake = { type: id, x: 0, y: 0, house: def.housingTier ? { tier: def.housingTier, residents: 0 } : undefined };
    assert.ok(artFor(game.rules, fake), `${id} has no art`);
  }
  for (const [id, tier] of Object.entries(game.rules.tiers)) {
    assert.ok(BUILDING_ART[tier.visual?.art], `tier ${id} has no art`);
  }
});

test('every drawing runs in every state, draws something, and uses only valid colors', () => {
  const states = [
    { working: false, progress: 0, residents: 0, time: 0 },
    { working: true, progress: 0.5, residents: 3, time: 1.37 },
    { working: true, progress: 1, residents: 8, time: 99.9 },
  ];
  for (const [id, art] of Object.entries(BUILDING_ART)) {
    for (const state of states) {
      for (const h of [13, 22, 33]) {
        const { ctx, points, colors } = recorder();
        art(createKit(ctx, 5, 7), { h, color: '#c46f3a', ...state });
        assert.ok(points.length >= 20, `${id} drew only ${points.length} points`);
        for (const [x, y] of points) assert.ok(Number.isFinite(x) && Number.isFinite(y), `${id} drew a broken point`);
        for (const c of colors) assert.ok(validColor(c), `${id} used a broken color: ${c}`);
      }
    }
  }
});

test('every drawing stays on and above its own footprint', () => {
  const game = createGame(loadData());
  const { rules } = game;
  const cases = Object.entries(rules.buildings).filter(([, def]) => def.category !== 'road').map(([id, def]) => ({ id, def, tier: def.housingTier }));
  cases.push({ id: 'house', def: rules.buildings.house, tier: 'worker' });
  for (const { id, def, tier } of cases) {
    const fake = { type: id, x: 10, y: 10, house: tier ? { tier, residents: 8 } : undefined };
    const visual = buildingVisual(rules, fake);
    const outline = boxSilhouette(10, 10, def.w, def.h, visual.risePx);
    const left = Math.min(...outline.map((p) => p.x));
    const right = Math.max(...outline.map((p) => p.x));
    const top = Math.min(...outline.map((p) => p.y));
    const bottom = Math.max(...outline.map((p) => p.y));
    const { ctx, points } = recorder();
    artFor(rules, fake)(createKit(ctx, 10, 10), { h: visual.risePx, color: visual.color, working: true, progress: 1, residents: 8, time: 0.5 });
    for (const [x, y] of points) {
      assert.ok(x >= left - 8 && x <= right + 8, `${id} (${tier ?? 'no tier'}) draws ${Math.round(x - right)} px outside its sides`);
      assert.ok(y <= bottom + 4, `${id} draws below its footprint`);
      assert.ok(y >= top - visual.risePx * 0.6 - 30, `${id} draws far above itself`);
    }
  }
});

test('a building with no art in the data falls back to a plain box', () => {
  const data = loadData();
  data.goods.stone = { name: 'Stone', color: '#999999' };
  data.buildings.quarry = {
    name: 'Quarry', category: 'producer', size: [2, 2], cost: { coins: 5, goods: {} }, upkeepPerMinute: 1, requiresRoad: true,
    production: { cycleSeconds: 2, inputs: {}, outputs: { stone: 1 } }, visual: { color: '#8a8f99', height: 0.6 },
  };
  const game = createGame(data);
  const fake = { type: 'quarry', x: 3, y: 3 };
  assert.equal(artFor(game.rules, fake), null);
  const { ctx, points } = recorder();
  paintBox(ctx, 3, 3, game.rules.buildings.quarry, buildingVisual(game.rules, fake));
  assert.ok(points.length >= 12, 'the box was drawn');
});

test('an unknown art name in the data also falls back, and does not fail', () => {
  const data = loadData();
  data.buildings.sawmill.visual.art = 'cathedral';
  const game = createGame(data);
  assert.equal(artFor(game.rules, { type: 'sawmill', x: 0, y: 0 }), null);
});

// ---- ground, trees, roads, water ------------------------------------------------

// A small map from rows of text: # is beach, . is water.
function sketchMap(rows) {
  const terrain = rows.join('').split('').map((c) => (c === '#' ? 'coast' : 'water'));
  return { width: rows[0].length, height: rows.length, terrain };
}
const wholeMap = (map) => ({ x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1 });

test('a lone tile of land has a round shore, facing out to sea all the way round', () => {
  const map = sketchMap(['...', '.#.', '...']);
  const pieces = shorePieces(map, wholeMap(map));
  // Four rounded corners and no straight sides left between them.
  assert.equal(pieces.length, 24);
  for (const { a, b, nx, ny } of pieces) {
    // Every piece faces away from the middle of the tile.
    const mx = (a[0] + b[0]) / 2 - 1.5;
    const my = (a[1] + b[1]) / 2 - 1.5;
    assert.ok(nx * mx + ny * my > 0, 'a piece of shore faces inland');
    // And lies on the tile, inside its corners.
    for (const [x, y] of [a, b]) assert.ok(x >= 1 && x <= 2 && y >= 1 && y <= 2);
  }
  // It touches the middle of each side.
  for (const [x, y] of [[1.5, 1], [2, 1.5], [1.5, 2], [1, 1.5]]) {
    assert.ok(pieces.some(({ a, b }) => [a, b].some(([px, py]) => Math.hypot(px - x, py - y) < 1e-9)), `the shore misses the side at ${x}, ${y}`);
  }
});

test('a straight shore stays straight, and an inside corner is filled with a curve facing the water', () => {
  const straight = sketchMap(['....', '####', '####']);
  const sides = shorePieces(straight, { x0: 1, y0: 0, x1: 2, y1: 1 });
  assert.ok(sides.length > 0);
  for (const { a, b, nx, ny } of sides) {
    assert.deepEqual([nx, ny], [0, -1]);
    assert.equal(a[1], 1);
    assert.equal(b[1], 1);
  }
  // Land on two sides of a water tile, and across its corner too.
  const inside = sketchMap(['###', '##.', '...']);
  const pieces = shorePieces(inside, wholeMap(inside));
  const curve = pieces.filter(({ a }) => a[0] > 1.9 && a[0] < 2.6 && a[1] > 0.9 && a[1] < 1.6);
  assert.ok(curve.length >= 6, 'no curve in the inside corner');
  for (const { a, b, nx, ny } of curve) {
    // Facing into the water tile (2, 1), away from the corner it fills.
    assert.ok(nx * ((a[0] + b[0]) / 2 - 2) + ny * ((a[1] + b[1]) / 2 - 1) > 0);
  }
});

test('rounding the shore never moves it over the middle of a tile, so what looks like land is land', () => {
  for (const map of [createGame(loadData()).state.map, createGame(loadData(), { seed: 42 }).state.map]) {
    const pieces = shorePieces(map, wholeMap(map));
    assert.ok(pieces.length > 400);
    for (const { a, b } of pieces) {
      for (const [x, y] of [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]) {
        // The nearest tile middle is never closer than a third of a tile.
        const cx = Math.floor(x - 0.5) + 0.5;
        const cy = Math.floor(y - 0.5) + 0.5;
        for (const [tx, ty] of [[cx, cy], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1]]) {
          assert.ok(Math.hypot(x - tx, y - ty) >= 1 / 3, `the shore passes ${Math.hypot(x - tx, y - ty).toFixed(2)} from the middle of tile ${tx - 0.5}, ${ty - 0.5}`);
        }
      }
    }
  }
  assert.ok(ROUND > 0 && ROUND <= 0.5, 'rounding more than half a tile would overlap the next corner');
});

test('where one kind of ground ends, its corners are rounded off', () => {
  // A square of fertile land in grass: the fertile layer is drawn with curves,
  // the grass around it with none of its own.
  const terrain = Array(36).fill('grass');
  for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]]) terrain[y * 6 + x] = 'fertile';
  const map = { width: 6, height: 6, terrain };
  const colors = { water: '#3f7fae', coast: '#d9c38f', grass: '#7fb26a', fertile: '#a58a5a', forest: '#5d9a58' };
  const r = styledRecorder();
  createTerrainPainter(map, colors).paint(r.ctx, 1);
  const curvesIn = (base) => r.drawn.filter((d) => d.path && d.color.startsWith('rgb') && d.path.curves && colorNear(d.color, base)).reduce((n, d) => n + d.path.curves, 0);
  // Four outer corners, each drawn once as a fill and once as its hairline.
  assert.equal(curvesIn(colors.fertile), 8, 'the patch of fertile land is not rounded at its four corners');
  // Grass is rounded only where the land itself ends, at the corners of this little map.
  assert.equal(curvesIn(colors.grass), curvesIn(colors.coast), 'grass was rounded against the fertile land beside it');
});

test('the ground, forest and water all draw on the real island without failing', () => {
  const game = createGame(loadData());
  const map = game.state.map;
  const colors = {};
  for (const [id, t] of Object.entries(game.rules.map.terrain)) colors[id] = t.color;

  const ground = recorder();
  createTerrainPainter(map, colors).paint(ground.ctx, 1);
  for (const c of ground.colors) assert.ok(validColor(c), `ground used a broken color: ${c}`);
  const land = map.terrain.filter((t) => t !== 'water').length;
  assert.ok(shapePoints(ground.shapes) >= land * 4, 'every land tile is in the ground shapes');

  const trees = recorder();
  const forest = createForestPainter(map);
  forest.paint(trees.ctx);
  assert.equal(forest.count, map.terrain.filter((t) => t === 'forest').length);
  assert.ok(shapePoints(trees.shapes) >= forest.count * 4, 'every tree is in the forest shapes');

  const one = recorder();
  paintTree(one.ctx, 10, 10);
  assert.ok(shapePoints(one.shapes) >= 4, 'a single tree can be drawn on its own');

  const water = recorder();
  paintWater(water.ctx, { width: 1280, height: 720 }, { x: 0, y: 1024, zoom: 1 }, 12.3);
  paintWater(water.ctx, { width: 1280, height: 720 }, { x: 0, y: 1024, zoom: 0.35 }, 0);
  for (const c of water.colors) assert.ok(validColor(c), `water used a broken color: ${c}`);
  assert.ok(shapePoints(water.shapes) > 50, 'the water has glints');
  assert.match(waterBackground(colors.water), /^linear-gradient\(180deg, rgb\(\d+, \d+, \d+\), rgb\(\d+, \d+, \d+\)\)$/);
});

test('roads draw only where there are roads, and are redrawn when something changes', () => {
  const game = richGame();
  const painter = createRoadPainter('#cdbb93');
  const empty = recorder();
  painter.paint(empty.ctx, game.state);
  assert.equal(empty.shapes.length, 0, 'nothing is drawn with no roads');

  road(game, line(12, 9, 16, 9));
  const some = recorder();
  painter.paint(some.ctx, game.state);
  const five = shapePoints(some.shapes);
  assert.ok(five > 0);

  // Same number of road tiles, in different places: the shapes must still be rebuilt.
  execute(game, { action: 'demolish', x: 16, y: 9 });
  road(game, [[12, 8]]);
  const moved = recorder();
  painter.paint(moved.ctx, game.state);
  assert.notDeepEqual(moved.shapes[0].points, some.shapes[0].points);

  // A building at the end of a road gets a short drive to it; one beside a
  // road that runs on past it does not.
  place(game, 'house', 13, 10);
  const beside = recorder();
  painter.paint(beside.ctx, game.state);
  assert.equal(shapePoints(beside.shapes), shapePoints(moved.shapes), 'a road running past a house drew a drive');
  execute(game, { action: 'demolish', x: 14, y: 9 });
  execute(game, { action: 'demolish', x: 15, y: 9 });
  road(game, [[13, 9]]);
  const ending = recorder();
  painter.paint(ending.ctx, game.state);
  assert.ok(shapePoints(ending.shapes) > 0);
  const drives = ending.shapes.filter((shape) => shape.points.length > 0 && !shape.curves);
  assert.ok(drives.length >= 3, 'no drive where the road ends at the house');
});

test('a road laid in steps bends in curves; a straight road and a square of road do not', () => {
  const curves = (tiles) => {
    const game = richGame();
    road(game, tiles);
    const r = recorder();
    createRoadPainter('#cdbb93').paint(r.ctx, game.state);
    return r.shapes.reduce((n, shape) => n + (shape.curves ?? 0), 0);
  };
  assert.equal(curves(line(12, 9, 16, 9)), 0, 'a straight road bent');
  // A staircase: every tile but the two ends turns a corner.
  assert.ok(curves([[12, 6], [13, 6], [13, 7], [14, 7], [14, 8], [15, 8]]) >= 4 * 2, 'a road in steps did not bend');
  // A square of four road tiles: no bends, and its middle is filled in.
  assert.equal(curves([[12, 6], [13, 6], [13, 7], [12, 7]]), 0, 'a square of road bent round its middle');
});

test('each drawing declares what changes its look, and looks the same otherwise', () => {
  for (const id of Object.keys(ART_USES)) assert.ok(BUILDING_ART[id], `ART_USES names "${id}", which has no drawing`);
  for (const id of Object.keys(LIVE_ART)) assert.ok(BUILDING_ART[id], `LIVE_ART names "${id}", which has no drawing`);
  const base = { h: 22, color: '#c46f3a', working: false, progress: 0.1, residents: 0, time: 0 };
  const drawn = (id, info) => {
    const r = recorder();
    BUILDING_ART[id](createKit(r.ctx, 0, 0), info);
    return JSON.stringify([r.points, r.colors]);
  };
  for (const id of Object.keys(BUILDING_ART)) {
    // Time must never change the stored picture: moving parts belong in LIVE_ART.
    assert.equal(drawn(id, base), drawn(id, { ...base, time: 123.4 }), `${id} changes with time`);
    // Any input that changes the picture must also change the key it is stored under.
    for (const change of [{ working: true }, { progress: 0.9 }, { residents: 5 }]) {
      const other = { ...base, ...change };
      if (drawn(id, base) !== drawn(id, other)) {
        assert.notEqual(artStateKey(id, base), artStateKey(id, other), `${id} looks different for ${JSON.stringify(change)} but is stored under the same key`);
      }
    }
  }
});

test('moving parts draw only while a producer is working or a house is lived in', () => {
  assert.deepEqual(Object.keys(LIVE_ART).sort(), ['bakery', 'cottage', 'guildhouse', 'sawmill', 'townhouse']);
  for (const [id, live] of Object.entries(LIVE_ART)) {
    const idle = recorder();
    live(createKit(idle.ctx, 0, 0), { h: 22, color: '#c46f3a', working: false, progress: 0, residents: 0, time: 1 });
    assert.equal(idle.points.length, 0, `${id} moves while idle or empty`);
    const busy = recorder();
    live(createKit(busy.ctx, 0, 0), { h: 22, color: '#c46f3a', working: true, progress: 0.5, residents: 4, time: 1 });
    assert.ok(busy.points.length > 0, `${id} shows nothing while working`);
    for (const c of busy.colors) assert.ok(validColor(c), `${id} used a broken color: ${c}`);
  }
});

test('stored pictures get sharper in steps as the view zooms in', () => {
  assert.equal(sharpnessFor(0.35), 0.6);
  assert.equal(sharpnessFor(0.6), 0.6);
  assert.equal(sharpnessFor(0.7), 1);
  assert.equal(sharpnessFor(1), 1);
  assert.equal(sharpnessFor(1.5), 2);
  assert.equal(sharpnessFor(2.4), 3);
  assert.equal(sharpnessFor(4.5), 4.5);
  // A picture is never shown at much less than half the size it was drawn at.
  for (let scale = 0.35; scale <= 4.5; scale += 0.05) {
    assert.ok(scale / sharpnessFor(scale) >= 0.5, `at scale ${scale.toFixed(2)} a picture is shrunk to ${(scale / sharpnessFor(scale)).toFixed(2)}`);
  }
});

test('a building knows the name of its art, and a house takes its tier\'s', () => {
  const game = richGame();
  const house = place(game, 'house', 16, 11);
  assert.equal(artIdFor(game.rules, house), 'cottage');
  house.house.tier = 'worker';
  assert.equal(artIdFor(game.rules, house), 'townhouse');
  assert.equal(artIdFor(game.rules, game.state.buildings[0]), 'warehouse');
});

test('drawing never changes the game', () => {
  const game = richGame();
  place(game, 'house', 16, 11);
  place(game, 'farm', 14, 3);
  place(game, 'bakery', 13, 13);
  road(game, line(12, 9, 16, 9));
  const before = snapshot(game);
  for (const b of game.state.buildings) {
    const { ctx } = recorder();
    const visual = buildingVisual(game.rules, b);
    const info = { h: visual.risePx, color: visual.color, working: true, progress: 0.4, residents: 2, time: 3 };
    artFor(game.rules, b)(createKit(ctx, b.x, b.y), info);
    LIVE_ART[artIdFor(game.rules, b)]?.(createKit(ctx, b.x, b.y), info);
  }
  const { ctx } = recorder();
  const colors = {};
  for (const [id, t] of Object.entries(game.rules.map.terrain)) colors[id] = t.color;
  createTerrainPainter(game.state.map, colors).paint(ctx, 1);
  createForestPainter(game.state.map).paint(ctx);
  createRoadPainter('#cdbb93').paint(ctx, game.state);
  assert.equal(snapshot(game), before);
});

// ---- walkers, carts and boats -----------------------------------------------------

test('walkers, carts and boats draw with valid colors, close to where they stand', () => {
  const goods = { fish: { color: '#5aa7d6' } };
  const actors = [
    { kind: 'walker', id: 1, tier: 'farmer', look: 3, x: 10.4, y: 12.5, dx: 1, dy: 0, stride: 2.3 },
    { kind: 'walker', id: 2, tier: 'worker', look: 8, x: 11.5, y: 12.6, dx: 0, dy: -1, stride: 0.7 },
    { kind: 'walker', id: 3, tier: null, look: 0, x: 12.5, y: 12.5, dx: -1, dy: 0, stride: 0 },
    { kind: 'cart', id: 4, good: 'fish', look: 5, x: 13.5, y: 12.5, dx: 0, dy: 1, stride: 4.1 },
    { kind: 'cart', id: 5, good: 'a good with no color', look: 5, x: 14.5, y: 12.5, dx: 1, dy: 0, stride: 1 },
    { kind: 'boat', id: 6, look: 6, x: 20.5, y: 3.5, dx: 2, dy: -1, fishing: true, manned: true },
    { kind: 'boat', id: 7, look: 7, x: 21.5, y: 3.5, dx: -1, dy: 0, fishing: false, manned: false },
  ];
  for (const actor of actors) {
    const { ctx, points, colors } = recorder();
    paintActors(ctx, [actor], goods, 12.3);
    assert.ok(points.length >= 8, `a ${actor.kind} drew almost nothing`);
    for (const c of colors) assert.ok(validColor(c), `a ${actor.kind} used a broken color: ${c}`);
    const at = tileToWorld(actor.x, actor.y);
    for (const [x, y] of points) {
      assert.ok(Math.abs(x - at.x) <= 14 && y >= at.y - 16 && y <= at.y + 12, `a ${actor.kind} drew ${(x - at.x).toFixed(1)}, ${(y - at.y).toFixed(1)} from where it stands`);
    }
  }
  // A cart shows the color of what it carries.
  const loaded = recorder();
  paintActors(loaded.ctx, [actors[3]], goods, 0);
  assert.ok(loaded.colors.includes('#5aa7d6'));
  // An empty boat has no fisherman and no rod: it draws less.
  const manned = recorder();
  const empty = recorder();
  paintActors(manned.ctx, [actors[5]], goods, 0);
  paintActors(empty.ctx, [actors[6]], goods, 0);
  assert.ok(manned.points.length > empty.points.length);
  // Something that is not a walker, cart or boat is skipped, not an error.
  const odd = recorder();
  paintActors(odd.ctx, [{ kind: 'dragon', x: 1, y: 1 }], goods, 0);
  assert.equal(odd.points.length, 0);
});

// ---- four looks for each house ---------------------------------------------------

test('houses take each of the four looks about as often, not in the order they were built', () => {
  const looks = Array.from({ length: 400 }, (_, i) => houseLook(i + 1));
  for (let look = 0; look < 4; look++) {
    const n = looks.filter((l) => l === look).length;
    assert.ok(n > 70 && n < 130, `look ${look} comes up ${n} times in 400`);
  }
  // Not a repeating pattern: the next look is not simply the last plus one.
  const inOrder = looks.slice(1).filter((l, i) => l === (looks[i] + 1) % 4).length;
  assert.ok(inOrder < 150, `${inOrder} of 399 houses follow in order`);
  assert.equal(houseLook(17), houseLook(17));
  assert.equal(houseLook(undefined), 0);
});

test('each kind of house has four looks, and nothing else changes with the look', () => {
  const info = (variant) => ({ h: 30, color: '#b9553a', working: false, progress: 0, residents: 4, time: 0, variant });
  for (const id of ['cottage', 'townhouse', 'guildhouse']) {
    const drawn = [0, 1, 2, 3].map((variant) => {
      const { ctx, points, colors } = recorder();
      BUILDING_ART[id](createKit(ctx, 0, 0), info(variant));
      for (const c of colors) assert.ok(validColor(c), `${id} look ${variant} used a broken color: ${c}`);
      return JSON.stringify([points, colors]);
    });
    assert.equal(new Set(drawn).size, 4, `${id} does not have four different looks`);
    // Each look has a roof and walls of its own color, clearly apart, not only a detail moved.
    const paint = [0, 1, 2, 3].map((variant) => {
      const kit = createKit(recorder().ctx, 0, 0);
      let roof = null;
      let wall = null;
      const watched = new Proxy(kit, { get: (t, key) => (key === 'gable' ? (...args) => { roof = args[6]; wall = args[7]?.wall; return t.gable(...args); } : t[key]) });
      BUILDING_ART[id](watched, info(variant));
      return { roof, wall };
    });
    const apart = (a, b) => [1, 3, 5].reduce((sum, i) => sum + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)), 0);
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        assert.ok(apart(paint[i].roof, paint[j].roof) >= 30, `${id}: looks ${i} and ${j} have roofs of nearly the same color`);
        assert.ok(apart(paint[i].wall, paint[j].wall) >= 15, `${id}: looks ${i} and ${j} have walls of nearly the same color`);
      }
    }
    assert.equal(new Set([0, 1, 2, 3].map((variant) => artStateKey(id, info(variant)))).size, 4, `${id}: the stored pictures would be mixed up`);
    assert.ok(ART_USES[id].includes('variant'));
    // With no look given, it draws the first one.
    const { ctx, points, colors } = recorder();
    BUILDING_ART[id](createKit(ctx, 0, 0), { ...info(0), variant: undefined });
    assert.equal(JSON.stringify([points, colors]), drawn[0]);
  }
  // A building that is not a house looks the same whatever look is asked for.
  for (const id of ['warehouse', 'bakery', 'market', 'weaver']) {
    assert.equal(artStateKey(id, info(0)), artStateKey(id, info(2)), id);
  }
});

// ---- painting part of the ground, for the close-up -------------------------------

test('a ground painter given a range of tiles works out only that part, in the same place', () => {
  const game = richGame();
  const { map } = game.state;
  const colors = {};
  for (const [id, t] of Object.entries(game.rules.map.terrain)) colors[id] = t.color;
  const pointsOf = (painter) => {
    const { ctx, shapes, colors: used } = recorder();
    painter.paint(ctx, 2);
    for (const c of used) assert.ok(validColor(c), `broken color: ${c}`);
    return shapes.flatMap((shape) => shape.points ?? []);
  };

  const whole = pointsOf(createTerrainPainter(map, colors));
  const same = pointsOf(createTerrainPainter(map, colors, { x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1 }));
  assert.equal(same.length, whole.length, 'the whole map as a range should be the whole map');
  // A range that hangs off the map is cut to the map, not an error.
  assert.equal(pointsOf(createTerrainPainter(map, colors, { x0: -50, y0: -50, x1: 500, y1: 500 })).length, whole.length);

  const range = { x0: 8, y0: 6, x1: 13, y1: 10 };
  const part = pointsOf(createTerrainPainter(map, colors, range));
  assert.ok(part.length > 50, 'the part drew almost nothing');
  assert.ok(part.length < whole.length / 4, `the part has ${part.length} points against ${whole.length} for the whole map`);
  // Every point lies on or just around the tiles asked for.
  const corners = [tileToWorld(range.x0, range.y0), tileToWorld(range.x1 + 1, range.y0), tileToWorld(range.x1 + 1, range.y1 + 1), tileToWorld(range.x0, range.y1 + 1)];
  const left = Math.min(...corners.map((p) => p.x));
  const right = Math.max(...corners.map((p) => p.x));
  const top = Math.min(...corners.map((p) => p.y));
  const bottom = Math.max(...corners.map((p) => p.y));
  for (const [x, y] of part) {
    assert.ok(x >= left - 4 && x <= right + 4 && y >= top - 6 && y <= bottom + 10, `a point at ${x.toFixed(0)}, ${y.toFixed(0)} is outside the tiles asked for`);
  }
  // The part is drawn exactly where the whole map draws it: its points are all among the whole map's.
  const all = new Set(whole.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`));
  for (const [x, y] of part) assert.ok(all.has(`${x.toFixed(3)},${y.toFixed(3)}`), 'the part drew something the whole map does not');

  // Forest the same way.
  const forest = createForestPainter(map);
  const someForest = createForestPainter(map, { x0: 4, y0: 3, x1: 5, y1: 4 });
  assert.equal(someForest.count, 4);
  assert.ok(forest.count > someForest.count);
  assert.equal(createForestPainter(map, { x0: 14, y0: 3, x1: 17, y1: 6 }).count, 0, 'fertile land has no trees');
});

// ---- dust and house smoke ---------------------------------------------------------

test('dust is drawn around where the building stands, fades as it ages, and is bigger for a demolish', () => {
  const at = tileToWorld(11, 11); // the middle of a 2 by 2 building at 10, 10
  const draw = (effect) => {
    const { ctx, points, colors } = recorder();
    paintDust(ctx, [effect]);
    for (const c of colors) assert.ok(validColor(c), `broken color: ${c}`);
    return { points, colors };
  };
  const base = { id: 7, x: 10, y: 10, w: 2, h: 2 };
  const young = draw({ ...base, kind: 'built', age: 0.1 });
  const old = draw({ ...base, kind: 'built', age: 0.9 });
  const gone = draw({ ...base, kind: 'removed', age: 0.1 });
  assert.ok(young.points.length >= 12);
  for (const [x, y] of [...young.points, ...old.points, ...gone.points]) {
    assert.ok(Math.abs(x - at.x) < 80 && Math.abs(y - at.y) < 60, `dust at ${(x - at.x).toFixed(0)}, ${(y - at.y).toFixed(0)} from the building`);
  }
  const alpha = (drawn) => Number(/, ([\d.]+)\)$/.exec(drawn.colors[0])[1]);
  assert.ok(alpha(young) > alpha(old), 'dust does not fade');
  assert.ok(alpha(old) < 0.1);
  assert.ok(gone.points.length > young.points.length, 'a demolish raises no more dust than a build');
  // Nothing to draw, nothing drawn.
  const none = recorder();
  paintDust(none.ctx, []);
  assert.equal(none.points.length, 0);
});

test('a house smokes from its own chimney, on the side its look puts it, and each a little out of step', () => {
  const info = (extra) => ({ h: 30, color: '#b9553a', working: false, progress: 0, residents: 4, time: 2, variant: 0, seed: 0, ...extra });
  const where = (id, extra) => {
    const { ctx, points } = recorder();
    LIVE_ART[id](createKit(ctx, 0, 0), info(extra));
    return points;
  };
  for (const id of ['cottage', 'townhouse']) {
    const left = where(id, { variant: id === 'cottage' ? 0 : 1 });
    const right = where(id, { variant: id === 'cottage' ? 1 : 0 });
    const middle = (points) => points.reduce((sum, [x]) => sum + x, 0) / points.length;
    assert.ok(middle(right) > middle(left) + 10, `${id}: the smoke does not follow the chimney`);
  }
  // Smoke rises above the house.
  for (const id of ['cottage', 'townhouse', 'guildhouse']) {
    const base = tileToWorld(1, 1);
    for (const [, y] of where(id, {})) assert.ok(y < base.y - 15, `${id}: smoke at the wrong height`);
    assert.notDeepEqual(where(id, { seed: 1 }), where(id, { seed: 2 }), `${id}: every house smokes in step`);
    assert.deepEqual(where(id, { residents: 0 }), [], `${id}: an empty house smokes`);
  }
});

// ---- Phase 21: the art pass ------------------------------------------------------

// A stand-in canvas that remembers which color each ready-made shape was drawn in.
function styledRecorder() {
  const drawn = [];
  const target = {
    fill: (path) => drawn.push({ color: target.fillStyle, path: path ?? null }),
    stroke: (path) => drawn.push({ color: target.strokeStyle, path: path ?? null }),
    createLinearGradient: () => ({ stops: [], addColorStop(stop, color) { this.stops.push(color); } }),
  };
  const ctx = new Proxy(target, { get: (t, key) => (key in t ? t[key] : () => {}) });
  return { ctx, drawn, pointsIn: (color) => drawn.filter((d) => d.color === color).reduce((n, d) => n + (d.path?.points?.length ?? 0), 0) };
}
const brightness = (rgb) => rgb.match(/\d+/g).slice(0, 3).reduce((sum, n) => sum + Number(n), 0);

test('the ground is shaded in broad soft patches, not a checkerboard of tiles', () => {
  const map = createGame(loadData()).state.map;
  const land = (x, y) => x < map.width && y < map.height && map.terrain[y * map.width + x] !== 'water';
  const checkerboard = (x, y) => 0.955 + Math.floor(hash2(x, y, 1) * 4) * 0.03; // how it was shaded before
  // Over every pair of neighbouring land tiles: the average difference in
  // brightness, and the share that differ by a step the eye picks out.
  const measure = (shade) => {
    let pairs = 0;
    let total = 0;
    let seen = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!land(x, y)) continue;
        lo = Math.min(lo, shade(x, y));
        hi = Math.max(hi, shade(x, y));
        for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
          if (!land(nx, ny)) continue;
          pairs++;
          const d = Math.abs(shade(x, y) - shade(nx, ny));
          total += d;
          if (d >= 0.025) seen++;
        }
      }
    }
    return { average: total / pairs, seen: seen / pairs, range: hi - lo };
  };
  const now = measure(groundShade);
  assert.ok(now.average < 0.01, `neighbours differ by ${(now.average * 100).toFixed(1)}% on average`);
  assert.ok(now.seen < 0.03, `${(now.seen * 100).toFixed(1)}% of neighbours differ by a step the eye picks out`);
  assert.ok(now.range >= 0.1, 'across the island the ground still varies, from light patches to dark');
  // The old way fails the same measure, so the measure means something.
  const before = measure(checkerboard);
  assert.ok(before.average >= 0.02 && before.seen >= 0.3, JSON.stringify(before));
  // The same island always looks the same.
  assert.equal(groundShade(12, 30), groundShade(12, 30));
});

test('the grid is not part of the ground picture; it is drawn on its own, over land in view only', () => {
  const game = createGame(loadData());
  const map = game.state.map;
  const colors = {};
  for (const [id, t] of Object.entries(game.rules.map.terrain)) colors[id] = t.color;
  const ground = styledRecorder();
  createTerrainPainter(map, colors).paint(ground.ctx, 1);
  assert.equal(ground.pointsIn('rgba(0, 0, 0, 0.09)'), 0, 'no grid in the ground picture');

  // Every side of every land tile in view lies on a grid line, and every
  // stretch of every grid line borders land.
  const range = { x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1 };
  const lines = gridLines(map, range);
  const isLand = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.terrain[y * map.width + x] !== 'water';
  const covered = new Set();
  for (const [x0, y0, x1, y1] of lines) {
    if (y0 === y1) for (let x = x0; x < x1; x++) { covered.add(`h${x},${y0}`); assert.ok(isLand(x, y0 - 1) || isLand(x, y0), 'a grid line over open water'); }
    else for (let y = y0; y < y1; y++) { covered.add(`v${x0},${y}`); assert.ok(isLand(x0 - 1, y) || isLand(x0, y), 'a grid line over open water'); }
  }
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isLand(x, y)) continue;
      for (const side of [`h${x},${y}`, `h${x},${y + 1}`, `v${x},${y}`, `v${x + 1},${y}`]) assert.ok(covered.has(side), `tile ${x},${y} is missing a side of its grid`);
    }
  }
  // Long lines, not an outline round each tile.
  const land = map.terrain.filter((t) => t !== 'water').length;
  assert.ok(lines.length < land / 4, `${lines.length} lines for ${land} tiles`);
  const grid = styledRecorder();
  paintGrid(grid.ctx, map, range, 1);
  assert.equal(grid.pointsIn('rgba(0, 0, 0, 0.09)'), lines.length * 2);
  // Only the part of the map in view.
  for (const [x0, y0, x1, y1] of gridLines(map, { x0: 10, y0: 10, x1: 20, y1: 20 })) {
    assert.ok(x0 >= 10 && y0 >= 10 && x1 <= 21 && y1 <= 21);
  }
});

test('foam runs all the way round the shore, the far side too, with a wash further out', () => {
  // One tile of sand in open water: it meets the sea all the way round.
  const terrain = Array(25).fill('water');
  terrain[2 * 5 + 2] = 'coast';
  const map = { width: 5, height: 5, terrain };
  const colors = { water: '#3f7fae', coast: '#d9c38f', grass: '#7fb26a', forest: '#5d9a58', fertile: '#a58a5a' };
  const r = styledRecorder();
  createTerrainPainter(map, colors).paint(r.ctx, 1);
  const pointsOf = (color) => r.drawn.filter((d) => d.color === color).flatMap((d) => d.path?.points ?? []);
  const middle = tileToWorld(2.5, 2.5);
  const foam = pointsOf('rgba(255, 255, 255, 0.75)');
  const wash = pointsOf('rgba(235, 250, 252, 0.28)');
  // Foam on every side: above, below, left and right of the middle.
  for (const [test, side] of [[([, y]) => y < middle.y - 8, 'far'], [([, y]) => y > middle.y + 8, 'near'], [([x]) => x < middle.x - 16, 'left'], [([x]) => x > middle.x + 16, 'right']]) {
    assert.ok(foam.some(test), `no foam on the ${side} side`);
    assert.ok(wash.some(test), `no wash on the ${side} side`);
  }
  // The wash lies further out than the foam.
  const spread = (points) => points.reduce((sum, [x, y]) => sum + Math.hypot(x - middle.x, (y - middle.y) * 2), 0) / points.length;
  assert.ok(spread(wash) > spread(foam) + 2, 'the wash is not further out than the foam');
  // Wet sand along the water's edge.
  assert.ok(pointsOf(tone(colors.coast, 0.86)).length >= 24, 'no wet sand along the edge');
});

test('roofs are lit at the ridge and darker toward the eaves, and laid in rows of tiles', () => {
  for (const axis of ['u', 'v']) {
    const r = styledRecorder();
    let strokes = 0;
    const counting = new Proxy(r.ctx, { get: (t, key) => (key === 'lineTo' ? () => { strokes++; } : t[key]) });
    createKit(counting, 0, 0).gable(0, 0, 2, 2, 20, 14, '#b5523b', { axis });
    const fades = r.drawn.filter((d) => typeof d.color === 'object' && d.color.stops?.length === 2);
    assert.equal(fades.length, 2, `axis ${axis}: both slopes fade`);
    for (const f of fades) assert.ok(brightness(f.color.stops[0]) > brightness(f.color.stops[1]), `axis ${axis}: lighter at the ridge`);
    assert.ok(strokes > 25, `axis ${axis}: rows and joints of tiles (${strokes} strokes)`);
  }
});

// ---- forests and meadows (Phase 29's second art pass, Phase 30) -----------------

test('a forest tile has two or three trees standing on it, thinner and smaller at the edge', () => {
  let inside = 0;
  let edge = 0;
  let insideSize = 0;
  let edgeSize = 0;
  let leafy = 0;
  let trees = 0;
  const tones = new Set();
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      for (const [isEdge, list] of [[false, treesOnTile(x, y, false)], [true, treesOnTile(x, y, true)]]) {
        assert.ok(isEdge ? list.length >= 1 && list.length <= 2 : list.length >= 2 && list.length <= 3, `${list.length} trees on a tile`);
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          // Every tree stands on its own tile, well inside its corners.
          const at = worldToTileOf(t.cx, t.cy);
          assert.ok(at.x > x + 0.1 && at.x < x + 0.9 && at.y > y + 0.1 && at.y < y + 0.9, `a tree at ${at.x.toFixed(2)}, ${at.y.toFixed(2)} is off tile ${x}, ${y}`);
          // Far ones first, so a nearer tree covers the one behind.
          if (i > 0) assert.ok(list[i - 1].cy <= t.cy);
          tones.add(t.tone);
          trees++;
          if (t.leafy) leafy++;
        }
        if (isEdge) { edge += list.length; edgeSize += list.reduce((n, t) => n + t.size, 0); } else { inside += list.length; insideSize += list.reduce((n, t) => n + t.size, 0); }
      }
    }
  }
  assert.ok(edgeSize / edge < insideSize / inside - 0.1, 'trees at the edge are not smaller');
  assert.ok(leafy / trees > 0.15 && leafy / trees < 0.35, `${Math.round((leafy / trees) * 100)}% of trees are leafy`);
  assert.equal(tones.size, 3, 'trees come in one shade');
  // The same every time.
  assert.deepEqual(treesOnTile(12, 7, true), treesOnTile(12, 7, true));
});

test('a tree drawn again beside a building is drawn exactly as in the forest picture', () => {
  const map = createGame(loadData()).state.map;
  // An edge tile and an inner tile of forest.
  const forest = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.terrain[y * map.width + x] === 'forest';
  let edgeTile = null;
  let innerTile = null;
  for (let y = 0; y < map.height && !(edgeTile && innerTile); y++) {
    for (let x = 0; x < map.width; x++) {
      if (!forest(x, y)) continue;
      const isEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !forest(x + dx, y + dy));
      if (isEdge) edgeTile ??= { x, y };
      else innerTile ??= { x, y };
    }
  }
  for (const tile of [edgeTile, innerTile]) {
    const a = recorder();
    createForestPainter(map, { x0: tile.x, y0: tile.y, x1: tile.x, y1: tile.y }).paint(a.ctx);
    const b = recorder();
    paintTrees(b.ctx, [tile], map);
    const pointsOf = (r) => JSON.stringify(r.shapes.flatMap((shape) => shape.points));
    assert.equal(pointsOf(b), pointsOf(a), `the trees on ${tile.x}, ${tile.y} would jump when a building is near`);
  }
});

test('meadows have broad warm and cool patches that change by small steps', () => {
  const map = createGame(loadData()).state.map;
  const seen = new Set();
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const w = grassWarmth(x, y);
      seen.add(w);
      assert.ok(Math.abs(w) <= WARMTH_LEVELS);
      // Next door is at most one step warmer or cooler, so no edge stands out.
      for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) assert.ok(Math.abs(grassWarmth(nx, ny) - w) <= 1, `a jump of warmth at ${x}, ${y}`);
    }
  }
  assert.ok(seen.has(WARMTH_LEVELS - 1) && seen.has(-(WARMTH_LEVELS - 1)), 'the meadows are never warm or never cool');
  // The ground picture paints grass in warm and cool colors, not one green.
  const colors = {};
  const game = createGame(loadData());
  for (const [id, t] of Object.entries(game.rules.map.terrain)) colors[id] = t.color;
  const r = styledRecorder();
  createTerrainPainter(map, colors).paint(r.ctx, 1);
  const greens = r.drawn.filter((d) => typeof d.color === 'string' && d.color.startsWith('rgb(') && colorNear(d.color, colors.grass));
  // Warmth: how much redder than blue a green is, for its brightness. Lighter
  // and darker shades of one green all have the same warmth; warm and cool
  // patches do not.
  const warmthOf = (color) => {
    const [r, g, b] = color.match(/\d+/g).map(Number);
    return (r - b) / (r + g + b);
  };
  const base = warmthOf(tone(colors.grass, 1));
  const warmths = greens.map((d) => warmthOf(d.color));
  assert.ok(Math.max(...warmths) > base + 0.025, 'the grass is never warmer');
  assert.ok(Math.min(...warmths) < base - 0.025, 'the grass is never cooler');
});

// ---- the buildings, closer (Phase 31) ----------------------------------------------

// Draws one building and notes every call it makes to the kit, by name.
function kitCalls(id, extra = {}) {
  const calls = [];
  const kit = createKit(recorder().ctx, 0, 0);
  const watched = new Proxy(kit, {
    get: (t, key) => (typeof t[key] === 'function' && key !== 'P' ? (...args) => { calls.push({ name: key, args }); return t[key](...args); } : t[key]),
  });
  const info = { h: 30, color: '#b9553a', working: false, progress: 0.2, residents: 4, time: 0, variant: 0, seed: 0, ...extra };
  BUILDING_ART[id](watched, info);
  return calls;
}

test('every building with walls stands on a stone footing', () => {
  for (const id of ['warehouse', 'lumberjack', 'sawmill', 'fisherman', 'farm', 'bakery', 'cottage', 'townhouse', 'sheepfarm', 'weaver', 'vineyard', 'winery', 'harbor']) {
    const footed = kitCalls(id).filter((c) => c.name === 'box' && c.args[7]?.base);
    assert.ok(footed.length >= 1, `${id} has no footing`);
  }
});

test('windows have frames, glazing bars and sills; doors have frames', () => {
  const r = styledRecorder();
  BUILDING_ART.townhouse(createKit(r.ctx, 0, 0), { h: 30, color: '#b9553a', working: false, progress: 0, residents: 4, time: 0, variant: 0 });
  // A pale frame behind each window on the lit wall (five, and two in the dormers).
  const calls = kitCalls('townhouse');
  const frames = calls.filter((c) => c.name === 'onLit' && c.args[5] === '#f1e8d2').length;
  assert.ok(frames >= 7, `${frames} window frames on the lit wall`);
  // The door in a darker frame: a wider shape starting at the ground, drawn just before the door.
  const door = calls.findIndex((c) => c.name === 'onLit' && c.args[5] === '#5b3d28');
  assert.ok(door > 0, 'no door');
  const frame = calls[door - 1];
  assert.ok(frame.name === 'onLit' && frame.args[2] === 0 && frame.args[0] < calls[door].args[0] && frame.args[1] > calls[door].args[1] && frame.args[3] > calls[door].args[3], 'the door has no frame');
  // Each window is a frame, its glass, at least three bars and a sill.
  const lines = calls.filter((c) => c.name === 'line').length;
  const panes = calls.filter((c) => c.name === 'onLit' || c.name === 'onShade').length;
  assert.ok(lines > panes, `${lines} lines for ${panes} wall shapes: windows without bars`);
});

test('houses and some workshops have dormers or a gable rising from the wall', () => {
  const dormers = (id, extra) => kitCalls(id, extra).filter((c) => c.name === 'dormer').length;
  assert.equal(dormers('townhouse', { variant: 0 }), 2);
  assert.equal(dormers('townhouse', { variant: 1 }), 1, 'some townhouses have one dormer in the middle');
  for (const id of ['guildhouse', 'warehouse', 'winery']) assert.equal(dormers(id), 1, id);
  // A dormer never rises above the roof it sits in.
  const roof = { v0: 0.3, v1: 1.68, z: 20, rise: 15, overhang: 0.1 };
  for (const at of [1.68, 1.4, 1.2]) {
    const { ctx, points } = recorder();
    createKit(ctx, 0, 0).dormer(roof, 0.8, 1.1, { at, height: 9, rise: 4, color: '#b9553a', wall: '#e3d2b0' });
    const ridge = tileToWorld(0.8, (roof.v0 + roof.v1) / 2).y - (roof.z + roof.rise);
    for (const [, y] of points) assert.ok(y >= ridge - 1, `a dormer at ${at} pokes above the ridge`);
  }
});

test('the bakery has a domed oven that glows while it bakes', () => {
  assert.ok(kitCalls('bakery').some((c) => c.name === 'dome'), 'no oven');
  const glow = (working) => {
    const r = styledRecorder();
    BUILDING_ART.bakery(createKit(r.ctx, 0, 0), { h: 30, color: '#c46f3a', working, progress: 0, residents: 0, time: 0 });
    return r.drawn.some((d) => d.color === '#f2a64a');
  };
  assert.equal(glow(true), true);
  assert.equal(glow(false), false);
});

test('barrels are round and stand upright', () => {
  for (const id of ['warehouse', 'winery', 'harbor']) {
    assert.ok(kitCalls(id).filter((c) => c.name === 'cylinder').length >= 2, `${id} has no round barrels`);
  }
});

test('a farm grows stalks, which carry ears once the crop is half grown', () => {
  const ears = (progress) => kitCalls('farm', { progress, color: '#e0c04a' }).filter((c) => c.name === 'poly' && c.args[0].length === 3).length;
  const stalks = kitCalls('farm', { progress: 0.2 }).filter((c) => c.name === 'line').length;
  assert.ok(stalks > 100, `only ${stalks} stalks`);
  assert.equal(ears(0.2), 0, 'a young crop has ears');
  assert.ok(ears(0.9) > 100, 'a ripe crop has no ears');
});

// ---- people and the rest of the buildings (Phase 32) ------------------------------

// What a canvas is asked to draw for one actor: every call, by name, with its arguments.
function actorCalls(actor) {
  const calls = [];
  const state = {};
  const ctx = new Proxy({}, {
    get: (t, key) => (key in state ? state[key] : (...args) => { calls.push({ name: key, args, fill: state.fillStyle }); }),
    set: (t, key, value) => { state[key] = value; return true; },
  });
  paintActors(ctx, [actor], createGame(loadData()).rules.goods, 1);
  return calls;
}
const walkerOf = (tier, look) => ({ kind: 'walker', x: 10, y: 10, tier, look, stride: 0, dx: 1, dy: 0 });

test('people have round heads, and each kind of resident wears its own hat', () => {
  // A head: a whole circle, filled in skin color.
  const heads = (calls) => calls.filter((c, i) => c.name === 'arc' && c.args[4] === Math.PI * 2 && calls[i + 1]?.name === 'fill' && calls[i + 1].fill === '#e8c39e').length;
  for (const tier of ['farmer', 'worker', 'artisan']) assert.ok(heads(actorCalls(walkerOf(tier, 0))) >= 1, `a ${tier} has no round head`);
  // A straw hat has a wide brim (an oval); a tall hat is two blocks; a cap has neither.
  const ovals = (tier) => actorCalls(walkerOf(tier, 0)).filter((c) => c.name === 'ellipse').length;
  const blocks = (tier) => actorCalls(walkerOf(tier, 0)).filter((c) => c.name === 'fillRect').length;
  assert.ok(ovals('farmer') > ovals('worker'), 'Farmers wear no straw hat');
  assert.ok(blocks('artisan') > blocks('worker'), 'Artisans wear no tall hat');
});

test('about half the people wear a long skirt and a headscarf', () => {
  const skirt = (look) => {
    const calls = actorCalls(walkerOf('worker', look));
    const tunic = ['#3f6f9a', '#9a4a3f', '#5d5d80', '#4a7d6a'][look % 4];
    return calls.some((c) => c.name === 'fill' && c.fill === tone(tunic, 0.78));
  };
  const wearing = Array.from({ length: 20 }, (_, look) => skirt(look)).filter(Boolean).length;
  assert.equal(wearing, 10);
  assert.notDeepEqual(actorCalls(walkerOf('worker', 0)).map((c) => c.name), actorCalls(walkerOf('worker', 1)).map((c) => c.name));
});

test('a fisherman fishes with a curved rod, and cart wheels have spokes', () => {
  const rod = actorCalls({ kind: 'boat', x: 10, y: 10, dx: 1, dy: 0, look: 0, manned: true, fishing: true });
  // The rod: a curve reaching well out beside the boat (the shoulders are curves too, but close in).
  const boatX = tileToWorld(10, 10).x;
  assert.ok(rod.some((c) => c.name === 'quadraticCurveTo' && Math.abs(c.args[2] - boatX) > 8), 'the rod is not curved');
  const cart = actorCalls({ kind: 'cart', x: 10, y: 10, dx: 1, dy: 0, look: 0, stride: 0, good: null });
  assert.ok(cart.filter((c) => c.name === 'stroke').length >= 2, 'the wheels have no spokes');
});

test('the market has striped awnings, baskets of goods and a well', () => {
  const calls = kitCalls('market');
  assert.equal(calls.filter((c) => c.name === 'stripedPyramid').length, 3);
  assert.ok(calls.filter((c) => c.name === 'cylinder').length >= 8, 'too few baskets, or no well');
  // A striped awning: each face in alternating colors.
  const r = styledRecorder();
  createKit(r.ctx, 0, 0).stripedPyramid(0, 0, 1, 1, 10, 8, '#c9506b', '#f3ead2', 6);
  const fills = r.drawn.filter((d) => d.color !== undefined);
  const reds = fills.filter((d) => /^rgb/.test(d.color) && Number(d.color.match(/\d+/)[0]) > Number(d.color.match(/\d+/g)[2]) + 40).length;
  assert.ok(reds >= 12 && fills.length - reds >= 12, `${reds} red stripes of ${fills.length}`);
});

test('the harbour has a jetty, a crane with a jib, round bollards and a lantern', () => {
  const calls = kitCalls('harbor', { h: 27.5 });
  assert.ok(calls.some((c) => c.name === 'ground' && c.args[4] === '#9a7350'), 'no jetty');
  assert.ok(calls.filter((c) => c.name === 'cylinder').length >= 6, 'bollards or barrels are not round');
  assert.ok(calls.some((c) => c.name === 'box' && c.args[6] === '#f2d68a'), 'no lantern');
});

test('sheep have legs, and the pasture a hay rack and a trough', () => {
  const calls = kitCalls('sheepfarm');
  const legs = calls.filter((c) => c.name === 'line' && c.args[2] === '#3b342c').length;
  assert.equal(legs, 5 * 4);
  assert.ok(calls.some((c) => c.name === 'box' && c.args[7]?.top === '#d9bf6a'), 'no hay rack');
  assert.ok(calls.some((c) => c.name === 'box' && c.args[7]?.top === '#6fa6c8'), 'no water trough');
});

test('the vineyard has bunches of grapes and the fisherman fish drying', () => {
  const grapes = kitCalls('vineyard', { progress: 0.9 }).filter((c) => c.name === 'dot' && c.args[3] === 0.85).length;
  assert.equal(grapes, 5 * 3 * 3, 'grapes are not in bunches of three');
  const fish = kitCalls('fisherman').filter((c) => c.name === 'poly' && c.args[1] === '#9fb3bd').length;
  assert.equal(fish, 4);
});
