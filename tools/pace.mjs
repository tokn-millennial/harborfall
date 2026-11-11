// Estimates how long a person takes to win.
//
// The normal bot acts the instant it can afford something. This runs the same
// build orders with a person's delays added: a few seconds of thought after
// every action, time to lay each road tile, and the odd longer pause.
// The delays are guesses (see tools/bot/paces.json), so treat the result as an
// estimate, not a measurement.
//
// Usage: node tools/pace.mjs [games per row, default 20]
import { readFileSync } from 'node:fs';
import { loadData } from '../src/platform/loadData.node.js';
import { createGame } from '../src/sim/index.js';
import { runBot } from './bot/bot.js';
import { loadOrder } from './tune.mjs';

const games = Number(process.argv[2] ?? 20);
const paces = JSON.parse(readFileSync(new URL('./bot/paces.json', import.meta.url), 'utf8'));
const TARGET = [25, 40];

console.log(`Each row is ${games} games on the shipped island, each with different random delays.`);
console.log('');
console.log('order      pace      fastest  median  slowest   won   inside 25-40 min   thinking');
for (const orderName of ['standard', 'careless']) {
  const order = loadOrder(orderName);
  for (const paceName of ['instant', ...Object.keys(paces).filter((k) => !k.startsWith('_'))]) {
    const times = [];
    let wins = 0;
    let inside = 0;
    let thinking = 0;
    const runs = paceName === 'instant' ? 1 : games;
    for (let seed = 1; seed <= runs; seed++) {
      const game = createGame(loadData());
      const result = runBot(game, order, paceName === 'instant' ? { maxMinutes: 120 } : { maxMinutes: 120, pace: { seed, ...paces[paceName] } });
      if (result.won) {
        wins++;
        times.push(result.wonAtMinutes);
        if (result.wonAtMinutes >= TARGET[0] && result.wonAtMinutes <= TARGET[1]) inside++;
      }
      thinking += result.thinkingMinutes;
    }
    times.sort((a, b) => a - b);
    const f = (n) => (n === undefined ? '   -' : n.toFixed(1).padStart(5));
    console.log(
      `${orderName.padEnd(10)} ${paceName.padEnd(9)} ${f(times[0])}   ${f(times[Math.floor(times.length / 2)])}   ${f(times[times.length - 1])}   ` +
        `${String(wins).padStart(2)}/${runs}`.padEnd(8) + `${String(inside).padStart(2)}/${runs}`.padEnd(19) + `${(thinking / runs).toFixed(1)} min`,
    );
  }
}
