import { TILE, WALL_H } from '../config.js';

// Rough-hewn rock, for themes with `rough` set: the level's surfaces are split into small pieces and every
// vertex nudged by a smooth 3D noise field. The field gives the same answer for the same point, so walls, floor,
// ceiling and channel sides still meet wherever they share an edge. Floors barely move (they're walked on),
// ceilings bulge and sag, walls lean in and out, and around doorways, stairs and things fixed flat to the wall
// the rock is calm, so frames and fittings sit true. Collision stays on the tile grid: the walls never lean in
// far enough to reach you.

const PIECE = 0.7; // metres: the size surfaces are split into
const REACH = 0.2; // metres: how far walls lean in or out
const LIFT = { floor: 0.03, wall: 0.12, ceiling: 0.3 }; // up/down movement

// A fast hash of a lattice point to 32 bits.
function hash(x, y, z, s) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
const fade = (t) => t * t * (3 - 2 * t);
/**
 * Smooth value noise in 3D (lattice spacing 1), three independent channels at once (from different bits of the
 * same hash), each -0.5..0.5, times `scale`, added into `out`.
 */
function noise3(x, y, z, s, scale, out) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
  let a = 0, b = 0, c = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = k >> 2;
    const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
    const h = hash(ix + dx, iy + dy, iz + dz, s);
    a += w * (h & 1023);
    b += w * ((h >>> 10) & 1023);
    c += w * ((h >>> 20) & 1023);
  }
  out[0] += (a / 1023 - 0.5) * scale;
  out[1] += (b / 1023 - 0.5) * scale;
  out[2] += (c / 1023 - 0.5) * scale;
}

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * The rock of a level. `calm` lists extra spots to keep flat ({ x, z } in metres, radius `r`) besides its
 * doorways and stairs, which are always calm. Returns { split, move, offset }:
 *   split(corners)  how many pieces a quad is cut into along each side
 *   move(p)         where the vertex at [x, y, z] ends up
 *   offset(p, n)    how far the rock at point p has moved along direction n (to set fittings flush with it)
 */
export function roughRock(data, calm = []) {
  const spots = [...calm];
  for (const d of data.doors) spots.push({ x: (d.x + 0.5) * TILE, z: (d.y + 0.5) * TILE, r: 2.2 });
  for (const s of [data.up, data.down].filter(Boolean)) spots.push({ x: (s.x + 0.5) * TILE, z: (s.y + 0.5) * TILE, r: 2.6 });
  // Bucket the calm spots by tile so each vertex only checks those nearby.
  const buckets = new Map();
  for (const s of spots) {
    for (let ty = Math.floor((s.z - s.r) / TILE); ty <= Math.floor((s.z + s.r) / TILE); ty++) {
      for (let tx = Math.floor((s.x - s.r) / TILE); tx <= Math.floor((s.x + s.r) / TILE); tx++) {
        const k = ty * data.w + tx;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(s);
      }
    }
  }
  // 0 right by a calm spot, rising to 1 over its last metre.
  const calmness = (x, z) => {
    let k = 1;
    for (const s of buckets.get(Math.floor(z / TILE) * data.w + Math.floor(x / TILE)) ?? []) {
      k = Math.min(k, smooth((Math.hypot(x - s.x, z - s.z) - (s.r - 1)) / 1));
    }
    return k;
  };
  const seed = data.depth * 31;
  const lift = (y) => (Math.abs(y) < 1e-3 ? LIFT.floor : Math.abs(y - WALL_H) < 1e-3 ? LIFT.ceiling : LIFT.wall);
  // How far the rock at [x, y, z] moves: -1..1 on each axis (a broad swell 0.9 m across with finer knobbles, 0.35
  // m, on top), scaled by how far it may.
  const shift = ([x, y, z]) => {
    const k = calmness(x, z);
    if (!k) return [0, 0, 0];
    const d = [0, 0, 0];
    noise3(x / 0.9, y / 0.9, z / 0.9, seed, 1.6, d);
    noise3(x / 0.35, y / 0.35, z / 0.35, seed + 7, 0.7, d);
    return [REACH * k * d[0], lift(y) * k * d[1], REACH * k * d[2]];
  };
  // Every corner is shared by up to four pieces (and by the next surface along): move each one once.
  const moved = new Map();
  return {
    split(p) {
      const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      return [Math.max(1, Math.round(len(p[0], p[1]) / PIECE)), Math.max(1, Math.round(len(p[0], p[3]) / PIECE))];
    },
    move(p) {
      // (By the millimetre: x and z are 0..262 m and y -16..16 m, well inside the level.)
      const key = (Math.round(p[0] * 1000) * 32768 + Math.round(p[1] * 1000) + 16384) * 262144 + Math.round(p[2] * 1000);
      let to = moved.get(key);
      if (!to) {
        const d = shift(p);
        to = [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
        moved.set(key, to);
      }
      return to;
    },
    offset(p, n) {
      const d = shift(p);
      return d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
    },
  };
}
