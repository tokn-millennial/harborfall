// The small things that make the town feel alive: dust when something is
// built or removed, and day and night. These are looks only, so the tests are
// about when they appear and that they never touch the game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/platform/loadData.node.js';
import { createGame, execute, step } from '../src/sim/index.js';
import { createBuildEffects, popScale } from '../src/render/effects.js';
import { DAY_SECONDS, nightAmount, timeOfDay } from '../src/render/daylight.js';
import { place, richGame, road, run, snapshot } from './helpers.js';

// ---- dust ------------------------------------------------------------------------

test('a game that has just been opened shows no dust, whatever is already built', () => {
  const game = richGame();
  place(game, 'house', 16, 11);
  place(game, 'house', 16, 13);
  const effects = createBuildEffects(game.rules);
  assert.deepEqual(effects.update(game.state, 10), []);
  assert.deepEqual(effects.update(game.state, 10.1), []);
});

test('a new building raises dust where it stands, for a little under a second', () => {
  const game = richGame();
  const effects = createBuildEffects(game.rules);
  effects.update(game.state, 0);
  const house = place(game, 'house', 16, 11);
  let now = effects.update(game.state, 1);
  assert.equal(now.length, 1);
  assert.deepEqual(now[0], { kind: 'built', id: house.id, x: 16, y: 11, w: 2, h: 2, age: 0 });
  now = effects.update(game.state, 1.45);
  assert.equal(now.length, 1);
  assert.ok(Math.abs(now[0].age - 0.5) < 1e-9);
  assert.deepEqual(effects.update(game.state, 1.95), []);
  // It does not start again on its own.
  assert.deepEqual(effects.update(game.state, 5), []);
});

test('a demolished building raises dust where it stood, and an undone one too', () => {
  const game = richGame();
  const house = place(game, 'house', 16, 11);
  const effects = createBuildEffects(game.rules);
  effects.update(game.state, 0);
  execute(game, { action: 'demolish', x: 16, y: 11 });
  let now = effects.update(game.state, 2);
  assert.deepEqual(now, [{ kind: 'removed', id: house.id, x: 16, y: 11, w: 2, h: 2, age: 0 }]);
  assert.deepEqual(effects.update(game.state, 3), []);

  const second = place(game, 'lumberjack', 8, 4);
  now = effects.update(game.state, 4);
  assert.deepEqual(now.map((e) => [e.kind, e.id, e.w, e.h]), [['built', second.id, 1, 1]]);
  assert.equal(execute(game, { action: 'undo' }).ok, true);
  now = effects.update(game.state, 4.1);
  assert.deepEqual(now.map((e) => e.kind).sort(), ['built', 'removed'], 'the new dust and the removal dust overlap for a moment');
});

test('roads raise no dust, and time passing in the game raises none', () => {
  const game = richGame();
  const effects = createBuildEffects(game.rules);
  effects.update(game.state, 0);
  road(game, [[12, 10], [12, 11], [12, 12]]);
  run(game, 500);
  assert.deepEqual(effects.update(game.state, 1), []);
});

test('fifty buildings appearing in one frame do not fill the screen with dust', () => {
  const game = richGame();
  const effects = createBuildEffects(game.rules);
  effects.update(game.state, 0);
  let built = 0;
  for (let y = 2; y < 16 && built < 50; y++) {
    for (let x = 2; x < 22 && built < 50; x++) {
      if (execute(game, { action: 'place', building: 'lumberjack', x, y }).ok) built++;
    }
  }
  assert.ok(built >= 15, `only ${built} buildings were placed`);
  assert.ok(effects.update(game.state, 1).length <= 12);
});

test('another game opening clears the dust and starts afresh', () => {
  const a = richGame();
  const b = richGame();
  const effects = createBuildEffects(a.rules);
  effects.update(a.state, 0);
  place(a, 'house', 16, 11);
  assert.equal(effects.update(a.state, 1).length, 1);
  place(b, 'house', 16, 13);
  assert.deepEqual(effects.update(b.state, 1.1), [], 'a loaded game showed dust for buildings it already had');
  place(b, 'house', 18, 11);
  assert.equal(effects.update(b.state, 1.2).length, 1);
});

test('a new building starts a little small and settles to full size, never larger', () => {
  assert.equal(popScale(0), 0.8);
  assert.equal(popScale(0.4), 1);
  assert.equal(popScale(0.9), 1);
  assert.equal(popScale(NaN), 1);
  let last = 0;
  for (let age = 0; age <= 1; age += 0.02) {
    const s = popScale(age);
    assert.ok(s >= 0.8 && s <= 1, `at age ${age.toFixed(2)} the size is ${s}`);
    assert.ok(s >= last, 'the building shrank again');
    last = s;
  }
});

test('watching for dust never changes the game', () => {
  const game = richGame();
  const twin = richGame();
  const effects = createBuildEffects(game.rules);
  for (let i = 0; i < 400; i++) {
    if (i === 50) { place(game, 'house', 16, 11); place(twin, 'house', 16, 11); }
    if (i === 200) { execute(game, { action: 'demolish', x: 16, y: 11 }); execute(twin, { action: 'demolish', x: 16, y: 11 }); }
    const before = i % 100 === 0 ? snapshot(game) : null;
    effects.update(game.state, i / 60);
    if (before !== null) assert.equal(snapshot(game), before);
    step(game);
    step(twin);
  }
  assert.equal(snapshot(game), snapshot(twin));
});

// ---- day and night ---------------------------------------------------------------

test('a new game starts at sunrise, and the first few minutes are full day', () => {
  assert.equal(nightAmount(0), 0);
  assert.equal(timeOfDay(0), 'day');
  for (let s = 0; s < 280; s += 10) assert.equal(nightAmount(s), 0, `night at ${s} seconds`);
});

test('a day is 8 game minutes: day, dusk, night, dawn, and round again', () => {
  assert.equal(DAY_SECONDS, 480);
  const seen = [];
  for (let s = 0; s < DAY_SECONDS; s += 4) {
    const part = timeOfDay(s);
    if (seen[seen.length - 1] !== part) seen.push(part);
  }
  assert.deepEqual(seen, ['day', 'dusk', 'night', 'dawn']);
  // Most of a day is day.
  let dayCount = 0;
  for (let s = 0; s < DAY_SECONDS; s++) if (timeOfDay(s) === 'day') dayCount++;
  assert.ok(dayCount / DAY_SECONDS >= 0.55, `only ${Math.round((dayCount / DAY_SECONDS) * 100)}% of a day is daylight`);
  // The next day is the same as the first.
  for (const s of [10, 200, 300, 400, 470]) {
    assert.equal(nightAmount(s + DAY_SECONDS), nightAmount(s));
    assert.equal(nightAmount(s + DAY_SECONDS * 7), nightAmount(s));
  }
});

test('night comes and goes smoothly, with no jump, and stays between 0 and 1', () => {
  let last = nightAmount(0);
  let highest = 0;
  for (let s = 0.5; s <= DAY_SECONDS * 2; s += 0.5) {
    const now = nightAmount(s);
    assert.ok(now >= 0 && now <= 1);
    assert.ok(Math.abs(now - last) < 0.03, `night jumped from ${last.toFixed(2)} to ${now.toFixed(2)} at ${s} seconds`);
    highest = Math.max(highest, now);
    last = now;
  }
  assert.equal(highest, 1, 'it never gets fully dark');
  assert.equal(nightAmount(-5), nightAmount(DAY_SECONDS - 5), 'a time before the start is treated as the day before');
});

test('at night it is fully dark for a while, and dusk and dawn mirror each other', () => {
  assert.equal(timeOfDay(360), 'night');
  assert.equal(nightAmount(360), 1);
  assert.equal(nightAmount(400), 1);
  // Halfway through dusk and halfway through dawn are equally dark.
  const dusk = nightAmount(0.65 * DAY_SECONDS);
  const dawn = nightAmount(0.95 * DAY_SECONDS);
  assert.ok(Math.abs(dusk - 0.5) < 1e-9 && Math.abs(dawn - 0.5) < 1e-9);
});

test('day and night follow game time, so a paused game stays as it is', () => {
  const game = createGame(loadData());
  run(game, 3300); // 5.5 game minutes: dusk
  const seconds = game.state.tick / game.rules.ticksPerSecond;
  const now = nightAmount(seconds);
  assert.ok(now > 0 && now < 1, `expected dusk, got ${now}`);
  // No ticks, no change, however often it is asked.
  for (let i = 0; i < 100; i++) assert.equal(nightAmount(game.state.tick / game.rules.ticksPerSecond), now);
});
