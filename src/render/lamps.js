// Street lamps: where they stand. Decoration only: they read the roads and
// buildings and change nothing.
//
// A lamp stands on every third road tile that has a building beside it, at
// the edge of the road on the building's side, so streets in town are lit and
// the roads across open country stay dark. Where exactly follows from the
// tiles alone, so a lamp stays put as the town grows around it.
//
// No canvas code here, so it is tested in Node. Positions are in tiles.

const NEAR = [[0, 1], [1, 0], [0, -1], [-1, 0]];
// How far from the middle of the road tile toward the building a lamp stands.
const TO_EDGE = 0.4;
// One road tile in this many, counted along the road, has a lamp.
export const LAMP_SPACING = 3;

// The lamps for a game state: [{ x, y }] in tiles, in no particular order.
export function lampSpots(state) {
  const { width, height } = state.map;
  const spots = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (state.roads[y * width + x] !== 1 || (x + y) % LAMP_SPACING !== 0) continue;
      // The first side with a building on it, nearer sides first.
      const side = NEAR.find(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < width && ny < height && state.occupancy[ny * width + nx] !== 0 && state.roads[ny * width + nx] !== 1;
      });
      if (!side) continue;
      spots.push({ x: x + 0.5 + side[0] * TO_EDGE, y: y + 0.5 + side[1] * TO_EDGE });
    }
  }
  return spots;
}
