// How each building looks as a placeholder shape. Reads colors and heights
// from the data files. Pure, so picking can use it in Node tests.

import { HEIGHT_UNIT } from './iso.js';

const FALLBACK = { color: '#999999', height: 0.8 };

// { color, risePx, label } for one building.
export function buildingVisual(rules, building) {
  const def = rules.buildings[building.type];
  // A house looks like its tier, so an upgraded house is visibly different.
  const tier = building.house ? rules.tiers[building.house.tier] : null;
  const visual = tier?.visual ?? def.visual ?? FALLBACK;
  return {
    color: visual.color ?? FALLBACK.color,
    risePx: (visual.height ?? FALLBACK.height) * HEIGHT_UNIT,
    // Houses show how many people live there. Other buildings show the first
    // two letters of their name, which is enough to tell them all apart.
    label: building.house ? String(building.house.residents) : def.name.slice(0, 2),
  };
}

// "#rrggbb" made darker (factor below 1) or lighter (above 1).
export function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}
