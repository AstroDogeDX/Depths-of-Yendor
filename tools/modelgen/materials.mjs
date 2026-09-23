// Shared palettes and material painters for the generated models.
import { noise3, rand, fract, hex, ramp } from './lib.mjs';

// ---------- palettes (dark -> light) ----------
export const P = (...h) => h.map(hex);
export const PAL = {
  steel: P('#232a36', '#364052', '#4d5b70', '#6a7a91', '#8a9bb2', '#adbdd0', '#d0dce8', '#eef4f9'),
  iron: P('#1d2126', '#2b3037', '#3b414a', '#4e555f', '#636b76', '#7c8591', '#98a1ac'),
  brass: P('#2d230f', '#4a3b17', '#6b5822', '#8e782f', '#b09841', '#ccb45c', '#e6d38a'),
  leather: P('#1a110b', '#28190f', '#382314', '#4a2f1b', '#5c3b22', '#6e482a'),
  wood: P('#21170f', '#302216', '#402e1e', '#523c27', '#644a31', '#77593b'),
  cord: P('#2b0c09', '#45130e', '#621d15', '#80291d', '#9c3828', '#b54b35'),
};

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Bevel shading on the outermost texels of larger faces: lit along the top edge, shadowed underneath.
export const bevel = (c, up, down = up * 0.7) => (Math.min(c.W, c.H) < 5 || c.edge > 1 ? 0 : c.edgeUp > 0.4 ? up : c.edgeUp < -0.4 ? -down : 0);
// Broad, soft variation: patches several model pixels across, so surfaces stay in clean clusters.
export const patches = (p, seed, scale = 0.25) => noise3(p.x * scale, p.y * scale, p.z * scale, seed) - 0.5;
export const interp = (pts) => (y) => {
  if (y <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (y <= pts[i][0]) {
    const [y0, v0] = pts[i - 1], [y1, v1] = pts[i];
    return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
  }
  return pts[pts.length - 1][1];
};

export const MAT = {
  steel(c) {
    const { p, n, info } = c;
    const ef = clamp01(Math.abs(p.z) / Math.max(0.05, info.hw(p.y))); // 0 at the spine, 1 at the edge
    const edgeFace = info.style === 'hex' ? Math.abs(n.x) < 0.9 : ef > 0.66;
    let v = edgeFace ? 0.74 : 0.52;
    v += 0.12 * patches(p, 3, 0.12);
    if (ef > 0.92) v = 0.93; // honed edge
    if (info.style === 'diamond' && ef < 0.1) v = 0.36; // ridge line
    const [f0, f1, fw] = info.fuller || [];
    if (info.fuller && !edgeFace && p.y > f0 && p.y < f1 && Math.abs(p.z) < fw) {
      // Groove: dark floor with one lit wall.
      v = Math.abs(p.z) < fw * 0.45 ? 0.3 : p.z > 0 ? 0.68 : 0.4;
    }
    // Two clean diagonal glints across the flats.
    if (!edgeFace && info.glints) for (const g of info.glints) if (Math.abs(p.y - g - p.z * 0.9) < 0.45) v = Math.max(v, 0.84);
    if (p.y < info.base + 1.2) v -= 0.14; // shadow where the blade meets the guard
    return ramp(PAL.steel, v, c.ax, c.ay);
  },
  iron(c) {
    const { p } = c;
    let v = 0.45 + 0.22 * patches(p, 11, 0.3) + bevel(c, 0.2);
    if (rand(c.ax, c.ay, 13) > 0.975) v -= 0.14; // pitting
    return ramp(PAL.iron, v, c.ax, c.ay);
  },
  // Axe bit: forged iron body, ground bright toward the edge with a wavy line between the two.
  axeBit(c) {
    const { p, info } = c;
    if (info.seg === 4) return MAT.honed(c);
    const t = clamp01((-p.z - 7) / 8.5);
    if (t > 0.42 + 0.07 * Math.sin(p.y * 0.9)) {
      const v = 0.5 + 0.28 * t + 0.08 * patches(p, 5, 0.3);
      return ramp(PAL.steel, v, c.ax, c.ay);
    }
    return MAT.iron(c);
  },
  honed(c) {
    return ramp(PAL.steel, 0.86 + 0.06 * patches(c.p, 8, 0.4), c.ax, c.ay);
  },
  // Hammer striking face: a waffle of little pyramids, lit from above.
  hammerFace(c) {
    const { p } = c;
    const gx = fract(p.x * 0.8 + 0.5), gy = fract((p.y - 46) * 0.8 + 0.5);
    let v = gx < 0.2 || gy < 0.2 ? 0.22 : gy < 0.6 ? 0.62 : 0.44;
    v += bevel(c, 0.15);
    return ramp(PAL.iron, v, c.ax, c.ay);
  },
  brass(c) {
    const { p, n } = c;
    let v = 0.5 + 0.14 * patches(p, 21, 0.35) + 0.12 * n.y + bevel(c, 0.24);
    if (rand(c.ax, c.ay, 22) > 0.985) v -= 0.16; // tarnish
    return ramp(PAL.brass, v, c.ax, c.ay);
  },
  // Strip of leather wound diagonally round the grip: dark gaps, each turn rounded and lit on top.
  leather(c) {
    const { p } = c;
    const a = Math.atan2(p.z, p.x) / (2 * Math.PI);
    const f = fract(p.y / 1.7 + a);
    let v = f < 0.16 ? 0.12 : 0.34 + 0.34 * Math.sin(((f - 0.16) / 0.84) * Math.PI * 0.85);
    v += 0.08 * patches(p, 31, 0.5);
    return ramp(PAL.leather, v, c.ax, c.ay);
  },
  wood(c) {
    const { p } = c;
    const a = Math.atan2(p.z, p.x);
    const g = noise3(Math.cos(a) * 1.4 + 5, p.y * 0.03, Math.sin(a) * 1.4, 41);
    let v = 0.36 + 0.36 * g;
    if (fract(g * 6 + 0.4 * noise3(p.x, p.y * 0.12, p.z, 42)) < 0.13) v -= 0.18; // grain lines
    return ramp(PAL.wood, v, c.ax, c.ay);
  },
  // Cord binding: tight rounded turns.
  cord(c) {
    const { p } = c;
    const f = fract(p.y * 1.3 + (Math.atan2(p.z, p.x) / (2 * Math.PI)) * 0.5);
    const v = f < 0.2 ? 0.12 : 0.34 + 0.5 * Math.sin(((f - 0.2) / 0.8) * Math.PI);
    return ramp(PAL.cord, v, c.ax, c.ay);
  },
};

