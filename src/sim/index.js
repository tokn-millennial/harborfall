// The public face of the simulation. Everything outside src/sim/ uses only this file.

import { createGame } from './state.js';
import { execute } from './commands.js';
import { canPlace, siteReason } from './placement.js';
import { buildingAt, buildingById } from './buildings.js';
import { stepProduction } from './production.js';
import { settleIncome } from './economy.js';
import { checkWin } from './win.js';
import { getSummary, buildingIssue } from './summary.js';
import { stepHouses, upgradeReason, countResidents, isSatisfied, inMarketRange, housesInRangeOf } from './population.js';
import { saveGame, loadGame, SAVE_FORMAT } from './save.js';
import { undoStatus } from './undo.js';

export {
  createGame, execute, canPlace, siteReason, buildingAt, buildingById,
  countResidents, isSatisfied, getSummary, buildingIssue, inMarketRange, housesInRangeOf,
  saveGame, loadGame, SAVE_FORMAT, undoStatus,
};

// Checks an upgrade without doing it. Never changes the game.
export function canUpgrade(game, id) {
  const reason = upgradeReason(game, buildingById(game, id));
  return reason ? { ok: false, reason } : { ok: true };
}

// Advances the game by exactly one tick. The order below never changes.
export function step(game) {
  game.state.tick++;       // 1. the clock
  stepProduction(game);    // 2. producers work and deliver
  stepHouses(game);        // 3. houses buy goods, residents move in or out
  settleIncome(game);      // 4. taxes, base income and upkeep (on its interval)
  checkWin(game);          // 5. the win check
}
