import { ICONS, PALETTE, OUTLINE, RUNES, RUNE_AT, RUNE_INK, MARK_ICONS } from './iconArt.js';

// Pixel-art icons for items and their marks, painted from the maps in iconArt.js into small images the pack, the paper
// doll and the hotbar show scaled up with crisp pixels (see iconHTML). Each map gets a dark outline all round, added
// here, so the maps hold only the coloured pixels. What varies from run to run is painted in:
//   potions, wands, rings and keys  their `tint` pixels (1 light to 5 dark) are shaded from the item's colour: the
//                                   potion's, the wand's wood or metal, the ring's gem (Knowledge.color)
//   scrolls                         the scroll has a rune on it from RUNES, the one its label was given this run
//                                   (Knowledge.rune), so a kind of scroll is known by its rune as by its label
// Images are made once for each look and kept.

const cache = new Map();

// In development, says in the console what's wrong with any map: the wrong size, a colour it doesn't have, or art
// right to its edge (where the outline can't go).
if (import.meta.env.DEV) {
  const check = (name, map, size, colors, tint = false) => {
    const bad = [];
    if (map.length !== size || map.some((row) => row.length !== size)) bad.push(`isn't ${size} by ${size}`);
    const unknown = new Set([...map.join('')].filter((ch) => ch !== '.' && !(ch in colors) && !(tint && '12345'.includes(ch))));
    if (unknown.size) bad.push(`has no colour for ${[...unknown].join(' ')}`);
    if (/[^.]/.test(map[0] + map.at(-1) + map.map((row) => row[0] + row.at(-1)).join(''))) bad.push('touches its edge');
    if (bad.length) console.warn(`Icon ${name} ${bad.join(', ')} (ui/iconArt.js)`);
  };
  for (const [key, art] of Object.entries(ICONS)) check(key, art.map, 16, { ...PALETTE, ...art.colors }, art.tint);
  for (const [key, art] of Object.entries(MARK_ICONS)) check(`mark ${key}`, art.map, 9, { ...PALETTE, ...art.colors });
}

/** Five shades of a colour for a tinted icon, light to dark, keeping its hue: even a black potion shows its shape. */
export function ramp(color) {
  const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const base = Math.max(0.14, l);
  return [
    [s * 0.7, Math.max(0.62, l + (1 - l) * 0.62)],
    [s, Math.max(0.3, l + (1 - l) * 0.28)],
    [s, base],
    [s, base * 0.66],
    [s, base * 0.42],
  ].map(([ss, ll]) => hsl(h * 60, Math.min(1, ss), Math.min(0.97, ll)));
}

function hsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Paints a map (rows of characters, '.' for nothing) in `colors` (a character to a CSS colour), with a dark outline
 * round everything painted and `overlay` ({ map, at: [x, y], color }) painted over it. Returns a data URL.
 */
function paint(map, colors, overlay = null) {
  const h = map.length, w = map[0].length;
  const px = map.map((row) => [...row].map((ch) => (ch === '.' ? null : colors[ch] ?? '#ff00ff')));
  if (overlay) {
    overlay.map.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '.') px[overlay.at[1] + y][overlay.at[0] + x] = overlay.color;
    }));
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const filled = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[y][x] !== null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = px[y][x] ?? (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1) ? OUTLINE : null);
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas.toDataURL();
}

/** An icon from ICONS by its key, tinted (see ramp) and with a rune on it (for a scroll) if asked. */
function iconURL(key, { tint = null, rune = null } = {}) {
  const id = `${key}|${tint ?? ''}|${rune ?? ''}`;
  if (cache.has(id)) return cache.get(id);
  const art = ICONS[key];
  const colors = { ...PALETTE, ...art.colors };
  if (tint !== null) ramp(tint).forEach((c, i) => (colors[i + 1] = c));
  const overlay = rune !== null ? { map: RUNES[rune % RUNES.length], at: RUNE_AT, color: RUNE_INK } : null;
  const url = paint(art.map, colors, overlay);
  cache.set(id, url);
  return url;
}

/** Which icon an item has: its own (kind:type), else its kind's. */
const iconKey = (item) => (ICONS[`${item.kind}:${item.type}`] ? `${item.kind}:${item.type}` : ICONS[item.kind] ? item.kind : null);

/** The icon for `item` as a data URL, as `k` (the run's Knowledge) says it looks, or null if it has none yet. */
export function itemIcon(item, k) {
  const key = iconKey(item);
  if (!key) return null;
  return iconURL(key, {
    tint: ICONS[key].tint ? k.color(item) : null,
    rune: item.kind === 'scroll' ? k.rune(item) : null,
  });
}

/** A mark's icon (see MARKS in tiles.js) as a data URL, or null if it has none. */
export function markIcon(name) {
  const art = MARK_ICONS[name];
  if (!art) return null;
  const id = `mark:${name}`;
  if (!cache.has(id)) cache.set(id, paint(art.map, { ...PALETTE, ...art.colors }));
  return cache.get(id);
}

/**
 * HTML for an item's icon: an image shown `scale` times its size, with crisp pixels, or `fallback` (HTML) for an item
 * with no icon yet.
 */
export function iconHTML(item, k, { scale = 3, cls = '', fallback = '' } = {}) {
  const url = itemIcon(item, k);
  if (!url) return fallback;
  return `<img class="icon${cls ? ` ${cls}` : ''}" src="${url}" width="${16 * scale}" height="${16 * scale}" alt="" draggable="false" />`;
}
