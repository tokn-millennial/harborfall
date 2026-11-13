// Life on the map: walkers, carts and boats. They are decoration, so the two
// promises that matter most are that they never change the game and that they
// only ever show things that make sense: people on roads, boats on water.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from '../src/platform/loadData.node.js';
import { createGame, execute, loadGame, saveGame, step } from '../src/sim/index.js';
import { createLife } from '../src/render/life.js';
import { runBot } from '../tools/bot/bot.js';
import { loadOrder } from '../tools/tune.mjs';
import { snapshot, testGame } from './helpers.js';
import { playMiniCity } from './scenario.js';

// A real town on the shipped island, part-way through a game.
function town(minutes = 20) {
  const game = createGame(loadData());
  runBot(game, loadOrder('standard'), { maxMinutes: minutes });
  return game;
}

const of = (actors, kind) => actors.filter((a) => a.kind === kind);
const tileOf = (a) => [Math.floor(a.x), Math.floor(a.y)];
const isRoad = (game, x, y) => game.state.roads[y * game.state.map.width + x] === 1;
const isWater = (game, x, y) => game.state.map.terrain[y * game.state.map.width + x] === 'water';
const residentsOf = (game) => game.state.buildings.reduce((n, b) => n + (b.house?.residents ?? 0), 0);

// Runs the game and the life layer together, calling `watch` after every update.
function live(game, life, ticks, watch = () => {}, every = 1) {
  for (let i = 0; i < ticks; i++) {
    step(game);
    if (i % every === 0) watch(life.update(game));
  }
}

test('an empty island has no walkers, carts or boats', () => {
  const game = createGame(loadData());
  const life = createLife(game.rules);
  assert.deepEqual(life.update(game), []);
  live(game, life, 600, (actors) => assert.deepEqual(actors, []));
});

test('a town that already has people is filled with walkers at once: one for every five residents', () => {
  const game = town(15);
  const life = createLife(game.rules);
  const walkers = of(life.update(game), 'walker');
  const residents = residentsOf(game);
  assert.ok(residents >= 40, `the town has only ${residents} residents`);
  assert.equal(walkers.length, Math.min(40, Math.floor(residents / 5)));
});

test('there are never more than 40 walkers or 14 carts, however large the town', () => {
  const game = town(90); // played to the win and beyond
  for (const b of game.state.buildings) if (b.house) b.house.residents = 8;
  const life = createLife(game.rules);
  assert.ok(residentsOf(game) / 5 > 20);
  for (const b of game.state.buildings) if (b.house) b.house.residents = 400; // far more than could ever live there
  live(game, life, 3000, (actors) => {
    assert.ok(of(actors, 'walker').length <= 40);
    assert.ok(of(actors, 'cart').length <= 14);
  });
  // Walkers come and go, so the number hovers just under the limit.
  assert.ok(of(life.actors, 'walker').length >= 36, `only ${of(life.actors, 'walker').length} walkers in a huge town`);
});

test('walkers and carts only ever stand on roads', () => {
  const game = town(20);
  const life = createLife(game.rules);
  let checked = 0;
  live(game, life, 4000, (actors) => {
    for (const a of actors) {
      if (a.kind === 'boat') continue;
      const [x, y] = tileOf(a);
      assert.ok(isRoad(game, x, y), `a ${a.kind} is at ${a.x.toFixed(2)}, ${a.y.toFixed(2)}, which is not a road`);
      checked++;
    }
  });
  assert.ok(checked > 20000, `only ${checked} positions were checked`);
});

test('walkers move, and move at walking pace', () => {
  const game = town(20);
  const life = createLife(game.rules);
  const before = new Map(of(life.update(game), 'walker').map((a) => [a.id, a]));
  step(game);
  let moved = 0;
  for (const a of of(life.update(game), 'walker')) {
    const was = before.get(a.id);
    if (!was) continue;
    const distance = Math.hypot(a.x - was.x, a.y - was.y);
    assert.ok(distance < 0.2, `a walker jumped ${distance.toFixed(2)} tiles in one tick`);
    if (distance > 0) moved++;
  }
  assert.ok(moved > 0, 'no walker moved');
});

test('new walkers step out next to a house, and walkers come and go over time', () => {
  const game = town(20);
  const life = createLife(game.rules);
  const first = new Set(of(life.update(game), 'walker').map((a) => a.id));
  const startedAt = new Map();
  live(game, life, 6000, (actors) => {
    for (const a of of(actors, 'walker')) if (!first.has(a.id) && !startedAt.has(a.id)) startedAt.set(a.id, tileOf(a));
  });
  assert.ok(startedAt.size >= 5, `only ${startedAt.size} new walkers appeared in 10 minutes`);
  const { state } = game;
  const besideBuilding = ([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => state.occupancy[(y + dy) * state.map.width + x + dx] !== 0);
  for (const [id, tile] of startedAt) assert.ok(besideBuilding(tile), `walker ${id} appeared at ${tile}, away from any building`);
});

test('when the residents leave, the walkers go indoors', () => {
  const game = town(20);
  const life = createLife(game.rules);
  assert.ok(of(life.update(game), 'walker').length > 5);
  // The game itself would not empty the houses this way. It is done by hand
  // here, each tick, to see the walkers follow.
  for (let i = 0; i < 3000; i++) {
    for (const b of game.state.buildings) if (b.house) b.house.residents = 0;
    life.update(game);
    step(game);
  }
  for (const b of game.state.buildings) if (b.house) b.house.residents = 0;
  assert.equal(of(life.update(game), 'walker').length, 0);
});

test('a cart sets out when a producer delivers, carries what it made, and ends beside a warehouse', () => {
  const game = town(20);
  const life = createLife(game.rules);
  const { state, rules } = game;
  const lastSeen = new Map();
  const finished = [];
  live(game, life, 3000, (actors) => {
    const now = new Map(of(actors, 'cart').map((a) => [a.id, a]));
    for (const [id, a] of lastSeen) if (!now.has(id)) finished.push(a);
    for (const [id, a] of now) lastSeen.set(id, a);
    for (const id of [...lastSeen.keys()]) if (!now.has(id)) lastSeen.delete(id);
  });
  assert.ok(finished.length >= 10, `only ${finished.length} carts finished a trip in 5 minutes`);
  const made = new Set(state.buildings.filter((b) => b.production).flatMap((b) => Object.keys(rules.buildings[b.type].production.outputs)));
  const warehouses = state.buildings.filter((b) => rules.buildings[b.type].category === 'storage');
  for (const a of finished) {
    assert.ok(made.has(a.good), `a cart carried ${a.good}, which nothing in town makes`);
    // Last seen within a couple of tiles of a warehouse's plot.
    const near = warehouses.some((w) => {
      const def = rules.buildings[w.type];
      const dx = Math.max(w.x - a.x, 0, a.x - (w.x + def.w));
      const dy = Math.max(w.y - a.y, 0, a.y - (w.y + def.h));
      return Math.hypot(dx, dy) <= 2.2;
    });
    assert.ok(near, `a cart of ${a.good} was last seen at ${a.x.toFixed(1)}, ${a.y.toFixed(1)}, not near a warehouse`);
  }
  assert.ok(new Set(finished.map((a) => a.good)).size >= 3, 'carts carried fewer than three kinds of goods');
});

test('every working fisherman has one boat, always on the water, that goes out and comes home', () => {
  const game = town(20);
  const life = createLife(game.rules);
  const { state, rules } = game;
  const fishers = state.buildings.filter((b) => rules.buildings[b.type].placement?.adjacentTerrain);
  assert.ok(fishers.length >= 2);
  const home = new Map();
  const farthest = new Map();
  let fishingSeen = 0;
  live(game, life, 1200, (actors) => {
    const boats = of(actors, 'boat');
    assert.equal(boats.length, fishers.length);
    for (const a of boats) {
      const [x, y] = tileOf(a);
      assert.ok(isWater(game, x, y), `a boat is at ${a.x.toFixed(2)}, ${a.y.toFixed(2)}, which is not water`);
      const fisher = state.buildings.find((b) => b.id === a.id);
      if (fisher.production.progress === 0 && !home.has(a.id)) home.set(a.id, [a.x, a.y]);
      if (home.has(a.id)) {
        const d = Math.hypot(a.x - home.get(a.id)[0], a.y - home.get(a.id)[1]);
        farthest.set(a.id, Math.max(farthest.get(a.id) ?? 0, d));
      }
      if (a.fishing) fishingSeen++;
    }
  });
  assert.equal(home.size, fishers.length, 'not every boat was seen at home');
  for (const [id, d] of farthest) assert.ok(d >= 1, `boat ${id} never went more than ${d.toFixed(2)} tiles from home`);
  assert.ok(fishingSeen > 0, 'no boat was ever seen fishing');
  // Each one is back home when its cycle starts again.
  for (const a of of(life.actors, 'boat')) {
    const fisher = state.buildings.find((b) => b.id === a.id);
    if (fisher.production.progress !== 0) continue;
    assert.deepEqual([a.x, a.y], home.get(a.id));
  }
});

test('a fisherman with no road keeps his boat at home, with nobody in it', () => {
  const game = testGame({ coins: 5000, goods: { wood: 100, planks: 100 } });
  assert.equal(execute(game, { action: 'place', building: 'fisherman', x: 2, y: 9 }).ok, true);
  const life = createLife(game.rules);
  const seen = [];
  live(game, life, 400, (actors) => seen.push(...of(actors, 'boat')));
  assert.ok(seen.length > 0);
  for (const a of seen) {
    assert.equal(a.manned, false);
    assert.equal(a.fishing, false);
    assert.deepEqual([a.x, a.y], [seen[0].x, seen[0].y]);
    assert.ok(isWater(game, ...tileOf(a)));
  }
});

test('nothing moves while the game is paused', () => {
  const game = town(20);
  const life = createLife(game.rules);
  live(game, life, 300);
  const before = JSON.stringify(life.update(game));
  for (let i = 0; i < 50; i++) assert.equal(JSON.stringify(life.update(game)), before);
});

test('life never changes the game', () => {
  const watched = town(10);
  const alone = town(10);
  const life = createLife(watched.rules);
  for (let i = 0; i < 3000; i++) {
    const before = i % 500 === 0 ? snapshot(watched) : null;
    life.update(watched);
    if (before !== null) assert.equal(snapshot(watched), before, 'an update changed the game');
    step(watched);
    step(alone);
  }
  assert.equal(snapshot(watched), snapshot(alone), 'a game with life drifted from one without');
});

test('the same game gives the same life, every time', () => {
  const a = town(12);
  const b = town(12);
  const lifeA = createLife(a.rules);
  const lifeB = createLife(b.rules);
  for (let i = 0; i < 1500; i++) {
    step(a);
    step(b);
    const actorsA = lifeA.update(a);
    const actorsB = lifeB.update(b);
    if (i % 100 === 0) assert.deepEqual(actorsA, actorsB);
  }
  assert.ok(lifeA.actors.length > 10);
});

test('removing roads under walkers and carts removes them, without an error', () => {
  const game = town(20);
  const life = createLife(game.rules);
  live(game, life, 600);
  assert.ok(of(life.actors, 'walker').length > 5);
  const { map } = game.state;
  // Tear up every second road tile, then all of them.
  for (const keepEvery of [2, 1]) {
    let n = 0;
    for (let i = 0; i < game.state.roads.length; i++) {
      if (game.state.roads[i] !== 1 || n++ % keepEvery !== 0) continue;
      assert.equal(execute(game, { action: 'demolish', x: i % map.width, y: Math.floor(i / map.width) }).ok, true);
    }
    live(game, life, 300, (actors) => {
      for (const a of actors) if (a.kind !== 'boat') assert.ok(isRoad(game, ...tileOf(a)), `a ${a.kind} is standing where a road was removed`);
    });
  }
  assert.equal(game.state.roads.some((r) => r === 1), false);
  assert.equal(of(life.actors, 'walker').length + of(life.actors, 'cart').length, 0);
});

test('a different game, or a jump in time, starts the life afresh without an error', () => {
  const first = town(15);
  const life = createLife(first.rules);
  live(first, life, 300);

  // A loaded copy of another game, as after Continue.
  const other = loadGame(loadData(), JSON.parse(JSON.stringify(saveGame(town(22))))).game;
  for (const a of life.update(other)) {
    if (a.kind === 'boat') assert.ok(isWater(other, ...tileOf(a)));
    else assert.ok(isRoad(other, ...tileOf(a)));
  }
  assert.equal(of(life.actors, 'walker').length, Math.min(40, Math.floor(residentsOf(other) / 5)));

  // The game stepped a long way with no update in between, as the test tools do.
  for (let i = 0; i < 5000; i++) step(other);
  for (const a of life.update(other)) if (a.kind !== 'boat') assert.ok(isRoad(other, ...tileOf(a)));
  assert.ok(of(life.actors, 'walker').length > 0);
});

test('life on the scripted mini-city: boats and carts appear once there is something to show', () => {
  const game = testGame();
  const life = createLife(game.rules);
  const kinds = new Set();
  playMiniCity(game, () => {
    for (const a of life.update(game)) {
      kinds.add(a.kind);
      if (a.kind === 'boat') assert.ok(isWater(game, ...tileOf(a)));
      else assert.ok(isRoad(game, ...tileOf(a)));
    }
  });
  assert.ok(kinds.has('boat'), 'no boat was ever shown');
  assert.ok(kinds.has('cart'), 'no cart was ever shown');
});

test('keeping life up to date is cheap: ten minutes of a full town in well under a second or two', () => {
  const game = town(90);
  const life = createLife(game.rules);
  const start = process.hrtime.bigint();
  for (let i = 0; i < 6000; i++) {
    step(game);
    life.update(game);
  }
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms < 4000, `6,000 updates took ${ms.toFixed(0)} ms`);
});

test('the life layer keeps to itself: no imports, no clock, no built-in random', () => {
  const code = readFileSync(new URL('../src/render/life.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.equal(/\bimport\b/.test(code), false, 'life.js imports something');
  for (const [pattern, label] of [[/Math\.random/, 'Math.random'], [/\bDate\b/, 'Date'], [/performance\./, 'performance'], [/\bwindow\b|\bdocument\b/, 'the browser'], [/execute\s*\(|\.state\.\w+\s*=[^=]/, 'a change to the game']]) {
    assert.equal(pattern.test(code), false, `life.js uses ${label}`);
  }
});
