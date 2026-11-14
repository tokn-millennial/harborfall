// Adding, removing and finding buildings in the game state.
// These helpers do not check rules or charge costs. See placement.js and commands.js.

import { footprint, inBounds, tileIndex } from './grid.js';
import { createProductionState } from './production.js';
import { createHouseState } from './population.js';
import { cartsArrive, cartsLose } from './carts.js';

export function addBuilding(game, type, x, y, { free = false } = {}) {
  const { rules, state } = game;
  const def = rules.buildings[type];
  const building = { id: state.nextId++, type, x, y, connected: false };
  if (free) building.free = true;
  if (def.production) building.production = createProductionState();
  if (def.housingTier) building.house = createHouseState(rules, def.housingTier);
  state.buildings.push(building);
  for (const [tx, ty] of footprint(x, y, def.w, def.h)) {
    state.occupancy[tileIndex(state.map, tx, ty)] = building.id;
  }
  cartsArrive(game, building);
  return building;
}

export function removeBuilding(game, building) {
  const { rules, state } = game;
  const def = rules.buildings[building.type];
  for (const [tx, ty] of footprint(building.x, building.y, def.w, def.h)) {
    state.occupancy[tileIndex(state.map, tx, ty)] = 0;
  }
  state.buildings.splice(state.buildings.indexOf(building), 1);
  cartsLose(game, building);
}

export function buildingById(game, id) {
  return game.state.buildings.find((b) => b.id === id) ?? null;
}

export function buildingAt(game, x, y) {
  const { state } = game;
  if (!inBounds(state.map, x, y)) return null;
  const id = state.occupancy[tileIndex(state.map, x, y)];
  return id ? buildingById(game, id) : null;
}

export function countCategory(game, category) {
  const { rules, state } = game;
  let n = 0;
  for (const b of state.buildings) if (rules.buildings[b.type].category === category) n++;
  return n;
}
