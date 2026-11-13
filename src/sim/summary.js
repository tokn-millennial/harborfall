// A read-only snapshot of the numbers the HUD, the bot and the reports need.

import { MILLI } from './rules.js';
import { incomeRates } from './economy.js';
import { countAtLeast, countResidents } from './population.js';

export function getSummary(game) {
  const { rules, state } = game;
  const rates = incomeRates(game);
  const residents = countResidents(game);

  const housing = {};
  for (const id of Object.keys(rules.tiers)) housing[id] = 0;
  for (const b of state.buildings) {
    if (b.house) housing[b.house.tier] += rules.tiers[b.house.tier].capacity;
  }

  return {
    tick: state.tick,
    seconds: state.tick / rules.ticksPerSecond,
    coins: Math.floor(state.coinsMilli / MILLI),
    // Coins per minute at this moment.
    income: {
      taxes: rates.taxesMilli / MILLI,
      base: rates.baseMilli / MILLI,
      upkeep: rates.upkeepMilli / MILLI,
      net: rates.netMilli / MILLI,
    },
    goods: { ...state.goods },
    storageCap: state.storageCap,
    residents,
    housing,
    win: {
      tier: rules.win.tier,
      target: rules.win.residents,
      current: countAtLeast(game, rules.win.tier),
      won: state.won,
      wonAtTick: state.wonAtTick,
      wonAtSeconds: state.wonAtTick === null ? null : state.wonAtTick / rules.ticksPerSecond,
    },
    // The goals for after the win, in order.
    milestones: rules.milestones.map((m, i) => ({
      tier: m.tier,
      target: m.residents,
      title: m.title,
      current: countAtLeast(game, m.tier),
      reachedAtTick: state.milestones[i],
      reachedAtSeconds: state.milestones[i] === null ? null : state.milestones[i] / rules.ticksPerSecond,
    })),
  };
}

// The one thing most wrong with a building right now, as a short code, or null
// when it is fine. Used for warning markers and the info panel.
//   no_road, missing_input, storage_full   producers and markets
//   no_market, no_<good>                   houses
export function buildingIssue(game, building) {
  const def = game.rules.buildings[building.type];
  if (building.house) {
    if (!building.house.served) return 'no_market';
    for (const good in building.house.met) {
      if (!building.house.met[good]) return `no_${good}`;
    }
    return null;
  }
  if (def.requiresRoad && !building.connected) return 'no_road';
  const status = building.production?.status;
  if (status === 'missing_input' || status === 'storage_full') return status;
  return null;
}
