// Remembers the player's best time in each scenario, and on the standard island
// on each difficulty (as "standard:normal" and so on). Like the save slot, it is
// handed a storage box and never fails if the box does. It is not part of the
// game state: it belongs to the player, not to any one game.

// `storage` may be null: records then last only until the page is closed.
export function createRecords(storage, key = 'harborfall.scenarios') {
  let all = {};
  try {
    const stored = JSON.parse(storage?.getItem(key) ?? 'null');
    if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) all = stored;
  } catch {
    // Unreadable: start with no records.
  }
  const read = (id) => {
    const r = Object.hasOwn(all, id) ? all[id] : null;
    if (r === null || typeof r !== 'object' || !Number.isInteger(r.ticks) || r.ticks < 0) return null;
    return { ticks: r.ticks, medal: typeof r.medal === 'string' ? r.medal : null };
  };
  return {
    // { ticks, medal } for the fastest win in this scenario, or null.
    best: read,
    // Call when a scenario is won. Returns true if this is the best time so far.
    report(id, ticks, medal = null) {
      if (typeof id !== 'string' || !Number.isInteger(ticks) || ticks < 0) return false;
      const old = read(id);
      if (old && old.ticks <= ticks) return false;
      all[id] = { ticks, medal };
      try {
        storage?.setItem(key, JSON.stringify(all));
      } catch {
        // The record still holds for this visit.
      }
      return true;
    },
  };
}
