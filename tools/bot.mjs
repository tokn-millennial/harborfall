// Plays a full game headless and prints a report.
//
// Usage:
//   node tools/bot.mjs                  play the standard build order
//   node tools/bot.mjs naive            play tools/bot/orders/naive.json
//   node tools/bot.mjs standard --steps also print every step the bot took
//   node tools/bot.mjs standard --map   also print the finished town as text
//   node tools/bot.mjs standard --seed 42   play on a different island
import { readFileSync } from 'node:fs';
import { loadData } from '../src/platform/loadData.node.js';
import { createGame } from '../src/sim/index.js';
import { runBot } from './bot/bot.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const orderName = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--seed') ?? 'standard';

const order = JSON.parse(readFileSync(new URL(`./bot/orders/${orderName}.json`, import.meta.url), 'utf8'));
const data = loadData();
if (value('seed') !== undefined) data.map.seed = Number(value('seed'));
const game = createGame(data);
const result = runBot(game, order);

const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, ' ')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const pad = (v, n) => String(v).padStart(n, ' ');

console.log(`Build order: ${result.order}. ${order.description ?? ''}`);
console.log(`Island seed: ${game.state.map.seed}`);
console.log('');
if (result.won) {
  const m = result.wonAtMinutes;
  const verdict = m < 25 ? 'FASTER than the 25 to 40 minute target' : m > 40 ? 'SLOWER than the 25 to 40 minute target' : 'inside the 25 to 40 minute target';
  console.log(`RESULT: WON at ${m.toFixed(1)} minutes (${verdict}).`);
} else {
  console.log(`RESULT: DID NOT WIN in ${result.endedAtMinutes.toFixed(0)} minutes. Steps done: ${result.stepsDone} of ${result.stepsTotal}.`);
}
if (result.stuckOn && !result.won) {
  const s = result.stuckOn;
  console.log(`Stopped at step ${s.step} (${s.label}), waiting ${clock(s.waitedSeconds).trim()} for: ${s.waitedFor}.`);
}
const inc = result.summary.income;
console.log(`At the end: ${result.summary.coins} coins, net ${inc.net >= 0 ? '+' : ''}${inc.net.toFixed(1)} a minute (taxes ${inc.taxes.toFixed(1)}, base ${inc.base}, upkeep ${inc.upkeep}).`);
console.log(`Residents: ${result.summary.residents.farmer} Farmers, ${result.summary.residents.worker} Workers.`);
console.log(`Buildings: ${Object.entries(result.counts).map(([t, n]) => `${n} ${t}`).join(', ')}, ${result.roadsBuilt} road tiles.`);
console.log(`Time at zero coins: ${result.zeroCoinMinutes.toFixed(1)} min. Time losing money: ${result.lossMinutes.toFixed(1)} min.`);

console.log('');
console.log('Curve (every 2 game minutes)');
console.log(' min  coins  net/min  farmers  workers   wood planks  fish grain bread');
for (const s of result.samples) {
  if (s.minute % 2 !== 0 && s !== result.samples[result.samples.length - 1]) continue;
  console.log(
    `${pad(s.minute, 4)} ${pad(s.coins, 6)} ${pad((s.net >= 0 ? '+' : '') + s.net.toFixed(1), 8)} ${pad(s.farmer, 8)} ${pad(s.worker, 8)} ` +
      `${pad(s.goods.wood, 6)} ${pad(s.goods.planks, 6)} ${pad(s.goods.fish, 5)} ${pad(s.goods.grain, 5)} ${pad(s.goods.bread, 5)}`,
  );
}

console.log('');
if (result.stalls.length === 0) console.log('Long waits (over 5 minutes on one step): none.');
else {
  console.log('Long waits (over 5 minutes on one step):');
  for (const s of result.stalls) console.log(`  step ${s.step} ${s.label}: waited ${clock(s.waitedSeconds).trim()} for ${s.waitedFor}`);
}

// What the bot waited for, added up over the whole run.
const waits = {};
for (const e of result.log) if (e.waitedFor) waits[e.waitedFor] = (waits[e.waitedFor] ?? 0) + e.waitedSeconds;
const waitList = Object.entries(waits).sort((a, b) => b[1] - a[1]);
if (waitList.length) console.log(`Waiting time by cause: ${waitList.map(([r, s]) => `${r} ${clock(s).trim()}`).join(', ')}.`);

if (flag('steps')) {
  console.log('');
  console.log('Steps');
  for (const e of result.log) {
    const where = e.at ? ` at ${e.at[0]},${e.at[1]}` : '';
    const road = e.roads ? ` +${e.roads} road` : '';
    const wait = e.waitedSeconds > 0 ? `  (waited ${clock(e.waitedSeconds).trim()} for ${e.waitedFor})` : '';
    console.log(`  ${clock(e.doneAtSeconds)}  ${pad(e.step, 3)}. ${e.label}${where}${road}${wait}${e.note ? `  [${e.note}]` : ''}`);
  }
}

if (flag('map')) {
  const { map } = game.state;
  const TERRAIN = { water: '~', coast: ':', grass: '.', fertile: '"', forest: 'T' };
  const LETTER = { warehouse: 'W', lumberjack: 'L', sawmill: 'S', fisherman: 'F', farm: 'G', bakery: 'B', house: 'h', market: 'M' };
  console.log('');
  console.log('Town map:  W warehouse  L lumberjack  S sawmill  F fisherman  G farm  B bakery  M market  h Farmer house  H Worker house  # road');
  for (let y = 0; y < map.height; y++) {
    let row = '';
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      const id = game.state.occupancy[i];
      if (id) {
        const b = game.state.buildings.find((it) => it.id === id);
        row += b.house && b.house.tier !== 'farmer' ? 'H' : LETTER[b.type] ?? '?';
      } else if (game.state.roads[i]) row += '#';
      else row += TERRAIN[map.terrain[i]];
    }
    if (!/^~+$/.test(row)) console.log(row);
  }
}
