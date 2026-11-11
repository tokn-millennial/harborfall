// The look of each building that the data files decide: its color, its height
// and its label. Pure, so picking can use it in Node tests.

import { HEIGHT_UNIT } from './iso.js';
import { artFor } from './art/buildings.js';

// Drawn buildings have a roof that rises above their nominal height.
const ROOF_ALLOWANCE = 1.15;

const FALLBACK = { color: '#999999', height: 0.8 };

// { color, risePx, topPx, label } for one building.
//   risePx  the height from the data, which the art scales itself to
//   topPx   how tall it actually stands on screen, for outlines and for clicking its roof
export function buildingVisual(rules, building) {
  const def = rules.buildings[building.type];
  // A house looks like its tier, so an upgraded house is visibly different.
  const tier = building.house ? rules.tiers[building.house.tier] : null;
  const visual = tier?.visual ?? def.visual ?? FALLBACK;
  const risePx = (visual.height ?? FALLBACK.height) * HEIGHT_UNIT;
  return {
    color: visual.color ?? FALLBACK.color,
    risePx,
    topPx: artFor(rules, building) ? risePx * ROOF_ALLOWANCE : risePx,
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
