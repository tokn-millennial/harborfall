// Draws the life on the map: walkers, carts, boats and trade ships. Each is a handful of
// small shapes, because there may be dozens on screen and they are tiny.
//
// An actor's x and y are in tiles (see src/render/life.js). Its feet, wheels
// or keel are drawn at that point on the ground.

import { tileToWorld } from '../iso.js';
import { CLIFF } from './terrain.js';
import { tone } from './kit.js';
import { sharpnessFor } from './sprites.js';

const SKIN = '#e8c39e';
const LEGS = '#3b2f2a';
const SHADOW = 'rgba(15, 35, 20, 0.26)';
const SIDE_SHADE = 'rgba(0, 0, 0, 0.18)'; // the right side of a figure, away from the sun
const WATER_SHADOW = 'rgba(10, 40, 60, 0.25)';
// Clothes by kind of resident: tunic colors, then the hat and its shape:
// a wide straw hat for Farmers, a flat cap for Workers, a tall hat for Artisans.
const CLOTHES = {
  farmer: { tunics: ['#b08a4a', '#8a9a5b', '#a8683e', '#c9b27a'], hat: '#e0c878', hatShape: 'straw' },
  worker: { tunics: ['#3f6f9a', '#9a4a3f', '#5d5d80', '#4a7d6a'], hat: '#33343d', hatShape: 'cap' },
  artisan: { tunics: ['#7d6fb3', '#5d6f8c', '#8c4f6f', '#3f7a6a'], hat: '#c9a55a', hatShape: 'tall' },
};
const PLAIN = { tunics: ['#8c7a5c'], hat: '#5a4a3a', hatShape: 'cap' };
const HAIR = ['#3b2a1e', '#6b4a2a', '#c9a35a', '#2a2422', '#8a4a2a'];
const SCARF = ['#e8e0cc', '#c9506b', '#d9b45a', '#6f8fb0'];
const CART = { body: '#8a5f3a', rim: '#6b4729', wheel: '#33271f' };
const BOAT = { hull: '#7a5236', rim: '#a87a52', ripple: 'rgba(255, 255, 255, 0.5)', line: 'rgba(40, 40, 40, 0.7)' };

// A soft oval shadow on the ground, falling a little to the right.
function groundShadow(ctx, x, y, rx, ry, color = SHADOW) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x + 1, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// A body from the shoulders (top) down to the waist or hem (bottom), wider at
// the bottom by `flare` on each side, with round shoulders.
function torso(ctx, x, top, bottom, half, flare) {
  ctx.beginPath();
  ctx.moveTo(x - half - flare, bottom);
  ctx.lineTo(x - half, top + 1);
  ctx.quadraticCurveTo(x - half, top, x - half + 1, top);
  ctx.lineTo(x + half - 1, top);
  ctx.quadraticCurveTo(x + half, top, x + half, top + 1);
  ctx.lineTo(x + half + flare, bottom);
  ctx.closePath();
}

// A head at (x, y), its middle, with hair, a headscarf or a hat.
function head(ctx, x, y, clothes, look, scarf) {
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(x, y, 1.55, 0, Math.PI * 2);
  ctx.fill();
  if (scarf) {
    // A headscarf over the top of the head.
    ctx.fillStyle = SCARF[look % SCARF.length];
    ctx.beginPath();
    ctx.arc(x, y - 0.1, 1.75, Math.PI * 1.02, Math.PI * 1.98);
    ctx.closePath();
    ctx.fill();
    return;
  }
  ctx.fillStyle = HAIR[look % HAIR.length];
  ctx.beginPath();
  ctx.arc(x, y - 0.2, 1.6, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = clothes.hat;
  if (clothes.hatShape === 'straw') {
    ctx.beginPath();
    ctx.ellipse(x, y - 1.1, 2.9, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - 1.2, 1.4, Math.PI, Math.PI * 2);
    ctx.fill();
  } else if (clothes.hatShape === 'tall') {
    ctx.fillRect(x - 2.2, y - 1.6, 4.4, 0.8);
    ctx.fillRect(x - 1.3, y - 4, 2.6, 2.6);
  } else {
    ctx.beginPath();
    ctx.arc(x, y - 0.9, 1.7, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 0.4, y - 1.2, 2.6, 0.6); // the peak
  }
}

// One person standing at (x, y) in world pixels. `stride` moves the legs and
// arms. About half wear a long skirt and a headscarf instead of breeches and a hat.
//
// A person takes a dozen small shapes, and there may be dozens of people, so
// in the browser each look is drawn once into a small picture and reused
// (see personPicture). Where there is no canvas to keep pictures in, as in the
// tests, people are drawn shape by shape.
function person(ctx, x, y, clothes, look, stride) {
  const step = Math.floor(stride * 6) % 2;
  const picture = personPicture(ctx, clothes, look, step);
  if (picture) {
    ctx.drawImage(picture.canvas, x - PERSON_BOX.left, y - PERSON_BOX.top, PERSON_BOX.width, PERSON_BOX.height);
    return;
  }
  drawPerson(ctx, x, y, clothes, look, step);
}

// The space a person is drawn in, around their feet, in world pixels.
const PERSON_BOX = { left: 4, top: 14, width: 8, height: 15 };
// Every look repeats after this many: 4 tunics, 2 kinds of clothes, 5 hair colors, 4 scarves.
const LOOKS = 20;
const pictures = new Map();
let picturesScale = 0;
const makeCanvas = typeof document !== 'undefined' ? (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }) : null;

// The stored picture of a person, drawn sharp enough for the canvas's current
// zoom, or null where pictures cannot be made.
function personPicture(ctx, clothes, look, step) {
  if (!makeCanvas || typeof ctx.getTransform !== 'function') return null;
  const scale = sharpnessFor(Math.abs(ctx.getTransform().a));
  if (scale !== picturesScale) {
    pictures.clear();
    picturesScale = scale;
  }
  const key = `${clothes.hatShape}|${clothes.hat}|${clothes.tunics.join()}|${look % LOOKS}|${step}`;
  let picture = pictures.get(key);
  if (!picture) {
    const canvas = makeCanvas(Math.ceil(PERSON_BOX.width * scale), Math.ceil(PERSON_BOX.height * scale));
    const g = canvas.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    drawPerson(g, PERSON_BOX.left, PERSON_BOX.top, clothes, look % LOOKS, step);
    picture = { canvas };
    pictures.set(key, picture);
  }
  return picture;
}

function drawPerson(ctx, x, y, clothes, look, step) {
  const tunic = clothes.tunics[look % clothes.tunics.length];
  const skirt = look % 2 === 1;
  if (skirt) {
    // A long skirt to the ankles, its hem swinging a little.
    ctx.fillStyle = LEGS;
    ctx.fillRect(x - 1.4 + step * 0.4, y - 1, 1, 1);
    ctx.fillRect(x + 0.4 - step * 0.4, y - 1, 1, 1);
    ctx.fillStyle = tone(tunic, 0.78);
    torso(ctx, x, y - 4.4, y - 0.8, 2.1, 0.9 + step * 0.2);
    ctx.fill();
  } else {
    ctx.fillStyle = LEGS;
    // One foot is always off the ground.
    ctx.fillRect(x - 1.5, y - 3, 1.2, 3 - step);
    ctx.fillRect(x + 0.3, y - 3, 1.2, 2 + step);
  }
  // Arms swing opposite to the legs, with a hand at the end of each.
  ctx.strokeStyle = tunic;
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 2.1, y - 6.6);
  ctx.lineTo(x - 2.7, y - 4 + step * 0.6);
  ctx.moveTo(x + 2.1, y - 6.6);
  ctx.lineTo(x + 2.7, y - 4 - step * 0.6);
  ctx.stroke();
  ctx.fillStyle = SKIN;
  ctx.fillRect(x - 3.2, y - 3.8 + step * 0.6, 1, 1);
  ctx.fillRect(x + 2.2, y - 3.8 - step * 0.6, 1, 1);
  // The body, and a belt for those in breeches.
  ctx.fillStyle = tunic;
  torso(ctx, x, y - 7.3, y - 2.8, 2.1, 0.2);
  ctx.fill();
  if (!skirt) {
    ctx.fillStyle = 'rgba(40, 28, 20, 0.55)';
    ctx.fillRect(x - 2.2, y - 4.2, 4.5, 0.6);
  }
  // The side away from the sun.
  ctx.fillStyle = SIDE_SHADE;
  ctx.fillRect(x + 0.5, y - 7.2, 1.9, 4.4);
  head(ctx, x, y - 8.9, clothes, look, skirt);
}

function walker(ctx, a) {
  const p = tileToWorld(a.x, a.y);
  groundShadow(ctx, p.x, p.y, 3, 1.1);
  person(ctx, p.x, p.y, CLOTHES[a.tier] ?? PLAIN, a.look, a.stride);
}

// A round wheel with spokes and a hub.
function wheel(ctx, x, y) {
  ctx.fillStyle = CART.wheel;
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CART.rim;
  ctx.beginPath();
  ctx.arc(x, y, 1.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = CART.wheel;
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(x - 1.2, y);
  ctx.lineTo(x + 1.2, y);
  ctx.moveTo(x, y - 1.2);
  ctx.lineTo(x, y + 1.2);
  ctx.stroke();
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
  const fx = x - facing;
  ctx.fillStyle = CLOTHES.worker.tunics[0];
  torso(ctx, fx, y - 6.8, y - 2.4, 2.1, 0.3);
  ctx.fill();
  ctx.fillStyle = SIDE_SHADE;
  ctx.fillRect(fx + 0.5, y - 6.7, 1.9, 4.3);
  head(ctx, fx, y - 8.5, CLOTHES.farmer, 0, false);
  if (a.fishing) {
    // A rod bending out over the side, and its line down to the water.
    ctx.strokeStyle = BOAT.line;
    ctx.lineWidth = 0.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx + facing * 1.5, y - 4.5);
    ctx.quadraticCurveTo(x + facing * 8, y - 11, x + facing * 11.5, y - 9.5);
    ctx.stroke();
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(x + facing * 11.5, y - 9.5);
    ctx.lineTo(x + facing * 11.5, y + 2);
    ctx.stroke();
  }
}

// The trade ship: a two-masted trader with cream sails, larger than a fishing boat.
const SHIP = { hull: '#5e3d27', band: '#d9b46a', deck: '#9a7350', sail: '#f3ead2', stripe: '#3d6f8f', mast: '#4a3322' };
// Your own ship: the same trader, with a red stripe and a gold pennant, so it is told apart.
const OWN_SHIP = { ...SHIP, stripe: '#b3412f', band: '#e9c46a' };
const TRADER = SHIP;
function ship(ctx, a, time) {
  const SHIP = a.own ? OWN_SHIP : TRADER;
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
  // The figures set line widths and ends; put them back afterwards.
  ctx.save();
  for (const a of actors) {
    if (a.kind === 'walker') walker(ctx, a);
    else if (a.kind === 'cart') cart(ctx, a, a.good === null ? null : goods[a.good]?.color ?? '#b9a47a');
    else if (a.kind === 'boat') boat(ctx, a, time);
    else if (a.kind === 'ship') ship(ctx, a, time);
  }
  ctx.restore();
}
