// Plays a full game headless and prints a report.
//
// Usage:
//   node tools/bot.mjs                  play the standard build order
//   node tools/bot.mjs naive            play tools/bot/orders/naive.json
//   node tools/bot.mjs standard --steps also print every step the bot took
//   node tools/bot.mjs standard --map   also print the finished town as text
//   node tools/bot.mjs standard --seed 42   play on a different island
//   node tools/bot.mjs standard --pace typical   act at a person's speed (brisk, typical or slow)
//   node tools/bot.mjs standard --difficulty hard   play on Easy, Normal or Hard
//   node tools/bot.mjs village          play the Fishing village scenario with the order written for it
//   node tools/bot.mjs standard --scenario short-handed   play any order in a scenario
import { readFileSync } from 'node:fs';
import { loadData } from '../src/platform/loadData.node.js';
import { createGame } from '../src/sim/index.js';
import { runBot } from './bot/bot.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const orderName = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--seed' && args[i - 1] !== '--pace' && args[i - 1] !== '--difficulty' && args[i - 1] !== '--scenario') ?? 'standard';

const order = JSON.parse(readFileSync(new URL(`./bot/orders/${orderName}.json`, import.meta.url), 'utf8'));
const data = loadData();
if (value('seed') !== undefined) data.map.seed = Number(value('seed'));
// An order written for a scenario plays that scenario, unless another is asked for.
const scenario = value('scenario') ?? order.scenario ?? null;
const game = createGame(data, { difficulty: value('difficulty') ?? null, scenario, seed: value('seed') !== undefined ? Number(value('seed')) : undefined });
const paces = JSON.parse(readFileSync(new URL('./bot/paces.json', import.meta.url), 'utf8'));
const paceName = value('pace');
if (paceName !== undefined && !paces[paceName]) throw new Error(`Unknown pace "${paceName}". Use brisk, typical or slow.`);
const result = runBot(game, order, paceName ? { pace: { seed: 1, ...paces[paceName] } } : {});

const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, ' ')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const pad = (v, n) => String(v).padStart(n, ' ');

console.log(`Build order: ${result.order}. ${order.description ?? ''}`);
console.log(`Island seed: ${game.state.map.seed}`);
if (scenario) {
  const s = game.rules.scenarios.find((entry) => entry.id === scenario);
  console.log(`Scenario: ${s.name}. Goal: ${s.win.residents} ${game.rules.tiers[s.win.tier].name}s. The 25 to 40 minute target is for the standard game.`);
}
if (game.rules.difficulty && game.rules.difficulty !== game.rules.defaultDifficulty) console.log(`Difficulty: ${game.rules.difficulty}. The 25 to 40 minute target is for Normal.`);
if (paceName) console.log(`Pace: ${paceName}. The bot spent ${result.thinkingMinutes.toFixed(1)} minutes "thinking" between actions, as a person would.`);
console.log('');
if (result.won) {
  const m = result.wonAtMinutes;
  const verdict = m < 25 ? 'FASTER than the 25 to 40 minute target' : m > 40 ? 'SLOWER than the 25 to 40 minute target' : 'inside the 25 to 40 minute target';
  console.log(scenario ? `RESULT: WON at ${m.toFixed(1)} minutes. Medal: ${result.summary.win.medal ?? 'none'}${game.rules.medals ? ` (gold within ${game.rules.medals.goldTicks / game.rules.ticksPerMinute} minutes, silver within ${game.rules.medals.silverTicks / game.rules.ticksPerMinute})` : ''}.` : `RESULT: WON at ${m.toFixed(1)} minutes (${verdict}).`);
} else {
  console.log(`RESULT: DID NOT WIN in ${result.endedAtMinutes.toFixed(0)} minutes. Steps done: ${result.stepsDone} of ${result.stepsTotal}.`);
}
for (const m of result.playedPastWin ? result.milestones : []) {
  const name = game.rules.tiers[m.tier].name;
  if (m.reachedAtMinutes !== null) console.log(`AFTER THE WIN: ${m.target} ${name}s reached at ${m.reachedAtMinutes.toFixed(1)} minutes, ${(m.reachedAtMinutes - result.wonAtMinutes).toFixed(1)} after the win.`);
  else console.log(`AFTER THE WIN: ${m.target} ${name}s NOT reached in ${result.endedAtMinutes.toFixed(0)} minutes (${m.current} so far).`);
}
if (result.stuckOn && (!result.won || result.playedPastWin)) {
  const s = result.stuckOn;
  console.log(`Stopped at step ${s.step} (${s.label}), waiting ${clock(s.waitedSeconds).trim()} for: ${s.waitedFor}.`);
}
const inc = result.summary.income;
console.log(`At the end: ${result.summary.coins} coins, net ${inc.net >= 0 ? '+' : ''}${inc.net.toFixed(1)} a minute (taxes ${inc.taxes.toFixed(1)}, base ${inc.base}, upkeep ${inc.upkeep}).`);
console.log(`Residents: ${Object.entries(result.summary.residents).map(([tier, n]) => `${n} ${game.rules.tiers[tier].name}s`).join(', ')}.`);
console.log(`Buildings: ${Object.entries(result.counts).map(([t, n]) => `${n} ${t}`).join(', ')}, ${result.roadsBuilt} road tiles.`);
console.log(`Time at zero coins: ${result.zeroCoinMinutes.toFixed(1)} min. Time losing money: ${result.lossMinutes.toFixed(1)} min.`);
if (result.summary.carts.on) {
  console.log(`Carts: ${result.summary.carts.total}. Producer-minutes spent waiting for a cart: ${result.cartWaitMinutes.toFixed(1)}.${game.rules.materials ? ` Workshop-minutes waiting for materials: ${result.materialWaitMinutes.toFixed(1)}.` : ''}`);
}
if (result.summary.staff.on) {
  const st = result.summary.staff;
  console.log(`Staff at the end: ${st.needed} needed, ${st.available} in town. Time short of staff: ${result.shortStaffMinutes.toFixed(1)} min${result.shortStaffMinutes > 0 ? ` (slowest: ${result.lowestStaffPercent}% speed)` : ''}.`);
}

console.log('');
console.log('Curve (every 2 game minutes)');
const tierIds = Object.keys(game.rules.tiers);
const goodIds = game.rules.goodIds;
console.log(` min  coins  net/min ${tierIds.map((t) => pad(`${t}s`, 9)).join('')}  ${goodIds.map((g) => pad(g, 7)).join('')}`);
for (const s of result.samples) {
  if (s.minute % 2 !== 0 && s !== result.samples[result.samples.length - 1]) continue;
  console.log(
    `${pad(s.minute, 4)} ${pad(s.coins, 6)} ${pad((s.net >= 0 ? '+' : '') + s.net.toFixed(1), 8)} ${tierIds.map((t) => pad(s.residents[t] ?? 0, 9)).join('')}  ` +
      `${goodIds.map((g) => pad(s.goods[g] ?? 0, 7)).join('')}`,
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
