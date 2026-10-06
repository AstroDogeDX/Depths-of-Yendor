import * as THREE from 'three';
import { buildBBModel } from '../items/bbmodel.js';
import { MODEL_PX } from '../config.js';

// Monster models are Blockbench projects in assets/models/monsters, rigged with groups ("bones") that the
// animations below turn and move about their pivots, found by name: body, head, arm_left/right and
// leg_left/right on bipeds, plus wing_*, tail, leg_front_*/leg_back_*, blob, and the mimic's lid, tongue and eye
// on the others. A model's origin is at its feet and it faces +z.
//
// buildMonsterModel returns { root, animate(s), materials, height, meshes, crown(out) }. animate(s) receives { t, walk,
// windup, strike, move, reveal, asleep } where windup/strike are 0..1 progress or -1, `move` the boss move they're of
// (see `moves` in defs.js), or null for its blow or shot, reveal the seconds since it gave itself away (a mimic waking,
// the Maledicted Ooze heaving itself up) or -1, and `dying` (0..1) how far a boss with a death of its own is through it
// (see bosses.js); a mimic passing for a chest gets { dormant: true, lick } instead (see Level.addChest).
// materials are the monster's own lit materials, so it can be tinted (hurt, burning...) on its own. meshes are its
// meshes, and crown(out) sets `out` to the top of its head in the world, as it stands now: for what shows on it and
// over its head (see fx/statusFx.js).

const FILES = import.meta.glob('../../assets/models/monsters/*.bbmodel', { import: 'default', eager: true });
// The render layer a living monster's meshes are on as well as the usual one, so mind vision can find them to outline
// through walls (see fx/screenFx.js). A mimic passing for a chest is on it too: it has a mind all the same.
export const SENSED_LAYER = 1;
const templates = new Map();
const crowns = new Map();
// Where the crown of a monster with no `head` is: the top of the whole model, this far from its middle toward its front
// (a share of the way), for one whose head is out in front (the rat's).
const CROWN_FORWARD = { rat: 0.6 };

/** The top of a monster's head, in its `head` bone's frame, or if it has none, in the model's. */
function crownOf(type, template) {
  template.updateMatrixWorld(true);
  let head = null;
  template.traverse((o) => { if (o.isGroup && o.name === 'head') head = o; });
  if (head && new THREE.Box3().setFromObject(head).isEmpty()) head = null;
  const box = new THREE.Box3().setFromObject(head ?? template);
  const mid = box.getCenter(new THREE.Vector3());
  const top = new THREE.Vector3(mid.x, box.max.y, mid.z + (box.max.z - mid.z) * (CROWN_FORWARD[type] ?? 0));
  return { bone: head ? 'head' : null, at: head ? head.worldToLocal(top) : top };
}

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
  // The Maledicted Ooze (see monsters/bosses.js): as the ooze does, but vast and slow, breathing. Asleep, it lies sunk low
  // in its filth, and waking (`reveal`), it heaves itself up, overshooting and settling. Each of its moves winds up its
  // own way: its blow rears back and lunges; its spit swells forward and snaps back; its blast swells up wide,
  // quivering harder and harder, and slams down flat. Its core and all in it drift slowly round inside it. Dying, it
  // slumps into a puddle (`dying`, 0..1).
  maledicted_ooze: (b) => (s) => {
    const SUNK = 0.6;
    let k = 1 + Math.sin(s.t * 2.1) * 0.035, wide = 0, z = 0, lean = 0, quiver = 0;
    if (s.asleep) k = SUNK + Math.sin(s.t * 0.8) * 0.025;
    else if (s.reveal >= 0) {
      const r = Math.min(1, s.reveal / 1.2), up = 1 - (1 - r) ** 3;
      k = SUNK + (1 - SUNK) * up + Math.sin(r * Math.PI * 3) * 0.1 * (1 - r);
    }
    if (s.walk) k += Math.sin(s.walk * 1.3) * 0.03; // (rolling along)
    const w = s.windup, st = s.strike;
    if (s.move === 'slam') {
      if (w >= 0) {
        k = 1 + 0.22 * easeOut(w);
        wide = 0.12 * w;
        quiver = (0.01 + 0.05 * w * w) * Math.sin(s.t * 47);
      } else if (st >= 0) {
        const hit = Math.min(1, st * 3);
        k = 1.22 - 0.72 * hit + 0.5 * Math.max(0, st - 0.33) * 1.5;
        wide = 0.12 + 0.38 * hit - 0.5 * Math.max(0, st - 0.33) * 1.5;
      }
    } else if (s.move === 'spit') {
      if (w >= 0) {
        k = 1 + 0.1 * w;
        lean = -0.12 * easeOut(w);
      } else if (st >= 0) {
        k = 1.1 - 0.18 * Math.sin(Math.PI * st);
        lean = -0.12 + 0.3 * Math.sin(Math.PI * Math.min(1, st * 1.6));
        z = 0.15 * Math.sin(Math.PI * st);
      }
    } else if (w >= 0) {
      k = 1 + 0.16 * easeOut(w);
      lean = -0.18 * w;
      z = -0.15 * w;
    } else if (st >= 0) {
      k = 1.16 - 0.4 * Math.sin(Math.PI * st);
      lean = -0.18 + 0.45 * Math.sin(Math.PI * Math.min(1, st * 1.5));
      z = 0.55 * Math.sin(Math.PI * st);
    }
    if (s.dying >= 0) {
      const d = easeOut(s.dying);
      k = 1 - 0.88 * d;
      wide = 0.7 * d;
      lean = quiver = 0;
      z = 0;
    }
    const spread = 1 + (1 - k) * 0.45 + wide;
    b.blob.scale.set(spread + quiver, k, spread - quiver);
    turn(b.blob, lean);
    move(b.blob, 0, 0, z);
    turn(b.core, Math.sin(s.t * 0.37) * 0.12, s.t * 0.21, Math.sin(s.t * 0.29) * 0.1);
    move(b.core, 0, Math.sin(s.t * 0.9) * 0.04, 0);
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
  // A chest that bites. Dormant, passing for a chest, it's shut, but for the odd lick of its lips (`lick`, 0..1): its
  // lid lifts a crack, its tongue slips out along the front and back in. Awake, its lid hangs open on its teeth with
  // its tongue lolling out, and it hops after you; it gapes wide to wind up and snaps shut as it lunges. Just woken
  // (`reveal`), it bursts open and jolts up off the floor.
  mimic: (b) => (s) => {
    if (s.dormant) {
      const k = s.lick >= 0 ? Math.sin(Math.PI * s.lick) : 0;
      turn(b.body);
      move(b.body);
      turn(b.lid, -0.2 * Math.min(1, k * 1.8));
      move(b.tongue, 0, 0.09 * k, 0.14 * k);
      turn(b.tongue, 0, 0.3 * Math.sin(s.lick * Math.PI * 5) * k);
      b.eye.visible = false;
      return;
    }
    b.eye.visible = true;
    const hop = Math.abs(Math.sin(s.walk * 0.9));
    let lid = -0.45 - 0.07 * Math.sin(s.t * 2.6) - 0.3 * hop, lift = 0.13 * hop, lean = -0.14 * hop, lunge = 0;
    if (s.windup >= 0) {
      lid = -1.35 * easeOut(s.windup);
      lean = -0.25 * s.windup;
      lift = 0;
    } else if (s.strike >= 0) {
      lid = s.strike < 0.3 ? -1.35 * (1 - easeOut(s.strike / 0.3)) : -0.45 * ((s.strike - 0.3) / 0.7);
      lunge = 0.32 * Math.sin(Math.PI * s.strike);
      lean = 0.1 * Math.sin(Math.PI * s.strike);
      lift = 0;
    } else if (s.reveal >= 0 && s.reveal < 0.7) {
      const r = s.reveal / 0.7;
      lid = -1.25 * Math.sin(Math.PI * Math.min(1, r * 1.5)) * (1 - r) + lid * r;
      lift = 0.2 * Math.sin(Math.PI * r);
      lean = -0.3 * Math.sin(Math.PI * r);
    }
    turn(b.body, lean);
    move(b.body, 0, lift, lunge);
    turn(b.lid, lid);
    move(b.tongue, 0, 0.02, 0.03 + 0.015 * Math.sin(s.t * 3));
    turn(b.tongue, -0.06 + 0.06 * Math.sin(s.t * 4.1), 0.2 * Math.sin(s.t * 2.3));
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
    crowns.set(type, crownOf(type, templates.get(type)));
  }
  const root = templates.get(type).clone();
  const own = new Map();
  const bones = {};
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh) {
      meshes.push(o);
      o.layers.enable(SENSED_LAYER);
    }
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
  const crown = crowns.get(type), crownOn = crown.bone ? bones[crown.bone] : root;
  return {
    root, animate: ANIMATE[type](bones, root), materials: [...own.values()], height, meshes,
    crown: (out) => out.copy(crown.at).applyMatrix4(crownOn.matrixWorld),
  };
}
