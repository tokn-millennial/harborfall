// Every sentence the player reads, built from the rules. No page code here, so
// it is tested in Node. Numbers come from the data files, so retuning the game
// updates the text by itself.

import { MILLI } from '../sim/rules.js';

export const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const lower = (rules, good) => rules.goods[good].name.toLowerCase();
// "1 plank", "5 planks", "2 wood"
export const amountText = (rules, good, n) =>
  `${n} ${(n === 1 && rules.goods[good].singular ? rules.goods[good].singular : rules.goods[good].name).toLowerCase()}`;
const seconds = (rules, ticks) => {
  const s = ticks / rules.ticksPerSecond;
  return `${Number.isInteger(s) ? s : s.toFixed(1)} s`;
};
// "2 wood and 1 grain"
const goodsList = (rules, goods) =>
  Object.entries(goods).map(([good, n]) => amountText(rules, good, n)).join(' and ');

// "50 coins, 20 wood" or "Free"
export function costText(rules, cost) {
  const parts = [];
  if (cost.coinsMilli > 0) parts.push(plural(cost.coinsMilli / MILLI, 'coin'));
  for (const [good, n] of Object.entries(cost.goods)) parts.push(amountText(rules, good, n));
  return parts.length ? parts.join(', ') : 'Free';
}

// What a cost is short of right now: "Need 12 more coins and 3 more wood", or null if affordable.
export function shortfallText(game, cost) {
  const { rules, state } = game;
  const parts = [];
  if (state.coinsMilli < cost.coinsMilli) parts.push(`${Math.ceil((cost.coinsMilli - state.coinsMilli) / MILLI)} more coins`);
  for (const [good, n] of Object.entries(cost.goods)) {
    if (state.goods[good] < n) parts.push(`${n - state.goods[good]} more ${lower(rules, good)}`);
  }
  return parts.length ? `Need ${parts.join(' and ')}` : null;
}

// What a demolish gives back: "Returns 25 coins, 10 wood" or "Returns nothing".
export function refundText(rules, building) {
  if (building.free) return 'Returns nothing';
  const cost = rules.buildings[building.type].cost;
  const ratio = rules.economy.demolishRefundRatio;
  const parts = [];
  const coins = Math.floor((cost.coinsMilli / MILLI) * ratio);
  if (coins > 0) parts.push(plural(coins, 'coin'));
  for (const [good, n] of Object.entries(cost.goods)) {
    const back = Math.floor(n * ratio);
    if (back > 0) parts.push(amountText(rules, good, back));
  }
  return parts.length ? `Returns ${parts.join(', ')}` : 'Returns nothing';
}

// Where the town's staff come from, as a few words: "12 to begin with, and 1 for every 2 residents".
export function staffSourceText(rules) {
  const w = rules.workforce;
  if (!w) return '';
  const each = w.perResidentMilli > 0 && 1000 % w.perResidentMilli === 0
    ? (w.perResidentMilli === 1000 ? '1 for every resident' : `1 for every ${1000 / w.perResidentMilli} residents`)
    : `${w.perResidentMilli / 1000} for every resident`;
  return w.perResidentMilli > 0 ? `${w.base} to begin with, and ${each}` : `${w.base}`;
}

// The staff item on the top bar. `staff` is the summary's staff entry.
// { value, title, short }: "13 spare", or "18 short" with the speed in the title.
// `closed` is how many producers the player has closed.
export function staffText(rules, staff, closed = 0) {
  const gap = staff.available - staff.needed;
  const facts = `Your producing buildings need ${staff.needed} staff. The town has ${staff.available} (${staffSourceText(rules)}).`;
  const shut = closed > 0 ? ` ${closed === 1 ? '1 building is' : `${closed} buildings are`} closed and ${closed === 1 ? 'needs' : 'need'} none.` : '';
  if (!staff.short) return { value: `${gap} spare`, short: false, title: `${facts} Every producer works at full speed.${shut}` };
  return { value: `${-gap} short`, short: true, title: `${facts} Every producer works at ${staff.percent}% speed. Build more houses, or close a building you can spare.${shut}` };
}

// One or two lines for the build menu: what the building is for.
export function buildingBlurb(rules, id) {
  const def = rules.buildings[id];
  const lines = [];
  if (def.category === 'road') lines.push('Links buildings to a warehouse. Drag to lay a line.');
  if (def.category === 'storage') lines.push(`Adds room for ${def.storagePerGood} more of each good.`);
  if (def.production) {
    const p = def.production;
    const out = goodsList(rules, p.outputs);
    const every = seconds(rules, p.cycleTicks);
    lines.push(Object.keys(p.inputs).length ? `Turns ${goodsList(rules, p.inputs)} into ${out} every ${every}.` : `Makes ${out} every ${every}.`);
    if (rules.workforce && def.staff > 0) lines.push(`Needs ${def.staff} staff.`);
  }
  if (def.housingTier) {
    const tier = rules.tiers[def.housingTier];
    lines.push(`Holds ${plural(tier.capacity, tier.name)}. Needs a market in range.`);
  }
  if (def.marketRadius > 0) lines.push(`Supplies houses within ${def.marketRadius} tiles.`);
  const rule = placementText(rules, id);
  if (rule) lines.push(rule);
  if (def.requiresRoad) lines.push('Needs a road to a warehouse.');
  if (def.upkeepMilliPerMinute > 0) lines.push(`Upkeep ${def.upkeepMilliPerMinute / MILLI} coins a minute.`);
  return lines;
}

// The placement rule of a building, as a sentence. Null if it can go anywhere.
export function placementText(rules, id) {
  const rule = rules.buildings[id].placement;
  if (!rule) return null;
  const name = (terrain) => rules.map.terrain[terrain].name.toLowerCase();
  if (rule.terrainInRadius) {
    const r = rule.terrainInRadius;
    return `Needs ${r.minTiles} or more ${name(r.terrain)} tiles within ${r.radius} tiles.`;
  }
  if (rule.adjacentTerrain) return `Must touch a ${name(rule.adjacentTerrain)} tile.`;
  if (rule.footprintTerrain) return `Must stand entirely on ${name(rule.footprintTerrain)}.`;
  return null;
}

const FIXED_REASONS = {
  out_of_bounds: 'That is off the island.',
  not_buildable: 'You cannot build on water or forest.',
  blocked: 'Something is already there.',
  unknown_building: 'That building does not exist.',
  not_enough_coins: 'Not enough coins.',
  not_enough_goods: 'Not enough materials.',
  nothing_here: 'There is nothing to demolish here.',
  last_warehouse: 'You cannot demolish your last warehouse.',
  not_a_house: 'Only houses can be upgraded.',
  not_a_producer: 'Only buildings that make things can be closed.',
  already_closed: 'It is already closed.',
  not_closed: 'It is not closed.',
  max_tier: 'This house is already at the top tier.',
  house_not_full: 'The house must be full before it can be upgraded.',
  no_market: 'No market in range.',
  needs_unmet: 'The residents are short of something they need.',
  no_road: 'Not connected to a warehouse by road.',
  missing_input: 'Waiting for materials.',
  storage_full: 'Storage is full.',
  nothing_to_undo: 'There is nothing to undo.',
  undo_expired: 'It is too late to undo that.',
  undo_spent: 'That cannot be undone: what it gave back has already been used.',
  unknown_command: 'That action is not understood.',
  bad_command: 'That action is not understood.',
};

// A reason code from the simulation, as a sentence.
//   options.building  the building being placed, for placement rules
//   options.cost      the cost being paid, to say exactly what is missing
export function reasonText(game, code, options = {}) {
  const { rules } = game;
  if (!code) return '';
  if ((code === 'not_enough_coins' || code === 'not_enough_goods') && options.cost) {
    return `${shortfallText(game, options.cost) ?? FIXED_REASONS[code].slice(0, -1)}.`;
  }
  if (code === 'missing_input' && options.building) {
    const inputs = rules.buildings[options.building].production?.inputs ?? {};
    if (Object.keys(inputs).length) return `Waiting for ${Object.keys(inputs).map((g) => lower(rules, g)).join(' and ')}.`;
  }
  if (FIXED_REASONS[code]) return FIXED_REASONS[code];
  if (code.startsWith('needs_')) {
    return (options.building && placementText(rules, options.building)) || `Needs ${code.slice(6).replace(/_/g, ' ')} nearby.`;
  }
  if (code.startsWith('no_')) {
    const good = code.slice(3);
    return `No ${rules.goods[good] ? lower(rules, good) : good.replace(/_/g, ' ')} in stock.`;
  }
  return 'That cannot be done.';
}

// The goal the player is working toward: the win, then each goal after it in
// turn, and once all are done, the last of them.
// `summary` is what getSummary(game) returned.
export function currentGoal(rules, summary) {
  const win = { tier: summary.win.tier, target: summary.win.target, current: summary.win.current, reached: summary.win.won, title: null };
  if (!summary.win.won) return win;
  const next = summary.milestones.find((m) => m.reachedAtTick === null) ?? summary.milestones[summary.milestones.length - 1];
  return next ? { tier: next.tier, target: next.target, current: next.current, reached: next.reachedAtTick !== null, title: next.title } : win;
}

// A scenario's medal times in words: "Gold within 13 minutes, silver within 20."
// `medals` is { goldTicks, silverTicks }, as the rules hold them.
export function medalTimesText(rules, medals) {
  if (!medals) return '';
  const minutes = (ticks) => Number((ticks / rules.ticksPerMinute).toFixed(1));
  return `Gold within ${minutes(medals.goldTicks)} minutes, silver within ${minutes(medals.silverTicks)}.`;
}

const MEDAL_NAME = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
export const medalName = (medal) => MEDAL_NAME[medal] ?? null;

// What a scenario asks for: "120 Farmers".
export function scenarioGoalText(rules, scenario) {
  return `${scenario.win.residents} ${rules.tiers[scenario.win.tier]?.name ?? scenario.win.tier}s`;
}

// What the win screen says. `buildings` is how many stand on the island.
// In a scenario with medal times it also says which medal was earned.
export function winMessage(rules, summary, buildings) {
  const name = (tier) => `${rules.tiers[tier].name}s`;
  const next = summary.milestones.find((m) => m.reachedAtTick === null);
  const medal = summary.win.medal ?? null;
  return {
    title: 'You win!',
    detail: `${summary.win.target} ${name(summary.win.tier)} live on your island. It took ${clock(summary.win.wonAtSeconds)} of game time.`,
    stats: `You finished with ${summary.coins} coins and ${buildings} buildings.`,
    medal: medal ? { kind: medal, text: `${medalName(medal)} medal. ${medalTimesText(rules, rules.medals)}` } : null,
    next: next ? `There is more, if you want it. Next goal: ${next.target} ${name(next.tier)}.` : null,
  };
}

// What the screen says when goal number `index` after the win is reached.
export function milestoneMessage(rules, summary, index, buildings) {
  const name = (tier) => `${rules.tiers[tier].name}s`;
  const m = summary.milestones[index];
  const next = summary.milestones.find((other) => other.reachedAtTick === null);
  return {
    title: m.title ?? 'Goal reached!',
    detail: `${m.target} ${name(m.tier)} live on your island. It took ${clock(m.reachedAtSeconds)} of game time.`,
    stats: `You have ${summary.coins} coins and ${buildings} buildings.`,
    next: next ? `Next goal: ${next.target} ${name(next.tier)}.` : 'That was the last goal. The island is yours.',
  };
}

// How houses move up, in words: "Farmer to Worker, Worker to Artisan".
export function upgradePathText(rules) {
  return Object.values(rules.tiers).filter((tier) => tier.upgrade).map((tier) => `${tier.name} to ${rules.tiers[tier.upgrade.to].name}`).join(', ');
}

// The short line under the Undo button: what an undo would take back.
// `status` is what undoStatus(game) returned.
export function undoLabel(rules, status) {
  if (!status.ok) return status.reason === 'undo_expired' ? 'Too late' : 'Nothing yet';
  const name = status.type ? rules.buildings[status.type]?.name ?? 'Building' : null;
  if (status.kind === 'place') return name ?? 'Building';
  if (status.kind === 'road') return status.count === 1 ? 'Road, 1 tile' : `Road, ${status.count} tiles`;
  if (status.kind === 'demolish') return `${name} back`;
  if (status.kind === 'unroad') return 'Road back';
  if (status.kind === 'upgrade') return 'Upgrade';
  if (status.kind === 'close') return 'Closing';
  if (status.kind === 'reopen') return 'Reopening';
  return 'Last action';
}

// Which problems are serious (red) and which are a wait (amber).
export function issueLevel(code) {
  if (!code) return 'ok';
  return code === 'no_road' || code === 'no_market' ? 'bad' : 'warn';
}
