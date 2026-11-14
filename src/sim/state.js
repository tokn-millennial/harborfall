// Builds a new game: the rules (fixed) and the state (everything that changes).
//
// game = { rules, state }
//   rules  comes from the data files and never changes.
//   state  is plain numbers, text and lists, so it can be saved or copied.

import { compileRules, withDifficulty, withScenario, withSeed } from './rules.js';
import { generateMap } from './mapgen.js';
import { addBuilding } from './buildings.js';
import { refresh } from './refresh.js';
import { createTradeState } from './trade.js';

// options.map lets tests (or a future hand-made level) supply the island
// instead of generating it: { width, height, terrain[], start: { x, y } | null }
// options.seed asks for a different island than the one named in map.json.
// options.difficulty picks one of the difficulties in config.json.
// options.scenario picks one of the scenarios in config.json. A scenario may
// name its own island; options.seed still wins if both are given.
export function createGame(rawData, options = {}) {
  const base = withScenario(rawData, options.scenario ?? null);
  const seeded = Number.isInteger(options.seed) ? withSeed(base, options.seed) : base;
  const rules = compileRules(withDifficulty(seeded, options.difficulty ?? null));
  const freeDef = rules.start.freeBuilding ? rules.buildings[rules.start.freeBuilding] : null;
  const map = options.map
    ? checkCustomMap(options.map, rules)
    : generateMap(rules.map, freeDef ? [freeDef.w, freeDef.h] : [1, 1]);

  const total = map.width * map.height;
  const goods = {};
  for (const id of rules.goodIds) goods[id] = rules.start.goods[id] ?? 0;

  const state = {
    tick: 0,
    coinsMilli: rules.start.coinsMilli,
    goods,
    storageCap: 0,
    map,
    roads: new Array(total).fill(0),
    occupancy: new Array(total).fill(0),
    buildings: [],
    nextId: 1,
    incomeTimer: 0,
    lastIncome: null,
    won: false,
    wonAtTick: null,
    milestones: rules.milestones.map(() => null), // the tick each goal after the win was reached
    staffClock: 0, // thousandths of a tick of work saved up while short of staff (see staff.js)
    trade: createTradeState(), // the ship's timer, the standing orders and the last call (see trade.js)
    carts: [], // every warehouse's carts, at home or on the road (see carts.js)
    undo: null, // what is needed to take back the last command (see undo.js)
  };
  const game = { rules, state };

  if (freeDef && map.start) addBuilding(game, freeDef.id, map.start.x, map.start.y, { free: true });
  refresh(game);
  return game;
}

function checkCustomMap(map, rules) {
  if (!Number.isInteger(map.width) || !Number.isInteger(map.height) || !Array.isArray(map.terrain)) {
    throw new Error('A custom map needs width, height and a terrain list');
  }
  if (map.terrain.length !== map.width * map.height) {
    throw new Error(`A custom map needs ${map.width * map.height} terrain entries, got ${map.terrain.length}`);
  }
  for (const t of map.terrain) {
    if (!rules.map.terrain[t]) throw new Error(`A custom map uses unknown terrain "${t}"`);
  }
  return {
    width: map.width,
    height: map.height,
    seed: null,
    terrain: [...map.terrain],
    start: map.start ? { x: map.start.x, y: map.start.y } : null,
  };
}
