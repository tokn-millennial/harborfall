import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoop } from '../src/platform/loop.js';

function counter(options = {}) {
  let ticks = 0;
  const loop = createLoop({ ticksPerSecond: 10, onTick: () => { ticks++; }, ...options });
  return { loop, count: () => ticks };
}

test('real time becomes whole ticks, and fractions carry over to the next frame', () => {
  const { loop, count } = counter();
  assert.equal(loop.advance(0.25), 2);
  assert.equal(loop.advance(0.25), 3, 'the two leftover half ticks add up');
  assert.equal(count(), 5);
});

test('ten seconds of 60 frames a second is 100 ticks', () => {
  const { loop, count } = counter();
  for (let i = 0; i < 600; i++) loop.advance(1 / 60);
  assert.ok(count() === 100 || count() === 99, `got ${count()}`);
  loop.advance(1 / 60);
  assert.ok(count() >= 100);
});

test('speed 2 and 4 run two and four times as many ticks', () => {
  for (const speed of [1, 2, 4]) {
    const { loop, count } = counter();
    loop.setSpeed(speed);
    for (let i = 0; i < 20; i++) loop.advance(0.05);
    assert.equal(count(), 10 * speed, `speed ${speed}`);
  }
});

test('paused means no ticks, and no burst of ticks when play resumes', () => {
  const { loop, count } = counter();
  loop.advance(0.05); // half a tick owed
  loop.setSpeed(0);
  for (let i = 0; i < 100; i++) loop.advance(1);
  assert.equal(count(), 0);
  loop.setSpeed(1);
  assert.equal(loop.advance(0.1), 1);
  assert.equal(count(), 1);
});

test('a stalled tab does not cause a long catch-up', () => {
  const { loop, count } = counter({ maxTicksPerAdvance: 20 });
  assert.equal(loop.advance(300), 20, 'five minutes away, but only 20 ticks run');
  assert.equal(loop.advance(0.1), 1, 'and the backlog is dropped, not repaid');
  assert.equal(count(), 21);
});

test('nonsense time values are ignored', () => {
  const { loop, count } = counter();
  loop.advance(-5);
  loop.advance(NaN);
  loop.advance(0);
  assert.equal(count(), 0);
});
