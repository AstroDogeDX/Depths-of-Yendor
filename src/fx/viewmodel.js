import * as THREE from 'three';
import { buildWeaponMesh } from '../items/models.js';
import { glowSprite } from './glow.js';

// First-person hands: weapon on the right, torch on the left. Rendered in its own scene after the
// world (with the depth buffer cleared) so the weapon never clips into walls.

const REST = { p: [0.36, -0.42, -0.9], r: [-0.55, 0.12, 0.28] };
const SLASH = [
  { t: 0.0, p: [0.36, -0.42, -0.9], r: [-0.55, 0.12, 0.28] },
  { t: 0.22, p: [0.5, -0.26, -0.82], r: [0.2, 0.2, -0.7] },
  { t: 0.5, p: [-0.2, -0.52, -0.98], r: [-1.4, -0.3, 1.2] },
  { t: 1.0, p: [0.36, -0.42, -0.9], r: [-0.55, 0.12, 0.28] },
];
const THRUST = [
  { t: 0.0, p: [0.3, -0.42, -0.88], r: [-1.25, 0, 0.1] },
  { t: 0.25, p: [0.32, -0.38, -0.68], r: [-1.35, 0, 0.1] },
  { t: 0.5, p: [0.12, -0.3, -1.35], r: [-1.5, 0, 0] },
  { t: 1.0, p: [0.3, -0.42, -0.88], r: [-1.25, 0, 0.1] },
];

const smooth = (x) => x * x * (3 - 2 * x);

function sample(keys, t) {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b.t) {
      const k = smooth((t - a.t) / (b.t - a.t));
      return {
        p: a.p.map((v, j) => v + (b.p[j] - v) * k),
        r: a.r.map((v, j) => v + (b.r[j] - v) * k),
      };
    }
  }
  return keys[keys.length - 1];
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
    if (this.weapon) this.weaponPivot.remove(this.weapon);
    this.weapon = model ? buildWeaponMesh(model) : null;
    this.keys = model === 'spear' || model === 'dagger' ? THRUST : SLASH;
    if (this.weapon) {
      if (model === 'spear') this.weapon.position.y = -0.5;
      this.weaponPivot.add(this.weapon);
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

  update(dt, { moving, bob, charge, time, lightLevel }) {
    let pose = { p: [...REST.p], r: [...REST.r] };
    if (this.keys === THRUST) pose = { p: [...THRUST[0].p], r: [...THRUST[0].r] };
    if (this.swingT >= 0) {
      this.swingT += dt / this.swingDur;
      if (this.swingT >= 1) this.swingT = -1;
      else pose = sample(this.keys, this.swingT);
    } else {
      // Weapon sags while the attack meter refills, King's Field style.
      pose.p[1] -= (1 - charge) * 0.14;
      pose.r[0] += (1 - charge) * 0.3;
    }
    if (this.dipT >= 0) {
      this.dipT += dt / 0.35;
      if (this.dipT >= 1) this.dipT = -1;
      else pose.p[1] -= Math.sin(Math.PI * this.dipT) * 0.25;
    }
    const bx = moving ? Math.sin(bob) * 0.012 : 0;
    const by = moving ? Math.abs(Math.cos(bob)) * 0.014 : Math.sin(time * 1.5) * 0.003;
    this.weaponPivot.position.set(pose.p[0] + bx, pose.p[1] + by, pose.p[2]);
    this.weaponPivot.rotation.set(pose.r[0], pose.r[1], pose.r[2]);
    this.torch.position.set(-0.5 - bx, -0.52 + by, -0.95);

    const flick = 0.85 + Math.sin(time * 23) * 0.06 + Math.sin(time * 7.3) * 0.08;
    this.flame.scale.set(1, flick, 1);
    this.halo.material.opacity = 0.45 + (flick - 0.85) * 1.5;
    this.torchLight.intensity = 2.2 * flick * lightLevel;
    this.ambient.intensity = 0.25 + lightLevel * 0.45;
  }
}
