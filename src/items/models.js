import * as THREE from 'three';
import { WEAPONS } from './defs.js';
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

// Floor items are Blockbench projects too: one per kind, except armour and artefacts (one per type) and food
// (one per kind of food).
const ITEM_FILES = import.meta.glob('../../assets/models/items/*.bbmodel', { import: 'default', eager: true });
const itemCache = new Map();
const itemModelName = (item) =>
  item.kind === 'armor' ? `armor_${item.type}` : item.kind === 'food' || item.kind === 'artefact' ? item.type : item.kind;
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
  const model = item.kind === 'weapon' ? lyingWeapon(item) : itemModel(item, color);
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

function itemModel(item, color) {
  const name = itemModelName(item);
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
