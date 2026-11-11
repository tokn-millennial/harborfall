// A scripted mini-city on the test island, played from the real starting
// resources. It runs the whole chain: wood, planks, fish, grain, bread, and one
// house upgraded to Workers. Used by the integration and repeatability tests.
import assert from 'node:assert/strict';
import { execute, canPlace, canUpgrade, step } from '../src/sim/index.js';
import { line } from './helpers.js';

// `observe` is called after every tick, so a test can watch the game as it runs.
export function playMiniCity(game, observe = () => {}) {
  const act = (command) => {
    const result = execute(game, command);
    assert.equal(result.ok, true, `${JSON.stringify(command)} failed: ${result.reason}`);
    return result;
  };
  const build = (building, x, y) => {
    const { id } = act({ action: 'place', building, x, y });
    return game.state.buildings.find((b) => b.id === id);
  };
  const roads = (tiles) => act({ action: 'road', tiles });
  const wait = (label, done, maxSeconds = 900) => {
    const limit = maxSeconds * game.rules.ticksPerSecond;
    for (let i = 0; i < limit; i++) {
      if (done()) return;
      step(game);
      observe(game);
    }
    assert.fail(`gave up waiting for: ${label} (after ${maxSeconds} game seconds)`);
  };
  const buildWhenAffordable = (building, x, y) => {
    wait(`enough to build a ${building}`, () => canPlace(game, building, x, y).ok);
    return build(building, x, y);
  };

  // Wood: two lumberjacks, because one sawmill uses more wood than one lumberjack cuts.
  build('lumberjack', 8, 4);
  roads([...line(10, 8, 10, 4), [9, 4]]);
  build('lumberjack', 8, 5);
  roads([[9, 5]]);

  // Fish, a market, a sawmill and four houses.
  build('fisherman', 2, 9);
  roads(line(9, 9, 3, 9));
  build('market', 13, 11);
  roads([[12, 10], [12, 11]]);
  build('sawmill', 13, 13);
  roads([[12, 12], [12, 13]]);
  const houses = [[16, 11], [16, 13], [18, 11], [18, 13]].map(([x, y]) => buildWhenAffordable('house', x, y));

  // Grain and bread: a road past the fertile land, two farms and a bakery.
  roads([[12, 9], [12, 8], ...line(12, 7, 18, 7)]);
  buildWhenAffordable('farm', 14, 5);
  buildWhenAffordable('farm', 16, 5);
  buildWhenAffordable('bakery', 18, 8);

  // Upgrade the first house as soon as the game allows it, then let it fill.
  const first = houses[0];
  wait('the first house to be ready to upgrade', () => canUpgrade(game, first.id).ok);
  act({ action: 'upgrade', id: first.id });
  wait('the Worker house to fill', () => first.house.residents === game.rules.tiers.worker.capacity);

  return { houses, workerHouse: first };
}
