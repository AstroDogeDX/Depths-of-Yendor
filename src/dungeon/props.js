import * as THREE from 'three';
import { buildBBModel } from '../items/bbmodel.js';
import { MODEL_PX, TILE } from '../config.js';

// Room furniture: Blockbench projects in assets/models/props, set out by room types (see rooms.js). A prop's
// origin sits on the floor at its middle with its front facing +z. Empty groups named slot_1, slot_2... mark
// where items rest on it, such as a shop's wares.
const FILES = import.meta.glob('../../assets/models/props/*.bbmodel', { import: 'default', eager: true });
const templates = new Map();

function template(type) {
  if (!templates.has(type)) {
    const src = FILES[`../../assets/models/props/${type}.bbmodel`];
    if (!src) throw new Error(`No prop model assets/models/props/${type}.bbmodel`);
    const model = buildBBModel(src, MODEL_PX);
    const { anchors } = model.userData;
    const slots = Object.keys(anchors).filter((n) => /^slot_\d+$/.test(n))
      .sort((a, b) => a.slice(5) - b.slice(5)).map((n) => anchors[n]);
    templates.set(type, { model, bounds: new THREE.Box3().setFromObject(model), slots });
  }
  return templates.get(type);
}

/**
 * Sets out a prop { type, x, y (grid tiles), yaw, solid, round }. Returns its mesh, the world positions of
 * its slots, and an obstacle over its footprint (a box, or a circle for round things) if it's solid.
 */
export function placeProp(p) {
  const t = template(p.type);
  const mesh = t.model.clone();
  const x = p.x * TILE, z = p.y * TILE, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = p.yaw;
  const place = ([ax, ay, az]) => [x + ax * c + az * s, ay, z - ax * s + az * c];
  let obstacle = null;
  if (p.solid) {
    const { min, max } = t.bounds;
    const [cx, , cz] = place([(min.x + max.x) / 2, 0, (min.z + max.z) / 2]);
    const hw = (max.x - min.x) / 2, hd = (max.z - min.z) / 2;
    obstacle = p.round ? { x: cx, z: cz, r: Math.max(hw, hd) }
      : { x: cx, z: cz, hw: Math.abs(c) * hw + Math.abs(s) * hd, hd: Math.abs(s) * hw + Math.abs(c) * hd };
  }
  return { mesh, slots: t.slots.map(place), obstacle };
}
