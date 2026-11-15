// The win check: enough residents of the target tier, or of any tier above it.
// There is no lose state. After the win come the milestones, which are counted
// the same way and never take the win away.

import { countAtLeast } from './population.js';
import { hasSecondIsland } from './islands.js';

export function checkWin(game) {
  const { rules, state } = game;
  if (!state.won && countAtLeast(game, rules.win.tier) >= rules.win.residents) {
    state.won = true;
    state.wonAtTick = state.tick;
    // The win opens the second island, and comes with coins to settle it (config.json, "settlers").
    if (rules.settlers && hasSecondIsland(game)) state.coinsMilli += rules.settlers.grantMilli;
  }
  for (let i = 0; i < rules.milestones.length; i++) {
    if (state.milestones[i] !== null) continue;
    const m = rules.milestones[i];
    if (countAtLeast(game, m.tier) >= m.residents) state.milestones[i] = state.tick;
  }
}
