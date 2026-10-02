// Stairs: a pair of models for each theme (stairs_down_<style> and stairs_up_<style>, in that theme's file), each set
// in the middle of its own tile: 128 px across (x and z -64..64), its origin on the floor at the middle, turned so the
// side you come up to it from, and step off it onto when you arrive by it, faces +z. The tile is solid in the game, so
// nothing on it is ever walked on or into.
//
// The way down goes down through a hole in the floor, PIT px deep, fading into the dark; the way up goes up through a
// hole in the vault (VAULT px up) into a shaft reaching SKY px up, fading into the dark above. The game lays the floor
// and the vault round the holes itself, from the holes STAIRS in src/dungeon/levelBuilder.js gives for each theme,
// which must match these (a round hole is sixteen-sided, a corner on +x, as roundShaft makes them): a model only fills
// its hole, lines its shaft, and furnishes the tile about it. On the first floor the way up's shaft shows the sky, over
// whatever its model has at the top.
import { revolve, loft, rand, noise3 } from './lib.mjs';

export const HALF = 64;
export const VAULT = 179.2;
export const PIT = 205; // how far the ways down go below the floor
export const SKY = VAULT + 192; // how high the ways up's shafts reach
// How high the first floor's way up reaches (stairs_surface, in sewers.mjs): the street lies just over the sewer, so
// its manhole is open to the sky close enough over the vault to see (SURFACE_TOP in levelBuilder.js).
export const SURFACE = VAULT + 48;

const V = (a, b) => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
const cross = (u, w) => [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];

/** A flat polygon, wound to face `out`, with anything its painter needs besides. */
export function face(pts, out, extra = {}) {
  const n = cross(V(pts[0], pts[1]), V(pts[0], pts[2]));
  return { pts: n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? pts : [...pts].reverse(), ...extra };
}

/** The inside of a round shaft of radius `r` from y0 up to y1: sixteen sides (as the game's round holes), facing in. */
export const roundShaft = (r, y0, y1, extra = {}) => revolve([[r, y1], [r, y0]], { sides: 16, phase: 0 }).map((p) => ({ ...p, ...extra }));

/**
 * The inside of a square shaft round x0..x1 by z0..z1, from y0 up to y1, facing in, leaving out the walls named in
 * `open` ('n', 's', 'e', 'w': -z, +z, +x, -x). Each wall is tagged with its `wall`.
 */
export function squareShaft(x0, z0, x1, z1, y0, y1, { open = [], ...extra } = {}) {
  const walls = {
    n: face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, 1]),
    s: face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, -1]),
    e: face([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [-1, 0, 0]),
    w: face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [1, 0, 0]),
  };
  return Object.entries(walls).filter(([k]) => !open.includes(k)).map(([wall, p]) => ({ ...p, wall, ...extra }));
}

/**
 * A slab from a convex outline in the side view, [[z, y], ...], from x0 across to x1: a stair's cheek wall, say. `caps`
 * splits its ends into pieces, as loft() takes them (pieces that don't overlap save texture).
 */
export const sideways = (outline, x0, x1, caps = null) => loft([outline.map(([z, y]) => [x0, y, z]), outline.map(([z, y]) => [x1, y, z])], { caps });

/**
 * A rough rock wall: the quad `corners` ([p00, p10, p11, p01], going round, u along the first side, v along the last)
 * cut into pieces about `cell` px across, their corners pushed out along `out` (the way it faces) or back by up to
 * `amt` px, by smooth noise. It stays flat along the edge nearest the room (at height `flat`) and down its sides,
 * where it meets the floor or the vault and the walls either side.
 */
export function roughWall(corners, out, { cell = 16, amt = 5, flat = 0, seed = 0, ...extra } = {}) {
  const [p00, p10, p11, p01] = corners;
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const nu = Math.max(1, Math.round(len(p00, p10) / cell)), nv = Math.max(1, Math.round(len(p00, p01) / cell));
  const at = (i, j) => {
    const u = i / nu, v = j / nv;
    const p = [0, 1, 2].map((k) => p00[k] * (1 - u) * (1 - v) + p10[k] * u * (1 - v) + p11[k] * u * v + p01[k] * (1 - u) * v);
    const calm = Math.min(1, Math.abs(p[1] - flat) / 24) * Math.min(1, (Math.min(u, 1 - u) * len(p00, p10)) / 10);
    const d = amt * calm * (2 * noise3(p[0] / 13, p[1] / 13, p[2] / 13, seed) - 1 + 0.5 * (noise3(p[0] / 5, p[1] / 5, p[2] / 5, seed + 1) - 0.5));
    return p.map((c, k) => c + out[k] * d);
  };
  const polys = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) polys.push(face([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)], out, extra));
  return polys;
}

/** A point `r` out from the middle at angle `a` (radians from +z round toward +x), at height y. */
export const polar = (a, r, y) => [r * Math.sin(a), y, r * Math.cos(a)];

/**
 * A step of a spiral stair: a slab from angle a0 to a1 (see polar), from radius r0 out to r1, its top at y and `thick`
 * deep. Its faces are tagged `step`: 'top', 'bottom', 'nose' (its edge at a0), 'back', 'end' (round its outside) or
 * 'root' (against the column).
 */
export function wedge(a0, a1, r0, r1, y, thick, segs = 3) {
  // (Faces of at most four corners, as Blockbench's meshes take them: the top and bottom a slice of the turn at a time.)
  const out = Array.from({ length: segs + 1 }, (_, i) => a0 + ((a1 - a0) * i) / segs);
  const polys = [];
  for (let i = 0; i < segs; i++) {
    for (const [yy, up] of [[y, 1], [y - thick, -1]]) {
      polys.push(face([polar(out[i], r0, yy), polar(out[i], r1, yy), polar(out[i + 1], r1, yy), polar(out[i + 1], r0, yy)], [0, up, 0], { step: up > 0 ? 'top' : 'bottom' }));
    }
  }
  const side = (p, q, outward, step) => polys.push(face([[p[0], y, p[2]], [q[0], y, q[2]], [q[0], y - thick, q[2]], [p[0], y - thick, p[2]]], outward, { step }));
  const mid = (a) => polar(a, 1, 0);
  const n0 = polar(a0 - Math.PI / 2, 1, 0), n1 = polar(a1 + Math.PI / 2, 1, 0);
  side(polar(a0, r0, 0), polar(a0, r1, 0), n0, 'nose');
  side(polar(a1, r0, 0), polar(a1, r1, 0), n1, 'back');
  for (let i = 0; i < segs; i++) {
    const m = mid((out[i] + out[i + 1]) / 2);
    side(polar(out[i], r1, 0), polar(out[i + 1], r1, 0), m, 'end');
    side(polar(out[i], r0, 0), polar(out[i + 1], r0, 0), m.map((v) => -v), 'root');
  }
  return polys;
}

// 4×4 ordered dithering, for stepping colours down into the dark.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** How deep into the dark a point at height y is (0..1): nothing near the floor or the vault, all dark `far` px on. */
export function gloom(y, near = 24, far = 150) {
  const d = y < 0 ? -y : y > VAULT ? y - VAULT : 0;
  return Math.max(0, Math.min(1, (d - near) / (far - near)));
}

/** A colour stepped down toward black as far as `t` (0..1) says, in a few flat steps dithered between. */
export function darken(col, t, ax, ay) {
  if (t <= 0) return col;
  const lv = Math.min(1, t) * 5, i = Math.floor(lv), step = Math.min(5, i + (lv - i > BAYER[(ay & 3) * 4 + (ax & 3)] ? 1 : 0));
  const k = 1 - (step / 5) * 0.95;
  return [col[0] * k, col[1] * k, col[2] * k, col[3] ?? 255];
}

/** A painter that shades another (`paint`) down into the dark, by how deep each point is (see gloom). */
export const deep = (paint, near, far) => (c) => {
  const col = paint(c);
  return col[3] === 0 ? col : darken(col, gloom(c.p.y, near, far), c.ax, c.ay);
};

/** Jitters a number a little, the same way each time for the same keys: for things set by hand, not by a ruler. */
export const wobble = (amt, ...keys) => (rand(...keys) - 0.5) * 2 * amt;
