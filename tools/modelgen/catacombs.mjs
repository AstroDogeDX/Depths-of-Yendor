// The Catacombs' props: the spike pits and grated walkways of its channels, and the tomb-and-jail
// decorations dungeon/decor.js sets about its rooms. Floor props: origin on the floor at the middle, front
// facing +z. Wall props: origin on the wall face at floor level, standing out from it along +z. The pits'
// floors lie 1.5 m below the floor (96 px); the vault is 2.8 m up (179 px).
import * as THREE from 'three';
import { defineModel, revolve, tube, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, patches, bevel } from './materials.mjs';
import { HALF, VAULT as TOP, prism, archPts, archSlices, bothFaces } from './doorkit.mjs';

const CAT_PAL = {
  bone: P('#3a3428', '#5a5140', '#7a705a', '#9a9076', '#b8ae94', '#d4ccb2'),
  stone: P('#1c1b19', '#2a2825', '#393633', '#494642', '#5a5752', '#6c6963'),
  dust: P('#23201b', '#332f28', '#443f36', '#57513f'),
  wax: P('#5a5040', '#857a5e', '#aea380', '#cdc29e', '#e6dcb8'),
  void: P('#030303', '#08080a', '#0e0e10'),
  blood: P('#1a0806', '#2e0e0a', '#44150f'),
  oak: P('#0e0a07', '#17110b', '#211810', '#2c2016', '#382a1c', '#453423', '#53402c'), // old oak, near black
};
const PIT = -96; // the floor of a spike pit
const VAULT = 179; // the ceiling

const shadeBone = (c, lift = 0) => ramp(CAT_PAL.bone, 0.5 + 0.18 * patches(c.p, 900, 0.6) + bevel(c, 0.15) + lift, c.ax, c.ay);

const MATS = {
  ...MAT,
  bone: (c) => shadeBone(c),
  // A skull: bone, with eye sockets and a nose hole on its face (`info.inv` takes a point into the skull's own
  // space, where it faces +z; `info.s` is its size).
  skull(c) {
    const { info } = c, s = info.s;
    const q = new THREE.Vector3(c.p.x, c.p.y, c.p.z).applyMatrix4(info.inv);
    const eye = ((Math.abs(q.x) - 0.24 * s) / (0.15 * s)) ** 2 + ((q.y - 0.18 * s) / (0.13 * s)) ** 2 < 1;
    const nose = Math.abs(q.x) < 0.07 * s && q.y > -0.14 * s && q.y < 0.03 * s;
    if (q.z > 0.28 * s && (eye || nose)) return ramp(CAT_PAL.void, 0.3, c.ax, c.ay);
    return shadeBone(c, 0.05);
  },
  // Rusty spikes, their tips darkened with old blood (`info.tip`: the height of the tip).
  spike(c) {
    if (c.info.tip && c.p.y > c.info.tip - 12 + noise3(c.p.x, c.p.y * 0.3, c.p.z, 905) * 6) return ramp(CAT_PAL.blood, 0.5 + 0.3 * patches(c.p, 906, 0.8), c.ax, c.ay);
    return MAT.rustyIron(c);
  },
  // Tomb stone, grey and dusty. `info.panel` grooves a panel round each large face; `info.carve(p)` cuts a
  // design into it.
  tomb(c) {
    const { p, info } = c;
    let v = 0.45 + 0.14 * patches(p, 910, 0.35) + bevel(c, 0.15);
    if (info.panel && Math.min(c.W, c.H) > 16 && c.edge > 3 && c.edge < 4.5) v = 0.15;
    if (info.carve && c.n.y > 0.7 && info.carve(p)) v = 0.14;
    if (info.dark && c.n.y > 0.7) return ramp(CAT_PAL.void, 0.4, c.ax, c.ay); // the dark inside an open coffin
    return ramp(CAT_PAL.stone, v, c.ax, c.ay);
  },
  niche: (c) => ramp(CAT_PAL.stone, 0.18 + 0.1 * patches(c.p, 912, 0.5), c.ax, c.ay), // the dark back of a niche
  dust: (c) => ramp(CAT_PAL.dust, 0.45 + 0.25 * patches(c.p, 915, 0.7), c.ax, c.ay),
  void: (c) => ramp(CAT_PAL.void, 0.3 + 0.3 * Math.max(0, c.p.y / 150), c.ax, c.ay),
  wax: (c) => ramp(CAT_PAL.wax, 0.5 + 0.1 * patches(c.p, 920, 1) + (c.n.y > 0.7 ? 0.2 : 0) + bevel(c, 0.1), c.ax, c.ay),
  wick: (c) => ramp(CAT_PAL.void, 0.6, c.ax, c.ay),
  // Iron grating: bars on a grid with holes you can see through (alpha 0), a solid rim round the edge.
  grating(c) {
    const { p, n, info } = c;
    if (Math.abs(n.y) < 0.5 || Math.abs(p.x) > info.hw - 4 || Math.abs(p.z) > info.hl - 4) return MAT.rustyIron(c);
    if (fract((p.x + 200) / 9) < 0.34 || fract((p.z + 200) / 9) < 0.34) return MAT.rustyIron(c);
    return [0, 0, 0, 0];
  },
  // --- The door (door_catacombs)
  // Old oak boards up the door, near black with age: dark seams between them, grain and the odd knot.
  oak(c) {
    const { p, n } = c;
    if (Math.abs(n.z) < 0.5) return ramp(CAT_PAL.oak, 0.34 + 0.12 * patches(p, 940, 0.5), c.ax, c.ay);
    const k = Math.floor((p.x + 52) / 17.34), f = fract((p.x + 52) / 17.34);
    if (f < 0.06) return ramp(CAT_PAL.oak, 0.02, c.ax, c.ay);
    let v = 0.44 + 0.16 * (rand(k, 941) - 0.5) + 0.1 * patches(p, 942, 0.3) + bevel(c, 0.1);
    if (fract(p.y * 0.07 + noise3(p.x * 0.4, p.y * 0.03, k, 943) * 0.9) < 0.14) v -= 0.14;
    if (rand(k, Math.floor(p.y / 13), 944) > 0.93 && fract(p.y / 13) < 0.3) v -= 0.2;
    return ramp(CAT_PAL.oak, v - Math.max(0, 22 - p.y) * 0.008, c.ax, c.ay);
  },
  // Black iron strap, rivets every 9 px along its middle (`info.y`).
  strap(c) {
    const { p, n, info } = c;
    if (Math.abs(n.z) > 0.5 && info.y !== undefined && Math.abs(p.y - info.y) < 1.1 && Math.abs(fract(p.x / 9) - 0.5) < 0.14) {
      return ramp(PAL.iron, p.y > info.y ? 0.75 : 0.55, c.ax, c.ay);
    }
    return ramp(PAL.iron, 0.2 + 0.14 * patches(p, 945, 0.4) + bevel(c, 0.2) - (rand(c.ax, c.ay, 946) > 0.96 ? 0.1 : 0), c.ax, c.ay);
  },
  // Dressed tomb stone, the blocks' own edges its joints.
  voussoir(c) {
    if (c.edge < 0.8 && Math.min(c.W, c.H) > 4) return ramp(CAT_PAL.stone, 0.12, c.ax, c.ay);
    return ramp(CAT_PAL.stone, 0.48 + 0.14 * patches(c.p, 947, 0.35) + 0.1 * (rand(c.info.block ?? 0, 948) - 0.5) + bevel(c, 0.15), c.ax, c.ay);
  },
  // Stone blocks laid in courses 21 px high, a block 32 px long, each course half a block along from the last.
  ashlar(c) {
    const { p, n } = c;
    const u = Math.abs(n.x) > 0.5 ? p.z : p.x;
    const row = Math.floor((p.y + 210) / 21), off = row % 2 ? 16 : 0;
    if (Math.abs(n.y) < 0.5 && (fract((p.y + 210) / 21) < 0.05 || fract((u + 320 + off) / 32) < 0.03)) return ramp(CAT_PAL.stone, 0.12, c.ax, c.ay);
    return ramp(CAT_PAL.stone, 0.46 + 0.12 * (rand(Math.floor((u + 320 + off) / 32), row, 949) - 0.5) + 0.12 * patches(p, 950, 0.35), c.ax, c.ay);
  },
  // A padlock's body: dark iron, a keyhole on its face at (`info.kx`, `info.ky`).
  lockIron(c) {
    const { p, n, info } = c;
    if (Math.abs(n.z) > 0.5 && (Math.hypot(p.x - info.kx, p.y - info.ky) < 1.3 || (Math.abs(p.x - info.kx) < 0.6 && p.y < info.ky && p.y > info.ky - 3.5))) {
      return ramp(CAT_PAL.void, 0.3, c.ax, c.ay);
    }
    return ramp(PAL.iron, 0.28 + 0.12 * patches(p, 951, 0.5) + bevel(c, 0.25), c.ax, c.ay);
  },
  // A chain lying across a face, painted on a strip facing ±z along a straight run (`info`: the run's start `a`
  // [x, y], its direction `d`, the strip's half-width `w`, and `off`, how far along the chain the run begins):
  // links alternate between a ring seen flat, open in the middle, and one seen edge-on, a bar (cut out).
  chainRun(c) {
    const { p, info } = c;
    const rx = p.x - info.a[0], ry = p.y - info.a[1];
    const v = rx * info.d[0] + ry * info.d[1] + info.off, u = Math.abs(ry * info.d[0] - rx * info.d[1]) / info.w;
    const k = Math.floor(v / 5), f = v / 5 - k;
    const iron = k % 2 === 0 ? u < 0.95 && (u > 0.42 || f < 0.2 || f > 0.8) : u < 0.32;
    return iron ? MAT.rustyIron(c) : [0, 0, 0, 0];
  },
  // A hanging chain, painted on two crossed strips: its links alternate between one seen flat (an open oval)
  // and one seen edge-on (a bar), the other way round on each strip.
  chain(c) {
    const { p, info } = c;
    const u = Math.abs((info.axis === 'x' ? p.x - info.cx : p.z - info.cz) / info.w), v = info.top - p.y;
    const k = Math.floor(v / 5), f = (v - k * 5) / 5;
    const flat = k % 2 === (info.axis === 'x' ? 0 : 1);
    const iron = flat ? u < 0.95 && (u > 0.45 || f < 0.22 || f > 0.78) : u < 0.3;
    return iron ? MAT.rustyIron(c) : [0, 0, 0, 0];
  },
};

// ---------------------------------------------------------------- shared parts

/** A skull `s` pixels across at `at`, turned by `rot` (degrees, as Blockbench rotations), facing +z. */
function skull(m, name, at, { s = 9, rot = [0, 0, 0] } = {}) {
  const inv = new THREE.Matrix4().compose(new THREE.Vector3(...at),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot.map((d) => (d * Math.PI) / 180), 'ZYX')), new THREE.Vector3(1, 1, 1)).invert();
  m.mesh(`${name}_cranium`, revolve([[0, -0.25 * s], [0.45 * s, -0.3 * s], [0.58 * s, 0.05 * s], [0.6 * s, 0.35 * s], [0.45 * s, 0.62 * s], [0, 0.72 * s]], { sides: 8 }),
    { mat: 'skull', origin: at, rotation: rot, info: { inv, s } });
  m.cube(`${name}_jaw`, [at[0] - 0.28 * s, at[1] - 0.5 * s, at[2] + 0.05 * s], [at[0] + 0.28 * s, at[1] - 0.24 * s, at[2] + 0.5 * s], { mat: 'bone', origin: at, rotation: rot });
}

/** A bone from `a` to `b`, knobbed at each end. */
function bone(m, name, a, b, r = 1.4) {
  m.mesh(name, tube([a, b], { half: r }), { mat: 'bone' });
  [a, b].forEach((e, k) => m.cube(`${name}_knob_${k + 1}`, e.map((v) => v - r * 1.45), e.map((v) => v + r * 1.45), { mat: 'bone' }));
}

/** A chain hanging straight down from `top` to height `bottom`, `w` pixels either side of its middle. */
function chain(m, name, top, bottom, w = 2.5) {
  const [x, y0, z] = top;
  m.mesh(`${name}_a`, [{ pts: [[x - w, bottom, z], [x + w, bottom, z], [x + w, y0, z], [x - w, y0, z]] }], { mat: 'chain', info: { cx: x, cz: z, axis: 'x', top: y0, w } });
  m.mesh(`${name}_b`, [{ pts: [[x, bottom, z - w], [x, bottom, z + w], [x, y0, z + w], [x, y0, z - w]] }], { mat: 'chain', info: { cx: x, cz: z, axis: 'z', top: y0, w } });
}

/** A ring of iron bar: `n` points round a circle of radius r about `at`, in the plane square to `normal`. */
function ring(m, name, at, r, { n = 8, half = 1, normal = 'y', mat = 'rustyIron' } = {}) {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
    return normal === 'y' ? [at[0] + c, at[1], at[2] + s] : normal === 'z' ? [at[0] + c, at[1] + s, at[2]] : [at[0], at[1] + s, at[2] + c];
  });
  m.mesh(name, tube(pts, { half, closed: true, side: normal === 'y' ? [0, 1, 0] : normal === 'z' ? [0, 0, 1] : [1, 0, 0] }), { mat });
}

/** A candle, `h` tall, its wick marked by an anchor group candle_`i` for the game's flame. */
function candle(m, i, at, h, r = 2) {
  const [x, y, z] = at;
  m.mesh(`candle_${i}_wax`, revolve([[0, 0], [r * 1.25, 0], [r * 1.1, 1.5], [r, 3], [r, h], [0, h]], { sides: 6 }), { mat: 'wax', origin: at });
  m.cube(`candle_${i}_wick`, [x - 0.4, y + h, z - 0.4], [x + 0.4, y + h + 1.6, z + 0.4], { mat: 'wick' });
  m.group(`candle_${i}`, undefined, { origin: [x, y + h + 1.2, z] });
}

/** A polygon wound so it faces `out`. */
function facing(pts, out) {
  const [a, b, c] = pts;
  const u = b.map((v, i) => v - a[i]), w = c.map((v, i) => v - a[i]);
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  return { pts: n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? pts : [...pts].reverse() };
}

// ---------------------------------------------------------------- props

export const catacombs = {
  spike_pit: defineModel('spike_pit', MATS, (m) => {
    // One tile's worth of a pit's floor: rusted spikes, the bones of those who fell, and a skull left on a
    // spike's point.
    let n = 0, impale = null;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      if (rand(i, j, 930) < 0.25) continue;
      const x = -48 + i * 32 + (rand(i, j, 931) - 0.5) * 18, z = -48 + j * 32 + (rand(i, j, 932) - 0.5) * 18;
      const h = 30 + rand(i, j, 933) * 18, tilt = [(rand(i, j, 934) - 0.5) * 16, 0, (rand(i, j, 935) - 0.5) * 16];
      m.mesh(`spike_${++n}`, revolve([[0, 0], [2.8, 0], [1.9, h * 0.45], [0, h]], { sides: 4 }), { mat: 'spike', origin: [x, PIT, z], rotation: tilt, info: { tip: PIT + h } });
      if (!impale && i === 1 && j === 2) impale = [x, PIT + h - 4, z];
    }
    bone(m, 'bone_1', [-30, PIT + 1.6, -10], [-8, PIT + 1.6, 6]);
    bone(m, 'bone_2', [14, PIT + 1.6, -34], [30, PIT + 1.6, -20]);
    bone(m, 'bone_3', [20, PIT + 1.6, 26], [36, PIT + 1.6, 40], 1.2);
    bone(m, 'bone_4', [-40, PIT + 1.6, 30], [-26, PIT + 1.6, 44], 1.2);
    skull(m, 'skull_floor', [8, PIT + 4, 6], { s: 9, rot: [-20, 40, 70] });
    if (impale) skull(m, 'skull_spiked', impale, { s: 9, rot: [15, -30, 10] });
  }, { density: 1 }),

  grate_bridge: defineModel('grate_bridge', MATS, (m) => {
    // An iron walkway across a pit (2 m across, running along z): open grating on a frame, with railings.
    const L = 78, Wd = 58;
    m.cube('deck', [-Wd, -2, -L], [Wd, 0, L], { mat: 'grating', info: { hw: Wd, hl: L } });
    for (const x of [-Wd + 2, Wd - 2]) m.cube(`stringer_${x < 0 ? 'left' : 'right'}`, [x - 3, -8, -L], [x + 3, 0, L], { mat: 'rustyIron' });
    for (const z of [-L + 4, 0, L - 4]) m.cube(`crossbeam_${z < 0 ? 'near' : z > 0 ? 'far' : 'mid'}`, [-Wd, -7, z - 2], [Wd, -2, z + 2], { mat: 'rustyIron' });
    for (const x of [-Wd + 2, Wd - 2]) {
      const s = x < 0 ? 'left' : 'right';
      for (const z of [-70, 0, 70]) m.cube(`post_${s}_${z < 0 ? 'near' : z > 0 ? 'far' : 'mid'}`, [x - 1.5, 0, z - 1.5], [x + 1.5, 52, z + 1.5], { mat: 'rustyIron' });
      m.cube(`rail_${s}`, [x - 1.5, 49, -72], [x + 1.5, 52, 72], { mat: 'rustyIron' });
      m.cube(`midrail_${s}`, [x - 1, 24, -70], [x + 1, 26, 70], { mat: 'rustyIron' });
    }
  }, { density: 1 }),

  cell_door: defineModel('cell_door', MATS, (m) => {
    // A cell let into the wall: a barred iron door in a heavy stone frame, darkness beyond.
    m.mesh('cell', [facing([[-44, 3, 0.4], [44, 3, 0.4], [44, 150, 0.4], [-44, 150, 0.4]], [0, 0, 1])], { mat: 'void' });
    m.cube('jamb_left', [-57, 0, 0], [-44, 150, 10], { mat: 'tomb' });
    m.cube('jamb_right', [44, 0, 0], [57, 150, 10], { mat: 'tomb' });
    m.cube('lintel', [-60, 150, 0], [60, 166, 12], { mat: 'tomb' });
    m.cube('threshold', [-44, 0, 0], [44, 3, 10], { mat: 'tomb' });
    for (let k = 0; k < 9; k++) {
      const x = -38 + k * 9.5;
      m.cube(`bar_${k + 1}`, [x - 1.4, 3, 4], [x + 1.4, 150, 6.8], { mat: 'rustyIron' });
    }
    for (const y of [14, 78, 140]) m.cube(`strap_${y}`, [-44, y - 2.5, 3.5], [44, y + 2.5, 7.6], { mat: 'rustyIron' });
    m.cube('lock', [25, 66, 7.6], [36, 84, 10.5], { mat: 'rustyIron' });
    for (const y of [30, 122]) m.cube(`hinge_${y}`, [-50, y - 4, 3], [-38, y + 4, 8], { mat: 'rustyIron' });
  }, { density: 1 }),

  wall_niches: defineModel('wall_niches', MATS, (m) => {
    // Burial niches built out from the wall, two rows of two, holding skulls, bones and a pair of candles.
    const D = 18;
    m.cube('back', [-56, 8, 0], [56, 104, 3], { mat: 'niche' });
    m.cube('base', [-56, 0, 0], [56, 24, D], { mat: 'tomb' });
    m.cube('shelf', [-56, 52, 0], [56, 62, D], { mat: 'tomb' });
    m.cube('top', [-56, 90, 0], [56, 104, D], { mat: 'tomb' });
    m.cube('cornice', [-60, 104, 0], [60, 111, D + 3], { mat: 'tomb' });
    for (const [x0, x1, s] of [[-56, -50, 'left'], [-3, 3, 'middle'], [50, 56, 'right']]) m.cube(`post_${s}`, [x0, 24, 0], [x1, 90, D], { mat: 'tomb' });
    // Lower left: a skull before two long bones.
    bone(m, 'bone_1', [-46, 25.6, 7], [-8, 25.6, 7]);
    skull(m, 'skull_1', [-26, 29, 11], { s: 10, rot: [0, 8, 0] });
    // Lower right: a stack of bones, a skull on top.
    for (let k = 0; k < 4; k++) bone(m, `bone_${k + 2}`, [8, 25.6 + k * 3, 6 + (k % 2) * 5], [46, 25.6 + k * 3, 6 + (k % 2) * 5], 1.3);
    skull(m, 'skull_2', [30, 41, 10], { s: 9, rot: [-6, -12, 4] });
    // Upper left: two skulls side by side.
    skull(m, 'skull_3', [-36, 67, 10], { s: 9, rot: [0, 18, 0] });
    skull(m, 'skull_4', [-16, 67, 10], { s: 9, rot: [0, -14, 6] });
    // Upper right: a skull and two candles.
    skull(m, 'skull_5', [34, 67, 9], { s: 9, rot: [0, -20, 0] });
    candle(m, 1, [14, 62, 11], 12, 1.8);
    candle(m, 2, [20, 62, 7], 8, 1.6);
  }, { density: 1 }),

  shackles: defineModel('shackles', MATS, (m) => {
    // Two chains from iron plates in the wall, open manacles at their ends.
    for (const x of [-26, 26]) {
      const s = x < 0 ? 'left' : 'right';
      m.cube(`plate_${s}`, [x - 5, 106, 0], [x + 5, 118, 2.5], { mat: 'rustyIron' });
      ring(m, `staple_${s}`, [x, 110, 4], 3, { normal: 'x', half: 0.9, n: 6 });
      chain(m, `chain_${s}`, [x, 108, 5], 74);
      ring(m, `manacle_${s}`, [x, 71, 5], 4.5, { half: 1.2 });
    }
  }, { density: 1, double: ['chain'] }),

  chained_skeleton: defineModel('chained_skeleton', MATS, (m) => {
    // A prisoner who never left: a skeleton slumped against the wall, its wrists still in the manacles.
    for (const x of [-26, 26]) {
      const s = x < 0 ? 'left' : 'right', sx = Math.sign(x);
      m.cube(`plate_${s}`, [x - 5, 106, 0], [x + 5, 118, 2.5], { mat: 'rustyIron' });
      ring(m, `staple_${s}`, [x, 110, 4], 3, { normal: 'x', half: 0.9, n: 6 });
      chain(m, `chain_${s}`, [x, 108, 5], 82);
      ring(m, `manacle_${s}`, [x, 79, 6], 4, { half: 1.2 });
      // Arm: shoulder, elbow, wrist in the manacle.
      bone(m, `humerus_${s}`, [sx * 10, 44, 8], [sx * 19, 60, 11], 1.6);
      bone(m, `forearm_${s}`, [sx * 19, 60, 11], [x, 78, 6], 1.3);
      // Leg: hip, knee drawn up a little, foot.
      bone(m, `femur_${s}`, [sx * 5, 8, 16], [sx * 9, 17, 44], 1.8);
      bone(m, `shin_${s}`, [sx * 9, 17, 44], [sx * 10, 3, 66], 1.5);
      m.cube(`foot_${s}`, [sx * 10 - 3, 0, 64], [sx * 10 + 3, 4, 74], { mat: 'bone' });
      // Ribs: arcs from the spine round to the front.
      for (const [k, y] of [30, 35, 40].entries()) {
        m.mesh(`rib_${s}_${k + 1}`, tube([[sx * 1.5, y, 7], [sx * 8, y - 1, 9], [sx * 8.5, y - 2.5, 15], [sx * 3, y - 3.5, 18]], { half: 0.9 }), { mat: 'bone' });
      }
    }
    m.cube('pelvis', [-9, 5, 9], [9, 13, 21], { mat: 'bone' });
    m.mesh('spine', tube([[0, 10, 14], [0, 28, 9], [0, 46, 6]], { half: 1.8 }), { mat: 'bone' });
    m.cube('shoulders', [-11, 43, 5], [11, 47, 10], { mat: 'bone' });
    skull(m, 'skull', [2, 54, 12], { s: 10, rot: [28, 12, 10] });
  }, { density: 1, double: ['chain'] }),

  bone_pile: defineModel('bone_pile', MATS, (m) => {
    // A heap of bones and skulls in the dust.
    m.mesh('mound', revolve([[0, 0], [30, 0], [24, 5], [14, 10], [0, 12]], { sides: 7 }), { mat: 'dust' });
    for (let i = 0; i < 10; i++) {
      const a = rand(i, 940) * Math.PI * 2, r = 4 + rand(i, 941) * 20, y = 12 - (r / 30) * 10;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, t = rand(i, 942) * Math.PI, len = 8 + rand(i, 943) * 8;
      bone(m, `bone_${i + 1}`, [x - Math.cos(t) * len / 2, y + 1, z - Math.sin(t) * len / 2], [x + Math.cos(t) * len / 2, y + 1 + (rand(i, 944) - 0.5) * 4, z + Math.sin(t) * len / 2], 1.2);
    }
    skull(m, 'skull_1', [2, 15, 2], { s: 9, rot: [-10, 20, 0] });
    skull(m, 'skull_2', [-14, 9, 10], { s: 8, rot: [5, -40, 20] });
    skull(m, 'skull_3', [15, 8, -8], { s: 8, rot: [-30, 160, -10] });
  }, { density: 1 }),

  sarcophagus: defineModel('sarcophagus', MATS, (m) => {
    // A stone coffin along the wall, its lid pushed askew to show the dark inside.
    m.cube('plinth', [-57, 0, -25], [57, 5, 25], { mat: 'tomb' });
    m.cube('chest', [-54, 5, -22], [54, 34, 22], { mat: 'tomb', info: { panel: true } });
    m.cube('inside', [-50, 33.5, -18], [50, 34.2, 18], { mat: 'tomb', info: { dark: true }, faces: ['up'] });
    const cross = (p) => (Math.abs(p.z) < 2.5 && Math.abs(p.x - 16) < 30) || (Math.abs(p.x - 2) < 2.5 && Math.abs(p.z) < 13);
    m.cube('lid', [-44, 34, -23], [68, 42, 23], { mat: 'tomb', origin: [12, 38, 0], rotation: [0, -12, 0], info: { carve: cross } });
  }, { density: 1 }),

  hanging_cage: defineModel('hanging_cage', MATS, (m) => {
    // A gibbet cage on a chain from the vault, bones in the bottom of it.
    const R = 20, B = 46, T = 128;
    chain(m, 'chain', [0, VAULT, 0], 150);
    ring(m, 'hook', [0, 150, 0], 3, { normal: 'z', n: 6, half: 1 });
    for (const [k, y] of [B, (B + T) / 2, T].entries()) ring(m, `band_${k + 1}`, [0, y, 0], R, { half: 1.2 });
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R;
      m.cube(`bar_${i + 1}`, [x - 1, B, z - 1], [x + 1, T, z + 1], { mat: 'rustyIron' });
      m.mesh(`dome_${i + 1}`, tube([[x, T, z], [x * 0.35, T + 14, z * 0.35], [0, 148, 0]], { half: 1 }), { mat: 'rustyIron' });
    }
    for (const a of [0, 90]) m.cube(`floor_bar_${a}`, [-R, B - 1, -1.5], [R, B + 1, 1.5], { mat: 'rustyIron', origin: [0, B, 0], rotation: [0, a, 0] });
    skull(m, 'skull', [-4, B + 5, 3], { s: 9, rot: [-15, 50, 25] });
    bone(m, 'bone_1', [-12, B + 2, -8], [10, B + 2, -2], 1.3);
    bone(m, 'bone_2', [2, B + 2, 10], [12, B + 3, -8], 1.2);
  }, { density: 1, double: ['chain'] }),

  candles: defineModel('candles', MATS, (m) => {
    // A cluster of candles on a pool of old wax.
    m.mesh('pool', revolve([[0, 0], [13, 0], [12, 0.8], [0, 1.2]], { sides: 8 }), { mat: 'wax' });
    [[0, 0, 22, 2.4], [7, -4, 15, 2], [-6, 3, 12, 2], [3, 7, 9, 1.8], [-4, -7, 17, 2.1]].forEach(([x, z, h, r], i) => candle(m, i + 1, [x, 1, z], h, r));
  }, { density: 2 }),

  grave_slab: defineModel('grave_slab', MATS, (m) => {
    // A grave slab set in the floor: a carved border, a cross, and lines of worn inscription.
    const carve = (p) => {
      if (Math.abs(p.x) > 25 || Math.abs(p.z) > 45) return true; // the border's groove...
      if (Math.abs(p.x) > 23.5 || Math.abs(p.z) > 43.5) return false; // ...and the stone inside it
      if ((Math.abs(p.x) < 2.2 && p.z > -38 && p.z < -4) || (Math.abs(p.z + 26) < 2.2 && Math.abs(p.x) < 11)) return true; // cross
      return [8, 16, 24, 32].some((row) => Math.abs(p.z - row) < 1 && Math.abs(p.x) < 18 - (row === 32 ? 8 : 0) && fract((p.x + 40) / 4.5) < 0.6);
    };
    m.cube('slab', [-28, 0, -48], [28, 1.2, 48], { mat: 'tomb', info: { carve: (p) => carve(p) && Math.abs(p.x) < 26.5 && Math.abs(p.z) < 46.5 }, faces: ['up', 'north', 'south', 'east', 'west'] });
  }, { density: 1 }),

  door_catacombs: defineModel('door_catacombs', MATS, (m) => {
    // A tall door of old oak boards under a round stone arch, a skull carved on the keystone either side (see
    // doorkit.mjs for how doors go together). Three black iron straps cross it from the hinges, ending in spear
    // points, with studs between them and a heavy ring to pull it by. Locked, a chain sags across it from a
    // staple in the jamb to a hasp over the latch, padlocked, on both sides.
    const OW = 53, SPRING = 124, RISE = 28, BACK = 40; // the opening, where its arch springs, and the arch's rise inside and out
    const zs = (s, a, b) => (s > 0 ? [a, b] : [-b, -a]); // a to b out from the middle, on the side s faces
    m.group('frame', () => {
      for (const s of [-1, 1]) m.cube(`jamb_${s < 0 ? 'left' : 'right'}`, [s < 0 ? -HALF : OW, 0, -18], [s < 0 ? -OW : HALF, SPRING, 18], { mat: 'ashlar' });
      m.cube('step', [-OW, 0, -18], [OW, 2, 18], { mat: 'voussoir', info: { block: 40 } });
      // Nine voussoirs between the curve over the opening and the arch's back, the keystone standing proud; the
      // wall above them, up to the vault.
      const N = 9, inner = archPts(OW, SPRING, RISE, N), outer = archPts(HALF, SPRING, BACK, N);
      for (let i = 0; i < N; i++) {
        const key = i === (N - 1) / 2, lift = key ? 6 : 0, d = key ? 21 : 18;
        const block = [inner[i], [outer[i][0], outer[i][1] + lift], [outer[i + 1][0], outer[i + 1][1] + lift], inner[i + 1]];
        m.mesh(`voussoir_${i + 1}`, prism(block, -d, d), { mat: 'voussoir', info: { block: i } });
        m.mesh(`spandrel_${i + 1}`, prism([outer[i], [outer[i][0], TOP], [outer[i + 1][0], TOP], outer[i + 1]], -16, 16), { mat: 'ashlar' });
      }
      bothFaces((s) => skull(m, `keystone_skull_${s > 0 ? 'front' : 'back'}`, [0, SPRING + RISE + 8, s * 21.5], { s: 10, rot: s > 0 ? [0, 0, 0] : [0, 180, 0] }));
    });
    m.group('leaf', () => {
      m.cube('boards', [-OW + 1, 1.5, -4], [OW - 1, SPRING, 4], { mat: 'oak' });
      archSlices(OW - 1, SPRING, RISE - 1, 12, SPRING).forEach((slice, i) => m.mesh(`boards_top_${i + 1}`, prism(slice, -4, 4), { mat: 'oak' }));
      bothFaces((s) => {
        const side = s > 0 ? 'front' : 'back', [z0, z1] = zs(s, 4, 5.6), [t0, t1] = zs(s, 4, 5.2);
        [18, 62, 106].forEach((y, i) => m.mesh(`strap_${i + 1}_${side}`,
          prism([[-OW + 1, y], [26, y], [34, y + 3.5], [26, y + 7], [-OW + 1, y + 7]], z0, z1), { mat: 'strap', info: { y: y + 3.5 } }));
        for (const y of [42, 86]) for (let k = 0; k < 6; k++) {
          const x = -OW + 1 + 17.33 * (k + 0.5);
          m.cube(`stud_${y}_${k + 1}_${side}`, [x - 1.3, y - 1.3, t0], [x + 1.3, y + 1.3, t1], { mat: 'strap' });
        }
        const [b0, b1] = zs(s, 4, 6.2);
        m.cube(`ring_boss_${side}`, [33, 73, b0], [39, 79, b1], { mat: 'strap' });
        ring(m, `ring_${side}`, [36, 67, s * 6.6], 6.5, { n: 10, half: 1.2, normal: 'z' });
      });
      for (const y of [16, 60, 104]) m.mesh(`pintle_${y}`, revolve([[0, 0], [2.6, 0], [2.6, 11], [0, 11]], { sides: 6 }), { mat: 'strap', origin: [-OW, y, 0] });
    }, { origin: [-OW, 0, 0] });
    m.group('lock', () => {
      bothFaces((s) => {
        const side = s > 0 ? 'front' : 'back', [h0, h1] = zs(s, 5.6, 7.4), [b0, b1] = zs(s, 7.4, 12);
        m.cube(`hasp_${side}`, [34, 76, h0], [62, 82, h1], { mat: 'strap' });
        m.cube(`padlock_${side}`, [40, 58, b0], [51, 70, b1], { mat: 'lockIron', info: { kx: 45.5, ky: 64 } });
        m.mesh(`shackle_${side}`, tube([[42, 69, s * 9.6], [42, 75, s * 9.6], [45.5, 78, s * 9.6], [49, 75, s * 9.6], [49, 69, s * 9.6]], { half: 1, side: [0, 0, 1] }), { mat: 'rustyIron' });
        m.mesh(`staple_${side}`, tube([[-61, 77, s * 18], [-61, 83, s * 20], [-55, 83, s * 20], [-55, 77, s * 18]], { half: 1, side: [0, 0, 1] }), { mat: 'rustyIron' });
        // The chain, sagging from the staple to the shackle in straight runs.
        const A = [-58, 80, 19], B = [45.5, 76, 9.6], runs = 10, w = 2.2;
        const pt = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - 22 * 4 * t * (1 - t), s * (A[2] + (B[2] - A[2]) * t)];
        let off = 0;
        for (let j = 0; j < runs; j++) {
          const a = pt(j / runs), b = pt((j + 1) / runs), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], nx = -d[1] * w, ny = d[0] * w;
          const quad = [[a[0] - nx, a[1] - ny, a[2]], [b[0] - nx, b[1] - ny, b[2]], [b[0] + nx, b[1] + ny, b[2]], [a[0] + nx, a[1] + ny, a[2]]];
          m.mesh(`chain_${j + 1}_${side}`, [facing(quad, [0, 0, s])], { mat: 'chainRun', info: { a: [a[0], a[1]], d, w, off } });
          off += len;
        }
      });
    });
  }, { density: 1 }),
};
