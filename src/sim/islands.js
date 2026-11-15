// The islands. The home island is where the game starts. A map may also have
// a second island, across the water to the east, in the box of tiles
// map.second. It opens after the win (see SPEC.md section 23).
//
// Each island keeps its own goods. The home island's are where they have
// always been, state.goods and state.storageCap; the second island's are
// state.second.goods and state.second.storageCap. Coins are shared.

export const HOME = 0;
export const SECOND = 1;

// Which island a tile belongs to. Water outside the second island's box counts as home.
export function islandAt(map, x, y) {
  const s = map.second;
  return s && x >= s.x && x < s.x + s.width && y >= s.y && y < s.y + s.height ? SECOND : HOME;
}

export function islandOf(game, building) {
  return islandAt(game.state.map, building.x, building.y);
}

export function hasSecondIsland(game) {
  return Boolean(game.state.map.second);
}

// The second island can be built on once the game is won, or from the start
// in a scenario that opens it (config.json, a scenario's "secondIslandOpen").
export function secondIsOpen(game) {
  return hasSecondIsland(game) && (game.state.won || game.rules.secondIslandOpenAtStart);
}

// Where an island's goods are kept: an object with goods and storageCap.
export function stockOf(game, island) {
  return island === SECOND ? game.state.second : game.state;
}

export function stockOfBuilding(game, building) {
  return stockOf(game, islandOf(game, building));
}

// A new second island's goods: none of anything.
export function createSecondStock(rules) {
  const goods = {};
  for (const id of rules.goodIds) goods[id] = 0;
  return { goods, storageCap: 0 };
}

// Until the second island has both a warehouse and a harbour, whatever is
// built there is paid from the home island's goods: the settlers bring it
// with them. After that it is paid from the second island's own goods.
export function paysFrom(game, island) {
  if (island !== SECOND) return HOME;
  const { rules, state } = game;
  let warehouse = false;
  let harbour = false;
  for (const b of state.buildings) {
    if (islandOf(game, b) !== SECOND) continue;
    const category = rules.buildings[b.type].category;
    if (category === 'storage') warehouse = true;
    if (category === 'harbor') harbour = true;
  }
  return warehouse && harbour ? SECOND : HOME;
}
