import * as THREE from 'three';
import { rand } from '../rng.js';
import { glowTexture } from './glow.js';

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

/** A cloud of gas billowing up and spreading from a point on the floor, hanging a while before it thins away. */
export function gasCloud(level, x, z, color, puffs = 7, life = 3.2) {
  for (let i = 0; i < puffs && level.particles.length < MAX; i++) {
    const mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0, depthWrite: false }));
    const a = rand.range(0, Math.PI * 2), r = rand.range(0, 0.35);
    mesh.position.set(x + Math.cos(a) * r, 0.25, z + Math.sin(a) * r);
    level.group.add(mesh);
    level.particles.push({
      kind: 'cloud', mesh, life: life * rand.range(0.75, 1), max: life, size: rand.range(1.6, 2.6),
      vx: Math.cos(a) * rand.range(0.2, 0.6), vy: rand.range(0.35, 0.8), vz: Math.sin(a) * rand.range(0.2, 0.6),
    });
  }
}

/** A column of light standing up from the floor, fading out. */
export function lightColumn(level, x, z, color, height = 3, life = 0.6) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, height, 12, 1, true), new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.position.set(x, height / 2, z);
  transient(level, mesh, life);
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
    } else if (p.kind === 'cloud') {
      // Billowing out fast, then drifting and slowing as it spreads, thinning at the end.
      const k = 1 - p.life / p.max, drag = Math.max(0, 1 - dt * 1.5);
      p.vx *= drag; p.vy *= drag; p.vz *= drag;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(p.size * (0.3 + 0.7 * Math.min(1, k * 3)));
      p.mesh.material.opacity = 0.5 * Math.min(1, k * 8) * Math.min(1, p.life / (p.max * 0.4));
    }
    if (p.life <= 0) {
      level.group.remove(p.mesh);
      if (p.kind === 'cloud') p.mesh.material.dispose(); // (sprites share one geometry)
      else if (p.kind !== 'debris') {
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      }
      ps.splice(i, 1);
    }
  }
}
