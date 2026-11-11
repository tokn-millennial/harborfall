// The row of tool buttons along the bottom: select, every building, demolish.
// Above it, a strip explains the tool the pointer is on, or the active tool.

import { el, setText } from './dom.js';
import { buildingBlurb, costText, shortfallText } from './text.js';

// A tool is { mode: 'select' | 'build' | 'road' | 'upgrade' | 'demolish', building }.
export const sameTool = (a, b) => a.mode === b.mode && a.building === b.building;

export function createBuildMenu(root, hintRoot, game, { onPick }) {
  const { rules } = game;
  const buttons = [];
  let hovered = null;

  function add(tool, name, cost, blurb) {
    const costLine = el('span', 'tool-cost', cost ?? '');
    const button = el('button', { class: 'tool', type: 'button' }, [el('span', 'tool-name', name), costLine]);
    button.addEventListener('click', () => onPick(tool));
    button.addEventListener('pointerenter', () => { hovered = entry; });
    button.addEventListener('pointerleave', () => { if (hovered === entry) hovered = null; });
    const entry = { tool, button, name, blurb, cost };
    buttons.push(entry);
    root.append(button);
    return entry;
  }

  add({ mode: 'select', building: null }, 'Select', null, ['Click a building to see its details. Drag to move the view.']);
  for (const [id, def] of Object.entries(rules.buildings)) {
    const tool = { mode: def.category === 'road' ? 'road' : 'build', building: id };
    const entry = add(tool, def.name, costText(rules, def.cost), buildingBlurb(rules, id));
    const swatch = el('span', 'swatch');
    swatch.style.background = def.visual?.color ?? '#999';
    entry.button.prepend(swatch);
    entry.def = def;
  }
  // One Upgrade tool, priced from the first tier that can be upgraded.
  const upgradable = Object.values(rules.tiers).find((tier) => tier.upgrade);
  if (upgradable) {
    const next = rules.tiers[upgradable.upgrade.to];
    const entry = add({ mode: 'upgrade', building: null }, 'Upgrade', costText(rules, upgradable.upgrade.cost), [
      `Click a full, fed house to turn it into a ${next.name} house, which holds ${next.capacity}.`,
      'A green ▲ marks houses that are ready.',
    ]);
    entry.def = { cost: upgradable.upgrade.cost };
  }
  add({ mode: 'demolish', building: null }, 'Demolish', 'Half back', ['Click a building or road to remove it. Half its cost is returned.']);

  return {
    update(activeTool) {
      for (const entry of buttons) {
        entry.button.classList.toggle('active', sameTool(entry.tool, activeTool));
        if (entry.def) entry.button.classList.toggle('unaffordable', shortfallText(game, entry.def.cost) !== null);
      }
      const shown = hovered ?? buttons.find((entry) => sameTool(entry.tool, activeTool));
      const active = buttons.find((entry) => sameTool(entry.tool, activeTool));
      let text = `${shown.name}: ${shown.blurb.join(' ')}`;
      if (shown.def) {
        const short = shortfallText(game, shown.def.cost);
        text += ` Costs ${shown.cost}.${short ? ` ${short}.` : ''}`;
      }
      if (shown === active && activeTool.mode !== 'select') text += ' Right-click or Esc to stop.';
      setText(hintRoot, text);
    },
  };
}
