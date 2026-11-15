// The drawn buildings. Each entry draws one building with the kit.
//
// Every function receives:
//   g      the drawing kit, positioned at the building's top-left tile
//   info   { h, color, working, progress, residents, time }
//          h         the building's height in pixels, from "visual.height" in the data
//          color     its main color (the roof), from "visual.color" in the data
//          working   true while a producer is in a cycle
//          progress  how far through its cycle a producer is, 0 to 1
//          residents how many people live in a house
//          variant   0 to 3: which of a house's four looks to draw
//          time      seconds, for small animations
//
// A building type with no entry here is drawn as a plain box, so a building
// added in the data files still appears.
//
// Buildings are drawn once into small pictures and reused (see sprites.js), so
// a drawing must look the same for the same inputs. ART_USES says which inputs
// change each drawing. Anything that moves every frame, such as smoke, goes in
// LIVE_ART and is drawn fresh on top.

import { hash2, tone, mix } from './kit.js';

const WOOD = '#9a7350';
const DARK_WOOD = '#6b4a32';
const LOG = '#7c5a3c';
const PLASTER = '#eadfc4';
const STONE = '#a7a59c';
const DARK_STONE = '#86847c';
const BRICK = '#b96a4d';
const DOOR = '#5b3d28';
const GLASS = '#33475a';
const GLOW = '#ffe6a0';
const STRAW = '#d9bf6a';
const SOIL = '#8b6a45';
const PAVING = '#cfc2a4';

const TRIM = '#f1e8d2';
const FRAME_LINE = 'rgba(40, 28, 20, 0.35)';

// A door in a wooden frame, with a plank line down its middle and a latch.
function door(g, u0, u1, z, v) {
  g.onLit(u0 - 0.03, u1 + 0.03, 0, z + 1.3, v, tone(DARK_WOOD, 0.9));
  g.onLit(u0, u1, 0, z, v, DOOR, null);
  g.line(g.P((u0 + u1) / 2, v, 0), g.P((u0 + u1) / 2, v, z), tone(DOOR, 0.7), 0.4);
  g.dot(u1 - (u1 - u0) * 0.22, v, z * 0.45, 0.45, '#d9b45a');
}
// Glazing bars across a window: one upright for each pane, and one across.
function glazing(g, along, z0, z1, color) {
  const panes = Math.max(2, Math.round(along.length / 0.13));
  for (let i = 1; i < panes; i++) {
    const t = i / panes;
    g.line(along.at(t, z0), along.at(t, z1), color, 0.55);
  }
  g.line(along.at(0, (z0 + z1) / 2), along.at(1, (z0 + z1) / 2), color, 0.55);
}
// A window on the lit wall: a pale frame, glass (glowing when `lit`),
// glazing bars and a sill.
function windowLit(g, u0, u1, z0, z1, v, lit) {
  g.onLit(u0 - 0.025, u1 + 0.025, z0 - 0.8, z1 + 0.8, v, TRIM, FRAME_LINE);
  g.onLit(u0, u1, z0, z1, v, lit ? GLOW : GLASS, null);
  glazing(g, { length: u1 - u0, at: (t, z) => g.P(u0 + (u1 - u0) * t, v, z) }, z0, z1, TRIM);
  g.line(g.P(u0 - 0.045, v, z0 - 1), g.P(u1 + 0.045, v, z0 - 1), tone(TRIM, 0.62), 1);
}
// The same on the shaded wall.
function windowShade(g, v0, v1, z0, z1, u, lit) {
  const trim = tone(TRIM, 0.78);
  g.onShade(v0 - 0.025, v1 + 0.025, z0 - 0.8, z1 + 0.8, u, trim, FRAME_LINE);
  g.onShade(v0, v1, z0, z1, u, lit ? tone(GLOW, 0.85) : tone(GLASS, 0.85), null);
  glazing(g, { length: v1 - v0, at: (t, z) => g.P(u, v0 + (v1 - v0) * t, z) }, z0, z1, trim);
  g.line(g.P(u, v0 - 0.045, z0 - 1), g.P(u, v1 + 0.045, z0 - 1), tone(TRIM, 0.5), 1);
}
// A round-topped door on the lit wall, `z` pixels to the top of the arch.
function archedDoor(g, u0, u1, z, v, fill = DOOR) {
  const um = (u0 + u1) / 2;
  const half = (u1 - u0) / 2;
  const spring = z - half * 22; // the arch is as tall as it is wide, in pixels on screen
  const arch = (grow, zFrom) => {
    const points = [g.P(um - half - grow, v, 0)];
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI - (k / 8) * Math.PI;
      points.push(g.P(um + Math.cos(a) * (half + grow), v, zFrom + Math.sin(a) * (half + grow) * 22));
    }
    points.push(g.P(um + half + grow, v, 0));
    return points;
  };
  g.poly(arch(0.035, spring), tone(STONE, 0.95));
  g.poly(arch(0, spring), fill, null);
}
// A lean-to: a low shed against a wall, its roof sloping away from it.
// It runs along v from v0 to v1, out from the wall at u0 to u1.
function leanTo(g, u0, v0, u1, v1, low, high, wall, roof) {
  g.box(u0, v0, u1 - 0.02, v1, 0, low, wall, { top: false });
  g.poly([g.P(u0 - 0.02, v0 - 0.04, high), g.P(u0 - 0.02, v1 + 0.05, high), g.P(u1 + 0.03, v1 + 0.05, low - 0.6), g.P(u1 + 0.03, v0 - 0.04, low - 0.6)], tone(roof, 0.86));
  g.line(g.P(u1 + 0.03, v0 - 0.04, low - 0.6), g.P(u1 + 0.03, v1 + 0.05, low - 0.6), tone(roof, 0.55), 1);
  g.line(g.P(u0 - 0.02, v1 + 0.05, high), g.P(u1 + 0.03, v1 + 0.05, low - 0.6), tone(roof, 0.6), 0.9);
}
// Faint vertical plank lines on the lit wall.
function planksLit(g, u0, u1, z, v, color, count) {
  for (let i = 1; i < count; i++) {
    const u = u0 + ((u1 - u0) * i) / count;
    g.line(g.P(u, v, 0), g.P(u, v, z), tone(color, 0.8), 0.5);
  }
}
// Horizontal log lines on both visible walls.
function logLines(g, u0, v0, u1, v1, z, color, count) {
  for (let i = 1; i < count; i++) {
    const h = (z * i) / count;
    g.line(g.P(u0, v1, h), g.P(u1, v1, h), tone(color, 0.75), 0.5);
    g.line(g.P(u1, v1, h), g.P(u1, v0, h), tone(color, 0.6), 0.5);
  }
}
function chimney(g, u, v, zBase, zTop, color = STONE) {
  g.box(u, v, u + 0.16, v + 0.16, zBase, zTop, color);
}
// Puffs rising from a point, used while a building is working.
function smoke(g, u, v, z, time) {
  for (let i = 0; i < 3; i++) {
    const t = (time * 0.35 + i / 3) % 1;
    g.dot(u + 0.08 - t * 0.1, v + 0.08 - t * 0.1, z + 2 + t * 16, 2 + t * 3.2, `rgba(245, 245, 240, ${0.5 * (1 - t)})`);
  }
}
// A thin wisp from a house chimney: smaller and fainter than a bakery's smoke.
function wisp(g, u, v, z, time) {
  for (let i = 0; i < 2; i++) {
    const t = (time * 0.28 + i / 2) % 1;
    g.dot(u + 0.08 - t * 0.08, v + 0.08 - t * 0.08, z + 2 + t * 12, 1.5 + t * 2.4, `rgba(245, 245, 240, ${(0.38 * (1 - t)).toFixed(3)})`);
  }
}
function crate(g, u, v, size, color = '#b08a5a') {
  g.box(u, v, u + size, v + size, 0, size * 16, color);
}
// Houses come in four looks, so a street is not one house repeated: the
// roof is the usual red, a dark brown, a warm terracotta or a weathered grey;
// the walls cream, whitewashed, ochre or a stony grey; and the chimney and one
// detail move or change.
export const HOUSE_LOOKS = 4;
const ROOF_TINTS = [null, ['#4a2418', 0.34], ['#e39a52', 0.34], ['#6f6b66', 0.45]];
const WALL_TINTS = [null, ['#ffffff', 0.45], ['#e2b56c', 0.35], ['#a9a39a', 0.3]];
function variedRoof(color, variant) {
  const tint = ROOF_TINTS[variant] ?? null;
  return tint ? mix(color, tint[0], tint[1]) : color;
}
function variedWall(color, variant) {
  const tint = WALL_TINTS[variant] ?? null;
  return tint ? mix(color, tint[0], tint[1]) : color;
}
// Which look a house has, from its building number: the same every time the
// game is opened, and shuffled so that houses built one after another do not
// repeat in order.
export function houseLook(id) {
  return Number.isInteger(id) ? Math.floor(hash2(id, 0, 41) * HOUSE_LOOKS) : 0;
}
// Whether a house's chimney stands at the other end of its roof.
const chimneyMoved = (variant) => variant === 1 || variant === 3;

// One sheep: a woolly body and a dark head.
// One sheep: four legs, a woolly body of overlapping puffs, a dark head.
// `facing` is 1 to face right on screen, -1 to face left.
function sheep(g, u, v, facing = 1) {
  const p = g.P(u, v, 0);
  for (const dx of [-1.6, -0.6, 0.8, 1.8]) g.line({ x: p.x + dx, y: p.y }, { x: p.x + dx, y: p.y - 2.4 }, '#3b342c', 0.7);
  g.oval(u, v, 0, 3.6, 1.2, 'rgba(15, 35, 20, 0.22)');
  for (const [dx, dy, r, c] of [[-1.4, -3.4, 1.9, '#e6e1d2'], [1.3, -3.3, 1.9, '#e6e1d2'], [-0.4, -4.3, 2.1, '#f6f3ea'], [0.6, -3.6, 2, '#f1ede2']]) {
    g.poly(Array.from({ length: 10 }, (_, i) => ({ x: p.x + dx + Math.cos((i / 10) * Math.PI * 2) * r, y: p.y + dy + Math.sin((i / 10) * Math.PI * 2) * r * 0.8 })), c, null);
  }
  g.poly(Array.from({ length: 8 }, (_, i) => ({ x: p.x + facing * 3.2 + Math.cos((i / 8) * Math.PI * 2) * 1.2, y: p.y - 4 + Math.sin((i / 8) * Math.PI * 2) * 1 })), '#3b342c', null);
}
// An upright barrel with two hoops, standing at (u, v) on height z.
function barrel(g, u, v, z = 0) {
  g.cylinder(u + 0.07, v + 0.07, z, z + 5.5, 2.6, '#8a5f3c', { hoops: 2, top: '#a8784c' });
}

export const BUILDING_ART = {
  // A long timber hall with a big door, crates and barrels outside.
  warehouse(g, { h, color }) {
    const wall = h * 0.55;
    g.box(0.14, 0.16, 1.86, 1.7, 0, wall, WOOD, { top: false, base: STONE });
    planksLit(g, 0.14, 1.86, wall, 1.7, WOOD, 9);
    // Big double doors in a frame, with a cross brace on each leaf.
    g.onLit(0.77, 1.28, 0, wall * 0.76, 1.7, tone(DARK_WOOD, 0.85));
    g.onLit(0.8, 1.25, 0, wall * 0.72, 1.7, DARK_WOOD, null);
    g.line(g.P(1.025, 1.7, 0), g.P(1.025, 1.7, wall * 0.72), tone(DARK_WOOD, 0.6), 0.6);
    for (const [a, b] of [[0.8, 1.025], [1.025, 1.25]]) g.line(g.P(a, 1.7, 0.5), g.P(b, 1.7, wall * 0.7), tone(DARK_WOOD, 1.25), 0.6);
    windowShade(g, 0.55, 0.85, wall * 0.45, wall * 0.75, 1.86, false);
    windowShade(g, 1.1, 1.4, wall * 0.45, wall * 0.75, 1.86, false);
    const roof = { v0: 0.16, v1: 1.7, z: wall, rise: h * 0.6, overhang: 0.08 };
    g.gable(0.14, 0.16, 1.86, 1.7, wall, h * 0.6, color, { axis: 'u', wall: WOOD, lines: 4 });
    // A gable over the doors with a loft door, and a hoist beam with a sack on its rope.
    const loft = h * 0.34;
    g.dormer(roof, 0.8, 1.25, { at: 1.7, height: loft, rise: h * 0.18, color, wall: WOOD,
      window: (u0, u1, z0, z1, v) => g.onLit(u0, u1, z0, z1, v, tone(DARK_WOOD, 0.8)) });
    g.line(g.P(1.025, 1.7, wall + loft), g.P(1.025, 1.98, wall + loft), DARK_WOOD, 1.3);
    g.line(g.P(1.025, 1.95, wall + loft), g.P(1.025, 1.95, wall * 0.95), 'rgba(60, 45, 30, 0.8)', 0.5);
    g.dot(1.025, 1.95, wall * 0.88, 1.8, '#d8c79e', 'rgba(90, 70, 40, 0.6)');
    crate(g, 0.18, 1.76, 0.2);
    crate(g, 0.42, 1.78, 0.16, '#c29a66');
    barrel(g, 1.5, 1.8);
    barrel(g, 1.68, 1.8);
  },

  // A log cabin with a stack of cut logs beside it.
  lumberjack(g, { h, color }) {
    const wall = h * 0.55;
    g.box(0.12, 0.16, 0.72, 0.76, 0, wall, LOG, { top: false, base: STONE, baseHeight: 1.6 });
    logLines(g, 0.12, 0.16, 0.72, 0.76, wall, LOG, 4);
    door(g, 0.34, 0.5, wall * 0.75, 0.76);
    g.gable(0.12, 0.16, 0.72, 0.76, wall, h * 0.6, color, { axis: 'u', wall: LOG, lines: 2 });
    // A chopping block with an axe in it.
    g.box(0.2, 0.82, 0.32, 0.94, 0, 3, '#8c6642', { top: '#d9bd8c', outline: false });
    g.line(g.P(0.26, 0.88, 3), g.P(0.34, 0.86, 7), DARK_WOOD, 0.9);
    g.poly([g.P(0.25, 0.88, 3.4), g.P(0.29, 0.88, 3.2), g.P(0.28, 0.88, 5.2), g.P(0.24, 0.88, 5)], '#9aa0a6', null);
    // The log pile: three logs lying along v, with pale cut ends.
    for (const [u, z] of [[0.8, 0], [0.9, 0], [0.85, 3.2]]) {
      g.box(u, 0.3, u + 0.09, 0.8, z, z + 3.2, '#8c6642', { top: tone('#8c6642', 1.15) });
      g.dot(u + 0.045, 0.8, z + 1.6, 1.5, '#e2c79a');
    }
  },

  // An open-sided workshop with a stack of fresh planks.
  sawmill(g, { h, color }) {
    const wall = h * 0.6;
    g.ground(0.1, 0.1, 1.9, 1.9, '#b9a27c');
    g.box(0.16, 0.2, 1.2, 1.8, 0, wall, WOOD, { top: false, base: STONE });
    planksLit(g, 0.16, 1.2, wall, 1.8, WOOD, 6);
    windowLit(g, 0.4, 0.62, wall * 0.4, wall * 0.75, 1.8, false);
    windowLit(g, 0.78, 1.0, wall * 0.4, wall * 0.75, 1.8, false);
    // The open doorway on the shaded side, with a log going in.
    g.onShade(0.55, 1.45, 0, wall * 0.7, 1.2, '#3a2a1e');
    g.box(1.2, 0.9, 1.5, 1.02, 2, 5, '#8c6642');
    g.dot(1.5, 0.96, 3.5, 1.6, '#e2c79a');
    g.gable(0.16, 0.2, 1.2, 1.8, wall, h * 0.55, color, { axis: 'v', wall: WOOD, lines: 3 });
    // Sawdust by the door.
    g.oval(1.36, 1.62, 0, 5, 2.4, '#e6d2a6');
    // The plank stack.
    for (let i = 0; i < 4; i++) {
      const c = i % 2 ? '#e6c98f' : '#d8b878';
      g.box(1.48, 1.2, 1.9, 1.78, i * 2.2, i * 2.2 + 2.2, c, { top: tone(c, 1.08), outline: false });
    }
  },

  // A small hut by the shore, with a net rack and a rowing boat.
  fisherman(g, { h, color }) {
    const wall = h * 0.55;
    g.box(0.14, 0.2, 0.66, 0.74, 0, wall, PLASTER, { top: false, base: STONE, baseHeight: 1.6 });
    door(g, 0.3, 0.46, wall * 0.75, 0.74);
    windowShade(g, 0.36, 0.56, wall * 0.4, wall * 0.75, 0.66, false);
    g.gable(0.14, 0.2, 0.66, 0.74, wall, h * 0.6, color, { axis: 'v', wall: PLASTER, lines: 2 });
    // The boat, pulled up on the ground.
    g.poly([g.P(0.76, 0.2), g.P(0.9, 0.12), g.P(0.98, 0.5), g.P(0.9, 0.9), g.P(0.76, 0.8)], '#7b5536');
    g.poly([g.P(0.8, 0.26), g.P(0.9, 0.2), g.P(0.94, 0.5), g.P(0.9, 0.82), g.P(0.8, 0.74)], '#a67c52', null);
    g.line(g.P(0.8, 0.5), g.P(0.94, 0.5), '#5b3d28', 0.8);
    // The net rack.
    g.post(0.12, 0.9, 0, 9, DARK_WOOD);
    g.post(0.62, 0.9, 0, 9, DARK_WOOD);
    g.line(g.P(0.12, 0.9, 9), g.P(0.62, 0.9, 9), DARK_WOOD, 1);
    g.poly([g.P(0.16, 0.9, 9), g.P(0.58, 0.9, 9), g.P(0.52, 0.9, 3), g.P(0.22, 0.9, 3.5)], 'rgba(220, 230, 235, 0.55)', 'rgba(80, 100, 110, 0.6)', 0.4);
    // Fish hung up to dry on a second line, and a barrel for the catch.
    g.line(g.P(0.12, 0.9, 7), g.P(0.12, 0.98, 7), DARK_WOOD, 0.6);
    for (const u of [0.24, 0.34, 0.44, 0.54]) {
      const top = g.P(u, 0.97, 8.4);
      g.line(g.P(u, 0.97, 9), top, 'rgba(60, 45, 30, 0.7)', 0.3);
      g.poly([{ x: top.x - 0.7, y: top.y }, { x: top.x + 0.7, y: top.y }, { x: top.x + 0.5, y: top.y + 3 }, { x: top.x, y: top.y + 3.8 }, { x: top.x - 0.5, y: top.y + 3 }], '#9fb3bd', 'rgba(50, 60, 70, 0.5)', 0.3);
    }
    barrel(g, 0.66, 0.08);
  },

  // A field of crop rows that ripen as the cycle runs, with a small barn.
  farm(g, { h, color, progress }) {
    g.ground(0.04, 0.04, 1.96, 1.96, SOIL);
    // The barn stands at the back, so it is drawn before the rows in front of it.
    const wall = h * 0.9;
    g.box(0.12, 0.12, 0.92, 0.84, 0, wall, '#a8553d', { top: false, base: STONE, baseHeight: 1.8 });
    planksLit(g, 0.12, 0.92, wall, 0.84, '#a8553d', 6);
    g.onLit(0.38, 0.68, 0, wall * 0.79, 0.84, tone(DARK_WOOD, 0.85));
    g.onLit(0.4, 0.66, 0, wall * 0.75, 0.84, DARK_WOOD, null);
    for (const [a, b] of [[0.4, 0.53], [0.53, 0.66]]) g.line(g.P(a, 0.84, 0.4), g.P(b, 0.84, wall * 0.72), tone(DARK_WOOD, 1.3), 0.5);
    g.gable(0.12, 0.12, 0.92, 0.84, wall, h * 0.9, STRAW, { axis: 'u', wall: '#a8553d', lines: 2 });
    const crop = mix('#6f9a42', color, Math.min(1, progress * 1.15));
    const height = 1.5 + progress * 4;
    for (let i = 0; i < 6; i++) {
      const v = 0.2 + i * 0.3;
      // Rows level with the barn start to its right.
      const u0 = v < 0.95 ? 1.05 : 0.1;
      // The body of the row, a little lower than the stalks, then the stalks
      // standing out along its top, and once it ripens, an ear on each.
      g.box(u0, v, 1.9, v + 0.16, 0, height * 0.75, mix(crop, '#000000', 0.1), { top: tone(crop, 1.05), outline: false });
      const stalks = [];
      const ears = [];
      for (let u = u0 + 0.03; u < 1.88; u += 0.055) {
        for (const dv of [0.03, 0.13]) {
          const lean = (hash2(Math.round(u * 100), i * 7 + Math.round(dv * 100), 5) - 0.5) * 0.04;
          stalks.push([g.P(u, v + dv, height * 0.6), g.P(u + lean, v + dv, height + 1)]);
          if (progress > 0.45) ears.push(g.P(u + lean, v + dv, height + 1.2));
        }
      }
      for (const [a, b] of stalks) g.line(a, b, tone(crop, 1.08), 0.7);
      for (const p of ears) g.poly([{ x: p.x - 0.5, y: p.y }, { x: p.x, y: p.y - 1.4 }, { x: p.x + 0.5, y: p.y }], tone(color, 1.12), null);
    }
  },

  // A brick bakehouse with a tall chimney that smokes while it bakes.
  bakery(g, { h, color, working }) {
    const wall = h * 0.55;
    g.box(0.2, 0.24, 1.8, 1.72, 0, wall, BRICK, { top: false, base: STONE });
    for (let i = 1; i < 4; i++) g.line(g.P(0.2, 1.72, (wall * i) / 4), g.P(1.8, 1.72, (wall * i) / 4), tone(BRICK, 0.82), 0.5);
    door(g, 0.86, 1.14, wall * 0.72, 1.72);
    windowLit(g, 0.36, 0.66, wall * 0.35, wall * 0.75, 1.72, working);
    windowLit(g, 1.34, 1.64, wall * 0.35, wall * 0.75, 1.72, working);
    windowShade(g, 0.6, 0.95, wall * 0.35, wall * 0.75, 1.8, working);
    // A round bread sign over the door.
    g.dot(1.0, 1.72, wall * 0.9, 2.4, '#e2b56b', 'rgba(60, 40, 20, 0.7)');
    g.gable(0.2, 0.24, 1.8, 1.72, wall, h * 0.55, color, { axis: 'u', wall: BRICK, lines: 4 });
    chimney(g, 1.25, 0.5, wall + h * 0.25, wall + h * 0.95);
    // The bread oven: a brick base with a rounded dome, built against the side wall,
    // its mouth glowing while it bakes.
    g.box(1.8, 0.7, 1.98, 1.16, 0, wall * 0.36, STONE, { top: tone(STONE, 1.05) });
    g.dome(1.89, 0.93, wall * 0.36, 8.5, 8, BRICK);
    g.onShade(0.86, 1.0, wall * 0.08, wall * 0.3, 1.98, working ? '#f2a64a' : '#2e1f16', null);
    // A bench by the door with loaves set out on it.
    g.box(0.28, 1.8, 0.7, 1.92, 0, 3, WOOD, { top: tone(WOOD, 1.2), outline: false });
    for (const u of [0.36, 0.48, 0.6]) g.oval(u, 1.86, 3.6, 2.1, 1.3, '#d29a52');
  },

  // A thatched cottage. Its windows glow once someone lives there.
  cottage(g, { h, color, residents, variant = 0 }) {
    const wall = h * 0.5;
    const lived = residents > 0;
    const roof = variedRoof(color, variant);
    const plaster = variedWall(PLASTER, variant);
    g.box(0.3, 0.36, 1.7, 1.62, 0, wall, plaster, { top: false, base: STONE, baseHeight: 2 });
    door(g, 0.9, 1.12, wall * 0.8, 1.62);
    windowLit(g, 0.46, 0.72, wall * 0.35, wall * 0.8, 1.62, lived);
    windowLit(g, 1.3, 1.56, wall * 0.35, wall * 0.8, 1.62, lived);
    windowShade(g, 0.8, 1.1, wall * 0.35, wall * 0.8, 1.7, lived);
    g.gable(0.3, 0.36, 1.7, 1.62, wall, h * 0.7, roof, { axis: 'u', wall: plaster, overhang: 0.12, lines: 3 });
    chimney(g, chimneyMoved(variant) ? 1.3 : 0.5, 0.7, wall + h * 0.3, wall + h * 0.85);
    // A little garden path, and for some a bed of flowers beside it.
    g.ground(0.9, 1.62, 1.12, 1.95, '#c9b68e');
    // A woodshed on the side, with logs stacked under it.
    leanTo(g, 1.7, 0.66, 1.94, 1.34, wall * 0.62, wall * 0.92, WOOD, roof);
    g.onShade(0.74, 1.26, 0, wall * 0.5, 1.92, '#4a3626', null);
    for (const [v, z] of [[0.86, 0], [1.02, 0], [1.18, 0], [0.94, 2.6], [1.1, 2.6]]) g.dot(1.92, v, z + 1.3, 1.25, '#d9bd8c', 'rgba(90, 60, 30, 0.7)');
    // A small porch roof over the door on two posts.
    g.post(0.86, 1.86, 0, wall * 0.92, DARK_WOOD, 1);
    g.post(1.16, 1.86, 0, wall * 0.92, DARK_WOOD, 1);
    g.poly([g.P(0.82, 1.62, wall * 1.08), g.P(1.2, 1.62, wall * 1.08), g.P(1.2, 1.9, wall * 0.88), g.P(0.82, 1.9, wall * 0.88)], tone(roof, 0.95));
    g.line(g.P(0.82, 1.9, wall * 0.88), g.P(1.2, 1.9, wall * 0.88), tone(roof, 0.55), 1);
    if (variant === 2) {
      g.ground(0.36, 1.68, 0.82, 1.92, '#7fa65a');
      g.dot(0.47, 1.8, 1, 1.1, '#e06a7a');
      g.dot(0.6, 1.76, 1, 1.1, '#f2d24b');
      g.dot(0.72, 1.82, 1, 1.1, '#e06a7a');
    }
    // Others keep a stack of firewood by the wall.
    if (variant === 3) {
      g.box(1.3, 1.64, 1.62, 1.8, 0, 4, '#8a5f3c');
      g.box(1.3, 1.64, 1.62, 1.8, 4, 5.5, '#b08a5a');
    }
  },

  // A taller two-storey house with a tiled roof, for Workers.
  townhouse(g, { h, color, residents, variant = 0 }) {
    const wall = h * 0.62;
    const lived = residents > 0;
    const roof = variedRoof(color, variant);
    const plaster = variedWall('#e3d2b0', variant);
    g.box(0.26, 0.3, 1.74, 1.68, 0, wall, plaster, { top: false, base: STONE });
    // Timber framing.
    g.line(g.P(0.26, 1.68, wall * 0.5), g.P(1.74, 1.68, wall * 0.5), DARK_WOOD, 0.9);
    g.line(g.P(1.74, 1.68, wall * 0.5), g.P(1.74, 0.3, wall * 0.5), tone(DARK_WOOD, 0.8), 0.9);
    door(g, 0.9, 1.12, wall * 0.4, 1.68);
    for (const [u0, u1] of [[0.42, 0.66], [1.34, 1.58]]) {
      windowLit(g, u0, u1, wall * 0.14, wall * 0.4, 1.68, lived);
      windowLit(g, u0, u1, wall * 0.6, wall * 0.88, 1.68, lived);
    }
    windowLit(g, 0.9, 1.12, wall * 0.6, wall * 0.88, 1.68, lived);
    windowShade(g, 0.6, 0.86, wall * 0.6, wall * 0.88, 1.74, lived);
    windowShade(g, 1.1, 1.36, wall * 0.6, wall * 0.88, 1.74, lived);
    // Some have boxes of flowers under the ground-floor windows.
    if (variant === 2) for (const [u0, u1] of [[0.42, 0.66], [1.34, 1.58]]) g.onLit(u0, u1, wall * 0.08, wall * 0.14, 1.68, '#c9506b');
    // Others have green shutters on the upper floor.
    if (variant === 3) {
      for (const u of [0.36, 0.66, 1.28, 1.58]) g.onLit(u, u + 0.06, wall * 0.6, wall * 0.88, 1.68, '#4f7a4a');
    }
    g.gable(0.26, 0.3, 1.74, 1.68, wall, h * 0.5, roof, { axis: 'u', wall: plaster, overhang: 0.1, lines: 4 });
    // Dormer windows in the roof: two, or for some one in the middle.
    const slope = { v0: 0.3, v1: 1.68, z: wall, rise: h * 0.5, overhang: 0.1 };
    const window = (u0, u1, z0, z1, v) => windowLit(g, u0, u1, z0, z1, v, lived);
    for (const [u0, u1] of variant % 2 ? [[0.82, 1.18]] : [[0.46, 0.8], [1.2, 1.54]]) {
      g.dormer(slope, u0, u1, { at: 1.32, height: h * 0.3, rise: h * 0.14, color: roof, wall: plaster, window });
    }
    chimney(g, chimneyMoved(variant) ? 0.55 : 1.3, 0.6, wall + h * 0.2, wall + h * 0.75, BRICK);
    g.ground(0.9, 1.68, 1.12, 1.95, '#c9b68e');
  },

  // A fenced pasture with a few sheep and a small shelter.
  sheepfarm(g, { h, color }) {
    g.ground(0.04, 0.04, 1.96, 1.96, '#9cc27a', 'rgba(60, 90, 50, 0.35)');
    const wall = h * 0.8;
    g.box(0.14, 0.14, 0.86, 0.7, 0, wall, WOOD, { top: false, base: STONE, baseHeight: 1.6 });
    planksLit(g, 0.14, 0.86, wall, 0.7, WOOD, 5);
    g.onLit(0.38, 0.62, 0, wall * 0.7, 0.7, DARK_WOOD);
    g.gable(0.14, 0.14, 0.86, 0.7, wall, h * 0.7, color, { axis: 'u', wall: WOOD, lines: 2 });
    // A hay rack and a water trough.
    g.box(0.98, 0.2, 1.36, 0.36, 0, 4.5, WOOD, { top: '#d9bf6a' });
    for (let i = 1; i < 6; i++) g.line(g.P(0.98 + i * 0.063, 0.36, 0.6), g.P(0.98 + i * 0.063, 0.36, 4.3), tone(WOOD, 0.7), 0.4);
    g.box(0.2, 0.9, 0.56, 1.02, 0, 2.6, WOOD, { top: '#6fa6c8' });
    for (const [u, v, facing] of [[1.3, 0.62, -1], [1.62, 1.02, 1], [0.66, 1.25, 1], [1.15, 1.52, -1], [0.38, 1.66, 1]]) sheep(g, u, v, facing);
    // The fence along the two near sides.
    for (let i = 0; i <= 4; i++) {
      g.post(0.08 + i * 0.46, 1.92, 0, 5, DARK_WOOD, 1);
      g.post(1.92, 0.08 + i * 0.46, 0, 5, DARK_WOOD, 1);
    }
    g.line(g.P(0.08, 1.92, 3.5), g.P(1.92, 1.92, 3.5), DARK_WOOD, 0.8);
    g.line(g.P(1.92, 1.92, 3.5), g.P(1.92, 0.08, 3.5), tone(DARK_WOOD, 0.8), 0.8);
  },

  // A weaver's workshop, with dyed cloth hung out to dry and a bale of wool by the wall.
  weaver(g, { h, color, working }) {
    const wall = h * 0.55;
    g.box(0.22, 0.28, 1.78, 1.66, 0, wall, PLASTER, { top: false, base: STONE });
    g.line(g.P(0.22, 1.66, wall * 0.55), g.P(1.78, 1.66, wall * 0.55), DARK_WOOD, 0.8);
    door(g, 0.4, 0.64, wall * 0.75, 1.66);
    windowLit(g, 0.9, 1.6, wall * 0.3, wall * 0.8, 1.66, working); // the wide workshop window
    windowShade(g, 0.6, 1.0, wall * 0.35, wall * 0.8, 1.78, working);
    g.gable(0.22, 0.28, 1.78, 1.66, wall, h * 0.5, color, { axis: 'u', wall: PLASTER, overhang: 0.1, lines: 4 });
    // A lean-to on the side, open at the front, where the wool is kept.
    leanTo(g, 1.78, 0.5, 1.98, 1.4, wall * 0.62, wall * 0.9, WOOD, color);
    g.onShade(0.62, 1.28, 0, wall * 0.5, 1.96, '#4a3626', null);
    for (const [v, z] of [[0.78, 0], [1.08, 0], [0.93, 3.4]]) g.dot(1.9, v, z + 1.8, 2.4, '#f1ece0', 'rgba(120, 110, 90, 0.6)');
    g.post(0.3, 1.88, 0, 8, DARK_WOOD, 1);
    g.post(1.1, 1.88, 0, 8, DARK_WOOD, 1);
    g.line(g.P(0.3, 1.88, 8), g.P(1.1, 1.88, 8), DARK_WOOD, 0.8);
    ['#7d6fb3', '#c9506b', '#e0c04a'].forEach((dye, i) => g.onLit(0.36 + i * 0.24, 0.54 + i * 0.24, 2.5, 8, 1.88, dye));
    crate(g, 1.5, 1.74, 0.16, '#e8e2d0');
  },

  // Rows of vines on trellis posts, the grapes darkening as the cycle runs,
  // with a small press shed at the back.
  vineyard(g, { h, color, progress }) {
    g.ground(0.04, 0.04, 1.96, 1.96, SOIL);
    const wall = h * 0.9;
    g.box(0.12, 0.12, 0.7, 0.62, 0, wall, WOOD, { top: false, base: STONE, baseHeight: 1.6 });
    planksLit(g, 0.12, 0.7, wall, 0.62, WOOD, 4);
    g.onLit(0.3, 0.5, 0, wall * 0.75, 0.62, DARK_WOOD);
    g.gable(0.12, 0.12, 0.7, 0.62, wall, h * 0.7, '#9a4a3a', { axis: 'u', wall: WOOD, lines: 2 });
    const grape = mix('#8fae5a', '#5b2a52', Math.min(1, progress * 1.1));
    for (let i = 0; i < 5; i++) {
      const v = 0.3 + i * 0.34;
      const u0 = v < 0.75 ? 0.85 : 0.12;
      // The leafy row, then its posts and a few bunches on the near side.
      g.box(u0, v, 1.88, v + 0.12, 0, 6, color, { top: tone(color, 1.15), outline: false });
      g.post(u0, v + 0.12, 0, 7, DARK_WOOD, 0.9);
      g.post(1.88, v + 0.12, 0, 7, DARK_WOOD, 0.9);
      // Leaves bunching along the top of the row.
      for (let u = u0 + 0.05; u < 1.86; u += 0.09) g.dot(u, v + 0.06, 6.3, 1.3, tone(color, 1.12 + hash2(Math.round(u * 50), i, 9) * 0.12));
      // Bunches of grapes, three grapes over two.
      for (let k = 0; k < 3; k++) {
        const u = u0 + 0.2 + k * ((1.88 - u0 - 0.4) / 2);
        for (const [du, dz] of [[-0.02, 3.4], [0.02, 3.4], [0, 2.3]]) g.dot(u + du, v + 0.13, dz, 0.85, grape);
      }
    }
  },

  // A stone winery with a dark red roof, a cellar door and barrels by the wall.
  winery(g, { h, color, working }) {
    const wall = h * 0.55;
    g.box(0.22, 0.28, 1.78, 1.66, 0, wall, STONE, { top: false, base: DARK_STONE });
    // Stone courses.
    for (let i = 1; i < 4; i++) g.line(g.P(0.22, 1.66, (wall * i) / 4), g.P(1.78, 1.66, (wall * i) / 4), tone(STONE, 0.85), 0.45);
    archedDoor(g, 0.86, 1.18, wall * 0.85, 1.66, '#3f2a1e');
    windowLit(g, 0.36, 0.66, wall * 0.35, wall * 0.75, 1.66, working);
    windowLit(g, 1.36, 1.64, wall * 0.35, wall * 0.75, 1.66, working);
    windowShade(g, 0.6, 1.0, wall * 0.35, wall * 0.75, 1.78, working);
    g.gable(0.22, 0.28, 1.78, 1.66, wall, h * 0.5, color, { axis: 'u', wall: STONE, overhang: 0.1, lines: 4 });
    // A gable over the cellar door, with a round window.
    g.dormer({ v0: 0.28, v1: 1.66, z: wall, rise: h * 0.5, overhang: 0.1 }, 0.78, 1.26, {
      at: 1.66, height: h * 0.32, rise: h * 0.2, color, wall: STONE,
      window: (u0, u1, z0, z1, v) => {
        g.dot((u0 + u1) / 2, v, (z0 + z1) / 2, 3.3, TRIM, FRAME_LINE);
        g.dot((u0 + u1) / 2, v, (z0 + z1) / 2, 2.4, working ? GLOW : GLASS);
      },
    });
    // A vine trained up the wall beside the door.
    for (let k = 0; k < 9; k++) g.dot(0.72 + hash2(k, 3, 7) * 0.12, 1.67, 1.5 + k * wall * 0.09, 1.6, k % 3 ? '#5f8f3a' : '#4a7530');
    // Barrels by the near wall, one stood on two.
    barrel(g, 0.24, 1.76);
    barrel(g, 0.46, 1.78);
    barrel(g, 0.35, 1.77, 5.5);
    crate(g, 1.5, 1.74, 0.16, '#7a3a4a');
  },

  // A tall three-storey house on a stone ground floor, with a slate roof, for Artisans.
  guildhouse(g, { h, color, residents, variant = 0 }) {
    const wall = h * 0.68;
    const lived = residents > 0;
    const roof = variedRoof(color, variant);
    const upper = variedWall('#efe6cf', variant);
    g.box(0.22, 0.26, 1.78, 1.72, 0, wall * 0.34, STONE, { top: false });
    g.box(0.22, 0.26, 1.78, 1.72, wall * 0.34, wall, upper, { top: false });
    g.line(g.P(0.22, 1.72, wall * 0.67), g.P(1.78, 1.72, wall * 0.67), DARK_WOOD, 0.9);
    g.line(g.P(1.78, 1.72, wall * 0.67), g.P(1.78, 0.26, wall * 0.67), tone(DARK_WOOD, 0.8), 0.9);
    door(g, 0.88, 1.12, wall * 0.27, 1.72);
    for (const [u0, u1] of [[0.4, 0.62], [1.38, 1.6]]) windowLit(g, u0, u1, wall * 0.09, wall * 0.26, 1.72, lived);
    for (const [z0, z1] of [[0.41, 0.6], [0.74, 0.93]]) {
      for (const [u0, u1] of [[0.36, 0.58], [0.89, 1.11], [1.42, 1.64]]) windowLit(g, u0, u1, wall * z0, wall * z1, 1.72, lived);
      for (const [v0, v1] of [[0.5, 0.78], [1.14, 1.42]]) windowShade(g, v0, v1, wall * z0, wall * z1, 1.78, lived);
    }
    // Some hang a guild banner by the door.
    if (variant === 2) g.onLit(1.2, 1.31, wall * 0.36, wall * 0.62, 1.72, '#c9a55a');
    if (variant === 3) g.onLit(1.2, 1.31, wall * 0.36, wall * 0.62, 1.72, '#4a6fa5');
    g.gable(0.22, 0.26, 1.78, 1.72, wall, h * 0.42, roof, { axis: 'u', wall: upper, overhang: 0.1, lines: 5 });
    // A tall gable over the door, rising straight up from the front wall, with a window.
    g.dormer({ v0: 0.26, v1: 1.72, z: wall, rise: h * 0.42, overhang: 0.1 }, 0.74, 1.26, {
      at: 1.72, height: h * 0.3, rise: h * 0.2, color: roof, wall: upper,
      window: (u0, u1, z0, z1, v) => windowLit(g, u0, u1, z0, z1, v, lived),
    });
    chimney(g, 0.45, 0.55, wall + h * 0.15, wall + h * 0.62, BRICK);
    if (variant !== 1) chimney(g, 1.4, 0.55, wall + h * 0.15, wall + h * 0.62, BRICK);
    g.ground(0.88, 1.72, 1.12, 1.95, '#c9b68e');
  },

  // A stone quay with a harbourmaster's house, a loading crane, a flag, and
  // goods stacked ready for the ship.
  harbor(g, { h, color }) {
    g.ground(0.04, 0.04, 1.96, 1.96, STONE, 'rgba(70, 70, 60, 0.45)');
    // Paving stones on the quay, laid in staggered rows.
    for (let i = 1; i < 8; i++) g.line(g.P(0.04, 0.04 + i * 0.24), g.P(1.7, 0.04 + i * 0.24), tone(STONE, 0.86), 0.45);
    for (let r = 0; r < 8; r++) {
      for (let u = 0.04 + (r % 2 ? 0.17 : 0.34); u < 1.7; u += 0.34) g.line(g.P(u, 0.04 + r * 0.24), g.P(u, 0.04 + (r + 1) * 0.24), tone(STONE, 0.86), 0.45);
    }
    // A wooden jetty along the water's edge.
    g.ground(1.7, 0.04, 1.96, 1.96, '#9a7350', 'rgba(60, 40, 25, 0.5)');
    for (let v = 0.16; v < 1.96; v += 0.12) g.line(g.P(1.7, v), g.P(1.96, v), tone('#9a7350', 0.75), 0.45);
    // The harbourmaster's house at the back.
    const wall = h * 0.5;
    g.box(0.12, 0.12, 1.0, 0.8, 0, wall, PLASTER, { top: false, base: STONE, baseHeight: 1.8 });
    door(g, 0.46, 0.64, wall * 0.75, 0.8);
    windowLit(g, 0.18, 0.36, wall * 0.42, wall * 0.78, 0.8, false);
    windowLit(g, 0.74, 0.92, wall * 0.42, wall * 0.78, 0.8, false);
    windowShade(g, 0.3, 0.6, wall * 0.42, wall * 0.78, 1.0, false);
    g.gable(0.12, 0.12, 1.0, 0.8, wall, h * 0.42, color, { axis: 'u', wall: PLASTER, lines: 3 });
    // A flag on a pole beside the house.
    g.post(1.12, 0.22, 0, h * 1.15, DARK_WOOD, 1);
    g.poly([g.P(1.12, 0.22, h * 1.15), g.P(1.12, 0.62, h * 1.06), g.P(1.12, 0.22, h * 0.97)], '#c94f3d', 'rgba(60, 20, 15, 0.5)', 0.4);
    // The loading crane: a stout post on a stone base, a jib held by a brace,
    // a pulley at its end, and a crate on the rope.
    g.box(1.52, 0.28, 1.72, 0.48, 0, 3, STONE);
    g.box(1.58, 0.34, 1.66, 0.42, 3, h * 1.25, DARK_WOOD);
    g.line(g.P(1.62, 0.38, h * 1.22), g.P(1.62, 1.32, h * 1.12), DARK_WOOD, 1.6);
    g.line(g.P(1.62, 0.38, h * 0.75), g.P(1.62, 0.9, h * 1.17), DARK_WOOD, 1);
    g.dot(1.62, 1.3, h * 1.1, 1.3, '#4a3322');
    g.line(g.P(1.62, 1.3, h * 1.1), g.P(1.62, 1.3, h * 0.62), 'rgba(60, 45, 30, 0.8)', 0.5);
    crate(g, 1.54, 1.22, 0.16, '#c29a66');
    // A lantern on a post by the house.
    g.post(1.08, 0.9, 0, h * 0.9, '#3b342c', 0.9);
    g.box(1.05, 0.87, 1.11, 0.93, h * 0.82, h * 0.95, '#f2d68a', { outline: false });
    g.line(g.P(1.04, 0.86, h * 0.96), g.P(1.12, 0.94, h * 0.96), '#3b342c', 1);
    // Goods waiting for the ship: crates, barrels and sacks along the front.
    crate(g, 0.16, 1.2, 0.24);
    crate(g, 0.44, 1.26, 0.18, '#c29a66');
    crate(g, 0.2, 1.5, 0.18, '#a97f50');
    barrel(g, 0.78, 1.32);
    barrel(g, 0.96, 1.34);
    barrel(g, 0.86, 1.56);
    g.oval(1.18, 1.62, 2, 2.6, 2, '#d8c79e');
    g.oval(1.32, 1.66, 2, 2.6, 2, '#cdbb8f');
    // Bollards along the jetty, one with a mooring rope coiled round it.
    for (const v of [0.3, 0.9, 1.5]) g.cylinder(1.88, v, 0, 3.5, 1.2, '#4a4a46');
    g.oval(1.84, 0.95, 0.4, 2.4, 1.2, '#c9b27a');
  },

  // A paved square with three striped stalls.
  market(g, { h, color }) {
    g.ground(0.06, 0.06, 1.94, 1.94, PAVING, 'rgba(90, 75, 50, 0.4)');
    const cream = '#f3ead2';
    // Paving stones.
    for (let i = 1; i < 8; i++) {
      g.line(g.P(0.06, 0.06 + i * 0.235), g.P(1.94, 0.06 + i * 0.235), tone(PAVING, 0.9), 0.4);
      g.line(g.P(0.06 + i * 0.235, 0.06), g.P(0.06 + i * 0.235, 1.94), tone(PAVING, 0.93), 0.4);
    }
    // A stall: a counter with baskets of its goods along the front, posts, and a striped awning.
    const stall = (u0, v0, u1, v1, goods) => {
      g.box(u0 + 0.04, v0 + 0.04, u1 - 0.04, v1 - 0.04, 0, h * 0.28, '#a67c52', { top: '#c29a6a' });
      const n = Math.max(2, Math.round((u1 - u0) / 0.24));
      for (let i = 0; i < n; i++) {
        const u = u0 + 0.14 + ((u1 - u0 - 0.28) * i) / (n - 1);
        g.cylinder(u, v1 - 0.14, h * 0.28, h * 0.28 + 1.6, 2.2, '#9a7a4a', { top: goods[i % goods.length] });
      }
      for (const [u, v] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) g.post(u, v, 0, h * 0.6, DARK_WOOD, 1);
      g.stripedPyramid(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, h * 0.6, h * 0.45, color, cream, 6);
    };
    stall(0.14, 0.14, 0.86, 0.74, ['#d98c3a', '#e0c04a', '#b5503a']);
    stall(1.12, 0.14, 1.86, 0.74, ['#7fb069', '#a8c25a', '#5d8f4a']);
    stall(0.5, 1.12, 1.5, 1.8, ['#5aa7d6', '#e8e2d0', '#7d6fb3', '#d29a52']);
    // A well in the open corner of the square, with a bucket on its rope.
    const well = (u, v) => {
      g.cylinder(u, v, 0, 4.2, 4.6, STONE, { top: '#3f6f8f' });
      g.post(u - 0.15, v, 4, 11, DARK_WOOD, 1);
      g.post(u + 0.15, v, 4, 11, DARK_WOOD, 1);
      g.line(g.P(u - 0.17, v, 11), g.P(u + 0.17, v, 11), DARK_WOOD, 1);
      g.line(g.P(u, v, 11), g.P(u, v, 6.5), 'rgba(60, 45, 30, 0.8)', 0.4);
      g.box(u - 0.03, v - 0.03, u + 0.03, v + 0.03, 5, 6.6, '#8a5f3c', { outline: false });
    };
    well(1.72, 1.5);
  },
};

// Which inputs change how each drawing looks. Anything not listed looks the
// same whatever the building is doing.
export const ART_USES = {
  farm: ['progress'],
  bakery: ['working'],
  cottage: ['residents', 'variant'],
  townhouse: ['residents', 'variant'],
  guildhouse: ['residents', 'variant'],
  weaver: ['working'],
  vineyard: ['progress'],
  winery: ['working'],
};

// Moving parts, drawn fresh every frame on top of the building: while a
// producer works, or while a house has people in it.
export const LIVE_ART = {
  // Smoke from the chimney while baking.
  bakery(g, { h, working, time }) {
    if (working) smoke(g, 1.25, 0.5, h * 0.55 + h * 0.95, time);
  },
  // A wisp of smoke from the chimney of any house with people in it. `seed`
  // sets each house's wisp a little out of step with its neighbours'.
  cottage(g, { h, residents, time, variant = 0, seed = 0 }) {
    if (residents > 0) wisp(g, chimneyMoved(variant) ? 1.3 : 0.5, 0.7, h * 0.5 + h * 0.85, time + seed * 0.37);
  },
  townhouse(g, { h, residents, time, variant = 0, seed = 0 }) {
    if (residents > 0) wisp(g, chimneyMoved(variant) ? 0.55 : 1.3, 0.6, h * 0.62 + h * 0.75, time + seed * 0.37);
  },
  guildhouse(g, { h, residents, time, seed = 0 }) {
    if (residents > 0) wisp(g, 0.45, 0.55, h * 0.68 + h * 0.62, time + seed * 0.37);
  },
  // Sawdust at the doorway while sawing.
  sawmill(g, { working, time }) {
    if (working) g.dot(1.34, 0.96, 6 + Math.sin(time * 9) * 0.6, 1.1, 'rgba(240, 225, 190, 0.8)');
  },
};

// The name of the art a building uses: the tier's for a house, otherwise the
// building's own. Null if it has none, or names one that does not exist.
export function artIdFor(rules, building) {
  const def = rules.buildings[building.type];
  const tier = building.house ? rules.tiers[building.house.tier] : null;
  const id = tier?.visual?.art ?? def.visual?.art ?? null;
  return id && BUILDING_ART[id] ? id : null;
}

export function artFor(rules, building) {
  const id = artIdFor(rules, building);
  return id ? BUILDING_ART[id] : null;
}

// A short text that is the same whenever the drawing would be the same.
export function artStateKey(id, info) {
  const parts = [];
  for (const use of ART_USES[id] ?? []) {
    if (use === 'progress') parts.push(Math.min(5, Math.floor(info.progress * 6)));
    else if (use === 'working') parts.push(info.working ? 1 : 0);
    else if (use === 'residents') parts.push(info.residents > 0 ? 1 : 0);
    else if (use === 'variant') parts.push(info.variant ?? 0);
  }
  return parts.join('.');
}
