// Houses: market coverage, buying goods, residents moving in and out, upgrades.
//
// How a house eats: every tick it adds its resident count to a hunger counter
// for each need. When a counter reaches the threshold for that good, the house
// buys one unit from the stockpile. A new house starts with full counters, so
// it buys its first unit of everything at once. That first purchase is what
// lets people move in.

import { footprintCenter, footprintWithinRadius } from './grid.js';
import { affordReason, pay } from './economy.js';

export function createHouseState(rules, tierId) {
  const house = { tier: tierId, residents: 0, served: false, hunger: {}, met: {}, growTimer: 0, declineTimer: 0 };
  addNeeds(house, rules.tiers[tierId]);
  return house;
}

// Adds any needs of `tier` the house does not track yet, starting them hungry.
function addNeeds(house, tier) {
  for (const [good, need] of Object.entries(tier.needs)) {
    if (good in house.hunger) continue;
    house.hunger[good] = need.hungerThreshold;
    house.met[good] = false;
  }
}

function connectedMarkets(game) {
  const { rules, state } = game;
  const markets = [];
  for (const b of state.buildings) {
    const def = rules.buildings[b.type];
    if (def.marketRadius > 0 && b.connected) {
      const [cx, cy] = footprintCenter(b.x, b.y, def.w, def.h);
      markets.push({ cx, cy, radius: def.marketRadius });
    }
  }
  return markets;
}

// Would a w-by-h building at (x, y) be within range of a connected market?
export function inMarketRange(game, x, y, w, h) {
  return connectedMarkets(game).some((m) => footprintWithinRadius(m.cx, m.cy, m.radius, x, y, w, h));
}

// A house is served when any of its tiles is within range of a connected market.
export function recomputeCoverage(game) {
  const { rules, state } = game;
  const markets = connectedMarkets(game);
  for (const b of state.buildings) {
    if (!b.house) continue;
    const def = rules.buildings[b.type];
    b.house.served = markets.some((m) => footprintWithinRadius(m.cx, m.cy, m.radius, b.x, b.y, def.w, def.h));
  }
}

// True when the house is served and its last purchase of every need succeeded.
export function isSatisfied(house) {
  if (!house.served) return false;
  for (const good in house.met) if (!house.met[good]) return false;
  return true;
}

export function stepHouses(game) {
  const { rules, state } = game;
  const { growthTicks, declineTicks, minResidents } = rules.population;

  // Houses are handled oldest first, so when stock is short the oldest eat first.
  for (const b of state.buildings) {
    const h = b.house;
    if (!h) continue;
    const tier = rules.tiers[h.tier];

    let satisfied = h.served;
    for (const good in tier.needs) {
      const threshold = tier.needs[good].hungerThreshold;
      if (h.hunger[good] < threshold) h.hunger[good] += h.residents;
      if (h.hunger[good] >= threshold) {
        if (h.served && state.goods[good] >= 1) {
          state.goods[good] -= 1;
          h.hunger[good] -= threshold;
          h.met[good] = true;
        } else {
          h.met[good] = false;
        }
      }
      if (!h.met[good]) satisfied = false;
    }

    if (satisfied) {
      h.declineTimer = 0;
      if (h.residents < tier.capacity) {
        h.growTimer++;
        if (h.growTimer >= growthTicks) {
          h.residents++;
          h.growTimer = 0;
        }
      } else {
        h.growTimer = 0;
      }
    } else {
      h.growTimer = 0;
      if (h.residents > minResidents) {
        h.declineTimer++;
        if (h.declineTimer >= declineTicks) {
          h.residents--;
          h.declineTimer = 0;
        }
      } else {
        h.declineTimer = 0;
      }
    }
  }
}

// Returns null when the house can be upgraded now, otherwise a reason code.
export function upgradeReason(game, building) {
  const { rules, state } = game;
  const h = building?.house;
  if (!h) return 'not_a_house';
  const tier = rules.tiers[h.tier];
  if (!tier.upgrade) return 'max_tier';
  if (h.residents < tier.capacity) return 'house_not_full';
  if (!h.served) return 'no_market';
  if (!isSatisfied(h)) return 'needs_unmet';
  // The next tier's extra needs must be in stock, so the house does not
  // upgrade straight into a shortage.
  const next = rules.tiers[tier.upgrade.to];
  for (const good of Object.keys(next.needs)) {
    if (!(good in tier.needs) && state.goods[good] < 1) return `no_${good}`;
  }
  return affordReason(game, tier.upgrade.cost);
}

// Assumes upgradeReason() returned null.
export function upgradeHouse(game, building) {
  const { rules } = game;
  const h = building.house;
  const tier = rules.tiers[h.tier];
  pay(game, tier.upgrade.cost);
  h.tier = tier.upgrade.to;
  addNeeds(h, rules.tiers[h.tier]);
  h.growTimer = 0;
  h.declineTimer = 0;
}

// Residents per tier, for the HUD and the win check.
export function countResidents(game) {
  const counts = {};
  for (const id of Object.keys(game.rules.tiers)) counts[id] = 0;
  for (const b of game.state.buildings) {
    if (b.house) counts[b.house.tier] += b.house.residents;
  }
  return counts;
}
