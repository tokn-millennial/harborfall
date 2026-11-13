// Day and night. A day lasts 8 game minutes: a long day, a short dusk, a
// short night, and a short dawn. It is only a tint over the picture and warm
// lights at the houses. Nothing in the game depends on it.
//
// No canvas code here, so it is tested in Node.

export const DAY_SECONDS = 480;
const DUSK_FROM = 0.6;   // shares of a day, counted from sunrise
const NIGHT_FROM = 0.7;
const DAWN_FROM = 0.9;

const smooth = (t) => t * t * (3 - 2 * t);
const partOfDay = (gameSeconds) => (((gameSeconds % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS) / DAY_SECONDS;

// How much night there is at a moment of game time: 0 in full day, 1 in full
// night, and in between at dusk and dawn. A new game starts at sunrise.
export function nightAmount(gameSeconds) {
  const t = partOfDay(gameSeconds);
  if (t < DUSK_FROM) return 0;
  if (t < NIGHT_FROM) return smooth((t - DUSK_FROM) / (NIGHT_FROM - DUSK_FROM));
  if (t < DAWN_FROM) return 1;
  return 1 - smooth((t - DAWN_FROM) / (1 - DAWN_FROM));
}

export function timeOfDay(gameSeconds) {
  const t = partOfDay(gameSeconds);
  if (t < DUSK_FROM) return 'day';
  if (t < NIGHT_FROM) return 'dusk';
  if (t < DAWN_FROM) return 'night';
  return 'dawn';
}
