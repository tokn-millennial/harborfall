// Money and goods: checking a cost, paying it, and refunds.
// Coins are held in whole thousandths ("milli-coins") so nothing ever drifts.

import { MILLI } from './rules.js';

// Returns null if the cost can be paid, otherwise the reason it cannot.
export function affordReason(game, cost) {
  const { state } = game;
  if (state.coinsMilli < cost.coinsMilli) return 'not_enough_coins';
  for (const [good, amount] of Object.entries(cost.goods)) {
    if (state.goods[good] < amount) return 'not_enough_goods';
  }
  return null;
}

export function pay(game, cost) {
  const { state } = game;
  state.coinsMilli -= cost.coinsMilli;
  for (const [good, amount] of Object.entries(cost.goods)) state.goods[good] -= amount;
}

// Gives back a share of a cost, rounded down to whole coins and whole goods.
// Returned goods that do not fit in storage are lost.
// Returns what was actually given: { coinsMilli, goods }.
export function refund(game, cost, ratio) {
  const { state } = game;
  const given = { coinsMilli: Math.floor((cost.coinsMilli / MILLI) * ratio) * MILLI, goods: {} };
  state.coinsMilli += given.coinsMilli;
  for (const [good, amount] of Object.entries(cost.goods)) {
    const room = Math.max(0, state.storageCap - state.goods[good]);
    const back = Math.min(room, Math.floor(amount * ratio));
    state.goods[good] += back;
    if (back > 0) given.goods[good] = back;
  }
  return given;
}

// Total storage room per good: every storage building adds its share.
export function recomputeStorage(game) {
  const { rules, state } = game;
  let cap = 0;
  for (const b of state.buildings) cap += rules.buildings[b.type].storagePerGood;
  state.storageCap = cap;
}

// Coins per minute right now, in milli-coins: taxes from every resident, the
// fixed base income, and upkeep for every building whether it is working or not.
export function incomeRates(game) {
  const { rules, state } = game;
  let taxesMilli = 0;
  let upkeepMilli = 0;
  for (const b of state.buildings) {
    upkeepMilli += rules.buildings[b.type].upkeepMilliPerMinute;
    if (b.house) taxesMilli += b.house.residents * rules.tiers[b.house.tier].taxMilliPerMinute;
  }
  const baseMilli = rules.economy.baseIncomeMilliPerMinute;
  return { taxesMilli, baseMilli, upkeepMilli, netMilli: taxesMilli + baseMilli - upkeepMilli };
}

// Called every tick. When the income interval is up, settles taxes + base - upkeep.
// Coins never go below zero: unpaid upkeep is forgiven.
export function settleIncome(game) {
  const { rules, state } = game;
  const interval = rules.economy.incomeIntervalTicks;
  state.incomeTimer++;
  if (state.incomeTimer < interval) return;
  state.incomeTimer = 0;

  const rates = incomeRates(game);
  const due = Math.round((rates.netMilli * interval) / rules.ticksPerMinute);
  const before = state.coinsMilli;
  state.coinsMilli = Math.max(0, before + due);
  state.lastIncome = { ...rates, dueMilli: due, paidMilli: state.coinsMilli - before };
}
