// Generates the island from a seed. Same seed in, same island out.
//
// Steps:
//  1. Score every tile: closer to the middle scores higher, with noise so the
//     shore is not a perfect circle. The best-scoring tiles become land.
//  2. Keep only the biggest landmass and fill in any lakes.
//  3. Land tiles that touch water become coast.
//  4. Forest and fertile land are laid down in patches using two more noise maps.
//  5. Pick the site for the free starting building.
//  6. Check the guarantees from map.json. If they fail, try the next seed.

import { createRng } from './rng.js';
import { DIRS4, footprint, tileWithinRadius } from './grid.js';

const MAX_ATTEMPTS = 50;
// The second island is made from the home island's seed plus this, so the two never share a seed.
const SECOND_SEED = 7919;
const BORDER = 2; // tiles of guaranteed water around the edge

export function generateMap(mapData, startSize = [1, 1]) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const map = generateOnce(mapData, mapData.seed + attempt, startSize);
    if (checkGuarantees(map, mapData).length === 0) return withSecondIsland(map, mapData);
  }
  throw new Error(
    `No island that meets the guarantees in map.json was found for seed ${mapData.seed} ` +
      `(tried ${MAX_ATTEMPTS} seeds). Loosen the guarantees or change the generation settings.`,
  );
}

// Adds the second island (map.json "second") to the east of a finished home
// island. The home island's tiles keep their x and y, so it is unchanged; the
// map only grows. map.second is the box of tiles the second island lies in.
// Without a "second" entry the home island comes back as it was.
export function withSecondIsland(home, mapData) {
  const s = mapData.second;
  if (!s) return home;
  const island = generateSecond(s, home.seed);
  const x0 = home.width + s.gap;
  const y0 = s.offsetY;
  const width = x0 + s.width;
  const height = Math.max(home.height, y0 + s.height);
  const terrain = new Array(width * height).fill('water');
  for (let y = 0; y < home.height; y++) {
    for (let x = 0; x < home.width; x++) terrain[y * width + x] = home.terrain[y * home.width + x];
  }
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) terrain[(y0 + y) * width + x0 + x] = island.terrain[y * s.width + x];
  }
  return { ...home, width, height, terrain, second: { x: x0, y: y0, width: s.width, height: s.height } };
}

function generateSecond(s, homeSeed) {
  const data = { width: s.width, height: s.height, generation: s.generation };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const island = generateOnce(data, homeSeed + SECOND_SEED + attempt, null);
    if (checkGuarantees({ ...island, start: true }, { guarantees: s.guarantees }).length === 0) return island;
  }
  throw new Error(`No second island that meets its guarantees in map.json was found for seed ${homeSeed}.`);
}

// Returns a list of guarantee failures. Empty means the map is good.
export function checkGuarantees(map, mapData) {
  const g = mapData.guarantees;
  const problems = [];
  const forest = countTerrain(map, 'forest');
  const coast = countTerrain(map, 'coast');
  const blocks = countBlocks2x2(map, 'fertile');
  if (forest < g.minForestTiles) problems.push(`only ${forest} forest tiles, need ${g.minForestTiles}`);
  if (coast < g.minCoastTiles) problems.push(`only ${coast} coast tiles, need ${g.minCoastTiles}`);
  if (blocks < g.minFertileBlocks2x2) problems.push(`only ${blocks} fertile 2x2 blocks, need ${g.minFertileBlocks2x2}`);
  if (!map.start) problems.push('no valid start site');
  return problems;
}

export function countTerrain(map, terrain) {
  let n = 0;
  for (const t of map.terrain) if (t === terrain) n++;
  return n;
}

// Counts 2x2 blocks of one terrain that do not overlap each other.
export function countBlocks2x2(map, terrain) {
  const { width, height } = map;
  const used = new Array(width * height).fill(false);
  let count = 0;
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const cells = [y * width + x, y * width + x + 1, (y + 1) * width + x, (y + 1) * width + x + 1];
      if (cells.every((i) => map.terrain[i] === terrain && !used[i])) {
        for (const i of cells) used[i] = true;
        count++;
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------

function generateOnce(mapData, seed, startSize) {
  const { width, height } = mapData;
  const gen = mapData.generation;
  const total = width * height;
  const rng = createRng(seed);
  const patchSize = gen.patchSize ?? 12;
  const coastRoughness = gen.coastRoughness ?? 0.5;

  const shapeNoise = layeredNoise(rng, width, height, Math.max(8, Math.round(Math.min(width, height) / 4)));
  const forestNoise = layeredNoise(rng, width, height, patchSize);
  const fertileNoise = layeredNoise(rng, width, height, patchSize);

  // 1. Land: the best-scoring tiles, never inside the border.
  const candidates = [];
  const score = new Array(total).fill(-Infinity);
  for (let y = BORDER; y < height - BORDER; y++) {
    for (let x = BORDER; x < width - BORDER; x++) {
      const nx = ((x + 0.5) / width) * 2 - 1;
      const ny = ((y + 0.5) / height) * 2 - 1;
      const i = y * width + x;
      score[i] = shapeNoise(x, y) * coastRoughness - Math.sqrt(nx * nx + ny * ny);
      candidates.push(i);
    }
  }
  let land = new Array(total).fill(false);
  for (const i of pickTop(candidates, score, Math.round(gen.landFraction * total))) land[i] = true;

  // 2. One island, no lakes.
  land = largestRegion(land, width, height);
  fillLakes(land, width, height);

  // 3. Coast.
  const terrain = new Array(total).fill('water');
  const interior = [];
  let landCount = 0;
  for (let i = 0; i < total; i++) {
    if (!land[i]) continue;
    landCount++;
    const x = i % width;
    const y = (i - x) / width;
    const touchesWater = DIRS4.some(([dx, dy]) => !land[(y + dy) * width + (x + dx)]);
    terrain[i] = touchesWater ? 'coast' : 'grass';
    if (!touchesWater) interior.push(i);
  }

  // 4. Forest, then fertile land on what is left.
  const noiseScores = (noise) => {
    const s = new Array(total).fill(0);
    for (const i of interior) s[i] = noise(i % width, Math.floor(i / width));
    return s;
  };
  for (const i of pickTop(interior, noiseScores(forestNoise), Math.round(gen.forestFractionOfLand * landCount))) {
    terrain[i] = 'forest';
  }
  const grass = interior.filter((i) => terrain[i] === 'grass');
  for (const i of pickTop(grass, noiseScores(fertileNoise), Math.round(gen.fertileFractionOfLand * landCount))) {
    terrain[i] = 'fertile';
  }

  // 5. Start site (none for the second island, which is settled from the home island).
  const map = { width, height, seed, terrain, start: null };
  if (startSize) map.start = findStartSite(map, mapData, startSize);
  return map;
}

// The `count` highest-scoring indexes. Ties go to the lower index, so the
// result never depends on how the engine happens to sort.
function pickTop(indexes, score, count) {
  return [...indexes].sort((a, b) => score[b] - score[a] || a - b).slice(0, Math.max(0, count));
}

// Smooth noise between 0 and 1: random values on a coarse grid, blended.
function makeNoise(rng, width, height, cell) {
  const cols = Math.ceil(width / cell) + 2;
  const rows = Math.ceil(height / cell) + 2;
  const lattice = [];
  for (let i = 0; i < cols * rows; i++) lattice.push(rng());
  const ease = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = ease(fx - x0);
    const ty = ease(fy - y0);
    const a = lattice[y0 * cols + x0];
    const b = lattice[y0 * cols + x0 + 1];
    const c = lattice[(y0 + 1) * cols + x0];
    const d = lattice[(y0 + 1) * cols + x0 + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}

// Three layers of noise: big shapes plus smaller detail.
function layeredNoise(rng, width, height, cell) {
  const big = makeNoise(rng, width, height, cell);
  const mid = makeNoise(rng, width, height, Math.max(2, cell / 2));
  const fine = makeNoise(rng, width, height, Math.max(2, cell / 4));
  return (x, y) => big(x, y) * 0.57 + mid(x, y) * 0.29 + fine(x, y) * 0.14;
}

// Keeps only the largest edge-connected group of land tiles.
function largestRegion(land, width, height) {
  const total = width * height;
  const label = new Array(total).fill(0);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < total; start++) {
    if (!land[start] || label[start]) continue;
    next++;
    let size = 0;
    const queue = [start];
    label[start] = next;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      size++;
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (land[n] && !label[n]) {
          label[n] = next;
          queue.push(n);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
  }
  return land.map((isLand, i) => isLand && label[i] === best);
}

// Any water that cannot reach the map edge is a lake. Turn it into land.
function fillLakes(land, width, height) {
  const total = width * height;
  const sea = new Array(total).fill(false);
  const queue = [0]; // the top-left corner is always water (it is in the border)
  sea[0] = true;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (!land[n] && !sea[n]) {
        sea[n] = true;
        queue.push(n);
      }
    }
  }
  for (let i = 0; i < total; i++) if (!land[i] && !sea[i]) land[i] = true;
}

// Walking distance (over buildable tiles only) from every tile to the nearest
// source tile. -1 means it cannot be reached.
function distanceField(map, buildable, sources) {
  const { width, height } = map;
  const dist = new Array(width * height).fill(-1);
  const queue = [];
  for (const i of sources) {
    dist[i] = 0;
    queue.push(i);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (buildable[n] && dist[n] === -1) {
        dist[n] = dist[i] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

// The start site is a patch of plain grass that can reach coast, forest and
// fertile land by road within the guaranteed distance. Among those, the one
// with the most open grass around it wins, so there is room for a town.
export function findStartSite(map, mapData, [w, h]) {
  const { width, height, terrain } = map;
  const total = width * height;
  const maxDistance = mapData.guarantees.startMaxDistance;
  const buildable = terrain.map((t) => mapData.terrain[t].buildable === true);

  const coastSources = [];
  const fertileSources = [];
  const forestSources = [];
  for (let i = 0; i < total; i++) {
    if (!buildable[i]) continue;
    if (terrain[i] === 'coast') coastSources.push(i);
    if (terrain[i] === 'fertile') fertileSources.push(i);
    const x = i % width;
    const y = (i - x) / width;
    if (DIRS4.some(([dx, dy]) => terrain[(y + dy) * width + (x + dx)] === 'forest')) forestSources.push(i);
  }
  const fields = [coastSources, fertileSources, forestSources].map((s) => distanceField(map, buildable, s));

  let best = null;
  for (let y = 0; y <= height - h; y++) {
    for (let x = 0; x <= width - w; x++) {
      const tiles = footprint(x, y, w, h).map(([tx, ty]) => ty * width + tx);
      if (!tiles.every((i) => terrain[i] === 'grass')) continue;

      let worst = 0;
      let sum = 0;
      let reachable = true;
      for (const field of fields) {
        let nearest = Infinity;
        for (const i of tiles) if (field[i] !== -1 && field[i] < nearest) nearest = field[i];
        if (nearest === Infinity) reachable = false;
        worst = Math.max(worst, nearest);
        sum += nearest;
      }
      if (!reachable || worst > maxDistance) continue;

      const room = countGrassAround(map, x + w / 2, y + h / 2, 8);
      if (!best || room > best.room || (room === best.room && sum < best.sum)) best = { x, y, room, sum };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

function countGrassAround(map, cx, cy, radius) {
  let n = 0;
  for (let ty = Math.floor(cy - radius); ty <= Math.ceil(cy + radius); ty++) {
    for (let tx = Math.floor(cx - radius); tx <= Math.ceil(cx + radius); tx++) {
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
      if (map.terrain[ty * map.width + tx] === 'grass' && tileWithinRadius(cx, cy, radius, tx, ty)) n++;
    }
  }
  return n;
}
