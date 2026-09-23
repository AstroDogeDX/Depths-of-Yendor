import * as THREE from 'three';
import { buildBBModel } from '../items/bbmodel.js';
import { MODEL_PX } from '../config.js';

// Monster models are Blockbench projects in assets/models/monsters, rigged with groups ("bones") that the
// animations below turn and move about their pivots, found by name: body, head, arm_left/right and
// leg_left/right on bipeds, plus wing_*, tail, leg_front_*/leg_back_* and blob on the others.
// A model's origin is at its feet and it faces +z.
//
// buildMonsterModel returns { root, animate(s), materials, height }. animate(s) receives { t, walk, windup,
// strike } where windup/strike are 0..1 progress or -1. materials are the monster's own lit materials, so
// it can be tinted (hurt, burning...) on its own.

const FILES = import.meta.glob('../../assets/models/monsters/*.bbmodel', { import: 'default', eager: true });
const templates = new Map();

const easeOut = (x) => 1 - (1 - x) * (1 - x);

// Animations work relative to each bone's rest pose from the model, so a joint posed in Blockbench stays posed.
function turn(bone, x = 0, y = 0, z = 0) {
  if (!bone) return;
  const r = bone.userData.rest.r;
  bone.rotation.set(r.x + x, r.y + y, r.z + z);
}
function move(bone, x = 0, y = 0, z = 0) {
  if (!bone) return;
  const p = bone.userData.rest.p;
  bone.position.set(p.x + x, p.y + y, p.z + z);
}

// Two-legged walk, arms swinging; the right arm raises its weapon overhead and chops.
const biped = (b, lean = 0) => (s) => {
  const sw = Math.sin(s.walk) * 0.55;
  turn(b.leg_left, sw);
  turn(b.leg_right, -sw);
  turn(b.arm_left, -sw * 0.8);
  let arm = sw * 0.8, bodyX = lean;
  if (s.windup >= 0) arm = -2.7 * easeOut(s.windup);
  else if (s.strike >= 0) {
    arm = -2.7 + 2.4 * easeOut(Math.min(1, s.strike * 2));
    bodyX = lean + 0.25 * Math.sin(Math.PI * s.strike);
  }
  turn(b.arm_right, arm);
  turn(b.body, bodyX);
  move(b.body, 0, Math.abs(Math.sin(s.walk)) * 0.03);
};

// Per type: (bones, root) => animate(s).
const ANIMATE = {
  rat: (b) => (s) => {
    // Diagonal pairs of legs step together.
    [['leg_front_left', 0], ['leg_back_right', 0], ['leg_front_right', Math.PI], ['leg_back_left', Math.PI]]
      .forEach(([name, phase]) => turn(b[name], Math.sin(s.walk * 1.5 + phase) * 0.6));
    move(b.body, 0, 0, s.windup >= 0 ? -0.12 * s.windup : s.strike >= 0 ? 0.3 * Math.sin(Math.PI * s.strike) : 0);
    turn(b.tail, 0, Math.sin(s.t * 6) * 0.3);
  },
  bat: (b) => (s) => {
    const flap = Math.sin(s.t * 20) * 0.9;
    turn(b.wing_left, 0, 0, -flap);
    turn(b.wing_right, 0, 0, flap);
    move(b.body, 0, Math.sin(s.t * 5) * 0.08, s.strike >= 0 ? 0.35 * Math.sin(Math.PI * s.strike) : 0);
  },
  slime: (b) => (s) => {
    // Squash and stretch about the base: it wobbles, squashes to wind up, then lunges.
    let k = 1 + Math.sin(s.t * 4) * 0.09, z = 0;
    if (s.windup >= 0) k = 1 - 0.3 * s.windup;
    else if (s.strike >= 0) { k = 0.7 + 0.6 * Math.sin(Math.PI * s.strike); z = 0.3 * Math.sin(Math.PI * s.strike); }
    b.blob.scale.set(1 + (1 - k) * 0.5, k, 1 + (1 - k) * 0.5);
    move(b.blob, 0, 0, z);
  },
  goblin: (b) => biped(b),
  skeleton: (b) => biped(b),
  orc: (b) => biped(b),
  golem: (b) => biped(b),
  warden: (b) => biped(b),
  troll: (b) => biped(b, 0.3),
  archer: (b) => {
    const walk = biped(b);
    return (s) => {
      walk({ ...s, windup: -1, strike: -1 });
      // Draw and loose: both arms come up level to aim.
      if (s.windup >= 0 || s.strike >= 0) {
        turn(b.arm_left, -Math.PI / 2);
        turn(b.arm_right, -Math.PI / 2 + (s.windup >= 0 ? 0 : 0.3));
      }
    };
  },
  wraith: (b) => (s) => {
    move(b.body, 0, Math.sin(s.t * 2) * 0.1, s.strike >= 0 ? 0.3 * Math.sin(Math.PI * s.strike) : 0);
    let arms = 0.4;
    if (s.windup >= 0) arms = 0.4 - 1.4 * s.windup;
    else if (s.strike >= 0) arms = -1.0 + 1.4 * s.strike;
    turn(b.body, 0, 0, Math.sin(s.t * 1.3) * 0.05);
    turn(b.arm_left, arms);
    turn(b.arm_right, arms);
  },
  imp: (b, root) => {
    const walk = biped(b);
    return (s) => {
      walk(s);
      const beat = Math.sin(s.t * 14) * 0.4;
      turn(b.wing_left, 0, -beat);
      turn(b.wing_right, 0, beat);
      root.position.y = 0.1 + Math.sin(s.t * 6) * 0.05; // hovers on its wings
    };
  },
};

export function buildMonsterModel(type) {
  if (!templates.has(type)) {
    const src = FILES[`../../assets/models/monsters/${type}.bbmodel`];
    if (!src) throw new Error(`No model for monster ${type}`);
    templates.set(type, buildBBModel(src, MODEL_PX, { rig: true }));
  }
  const root = templates.get(type).clone();
  const own = new Map();
  const bones = {};
  root.traverse((o) => {
    if (o.isMesh && o.material.isMeshLambertMaterial) {
      if (!own.has(o.material)) {
        const m = o.material.clone();
        m.userData.baseEmissive = m.emissive.getHex();
        own.set(o.material, m);
      }
      o.material = own.get(o.material);
    } else if (o.isGroup && o.name) {
      bones[o.name] = o;
      o.userData.rest = { p: o.position.clone(), r: o.rotation.clone() };
    }
  });
  const height = new THREE.Box3().setFromObject(root).max.y;
  return { root, animate: ANIMATE[type](bones, root), materials: [...own.values()], height };
}
