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
  assert.equal(map.width, rules.map.width);
  assert.equal(map.height, rules.map.height);
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
  const { rules, map } = build();
  assert.deepEqual(checkGuarantees(map, rules.map), []);
  assert.equal(map.seed, rules.map.seed);
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

test('there is one island and no lakes', () => {
  const { map } = build();
  const land = map.terrain.length - countTerrain(map, 'water');
  const firstLand = map.terrain.findIndex((t) => t !== 'water');
  assert.equal(floodCount(map, firstLand, (t) => t !== 'water'), land, 'all land is one piece');
  assert.equal(floodCount(map, 0, (t) => t === 'water'), countTerrain(map, 'water'), 'all water reaches the edge');
});

test('land, forest and fertile shares are close to the targets', () => {
  const { rules, map } = build();
  const gen = rules.map.generation;
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
    assert.deepEqual(checkGuarantees(map, rules.map), [], `seed ${i * 7919}`);
  }
});

test('impossible guarantees give a clear error instead of a broken map', () => {
  assert.throws(
    () => build((d) => { d.map.guarantees.minForestTiles = 999999; }),
    /No island that meets the guarantees/,
  );
});
