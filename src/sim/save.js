// Saving and loading. A save is plain data: it can be turned into text, kept
// anywhere, and turned back into a game later. Where it is kept is not this
// file's business (see src/platform/saveStore.js).
//
// A save holds the whole state, the island seed that was asked for, and a
// stamp of the rules it was played under. Loading refuses a save whose rules
// have changed, because its numbers may no longer make sense.

import { compileRules, stableText, withDifficulty, withScenario, withSeed } from './rules.js';
import { refresh } from './refresh.js';
import { footprint, inBounds, tileIndex } from './grid.js';
import { undoProblem } from './undo.js';
import { createTradeState, tradeProblem } from './trade.js';
import { cartsFor, cartsProblem, recomputeHauls } from './carts.js';
import { withSecondIsland } from './mapgen.js';
import { createSecondStock } from './islands.js';
import { createShipState, shipProblem } from './ship.js';

export const SAVE_FORMAT = 1;
const APP = 'harborfall';

const copy = (value) => JSON.parse(JSON.stringify(value));
const isCount = (n) => Number.isInteger(n) && n >= 0;

// Everything needed to carry on with this game later. Never changes the game.
export function saveGame(game) {
  return {
    app: APP,
    format: SAVE_FORMAT,
    rulesStamp: game.rules.stamp,
    seed: game.rules.map.seed,
    difficulty: game.rules.difficulty,
    scenario: game.rules.scenario,
    state: copy(game.state),
  };
}

// Turns a save back into a game. Returns { ok: true, game } or
// { ok: false, reason, detail }. Reasons:
//   not_a_save     this is not a Harborfall save at all
//   newer_version  it was made by a newer version of the game
//   rules_changed  the data files have changed since it was made
//   damaged        it does not describe a possible game
// `rawData` is the data files as loaded, the same as for createGame.
export function loadGame(rawData, save) {
  const fail = (reason, detail = '') => ({ ok: false, reason, detail });
  if (save === null || typeof save !== 'object' || save.app !== APP || !Number.isInteger(save.format)) {
    return fail('not_a_save');
  }
  if (save.format > SAVE_FORMAT) return fail('newer_version');
  if (save.format < 1) return fail('not_a_save');

  // The rules the game was played under: its scenario, its island, and its
  // difficulty. A save from before scenarios existed is a standard game, and
  // one from before difficulties existed was played on the default one.
  const scenario = typeof save.scenario === 'string' ? save.scenario : null;
  if (scenario !== null && !Object.hasOwn(rawData.config?.scenarios ?? {}, scenario)) return fail('rules_changed');
  const base = withScenario(rawData, scenario);
  const seeded = Number.isInteger(save.seed) ? withSeed(base, save.seed) : base;
  const wanted = typeof save.difficulty === 'string' ? save.difficulty : null;
  if (wanted !== null && rawData.config?.difficulties && !Object.hasOwn(rawData.config.difficulties, wanted)) return fail('rules_changed');
  const rules = compileRules(withDifficulty(seeded, wanted));
  // A game saved before some things were added (config.addedLater) is still
  // a possible game: it has none of them. It is carried forward below.
  const older = save.rulesStamp === rules.stamp ? null : rules.olderStamps.find((o) => o.stamp === save.rulesStamp) ?? null;
  if (save.rulesStamp !== rules.stamp && !older) return fail('rules_changed');

  let state;
  try {
    state = copy(save.state);
  } catch {
    return fail('damaged', 'the state cannot be read');
  }
  // A save from before undo existed has no undo record. That is fine: there is nothing to undo.
  if (state !== null && typeof state === 'object' && state.undo === undefined) state.undo = null;
  // A save from before carts existed: empty yards, and every warehouse's carts at home.
  const beforeCarts = older !== null && older.configAdded.includes('carts');
  const beforeMaterials = older !== null && older.configAdded.includes('materials');
  let addCarts = false;
  if (state !== null && typeof state === 'object' && Array.isArray(state.buildings)) {
    for (const b of state.buildings) {
      if (b?.production && typeof b.production === 'object' && (beforeCarts || b.production.yard === undefined)) b.production.yard = {};
      // A save from before materials travelled: every workshop's store starts empty.
      if (b?.production && typeof b.production === 'object' && (beforeMaterials || b.production.store === undefined)) b.production.store = {};
    }
    if (beforeCarts || state.carts === undefined) addCarts = true;
  }
  // A save from before trade existed has no orders and no ship on its way.
  if (state !== null && typeof state === 'object' && state.trade === undefined) state.trade = createTradeState();
  // A save from before the second island: the island is added across the
  // water, and the map grows to hold it. The home island keeps every tile,
  // building and road where it was. Nothing is built there and it has no goods.
  if (state !== null && typeof state === 'object') {
    if (rules.map.second && state.map && typeof state.map === 'object' && state.map.second === undefined && older?.mapAdded?.includes('second')) {
      const widened = widenForSecondIsland(state, rules);
      if (widened) return fail('damaged', widened);
    }
    if (state.second === undefined) state.second = createSecondStock(rules);
    if (state.ship === undefined) state.ship = createShipState();
  }
  // A save from before staff existed has saved up no work. It starts from nothing.
  if (state !== null && typeof state === 'object' && state.staffClock === undefined) state.staffClock = 0;
  if (older && state !== null && typeof state === 'object') {
    // None of the new goods, and, if the goals after the win are new to it, none reached yet.
    if (state.goods !== null && typeof state.goods === 'object') for (const good of rules.goodIds) state.goods[good] ??= 0;
    if (state.second?.goods !== null && typeof state.second?.goods === 'object') for (const good of rules.goodIds) state.second.goods[good] ??= 0;
    // A house whose tier has gained a need since: it starts wanting it, as a new house would.
    if (Array.isArray(state.buildings)) {
      for (const b of state.buildings) {
        const h = b?.house;
        const tier = h && typeof h === 'object' && Object.hasOwn(rules.tiers, h.tier) ? rules.tiers[h.tier] : null;
        if (!tier || h.hunger === null || typeof h.hunger !== 'object' || h.met === null || typeof h.met !== 'object') continue;
        for (const [good, need] of Object.entries(tier.needs)) {
          if (good in h.hunger) continue;
          h.hunger[good] = need.hungerThreshold;
          h.met[good] = false;
        }
      }
    }
    if (older.configAdded.includes('milestones')) state.milestones = rules.milestones.map(() => null);
  }
  let problem = stateProblem(rules, state);
  if (!problem && addCarts) {
    state.carts = cartsFor(rules, state.buildings);
    // How far each producer is from a warehouse was never saved. Work it out now.
    recomputeHauls({ rules, state });
  }
  problem ??= tradeProblem(rules, state) ?? cartsProblem(rules, state) ?? shipProblem(rules, state) ?? undoProblem(rules, state);
  if (problem) return fail('damaged', problem);

  // Everything worked out from what is built where (road connections, storage,
  // market coverage) must agree with a fresh calculation.
  const check = { rules, state: copy(state) };
  try {
    refresh(check);
  } catch (error) {
    return fail('damaged', `the state cannot be worked with: ${error.message}`);
  }
  if (stableText(check.state) !== stableText(state)) return fail('damaged', 'connections or storage do not add up');

  return { ok: true, game: { rules, state } };
}

// Grows an older save's map to hold the second island. Returns what is wrong, or null.
function widenForSecondIsland(state, rules) {
  const old = state.map;
  if (!Number.isInteger(old.width) || !Number.isInteger(old.height) || !Array.isArray(old.terrain) || !Number.isInteger(old.seed)) return 'the island cannot be read';
  if (!Array.isArray(state.roads) || !Array.isArray(state.occupancy)) return 'the road or building map is missing';
  const map = withSecondIsland(old, rules.map);
  const grow = (list) => {
    const out = new Array(map.width * map.height).fill(0);
    for (let y = 0; y < old.height; y++) for (let x = 0; x < old.width; x++) out[y * map.width + x] = list[y * old.width + x];
    return out;
  };
  state.roads = grow(state.roads);
  state.occupancy = grow(state.occupancy);
  state.map = map;
  return null;
}

// The first thing wrong with a state, in words, or null if it is a possible game.
function stateProblem(rules, state) {
  if (state === null || typeof state !== 'object') return 'there is no state';
  if (!isCount(state.tick)) return 'the clock is not a whole number';
  if (!isCount(state.coinsMilli)) return 'the coins are not a whole number';
  if (!isCount(state.storageCap)) return 'the storage limit is not a whole number';
  if (!isCount(state.incomeTimer)) return 'the income timer is not a whole number';
  if (!isCount(state.staffClock) || state.staffClock >= 1000) return 'the staff timer is wrong';
  if (!Number.isInteger(state.nextId) || state.nextId < 1) return 'the next building number is wrong';
  if (typeof state.won !== 'boolean') return 'the win flag is missing';
  if (state.wonAtTick !== null && !isCount(state.wonAtTick)) return 'the win time is wrong';
  if (state.won !== (state.wonAtTick !== null)) return 'the win flag and the win time disagree';
  if (!Array.isArray(state.milestones) || state.milestones.length !== rules.milestones.length) return 'the list of goals after the win is the wrong length';
  if (!state.milestones.every((tick) => tick === null || isCount(tick))) return 'a goal after the win has a wrong time';

  if (state.goods === null || typeof state.goods !== 'object') return 'the goods are missing';
  for (const id of rules.goodIds) {
    if (!isCount(state.goods[id])) return `the amount of ${id} is not a whole number`;
  }
  if (Object.keys(state.goods).length !== rules.goodIds.length) return 'there is a good the rules do not know';

  const map = state.map;
  if (map === null || typeof map !== 'object') return 'the island is missing';
  if (!Number.isInteger(map.width) || !Number.isInteger(map.height) || map.width < 1 || map.height < 1) return 'the island has no size';
  const total = map.width * map.height;
  if (!Array.isArray(map.terrain) || map.terrain.length !== total) return 'the island has the wrong number of tiles';
  for (const t of map.terrain) {
    if (!Object.hasOwn(rules.map.terrain, t)) return `the island has unknown ground "${t}"`;
  }
  if (map.start !== null && (typeof map.start !== 'object' || !inBounds(map, map.start.x, map.start.y))) return 'the start site is off the island';
  if (map.second !== undefined) {
    const s = map.second;
    if (s === null || typeof s !== 'object' || ![s.x, s.y, s.width, s.height].every(isCount) || s.x + s.width > map.width || s.y + s.height > map.height) return 'the second island is off the map';
  }
  const second = state.second;
  if (second === null || typeof second !== 'object' || !isCount(second.storageCap) || second.goods === null || typeof second.goods !== 'object') return 'the second island\'s goods are missing';
  for (const id of rules.goodIds) if (!isCount(second.goods[id])) return `the second island's amount of ${id} is not a whole number`;
  if (Object.keys(second.goods).length !== rules.goodIds.length) return 'the second island has a good the rules do not know';

  if (!Array.isArray(state.roads) || state.roads.length !== total) return 'the road list is the wrong length';
  if (!state.roads.every((r) => r === 0 || r === 1)) return 'the road list holds something that is not a road';
  if (!Array.isArray(state.occupancy) || state.occupancy.length !== total) return 'the building map is the wrong length';
  if (!Array.isArray(state.buildings)) return 'the building list is missing';

  const ids = new Set();
  let coveredTiles = 0;
  for (const b of state.buildings) {
    if (b === null || typeof b !== 'object') return 'a building is not a building';
    if (!Number.isInteger(b.id) || b.id < 1 || b.id >= state.nextId || ids.has(b.id)) return 'a building has a wrong or repeated number';
    ids.add(b.id);
    const def = Object.hasOwn(rules.buildings, b.type) ? rules.buildings[b.type] : null;
    if (!def || def.category === 'road') return `a building has the unknown type "${b.type}"`;
    if (!Number.isInteger(b.x) || !Number.isInteger(b.y)) return 'a building has no position';
    for (const [tx, ty] of footprint(b.x, b.y, def.w, def.h)) {
      if (!inBounds(map, tx, ty)) return `building ${b.id} is off the island`;
      if (state.occupancy[tileIndex(map, tx, ty)] !== b.id) return `building ${b.id} does not match the building map`;
      coveredTiles++;
    }
    if (Boolean(def.production) !== Boolean(b.production)) return `building ${b.id} has the wrong kind of record`;
    if (b.production && !isCount(b.production.progress)) return `building ${b.id} has a wrong work timer`;
    if (b.production && b.production.closed !== undefined && b.production.closed !== true) return `building ${b.id} has a wrong closed mark`;
    if (Boolean(def.housingTier) !== Boolean(b.house)) return `building ${b.id} has the wrong kind of record`;
    if (b.house) {
      const tier = Object.hasOwn(rules.tiers, b.house.tier) ? rules.tiers[b.house.tier] : null;
      if (!tier) return `house ${b.id} has an unknown kind of resident`;
      if (!isCount(b.house.residents) || b.house.residents > tier.capacity) return `house ${b.id} holds an impossible number of residents`;
      if (b.house.hunger === null || typeof b.house.hunger !== 'object' || b.house.met === null || typeof b.house.met !== 'object') {
        return `house ${b.id} has no record of its needs`;
      }
    }
  }
  if (state.occupancy.filter((id) => id !== 0).length !== coveredTiles) return 'the building map shows a building that is not in the list';
  return null;
}
