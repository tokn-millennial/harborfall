// Checks the data files for mistakes before the game starts.
// Returns a list of plain-English problems. An empty list means the data is fine.
// Expects data with the "_note" keys already removed (see rules.js).

export const CATEGORIES = ['road', 'storage', 'producer', 'house', 'market'];

// The island generator knows these five terrain types by name.
export const REQUIRED_TERRAIN = ['water', 'coast', 'grass', 'fertile', 'forest'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

export function validateData(data) {
  const errors = [];
  const err = (message) => errors.push(message);

  for (const file of ['config', 'goods', 'buildings', 'population', 'map']) {
    if (!isObject(data?.[file])) err(`${file}.json is missing or is not an object`);
  }
  if (errors.length) return errors;

  const { config, goods, buildings, population, map } = data;
  const tiers = isObject(population.tiers) ? population.tiers : {};
  const terrain = isObject(map.terrain) ? map.terrain : {};

  // --- small checkers -------------------------------------------------------
  const number = (value, where, { min = 0, minExclusive = false, max = Infinity, integer = false } = {}) => {
    if (!isNumber(value)) return err(`${where} must be a number`);
    if (integer && !Number.isInteger(value)) err(`${where} must be a whole number`);
    if (minExclusive ? value <= min : value < min) err(`${where} must be ${minExclusive ? 'more than' : 'at least'} ${min}`);
    if (value > max) err(`${where} must be at most ${max}`);
  };
  const goodAmounts = (value, where) => {
    if (value === undefined) return;
    if (!isObject(value)) return err(`${where} must be an object of good: amount`);
    for (const [good, amount] of Object.entries(value)) {
      if (!goods[good]) err(`${where} names an unknown good "${good}"`);
      number(amount, `${where}.${good}`, { min: 0, minExclusive: true, integer: true });
    }
  };
  const cost = (value, where) => {
    if (!isObject(value)) return err(`${where} must be an object with coins and goods`);
    number(value.coins, `${where}.coins`, { integer: true });
    goodAmounts(value.goods, `${where}.goods`);
  };
  const knownTerrain = (name, where) => {
    if (!terrain[name]) err(`${where} names an unknown terrain "${name}"`);
  };

  // --- goods ----------------------------------------------------------------
  if (Object.keys(goods).length === 0) err('goods.json has no goods');
  for (const [id, good] of Object.entries(goods)) {
    if (!isObject(good) || typeof good.name !== 'string') err(`goods.${id} needs a name`);
  }

  // --- map ------------------------------------------------------------------
  number(map.width, 'map.width', { min: 8, integer: true });
  number(map.height, 'map.height', { min: 8, integer: true });
  number(map.seed, 'map.seed', { integer: true });
  for (const name of REQUIRED_TERRAIN) {
    if (!terrain[name]) err(`map.terrain is missing the "${name}" terrain type`);
  }
  for (const [id, t] of Object.entries(terrain)) {
    if (!isObject(t) || typeof t.buildable !== 'boolean') err(`map.terrain.${id}.buildable must be true or false`);
  }
  if (!isObject(map.generation)) err('map.generation is missing');
  else {
    for (const key of ['landFraction', 'forestFractionOfLand', 'fertileFractionOfLand']) {
      number(map.generation[key], `map.generation.${key}`, { min: 0, minExclusive: true, max: 1 });
    }
    if (map.generation.coastRoughness !== undefined) number(map.generation.coastRoughness, 'map.generation.coastRoughness');
    if (map.generation.patchSize !== undefined) number(map.generation.patchSize, 'map.generation.patchSize', { min: 2 });
  }
  if (!isObject(map.guarantees)) err('map.guarantees is missing');
  else {
    for (const key of ['minForestTiles', 'minFertileBlocks2x2', 'minCoastTiles']) {
      number(map.guarantees[key], `map.guarantees.${key}`, { integer: true });
    }
    number(map.guarantees.startMaxDistance, 'map.guarantees.startMaxDistance', { min: 1 });
  }

  // --- population -----------------------------------------------------------
  number(population.growthIntervalSeconds, 'population.growthIntervalSeconds', { min: 0, minExclusive: true });
  number(population.declineIntervalSeconds, 'population.declineIntervalSeconds', { min: 0, minExclusive: true });
  number(population.minResidents, 'population.minResidents', { integer: true });
  if (Object.keys(tiers).length === 0) err('population.tiers has no tiers');
  for (const [id, tier] of Object.entries(tiers)) {
    const where = `population.tiers.${id}`;
    if (!isObject(tier)) { err(`${where} must be an object`); continue; }
    if (typeof tier.name !== 'string') err(`${where} needs a name`);
    number(tier.capacity, `${where}.capacity`, { min: 1, integer: true });
    number(tier.taxPerResidentPerMinute, `${where}.taxPerResidentPerMinute`);
    if (!isObject(tier.needs)) err(`${where}.needs must be an object of good: rate`);
    else {
      for (const [good, rate] of Object.entries(tier.needs)) {
        if (!goods[good]) err(`${where}.needs names an unknown good "${good}"`);
        number(rate, `${where}.needs.${good}`, { min: 0, minExclusive: true });
      }
    }
    if (tier.upgrade !== undefined) {
      if (!isObject(tier.upgrade)) err(`${where}.upgrade must be an object`);
      else {
        const target = tiers[tier.upgrade.to];
        if (!target) err(`${where}.upgrade.to names an unknown tier "${tier.upgrade.to}"`);
        else if (isNumber(target.capacity) && isNumber(tier.capacity) && target.capacity < tier.capacity) {
          err(`${where}.upgrade.to must not hold fewer residents than ${id}`);
        }
        cost(tier.upgrade.cost, `${where}.upgrade.cost`);
      }
    }
  }

  // --- buildings ------------------------------------------------------------
  if (!buildings.road || buildings.road.category !== 'road') err('buildings.json must define "road" with category "road"');
  if (!Object.values(buildings).some((b) => b?.category === 'storage')) err('buildings.json needs at least one storage building');
  const keysSeen = {};
  for (const [id, b] of Object.entries(buildings)) {
    if (!isObject(b) || b.key === undefined) continue;
    if (typeof b.key !== 'string' || !/^[a-z0-9]$/i.test(b.key)) {
      err(`buildings.${id}.key must be a single letter or digit`);
      continue;
    }
    const key = b.key.toLowerCase();
    if (keysSeen[key]) err(`buildings.${id}.key "${b.key}" is already used by ${keysSeen[key]}`);
    else keysSeen[key] = id;
  }
  for (const [id, b] of Object.entries(buildings)) {
    const where = `buildings.${id}`;
    if (!isObject(b)) { err(`${where} must be an object`); continue; }
    if (typeof b.name !== 'string') err(`${where} needs a name`);
    if (!CATEGORIES.includes(b.category)) err(`${where}.category must be one of: ${CATEGORIES.join(', ')}`);
    if (!Array.isArray(b.size) || b.size.length !== 2) err(`${where}.size must be [width, height]`);
    else {
      number(b.size[0], `${where}.size width`, { min: 1, integer: true });
      number(b.size[1], `${where}.size height`, { min: 1, integer: true });
    }
    cost(b.cost, `${where}.cost`);
    number(b.upkeepPerMinute, `${where}.upkeepPerMinute`);

    if (b.category === 'road' && (b.size?.[0] !== 1 || b.size?.[1] !== 1)) err(`${where} is a road and must be size [1, 1]`);
    if (b.category === 'storage') number(b.storagePerGood, `${where}.storagePerGood`, { min: 1, integer: true });
    if (b.category === 'producer' && !isObject(b.production)) err(`${where} is a producer and needs "production"`);
    if (b.category === 'house' && !isObject(b.housing)) err(`${where} is a house and needs "housing"`);
    if (b.category === 'market' && !isObject(b.market)) err(`${where} is a market and needs "market"`);

    if (isObject(b.production)) {
      number(b.production.cycleSeconds, `${where}.production.cycleSeconds`, { min: 0, minExclusive: true });
      goodAmounts(b.production.inputs, `${where}.production.inputs`);
      goodAmounts(b.production.outputs, `${where}.production.outputs`);
      if (!isObject(b.production.outputs) || Object.keys(b.production.outputs).length === 0) {
        err(`${where}.production.outputs must make at least one good`);
      }
    }
    if (isObject(b.housing) && !tiers[b.housing.tier]) err(`${where}.housing.tier names an unknown tier "${b.housing.tier}"`);
    if (isObject(b.market)) number(b.market.radius, `${where}.market.radius`, { min: 0, minExclusive: true });

    if (b.placement !== undefined) {
      if (!isObject(b.placement)) err(`${where}.placement must be an object`);
      else {
        const p = b.placement;
        for (const key of Object.keys(p)) {
          if (!['terrainInRadius', 'adjacentTerrain', 'footprintTerrain'].includes(key)) err(`${where}.placement has an unknown rule "${key}"`);
        }
        if (p.terrainInRadius !== undefined) {
          if (!isObject(p.terrainInRadius)) err(`${where}.placement.terrainInRadius must be an object`);
          else {
            knownTerrain(p.terrainInRadius.terrain, `${where}.placement.terrainInRadius`);
            number(p.terrainInRadius.radius, `${where}.placement.terrainInRadius.radius`, { min: 0, minExclusive: true });
            number(p.terrainInRadius.minTiles, `${where}.placement.terrainInRadius.minTiles`, { min: 1, integer: true });
          }
        }
        if (p.adjacentTerrain !== undefined) knownTerrain(p.adjacentTerrain, `${where}.placement.adjacentTerrain`);
        if (p.footprintTerrain !== undefined) knownTerrain(p.footprintTerrain, `${where}.placement.footprintTerrain`);
      }
    }
  }

  // --- config ---------------------------------------------------------------
  number(config.ticksPerSecond, 'config.ticksPerSecond', { min: 1, integer: true });
  if (!Array.isArray(config.speeds) || config.speeds.length === 0) err('config.speeds must be a list of speed multipliers');
  if (!isObject(config.start)) err('config.start is missing');
  else {
    number(config.start.coins, 'config.start.coins', { integer: true });
    goodAmounts(config.start.goods, 'config.start.goods');
    const free = config.start.freeBuildings ?? [];
    if (!Array.isArray(free) || free.length > 1) err('config.start.freeBuildings must list at most one building');
    else {
      for (const id of free) {
        if (!buildings[id]) err(`config.start.freeBuildings names an unknown building "${id}"`);
      }
    }
  }
  if (!isObject(config.economy)) err('config.economy is missing');
  else {
    number(config.economy.incomeIntervalSeconds, 'config.economy.incomeIntervalSeconds', { min: 0, minExclusive: true });
    number(config.economy.baseIncomePerMinute, 'config.economy.baseIncomePerMinute');
    number(config.economy.demolishRefundRatio, 'config.economy.demolishRefundRatio', { max: 1 });
  }
  if (!isObject(config.win)) err('config.win is missing');
  else {
    if (!tiers[config.win.tier]) err(`config.win.tier names an unknown tier "${config.win.tier}"`);
    number(config.win.residents, 'config.win.residents', { min: 1, integer: true });
  }

  return errors;
}
