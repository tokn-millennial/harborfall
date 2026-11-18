import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, execute, step } from '../src/sim/index.js';
import { loadData } from '../src/platform/loadData.node.js';
import { testGame, run, snapshot, fullSnapshot } from './helpers.js';
import { playMiniCity } from './scenario.js';

test('two new games on the real island are identical', () => {
  assert.equal(snapshot(createGame(loadData())), snapshot(createGame(loadData())));
});

test('the same commands at the same times give exactly the same game', () => {
  const a = testGame();
  const b = testGame();
  playMiniCity(a);
  playMiniCity(b);
  assert.equal(a.state.tick, b.state.tick);
  assert.equal(snapshot(a), snapshot(b));
  run(a, 5000);
  run(b, 5000);
  assert.equal(snapshot(a), snapshot(b));
});

test('a different command timing gives a different game (the check above is not trivially true)', () => {
  const a = testGame();
  const b = testGame();
  run(b, 1);
  playMiniCity(a);
  playMiniCity(b);
  assert.notEqual(snapshot(a), snapshot(b));
});

test('the game state is plain data: a copy made through JSON carries on identically', () => {
  const original = testGame();
  playMiniCity(original);
  const copy = { rules: original.rules, state: JSON.parse(fullSnapshot(original)) };
  assert.deepEqual(copy.state, original.state);

  for (const game of [original, copy]) {
    run(game, 3000);
    execute(game, { action: 'demolish', x: 13, y: 13 }); // the sawmill
    run(game, 3000);
  }
  assert.equal(snapshot(copy), snapshot(original));
});

test('a failed command leaves no trace', () => {
  const game = testGame();
  playMiniCity(game);
  const before = snapshot(game);
  for (const command of [
    { action: 'place', building: 'house', x: 0, y: 0 },
    { action: 'place', building: 'farm', x: 2, y: 12 },
    { action: 'place', building: 'castle', x: 2, y: 12 },
    { action: 'demolish', x: 3, y: 14 },
    { action: 'upgrade', id: 12345 },
    { action: 'road', tiles: [[0, 0], [5, 5]] },
    { action: 'nonsense' },
  ]) {
    assert.equal(execute(game, command).ok, false, JSON.stringify(command));
  }
  assert.equal(snapshot(game), before);
  step(game);
  assert.notEqual(snapshot(game), before, 'the game itself still moves');
});
