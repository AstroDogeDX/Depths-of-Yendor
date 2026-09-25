// The Underworld's props: the stone arches over its lava, the crust on the lava's lips and the demon mouths it
// pours from, its wall lights, and the decorations dungeon/decor.js sets about its rooms: the furnishings of a
// temple to the evil below, carved with runes that shine violet. Floor props: origin on the floor at the middle,
// front facing +z. Against-the-wall props stand with their origin 36 px out from the wall (at z -36). Wall props:
// origin on the wall face at floor level, standing out along +z. Wall lights: origin on the wall 1.85 m up, an
// empty "flame" group where the fire burns. The lava lies 0.7 m below the floor (45 px).
import { defineModel, loft, revolve, tube, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, patches, bevel } from './materials.mjs';

const UW = {
  basalt: P('#16121c', '#221b2a', '#2e2438', '#3b2f47', '#4a3b58', '#5c4a6c'),
  brick: P('#171219', '#221b2a', '#2d2436', '#382d42', '#45384f'),
  crust: P('#0c0908', '#171110', '#221816', '#2e1e1a', '#3a241e'),
  lava: P('#3a0c06', '#6a1a08', '#a8340c', '#e0601a', '#ff9a30', '#ffd070'),
  violet: P('#12051c', '#2c0c46', '#4e1a78', '#7a34b0', '#b070e8', '#e0b8ff'),
  bone: P('#3a3428', '#5a5140', '#7a705a', '#9a9076', '#b8ae94', '#d4ccb2'),
  cloth: P('#08060a', '#110c16', '#1b1322', '#261b30', '#33243f'),
  blood: P('#1a0806', '#2e0e0a', '#44150f', '#5a1c14'),
  ash: P('#141216', '#1e1b21', '#29252d', '#35303a'),
  wax: P('#3a3040', '#564a60', '#72647e', '#8e7e9c', '#a898b6'),
  wing: P('#0a080c', '#141018', '#1e1824', '#2a2232'),
  void: P('#030303', '#08080a', '#0e0e10'),
};
const LAVA_Y = -45; // the lava's surface
const clear = [0, 0, 0, 0];
const flecks = (c) => { const r = rand(c.ax, c.ay, 3002); return r > 0.94 ? 0.14 : r < 0.05 ? -0.14 : 0; };

// ---------------------------------------------------------------- runes

/** Runes, as the walls' frieze has them: 5×7 bitmaps of three to five strokes between points on a 3×4 lattice. */
const RUNES = Array.from({ length: 24 }, (_, g) => {
  const bits = new Uint8Array(35), steps = [[1, 0], [0, 1], [1, 1], [1, -1], [0, 2], [2, 0]];
  const want = 3 + Math.floor(rand(g, 3000) * 3);
  for (let drawn = 0, k = 0; drawn < want && k < 60; k++) {
    const a = [Math.floor(rand(g, k, 3001) * 3) * 2, Math.floor(rand(g, k, 3002) * 4) * 2];
    const [dx, dy] = steps[Math.floor(rand(g, k, 3003) * steps.length)], b = [a[0] + dx * 2, a[1] + dy * 2];
    if (b[0] < 0 || b[0] > 4 || b[1] < 0 || b[1] > 6) continue;
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    for (let s = 0; s <= n; s++) bits[Math.round(a[1] + ((b[1] - a[1]) * s) / n) * 5 + Math.round(a[0] + ((b[0] - a[0]) * s) / n)] = 1;
    drawn++;
  }
  return bits;
});
/** Whether (u, v), model pixels along and up a strip of runes (5×7, 2 apart), falls on a stroke of one. */
function runeAt(u, v, seed = 0) {
  const cx = Math.floor(u / 7), cy = Math.floor(v / 9), lx = Math.floor(u - cx * 7), ly = Math.floor(v - cy * 9);
  if (lx > 4 || ly > 6) return false;
  return RUNES[Math.floor(rand(cx, cy, seed, 3010) * RUNES.length)][(6 - ly) * 5 + lx] === 1;
}
/** Distance from (x, y) to the segment a-b. */
function segDist(x, y, [ax, ay], [bx, by]) {
  const ex = bx - ax, ey = by - ay, k = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
  return Math.hypot(x - ax - ex * k, y - ay - ey * k);
}
const glowV = (c, v = 0.78) => ramp(UW.violet, v + (rand(c.ax, c.ay, 3020) > 0.85 ? 0.15 : 0), c.ax, c.ay);

const MATS = {
  ...MAT,
  basalt: (c) => ramp(UW.basalt, 0.5 + 0.14 * patches(c.p, 3040, 0.3) + bevel(c, 0.18) + flecks(c) + 0.06 * c.n.y, c.ax, c.ay),
  crust: (c) => ramp(UW.crust, 0.45 + 0.2 * patches(c.p, 3041, 0.5) + bevel(c, 0.15) + flecks(c), c.ax, c.ay),
  darkIron: (c) => ramp(PAL.iron, 0.24 + 0.14 * patches(c.p, 3042, 0.4) + bevel(c, 0.2) - (rand(c.ax, c.ay, 3043) > 0.97 ? 0.12 : 0), c.ax, c.ay),
  wax: (c) => ramp(UW.wax, 0.5 + 0.1 * patches(c.p, 3044, 1) + (c.n.y > 0.7 ? 0.2 : 0) + bevel(c, 0.1), c.ax, c.ay),
  wick: (c) => ramp(UW.void, 0.5, c.ax, c.ay),
  socket: (c) => ramp(UW.void, 0.3, c.ax, c.ay),
  bone: (c) => ramp(UW.bone, 0.5 + 0.18 * patches(c.p, 3045, 0.6) + bevel(c, 0.15), c.ax, c.ay),
  // Black bricks in running bond on whichever way a face looks, dark mortar between.
  brick(c) {
    const { p, n } = c;
    const [u, v] = Math.abs(n.y) > 0.6 ? [p.x, p.z] : Math.abs(n.x) > 0.6 ? [p.z, p.y] : [p.x, p.y];
    const row = Math.floor((v + 200) / 5), off = row % 2 ? 6 : 0;
    if (fract((v + 200) / 5) < 0.18 || fract((u + 200 + off) / 12) < 0.08) return ramp(UW.brick, 0.05, c.ax, c.ay);
    return ramp(UW.brick, 0.45 + 0.25 * (rand(Math.floor((u + 200 + off) / 12), row, 3030) - 0.5) + bevel(c, 0.12) + 0.08 * patches(p, 3031, 0.5), c.ax, c.ay);
  },
  // An altar's top: basalt, stained with old blood.
  altarTop(c) {
    if (c.n.y > 0.7 && patches(c.p, 3050, 0.18) > 0.05) return ramp(UW.blood, 0.45 + 0.3 * patches(c.p, 3051, 0.6), c.ax, c.ay);
    return MATS.basalt(c);
  },
  // Black cloth in a fine weave, a violet thread worked round its edge, its hem in rags (`info` places it).
  cloth(c) {
    const { p, info } = c, x = p.x, y = p.y, ax = Math.abs(x);
    if (y < info.BOT + 8 - 20 * rand(Math.floor((x + 100) / 4), 3060) - 5 * noise3(x * 0.3, 0, 0, 3061)) return clear;
    if (noise3(x * 0.35, y * 0.35, 0, 3062) > 0.84 && y < info.TOP - 16) return clear;
    if ((ax > info.W - 4 && ax < info.W - 2.5) || (y > info.TOP - 7 && y < info.TOP - 5.5)) return ramp(UW.violet, 0.4, c.ax, c.ay);
    return ramp(UW.cloth, 0.5 + ((c.ax + c.ay) % 2 ? 0.05 : -0.05) + 0.12 * patches(p, 3063, 0.3), c.ax, c.ay);
  },
  // A demon's wing: dark membrane stretched between ribs.
  wing: (c) => ramp(UW.wing, fract((Math.atan2(c.p.y - 70, Math.abs(c.p.x) - 12) / Math.PI) * 5) < 0.12 ? 0.8 : 0.35 + 0.1 * patches(c.p, 3065, 0.5), c.ax, c.ay),
  // Emissive: molten rock, crust darkening over it here and there.
  magma(c) {
    const v = noise3(c.p.x * 0.45, c.p.y * 0.45, c.p.z * 0.45, 3070);
    return ramp(UW.lava, v > 0.66 ? 0.12 : 0.55 + 0.35 * noise3(c.p.x * 0.8, c.p.y * 0.8, c.p.z * 0.8, 3071) + (c.edge < 1 ? 0.1 : 0), c.ax, c.ay);
  },
  // Emissive: fire glowing in a demon's eyes and throat.
  fireGlow: (c) => ramp(UW.lava, 0.7 + 0.15 * patches(c.p, 3072, 1) + (c.edge < 1 ? -0.15 : 0), c.ax, c.ay),
  // Emissive: violet light, as in a skull's sockets.
  violetGlow: (c) => glowV(c, 0.72),
  // Emissive: coals burning violet, char black between them.
  violetEmbers(c) {
    const { p } = c, g = noise3(p.x * 0.9, p.y * 0.9, p.z * 0.9, 3073);
    if (fract(g * 4.5) < 0.2) return ramp(UW.violet, 0.02, c.ax, c.ay);
    return ramp(UW.violet, 0.35 + 0.5 * noise3(p.x * 0.6 + 4, p.y * 0.6, p.z * 0.6, 3074), c.ax, c.ay);
  },
  // Emissive, cut out: a strip of runes across a face, `info.u` the axis they run along (from `u0`) and up from
  // `v0`.
  runes(c) {
    const { p, info } = c, u = p[info.u] - info.u0, v = p.y - info.v0;
    return u >= 0 && v >= 0 && runeAt(u, v, info.seed ?? 0) ? glowV(c) : clear;
  },
  // Emissive, cut out: a summoning circle on the floor: two rings with runes between them round a seven-pointed
  // star, a small ring at its heart.
  circle(c) {
    const { x, z } = c.p, r = Math.hypot(x, z), a = Math.atan2(z, x);
    if (Math.abs(r - 66) < 1.3 || Math.abs(r - 56) < 1.1 || Math.abs(r - 10) < 1.1) return glowV(c);
    if (r > 57.5 && r < 64.5) return runeAt((a + Math.PI) * 61, r - 57.5, 7) ? glowV(c) : clear;
    const pt = (k) => [Math.cos((k * 2 * Math.PI) / 7 - Math.PI / 2) * 55, Math.sin((k * 2 * Math.PI) / 7 - Math.PI / 2) * 55];
    for (let k = 0; k < 7; k++) if (segDist(x, z, pt(k), pt(k + 3)) < 1.1) return glowV(c, 0.7);
    return clear;
  },
  // Emissive, cut out: the cult's sigil, an eye in a ring with rays about it, `info.R` across at (cx, cy) on a
  // face looking along ±z.
  sigil(c) {
    const { p, info } = c, u = p.x - info.cx, v = p.y - info.cy, r = Math.hypot(u, v), R = info.R;
    if (Math.abs(r - R) < 1) return glowV(c);
    if (r > R + 2 && r < R + 6 && Math.abs(fract((Math.atan2(v, u) / Math.PI) * 4 + 0.5) - 0.5) < 0.06 * (R / r) * 4) return glowV(c, 0.7);
    const lid = R * 0.4 * (1 - (u / (R * 0.8)) ** 2);
    if (Math.abs(u) < R * 0.8 && Math.abs(Math.abs(v) - lid) < 0.9) return glowV(c);
    if (r < R * 0.2) return glowV(c, 0.8);
    return clear;
  },
  // Emissive, cut out: a ring of runes round a medallion on a face looking along +z, centred at (cx, cy).
  runeRing(c) {
    const { p, info } = c, u = p.x - info.cx, v = p.y - info.cy, r = Math.hypot(u, v);
    if (Math.abs(r - 20) < 0.8 || Math.abs(r - 29) < 0.8) return glowV(c);
    if (r > 20.8 && r < 28.2) return runeAt((Math.atan2(v, u) + Math.PI) * 24.5, r - 21, 3) ? glowV(c) : clear;
    return clear;
  },
  // Emissive, cut out: cracks in the floor with magma glowing in them (`info.segs`: [a, b, width] in x-z).
  magmaCrack(c) {
    let d = Infinity;
    for (const [a, b, w] of c.info.segs) d = Math.min(d, segDist(c.p.x, c.p.z, a, b) - w);
    if (d < 0) return ramp(UW.lava, 0.72 + 0.2 * noise3(c.p.x * 0.5, 0, c.p.z * 0.5, 3080), c.ax, c.ay);
    return d < 1.1 ? ramp(UW.lava, 0.2, c.ax, c.ay) : clear;
  },
  // Cut out: a scorched, ashen patch of floor round a crack, ragged at its edge.
  scorch(c) {
    const r = Math.hypot(c.p.x, c.p.z) / (c.info.R * (0.75 + 0.35 * noise3(c.p.x * 0.08, 0, c.p.z * 0.08, 3081)));
    return r > 1 ? clear : ramp(UW.ash, 0.2 + 0.5 * r + 0.12 * patches(c.p, 3082, 0.6), c.ax, c.ay);
  },
};

// ---------------------------------------------------------------- shared parts

/** A polygon wound so it faces `out`. */
function facing(pts, out) {
  const [a, b, c] = pts;
  const u = b.map((v, i) => v - a[i]), w = c.map((v, i) => v - a[i]);
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  return { pts: n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? pts : [...pts].reverse() };
}
/** A flat quad over a face, a hair out from it (for runes and sigils laid over stone). */
const overlay = (m, name, pts, out, mat, info = {}) => m.mesh(name, [facing(pts, out)], { mat, info });

/** A candle, `h` tall, its wick marked by an anchor group candle_`i` for the game's flame. */
function candle(m, i, at, h, r = 2) {
  const [x, y, z] = at;
  m.mesh(`candle_${i}_wax`, revolve([[0, 0], [r * 1.25, 0], [r * 1.1, 1.5], [r, 3], [r, h], [0, h]], { sides: 6 }), { mat: 'wax', origin: at });
  m.cube(`candle_${i}_wick`, [x - 0.4, y + h, z - 0.4], [x + 0.4, y + h + 1.6, z + 0.4], { mat: 'wick' });
  m.group(`candle_${i}`, undefined, { origin: [x, y + h + 1.2, z] });
}

/** A skull `s` pixels across at `at`, turned by `rot`, facing +z; `eyes` is its sockets' material. */
function skull(m, name, at, { s = 9, rot = [0, 0, 0], eyes = 'socket', open = false } = {}) {
  const [x, y, z] = at, pose = { origin: at, rotation: rot };
  const top = open ? [[0.5 * s, 0.45 * s], [0.42 * s, 0.4 * s], [0.38 * s, 0.1 * s], [0, 0.1 * s]] : [[0.45 * s, 0.62 * s], [0, 0.72 * s]];
  m.mesh(`${name}_cranium`, revolve([[0, -0.25 * s], [0.45 * s, -0.3 * s], [0.58 * s, 0.05 * s], [0.6 * s, 0.35 * s], ...top], { sides: 8 }), { mat: 'bone', ...pose });
  for (const k of [-1, 1]) m.cube(`${name}_eye_${k}`, [x + k * 0.24 * s - 0.13 * s, y + 0.07 * s, z + 0.44 * s], [x + k * 0.24 * s + 0.13 * s, y + 0.3 * s, z + 0.58 * s], { mat: eyes, ...pose });
  m.cube(`${name}_nose`, [x - 0.07 * s, y - 0.14 * s, z + 0.46 * s], [x + 0.07 * s, y + 0.03 * s, z + 0.58 * s], { mat: 'socket', ...pose });
  m.cube(`${name}_jaw`, [x - 0.28 * s, y - 0.5 * s, z + 0.05 * s], [x + 0.28 * s, y - 0.24 * s, z + 0.5 * s], { mat: 'bone', ...pose });
}

/** A horn from `root`, curving along `path` (points after the root), tapering to a point. */
const horn = (m, name, pts, base = 2.2, mat = 'basalt') => m.mesh(name, tube(pts, { half: (f) => base * (1 - f * 0.85), sides: 5 }), { mat });

/**
 * Cooled crust along a lava channel's lip, one tile's length of it (along x), the lava in front (+z): black slabs
 * sagging out over the edge, molten rock oozing between them and dribbling down the side, cracks glowing in the
 * bank behind. `seed` makes each variant different.
 */
function lavaLip(name, seed) {
  return defineModel(name, MATS, (m) => {
    const r = (i, k) => rand(seed, i, 3100 + k);
    for (let x = -64, i = 0; x < 63; i++) {
      const x1 = Math.min(64, x + 14 + r(i, 0) * 18), back = -(6 + r(i, 2) * 10), over = 6 + r(i, 3) * 12;
      m.cube(`crust_${i + 1}`, [x + 0.8, -6, back], [x1 - 0.8, 1, over], { mat: 'crust', origin: [(x + x1) / 2, 0, back], rotation: [4 + r(i, 4) * 14, (r(i, 5) - 0.5) * 10, (r(i, 6) - 0.5) * 8] });
      if (r(i, 7) > 0.35 && x1 < 63) m.cube(`ooze_${i + 1}`, [x1 - 2.5, -3.5, -2], [x1 + 2.5, 0.2, over * 0.8], { mat: 'magma' });
      if (r(i, 8) > 0.55) {
        const dx = x + (x1 - x) * r(i, 9), len = 12 + r(i, 10) * 26;
        m.mesh(`dribble_${i + 1}`, [facing([[dx - 1.4, 0, 0.4], [dx + 1.4, 0, 0.4], [dx + 0.8, -len, 0.4], [dx - 0.8, -len, 0.4]], [0, 0, 1])], { mat: 'magma' });
      }
      x = x1;
    }
    const segs = [];
    for (let k = 0; k < 2; k++) {
      let x = -44 + r(k, 20) * 88, z = -1;
      for (let s = 0; s < 4; s++) {
        const nx = x + (r(k, 30 + s) - 0.5) * 12, nz = z - 5 - r(k, 40 + s) * 6;
        segs.push([[x, z], [nx, nz], 0.9 - s * 0.18]);
        x = nx; z = nz;
      }
    }
    m.cube('bank_cracks', [-64, 0.2, -32], [64, 0.35, 0], { mat: 'magmaCrack', info: { segs }, faces: ['up'] });
  }, { density: 1, glow: ['magma', 'magmaCrack'] });
}

// ---------------------------------------------------------------- props

export const underworld = {
  lava_bridge: defineModel('lava_bridge', MATS, (m) => {
    // A narrow arch of black brick over the lava, low parapets either side with runes glowing along them, a
    // horned post at each corner. It spans 2 m (along z) and rests on the banks.
    const W = 34, L = 80, zs = [-64, -54, -42, -28, -12, 12, 28, 42, 54, 64], yAt = (z) => -4 - 41 * (z / 64) ** 2;
    const polys = [];
    for (let i = 0; i < zs.length - 1; i++) {
      const [za, zb] = [zs[i], zs[i + 1]], [ya, yb] = [yAt(za), yAt(zb)];
      for (const s of [-1, 1]) polys.push(facing([[s * W, ya, za], [s * W, yb, zb], [s * W, -2, zb], [s * W, -2, za]], [s, 0, 0]));
      polys.push(facing([[-W, ya, za], [W, ya, za], [W, yb, zb], [-W, yb, zb]], [0, -1, 0]));
    }
    m.mesh('arch', polys, { mat: 'brick' });
    m.cube('deck', [-W, -2, -L], [W, 1, L], { mat: 'brick' });
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'left' : 'right', x0 = s < 0 ? -W - 4 : W - 3, x1 = s < 0 ? -W + 3 : W + 4;
      m.cube(`parapet_${side}`, [x0, 1, -L + 2], [x1, 15, L - 2], { mat: 'brick' });
      m.cube(`coping_${side}`, [x0 - 1, 15, -L + 1], [x1 + 1, 18, L - 1], { mat: 'basalt' });
      for (const [face, x] of [['outer', s * (W + 4.2)], ['inner', s * (W - 3.2)]]) {
        const out = face === 'outer' ? s : -s;
        overlay(m, `runes_${side}_${face}`, [[x, 4, -52], [x, 4, 52], [x, 12, 52], [x, 12, -52]], [out, 0, 0], 'runes', { u: 'z', u0: -52, v0: 4.5, seed: s + (face === 'outer' ? 2 : 5) });
      }
      for (const z of [-L + 4, L - 4]) {
        const px = s * (W + 0.5);
        m.cube(`post_${side}_${z < 0 ? 'near' : 'far'}`, [px - 5, 1, z - 4.5], [px + 5, 24, z + 4.5], { mat: 'basalt' });
        horn(m, `post_horn_${side}_${z < 0 ? 'near' : 'far'}`, [[px, 23, z], [px + s * 3, 29, z], [px + s * 7, 33, z - Math.sign(z) * 2]], 3);
      }
    }
  }, { density: 1, glow: ['runes'] }),

  lava_lip: lavaLip('lava_lip', 1),
  lava_lip_2: lavaLip('lava_lip_2', 2),

  lava_mouth: defineModel('lava_mouth', MATS, (m) => {
    // A demon's head carved in the wall over the end of a lava channel, its horns sweeping up, eyes and throat
    // aglow; at the channel's head, the lava pours from its jaws (the game adds the falling lava).
    m.cube('plate', [-36, 20, 0], [36, 108, 3], { mat: 'basalt' });
    overlay(m, 'plate_runes', [[-33, 94, 3.2], [33, 94, 3.2], [33, 104, 3.2], [-33, 104, 3.2]], [0, 0, 1], 'runes', { u: 'x', u0: -32, v0: 95, seed: 11 });
    m.cube('brow', [-20, 70, 3], [20, 80, 13], { mat: 'basalt' });
    m.cube('face', [-16, 44, 3], [16, 72, 10], { mat: 'basalt' });
    m.cube('snout', [-6, 56, 10], [6, 68, 15], { mat: 'basalt' });
    for (const s of [-1, 1]) {
      m.cube(`eye_${s}`, [s < 0 ? -13 : 5, 64, 10.1], [s < 0 ? -5 : 13, 69, 10.6], { mat: 'fireGlow' });
      horn(m, `horn_${s}`, [[s * 17, 77, 8], [s * 28, 86, 7], [s * 34, 98, 5], [s * 32, 106, 3]], 4.5);
      m.cube(`fang_${s}`, [s * 7 - 1.5, 38, 12], [s * 7 + 1.5, 44, 14], { mat: 'bone' });
    }
    m.cube('throat', [-11, 36, 3.2], [11, 44, 4], { mat: 'fireGlow' });
    m.cube('jaw', [-15, 26, 3], [15, 36, 16], { mat: 'basalt' });
    m.cube('jaw_lip', [-12, 35.5, 12], [12, 37, 16.5], { mat: 'magma' });
    m.group('glow_1', undefined, { origin: [0, 40, 18] });
  }, { density: 1, glow: ['fireGlow', 'magma', 'runes'] }),

  obelisk: defineModel('obelisk', MATS, (m) => {
    // An obelisk of polished black stone on a stepped base, columns of runes glowing down each face.
    const ring = (y, h) => [[h, y, h], [h, y, -h], [-h, y, -h], [-h, y, h]];
    const half = (y) => 11 - (4 * (y - 12)) / 120;
    m.cube('base_1', [-20, 0, -20], [20, 6, 20], { mat: 'basalt' });
    m.cube('base_2', [-16, 6, -16], [16, 12, 16], { mat: 'basalt' });
    m.mesh('shaft', loft([ring(12, 11), ring(132, 7)], { capStart: false }), { mat: 'basalt' });
    m.cube('collar', [-8, 126, -8], [8, 131, 8], { mat: 'basalt' });
    m.mesh('tip', loft([ring(131, 7.5), ring(148, 0.01)], { capStart: false }), { mat: 'violetGlow' });
    [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(([nx, nz], i) => {
      const at = (y, s) => { const h = half(y) + 0.25; return nx ? [nx * h, y, s * (h - 2.5)] : [s * (h - 2.5), y, nz * h]; };
      overlay(m, `runes_${i + 1}`, [at(18, -1), at(18, 1), at(122, 1), at(122, -1)], [nx, 0, nz], 'runes', { u: nx ? 'z' : 'x', u0: -8, v0: 18, seed: 20 + i });
    });
    m.group('glow_1', undefined, { origin: [0, 110, 0] });
  }, { density: 2, glow: ['runes', 'violetGlow'] }),

  altar: defineModel('altar', MATS, (m) => {
    // A sacrificial altar of basalt, stained with old blood, runes glowing along its front, a stele behind it
    // with the cult's sigil and horns; a bowl, a curved knife, skulls and candles on it.
    m.cube('base', [-40, 0, -30], [40, 36, 6], { mat: 'basalt' });
    m.cube('top', [-44, 36, -33], [44, 44, 9], { mat: 'altarTop' });
    overlay(m, 'front_runes', [[-34, 13, 6.2], [34, 13, 6.2], [34, 22, 6.2], [-34, 22, 6.2]], [0, 0, 1], 'runes', { u: 'x', u0: -33, v0: 14, seed: 30 });
    m.cube('stele', [-24, 44, -35], [24, 150, -28], { mat: 'basalt' });
    overlay(m, 'stele_sigil', [[-20, 80, -27.8], [20, 80, -27.8], [20, 126, -27.8], [-20, 126, -27.8]], [0, 0, 1], 'sigil', { cx: 0, cy: 103, R: 12 });
    for (const s of [-1, 1]) horn(m, `stele_horn_${s}`, [[s * 20, 146, -31], [s * 30, 156, -31], [s * 36, 170, -30], [s * 33, 180, -29]], 4.5);
    m.mesh('bowl', revolve([[0, 0], [5, 0], [8, 3], [9, 6], [8, 6], [7, 3.5], [0, 3]], { sides: 8, mat: (i) => (i === 5 ? 'altarTop' : 'darkIron') }), { origin: [-6, 44, -6] });
    m.cube('knife_blade', [8, 44, -2], [26, 45, 1.5], { mat: 'iron', origin: [16, 44.5, 0], rotation: [0, 25, 0] });
    m.cube('knife_hilt', [26, 44, -1], [33, 46, 1], { mat: 'bone', origin: [16, 44.5, 0], rotation: [0, 25, 0] });
    skull(m, 'skull_1', [-28, 48, -18], { s: 9, rot: [0, 15, 0] });
    skull(m, 'skull_2', [30, 48, -20], { s: 8, rot: [-10, -25, 8] });
    candle(m, 1, [-38, 44, 2], 16, 1.8);
    candle(m, 2, [38, 44, 0], 11, 1.7);
    candle(m, 3, [18, 44, -26], 20, 1.9);
  }, { density: 1, glow: ['runes', 'sigil'] }),

  rune_circle: defineModel('rune_circle', MATS, (m) => {
    // A summoning circle laid in the floor in lines of violet light, candles at five of the star's points.
    m.cube('circle', [-68, 0.3, -68], [68, 0.5, 68], { mat: 'circle', faces: ['up'] });
    [0, 1, 3, 4, 6].forEach((k, i) => {
      const a = (k * 2 * Math.PI) / 7 - Math.PI / 2;
      candle(m, i + 1, [Math.cos(a) * 61, 0.5, Math.sin(a) * 61], 8 + rand(k, 3200) * 10, 1.7);
    });
    m.group('glow_1', undefined, { origin: [0, 8, 0] });
  }, { density: 2, glow: ['circle'] }),

  demon_statue: defineModel('demon_statue', MATS, (m) => {
    // A demon crouched on its plinth, wings folded, hands on its knees, horned head thrust forward, its eyes
    // aglow; its tail curls round the plinth. Runes glow along the plinth's face.
    m.cube('plinth', [-26, 0, -30], [26, 22, 16], { mat: 'basalt' });
    overlay(m, 'plinth_runes', [[-22, 7, 16.2], [22, 7, 16.2], [22, 16, 16.2], [-22, 16, 16.2]], [0, 0, 1], 'runes', { u: 'x', u0: -21, v0: 8, seed: 40 });
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'left' : 'right';
      m.cube(`foot_${side}`, [s < 0 ? -18 : 6, 22, 0], [s < 0 ? -6 : 18, 28, 14], { mat: 'basalt' });
      for (const t of [-1, 0, 1]) m.cube(`claw_${side}_${t}`, [s * 12 + t * 4 - 1, 22, 14], [s * 12 + t * 4 + 1, 25, 17], { mat: 'bone' });
      m.cube(`shin_${side}`, [s < 0 ? -17 : 8, 26, 1], [s < 0 ? -8 : 17, 46, 11], { mat: 'basalt' });
      m.mesh(`thigh_${side}`, tube([[s * 12.5, 44, 6], [s * 13, 38, -14]], { half: 5 }), { mat: 'basalt' });
      m.mesh(`arm_${side}`, tube([[s * 17, 68, -4], [s * 19, 56, 4], [s * 13, 47, 12]], { half: 3.6 }), { mat: 'basalt' });
      m.cube(`hand_${side}`, [s * 13 - 4, 43, 9], [s * 13 + 4, 48, 17], { mat: 'basalt' });
      m.mesh(`wing_${side}`, [facing([[s * 13, 70, -14], [s * 42, 110, -26], [s * 36, 58, -28], [s * 16, 48, -20]], [s * 0.3, 0.2, -1])], { mat: 'wing' });
      horn(m, `horn_${side}`, [[s * 7, 88, 5], [s * 14, 98, 2], [s * 16, 108, -8], [s * 13, 114, -16]], 3);
      m.cube(`eye_${side}`, [s < 0 ? -6.5 : 2.5, 83, 16], [s < 0 ? -2.5 : 6.5, 86, 16.6], { mat: 'fireGlow' });
    }
    m.mesh('torso', loft([[[14, 36, -2], [14, 36, -22], [-14, 36, -22], [-14, 36, -2]], [[17, 72, 8], [17, 72, -14], [-17, 72, -14], [-17, 72, 8]]]), { mat: 'basalt' });
    m.cube('head', [-9, 72, 0], [9, 90, 16], { mat: 'basalt' });
    m.cube('snout', [-5, 73, 14], [5, 81, 20], { mat: 'basalt' });
    for (const s of [-1, 1]) m.cube(`fang_${s}`, [s * 3 - 0.8, 71, 18], [s * 3 + 0.8, 74, 19.5], { mat: 'bone' });
    m.mesh('tail', tube([[0, 38, -20], [18, 28, -26], [28, 23, -8], [24, 23, 8], [14, 23, 13]], { half: (f) => 3 * (1 - f * 0.7) }), { mat: 'basalt' });
    m.group('glow_1', undefined, { origin: [0, 85, 20] });
  }, { density: 1, glow: ['runes', 'fireGlow'], double: ['wing'] }),

  demon_face: defineModel('demon_face', MATS, (m) => {
    // A demon's face carved in a round medallion on the wall, a ring of runes round it, its eyes and throat
    // aglow.
    m.mesh('medallion', revolve([[0, 0], [30, 0], [30, 3], [0, 3]], { sides: 16 }), { mat: 'basalt', origin: [0, 110, 0], rotation: [90, 0, 0] });
    overlay(m, 'rune_ring', [[-30, 80, 3.2], [30, 80, 3.2], [30, 140, 3.2], [-30, 140, 3.2]], [0, 0, 1], 'runeRing', { cx: 0, cy: 110 });
    m.cube('brow', [-14, 112, 3], [14, 120, 11], { mat: 'basalt' });
    m.cube('face', [-11, 92, 3], [11, 114, 9], { mat: 'basalt' });
    m.cube('nose', [-3.5, 102, 9], [3.5, 110, 13], { mat: 'basalt' });
    m.cube('throat', [-7, 94, 9], [7, 99, 9.6], { mat: 'fireGlow' });
    for (const s of [-1, 1]) {
      m.cube(`eye_${s}`, [s < 0 ? -8.5 : 3.5, 112, 11], [s < 0 ? -3.5 : 8.5, 115.5, 11.5], { mat: 'fireGlow' });
      m.cube(`fang_${s}`, [s * 5 - 1, 92, 8.5], [s * 5 + 1, 96, 10.5], { mat: 'bone' });
      horn(m, `horn_${s}`, [[s * 11, 118, 8], [s * 22, 126, 7], [s * 26, 138, 4], [s * 24, 146, 3]], 3.2);
    }
    m.group('glow_1', undefined, { origin: [0, 112, 16] });
  }, { density: 2, glow: ['runeRing', 'fireGlow'] }),

  cult_banner: defineModel('cult_banner', MATS, (m) => {
    // A black banner of the cult on an iron rod with horned finials, its sigil (an eye in a ring of rays) shining
    // violet, its hem in rags.
    const TOP = 162, BOT = 62, W = 22;
    m.mesh('rod', tube([[-29, TOP + 2, 6], [29, TOP + 2, 6]], { half: 1.2, sides: 6 }), { mat: 'darkIron' });
    for (const s of [-1, 1]) {
      horn(m, `finial_${s}`, [[s * 29, TOP + 2, 6], [s * 33, TOP + 5, 6], [s * 34, TOP + 10, 6]], 1.6, 'darkIron');
      m.cube(`bracket_${s}`, [s * 24 - 1.5, TOP, 0], [s * 24 + 1.5, TOP + 4, 7], { mat: 'darkIron' });
    }
    const cloth = (x0, x1, z0, z1) => facing([[x0, BOT - 14, z0], [x1, BOT - 14, z1], [x1, TOP, z1], [x0, TOP, z0]], [0, 0, 1]);
    m.mesh('cloth', [cloth(-W, 0, 4.5, 6.5), cloth(0, W, 6.5, 4.5)], { mat: 'cloth', info: { W, TOP, BOT } });
    overlay(m, 'sigil', [[-17, 108, 6.8], [17, 108, 6.8], [17, 142, 6.8], [-17, 142, 6.8]], [0, 0, 1], 'sigil', { cx: 0, cy: 125, R: 10 });
  }, { density: 2, double: ['cloth'], glow: ['sigil'] }),

  floor_brazier: defineModel('floor_brazier', MATS, (m) => {
    // A standing brazier of black iron: three legs curving up to a spiked bowl of coals burning violet.
    for (let k = 0; k < 3; k++) {
      m.mesh(`leg_${k + 1}`, tube([[0, 64, 0], [8, 40, 0], [13, 14, 0], [18, 0, 0]], { half: 1.6 }), { mat: 'darkIron', rotation: [0, k * 120, 0] });
    }
    m.mesh('ring', tube(Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2) * 11, 36, Math.sin((i / 8) * Math.PI * 2) * 11]), { half: 0.9, closed: true, side: [0, 1, 0] }), { mat: 'darkIron' });
    const profile = [[0, 0], [5, 0], [11, 4], [15, 10], [16, 13], [15, 13.5], [14, 11], [0, 10]];
    m.mesh('bowl', revolve(profile, { sides: 8, mat: (i) => (i === profile.length - 2 ? 'violetEmbers' : 'darkIron') }), { origin: [0, 62, 0] });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      m.mesh(`spike_${k + 1}`, tube([[Math.cos(a) * 15.5, 75, Math.sin(a) * 15.5], [Math.cos(a) * 18.5, 83, Math.sin(a) * 18.5]], { half: (f) => 1 - f * 0.85 }), { mat: 'darkIron' });
    }
    m.group('fire_1', undefined, { origin: [0, 73, 0] });
  }, { density: 2, glow: ['violetEmbers'] }),

  magma_crack: defineModel('magma_crack', MATS, (m) => {
    // Cracks in the floor with magma glowing in them, where it runs close beneath; the floor about them scorched.
    const segs = [];
    for (let k = 0; k < 5; k++) {
      let x = 0, z = 0, a = (k / 5) * Math.PI * 2 + rand(k, 3300);
      for (let s = 0; s < 5; s++) {
        a += (rand(k, s, 3301) - 0.5) * 1.2;
        const len = 7 + rand(k, s, 3302) * 7, nx = x + Math.cos(a) * len, nz = z + Math.sin(a) * len;
        segs.push([[x, z], [nx, nz], 1.6 * (1 - s / 5) + 0.3]);
        x = nx; z = nz;
      }
    }
    m.cube('scorch', [-58, 0.15, -58], [58, 0.3, 58], { mat: 'scorch', info: { R: 52 }, faces: ['up'] });
    m.cube('cracks', [-58, 0.35, -58], [58, 0.5, 58], { mat: 'magmaCrack', info: { segs }, faces: ['up'] });
    [[14, 6, 5], [-20, -12, 4], [4, -24, 3.5]].forEach(([x, z, s], i) => m.cube(`chunk_${i + 1}`, [x - s, 0, z - s], [x + s, s, z + s], { mat: 'crust', origin: [x, 0, z], rotation: [rand(i, 3303) * 20, rand(i, 3304) * 90, rand(i, 3305) * 20] }));
    m.group('glow_1', undefined, { origin: [0, 5, 0] });
  }, { density: 1, glow: ['magmaCrack'] }),

  skull_sconce: defineModel('skull_sconce', MATS, (m) => {
    // A horned skull on an iron bracket, its crown cut away to make a bowl for the fire, its sockets lit violet.
    m.cube('plate', [-5, -16, 0], [5, 6, 2], { mat: 'darkIron' });
    m.mesh('arm', tube([[0, -11, 2], [0, -11, 12], [0, -7, 16]], { half: 1 }), { mat: 'darkIron' });
    skull(m, 'skull', [0, -2, 16], { s: 13, eyes: 'violetGlow', open: true });
    m.mesh('coals', revolve([[0, 0], [4.8, 0], [4.8, 0.8], [0, 0.8]], { sides: 8 }), { mat: 'violetEmbers', origin: [0, -0.9, 16] });
    for (const s of [-1, 1]) horn(m, `horn_${s}`, [[s * 6, 2, 16], [s * 11, 4, 15], [s * 14, 10, 14], [s * 12, 15, 13]], 1.8, 'bone');
    m.group('flame', undefined, { origin: [0, 0, 16] });
  }, { density: 2, glow: ['violetGlow', 'violetEmbers'] }),
};
