// Draws the island on a canvas. It reads the game state and never changes it.
//
// Drawing order each frame:
//   1. water (the background)
//   2. ground tiles, then roads
//   3. ground markers: tinted tiles (previews, ranges) and the hovered tile
//   4. things that stand up, far to near: trees and buildings
//   5. on top: the ghost of a building being placed, outlines, warning markers

import { TILE_H, boxSilhouette, depthOf, footprintCorners, tileToWorld } from './iso.js';
import { visibleTileRange } from './camera.js';
import { buildingVisual, shade } from './visuals.js';
import { buildingIssue } from '../sim/index.js';

const TREE_COLOR = '#2c5c36';
const TREE_SHADOW = '#234a2c';
const LABEL_MIN_ZOOM = 0.55;
const GRID_MIN_ZOOM = 0.9;
const MARKER_MIN_ZOOM = 0.45;
const MARKER_COLOR = { bad: '#e5484d', warn: '#f5a524' };
// A problem that stops a building working is red. A shortage is amber.
const markerLevel = (issue) => (issue === 'no_road' || issue === 'no_market' ? 'bad' : 'warn');

export function createRenderer(canvas, rules) {
  const ctx = canvas.getContext('2d');
  const view = { width: 1, height: 1 };
  let pixelRatio = 1;
  let trees = null; // forest tiles, far to near. Forest never changes, so this is built once.

  const terrainColor = {};
  for (const [id, t] of Object.entries(rules.map.terrain)) terrainColor[id] = t.color;
  const roadColor = rules.buildings.road.visual?.color ?? '#b9a98a';

  function resize() {
    pixelRatio = window.devicePixelRatio || 1;
    view.width = Math.max(1, canvas.clientWidth);
    view.height = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(view.width * pixelRatio);
    canvas.height = Math.round(view.height * pixelRatio);
  }

  function buildTrees(map) {
    const list = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.terrain[y * map.width + x] === 'forest') list.push({ x, y, depth: depthOf(x, y) });
      }
    }
    list.sort((a, b) => a.depth - b.depth || a.x - b.x);
    return list;
  }

  function diamond(path, x, y, w = 1, h = 1) {
    const [n, e, s, west] = footprintCorners(x, y, w, h);
    path.moveTo(n.x, n.y);
    path.lineTo(e.x, e.y);
    path.lineTo(s.x, s.y);
    path.lineTo(west.x, west.y);
    path.closePath();
  }

  function polygon(points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
  }

  function addTree(path, shadowPath, x, y) {
    // A small offset per tile so the forest does not look like a grid.
    const jitterX = ((x * 7 + y * 13) % 5) - 2;
    const jitterY = ((x * 11 + y * 5) % 3) - 1;
    const c = tileToWorld(x + 0.5, y + 0.5);
    const cx = c.x + jitterX;
    const cy = c.y + jitterY;
    shadowPath.moveTo(cx, cy - 24);
    shadowPath.lineTo(cx, cy + 3);
    shadowPath.lineTo(cx - 9, cy + 3);
    shadowPath.closePath();
    path.moveTo(cx, cy - 24);
    path.lineTo(cx + 9, cy + 3);
    path.lineTo(cx, cy + 3);
    path.closePath();
  }

  // Draws a box. `building` only needs x, y and what buildingVisual needs.
  function drawBox(building, zoom, visual = buildingVisual(rules, building), size = rules.buildings[building.type]) {
    const def = size;
    const { color, risePx, label } = visual;
    const [n, e, s, west] = footprintCorners(building.x, building.y, def.w, def.h);
    const up = (p) => ({ x: p.x, y: p.y - risePx });
    const hairline = 1 / zoom;

    ctx.lineWidth = hairline;
    ctx.strokeStyle = shade(color, 0.45);

    polygon([west, s, up(s), up(west)]); // the face toward the lower left
    ctx.fillStyle = shade(color, 0.8);
    ctx.fill();
    ctx.stroke();

    polygon([s, e, up(e), up(s)]); // the face toward the lower right
    ctx.fillStyle = shade(color, 0.62);
    ctx.fill();
    ctx.stroke();

    polygon([up(n), up(e), up(s), up(west)]); // the roof
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();

    if (zoom >= LABEL_MIN_ZOOM) {
      const centre = tileToWorld(building.x + def.w / 2, building.y + def.h / 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.font = `600 ${def.w > 1 ? 15 : 10}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, centre.x, centre.y - risePx);
    }
  }

  // overlay (all optional):
  //   hoverTile          { x, y } to outline
  //   hoverBuilding      building to outline in white
  //   selectedBuilding   building to outline in yellow
  //   tints              [{ x, y, w, h, color }] ground tiles to tint
  //   ghost              { x, y, w, h, color, risePx, label, outline } a building not yet placed
  function draw(game, camera, overlay = {}) {
    const state = game.state;
    const map = state.map;
    const zoom = camera.zoom;
    trees ??= buildTrees(map);

    // 1. Water.
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.fillStyle = terrainColor.water;
    ctx.fillRect(0, 0, view.width, view.height);

    // From here on, draw in world pixels and let the canvas apply pan and zoom.
    const scale = pixelRatio * zoom;
    ctx.setTransform(scale, 0, 0, scale, pixelRatio * (view.width / 2 - camera.x * zoom), pixelRatio * (view.height / 2 - camera.y * zoom));
    const range = visibleTileRange(camera, view, map);

    // 2. Ground: one path per terrain type, so there are only a few fills.
    const ground = {};
    const roads = new Path2D();
    let anyRoad = false;
    for (let y = range.y0; y <= range.y1; y++) {
      for (let x = range.x0; x <= range.x1; x++) {
        const i = y * map.width + x;
        const terrain = map.terrain[i];
        if (terrain !== 'water') diamond((ground[terrain] ??= new Path2D()), x, y);
        if (state.roads[i]) {
          diamond(roads, x, y);
          anyRoad = true;
        }
      }
    }
    ctx.lineJoin = 'round';
    for (const [terrain, path] of Object.entries(ground)) {
      ctx.fillStyle = terrainColor[terrain];
      ctx.fill(path);
      // A hairline in the same color closes the tiny gaps between diamonds.
      ctx.strokeStyle = terrainColor[terrain];
      ctx.lineWidth = 1.2 / zoom;
      ctx.stroke(path);
    }
    if (zoom >= GRID_MIN_ZOOM) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.07)';
      ctx.lineWidth = 1 / zoom;
      for (const path of Object.values(ground)) ctx.stroke(path);
    }
    if (anyRoad) {
      ctx.fillStyle = roadColor;
      ctx.fill(roads);
      ctx.strokeStyle = shade(roadColor, 0.8);
      ctx.lineWidth = 1 / zoom;
      ctx.stroke(roads);
    }

    // 3. Ground markers. Tints of the same color are filled together.
    if (overlay.tints?.length) {
      const byColor = {};
      for (const t of overlay.tints) diamond((byColor[t.color] ??= new Path2D()), t.x, t.y, t.w ?? 1, t.h ?? 1);
      for (const [color, path] of Object.entries(byColor)) {
        ctx.fillStyle = color;
        ctx.fill(path);
      }
    }
    if (overlay.hoverTile && !overlay.hoverBuilding) {
      const path = new Path2D();
      diamond(path, overlay.hoverTile.x, overlay.hoverTile.y);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fill(path);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 2 / zoom;
      ctx.stroke(path);
    }

    // 4. Standing things, far to near. Trees between two buildings are drawn as one batch.
    const buildings = [];
    for (const b of state.buildings) {
      const def = rules.buildings[b.type];
      if (b.x + def.w - 1 < range.x0 || b.x > range.x1 || b.y + def.h - 1 < range.y0 || b.y > range.y1) continue;
      buildings.push({ building: b, depth: depthOf(b.x, b.y, def.w, def.h) });
    }
    buildings.sort((a, b) => a.depth - b.depth || a.building.x - b.building.x);

    let treePath = new Path2D();
    let shadowPath = new Path2D();
    let pending = false;
    const flushTrees = () => {
      if (!pending) return;
      ctx.fillStyle = TREE_SHADOW;
      ctx.fill(shadowPath);
      ctx.fillStyle = TREE_COLOR;
      ctx.fill(treePath);
      treePath = new Path2D();
      shadowPath = new Path2D();
      pending = false;
    };
    let next = 0;
    for (const tree of trees) {
      if (tree.x < range.x0 || tree.x > range.x1 || tree.y < range.y0 || tree.y > range.y1) continue;
      while (next < buildings.length && buildings[next].depth <= tree.depth) {
        flushTrees();
        drawBox(buildings[next].building, zoom);
        next++;
      }
      addTree(treePath, shadowPath, tree.x, tree.y);
      pending = true;
    }
    flushTrees();
    for (; next < buildings.length; next++) drawBox(buildings[next].building, zoom);

    // 5. On top: the ghost of a building being placed.
    if (overlay.ghost) {
      const g = overlay.ghost;
      ctx.globalAlpha = 0.6;
      drawBox(g, zoom, { color: g.color, risePx: g.risePx, label: g.label ?? '' }, { w: g.w, h: g.h });
      ctx.globalAlpha = 1;
      // A bold outline says at a glance whether the spot is good: green or red.
      if (g.outline) {
        polygon(boxSilhouette(g.x, g.y, g.w, g.h, g.risePx));
        ctx.strokeStyle = g.outline;
        ctx.lineWidth = 3 / zoom;
        ctx.stroke();
      }
    }

    // Outlines.
    for (const [building, color, width] of [[overlay.selectedBuilding, '#ffe27a', 3], [overlay.hoverBuilding, '#ffffff', 2]]) {
      if (!building) continue;
      const def = rules.buildings[building.type];
      polygon(boxSilhouette(building.x, building.y, def.w, def.h, buildingVisual(rules, building).risePx));
      ctx.strokeStyle = color;
      ctx.lineWidth = width / zoom;
      ctx.stroke();
    }

    // Warning markers: a small "!" above any building with a problem.
    // They stay the same size on screen whatever the zoom.
    if (zoom >= MARKER_MIN_ZOOM) {
      const radius = 9 / zoom;
      ctx.font = `700 ${13 / zoom}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const { building } of buildings) {
        const issue = buildingIssue(game, building);
        if (!issue) continue;
        const def = rules.buildings[building.type];
        // Above the back corner of the roof, clear of the label in the middle.
        const centre = tileToWorld(building.x, building.y);
        const cy = centre.y - buildingVisual(rules, building).risePx - radius * 0.4;
        ctx.beginPath();
        ctx.arc(centre.x, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = MARKER_COLOR[markerLevel(issue)];
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillText('!', centre.x, cy + 0.5 / zoom);
      }
    }
  }

  resize();
  return { draw, resize, view, tileHeight: TILE_H };
}
