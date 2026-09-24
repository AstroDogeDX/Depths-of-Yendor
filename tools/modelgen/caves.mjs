// The Caves' props: the rope bridges over its chasms, its wall lights, and the decorations dungeon/decor.js
// sets about its rooms (what the miners left, and what the rock grew). Floor props: origin on the floor at
// the middle, front facing +z. Wall props: origin on the wall face at floor level, standing out along +z. Wall
// lights: origin on the wall 1.85 m up, with an empty "flame" group where the fire burns. The vault is 2.8 m up
// (179 px).
import { defineModel, loft, revolve, tube, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, patches, bevel } from './materials.mjs';

const CAVE_PAL = {
  rock: P('#1e1a15', '#2c261f', '#3b332a', '#4b4136', '#5c5042', '#6e604f'),
  limestone: P('#3a342a', '#554c3e', '#716552', '#8e8168', '#a99b80', '#c2b498'),
  oldWood: P('#221b13', '#322819', '#443624', '#56452f', '#69553b', '#7c6647'),
  rope: P('#3a2c18', '#57442a', '#76603c', '#937a4e'),
  cloth: P('#140e08', '#22180e', '#322416', '#433220'),
  copper: P('#3a1a0c', '#5e2c14', '#86421e', '#a85a2a', '#c8783c'),
  crystal: P('#0c3a4a', '#146a80', '#22a0b8', '#50d0e8', '#a8f4ff'),
};
const VAULT = 179;

const MATS = {
  ...MAT,
  rock: (c) => ramp(CAVE_PAL.rock, 0.45 + 0.2 * patches(c.p, 1000, 0.4) + bevel(c, 0.15) + 0.1 * c.n.y, c.ax, c.ay),
  // Limestone grown drip by drip: faint rings, a wet sheen on the upper faces.
  limestone(c) {
    let v = 0.5 + 0.14 * patches(c.p, 1010, 0.3) + (fract(c.p.y * 0.18 + noise3(c.p.x * 0.2, 0, c.p.z * 0.2, 1011) * 0.5) < 0.2 ? -0.1 : 0);
    if (rand(c.ax, c.ay, 1012) > 0.95) v += 0.25;
    return ramp(CAVE_PAL.limestone, v + 0.08 * c.n.y, c.ax, c.ay);
  },
  // Old grey timber, grain running along `info.along` (default up).
  timber(c) {
    const { p, info } = c;
    const a = p[info.along ?? 'y'];
    let v = 0.45 + 0.15 * patches(p, 1020, 0.25) + bevel(c, 0.15);
    if (fract(a * 0.12 + noise3(p.x * 0.3, p.y * 0.05, p.z * 0.3, 1021) * 0.8) < 0.12) v -= 0.14; // grain
    return ramp(CAVE_PAL.oldWood, v, c.ax, c.ay);
  },
  rope: (c) => ramp(CAVE_PAL.rope, fract((c.p.x + c.p.y + c.p.z) * 0.6) < 0.4 ? 0.3 : 0.65, c.ax, c.ay),
  cloth: (c) => ramp(CAVE_PAL.cloth, 0.5 + (fract(c.p.y * 0.7) < 0.3 ? -0.25 : 0.1) + 0.1 * patches(c.p, 1030, 1), c.ax, c.ay),
  // Rock seamed with ore: gold and copper specks catching the light.
  oreRock(c) {
    const o = noise3(c.p.x * 0.45, c.p.y * 0.45, c.p.z * 0.45, 1040);
    if (o > 0.69) return ramp(PAL.gold, 0.6 + 0.4 * (rand(c.ax, c.ay, 1041) > 0.65 ? 1 : 0) + 0.1 * c.n.y, c.ax, c.ay);
    if (o < 0.2) return ramp(CAVE_PAL.copper, 0.5 + 0.2 * patches(c.p, 1042, 0.8), c.ax, c.ay);
    return MATS.rock(c);
  },
  gold: (c) => ramp(PAL.gold, 0.55 + 0.3 * Math.max(0, c.n.y) + bevel(c, 0.2), c.ax, c.ay),
  // Emissive: crystals lit from within, each face its own shade.
  crystal(c) {
    const { n } = c;
    let v = 0.18 + 0.72 * Math.max(0, n.x * 0.35 + n.y * 0.6 + n.z * 0.72);
    if (c.edge < 1 && Math.min(c.W, c.H) > 3) v += 0.22; // bright edges
    if (rand(c.ax, c.ay, 1031) > 0.93) v += 0.15;
    return ramp(CAVE_PAL.crystal, v, c.ax, c.ay);
  },
  // Cart boards, run lengthways, with iron at the corners.
  cartWood(c) {
    const { p, info } = c;
    if (Math.abs(p.x) > info.corner(p.y) - 3) return MAT.rustyIron(c);
    let v = 0.45 + 0.15 * (rand(Math.floor(p.y / 6), 1050) - 0.5) + 0.1 * patches(p, 1051, 0.3);
    if (fract(p.y / 6) < 0.12) v = 0.15;
    return ramp(CAVE_PAL.oldWood, v, c.ax, c.ay);
  },
  // A wooden bucket: staves, hooped in iron.
  bucket(c) {
    if ([2, 10].some((y) => Math.abs(c.p.y - y) < 1)) return MAT.rustyIron(c);
    const k = Math.floor((Math.atan2(c.p.z - c.info.cz, c.p.x - c.info.cx) / (2 * Math.PI) + 1) * 10);
    return ramp(CAVE_PAL.oldWood, 0.45 + 0.2 * (rand(k, 1060) - 0.5), c.ax, c.ay);
  },
};

/** A lump of rock (`r` across) on the end of an axis `h` long, as revolve() makes it; `k` roughens it. */
const lump = (r, h, k = 0) => revolve([[0, 0], [r, 0], [r * (0.85 + k), h * 0.45], [r * (0.45 - k * 0.5), h * 0.85], [0, h]], { sides: 6 });

export const caves = {
  rope_bridge: defineModel('rope_bridge', MATS, (m) => {
    // Planks lashed to ropes across a chasm (2 m, along z), sagging in the middle, a few gone, with a hand rope
    // either side strung from posts on the banks.
    const L = 76, Wd = 44, sag = 7;
    const down = (z) => -sag * Math.max(0, 1 - (z / 62) ** 2);
    const along = (x, y0, dy) => Array.from({ length: 13 }, (_, i) => { const z = -L + (i * 2 * L) / 12; return [x, y0 + down(z) * dy, z]; });
    for (let i = 0, z = -72; z <= 72; i++, z += 9) {
      if (i === 5 || i === 11) continue; // missing
      const r = (k) => rand(i, k, 1100) - 0.5, len = Wd - 3 - rand(i, 1101) * 6;
      m.cube(`plank_${i + 1}`, [-len + r(2) * 4, down(z) - 3, z - 3.5], [len + r(2) * 4, down(z), z + 3.5],
        { mat: 'timber', info: { along: 'x' }, origin: [0, down(z) - 1.5, z], rotation: [r(3) * 6, r(4) * 8, r(5) * 7] });
    }
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'left' : 'right', x = s * (Wd - 5);
      m.mesh(`deck_rope_${side}`, tube(along(x, -3.5, 1), { half: 0.9 }), { mat: 'rope' });
      m.mesh(`hand_rope_${side}`, tube(along(s * (Wd + 1), 50, 2.2), { half: 1 }), { mat: 'rope' });
      for (const z of [-L + 2, L - 2]) {
        m.cube(`post_${side}_${z < 0 ? 'near' : 'far'}`, [s * (Wd + 1) - 2.5, -4, z - 2.5], [s * (Wd + 1) + 2.5, 56, z + 2.5],
          { mat: 'timber', origin: [s * (Wd + 1), 0, z], rotation: [0, 0, s * 6] });
      }
      for (const z of [-44, -18, 18, 44]) {
        m.mesh(`tie_${side}_${z}`, tube([[x, down(z) - 2, z], [s * (Wd + 1), 50 + down(z) * 2.2, z]], { half: 0.5 }), { mat: 'rope' });
      }
    }
  }, { density: 1 }),

  wall_torch: defineModel('wall_torch', MATS, (m) => {
    // A torch in an iron bracket braced against the rock, leaning out from the wall.
    m.cube('plate', [-4, -9, 0], [4, 9, 2], { mat: 'rustyIron' });
    m.mesh('arm', tube([[0, -6, 2], [0, -4, 7], [0, -1, 11]], { half: 1.2 }), { mat: 'rustyIron' });
    m.mesh('cup', tube(Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * Math.PI * 2) * 3.4, 0, 11.5 + Math.sin((i / 6) * Math.PI * 2) * 3.4]), { half: 0.9, closed: true, side: [0, 1, 0] }), { mat: 'rustyIron' });
    m.mesh('stick', tube([[0, -15, 8], [0, 8, 13.5]], { half: 1.6, sides: 6 }), { mat: 'wood' });
    m.mesh('head', tube([[0, 7, 13.3], [0, 15, 15]], { half: 2.7, sides: 6 }), { mat: 'cloth' });
    m.group('flame', undefined, { origin: [0, 15, 15.2] });
  }, { density: 2 }),

  lantern: defineModel('lantern', MATS, (m) => {
    // An oil lantern hung from a bracket on the wall: a caged frame under a peaked cap, the flame on its wick inside.
    const Z = 22, H = 5.8;
    m.cube('plate', [-4, -8, 0], [4, 7, 2], { mat: 'rustyIron' });
    m.mesh('arm', tube([[0, 2, 2], [0, 2, Z + 2]], { half: 1.1 }), { mat: 'rustyIron' });
    m.mesh('brace', tube([[0, -7, 2], [0, 1, Z - 6]], { half: 0.9 }), { mat: 'rustyIron' });
    m.mesh('hook', tube([[0, 2, Z], [0, -4, Z]], { half: 0.6 }), { mat: 'rustyIron' });
    m.mesh('cap', revolve([[0, -14], [8.6, -14], [7, -10.5], [1.5, -5], [0, -4.5]], { sides: 4, phase: Math.PI / 4 }), { mat: 'rustyIron', origin: [0, 0, Z] });
    m.cube('base', [-7, -37, Z - 7], [7, -33, Z + 7], { mat: 'rustyIron' });
    m.cube('wick', [-1.5, -33, Z - 1.5], [1.5, -31, Z + 1.5], { mat: 'rustyIron' });
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      m.cube(`post_${dx}_${dz}`, [dx * H - 0.8, -33, Z + dz * H - 0.8], [dx * H + 0.8, -14, Z + dz * H + 0.8], { mat: 'rustyIron' });
    }
    for (const y of [-27, -20]) {
      for (const [a, b] of [[[-H, -H], [H, -H]], [[H, -H], [H, H]], [[H, H], [-H, H]], [[-H, H], [-H, -H]]]) {
        m.mesh(`bar_${y}_${a}_${b}`, tube([[a[0], y, Z + a[1]], [b[0], y, Z + b[1]]], { half: 0.4 }), { mat: 'rustyIron' });
      }
    }
    m.group('flame', undefined, { origin: [0, -31, Z] });
  }, { density: 2 }),

  minecart: defineModel('minecart', MATS, (m) => {
    // An ore cart left on its rails (the rails are a prop of their own), still half full.
    const B = 17, Tp = 44, hx = (y) => 24 + ((y - B) / (Tp - B)) * 7, hz = (y) => 13 + ((y - B) / (Tp - B)) * 4;
    const ring = (y) => [[hx(y), y, hz(y)], [hx(y), y, -hz(y)], [-hx(y), y, -hz(y)], [-hx(y), y, hz(y)]];
    m.mesh('bucket', loft([ring(B), ring(Tp)], { capEnd: false }), { mat: 'cartWood', info: { corner: hx } });
    for (const s of [-1, 1]) {
      m.cube(`rim_side_${s < 0 ? 'back' : 'front'}`, [-hx(Tp) - 1, Tp - 3, s * hz(Tp) - 1.5], [hx(Tp) + 1, Tp, s * hz(Tp) + 1.5], { mat: 'rustyIron' });
      m.cube(`rim_end_${s < 0 ? 'left' : 'right'}`, [s * hx(Tp) - 1.5, Tp - 3, -hz(Tp) - 1], [s * hx(Tp) + 1.5, Tp, hz(Tp) + 1], { mat: 'rustyIron' });
      m.cube(`axle_${s < 0 ? 'left' : 'right'}`, [s * 16 - 1.5, 11.5, -17], [s * 16 + 1.5, 14.5, 17], { mat: 'rustyIron' });
      for (const z of [-1, 1]) {
        m.mesh(`wheel_${s < 0 ? 'left' : 'right'}_${z < 0 ? 'back' : 'front'}`, revolve([[0, 0], [8, 0], [8, 3], [0, 3]], { sides: 8 }),
          { mat: 'rustyIron', origin: [s * 16, 13, z < 0 ? -17 : 14], rotation: [90, 0, 0] });
      }
    }
    // The load: two heaps of ore.
    m.mesh('ore_left', lump(15, 11, 0.1), { mat: 'oreRock', origin: [-10, Tp - 9, 0] });
    m.mesh('ore_right', lump(13, 9, 0.05), { mat: 'oreRock', origin: [11, Tp - 8, 1] });
    m.cube('nugget', [2, Tp, -3], [6, Tp + 4, 1], { mat: 'gold', origin: [4, Tp + 2, -1], rotation: [20, 30, 10] });
  }, { density: 1, double: ['cartWood'] }),

  rails: defineModel('rails', MATS, (m) => {
    // A length of mine rails (2.5 m, along x) on timber sleepers, one or two knocked askew.
    for (let i = 0; i < 10; i++) {
      const x = -72 + i * 16, skew = rand(i, 1120) > 0.75 ? (rand(i, 1121) - 0.5) * 16 : 0;
      m.cube(`sleeper_${i + 1}`, [x - 4, 0, -22], [x + 4, 2.5, 22], { mat: 'timber', info: { along: 'z' }, origin: [x, 1, 0], rotation: [0, skew, 0] });
    }
    for (const z of [-14, 14]) m.cube(`rail_${z < 0 ? 'back' : 'front'}`, [-80, 2.5, z - 1.5], [80, 5, z + 1.5], { mat: 'rustyIron' });
  }, { density: 1 }),

  mine_timbers: defineModel('mine_timbers', MATS, (m) => {
    // Timbering against the rock: two posts under a cap beam, braced, with boards laid behind at the top.
    for (const s of [-1, 1]) {
      m.cube(`post_${s < 0 ? 'left' : 'right'}`, [s * 54 - 5, 0, 1], [s * 54 + 5, 158, 11], { mat: 'timber' });
      m.mesh(`brace_${s < 0 ? 'left' : 'right'}`, tube([[s * 50, 120, 6], [s * 30, 157, 6]], { half: 2.5 }), { mat: 'timber' });
    }
    m.cube('cap', [-64, 158, 0], [64, 170, 12], { mat: 'timber', info: { along: 'x' } });
    for (const y of [130, 142]) m.cube(`board_${y}`, [-49, y, 0], [49, y + 10, 2.5], { mat: 'timber', info: { along: 'x' } });
  }, { density: 1 }),

  tools: defineModel('tools', MATS, (m) => {
    // A pick and a shovel left leaning on the wall (just behind, at z -28), and a bucket at their feet.
    m.mesh('pick_handle', tube([[-20, 0, 6], [-26, 56, -24]], { half: 1.4, sides: 6 }), { mat: 'wood' });
    m.mesh('pick_head', tube([[-40, 51, -22], [-26, 58, -24], [-12, 51, -22]], { half: 1.6 }), { mat: 'rustyIron' });
    m.mesh('shovel_handle', tube([[16, 14, 2], [20, 62, -24]], { half: 1.3, sides: 6 }), { mat: 'wood' });
    m.mesh('shovel_grip', tube([[16, 62, -24], [24, 62, -24]], { half: 1.2 }), { mat: 'wood' });
    m.cube('shovel_blade', [10, 1, 1.5], [22, 17, 3.5], { mat: 'rustyIron', origin: [16, 9, 2.5], rotation: [-26, 4, 0] });
    m.mesh('bucket', revolve([[0, 0], [8, 0], [10, 13], [9, 13], [7.2, 1.2], [0, 1.2]], { sides: 10 }), { mat: 'bucket', origin: [-2, 0, 12], info: { cx: -2, cz: 12 } });
  }, { density: 2 }),

  ore_vein: defineModel('ore_vein', MATS, (m) => {
    // A seam of ore breaking through the rock: knuckles of stone glinting with gold and copper.
    [[-40, 36, 13], [-24, 52, 16], [-6, 66, 12], [10, 82, 15], [28, 96, 11], [42, 112, 9], [-30, 78, 8]].forEach(([x, y, r], i) => {
      m.mesh(`lump_${i + 1}`, lump(r, r * 0.8, (rand(i, 1130) - 0.5) * 0.2), { mat: 'oreRock', origin: [x, y, 0], rotation: [90, 0, rand(i, 1131) * 60] });
    });
    [[-18, 58, 11], [14, 88, 11]].forEach(([x, y, z], i) => m.cube(`nugget_${i + 1}`, [x - 2.5, y - 2, z - 2], [x + 2.5, y + 2, z + 2], { mat: 'gold', origin: [x, y, z], rotation: [30, 20 + i * 40, 15] }));
  }, { density: 1 }),

  crystals: defineModel('crystals', MATS, (m) => {
    // Crystals breaking out of the wall at chest height, lit from within, and a few strays lower down.
    m.mesh('rock', lump(22, 14, 0.05), { mat: 'rock', origin: [0, 62, 0], rotation: [90, 0, 0] });
    m.mesh('rock_low', lump(12, 9, 0.1), { mat: 'rock', origin: [-20, 22, 0], rotation: [90, 0, 20] });
    const prism = (r, h) => revolve([[0, 0], [r, 0], [r, h * 0.72], [0, h]], { sides: 6 });
    [[0, 64, 6, 44, 6, [70, 0, 0]], [-12, 60, 5, 34, 5, [60, 0, 35]], [12, 58, 5, 36, 5, [58, 0, -32]], [-6, 72, 4, 26, 4, [35, 0, 20]],
      [8, 74, 4, 30, 4, [30, 0, -18]], [-16, 52, 4, 22, 3.5, [95, 0, 50]], [14, 50, 4, 20, 3.5, [100, 0, -55]], [2, 50, 6, 24, 4, [110, 0, 5]],
      [-20, 24, 4, 20, 3.5, [30, 0, 15]], [-14, 22, 4, 14, 3, [45, 0, -25]], [-26, 20, 3, 12, 2.5, [50, 0, 40]]].forEach(([x, y, z, h, r, rot], i) => {
      m.mesh(`crystal_${i + 1}`, prism(r, h), { mat: 'crystal', origin: [x, y, z], rotation: rot });
    });
    m.group('glow_1', undefined, { origin: [0, 64, 22] });
  }, { density: 2, glow: ['crystal'] }),

  stalagmite: defineModel('stalagmite', MATS, (m) => {
    // Stalagmites risen from the floor, a tall one and two smaller at its foot.
    const cone = (r, h) => revolve([[0, 0], [r, 0], [r * 0.72, h * 0.28], [r * 0.45, h * 0.6], [r * 0.22, h * 0.85], [0, h]], { sides: 7 });
    m.mesh('tall', cone(15, 84), { mat: 'limestone' });
    m.mesh('middle', cone(10, 48), { mat: 'limestone', origin: [14, 0, 8], rotation: [0, 30, 6] });
    m.mesh('small', cone(7, 30), { mat: 'limestone', origin: [-11, 0, 10], rotation: [0, 60, -8] });
  }, { density: 1 }),

  stalactites: defineModel('stalactites', MATS, (m) => {
    // Stalactites hanging from the vault (rooted a little above it, so they stay fixed where the rock rises), the
    // longest dripping.
    const hang = (r, len) => revolve([[0, VAULT - len], [r * 0.3, VAULT - len * 0.7], [r * 0.7, VAULT - len * 0.3], [r, VAULT + 20], [0, VAULT + 20]], { sides: 6 });
    [[0, 0, 11, 62], [18, 10, 7, 36], [-16, 8, 8, 42], [6, -18, 6, 26], [-6, 20, 5, 20], [22, -10, 5, 18]].forEach(([x, z, r, len], i) => {
      m.mesh(`stalactite_${i + 1}`, hang(r, len), { mat: 'limestone', origin: [x, 0, z] });
    });
    m.group('drip_1', undefined, { origin: [0, VAULT - 63, 0] });
    m.group('drip_2', undefined, { origin: [-16, VAULT - 43, 8] });
  }, { density: 1 }),

  rocks: defineModel('rocks', MATS, (m) => {
    // Boulders fallen from the roof and heaped against the wall.
    [[0, 0, -6, 20, 22], [22, 0, 4, 13, 14], [-20, 0, 6, 14, 12], [8, 18, -4, 11, 10], [-8, 0, 20, 8, 7]].forEach(([x, y, z, r, h], i) => {
      m.mesh(`boulder_${i + 1}`, lump(r, h, (rand(i, 1140) - 0.5) * 0.25), { mat: 'rock', origin: [x, y, z], rotation: [rand(i, 1141) * 20, rand(i, 1142) * 180, rand(i, 1143) * 20] });
    });
  }, { density: 1 }),
};
