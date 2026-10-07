import * as THREE from 'three';
import { iconItemModel } from '../items/models.js';
import { texturesLoaded } from '../items/bbmodel.js';
import {
  WEAPONS, OFFHANDS, SHIELDS, BOWS, ARROWS, THROWN, ARMORS, POTIONS, SCROLLS, WANDS, RINGS, ARTEFACTS, FOOD, CONTAINERS,
  POTION_COLORS, WAND_MATERIALS, RING_GEMS, BOSS_KEYS,
} from '../items/defs.js';
import { PALETTE, OUTLINE, RUNES, RUNE_INK, MARK_ICONS } from './iconArt.js';

// Item icons, rendered from the items' own models: each is photographed in a pose of its own (POSES), many times
// bigger than it's wanted, and brought down to ICON_SIZE pixels a block at a time, each pixel one of the colours the
// model shows there, so it keeps a pixel-art look rather than a blur. A dark outline goes round it, and the pack, the
// paper doll and the hotbar show it ICON_SCALE times its size, with crisp pixels (see iconHTML). What varies from run to
// run comes with the model: a potion's, wand's or ring's colour is its tint (Knowledge.color), and a scroll, rendered
// open, has its rune (Knowledge.rune, from RUNES in iconArt.js) painted on its sheet, where the model's `rune` group is.
// The marks for what things do are still drawn by hand, in iconArt.js. Each look is rendered once and kept.

export const ICON_SIZE = 24;
export const ICON_SCALE = 2;
const SUPER = 6; // rendered this many times bigger, a block of SUPER × SUPER texels to a pixel
const COVER = 0.4; // how much of its block the item must cover for a pixel to be filled

// How each thing is posed (by `<kind>:<type>`, else its kind, over `default`): turned about the vertical (`turn`,
// radians, toward the light at the top left), tipped toward you to be seen from above (`tilt`), and rolled in the
// picture (`roll`, about the line of sight, before the rest). A `diagonal` thing (a weapon, a bow, an arrow, a dart) is
// seen from the side instead, its edge to the right and its tip up, `turn` toward you, and laid on the diagonal, tip up
// to the right; and it's made `thick` times as thick across, or its blade or haft would be a hairline at this size.
const POSES = {
  default: { turn: 0.6, tilt: 0.45 },
  weapon: { diagonal: true, turn: 0.35, thick: 1.6 },
  bow: { diagonal: true, turn: 0.35, thick: 1.6 },
  arrow: { diagonal: true, turn: 0.35, thick: 1.6 },
  thrown: { diagonal: true, turn: 0.35, thick: 1.6 },
  'thrown:stone': { diagonal: false },
  shield: { turn: 0.35, tilt: 0.15 },
  offhand: { tilt: 0.22 },
  scroll: { turn: 0.25, tilt: 0.12 },
  // (The wand lies tilted, as if dropped: rolled back onto the diagonal, its crystal up to the right.)
  wand: { roll: (-117 * Math.PI) / 180, turn: 0, tilt: 0.3 },
  key: { roll: Math.PI / 4, turn: 0.2 },
  'artefact:eye': { turn: 0.2, tilt: 0.15 },
  'container:potion_bandolier': { roll: Math.PI / 5, turn: 0.2 },
};

// The kinds whose one model takes the colour of each type (a `_tint` texture: see models.md).
const TINTED = new Set(['potion', 'wand', 'ring']);

const renders = new Map(); // a look (see lookOf) -> its pixels
const urls = new Map(); // a look, and a scroll's rune -> the icon as a data URL
let ready = false;
let studio = null;

/**
 * Starts loading what the icons are rendered from (every item's model, and its textures). Icons show once it's done;
 * then every look of every one is rendered ahead (a few milliseconds each), a few at a time while the browser is idle,
 * so none has to be when it's first shown.
 */
export function prepareIcons() {
  const seen = new Set();
  for (const { item, color } of everyIcon()) {
    if (seen.has(lookOf(item, 0))) continue;
    seen.add(lookOf(item, 0));
    iconItemModel(item, color);
  }
  return texturesLoaded().then(() => {
    ready = true;
    const queue = everyIcon();
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(() => fn({ timeRemaining: () => 10 }), 30));
    const next = (deadline) => {
      while (queue.length && deadline.timeRemaining() > 6) {
        const { item, color, rune } = queue.shift();
        itemIcon(item, { color: () => color, rune: () => rune });
      }
      if (queue.length) idle(next);
    };
    idle(next);
  });
}

/**
 * Every item with an icon, in every look it comes in: a potion in each colour, a scroll with each rune, every key...
 * As { label, item, color, rune }, for the dev tools' sheet of them.
 */
export function everyIcon() {
  const out = [];
  const add = (kind, type, label = `${kind}: ${type}`, look = {}, extra = {}) => out.push({ label, item: { kind, type, ...extra }, color: 0xffffff, rune: null, ...look });
  for (const [kind, defs] of [['weapon', WEAPONS], ['offhand', OFFHANDS], ['shield', SHIELDS], ['bow', BOWS], ['arrow', ARROWS],
    ['thrown', THROWN], ['armor', ARMORS], ['artefact', ARTEFACTS], ['food', FOOD], ['container', CONTAINERS]]) {
    for (const type of Object.keys(defs)) add(kind, type);
  }
  for (const [kind, defs, looks] of [['potion', POTIONS, POTION_COLORS], ['wand', WANDS, WAND_MATERIALS], ['ring', RINGS, RING_GEMS]]) {
    for (const { name, color } of looks) add(kind, Object.keys(defs)[0], `${kind}: ${name}`, { color });
  }
  RUNES.forEach((_, rune) => add('scroll', Object.keys(SCROLLS)[0], `scroll: rune ${rune}`, { rune }));
  add('key', 'iron');
  add('key', 'gold');
  for (const boss of Object.keys(BOSS_KEYS)) add('key', 'boss', `key: ${boss}`, {}, { boss });
  add('gold', 'gold', 'gold');
  add('amulet', 'yendor');
  return out;
}

/** What an icon depends on: the item's model (a boss key's, its boss's: see BOSS_KEYS), and its colour if the model takes one. */
const lookOf = (item, color) => (TINTED.has(item.kind) ? `${item.kind}|${color}` : item.kind === 'scroll' ? 'scroll'
  : `${item.kind}:${item.type}${item.boss ? `:${item.boss}` : ''}`);

/** The camera, lights and renderer the icons are photographed with, made the first time they're wanted. */
function setUp() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(ICON_SIZE * SUPER, ICON_SIZE * SUPER, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-1, 1.4, 1.6);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(1, -0.5, 0.8);
  scene.add(key, fill);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  const copy = document.createElement('canvas');
  copy.width = copy.height = ICON_SIZE * SUPER;
  return { renderer, scene, camera, copy: copy.getContext('2d', { willReadFrequently: true }) };
}

/** The item's model in its pose (see POSES), in a group to turn as a whole. */
function posed(item, model) {
  const pose = { ...POSES.default, ...POSES[item.kind], ...POSES[`${item.kind}:${item.type}`] };
  const outer = new THREE.Group(), inner = new THREE.Group(), held = new THREE.Group();
  outer.add(inner);
  inner.add(held);
  held.add(model);
  if (pose.diagonal) {
    held.scale.set(pose.thick, 1, pose.thick);
    inner.rotation.y = -Math.PI / 2 + pose.turn;
    outer.rotation.z = -Math.PI / 4;
  } else {
    held.rotation.z = pose.roll ?? 0;
    inner.rotation.y = pose.turn;
    outer.rotation.x = pose.tilt;
  }
  return outer;
}

/**
 * Renders an item's icon: ICON_SIZE × ICON_SIZE pixels, each [r, g, b] or null, and where on it the middle of a
 * scroll's sheet is (`rune`), for its rune.
 */
function shoot(item, color) {
  studio ??= setUp();
  const { renderer, scene, camera, copy } = studio, N = ICON_SIZE, R = N * SUPER;
  const model = iconItemModel(item, color), obj = posed(item, model);
  scene.add(obj);
  obj.updateMatrixWorld(true);
  // Framed to fit, square, with a pixel to spare all round for the outline.
  const box = new THREE.Box3().setFromObject(obj, true);
  const mid = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const half = (Math.max(size.x, size.y) / 2) * (N / (N - 2));
  Object.assign(camera, { left: mid.x - half, right: mid.x + half, top: mid.y + half, bottom: mid.y - half });
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  scene.remove(obj);
  copy.clearRect(0, 0, R, R);
  copy.drawImage(renderer.domElement, 0, 0);
  const src = copy.getImageData(0, 0, R, R).data;
  // Each pixel, if enough of its block is covered: the colour seen in the block that's nearest the block's average, so
  // the model's own texels come through rather than a blend of them.
  const px = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const seen = [];
    for (let sy = 0; sy < SUPER; sy++) for (let sx = 0; sx < SUPER; sx++) {
      const i = ((y * SUPER + sy) * R + x * SUPER + sx) * 4;
      if (src[i + 3] > 127) seen.push([src[i], src[i + 1], src[i + 2]]);
    }
    if (seen.length < COVER * SUPER * SUPER) { px.push(null); continue; }
    const avg = [0, 1, 2].map((k) => seen.reduce((s, c) => s + c[k], 0) / seen.length);
    const off = (c) => (c[0] - avg[0]) ** 2 + (c[1] - avg[1]) ** 2 + (c[2] - avg[2]) ** 2;
    px.push(seen.reduce((best, c) => (off(c) < off(best) ? c : best)));
  }
  const at = model.userData.anchors?.rune;
  let rune = null;
  if (at) {
    const p = new THREE.Vector3(...at).applyMatrix4(model.matrixWorld).project(camera);
    rune = [((p.x + 1) / 2) * N, ((1 - p.y) / 2) * N];
  }
  return { px: px.map((c) => c && `rgb(${c.join(',')})`), rune };
}

/**
 * Paints pixels (rows of colours, null for nothing) with a dark outline round everything, and `overlay`
 * ({ map, at: [x, y], color }) over them. Returns a data URL.
 */
function paint(px, w, h, overlay = null) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const filled = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[y * w + x] !== null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = px[y * w + x] ?? (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1) ? OUTLINE : null);
    if (!c) continue;
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  }
  if (overlay) {
    ctx.fillStyle = overlay.color;
    overlay.map.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && ctx.fillRect(overlay.at[0] + x, overlay.at[1] + y, 1, 1)));
  }
  return canvas.toDataURL();
}

/** A map (rows of characters, '.' for nothing) as pixels, in `colors`. */
const mapPixels = (map, colors) => map.flatMap((row) => [...row].map((ch) => (ch === '.' ? null : colors[ch] ?? '#ff00ff')));

/**
 * The icon for `item` as a data URL, as `k` (the run's Knowledge, or anything with its color and rune) says it looks,
 * or null until the models it's rendered from have loaded (see prepareIcons).
 */
export function itemIcon(item, k) {
  if (!ready) return null;
  const color = k.color(item), look = lookOf(item, color), rune = item.kind === 'scroll' ? k.rune(item) % RUNES.length : null;
  const id = `${look}|${rune ?? ''}`;
  if (!urls.has(id)) {
    if (!renders.has(look)) renders.set(look, shoot(item, color));
    const { px, rune: mid } = renders.get(look), map = rune !== null && mid ? RUNES[rune] : null;
    const overlay = map && { map, at: [Math.round(mid[0] - map[0].length / 2), Math.round(mid[1] - map.length / 2)], color: RUNE_INK };
    urls.set(id, paint(px, ICON_SIZE, ICON_SIZE, overlay));
  }
  return urls.get(id);
}

/** A mark's icon (see MARKS in tiles.js) as a data URL, or null if it has none. */
export function markIcon(name) {
  const art = MARK_ICONS[name];
  if (!art) return null;
  const id = `mark:${name}`;
  if (!urls.has(id)) urls.set(id, paint(mapPixels(art.map, { ...PALETTE, ...art.colors }), art.map[0].length, art.map.length));
  return urls.get(id);
}

/**
 * HTML for an item's icon: an image shown `scale` times its size, with crisp pixels, or `fallback` (HTML) while it
 * has none.
 */
export function iconHTML(item, k, { scale = ICON_SCALE, cls = '', fallback = '' } = {}) {
  const url = itemIcon(item, k);
  if (!url) return fallback;
  const px = ICON_SIZE * scale;
  return `<img class="icon${cls ? ` ${cls}` : ''}" src="${url}" width="${px}" height="${px}" alt="" draggable="false" />`;
}

// In development, says in the console what's wrong with a mark's map: the wrong size, a colour it doesn't have, or art
// right to its edge (where the outline can't go).
if (import.meta.env.DEV) {
  for (const [key, art] of Object.entries(MARK_ICONS)) {
    const bad = [], { map } = art, colors = { ...PALETTE, ...art.colors };
    if (map.length !== 9 || map.some((row) => row.length !== 9)) bad.push(`isn't 9 by 9`);
    const unknown = new Set([...map.join('')].filter((ch) => ch !== '.' && !(ch in colors)));
    if (unknown.size) bad.push(`has no colour for ${[...unknown].join(' ')}`);
    if (/[^.]/.test(map[0] + map.at(-1) + map.map((row) => row[0] + row.at(-1)).join(''))) bad.push('touches its edge');
    if (bad.length) console.warn(`Mark ${key} ${bad.join(', ')} (ui/iconArt.js)`);
  }
}
