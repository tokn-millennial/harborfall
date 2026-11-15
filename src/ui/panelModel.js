// What the info panel says about one building: a title, some lines, and the
// buttons. Plain data, built from the game, so it is tested in Node.
// infoPanel.js turns this into page elements.

import { MAX_KEEP } from '../sim/ship.js';
import { SECOND, buildingIssue, canUpgrade, hasSecondIsland, houseCapacity, housesInRangeOf, islandOf, needCounts, paysFrom, shipSummary, staffing, stockOfBuildingFor } from '../sim/index.js';
import { MILLI } from '../sim/rules.js';
import { SHIP_WAY_TEXT, amountText, cartTimeText, clock, costText, issueLevel, reasonText, refundText, shipStatusText, tradeCallText, tradeOrderText } from './text.js';
import { MAX_TRADE_LEVEL, currentPrice } from '../sim/trade.js';
import { previewDemolish } from './tools.js';

// options.confirmDemolish: the Demolish button has been pressed once and is waiting for a second press.
export function panelModel(game, building, options = {}) {
  const { rules, state } = game;
  const def = rules.buildings[building.type];
  const lines = [];
  const actions = [];
  const issue = buildingIssue(game, building);
  const island = islandOf(game, building);
  const stock = stockOfBuildingFor(game, building); // its own island's goods

  let title = def.name;
  if (island === SECOND) lines.push({ label: 'Island', value: 'The second island' });

  if (building.house) {
    const h = building.house;
    const tier = rules.tiers[h.tier];
    title = `${tier.name} house`;
    const cap = houseCapacity(game, h);
    // Going without a need that limits how full it gets (an Artisan house without wine).
    const limited = cap < tier.capacity ? ` (${tier.capacity} with ${Object.keys(tier.capacityWithout).map((g) => rules.goods[g].name.toLowerCase()).join(' and ')})` : '';
    lines.push({ label: 'Residents', value: `${h.residents} of ${cap}${limited}` });
    lines.push({ label: 'Market', value: h.served ? 'In range' : 'None in range', level: h.served ? 'ok' : 'bad' });
    for (const good of Object.keys(tier.needs)) {
      // A need that only fills the house: wanted once the second island is open.
      if (good in tier.capacityWithout && !needCounts(game, good)) {
        lines.push({ label: rules.goods[good].name, value: 'Wanted once the second island opens' });
        continue;
      }
      const met = h.served && h.met[good];
      const without = good in tier.capacityWithout ? `. Holds ${tier.capacityWithout[good]} without it` : '';
      lines.push({
        label: rules.goods[good].name,
        value: met ? 'Supplied' : (h.served ? 'None in stock' : 'Not supplied') + without,
        level: met ? 'ok' : 'warn',
      });
    }
    lines.push({ label: 'Taxes', value: `+${((h.residents * tier.taxMilliPerMinute) / MILLI).toFixed(1)} coins a minute` });

    if (tier.upgrade) {
      const next = rules.tiers[tier.upgrade.to];
      const check = canUpgrade(game, building.id);
      actions.push({
        id: 'upgrade',
        label: `Upgrade to ${next.name} house`,
        detail: `${costText(rules, tier.upgrade.cost)}. Holds ${next.capacity}${Object.entries(next.capacityWithout).filter(([g]) => needCounts(game, g)).map(([g, n]) => `, ${n} without ${rules.goods[g].name.toLowerCase()}`).join('')}.`,
        enabled: check.ok,
        reason: check.ok ? null : reasonText(game, check.reason, { cost: tier.upgrade.cost, from: paysFrom(game, island) }),
      });
    }
  } else {
    // A producer the player has closed says so, unless something worse (no road) is wrong with it.
    const closed = Boolean(building.production?.closed) && !issue;
    const harbourStatus = island === SECOND ? 'For your own ship.' : 'Open to ships.';
    let status = closed ? 'Closed. It makes nothing.' : issue ? reasonText(game, issue, { building: building.type }) : building.production ? 'Working.' : def.harbor ? harbourStatus : 'Fine.';
    const inputs = Object.keys(def.production?.inputs ?? {});
    if (issue === 'missing_input' && rules.materials && inputs.every((g) => stock.goods[g] >= def.production.inputs[g])) {
      status = `Waiting for a cart to bring ${inputs.map((g) => rules.goods[g].name.toLowerCase()).join(' and ')}.`;
    }
    lines.push({ label: 'Status', value: status, level: closed ? 'warn' : issueLevel(issue) });
  }

  // Carts: what waits in the yard, and how far the nearest warehouse is.
  if (building.production && rules.carts) {
    const yard = building.production.yard;
    const waiting = rules.goodIds.filter((g) => yard[g] > 0).map((g) => amountText(rules, g, yard[g])).join(', ');
    lines.push({ label: 'Waiting here', value: `${waiting || 'Nothing'} (room for ${rules.carts.yard})` });
    // A workshop's own store of materials, which carts keep topped up.
    if (rules.materials && Object.keys(def.production.inputs).length > 0) {
      const store = building.production.store;
      const held = Object.keys(def.production.inputs).map((g) => amountText(rules, g, store[g] ?? 0)).join(', ');
      lines.push({ label: 'Materials', value: `${held} (room for ${rules.materials.store})` });
    }
    const haul = building.production.haul;
    if (haul && haul.tiles <= rules.carts.reachTiles) {
      // Short, so it stays on one line beside its label: "7 road tiles · 3.5 s by cart".
      lines.push({ label: 'Warehouse', value: `${haul.tiles} road ${haul.tiles === 1 ? 'tile' : 'tiles'} · ${cartTimeText(rules, haul.tiles)} by cart` });
    } else if (haul) {
      lines.push({ label: 'Warehouse', value: `${haul.tiles} road tiles. Carts go ${rules.carts.reachTiles}.`, level: 'bad' });
    }
  }

  if (building.production) {
    const p = def.production;
    const every = p.cycleTicks / rules.ticksPerSecond;
    const out = Object.entries(p.outputs).map(([g, n]) => amountText(rules, g, n)).join(' and ');
    const inputs = Object.entries(p.inputs).map(([g, n]) => amountText(rules, g, n)).join(' and ');
    lines.push({ label: inputs ? 'Turns' : 'Makes', value: inputs ? `${inputs} into ${out} every ${every} s` : `${out} every ${every} s` });
    lines.push({ label: 'Progress', value: `${Math.floor((building.production.progress / p.cycleTicks) * 100)}%`, progress: building.production.progress / p.cycleTicks });
    if (rules.workforce && def.staff > 0) {
      const staff = staffing(game);
      const slowed = building.connected && !building.production.closed && staff.ratioMilli < 1000;
      if (building.production.closed) lines.push({ label: 'Staff', value: `None while closed (${def.staff} when open)` });
      else if (slowed) lines.push({ label: 'Staff', value: `Needs ${def.staff}. Town is short: ${Math.floor(staff.ratioMilli / 10)}% speed`, level: 'warn' });
      else lines.push({ label: 'Staff', value: `Needs ${def.staff}` });
    }
  }

  if (def.marketRadius > 0) {
    lines.push({ label: 'Range', value: `${def.marketRadius} tiles` });
    lines.push({ label: 'Houses in range', value: String(housesInRangeOf(game, building)) });
  }

  let trade = null;
  // The trade ship calls at the home island only.
  if (def.harbor && rules.trade && island !== SECOND) {
    const t = state.trade;
    const due = (rules.trade.shipTicks - t.timer) / rules.ticksPerSecond;
    lines.push({ label: 'Next ship', value: building.connected ? `in ${clock(due)}` : 'Not while cut off by road', level: building.connected ? undefined : 'warn' });
    lines.push({ label: 'It carries', value: `${rules.trade.unitsPerHarbor} goods a call` });
    const call = tradeCallText(rules, t.last);
    lines.push({ label: 'Last call', value: t.last ? (call ? call.replace(/^The trade ship /, '').replace(/^./, (c) => c.toUpperCase()) : 'Nothing to trade.') : 'None yet.' });
    trade = tradeRows(game);
  }

  // Your own ship: where it is, on every harbour; what it carries each way, on the second island's.
  let ship = null;
  if (def.harbor && rules.fleet && hasSecondIsland(game)) {
    const s = shipSummary(game);
    lines.push({ label: 'Your ship', value: shipStatusText(s), level: s.route ? undefined : 'warn' });
    lines.push({ label: 'On board', value: s.units > 0 ? rules.goodIds.filter((g) => s.cargo[g] > 0).map((g) => amountText(rules, g, s.cargo[g])).join(', ') : `Nothing (holds ${s.capacity})` });
    if (island === SECOND) ship = shipRows(game, s);
    else lines.push({ label: 'Its orders', value: 'Set at the harbour on the second island.' });
  }

  if (def.storagePerGood > 0) {
    lines.push({ label: 'Storage', value: `${def.storagePerGood} of each good` });
    lines.push({ label: 'Island total', value: `${stock.storageCap} of each good` });
  }
  if (rules.carts && def.carts > 0) {
    const mine = state.carts.filter((c) => c.home === building.id);
    const out = mine.filter((c) => c.phase !== 'home').length;
    lines.push({ label: 'Carts', value: `${mine.length}, ${out === 0 ? 'all at home' : `${out} out`}` });
    lines.push({ label: 'Reach', value: `${rules.carts.reachTiles} tiles by road` });
  }

  if (def.upkeepMilliPerMinute > 0) lines.push({ label: 'Upkeep', value: `${def.upkeepMilliPerMinute / MILLI} coins a minute` });

  // Closing a producer: it stops, and its staff go to the others.
  if (building.production) {
    const staffed = rules.workforce && def.staff > 0;
    if (building.production.closed) {
      actions.push({
        id: 'reopenBuilding',
        label: 'Reopen',
        detail: staffed ? `It goes back to work. Needs ${def.staff} staff.` : 'It goes back to work.',
        enabled: true,
        reason: null,
      });
    } else {
      actions.push({
        id: 'closeBuilding',
        label: 'Close for now',
        detail: `${staffed ? `Frees its ${def.staff} staff. ` : ''}It makes nothing${def.upkeepMilliPerMinute > 0 ? ' and still costs its upkeep' : ''}.`,
        enabled: true,
        reason: null,
      });
    }
  }

  const demolish = previewDemolish(game, building.x, building.y, building);
  actions.push({
    id: 'demolish',
    label: options.confirmDemolish ? 'Press again to demolish' : 'Demolish',
    detail: `${refundText(rules, building)}.`,
    enabled: demolish.ok,
    reason: demolish.ok ? null : reasonText(game, demolish.reason),
  });

  return { title, issue, level: issueLevel(issue), lines, actions, trade, ship };
}

// What your ship carries, one row per good, with the stock on each island.
// The button goes round: stays, takes it over, brings it home. Each button
// carries its whole command, as "ship:good:way". A good that is carried also
// shows how many the ship leaves behind on the island it loads from, with −
// and + in steps of 10 ("keep:good:level").
const NEXT_WAY = { off: 'out', out: 'back', back: 'off' };
const KEEP_STEP = 10;
function shipRows(game, ship) {
  const { rules, state } = game;
  return rules.goodIds.map((good) => {
    const way = ship.orders[good] ?? 'off';
    const keep = ship.keep[good] ?? 0;
    const source = way === 'back' ? state.second : state;
    const top = Math.min(MAX_KEEP, Math.max(source.storageCap, KEEP_STEP));
    const down = Math.max(0, Math.ceil(keep / KEEP_STEP) * KEEP_STEP - KEEP_STEP);
    const up = Math.min(top, Math.floor(keep / KEEP_STEP) * KEEP_STEP + KEEP_STEP);
    const carried = way !== 'off';
    return {
      good,
      name: rules.goods[good].name,
      stocks: `home ${state.goods[good]} · here ${state.second.goods[good]}`,
      way,
      order: SHIP_WAY_TEXT[way],
      next: `ship:${good}:${NEXT_WAY[way]}`,
      // Short, so the row stays two lines: "keeps 20". Where it is kept is said on hover.
      keep: carried ? `keeps ${keep}` : null,
      keepWhere: carried ? (way === 'out' ? 'at home' : 'on the second island') : null,
      down: carried && keep > 0 ? `keep:${good}:${down}` : null,
      up: carried && keep < top ? `keep:${good}:${up}` : null,
    };
  });
}

// "sells 0.34 · buys 1.7 ↓": today's prices, rounded to two places, and which way they have moved.
function priceText(price) {
  const coins = (milli) => String(Math.round(milli / 10) / 100);
  const arrow = price.factorMilli < 1000 ? ' ↓' : price.factorMilli > 1000 ? ' ↑' : '';
  return `sells ${coins(price.sellMilli)} · buys ${coins(price.buyMilli)}${arrow}`;
}

// The harbour's standing orders, one row per good that can be traded. Each
// button carries the whole command it gives, as "trade:good:mode:level".
const TRADE_STEP = 10;
const FIRST_SELL_LEVEL = 50;
const FIRST_BUY_LEVEL = 20;
function tradeRows(game) {
  const { rules, state } = game;
  const top = Math.min(MAX_TRADE_LEVEL, Math.max(state.storageCap, TRADE_STEP));
  const command = (good, mode, level) => `trade:${good}:${mode}:${level}`;
  return rules.goodIds.filter((good) => rules.prices[good]).map((good) => {
    const order = state.trade.orders[good] ?? null;
    const today = currentPrice(game, good);
    // The order button goes round: off, sell, buy, off.
    const next = !order ? command(good, 'sell', Math.min(FIRST_SELL_LEVEL, top))
      : order.mode === 'sell' ? command(good, 'buy', Math.min(FIRST_BUY_LEVEL, top))
      : command(good, 'off', 0);
    const level = order?.level ?? 0;
    const down = Math.max(0, Math.ceil(level / TRADE_STEP) * TRADE_STEP - TRADE_STEP);
    const up = Math.min(top, Math.floor(level / TRADE_STEP) * TRADE_STEP + TRADE_STEP);
    return {
      good,
      name: rules.goods[good].name,
      stock: state.goods[good],
      // Short, so a row stays two lines: "sells 0.4 · buys 2" (coins), today's
      // prices, with an arrow when they are below or above normal.
      prices: priceText(today),
      order: tradeOrderText(order),
      mode: order?.mode ?? 'off',
      next,
      down: order && level > 0 ? command(good, order.mode, down) : null,
      up: order && level < top ? command(good, order.mode, up) : null,
    };
  });
}
