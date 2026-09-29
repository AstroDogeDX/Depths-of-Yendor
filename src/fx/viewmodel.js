import * as THREE from 'three';
import { buildWeaponMesh, buildItemModel } from '../items/models.js';
import { buildBBModel } from '../items/bbmodel.js';
import { MODEL_PX } from '../config.js';
import { glowSprite } from './glow.js';
import { Flame } from './flame.js';
import torchModel from '../../assets/models/torch.bbmodel';

// First-person hands: weapon on the right, what's in your off hand (the torch) on the left. Rendered in its own
// scene after the world (with the depth buffer cleared) so the weapon never clips into walls. Gripped in both hands
// (F), the weapon takes a two-handed pose (see SLASH_2H), and the torch goes down out of sight, to your belt.

// The weapon hangs off four nested groups so its edge always leads the cut:
//   pivot (hand position + yaw) -> plane (roll: tilts the plane the cut travels in)
//   -> arc (rotation about the blade's own x axis, i.e. the flat's normal)
//   -> twist (about the weapon's own length: which way its flat faces, without changing where it points) -> mesh.
// Because buildWeaponMesh puts the edge on -z and the tip on +y, decreasing `arc` swings the tip forward
// and down with the edge in front. Rolling the plane makes the cut diagonal without twisting the edge.
// Keep `roll` constant across the cutting keyframes so the cut is a pure arc. `twist` is optional (0).
const SLASH = [
  { t: 0.0, p: [0.36, -0.42, -0.9], yaw: 0.25, roll: 0.2, arc: -0.35 },  // guard: edge toward the enemy
  { t: 0.24, p: [0.46, -0.24, -0.86], yaw: 0.25, roll: -0.6, arc: 0.4 }, // raised over the right shoulder
  { t: 0.52, p: [-0.16, -0.5, -0.95], yaw: 0.25, roll: -0.6, arc: -2.3 }, // cut down and across to the left
  { t: 1.0, p: [0.36, -0.42, -0.9], yaw: 0.25, roll: 0.2, arc: -0.35 },
];
const THRUST = [
  { t: 0.0, p: [0.3, -0.42, -0.88], yaw: 0.12, roll: 0, arc: -1.3 },
  { t: 0.25, p: [0.32, -0.38, -0.66], yaw: 0.12, roll: 0, arc: -1.38 },  // draw back
  { t: 0.5, p: [0.12, -0.3, -1.35], yaw: 0.12, roll: 0, arc: -1.52 },   // lunge
  { t: 1.0, p: [0.3, -0.42, -0.88], yaw: 0.12, roll: 0, arc: -1.3 },
];
// The same, gripped in both hands. Until there are hands to show it, the pose says so. A blade or haft is held from
// the off-hand side, as if the left hand held it and the right guided it: it rises diagonally across the body, its
// flat toward you, and is raised higher and brought down further. A thrusting weapon comes in nearer the middle,
// gripped more surely, and points straight at the crosshair (at a spot 2.5 m ahead, all through the thrust), its
// flat turned toward you: a spear braced low from the right hip, and a dagger held out before you in both hands,
// jabbed forward with both arms (see KEYS_2H).
const SLASH_2H = [
  { t: 0.0, p: [-0.14, -0.4, -0.78], yaw: 0.85, roll: -0.82, arc: 0.1 },  // guard: across the body
  { t: 0.24, p: [0.44, -0.14, -0.8], yaw: 0.4, roll: -0.75, arc: 0.75 },   // high over the right shoulder
  { t: 0.52, p: [-0.24, -0.56, -0.95], yaw: 0.4, roll: -0.75, arc: -2.5 }, // down and across to the left
  { t: 1.0, p: [-0.14, -0.4, -0.78], yaw: 0.85, roll: -0.82, arc: 0.1 },
];
const THRUST_2H = [
  { t: 0.0, p: [0.16, -0.43, -0.7], yaw: 0.089, roll: 0, arc: -1.337, twist: 1.2 }, // guard: braced at the hip
  { t: 0.25, p: [0.18, -0.41, -0.5], yaw: 0.09, roll: 0, arc: -1.369, twist: 1.2 }, // draw back
  { t: 0.5, p: [0.06, -0.36, -1.3], yaw: 0.05, roll: 0, arc: -1.28, twist: 1.2 },   // drive it home
  { t: 1.0, p: [0.16, -0.43, -0.7], yaw: 0.089, roll: 0, arc: -1.337, twist: 1.2 },
];
const JAB_2H = [
  { t: 0.0, p: [0.06, -0.28, -0.62], yaw: 0.032, roll: 0, arc: -1.423, twist: 1.2 },  // guard: held out before you
  { t: 0.25, p: [0.07, -0.29, -0.48], yaw: 0.035, roll: 0, arc: -1.428, twist: 1.2 }, // draw back
  { t: 0.5, p: [0.02, -0.24, -1.02], yaw: 0.014, roll: 0, arc: -1.41, twist: 1.2 },   // jab with both arms
  { t: 1.0, p: [0.06, -0.28, -0.62], yaw: 0.032, roll: 0, arc: -1.423, twist: 1.2 },
];
// Weapons (by model) with a two-handed pose of their own; the rest slash or thrust by their damage type.
const KEYS_2H = { dagger: JAB_2H };

// Something held up from the hotbar in place of your weapon (see Game.holdSlot): the weapon goes down out of sight and
// it comes up, taking HOLD_RAISE seconds in all (half each), and the reverse when you let go. Only once it's up can you
// use it, and then again HOLD_USE seconds after each use.
export const HOLD_RAISE = 0.4;
export const HOLD_USE = 0.35;
const HELD_AT = [0.24, -0.3, -0.72]; // where it's held up, in the right hand
// How it's held, by kind: turned from its floor model's frame (a wand points ahead, crystal first), and scaled.
const HELD_KINDS = { wand: { turn: [-0.1, -Math.PI / 2, 0], scale: 1 }, potion: { turn: [0.1, 0.4, 0], scale: 0.5 } };
// What using it looks like (see act), each over `dur` seconds: `k` rises from 0 to 1 and back over it.
export const actTime = (kind) => ACTS[kind].dur;
const ACTS = {
  throw: { dur: 0.35, pose: (k) => ({ p: [0, 0.14 * k, -0.28 * k], r: [-0.9 * k, 0, 0] }) }, // lobbed ahead
  drink: { dur: 0.6, pose: (k) => ({ p: [-0.2 * k, 0.2 * k, 0.3 * k], r: [0, 0, 1.3 * k] }) }, // up to your lips, tipped
  zap: { dur: 0.3, pose: (k) => ({ p: [0, 0.02 * k, -0.16 * k], r: [0.15 * k, 0, 0] }) }, // jabbed at the crosshair
  self: { dur: 0.55, pose: (k) => ({ p: [-0.12 * k, 0.06 * k, 0.12 * k], r: [0, 2.4 * k, 0] }) }, // turned on yourself
};

const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, k) => a + (b - a) * k;
const blend = (a, b, k) => ({
  p: a.p.map((v, j) => lerp(v, b.p[j], k)),
  yaw: lerp(a.yaw, b.yaw, k), roll: lerp(a.roll, b.roll, k), arc: lerp(a.arc, b.arc, k),
  twist: lerp(a.twist ?? 0, b.twist ?? 0, k),
});

function sample(keys, t) {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b.t) return blend(a, b, smooth((t - a.t) / (b.t - a.t)));
  }
  return blend(keys.at(-1), keys.at(-1), 0);
}

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.ambient = new THREE.AmbientLight(0xffe0c0, 0.7);
    this.scene.add(this.ambient);
    this.torchLight = new THREE.PointLight(0xffa050, 2.2, 3, 1.5);
    this.torchLight.position.set(-0.4, -0.15, -0.7);
    this.scene.add(this.torchLight);

    this.weaponPivot = new THREE.Group();
    this.weaponPlane = new THREE.Group();
    this.weaponArc = new THREE.Group();
    this.weaponTwist = new THREE.Group();
    this.weaponPivot.add(this.weaponPlane);
    this.weaponPlane.add(this.weaponArc);
    this.weaponArc.add(this.weaponTwist);
    this.scene.add(this.weaponPivot);
    this.weapon = null;
    this.keys = SLASH; // one-handed
    this.keys2 = SLASH_2H; // two-handed
    this.grip = 0; // eases between one hand (0) and two (1)
    this.torchUp = 1; // eases between the torch held up (1) and down out of sight (0)
    this.swingT = -1;
    this.swingDur = 0.3;
    this.dipT = -1;

    // Torch: a Blockbench model whose empty "flame" group marks where the fire sits. Its glowing crown
    // uses an emissive (unlit) texture, which pulses with the flame.
    this.torch = new THREE.Group();
    const model = buildBBModel(torchModel, MODEL_PX);
    this.embers = model.children.find((m) => m.material.isMeshBasicMaterial)?.material;
    const top = new THREE.Vector3().fromArray(model.userData.anchors.flame);
    this.flame = new Flame({ width: 0.14, height: 0.26, pixel: 0.01 });
    this.flame.position.copy(top);
    this.halo = glowSprite(0xff9030, 0.42, 0.55);
    this.halo.position.set(top.x, top.y + 0.07, top.z);
    this.torch.add(model, this.flame, this.halo);
    this.lean = 0;
    this.lastYaw = null;
    this.torch.position.set(-0.5, -0.52, -0.95);
    this.torch.rotation.set(-0.25, 0, 0.2);
    this.scene.add(this.torch);

    // What's held up from the hotbar (see update's `held`): `heldItem` the item it shows, and `swap` how far along the
    // change is: 0 the weapon up, 0.5 both down, 1 the item up.
    this.heldPivot = new THREE.Group();
    this.scene.add(this.heldPivot);
    this.heldItem = null;
    this.heldModel = null;
    this.swap = 0;
    this.actKind = null;
    this.actT = -1;
    this.actGone = false; // the last of them: it's gone from your hand once used
  }

  /** Acts out using what's held up (see ACTS); `gone`: that was the last of it, which leaves your hand. */
  act(kind, gone = false) {
    this.actKind = kind;
    this.actT = 0;
    this.actGone = gone;
  }

  /** Puts `item` in the hand (or nothing), to be raised. */
  showHeld(item, color) {
    if (this.heldModel) this.heldPivot.remove(this.heldModel);
    this.heldItem = item;
    this.heldModel = null;
    this.actT = -1;
    if (!item) return;
    const model = buildItemModel(item, color);
    const turn = new THREE.Group();
    const how = HELD_KINDS[item.kind] ?? { turn: [0, 0, 0], scale: 1 };
    turn.rotation.set(...how.turn);
    turn.scale.setScalar(how.scale);
    turn.add(model);
    this.heldModel = turn;
    this.heldPivot.add(turn);
  }

  /** Holds the weapon with this def (items/defs.js WEAPONS), or nothing. Stabbing weapons thrust. */
  setWeapon(def) {
    if (this.weapon) this.weaponTwist.remove(this.weapon);
    this.weapon = def ? buildWeaponMesh(def.model) : null;
    const stab = def?.dmgType === 'stab';
    this.keys = stab ? THRUST : SLASH;
    this.keys2 = KEYS_2H[def?.model] ?? (stab ? THRUST_2H : SLASH_2H);
    if (this.weapon) this.weaponTwist.add(this.weapon);
  }

  swing(duration) {
    this.swingT = 0;
    this.swingDur = duration;
  }

  dip() {
    this.dipT = 0;
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * `offhand`: the type of what's in your off hand (only the torch has a model yet), or null; `twoHanded`: your weapon
   * gripped in both hands, with it stowed; `torchLight`: how brightly your torch lights you (Player.torchLight).
   */
  update(dt, { moving, bob, charge, time, lightLevel, torchLight = 1, offhand = 'torch', twoHanded = false, yaw = 0, sprint = false, held = null }) {
    // What's held up from the hotbar: a new one waits for the last to go down (or, from the weapon, goes straight in).
    const want = held?.item ?? null;
    if (want !== this.heldItem && this.swap <= 0.5) this.showHeld(want, held?.color);
    const to = want !== this.heldItem ? 0.5 : want ? 1 : 0;
    const step = dt / HOLD_RAISE;
    this.swap = to > this.swap ? Math.min(to, this.swap + step) : Math.max(to, this.swap - step);
    const lowered = smooth(Math.min(1, this.swap * 2)), raised = smooth(Math.max(0, this.swap * 2 - 1));

    // Changing grip eases the weapon between its poses, and the torch up or down.
    const ease = Math.min(1, dt * 9);
    this.grip += ((twoHanded ? 1 : 0) - this.grip) * ease;
    this.torchUp += ((offhand === 'torch' && !twoHanded ? 1 : 0) - this.torchUp) * ease;
    const at = (t) => blend(sample(this.keys, t), sample(this.keys2, t), this.grip);
    let pose = at(0);
    if (this.swingT >= 0) {
      this.swingT += dt / this.swingDur;
      if (this.swingT >= 1) this.swingT = -1;
      else pose = at(this.swingT);
    } else {
      // Weapon sags while the attack meter refills, King's Field style.
      pose.p[1] -= (1 - charge) * 0.14;
      pose.arc += (1 - charge) * 0.3;
    }
    if (this.dipT >= 0) {
      this.dipT += dt / 0.35;
      if (this.dipT >= 1) this.dipT = -1;
      else pose.p[1] -= Math.sin(Math.PI * this.dipT) * 0.25;
    }
    // Running: the weapon drops a little and swings more with each stride.
    const sway = sprint ? 2.2 : 1;
    if (sprint && this.swingT < 0) pose.p[1] -= 0.06;
    const bx = moving ? Math.sin(bob) * 0.012 * sway : 0;
    const by = moving ? Math.abs(Math.cos(bob)) * 0.014 * sway : Math.sin(time * 1.5) * 0.003;
    pose.p[1] -= lowered * 0.75;
    pose.arc += lowered * 0.7;
    this.weaponPivot.visible = lowered < 0.99;
    this.weaponPivot.position.set(pose.p[0] + bx, pose.p[1] + by, pose.p[2]);
    this.weaponPivot.rotation.set(0, pose.yaw, 0);
    this.weaponPlane.rotation.set(0, 0, pose.roll);
    this.weaponArc.rotation.set(pose.arc, 0, 0);
    this.weaponTwist.rotation.set(0, pose.twist, 0);
    this.updateHeld(dt, raised, bx, by);
    const down = 1 - this.torchUp;
    this.torch.position.set(-0.5 - bx, -0.52 + by - down * 0.75, -0.95);
    this.torch.visible = this.torchUp > 0.01;

    const flick = 0.85 + Math.sin(time * 23) * 0.06 + Math.sin(time * 7.3) * 0.08;
    // The flame trails behind when you turn and sways with your stride.
    const turn = this.lastYaw === null || dt <= 0 ? 0 : Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) / dt;
    this.lastYaw = yaw;
    const leanTo = THREE.MathUtils.clamp(turn * 0.18, -0.4, 0.4) + (moving ? Math.sin(bob) * 0.06 * sway : 0);
    this.lean += (leanTo - this.lean) * Math.min(1, dt * 10);
    this.flame.update(time, flick, this.lean);
    if (this.embers) this.embers.color.setScalar(0.8 + (flick - 0.85) * 1.6);
    this.halo.material.opacity = 0.45 + (flick - 0.85) * 1.5;
    // The torch lights your weapon from where it is: up beside it, or low at your belt.
    this.torchLight.position.set(-0.4, -0.15 - down * 0.6, -0.7);
    this.torchLight.intensity = 2.2 * flick * lightLevel * torchLight;
    this.ambient.intensity = 0.25 + lightLevel * 0.45;
  }

  /** Poses what's held up: `raised` how far (0..1), and what using it looks like, if it's being used. */
  updateHeld(dt, raised, bx, by) {
    const h = this.heldPivot;
    h.visible = !!this.heldModel && raised > 0.01;
    let p = [0, 0, 0], r = [0, 0, 0];
    if (this.actT >= 0) {
      const a = ACTS[this.actKind];
      this.actT += dt / a.dur;
      // The last one leaves your hand: thrown at the top of the throw, drunk at the end.
      if (this.actGone && this.heldModel && this.actT >= (this.actKind === 'throw' ? 0.5 : 1)) this.heldModel.visible = false;
      if (this.actT >= 1) this.actT = -1;
      else ({ p, r } = a.pose(Math.sin(Math.PI * this.actT)));
    }
    h.position.set(HELD_AT[0] + p[0] + bx, HELD_AT[1] + p[1] + by - (1 - raised) * 0.6, HELD_AT[2] + p[2]);
    h.rotation.set(r[0] - (1 - raised) * 0.5, r[1], r[2]);
  }
}
