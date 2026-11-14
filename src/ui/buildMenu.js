// The row of tool buttons along the bottom: select, every building, upgrade,
// demolish. Above it, a strip explains the tool the pointer is on, or the
// active tool. Each button shows its shortcut key.

import { el, setText } from './dom.js';
import { buildingBlurb, costText, shortfallText, undoLabel, upgradePathText } from './text.js';
import { undoStatus } from '../sim/index.js';
import { icon } from './icons.js';
import { drawBuildingIcon } from '../render/art/icon.js';

// A tool is { mode: 'select' | 'build' | 'road' | 'upgrade' | 'demolish', building }.
export const sameTool = (a, b) => a.mode === b.mode && a.building === b.building;

// Keys that already mean something else, so no tool may take them.
const TAKEN_KEYS = new Set(['w', 'a', 's', 'd', 'c', '1', '2', '3', '4', '5']);
// Keys for the tools that are not buildings. Building keys come from buildings.json.
const TOOL_KEYS = { select: 'q', upgrade: 'u', demolish: 'x', undo: 'z' };

export function createBuildMenu(root, hintRoot, game, { onPick, onUndo = () => {} }) {
  const { rules } = game;
  const buttons = [];
  const byKey = new Map();
  let hovered = null;

  // Tools come in groups, shown with a little space between them: select;
  // roads and warehouses; buildings that make things; houses and markets; and
  // the tools that change what is built.
  let lastGroup = null;
  function add(tool, name, cost, blurb, key = null, onClick = null, group = 'tools') {
    // A key that is taken, or already given to an earlier button, is dropped.
    const usable = key && !TAKEN_KEYS.has(key) && !byKey.has(key) ? key : null;
    const startsGroup = lastGroup !== null && group !== lastGroup;
    lastGroup = group;
    const button = el('button', { class: startsGroup ? 'tool group-start' : 'tool', type: 'button' }, [
      usable ? el('span', 'tool-key', usable.toUpperCase()) : null,
      el('span', 'tool-name', name),
      el('span', 'tool-cost', cost ?? ''),
    ]);
    const entry = { tool, button, name, blurb, cost, key: usable };
    button.addEventListener('click', onClick ?? (() => onPick(tool)));
    button.addEventListener('pointerenter', () => { hovered = entry; });
    button.addEventListener('pointerleave', () => { if (hovered === entry) hovered = null; });
    if (usable) byKey.set(usable, entry);
    buttons.push(entry);
    root.append(button);
    return entry;
  }

  const select = add({ mode: 'select', building: null }, 'Select', null, ['Click a building to see its details. Drag to move the view.'], TOOL_KEYS.select, null, 'select');
  select.button.prepend(el('span', 'tool-glyph', [icon('select', { size: 26 })]));
  for (const [id, def] of Object.entries(rules.buildings)) {
    const tool = { mode: def.category === 'road' ? 'road' : 'build', building: id };
    const blurb = buildingBlurb(rules, id);
    if (def.category === 'road') blurb.push('Hold Shift while dragging to flip the corner.');
    const group = def.category === 'road' || def.category === 'storage' ? 'move' : def.category === 'house' || def.category === 'market' ? 'live' : 'make';
    const entry = add(tool, def.name, costText(rules, def.cost), blurb, def.key, null, group);
    const picture = el('canvas', 'tool-picture');
    drawBuildingIcon(picture, rules, id);
    entry.button.prepend(picture);
    entry.def = def;
  }
  // One Upgrade tool, priced from the first tier that can be upgraded.
  const upgradable = Object.values(rules.tiers).find((tier) => tier.upgrade);
  if (upgradable) {
    const steps = Object.values(rules.tiers).filter((tier) => tier.upgrade).length;
    const entry = add({ mode: 'upgrade', building: null }, 'Upgrade', costText(rules, upgradable.upgrade.cost), [
      `Click a full, fed house to move it up: ${upgradePathText(rules)}. Each step holds more people.`,
      'A green ▲ marks houses that are ready.',
      steps > 1 ? 'The cost shown is for the first step. Later steps cost more.' : '',
    ].filter(Boolean), TOOL_KEYS.upgrade);
    entry.def = { cost: upgradable.upgrade.cost };
    entry.button.prepend(el('span', 'tool-glyph', [icon('upgrade', { size: 26 })]));
  }
  const demolish = add({ mode: 'demolish', building: null }, 'Demolish', 'Half back', [
    'Click a road to remove it. Click a building twice to remove it. Half the cost is returned.',
  ], TOOL_KEYS.demolish);
  demolish.button.prepend(el('span', 'tool-glyph', [icon('demolish', { size: 26 })]));
  // Undo is not a tool to pick: pressing it acts at once.
  const undoSeconds = Math.round(rules.undoTicks / rules.ticksPerSecond);
  const undo = undoSeconds > 0 ? add({ mode: 'undo', building: null }, 'Undo', 'Nothing yet', [
    'Takes back the last thing you built, upgraded or demolished, and gives back everything it cost.',
    `Works for ${undoSeconds} seconds of game time after you act. Ctrl+Z does the same.`,
  ], TOOL_KEYS.undo, () => onUndo()) : null;
  if (undo) {
    undo.button.prepend(el('span', 'tool-glyph', [icon('undo', { size: 26 })]));
    undo.costLine = undo.button.querySelector('.tool-cost');
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const key = event.key?.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'z' && undo) {
      onUndo();
      event.preventDefault();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const entry = byKey.get(key);
    if (entry) entry.button.click();
  });

  return {
    update(activeTool) {
      for (const entry of buttons) {
        entry.button.classList.toggle('active', sameTool(entry.tool, activeTool));
        if (entry.def) entry.button.classList.toggle('unaffordable', shortfallText(game, entry.def.cost) !== null);
      }
      if (undo) {
        const status = undoStatus(game);
        setText(undo.costLine, undoLabel(rules, status));
        undo.button.classList.toggle('idle', !status.ok);
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
