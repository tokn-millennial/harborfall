// Turns the raw data files into the "rules" the simulation runs on.
// - removes the "_note" keys
// - checks the data for mistakes
// - converts seconds to ticks and coins to thousandths ("milli-coins")
// The result is frozen: the simulation reads it but can never change it.

import { validateData } from './validate.js';

export const MILLI = 1000;

export function stripNotes(value) {
  if (Array.isArray(value)) return value.map(stripNotes);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (!key.startsWith('_')) out[key] = stripNotes(v);
    }
    return out;
  }
  return value;
}

// The same data with a different island seed. The original is left alone.
export function withSeed(rawData, seed) {
  return { ...rawData, map: { ...rawData.map, seed } };
}

// Keys that only change how things look or what they are called. A change to
// one of these does not make an older saved game unusable.
const LOOKS_ONLY = new Set(['visual', 'color', 'name', 'singular', 'key']);

// Text that is the same for the same value whatever order its keys are in.
export function stableText(value) {
  if (Array.isArray(value)) return `[${value.map(stableText).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableText(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function withoutLooks(value) {
  if (Array.isArray(value)) return value.map(withoutLooks);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (!LOOKS_ONLY.has(key)) out[key] = withoutLooks(v);
    }
    return out;
  }
  return value;
}

// A short stamp of every rule that matters to a game in progress. Two sets of
// data files with the same stamp play the same. The island seed, the notes,
// and names, colors and shortcut keys are left out.
export function rulesStamp(rawData) {
  const data = withoutLooks(stripNotes(rawData));
  if (data.map) delete data.map.seed;
  const text = stableText(data);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export function compileRules(rawData) {
  const data = stripNotes(rawData);
  const errors = validateData(data);
  if (errors.length) {
    throw new Error(`The data files have ${errors.length} problem(s):\n- ${errors.join('\n- ')}`);
  }

  const { config, goods, buildings, population, map } = data;
  const ticksPerSecond = config.ticksPerSecond;
  const ticksPerMinute = ticksPerSecond * 60;
  const toTicks = (seconds) => Math.max(1, Math.round(seconds * ticksPerSecond));
  const toMilli = (coins) => Math.round(coins * MILLI);
  const compileCost = (cost) => ({ coinsMilli: toMilli(cost.coins), goods: { ...(cost.goods ?? {}) } });

  const compiledBuildings = {};
  for (const [id, b] of Object.entries(buildings)) {
    compiledBuildings[id] = {
      id,
      name: b.name,
      key: typeof b.key === 'string' ? b.key.toLowerCase() : null,
      category: b.category,
      w: b.size[0],
      h: b.size[1],
      cost: compileCost(b.cost),
      upkeepMilliPerMinute: toMilli(b.upkeepPerMinute),
      requiresRoad: b.requiresRoad === true,
      placement: b.placement ?? null,
      production: b.production
        ? {
            cycleTicks: toTicks(b.production.cycleSeconds),
            inputs: { ...(b.production.inputs ?? {}) },
            outputs: { ...b.production.outputs },
          }
        : null,
      storagePerGood: b.storagePerGood ?? 0,
      housingTier: b.housing?.tier ?? null,
      marketRadius: b.market?.radius ?? 0,
      visual: b.visual ?? null,
    };
  }

  const compiledTiers = {};
  for (const [id, t] of Object.entries(population.tiers)) {
    const needs = {};
    for (const [good, perResidentPerMinute] of Object.entries(t.needs)) {
      // A house adds its resident count to a hunger counter every tick and
      // buys one unit when the counter reaches this threshold.
      needs[good] = {
        perResidentPerMinute,
        hungerThreshold: Math.max(1, Math.round(ticksPerMinute / perResidentPerMinute)),
      };
    }
    compiledTiers[id] = {
      id,
      name: t.name,
      capacity: t.capacity,
      taxMilliPerMinute: toMilli(t.taxPerResidentPerMinute),
      needs,
      upgrade: t.upgrade ? { to: t.upgrade.to, cost: compileCost(t.upgrade.cost) } : null,
      visual: t.visual ?? null,
    };
  }

  return deepFreeze({
    ticksPerSecond,
    ticksPerMinute,
    speeds: config.speeds,
    goodIds: Object.keys(goods),
    goods,
    buildings: compiledBuildings,
    tiers: compiledTiers,
    population: {
      growthTicks: toTicks(population.growthIntervalSeconds),
      declineTicks: toTicks(population.declineIntervalSeconds),
      minResidents: population.minResidents,
    },
    economy: {
      incomeIntervalTicks: toTicks(config.economy.incomeIntervalSeconds),
      baseIncomeMilliPerMinute: toMilli(config.economy.baseIncomePerMinute),
      demolishRefundRatio: config.economy.demolishRefundRatio,
    },
    start: {
      coinsMilli: toMilli(config.start.coins),
      goods: { ...(config.start.goods ?? {}) },
      freeBuilding: (config.start.freeBuildings ?? [])[0] ?? null,
    },
    win: { tier: config.win.tier, residents: config.win.residents },
    map,
    stamp: rulesStamp(data),
  });
}
