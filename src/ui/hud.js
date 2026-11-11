// The bar across the top: coins and income, goods, population, and the clock.

import { el, setText } from './dom.js';
import { clock } from './text.js';
import { goodIcon, icon } from './icons.js';

export function createHud(root, rules) {
  const coins = el('span', 'hud-big');
  const net = el('span', { class: 'hud-net', title: 'Coins gained or lost each minute: taxes plus base income, minus upkeep' });
  const warning = el('div', 'hud-warning');
  warning.hidden = true;
  const tip = el('div', 'hud-tip');
  tip.hidden = true;

  const goods = {};
  const goodsRow = el('div', 'hud-goods');
  for (const id of rules.goodIds) {
    const value = el('span', 'hud-value');
    goods[id] = { value, box: el('span', { class: 'hud-good', title: rules.goods[id].name }, [goodIcon(id, rules.goods[id].color), el('span', 'hud-label', rules.goods[id].name), value]) };
    goodsRow.append(goods[id].box);
  }

  const tiers = {};
  const popRow = el('div', 'hud-pop');
  for (const [id, tier] of Object.entries(rules.tiers)) {
    const value = el('span', 'hud-value');
    tiers[id] = value;
    popRow.append(el('span', { class: 'hud-good', title: `${tier.name}s living on the island, and room for them` }, [
      icon('person', { fill: tier.visual?.color ?? '#d9bf6a' }), el('span', 'hud-label', `${tier.name}s`), value,
    ]));
  }
  const bar = el('div', 'progress');
  const fill = el('div', 'progress-fill');
  bar.append(fill);
  const goal = el('span', 'hud-label');
  popRow.append(el('span', 'hud-good', [goal, bar]));

  const time = el('span', { class: 'hud-time', title: 'Game time' });

  root.append(
    el('div', { class: 'hud-coins', title: 'Coins' }, [icon('coin', { size: 20 }), coins, net]),
    goodsRow,
    popRow,
    time,
    warning,
    tip,
  );

  return {
    // `advice` is a sentence from the advisor, or null.
    update(summary, advice = null) {
      tip.hidden = !advice;
      if (advice) setText(tip, `Tip: ${advice}`);
      setText(coins, String(summary.coins));
      const n = summary.income.net;
      setText(net, `${n >= 0 ? '+' : ''}${n.toFixed(1)} / min`);
      net.classList.toggle('bad', n < 0);
      warning.hidden = n >= 0;
      if (n < 0) setText(warning, 'You are losing money. Build houses, or demolish something.');

      for (const id of rules.goodIds) {
        setText(goods[id].value, `${summary.goods[id]} / ${summary.storageCap}`);
        goods[id].box.classList.toggle('full', summary.goods[id] >= summary.storageCap);
        goods[id].box.classList.toggle('empty', summary.goods[id] === 0);
      }
      for (const id of Object.keys(tiers)) setText(tiers[id], `${summary.residents[id]} / ${summary.housing[id]}`);

      const { target, current, tier } = summary.win;
      setText(goal, `Goal ${target}`);
      bar.title = `${Math.min(current, target)} of ${target} ${rules.tiers[tier].name}s`;
      fill.style.width = `${Math.min(100, (current / target) * 100)}%`;
      setText(time, clock(summary.seconds));
    },
  };
}
