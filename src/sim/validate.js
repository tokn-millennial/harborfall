// Checks the data files for mistakes before the game starts.
// Returns a list of plain-English problems. An empty list means the data is fine.
// Expects data with the "_note" keys already removed (see rules.js).

export const CATEGORIES = ['road', 'storage', 'producer', 'house', 'market', 'harbor'];

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
  if (map.second !== undefined) {
    const s = map.second;
    if (!isObject(s)) err('map.second must be an object');
    else {
      number(s.gap, 'map.second.gap', { min: 2, integer: true });
      number(s.width, 'map.second.width', { min: 12, integer: true });
      number(s.height, 'map.second.height', { min: 12, integer: true });
      number(s.offsetY, 'map.second.offsetY', { min: 0, integer: true });
      if (!isObject(s.generation)) err('map.second.generation is missing');
      else {
        for (const key of ['landFraction', 'forestFractionOfLand', 'fertileFractionOfLand']) {
          number(s.generation[key], `map.second.generation.${key}`, { min: 0, minExclusive: true, max: 1 });
        }
      }
      if (!isObject(s.guarantees)) err('map.second.guarantees is missing');
      else for (const key of ['minForestTiles', 'minFertileBlocks2x2', 'minCoastTiles']) number(s.guarantees[key], `map.second.guarantees.${key}`, { integer: true });
    }
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
    if (tier.capacityWithout !== undefined) {
      if (!isObject(tier.capacityWithout)) err(`${where}.capacityWithout must be an object of good: residents`);
      else {
        for (const [good, n] of Object.entries(tier.capacityWithout)) {
          if (!isObject(tier.needs) || !(good in tier.needs)) err(`${where}.capacityWithout names "${good}", which is not one of its needs`);
          number(n, `${where}.capacityWithout.${good}`, { min: 1, integer: true });
          if (isNumber(n) && isNumber(tier.capacity) && n >= tier.capacity) err(`${where}.capacityWithout.${good} must be less than its capacity`);
        }
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
    if (b.carts !== undefined) {
      number(b.carts, `${where}.carts`, { integer: true });
      if (b.category !== 'storage' && b.carts !== 0) err(`${where}.carts: only warehouses keep carts`);
    }
    if (b.staff !== undefined) {
      number(b.staff, `${where}.staff`, { integer: true });
      if (b.category !== 'producer' && b.staff !== 0) err(`${where}.staff: only producers need staff`);
    }

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
          if (!['terrainInRadius', 'adjacentTerrain', 'footprintTerrain', 'island'].includes(key)) err(`${where}.placement has an unknown rule "${key}"`);
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
        // A building that may stand on one island only. "second" is the only one there is.
        if (p.island !== undefined && p.island !== 'second') err(`${where}.placement.island must be "second"`);
      }
    }
  }

  // --- config ---------------------------------------------------------------
  number(config.ticksPerSecond, 'config.ticksPerSecond', { min: 1, integer: true });
  if (config.undoSeconds !== undefined) number(config.undoSeconds, 'config.undoSeconds', { min: 0 });
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
  if (config.difficulties !== undefined) {
    if (!isObject(config.difficulties) || Object.keys(config.difficulties).length === 0) err('config.difficulties must list at least one difficulty');
    else {
      for (const [id, d] of Object.entries(config.difficulties)) {
        const where = `config.difficulties.${id}`;
        if (!isObject(d)) { err(`${where} must be an object`); continue; }
        if (typeof d.name !== 'string') err(`${where} needs a name`);
        if (d.about !== undefined && typeof d.about !== 'string') err(`${where}.about must be text`);
        if (d.startCoins !== undefined) number(d.startCoins, `${where}.startCoins`, { integer: true });
        if (d.baseIncomePerMinute !== undefined) number(d.baseIncomePerMinute, `${where}.baseIncomePerMinute`);
        if (d.taxMultiplier !== undefined) number(d.taxMultiplier, `${where}.taxMultiplier`, { min: 0, minExclusive: true });
        for (const key of Object.keys(d)) {
          if (!['name', 'about', 'startCoins', 'baseIncomePerMinute', 'taxMultiplier'].includes(key)) err(`${where} has an unknown setting "${key}"`);
        }
      }
      if (config.defaultDifficulty !== undefined && !isObject(config.difficulties[config.defaultDifficulty])) {
        err(`config.defaultDifficulty names an unknown difficulty "${config.defaultDifficulty}"`);
      }
    }
  }
  if (config.milestones !== undefined) {
    if (!Array.isArray(config.milestones)) err('config.milestones must be a list');
    else {
      config.milestones.forEach((m, i) => {
        const where = `config.milestones[${i}]`;
        if (!isObject(m)) { err(`${where} must be an object`); return; }
        if (!tiers[m.tier]) err(`${where}.tier names an unknown tier "${m.tier}"`);
        number(m.residents, `${where}.residents`, { min: 1, integer: true });
        if (m.title !== undefined && typeof m.title !== 'string') err(`${where}.title must be text`);
      });
    }
  }
  if (config.scenarios !== undefined) {
    if (!isObject(config.scenarios)) err('config.scenarios must be an object');
    else {
      const ALLOWED = ['name', 'about', 'seed', 'startCoins', 'startGoods', 'baseIncomePerMinute', 'win', 'milestones', 'workforce', 'medals'];
      for (const [id, s] of Object.entries(config.scenarios)) {
        const where = `config.scenarios.${id}`;
        if (!isObject(s)) { err(`${where} must be an object`); continue; }
        if (typeof s.name !== 'string') err(`${where} needs a name`);
        if (s.about !== undefined && typeof s.about !== 'string') err(`${where}.about must be text`);
        if (s.seed !== undefined) number(s.seed, `${where}.seed`, { integer: true });
        if (s.startCoins !== undefined) number(s.startCoins, `${where}.startCoins`, { integer: true });
        if (s.startGoods !== undefined) goodAmounts(s.startGoods, `${where}.startGoods`);
        if (s.baseIncomePerMinute !== undefined) number(s.baseIncomePerMinute, `${where}.baseIncomePerMinute`);
        if (s.win !== undefined) {
          if (!isObject(s.win)) err(`${where}.win must be an object`);
          else {
            if (!tiers[s.win.tier]) err(`${where}.win.tier names an unknown tier "${s.win.tier}"`);
            number(s.win.residents, `${where}.win.residents`, { min: 1, integer: true });
          }
        }
        if (s.milestones !== undefined) {
          if (!Array.isArray(s.milestones)) err(`${where}.milestones must be a list`);
          else {
            s.milestones.forEach((m, i) => {
              if (!isObject(m)) { err(`${where}.milestones[${i}] must be an object`); return; }
              if (!tiers[m.tier]) err(`${where}.milestones[${i}].tier names an unknown tier "${m.tier}"`);
              number(m.residents, `${where}.milestones[${i}].residents`, { min: 1, integer: true });
            });
          }
        }
        if (s.workforce !== undefined) {
          if (!isObject(s.workforce)) err(`${where}.workforce must be an object`);
          else {
            number(s.workforce.base, `${where}.workforce.base`, { min: 1, integer: true });
            number(s.workforce.perResident, `${where}.workforce.perResident`);
          }
        }
        if (s.medals !== undefined) {
          if (!isObject(s.medals)) err(`${where}.medals must be an object`);
          else {
            number(s.medals.gold, `${where}.medals.gold`, { min: 0, minExclusive: true });
            number(s.medals.silver, `${where}.medals.silver`, { min: 0, minExclusive: true });
            if (typeof s.medals.gold === 'number' && typeof s.medals.silver === 'number' && s.medals.silver <= s.medals.gold) {
              err(`${where}.medals.silver must be a longer time than gold`);
            }
          }
        }
        for (const key of Object.keys(s)) {
          if (!ALLOWED.includes(key) && !key.startsWith('_')) err(`${where} has an unknown setting "${key}"`);
        }
      }
    }
  }
  if (config.carts !== undefined) {
    if (!isObject(config.carts)) err('config.carts must be an object');
    else {
      for (const key of ['ticksPerTile', 'load', 'yard', 'reachTiles']) number(config.carts[key], `config.carts.${key}`, { min: 1, integer: true });
      // Without a cart a warehouse could collect nothing.
      for (const [id, b] of Object.entries(buildings)) {
        if (isObject(b) && b.category === 'storage' && !(isNumber(b.carts) && b.carts >= 1)) err(`buildings.${id} is a warehouse and needs at least 1 cart`);
      }
    }
  }
  if (config.materials !== undefined) {
    if (!isObject(config.materials)) err('config.materials must be an object');
    else {
      number(config.materials.store, 'config.materials.store', { min: 1, integer: true });
      if (config.carts === undefined) err('config.materials needs config.carts: carts bring the materials');
      // A store too small for one cycle would never let a workshop start.
      for (const [id, b] of Object.entries(buildings)) {
        for (const [good, n] of Object.entries(isObject(b?.production?.inputs) ? b.production.inputs : {})) {
          if (isNumber(config.materials.store) && isNumber(n) && n > config.materials.store) err(`buildings.${id} uses ${n} ${good} a cycle, more than config.materials.store holds`);
        }
      }
    }
  }
  if (config.trade !== undefined) {
    if (!isObject(config.trade)) err('config.trade must be an object');
    else {
      number(config.trade.shipEverySeconds, 'config.trade.shipEverySeconds', { min: 0, minExclusive: true });
      number(config.trade.unitsPerHarbor, 'config.trade.unitsPerHarbor', { min: 1, integer: true });
    }
  }
  if (config.settlers !== undefined) {
    if (!isObject(config.settlers)) err('config.settlers must be an object');
    else {
      number(config.settlers.grantCoins, 'config.settlers.grantCoins', { min: 0 });
      if (config.settlers.incomePerMinute !== undefined) number(config.settlers.incomePerMinute, 'config.settlers.incomePerMinute', { min: 0 });
    }
  }
  if (config.fleet !== undefined) {
    if (!isObject(config.fleet)) err('config.fleet must be an object');
    else {
      number(config.fleet.capacity, 'config.fleet.capacity', { min: 1, integer: true });
      number(config.fleet.secondsPerTile, 'config.fleet.secondsPerTile', { min: 0, minExclusive: true });
      number(config.fleet.loadSeconds, 'config.fleet.loadSeconds', { min: 0 });
    }
  }
  // Prices: a good may be traded if it has both. Buying must cost more than
  // selling earns, or the ship would be a machine that prints coins.
  for (const [id, g] of Object.entries(goods)) {
    if (!isObject(g) || g.trade === undefined) continue;
    if (!isObject(g.trade)) { err(`goods.${id}.trade must be an object`); continue; }
    number(g.trade.sell, `goods.${id}.trade.sell`, { min: 0, minExclusive: true });
    number(g.trade.buy, `goods.${id}.trade.buy`, { min: 0, minExclusive: true });
    if (isNumber(g.trade.sell) && isNumber(g.trade.buy) && g.trade.buy <= g.trade.sell) err(`goods.${id}.trade.buy must be more than its sell price`);
  }
  if (config.workforce !== undefined) {
    if (!isObject(config.workforce)) err('config.workforce must be an object');
    else {
      // At least one to start with, so a town with no residents still works a little.
      number(config.workforce.base, 'config.workforce.base', { min: 1, integer: true });
      number(config.workforce.perResident, 'config.workforce.perResident');
    }
  }
  if (config.addedLater !== undefined) {
    const steps = Array.isArray(config.addedLater) ? config.addedLater : [config.addedLater];
    steps.forEach((step, i) => {
      const where = Array.isArray(config.addedLater) ? `config.addedLater[${i}]` : 'config.addedLater';
      if (!isObject(step)) { err(`${where} must be an object`); return; }
      for (const [key, list] of Object.entries(step)) {
        if (!['goods', 'buildings', 'tiers', 'upgradesFrom', 'config', 'buildingSettings', 'goodSettings', 'mapSettings', 'tierNeeds', 'tierSettings'].includes(key)) err(`${where} has an unknown entry "${key}"`);
        else if (!Array.isArray(list) || !list.every((id) => typeof id === 'string')) err(`${where}.${key} must be a list of names`);
      }
    });
  }
  // An upgrade path must end. Farmer to Worker to Farmer would go round for ever.
  for (const id of Object.keys(tiers)) {
    const seen = [];
    for (let at = id; isObject(tiers[at]) && isObject(tiers[at].upgrade); at = tiers[at].upgrade.to) {
      if (seen.includes(at)) { err(`population.tiers.${id} upgrades in a circle`); break; }
      seen.push(at);
    }
  }

  return errors;
}
