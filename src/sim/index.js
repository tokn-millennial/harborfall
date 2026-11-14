// The public face of the simulation. Everything outside src/sim/ uses only this file.

import { createGame } from './state.js';
import { execute } from './commands.js';
import { canPlace, siteReason } from './placement.js';
import { buildingAt, buildingById } from './buildings.js';
import { stepProduction } from './production.js';
import { settleIncome } from './economy.js';
import { checkWin } from './win.js';
import { getSummary, buildingIssue, medalFor } from './summary.js';
import { stepHouses, upgradeReason, countResidents, isSatisfied, inMarketRange, housesInRangeOf } from './population.js';
import { saveGame, loadGame, SAVE_FORMAT } from './save.js';
import { undoStatus } from './undo.js';
import { staffing } from './staff.js';
import { stepTrade, tradeSummary, tradeOrderReason } from './trade.js';
import { cartsSummary, servedByCarts, stepCarts } from './carts.js';

export {
  createGame, execute, canPlace, siteReason, buildingAt, buildingById,
  countResidents, isSatisfied, getSummary, buildingIssue, inMarketRange, housesInRangeOf,
  saveGame, loadGame, SAVE_FORMAT, undoStatus, staffing, medalFor, tradeSummary, cartsSummary, servedByCarts,
};

// Checks a trade order without giving it. Never changes the game.
export function canTrade(game, good, mode, level) {
  const reason = tradeOrderReason(game, good, mode, level);
  return reason ? { ok: false, reason } : { ok: true };
}

// Checks an upgrade without doing it. Never changes the game.
export function canUpgrade(game, id) {
  const reason = upgradeReason(game, buildingById(game, id));
  return reason ? { ok: false, reason } : { ok: true };
}

// Advances the game by exactly one tick. The order below never changes.
export function step(game) {
  game.state.tick++;       // 1. the clock
  stepProduction(game);    // 2. producers work, and put what they make in their yards
  stepCarts(game);         // 3. carts collect from the yards and unload at warehouses
  stepHouses(game);        // 4. houses buy goods, residents move in or out
  stepTrade(game);         // 5. the trade ship, when it is due
  settleIncome(game);      // 6. taxes, base income and upkeep (on its interval)
  checkWin(game);          // 7. the win check
}
