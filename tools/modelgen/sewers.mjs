// The Sewers' props: the bridges and grates of its water channels, and the decorations dungeon/decor.js sets
// about its rooms. Floor props: origin on the floor at the middle, front facing +z. Wall props: origin on the
// wall face at floor level, standing out from it along +z. Channels run 0.5 m below the floor (32 px).
import { defineModel, revolve, tube, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, patches, bevel } from './materials.mjs';
import { HALF, VAULT, bothFaces } from './doorkit.mjs';

const SEWER_PAL = {
  wetWood: P('#121009', '#1b180f', '#252116', '#302b1e', '#3c3627', '#4a4331'),
  stone: P('#1a1d17', '#262a22', '#33382d', '#41473a', '#50574a', '#61695a'),
  brick: P('#1e1611', '#2c2019', '#3b2b21', '#4a372b', '#5a4436', '#6a5242'),
  slime: P('#0a1405', '#13240a', '#1e3710', '#2b4d17', '#3b6620', '#52812f'),
  void: P('#030402', '#070906', '#0c0f0a'),
  paint: P('#2a0806', '#480e0a', '#6a1811', '#8a2418', '#a63522'),
  dust: P('#1f1d17', '#2c2921', '#3a362c', '#4a4538'),
  doorPaint: P('#111813', '#18231b', '#203024', '#293d2e', '#344b39', '#405a44'), // a steel door's old green paint
  hazard: P('#221a06', '#3e300c', '#5c4814', '#7a611c', '#947826'), // warning stripes, ochre gone brown
};
const WATER = -32; // the channel's water surface, in model pixels below the floor

// Slick with algae toward `wetBelow` (a height): green creeps up anything that sits in the damp.
const algae = (c, col, wetBelow) => {
  const wet = (wetBelow - c.p.y) / 10 + (noise3(c.p.x * 0.3, c.p.y * 0.3, c.p.z * 0.3, 801) - 0.5);
  return wet > 0.3 ? ramp(SEWER_PAL.slime, 0.35 + 0.3 * patches(c.p, 802, 0.5), c.ax, c.ay) : col;
};

const MATS = {
  ...MAT,
  // Old planks laid across the way over, black with wet and furred green along their undersides.
  deck(c) {
    const { p, n } = c;
    const k = Math.floor((p.z + 200) / 9), f = fract((p.z + 200) / 9);
    let v = 0.42 + 0.2 * (rand(k, 810) - 0.5) + 0.12 * (noise3(p.x * 0.08, k, 0, 811) - 0.5) + bevel(c, 0.1);
    if (f < 0.1 && n.y > 0.5) v = 0.08; // gaps between the planks
    if (rand(k, Math.floor(p.x / 11), 812) > 0.96) v -= 0.2; // knots and rot
    return algae(c, ramp(SEWER_PAL.wetWood, v, c.ax, c.ay), n.y < -0.5 ? 10 : -4);
  },
  timber(c) {
    const { p } = c;
    const v = 0.4 + 0.14 * patches(p, 815, 0.2) + (fract(p.y * 0.35 + noise3(p.x, p.y * 0.1, p.z, 816) * 0.6) < 0.15 ? -0.12 : 0) + bevel(c, 0.15);
    return algae(c, ramp(SEWER_PAL.wetWood, v, c.ax, c.ay), 6);
  },
  // Dressed stone, block by block (`info.block` numbers them), with dark joints and slime about the waterline.
  stone(c) {
    const { p, info } = c;
    let v = 0.45 + 0.18 * (rand(info.block ?? 0, 820) - 0.5) + 0.1 * patches(p, 821, 0.4) + bevel(c, 0.15);
    if (c.edge < 1 && Math.min(c.W, c.H) > 4) v = 0.12; // joints
    return algae(c, ramp(SEWER_PAL.stone, v, c.ax, c.ay), WATER + 18);
  },
  void: (c) => ramp(SEWER_PAL.void, 0.3 + 0.4 * Math.max(0, (c.p.y - WATER) / 90), c.ax, c.ay),
  slime(c) {
    let v = 0.3 + 0.3 * patches(c.p, 830, 0.5);
    if (rand(c.ax, c.ay, 831) > 0.93) v = 0.8; // wet glints
    return ramp(SEWER_PAL.slime, v, c.ax, c.ay);
  },
  // Red paint, chipped back to rust.
  valvePaint(c) {
    if (noise3(c.p.x * 0.5, c.p.y * 0.5, c.p.z * 0.5, 840) > 0.62) return ramp(PAL.rust, 0.5, c.ax, c.ay);
    return ramp(SEWER_PAL.paint, 0.5 + 0.2 * patches(c.p, 841, 0.6) + bevel(c, 0.2), c.ax, c.ay);
  },
  brick(c) {
    const v = 0.45 + 0.25 * (rand(c.info.brick ?? 0, 850) - 0.5) + 0.1 * patches(c.p, 851, 0.5) + bevel(c, 0.2);
    return algae(c, ramp(SEWER_PAL.brick, v, c.ax, c.ay), 1);
  },
  dust: (c) => algae(c, ramp(SEWER_PAL.dust, 0.45 + 0.2 * patches(c.p, 860, 0.7), c.ax, c.ay), 2),
  // A floor drain: iron bars over a black hole, set in a stone surround.
  drain(c) {
    const { p } = c;
    if (Math.max(Math.abs(p.x), Math.abs(p.z)) > 17) return ramp(SEWER_PAL.stone, 0.42 + 0.12 * patches(p, 870, 0.4) + (c.edge < 1 ? -0.2 : 0), c.ax, c.ay);
    if (fract((p.x + 17) / 5) < 0.45) return MAT.rustyIron(c);
    return ramp(SEWER_PAL.void, 0.2, c.ax, c.ay);
  },

  // --- The door (door_sewers)
  // Steel in old green paint, flaking back to rust, rust running down it in streaks, grime and slime low down.
  doorSteel(c) {
    const { p } = c;
    const chip = noise3(p.x * 0.14, p.y * 0.14, p.z * 0.2, 1100) + 0.15 * noise3(p.x * 0.6, p.y * 0.6, p.z, 1101);
    const streak = noise3(p.x * 0.5, p.y * 0.025, p.z * 0.2, 1102);
    if (chip > 0.84 || (streak > 0.8 && p.y > 24)) return ramp(PAL.rust, 0.3 + 0.4 * patches(p, 1103, 0.5) + bevel(c, 0.12), c.ax, c.ay);
    const v = 0.52 + 0.14 * patches(p, 1104, 0.25) + bevel(c, 0.18) - Math.max(0, 26 - p.y) * 0.01;
    return algae(c, ramp(SEWER_PAL.doorPaint, v, c.ax, c.ay), 5);
  },
  // The door's plate: painted on its faces, bare at its edges, with a barred slot to look through at eye height.
  doorPlate(c) {
    const { p, n } = c;
    if (Math.abs(n.z) < 0.5) return MAT.rustyIron(c);
    if (Math.abs(p.x) < 13 && p.y > 119 && p.y < 131) {
      return fract((p.x + 13) / 4.33) < 0.3 ? MAT.rustyIron(c) : ramp(SEWER_PAL.void, 0.2, c.ax, c.ay);
    }
    return MATS.doorSteel(c);
  },
  // A bar riveted to the door: painted steel, rivets every 8 px along its middle (`info.axis` it runs along, and
  // `info.mid` its middle across).
  doorBar(c) {
    const { p, n, info } = c;
    if (Math.abs(n.z) > 0.5) {
      const along = fract(p[info.axis] / 8), across = p[info.axis === 'x' ? 'y' : 'x'] - info.mid;
      if (Math.abs(along - 0.5) < 0.13 && Math.abs(across) < 1.1) return ramp(PAL.iron, across > 0 ? 0.8 : 0.6, c.ax, c.ay);
    }
    return MATS.doorSteel(c);
  },
  // The frame: bare steel gone dark and rusty, bolted every 12 px along the middle of its faces (as doorBar).
  doorFrame(c) {
    const { p, n, info } = c;
    if (Math.abs(n.z) > 0.5 && info.mid !== undefined) {
      const along = fract(p[info.axis] / 12), across = p[info.axis === 'x' ? 'y' : 'x'] - info.mid;
      if (Math.abs(along - 0.5) < 0.12 && Math.abs(across) < 1.6) return ramp(PAL.iron, across > 0 ? 0.78 : 0.55, c.ax, c.ay);
    }
    return MAT.rustyIron(c);
  },
  // The lintel: a steel beam with warning stripes painted along its faces, worn through in places.
  doorLintel(c) {
    const { p, n } = c;
    if (Math.abs(n.z) > 0.5 && p.y > 154 && p.y < 162 && noise3(p.x * 0.3, p.y * 0.3, 0, 1110) < 0.72) {
      if (fract((p.x + p.y + 200) / 9) < 0.5) return ramp(SEWER_PAL.hazard, 0.55 + 0.25 * patches(p, 1111, 0.4), c.ax, c.ay);
      return ramp(SEWER_PAL.void, 0.6, c.ax, c.ay);
    }
    return MATS.doorFrame(c);
  },
  // Brickwork in running bond on its faces, filling the wall up to the vault.
  brickBond(c) {
    const { p, n } = c;
    const u = Math.abs(n.x) > 0.5 ? p.z : p.x;
    const row = Math.floor((p.y + 200) / 6), off = row % 2 ? 8 : 0;
    if (fract((p.y + 200) / 6) < 0.17 || fract((u + 200 + off) / 16) < 0.07) return ramp(SEWER_PAL.brick, 0.08, c.ax, c.ay);
    return ramp(SEWER_PAL.brick, 0.45 + 0.25 * (rand(Math.floor((u + 200 + off) / 16), row, 1112) - 0.5) + 0.1 * patches(p, 1113, 0.5), c.ax, c.ay);
  },
};

// Pipework is revolved rather than lathed: revolve() takes the way each face points from the direction its
// profile is walked (outside on the right), so flat steps like a flange's face come out facing the right way.
// Profiles here are [r, y] with y along the pipe; `turn` stands it along +z (out of a wall) or +x.
const TURN = { z: [90, 0, 0], x: [0, 0, -90], y: [0, 0, 0] };
/** A plain length of pipe of radius r, closed at both ends. */
const pipeRun = (r, length) => revolve([[0, 0], [r, 0], [r, length], [0, length]], { sides: 8 });

/** A polygon wound so it faces `out`. */
function facing(pts, out, extra = {}) {
  const [a, b, c] = pts;
  const u = b.map((v, i) => v - a[i]), w = c.map((v, i) => v - a[i]);
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  return { pts: n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? pts : [...pts].reverse(), ...extra };
}

export const sewers = {
  bridge: defineModel('bridge', MATS, (m) => {
    // A plank bridge over a channel (2 m across, running along z), resting on the banks either side, with a
    // handrail along each side.
    const L = 78, Wd = 58;
    m.cube('deck', [-Wd, 0, -L], [Wd, 3, L], { mat: 'deck' });
    for (const x of [-40, 40]) m.cube(`beam_${x < 0 ? 'left' : 'right'}`, [x - 4, -8, -L + 2], [x + 4, 0, L - 2], { mat: 'timber' });
    for (const x of [-Wd + 3, Wd - 3]) {
      const s = x < 0 ? 'left' : 'right';
      for (const z of [-70, 0, 70]) m.cube(`post_${s}_${z < 0 ? 'near' : z > 0 ? 'far' : 'mid'}`, [x - 2.5, z ? -6 : 3, z - 2.5], [x + 2.5, 44, z + 2.5], { mat: 'timber' });
      m.cube(`rail_${s}`, [x - 2, 40, -72], [x + 2, 44, 72], { mat: 'timber' });
    }
  }, { density: 1 }),

  channel_grate: defineModel('channel_grate', MATS, (m) => {
    // Where a channel meets a wall: an arched opening, black beyond, barred with rusty iron, in a ring of
    // dressed stone. From the water up to 0.8 m above the floor.
    const R = 52, F = 64, D = 7, N = 9;
    const arch = (x) => Math.sqrt(Math.max(0, R * R - x * x));
    // The dark beyond, just in front of the wall face.
    const dark = [];
    for (let i = 0; i < 16; i++) {
      const xa = -R + (2 * R * i) / 16, xb = -R + (2 * R * (i + 1)) / 16;
      dark.push(facing([[xa, WATER, 0.4], [xb, WATER, 0.4], [xb, arch((xa + xb) / 2), 0.4], [xa, arch((xa + xb) / 2), 0.4]], [0, 0, 1]));
    }
    m.mesh('opening', dark, { mat: 'void' });
    // Voussoirs round the arch, and a jamb down each side to the water.
    const ring = [];
    for (let i = 0; i < N; i++) {
      const a0 = (Math.PI * i) / N, a1 = (Math.PI * (i + 1)) / N;
      const pt = (r, a, z) => [r * Math.cos(a), r * Math.sin(a), z];
      const mid = (a0 + a1) / 2, grow = i === (N - 1) / 2 ? 4 : 0; // a proud keystone
      const out = F + grow, d = D + grow / 2;
      ring.push(facing([pt(R, a0, d), pt(out, a0, d), pt(out, a1, d), pt(R, a1, d)], [0, 0, 1], { block: i }));
      ring.push(facing([pt(R, a0, 0), pt(R, a1, 0), pt(R, a1, d), pt(R, a0, d)], [-Math.cos(mid), -Math.sin(mid), 0], { block: i }));
      ring.push(facing([pt(out, a0, 0), pt(out, a1, 0), pt(out, a1, d), pt(out, a0, d)], [Math.cos(mid), Math.sin(mid), 0], { block: i }));
      for (const [a, s] of [[a0, -1], [a1, 1]]) {
        if ((s < 0 && i === 0) || (s > 0 && i === N - 1) || grow) {
          ring.push(facing([pt(R, a, 0), pt(out, a, 0), pt(out, a, d), pt(R, a, d)], [-Math.sin(a) * s, Math.cos(a) * s, 0], { block: i }));
        }
      }
    }
    m.mesh('voussoirs', ring, { mat: 'stone' });
    for (const s of [-1, 1]) m.cube(`jamb_${s < 0 ? 'left' : 'right'}`, [s < 0 ? -F : R, WATER, 0], [s < 0 ? -R : F, 0, D], { mat: 'stone', info: { block: 20 + s } });
    // The bars, and two cross bars.
    for (let x = -44; x <= 44; x += 11) m.cube(`bar_${(x + 44) / 11 + 1}`, [x - 1.5, WATER, 1.5], [x + 1.5, arch(x) + 1, 4.5], { mat: 'rustyIron' });
    for (const y of [-12, 22]) {
      const hw = y > 0 ? arch(y) : R;
      m.cube(`crossbar_${y < 0 ? 'low' : 'high'}`, [-hw, y - 1.5, 1], [hw, y + 1.5, 5], { mat: 'rustyIron' });
    }
  }, { density: 1 }),

  drain_pipe: defineModel('drain_pipe', MATS, (m) => {
    // A pipe out of the wall just above the floor, green slime streaked down the wall beneath its mouth and
    // pooled on the floor in front.
    const Y = 30;
    // Flange against the wall, the barrel, a lip at the mouth, then back down the inside into the dark.
    const profile = [[0, 0], [16, 0], [16, 3], [13, 3], [13, 26], [15, 26], [15, 30], [11.5, 30], [11.5, 20], [0, 20]];
    m.mesh('pipe', revolve(profile, { sides: 10, mat: (i) => (i >= 7 ? 'void' : 'rustyIron') }), { origin: [0, Y, 0], rotation: TURN.z });
    m.mesh('streak', [facing([[-9, 0, 0.4], [9, 0, 0.4], [6, Y - 12, 0.4], [-6, Y - 12, 0.4]], [0, 0, 1])], { mat: 'slime' });
    const pool = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2, r = 20 + rand(i, 880) * 9;
      return [Math.cos(a) * r, 0.4, 30 + Math.sin(a) * r * 0.8];
    });
    m.mesh('pool', [facing(pool.slice(0, 4), [0, 1, 0]), facing([pool[0], pool[4], pool[5], pool[6]], [0, 1, 0]), facing([pool[0], pool[3], pool[4]], [0, 1, 0]), facing([pool[0], pool[6], pool[7]], [0, 1, 0])], { mat: 'slime' });
  }, { density: 1 }),

  pipe_valve: defineModel('pipe_valve', MATS, (m) => {
    // A pipe out of the wall that runs along it at waist height, then turns down into the floor, with a
    // red valve wheel on a stub.
    const Y = 60, Z = 13, R = 8, X0 = -58, X1 = 46;
    // Straight runs, out of the wall, along it and down into the floor, with a rounded knuckle at each bend.
    m.mesh('pipe_out', pipeRun(R, Z), { mat: 'rustyIron', origin: [X0, Y, 0], rotation: TURN.z });
    m.mesh('pipe_along', pipeRun(R, X1 - X0), { mat: 'rustyIron', origin: [X0, Y, Z], rotation: TURN.x });
    m.mesh('pipe_down', pipeRun(R, Y), { mat: 'rustyIron', origin: [X1, 0, Z] });
    const knuckle = revolve([[0, -R - 1.5], [R * 0.9, -R - 0.5], [R + 1.5, -R * 0.4], [R + 1.5, R * 0.4], [R * 0.9, R + 0.5], [0, R + 1.5]], { sides: 8 });
    m.mesh('elbow_wall', knuckle, { mat: 'rustyIron', origin: [X0, Y, Z], rotation: [0, 0, 45] });
    m.mesh('elbow_floor', knuckle, { mat: 'rustyIron', origin: [X1, Y, Z], rotation: [0, 0, -45] });
    m.mesh('floor_flange', revolve([[0, 0], [11.5, 0], [11.5, 3], [0, 3]], { sides: 8 }), { mat: 'rustyIron', origin: [X1, 0, Z] });
    m.mesh('wall_flange', revolve([[0, 0], [12, 0], [12, 3], [0, 3]], { sides: 8 }), { mat: 'rustyIron', origin: [X0, Y, 0], rotation: TURN.z });
    for (const x of [-30, 15]) m.cube(`bracket_${x < 0 ? 'left' : 'right'}`, [x - 2.5, Y - 11, 0], [x + 2.5, Y + 11, Z - 6], { mat: 'rustyIron' });
    m.mesh('stub', revolve([[0, 0], [4, 0], [4, 12], [6, 12], [6, 14], [0, 14]], { sides: 8 }), { mat: 'rustyIron', origin: [-8, Y, Z + 6], rotation: TURN.z });
    const wheel = Array.from({ length: 12 }, (_, i) => [-8 + Math.cos((i / 12) * Math.PI * 2) * 14, Y + Math.sin((i / 12) * Math.PI * 2) * 14, Z + 20]);
    m.mesh('wheel', tube(wheel, { half: 2, closed: true, side: [0, 0, 1] }), { mat: 'valvePaint' });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      m.mesh(`spoke_${k + 1}`, tube([[-8, Y, Z + 20], [-8 + Math.cos(a) * 13, Y + Math.sin(a) * 13, Z + 20]], { half: 1.4, side: [0, 0, 1] }), { mat: 'valvePaint' });
    }
  }, { density: 1 }),

  rubble: defineModel('rubble', MATS, (m) => {
    // Fallen brickwork: a low mound of grit and broken bricks tumbled across it.
    m.mesh('mound', revolve([[0, 0], [42, 0], [34, 7], [20, 15], [8, 20], [0, 21]], { sides: 8 }), { mat: 'dust' });
    const bricks = [[-20, 10, -10], [8, 14, -14], [24, 4, 10], [-6, 18, 6], [-30, 2, 16], [2, 22, -2], [32, 2, -16],
      [-12, 4, 28], [16, 8, 20], [-26, 6, -24], [12, 3, -32], [-2, 11, -18]];
    bricks.forEach(([x, y, z], i) => {
      const r = (k) => (rand(i, k, 890) - 0.5) * 2;
      m.cube(`brick_${i + 1}`, [x - 10, y, z - 5], [x + 10, y + 6, z + 5], { mat: 'brick', info: { brick: i }, origin: [x, y + 3, z], rotation: [r(1) * 30, r(2) * 90, r(3) * 30] });
    });
    // A few broken stones among the bricks.
    [[18, 6, -2, 9], [-16, 8, 18, 7], [-24, 4, -6, 8]].forEach(([x, y, z, sz], i) => {
      m.mesh(`stone_${i + 1}`, revolve([[0, -sz * 0.5], [sz, -sz * 0.3], [sz * 0.9, sz * 0.4], [0, sz * 0.6]], { sides: 5 }), { mat: 'stone', info: { block: 30 + i }, origin: [x, y, z], rotation: [rand(i, 895) * 40, rand(i, 896) * 180, 0] });
    });
  }, { density: 1 }),

  floor_drain: defineModel('floor_drain', MATS, (m) => {
    // A square grating set in the floor.
    m.cube('drain', [-22, 0, -22], [22, 0.6, 22], { mat: 'drain', faces: ['up'] });
  }, { density: 2 }),

  door_sewers: defineModel('door_sewers', MATS, (m) => {
    // A steel door in chipped green paint (see doorkit.mjs for how doors go together): riveted round its border
    // and across two braces, a barred slot at eye height, a lever handle on each side, hung on two barrel hinges.
    // Its frame is bare steel, bolted, under a lintel painted with warning stripes, with brickwork above.
    // Locked, a red-painted bar lies across it in brackets bolted to the frame, padlocked, on both sides.
    const OW = 53, OH = 151;
    const zs = (s, a, b) => (s > 0 ? [a, b] : [-b, -a]); // a to b out from the middle, on the side s faces
    m.group('frame', () => {
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? -HALF : OW, x1 = s < 0 ? -OW : HALF;
        m.cube(`jamb_${s < 0 ? 'left' : 'right'}`, [x0, 0, -10], [x1, OH, 10], { mat: 'doorFrame', info: { axis: 'y', mid: (x0 + x1) / 2 } });
      }
      m.cube('lintel', [-HALF, OH, -11], [HALF, OH + 13, 11], { mat: 'doorLintel', info: { axis: 'x', mid: OH + 3 } });
      m.cube('brickwork', [-HALF, OH + 13, -8], [HALF, VAULT, 8], { mat: 'brickBond' });
      m.cube('sill', [-OW, 0, -10], [OW, 1, 10], { mat: 'rustyIron' });
    });
    m.group('leaf', () => {
      m.cube('plate', [-OW + 1, 1.5, -2.5], [OW - 1, OH - 1, 2.5], { mat: 'doorPlate' });
      bothFaces((s) => {
        const side = s > 0 ? 'front' : 'back', [z0, z1] = zs(s, 2.5, 4);
        const bar = (name, x0, y0, x1, y1, axis) => m.cube(`${name}_${side}`, [x0, y0, z0], [x1, y1, z1],
          { mat: 'doorBar', info: { axis, mid: axis === 'x' ? (y0 + y1) / 2 : (x0 + x1) / 2 } });
        bar('border_left', -OW + 1, 1.5, -OW + 7, OH - 1, 'y');
        bar('border_right', OW - 7, 1.5, OW - 1, OH - 1, 'y');
        bar('border_top', -OW + 7, OH - 7, OW - 7, OH - 1, 'x');
        bar('border_bottom', -OW + 7, 1.5, OW - 7, 7.5, 'x');
        bar('brace_low', -OW + 7, 47, OW - 7, 53, 'x');
        bar('brace_high', -OW + 7, 95, OW - 7, 101, 'x');
        [[-15, 117, 15, 119], [-15, 131, 15, 133], [-15, 119, -13, 131], [13, 119, 15, 131]].forEach(([x0, y0, x1, y1], i) =>
          m.cube(`slot_rim_${i + 1}_${side}`, [x0, y0, z0], [x1, y1, z1], { mat: 'rustyIron' }));
        // The lever: a boss on a mount, the handle pointing back toward the hinges.
        const [h0, h1] = zs(s, 2.5, 5.5);
        m.cube(`handle_mount_${side}`, [37, 66, h0], [44, 80, h1], { mat: 'rustyIron' });
        m.mesh(`handle_${side}`, tube([[40.5, 75, s * 6.8], [26, 72.5, s * 6.8]], { half: 1.4, side: [0, 0, 1] }), { mat: 'iron' });
      });
      // Barrel hinges, on the hinge line itself.
      for (const y of [16, 116]) m.mesh(`hinge_${y < 60 ? 'low' : 'high'}`, revolve([[0, 0], [3.4, 0], [3.4, 18], [0, 18]], { sides: 8 }), { mat: 'rustyIron', origin: [-OW, y, 0] });
    }, { origin: [-OW, 0, 0] });
    m.group('lock', () => {
      bothFaces((s) => {
        const side = s > 0 ? 'front' : 'back';
        const [b0, b1] = zs(s, 5, 9), [k0, k1] = zs(s, 4, 13), [p0, p1] = zs(s, 13, 16.5);
        m.cube(`bar_${side}`, [-HALF + 2, 70, b0], [HALF - 2, 78, b1], { mat: 'valvePaint' });
        for (const x of [-HALF + 2, HALF - 12]) m.cube(`bracket_${x < 0 ? 'left' : 'right'}_${side}`, [x, 66, k0], [x + 10, 82, k1], { mat: 'rustyIron' });
        m.cube(`padlock_${side}`, [50, 54, p0], [60, 65, p1], { mat: 'brass' });
        m.mesh(`shackle_${side}`, tube([[52, 64, s * 14.8], [52, 70, s * 14.8], [55, 72.5, s * 14.8], [58, 70, s * 14.8], [58, 64, s * 14.8]], { half: 0.9, side: [0, 0, 1] }), { mat: 'iron' });
      });
    });
  }, { density: 1 }),
};
