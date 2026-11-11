// The row of tool buttons along the bottom: select, every building, upgrade,
// demolish. Above it, a strip explains the tool the pointer is on, or the
// active tool. Each button shows its shortcut key.

import { el, setText } from './dom.js';
import { buildingBlurb, costText, shortfallText } from './text.js';

// A tool is { mode: 'select' | 'build' | 'road' | 'upgrade' | 'demolish', building }.
export const sameTool = (a, b) => a.mode === b.mode && a.building === b.building;

// Keys that already mean something else, so no tool may take them.
const TAKEN_KEYS = new Set(['w', 'a', 's', 'd', 'c', '1', '2', '3', '4', '5']);
// Keys for the tools that are not buildings. Building keys come from buildings.json.
const TOOL_KEYS = { select: 'q', upgrade: 'u', demolish: 'x' };

export function createBuildMenu(root, hintRoot, game, { onPick }) {
  const { rules } = game;
  const buttons = [];
  const byKey = new Map();
  let hovered = null;

  function add(tool, name, cost, blurb, key = null) {
    // A key that is taken, or already given to an earlier button, is dropped.
    const usable = key && !TAKEN_KEYS.has(key) && !byKey.has(key) ? key : null;
    const button = el('button', { class: 'tool', type: 'button' }, [
      usable ? el('span', 'tool-key', usable.toUpperCase()) : null,
      el('span', 'tool-name', name),
      el('span', 'tool-cost', cost ?? ''),
    ]);
    const entry = { tool, button, name, blurb, cost, key: usable };
    button.addEventListener('click', () => onPick(tool));
    button.addEventListener('pointerenter', () => { hovered = entry; });
    button.addEventListener('pointerleave', () => { if (hovered === entry) hovered = null; });
    if (usable) byKey.set(usable, entry);
    buttons.push(entry);
    root.append(button);
    return entry;
  }

  add({ mode: 'select', building: null }, 'Select', null, ['Click a building to see its details. Drag to move the view.'], TOOL_KEYS.select);
  for (const [id, def] of Object.entries(rules.buildings)) {
    const tool = { mode: def.category === 'road' ? 'road' : 'build', building: id };
    const blurb = buildingBlurb(rules, id);
    if (def.category === 'road') blurb.push('Hold Shift while dragging to flip the corner.');
    const entry = add(tool, def.name, costText(rules, def.cost), blurb, def.key);
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
    ], TOOL_KEYS.upgrade);
    entry.def = { cost: upgradable.upgrade.cost };
  }
  add({ mode: 'demolish', building: null }, 'Demolish', 'Half back', [
    'Click a road to remove it. Click a building twice to remove it. Half the cost is returned.',
  ], TOOL_KEYS.demolish);

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const entry = byKey.get(event.key?.toLowerCase());
    if (entry) onPick(entry.tool);
  });

  return {
    update(activeTool) {
      for (const entry of buttons) {
        entry.button.classList.toggle('active', sameTool(entry.tool, activeTool));
        if (entry.def) entry.button.classList.toggle('unaffordable', shortfallText(game, entry.def.cost) !== null);
      }
      const active = buttons.find((entry) => sameTool(entry.tool, activeTool));
      const shown = hovered ?? active;
      let text = `${shown.name}: ${shown.blurb.join(' ')}`;
      if (shown.def) {
        const short = shortfallText(game, shown.def.cost);
        text += ` Costs ${shown.cost}.${short ? ` ${short}.` : ''}`;
      }
      if (shown.key) text += ` Key: ${shown.key.toUpperCase()}.`;
      if (shown === active && activeTool.mode !== 'select') text += ' Right-click or Esc to stop.';
      setText(hintRoot, text);
    },
  };
}
