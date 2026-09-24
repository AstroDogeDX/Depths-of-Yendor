// Model kit: builds Blockbench (.bbmodel v5, Generic Model) projects from code, with auto-unwrapped UVs
// and procedurally painted pixel-art textures. Units are Blockbench pixels (MODEL_PX in src/config.js).
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import * as THREE from 'three';

export const D = 2; // texels per model pixel, unless a model sets its own `density`
const PAD = 1;
const r4 = (v) => Math.round(v * 10000) / 10000;

// ---------- noise / color ----------
function hash(...a) {
  let h = 2166136261;
  for (const v of a) { h ^= Math.floor(v) + 0x9e3779b9 + (h << 6) + (h >>> 2); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export const rand = hash;
export function noise3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const s = (t) => t * t * (3 - 2 * t);
  const ux = s(fx), uy = s(fy), uz = s(fz);
  const L = (a, b, t) => a + (b - a) * t;
  const h = (dx, dy, dz) => hash(ix + dx, iy + dy, iz + dz, seed);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), ux), L(h(0, 1, 0), h(1, 1, 0), ux), uy),
    L(L(h(0, 0, 1), h(1, 0, 1), ux), L(h(0, 1, 1), h(1, 1, 1), ux), uy), uz);
}
export const fract = (v) => v - Math.floor(v);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
/**
 * Picks from a dark-to-light palette. Values are banded to flat shades, with 4x4 ordered dithering only in a
 * narrow seam between neighbouring shades (`band` of the step), so surfaces read as clean pixel-art clusters.
 */
export function ramp(pal, v, ax, ay, band = 0.3) {
  const x = Math.max(0, Math.min(0.9999, v)) * (pal.length - 1);
  const i = Math.floor(x), f = x - i;
  const lo = 0.5 - band / 2;
  const up = f < lo ? false : f > 1 - lo ? true : (f - lo) / band > BAYER[(ay & 3) * 4 + (ax & 3)];
  return pal[up ? Math.min(i + 1, pal.length - 1) : i];
}

// ---------- geometry helpers (all return arrays of rings / polygons of [x,y,z]) ----------
export function latheRing(y, rx, rz = rx, sides = 8, phase = Math.PI / sides) {
  return Array.from({ length: sides }, (_, k) => {
    const a = phase + (k * 2 * Math.PI) / sides;
    return [rx * Math.cos(a), y, rz * Math.sin(a)];
  });
}
export const apex = (n, p) => Array.from({ length: n }, () => [...p]);
/** Hexagonal blade section: edges at ±z, flats at ±x (fraction f of the width is flat). */
export const hexRing = (y, w, t, f = 0.45) => [[0, y, -w], [t, y, -w * f], [t, y, w * f], [0, y, w], [-t, y, w * f], [-t, y, -w * f]];
/** Diamond blade section: edges at ±z, ridge at ±x. */
export const diamondRing = (y, w, t) => [[0, y, -w], [t, y, 0], [0, y, w], [-t, y, 0]];
/** Chamfered rectangle in the x-y plane at depth z (crossguards, hammer and axe parts). */
export function octRingZ(z, hx, hy, yc, ch = 0.3) {
  const c = ch * Math.min(hx, hy);
  return [[hx, yc + hy - c, z], [hx, yc - hy + c, z], [hx - c, yc - hy, z], [-hx + c, yc - hy, z],
    [-hx, yc - hy + c, z], [-hx, yc + hy - c, z], [-hx + c, yc + hy, z], [hx - c, yc + hy, z]];
}
export const rectRingZ = (z, hx, hy, yc) => [[hx, yc + hy, z], [hx, yc - hy, z], [-hx, yc - hy, z], [-hx, yc + hy, z]];

const CAPS = { 3: [[0, 1, 2]], 4: [[0, 1, 2, 3]], 5: [[0, 1, 2, 3], [0, 3, 4]], 6: [[0, 1, 2, 3], [0, 3, 4, 5]], 8: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 3, 4, 7]] };
// Any other convex ring is capped with a fan of quads from its first point.
const fan = (n) => Array.from({ length: Math.floor((n - 1) / 2) }, (_, k) => (2 * k + 3 < n ? [0, 2 * k + 1, 2 * k + 2, 2 * k + 3] : [0, 2 * k + 1, 2 * k + 2]));
const V = (a) => new THREE.Vector3(...a);
const same = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-6;
const centroid = (pts) => pts.reduce((c, p) => c.add(V(p)), new THREE.Vector3()).divideScalar(pts.length);
const normalOf = (pts) => V(pts[1]).sub(V(pts[0])).cross(V(pts[2]).sub(V(pts[0])));
function dedupe(poly) {
  const out = [];
  for (const p of poly) if (!out.some((q) => same(p, q))) out.push(p);
  return out;
}
function orient(poly, outward) {
  return normalOf(poly).dot(outward) < 0 ? poly.slice().reverse() : poly;
}
/**
 * Skins consecutive rings (equal point counts) into quads, dropping to triangles where a ring collapses
 * to a point, and caps open ends. Faces are wound so their normals point outward.
 */
export function loft(rings, { capStart = true, capEnd = true, caps = null, mat = null } = {}) {
  const polys = [];
  const n = rings[0].length;
  const centers = rings.map(centroid);
  for (let i = 0; i < rings.length - 1; i++) {
    const axis = centers[i].clone().add(centers[i + 1]).multiplyScalar(0.5);
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      const poly = dedupe([rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]]);
      if (poly.length < 3) continue;
      const out = centroid(poly).sub(axis);
      polys.push({ pts: orient(poly, out), mat: typeof mat === 'function' ? mat(i, j) : mat, seg: i, side: j });
    }
  }
  const cap = (ring, away, tag) => {
    const uniq = dedupe(ring);
    if (uniq.length < 3) return;
    for (const idx of caps || CAPS[n] || fan(n)) polys.push({ pts: orient(idx.map((q) => ring[q]), away), mat: typeof mat === 'function' ? mat(tag, -1) : mat, cap: tag });
  };
  if (capStart) cap(rings[0], centers[0].clone().sub(centers[1]), 'start');
  if (capEnd) cap(rings[rings.length - 1], centers[rings.length - 1].clone().sub(centers[rings.length - 2]), 'end');
  return polys;
}
/**
 * Surface of revolution about the y axis, for shapes with an inside such as bowls. `profile` is a list of
 * [r, y] points walked with the outside of the surface on the right: e.g. out across the base, up the outer
 * wall, in over the rim, then down the inner wall. `mat(i)` can pick a material per profile segment.
 */
export function revolve(profile, { sides = 8, phase = Math.PI / sides, mat = null } = {}) {
  const polys = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    const A = latheRing(y0, r0, r0, sides, phase), B = latheRing(y1, r1, r1, sides, phase);
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      const poly = dedupe([A[k], A[k2], B[k2], B[k]]);
      if (poly.length < 3) continue;
      // The profile's right-hand normal (dy, -dr), swung round to this face.
      const a = phase + ((k + 0.5) * 2 * Math.PI) / sides;
      const out = new THREE.Vector3((y1 - y0) * Math.cos(a), r0 - r1, (y1 - y0) * Math.sin(a));
      polys.push({ pts: orient(poly, out), mat: typeof mat === 'function' ? mat(i) : mat, seg: i, side: k });
    }
  }
  return polys;
}
/**
 * Bar along a path of points: square by default, or a `sides`-sided polygon of radius `half`. `side` is a
 * direction kept square across the bar, and `half` its half-width (or a function of 0..1 along the bar, to
 * taper it). A `closed` path joins its end back to its start, like a ring.
 */
export function tube(path, { half = 0.8, side = [1, 0, 0], sides = 4, closed = false, mat = null, capStart = true, capEnd = true } = {}) {
  const pts = path.map(V);
  const n = pts.length;
  const lens = pts.map((_, i) => pts.slice(1, i + 1).reduce((s, p, j) => s + p.distanceTo(pts[j]), 0));
  const total = lens[n - 1];
  const at = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  const rings = pts.map((c, i) => {
    const t = at(i + 1).clone().sub(at(i - 1)).normalize();
    // `side` can't square the bar where the path runs along it; fall back to another axis there.
    const s = Math.abs(t.dot(V(side))) > 0.99 ? V(Math.abs(t.z) < 0.9 ? [0, 0, 1] : [0, 1, 0]) : V(side);
    const u = s.addScaledVector(t, -t.dot(s)).normalize();
    const v = t.clone().cross(u);
    const h = typeof half === 'function' ? half(lens[i] / total) : half;
    const corners = sides === 4 ? [[1, 1], [1, -1], [-1, -1], [-1, 1]]
      : Array.from({ length: sides }, (_, k) => [Math.cos((k * 2 * Math.PI) / sides), Math.sin((k * 2 * Math.PI) / sides)]);
    return corners.map(([s1, s2]) => c.clone().addScaledVector(u, s1 * h).addScaledVector(v, s2 * h).toArray());
  });
  if (closed) rings.push(rings[0]);
  return loft(rings, { mat, capStart: capStart && !closed, capEnd: capEnd && !closed });
}
/** Lathe: profile [[y, r] | [y, rx, rz]] around the y axis. */
export function lathe(profile, { sides = 8, phase, mat, capStart = true, capEnd = true } = {}) {
  const rings = profile.map(([y, rx, rz]) => (rx <= 0 ? apex(sides, [0, y, 0]) : latheRing(y, rx, rz ?? rx, sides, phase)));
  return loft(rings, { mat, capStart, capEnd });
}

// ---------- model ----------
/**
 * Model builder with the usual textures: one sheet named after the model, plus `<name>_tint` for the `tint`
 * materials (painted in greys; the game multiplies them by the item's colour), `<name>_glow` (emissive) for
 * the `glow` materials, `<name>_cloth` (double-sided) for the `double` materials and `<name>_translucent`
 * (see-through in the game, and double-sided) for the `translucent` ones. `density` overrides texels per pixel (D), for big
 * models that would not fit their textures otherwise. Returns () => Model.
 */
export function defineModel(name, materials, fill, { tint = [], glow = [], double = [], translucent = [], density } = {}) {
  return () => {
    const sheets = [{ name, mode: 'default' }], sheetOf = {};
    const extra = (suffix, mode, mats, sides) => {
      if (!mats.length) return;
      sheets.push({ name: `${name}_${suffix}`, mode, sides });
      for (const mat of mats) sheetOf[mat] = sheets.length - 1;
    };
    extra('tint', 'default', tint);
    extra('glow', 'emissive', glow);
    extra('cloth', 'default', double, 'double');
    extra('translucent', 'default', translucent, 'double');
    const m = new Model(name, { materials, sheets, sheetOf, density });
    fill(m);
    return m;
  };
}

export class Model {
  /**
   * `materials` maps material names to painters (see materials.mjs).
   * `sheets` are the project's textures ({ name, mode, sides }: mode is Blockbench's render mode, e.g.
   * 'emissive'; sides 'double' draws both sides of each face, e.g. for cloth);
   * `sheetOf` maps a material name to the sheet it is painted on (default 0).
   */
  constructor(name, { materials, sheets = [{ name, mode: 'default' }], sheetOf = {}, density = D } = {}) {
    this.name = name;
    this.D = density;
    this.materials = materials;
    this.sheets = sheets;
    this.sheetOf = sheetOf;
    this.elements = [];
    this.groupsList = [];
    this.outliner = [];
    this.stack = [this.outliner];
    this.faces = []; // for unwrapping/painting
    this.n = 0;
  }
  uuid() {
    const h = crypto.createHash('sha1').update(`${this.name}:${this.n++}`).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  }
  /** A group; an empty one serves as a named anchor at its `origin` (the game reads group pivots). */
  group(name, fn = () => {}, { origin = [0, 0, 0] } = {}) {
    const uuid = this.uuid();
    this.groupsList.push({ name, origin, color: 0, uuid, export: true, mirror_uv: false, isOpen: true, locked: false, visibility: true, autouv: 0 });
    const node = { uuid, isOpen: true, children: [] };
    this.stack[this.stack.length - 1].push(node);
    this.stack.push(node.children);
    fn();
    this.stack.pop();
  }
  add(el) {
    this.elements.push(el);
    this.stack[this.stack.length - 1].push(el.uuid);
  }
  matrix(origin, rotation) {
    return new THREE.Matrix4().compose(V(origin), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation.map((d) => (d * Math.PI) / 180), 'ZYX')), new THREE.Vector3(1, 1, 1));
  }

  /** A Blockbench mesh from polygons ({pts, mat}) given in the element's local space. */
  mesh(name, polys, { mat, info = {}, origin = [0, 0, 0], rotation = [0, 0, 0] } = {}) {
    const el = { name, color: 0, origin, rotation, export: true, visibility: true, locked: false, render_order: 'default', allow_mirror_modeling: true, shading: 'flat', vertices: {}, faces: {}, type: 'mesh', uuid: this.uuid() };
    const M = this.matrix(origin, rotation);
    const keyOf = new Map();
    let vi = 0, fi = 0;
    const vkey = (p) => {
      const k = p.map(r4).join(',');
      if (!keyOf.has(k)) {
        const key = `v${(vi++).toString(36)}`;
        keyOf.set(k, key);
        el.vertices[key] = p.map(r4);
      }
      return keyOf.get(k);
    };
    for (const poly of polys) {
      const keys = poly.pts.map(vkey);
      const face = { uv: {}, vertices: keys, texture: 0 };
      el.faces[`f${(fi++).toString(36)}`] = face;
      this.faces.push({ kind: 'mesh', el, face, pts: poly.pts, M, mat: poly.mat || mat, info: { ...info, ...poly }, });
    }
    this.add(el);
    return el;
  }

  /** A Blockbench cube (from/to in model space), optionally rotated about `origin`. */
  cube(name, from, to, { mat, info = {}, origin, rotation = [0, 0, 0], faces = null } = {}) {
    origin = origin || from.map((v, i) => (v + to[i]) / 2);
    const el = { name, box_uv: false, render_order: 'default', locked: false, allow_mirror_modeling: true, from: from.map(r4), to: to.map(r4), autouv: 0, color: 0, origin: origin.map(r4), rotation, faces: {}, type: 'cube', uuid: this.uuid() };
    const M = this.matrix(origin, rotation);
    const f = from.map((v, i) => v - origin[i]), t = to.map((v, i) => v - origin[i]);
    const C = {
      east: [[t[0], t[1], t[2]], [t[0], t[1], f[2]], [t[0], f[1], t[2]]],
      west: [[f[0], t[1], f[2]], [f[0], t[1], t[2]], [f[0], f[1], f[2]]],
      up: [[f[0], t[1], f[2]], [t[0], t[1], f[2]], [f[0], t[1], t[2]]],
      down: [[f[0], f[1], t[2]], [t[0], f[1], t[2]], [f[0], f[1], f[2]]],
      south: [[f[0], t[1], t[2]], [t[0], t[1], t[2]], [f[0], f[1], t[2]]],
      north: [[t[0], t[1], f[2]], [f[0], t[1], f[2]], [t[0], f[1], f[2]]],
    };
    for (const dir in C) {
      const face = { uv: [0, 0, 0, 0], texture: faces && !faces.includes(dir) ? null : 0 };
      el.faces[dir] = face;
      if (face.texture === null) continue;
      const [tl, tr, bl] = C[dir];
      this.faces.push({ kind: 'cube', el, face, tl, tr, bl, M, mat, info });
    }
    this.add(el);
    return el;
  }

  // ---------- unwrap + paint ----------
  unwrap() {
    for (const f of this.faces) {
      if (f.kind === 'cube') {
        const tl = V(f.tl), right = V(f.tr).sub(tl), down = V(f.bl).sub(tl);
        f.w = right.length(); f.h = down.length();
        f.origin = tl; f.right = right.normalize(); f.down = down.normalize();
        f.poly2 = [[0, 0], [f.w, 0], [f.w, f.h], [0, f.h]];
        f.amin = 0; f.bmin = 0;
      } else {
        const n = normalOf(f.pts);
        // Faces with more than three points: average normal of the fan for a stable basis.
        if (f.pts.length === 4) n.add(V(f.pts[2]).sub(V(f.pts[0])).cross(V(f.pts[3]).sub(V(f.pts[0]))));
        n.normalize();
        // Texture "up" follows the model's +y (toward the tip) so wraps and grain read consistently.
        let up = new THREE.Vector3(0, 1, 0);
        if (Math.abs(n.dot(up)) > 0.8) up = new THREE.Vector3(0, 0, -1);
        up.sub(n.clone().multiplyScalar(n.dot(up))).normalize();
        const right = up.clone().cross(n).normalize();
        const down = up.clone().negate();
        const o = V(f.pts[0]);
        const p2 = f.pts.map((p) => { const d = V(p).sub(o); return [d.dot(right), d.dot(down)]; });
        f.amin = Math.min(...p2.map((q) => q[0])); f.bmin = Math.min(...p2.map((q) => q[1]));
        f.w = Math.max(...p2.map((q) => q[0])) - f.amin; f.h = Math.max(...p2.map((q) => q[1])) - f.bmin;
        f.origin = o; f.right = right; f.down = down; f.poly2 = p2.map(([a, b]) => [a - f.amin, b - f.bmin]);
      }
      f.tw = Math.max(1, Math.ceil(f.w * this.D - 1e-6)) + PAD * 2;
      f.th = Math.max(1, Math.ceil(f.h * this.D - 1e-6)) + PAD * 2;
    }
  }

  pack() {
    for (const f of this.faces) f.sheet = this.sheetOf[f.mat] ?? 0;
    const sizes = [];
    for (const w of [32, 64, 128, 256, 512]) for (const h of [32, 64, 128, 256, 512]) if (h >= w) sizes.push([w, h]);
    // Smallest area first, but avoid very thin strips: they are awkward to paint on in Blockbench.
    const cost = ([w, h]) => w * h * (h / w > 4 ? 2.5 : 1) + (h - w) * 0.01;
    sizes.sort((a, b) => cost(a) - cost(b));
    // Every sheet gets the same size, so UVs mean the same thing whichever texture a face uses.
    const fits = (W, H, faces) => {
      let x = 0, y = 0, rowH = 0;
      for (const f of faces.slice().sort((a, b) => b.th - a.th || b.tw - a.tw)) {
        if (f.tw > W) return false;
        if (x + f.tw > W) { x = 0; y += rowH; rowH = 0; }
        if (y + f.th > H) return false;
        f.rx = x; f.ry = y; x += f.tw; rowH = Math.max(rowH, f.th);
      }
      return true;
    };
    for (const [W, H] of sizes) {
      if (this.sheets.every((_, i) => fits(W, H, this.faces.filter((f) => f.sheet === i)))) { this.W = W; this.H = H; return; }
    }
    throw new Error(`${this.name}: faces do not fit in 512x512`);
  }

  paint() {
    const { W, H } = this;
    this.pixels = this.sheets.map(() => Buffer.alloc(W * H * 4));
    for (const f of this.faces) {
      const px = this.pixels[f.sheet];
      f.face.texture = f.sheet;
      const paint = this.materials[f.mat];
      if (!paint) throw new Error(`${this.name}: no material "${f.mat}"`);
      const origin = f.origin.clone().applyMatrix4(f.M);
      const rot = new THREE.Matrix3().setFromMatrix4(f.M);
      const right = f.right.clone().applyMatrix3(rot), down = f.down.clone().applyMatrix3(rot);
      const n = right.clone().cross(down).negate().normalize(); // right x up = n
      // outward edge normals of the 2D polygon (a right, b down)
      const P = f.poly2;
      const area = P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
      for (let ty = 0; ty < f.th; ty++) {
        for (let tx = 0; tx < f.tw; tx++) {
          const a = Math.min(f.w, Math.max(0, (tx - PAD + 0.5) / this.D)), b = Math.min(f.h, Math.max(0, (ty - PAD + 0.5) / this.D));
          let edge = Infinity, edgeUp = 0;
          for (let i = 0; i < P.length; i++) {
            const p = P[i], q = P[(i + 1) % P.length];
            const ex = q[0] - p[0], ey = q[1] - p[1], len2 = ex * ex + ey * ey || 1;
            const k = Math.max(0, Math.min(1, ((a - p[0]) * ex + (b - p[1]) * ey) / len2));
            const d = Math.hypot(a - p[0] - ex * k, b - p[1] - ey * k) * this.D;
            if (d < edge) {
              edge = d;
              // How far the edge's outward normal points up the texture (b runs down).
              edgeUp = ((area > 0 ? 1 : -1) * ex) / Math.sqrt(len2);
            }
          }
          const p3 = origin.clone().addScaledVector(right, f.amin + a).addScaledVector(down, f.bmin + b);
          const ax = f.rx + tx, ay = f.ry + ty;
          // p: model-space point, n: face normal, W/H: face size in texels, ax/ay: atlas texel (for dithering),
          // edge: texels to the face's nearest edge, info: the element's and face's extra data.
          const col = paint({ p: p3, n, W: f.tw - PAD * 2, H: f.th - PAD * 2, ax, ay, edge, edgeUp, info: f.info });
          const o = (ay * W + ax) * 4;
          px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = col[3] ?? 255;
        }
      }
      // UVs
      const ox = f.rx + PAD, oy = f.ry + PAD;
      if (f.kind === 'cube') {
        f.face.uv = [ox, oy, ox + f.w * this.D, oy + f.h * this.D].map(r4);
      } else {
        f.face.vertices.forEach((k, i) => { f.face.uv[k] = [r4(ox + f.poly2[i][0] * this.D), r4(oy + f.poly2[i][1] * this.D)]; });
      }
    }
  }

  /** Unwraps, packs and paints the model; returns the .bbmodel text and a few stats. */
  bake() {
    this.unwrap();
    this.pack();
    this.paint();
    const pngs = this.pixels.map((px) => encodePNG(this.W, this.H, px));
    const json = {
      meta: { format_version: '5.0', model_format: 'free', box_uv: false },
      name: this.name,
      model_identifier: '',
      visible_box: [1, 1, 0],
      resolution: { width: this.W, height: this.H },
      elements: this.elements,
      groups: this.groupsList,
      outliner: this.outliner,
      textures: this.sheets.map((sheet, i) => ({
        path: '', name: `${sheet.name}.png`, folder: '', namespace: '', id: String(i), group: '',
        width: this.W, height: this.H, uv_width: this.W, uv_height: this.H,
        particle: false, use_as_default: false, layers_enabled: false, sync_to_project: '',
        render_mode: sheet.mode, render_sides: sheet.sides || 'auto', pbr_channel: 'color',
        frame_time: 1, frame_order_type: 'loop', frame_order: '', frame_interpolate: false,
        visible: true, internal: true, saved: true, uuid: this.uuid(),
        source: `data:image/png;base64,${pngs[i].toString('base64')}`,
      })),
    };
    // Blockbench's own layout: tab-indented, with short arrays of numbers or strings kept on one line.
    const text = JSON.stringify(json, null, '\t')
      .replace(/\[\s+((?:-?[\d.e-]+|"[^"\n]*")(?:,\s+(?:-?[\d.e-]+|"[^"\n]*"))*)\s+\]/g, (_, body) => `[${body.split(/,\s+/).join(', ')}]`);
    return { text, stats: { faces: this.faces.length, texture: `${this.W}x${this.H}` } };
  }
}

// ---------- PNG ----------
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
