// Draws the puffs of dust for buildings that have just appeared or gone.
// `effects` is what createBuildEffects().update() returned.

import { tileToWorld } from '../iso.js';

export function paintDust(ctx, effects) {
  for (const e of effects) {
    const gone = e.kind === 'removed';
    const centre = tileToWorld(e.x + e.w / 2, e.y + e.h / 2);
    const reach = (e.w + e.h) * 9;                 // how far the dust spreads, in pixels
    const spread = reach * (0.45 + 0.55 * e.age);  // it rolls outward
    const alpha = (gone ? 0.55 : 0.42) * (1 - e.age);
    const puffs = gone ? 8 : 6;
    ctx.fillStyle = `rgba(214, 200, 170, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < puffs; i++) {
      const angle = (i / puffs) * Math.PI * 2 + e.id;
      const x = centre.x + Math.cos(angle) * spread;
      const y = centre.y + Math.sin(angle) * spread * 0.5 - e.age * (gone ? 10 : 5);
      const size = 3 + e.age * (gone ? 9 : 6);
      ctx.moveTo(x + size, y);
      ctx.ellipse(x, y, size, size * 0.7, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}
