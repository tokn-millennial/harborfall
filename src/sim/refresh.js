// Recalculates everything that depends on what is built where.
// Called after any command that adds or removes a building or road.

import { recomputeConnections } from './roads.js';
import { recomputeStorage } from './economy.js';
import { syncProductionStatus } from './production.js';
import { recomputeCoverage } from './population.js';

export function refresh(game) {
  recomputeConnections(game);
  recomputeStorage(game);
  syncProductionStatus(game);
  recomputeCoverage(game);
}
