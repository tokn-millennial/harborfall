// The UI controller. It owns the active tool and the selection, turns clicks
// into commands for the simulation, and tells the renderer what to highlight.
// It never changes the game state itself: every change goes through execute().

import { islandAt, paysFrom } from '../sim/index.js';
import { worldToTile } from '../render/iso.js';
import { buildingById, execute, getSummary } from '../sim/index.js';
import { centerOnTile, clampToMap, screenToTile } from '../render/camera.js';
import { pick } from '../render/pick.js';
import { createCameraControls } from './cameraControls.js';
import { createHud } from './hud.js';
import { createBuildMenu, sameTool } from './buildMenu.js';
import { createInfoPanel } from './infoPanel.js';
import { createSpeedControls } from './speedControls.js';
import { createWinScreen } from './winScreen.js';
import { panelModel } from './panelModel.js';
import { anchorFor, extendRoadPath, previewBuild, previewDemolish, previewRoad, previewUpgrade, rangeTiles, requiredTerrain, roadLine, terrainTiles, cartReachMap, haulIfPlaced } from './tools.js';
import { clock, costText, milestoneMessage, reasonText, refundText, winMessage, tradeCallText, haulText } from './text.js';
import { setText } from './dom.js';
import { createAdvisor } from './advice.js';

const TINT = {
  ok: 'rgba(70, 215, 115, 0.5)',
  bad: 'rgba(235, 70, 70, 0.55)',
  range: 'rgba(120, 195, 255, 0.24)',
  terrain: 'rgba(255, 244, 140, 0.42)',
  roadNew: 'rgba(250, 232, 170, 0.85)',
  roadExisting: 'rgba(255, 255, 255, 0.3)',
  roadShort: 'rgba(245, 165, 36, 0.6)',
  reached: 'rgba(80, 205, 120, 0.42)',   // a road a cart comes along
  unreached: 'rgba(235, 80, 60, 0.5)',   // a road too far for carts, or joined to no warehouse
};
const SELECT = { mode: 'select', building: null };
const MESSAGE_SECONDS = 3;
const QUIET_ACTIONS = ['undo', 'close', 'reopen', 'trade', 'ship', 'shipKeep'];
const CONFIRM_SECONDS = 4; // how long a first demolish click waits for the second

// onSound(name) is told when something worth a sound happens: 'pick', 'place',
// 'road', 'demolish', 'upgrade', 'refuse' or 'win'. The UI does not know or
// care whether anything is listening.
export function createGameUi({ game, camera, renderer, loop, canvas, elements, onSound = () => {} }) {
  const { rules, state } = game;
  const map = state.map;
  const view = renderer.view;

  let tool = SELECT;
  let selectedId = null;
  let roadDrag = null;      // { start: {x, y}, end: {x, y}, path: [[x, y], ...] } while a road is being dragged out
  let messageTimer = 0;
  let winShown = state.won; // a game loaded already won (the demo town) does not announce it
  const milestonesShown = state.milestones.map((tick) => tick !== null); // nor goals already reached
  let shipNewsTick = state.trade?.last?.tick ?? null; // a call made before this game was opened is old news
  const terrainCache = {};  // terrain name -> its tiles, for highlighting where a building may go
  let armed = null;         // { id, seconds }: a building clicked once with Demolish, waiting for the second click
  let straightRoad = false; // Shift is held: a dragged road runs straight, with one bend, instead of following the pointer
  // The tiles of the road being dragged: the pointer's way, or with Shift a straight line with one bend.
  const draggedRoad = () => (straightRoad ? roadLine(roadDrag.start.x, roadDrag.start.y, roadDrag.end.x, roadDrag.end.y) : roadDrag.path);
  const advisor = createAdvisor(rules);

  // ---- panels ---------------------------------------------------------------
  const hud = createHud(elements.hud, rules);
  const speed = createSpeedControls(elements.speed, loop, rules.speeds);
  const menu = createBuildMenu(elements.menu, elements.hint, game, {
    onPick: setTool,
    onUndo: () => {
      if (act({ action: 'undo' }) && selectedId !== null && !buildingById(game, selectedId)) deselect();
    },
  });
  const info = createInfoPanel(elements.info, {
    onClose: () => deselect(),
    onAction: (id) => {
      const building = buildingById(game, selectedId);
      if (!building) return;
      if (id === 'upgrade') act({ action: 'upgrade', id: building.id }, { cost: rules.tiers[building.house.tier].upgrade?.cost });
      if (id === 'demolish' && demolishBuilding(building)) deselect();
      if (id.startsWith('trade:')) {
        const [, good, mode, level] = id.split(':');
        act({ action: 'trade', good, mode, level: Number(level) });
      }
      if (id.startsWith('ship:')) {
        const [, good, way] = id.split(':');
        act({ action: 'ship', good, way });
      }
      if (id.startsWith('keep:')) {
        const [, good, keep] = id.split(':');
        act({ action: 'shipKeep', good, keep: Number(keep) });
      }
      if (id === 'closeBuilding') act({ action: 'close', id: building.id });
      if (id === 'reopenBuilding') act({ action: 'reopen', id: building.id });
    },
  });
  const win = createWinScreen(elements.win, { onContinue: () => speed.setSpeed(rules.speeds[0] ?? 1) });

  // ---- helpers --------------------------------------------------------------
  // Clears the selection and closes its panel at once, not a frame later.
  function deselect() {
    selectedId = null;
    armed = null;
    info.hide();
  }

  // Demolishing a building takes two clicks on it, so one misclick cannot destroy
  // it. The first click arms it, the second does it. Returns true once it is gone.
  function demolishBuilding(building) {
    if (armed?.id === building.id) {
      armed = null;
      return act({ action: 'demolish', x: building.x, y: building.y });
    }
    const check = previewDemolish(game, building.x, building.y, building);
    if (!check.ok) {
      say(reasonText(game, check.reason));
      return false;
    }
    armed = { id: building.id, seconds: CONFIRM_SECONDS };
    onSound('pick');
    return false;
  }

  function setTool(next) {
    tool = sameTool(next, tool) && next.mode !== 'select' ? SELECT : next;
    roadDrag = null;
    armed = null;
    if (tool.mode !== 'select') deselect();
    canvas.style.cursor = tool.mode === 'select' ? '' : 'crosshair';
    onSound('pick');
  }

  function say(text, level = 'bad') {
    elements.message.textContent = text;
    elements.message.className = `message ${level}`;
    elements.message.hidden = false;
    messageTimer = MESSAGE_SECONDS;
    if (level === 'bad') onSound('refuse');
  }

  // Sends a command. On failure, tells the player why. Returns whether it worked.
  function act(command, context = {}) {
    const result = execute(game, command);
    // Undo, closing and reopening share the plain click. The rest have a sound of their own.
    if (result.ok) onSound(QUIET_ACTIONS.includes(command.action) ? 'pick' : command.action);
    else say(reasonText(game, result.reason, context));
    return result.ok;
  }

  const groundTile = (sx, sy) => {
    const g = screenToTile(camera, view, sx, sy);
    return { x: Math.floor(g.x), y: Math.floor(g.y), fx: g.x, fy: g.y };
  };

  // Is there a road on any tile touching this footprint?
  function touchesRoad(x, y, w, h) {
    const has = (tx, ty) => tx >= 0 && ty >= 0 && tx < map.width && ty < map.height && state.roads[ty * map.width + tx] === 1;
    for (let dx = 0; dx < w; dx++) if (has(x + dx, y - 1) || has(x + dx, y + h)) return true;
    for (let dy = 0; dy < h; dy++) if (has(x - 1, y + dy) || has(x + w, y + dy)) return true;
    return false;
  }

  // A stand-in building for the renderer to draw where the pointer is.
  function ghostFor(buildingId, preview) {
    const def = rules.buildings[buildingId];
    return {
      building: { type: buildingId, x: preview.x, y: preview.y, house: def.housingTier ? { tier: def.housingTier, residents: 0 } : undefined },
      ok: preview.ok,
    };
  }

  // ---- pointer --------------------------------------------------------------
  const controls = createCameraControls({
    canvas, camera, view,
    // The road tool uses a left drag to lay road. Everything else drags the view.
    shouldPan: (button) => !(button === 0 && tool.mode === 'road'),
    onHome: () => {
      centerOnTile(camera, map.start.x + 1, map.start.y + 1);
      camera.zoom = 1;
    },
    onDown: (x, y, button) => {
      if (button === 0 && tool.mode === 'road') {
        const t = groundTile(x, y);
        roadDrag = { start: t, end: t, path: [[t.x, t.y]] };
      }
    },
    onMove: (x, y) => {
      if (roadDrag) {
        roadDrag.end = groundTile(x, y);
        roadDrag.path = extendRoadPath(roadDrag.path, roadDrag.end);
      }
    },
    onUp: (x, y, button, moved) => {
      if (roadDrag) {
        const tiles = draggedRoad();
        roadDrag = null;
        if (button !== 0) return;
        const result = execute(game, { action: 'road', tiles });
        if (result.ok || result.placed > 0) onSound('road');
        if (!result.ok) {
          const why = reasonText(game, result.reason, { cost: rules.buildings.road.cost });
          say(result.placed > 0 ? `Built ${result.placed} of ${result.placed + result.failed} road tiles. ${why}` : why, result.placed > 0 ? 'warn' : 'bad');
        }
        return;
      }
      if (moved) return; // it was a drag of the view, not a click
      if (button === 2) {
        if (tool.mode !== 'select') setTool(SELECT);
        else deselect();
        return;
      }
      if (button !== 0) return;

      const t = groundTile(x, y);
      if (tool.mode === 'build') {
        const def = rules.buildings[tool.building];
        const at = anchorFor(def, t.fx, t.fy);
        act({ action: 'place', building: tool.building, x: at.x, y: at.y }, { building: tool.building, cost: def.cost });
      } else if (tool.mode === 'demolish') {
        const target = previewDemolish(game, t.x, t.y, pick(game, camera, view, x, y).building);
        if (target.kind === 'building') demolishBuilding(target.building);
        else act({ action: 'demolish', x: target.x, y: target.y });
      } else if (tool.mode === 'upgrade') {
        const target = previewUpgrade(game, pick(game, camera, view, x, y).building);
        if (target.kind === 'house') act({ action: 'upgrade', id: target.building.id }, { cost: target.cost });
        else say(reasonText(game, target.reason));
      } else {
        selectedId = pick(game, camera, view, x, y).building?.id ?? null;
        if (selectedId === null) info.hide();
      }
    },
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') straightRoad = true;
    if (event.key === 'Escape') {
      if (tool.mode !== 'select') setTool(SELECT);
      else deselect();
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') straightRoad = false;
  });
  window.addEventListener('blur', () => { straightRoad = false; });
  // Keep keyboard focus off the buttons, so Space always means pause.
  document.addEventListener('click', (event) => event.target.closest?.('button')?.blur());

  // The island at the middle of the screen. Open water counts as home.
  function islandInView() {
    const t = worldToTile(camera.x, camera.y);
    return islandAt(map, Math.floor(t.x), Math.floor(t.y));
  }

  // ---- one frame --------------------------------------------------------------
  function frame(dt) {
    controls.update(dt);
    clampToMap(camera, map);
    loop.advance(dt);

    const pointer = controls.pointer;
    const active = pointer.inside && !controls.panning;
    // While placing things, buildings are drawn see-through so the ground,
    // the roads and any small building behind a tall one stay visible.
    const placing = tool.mode === 'build' || tool.mode === 'road';
    const overlay = { tints: [], fadeBuildings: placing, grid: placing };
    let tip = null; // { text, level } shown next to the pointer

    // With carts: while placing a producer, a warehouse or road, every road is
    // tinted by whether a cart can come that far along it.
    const showReach = rules.carts && (tool.mode === 'road' || (tool.mode === 'build' && (rules.buildings[tool.building].production || rules.buildings[tool.building].category === 'storage')));
    if (showReach) {
      for (const t of cartReachMap(game).tiles) overlay.tints.push({ x: t.x, y: t.y, color: t.reached ? TINT.reached : TINT.unreached });
    }

    // A building tied to a kind of ground lights that ground up for as long as
    // its tool is picked, so it is plain where it can go.
    if (tool.mode === 'build') {
      const terrain = requiredTerrain(rules, tool.building);
      if (terrain) {
        // A building for one island only (the vineyard) lights that island's ground.
        const only = rules.buildings[tool.building].placement?.island === 'second' ? 1 : null;
        const key = only === null ? terrain : `${terrain}|${only}`;
        terrainCache[key] ??= terrainTiles(game, terrain).filter(([x, y]) => only === null || islandAt(map, x, y) === only);
        for (const [x, y] of terrainCache[key]) overlay.tints.push({ x, y, color: TINT.terrain });
      }
    }

    const selected = selectedId === null ? null : buildingById(game, selectedId);
    if (selectedId !== null && !selected) deselect(); // it was demolished

    if (tool.mode === 'select') {
      if (active) {
        const hit = pick(game, camera, view, pointer.x, pointer.y);
        overlay.hoverBuilding = hit.building;
        overlay.hoverTile = hit.onMap ? hit.tile : null;
      }
      if (selected) {
        overlay.selectedBuilding = selected;
        for (const [x, y] of rangeTiles(game, selected.type, selected.x, selected.y)) overlay.tints.push({ x, y, color: TINT.range });
      }
    } else if (tool.mode === 'build' && active) {
      const def = rules.buildings[tool.building];
      const t = groundTile(pointer.x, pointer.y);
      const at = anchorFor(def, t.fx, t.fy);
      const preview = previewBuild(game, tool.building, at.x, at.y);
      for (const [x, y] of rangeTiles(game, tool.building, at.x, at.y)) overlay.tints.push({ x, y, color: TINT.range });
      overlay.tints.push({ x: at.x, y: at.y, w: def.w, h: def.h, color: preview.ok ? TINT.ok : TINT.bad });
      overlay.ghost = ghostFor(tool.building, preview);
      if (!preview.ok) {
        tip = { text: reasonText(game, preview.reason, { building: tool.building, cost: def.cost, from: paysFrom(game, islandAt(map, at.x, at.y)) }), level: 'bad' };
      } else if (preview.hints.includes('no_market')) {
        tip = { text: 'No market in range here. Nobody will move in until there is one.', level: 'warn' };
      } else if (def.requiresRoad && !touchesRoad(at.x, at.y, def.w, def.h)) {
        tip = { text: `${def.name}: remember to join it to a warehouse by road.`, level: 'warn' };
      } else {
        // A producer beside a road: how far its goods go by cart.
        const haul = def.production ? haulText(rules, haulIfPlaced(game, tool.building, at.x, at.y)) : null;
        const far = haul !== null && haul.startsWith('Too far');
        tip = { text: `${def.name}: ${costText(rules, def.cost)}${haul ? `. ${haul}` : ''}`, level: far ? 'warn' : 'ok' };
      }
    } else if (tool.mode === 'road' && active) {
      const here = groundTile(pointer.x, pointer.y);
      const tiles = roadDrag ? draggedRoad() : [[here.x, here.y]];
      const preview = previewRoad(game, tiles);
      for (const t of preview.tiles) {
        const color = t.state === 'new' ? TINT.roadNew : t.state === 'existing' ? TINT.roadExisting : t.state === 'unaffordable' ? TINT.roadShort : TINT.bad;
        overlay.tints.push({ x: t.x, y: t.y, color });
      }
      if (preview.reason && preview.newCount === 0) tip = { text: reasonText(game, preview.reason, { cost: rules.buildings.road.cost }), level: 'bad' };
      else if (preview.reason) tip = { text: `Road: ${preview.newCount} tiles for ${preview.costCoins} coins. Some tiles cannot be built.`, level: 'warn' };
      else if (preview.newCount > 0) tip = { text: `Road: ${preview.newCount} ${preview.newCount === 1 ? 'tile' : 'tiles'} for ${preview.costCoins} ${preview.costCoins === 1 ? 'coin' : 'coins'}`, level: 'ok' };
      else tip = { text: 'There is already a road here.', level: 'ok' };
    } else if (tool.mode === 'upgrade' && active) {
      const target = previewUpgrade(game, pick(game, camera, view, pointer.x, pointer.y).building);
      if (target.kind === 'house') {
        overlay.hoverBuilding = target.building;
        overlay.tints.push({ x: target.x, y: target.y, w: target.w, h: target.h, color: target.ok ? TINT.ok : TINT.bad });
        tip = target.ok
          ? { text: `Upgrade to ${rules.tiers[target.to].name} house: ${costText(rules, target.cost)}`, level: 'ok' }
          : { text: reasonText(game, target.reason, { cost: target.cost }), level: 'bad' };
      } else {
        tip = { text: 'Point at a house to upgrade it.', level: 'warn' };
      }
    } else if (tool.mode === 'demolish' && active) {
      const here = groundTile(pointer.x, pointer.y);
      const target = previewDemolish(game, here.x, here.y, pick(game, camera, view, pointer.x, pointer.y).building);
      if (target.kind !== 'none') overlay.tints.push({ x: target.x, y: target.y, w: target.w, h: target.h, color: TINT.bad });
      if (target.kind === 'building') {
        overlay.hoverBuilding = target.building;
        const name = target.building.house ? `${rules.tiers[target.building.house.tier].name} house` : rules.buildings[target.building.type].name;
        if (!target.ok) tip = { text: reasonText(game, target.reason), level: 'bad' };
        else if (armed?.id === target.building.id) tip = { text: `Click again to demolish the ${name}.`, level: 'bad' };
        else tip = { text: `Demolish ${name}. ${refundText(rules, target.building)}. Takes two clicks.`, level: 'warn' };
      } else if (target.kind === 'road') {
        tip = { text: 'Demolish road.', level: 'warn' };
      }
    }

    renderer.draw(game, camera, overlay);

    // Panels.
    const summary = getSummary(game);
    // Tips are for a game with a goal still ahead: the win, or a goal after it.
    const goalAhead = !state.won || summary.milestones.some((m) => m.reachedAtTick === null);
    hud.update(summary, goalAhead ? advisor.update(game) : null, islandInView());
    menu.update(tool);
    if (selected && tool.mode === 'select') info.show(panelModel(game, selected, { confirmDemolish: armed?.id === selected.id }));
    else info.hide();

    if (tip) {
      setText(elements.tip, tip.text);
      elements.tip.className = `tip ${tip.level}`;
      elements.tip.style.transform = `translate(${Math.min(pointer.x + 18, view.width - 330)}px, ${pointer.y + 22}px)`;
      elements.tip.hidden = false;
    } else {
      elements.tip.hidden = true;
    }

    if (armed) {
      armed.seconds -= dt;
      if (armed.seconds <= 0) armed = null;
    }

    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) elements.message.hidden = true;
    }

    // The trade ship has called: say what it did, in green.
    if (state.trade?.last && state.trade.last.tick !== shipNewsTick) {
      shipNewsTick = state.trade.last.tick;
      const news = tradeCallText(rules, state.trade.last);
      if (news) say(news, 'ok');
    }

    if (state.won && !winShown) {
      winShown = true;
      onSound('win');
      speed.setSpeed(0);
      setTool(SELECT);
      win.show(winMessage(rules, summary, state.buildings.length));
    }
    // A goal after the win, once the win screen is out of the way.
    const reached = state.milestones.findIndex((tick, i) => tick !== null && !milestonesShown[i]);
    if (reached !== -1 && !win.visible) {
      milestonesShown[reached] = true;
      onSound('win');
      speed.setSpeed(0);
      setTool(SELECT);
      win.show(milestoneMessage(rules, summary, reached, state.buildings.length));
    }
  }

  return { frame, setTool, get tool() { return tool; }, get selectedId() { return selectedId; } };
}
