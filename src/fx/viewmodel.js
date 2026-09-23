import * as THREE from 'three';
import { buildWeaponMesh } from '../items/models.js';
import { glowSprite } from './glow.js';

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

    // Torch
    this.torch = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.4, 5), new THREE.MeshLambertMaterial({ color: 0x4a3020 }));
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 5), new THREE.MeshLambertMaterial({ color: 0x2a1a10 }));
    wrap.position.y = 0.2;
    const additive = (color, opacity) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.15, 5), additive(0xff8a20, 0.85));
    this.flame.position.y = 0.3;
    this.flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 4), additive(0xfff0a0, 0.9));
    this.flameCore.position.y = 0.27;
    this.halo = glowSprite(0xff9030, 0.42, 0.55);
    this.halo.position.y = 0.3;
    this.torch.add(stick, wrap, this.flame, this.flameCore, this.halo);
    this.torch.position.set(-0.5, -0.52, -0.95);
    this.torch.rotation.set(-0.25, 0, 0.2);
    this.scene.add(this.torch);
  }

  setWeapon(model) {
    if (this.weapon) this.weaponArc.remove(this.weapon);
    this.weapon = model ? buildWeaponMesh(model) : null;
    this.keys = model === 'spear' || model === 'dagger' ? THRUST : SLASH;
    if (this.weapon) {
      if (model === 'spear') this.weapon.position.y = -0.5; // hold the long shaft nearer its middle
      this.weaponArc.add(this.weapon);
    }
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

  update(dt, { moving, bob, charge, time, lightLevel, sprint = false }) {
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
    this.flame.scale.set(1, flick, 1);
    this.halo.material.opacity = 0.45 + (flick - 0.85) * 1.5;
    this.torchLight.intensity = 2.2 * flick * lightLevel;
    this.ambient.intensity = 0.25 + lightLevel * 0.45;
  }
}
