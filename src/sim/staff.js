// Staff: the people who run the town's producing buildings.
//
// Every producer that is linked to a warehouse needs a number of staff (set
// per building in buildings.json). The town has a small crew to begin with,
// and every resident adds to it (config.json, "workforce").
//
// A town with enough staff works at full speed. A town that is short works
// slower, every producer by the same share: with 30 staff where 40 are needed,
// production runs at 75%. Nothing ever stops dead, so building houses always
// gets a town out of trouble.

const FULL = 1000;

// { on, needed, available, ratioMilli }. ratioMilli is the speed production
// runs at, in thousandths: 1000 is full speed. Never changes the game.
export function staffing(game) {
  const { rules, state } = game;
  const workforce = rules.workforce;
  if (!workforce) return { on: false, needed: 0, available: 0, ratioMilli: FULL };
  let needed = 0;
  let residents = 0;
  for (const b of state.buildings) {
    if (b.house) residents += b.house.residents;
    else if (b.production && b.connected) needed += rules.buildings[b.type].staff;
  }
  const available = workforce.base + Math.floor((residents * workforce.perResidentMilli) / FULL);
  const ratioMilli = needed <= available ? FULL : Math.max(1, Math.floor((available * FULL) / needed));
  return { on: true, needed, available, ratioMilli };
}

// Called once a tick, before production. True if the producers work this
// tick. At 75% staffing, three ticks in every four are worked.
export function staffWorksThisTick(game) {
  const { state } = game;
  state.staffClock += staffing(game).ratioMilli;
  if (state.staffClock < FULL) return false;
  state.staffClock -= FULL;
  return true;
}
