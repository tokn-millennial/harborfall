// Draws the island on a canvas. It reads the game state and never changes it.
//
// Drawing order each frame:
//   1. open water, with drifting glints
//   2. the island: ground, shoreline and forest
//   3. roads, then ground markers (previews, ranges, the hovered tile)
//   4. shadows, then buildings from far to near
//   5. on top: the building being placed, outlines, marks
//
// Almost everything is prepared once and reused, so a frame is cheap:
//   - The ground and forest never change, so they are painted once into one
//     large picture. Filling their thousands of shapes on every frame was
//     measured at many times the cost of showing a picture.
//   - Each look of each building is drawn once into a small picture.
//   - Road shapes are rebuilt only when something is built or removed.
//
// The art itself lives in src/render/art/. This file decides what to draw,
// where and in what order.

import { TILE_H, boxSilhouette, depthOf, footprintCorners, mapBounds, tileToWorld } from './iso.js';
import { visibleTileRange } from './camera.js';
import { buildingVisual } from './visuals.js';
import { createKit } from './art/kit.js';
import { BUILDING_ART, LIVE_ART, artIdFor, artStateKey } from './art/buildings.js';
import { paintBox } from './art/box.js';
import { createSpriteCache, sharpnessFor } from './art/sprites.js';
import { paintActors } from './art/actors.js';
import { paintDust } from './art/dust.js';
import { createBuildEffects, popScale } from './effects.js';
import { nightAmount } from './daylight.js';
import { createLife } from './life.js';
import { createForestPainter, createRoadPainter, createTerrainPainter, paintGrid, paintTrees, paintWater, waterBackground } from './art/terrain.js';
import { buildingIssue, canUpgrade } from '../sim/index.js';

const LABEL_MIN_ZOOM = 0.55;
const MARKER_MIN_ZOOM = 0.45;
const MARK = {
  bad: { color: '#e5484d', text: '!' },     // stops the building working: no road, no market, out of a cart's reach
  warn: { color: '#f5a524', text: '!' },    // a wait: missing input, full storage, a shortage
  ready: { color: '#2fb463', text: '▲' },   // a house that can be upgraded now
  closed: { color: '#6f7d88', text: null },  // a producer the player has closed: two bars, like a pause sign
};
const markLevel = (issue) => (issue === 'no_road' || issue === 'no_market' || issue === 'too_far' ? 'bad' : 'warn');
const GHOST_OUTLINE = { ok: '#5df08a', bad: '#ff5a5a' };

// The ground picture is painted this many times finer than one world pixel,
// following the screen's own sharpness, within limits. Finer looks crisper
// when zoomed in and costs memory: at 1.5 the picture is about 80 MB.
const PICTURE_MIN_DETAIL = 1;
const PICTURE_MAX_DETAIL = 1.5;
// A second, small copy of the picture is used when zoomed far out, where the
// large one would be shown at a third of its size and look grainy.
const SMALL_PICTURE_DETAIL = 0.5;
const SMALL_PICTURE_BELOW_SCALE = 0.62;
// Zoomed far in, the ground picture is stretched and looks soft. Once the
// view has been still for a moment, the part of the ground on screen is drawn
// afresh at exactly the size shown, and that sharp copy is used until the
// view moves again. While it moves, the stretched picture is used, so nothing
// slows down.
const CLOSE_UP_FROM = 1.35;         // how far the picture must be stretched before this is worth doing
const CLOSE_UP_SETTLE_SECONDS = 0.2;
const CACHE_PAD = 48; // room around the map for tree tops and the shoreline
const HOUSE_LOOKS = 3;
const LIVE_MIN_ZOOM = 0.5;       // smoke and sawdust are too small to see below this
// Night: a blue tint over the picture, and a warm light at each lived-in house.
const NIGHT_TINT = [18, 28, 72];
const NIGHT_TINT_STRENGTH = 0.36;
const GLOW_SIZE = 96;
const TREE_REACH = 2; // trees this close to a building are drawn in order with it
const ACTOR_MIN_ZOOM = 0.5; // walkers, carts and boats are too small to see below this

export function createRenderer(canvas, rules) {
  const ctx = canvas.getContext('2d');
  const view = { width: 1, height: 1 };
  let pixelRatio = 1;
  let groundPicture = null; // the ground and forest, painted once
  let smallPicture = null;  // the same, smaller, for when zoomed far out
  let pictureMap = null;    // the island those pictures show
  let closeUp = null;       // { canvas, key, map }: the sharp copy of what is on screen
  let viewKey = null;       // where the view was last frame
  let viewStillSince = 0;
  let closeUpShown = false;
  const sprites = createSpriteCache();
  const life = createLife(rules); // walkers, carts and boats: decoration that follows the game
  const buildEffects = createBuildEffects(rules); // dust when something is built or removed
  let dayAndNight = true;
  let nightNow = 0;
  let glow = null; // a soft round light, drawn once and reused for every house

  const terrainColor = {};
  for (const [id, t] of Object.entries(rules.map.terrain)) terrainColor[id] = t.color;
  const roads = createRoadPainter(rules.buildings.road.visual?.color ?? '#c9b78f');
  // The water's color wash is the canvas's own background. The canvas is cleared each frame, so it shows through.
  canvas.style.background = waterBackground(terrainColor.water);

  function resize() {
    pixelRatio = window.devicePixelRatio || 1;
    view.width = Math.max(1, canvas.clientWidth);
    view.height = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(view.width * pixelRatio);
    canvas.height = Math.round(view.height * pixelRatio);
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

  // Paints the whole island's ground and forest once, at a given fineness.
  function buildGroundPicture(map, detail) {
    const bounds = mapBounds(map);
    const width = bounds.right - bounds.left + CACHE_PAD * 2;
    const height = bounds.bottom - bounds.top + CACHE_PAD * 2;
    const picture = document.createElement('canvas');
    picture.width = Math.ceil(width * detail);
    picture.height = Math.ceil(height * detail);
    const g = picture.getContext('2d');
    g.setTransform(detail, 0, 0, detail, (CACHE_PAD - bounds.left) * detail, (CACHE_PAD - bounds.top) * detail);
    createTerrainPainter(map, terrainColor).paint(g, detail);
    createForestPainter(map).paint(g);
    return { picture, x: bounds.left - CACHE_PAD, y: bounds.top - CACHE_PAD, width, height };
  }

  // Draws the ground and forest that are on screen, sharp, into a hidden canvas
  // the size of the screen. Only the tiles in view are worked out.
  function buildCloseUp(map, range, key, scale, camera) {
    const picture = closeUp?.canvas ?? document.createElement('canvas');
    if (picture.width !== canvas.width || picture.height !== canvas.height) {
      picture.width = canvas.width;
      picture.height = canvas.height;
    }
    const g = picture.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, picture.width, picture.height);
    g.setTransform(scale, 0, 0, scale, pixelRatio * (view.width / 2 - camera.x * camera.zoom), pixelRatio * (view.height / 2 - camera.y * camera.zoom));
    createTerrainPainter(map, terrainColor, range).paint(g, scale);
    createForestPainter(map, range).paint(g);
    return { canvas: picture, key, map };
  }

  function glowPicture() {
    if (glow) return glow;
    glow = document.createElement('canvas');
    glow.width = glow.height = GLOW_SIZE;
    const g = glow.getContext('2d');
    const light = g.createRadialGradient(GLOW_SIZE / 2, GLOW_SIZE / 2, 2, GLOW_SIZE / 2, GLOW_SIZE / 2, GLOW_SIZE / 2);
    light.addColorStop(0, 'rgba(255, 214, 130, 0.6)');
    light.addColorStop(0.5, 'rgba(255, 190, 100, 0.22)');
    light.addColorStop(1, 'rgba(255, 180, 90, 0)');
    g.fillStyle = light;
    g.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    return glow;
  }

  // One building: its drawn art from a ready-made picture, or a plain box if it has none.
  // `pop` is the age of its "just built" effect, if it has one: it is drawn a
  // little small at first and settles to full size.
  function drawBuilding(building, zoom, time, sharpness, alpha = 1, pop = null) {
    const def = rules.buildings[building.type];
    const visual = buildingVisual(rules, building);
    const artId = artIdFor(rules, building);
    const size = pop === null ? 1 : popScale(pop);
    if (size !== 1) {
      const foot = tileToWorld(building.x + def.w / 2, building.y + def.h / 2);
      ctx.save();
      ctx.translate(foot.x, foot.y);
      ctx.scale(size, size);
      ctx.translate(-foot.x, -foot.y);
    }
    ctx.globalAlpha = alpha;
    if (artId) {
      const p = building.production;
      const info = {
        h: visual.risePx,
        color: visual.color,
        working: p ? p.active && p.status === 'working' : false,
        progress: p ? p.progress / def.production.cycleTicks : 0,
        residents: building.house?.residents ?? 0,
        // Which of its three looks a house has. It follows the building's
        // number, so a house looks the same every time the game is opened.
        variant: Number.isInteger(building.id) ? building.id % HOUSE_LOOKS : 0,
        seed: Number.isInteger(building.id) ? building.id : 0,
        time,
      };
      const key = `${artId}|${visual.color}|${visual.risePx}|${artStateKey(artId, info)}`;
      const picture = sprites.get(key, def.w, def.h, visual.risePx, sharpness, (g) => BUILDING_ART[artId](g, info));
      const origin = tileToWorld(building.x, building.y);
      ctx.drawImage(picture.canvas, origin.x + picture.left, origin.y + picture.top, picture.width, picture.height);
      if (zoom >= LIVE_MIN_ZOOM) LIVE_ART[artId]?.(createKit(ctx, building.x, building.y), info);
    } else {
      paintBox(ctx, building.x, building.y, def, visual, 1 / zoom, zoom >= LABEL_MIN_ZOOM);
    }
    ctx.globalAlpha = 1;
    if (size !== 1) ctx.restore();
  }

  // A small plate above a house showing how many people live there.
  function residentsPlate(building) {
    const def = rules.buildings[building.type];
    const visual = buildingVisual(rules, building);
    const centre = tileToWorld(building.x + def.w / 2, building.y + def.h / 2);
    const text = String(building.house.residents);
    // Small and see-through, so a street of houses is not a street of labels.
    const y = centre.y - visual.topPx - 6;
    const w = 7 + text.length * 4.4;
    ctx.fillStyle = 'rgba(22, 40, 50, 0.55)';
    ctx.beginPath();
    ctx.roundRect(centre.x - w / 2, y - 5, w, 10, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(246, 238, 214, 0.95)';
    ctx.font = '700 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, centre.x, y + 0.5);
  }

  // The few trees standing close to a building. They are drawn again in order
  // with the buildings, so a tree in front of a house covers it and a tree
  // behind is covered. Every other tree is already in the forest layer.
  function treesNear(map, buildings) {
    const seen = new Set();
    const list = [];
    for (const { building } of buildings) {
      const def = rules.buildings[building.type];
      for (let y = building.y - TREE_REACH; y < building.y + def.h + TREE_REACH; y++) {
        for (let x = building.x - TREE_REACH; x < building.x + def.w + TREE_REACH; x++) {
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
          const i = y * map.width + x;
          if (map.terrain[i] !== 'forest' || seen.has(i)) continue;
          seen.add(i);
          list.push({ x, y, depth: depthOf(x, y) });
        }
      }
    }
    list.sort((a, b) => a.depth - b.depth || a.x - b.x);
    return list;
  }

  // overlay (all optional):
  //   hoverTile          { x, y } to outline
  //   hoverBuilding      building to outline in white
  //   selectedBuilding   building to outline in yellow
  //   tints              [{ x, y, w, h, color }] ground tiles to tint
  //   ghost              { building, ok } a building not yet placed: a stand-in
  //                      with type, x, y (and house for a house), and whether the spot is good
  //   fadeBuildings      draw buildings see-through, so the ground behind them shows
  //   grid               draw the tile grid (while placing something)
  function draw(game, camera, overlay = {}) {
    const state = game.state;
    const map = state.map;
    const zoom = camera.zoom;
    const time = performance.now() / 1000;

    // 1. Open water, in screen pixels.
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    paintWater(ctx, view, camera, time);

    // From here on, draw in world pixels and let the canvas apply pan and zoom.
    const scale = pixelRatio * zoom;
    const sharpness = sharpnessFor(scale);
    ctx.setTransform(scale, 0, 0, scale, pixelRatio * (view.width / 2 - camera.x * zoom), pixelRatio * (view.height / 2 - camera.y * zoom));
    // Pictures are shown with the browser's cheapest smoothing. The next level
    // up was measured at over twenty times the cost whenever a building's
    // picture is shown smaller than it was drawn, which is most zoom levels.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    const range = visibleTileRange(camera, view, map);

    // 2. The island: a ready-made picture, the small copy when zoomed far out.
    // A different island (a new game on another one) throws the old pictures away.
    if (map !== pictureMap) {
      for (const old of [groundPicture, smallPicture]) {
        if (old) old.picture.width = old.picture.height = 0; // hands the memory back at once
      }
      groundPicture = smallPicture = null;
      pictureMap = map;
    }
    const fullDetail = Math.min(PICTURE_MAX_DETAIL, Math.max(PICTURE_MIN_DETAIL, pixelRatio));
    const key = `${camera.x}|${camera.y}|${zoom}|${canvas.width}|${canvas.height}`;
    if (key !== viewKey) {
      viewKey = key;
      viewStillSince = time;
    }
    closeUpShown = scale > fullDetail * CLOSE_UP_FROM && time - viewStillSince >= CLOSE_UP_SETTLE_SECONDS;
    if (closeUpShown) {
      if (!closeUp || closeUp.key !== key || closeUp.map !== map) closeUp = buildCloseUp(map, range, key, scale, camera);
      // The copy is exactly the size of the screen, so it goes on pixel for pixel.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(closeUp.canvas, 0, 0);
      ctx.restore();
    } else {
      let ground;
      if (scale < SMALL_PICTURE_BELOW_SCALE) {
        ground = smallPicture ??= buildGroundPicture(map, SMALL_PICTURE_DETAIL);
      } else {
        ground = groundPicture ??= buildGroundPicture(map, fullDetail);
      }
      ctx.drawImage(ground.picture, ground.x, ground.y, ground.width, ground.height);
    }

    // 3. Roads, then ground markers.
    roads.paint(ctx, state);
    if (overlay.grid) paintGrid(ctx, map, range, zoom);

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

    // 4. Buildings, far to near, each with a soft shadow on the ground first.
    const buildings = [];
    for (const b of state.buildings) {
      const def = rules.buildings[b.type];
      if (b.x + def.w - 1 < range.x0 - 1 || b.x > range.x1 + 1 || b.y + def.h - 1 < range.y0 - 1 || b.y > range.y1 + 1) continue;
      buildings.push({ building: b, depth: depthOf(b.x, b.y, def.w, def.h) });
    }
    buildings.sort((a, b) => a.depth - b.depth || a.building.x - b.building.x);

    // The sun is to the upper left, so a shadow falls toward the lower right,
    // longer for a taller building, with a soft edge around a darker middle.
    const shadows = new Path2D();
    const shadowCores = new Path2D();
    for (const { building } of buildings) {
      const def = rules.buildings[building.type];
      const reach = buildingVisual(rules, building).risePx * 0.02;
      diamond(shadows, building.x + 0.02, building.y + 0.06, def.w - 0.02 + reach, def.h - 0.04);
      diamond(shadowCores, building.x + 0.08, building.y + 0.12, def.w - 0.12 + reach * 0.7, def.h - 0.18);
    }
    ctx.fillStyle = 'rgba(20, 35, 25, 0.13)';
    ctx.fill(shadows);
    ctx.fillStyle = 'rgba(20, 35, 25, 0.14)';
    ctx.fill(shadowCores);

    // Buildings, the trees beside them, and the people, carts and boats, all
    // in one order from far to near. Where two are level, a building goes
    // first, then a tree, then a person. Trees and people that fall between
    // the same two buildings are drawn together.
    const alpha = overlay.fadeBuildings ? 0.5 : 1;
    const effects = buildEffects.update(state, time);
    const popping = new Map();
    for (const e of effects) if (e.kind === 'built') popping.set(e.id, e.age);
    const actors = life.update(game); // always brought up to date, so nothing jumps after zooming out and in
    const things = [];
    for (const b of buildings) things.push({ depth: b.depth, kind: 0, x: b.building.x, building: b.building });
    for (const tree of treesNear(map, buildings)) things.push({ depth: tree.depth, kind: 1, x: tree.x, tree });
    if (zoom >= ACTOR_MIN_ZOOM) {
      for (const a of actors) {
        if (a.x < range.x0 - 1 || a.x > range.x1 + 2 || a.y < range.y0 - 1 || a.y > range.y1 + 2) continue;
        things.push({ depth: a.x + a.y + 1, kind: 2, x: a.x, actor: a });
      }
    }
    things.sort((a, b) => a.depth - b.depth || a.kind - b.kind || a.x - b.x);
    let trees = [];
    let people = [];
    const drawWaiting = () => {
      if (trees.length) paintTrees(ctx, trees);
      if (people.length) paintActors(ctx, people, rules.goods, time);
      trees = [];
      people = [];
    };
    for (const thing of things) {
      if (thing.building) {
        drawWaiting();
        drawBuilding(thing.building, zoom, time, sharpness, alpha, popping.get(thing.building.id) ?? null);
      } else if (thing.tree) {
        if (people.length) drawWaiting();
        trees.push(thing.tree);
      } else {
        if (trees.length) drawWaiting();
        people.push(thing.actor);
      }
    }
    drawWaiting();

    // Dust from anything just built or removed, on top of the buildings.
    if (effects.length) paintDust(ctx, effects);

    // Night: the picture so far goes blue and dim, and lived-in houses show a
    // warm light. Everything drawn after this (numbers, outlines, marks, the
    // building being placed) stays at full brightness, so the game reads the same.
    nightNow = dayAndNight ? nightAmount(state.tick / rules.ticksPerSecond) : 0;
    if (nightNow > 0) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(${NIGHT_TINT.join(', ')}, ${(NIGHT_TINT_STRENGTH * nightNow).toFixed(3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = nightNow;
      const light = glowPicture();
      for (const { building } of buildings) {
        if (!building.house || building.house.residents === 0) continue;
        const def = rules.buildings[building.type];
        const at = tileToWorld(building.x + def.w / 2, building.y + def.h / 2);
        const rise = buildingVisual(rules, building).risePx;
        // Light spilling from the windows and door of the near walls onto the
        // ground in front, not a glow on the roof.
        ctx.drawImage(light, at.x - 34, at.y - rise * 0.12 - 12, 68, 34);
      }
      ctx.restore();
    }

    if (zoom >= LABEL_MIN_ZOOM && !overlay.fadeBuildings) {
      for (const { building } of buildings) if (building.house) residentsPlate(building);
    }

    // 5. On top: the building being placed, see-through, outlined green or red.
    if (overlay.ghost) {
      const g = overlay.ghost;
      const def = rules.buildings[g.building.type];
      drawBuilding(g.building, zoom, time, sharpness, 0.7);
      polygon(boxSilhouette(g.building.x, g.building.y, def.w, def.h, buildingVisual(rules, g.building).topPx));
      if (!g.ok) {
        ctx.fillStyle = 'rgba(230, 60, 60, 0.3)';
        ctx.fill();
      }
      ctx.strokeStyle = g.ok ? GHOST_OUTLINE.ok : GHOST_OUTLINE.bad;
      ctx.lineWidth = 3 / zoom;
      ctx.stroke();
    }

    // Outlines.
    for (const [building, color, width] of [[overlay.selectedBuilding, '#ffe27a', 3], [overlay.hoverBuilding, '#ffffff', 2]]) {
      if (!building) continue;
      const def = rules.buildings[building.type];
      polygon(boxSilhouette(building.x, building.y, def.w, def.h, buildingVisual(rules, building).topPx));
      ctx.strokeStyle = color;
      ctx.lineWidth = width / zoom;
      ctx.stroke();
    }

    // Marks above buildings: red or amber "!" for a problem, green "▲" for a
    // house that can be upgraded. They stay the same size on screen at any zoom.
    if (zoom >= MARKER_MIN_ZOOM) {
      const radius = 9 / zoom;
      ctx.font = `700 ${12 / zoom}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const { building } of buildings) {
        const issue = buildingIssue(game, building);
        let mark = null;
        if (issue) mark = MARK[markLevel(issue)];
        else if (building.house && canUpgrade(game, building.id).ok) mark = MARK.ready;
        else if (building.production?.closed) mark = MARK.closed;
        if (!mark) continue;
        // Above the back corner, clear of the roof and the residents plate.
        const corner = tileToWorld(building.x, building.y);
        const cy = corner.y - buildingVisual(rules, building).risePx - radius * 0.4;
        ctx.beginPath();
        ctx.arc(corner.x, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = mark.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        if (mark.text) {
          ctx.fillText(mark.text, corner.x, cy + 0.5 / zoom);
        } else {
          const bar = radius * 0.3;
          ctx.fillRect(corner.x - bar * 1.5, cy - radius * 0.5, bar, radius);
          ctx.fillRect(corner.x + bar * 0.5, cy - radius * 0.5, bar, radius);
        }
      }
    }
  }

  resize();
  return {
    draw, resize, view, tileHeight: TILE_H, sprites, life,
    // Whether the last frame used the sharp close-up of the ground.
    get closeUpShown() {
      return closeUpShown;
    },
    // Day and night can be switched off. `night` is how dark the last frame was, 0 to 1.
    setDayAndNight(on) {
      dayAndNight = on === true;
    },
    get night() {
      return nightNow;
    },
  };
}
