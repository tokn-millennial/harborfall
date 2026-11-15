// Producer cycles: take inputs, work, deliver.
//
// A producer's status is one of:
//   no_road        not linked to a warehouse
//   closed         closed by the player: it makes nothing and needs no staff
//   missing_input  the stockpile lacks what it needs to start
//   working        a cycle is in progress
//   storage_full   finished goods are waiting for room in the stockpile
//   yard_full      finished goods are waiting for a cart (see carts.js)
//
// A closed producer carries `closed: true` in its record. An open one has no
// such entry at all, so games saved before closing existed need no change.
// Work in hand waits inside a closed producer and carries on when it reopens.

import { staffWorksThisTick } from './staff.js';
import { stockOfBuilding } from './islands.js';

export function createProductionState() {
  return { status: 'no_road', active: false, progress: 0, yard: {}, store: {} };
}

// Keeps the status honest right after roads change, even while paused.
export function syncProductionStatus(game) {
  for (const b of game.state.buildings) {
    if (!b.production) continue;
    if (!b.connected) b.production.status = 'no_road';
    else if (b.production.closed) b.production.status = 'closed';
    else if (b.production.status === 'no_road' || b.production.status === 'closed') b.production.status = 'working';
  }
}

export function stepProduction(game) {
  const { rules, state } = game;
  // A town short of staff works on only some ticks (see staff.js).
  if (!staffWorksThisTick(game)) return;
  for (const b of state.buildings) {
    const p = b.production;
    if (!p) continue;
    const def = rules.buildings[b.type].production;
    const stock = stockOfBuilding(game, b); // its own island's goods
    const goods = stock.goods;

    if (!b.connected) {
      p.status = 'no_road';
      continue;
    }
    if (p.closed) {
      p.status = 'closed';
      continue;
    }

    // Start a cycle: inputs are taken up front, from the stockpile, or, when
    // carts bring materials, from the workshop's own store.
    if (!p.active) {
      const inputs = Object.entries(def.inputs);
      const from = rules.materials ? p.store : goods;
      if (!inputs.every(([good, amount]) => (from[good] ?? 0) >= amount)) {
        p.status = 'missing_input';
        continue;
      }
      for (const [good, amount] of inputs) {
        from[good] -= amount;
        if (rules.materials && from[good] === 0) delete from[good];
      }
      p.active = true;
      p.progress = 0;
    }

    if (p.progress < def.cycleTicks) p.progress++;
    if (p.progress < def.cycleTicks) {
      p.status = 'working';
      continue;
    }

    // Finished. With carts, the goods go to the yard, if there is room, to be collected.
    const outputs = Object.entries(def.outputs);
    if (rules.carts) {
      const units = Object.values(p.yard).reduce((sum, n) => sum + n, 0);
      if (units + outputs.reduce((sum, [, n]) => sum + n, 0) <= rules.carts.yard) {
        for (const [good, amount] of outputs) p.yard[good] = (p.yard[good] ?? 0) + amount;
        p.active = false;
        p.progress = 0;
        p.status = 'working';
      } else {
        p.status = 'yard_full';
      }
      continue;
    }
    // Without carts, straight to the stockpile, only if every output fits.
    if (outputs.every(([good, amount]) => goods[good] + amount <= stock.storageCap)) {
      for (const [good, amount] of outputs) goods[good] += amount;
      p.active = false;
      p.progress = 0;
      p.status = 'working';
    } else {
      p.status = 'storage_full';
    }
  }
}
