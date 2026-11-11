// Prints the island as text so it can be checked without a browser.
// Usage: node tools/print-map.mjs [seed]
//   ~ water   : coast   . grass   " fertile   T forest   W start warehouse
import { loadData } from '../src/platform/loadData.node.js';
import { compileRules } from '../src/sim/rules.js';
import { generateMap, countTerrain, countBlocks2x2 } from '../src/sim/mapgen.js';

const data = loadData();
if (process.argv[2] !== undefined) data.map.seed = Number(process.argv[2]);
const rules = compileRules(data);
const startDef = rules.buildings[rules.start.freeBuilding];
const map = generateMap(rules.map, [startDef.w, startDef.h]);

const CHARS = { water: '~', coast: ':', grass: '.', fertile: '"', forest: 'T' };
for (let y = 0; y < map.height; y++) {
  let row = '';
  for (let x = 0; x < map.width; x++) {
    const inStart = x >= map.start.x && x < map.start.x + startDef.w && y >= map.start.y && y < map.start.y + startDef.h;
    row += inStart ? 'W' : CHARS[map.terrain[y * map.width + x]];
  }
  console.log(row);
}
const land = map.terrain.filter((t) => t !== 'water').length;
console.log(
  `seed asked ${data.map.seed}, seed used ${map.seed} | land ${land} | coast ${countTerrain(map, 'coast')} | ` +
    `forest ${countTerrain(map, 'forest')} | fertile ${countTerrain(map, 'fertile')} ` +
    `(${countBlocks2x2(map, 'fertile')} 2x2 blocks) | start ${map.start.x},${map.start.y}`,
);
