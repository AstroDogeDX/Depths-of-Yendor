import * as THREE from 'three';

// Ripples on the pools (see dungeon/pools.js): rings spreading across the water from anything wading through it, a
// ring every few steps while it moves and a wider one as it steps in (see Level.stir). Rings are reused, and there
// are never more than MAX of them.

const LIFE = 1.1; // seconds a ring spreads for
const MAX = 32;
const GEO = new THREE.RingGeometry(0.86, 1, 20).rotateX(-Math.PI / 2);

export class Ripples {
  /** `color`: the water's film (a CSS hex string), which the rings are a paler shade of. */
  constructor(group, color) {
    this.group = group;
    this.color = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35);
    this.rings = [];
  }

  /** A ring spreading out from (x, y, z) to `radius` metres, as bright as `strength` (0..1) at first. */
  spawn(x, y, z, radius, strength = 0.5) {
    let r = this.rings.find((q) => !q.alive);
    if (!r) {
      if (this.rings.length >= MAX) return;
      r = { mesh: new THREE.Mesh(GEO, new THREE.MeshBasicMaterial({ color: this.color, transparent: true, depthWrite: false })) };
      this.group.add(r.mesh);
      this.rings.push(r);
    }
    r.alive = true;
    r.t = 0;
    r.radius = radius;
    r.strength = strength;
    r.mesh.position.set(x, y + 0.01, z);
    r.mesh.visible = true;
  }

  update(dt) {
    for (const r of this.rings) {
      if (!r.alive) continue;
      const k = (r.t += dt) / LIFE;
      if (k >= 1) {
        r.alive = false;
        r.mesh.visible = false;
        continue;
      }
      const size = r.radius * (0.25 + 0.75 * Math.sqrt(k));
      r.mesh.scale.set(size, 1, size);
      r.mesh.material.opacity = r.strength * (1 - k);
    }
  }
}
