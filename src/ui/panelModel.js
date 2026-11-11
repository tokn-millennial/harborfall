// What the info panel says about one building: a title, some lines, and the
// buttons. Plain data, built from the game, so it is tested in Node.
// infoPanel.js turns this into page elements.

import { buildingIssue, canUpgrade } from '../sim/index.js';
import { MILLI } from '../sim/rules.js';
import { amountText, costText, issueLevel, reasonText, refundText } from './text.js';
import { previewDemolish } from './tools.js';

export function panelModel(game, building) {
  const { rules, state } = game;
  const def = rules.buildings[building.type];
  const lines = [];
  const actions = [];
  const issue = buildingIssue(game, building);

  let title = def.name;

  if (building.house) {
    const h = building.house;
    const tier = rules.tiers[h.tier];
    title = `${tier.name} house`;
    lines.push({ label: 'Residents', value: `${h.residents} of ${tier.capacity}` });
    lines.push({ label: 'Market', value: h.served ? 'In range' : 'None in range', level: h.served ? 'ok' : 'bad' });
    for (const good of Object.keys(tier.needs)) {
      const met = h.served && h.met[good];
      lines.push({
        label: rules.goods[good].name,
        value: met ? 'Supplied' : h.served ? 'None in stock' : 'Not supplied',
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
        detail: `${costText(rules, tier.upgrade.cost)}. Holds ${next.capacity}.`,
        enabled: check.ok,
        reason: check.ok ? null : reasonText(game, check.reason, { cost: tier.upgrade.cost }),
      });
    }
  } else {
    lines.push({
      label: 'Status',
      value: issue ? reasonText(game, issue, { building: building.type }) : building.production ? 'Working.' : 'Fine.',
      level: issueLevel(issue),
    });
  }

  if (building.production) {
    const p = def.production;
    const every = p.cycleTicks / rules.ticksPerSecond;
    const out = Object.entries(p.outputs).map(([g, n]) => amountText(rules, g, n)).join(' and ');
    const inputs = Object.entries(p.inputs).map(([g, n]) => amountText(rules, g, n)).join(' and ');
    lines.push({ label: inputs ? 'Turns' : 'Makes', value: inputs ? `${inputs} into ${out} every ${every} s` : `${out} every ${every} s` });
    lines.push({ label: 'Progress', value: `${Math.floor((building.production.progress / p.cycleTicks) * 100)}%`, progress: building.production.progress / p.cycleTicks });
  }

  if (def.marketRadius > 0) {
    const served = state.buildings.filter((b) => b.house && b.house.served).length;
    lines.push({ label: 'Range', value: `${def.marketRadius} tiles` });
    lines.push({ label: 'Houses served', value: `${served} (all markets)` });
  }

  if (def.storagePerGood > 0) {
    lines.push({ label: 'Storage', value: `${def.storagePerGood} of each good` });
    lines.push({ label: 'Island total', value: `${state.storageCap} of each good` });
  }

  if (def.upkeepMilliPerMinute > 0) lines.push({ label: 'Upkeep', value: `${def.upkeepMilliPerMinute / MILLI} coins a minute` });

  const demolish = previewDemolish(game, building.x, building.y, building);
  actions.push({
    id: 'demolish',
    label: 'Demolish',
    detail: `${refundText(rules, building)}.`,
    enabled: demolish.ok,
    reason: demolish.ok ? null : reasonText(game, demolish.reason),
  });

  return { title, issue, level: issueLevel(issue), lines, actions };
}
