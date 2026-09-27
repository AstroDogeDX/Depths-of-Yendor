// Chests (see Level.addChest in src/world/level.js), and the mimic that passes for one. Origin on the floor at the
// middle, front facing +z. The game moves and shows their parts by name:
//   body     the chest itself. Its `lid` swings open about its pivot, on the hinge along the back of the chest's top.
//   lock     a locked chest's padlock, shown only while it's locked
//   broken   the wreck a smashed chest leaves, shown in place of its body (and lid)
// The mimic (monsters/mimic.bbmodel) is the chest as near as makes no difference, built by the same code: its wood a
// shade warmer, the slot of its keyhole a narrow slit, and the tips of its teeth just showing under its lid. Inside is
// a mouth: teeth round the rims of its `body` and `lid`, a `tongue`, and an `eye` over its keyhole that only shows once
// it's awake. Its body's pivot is on the floor at its back, so it rears up on it (see src/monsters/models.js).
import { defineModel, loft, tube, apex, latheRing, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, patches, bevel } from './materials.mjs';

const CHEST_PAL = {
  oak: P('#24170c', '#352213', '#48301b', '#5c3e23', '#6f4d2c', '#835d36'),
  // The mimic's wood: a shade warmer, as if there were blood in it.
  mimicOak: P('#28160c', '#3a2114', '#4e2e1c', '#633b24', '#784a2d', '#8c5936'),
  inside: P('#100a06', '#191009', '#23160d', '#2e1d11'),
  endGrain: P('#2c1d10', '#402a18', '#553921', '#6a482b'),
  flesh: P('#1c0507', '#30090c', '#4a0f14', '#661a1e', '#82262a', '#9c3836'),
  tongue: P('#3a0c14', '#5e1620', '#83242e', '#a8363c', '#c4504e', '#dc7a70'),
  tooth: P('#5c5238', '#857a5a', '#aca17c', '#cbc29e', '#e2dbba', '#f2eed6'),
  eye: P('#3a1002', '#7a2a04', '#c05a08', '#f09020', '#ffc850', '#fff0a0'),
  strong: P('#120a07', '#1b100b', '#26160f', '#321d13', '#3f2518'), // the strongbox's dark-stained oak
};

// The chest (and the mimic): half its width and depth, the height of its body, and how thick its boards are; its lid,
// a straight skirt and a barrel top of SLATS slats rising RISE over it, hinged along the back.
const W = 26, D = 17, BH = 24, T = 2.5;
const SKIRT = 2, RISE = 9, SLATS = 8;
const HINGE = [0, BH, -D];
// The strongbox (the locked chest): bigger, squarer, on iron feet, with a flat lid.
const SW = 28, SD = 18, FOOT = 2, SBH = 24, LID_T = 8;
const STOP = FOOT + SBH; // the top of its body

const side = (s) => (s < 0 ? 'left' : 'right');

/** The lid's end as [z, y] points: up the back skirt, over the barrel top, down the front skirt. `g` grows it all round. */
const lidProfile = (g = 0) => {
  const pts = [[-(D + g), BH]];
  for (let i = 0; i <= SLATS; i++) {
    const a = (Math.PI * i) / SLATS;
    pts.push([-(D + g) * Math.cos(a), BH + SKIRT + (RISE + g) * Math.sin(a)]);
  }
  pts.push([D + g, BH]);
  return pts;
};
const UNDERSIDE = SLATS + 2; // the side of the lid's loft (see lib.mjs) from its front edge back to the start
/** The lid from x0 to x1; or a band over it, grown by `g`, without its underside or its ends, which are in the lid. */
const lidLoft = (x0, x1, g = 0) => loft([x0, x1].map((x) => lidProfile(g).map(([z, y]) => [x, y, z])), { capStart: !g, capEnd: !g })
  .filter((f) => !g || f.side !== UNDERSIDE);

/** A four-sided tooth at (x, z), its base at y0 and its tip at y1 (above or below). */
const tooth = (x, z, y0, y1) => loft([latheRing(y0, 1.5, 1.5, 4, Math.PI / 4), apex(4, [0, y1, 0])])
  .map((f) => ({ ...f, pts: f.pts.map(([px, py, pz]) => [px + x, py, pz + z]) }));

/**
 * A flat bar along a path in the y-z plane (a tongue): `w(f)` half its width across x, `t(f)` half its thickness,
 * f running 0..1 along it.
 */
function flatBar(path, w, t) {
  const n = path.length;
  return loft(path.map((c, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    const len = Math.hypot(b[1] - a[1], b[2] - a[2]) || 1;
    const ny = (b[2] - a[2]) / len, nz = -(b[1] - a[1]) / len; // across the path, in the y-z plane
    const f = i / (n - 1), hw = w(f), ht = t(f);
    return [[-hw, ht], [hw, ht], [hw, -ht], [-hw, -ht]].map(([x, s]) => [c[0] + x, c[1] + ny * s, c[2] + nz * s]);
  }));
}

/** A ring in the y-z plane at x, `r` across, centred at (y, z): a handle. */
const ringYZ = (x, y, z, r, n = 10) => Array.from({ length: n }, (_, k) => {
  const a = (k / n) * Math.PI * 2;
  return [x, y + r * Math.cos(a), z + r * Math.sin(a)];
});

// ---------- painters ----------

/** Dark boards inside a chest. */
const inside = (c) => ramp(CHEST_PAL.inside, 0.45 + 0.16 * patches(c.p, 1900, 0.4) + (fract(c.p.y / 6) < 0.12 ? -0.3 : 0), c.ax, c.ay);
/** The inside of a mimic: a mouth, dark red and wet, ridged across. */
function flesh(c) {
  const { p } = c;
  let v = 0.42 + 0.2 * patches(p, 1910, 0.5) + 0.12 * c.n.y;
  if (fract(p.z * 0.3 + p.x * 0.05 + noise3(p.x * 0.2, p.y * 0.2, p.z * 0.2, 1911) * 0.6) < 0.18) v -= 0.16; // ridges
  if (rand(c.ax, c.ay, 1912) > 0.965) v += 0.35; // wet glints
  return ramp(CHEST_PAL.flesh, v, c.ax, c.ay);
}

/**
 * A chest's boards (`pal` its wood): planks laid lengthways round the body, 6 px high, their grain along them; barrel
 * slats over the lid (`info.lid`); dark boards inside, and end grain along the rims. A mimic's (`mouth`) are flesh
 * inside and on the rims, and the tips of its teeth show under the front of its lid, at `tips` (x).
 */
const boards = (pal, { mouth = false, tips = [] } = {}) => (c) => {
  const { p, n, info } = c;
  if (info.lid) {
    if (info.side === UNDERSIDE) return mouth ? flesh(c) : inside(c);
    if (!info.cap && info.side >= 1 && info.side <= SLATS) {
      // A slat, its grain running along it, a dark seam at its edges.
      let v = 0.5 + 0.18 * (rand(info.side, 1920) - 0.5) + 0.1 * (noise3(p.x * 0.3, info.side * 3, 0, 1921) - 0.5) + bevel(c, 0.1);
      if (fract(p.x * 0.09 + noise3(p.x * 0.05, info.side, 0, 1922) * 0.8) < 0.12) v -= 0.12;
      if (c.edge < 1) v = 0.12;
      return ramp(CHEST_PAL[pal], v, c.ax, c.ay);
    }
  }
  // The rims, and the broken tops of a wreck's boards: end grain.
  if (n.y > 0.9 && (info.broken || (!info.lid && !info.loose && p.y > BH - 0.01))) {
    return mouth ? flesh(c) : ramp(CHEST_PAL.endGrain, 0.5 + 0.2 * patches(p, 1923, 0.6) + (fract(p.x * 0.7) < 0.2 ? -0.15 : 0), c.ax, c.ay);
  }
  if (!info.lid && !info.loose && Math.abs(p.x) < W - T + 0.01 && Math.abs(p.z) < D - T + 0.01 && p.y > 1.99) return mouth ? flesh(c) : inside(c);
  if (mouth && n.z > 0.9 && p.z > D - 0.01 && p.y > BH - 1.8 && tips.some((x) => Math.abs(p.x - x) < (p.y - (BH - 1.8)) * 0.5)) {
    return ramp(CHEST_PAL.tooth, 0.75, c.ax, c.ay);
  }
  // Planks laid lengthways, 6 px high.
  const along = Math.abs(n.x) > 0.5 ? p.z : p.x;
  const k = Math.floor(p.y / 6), f = fract(p.y / 6), face = n.x > 0.5 ? 1 : n.x < -0.5 ? 2 : n.z > 0 ? 3 : 4;
  let v = 0.5 + 0.18 * (rand(k, face, 1901) - 0.5) + 0.1 * (noise3(along * 0.3, k * 3, face, 1902) - 0.5) + bevel(c, 0.1);
  if (fract(along * 0.09 + noise3(along * 0.05, p.y * 0.4, k, 1903) * 0.8) < 0.12) v -= 0.12; // grain
  if (rand(k, Math.floor(along / 7), face, 1904) > 0.97) v -= 0.2; // knots
  if (Math.abs(n.y) < 0.5 && (f < 0.1 || f > 0.95)) v = 0.12; // the seam between planks
  return ramp(CHEST_PAL[pal], v, c.ax, c.ay);
};

/** Iron banding, rusted, riveted every 6 px down the middle of a band (`info.cx`), along z over a lid. */
function band(c) {
  const { p, n, info } = c;
  if (info.cx !== undefined && Math.abs(p.x - info.cx) < 0.8 && (Math.abs(n.z) > 0.5 || n.y > 0.3) &&
      Math.abs(fract((info.lid ? p.z : p.y) / 6) - 0.5) < 0.14) {
    return ramp(PAL.iron, 0.82 + 0.1 * n.y, c.ax, c.ay);
  }
  return MAT.rustyIron(c);
}

/** An iron lock plate, bevelled, with its keyhole at (0, `ky`): a round hole and a slot, or a mimic's narrow slit. */
const lockPlate = (ky, slit) => (c) => {
  const { p, n } = c;
  if (n.z > 0.9) {
    const kx = p.x, dy = p.y - ky;
    if (slit ? Math.abs(kx) < 0.4 && Math.abs(dy + 0.8) < 2.4 : Math.hypot(kx, dy) < 1.1 || (Math.abs(kx) < 0.45 && dy < 0 && dy > -2.6)) {
      return slit ? [46, 14, 8, 255] : [10, 8, 6, 255];
    }
    if (c.edge < 1.5) return ramp(PAL.iron, 0.72, c.ax, c.ay);
  }
  return ramp(PAL.iron, 0.42 + 0.14 * patches(p, 1930, 0.5) + bevel(c, 0.2), c.ax, c.ay);
};

/** A tooth, yellowed toward its root (`info.root`, the y it grows from) and pale at its tip. */
function toothPaint(c) {
  const t = Math.min(1, Math.abs(c.p.y - c.info.root) / 2.6);
  return ramp(CHEST_PAL.tooth, 0.3 + 0.6 * t + 0.1 * c.n.y + bevel(c, 0.1), c.ax, c.ay);
}

/** The tongue: glossy, a groove down its middle. */
function tonguePaint(c) {
  const { p, n } = c;
  let v = 0.45 + 0.25 * n.y + 0.12 * patches(p, 1940, 0.6);
  if (n.y > 0.5 && Math.abs(p.x) < 0.5) v -= 0.25;
  if (n.y > 0.5 && rand(c.ax, c.ay, 1941) > 0.9) v += 0.3;
  return ramp(CHEST_PAL.tongue, v, c.ax, c.ay);
}

/** Emissive: the mimic's eye, set over its keyhole (centred at `info.ky`): amber, almond-shaped, round a slit pupil. */
function eyePaint(c) {
  const { p, n, info } = c;
  const dx = p.x, dy = p.y - info.ky, r = Math.hypot(dx / 2.4, dy / 2.9);
  if (n.z < 0.9 || r > 1) return [14, 4, 2, 255];
  if (Math.abs(dx) < 0.5 * (1 - Math.abs(dy) / 3.2) && Math.abs(dy) < 2.5) return [4, 1, 0, 255];
  return ramp(CHEST_PAL.eye, 0.98 - 0.6 * r + 0.08 * patches(p, 1950, 1.5), c.ax, c.ay);
}

/** Gold, bevelled, worked with a border (`info.border`: texels in from its edge). */
function goldWork(c) {
  let v = 0.55 + 0.12 * patches(c.p, 1960, 0.4) + 0.14 * c.n.y + bevel(c, 0.25);
  if (c.info.border && Math.min(c.W, c.H) > 8 && Math.abs(c.edge - c.info.border) < 0.8) v -= 0.3;
  return ramp(PAL.gold, v, c.ax, c.ay);
}

/** The strongbox's gold lock plate: a border, and a keyhole at (0, `info.ky`). */
function goldPlate(c) {
  const { p, n, info } = c;
  if (n.z > 0.9) {
    const dy = p.y - info.ky;
    if (Math.hypot(p.x, dy) < 1.3 || (Math.abs(p.x) < 0.55 && dy < 0 && dy > -3)) return [10, 7, 4, 255];
  }
  return goldWork(c);
}

/** The strongbox's boards: dark-stained planks, dark inside; its lid's planks run along it, and inside is its underside. */
function strongBoards(c) {
  const { p, n, info } = c;
  if (info.lid ? n.y < -0.9 : Math.abs(p.x) < SW - T + 0.01 && Math.abs(p.z) < SD - T + 0.01 && p.y > FOOT + 1.99) return inside(c);
  if (!info.lid && n.y > 0.9) return ramp(CHEST_PAL.endGrain, 0.35 + 0.15 * patches(p, 1970, 0.6), c.ax, c.ay);
  const across = info.lid && n.y > 0.9 ? p.z : p.y, along = Math.abs(n.x) > 0.5 ? p.z : p.x;
  const k = Math.floor(across / 6), f = fract(across / 6);
  let v = 0.5 + 0.16 * (rand(k, 1971) - 0.5) + 0.1 * (noise3(along * 0.3, k * 3, 0, 1972) - 0.5) + bevel(c, 0.12);
  if (fract(along * 0.09 + noise3(along * 0.05, across * 0.4, k, 1973) * 0.8) < 0.12) v -= 0.12;
  if (f < 0.1 || f > 0.95) v = 0.1;
  return ramp(CHEST_PAL.strong, v, c.ax, c.ay);
}

const TIPS = [-21, -10, 9, 22]; // where the mimic's teeth show under the front of its lid

const MATS = {
  ...MAT,
  boards: boards('oak'),
  mimicBoards: boards('mimicOak', { mouth: true, tips: TIPS }),
  band,
  lockPlate: lockPlate(17.5, false),
  mimicLockPlate: lockPlate(17.5, true),
  tooth: toothPaint,
  tongue: tonguePaint,
  mimicEye: eyePaint,
  goldWork,
  goldPlate,
  strongBoards,
};

// ---------- the chest, and the mimic ----------

/** The chest, or (`mimic`) the mimic: see the top of this file. */
// Which faces of a cube to keep (see lib.mjs): only those that can be seen, so none sits in the plane of another.
const FRONT_BACK = ['north', 'south', 'up'], ENDS = ['east', 'west', 'up'];

function chest(m, mimic) {
  const wood = mimic ? 'mimicBoards' : 'boards';
  m.group('body', () => {
    m.cube('bottom', [-W, 0, -D], [W, 2, D], { mat: wood, faces: ['up'] });
    m.cube('front', [-W, 0, D - T], [W, BH, D], { mat: wood, faces: FRONT_BACK });
    m.cube('back', [-W, 0, -D], [W, BH, -D + T], { mat: wood, faces: FRONT_BACK });
    for (const s of [-1, 1]) {
      m.cube(`end_${side(s)}`, [s < 0 ? -W : W - T, 0, -D + T], [s < 0 ? -W + T : W, BH, D - T], { mat: wood, faces: ENDS });
      // Ironwork: bands down the front and back, the corners, a handle on each end.
      const [x0, x1] = [s * 15, s * 19].sort((a, b) => a - b);
      m.cube(`band_front_${side(s)}`, [x0, 0, D], [x1, BH, D + 0.6], { mat: 'band', info: { cx: s * 17 }, faces: ['south', 'east', 'west', 'up'] });
      m.cube(`band_back_${side(s)}`, [x0, 0, -D - 0.6], [x1, BH, -D], { mat: 'band', info: { cx: s * 17 }, faces: ['north', 'east', 'west', 'up'] });
      for (const f of [-1, 1]) {
        m.cube(`corner_${f < 0 ? 'back' : 'front'}_${side(s)}`, [s < 0 ? -W - 0.6 : W - 3.2, 0, f < 0 ? -D - 0.6 : D - 3.2],
          [s < 0 ? -W + 3.2 : W + 0.6, BH, f < 0 ? -D + 3.2 : D + 0.6], { mat: 'band' });
      }
      m.cube(`handle_plate_${side(s)}`, [s < 0 ? -W - 0.8 : W, 14, -4], [s < 0 ? -W : W + 0.8, 18.5, 4], { mat: 'band' });
      m.mesh(`handle_${side(s)}`, tube(ringYZ(s * (W + 1.6), 13, 0, 3.4), { half: 0.6, closed: true, side: [1, 0, 0] }), { mat: 'rustyIron' });
    }
    m.cube('lock_plate', [-5, 13, D], [5, 22.5, D + 0.8], { mat: mimic ? 'mimicLockPlate' : 'lockPlate' });
    if (mimic) {
      // Its lower teeth round the rims of the front and ends (none along the hinge), their tips just under the lid.
      const z = D - T - 1.3, x = W - T - 1.3;
      m.mesh('teeth_low', [
        ...Array.from({ length: 9 }, (_, i) => tooth(-20 + i * 5, z, 21.2, 23.8)),
        ...[-10, -4, 2, 8].flatMap((tz) => [-1, 1].map((s) => tooth(s * x, tz, 21.2, 23.8))),
      ].flat(), { mat: 'tooth', info: { root: 21.2 } });
      // Its tongue, lying in its mouth from its throat at the back; and its eye, over the keyhole.
      m.group('tongue', () => {
        m.mesh('tongue', flatBar([[0, 11, -13.5], [0, 13, -8], [0, 16, -2], [0, 18.5, 4], [0, 19.6, 8.5], [0, 19.4, 12]],
          (f) => 3.8 - 1.4 * f * f, (f) => 1.2 - 0.5 * f), { mat: 'tongue' });
      }, { origin: [0, 12, -13] });
      m.group('eye', () => {
        m.cube('eye', [-2.6, 14.4, D + 0.8], [2.6, 20.6, D + 1.05], { mat: 'mimicEye', info: { ky: 17.5 } });
      }, { origin: [0, 17.5, D + 0.9] });
    }
    m.group('lid', () => {
      m.mesh('lid', lidLoft(-W, W), { mat: wood, info: { lid: true } });
      for (const s of [-1, 1]) {
        const [x0, x1] = [s * 15, s * 19].sort((a, b) => a - b);
        m.mesh(`lid_band_${side(s)}`, lidLoft(x0, x1, 0.6), { mat: 'band', info: { cx: s * 17, lid: true } });
      }
      m.cube('lid_rim', [-W, BH, D], [W, BH + 1.2, D + 0.5], { mat: 'band' });
      m.cube('hasp', [-2.2, 20.5, D + 0.8], [2.2, BH + SKIRT + 0.4, D + 1.5], { mat: 'band' });
      if (mimic) {
        // Its upper teeth, hanging from the lid between the lower ones.
        const z = D - T - 1.3, x = W - T - 1.3;
        m.mesh('teeth_high', [
          ...Array.from({ length: 8 }, (_, i) => tooth(-17.5 + i * 5, z, BH, 21.4)),
          ...[-7, -1, 5, 11].flatMap((tz) => [-1, 1].map((s) => tooth(s * x, tz, BH, 21.4))),
        ].flat(), { mat: 'tooth', info: { root: BH } });
      }
    }, { origin: HINGE });
  }, { origin: mimic ? [0, 0, -D] : [0, 0, 0] });
}

/** What's left of a smashed chest: the back and a corner standing, stubs of the rest, and the pieces strewn about. */
function wreck(m) {
  m.group('broken', () => {
    const loose = { mat: 'boards', info: { loose: true } }, broken = { mat: 'boards', info: { broken: true } };
    // (Its floor a hair inside the walls' faces, so it never shares their plane where they're broken away.)
    m.cube('bottom', [-W + 0.3, 0, -D + 0.3], [W - 0.3, 2, D - 0.3], { mat: 'boards', faces: ['up', 'north', 'south', 'east', 'west'] });
    // The back, broken off raggedly, and splinters sticking up from the breaks.
    for (const [x0, x1, h] of [[-W, -8, 19], [-8, 9, 12], [9, W, 16]]) m.cube(`back_${x0}`, [x0, 0, -D], [x1, h, -D + T], broken);
    for (const [x, h] of [[-9.5, 16], [-6.5, 15], [7.5, 14.5], [10.5, 18.5]]) m.cube(`splinter_back_${x}`, [x - 0.6, h - 4, -D + 0.4], [x + 0.6, h, -D + 1.6], broken);
    m.cube('end_left', [-W, 0, -D + T], [-W + T, 15, 0], broken);
    m.cube('end_left_low', [-W, 0, 0], [-W + T, 7, D - T], broken);
    m.cube('end_right', [W - T, 0, -D + T], [W, 6, D - T], broken);
    m.cube('front_left', [-W, 0, D - T], [-14, 9, D], broken);
    m.cube('front_right', [12, 0, D - T], [W, 4, D], broken);
    // Its ironwork: the back bands and corners still on, a band torn away and bent.
    m.cube('band_back_left', [-19, 0, -D - 0.6], [-15, 19, -D], { mat: 'band', info: { cx: -17 } });
    m.cube('band_back_right', [15, 0, -D - 0.6], [19, 16, -D], { mat: 'band', info: { cx: 17 } });
    m.cube('corner_back_left', [-W - 0.6, 0, -D - 0.6], [-W + 3.2, 19, -D + 3.2], { mat: 'band' });
    m.cube('corner_back_right', [W - 3.2, 0, -D - 0.6], [W + 0.6, 16, -D + 3.2], { mat: 'band' });
    m.mesh('band_bent', tube([[-24, 0.6, 21], [-15, 0.6, 24], [-8, 1.6, 26], [-4, 4.5, 25.5], [-3, 7, 23]], { half: 0.55, side: [0, 1, 0] }), { mat: 'rustyIron' });
    // Boards knocked out of it, lying about.
    m.cube('plank_1', [-9, 0, -2.4], [9, 1.6, 2.4], { ...loose, origin: [-6, 0.8, 26], rotation: [0, 18, 0] });
    m.cube('plank_2', [-7, 0, -2.2], [7, 1.6, 2.2], { ...loose, origin: [18, 0.8, 27], rotation: [0, -35, 0] });
    m.cube('plank_3', [-8, 0, -2.4], [8, 1.6, 2.4], { ...loose, origin: [30, 2.2, 6], rotation: [0, 80, 12] });
    // Half the lid, fallen off in front, on its back.
    m.mesh('lid_half', lidLoft(0, 24), { mat: 'boards', info: { lid: true }, origin: [-4, 0, 27], rotation: [180, 12, 0] });
    for (let i = 0; i < 5; i++) {
      const x = -18 + i * 9 + rand(i, 1980) * 4, z = 20 + rand(i, 1981) * 9;
      m.cube(`chip_${i + 1}`, [-1.4, 0, -0.4], [1.4, 0.8, 0.4], { ...loose, origin: [x, 0.4, z], rotation: [0, rand(i, 1982) * 180, 0] });
    }
  });
}

/** The strongbox, which a gold key opens: dark oak bound all over in iron, on iron feet, gold at its corners. */
function strongbox(m) {
  const band = { mat: 'band' };
  m.group('body', () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      m.cube(`foot_${sz < 0 ? 'back' : 'front'}_${side(sx)}`, [sx < 0 ? -SW : SW - 5, 0, sz < 0 ? -SD : SD - 5], [sx < 0 ? -SW + 5 : SW, FOOT, sz < 0 ? -SD + 5 : SD], band);
    }
    m.cube('bottom', [-SW, FOOT, -SD], [SW, FOOT + 2, SD], { mat: 'strongBoards', faces: ['up'] });
    m.cube('front', [-SW, FOOT, SD - T], [SW, STOP, SD], { mat: 'strongBoards', faces: FRONT_BACK });
    m.cube('back', [-SW, FOOT, -SD], [SW, STOP, -SD + T], { mat: 'strongBoards', faces: FRONT_BACK });
    for (const s of [-1, 1]) m.cube(`end_${side(s)}`, [s < 0 ? -SW : SW - T, FOOT, -SD + T], [s < 0 ? -SW + T : SW, STOP, SD - T], { mat: 'strongBoards', faces: ENDS });
    // Three bands round it, the corners bound, heavy handles.
    [[FOOT + 2, FOOT + 5.5], [FOOT + 10.5, FOOT + 14], [FOOT + 19, FOOT + 22.5]].forEach(([y0, y1], i) => {
      m.cube(`band_${i + 1}_front`, [-SW - 0.7, y0, SD], [SW + 0.7, y1, SD + 0.7], { ...band, faces: ['south', 'up'] });
      m.cube(`band_${i + 1}_back`, [-SW - 0.7, y0, -SD - 0.7], [SW + 0.7, y1, -SD], { ...band, faces: ['north', 'up'] });
      for (const s of [-1, 1]) m.cube(`band_${i + 1}_${side(s)}`, [s < 0 ? -SW - 0.7 : SW, y0, -SD], [s < 0 ? -SW : SW + 0.7, y1, SD], { ...band, faces: [s < 0 ? 'west' : 'east', 'up'] });
    });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      m.cube(`corner_${sz < 0 ? 'back' : 'front'}_${side(sx)}`, [sx < 0 ? -SW - 1 : SW - 4, FOOT, sz < 0 ? -SD - 1 : SD - 4],
        [sx < 0 ? -SW + 4 : SW + 1, STOP, sz < 0 ? -SD + 4 : SD + 1], band);
    }
    for (const s of [-1, 1]) {
      m.cube(`handle_plate_${side(s)}`, [s < 0 ? -SW - 1.2 : SW + 0.7, 14, -5], [s < 0 ? -SW - 0.7 : SW + 1.2, 19, 5], band);
      m.mesh(`handle_${side(s)}`, tube(ringYZ(s * (SW + 2.2), 13.5, 0, 4), { half: 0.7, closed: true, side: [1, 0, 0] }), { mat: 'rustyIron' });
    }
    // A gold lock plate, and the staple the padlock hangs from.
    m.cube('lock_plate', [-6.5, 9, SD + 0.7], [6.5, 23.5, SD + 1.6], { mat: 'goldPlate', info: { ky: 14.5, border: 2.5 } });
    m.cube('staple', [-1.4, 20, SD + 1.6], [1.4, 21.6, SD + 4.6], band);
    m.group('lid', () => {
      m.cube('lid', [-SW, STOP, -SD], [SW, STOP + LID_T, SD], { mat: 'strongBoards', info: { lid: true } });
      m.cube('lid_frame_front', [-SW - 0.7, STOP, SD], [SW + 0.7, STOP + 2.6, SD + 0.7], band);
      m.cube('lid_frame_back', [-SW - 0.7, STOP, -SD - 0.7], [SW + 0.7, STOP + 2.6, -SD], band);
      for (const s of [-1, 1]) {
        m.cube(`lid_frame_${side(s)}`, [s < 0 ? -SW - 0.7 : SW, STOP, -SD], [s < 0 ? -SW : SW + 0.7, STOP + 2.6, SD], band);
        const [x0, x1] = [s * 16, s * 20].sort((a, b) => a - b);
        m.cube(`lid_strap_${side(s)}`, [x0, STOP, -SD - 0.7], [x1, STOP + LID_T + 0.7, SD + 0.7], { mat: 'band', info: { cx: s * 18, lid: true } });
        for (const f of [-1, 1]) {
          m.cube(`lid_corner_${f < 0 ? 'back' : 'front'}_${side(s)}`, [s < 0 ? -SW - 1 : SW - 6, STOP + LID_T - 1.4, f < 0 ? -SD - 1 : SD - 6],
            [s < 0 ? -SW + 6 : SW + 1, STOP + LID_T + 0.9, f < 0 ? -SD + 6 : SD + 1], { mat: 'goldWork' });
        }
      }
      m.cube('plaque', [-8, STOP + LID_T, -5], [8, STOP + LID_T + 0.8, 5], { mat: 'goldWork', info: { border: 2 } });
      m.cube('hasp', [-2.4, 20.6, SD + 1.6], [2.4, STOP + 2, SD + 2.4], band);
    }, { origin: [0, STOP, -SD] });
    // The padlock through the staple, gold, heavy.
    m.group('lock', () => {
      m.cube('padlock', [-3.8, 12.4, SD + 2.6], [3.8, 19.4, SD + 5], { mat: 'goldPlate', info: { ky: 16.4 } });
      m.mesh('shackle', tube([[-2.2, 19, SD + 3.8], [-2.2, 21.2, SD + 3.8], [-1.3, 22.8, SD + 3.8], [1.3, 22.8, SD + 3.8], [2.2, 21.2, SD + 3.8], [2.2, 19, SD + 3.8]],
        { half: 0.6, side: [0, 0, 1] }), { mat: 'iron' });
    }, { origin: [0, 21, SD + 3.8] });
  });
}

export const chests = {
  chest: defineModel('chest', MATS, (m) => {
    chest(m, false);
    wreck(m);
  }),
  chest_locked: defineModel('chest_locked', MATS, (m) => strongbox(m)),
};

export const mimic = defineModel('mimic', MATS, (m) => chest(m, true), { glow: ['mimicEye'] });
