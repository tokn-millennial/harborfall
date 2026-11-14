// A one-line tip for the player when something has been running short for a
// while. It looks for the root of the shortage: if bread is out because the
// bakery has no grain, it talks about grain, not bread.
//
// A town short of staff is told so first: every producer is slowed, so a good
// running out may only be a sign of it, and another producer would make it worse.
//
// No page code here, so it is tested in Node. It only reads the game.

import { staffing } from '../sim/index.js';

const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

export function createAdvisor(rules, { patienceSeconds = 30 } = {}) {
  const patienceTicks = patienceSeconds * rules.ticksPerSecond;
  const shortSince = {}; // good -> the tick it was first seen short
  let staffShortSince = null; // the tick the town was first seen short of staff

  // Which building types make each good, and which goods anything costs.
  const makersOf = {};
  const costGoods = new Set();
  for (const def of Object.values(rules.buildings)) {
    for (const good of Object.keys(def.production?.outputs ?? {})) (makersOf[good] ??= []).push(def);
    for (const good of Object.keys(def.cost.goods)) costGoods.add(good);
  }
  for (const tier of Object.values(rules.tiers)) {
    for (const good of Object.keys(tier.upgrade?.cost.goods ?? {})) costGoods.add(good);
  }
  const lower = (good) => rules.goods[good].name.toLowerCase();

  // Goods that something is going without right now, most urgent kind first.
  function shortGoods(game) {
    const { state } = game;
    const found = new Map(); // good -> 0 residents, 1 producers, 2 building materials
    const note = (good, rank) => {
      if (!found.has(good) || rank < found.get(good)) found.set(good, rank);
    };
    for (const b of state.buildings) {
      if (b.house?.served) {
        for (const good in b.house.met) if (!b.house.met[good] && state.goods[good] === 0) note(good, 0);
      }
      if (b.production?.status === 'missing_input') {
        for (const [good, n] of Object.entries(rules.buildings[b.type].production.inputs)) {
          if (state.goods[good] < n) note(good, 1);
        }
      }
    }
    for (const good of costGoods) if (state.goods[good] === 0) note(good, 2);
    return found;
  }

  // Follows a shortage back to where it starts and says what to do about it.
  function explain(game, good) {
    const { state } = game;
    for (let depth = 0; depth <= rules.goodIds.length; depth++) {
      const types = makersOf[good] ?? [];
      if (types.length === 0) return `You are out of ${lower(good)}.`;
      const typeName = types[0].name.toLowerCase();
      const built = state.buildings.filter((b) => rules.buildings[b.type].production?.outputs[good] !== undefined);
      if (built.length === 0) return `Nobody is making ${lower(good)}. Build ${article(typeName)} ${typeName}.`;

      const connected = built.filter((b) => b.connected);
      if (connected.length === 0) return `Your ${typeName} is not connected to a warehouse by road.`;

      // If every working maker is waiting for an input, the real shortage is upstream.
      if (connected.every((b) => b.production.status === 'missing_input')) {
        const inputs = rules.buildings[connected[0].type].production.inputs;
        const missing = Object.keys(inputs).find((g) => state.goods[g] < inputs[g]);
        if (missing && missing !== good) {
          good = missing;
          continue;
        }
      }
      return `${rules.goods[good].name} keeps running out. Build another ${typeName}.`;
    }
    return null;
  }

  return {
    // Call often (every frame is fine). Returns a sentence, or null when there is nothing to say.
    update(game) {
      const tick = game.state.tick;
      const staff = staffing(game);
      if (staff.ratioMilli >= 1000) staffShortSince = null;
      else staffShortSince ??= tick;
      const short = shortGoods(game);
      for (const good of Object.keys(shortSince)) if (!short.has(good)) delete shortSince[good];
      for (const good of short.keys()) shortSince[good] ??= tick;

      const lasting = [...short.entries()]
        .filter(([good]) => tick - shortSince[good] >= patienceTicks)
        .sort((a, b) => a[1] - b[1] || rules.goodIds.indexOf(a[0]) - rules.goodIds.indexOf(b[0]));
      if (staffShortSince !== null && tick - staffShortSince >= patienceTicks) {
        return `Your buildings are short of staff and work at ${Math.floor(staff.ratioMilli / 10)}% speed. Build more houses.`;
      }
      return lasting.length ? explain(game, lasting[0][0]) : null;
    },
  };
}
