// The plain box: what a building looks like when it has no drawn art.
// A building added in the data files with no "art" entry gets this, so it
// still shows up, labelled with the first two letters of its name.

import { footprintCorners, tileToWorld } from '../iso.js';
import { tone } from './kit.js';

export function paintBox(ctx, x, y, size, visual, lineWidth = 1, showLabel = true) {
  const { color, risePx, label } = visual;
  const [n, e, s, west] = footprintCorners(x, y, size.w, size.h);
  const up = (p) => ({ x: p.x, y: p.y - risePx });
  const face = (points, fill) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = tone(color, 0.45);
  face([west, s, up(s), up(west)], tone(color, 0.8));
  face([s, e, up(e), up(s)], tone(color, 0.62));
  face([up(n), up(e), up(s), up(west)], color);

  if (showLabel && label) {
    const centre = tileToWorld(x + size.w / 2, y + size.h / 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.font = `600 ${size.w > 1 ? 15 : 10}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, centre.x, centre.y - risePx);
  }
}
