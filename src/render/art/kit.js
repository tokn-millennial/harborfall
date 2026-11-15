// A small drawing kit for building art.
//
// Art is described in "building space": u runs along the tile x axis and v
// along the tile y axis, both measured in tiles from the building's top-left
// corner, and z is height in pixels. The kit turns that into isometric screen
// shapes, with light coming from the left: faces toward the lower left are
// lit, faces toward the lower right are in shade.

import { tileToWorld } from '../iso.js';

// "#rrggbb" made darker (below 1) or lighter (above 1).
export function tone(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

// A color part of the way from one hex color to another (t from 0 to 1).
export function mix(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const channel = (shift) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  // Returned as hex, so the result can be passed to tone() or mixed again.
  return `#${((1 << 24) | (channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).slice(1)}`;
}

// A repeatable number from 0 to 1 for a pair of whole numbers. Used to vary
// tiles and trees without any randomness that could change between frames.
export function hash2(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const SHADE = { lit: 1, shade: 0.72, top: 1.1 };
const OUTLINE = 'rgba(40, 28, 20, 0.55)';

export function createKit(ctx, originX, originY) {
  const P = (u, v, z = 0) => {
    const w = tileToWorld(originX + u, originY + v);
    return { x: w.x, y: w.y - z };
  };

  function poly(points, fill, stroke = OUTLINE, width = 0.7) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  // A fill that runs from one color at point `a` to another at point `b`.
  function fade(a, b, from, to) {
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    return g;
  }

  // Many short strokes in one color, drawn as one path.
  function strokes(segments, stroke, width) {
    if (segments.length === 0) return;
    ctx.beginPath();
    for (const [a, b] of segments) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function line(a, b, stroke, width = 0.7) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  const kit = {
    P,
    poly,
    line,

    // A flat patch on the ground.
    ground(u0, v0, u1, v1, fill, stroke = null) {
      poly([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], fill, stroke);
    },

    // A box. Only the three faces the viewer can see are drawn.
    // options.top: a color for the top, or false to leave it off (under a roof).
    // options.outline: false for small things, where outlines would swamp the shape.
    // options.base: a color for a low band along the foot of the walls, such
    // as a stone footing under a house, `baseHeight` pixels tall (2.4).
    box(u0, v0, u1, v1, z0, z1, color, options = {}) {
      const stroke = options.outline === false ? null : OUTLINE;
      // Walls of any height darken a little toward the ground.
      const tall = z1 - z0 >= 6 && options.outline !== false;
      const lit = tall ? fade(P(u0, v1, z1), P(u0, v1, z0), tone(color, SHADE.lit), tone(color, SHADE.lit * 0.88)) : tone(color, SHADE.lit);
      const shade = tall ? fade(P(u1, v1, z1), P(u1, v1, z0), tone(color, SHADE.shade), tone(color, SHADE.shade * 0.86)) : tone(color, SHADE.shade);
      poly([P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)], lit, stroke);
      poly([P(u1, v1, z0), P(u1, v0, z0), P(u1, v0, z1), P(u1, v1, z1)], shade, stroke);
      if (options.top !== false) poly([P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], options.top ?? tone(color, SHADE.top), stroke);
      if (options.base) {
        const b = z0 + (options.baseHeight ?? 2.4);
        poly([P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, b), P(u0, v1, b)], tone(options.base, SHADE.lit * 0.95), stroke, 0.5);
        poly([P(u1, v1, z0), P(u1, v0, z0), P(u1, v0, b), P(u1, v1, b)], tone(options.base, SHADE.shade * 0.95), stroke, 0.5);
      }
    },

    // A rectangle on the lit wall (the plane v = constant).
    onLit(u0, u1, z0, z1, v, fill, stroke = OUTLINE) {
      poly([P(u0, v, z0), P(u1, v, z0), P(u1, v, z1), P(u0, v, z1)], fill, stroke, 0.5);
    },

    // A rectangle on the shaded wall (the plane u = constant).
    onShade(v0, v1, z0, z1, u, fill, stroke = OUTLINE) {
      poly([P(u, v0, z0), P(u, v1, z0), P(u, v1, z1), P(u, v0, z1)], fill, stroke, 0.5);
    },

    // A pitched roof over the rectangle, starting at height z and rising to a
    // ridge. axis 'u' runs the ridge along u; axis 'v' runs it along v.
    // `wall` is the color of the triangular wall under the visible gable end.
    // Each slope is lightest at the ridge and darker toward the eaves, laid in
    // rows (`lines` of them) with the joints of each row offset from the next,
    // and finished with a dark eave edge.
    //
    // The overhang casts a soft shadow on the walls just below it (`eaves`,
    // on by default), and the visible gable end has a darker trim along its edge.
    gable(u0, v0, u1, v1, z, rise, color, { axis = 'u', wall = null, overhang = 0.08, lines = 3, eaves = true } = {}) {
      const o = overhang;
      if (eaves) {
        poly([P(u0, v1, z - 2.8), P(u1, v1, z - 2.8), P(u1, v1, z), P(u0, v1, z)], 'rgba(35, 22, 12, 0.18)', null);
        poly([P(u1, v1, z - 1.8), P(u1, v0, z - 1.8), P(u1, v0, z), P(u1, v1, z)], 'rgba(20, 12, 6, 0.16)', null);
      }
      const rows = lines + 1;
      const joints = [];
      const courses = [];
      // Adds the joints between tiles on one slope. along(a, t) gives the point a
      // distance `a` along the ridge and a share `t` of the way down the slope.
      const tiles = (from, to, along) => {
        for (let r = 0; r < rows; r++) {
          const t0 = r / rows;
          const t1 = (r + 1) / rows;
          if (r > 0) courses.push([along(from, t0), along(to, t0)]);
          for (let a = from + (r % 2 ? 0.12 : 0.24); a < to - 0.05; a += 0.24) joints.push([along(a, t0 + 0.04), along(a, t1)]);
        }
      };
      if (axis === 'u') {
        const vm = (v0 + v1) / 2;
        const drop = (o * rise) / (vm - v0);
        const ridge = (u) => P(u, vm, z + rise);
        if (wall) poly([P(u1, v0, z), P(u1, v1, z), P(u1, vm, z + rise)], tone(wall, SHADE.shade));
        poly([P(u0 - o, v0 - o, z - drop), P(u1 + o, v0 - o, z - drop), P(u1 + o, vm, z + rise), P(u0 - o, vm, z + rise)],
          fade(ridge(u0), P(u0, v0 - o, z - drop), tone(color, 0.84), tone(color, 0.72)));
        poly([P(u0 - o, v1 + o, z - drop), P(u1 + o, v1 + o, z - drop), P(u1 + o, vm, z + rise), P(u0 - o, vm, z + rise)],
          fade(ridge(u0), P(u0, v1 + o, z - drop), tone(color, 1.1), tone(color, 0.9)));
        tiles(u0 - o, u1 + o, (u, t) => P(u, vm + (v1 + o - vm) * t, z + rise - (rise + drop) * t));
        strokes(courses, tone(color, 0.76), 0.6);
        strokes(joints, tone(color, 0.84), 0.4);
        line(P(u0 - o, v1 + o, z - drop), P(u1 + o, v1 + o, z - drop), tone(color, 0.55), 1.1);
        line(P(u0 - o, vm, z + rise), P(u1 + o, vm, z + rise), tone(color, 1.3), 1.1);
        // The trim along the gable end.
        strokes([[P(u1 + o, v0 - o, z - drop), P(u1 + o, vm, z + rise)], [P(u1 + o, vm, z + rise), P(u1 + o, v1 + o, z - drop)]], tone(color, 0.5), 1.2);
      } else {
        const um = (u0 + u1) / 2;
        const drop = (o * rise) / (um - u0);
        const ridge = (v) => P(um, v, z + rise);
        if (wall) poly([P(u0, v1, z), P(u1, v1, z), P(um, v1, z + rise)], tone(wall, SHADE.lit));
        poly([P(u0 - o, v0 - o, z - drop), P(u0 - o, v1 + o, z - drop), P(um, v1 + o, z + rise), P(um, v0 - o, z + rise)],
          fade(ridge(v0), P(u0 - o, v0, z - drop), tone(color, 1.12), tone(color, 0.94)));
        poly([P(u1 + o, v0 - o, z - drop), P(u1 + o, v1 + o, z - drop), P(um, v1 + o, z + rise), P(um, v0 - o, z + rise)],
          fade(ridge(v0), P(u1 + o, v0, z - drop), tone(color, 0.84), tone(color, 0.68)));
        tiles(v0 - o, v1 + o, (v, t) => P(um + (u1 + o - um) * t, v, z + rise - (rise + drop) * t));
        strokes(courses, tone(color, 0.6), 0.6);
        strokes(joints, tone(color, 0.66), 0.4);
        line(P(u1 + o, v0 - o, z - drop), P(u1 + o, v1 + o, z - drop), tone(color, 0.5), 1.1);
        line(P(um, v0 - o, z + rise), P(um, v1 + o, z + rise), tone(color, 1.3), 1.1);
        strokes([[P(u0 - o, v1 + o, z - drop), P(um, v1 + o, z + rise)], [P(um, v1 + o, z + rise), P(u1 + o, v1 + o, z - drop)]], tone(color, 0.5), 1.2);
      }
    },

    // A dormer: a small upright window in the near slope of a roof drawn with
    // gable(..., { axis: 'u' }), with its own little roof. `roof` is that
    // roof: { v0, v1, z, rise, overhang }. The dormer spans u0 to u1, its front
    // stands at `at` (a v between the ridge and the eave, or the wall itself,
    // v1, for a gable rising straight up from the wall), `height` pixels tall.
    dormer(roof, u0, u1, { at, height, rise, color, wall, window = null }) {
      const o = roof.overhang ?? 0.08;
      const vm = (roof.v0 + roof.v1) / 2;
      const drop = (o * roof.rise) / (vm - roof.v0);
      const eave = roof.v1 + o;
      // The height of the roof's near slope at v.
      const roofZ = (v) => roof.z + roof.rise - ((roof.rise + drop) * (v - vm)) / (eave - vm);
      const footZ = Math.min(roof.z, roofZ(at));
      const topZ = footZ + height;
      // Where the dormer's top meets the slope behind it.
      const back = Math.max(vm, vm + ((roof.z + roof.rise - topZ) * (eave - vm)) / (roof.rise + drop));
      poly([P(u0, at, footZ), P(u1, at, footZ), P(u1, at, topZ), P(u0, at, topZ)], tone(wall, SHADE.lit));
      if (back < at) poly([P(u1, at, footZ), P(u1, at, topZ), P(u1, back, topZ)], tone(wall, SHADE.shade));
      if (window) {
        const inset = (u1 - u0) * 0.28;
        window(u0 + inset, u1 - inset, footZ + height * 0.2, footZ + height * 0.82, at);
      }
      kit.gable(u0, back, u1, at, topZ, rise, color, { axis: 'v', wall, overhang: 0.05, lines: 1, eaves: false });
    },

    // A four-sided roof coming to a point, for tents and awnings.
    pyramid(u0, v0, u1, v1, z, rise, colorA, colorB = colorA) {
      const apex = P((u0 + u1) / 2, (v0 + v1) / 2, z + rise);
      poly([P(u0, v0, z), P(u1, v0, z), apex], tone(colorB, 0.8));
      poly([P(u0, v0, z), P(u0, v1, z), apex], tone(colorA, 0.95));
      poly([P(u0, v1, z), P(u1, v1, z), apex], tone(colorA, 1.05));
      poly([P(u1, v1, z), P(u1, v0, z), apex], tone(colorB, 0.72));
    },

    // A thin upright post.
    post(u, v, z0, z1, color, width = 1.4) {
      line(P(u, v, z0), P(u, v, z1), color, width);
    },

    // A round blob at a point in building space.
    dot(u, v, z, radius, fill, stroke = null) {
      const p = P(u, v, z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    },

    // An upright round thing, such as a barrel: a body lit on the left and
    // shaded on the right, a lighter top, and `hoops` bands round it.
    // `r` is its radius in pixels across the screen.
    cylinder(u, v, z0, z1, r, color, { hoops = 0, top = null } = {}) {
      const b = P(u, v, z0);
      const t = P(u, v, z1);
      const ry = r * 0.5;
      ctx.beginPath();
      ctx.moveTo(b.x - r, t.y);
      ctx.lineTo(b.x - r, b.y);
      ctx.ellipse(b.x, b.y, r, ry, 0, Math.PI, 0, true);
      ctx.lineTo(b.x + r, t.y);
      ctx.ellipse(t.x, t.y, r, ry, 0, 0, Math.PI, true);
      ctx.closePath();
      const side = ctx.createLinearGradient(b.x - r, 0, b.x + r, 0);
      side.addColorStop(0, tone(color, 1.08));
      side.addColorStop(0.45, tone(color, 0.95));
      side.addColorStop(1, tone(color, 0.66));
      ctx.fillStyle = side;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      for (let i = 1; i <= hoops; i++) {
        const y = b.y + ((t.y - b.y) * i) / (hoops + 1);
        ctx.beginPath();
        ctx.ellipse(b.x, y, r, ry, 0, Math.PI, 0, true);
        ctx.strokeStyle = tone(color, 0.55);
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, r, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = top ?? tone(color, 1.18);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    },

    // A dome standing on the ground plane at height z: round at the front,
    // `rise` pixels tall, lit from the left.
    dome(u, v, z, r, rise, color) {
      const p = P(u, v, z);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI);
      ctx.ellipse(p.x, p.y, r, rise, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      const light = ctx.createLinearGradient(p.x - r, p.y - rise, p.x + r, p.y);
      light.addColorStop(0, tone(color, 1.15));
      light.addColorStop(1, tone(color, 0.68));
      ctx.fillStyle = light;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    },

    // A flat oval on the ground, for shadows and barrel tops.
    oval(u, v, z, rx, ry, fill) {
      const p = P(u, v, z);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    },
  };
  return kit;
}
