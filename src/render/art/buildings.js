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
//          variant   0, 1 or 2: which of a house's three looks to draw
//          time      seconds, for small animations
//
// A building type with no entry here is drawn as a plain box, so a building
// added in the data files still appears.
//
// Buildings are drawn once into small pictures and reused (see sprites.js), so
// a drawing must look the same for the same inputs. ART_USES says which inputs
// change each drawing. Anything that moves every frame, such as smoke, goes in
// LIVE_ART and is drawn fresh on top.

import { tone, mix } from './kit.js';

const WOOD = '#9a7350';
const DARK_WOOD = '#6b4a32';
const LOG = '#7c5a3c';
const PLASTER = '#eadfc4';
const STONE = '#a7a59c';
const BRICK = '#b96a4d';
const DOOR = '#5b3d28';
const GLASS = '#33475a';
const GLOW = '#ffe6a0';
const STRAW = '#d9bf6a';
const SOIL = '#8b6a45';
const PAVING = '#cfc2a4';

function door(g, u0, u1, z, v) {
  g.onLit(u0, u1, 0, z, v, DOOR);
}
function windowLit(g, u0, u1, z0, z1, v, lit) {
  g.onLit(u0, u1, z0, z1, v, lit ? GLOW : GLASS);
}
function windowShade(g, v0, v1, z0, z1, u, lit) {
  g.onShade(v0, v1, z0, z1, u, lit ? tone(GLOW, 0.85) : tone(GLASS, 0.85));
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
function crate(g, u, v, size, color = '#b08a5a') {
  g.box(u, v, u + size, v + size, 0, size * 16, color);
}
// Houses come in three looks, so a street is not one house repeated. The roof
// is a shade darker or lighter, and one detail moves or is added.
function variedRoof(color, variant) {
  return variant === 1 ? mix(color, '#000000', 0.11) : variant === 2 ? mix(color, '#ffffff', 0.1) : color;
}

// One sheep: a woolly body and a dark head.
function sheep(g, u, v) {
  g.oval(u, v, 2.6, 3.3, 2.3, '#f4f1e6');
  g.dot(u + 0.1, v + 0.03, 3.4, 1.25, '#3b342c');
}
function barrel(g, u, v) {
  g.box(u, v, u + 0.14, v + 0.14, 0, 4.5, '#8a5f3c');
}

export const BUILDING_ART = {
  // A long timber hall with a big door, crates and barrels outside.
  warehouse(g, { h, color }) {
    const wall = h * 0.55;
    g.box(0.14, 0.16, 1.86, 1.7, 0, wall, WOOD, { top: false });
    planksLit(g, 0.14, 1.86, wall, 1.7, WOOD, 9);
    g.onLit(0.8, 1.25, 0, wall * 0.72, 1.7, DARK_WOOD);
    g.line(g.P(1.025, 1.7, 0), g.P(1.025, 1.7, wall * 0.72), tone(DARK_WOOD, 0.6), 0.6);
    windowShade(g, 0.55, 0.85, wall * 0.45, wall * 0.75, 1.86, false);
    windowShade(g, 1.1, 1.4, wall * 0.45, wall * 0.75, 1.86, false);
    g.gable(0.14, 0.16, 1.86, 1.7, wall, h * 0.6, color, { axis: 'u', wall: WOOD, lines: 4 });
    crate(g, 0.18, 1.76, 0.2);
    crate(g, 0.42, 1.78, 0.16, '#c29a66');
    barrel(g, 1.5, 1.8);
    barrel(g, 1.68, 1.8);
  },

  // A log cabin with a stack of cut logs beside it.
  lumberjack(g, { h, color }) {
    const wall = h * 0.55;
    g.box(0.12, 0.16, 0.72, 0.76, 0, wall, LOG, { top: false });
    logLines(g, 0.12, 0.16, 0.72, 0.76, wall, LOG, 4);
    door(g, 0.34, 0.5, wall * 0.75, 0.76);
    g.gable(0.12, 0.16, 0.72, 0.76, wall, h * 0.6, color, { axis: 'u', wall: LOG, lines: 2 });
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
    g.box(0.16, 0.2, 1.2, 1.8, 0, wall, WOOD, { top: false });
    planksLit(g, 0.16, 1.2, wall, 1.8, WOOD, 6);
    // The open doorway on the shaded side, with a log going in.
    g.onShade(0.55, 1.45, 0, wall * 0.7, 1.2, '#3a2a1e');
    g.box(1.2, 0.9, 1.5, 1.02, 2, 5, '#8c6642');
    g.dot(1.5, 0.96, 3.5, 1.6, '#e2c79a');
    g.gable(0.16, 0.2, 1.2, 1.8, wall, h * 0.55, color, { axis: 'v', wall: WOOD, lines: 3 });
    // The plank stack.
    for (let i = 0; i < 4; i++) {
      const c = i % 2 ? '#e6c98f' : '#d8b878';
      g.box(1.48, 1.2, 1.9, 1.78, i * 2.2, i * 2.2 + 2.2, c, { top: tone(c, 1.08), outline: false });
    }
  },

  // A small hut by the shore, with a net rack and a rowing boat.
  fisherman(g, { h, color }) {
    const wall = h * 0.55;
    g.box(0.14, 0.2, 0.66, 0.74, 0, wall, PLASTER, { top: false });
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
  },

  // A field of crop rows that ripen as the cycle runs, with a small barn.
  farm(g, { h, color, progress }) {
    g.ground(0.04, 0.04, 1.96, 1.96, SOIL);
    // The barn stands at the back, so it is drawn before the rows in front of it.
    const wall = h * 0.9;
    g.box(0.12, 0.12, 0.92, 0.84, 0, wall, '#a8553d', { top: false });
    g.onLit(0.4, 0.66, 0, wall * 0.75, 0.84, DARK_WOOD);
    g.gable(0.12, 0.12, 0.92, 0.84, wall, h * 0.9, STRAW, { axis: 'u', wall: '#a8553d', lines: 2 });
    const crop = mix('#6f9a42', color, Math.min(1, progress * 1.15));
    const height = 1.5 + progress * 4;
    for (let i = 0; i < 6; i++) {
      const v = 0.2 + i * 0.3;
      // Rows level with the barn start to its right.
      g.box(v < 0.95 ? 1.05 : 0.1, v, 1.9, v + 0.16, 0, height, crop, { top: tone(crop, 1.14), outline: false });
    }
  },

  // A brick bakehouse with a tall chimney that smokes while it bakes.
  bakery(g, { h, color, working }) {
    const wall = h * 0.55;
    g.box(0.2, 0.24, 1.8, 1.72, 0, wall, BRICK, { top: false });
    for (let i = 1; i < 4; i++) g.line(g.P(0.2, 1.72, (wall * i) / 4), g.P(1.8, 1.72, (wall * i) / 4), tone(BRICK, 0.82), 0.5);
    door(g, 0.86, 1.14, wall * 0.72, 1.72);
    windowLit(g, 0.36, 0.66, wall * 0.35, wall * 0.75, 1.72, working);
    windowLit(g, 1.34, 1.64, wall * 0.35, wall * 0.75, 1.72, working);
    windowShade(g, 0.6, 0.95, wall * 0.35, wall * 0.75, 1.8, working);
    // A round bread sign over the door.
    g.dot(1.0, 1.72, wall * 0.9, 2.4, '#e2b56b', 'rgba(60, 40, 20, 0.7)');
    g.gable(0.2, 0.24, 1.8, 1.72, wall, h * 0.55, color, { axis: 'u', wall: BRICK, lines: 4 });
    chimney(g, 1.25, 0.5, wall + h * 0.25, wall + h * 0.95);
    crate(g, 0.24, 1.78, 0.16, '#c9a56a');
  },

  // A thatched cottage. Its windows glow once someone lives there.
  cottage(g, { h, color, residents, variant = 0 }) {
    const wall = h * 0.5;
    const lived = residents > 0;
    const roof = variedRoof(color, variant);
    g.box(0.3, 0.36, 1.7, 1.62, 0, wall, PLASTER, { top: false });
    door(g, 0.9, 1.12, wall * 0.8, 1.62);
    windowLit(g, 0.46, 0.72, wall * 0.35, wall * 0.8, 1.62, lived);
    windowLit(g, 1.3, 1.56, wall * 0.35, wall * 0.8, 1.62, lived);
    windowShade(g, 0.8, 1.1, wall * 0.35, wall * 0.8, 1.7, lived);
    g.gable(0.3, 0.36, 1.7, 1.62, wall, h * 0.7, roof, { axis: 'u', wall: PLASTER, overhang: 0.12, lines: 3 });
    chimney(g, variant === 1 ? 1.3 : 0.5, 0.7, wall + h * 0.3, wall + h * 0.85);
    // A little garden path, and for some a bed of flowers beside it.
    g.ground(0.9, 1.62, 1.12, 1.95, '#c9b68e');
    if (variant === 2) {
      g.ground(0.36, 1.68, 0.82, 1.92, '#7fa65a');
      g.dot(0.47, 1.8, 1, 1.1, '#e06a7a');
      g.dot(0.6, 1.76, 1, 1.1, '#f2d24b');
      g.dot(0.72, 1.82, 1, 1.1, '#e06a7a');
    }
  },

  // A taller two-storey house with a tiled roof, for Workers.
  townhouse(g, { h, color, residents, variant = 0 }) {
    const wall = h * 0.62;
    const lived = residents > 0;
    const roof = variedRoof(color, variant);
    g.box(0.26, 0.3, 1.74, 1.68, 0, wall, '#e3d2b0', { top: false });
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
    g.gable(0.26, 0.3, 1.74, 1.68, wall, h * 0.5, roof, { axis: 'u', wall: '#e3d2b0', overhang: 0.1, lines: 4 });
    chimney(g, variant === 1 ? 0.55 : 1.3, 0.6, wall + h * 0.2, wall + h * 0.75, BRICK);
    g.ground(0.9, 1.68, 1.12, 1.95, '#c9b68e');
  },

  // A fenced pasture with a few sheep and a small shelter.
  sheepfarm(g, { h, color }) {
    g.ground(0.04, 0.04, 1.96, 1.96, '#9cc27a', 'rgba(60, 90, 50, 0.35)');
    const wall = h * 0.8;
    g.box(0.14, 0.14, 0.86, 0.7, 0, wall, WOOD, { top: false });
    g.onLit(0.38, 0.62, 0, wall * 0.7, 0.7, DARK_WOOD);
    g.gable(0.14, 0.14, 0.86, 0.7, wall, h * 0.7, color, { axis: 'u', wall: WOOD, lines: 2 });
    for (const [u, v] of [[1.3, 0.5], [1.62, 0.98], [0.6, 1.25], [1.15, 1.5], [0.35, 1.66]]) sheep(g, u, v);
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
    g.box(0.22, 0.28, 1.78, 1.66, 0, wall, PLASTER, { top: false });
    g.line(g.P(0.22, 1.66, wall * 0.55), g.P(1.78, 1.66, wall * 0.55), DARK_WOOD, 0.8);
    door(g, 0.4, 0.64, wall * 0.75, 1.66);
    windowLit(g, 0.9, 1.6, wall * 0.3, wall * 0.8, 1.66, working); // the wide workshop window
    windowShade(g, 0.6, 1.0, wall * 0.35, wall * 0.8, 1.78, working);
    g.gable(0.22, 0.28, 1.78, 1.66, wall, h * 0.5, color, { axis: 'u', wall: PLASTER, overhang: 0.1, lines: 4 });
    g.post(0.3, 1.88, 0, 8, DARK_WOOD, 1);
    g.post(1.1, 1.88, 0, 8, DARK_WOOD, 1);
    g.line(g.P(0.3, 1.88, 8), g.P(1.1, 1.88, 8), DARK_WOOD, 0.8);
    ['#7d6fb3', '#c9506b', '#e0c04a'].forEach((dye, i) => g.onLit(0.36 + i * 0.24, 0.54 + i * 0.24, 2.5, 8, 1.88, dye));
    crate(g, 1.5, 1.74, 0.16, '#e8e2d0');
  },

  // A tall three-storey house on a stone ground floor, with a slate roof, for Artisans.
  guildhouse(g, { h, color, residents, variant = 0 }) {
    const wall = h * 0.68;
    const lived = residents > 0;
    const roof = variedRoof(color, variant);
    const upper = '#efe6cf';
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
    g.gable(0.22, 0.26, 1.78, 1.72, wall, h * 0.42, roof, { axis: 'u', wall: upper, overhang: 0.1, lines: 5 });
    chimney(g, 0.45, 0.55, wall + h * 0.15, wall + h * 0.62, BRICK);
    if (variant !== 1) chimney(g, 1.4, 0.55, wall + h * 0.15, wall + h * 0.62, BRICK);
    g.ground(0.88, 1.72, 1.12, 1.95, '#c9b68e');
  },

  // A paved square with three striped stalls.
  market(g, { h, color }) {
    g.ground(0.06, 0.06, 1.94, 1.94, PAVING, 'rgba(90, 75, 50, 0.4)');
    const cream = '#f3ead2';
    const stall = (u0, v0, u1, v1, goods) => {
      g.box(u0 + 0.04, v0 + 0.04, u1 - 0.04, v1 - 0.04, 0, h * 0.28, '#a67c52');
      g.dot((u0 + u1) / 2 - 0.1, v1 - 0.12, h * 0.28 + 1, 1.5, goods);
      g.dot((u0 + u1) / 2 + 0.1, v1 - 0.12, h * 0.28 + 1, 1.5, goods);
      for (const [u, v] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) g.post(u, v, 0, h * 0.6, DARK_WOOD, 1);
      g.pyramid(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, h * 0.6, h * 0.45, color, cream);
    };
    stall(0.14, 0.14, 0.86, 0.74, '#d98c3a');
    stall(1.12, 0.14, 1.86, 0.74, '#7fb069');
    stall(0.5, 1.12, 1.5, 1.8, '#5aa7d6');
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
};

// Moving parts, drawn fresh every frame on top of the building.
export const LIVE_ART = {
  // Smoke from the chimney while baking.
  bakery(g, { h, working, time }) {
    if (working) smoke(g, 1.25, 0.5, h * 0.55 + h * 0.95, time);
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
