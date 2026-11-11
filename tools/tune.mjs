// Compares tuning ideas without editing the data files.
// Each variant changes the loaded data in memory, then the bot plays a full game.
//
// Usage: node tools/tune.mjs [order]
// Edit the VARIANTS list below to try other numbers. When one looks right,
// copy its numbers into the files in data/.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadData } from '../src/platform/loadData.node.js';
import { createGame } from '../src/sim/index.js';
import { runBot } from './bot/bot.js';

// Each entry is [name, a function that edits the loaded data].
const VARIANTS = [
  ['shipped data', () => {}],
  ['example: farmer tax 0.9', (d) => { d.population.tiers.farmer.taxPerResidentPerMinute = 0.9; }],
  ['example: another island (seed 42)', (d) => { d.map.seed = 42; }],
];

export function loadOrder(name) {
  return JSON.parse(readFileSync(new URL(`./bot/orders/${name}.json`, import.meta.url), 'utf8'));
}

// Plays one game per variant and prints two lines for each.
export function compare(variants, order) {
  const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const results = [];
  for (const [name, change] of variants) {
    const data = loadData();
    change(data);
    const game = createGame(data);
    const r = runBot(game, order);
    results.push(r);
    const waits = {};
    for (const e of r.log) if (e.waitedFor) waits[e.waitedFor] = (waits[e.waitedFor] ?? 0) + e.waitedSeconds;
    const waitText = Object.entries(waits).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, s]) => `${k.replace('not_enough_', '')} ${clock(s)}`).join(', ');
    const at = (minute) => r.samples.find((s) => s.minute === minute);
    const marks = [5, 10, 15, 20, 25].map((m) => (at(m) ? `${m}m:${at(m).farmer}F/${at(m).worker}W/${at(m).coins}c/${at(m).net >= 0 ? '+' : ''}${Math.round(at(m).net)}` : '')).filter(Boolean).join('  ');
    const result = r.won ? `WON ${r.wonAtMinutes.toFixed(1)} min` : `NO WIN (step ${r.stepsDone}/${r.stepsTotal}, stuck on ${r.stuckOn?.waitedFor})`;
    const net = r.summary.income.net;
    console.log(`${name}`);
    console.log(`   ${result} | end net ${net >= 0 ? '+' : ''}${net.toFixed(1)} | zero coins ${r.zeroCoinMinutes.toFixed(1)}m, losing ${r.lossMinutes.toFixed(1)}m | roads ${r.roadsBuilt} | waits: ${waitText || 'none'}`);
    console.log(`   ${marks}`);
  }
  return results;
}

// Run from the command line (not imported by another script).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  compare(VARIANTS, loadOrder(process.argv[2] ?? 'standard'));
}
