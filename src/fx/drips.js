import * as THREE from 'three';

// Water dripping in the sewers: from the mouths of drain pipes into their slime, and from the vault into
// puddles and channels. A drop falls, stretching as it goes, then lands with a ring spreading across the
// surface and a plip you can hear close by. Only sources near the viewer drip, so a floor full of them is cheap.

const GRAVITY = 9.8;
const RANGE = 14; // metres from the viewer that sources drip
const HEAR = 9; // metres within which a landing is heard
const RING_LIFE = 0.45;
const DROP_GEO = new THREE.BoxGeometry(0.018, 0.05, 0.018);
const RING_GEO = new THREE.RingGeometry(0.75, 1, 12).rotateX(-Math.PI / 2);

export class Drips {
  /**
   * `sources`: [{ x, y, z, floor, every }]: where drops fall from, the height they land at, and the [min, max]
   * seconds between drops.
   */
  constructor(group, sources) {
    this.group = group;
    this.sources = sources.map((s) => ({ ...s, wait: Math.random() * s.every[1] }));
    this.dropMat = new THREE.MeshBasicMaterial({ color: 0xa6b49c, transparent: true, opacity: 0.75 });
    this.drops = [];
    this.rings = [];
  }

  /** `viewer`: a position ({ x, z }) drops are near enough to fall; `audio` plays their landing, if given. */
  update(dt, viewer, audio = null) {
    for (const s of this.sources) {
      if ((s.wait -= dt) > 0) continue;
      s.wait = s.every[0] + Math.random() * (s.every[1] - s.every[0]);
      if (Math.hypot(s.x - viewer.x, s.z - viewer.z) < RANGE) this.drop(s);
    }
    for (const d of this.drops) {
      if (!d.alive) continue;
      d.vy -= GRAVITY * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.scale.y = 1 + Math.min(2, -d.vy * 0.3);
      if (d.mesh.position.y > d.floor) continue;
      d.alive = false;
      d.mesh.visible = false;
      this.splash(d.mesh.position.x, d.floor, d.mesh.position.z);
      const far = Math.hypot(d.mesh.position.x - viewer.x, d.mesh.position.z - viewer.z);
      if (audio && far < HEAR) audio.drip(1 - far / HEAR);
    }
    for (const r of this.rings) {
      if (!r.alive) continue;
      const k = (r.t += dt) / RING_LIFE;
      if (k >= 1) {
        r.alive = false;
        r.mesh.visible = false;
        continue;
      }
      const size = 0.03 + k * 0.2;
      r.mesh.scale.set(size, 1, size);
      r.mesh.material.opacity = 0.55 * (1 - k);
    }
  }

  drop(s) {
    let d = this.drops.find((q) => !q.alive);
    if (!d) {
      if (this.drops.length >= 40) return;
      d = { mesh: new THREE.Mesh(DROP_GEO, this.dropMat) };
      this.group.add(d.mesh);
      this.drops.push(d);
    }
    d.alive = true;
    d.vy = 0;
    d.floor = s.floor;
    d.mesh.position.set(s.x, s.y, s.z);
    d.mesh.scale.y = 1;
    d.mesh.visible = true;
  }

  splash(x, y, z) {
    let r = this.rings.find((q) => !q.alive);
    if (!r) {
      if (this.rings.length >= 20) return;
      const mat = new THREE.MeshBasicMaterial({ color: 0xb8c8b0, transparent: true, depthWrite: false });
      r = { mesh: new THREE.Mesh(RING_GEO, mat) };
      this.group.add(r.mesh);
      this.rings.push(r);
    }
    r.alive = true;
    r.t = 0;
    r.mesh.position.set(x, y + 0.012, z);
    r.mesh.visible = true;
  }
}
