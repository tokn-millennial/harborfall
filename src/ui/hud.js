// The bar across the top: coins and income, goods, population, and the clock.

import { el, setText } from './dom.js';
import { clock, currentGoal, medalTimesText, staffText } from './text.js';
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
  // Shown only while you look at the second island, whose goods the row then shows.
  const islandTag = el('span', 'hud-island', 'The second island\'s goods');
  islandTag.hidden = true;
  goodsRow.append(islandTag);
  for (const id of rules.goodIds) {
    const value = el('span', 'hud-value');
    // The storage limit is the same for every good. On a narrow window it is
    // left out, and a good at its limit is shown by its color.
    const cap = el('span', 'hud-cap');
    goods[id] = { value, cap, box: el('span', { class: 'hud-good' }, [goodIcon(id, rules.goods[id].color), el('span', 'hud-label', rules.goods[id].name), value, cap]) };
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
  // Staff for the producing buildings: how many are spare, or how many short.
  const staffValue = el('span', 'hud-value');
  const staffBox = el('span', { class: 'hud-good hud-staff' }, [icon('staff'), el('span', 'hud-label', 'Staff'), staffValue]);
  staffBox.hidden = !rules.workforce;
  popRow.append(staffBox);
  const bar = el('div', 'progress');
  const fill = el('div', 'progress-fill');
  bar.append(fill);
  const goal = el('span', 'hud-label');
  popRow.append(el('span', 'hud-good', [goal, bar]));

  const time = el('span', { class: 'hud-time', title: rules.medals ? `Game time. ${medalTimesText(rules, rules.medals)}` : 'Game time' });

  root.append(
    el('div', { class: 'hud-coins', title: 'Coins' }, [icon('coin', { size: 20 }), coins, net]),
    goodsRow,
    popRow,
    time,
    warning,
    tip,
  );

  return {
    // `advice` is a sentence from the advisor, or null. `island` is the one
    // in view: on the second island the goods shown are its own.
    update(summary, advice = null, island = 0) {
      const onSecond = island === 1 && summary.second?.exists;
      islandTag.hidden = !onSecond;
      goodsRow.classList.toggle('second', Boolean(onSecond));
      const stock = onSecond ? summary.second : summary;
      tip.hidden = !advice;
      if (advice) setText(tip, `Tip: ${advice}`);
      setText(coins, String(summary.coins));
      const n = summary.income.net;
      setText(net, `${n >= 0 ? '+' : ''}${n.toFixed(1)} / min`);
      net.classList.toggle('bad', n < 0);
      warning.hidden = n >= 0;
      if (n < 0) setText(warning, 'You are losing money. Build houses, or demolish something.');

      for (const id of rules.goodIds) {
        setText(goods[id].value, String(stock.goods[id]));
        setText(goods[id].cap, ` / ${stock.storageCap}`);
        goods[id].box.title = `${rules.goods[id].name}${onSecond ? ' on the second island' : ''}: ${stock.goods[id]} of ${stock.storageCap}`;
        goods[id].box.classList.toggle('full', stock.storageCap > 0 && stock.goods[id] >= stock.storageCap);
        goods[id].box.classList.toggle('empty', stock.goods[id] === 0);
      }
      for (const id of Object.keys(tiers)) setText(tiers[id], `${summary.residents[id]} / ${summary.housing[id]}`);

      if (summary.staff.on) {
        const staff = staffText(rules, summary.staff, summary.closedProducers);
        setText(staffValue, staff.value);
        staffBox.title = staff.title;
        staffBox.classList.toggle('short', staff.short);
      }

      const { target, current, tier } = currentGoal(rules, summary);
      const tierName = `${rules.tiers[tier].name}s`;
      // Before the win the bar is the win. After it, the bar names the goal it now shows.
      setText(goal, summary.win.won ? `${target} ${tierName}` : `Goal ${target}`);
      bar.title = `${Math.min(current, target)} of ${target} ${tierName}`;
      fill.style.width = `${Math.min(100, (current / target) * 100)}%`;
      setText(time, clock(summary.seconds));
    },
  };
}
