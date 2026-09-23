import * as THREE from 'three';
import { rand } from '../rng.js';

const CUBE = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const mats = new Map();
const matFor = (color) => {
  if (!mats.has(color)) mats.set(color, new THREE.MeshBasicMaterial({ color }));
  return mats.get(color);
};
const MAX = 220;

/** Debris / blood / sparks flying out from a point. */
export function burst(level, x, y, z, color, count = 8, speed = 2.5, life = 0.6) {
  for (let i = 0; i < count && level.particles.length < MAX; i++) {
    const mesh = new THREE.Mesh(CUBE, matFor(color));
    mesh.position.set(x, y, z);
    const a = rand.range(0, Math.PI * 2), up = rand.range(0.2, 1);
    const s = speed * rand.range(0.4, 1);
    level.group.add(mesh);
    level.particles.push({
      kind: 'debris', mesh, life: life * rand.range(0.6, 1.2),
      vx: Math.cos(a) * s * (1 - up * 0.5), vy: up * s, vz: Math.sin(a) * s * (1 - up * 0.5),
    });
  }
}

/** Flat expanding shockwave ring on the floor. */
export function ring(level, x, z, color, radius = 4, life = 0.5) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.1, z);
  level.group.add(mesh);
  level.particles.push({ kind: 'ring', mesh, life, max: life, radius });
}

/** A mesh that simply lives for a moment, fading out (lightning, flashes). */
export function transient(level, mesh, life = 0.2) {
  level.group.add(mesh);
  level.particles.push({ kind: 'fade', mesh, life, max: life });
}

export function lightningMesh(x0, y0, z0, x1, y1, z1, color = 0xc0e0ff) {
  const pts = [];
  const n = Math.max(4, Math.round(Math.hypot(x1 - x0, z1 - z0) * 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const j = i === 0 || i === n ? 0 : 0.18;
    pts.push(new THREE.Vector3(
      x0 + (x1 - x0) * t + rand.range(-j, j),
      y0 + (y1 - y0) * t + rand.range(-j, j),
      z0 + (z1 - z0) * t + rand.range(-j, j)));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, fog: false }));
}

export function updateParticles(dt, level) {
  const ps = level.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    if (p.kind === 'debris') {
      p.vy -= 9 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.03) {
        p.mesh.position.y = 0.03;
        p.vx *= 0.5; p.vz *= 0.5; p.vy = 0;
      }
      p.mesh.scale.setScalar(Math.max(0.1, Math.min(1, p.life * 3)));
    } else if (p.kind === 'ring') {
      const k = 1 - p.life / p.max;
      p.mesh.scale.setScalar(0.3 + k * p.radius);
      p.mesh.material.opacity = 0.8 * (1 - k);
    } else if (p.kind === 'fade') {
      p.mesh.material.opacity = Math.max(0, p.life / p.max);
    }
    if (p.life <= 0) {
      level.group.remove(p.mesh);
      if (p.kind !== 'debris') {
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      }
      ps.splice(i, 1);
    }
  }
}
