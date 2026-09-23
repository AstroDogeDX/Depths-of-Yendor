import * as THREE from 'three';
import { buildWeaponMesh } from '../items/models.js';
import { buildBBModel } from '../items/bbmodel.js';
import { MODEL_PX } from '../config.js';
import { glowSprite } from './glow.js';
import { Flame } from './flame.js';
import torchModel from '../../assets/models/torch.bbmodel?raw';

// First-person hands: weapon on the right, torch on the left. Rendered in its own scene after the
// world (with the depth buffer cleared) so the weapon never clips into walls.

// The weapon hangs off three nested groups so its edge always leads the cut:
//   pivot (hand position + yaw) -> plane (roll: tilts the plane the cut travels in)
//   -> arc (rotation about the blade's own x axis, i.e. the flat's normal) -> weapon mesh.
// Because buildWeaponMesh puts the edge on -z and the tip on +y, decreasing `arc` swings the tip forward
// and down with the edge in front. Rolling the plane makes the cut diagonal without twisting the edge.
// Keep `roll` constant across the cutting keyframes so the cut is a pure arc.
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

const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, k) => a + (b - a) * k;

function sample(keys, t) {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b.t) {
      const k = smooth((t - a.t) / (b.t - a.t));
      return {
        p: a.p.map((v, j) => lerp(v, b.p[j], k)),
        yaw: lerp(a.yaw, b.yaw, k), roll: lerp(a.roll, b.roll, k), arc: lerp(a.arc, b.arc, k),
      };
    }
  }
  const last = keys[keys.length - 1];
  return { ...last, p: [...last.p] };
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
    this.weaponPivot.add(this.weaponPlane);
    this.weaponPlane.add(this.weaponArc);
    this.scene.add(this.weaponPivot);
    this.weapon = null;
    this.keys = SLASH;
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
  }

  setWeapon(model) {
    if (this.weapon) this.weaponArc.remove(this.weapon);
    this.weapon = model ? buildWeaponMesh(model) : null;
    this.keys = model === 'spear' || model === 'dagger' ? THRUST : SLASH;
    if (this.weapon) this.weaponArc.add(this.weapon);
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

  update(dt, { moving, bob, charge, time, lightLevel, yaw = 0, sprint = false }) {
    let pose = sample(this.keys, 0);
    if (this.swingT >= 0) {
      this.swingT += dt / this.swingDur;
      if (this.swingT >= 1) this.swingT = -1;
      else pose = sample(this.keys, this.swingT);
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
    this.weaponPivot.position.set(pose.p[0] + bx, pose.p[1] + by, pose.p[2]);
    this.weaponPivot.rotation.set(0, pose.yaw, 0);
    this.weaponPlane.rotation.set(0, 0, pose.roll);
    this.weaponArc.rotation.set(pose.arc, 0, 0);
    this.torch.position.set(-0.5 - bx, -0.52 + by, -0.95);

    const flick = 0.85 + Math.sin(time * 23) * 0.06 + Math.sin(time * 7.3) * 0.08;
    // The flame trails behind when you turn and sways with your stride.
    const turn = this.lastYaw === null || dt <= 0 ? 0 : Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) / dt;
    this.lastYaw = yaw;
    const leanTo = THREE.MathUtils.clamp(turn * 0.18, -0.4, 0.4) + (moving ? Math.sin(bob) * 0.06 * sway : 0);
    this.lean += (leanTo - this.lean) * Math.min(1, dt * 10);
    this.flame.update(time, flick, this.lean);
    if (this.embers) this.embers.color.setScalar(0.8 + (flick - 0.85) * 1.6);
    this.halo.material.opacity = 0.45 + (flick - 0.85) * 1.5;
    this.torchLight.intensity = 2.2 * flick * lightLevel;
    this.ambient.intensity = 0.25 + lightLevel * 0.45;
  }
}
