import * as THREE from 'three';
import { buildWeaponMesh, buildItemModel, heldModel } from '../items/models.js';
import { SHIELDS, BOWS, ARROWS, THROWN } from '../items/defs.js';
import { buildBBModel } from '../items/bbmodel.js';
import { MODEL_PX } from '../config.js';
import { glowSprite } from './glow.js';
import { Flame } from './flame.js';
import lanternModel from '../../assets/models/hand_lantern.bbmodel';

// First-person hands: weapon on the right, what's in your off hand (the lantern) on the left. Rendered in its own
// scene after the world (with the depth buffer cleared) so the weapon never clips into walls. Gripped in both hands
// (F), the weapon takes a two-handed pose (see SLASH_2H), and the lantern goes down out of sight, to your belt. With a
// bow in your off hand, your main hand holds an arrow in place of your weapon (see BOW_DOWN).

// The weapon hangs off four nested groups so its edge always leads the cut:
//   pivot (hand position + yaw) -> plane (roll: tilts the plane the cut travels in)
//   -> arc (rotation about the blade's own x axis, i.e. the flat's normal)
//   -> twist (about the weapon's own length: which way its flat faces, without changing where it points) -> mesh.
// Because buildWeaponMesh puts the edge on -z and the tip on +y, decreasing `arc` swings the tip forward
// and down with the edge in front. Rolling the plane makes the cut diagonal without twisting the edge.
// Keep `roll` constant across the cutting keyframes so the cut is a pure arc. `twist` is optional (0).
//
// A swing is slow and deliberate, as in King's Field: every set of keys below winds up until SWING_AT.cut (the last
// stretch of it a held moment), cuts or lunges from there, and lands its blow at SWING_AT.hit, the cut at its fastest;
// then it follows through, carried on past where it struck, and comes back to guard over the rest of the swing (from
// its last key but one). A cut winds up high over your shoulder and follows through far down and across; a thrust
// draws back and lunges with less of either. How long a swing takes is the player's (see SWING_TIME in player.js).
export const SWING_AT = { cut: 0.38, hit: 0.5 };
const SLASH = [
  { t: 0.0, p: [0.36, -0.42, -0.9], yaw: 0.25, roll: 0.2, arc: -0.35 },     // guard: edge toward the enemy
  { t: 0.3, p: [0.54, -0.1, -0.82], yaw: 0.25, roll: -0.6, arc: 0.5 },     // wound up high over the right shoulder
  { t: 0.38, p: [0.56, -0.08, -0.81], yaw: 0.25, roll: -0.6, arc: 0.56 },   // held there a moment
  { t: 0.62, p: [-0.3, -0.45, -0.92], yaw: 0.25, roll: -0.6, arc: -2.6 },   // cut down and across, through to the left
  { t: 0.72, p: [-0.33, -0.48, -0.9], yaw: 0.25, roll: -0.6, arc: -2.68 },  // the follow-through spends itself
  { t: 1.0, p: [0.36, -0.42, -0.9], yaw: 0.25, roll: 0.2, arc: -0.35 },
];
const THRUST = [
  { t: 0.0, p: [0.3, -0.42, -0.88], yaw: 0.12, roll: 0, arc: -1.3 },
  { t: 0.3, p: [0.35, -0.37, -0.6], yaw: 0.12, roll: 0, arc: -1.24 },     // drawn back
  { t: 0.38, p: [0.36, -0.365, -0.58], yaw: 0.12, roll: 0, arc: -1.23 },  // held there a moment
  { t: 0.56, p: [0.1, -0.3, -1.42], yaw: 0.12, roll: 0, arc: -1.54 },     // lunge
  { t: 0.68, p: [0.09, -0.305, -1.44], yaw: 0.12, roll: 0, arc: -1.55 },  // held out
  { t: 1.0, p: [0.3, -0.42, -0.88], yaw: 0.12, roll: 0, arc: -1.3 },
];
// The same, gripped in both hands. Until there are hands to show it, the pose says so. A blade or haft is held from
// the off-hand side, as if the left hand held it and the right guided it: it rises diagonally across the body, its
// flat toward you, and is raised higher and brought down further. A thrusting weapon comes in nearer the middle,
// gripped more surely, and points straight at the crosshair (at a spot 2.5 m ahead, all through the thrust: see
// aimed), its flat turned toward you: a spear braced low from the right hip, and a dagger held out before you in both
// hands, jabbed forward with both arms (see KEYS_2H).
const SLASH_2H = [
  { t: 0.0, p: [-0.14, -0.4, -0.78], yaw: 0.85, roll: -0.82, arc: 0.1 },    // guard: across the body
  { t: 0.3, p: [0.5, -0.04, -0.78], yaw: 0.4, roll: -0.75, arc: 0.85 },    // wound up high and back over the right shoulder
  { t: 0.38, p: [0.52, -0.02, -0.77], yaw: 0.4, roll: -0.75, arc: 0.9 },    // held there a moment
  { t: 0.62, p: [-0.32, -0.48, -0.95], yaw: 0.4, roll: -0.75, arc: -2.75 }, // down and across, through to the left
  { t: 0.72, p: [-0.35, -0.5, -0.93], yaw: 0.4, roll: -0.75, arc: -2.82 },  // the follow-through spends itself
  { t: 1.0, p: [-0.14, -0.4, -0.78], yaw: 0.85, roll: -0.82, arc: 0.1 },
];
/** A key with the weapon at `p` pointing at the spot 2.5 m ahead, under the crosshair: its yaw and arc. */
function aimed(t, p, twist) {
  const d = new THREE.Vector3(-p[0], -p[1], -2.5 - p[2]).normalize(), arc = -Math.acos(d.y);
  return { t, p, yaw: Math.asin(d.x / Math.sin(arc)), roll: 0, arc, twist };
}
const THRUST_2H = [
  aimed(0.0, [0.16, -0.43, -0.7], 1.2),     // guard: braced at the hip
  aimed(0.3, [0.19, -0.41, -0.44], 1.2),    // drawn back
  aimed(0.38, [0.19, -0.405, -0.43], 1.2),  // held there a moment
  aimed(0.56, [0.06, -0.36, -1.36], 1.2),   // driven home
  aimed(0.68, [0.055, -0.358, -1.38], 1.2), // held there
  aimed(1.0, [0.16, -0.43, -0.7], 1.2),
];
const JAB_2H = [
  aimed(0.0, [0.06, -0.28, -0.62], 1.2),    // guard: held out before you
  aimed(0.3, [0.07, -0.29, -0.44], 1.2),    // drawn back
  aimed(0.38, [0.07, -0.288, -0.43], 1.2),  // held there a moment
  aimed(0.56, [0.02, -0.24, -1.06], 1.2),   // jabbed with both arms
  aimed(0.68, [0.02, -0.239, -1.08], 1.2),  // held there
  aimed(1.0, [0.06, -0.28, -0.62], 1.2),
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

// A thrown weapon held up (see thrown.js), by type: turned from its own frame (its point up, +y) to how it's held ready
// to throw, and scaled; `back`, how far it tips back as you draw your arm back (radians). Drawn back, it goes up over
// your shoulder (THROW_BACK, from where it's held up: its `p`, and `r` its roll), and further back as the throw charges
// (THROW_PULL, at full charge). Thrown, your arm snaps forward to THROW_SNAP (by `at` of the way through), letting go of
// it on the way (at `release`), and the next comes up from below into your hand (from `next`), over THROW_NEXT seconds
// in all, after which you can draw back again.
export const THROW_NEXT = 0.45;
const THROW_GRIP = {
  stone: { turn: [0.4, 0.6, 0], scale: 1, back: 0.5 },
  dart: { turn: [-0.95, 0, 0.15], scale: 0.9, back: 0.25 },
  knife: { turn: [-1.2, 0, 0.25], scale: 1, back: 1.2 },
};
const THROW_BACK = { p: [-0.02, 0.2, 0.2], r: -0.2 };
const THROW_PULL = { p: [0.01, 0.02, 0.05], r: 0.15 };
const THROW_SNAP = { p: [-0.14, 0.04, -0.32], r: [-0.7, 0, 0.1], at: 0.25, release: 0.12, next: 0.5 };

// Where your off hand holds the lantern up, by the top of its bail, how big it looks, and how far it's turned to show
// you a corner; it hangs below. And how it swings from there: a
// pendulum (`pull` toward where it would hang still, `damp` the slowing), pulled out as you turn (`turn` radians for
// each radian a second you turn, up to `most`), back as you walk or run (`walk`, `run`), and a little side to side
// with each stride (`stride`).
const LANTERN_AT = [-0.4, -0.03, -0.9], LANTERN_SCALE = 0.86, LANTERN_TURN = 0.55;
const LANTERN_SWING = { pull: 55, damp: 3.2, turn: 0.09, most: 0.5, walk: 0.1, run: 0.24, stride: 0.07 };
// A shield in your off hand (held by the grip on its back, its face away from you): down at your side, its face turned
// out to your left; raised before you (as Player.guard rises: see shield.js), across the middle of your view, its rim
// just under your eyes, your weapon pushed aside (`weapon`: moved by `p`, its point tipped down by `arc`); and shoved
// forward over `dur` seconds in a bash, by `p` and tipped back by `r` at the height of it.
const SHIELD_DOWN = { p: [-0.56, -0.56, -0.78], r: [0.3, Math.PI + 0.5, 0.3] };
const SHIELD_UP = { p: [-0.07, -0.31, -0.56], r: [0.06, Math.PI - 0.06, 0.02], weapon: { p: [0.12, -0.13, 0.04], arc: 0.45 } };
const SHIELD_BASH = { dur: 0.28, p: [0.06, 0.05, -0.22], r: -0.18 };
// A bow in your off hand (see bow.js), held by its grip, its back away from you, at BOW_SCALE: down at your side
// until an arrow's nocked, then up before you, held out in your left hand, canted (BOW_UP), the arrow on its string
// lying along your line of sight, so it points at the crosshair. Drawn, it comes over to the right as your right hand
// brings the string back toward your shoulder (BOW_DRAWN, at full draw), the nock coming back as far as the arrow
// reaches (ARROW_REACH, in the bow's own frame), on the line from the crosshair BOW_AIM metres ahead through the grip,
// so the arrow still points at it; and the limbs bend (BOW_BEND: how much shorter and deeper the bow grows at full
// draw). Loosed, it kicks (BOW_KICK, over `dur` seconds), the string shivers, and the bow eases back. Meanwhile your
// main hand holds an arrow to nock, as a weapon (see ARROW_GRIP), which goes down out of sight as you nock it.
const BOW_SCALE = 0.52;
const BOW_DOWN = { p: [-0.3, -0.31, -0.55], r: [0.2, 0.7, -0.4] };
const BOW_UP = { p: [-0.03, -0.1, -0.45], r: [0, 0, 0.3] };
const BOW_DRAWN = { p: [0.1, -0.1, -0.45], r: [0, 0, 0.05] };
const BOW_AIM = 12, ARROW_REACH = 0.66, BOW_BEND = [0.05, 0.45];
const BOW_KICK = { dur: 0.22, p: [0, 0.02, -0.03], r: 0.12 };
const STRING_THICK = 0.008;
const ARROW_GRIP = 0.1; // how far up the arrow from its nock your hand holds it, to jab

const smooth = (x) => x * x * (3 - 2 * x);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// The arrow in your main hand, as a weapon's def for showInHand: one per kind of arrow (ARROWS), so it's the same def
// from frame to frame.
const ARROW_DEFS = {};
const arrowDef = (type) => (ARROW_DEFS[type] ??= { model: ARROWS[type].model, dmgType: 'stab', arrow: true });

/** An arrow held as a weapon is (see items/models.js): pointing up, held ARROW_GRIP up from its nock. */
function arrowInHand(model) {
  const g = new THREE.Group(), m = heldModel(model);
  m.position.y = -ARROW_GRIP;
  g.add(m);
  return g;
}
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
    this.light = new THREE.PointLight(0xffa050, 2.2, 3, 1.5); // your lantern's, on your weapon (see update)
    this.scene.add(this.light);

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
    this.lanternUp = 0; // eases between the lantern held up (1) and down out of sight at your belt (0)
    // What's shown in your off hand (an item), which changes to what's there once it's gone down out of sight (see update).
    this.offShown = null;
    this.swingT = -1;
    this.swingDur = 0.3;
    this.dipT = -1;

    // The lantern: a Blockbench model held by its origin, at the top of its bail, whose empty "flame" group marks where
    // its flame stands. Its glass is additive, lit from within, and brightens and dims with the flame.
    // (`lantern` swings from your hand, and the lantern turns within it.)
    this.lantern = new THREE.Group();
    const body = new THREE.Group();
    const model = buildBBModel(lanternModel, MODEL_PX);
    this.glass = model.children.find((m) => m.material.blending === THREE.AdditiveBlending)?.material;
    const wick = new THREE.Vector3().fromArray(model.userData.anchors.flame);
    this.flame = new Flame({ width: 0.05, height: 0.09, pixel: 0.006 });
    this.flame.position.copy(wick);
    this.halo = glowSprite(0xffa040, 0.32, 0.45);
    this.halo.position.set(wick.x, wick.y + 0.03, wick.z);
    body.add(model, this.flame, this.halo);
    body.rotation.y = LANTERN_TURN;
    this.lantern.add(body);
    this.lantern.scale.setScalar(LANTERN_SCALE);
    this.scene.add(this.lantern);
    // How it swings (see LANTERN_SWING): `x` back and forth and `z` side to side, in radians, and how fast each is
    // changing. (Not `swing`: that's the weapon's, below.)
    this.pendulum = { x: 0, z: 0, vx: 0, vz: 0 };

    // A shield in your off hand (see setShield): `shieldOut` eases between in your hand (1) and on your back (0), and
    // `bashT` runs through a bash (see bash), or is -1.
    this.shieldPivot = new THREE.Group();
    this.scene.add(this.shieldPivot);
    this.shieldType = null;
    this.shieldModel = null;
    this.shieldOut = 0;
    this.bashT = -1;
    this.lean = 0;
    this.lastYaw = null;

    // A bow in your off hand (see setBow): `bowOut` eases between in your hand (1) and over your shoulder (0); `aim` from
    // down at your side (0) to up before you (1); `nockShown` and `drawShown` follow how far an arrow's nocked and drawn
    // (Player.nock, Player.draw), easing back when you let go (but not once it's loosed: see loose); `kickT` runs through
    // the kick of a shot, or is -1; `twang`, how hard the string shivers.
    this.bowPivot = new THREE.Group();
    this.bowBody = new THREE.Group();
    this.bowBody.rotation.y = Math.PI;
    this.bowBody.scale.setScalar(BOW_SCALE);
    this.bowPivot.add(this.bowBody);
    this.scene.add(this.bowPivot);
    const stringMat = new THREE.MeshLambertMaterial({ color: 0xc8bc9c });
    this.strings = [0, 1].map(() => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), stringMat));
    this.bowBody.add(...this.strings);
    this.bowType = null;
    this.bowModel = null;
    this.nockedArrow = null;
    this.bowOut = 0;
    this.aim = 0;
    this.nockShown = 0;
    this.drawShown = 0;
    this.slide = 0; // how far over to the right the bow has come as it's drawn (see BOW_DRAWN)
    this.kickT = -1;
    this.twang = 0;
    this.handAway = 0; // the arrow in your main hand, going down as it's nocked (1)
    // What's in your main hand: `weaponDef` the weapon you wield, `handDef` what's shown (see showInHand), and
    // `handDown` how far it's gone down for something else to come up (1).
    this.weaponDef = null;
    this.handDef = null;
    this.handDown = 0;

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
    // A thrown weapon held up (see throwPose): `windShown` and `chargeShown` follow how far your arm's drawn back and the
    // throw charged (Player.windup, and the attack meter), easing back when you let go; `hurlT` runs through a throw, or
    // is -1, from where your arm was (`hurlFrom`), and `hurlGone` is whether that was the last of them.
    this.windShown = 0;
    this.chargeShown = 0;
    this.hurlT = -1;
    this.hurlFrom = { wind: 0, charge: 0 };
    this.hurlGone = false;
  }

  /** Acts out using what's held up (see ACTS); `gone`: that was the last of it, which leaves your hand. */
  act(kind, gone = false) {
    this.actKind = kind;
    this.actT = 0;
    this.actGone = gone;
  }

  /** A thrown weapon leaves your hand (see thrown.js): your arm snaps forward, and the next comes up, unless `gone`. */
  hurl(gone) {
    this.hurlT = 0;
    this.hurlFrom = { wind: this.windShown, charge: this.chargeShown };
    this.hurlGone = gone;
    this.windShown = this.chargeShown = 0;
  }

  /** Puts `item` in the hand (or nothing), to be raised: one of a stack of thrown weapons as it's thrown. */
  showHeld(item, color) {
    if (this.heldModel) this.heldPivot.remove(this.heldModel);
    this.heldItem = item;
    this.heldModel = null;
    this.actT = this.hurlT = -1;
    if (!item) return;
    const thrown = item.kind === 'thrown';
    const model = thrown ? heldModel(THROWN[item.type].model) : buildItemModel(item, color);
    const turn = new THREE.Group();
    const how = (thrown ? THROW_GRIP[item.type] : HELD_KINDS[item.kind]) ?? { turn: [0, 0, 0], scale: 1 };
    turn.rotation.set(...how.turn);
    turn.scale.setScalar(how.scale);
    turn.add(model);
    this.heldModel = turn;
    this.heldPivot.add(turn);
  }

  /**
   * Holds the weapon with this def (items/defs.js WEAPONS), or nothing: in your hand, unless you've a bow in hand, when
   * an arrow is there instead (see update).
   */
  setWeapon(def) {
    this.weaponDef = def;
  }

  /** Puts this weapon in your main hand (or an arrow, `arrow`: see arrowInHand), or nothing. Stabbing weapons thrust. */
  showInHand(def) {
    this.handDef = def;
    if (this.weapon) this.weaponTwist.remove(this.weapon);
    this.weapon = !def ? null : def.arrow ? arrowInHand(def.model) : buildWeaponMesh(def.model);
    const stab = def?.dmgType === 'stab';
    this.keys = stab ? THRUST : SLASH;
    this.keys2 = KEYS_2H[def?.model] ?? (stab ? THRUST_2H : SLASH_2H);
    if (this.weapon) this.weaponTwist.add(this.weapon);
  }

  /**
   * Shows the bow of `type` (BOWS) in your off hand, or none: its own string hidden for one drawn here (see update), and
   * an arrow to nock on it, of the kind in your quiver (`arrow`, an ARROWS type, or null).
   */
  setBow(type, arrow) {
    if (type !== this.bowType) {
      this.bowType = type;
      if (this.bowModel) this.bowBody.remove(this.bowModel);
      this.bowModel = type ? heldModel(BOWS[type].model) : null;
      if (this.bowModel) {
        for (const m of this.bowModel.children) if (m.name.endsWith('_string')) m.visible = false;
        this.bowBody.add(this.bowModel);
      }
    }
    if ((arrow ?? null) !== (this.nockedArrow?.userData.type ?? null)) {
      if (this.nockedArrow) this.bowBody.remove(this.nockedArrow);
      this.nockedArrow = null;
      if (arrow) {
        // (Turned to point the way the bow does, +z, nock first.)
        this.nockedArrow = new THREE.Group();
        const m = heldModel(ARROWS[arrow].model);
        m.rotation.x = Math.PI / 2;
        this.nockedArrow.add(m);
        this.nockedArrow.userData.type = arrow;
        this.bowBody.add(this.nockedArrow);
      }
    }
  }

  /**
   * Your bow looses its arrow (see bow.js): it's gone from the string, which snaps forward, and the bow kicks. The next
   * arrow is nocked from scratch, coming up onto the string as the last one did.
   */
  loose() {
    this.nockShown = 0;
    this.drawShown = 0;
    this.kickT = 0;
    this.twang = 1;
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

  /** Shows the shield of `type` (SHIELDS) in your off hand, or none. */
  setShield(type) {
    if (type === this.shieldType) return;
    this.shieldType = type;
    if (this.shieldModel) this.shieldPivot.remove(this.shieldModel);
    this.shieldModel = type ? heldModel(SHIELDS[type].model) : null;
    if (this.shieldModel) this.shieldPivot.add(this.shieldModel);
  }

  /** A shove with your shield (see shieldBash). */
  bash() {
    this.bashT = 0;
  }

  /**
   * `offhand`: what's in your off hand (an item), or null; `guard`: how far a shield there is raised (Player.guard);
   * `twoHanded`: your weapon gripped in both hands, with it stowed; `carriedLight`: how brightly your lantern lights
   * you (Player.carriedLight); `windup`: how far your arm's drawn back to throw what's held up (Player.windup).
   */
  update(dt, {
    moving, bob, charge, time, lightLevel, carriedLight = 1, offhand = null, guard = 0, twoHanded = false, yaw = 0, sprint = false,
    held = null, windup = 0, nock = 0, draw = 0, quiver = null,
  }) {
    // What's held up from the hotbar: a new one waits for the last to go down (or, from the weapon, goes straight in).
    const want = held?.item ?? null;
    if (want !== this.heldItem && this.swap <= 0.5) this.showHeld(want, held?.color);
    const to = want !== this.heldItem ? 0.5 : want ? 1 : 0;
    const step = dt / HOLD_RAISE;
    this.swap = to > this.swap ? Math.min(to, this.swap + step) : Math.max(to, this.swap - step);
    const lowered = smooth(Math.min(1, this.swap * 2)), raised = smooth(Math.max(0, this.swap * 2 - 1));

    // Changing grip eases the weapon between its poses, and what's in your off hand up or down. Changing what's in your
    // off hand (from the hotbar, say) lowers the old out of sight before the new comes up.
    const ease = Math.min(1, dt * 9);
    this.grip += ((twoHanded ? 1 : 0) - this.grip) * ease;
    if (offhand !== this.offShown && Math.max(this.lanternUp, this.shieldOut, this.bowOut) < 0.06) this.offShown = offhand;
    const shown = offhand === this.offShown && !twoHanded ? offhand : null;
    this.lanternUp += ((shown?.kind === 'offhand' && shown.type === 'lantern' ? 1 : 0) - this.lanternUp) * ease;
    this.setShield(this.offShown?.kind === 'shield' ? this.offShown.type : null);
    this.shieldOut += ((shown?.kind === 'shield' ? 1 : 0) - this.shieldOut) * ease;
    this.setBow(this.offShown?.kind === 'bow' ? this.offShown.type : null, quiver);
    this.bowOut += ((shown?.kind === 'bow' ? 1 : 0) - this.bowOut) * ease;
    // A bow in hand: an arrow from your quiver in your main hand in place of your weapon, which goes down as it's nocked.
    // Changing what's in your main hand (a weapon from the hotbar, or an arrow for your bow) lowers the old out of sight
    // and raises the new, half of HOLD_RAISE each, as holding something up from the hotbar does.
    const archery = offhand?.kind === 'bow' && !twoHanded;
    const inHand = archery ? (quiver ? arrowDef(quiver) : null) : this.weaponDef;
    if (inHand !== this.handDef) {
      this.handDown = this.weapon ? Math.min(1, this.handDown + step * 2) : 1;
      if (this.handDown >= 1) this.showInHand(inHand);
    } else this.handDown = Math.max(0, this.handDown - step * 2);
    this.handAway += ((archery && (nock > 0 || draw > 0) ? 1 : 0) - this.handAway) * Math.min(1, dt * 14);
    const at = (t) => blend(sample(this.keys, t), sample(this.keys2, t), this.grip);
    let pose = at(0), sag = 1;
    if (this.swingT >= 0) {
      this.swingT += dt / this.swingDur;
      if (this.swingT >= 1) this.swingT = -1;
      else {
        pose = at(this.swingT);
        // (Coming back to guard, it sags into where the meter has it, so it doesn't jump there once the swing's done.)
        const back = this.keys.at(-2).t;
        sag = smooth(Math.max(0, (this.swingT - back) / (1 - back)));
      }
    }
    // Weapon sags while the attack meter refills, King's Field style.
    pose.p[1] -= (1 - charge) * 0.14 * sag;
    pose.arc += (1 - charge) * 0.3 * sag;
    if (this.dipT >= 0) {
      this.dipT += dt / 0.35;
      if (this.dipT >= 1) this.dipT = -1;
      else pose.p[1] -= Math.sin(Math.PI * this.dipT) * 0.25;
    }
    // Behind a raised shield, your weapon is pushed aside and down, out of use (see SHIELD_UP).
    const guarded = smooth(guard), aside = SHIELD_UP.weapon;
    pose.p = pose.p.map((v, j) => v + aside.p[j] * guarded);
    pose.arc += aside.arc * guarded;
    // Running: the weapon drops a little and swings more with each stride.
    const sway = sprint ? 2.2 : 1;
    if (sprint && this.swingT < 0) pose.p[1] -= 0.06;
    const bx = moving ? Math.sin(bob) * 0.012 * sway : 0;
    const by = moving ? Math.abs(Math.cos(bob)) * 0.014 * sway : Math.sin(time * 1.5) * 0.003;
    const away = Math.max(lowered, smooth(this.handAway), smooth(this.handDown));
    pose.p[1] -= away * 0.75;
    pose.arc += away * 0.7;
    this.weaponPivot.visible = !!this.weapon && away < 0.99;
    this.weaponPivot.position.set(pose.p[0] + bx, pose.p[1] + by, pose.p[2]);
    this.weaponPivot.rotation.set(0, pose.yaw, 0);
    this.weaponPlane.rotation.set(0, 0, pose.roll);
    this.weaponArc.rotation.set(pose.arc, 0, 0);
    this.weaponTwist.rotation.set(0, pose.twist, 0);
    this.updateHeld(dt, raised, bx, by, { windup, charge, time });
    const down = 1 - this.lanternUp;
    this.lantern.position.set(LANTERN_AT[0] - bx, LANTERN_AT[1] + by - down * 0.75, LANTERN_AT[2]);
    this.lantern.visible = this.lanternUp > 0.01;

    // The lantern swings from your hand (see LANTERN_SWING), and settles slowly. (A long frame is taken in steps, so a stall
    // can't fling it about.)
    const turn = this.lastYaw === null || dt <= 0 ? 0 : Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) / dt;
    this.lastYaw = yaw;
    const s = this.pendulum, S = LANTERN_SWING;
    const toZ = THREE.MathUtils.clamp(turn * S.turn, -S.most, S.most) + (moving ? Math.sin(bob) * S.stride * sway : 0);
    const toX = moving ? (sprint ? S.run : S.walk) : 0;
    for (let left = Math.min(dt, 0.1); left > 0; left -= 0.02) {
      const h = Math.min(left, 0.02);
      s.vz += (-(s.z - toZ) * S.pull - s.vz * S.damp) * h;
      s.vx += (-(s.x - toX) * S.pull - s.vx * S.damp) * h;
      s.z += s.vz * h;
      s.x += s.vx * h;
    }
    this.lantern.rotation.set(-s.x, 0, s.z);
    // Behind glass, its flame burns steadier than a torch's, upright however the lantern hangs (see Flame), leaning a
    // little as it swings.
    const flick = 0.9 + Math.sin(time * 17) * 0.04 + Math.sin(time * 5.3) * 0.05;
    this.lean += (THREE.MathUtils.clamp(-s.vz * 0.15, -0.3, 0.3) - this.lean) * Math.min(1, dt * 10);
    this.flame.update(time, flick, this.lean);
    if (this.glass) this.glass.color.setScalar(0.62 + (flick - 0.9) * 1.6);
    this.halo.material.opacity = 0.4 + (flick - 0.9) * 1.5;
    // A shield: at your side, or raised before you as `guard` rises, shoved forward in a bash, and slung on your back
    // (down out of sight) while you grip your weapon in both hands.
    if (this.shieldModel) {
      const g = smooth(guard);
      let kick = 0;
      if (this.bashT >= 0) {
        this.bashT += dt / SHIELD_BASH.dur;
        if (this.bashT >= 1) this.bashT = -1;
        else kick = Math.sin(Math.PI * this.bashT);
      }
      const pos = (j) => lerp(SHIELD_DOWN.p[j], SHIELD_UP.p[j], g) + SHIELD_BASH.p[j] * kick;
      const tilt = (j) => lerp(SHIELD_DOWN.r[j], SHIELD_UP.r[j], g);
      this.shieldPivot.position.set(pos(0) - bx, pos(1) + by - (1 - this.shieldOut) * 0.8, pos(2));
      this.shieldPivot.rotation.set(tilt(0) + SHIELD_BASH.r * kick, tilt(1), tilt(2));
      this.shieldPivot.visible = this.shieldOut > 0.01;
    }

    if (this.bowModel) this.updateBow(dt, time, { nock, draw, bx, by });
    else this.bowPivot.visible = false;

    // It lights your weapon from where its flame is: up beside it, or low at your belt.
    this.flame.getWorldPosition(this.light.position);
    this.light.intensity = 2.2 * flick * lightLevel * carriedLight;
    this.ambient.intensity = 0.25 + lightLevel * 0.45;
  }

  /**
   * Poses the bow: down at your side or up before you as an arrow's nocked, slung away while you grip your weapon in
   * both hands, its string drawn back to the nocked arrow, and its limbs bent as it is (see BOW_UP).
   */
  updateBow(dt, time, { nock, draw, bx, by }) {
    // What's shown follows the arrow up, and eases back when you let go (or, loosed, the string snaps forward).
    this.nockShown = nock >= this.nockShown ? nock : Math.max(nock, this.nockShown - dt / 0.2);
    this.drawShown = draw >= this.drawShown ? draw : Math.max(draw, this.drawShown - dt / 0.12);
    this.aim += ((nock > 0 || draw > 0 ? 1 : 0) - this.aim) * Math.min(1, dt * (nock > 0 ? 12 : 7));
    this.slide = this.drawShown >= this.slide ? this.drawShown : this.slide + (this.drawShown - this.slide) * Math.min(1, dt * 5);
    let kick = 0;
    if (this.kickT >= 0) {
      this.kickT += dt / BOW_KICK.dur;
      if (this.kickT >= 1) this.kickT = -1;
      else kick = Math.sin(Math.PI * this.kickT);
    }
    this.twang = Math.max(0, this.twang - dt * 5);
    const a = smooth(this.aim), d = this.drawShown;
    // A full draw, held, trembles a little.
    const shake = d >= 1 ? Math.sin(time * 23) * 0.002 + Math.sin(time * 37) * 0.0015 : 0;
    const s = smooth(this.slide), up = (key, j) => lerp(BOW_UP[key][j], BOW_DRAWN[key][j], s);
    const at = (j) => lerp(BOW_DOWN.p[j], up('p', j), a) + BOW_KICK.p[j] * kick;
    const turn = (j) => lerp(BOW_DOWN.r[j], up('r', j), a);
    this.bowPivot.position.set(at(0) - bx * (1 - a) + shake, at(1) + by * (1 - a * 0.7) - (1 - this.bowOut) * 0.9, at(2));
    this.bowPivot.rotation.set(turn(0) - BOW_KICK.r * kick, turn(1), turn(2));
    this.bowPivot.visible = this.bowOut > 0.01;
    // Its limbs bend as it's drawn, and the string goes from tip to tip by the nock.
    const sy = 1 - BOW_BEND[0] * d, sz = 1 + BOW_BEND[1] * d;
    this.bowModel.scale.set(1, sy, sz);
    const { string_top: top, string_bottom: bottom, rest } = this.bowModel.userData.anchors;
    const t = new THREE.Vector3(top[0], top[1] * sy, top[2] * sz), b = new THREE.Vector3(bottom[0], bottom[1] * sy, bottom[2] * sz);
    const nocked = this.nockedArrow && this.nockShown >= 0.5;
    const shiver = Math.sin(time * 90) * 0.012 * this.twang;
    const across = new THREE.Vector3(rest[0], rest[1], 0); // where the arrow lies across the grip
    let n = new THREE.Vector3(0, rest[1], t.z + shiver);
    if (nocked) {
      // Drawn, the nock comes back as far as the arrow reaches, on the line from the crosshair (BOW_AIM ahead) through
      // the grip, so the arrow points at it.
      this.bowPivot.updateMatrixWorld(true);
      const full = across.clone().sub(this.bowBody.worldToLocal(new THREE.Vector3(0, 0, -BOW_AIM)));
      full.setLength(ARROW_REACH).add(across);
      n = new THREE.Vector3(rest[0], rest[1], t.z).lerp(full, d);
    }
    this.placeString(this.strings[0], t, n);
    this.placeString(this.strings[1], n, b);
    if (this.nockedArrow) {
      // Nocked, it slides up onto the string from below, and lies from the nock across the grip.
      const k = smooth(Math.min(1, Math.max(0, (this.nockShown - 0.5) * 2)));
      this.nockedArrow.visible = nocked;
      this.nockedArrow.position.set(n.x, n.y - (1 - k) * 0.12, n.z - (1 - k) * 0.06);
      this.nockedArrow.quaternion.setFromUnitVectors(Z_AXIS, across.sub(this.nockedArrow.position).normalize());
    }
  }

  /** Stretches a piece of the string from `a` to `b` (in the bow's frame). */
  placeString(seg, a, b) {
    const dir = b.clone().sub(a), len = dir.length();
    seg.position.copy(a).addScaledVector(dir, 0.5);
    seg.quaternion.setFromUnitVectors(Z_AXIS, dir.divideScalar(len || 1));
    seg.scale.set(STRING_THICK, STRING_THICK, len);
  }

  /**
   * Poses what's held up: `raised` how far (0..1), and what using it looks like, if it's being used: a thrown weapon
   * drawn back and thrown (see throwPose).
   */
  updateHeld(dt, raised, bx, by, { windup, charge, time }) {
    const h = this.heldPivot;
    h.visible = !!this.heldModel && raised > 0.01;
    let p = [0, 0, 0], r = [0, 0, 0];
    if (this.heldItem?.kind === 'thrown') ({ p, r } = this.throwPose(dt, windup, charge, time));
    else if (this.actT >= 0) {
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

  /**
   * A thrown weapon in your hand (see THROW_GRIP): drawn back over your shoulder as your arm goes back (`windup`), and
   * further as the throw charges (`charge`), trembling at full charge; thrown (see hurl), your arm snaps forward and lets
   * go of it, and the next comes up from below, unless that was the last. Returns its pose, from where it's held up.
   */
  throwPose(dt, windup, charge, time) {
    const tip = THROW_GRIP[this.heldItem.type].back;
    this.windShown = windup >= this.windShown ? windup : Math.max(windup, this.windShown - dt / 0.18);
    this.chargeShown = windup > 0 ? charge : Math.max(0, this.chargeShown - dt / 0.18);
    const drawn = (wind, pull) => {
      const k = smooth(wind);
      return { p: THROW_BACK.p.map((v, j) => v * k + THROW_PULL.p[j] * pull), r: [tip * k + THROW_PULL.r * pull, 0, THROW_BACK.r * k] };
    };
    this.heldModel.visible = true;
    if (this.hurlT < 0) {
      const pose = drawn(this.windShown, this.chargeShown);
      if (this.chargeShown >= 1) {
        pose.p[0] += Math.sin(time * 23) * 0.002;
        pose.p[1] += Math.sin(time * 37) * 0.0015;
      }
      return pose;
    }
    const t = (this.hurlT = Math.min(1, this.hurlT + dt / THROW_NEXT)), S = THROW_SNAP;
    let pose;
    if (t < S.at) {
      // Your arm snaps forward from where it was drawn back to, letting go of it on the way.
      const from = drawn(this.hurlFrom.wind, this.hurlFrom.charge), k = smooth(t / S.at);
      pose = { p: from.p.map((v, j) => lerp(v, S.p[j], k)), r: from.r.map((v, j) => lerp(v, S.r[j], k)) };
    } else {
      // The next comes up from below into your hand.
      const k = smooth(Math.max(0, (t - S.next) / (1 - S.next)));
      pose = { p: [0, -0.4 * (1 - k), 0], r: [-0.6 * (1 - k), 0, 0] };
    }
    this.heldModel.visible = t < S.release || (!this.hurlGone && t >= S.next);
    if (t >= 1) this.hurlT = -1;
    return pose;
  }
}
