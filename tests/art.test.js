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
import { ART_USES, BUILDING_ART, LIVE_ART, artFor, artIdFor, artStateKey } from '../src/render/art/buildings.js';
import { sharpnessFor } from '../src/render/art/sprites.js';
import { paintBox } from '../src/render/art/box.js';
import { createForestPainter, createRoadPainter, createTerrainPainter, gridLines, groundShade, paintGrid, paintTree, paintWater, shallowsOf, waterBackground } from '../src/render/art/terrain.js';
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
  quadraticCurveTo(cx, cy, x, y) { this.points.push([x, y]); }
  closePath() {}
};
// How many points were handed to fill() or stroke() as ready-made shapes.
const shapePoints = (calls) => calls.reduce((sum, path) => sum + (path?.points?.length ?? 0), 0);

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

test('shallows mark water near land, and nothing on land', () => {
  const game = richGame();
  const map = game.state.map;
  const near = shallowsOf(map);
  for (let i = 0; i < map.terrain.length; i++) {
    if (map.terrain[i] !== 'water') assert.equal(near[i], 0);
  }
  // On the test island, (0,5) is water beside the coast at (1,5).
  assert.equal(near[5 * map.width + 0], 1);
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

  // A building next to a road gets an arm of road toward it.
  place(game, 'house', 13, 10);
  const joined = recorder();
  painter.paint(joined.ctx, game.state);
  assert.ok(shapePoints(joined.shapes) > shapePoints(moved.shapes));
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

// ---- three looks for each house --------------------------------------------------

test('each kind of house has three looks, and nothing else changes with the look', () => {
  const info = (variant) => ({ h: 30, color: '#b9553a', working: false, progress: 0, residents: 4, time: 0, variant });
  for (const id of ['cottage', 'townhouse', 'guildhouse']) {
    const drawn = [0, 1, 2].map((variant) => {
      const { ctx, points, colors } = recorder();
      BUILDING_ART[id](createKit(ctx, 0, 0), info(variant));
      for (const c of colors) assert.ok(validColor(c), `${id} look ${variant} used a broken color: ${c}`);
      return JSON.stringify([points, colors]);
    });
    assert.equal(new Set(drawn).size, 3, `${id} does not have three different looks`);
    assert.equal(new Set([0, 1, 2].map((variant) => artStateKey(id, info(variant)))).size, 3, `${id}: the stored pictures would be mixed up`);
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

test('foam runs along every side of the shore, the far sides too, with a wash further out', () => {
  // One tile of sand in open water: four sides meet the sea.
  const terrain = Array(25).fill('water');
  terrain[2 * 5 + 2] = 'coast';
  const map = { width: 5, height: 5, terrain };
  const colors = { water: '#3f7fae', coast: '#d9c38f', grass: '#7fb26a', forest: '#5d9a58', fertile: '#a58a5a' };
  const r = styledRecorder();
  createTerrainPainter(map, colors).paint(r.ctx, 1);
  assert.equal(r.pointsIn('rgba(255, 255, 255, 0.75)'), 8, 'foam: two ends of a line on each of four sides');
  assert.equal(r.pointsIn('rgba(235, 250, 252, 0.28)'), 8, 'the wash: the same four sides, further out');
  // Wet sand inside each side.
  assert.equal(r.pointsIn(tone(colors.coast, 0.86)), 16, 'a strip of wet sand along each of the four sides');
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
