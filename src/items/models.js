import * as THREE from 'three';
import { WEAPONS } from './defs.js';
import { buildBBModel } from './bbmodel.js';
import { MODEL_PX } from '../config.js';

const lam = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  return b;
};
const cyl = (r, h, m, y = 0, seg = 5) => {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  c.position.y = y;
  return c;
};

// Weapon models are Blockbench projects (Generic Model format), one per WEAPONS[type].model, read straight
// from the saved .bbmodel files.
const WEAPON_FILES = import.meta.glob('../../assets/models/weapons/*.bbmodel', { query: '?raw', import: 'default', eager: true });
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

function glowMat(color, strength = 0.35) {
  const c = new THREE.Color(color);
  return lam(color, { emissive: c.clone().multiplyScalar(strength) });
}

function artefactModel(type, color) {
  const g = new THREE.Group();
  const m = glowMat(color, 0.5);
  switch (type) {
    case 'chalice': {
      const pts = [[0, 0], [0.12, 0], [0.12, 0.02], [0.03, 0.05], [0.03, 0.18], [0.14, 0.28], [0.15, 0.4], [0.13, 0.4], [0.02, 0.26]];
      g.add(new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 7), lam(0xd0a830, { emissive: 0x302000, side: THREE.DoubleSide })));
      const wine = new THREE.Mesh(new THREE.CircleGeometry(0.13, 7), m);
      wine.rotation.x = -Math.PI / 2;
      wine.position.y = 0.37;
      g.add(wine);
      g.position.y = -0.15;
      break;
    }
    case 'eye': {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lam(0xe8e0d0, { emissive: 0x202020 })));
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), m);
      iris.position.z = 0.1;
      g.add(iris);
      break;
    }
    case 'horn': {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 6, 3, true), lam(0xd8c8a0, { side: THREE.DoubleSide }));
      h.rotation.z = Math.PI / 2.4;
      g.add(h, box(0.16, 0.03, 0.03, m, 0, 0.02, 0));
      break;
    }
    case 'cloak': {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 6, 1, true), lam(0x303048, { emissive: 0x0a0a20, side: THREE.DoubleSide }));
      g.add(c, box(0.08, 0.04, 0.04, m, 0, 0.2, 0.1));
      break;
    }
    case 'boots':
      g.add(box(0.1, 0.2, 0.1, m, -0.07, 0), box(0.1, 0.05, 0.18, m, -0.07, -0.08, 0.05),
        box(0.1, 0.2, 0.1, m, 0.07, 0), box(0.1, 0.05, 0.18, m, 0.07, -0.08, 0.05));
      break;
    case 'ember':
      g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), new THREE.MeshBasicMaterial({ color })));
      break;
  }
  return g;
}

/** World (floor) model for an item. `color` comes from Knowledge.color(item). */
export function buildItemModel(item, color) {
  const g = new THREE.Group();
  switch (item.kind) {
    case 'potion': {
      const liquid = lam(color, { emissive: new THREE.Color(color).multiplyScalar(0.25), transparent: true, opacity: 0.9 });
      const flask = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 5), liquid);
      const neck = cyl(0.03, 0.08, lam(0xc8d8e0, { transparent: true, opacity: 0.6 }), 0.11);
      const cork = cyl(0.032, 0.03, lam(0x8a6a40), 0.16);
      g.add(flask, neck, cork);
      break;
    }
    case 'scroll': {
      const roll = cyl(0.045, 0.28, lam(0xd8c8a0, { emissive: 0x151008 }), 0, 6);
      roll.rotation.z = Math.PI / 2;
      const band = cyl(0.048, 0.04, lam(0x902020), 0, 6);
      band.rotation.z = Math.PI / 2;
      g.add(roll, band);
      break;
    }
    case 'weapon': {
      const w = buildWeaponMesh(WEAPONS[item.type].model);
      w.rotation.z = Math.PI / 2.3;
      w.scale.setScalar(0.8);
      // Lie centred on the item's spot, whatever the weapon's length.
      w.position.x = -new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3()).x;
      g.add(w);
      break;
    }
    case 'armor': {
      const m = lam(color);
      g.add(box(0.36, 0.4, 0.16, m), box(0.5, 0.1, 0.18, m, 0, 0.17), box(0.1, 0.22, 0.12, m, -0.24, 0.02), box(0.1, 0.22, 0.12, m, 0.24, 0.02));
      break;
    }
    case 'wand': {
      const w = cyl(0.018, 0.36, lam(color), 0, 5);
      w.rotation.z = Math.PI / 2.5;
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), new THREE.MeshBasicMaterial({ color: 0xc0e0ff }));
      tip.position.set(-0.16, 0.06, 0);
      g.add(w, tip);
      break;
    }
    case 'ring': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 4, 10), lam(0xd0a830, { emissive: 0x201400 }));
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), glowMat(color, 0.6));
      gem.position.y = 0.07;
      g.add(band, gem);
      g.scale.setScalar(1.4);
      break;
    }
    case 'food': {
      if (item.type === 'apple') g.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), lam(0x8a3a20)));
      else g.add(box(0.24, 0.1, 0.16, lam(0x8a5a2a)), box(0.26, 0.02, 0.04, lam(0xc8b890), 0, 0.05));
      break;
    }
    case 'gold': {
      const m = lam(0xf0c040, { emissive: 0x403000 });
      for (let i = 0; i < 5; i++) {
        const c = cyl(0.05, 0.02, m, i * 0.022 - 0.05, 7);
        c.position.x = (i % 2) * 0.03;
        g.add(c);
      }
      break;
    }
    case 'artefact':
      g.add(artefactModel(item.type, color));
      break;
    case 'key': {
      const iron = lam(0xb8b0a0, { emissive: 0x202018 });
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 4, 10), iron);
      bow.position.x = -0.1;
      g.add(bow, box(0.16, 0.022, 0.022, iron, 0.03, 0), box(0.02, 0.045, 0.02, iron, 0.09, -0.03),
        box(0.02, 0.03, 0.02, iron, 0.05, -0.025));
      break;
    }
    case 'amulet': {
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 4, 14), lam(0xffd040, { emissive: 0x403000 }));
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xff2040 }));
      gem.position.y = -0.14;
      g.add(chain, gem);
      break;
    }
  }
  return g;
}
