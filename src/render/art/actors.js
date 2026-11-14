// Draws the life on the map: walkers, carts, boats and trade ships. Each is a handful of
// small rectangles, because there may be dozens on screen and they are tiny.
//
// An actor's x and y are in tiles (see src/render/life.js). Its feet, wheels
// or keel are drawn at that point on the ground.

import { tileToWorld } from '../iso.js';
import { CLIFF } from './terrain.js';

const SKIN = '#e8c39e';
const LEGS = '#3b2f2a';
const SHADOW = 'rgba(15, 35, 20, 0.26)';
const SIDE_SHADE = 'rgba(0, 0, 0, 0.18)'; // the right side of a figure, away from the sun
const WATER_SHADOW = 'rgba(10, 40, 60, 0.25)';
// Clothes by kind of resident: tunic colors, then the hat.
const CLOTHES = {
  farmer: { tunics: ['#b08a4a', '#8a9a5b', '#a8683e', '#c9b27a'], hat: '#e0c878' },
  worker: { tunics: ['#3f6f9a', '#9a4a3f', '#5d5d80', '#4a7d6a'], hat: '#33343d' },
  artisan: { tunics: ['#7d6fb3', '#5d6f8c', '#8c4f6f', '#3f7a6a'], hat: '#c9a55a' },
};
const PLAIN = { tunics: ['#8c7a5c'], hat: '#5a4a3a' };
const CART = { body: '#8a5f3a', rim: '#6b4729', wheel: '#33271f' };
const BOAT = { hull: '#7a5236', rim: '#a87a52', ripple: 'rgba(255, 255, 255, 0.5)', line: 'rgba(40, 40, 40, 0.7)' };

// A soft oval shadow on the ground, falling a little to the right.
function groundShadow(ctx, x, y, rx, ry, color = SHADOW) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x + 1, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// One person standing at (x, y) in world pixels. `stride` moves the legs and arms.
function person(ctx, x, y, clothes, look, stride) {
  const step = Math.floor(stride * 6) % 2;
  const tunic = clothes.tunics[look % clothes.tunics.length];
  ctx.fillStyle = LEGS;
  // One foot is always off the ground.
  ctx.fillRect(x - 1.6, y - 2.6, 1.3, 2.6 - step);
  ctx.fillRect(x + 0.3, y - 2.6, 1.3, 1.6 + step);
  // Arms swing opposite to the legs.
  ctx.fillStyle = tunic;
  ctx.fillRect(x - 2.9, y - 6.6 + step * 0.6, 0.9, 3.2);
  ctx.fillRect(x + 2, y - 6 - step * 0.6, 0.9, 3.2);
  ctx.fillRect(x - 2.1, y - 7, 4.2, 4.4);
  ctx.fillStyle = SKIN;
  ctx.fillRect(x - 1.5, y - 9.6, 3, 2.6);
  ctx.fillStyle = clothes.hat;
  ctx.fillRect(x - 2, y - 10.6, 4, 1.3);
  ctx.fillStyle = SIDE_SHADE;
  ctx.fillRect(x + 0.4, y - 9.6, 1.1, 2.6);
  ctx.fillRect(x + 0.6, y - 7, 1.5, 4.4);
}

function walker(ctx, a) {
  const p = tileToWorld(a.x, a.y);
  groundShadow(ctx, p.x, p.y, 3, 1.1);
  person(ctx, p.x, p.y, CLOTHES[a.tier] ?? PLAIN, a.look, a.stride);
}

// A round wheel with a hub.
function wheel(ctx, x, y) {
  ctx.fillStyle = CART.wheel;
  ctx.beginPath();
  ctx.arc(x, y, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CART.rim;
  ctx.fillRect(x - 0.4, y - 0.4, 0.8, 0.8);
}

function cart(ctx, a, goodColor) {
  const p = tileToWorld(a.x, a.y);
  // The way it is heading, as a direction on screen.
  const sx = (a.dx - a.dy) * 2;
  const sy = a.dx + a.dy;
  const length = Math.hypot(sx, sy) || 1;
  // The carter walks behind and pushes.
  const cx = p.x - (sx / length) * 7;
  const cy = p.y - (sy / length) * 3.5;
  groundShadow(ctx, cx, cy, 2.8, 1);
  person(ctx, cx, cy, PLAIN, a.look, a.stride);
  groundShadow(ctx, p.x, p.y, 6, 1.6);
  ctx.fillStyle = CART.body;
  ctx.fillRect(p.x - 4.6, p.y - 5.6, 9.2, 3.6);
  ctx.fillStyle = SIDE_SHADE;
  ctx.fillRect(p.x + 1.5, p.y - 5.6, 3.1, 3.6);
  ctx.fillStyle = CART.rim;
  ctx.fillRect(p.x - 4.6, p.y - 5.6, 9.2, 0.7);
  ctx.fillRect(p.x - 4.6, p.y - 2.8, 9.2, 0.8);
  wheel(ctx, p.x - 3, p.y - 1.4);
  wheel(ctx, p.x + 3, p.y - 1.4);
  // The load, in the color of the good, with its top catching the light. An
  // empty cart, on its way out, has none.
  if (!goodColor) return;
  ctx.fillStyle = goodColor;
  ctx.fillRect(p.x - 3.6, p.y - 8.2, 7.2, 2.8);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillRect(p.x - 3.6, p.y - 8.2, 7.2, 0.9);
  ctx.fillStyle = SIDE_SHADE;
  ctx.fillRect(p.x + 1.2, p.y - 7.3, 2.4, 1.9);
}

function boat(ctx, a, time) {
  const p = tileToWorld(a.x, a.y);
  const x = p.x;
  const y = p.y + CLIFF + Math.sin(time * 1.8 + a.look) * 0.7; // on the water, bobbing
  const facing = a.dx - a.dy >= 0 ? 1 : -1;
  groundShadow(ctx, x, y + 2.6, 10, 2, WATER_SHADOW);
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
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(x - 7.5, y + 0.8, 15, 1.6);
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

// The trade ship: a two-masted trader with cream sails, larger than a fishing boat.
const SHIP = { hull: '#5e3d27', band: '#d9b46a', deck: '#9a7350', sail: '#f3ead2', stripe: '#3d6f8f', mast: '#4a3322' };
function ship(ctx, a, time) {
  const p = tileToWorld(a.x, a.y);
  const x = p.x;
  const y = p.y + CLIFF + Math.sin(time * 1.2 + a.look) * (a.docked ? 0.4 : 1);
  const facing = a.dx - a.dy >= 0 ? 1 : -1;
  // A wake behind it while it moves.
  ctx.fillStyle = BOAT.ripple;
  if (!a.docked) {
    ctx.fillRect(x - facing * 26 - 5, y + 4, 10, 0.9);
    ctx.fillRect(x - facing * 34 - 4, y + 5.4, 8, 0.8);
  }
  ctx.fillRect(x - 18, y + 5.2, 7, 0.8);
  ctx.fillRect(x + 12, y + 5.6, 7, 0.8);
  // Its shadow on the water, then the hull, its painted band, and the deck.
  groundShadow(ctx, x, y + 5, 24, 3.5, WATER_SHADOW);
  ctx.fillStyle = SHIP.hull;
  ctx.beginPath();
  ctx.moveTo(x - 20 * facing, y - 3);
  ctx.lineTo(x + 24 * facing, y - 4);
  ctx.lineTo(x + 16 * facing, y + 4.5);
  ctx.lineTo(x - 16 * facing, y + 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.fillRect(x - 16, y + 2, 32, 2.5);
  ctx.fillStyle = SHIP.band;
  ctx.fillRect(Math.min(x - 19 * facing, x + 22 * facing), y - 1.2, 41, 1.1);
  // A row of small windows along the band.
  ctx.fillStyle = 'rgba(40, 25, 15, 0.8)';
  for (let i = -3; i <= 3; i++) ctx.fillRect(x + i * 4.5 - 0.8, y + 0.6, 1.6, 1.2);
  ctx.fillStyle = SHIP.deck;
  ctx.fillRect(Math.min(x - 20 * facing, x + 23 * facing), y - 4.6, 43, 1.8);
  // Masts and sails. Tied up, the sails are furled.
  for (const [at, tall] of [[-7, 30], [7, 24]]) {
    const mx = x + at * facing;
    ctx.fillStyle = SHIP.mast;
    ctx.fillRect(mx - 0.7, y - 4 - tall, 1.4, tall);
    if (a.docked) {
      ctx.fillStyle = SHIP.sail;
      ctx.fillRect(mx - 6, y - tall + 2, 12, 2);
      continue;
    }
    const top = y - tall;
    const width = tall * 0.48;
    ctx.fillStyle = SHIP.sail;
    ctx.beginPath();
    ctx.moveTo(mx - width / 2, top + 2);
    ctx.lineTo(mx + width / 2, top + 2);
    ctx.quadraticCurveTo(mx + width / 2 + 2.5 * facing, top + tall * 0.42, mx + width / 2, top + tall * 0.72);
    ctx.lineTo(mx - width / 2, top + tall * 0.72);
    ctx.quadraticCurveTo(mx - width / 2 + 2.5 * facing, top + tall * 0.42, mx - width / 2, top + 2);
    ctx.fill();
    ctx.fillStyle = SHIP.stripe;
    ctx.fillRect(mx - width / 2, top + tall * 0.34, width, 2);
    // The far half of the sail, out of the sun.
    ctx.fillStyle = 'rgba(120, 100, 70, 0.14)';
    ctx.fillRect(facing > 0 ? mx : mx - width / 2, top + 2, width / 2, tall * 0.7 - 2);
  }
  // A pennant at the top of the main mast.
  ctx.fillStyle = '#c94f3d';
  ctx.beginPath();
  ctx.moveTo(x - 7 * facing, y - 34);
  ctx.lineTo(x - 7 * facing - 7 * facing, y - 32.5 + Math.sin(time * 4 + a.look) * 0.6);
  ctx.lineTo(x - 7 * facing, y - 31);
  ctx.fill();
}

// Draws a list of actors, far to near as given. `goods` is rules.goods, for
// the color of what a cart carries. `time` is in seconds, for bobbing.
export function paintActors(ctx, actors, goods, time) {
  for (const a of actors) {
    if (a.kind === 'walker') walker(ctx, a);
    else if (a.kind === 'cart') cart(ctx, a, a.good === null ? null : goods[a.good]?.color ?? '#b9a47a');
    else if (a.kind === 'boat') boat(ctx, a, time);
    else if (a.kind === 'ship') ship(ctx, a, time);
  }
}
