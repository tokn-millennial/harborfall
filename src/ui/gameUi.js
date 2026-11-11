// The UI controller. It owns the active tool and the selection, turns clicks
// into commands for the simulation, and tells the renderer what to highlight.
// It never changes the game state itself: every change goes through execute().

import { buildingById, execute, getSummary } from '../sim/index.js';
import { centerOnTile, clampToMap, screenToTile } from '../render/camera.js';
import { HEIGHT_UNIT } from '../render/iso.js';
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

const TINT = {
  ok: 'rgba(70, 215, 115, 0.5)',
  bad: 'rgba(235, 70, 70, 0.55)',
  range: 'rgba(120, 195, 255, 0.24)',
  terrain: 'rgba(255, 244, 140, 0.42)',
  roadNew: 'rgba(250, 232, 170, 0.85)',
  roadExisting: 'rgba(255, 255, 255, 0.3)',
  roadShort: 'rgba(245, 165, 36, 0.6)',
};
const GHOST_BAD_COLOR = '#d9534f';
const GHOST_OUTLINE = { ok: '#5df08a', bad: '#ff5a5a' };
const SELECT = { mode: 'select', building: null };
const MESSAGE_SECONDS = 3;

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
      if (id === 'demolish' && act({ action: 'demolish', x: building.x, y: building.y })) deselect();
    },
  });
  const win = createWinScreen(elements.win, { onContinue: () => speed.setSpeed(rules.speeds[0] ?? 1) });

  // ---- helpers --------------------------------------------------------------
  // Clears the selection and closes its panel at once, not a frame later.
  function deselect() {
    selectedId = null;
    info.hide();
  }

  function setTool(next) {
    tool = sameTool(next, tool) && next.mode !== 'select' ? SELECT : next;
    roadDrag = null;
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

  function ghostFor(buildingId, preview) {
    const def = rules.buildings[buildingId];
    const visual = (def.housingTier ? rules.tiers[def.housingTier].visual : null) ?? def.visual ?? { color: '#999999', height: 0.8 };
    return {
      x: preview.x, y: preview.y, w: def.w, h: def.h,
      color: preview.ok ? visual.color : GHOST_BAD_COLOR,
      risePx: visual.height * HEIGHT_UNIT,
      label: def.name.slice(0, 2),
      outline: preview.ok ? GHOST_OUTLINE.ok : GHOST_OUTLINE.bad,
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
        const tiles = roadLine(roadDrag.start.x, roadDrag.start.y, roadDrag.end.x, roadDrag.end.y);
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
        act({ action: 'demolish', x: target.x, y: target.y });
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
    if (event.key === 'Escape') {
      if (tool.mode !== 'select') setTool(SELECT);
      else deselect();
    }
  });
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
      const tiles = roadDrag ? roadLine(roadDrag.start.x, roadDrag.start.y, roadDrag.end.x, roadDrag.end.y) : [[here.x, here.y]];
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
        tip = target.ok
          ? { text: `Demolish ${name}. ${refundText(rules, target.building)}.`, level: 'warn' }
          : { text: reasonText(game, target.reason), level: 'bad' };
      } else if (target.kind === 'road') {
        tip = { text: 'Demolish road.', level: 'warn' };
      }
    }

    renderer.draw(game, camera, overlay);

    // Panels.
    const summary = getSummary(game);
    hud.update(summary);
    menu.update(tool);
    if (selected && tool.mode === 'select') info.show(panelModel(game, selected));
    else info.hide();

    if (tip) {
      setText(elements.tip, tip.text);
      elements.tip.className = `tip ${tip.level}`;
      elements.tip.style.transform = `translate(${Math.min(pointer.x + 18, view.width - 330)}px, ${pointer.y + 22}px)`;
      elements.tip.hidden = false;
    } else {
      elements.tip.hidden = true;
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
