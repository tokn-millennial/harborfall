// The win check: enough residents of the target tier. There is no lose state.

import { countResidents } from './population.js';

export function checkWin(game) {
  const { rules, state } = game;
  if (state.won) return;
  if (countResidents(game)[rules.win.tier] >= rules.win.residents) {
    state.won = true;
    state.wonAtTick = state.tick;
  }
}
