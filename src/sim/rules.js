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
  });
}
