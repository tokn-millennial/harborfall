// Short effects for when a building appears or disappears: a puff of dust,
// and for a new building a quick "pop" as it lands.
//
// This only watches the game. It notices that a building number is new, or
// has gone, since the last frame. It has no canvas code, so it is tested in
// Node. Effects run on real time, so they play even while the game is paused.

const BUILT_SECONDS = 0.9;
const REMOVED_SECONDS = 0.8;
const MOST_AT_ONCE = 12; // a script that builds fifty things in one frame should not fill the screen with dust

export function createBuildEffects(rules) {
  let watching = null;   // the game state being watched
  let known = new Map(); // building number -> where it stands
  let running = [];

  const placeOf = (b) => {
    const def = rules.buildings[b.type];
    return { x: b.x, y: b.y, w: def.w, h: def.h };
  };

  return {
    // Call once a frame with the game state and the time in seconds. Returns
    // the effects now playing: { kind: 'built' | 'removed', id, x, y, w, h, age }
    // where age runs from 0 (just started) to 1 (over).
    update(state, time) {
      const now = new Map();
      for (const b of state.buildings) now.set(b.id, placeOf(b));

      if (state !== watching) {
        // A game just opened, or another one loaded: everything in it was already there.
        watching = state;
        running = [];
      } else {
        for (const [id, place] of now) if (!known.has(id)) running.push({ kind: 'built', id, ...place, at: time });
        for (const [id, place] of known) if (!now.has(id)) running.push({ kind: 'removed', id, ...place, at: time });
      }
      known = now;

      const lasts = (e) => (e.kind === 'built' ? BUILT_SECONDS : REMOVED_SECONDS);
      running = running.filter((e) => time - e.at >= 0 && time - e.at < lasts(e));
      if (running.length > MOST_AT_ONCE) running = running.slice(running.length - MOST_AT_ONCE);
      return running.map((e) => ({ kind: e.kind, id: e.id, x: e.x, y: e.y, w: e.w, h: e.h, age: (time - e.at) / lasts(e) }));
    },
  };
}

// How big a new building is drawn, as a share of its full size, at a given
// age of its "built" effect. It starts a little small and settles quickly.
const POP_UNTIL = 0.4;
export function popScale(age) {
  if (!(age < POP_UNTIL)) return 1;
  const t = Math.max(0, age) / POP_UNTIL;
  return 0.8 + 0.2 * (1 - (1 - t) * (1 - t));
}
