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
    box(u0, v0, u1, v1, z0, z1, color, options = {}) {
      const stroke = options.outline === false ? null : OUTLINE;
      poly([P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)], tone(color, SHADE.lit), stroke);
      poly([P(u1, v1, z0), P(u1, v0, z0), P(u1, v0, z1), P(u1, v1, z1)], tone(color, SHADE.shade), stroke);
      if (options.top !== false) poly([P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], options.top ?? tone(color, SHADE.top), stroke);
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
    gable(u0, v0, u1, v1, z, rise, color, { axis = 'u', wall = null, overhang = 0.08, lines = 3 } = {}) {
      const o = overhang;
      if (axis === 'u') {
        const vm = (v0 + v1) / 2;
        const drop = (o * rise) / (vm - v0);
        if (wall) poly([P(u1, v0, z), P(u1, v1, z), P(u1, vm, z + rise)], tone(wall, SHADE.shade));
        poly([P(u0 - o, v0 - o, z - drop), P(u1 + o, v0 - o, z - drop), P(u1 + o, vm, z + rise), P(u0 - o, vm, z + rise)], tone(color, 0.78));
        poly([P(u0 - o, v1 + o, z - drop), P(u1 + o, v1 + o, z - drop), P(u1 + o, vm, z + rise), P(u0 - o, vm, z + rise)], tone(color, 1));
        for (let i = 1; i <= lines; i++) {
          const t = i / (lines + 1);
          const v = vm + (v1 + o - vm) * t;
          const h = z + rise - (rise + drop) * t;
          line(P(u0 - o, v, h), P(u1 + o, v, h), tone(color, 0.8), 0.6);
        }
        line(P(u0 - o, vm, z + rise), P(u1 + o, vm, z + rise), tone(color, 1.25), 1);
      } else {
        const um = (u0 + u1) / 2;
        const drop = (o * rise) / (um - u0);
        if (wall) poly([P(u0, v1, z), P(u1, v1, z), P(um, v1, z + rise)], tone(wall, SHADE.lit));
        poly([P(u0 - o, v0 - o, z - drop), P(u0 - o, v1 + o, z - drop), P(um, v1 + o, z + rise), P(um, v0 - o, z + rise)], tone(color, 1.05));
        poly([P(u1 + o, v0 - o, z - drop), P(u1 + o, v1 + o, z - drop), P(um, v1 + o, z + rise), P(um, v0 - o, z + rise)], tone(color, 0.76));
        for (let i = 1; i <= lines; i++) {
          const t = i / (lines + 1);
          const u = um + (u1 + o - um) * t;
          const h = z + rise - (rise + drop) * t;
          line(P(u, v0 - o, h), P(u, v1 + o, h), tone(color, 0.62), 0.6);
        }
        line(P(um, v0 - o, z + rise), P(um, v1 + o, z + rise), tone(color, 1.25), 1);
      }
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
