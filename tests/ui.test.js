// The logic behind the UI: the words the player reads, what each tool would
// do, and what the info panel shows. None of this needs a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, buildingIssue } from '../src/sim/index.js';
import { clock, costText, shortfallText, refundText, buildingBlurb, placementText, reasonText, issueLevel } from '../src/ui/text.js';
import {
  roadLine, extendRoadPath, anchorFor, previewBuild, previewRoad, previewDemolish, previewUpgrade, rangeTiles, requiredTerrain, terrainTiles,
} from '../src/ui/tools.js';
import { panelModel } from '../src/ui/panelModel.js';
import { createAdvisor } from '../src/ui/advice.js';
import { housesInRangeOf } from '../src/sim/index.js';
import { testGame, richGame, place, road, line, run, buildMarket, fillHouse, snapshot } from './helpers.js';

// ---- words --------------------------------------------------------------------

test('clock shows minutes and seconds', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(65.9), '1:05');
  assert.equal(clock(1716), '28:36');
});

test('costs read naturally, straight from the data files', () => {
  const { rules } = testGame();
  assert.equal(costText(rules, rules.buildings.road.cost), '1 coin');
  assert.equal(costText(rules, rules.buildings.farm.cost), '50 coins, 10 wood, 5 planks');
  assert.equal(costText(rules, { coinsMilli: 0, goods: {} }), 'Free');
});

test('a shortfall says exactly what is missing', () => {
  const game = testGame({ coins: 45, goods: { wood: 7, planks: 5 } });
  assert.equal(shortfallText(game, game.rules.buildings.farm.cost), 'Need 5 more coins and 3 more wood');
  assert.equal(shortfallText(game, game.rules.buildings.road.cost), null);
});

test('a refund is described, and the free warehouse returns nothing', () => {
  const game = richGame();
  const farm = place(game, 'farm', 14, 3);
  assert.equal(refundText(game.rules, farm), 'Returns 25 coins, 5 wood, 2 planks');
  assert.equal(refundText(game.rules, game.state.buildings[0]), 'Returns nothing');
});

test('every building has a description, with no code words leaking through', () => {
  const { rules } = testGame();
  for (const id of Object.keys(rules.buildings)) {
    const lines = buildingBlurb(rules, id);
    assert.ok(lines.length >= 1, `${id} has a description`);
    for (const text of lines) {
      assert.doesNotMatch(text, /_|undefined|NaN|null/, `${id}: "${text}"`);
      assert.match(text, /\.$/, `${id}: "${text}" ends with a full stop`);
    }
  }
  assert.deepEqual(buildingBlurb(rules, 'sawmill').slice(0, 1), ['Turns 2 wood into 1 plank every 16 s.']);
});

test('placement rules are explained with the numbers from the data', () => {
  const { rules } = testGame();
  assert.equal(placementText(rules, 'lumberjack'), 'Needs 8 or more forest tiles within 4 tiles.');
  assert.equal(placementText(rules, 'fisherman'), 'Must touch a coast tile.');
  assert.equal(placementText(rules, 'farm'), 'Must stand entirely on fertile land.');
  assert.equal(placementText(rules, 'house'), null);
});

test('every reason the simulation can give has a plain sentence', () => {
  const game = testGame();
  const codes = [
    'out_of_bounds', 'not_buildable', 'blocked', 'unknown_building', 'not_enough_coins', 'not_enough_goods',
    'needs_forest', 'needs_coast', 'needs_fertile', 'nothing_here', 'last_warehouse', 'not_a_house', 'max_tier',
    'house_not_full', 'no_market', 'needs_unmet', 'no_bread', 'no_fish', 'no_road', 'missing_input',
    'storage_full', 'unknown_command', 'bad_command', 'some_future_code',
  ];
  for (const code of codes) {
    const text = reasonText(game, code);
    assert.ok(text.length > 5, code);
    assert.doesNotMatch(text, /_|undefined/, `${code}: "${text}"`);
  }
  assert.equal(reasonText(game, 'needs_forest', { building: 'lumberjack' }), 'Needs 8 or more forest tiles within 4 tiles.');
  assert.equal(reasonText(game, 'no_bread'), 'No bread in stock.');
  assert.equal(reasonText(game, 'missing_input', { building: 'sawmill' }), 'Waiting for wood.');
  assert.equal(reasonText(game, null), '');
});

test('a cost problem names what is missing', () => {
  const game = testGame({ coins: 10 });
  assert.equal(reasonText(game, 'not_enough_coins', { cost: game.rules.buildings.market.cost }), 'Need 50 more coins.');
});

test('problems are graded: no road or no market is serious, a shortage is a wait', () => {
  assert.equal(issueLevel(null), 'ok');
  assert.equal(issueLevel('no_road'), 'bad');
  assert.equal(issueLevel('no_market'), 'bad');
  assert.equal(issueLevel('missing_input'), 'warn');
  assert.equal(issueLevel('no_fish'), 'warn');
});

// ---- tools --------------------------------------------------------------------

test('a road line is L-shaped, unbroken, and runs along the longer side first', () => {
  assert.deepEqual(roadLine(2, 2, 2, 2), [[2, 2]]);
  assert.deepEqual(roadLine(2, 2, 5, 2), [[2, 2], [3, 2], [4, 2], [5, 2]]);
  assert.deepEqual(roadLine(5, 2, 2, 2), [[5, 2], [4, 2], [3, 2], [2, 2]]);
  assert.deepEqual(roadLine(2, 5, 2, 3), [[2, 5], [2, 4], [2, 3]]);
  assert.deepEqual(roadLine(0, 0, 3, 1), [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]]);
  assert.deepEqual(roadLine(0, 0, -1, 3), [[0, 0], [0, 1], [0, 2], [0, 3], [-1, 3]]);
  // Every step in any line moves exactly one tile along an edge.
  for (const [ax, ay, bx, by] of [[0, 0, 7, 4], [7, 4, 0, 0], [3, 9, 8, 1], [8, 1, 3, 9], [4, 4, 4, 9]]) {
    const tiles = roadLine(ax, ay, bx, by);
    assert.deepEqual(tiles[0], [ax, ay]);
    assert.deepEqual(tiles[tiles.length - 1], [bx, by]);
    assert.equal(tiles.length, Math.abs(bx - ax) + Math.abs(by - ay) + 1);
    for (let i = 1; i < tiles.length; i++) {
      assert.equal(Math.abs(tiles[i][0] - tiles[i - 1][0]) + Math.abs(tiles[i][1] - tiles[i - 1][1]), 1);
    }
  }
});

test('a building is centred on the pointer', () => {
  assert.deepEqual(anchorFor({ w: 2, h: 2 }, 10.0, 10.0), { x: 9, y: 9 });
  assert.deepEqual(anchorFor({ w: 2, h: 2 }, 10.6, 10.4), { x: 10, y: 9 });
  assert.deepEqual(anchorFor({ w: 1, h: 1 }, 10.6, 10.4), { x: 10, y: 10 });
});

test('the build preview agrees with what the click then does', () => {
  const game = richGame();
  const cases = [
    ['house', 16, 11], ['house', 0, 0], ['house', 10, 9], ['farm', 14, 3], ['farm', 8, 12],
    ['lumberjack', 8, 4], ['lumberjack', 20, 14], ['fisherman', 2, 5], ['fisherman', 10, 5],
  ];
  for (const [building, x, y] of cases) {
    const preview = previewBuild(game, building, x, y);
    const before = snapshot(game);
    const result = execute(game, { action: 'place', building, x, y });
    assert.equal(preview.ok, result.ok, `${building} at ${x},${y}`);
    if (!result.ok) {
      assert.equal(preview.reason, result.reason, `${building} at ${x},${y}`);
      assert.equal(snapshot(game), before);
    }
  }
});

test('the build preview separates a bad site from a cost problem', () => {
  const poor = testGame({ coins: 0 });
  const blocked = previewBuild(poor, 'house', 10, 9);
  assert.deepEqual([blocked.ok, blocked.siteOk, blocked.reason], [false, false, 'blocked']);
  const cannotAfford = previewBuild(poor, 'house', 16, 11);
  assert.deepEqual([cannotAfford.ok, cannotAfford.siteOk, cannotAfford.reason], [false, true, 'not_enough_coins']);
});

test('placing a house out of market range is allowed but flagged', () => {
  const game = richGame();
  assert.deepEqual(previewBuild(game, 'house', 16, 11).hints, ['no_market']);
  buildMarket(game);
  assert.deepEqual(previewBuild(game, 'house', 16, 11).hints, []);
  assert.deepEqual(previewBuild(game, 'house', 2, 2).hints, ['no_market'], 'too far from the market');
});

test('the road preview marks new, existing, bad and unaffordable tiles, and matches the command', () => {
  const game = testGame({ coins: 4 });
  road(game, [[12, 9]]);                       // 3 coins left
  const tiles = [...line(12, 9, 14, 9), [4, 4], ...line(15, 9, 17, 9)];
  const preview = previewRoad(game, tiles);
  assert.deepEqual(preview.tiles.map((t) => t.state), ['existing', 'new', 'new', 'bad', 'new', 'unaffordable', 'unaffordable']);
  assert.equal(preview.newCount, 3);
  assert.equal(preview.costCoins, 3);
  assert.equal(preview.reason, 'not_buildable');
  const result = execute(game, { action: 'road', tiles });
  assert.equal(result.placed, preview.newCount);
});

test('the demolish preview names what would go, and protects the last warehouse', () => {
  const game = richGame();
  const house = place(game, 'house', 16, 11);
  road(game, [[12, 9]]);
  assert.deepEqual(previewDemolish(game, 17, 12), { kind: 'building', building: house, x: 16, y: 11, w: 2, h: 2, ok: true, reason: null });
  assert.equal(previewDemolish(game, 12, 9).kind, 'road');
  assert.deepEqual([previewDemolish(game, 5, 12).ok, previewDemolish(game, 5, 12).reason], [false, 'nothing_here']);
  const warehouse = previewDemolish(game, 10, 9);
  assert.deepEqual([warehouse.ok, warehouse.reason], [false, 'last_warehouse']);
  // Pointing at a roof: the ground tile is elsewhere, but the building under the pointer wins.
  assert.equal(previewDemolish(game, 3, 3, house).building, house);
});

test('range tiles: a market covers a circle, a lumberjack shows the forest it can reach', () => {
  const game = richGame();
  const market = rangeTiles(game, 'market', 13, 11);
  assert.ok(market.length > 150 && market.length < 220, `market covers ${market.length} tiles`);
  const forest = rangeTiles(game, 'lumberjack', 8, 4);
  assert.equal(forest.length, 13, 'the 13 forest tiles within radius 4 of (8,4)');
  assert.deepEqual(rangeTiles(game, 'house', 16, 11), []);
});

// ---- warning markers and the info panel ---------------------------------------

test('the issue of a building is the most useful thing to tell the player', () => {
  const game = richGame();
  const mill = place(game, 'sawmill', 13, 13);
  assert.equal(buildingIssue(game, mill), 'no_road');
  road(game, [[12, 10], [12, 11], [12, 12], [12, 13]]);
  game.state.goods.wood = 0;
  run(game, 2);
  assert.equal(buildingIssue(game, mill), 'missing_input');
  game.state.goods.wood = 50;
  run(game, 2);
  assert.equal(buildingIssue(game, mill), null);

  const house = place(game, 'house', 16, 11);
  assert.equal(buildingIssue(game, house), 'no_market');
  place(game, 'market', 13, 10);
  game.state.goods.fish = 0;
  run(game, 2);
  assert.equal(buildingIssue(game, house), 'no_fish');
  game.state.goods.fish = 20;
  run(game, 2);
  assert.equal(buildingIssue(game, house), null);
  assert.equal(buildingIssue(game, game.state.buildings[0]), null, 'a warehouse is always fine');
});

test('the info panel for a producer: status, what it makes, progress, staff, upkeep, demolish', () => {
  const game = richGame();
  const jack = place(game, 'lumberjack', 8, 4);
  let model = panelModel(game, jack);
  assert.equal(model.title, 'Lumberjack');
  assert.equal(model.level, 'bad');
  assert.deepEqual(model.lines[0], { label: 'Status', value: 'Not connected to a warehouse by road.', level: 'bad' });

  road(game, [...line(10, 8, 10, 4), [9, 4]]);
  game.state.goods.wood = 0;
  run(game, game.rules.buildings.lumberjack.production.cycleTicks / 2);
  model = panelModel(game, jack);
  assert.equal(model.lines[0].value, 'Working.');
  assert.deepEqual(model.lines[1], { label: 'Makes', value: '1 wood every 5 s' });
  assert.equal(model.lines[2].value, '50%');
  assert.deepEqual(model.lines[3], { label: 'Staff', value: 'Needs 2' });
  assert.deepEqual(model.lines[4], { label: 'Upkeep', value: '2 coins a minute' });
  assert.deepEqual(model.actions.map((a) => a.id), ['closeBuilding', 'demolish']);
  assert.deepEqual(model.actions[1], { id: 'demolish', label: 'Demolish', detail: 'Returns 10 coins.', enabled: true, reason: null });
});

test('the info panel for a house: residents, needs, taxes, and an upgrade button that explains itself', () => {
  const game = richGame();
  buildMarket(game);
  const house = place(game, 'house', 16, 11);
  run(game, 1);
  let model = panelModel(game, house);
  assert.equal(model.title, 'Farmer house');
  assert.deepEqual(model.lines.map((l) => `${l.label}: ${l.value}`), [
    'Residents: 0 of 4', 'Market: In range', 'Fish: Supplied', 'Taxes: +0.0 coins a minute',
  ]);
  let upgrade = model.actions.find((a) => a.id === 'upgrade');
  assert.equal(upgrade.label, 'Upgrade to Worker house');
  assert.equal(upgrade.detail, '20 coins, 5 planks. Holds 8.');
  assert.equal(upgrade.enabled, false);
  assert.equal(upgrade.reason, 'The house must be full before it can be upgraded.');

  fillHouse(game, house);
  game.state.goods.bread = 0;
  upgrade = panelModel(game, house).actions.find((a) => a.id === 'upgrade');
  assert.deepEqual([upgrade.enabled, upgrade.reason], [false, 'No bread in stock.']);

  game.state.goods.bread = 10;
  game.state.goods.planks = 2;
  upgrade = panelModel(game, house).actions.find((a) => a.id === 'upgrade');
  assert.deepEqual([upgrade.enabled, upgrade.reason], [false, 'Need 3 more planks.']);

  game.state.goods.planks = 50;
  upgrade = panelModel(game, house).actions.find((a) => a.id === 'upgrade');
  assert.deepEqual([upgrade.enabled, upgrade.reason], [true, null]);

  execute(game, { action: 'upgrade', id: house.id });
  run(game, 1);
  model = panelModel(game, house);
  assert.equal(model.title, 'Worker house');
  assert.ok(model.lines.some((l) => l.label === 'Bread' && l.value === 'Supplied'));
  // A Worker house offers the next step, to Artisans.
  upgrade = model.actions.find((a) => a.id === 'upgrade');
  assert.equal(upgrade.label, 'Upgrade to Artisan house');
  assert.equal(upgrade.detail, '30 coins, 8 planks. Holds 12.');
  assert.deepEqual([upgrade.enabled, upgrade.reason], [false, 'The house must be full before it can be upgraded.']);
  fillHouse(game, house);
  game.state.goods.cloth = 0;
  upgrade = panelModel(game, house).actions.find((a) => a.id === 'upgrade');
  assert.deepEqual([upgrade.enabled, upgrade.reason], [false, 'No cloth in stock.']);
  game.state.goods.cloth = 10;
  execute(game, { action: 'upgrade', id: house.id });
  run(game, 1);
  model = panelModel(game, house);
  assert.equal(model.title, 'Artisan house');
  assert.ok(model.lines.some((l) => l.label === 'Cloth' && l.value === 'Supplied'));
  assert.equal(model.actions.some((a) => a.id === 'upgrade'), false, 'no further upgrade');
});

test('the info panel for the last warehouse refuses demolish and says why', () => {
  const game = richGame();
  const model = panelModel(game, game.state.buildings[0]);
  assert.equal(model.title, 'Warehouse');
  const demolish = model.actions.find((a) => a.id === 'demolish');
  assert.deepEqual([demolish.enabled, demolish.reason], [false, 'You cannot demolish your last warehouse.']);
  assert.ok(model.lines.some((l) => l.label === 'Island total' && l.value === '100 of each good'));
});

test('building the panel never changes the game', () => {
  const game = richGame();
  buildMarket(game);
  const house = fillHouse(game, place(game, 'house', 16, 11));
  const before = snapshot(game);
  for (const b of game.state.buildings) panelModel(game, b);
  previewBuild(game, 'house', 18, 11);
  previewRoad(game, line(12, 9, 16, 9));
  previewDemolish(game, 16, 11, house);
  assert.equal(snapshot(game), before);
});

// ---- added in the Phase 5 review ------------------------------------------------

test('a building tied to a kind of ground names it, so that ground can be lit up', () => {
  const game = richGame();
  assert.equal(requiredTerrain(game.rules, 'farm'), 'fertile');
  assert.equal(requiredTerrain(game.rules, 'fisherman'), 'coast');
  assert.equal(requiredTerrain(game.rules, 'house'), null);
  assert.equal(requiredTerrain(game.rules, 'lumberjack'), null, 'its forest is shown as a reach circle instead');

  const fertile = terrainTiles(game, 'fertile');
  assert.equal(fertile.length, 16, 'the test island has a 4 by 4 fertile patch');
  for (const [x, y] of fertile) assert.equal(game.state.map.terrain[y * game.state.map.width + x], 'fertile');
  assert.deepEqual(terrainTiles(game, 'forest').length, 16);
});

test('the upgrade tool preview agrees with what the click then does', () => {
  const game = richGame();
  buildMarket(game);
  const house = place(game, 'house', 16, 11);

  assert.deepEqual([previewUpgrade(game, null).kind, previewUpgrade(game, null).reason], ['none', 'not_a_house']);
  assert.equal(previewUpgrade(game, game.state.buildings[0]).kind, 'none', 'a warehouse is not a house');

  let preview = previewUpgrade(game, house);
  assert.deepEqual([preview.kind, preview.ok, preview.reason, preview.to], ['house', false, 'house_not_full', 'worker']);
  assert.equal(execute(game, { action: 'upgrade', id: house.id }).reason, preview.reason);

  fillHouse(game, house);
  preview = previewUpgrade(game, house);
  assert.deepEqual([preview.ok, preview.reason], [true, null]);
  assert.deepEqual(preview.cost, game.rules.tiers.farmer.upgrade.cost);
  assert.equal(execute(game, { action: 'upgrade', id: house.id }).ok, true);

  // Now a Worker house: the next step is to Artisans, at its own cost.
  preview = previewUpgrade(game, house);
  assert.deepEqual([preview.ok, preview.reason, preview.to], [false, 'house_not_full', 'artisan']);
  assert.deepEqual(preview.cost, game.rules.tiers.worker.upgrade.cost);
  fillHouse(game, house);
  assert.equal(previewUpgrade(game, house).ok, true);
  assert.equal(execute(game, { action: 'upgrade', id: house.id }).ok, true);

  preview = previewUpgrade(game, house);
  assert.deepEqual([preview.ok, preview.reason, preview.cost], [false, 'max_tier', null]);
});

// ---- added in Phase 6 --------------------------------------------------------------

test('a road line can have its corner flipped to the other side', () => {
  assert.deepEqual(roadLine(0, 0, 3, 1), [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]]);
  assert.deepEqual(roadLine(0, 0, 3, 1, true), [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1]]);
  // Same ends and same length either way, and a straight line has no corner to flip.
  for (const [ax, ay, bx, by] of [[2, 2, 7, 5], [7, 5, 2, 2], [4, 9, 1, 3]]) {
    const plain = roadLine(ax, ay, bx, by);
    const flipped = roadLine(ax, ay, bx, by, true);
    assert.equal(flipped.length, plain.length);
    assert.deepEqual(flipped[0], plain[0]);
    assert.deepEqual(flipped[flipped.length - 1], plain[plain.length - 1]);
    assert.notDeepEqual(flipped, plain);
  }
  assert.deepEqual(roadLine(2, 2, 6, 2, true), roadLine(2, 2, 6, 2));
});

test('a market panel counts the houses in its own range, not every house on the island', () => {
  const game = richGame({ change: (d) => { d.buildings.market.market.radius = 8; } });
  const market = buildMarket(game);            // centre (14,12)
  place(game, 'house', 16, 11);                // near
  place(game, 'house', 16, 13);                // near
  place(game, 'house', 2, 2);                  // far outside
  assert.equal(housesInRangeOf(game, market), 2);
  assert.equal(housesInRangeOf(game, game.state.buildings[0]), 0, 'a warehouse reaches no houses');
  const line = panelModel(game, market).lines.find((l) => l.label === 'Houses in range');
  assert.equal(line.value, '2');
});

test('the Demolish button changes its words while it waits for a second press', () => {
  const game = richGame();
  const house = place(game, 'house', 16, 11);
  const label = (options) => panelModel(game, house, options).actions.find((a) => a.id === 'demolish').label;
  assert.equal(label(), 'Demolish');
  assert.equal(label({ confirmDemolish: true }), 'Press again to demolish');
});

// The tip line. Patience is 30 game seconds by default.
const tipAfter = (game, advisor, seconds) => {
  let tip = null;
  for (let i = 0; i < seconds * game.rules.ticksPerSecond; i++) {
    run(game, 1);
    tip = advisor.update(game);
  }
  return tip;
};

test('tips: a new game with stock on hand has nothing to say', () => {
  const game = testGame();
  const advisor = createAdvisor(game.rules);
  assert.equal(tipAfter(game, advisor, 120), null);
});

test('tips: hungry houses and no fisherman', () => {
  const game = richGame();
  buildMarket(game);
  place(game, 'house', 16, 11);
  game.state.goods.fish = 0;
  const advisor = createAdvisor(game.rules);
  assert.equal(tipAfter(game, advisor, 20), null, 'it waits before speaking');
  assert.equal(tipAfter(game, advisor, 15), 'Nobody is making fish. Build a fisherman.');
});

test('tips: a fisherman with no road is the thing to fix', () => {
  const game = richGame();
  buildMarket(game);
  place(game, 'house', 16, 11);
  place(game, 'fisherman', 2, 9);
  game.state.goods.fish = 0;
  const advisor = createAdvisor(game.rules);
  assert.equal(tipAfter(game, advisor, 40), 'Your fisherman is not connected to a warehouse by road.');
});

test('tips: too many mouths for one fisherman', () => {
  const game = richGame();
  buildMarket(game);
  place(game, 'fisherman', 2, 9);
  road(game, line(9, 9, 3, 9));
  for (const [x, y] of [[16, 11], [16, 13], [18, 11], [18, 13], [13, 13], [20, 11], [20, 13]]) place(game, 'house', x, y);
  game.state.goods.fish = 0;
  const advisor = createAdvisor(game.rules);
  assert.equal(tipAfter(game, advisor, 600), 'Fish keeps running out. Build another fisherman.');
});

test('tips: a shortage is traced back to where it starts', () => {
  // Planks are out because the sawmill has no wood, and nobody is cutting wood.
  const game = richGame();
  place(game, 'sawmill', 13, 11);
  road(game, [[12, 10], [12, 11]]);
  game.state.goods.wood = 0;
  game.state.goods.planks = 0;
  const advisor = createAdvisor(game.rules);
  assert.equal(tipAfter(game, advisor, 40), 'Nobody is making wood. Build a lumberjack.');

  // Bread is out because the bakery has no grain.
  const town = richGame();
  buildMarket(town);
  const house = fillHouse(town, place(town, 'house', 16, 11));
  execute(town, { action: 'upgrade', id: house.id });
  place(town, 'bakery', 13, 13);
  road(town, [[12, 12], [12, 13]]);
  town.state.goods.bread = 0;
  town.state.goods.grain = 0;
  const townAdvisor = createAdvisor(town.rules);
  assert.equal(tipAfter(town, townAdvisor, 200), 'Nobody is making grain. Build a farm.');
});

test('tips: the tip goes away when the shortage ends', () => {
  const game = richGame();
  buildMarket(game);
  place(game, 'house', 16, 11);
  game.state.goods.fish = 0;
  const advisor = createAdvisor(game.rules);
  assert.ok(tipAfter(game, advisor, 40));
  game.state.goods.fish = 50;
  assert.equal(tipAfter(game, advisor, 2), null);
});

test('tips never change the game', () => {
  const game = richGame();
  buildMarket(game);
  place(game, 'house', 16, 11);
  game.state.goods.fish = 0;
  const advisor = createAdvisor(game.rules, { patienceSeconds: 0 });
  const before = snapshot(game);
  assert.ok(advisor.update(game));
  assert.equal(snapshot(game), before);
});

// ---- a road that follows the pointer (Phase 35) -----------------------------------

// Drags along a list of tiles, as the pointer would cross them.
const dragAlong = (tiles) => tiles.slice(1).reduce((path, [x, y]) => extendRoadPath(path, { x, y }), [tiles[0]]);
const joined = (path) => path.every(([x, y], i) => i === 0 || Math.abs(x - path[i - 1][0]) + Math.abs(y - path[i - 1][1]) === 1);

test('a dragged road follows the pointer, bend after bend', () => {
  // An S: right, down, right, down.
  const way = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [3, 2], [4, 2], [4, 3]];
  assert.deepEqual(dragAlong(way), way);
  // Staying on a tile adds nothing.
  assert.deepEqual(dragAlong([[0, 0], [0, 0], [1, 0], [1, 0]]), [[0, 0], [1, 0]]);
});

test('a quick move that skips tiles is joined with one bend, never corner to corner', () => {
  const path = dragAlong([[0, 0], [1, 1], [4, 1], [4, 5]]);
  assert.ok(joined(path), `a gap or a diagonal step in ${JSON.stringify(path)}`);
  assert.deepEqual(path[0], [0, 0]);
  assert.deepEqual(path[path.length - 1], [4, 5]);
  assert.equal(new Set(path.map(String)).size, path.length, 'a tile laid twice');
});

test('going back over the road takes it back, so a wobble can be undone', () => {
  assert.deepEqual(dragAlong([[0, 0], [1, 0], [2, 0], [3, 0], [2, 0]]), [[0, 0], [1, 0], [2, 0]]);
  assert.deepEqual(dragAlong([[0, 0], [1, 0], [2, 0], [0, 0]]), [[0, 0]]);
  // Back, then on in a new direction.
  assert.deepEqual(dragAlong([[0, 0], [1, 0], [2, 0], [1, 0], [1, 1]]), [[0, 0], [1, 0], [1, 1]]);
  // The path it is given is not changed.
  const before = [[0, 0], [1, 0]];
  extendRoadPath(before, { x: 0, y: 0 });
  assert.deepEqual(before, [[0, 0], [1, 0]]);
});
