// Draws the life on the map: walkers, carts and boats. Each is a handful of
// small rectangles, because there may be dozens on screen and they are tiny.
//
// An actor's x and y are in tiles (see src/render/life.js). Its feet, wheels
// or keel are drawn at that point on the ground.

import { tileToWorld } from '../iso.js';
import { CLIFF } from './terrain.js';

const SKIN = '#e8c39e';
const LEGS = '#3b2f2a';
const SHADOW = 'rgba(15, 35, 20, 0.26)';
// Clothes by kind of resident: tunic colors, then the hat.
const CLOTHES = {
  farmer: { tunics: ['#b08a4a', '#8a9a5b', '#a8683e', '#c9b27a'], hat: '#e0c878' },
  worker: { tunics: ['#3f6f9a', '#9a4a3f', '#5d5d80', '#4a7d6a'], hat: '#33343d' },
};
const PLAIN = { tunics: ['#8c7a5c'], hat: '#5a4a3a' };
const CART = { body: '#8a5f3a', rim: '#6b4729', wheel: '#33271f' };
const BOAT = { hull: '#7a5236', rim: '#a87a52', ripple: 'rgba(255, 255, 255, 0.5)', line: 'rgba(40, 40, 40, 0.7)' };

// One person standing at (x, y) in world pixels. `stride` moves the legs.
function person(ctx, x, y, clothes, look, stride) {
  const step = Math.floor(stride * 6) % 2;
  ctx.fillStyle = LEGS;
  // One foot is always off the ground.
  ctx.fillRect(x - 1.6, y - 2.6, 1.3, 2.6 - step);
  ctx.fillRect(x + 0.3, y - 2.6, 1.3, 1.6 + step);
  ctx.fillStyle = clothes.tunics[look % clothes.tunics.length];
  ctx.fillRect(x - 2.1, y - 7, 4.2, 4.4);
  ctx.fillStyle = SKIN;
  ctx.fillRect(x - 1.5, y - 9.6, 3, 2.6);
  ctx.fillStyle = clothes.hat;
  ctx.fillRect(x - 2, y - 10.6, 4, 1.3);
}

function walker(ctx, a) {
  const p = tileToWorld(a.x, a.y);
  ctx.fillStyle = SHADOW;
  ctx.fillRect(p.x - 2.8, p.y - 0.9, 5.6, 1.8);
  person(ctx, p.x, p.y, CLOTHES[a.tier] ?? PLAIN, a.look, a.stride);
}

function cart(ctx, a, goodColor) {
  const p = tileToWorld(a.x, a.y);
  // The way it is heading, as a direction on screen.
  const sx = (a.dx - a.dy) * 2;
  const sy = a.dx + a.dy;
  const length = Math.hypot(sx, sy) || 1;
  // The carter walks behind and pushes.
  person(ctx, p.x - (sx / length) * 7, p.y - (sy / length) * 3.5, PLAIN, a.look, a.stride);
  ctx.fillStyle = SHADOW;
  ctx.fillRect(p.x - 5, p.y - 0.8, 10, 2);
  ctx.fillStyle = CART.wheel;
  ctx.fillRect(p.x - 4.2, p.y - 2.4, 2.4, 2.4);
  ctx.fillRect(p.x + 1.8, p.y - 2.4, 2.4, 2.4);
  ctx.fillStyle = CART.body;
  ctx.fillRect(p.x - 4.6, p.y - 5.6, 9.2, 3.6);
  ctx.fillStyle = CART.rim;
  ctx.fillRect(p.x - 4.6, p.y - 2.8, 9.2, 0.8);
  ctx.fillStyle = goodColor;
  ctx.fillRect(p.x - 3.6, p.y - 8, 7.2, 2.6);
}

function boat(ctx, a, time) {
  const p = tileToWorld(a.x, a.y);
  const x = p.x;
  const y = p.y + CLIFF + Math.sin(time * 1.8 + a.look) * 0.7; // on the water, bobbing
  const facing = a.dx - a.dy >= 0 ? 1 : -1;
  ctx.fillStyle = BOAT.ripple;
  ctx.fillRect(x - 11, y + 2.6, 6, 0.8);
  ctx.fillRect(x + 5, y + 3.2, 6, 0.8);
  ctx.fillStyle = BOAT.hull;
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 1.5);
  ctx.lineTo(x + 9, y - 1.5);
  ctx.lineTo(x + 6.5, y + 2.4);
  ctx.lineTo(x - 6.5, y + 2.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BOAT.rim;
  ctx.fillRect(x - 9, y - 2.4, 18, 1.1);
  if (!a.manned) return;
  // The fisherman sits in the boat: no legs showing.
  ctx.fillStyle = CLOTHES.worker.tunics[0];
  ctx.fillRect(x - 2.1 - facing, y - 6.6, 4.2, 4.2);
  ctx.fillStyle = SKIN;
  ctx.fillRect(x - 1.5 - facing, y - 9.2, 3, 2.6);
  ctx.fillStyle = CLOTHES.farmer.hat;
  ctx.fillRect(x - 2.2 - facing, y - 10.2, 4.4, 1.3);
  if (a.fishing) {
    // A rod over the side, and its line down to the water.
    ctx.fillStyle = BOAT.line;
    for (let i = 0; i < 5; i++) ctx.fillRect(x + facing * (2 + i * 2) - 0.5, y - 6 - i * 0.9, 2, 0.8);
    ctx.fillRect(x + facing * 11 - 0.3, y - 9.6, 0.6, 12);
  }
}

// Draws a list of actors, far to near as given. `goods` is rules.goods, for
// the color of what a cart carries. `time` is in seconds, for bobbing.
export function paintActors(ctx, actors, goods, time) {
  for (const a of actors) {
    if (a.kind === 'walker') walker(ctx, a);
    else if (a.kind === 'cart') cart(ctx, a, goods[a.good]?.color ?? '#b9a47a');
    else if (a.kind === 'boat') boat(ctx, a, time);
  }
}
