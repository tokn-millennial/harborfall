// Small pictures of buildings for the build menu, drawn with the same art as
// the map so the two always match.

import { tileToWorld } from '../iso.js';
import { buildingVisual } from '../visuals.js';
import { createKit, tone } from './kit.js';
import { artFor } from './buildings.js';
import { paintBox } from './box.js';

export function drawBuildingIcon(canvas, rules, type, width = 54, height = 38) {
  const def = rules.buildings[type];
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');

  // A stand-in building at tile (0, 0). A house is shown lived-in, with lit windows.
  const fake = { type, x: 0, y: 0, house: def.housingTier ? { tier: def.housingTier, residents: 1 } : undefined };
  const visual = buildingVisual(rules, fake);

  // Fit the footprint and the height above it into the canvas.
  const left = -def.h * 32 - 3;
  const right = def.w * 32 + 3;
  const top = -visual.risePx * 1.35 - 6;
  const bottom = (def.w + def.h) * 16 + 3;
  const scale = Math.min(width / (right - left), height / (bottom - top));
  const offsetX = (width - (right - left) * scale) / 2 - left * scale;
  const offsetY = (height - (bottom - top) * scale) / 2 - top * scale;
  ctx.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * offsetX, ratio * offsetY);

  if (def.category === 'road') {
    // A short stretch of road with a side branch.
    const color = def.visual?.color ?? '#c9b78f';
    const quad = (u0, v0, u1, v1, fill) => {
      const p = [tileToWorld(u0, v0), tileToWorld(u1, v0), tileToWorld(u1, v1), tileToWorld(u0, v1)];
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (const q of p.slice(1)) ctx.lineTo(q.x, q.y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    quad(0, 0.22, 1, 0.78, tone(color, 0.7));
    quad(0.22, 0.5, 0.78, 1, tone(color, 0.7));
    quad(0, 0.3, 1, 0.7, color);
    quad(0.3, 0.5, 0.7, 1, color);
    return;
  }

  const art = artFor(rules, fake);
  if (art) art(createKit(ctx, 0, 0), { h: visual.risePx, color: visual.color, working: false, progress: 0.8, residents: 1, time: 0 });
  else paintBox(ctx, 0, 0, def, visual, 1, false);
}
