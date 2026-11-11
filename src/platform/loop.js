// The fixed-tick loop. The simulation only ever moves in whole ticks.
// Real time arrives in uneven frame-sized pieces; this turns it into ticks.
//
// No browser code here, so it can be tested in Node and moved to an engine.
// The browser's frame loop just calls advance(secondsSinceLastFrame).

export function createLoop({ ticksPerSecond, onTick, maxTicksPerAdvance = 60 }) {
  let speed = 1;      // 0 is paused
  let owed = 0;       // fractions of a tick carried between frames

  return {
    get speed() {
      return speed;
    },
    setSpeed(value) {
      speed = Math.max(0, value);
      if (speed === 0) owed = 0;
    },
    // Runs the ticks that `realSeconds` of real time are worth. Returns how many ran.
    advance(realSeconds) {
      if (speed === 0 || !(realSeconds > 0)) return 0;
      owed += realSeconds * ticksPerSecond * speed;
      let ticks = Math.floor(owed);
      owed -= ticks;
      // If the tab stalled, do not try to catch up all at once. Drop the backlog.
      if (ticks > maxTicksPerAdvance) ticks = maxTicksPerAdvance;
      for (let i = 0; i < ticks; i++) onTick();
      return ticks;
    },
  };
}
