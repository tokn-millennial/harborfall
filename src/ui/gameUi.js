// The UI controller. It owns the active tool and the selection, turns clicks
// into commands for the simulation, and tells the renderer what to highlight.
// It never changes the game state itself: every change goes through execute().

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
import { anchorFor, previewBuild, previewDemolish, previewRoad, previewUpgrade, rangeTiles, requiredTerrain, roadLine, terrainTiles } from './tools.js';
import { clock, costText, reasonText, refundText } from './text.js';
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
};
const SELECT = { mode: 'select', building: null };
const MESSAGE_SECONDS = 3;
const CONFIRM_SECONDS = 4; // how long a first demolish click waits for the second

export function createGameUi({ game, camera, renderer, loop, canvas, elements }) {
  const { rules, state } = game;
  const map = state.map;
  const view = renderer.view;

  let tool = SELECT;
  let selectedId = null;
  let roadDrag = null;      // { start: {x, y}, end: {x, y} } while a road is being dragged out
  let messageTimer = 0;
  let winShown = state.won; // a game loaded already won (the demo town) does not announce it
  const terrainCache = {};  // terrain name -> its tiles, for highlighting where a building may go
  let armed = null;         // { id, seconds }: a building clicked once with Demolish, waiting for the second click
  let flipCorner = false;   // Shift is held: put a dragged road's corner on the other side
  const advisor = createAdvisor(rules);

  // ---- panels ---------------------------------------------------------------
  const hud = createHud(elements.hud, rules);
  const speed = createSpeedControls(elements.speed, loop, rules.speeds);
  const menu = createBuildMenu(elements.menu, elements.hint, game, { onPick: setTool });
  const info = createInfoPanel(elements.info, {
    onClose: () => deselect(),
    onAction: (id) => {
      const building = buildingById(game, selectedId);
      if (!building) return;
      if (id === 'upgrade') act({ action: 'upgrade', id: building.id }, { cost: rules.tiers[building.house.tier].upgrade?.cost });
      if (id === 'demolish' && demolishBuilding(building)) deselect();
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
    return false;
  }

  function setTool(next) {
    tool = sameTool(next, tool) && next.mode !== 'select' ? SELECT : next;
    roadDrag = null;
    armed = null;
    if (tool.mode !== 'select') deselect();
    canvas.style.cursor = tool.mode === 'select' ? '' : 'crosshair';
  }

  function say(text, level = 'bad') {
    elements.message.textContent = text;
    elements.message.className = `message ${level}`;
    elements.message.hidden = false;
    messageTimer = MESSAGE_SECONDS;
  }

  // Sends a command. On failure, tells the player why. Returns whether it worked.
  function act(command, context = {}) {
    const result = execute(game, command);
    if (!result.ok) say(reasonText(game, result.reason, context));
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
        roadDrag = { start: t, end: t };
      }
    },
    onMove: (x, y) => {
      if (roadDrag) roadDrag.end = groundTile(x, y);
    },
    onUp: (x, y, button, moved) => {
      if (roadDrag) {
        const tiles = roadLine(roadDrag.start.x, roadDrag.start.y, roadDrag.end.x, roadDrag.end.y, flipCorner);
        roadDrag = null;
        if (button !== 0) return;
        const result = execute(game, { action: 'road', tiles });
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
    if (event.key === 'Shift') flipCorner = true;
    if (event.key === 'Escape') {
      if (tool.mode !== 'select') setTool(SELECT);
      else deselect();
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') flipCorner = false;
  });
  window.addEventListener('blur', () => { flipCorner = false; });
  // Keep keyboard focus off the buttons, so Space always means pause.
  document.addEventListener('click', (event) => event.target.closest?.('button')?.blur());

  // ---- one frame --------------------------------------------------------------
  function frame(dt) {
    controls.update(dt);
    clampToMap(camera, map);
    loop.advance(dt);

    const pointer = controls.pointer;
    const active = pointer.inside && !controls.panning;
    // While placing things, buildings are drawn see-through so the ground,
    // the roads and any small building behind a tall one stay visible.
    const overlay = { tints: [], fadeBuildings: tool.mode === 'build' || tool.mode === 'road' };
    let tip = null; // { text, level } shown next to the pointer

    // A building tied to a kind of ground lights that ground up for as long as
    // its tool is picked, so it is plain where it can go.
    if (tool.mode === 'build') {
      const terrain = requiredTerrain(rules, tool.building);
      if (terrain) {
        for (const [x, y] of (terrainCache[terrain] ??= terrainTiles(game, terrain))) overlay.tints.push({ x, y, color: TINT.terrain });
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
        tip = { text: reasonText(game, preview.reason, { building: tool.building, cost: def.cost }), level: 'bad' };
      } else if (preview.hints.includes('no_market')) {
        tip = { text: 'No market in range here. Nobody will move in until there is one.', level: 'warn' };
      } else if (def.requiresRoad && !touchesRoad(at.x, at.y, def.w, def.h)) {
        tip = { text: `${def.name}: remember to join it to a warehouse by road.`, level: 'warn' };
      } else {
        tip = { text: `${def.name}: ${costText(rules, def.cost)}`, level: 'ok' };
      }
    } else if (tool.mode === 'road' && active) {
      const here = groundTile(pointer.x, pointer.y);
      const tiles = roadDrag ? roadLine(roadDrag.start.x, roadDrag.start.y, roadDrag.end.x, roadDrag.end.y, flipCorner) : [[here.x, here.y]];
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
    hud.update(summary, state.won ? null : advisor.update(game));
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

    if (state.won && !winShown) {
      winShown = true;
      speed.setSpeed(0);
      setTool(SELECT);
      win.show({
        target: rules.win.residents,
        tierName: rules.tiers[rules.win.tier].name,
        time: clock(summary.win.wonAtSeconds),
        coins: summary.coins,
        buildings: state.buildings.length,
      });
    }
  }

  return { frame, setTool, get tool() { return tool; }, get selectedId() { return selectedId; } };
}
