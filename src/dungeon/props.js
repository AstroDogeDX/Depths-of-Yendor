import * as THREE from 'three';
import { buildBBModel } from '../items/bbmodel.js';
import { MODEL_PX, TILE } from '../config.js';

// Room furniture: Blockbench projects in assets/models/props, set out by room types (see rooms.js) and theme
// decorations (decor.js). A prop's origin sits on the floor at its middle with its front facing +z. Empty
// groups named slot_1, slot_2... mark where items rest on it, such as a shop's wares, and candle_1, candle_2...
// where candle flames burn.
//
// Props load on demand, each its own small download, so the game starts without every theme's furniture:
// loadProps() fetches what a floor needs before it's built (see propsForTheme in levelBuilder.js).
const FILES = import.meta.glob('../../assets/models/props/*.bbmodel', { import: 'default' });
const file = (type) => `../../assets/models/props/${type}.bbmodel`;
const sources = new Map(); // type -> the parsed .bbmodel, once it has arrived
const fetching = new Map(); // type -> its download in progress
const templates = new Map();

/**
 * Fetches the models for `types`. Returns a promise that settles when they have all arrived, or null if they
 * already had, so a caller can carry straight on.
 */
export function loadProps(types) {
  const missing = types.filter((t) => !sources.has(t));
  if (!missing.length) return null;
  return Promise.all(missing.map((type) => {
    if (!fetching.has(type)) {
      if (!FILES[file(type)]) throw new Error(`No prop model assets/models/props/${type}.bbmodel`);
      fetching.set(type, FILES[file(type)]().then(
        (src) => { sources.set(type, src); fetching.delete(type); },
        (err) => { fetching.delete(type); throw err; }, // so a later call tries again
      ));
    }
    return fetching.get(type);
  }));
}

function template(type) {
  if (!templates.has(type)) {
    const src = sources.get(type);
    if (!src) throw new Error(`Prop ${type} isn't loaded: fetch it with loadProps() first`);
    const model = buildBBModel(src, MODEL_PX);
    const { anchors } = model.userData;
    const numbered = (prefix) => Object.keys(anchors).filter((n) => new RegExp(`^${prefix}_\\d+$`).test(n))
      .sort((a, b) => a.slice(prefix.length + 1) - b.slice(prefix.length + 1)).map((n) => anchors[n]);
    templates.set(type, { model, bounds: new THREE.Box3().setFromObject(model), slots: numbered('slot'), candles: numbered('candle') });
  }
  return templates.get(type);
}

/**
 * Sets out a prop { type, x, y (grid tiles), yaw, solid, round }. Returns its mesh, the world positions of
 * its slots and candles, and an obstacle over its footprint (a box, or a circle for round things) if it's solid.
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
  return { mesh, slots: t.slots.map(place), candles: t.candles.map(place), obstacle };
}
