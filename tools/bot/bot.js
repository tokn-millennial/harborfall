// The bot: plays a whole game headless by following a build order.
//
// It works through the order one step at a time. For each step it waits until
// the step can be afforded, then does it. It records what it waited for, so a
// run shows exactly where a build order slows down or gets stuck.

import { execute, canUpgrade, getSummary, staffing, step as simStep } from '../../src/sim/index.js';
import { createPlanner } from './planner.js';
import { createRng } from '../../src/sim/rng.js';

// { steps: [{ build: 'house', count: 4 }, { upgrade: 2 }] } becomes one entry per action.
// { trade: 'wood', mode: 'sell', level: 60 } gives the trade ship a standing order.
export function expandOrder(order) {
  const steps = [];
  for (const entry of order.steps) {
    if (entry.build) {
      for (let i = 0; i < (entry.count ?? 1); i++) steps.push({ kind: 'build', building: entry.build, label: `build ${entry.build}` });
    } else if (entry.trade) {
      steps.push({ kind: 'trade', good: entry.trade, mode: entry.mode, level: entry.level ?? 0, label: `trade order: ${entry.mode} ${entry.trade}${entry.mode === 'off' ? '' : ` at ${entry.level}`}` });
    } else if (entry.upgrade) {
      // "to" picks which upgrade: { upgrade: 9, to: 'artisan' } only moves houses up to Artisans.
      for (let i = 0; i < entry.upgrade; i++) steps.push({ kind: 'upgrade', to: entry.to ?? null, label: entry.to ? `upgrade to ${entry.to}` : 'upgrade house' });
    } else {
      throw new Error(`Build order entry not understood: ${JSON.stringify(entry)}`);
    }
  }
  return steps;
}

const RETRY = Symbol('retry');

// When several houses refuse an upgrade, report the one closest to being ready.
const UPGRADE_REASON_RANK = ['not_enough_coins', 'not_enough_goods', 'no_bread', 'no_cloth', 'needs_unmet', 'house_not_full', 'no_market', 'max_tier'];

export function runBot(game, order, options = {}) {
  // options.pace makes the bot act at a person's speed, not instantly. It is
  // { seed, startSeconds, thinkSeconds: [min, max], roadTileSeconds, pauseChance, pauseSeconds: [min, max] }.
  // See tools/bot/paces.json. Without it the bot acts the moment it can afford a step.
  // options.pastWin keeps the bot playing after the win, until its order is done
  // and every milestone is reached (or time runs out).
  const { maxMinutes = 90, decisionSeconds = 1, stallMinutes = 5, pace = null, pastWin = false } = options;
  const { rules, state } = game;
  const planner = createPlanner(game);
  const steps = expandOrder(order);
  const decisionTicks = Math.max(1, Math.round(decisionSeconds * rules.ticksPerSecond));
  const maxTicks = maxMinutes * rules.ticksPerMinute;
  const roadCost = rules.buildings.road.cost.coinsMilli;
  const marketType = Object.values(rules.buildings).find((b) => b.marketRadius > 0)?.id ?? null;

  const log = [];        // one entry per finished step
  const samples = [];    // one entry per game minute
  const stalls = [];     // steps that waited longer than stallMinutes
  let index = 0;
  let waiting = null;    // { since, reasons: { reason: count } } for the current step
  let zeroCoinTicks = 0;
  let lossTicks = 0;
  let shortStaffTicks = 0;      // time spent with too few staff
  let lowestStaffPercent = 100; // the slowest production ever ran
  let roadsBuilt = 0;

  // A person's hands: after each action, a random time passes before the next.
  const random = pace ? createRng(pace.seed ?? 1) : null;
  const between = ([min, max]) => min + random() * (max - min);
  let readyAtTick = pace ? Math.round((pace.startSeconds ?? 0) * rules.ticksPerSecond) : 0;
  let thinkingTicks = 0;
  function think(roadTiles) {
    let seconds = between(pace.thinkSeconds) + roadTiles * (pace.roadTileSeconds ?? 0);
    if (random() < (pace.pauseChance ?? 0)) seconds += between(pace.pauseSeconds);
    const ticks = Math.round(seconds * rules.ticksPerSecond);
    thinkingTicks += ticks;
    readyAtTick = state.tick + ticks;
  }

  // How many connected producers of each kind there are.
  const producerCounts = () => {
    const counts = {};
    for (const b of state.buildings) if (b.production && b.connected) counts[b.type] = (counts[b.type] ?? 0) + 1;
    return counts;
  };
  const sample = () => {
    const s = getSummary(game);
    samples.push({
      minute: Math.round(s.seconds / 60),
      coins: s.coins,
      net: s.income.net,
      farmer: s.residents.farmer ?? 0,
      worker: s.residents[rules.win.tier] ?? 0,
      residents: s.residents,
      goods: s.goods,
      staff: s.staff,
      producers: producerCounts(),
    });
  };

  // Tries the current step. Returns null when it was done, or the reason it must wait.
  function attempt(current) {
    if (current.kind === 'build') {
      const def = rules.buildings[current.building];
      const plan = (current.plan ??= planner.plan(current.building));
      if (plan.reason) {
        current.plan = null; // look again next time, the map may have changed
        // No room left near any market: do what a player would, and add a market first.
        if (plan.reason === 'no_site_in_market_range' && marketType && !current.marketAdded) {
          current.marketAdded = true;
          steps.splice(index, 0, { kind: 'build', building: marketType, label: `build ${marketType} (added by the bot: no house site left in range)` });
          return RETRY;
        }
        return plan.reason;
      }
      if (state.coinsMilli < def.cost.coinsMilli + plan.roads.length * roadCost) return 'not_enough_coins';
      for (const [good, amount] of Object.entries(def.cost.goods)) {
        if (state.goods[good] < amount) return `not_enough_${good}`;
      }
      const placed = execute(game, { action: 'place', building: current.building, x: plan.x, y: plan.y });
      if (!placed.ok) {
        current.plan = null;
        return placed.reason;
      }
      if (plan.roads.length > 0) {
        const laid = execute(game, { action: 'road', tiles: plan.roads });
        roadsBuilt += laid.placed ?? 0;
        if (!laid.ok) current.note = `road problem: ${laid.reason}`;
      }
      current.at = [plan.x, plan.y];
      current.roads = plan.roads.length;
      return null;
    }

    // A trade order: given as soon as there is a harbour to give it to.
    if (current.kind === 'trade') {
      const done = execute(game, { action: 'trade', good: current.good, mode: current.mode, level: current.level });
      return done.ok || done.reason === 'no_change' ? null : done.reason;
    }

    // Upgrade: take the first house that is ready.
    let bestReason = null;
    for (const b of state.buildings) {
      if (!b.house || !rules.tiers[b.house.tier].upgrade) continue;
      if (current.to && rules.tiers[b.house.tier].upgrade.to !== current.to) continue;
      const check = canUpgrade(game, b.id);
      if (check.ok) {
        execute(game, { action: 'upgrade', id: b.id });
        current.at = [b.x, b.y];
        return null;
      }
      const rank = UPGRADE_REASON_RANK.indexOf(check.reason);
      if (bestReason === null || rank < UPGRADE_REASON_RANK.indexOf(bestReason)) bestReason = check.reason;
    }
    return bestReason ?? 'no_house_to_upgrade';
  }

  sample();
  // A build order can also ask to be played past the win ("pastWin": true).
  const playOn = pastWin || order.pastWin === true;
  const finished = () => (playOn ? index >= steps.length && state.milestones.every((tick) => tick !== null) : state.won);
  while (state.tick < maxTicks && !finished()) {
    if (state.tick % decisionTicks === 0 && state.tick >= readyAtTick) {
      while (index < steps.length) {
        const current = steps[index];
        const reason = attempt(current);
        if (reason === RETRY) continue; // a step was inserted in front of this one
        if (reason) {
          waiting ??= { since: state.tick, reasons: {} };
          waiting.reasons[reason] = (waiting.reasons[reason] ?? 0) + 1;
          break;
        }
        const waitedTicks = waiting ? state.tick - waiting.since : 0;
        const mainReason = waiting ? Object.entries(waiting.reasons).sort((a, b) => b[1] - a[1])[0][0] : null;
        const entry = {
          step: index + 1,
          label: current.label,
          at: current.at,
          roads: current.roads ?? 0,
          doneAtSeconds: state.tick / rules.ticksPerSecond,
          waitedSeconds: waitedTicks / rules.ticksPerSecond,
          waitedFor: mainReason,
          note: current.note ?? null,
        };
        log.push(entry);
        if (waitedTicks > stallMinutes * rules.ticksPerMinute) stalls.push(entry);
        waiting = null;
        index++;
        // At a person's pace, one action at a time.
        if (pace) {
          think(entry.roads);
          break;
        }
      }
    }
    simStep(game);
    if (state.coinsMilli === 0) zeroCoinTicks++;
    if (state.lastIncome && state.lastIncome.netMilli < 0) lossTicks++;
    const staffRatio = staffing(game).ratioMilli;
    if (staffRatio < 1000) {
      shortStaffTicks++;
      lowestStaffPercent = Math.min(lowestStaffPercent, Math.floor(staffRatio / 10));
    }
    if (state.tick % rules.ticksPerMinute === 0) sample();
  }

  const summary = getSummary(game);
  const counts = {};
  for (const b of state.buildings) counts[b.type] = (counts[b.type] ?? 0) + 1;

  // If the run ended with a step still waiting, say what it was waiting for.
  let stuckOn = null;
  if (index < steps.length) {
    const mainReason = waiting ? Object.entries(waiting.reasons).sort((a, b) => b[1] - a[1])[0][0] : 'not_started';
    stuckOn = {
      step: index + 1,
      label: steps[index].label,
      waitedFor: mainReason,
      waitedSeconds: waiting ? (state.tick - waiting.since) / rules.ticksPerSecond : 0,
    };
  }

  return {
    order: order.name ?? 'unnamed',
    won: state.won,
    wonAtMinutes: state.won ? summary.win.wonAtSeconds / 60 : null,
    playedPastWin: playOn,
    milestones: summary.milestones.map((m) => ({ title: m.title, tier: m.tier, target: m.target, current: m.current, reachedAtMinutes: m.reachedAtSeconds === null ? null : m.reachedAtSeconds / 60 })),
    endedAtMinutes: summary.seconds / 60,
    stepsDone: index,
    stepsTotal: steps.length,
    stuckOn,
    stalls,
    log,
    samples,
    summary,
    counts,
    roadsBuilt,
    thinkingMinutes: thinkingTicks / rules.ticksPerMinute,
    zeroCoinMinutes: zeroCoinTicks / rules.ticksPerMinute,
    lossMinutes: lossTicks / rules.ticksPerMinute,
    shortStaffMinutes: shortStaffTicks / rules.ticksPerMinute,
    lowestStaffPercent,
  };
}
