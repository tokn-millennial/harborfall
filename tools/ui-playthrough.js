// Plays a whole game through the real UI, in the browser.
//
// The headless bot sends commands straight to the simulation. This does the
// same build order, but every action goes the way a player's would: it clicks
// the build menu, moves the pointer over the map, clicks or drags on the
// canvas, selects houses and presses the Upgrade button. If the UI drops,
// misplaces or mangles any action, this finds out.
//
// Only the passing of time is not done through the UI: the game is stepped
// directly, so a 28-minute game takes a second or two.
//
// Run it from the browser's console on the test page, http://localhost:5173/?fresh
// which opens a new game with no title screen and never touches the saved game:
//   const { playThroughUi } = await import('/tools/ui-playthrough.js');
//   await playThroughUi(window.harborfall);

import { createPlanner } from './bot/planner.js';
import { expandOrder } from './bot/bot.js';
import { buildingAt, canUpgrade, getSummary, step } from '../src/sim/index.js';
import { centerOnTile, worldToScreen } from '../src/render/camera.js';
import { tileToWorld } from '../src/render/iso.js';
import { buildingVisual } from '../src/render/visuals.js';

// Options: maxMinutes (give up after this much game time), zoom (the zoom
// level to click at, to check that picking is exact when zoomed far in or out).
export async function playThroughUi({ game, camera, renderer, ui }, orderName = 'standard', { maxMinutes = 60, zoom = 1 } = {}) {
  const { rules, state } = game;
  const order = await fetch(new URL(`./bot/orders/${orderName}.json`, import.meta.url)).then((r) => r.json());
  const steps = expandOrder(order);
  const planner = createPlanner(game);
  const canvas = document.getElementById('game');
  const maxTicks = maxMinutes * rules.ticksPerMinute;
  const counts = { menuClicks: 0, mapClicks: 0, roadDrags: 0, upgradeClicks: 0, tradeClicks: 0, marketsAdded: 0 };
  const roadPrice = rules.buildings.road.cost.coinsMilli;

  // ---- acting like a player --------------------------------------------------
  const fire = (type, x, y) => {
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent(type, {
      clientX: rect.left + x, clientY: rect.top + y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      pointerId: 1, pointerType: 'mouse', bubbles: true, cancelable: true,
    }));
  };
  const screenOf = (tx, ty, lift = 0) => {
    const world = tileToWorld(tx, ty);
    return worldToScreen(camera, renderer.view, world.x, world.y - lift);
  };
  const lookAt = (tx, ty) => {
    camera.zoom = zoom;
    centerOnTile(camera, tx, ty);
  };
  const clickMap = (x, y) => {
    fire('pointermove', x, y);
    fire('pointerdown', x, y);
    fire('pointerup', x, y);
    counts.mapClicks++;
  };
  const dragMap = (x0, y0, x1, y1) => {
    fire('pointermove', x0, y0);
    fire('pointerdown', x0, y0);
    fire('pointermove', (x0 + x1) / 2, (y0 + y1) / 2);
    fire('pointermove', x1, y1);
    fire('pointerup', x1, y1);
    counts.roadDrags++;
  };
  const pickTool = (name) => {
    const current = ui.tool;
    const wanted = name === 'Select' ? 'select' : null;
    const active = wanted ? current.mode === 'select' : current.building && rules.buildings[current.building].name === name;
    if (active) return;
    const button = [...document.querySelectorAll('#menu .tool')].find((b) => b.querySelector('.tool-name').textContent === name);
    if (!button) throw new Error(`No "${name}" button in the build menu`);
    button.click();
    counts.menuClicks++;
  };
  const wait = (ready, label) => {
    while (!ready()) {
      if (state.tick >= maxTicks) throw new Error(`Ran out of time waiting for: ${label}`);
      if (state.won) return false;
      for (let i = 0; i < rules.ticksPerSecond; i++) step(game);
    }
    return true;
  };

  // ---- the actions -----------------------------------------------------------
  function build(building) {
    const def = rules.buildings[building];
    let plan = planner.plan(building);
    if (plan.reason === 'no_site_in_market_range') {
      counts.marketsAdded++;
      build(Object.values(rules.buildings).find((b) => b.marketRadius > 0).id);
      plan = planner.plan(building);
    }
    if (plan.reason) throw new Error(`No site for ${building}: ${plan.reason}`);
    const affordable = () =>
      state.coinsMilli >= def.cost.coinsMilli + plan.roads.length * roadPrice &&
      Object.entries(def.cost.goods).every(([good, n]) => state.goods[good] >= n);
    if (!wait(affordable, `enough to build a ${building}`)) return;

    // Click the menu button, then click the map with the pointer on the middle of the site.
    pickTool(def.name);
    lookAt(plan.x + def.w / 2, plan.y + def.h / 2);
    const at = screenOf(plan.x + def.w / 2, plan.y + def.h / 2);
    clickMap(at.x, at.y);
    const placed = buildingAt(game, plan.x, plan.y);
    if (!placed || placed.type !== building || placed.x !== plan.x || placed.y !== plan.y) {
      throw new Error(`Clicking to place a ${building} at ${plan.x},${plan.y} did not place it there`);
    }

    // Roads: drag each straight stretch of the planned route.
    if (plan.roads.length > 0) {
      pickTool(rules.buildings.road.name);
      for (const run of straightRuns(plan.roads)) {
        const [ax, ay] = run[0];
        const [bx, by] = run[run.length - 1];
        lookAt((ax + bx) / 2 + 0.5, (ay + by) / 2 + 0.5);
        const from = screenOf(ax + 0.5, ay + 0.5);
        const to = screenOf(bx + 0.5, by + 0.5);
        if (run.length === 1) clickMap(from.x, from.y);
        else dragMap(from.x, from.y, to.x, to.y);
      }
      for (const [x, y] of plan.roads) {
        if (!state.roads[y * state.map.width + x]) throw new Error(`Dragging a road did not lay the tile at ${x},${y}`);
      }
    }
    ui.frame(0);
  }

  // `to` names the kind of house wanted ("artisan"), for an order that says which upgrade it means.
  function upgrade(to = null) {
    let house = null;
    const find = () => (house = state.buildings.find((b) => b.house && rules.tiers[b.house.tier].upgrade && (!to || rules.tiers[b.house.tier].upgrade.to === to) && canUpgrade(game, b.id).ok));
    if (!wait(find, 'a house that can be upgraded')) return;
    const def = rules.buildings[house.type];
    const before = house.house.tier;

    // Select the house by clicking its roof, then press the button in the info panel.
    pickTool('Select');
    lookAt(house.x + def.w / 2, house.y + def.h / 2);
    const roof = screenOf(house.x + def.w / 2, house.y + def.h / 2, buildingVisual(rules, house).risePx);
    clickMap(roof.x, roof.y);
    ui.frame(0);
    if (ui.selectedId !== house.id) throw new Error(`Clicking the roof at ${house.x},${house.y} selected building ${ui.selectedId}, not the house`);
    const button = document.querySelector('#info button[data-action="upgrade"]');
    if (!button || button.disabled) throw new Error('The Upgrade button is missing or disabled for a house that can be upgraded');
    button.click();
    counts.upgradeClicks++;
    if (house.house.tier === before) throw new Error('Pressing Upgrade did not upgrade the house');
    ui.frame(0);
  }

  // A trade order, given the way a player would: select the harbour, then
  // click its order button round to the right mode and its + and − to the level.
  function tradeOrder({ good, mode, level }) {
    let harbor = null;
    if (!wait(() => (harbor = state.buildings.find((b) => rules.buildings[b.type].harbor)), 'a harbour')) return;
    const def = rules.buildings[harbor.type];
    pickTool('Select');
    lookAt(harbor.x + def.w / 2, harbor.y + def.h / 2);
    const roof = screenOf(harbor.x + def.w / 2, harbor.y + def.h / 2, buildingVisual(rules, harbor).risePx);
    clickMap(roof.x, roof.y);
    ui.frame(0);
    if (ui.selectedId !== harbor.id) throw new Error(`Clicking the harbour at ${harbor.x},${harbor.y} selected building ${ui.selectedId}`);
    const order = () => state.trade.orders[good] ?? null;
    const press = (find, what) => {
      const button = [...document.querySelectorAll('#info button[data-action^="trade:"]')].find(find);
      if (!button || button.disabled) throw new Error(`The ${what} button for ${good} is missing or disabled`);
      button.click();
      counts.tradeClicks++;
      ui.frame(0);
    };
    for (let i = 0; i < 3 && (order()?.mode ?? 'off') !== mode; i++) press((b) => b.classList.contains('trade-order') && b.dataset.action.startsWith(`trade:${good}:`), 'order');
    if ((order()?.mode ?? 'off') !== mode) throw new Error(`Clicking the order button never set ${good} to ${mode}`);
    for (let i = 0; i < 200 && mode !== 'off' && order().level !== level; i++) {
      const higher = order().level < level;
      press((b) => b.classList.contains('trade-step') && b.title === (higher ? 'Higher' : 'Lower') && b.dataset.action.startsWith(`trade:${good}:`), higher ? '+' : '−');
    }
    if (mode !== 'off' && order().level !== level) throw new Error(`The + and − buttons never set ${good} to ${level}`);
  }

  // The headless bot only acts on whole seconds. Line up with it, so the two
  // runs can be compared tick for tick.
  while (state.tick % rules.ticksPerSecond !== 0) step(game);

  for (const s of steps) {
    if (state.won) break;
    if (s.kind === 'build') build(s.building);
    else if (s.kind === 'trade') tradeOrder(s);
    else upgrade(s.to ?? null);
  }
  wait(() => state.won, 'the win');
  ui.frame(0);

  const summary = getSummary(game);
  return {
    won: state.won,
    wonAtMinutes: state.won ? +(summary.win.wonAtSeconds / 60).toFixed(2) : null,
    buildings: state.buildings.length,
    winScreenShown: !document.getElementById('win').hidden,
    ...counts,
    stateFingerprint: fingerprint(JSON.stringify(state)),
  };
}

// Splits an ordered route of tiles into stretches that run in one direction.
function straightRuns(tiles) {
  const runs = [];
  let run = [tiles[0]];
  for (let i = 1; i < tiles.length; i++) {
    const [px, py] = tiles[i - 1];
    const [x, y] = tiles[i];
    const adjacent = Math.abs(x - px) + Math.abs(y - py) === 1;
    const [sx, sy] = run[0];
    const straight = adjacent && (run.length === 1 || (x === sx && px === sx) || (y === sy && py === sy));
    if (straight) run.push(tiles[i]);
    else {
      runs.push(run);
      run = [tiles[i]];
    }
  }
  runs.push(run);
  return runs;
}

// A short number that changes if anything in the text changes.
export function fingerprint(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
