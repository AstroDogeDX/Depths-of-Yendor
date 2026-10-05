import * as THREE from 'three';
import { WEAPONS, OFFHANDS, SHIELDS, BOWS, ARROWS, THROWN } from './defs.js';
import { buildBBModel } from './bbmodel.js';
import { MODEL_PX, ITEM_MIN_SIZE } from '../config.js';

const lam = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  return b;
};

// Weapon models are Blockbench projects (Generic Model format), one per WEAPONS[type].model, read straight
// from the saved .bbmodel files.
const WEAPON_FILES = import.meta.glob('../../assets/models/weapons/*.bbmodel', { import: 'default', eager: true });
const weaponCache = new Map();

/**
 * Every weapon mesh shares one local frame, which the viewmodel's swing relies on:
 *   origin = where the hand grips, +y = toward the tip or head,
 *   -z = the cutting edge / striking face, ±x = the flats of the blade.
 * Blades are therefore wide along z and thin along x, and crossguards run along z (edge to edge).
 * In Blockbench that is: pivot at the grip, tip pointing up, edge facing north.
 */
export const WEAPON_EDGE = new THREE.Vector3(0, 0, -1);
export const WEAPON_TIP = new THREE.Vector3(0, 1, 0);

export function buildWeaponMesh(model) {
  if (!weaponCache.has(model)) {
    const src = WEAPON_FILES[`../../assets/models/weapons/${model}.bbmodel`];
    if (!src) console.warn(`No weapon model assets/models/weapons/${model}.bbmodel`);
    weaponCache.set(model, src ? buildBBModel(src, MODEL_PX) : box(0.05, 0.5, 0.02, lam(0xb8bcc4), 0, 0.25));
  }
  // Clones share geometry and materials with the cached original.
  return weaponCache.get(model).clone();
}

// Floor items are Blockbench projects too: one per kind, except armour and artefacts (one per type), food and pack
// expansions (one per type) and keys (the iron key's `key`, and `key_gold`).
const ITEM_FILES = import.meta.glob('../../assets/models/items/*.bbmodel', { import: 'default', eager: true });
const itemCache = new Map();
const itemModelName = (item) =>
  item.kind === 'armor' ? `armor_${item.type}` : ['food', 'artefact', 'container'].includes(item.kind) ? item.type
    : item.kind === 'key' && item.type === 'gold' ? 'key_gold' : item.kind;
// Parts on a "_tint" texture are painted in greys and take the item's colour; some also glow in it.
const TINT_GLOW = { potion: 0.25, ring: 0.6 };
// Lowest point of an item lying in the world, relative to the height it is placed (and bobs) at.
const ITEM_BASE = -0.16;

/**
 * Model for an item. `color` comes from Knowledge.color(item). With `floor`, it is sized and seated for
 * lying in the world: anything smaller than ITEM_MIN_SIZE grows toward it (the smallest grow most but stay
 * a little smaller than the rest), and it rests just above where it bobs rather than sinking into the floor.
 */
export function buildItemModel(item, color, { floor = false } = {}) {
  const g = new THREE.Group();
  const model = item.kind === 'weapon' ? lyingWeapon(item) : OFFHAND_DEFS[item.kind] ? lyingOffhand(item)
    : item.kind === 'arrow' ? lyingPile(item, ARROWS[item.type].model)
    : item.kind === 'thrown' ? lyingPile(item, THROWN[item.type].model, THROWN[item.type].heap) : itemModel(item, color);
  if (floor) {
    const bounds = new THREE.Box3().setFromObject(model);
    const longest = Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
    const k = longest < ITEM_MIN_SIZE ? Math.min(2.5, (ITEM_MIN_SIZE / longest) ** 0.75) : 1;
    model.scale.multiplyScalar(k);
    model.position.multiplyScalar(k);
    model.position.y += ITEM_BASE - bounds.min.y * k;
  }
  g.add(model);
  return g;
}

function lyingWeapon(item) {
  const w = buildWeaponMesh(WEAPONS[item.type].model);
  w.rotation.z = Math.PI / 2.3;
  w.scale.setScalar(0.8);
  // Lie centred on the item's spot, whatever the weapon's length.
  w.position.x = -new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3()).x;
  return w;
}

// What you hold in your off hand (items/defs.js OFFHANDS, SHIELDS and BOWS) has the one model, in your hand (see
// ViewModel) or on the floor: the lantern is assets/models/hand_lantern.bbmodel, the wooden shield wooden_shield.bbmodel,
// the wooden bow wooden_bow.bbmodel. On the floor an off-hand thing lies on its side, like a weapon, unless it `stands`;
// a shield lies flat, face up. Arrows (ARROWS) and thrown weapons (THROWN) are models of their own there too
// (arrow.bbmodel, dart.bbmodel...), as they are in your hand and in flight.
const HELD_FILES = import.meta.glob('../../assets/models/*.bbmodel', { import: 'default', eager: true });
const OFFHAND_DEFS = { offhand: OFFHANDS, shield: SHIELDS, bow: BOWS };

/** A model held in a hand, assets/models/<name>.bbmodel: a copy of it, built once. */
export function heldModel(name) {
  const key = `held:${name}`;
  if (!itemCache.has(key)) {
    const src = HELD_FILES[`../../assets/models/${name}.bbmodel`];
    if (!src) console.warn(`No model assets/models/${name}.bbmodel`);
    itemCache.set(key, src ? buildBBModel(src, MODEL_PX) : box(0.05, 0.4, 0.05, lam(0x8a5a2a), 0, 0.2));
  }
  return itemCache.get(key).clone();
}

function lyingOffhand(item) {
  const shield = item.kind === 'shield', bow = item.kind === 'bow', def = OFFHAND_DEFS[item.kind][item.type];
  const m = heldModel(def.model);
  if (shield) m.rotation.x = -Math.PI / 2;
  else if (bow) m.rotation.z = Math.PI / 2;
  else if (!def.stands) m.rotation.z = Math.PI / 2.2;
  // Centred on the item's spot, about which floor items turn (standing, its middle too, where they bob).
  const mid = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
  m.position.set(-mid.x, def.stands ? -mid.y : 0, def.stands || shield || bow ? -mid.z : 0);
  return m;
}

// Where each of a heap of stones lies (x, y, z in metres), and how it's turned (about x, y and z): two side by side and
// one on top of them.
const HEAP = [[-0.034, 0, 0.016, 0, 0.3, 0], [0.036, 0, -0.012, 0.1, 2.1, 0.08], [0.002, 0.024, 0.004, -0.2, 1.2, 0.18]];

/**
 * A pile of arrows or thrown weapons on the floor (assets/models/<name>.bbmodel): one, two or three of them (as many as
 * there are, to three), side by side, or `heaped` (stones) in a little heap.
 */
function lyingPile(item, name, heaped = false) {
  const g = new THREE.Group(), n = Math.min(3, item.qty);
  for (let i = 0; i < n; i++) {
    const m = heldModel(name);
    if (heaped) {
      const [x, y, z, rx, ry, rz] = HEAP[i];
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
    } else {
      m.rotation.set(0, (i - (n - 1) / 2) * 0.12, -Math.PI / 2);
      m.position.z = (i - (n - 1) / 2) * 0.05;
    }
    g.add(m);
  }
  const mid = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
  for (const m of g.children) {
    m.position.x -= mid.x;
    if (heaped) m.position.z -= mid.z;
  }
  return g;
}

/**
 * Model for an item's icon (see ui/icons.js): as it's held or stands rather than lying on the floor, a weapon, an
 * arrow or a thrown weapon point up, one of them, an off-hand thing in your hand's frame, and a scroll open
 * (scroll_open.bbmodel), its rune to be painted on.
 */
export function iconItemModel(item, color) {
  if (item.kind === 'weapon') return buildWeaponMesh(WEAPONS[item.type].model);
  if (OFFHAND_DEFS[item.kind]) return heldModel(OFFHAND_DEFS[item.kind][item.type].model);
  if (item.kind === 'arrow') return heldModel(ARROWS[item.type].model);
  if (item.kind === 'thrown') return heldModel(THROWN[item.type].model);
  return itemModel(item, color, item.kind === 'scroll' ? 'scroll_open' : itemModelName(item));
}

function itemModel(item, color, name = itemModelName(item)) {
  if (!itemCache.has(name)) {
    const src = ITEM_FILES[`../../assets/models/items/${name}.bbmodel`];
    if (!src) console.warn(`No item model assets/models/items/${name}.bbmodel`);
    itemCache.set(name, src ? buildBBModel(src, MODEL_PX) : box(0.2, 0.2, 0.2, lam(0xff00ff)));
  }
  const model = itemCache.get(name).clone();
  const glow = TINT_GLOW[item.kind] || 0;
  model.traverse((o) => {
    if (!o.isMesh || !o.name.endsWith('_tint')) return;
    o.material = o.material.clone();
    o.material.color.set(color);
    if (glow) {
      o.material.emissive.set(color).multiplyScalar(glow);
      o.material.emissiveMap = o.material.map;
    }
  });
  return model;
}
