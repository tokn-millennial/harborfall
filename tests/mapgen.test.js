import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { compileRules } from '../src/sim/rules.js';
import { generateMap, checkGuarantees, countTerrain } from '../src/sim/mapgen.js';
import { DIRS4, footprint } from '../src/sim/grid.js';

function build(change) {
  const data = loadData();
  if (change) change(data);
  const rules = compileRules(data);
  const def = rules.buildings[rules.start.freeBuilding];
  return { rules, def, map: generateMap(rules.map, [def.w, def.h]) };
}

const at = (map, x, y) => map.terrain[y * map.width + x];

// A part of a map as a map of its own: the home island's area, or the second island's box.
function part(map, x0, y0, width, height) {
  const terrain = [];
  for (let y = y0; y < y0 + height; y++) for (let x = x0; x < x0 + width; x++) terrain.push(at(map, x, y));
  return { width, height, terrain, start: map.start };
}
const homePart = (map, rules) => part(map, 0, 0, rules.map.width, rules.map.height);
const secondPart = (map) => part(map, map.second.x, map.second.y, map.second.width, map.second.height);

// Counts tiles reachable from `start` by edge steps over tiles that pass `ok`.
function floodCount(map, start, ok) {
  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % map.width;
    const y = (i - x) / map.width;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const n = ny * map.width + nx;
      if (!seen.has(n) && ok(map.terrain[n])) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size;
}

test('the map has the size given in map.json and only known terrain', () => {
  const { rules, map } = build();
  // The home island's area, then open water, then the second island's area.
  const s = rules.map.second;
  assert.equal(map.width, rules.map.width + s.gap + s.width);
  assert.equal(map.height, Math.max(rules.map.height, s.offsetY + s.height));
  assert.deepEqual(map.second, { x: rules.map.width + s.gap, y: s.offsetY, width: s.width, height: s.height });
  assert.equal(map.terrain.length, map.width * map.height);
  for (const t of map.terrain) assert.ok(rules.map.terrain[t], `unknown terrain ${t}`);
});

test('the same seed always gives the same island', () => {
  assert.deepEqual(build().map, build().map);
});

test('a different seed gives a different island', () => {
  const a = build().map;
  const b = build((d) => { d.map.seed += 1000; }).map;
  assert.notDeepEqual(a.terrain, b.terrain);
});

test('the shipped seed meets every guarantee without needing a retry', () => {
  const { rules, map: whole } = build();
  const map = homePart(whole, rules);
  assert.deepEqual(checkGuarantees(map, rules.map), []);
  assert.equal(whole.seed, rules.map.seed);
});

test('the edge of the map is water', () => {
  const { map } = build();
  for (let i = 0; i < map.width; i++) {
    assert.equal(at(map, i, 0), 'water');
    assert.equal(at(map, i, map.height - 1), 'water');
  }
  for (let i = 0; i < map.height; i++) {
    assert.equal(at(map, 0, i), 'water');
    assert.equal(at(map, map.width - 1, i), 'water');
  }
});

test('coast is exactly the land that touches water', () => {
  const { map } = build();
  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      const t = at(map, x, y);
      if (t === 'water') continue;
      const touchesWater = DIRS4.some(([dx, dy]) => at(map, x + dx, y + dy) === 'water');
      assert.equal(t === 'coast', touchesWater, `tile ${x},${y} is ${t}`);
    }
  }
});

test('there are two islands, each in one piece, and no lakes', () => {
  const { rules, map } = build();
  for (const [name, p] of [['home', homePart(map, rules)], ['second', secondPart(map)]]) {
    const land = p.terrain.length - countTerrain(p, 'water');
    const firstLand = p.terrain.findIndex((t) => t !== 'water');
    assert.ok(land > 0, `the ${name} island has land`);
    assert.equal(floodCount(p, firstLand, (t) => t !== 'water'), land, `all the ${name} island's land is one piece`);
  }
  // Every land tile is in one of the two parts, and the two never touch.
  const home = homePart(map, rules);
  const second = secondPart(map);
  const total = map.terrain.length - countTerrain(map, 'water');
  assert.equal(total, home.terrain.length - countTerrain(home, 'water') + second.terrain.length - countTerrain(second, 'water'));
  const firstLand = map.terrain.findIndex((t) => t !== 'water');
  assert.ok(floodCount(map, firstLand, (t) => t !== 'water') < total, 'the islands are apart');
  assert.equal(floodCount(map, 0, (t) => t === 'water'), countTerrain(map, 'water'), 'all water reaches the edge');
});

test('the home island is the same, tile for tile, with or without the second island', () => {
  const { rules, map } = build();
  const alone = build((d) => { delete d.map.second; }).map;
  assert.equal(alone.width, rules.map.width);
  assert.equal(alone.second, undefined);
  assert.deepEqual(homePart(map, rules).terrain, alone.terrain);
  assert.deepEqual(map.start, alone.start);
  assert.equal(map.seed, alone.seed);
});

test('the islands are at least ten tiles of water apart', () => {
  const { map } = build();
  let gap = Infinity;
  for (let y = 0; y < map.height; y++) {
    let lastHome = -1;
    let firstSecond = -1;
    for (let x = 0; x < map.width; x++) {
      if (at(map, x, y) === 'water') continue;
      if (x < map.second.x) lastHome = x;
      else if (firstSecond === -1) firstSecond = x;
    }
    if (lastHome >= 0 && firstSecond >= 0) gap = Math.min(gap, firstSecond - lastHome - 1);
  }
  assert.ok(gap >= 10, `only ${gap} tiles apart`);
});

test('the second island meets its own guarantees, on the shipped seed and twenty others', () => {
  for (let i = 0; i <= 20; i++) {
    const { rules, map } = build(i === 0 ? null : (d) => { d.map.seed = i * 7919; });
    const p = secondPart(map);
    const g = rules.map.second.guarantees;
    assert.ok(countTerrain(p, 'forest') >= g.minForestTiles, `seed ${i}: forest`);
    assert.ok(countTerrain(p, 'coast') >= g.minCoastTiles, `seed ${i}: coast`);
  }
});

test('land, forest and fertile shares are close to the targets', () => {
  const { rules, map: whole } = build();
  const gen = rules.map.generation;
  const map = homePart(whole, rules); // the home island's area, as map.json describes it
  const land = map.terrain.length - countTerrain(map, 'water');
  const near = (actual, target, label) =>
    assert.ok(Math.abs(actual - target) <= 0.03, `${label}: got ${actual.toFixed(3)}, target ${target}`);
  near(land / map.terrain.length, gen.landFraction, 'land share');
  near(countTerrain(map, 'forest') / land, gen.forestFractionOfLand, 'forest share');
  near(countTerrain(map, 'fertile') / land, gen.fertileFractionOfLand, 'fertile share');
});

test('the start site is open grass inside the map', () => {
  const { def, map } = build();
  assert.ok(map.start, 'there is a start site');
  for (const [x, y] of footprint(map.start.x, map.start.y, def.w, def.h)) {
    assert.equal(at(map, x, y), 'grass', `start tile ${x},${y}`);
  }
});

test('twenty other seeds all produce islands that meet the guarantees', () => {
  for (let i = 1; i <= 20; i++) {
    const { rules, map } = build((d) => { d.map.seed = i * 7919; });
    assert.deepEqual(checkGuarantees(homePart(map, rules), rules.map), [], `seed ${i * 7919}`);
  }
});

test('impossible guarantees give a clear error instead of a broken map', () => {
  assert.throws(
    () => build((d) => { d.map.guarantees.minForestTiles = 999999; }),
    /No island that meets the guarantees/,
  );
});
