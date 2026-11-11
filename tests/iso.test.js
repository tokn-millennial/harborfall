import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE_W, TILE_H, tileToWorld, worldToTile, boxSilhouette, pointInPolygon, depthOf, mapBounds } from '../src/render/iso.js';
import {
  MIN_ZOOM, MAX_ZOOM, createCamera, centerOnTile, worldToScreen, screenToWorld, screenToTile,
  panByScreen, zoomAt, clampToMap, visibleTileRange,
} from '../src/render/camera.js';
import { pick } from '../src/render/pick.js';
import { buildingVisual, shade } from '../src/render/visuals.js';
import { richGame, place } from './helpers.js';

const MAP = { width: 64, height: 64 };
const VIEW = { width: 1280, height: 720 };
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} vs ${b}`);

test('one step in tile x goes right and down, one step in tile y goes left and down', () => {
  const origin = tileToWorld(0, 0);
  const stepX = tileToWorld(1, 0);
  const stepY = tileToWorld(0, 1);
  assert.deepEqual(origin, { x: 0, y: 0 });
  assert.deepEqual(stepX, { x: TILE_W / 2, y: TILE_H / 2 });
  assert.deepEqual(stepY, { x: -TILE_W / 2, y: TILE_H / 2 });
});

test('tile to world and back returns the same tile, for every tile on the map', () => {
  for (let ty = 0; ty < MAP.height; ty++) {
    for (let tx = 0; tx < MAP.width; tx++) {
      const world = tileToWorld(tx + 0.5, ty + 0.5);
      const back = worldToTile(world.x, world.y);
      assert.equal(Math.floor(back.x), tx);
      assert.equal(Math.floor(back.y), ty);
    }
  }
});

test('tile to screen and back returns the same tile at many pans and zooms', () => {
  const cameras = [
    { x: 0, y: 0, zoom: 1 },
    { x: -700, y: 400, zoom: 0.35 },
    { x: 512.5, y: 1033.25, zoom: 1.7 },
    { x: 60, y: 900, zoom: 3 },
  ];
  for (const camera of cameras) {
    for (let ty = 0; ty < MAP.height; ty += 3) {
      for (let tx = 0; tx < MAP.width; tx += 3) {
        const world = tileToWorld(tx + 0.5, ty + 0.5);
        const screen = worldToScreen(camera, VIEW, world.x, world.y);
        const tile = screenToTile(camera, VIEW, screen.x, screen.y);
        assert.equal(Math.floor(tile.x), tx, `x at zoom ${camera.zoom}`);
        assert.equal(Math.floor(tile.y), ty, `y at zoom ${camera.zoom}`);
      }
    }
  }
});

test('the camera starts centred on the start site', () => {
  const camera = createCamera({ width: 64, height: 64, start: { x: 48, y: 40 } });
  const tile = screenToTile(camera, VIEW, VIEW.width / 2, VIEW.height / 2);
  close(tile.x, 49, 'centre tile x');
  close(tile.y, 41, 'centre tile y');
  assert.equal(camera.zoom, 1);
});

test('panning by screen pixels moves the picture by exactly that much', () => {
  const camera = { x: 100, y: 200, zoom: 1.5 };
  const before = worldToScreen(camera, VIEW, 300, 400);
  panByScreen(camera, 40, -25);
  const after = worldToScreen(camera, VIEW, 300, 400);
  close(after.x - before.x, 40, 'dx');
  close(after.y - before.y, -25, 'dy');
});

test('zooming keeps the point under the cursor in place', () => {
  const camera = { x: 100, y: 200, zoom: 1 };
  const cursor = { x: 900, y: 150 };
  const before = screenToWorld(camera, VIEW, cursor.x, cursor.y);
  for (const factor of [1.2, 1.2, 0.5, 1.9, 0.8]) {
    zoomAt(camera, VIEW, cursor.x, cursor.y, factor);
    const now = screenToWorld(camera, VIEW, cursor.x, cursor.y);
    close(now.x, before.x, `x after zoom ${factor}`);
    close(now.y, before.y, `y after zoom ${factor}`);
  }
});

test('zoom stops at its limits', () => {
  const camera = { x: 0, y: 0, zoom: 1 };
  for (let i = 0; i < 50; i++) zoomAt(camera, VIEW, 10, 10, 1.3);
  assert.equal(camera.zoom, MAX_ZOOM);
  for (let i = 0; i < 50; i++) zoomAt(camera, VIEW, 10, 10, 0.7);
  assert.equal(camera.zoom, MIN_ZOOM);
});

test('the camera cannot be dragged away from the island', () => {
  const bounds = mapBounds(MAP);
  const camera = { x: 99999, y: -99999, zoom: 1 };
  clampToMap(camera, MAP);
  assert.equal(camera.x, bounds.right);
  assert.equal(camera.y, bounds.top);
  camera.x = -99999;
  camera.y = 99999;
  clampToMap(camera, MAP);
  assert.equal(camera.x, bounds.left);
  assert.equal(camera.y, bounds.bottom);
});

test('the visible range contains every tile on screen, and is smaller than the map when zoomed in', () => {
  for (const camera of [{ x: 0, y: 1024, zoom: 1 }, { x: -500, y: 600, zoom: 2.2 }, { x: 300, y: 1500, zoom: 0.6 }]) {
    const range = visibleTileRange(camera, VIEW, MAP, 0);
    for (let ty = 0; ty < MAP.height; ty++) {
      for (let tx = 0; tx < MAP.width; tx++) {
        const world = tileToWorld(tx + 0.5, ty + 0.5);
        const s = worldToScreen(camera, VIEW, world.x, world.y);
        const onScreen = s.x >= 0 && s.y >= 0 && s.x <= VIEW.width && s.y <= VIEW.height;
        if (onScreen) {
          assert.ok(tx >= range.x0 && tx <= range.x1 && ty >= range.y0 && ty <= range.y1, `tile ${tx},${ty} at zoom ${camera.zoom}`);
        }
      }
    }
  }
  const zoomedIn = visibleTileRange({ x: 0, y: 1024, zoom: 2.5 }, VIEW, MAP, 0);
  assert.ok((zoomedIn.x1 - zoomedIn.x0 + 1) * (zoomedIn.y1 - zoomedIn.y0 + 1) < MAP.width * MAP.height / 2);
});

test('things nearer the viewer get a larger depth, so they are drawn later', () => {
  assert.ok(depthOf(5, 5) < depthOf(6, 5));
  assert.ok(depthOf(5, 5) < depthOf(5, 6));
  assert.ok(depthOf(5, 5, 2, 2) > depthOf(5, 5, 1, 1));
});

test('point in polygon', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.equal(pointInPolygon(5, 5, square), true);
  assert.equal(pointInPolygon(15, 5, square), false);
  assert.equal(pointInPolygon(5, -1, square), false);
});

test('shade darkens and lightens a color', () => {
  assert.equal(shade('#804020', 0.5), 'rgb(64, 32, 16)');
  assert.equal(shade('#804020', 10), 'rgb(255, 255, 255)');
});

// ---- picking ----------------------------------------------------------------
// On the test island the free warehouse covers tiles x 10..11, y 9..10.

function screenOfTileCentre(camera, tx, ty) {
  const world = tileToWorld(tx + 0.5, ty + 0.5);
  return worldToScreen(camera, VIEW, world.x, world.y);
}

test('picking: open ground gives the tile and no building', () => {
  const game = richGame();
  const camera = createCamera(game.state.map);
  const s = screenOfTileCentre(camera, 16, 13);
  const hit = pick(game, camera, VIEW, s.x, s.y);
  assert.deepEqual(hit.tile, { x: 16, y: 13 });
  assert.equal(hit.onMap, true);
  assert.equal(hit.building, null);
});

test('picking: a point off the island is reported as off the map', () => {
  const game = richGame();
  const camera = createCamera(game.state.map);
  const s = screenOfTileCentre(camera, -3, 5);
  const hit = pick(game, camera, VIEW, s.x, s.y);
  assert.equal(hit.onMap, false);
  assert.equal(hit.building, null);
});

test('picking: the tiles under a building give that building', () => {
  const game = richGame();
  const camera = createCamera(game.state.map);
  const warehouse = game.state.buildings[0];
  // The front-most tile of the footprint is not hidden by the box, so its centre is on the box's front faces.
  const s = screenOfTileCentre(camera, 11, 10);
  assert.equal(pick(game, camera, VIEW, s.x, s.y).building, warehouse);
});

test('picking: pointing at a roof picks the building, even though the ground tile is behind it', () => {
  const game = richGame();
  const camera = createCamera(game.state.map);
  const warehouse = game.state.buildings[0];
  const def = game.rules.buildings.warehouse;
  const rise = buildingVisual(game.rules, warehouse).risePx;
  // The middle of the roof.
  const roof = tileToWorld(warehouse.x + def.w / 2, warehouse.y + def.h / 2);
  const s = worldToScreen(camera, VIEW, roof.x, roof.y - rise);
  const hit = pick(game, camera, VIEW, s.x, s.y);
  assert.equal(hit.building, warehouse);
  assert.notDeepEqual(hit.tile, { x: warehouse.x, y: warehouse.y }, 'the ground tile under the cursor is a different one');
  assert.ok(hit.tile.x < warehouse.x + def.w && hit.tile.y < warehouse.y + def.h);
});

test('picking: when two boxes overlap on screen, the nearer one wins', () => {
  const game = richGame();
  const camera = createCamera(game.state.map);
  const warehouse = game.state.buildings[0];
  const house = place(game, 'house', 11, 11); // in front of the warehouse
  const def = game.rules.buildings.house;
  const outline = boxSilhouette(house.x, house.y, def.w, def.h, buildingVisual(game.rules, house).risePx);
  // Just inside the back corner of the house roof, which is drawn over the warehouse's front.
  const point = { x: outline[1].x, y: outline[1].y + 2 };
  const wDef = game.rules.buildings.warehouse;
  const wOutline = boxSilhouette(warehouse.x, warehouse.y, wDef.w, wDef.h, buildingVisual(game.rules, warehouse).risePx);
  assert.equal(pointInPolygon(point.x, point.y, wOutline), true, 'the test point is inside both boxes');
  const s = worldToScreen(camera, VIEW, point.x, point.y);
  assert.equal(pick(game, camera, VIEW, s.x, s.y).building, house);
});

test('picking works the same at any zoom and pan', () => {
  const game = richGame();
  const warehouse = game.state.buildings[0];
  for (const zoom of [MIN_ZOOM, 0.8, 1.6, MAX_ZOOM]) {
    const camera = createCamera(game.state.map);
    camera.zoom = zoom;
    panByScreen(camera, 137, -61);
    const s = screenOfTileCentre(camera, 11, 10);
    assert.equal(pick(game, camera, VIEW, s.x, s.y).building, warehouse, `zoom ${zoom}`);
    const ground = screenOfTileCentre(camera, 3, 13);
    assert.deepEqual(pick(game, camera, VIEW, ground.x, ground.y).tile, { x: 3, y: 13 }, `zoom ${zoom}`);
  }
});

test('an upgraded house looks different from a Farmer house', () => {
  const game = richGame();
  const house = place(game, 'house', 16, 11);
  const before = buildingVisual(game.rules, house);
  house.house.tier = 'worker';
  const after = buildingVisual(game.rules, house);
  assert.notEqual(before.color, after.color);
  assert.ok(after.risePx > before.risePx);
  house.house.residents = 3;
  assert.equal(buildingVisual(game.rules, house).label, '3', 'a house shows its residents');
  assert.equal(buildingVisual(game.rules, game.state.buildings[0]).label, 'Wa', 'other buildings show two letters');
});
