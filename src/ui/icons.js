// Small drawn icons for the top bar and the tool buttons.
// Each is a short piece of SVG, so they stay sharp at any size and need no files.
// A good with no icon here gets a plain square in its color from goods.json,
// so a good added in the data still shows up.

const SVG = {
  coin: '<circle cx="8" cy="8" r="6.5" fill="#f2c94c" stroke="#9a6d1a" stroke-width="1.2"/><circle cx="8" cy="8" r="3.5" fill="none" stroke="#9a6d1a" stroke-width="1"/>',
  wood: '<rect x="1.5" y="5" width="11" height="6" rx="3" fill="#8b5a2b" stroke="#523418" stroke-width="1"/><ellipse cx="12.4" cy="8" rx="2.2" ry="3" fill="#e2c79a" stroke="#523418" stroke-width="1"/><circle cx="12.4" cy="8" r="0.9" fill="#b98d5a"/>',
  planks: '<rect x="1.5" y="2.8" width="13" height="3" rx="0.6" fill="#ead09a" stroke="#8f6b36" stroke-width="0.9"/><rect x="1.5" y="6.5" width="13" height="3" rx="0.6" fill="#dcbd80" stroke="#8f6b36" stroke-width="0.9"/><rect x="1.5" y="10.2" width="13" height="3" rx="0.6" fill="#ead09a" stroke="#8f6b36" stroke-width="0.9"/>',
  fish: '<path d="M1.5 8c2.2-3.4 6.2-3.8 9 0-2.8 3.8-6.8 3.4-9 0z" fill="#6cb4de" stroke="#2a6088" stroke-width="1"/><path d="M10.2 8l4-3v6z" fill="#6cb4de" stroke="#2a6088" stroke-width="1" stroke-linejoin="round"/><circle cx="4.4" cy="7.4" r="0.8" fill="#16323d"/>',
  grain: '<path d="M8 15V6" stroke="#a8862a" stroke-width="1.2" stroke-linecap="round"/><g fill="#ecd055" stroke="#a08020" stroke-width="0.8"><ellipse cx="8" cy="3.2" rx="1.6" ry="2.4"/><ellipse cx="5.4" cy="6.2" rx="1.5" ry="2.2" transform="rotate(-30 5.4 6.2)"/><ellipse cx="10.6" cy="6.2" rx="1.5" ry="2.2" transform="rotate(30 10.6 6.2)"/><ellipse cx="5.4" cy="9.8" rx="1.5" ry="2.2" transform="rotate(-30 5.4 9.8)"/><ellipse cx="10.6" cy="9.8" rx="1.5" ry="2.2" transform="rotate(30 10.6 9.8)"/></g>',
  bread: '<path d="M2 9.5c0-3.6 2.6-5.5 6-5.5s6 1.9 6 5.5c0 1.6-1 2.5-2.4 2.5H4.4C3 12 2 11.1 2 9.5z" fill="#cf8c42" stroke="#7a4a1a" stroke-width="1"/><path d="M5.2 6.2l1.2 2.4M8 5.6l1.2 2.4M10.6 6.2l1.2 2.4" stroke="#f3d6a3" stroke-width="1" stroke-linecap="round"/>',
  wool: '<g fill="#f1ece0" stroke="#8c8676" stroke-width="0.9"><circle cx="5.4" cy="9.4" r="3.4"/><circle cx="10.6" cy="9.4" r="3.4"/><circle cx="8" cy="6.4" r="3.6"/></g>',
  cloth: '<rect x="1.8" y="4.6" width="11" height="7.2" rx="1.2" fill="#7d6fb3" stroke="#40366b" stroke-width="0.9"/><path d="M2.2 7h10M2.2 9.4h10" stroke="#a79bd6" stroke-width="0.8"/><ellipse cx="12.8" cy="8.2" rx="1.7" ry="3.6" fill="#9c8fd0" stroke="#40366b" stroke-width="0.9"/>',
  person: '<circle cx="8" cy="4.6" r="2.6"/><path d="M3 14c0-3.2 2.2-5 5-5s5 1.8 5 5z"/>',
  select: '<path d="M4 2l8.5 6.2-3.8 0.6 2.2 4.3-1.7 0.9-2.2-4.3L4 12.4z" fill="#f6eed6" stroke="#1c2a31" stroke-width="1" stroke-linejoin="round"/>',
  upgrade: '<path d="M8 1.8l5.5 6h-3.3v6.2H5.8V7.8H2.5z" fill="#4fae62" stroke="#1f5a2c" stroke-width="1" stroke-linejoin="round"/>',
  sound: '<path d="M2 6h2.8L8.5 2.8v10.4L4.8 10H2z" fill="#f1ead8" stroke="#1c2a31" stroke-width="0.8" stroke-linejoin="round"/><path d="M10.6 5.6c1.2 1.2 1.2 3.6 0 4.8M12.4 3.8c2.2 2.2 2.2 6.2 0 8.4" fill="none" stroke="#f1ead8" stroke-width="1.3" stroke-linecap="round"/>',
  muted: '<path d="M2 6h2.8L8.5 2.8v10.4L4.8 10H2z" fill="#8fa1a8" stroke="#1c2a31" stroke-width="0.8" stroke-linejoin="round"/><path d="M10.6 5.8l4 4.4M14.6 5.8l-4 4.4" fill="none" stroke="#ff9488" stroke-width="1.5" stroke-linecap="round"/>',
  undo: '<path d="M6.2 2.6L2.4 6.2l3.8 3.6V7.6h3.3a2.6 2.6 0 0 1 0 5.2H5.2v-2.1h4.3a0.5 0.5 0 0 0 0-1H6.2z" fill="#e9c46a" stroke="#6b4a12" stroke-width="1" stroke-linejoin="round"/>',
  demolish: '<path d="M9 2.2l4.8 4.8-2 2-1.2-1.2-5.8 5.8-1.6-1.6 5.8-5.8L7.8 5z" fill="#b7b0a2" stroke="#3c3a36" stroke-width="1" stroke-linejoin="round"/><path d="M2.8 13.2l2-2" stroke="#7a5a3a" stroke-width="2.2" stroke-linecap="round"/>',
};

// An icon by name. `fill` colors the single-color ones (the person).
export function icon(name, { size = 16, fill = null, title = null } = {}) {
  const span = document.createElement('span');
  span.className = 'icon';
  if (title) span.title = title;
  const attrs = fill ? ` fill="${fill}"` : '';
  span.innerHTML = `<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true"${attrs}>${SVG[name]}</svg>`;
  return span;
}

export const hasIcon = (name) => SVG[name] !== undefined;

// The icon for a good: a drawn one if there is one, otherwise a square in the good's color.
export function goodIcon(id, color, size = 16) {
  if (hasIcon(id)) return icon(id, { size });
  const span = document.createElement('span');
  span.className = 'swatch';
  span.style.background = color;
  return span;
}
