// The bot: plays a whole game headless by following a build order.
//
// It works through the order one step at a time. For each step it waits until
// the step can be afforded, then does it. It records what it waited for, so a
// run shows exactly where a build order slows down or gets stuck.

import { HOME, SECOND, secondIsOpen, buildingIssue, execute, canUpgrade, getSummary, islandAt, paysFrom, siteReason, staffing, stockOf, step as simStep } from '../../src/sim/index.js';
import { createPlanner } from './planner.js';
import { createRng } from '../../src/sim/rng.js';

// { steps: [{ build: 'house', count: 4 }, { upgrade: 2 }] } becomes one entry per action.
// { trade: 'wood', mode: 'sell', level: 60 } gives the trade ship a standing order.
export function expandOrder(order) {
  const steps = [];
  for (const entry of order.steps) {
    if (entry.build) {
      // "island": "second" builds on the second island (see src/sim/islands.js).
      const island = entry.island === 'second' ? SECOND : HOME;
      const where = island === SECOND ? ' on the second island' : '';
      for (let i = 0; i < (entry.count ?? 1); i++) steps.push({ kind: 'build', building: entry.build, island, label: `build ${entry.build}${where}` });
    } else if (entry.found) {
      // { found: 'second' }: the second island's first warehouse and harbour, side by side on its near shore.
      steps.push({ kind: 'found', label: 'found the second island: a harbour at home facing it, then a warehouse and a harbour there' });
    } else if (entry.ship) {
      // { ship: 'wood', way: 'out' }: what your own ship carries.
      steps.push({ kind: 'ship', good: entry.ship, way: entry.way, keep: entry.keep ?? null, label: `ship order: ${entry.ship} ${entry.way}${entry.keep ? `, keeping ${entry.keep}` : ''}` });
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
const UPGRADE_REASON_RANK = ['not_enough_coins', 'not_enough_goods', 'no_bread', 'no_cloth', 'no_wine', 'needs_unmet', 'house_not_full', 'no_market', 'max_tier'];

export function runBot(game, order, options = {}) {
  // options.pace makes the bot act at a person's speed, not instantly. It is
  // { seed, startSeconds, thinkSeconds: [min, max], roadTileSeconds, pauseChance, pauseSeconds: [min, max] }.
  // See tools/bot/paces.json. Without it the bot acts the moment it can afford a step.
  // options.pastWin keeps the bot playing after the win, until its order is done
  // and every milestone is reached (or time runs out).
  const { maxMinutes = 90, decisionSeconds = 1, stallMinutes = 5, pace = null, pastWin = false } = options;
  const { rules, state } = game;
  const planner = createPlanner(game);
  // The second island's planner, made once it has a warehouse to anchor its layout.
  let secondPlanner = null;
  const plannerFor = (island) => {
    if (island !== SECOND) return planner;
    if (!secondPlanner && state.buildings.some((b) => rules.buildings[b.type].category === 'storage' && islandAt(state.map, b.x, b.y) === SECOND)) {
      secondPlanner = createPlanner(game, { island: SECOND });
    }
    return secondPlanner;
  };
  const steps = expandOrder(order);
  const decisionTicks = Math.max(1, Math.round(decisionSeconds * rules.ticksPerSecond));
  const maxTicks = maxMinutes * rules.ticksPerMinute;
  const roadCost = rules.buildings.road.cost.coinsMilli;
  const marketType = Object.values(rules.buildings).find((b) => b.marketRadius > 0)?.id ?? null;
  const storageType = Object.values(rules.buildings).find((b) => b.category === 'storage')?.id ?? null;
  // When the bot last built a warehouse because carts were struggling: at most one every three minutes.
  const WAREHOUSE_REST_TICKS = 3 * rules.ticksPerMinute;
  let struggleWarehouseAt = -Infinity;
  // When the bot last built a house because it was short of staff (see attempt).
  const houseType = Object.values(rules.buildings).find((b) => b.category === 'house')?.id ?? null;
  const STAFF_HOUSE_REST_TICKS = 2 * rules.ticksPerMinute;
  const STAFF_HOUSE_COINS = 300;
  const STAFF_SHORT_MILLI = 900;
  let staffHouseAt = -Infinity;

  const log = [];        // one entry per finished step
  const samples = [];    // one entry per game minute
  const stalls = [];     // steps that waited longer than stallMinutes
  let index = 0;
  let waiting = null;    // { since, reasons: { reason: count } } for the current step
  let zeroCoinTicks = 0;
  let lossTicks = 0;
  let shortStaffTicks = 0;      // time spent with too few staff
  let lowestStaffPercent = 100; // the slowest production ever ran
  let cartWaitTicks = 0;        // producer-ticks spent with a full yard, waiting for a cart
  let materialWaitTicks = 0;    // workshop-ticks spent out of materials that the stockpile had
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
    // Each time it tries a step, and so every second while it waits: if the carts
    // are struggling, a warehouse where they struggle first, as the tip line asks.
    if (state.tick - struggleWarehouseAt >= WAREHOUSE_REST_TICKS) {
      for (const island of [HOME, SECOND]) {
        const spot = plannerFor(island)?.cartsStruggling();
        if (!spot) continue;
        struggleWarehouseAt = state.tick;
        steps.splice(index, 0, { kind: 'build', building: storageType, island, near: spot, label: `build ${storageType}${island === SECOND ? ' on the second island' : ''} (added by the bot: carts struggling)` });
        return RETRY;
      }
    }

    // Short of staff with coins to spare: another house, as the tip line asks a
    // player. At most one every two minutes, and only past the win, when the
    // first game's own order is done.
    if (state.won && houseType && state.tick - staffHouseAt >= STAFF_HOUSE_REST_TICKS && state.coinsMilli >= STAFF_HOUSE_COINS * 1000) {
      if (staffing(game).ratioMilli < STAFF_SHORT_MILLI) {
        staffHouseAt = state.tick;
        steps.splice(index, 0, { kind: 'build', building: houseType, island: HOME, label: `build ${houseType} (added by the bot: short of staff)` });
        return RETRY;
      }
    }

    // In a game with no second island (older data, a hand-made map) the steps for it are skipped.
    const noIsland = !state.map.second || !rules.fleet;
    // So are trade orders where there is no trade ship, or no harbour because the island's steps were skipped.
    const noTrade = current.kind === 'trade' && (!rules.trade || (noIsland && !state.buildings.some((b) => rules.buildings[b.type].harbor)));
    if (noTrade || (noIsland && (current.kind === 'found' || current.kind === 'ship' || current.island === SECOND || rules.buildings[current.building]?.placement?.island === 'second'))) {
      current.note = 'skipped: no second island';
      return null;
    }
    if (current.kind === 'found') return found(current);
    if (current.kind === 'ship') {
      const done = execute(game, { action: 'ship', good: current.good, way: current.way });
      if (!done.ok && done.reason !== 'no_change') return done.reason;
      if (current.keep !== null) {
        const kept = execute(game, { action: 'shipKeep', good: current.good, keep: current.keep });
        if (!kept.ok && kept.reason !== 'no_change') return kept.reason;
      }
      return null;
    }

    if (current.kind === 'build') {
      const def = rules.buildings[current.building];
      if (!def) {
        current.note = 'skipped: no such building in this game';
        return null;
      }
      const island = current.island ?? HOME;
      const islandPlanner = plannerFor(island);
      if (!islandPlanner) return 'not_settled';
      const plan = (current.plan ??= islandPlanner.plan(current.building, current.near ?? null));
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
      // With carts, a workshop far from every warehouse gets one built near it first, as a player would.
      if (!current.warehouseAdded && islandPlanner.farFromWarehouses(current.building, plan)) {
        current.warehouseAdded = true;
        current.plan = null;
        steps.splice(index, 0, { kind: 'build', building: storageType, island, near: [plan.x, plan.y], label: `build ${storageType} (added by the bot: near a far ${current.building})` });
        return RETRY;
      }
      if (state.coinsMilli < def.cost.coinsMilli + plan.roads.length * roadCost) return 'not_enough_coins';
      const goods = stockOf(game, paysFrom(game, island)).goods;
      for (const [good, amount] of Object.entries(def.cost.goods)) {
        if (goods[good] < amount) return `not_enough_${good}${island === SECOND ? '_there' : ''}`;
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

  // The second island's first warehouse and harbour, side by side with one
  // road tile between, on the shore nearest home. Paid from home, as the rules
  // say. Waits for the win, which opens the island.
  function found(current) {
    if (state.buildings.some((b) => rules.buildings[b.type].category === 'storage' && islandAt(state.map, b.x, b.y) === SECOND)) return null;
    const box = state.map.second;
    if (!box) return 'no_second_island';
    if (!secondIsOpen(game)) return 'island_locked';
    const harbourType = Object.values(rules.buildings).find((b) => b.category === 'harbor')?.id;
    // First a harbour at home, on the coast facing the island, so the crossing is short.
    const homeHarbour = state.buildings.some((b) => b.type === harbourType && islandAt(state.map, b.x, b.y) === HOME);
    if (!homeHarbour) {
      const plan = (current.plan ??= planner.plan(harbourType, [box.x, box.y + Math.floor(box.height / 2)]));
      if (plan.reason) {
        current.plan = null;
        return plan.reason;
      }
      const def = rules.buildings[harbourType];
      if (state.coinsMilli < def.cost.coinsMilli + plan.roads.length * roadCost) return 'not_enough_coins';
      for (const [good, amount] of Object.entries(def.cost.goods)) if (state.goods[good] < amount) return `not_enough_${good}`;
      const placed = execute(game, { action: 'place', building: harbourType, x: plan.x, y: plan.y });
      current.plan = null;
      if (!placed.ok) return placed.reason;
      if (plan.roads.length > 0) roadsBuilt += execute(game, { action: 'road', tiles: plan.roads }).placed ?? 0;
      return 'settling'; // the island's own warehouse and harbour next
    }
    const cost = (type) => rules.buildings[type].cost;
    const coins = cost(storageType).coinsMilli + cost(harbourType).coinsMilli + roadCost;
    if (state.coinsMilli < coins) return 'not_enough_coins';
    for (const type of [storageType, harbourType]) {
      for (const [good, amount] of Object.entries(cost(type).goods)) {
        const both = (cost(storageType).goods[good] ?? 0) + (cost(harbourType).goods[good] ?? 0);
        if (state.goods[good] < both) return `not_enough_${good}`;
      }
    }
    // The westmost harbour site that has room for a warehouse beside it.
    for (let x = box.x; x < box.x + box.width; x++) {
      for (let y = box.y; y < box.y + box.height; y++) {
        if (siteReason(game, harbourType, x, y)) continue;
        for (const [wx, wy, rx, ry] of [[x, y - 3, x, y - 1], [x, y + 3, x, y + 2], [x - 3, y, x - 1, y], [x + 3, y, x + 2, y]]) {
          if (siteReason(game, storageType, wx, wy) || siteReason(game, 'road', rx, ry)) continue;
          const warehouse = execute(game, { action: 'place', building: storageType, x: wx, y: wy });
          if (!warehouse.ok) return warehouse.reason;
          const harbour = execute(game, { action: 'place', building: harbourType, x, y });
          if (!harbour.ok) {
            execute(game, { action: 'undo' });
            return harbour.reason;
          }
          execute(game, { action: 'road', tiles: [[rx, ry]] });
          roadsBuilt++;
          current.at = [x, y];
          return null;
        }
      }
    }
    return 'no_site';
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
    // Waiting for a cart, not for room in the stockpile: only more carts would help.
    for (const b of state.buildings) if (b.production?.status === 'yard_full' && buildingIssue(game, b) === 'yard_full') cartWaitTicks++;
    // Out of materials while the stockpile has them: waiting for a cart to bring them.
    if (rules.materials) {
      for (const b of state.buildings) {
        if (b.production?.status !== 'missing_input') continue;
        const inputs = Object.entries(rules.buildings[b.type].production.inputs);
        if (inputs.every(([good, n]) => state.goods[good] >= n)) materialWaitTicks++;
      }
    }
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
    // Producer-minutes lost waiting for a cart: 3 means, for example, three producers idle for a minute each.
    cartWaitMinutes: cartWaitTicks / rules.ticksPerMinute,
    // Workshop-minutes lost waiting for a cart to bring materials the stockpile had.
    materialWaitMinutes: materialWaitTicks / rules.ticksPerMinute,
    lowestStaffPercent,
  };
}
