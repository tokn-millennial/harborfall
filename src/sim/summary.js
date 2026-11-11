// A read-only snapshot of the numbers the HUD, the bot and the reports need.

import { MILLI } from './rules.js';
import { incomeRates } from './economy.js';
import { countResidents } from './population.js';

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
      current: residents[rules.win.tier],
      won: state.won,
      wonAtTick: state.wonAtTick,
      wonAtSeconds: state.wonAtTick === null ? null : state.wonAtTick / rules.ticksPerSecond,
    },
  };
}
