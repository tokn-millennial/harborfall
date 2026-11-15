// Buildings are drawn once into small pictures ("sprites") and reused.
//
// Drawing a building shape by shape takes dozens of steps. Doing that for
// every building on every frame is slow. Instead each distinct look is drawn
// once, at the sharpness the current zoom needs, and after that showing it is
// a single step. When the zoom moves to a different sharpness the pictures are
// thrown away and made again as they are needed.

import { createKit } from './kit.js';

const MARGIN = 14; // room around the footprint for roof overhangs and props

// How sharp the pictures need to be for a given number of screen pixels per
// world pixel. A few fixed steps, so zooming does not remake them constantly.
// The steps are close enough that a picture is never shown at less than about
// half its size, which keeps the browser's cheapest smoothing looking clean.
export function sharpnessFor(scale) {
  if (scale <= 0.6) return 0.6;
  if (scale <= 1) return 1;
  if (scale <= 2) return 2;
  if (scale <= 3) return 3;
  return 4.5;
}

export function createSpriteCache() {
  let sharpness = 0;
  const pictures = new Map();

  return {
    get size() {
      return pictures.size;
    },
    // key       the same text for the same look
    // w, h      the footprint in tiles
    // risePx    the building's height from the data
    // paint(g)  draws it with a kit placed at tile (0, 0)
    // through    optional: a function that wraps the picture's canvas before
    //            painting, such as lightsOnly below
    get(key, w, h, risePx, wantedSharpness, paint, through = null) {
      if (wantedSharpness !== sharpness) {
        pictures.clear();
        sharpness = wantedSharpness;
      }
      let picture = pictures.get(key);
      if (!picture) {
        // The space a building can draw in, in world pixels around its top corner.
        const left = -h * 32 - MARGIN;
        const right = w * 32 + MARGIN;
        const top = -risePx * 1.7 - MARGIN;
        const bottom = (w + h) * 16 + MARGIN;
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil((right - left) * sharpness);
        canvas.height = Math.ceil((bottom - top) * sharpness);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(sharpness, 0, 0, sharpness, -left * sharpness, -top * sharpness);
        paint(createKit(through ? through(ctx) : ctx, 0, 0));
        picture = { canvas, left, top, width: right - left, height: bottom - top };
        pictures.set(key, picture);
      }
      return picture;
    },
  };
}

// A canvas that paints only lights: any color for which isLight(color) is
// false is painted black instead, keeping how see-through it was. Drawn with
// the "lighter" blend, black adds nothing, so only the lights show, and
// whatever stands in front of a light still hides it.
export function lightsOnly(ctx, isLight) {
  const dark = (value) => {
    if (typeof value === 'string' && isLight(value)) return value;
    const alpha = typeof value === 'string' ? value.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)$/) : null;
    return alpha ? `rgba(0, 0, 0, ${alpha[1]})` : '#000000';
  };
  return new Proxy(ctx, {
    get(target, key) {
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, key, value) {
      target[key] = key === 'fillStyle' || key === 'strokeStyle' ? dark(value) : value;
      return true;
    },
  });
}
