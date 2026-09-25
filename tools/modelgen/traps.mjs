// Traps: a model for each kind, seen once a trap has been found. Each has three states, groups the game shows
// one at a time: "armed" (waiting to go off), "active" (going off, the game moving its parts) and "used" (spent:
// set off, or disarmed). Parts outside them always show. The kinds are told apart at a glance by shape and
// colour: a square iron grate (spikes), a round vent in a green stain (poison), a glowing azure glyph
// (teleport), a brass bell on a post (alarm). Origin on the floor at the middle of the trap's tile.
import { defineModel, revolve, tube, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, patches, bevel } from './materials.mjs';
import { runeAt, segDist } from './underworld.mjs';

const TP = {
  green: P('#0c1a06', '#1a3a0c', '#2c5a14', '#48801e', '#6aa82c', '#9cd04a'),
  stone: P('#1e1c1a', '#2c2926', '#3b3733', '#4b4642', '#5c5752', '#6e6863'),
  azure: P('#041428', '#0a2a50', '#124a86', '#2276c0', '#4aa6ee', '#a8dcff'),
  char: P('#050505', '#0e0d0c', '#1a1816', '#26231f'),
  blood: P('#1a0806', '#2e0e0a', '#44150f', '#5a1c14'),
  void: P('#020202', '#070707', '#0d0d0d'),
  wood: P('#1c130b', '#291c10', '#382716', '#48331d', '#583f24'),
};
const clear = [0, 0, 0, 0];
const HOLES = [-19.5, -6.5, 6.5, 19.5]; // where the spikes come through the grate (x and z)
const hole = (v) => Math.abs((((v + 26) % 13) + 13) % 13 - 6.5) < 2.4;

/** The teleport glyph's pattern at (x, z): two rings with runes between them round a two-armed spiral. */
function glyphAt(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  if (Math.abs(r - 28) < 1.1 || Math.abs(r - 19) < 1) return true;
  if (r > 19.8 && r < 27.2) return runeAt((a + Math.PI) * 23.5, r - 20, 9);
  if (r < 16.5) {
    for (const arm of [0, Math.PI]) {
      const phi = a + arm + Math.PI * 2, n = Math.round((r / 1.25 - phi) / (Math.PI * 2));
      if (Math.abs(r - 1.25 * (phi + n * Math.PI * 2)) < 0.9 && n >= -1) return true;
    }
  }
  return r < 1.6;
}

const MATS = {
  ...MAT,
  // An iron plate pierced with a grid of holes, dark beneath; rivets round its edge.
  spikePlate(c) {
    const { p } = c;
    if (hole(p.x) && hole(p.z) && Math.abs(p.x) < 26 && Math.abs(p.z) < 26) return ramp(TP.void, 0.5, c.ax, c.ay);
    if (Math.abs(p.x) > 23 && Math.abs(p.z) > 23) return ramp(PAL.iron, 0.75, c.ax, c.ay);
    return MAT.rustyIron(c);
  },
  // A spike, its point bloodied if `info.tip` says where it is.
  spike(c) {
    if (c.info.tip !== undefined && c.p.y > c.info.tip - 7 + noise3(c.p.x, c.p.y * 0.3, c.p.z, 4001) * 4) return ramp(TP.blood, 0.5 + 0.3 * patches(c.p, 4002, 0.8), c.ax, c.ay);
    return MAT.rustyIron(c);
  },
  // A crack across the plate (cut out).
  crack(c) {
    const { x, z } = c.p;
    const d = Math.min(segDist(x, z, [-22, -8], [-6, 2]), segDist(x, z, [-6, 2], [4, -4]), segDist(x, z, [4, -4], [18, 10]), segDist(x, z, [-6, 2], [-10, 18]));
    return d < 0.6 ? ramp(TP.void, 0.4, c.ax, c.ay) : clear;
  },
  // Green residue splashed round the vent, ragged at its edge (cut out).
  stain(c) {
    const { x, z } = c.p, r = Math.hypot(x, z), n = noise3(x * 0.14, z * 0.14, 0, 4010);
    if (r > 26 + 16 * noise3(Math.cos(Math.atan2(z, x)) * 2, Math.sin(Math.atan2(z, x)) * 2, 1, 4011) || n < 0.3) return clear;
    return ramp(TP.green, 0.15 + 0.35 * n - (r / 42) * 0.1, c.ax, c.ay);
  },
  // The vent's stone lip, its hole dark and tinged green.
  vent(c) {
    if (c.n.y > 0.5 && Math.hypot(c.p.x, c.p.z) < 13.2) return ramp(TP.green, 0.08, c.ax, c.ay);
    return ramp(TP.stone, 0.45 + 0.14 * patches(c.p, 4012, 0.4) + bevel(c, 0.15), c.ax, c.ay);
  },
  // The vent's cap: a brass dome with slots round it, green in the dark behind them.
  grille(c) {
    const { p } = c, r = Math.hypot(p.x - c.info.cx, p.z - c.info.cz), a = Math.atan2(p.z - c.info.cz, p.x - c.info.cx);
    if (c.n.y > 0.3 && r > 3.5 && r < 11.5 && fract((a / (Math.PI * 2)) * 10) < 0.35) return ramp(TP.green, 0.35, c.ax, c.ay);
    return MAT.brass(c);
  },
  // Stone, a groove cut round near its edge.
  slab(c) {
    let v = 0.42 + 0.14 * patches(c.p, 4020, 0.4) + bevel(c, 0.15);
    if (c.n.y > 0.5 && Math.abs(Math.hypot(c.p.x, c.p.z) - 29.8) < 0.7) v -= 0.2;
    return ramp(TP.stone, v, c.ax, c.ay);
  },
  // Emissive, cut out: the teleport glyph shining azure.
  glyph: (c) => (glyphAt(c.p.x, c.p.z) ? ramp(TP.azure, 0.72 + (rand(c.ax, c.ay, 4030) > 0.85 ? 0.18 : 0), c.ax, c.ay) : clear),
  // Cut out: the glyph burnt out, charred into the stone, scorched about and cracked across.
  burnt(c) {
    const { x, z } = c.p, r = Math.hypot(x, z);
    const crack = Math.min(segDist(x, z, [-26, -6], [-4, 1]), segDist(x, z, [-4, 1], [9, -12]), segDist(x, z, [-4, 1], [6, 24]), segDist(x, z, [9, -12], [22, -14]));
    if (crack < 0.7 || glyphAt(x, z)) return ramp(TP.char, 0.15, c.ax, c.ay);
    if (r < 29 && noise3(x * 0.16, z * 0.16, 0, 4031) > 0.55) return ramp(TP.char, 0.5 + 0.3 * patches(c.p, 4032, 0.6), c.ax, c.ay);
    return clear;
  },
  // Boards laid along x, bound round the edge in brass.
  planks(c) {
    const { p } = c;
    if (c.n.y > 0.5 && c.edge < 2.2) return MAT.brass(c);
    const k = Math.floor((p.z + 100) / 8.4), f = fract((p.z + 100) / 8.4);
    if (c.n.y > 0.5 && f < 0.08) return ramp(TP.wood, 0.05, c.ax, c.ay);
    return ramp(TP.wood, 0.5 + 0.2 * (rand(k, 4040) - 0.5) + 0.1 * patches(p, 4041, 0.3) + bevel(c, 0.12), c.ax, c.ay);
  },
  darkWood: (c) => ramp(TP.wood, 0.3 + 0.12 * patches(c.p, 4042, 0.4) + bevel(c, 0.15), c.ax, c.ay),
  // A bell's brass, dulled and cracked if `info.cracked`.
  bell(c) {
    const { p, info } = c;
    if (info.cracked && Math.abs(p.x - info.cx + (p.y - info.cy) * 0.5 + Math.sin(p.z * 0.8) * 1.2) < 0.55) return ramp(TP.void, 0.5, c.ax, c.ay);
    return info.cracked ? ramp(PAL.brass, 0.32 + 0.12 * patches(p, 4050, 0.6), c.ax, c.ay) : MAT.brass(c);
  },
};

/** A spike from `y0` to its point `h` above it at (x, z), leaning by `rot`; bloodied if `blood` (`mat` otherwise). */
const spike = (m, name, [x, y0, z], h, { r = 2.4, rot = [0, 0, 0], blood = false, mat = 'spike' } = {}) =>
  m.mesh(name, revolve([[0, 0], [r, 0], [r * 0.75, h * 0.6], [0, h]], { sides: 4 }), { mat, origin: [x, y0, z], rotation: rot, info: blood ? { tip: y0 + h } : {} });

/** A bell hung from its top at `at` (a clapper inside), turned by `rot`. */
function bell(m, name, at, rot = [0, 0, 0], cracked = false) {
  const profile = [[0, -7], [4, -8], [5.8, -13], [6.6, -15], [7.6, -15], [6.8, -13], [5, -8], [4.2, -3], [2.5, -0.5], [0, 0]];
  m.mesh(name, revolve(profile, { sides: 10 }), { mat: 'bell', origin: at, rotation: rot, info: { cracked, cx: at[0], cy: at[1] - 8 } });
  if (!cracked) m.cube(`${name}_clapper`, [at[0] - 1.5, at[1] - 16, at[2] - 1.5], [at[0] + 1.5, at[1] - 12.5, at[2] + 1.5], { mat: 'iron', origin: at, rotation: rot });
  m.cube(`${name}_loop`, [at[0] - 0.6, at[1] - 0.5, at[2] - 2], [at[0] + 0.6, at[1] + 2, at[2] + 2], { mat: 'brass', origin: at, rotation: rot });
}

export const traps = {
  trap_spike: defineModel('trap_spike', MATS, (m) => {
    // A square iron plate set in the floor, pierced with holes. Armed: the points of the spikes glint in them.
    // Active: the spikes thrust up half a metre (the game drives them up from below). Used: they're left stuck
    // half out, bent and bloodied, one snapped off, the plate cracked.
    m.cube('frame', [-30, 0, -30], [30, 1.4, 30], { mat: 'rustyIron' });
    m.cube('plate', [-26, 1.4, -26], [26, 2, 26], { mat: 'spikePlate', faces: ['up'] });
    m.group('armed', () => {
      for (const x of HOLES) for (const z of HOLES) spike(m, `tip_${x}_${z}`, [x, 1.2, z], 5, { r: 1.8, mat: 'honed' });
    });
    m.group('active', () => {
      for (const x of HOLES) for (const z of HOLES) spike(m, `spike_${x}_${z}`, [x, -34, z], 68);
    });
    m.group('used', () => {
      HOLES.forEach((x, i) => HOLES.forEach((z, j) => {
        if ((i * 4 + j) % 5 === 3) return; // missing
        const h = 14 + rand(i, j, 4060) * 12, rot = [(rand(i, j, 4061) - 0.5) * 26, 0, (rand(i, j, 4062) - 0.5) * 26];
        spike(m, `bent_${x}_${z}`, [x, 0, z], h, { rot, blood: rand(i, j, 4063) > 0.5 });
      }));
      spike(m, 'snapped', [8, 3.4, -12], 20, { r: 2, rot: [0, 40, 88] });
      m.cube('crack', [-26, 2.05, -26], [26, 2.15, 26], { mat: 'crack', faces: ['up'] });
    });
  }, { density: 1 }),

  trap_poison: defineModel('trap_poison', MATS, (m) => {
    // A round vent in the floor, a green stain splashed about it. Armed: its grille cap sits over it, green in
    // the dark behind the slots. Active: the cap blows up off it in a cloud of gas (the game throws it and makes
    // the cloud). Used: the cap lies where it fell, the vent open.
    m.cube('stain', [-44, 0.12, -44], [44, 0.25, 44], { mat: 'stain', faces: ['up'] });
    m.mesh('vent', revolve([[0, 0], [24, 0], [24, 2], [20, 3.6], [14, 3.6], [13, 1.2], [0, 1.2]], { sides: 12 }), { mat: 'vent' });
    const cap = (name, origin, rotation = [0, 0, 0]) => m.mesh(name, revolve([[0, 0], [13.6, 0], [12.6, 2], [9, 4.5], [4, 5.8], [0, 6]], { sides: 12 }), { mat: 'grille', origin, rotation, info: { cx: origin[0], cz: origin[2] } });
    m.group('armed', () => cap('cap', [0, 3.6, 0]));
    m.group('active', () => cap('cap', [0, 3.6, 0]), { origin: [0, 3.6, 0] });
    m.group('used', () => cap('cap', [31, 7.2, 8], [0, 30, 80]));
  }, { density: 1 }),

  trap_teleport: defineModel('trap_teleport', MATS, (m) => {
    // A round slab of stone set in the floor. Armed: a glyph shines azure on it, slowly turning (the game turns
    // it). Active: it spins and flares. Used: it's burnt out, charred into the stone, and the slab cracked.
    m.mesh('slab', revolve([[0, 0], [31, 0], [31, 1.2], [0, 1.2]], { sides: 16 }), { mat: 'slab' });
    m.group('armed', () => m.cube('glyph', [-30, 1.3, -30], [30, 1.45, 30], { mat: 'glyph', faces: ['up'] }));
    m.group('used', () => m.cube('burnt', [-30, 1.3, -30], [30, 1.45, 30], { mat: 'burnt', faces: ['up'] }));
  }, { density: 2, glow: ['glyph'] }),

  trap_alarm: defineModel('trap_alarm', MATS, (m) => {
    // A wooden pressure plate bound in brass, a brass bell hung from an iron post at one corner and linked to the
    // plate by a lever. Armed: the plate stands proud, the bell hangs still. Active: the plate goes down and the
    // bell swings and rings (the game swings it). Used: the plate is jammed down, the bell fallen and cracked.
    m.cube('frame', [-24, 0, -24], [24, 1.2, 24], { mat: 'darkWood' });
    m.cube('post_foot', [18, 0, -26], [26, 3, -18], { mat: 'rustyIron' });
    m.mesh('post', tube([[22, 0, -22], [22, 50, -22], [20, 57, -20], [14, 60, -14], [9.5, 58.5, -9.5]], { half: 1.3 }), { mat: 'rustyIron' });
    m.mesh('lever', tube([[13, 2.5, -13], [21, 12, -21]], { half: 0.7 }), { mat: 'rustyIron' });
    const plate = (down) => m.cube('plate', [-21, down ? 0.4 : 1.2, -21], [21, down ? 1.6 : 4.4, 21], { mat: 'planks' });
    m.group('armed', () => {
      plate(false);
      bell(m, 'bell', [9.5, 57, -9.5]);
    });
    m.group('active', () => {
      plate(true);
      m.group('bell', () => bell(m, 'bell', [9.5, 57, -9.5]), { origin: [9.5, 58, -9.5] });
    });
    m.group('used', () => {
      plate(true);
      bell(m, 'bell', [-6, 9.4, 4], [0, 35, 96], true);
    });
  }, { density: 1.5 }),
};
