// Monsters, rigged for the game's animation: every moving part is a group ("bone") pivoting at its joint,
// found by name (body, head, arm_left, arm_right, leg_left, leg_right, plus wing_*, tail, leg_* and blob on
// the odd ones out). Origin = between the feet, facing +z (south).
import { defineModel, loft, lathe, revolve, tube, apex, latheRing, octRingZ, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, clamp01, patches, bevel } from './materials.mjs';

const MON_PAL = {
  goblin: P('#1e2c10', '#2d4217', '#3e5a1f', '#527428', '#678c33', '#7ea43f'),
  archer: P('#1a280e', '#284014', '#37561c', '#476e24', '#5a862d', '#6e9c38'),
  rag: P('#1c130c', '#2a1d12', '#3a2819', '#4b3421', '#5d412a', '#6f4f33'),
  hood: P('#0e1a0e', '#152614', '#1e341c', '#284424', '#33552e', '#3f6739'),
  bone: P('#4a4232', '#6e6450', '#938870', '#b3a98f', '#cdc4aa', '#e2dac2', '#f2ecd8'),
  orc: P('#1f2614', '#2f3a1e', '#414f29', '#546535', '#687b42', '#7c9150'),
  hide: P('#140e0a', '#221710', '#302117', '#402c1f', '#503828', '#604532'),
  imp: P('#2a0604', '#480c06', '#6a1408', '#8e1e0c', '#b02a10', '#cc4418'),
  impDark: P('#140302', '#240604', '#3a0a06', '#501008'),
  troll: P('#1c221c', '#2a322a', '#3a443a', '#4b574b', '#5d6a5d', '#707e70'),
  moss: P('#1c2a10', '#2a3e16', '#3a521e', '#4c6a26'),
  stone: P('#2a2926', '#3d3c38', '#52504b', '#686660', '#7e7c75', '#95938b', '#aeaca4'),
  warden: P('#120e1a', '#1c1628', '#272036', '#322a46', '#3e3556', '#4b4168'),
  plate: P('#110d18', '#1a1426', '#251d36', '#312746', '#3e3358', '#4d426c', '#5e5480'),
  cape: P('#1a0610', '#2a0a1a', '#3c1026', '#501632', '#641e40'),
  rat: P('#1e150f', '#2e2218', '#3f3022', '#513e2d', '#634d38', '#765d44'),
  pink: P('#5a3a34', '#7a504a', '#9a6a60', '#b88878', '#d0a494'),
  batFur: P('#120c0a', '#1e1512', '#2a1e1a', '#382823', '#46332c'),
  membrane: P('#1a0f0c', '#2a1a15', '#3b2620', '#4d332b'),
  gel: P('#0e3a10', '#18561a', '#227226', '#2e9032', '#3eae40', '#62cc5a', '#a8ecb0'),
  robe: P('#08060e', '#0f0b1a', '#171126', '#1f1834', '#282042'),
  wood: PAL.wood,
  steel: PAL.steel,
  iron: PAL.iron,
  gold: PAL.gold,
  eyeRed: P('#5a0804', '#a01808', '#e03a14', '#ff7a3a', '#ffd0a0'),
  eyeYellow: P('#5a3a04', '#a07008', '#e0b020', '#ffe060', '#fff6c0'),
  eyeOrange: P('#5a2004', '#a04008', '#e07014', '#ffa040', '#ffe0a0'),
  eyeCyan: P('#04303a', '#086070', '#10a0b8', '#60e0f0', '#d0fbff'),
  eyeGold: P('#5a4004', '#a07808', '#e0b820', '#ffe070', '#fff8d0'),
  ember: P('#3a0802', '#7a1604', '#c03008', '#f05a10', '#ff8c28', '#ffc050', '#fff0b0'),
  black: P('#000000', '#050408', '#0a0810'),
};

// Painters. `pal` names a palette in MON_PAL.
const skin = (pal, { warts = 0, seed = 0, shine = 0.08 } = {}) => (c) => {
  let v = 0.5 + 0.16 * patches(c.p, 400 + seed, 0.3) + bevel(c, 0.12) + shine * c.n.y;
  if (warts && rand(c.ax, c.ay, 401 + seed) > 1 - warts) v -= 0.22;
  return ramp(MON_PAL[pal], v, c.ax, c.ay);
};
const cloth = (pal, seed = 0) => (c) => {
  const { p } = c;
  let v = 0.46 + 0.14 * patches(p, 410 + seed, 0.35) + bevel(c, 0.1);
  if ((c.ax + c.ay) % 3 === 0) v -= 0.06; // weave
  if (fract(p.x * 0.25 + 0.6 * noise3(p.x * 0.1, p.y * 0.05, p.z * 0.1, 411 + seed)) < 0.08) v -= 0.18; // folds
  return ramp(MON_PAL[pal], v, c.ax, c.ay);
};
const metal = (pal, seed = 0) => (c) => {
  let v = 0.5 + 0.12 * patches(c.p, 420 + seed, 0.3) + bevel(c, 0.22) + 0.1 * c.n.y;
  if (rand(c.ax, c.ay, 421 + seed) > 0.975) v -= 0.18;
  return ramp(MON_PAL[pal], v, c.ax, c.ay);
};
const glowing = (pal) => (c) => ramp(MON_PAL[pal], 0.55 + 0.35 * Math.max(0, c.n.z) + 0.1 * patches(c.p, 430, 1), c.ax, c.ay);

const trollSkin = skin('troll', { warts: 0.05, seed: 5 });
const platePaint = metal('plate', 7);

const MATS = {
  ...MAT,
  goblin: skin('goblin', { warts: 0.04 }),
  archer: skin('archer', { warts: 0.04, seed: 1 }),
  rag: cloth('rag'),
  hood: cloth('hood', 1),
  bone(c) {
    const { p } = c;
    let v = 0.58 + 0.14 * patches(p, 440, 0.4) + bevel(c, 0.15) + 0.08 * c.n.y;
    if (fract(noise3(p.x * 0.3, p.y * 0.3, p.z * 0.3, 441) * 6) < 0.05) v -= 0.3; // cracks
    return ramp(MON_PAL.bone, v, c.ax, c.ay);
  },
  // Rib cage: bands of bone with the gaps between them cut away.
  ribs(c) {
    const { p, info } = c;
    const f = fract((p.y - info.base) / info.pitch);
    if (f > 0.55 && Math.abs(p.x) > 1.2) return [0, 0, 0, 0];
    return MATS.bone(c);
  },
  socket: (c) => ramp(MON_PAL.black, 0.5, c.ax, c.ay),
  orc: skin('orc', { warts: 0.02, seed: 2 }),
  hide: cloth('hide', 2),
  imp: skin('imp', { seed: 3, shine: 0.15 }),
  impDark: skin('impDark', { seed: 4 }),
  // Troll hide with patches of moss on the upward-facing parts.
  troll: (c) => (noise3(c.p.x * 0.12, c.p.y * 0.12, c.p.z * 0.12, 450) > 0.66 && c.n.y > -0.2
    ? ramp(MON_PAL.moss, 0.4 + 0.3 * patches(c.p, 451, 0.6), c.ax, c.ay) : trollSkin(c)),
  stone(c) {
    const { p } = c;
    let v = 0.5 + 0.16 * patches(p, 460, 0.18) + bevel(c, 0.2) + 0.06 * c.n.y;
    if (fract(noise3(p.x * 0.08, p.y * 0.08, p.z * 0.08, 461) * 5) < 0.06) v = 0.1; // cracks
    return ramp(MON_PAL.stone, v, c.ax, c.ay);
  },
  warden: skin('warden', { seed: 6 }),
  plate(c) {
    const { p, info } = c;
    // Gilded bands where the armour is trimmed.
    if (info.trim && info.trim.some(([lo, hi]) => p.y > lo && p.y < hi)) return ramp(PAL.gold, 0.55 + 0.25 * c.n.y, c.ax, c.ay);
    return platePaint(c);
  },
  cape: cloth('cape', 3),
  rat: (c) => ramp(MON_PAL.rat, 0.45 + 0.16 * patches(c.p, 470, 0.5) + ((c.ax * 3 + c.ay) % 4 === 0 ? -0.1 : 0) + 0.1 * c.n.y, c.ax, c.ay),
  pink: skin('pink', { seed: 8 }),
  batFur: skin('batFur', { seed: 9 }),
  membrane(c) {
    const { p } = c;
    let v = 0.45 + 0.1 * patches(p, 480, 0.5);
    if (fract(Math.atan2(p.z, Math.abs(p.x)) * 1.6) < 0.1) v = 0.15; // finger bones through the skin
    return ramp(MON_PAL.membrane, v, c.ax, c.ay);
  },
  // Slime gel, see-through: bright toward the top, with a glint.
  gel(c) {
    const { p, n } = c;
    let v = 0.45 + 0.25 * n.y + 0.1 * patches(p, 490, 0.3);
    if (n.y > 0.3 && n.z > 0.3 && n.x > 0.1) v = 0.95;
    const col = ramp(MON_PAL.gel, v, c.ax, c.ay);
    return [...col, v > 0.9 ? 230 : 140];
  },
  core: skin('gel', { seed: 10 }),
  // Wraith robe, see-through, its hem ragged: texels below a wavy line are cut away.
  robe(c) {
    const { p } = c;
    const hem = 3 + 4 * noise3(Math.atan2(p.z, p.x) * 3, 0, 0, 500) + 2 * rand(Math.floor(Math.atan2(p.z, p.x) * 20), 501);
    if (p.y < hem) return [0, 0, 0, 0];
    const col = ramp(MON_PAL.robe, 0.45 + 0.2 * patches(p, 502, 0.2) + 0.2 * clamp01((p.y - 60) / 50), c.ax, c.ay);
    return [...col, 215];
  },
  void: (c) => ramp(MON_PAL.black, 0, c.ax, c.ay),
  wood: (c) => MAT.wood(c),
  steel: metal('steel', 11),
  ironDark: metal('iron', 12),
  gold: (c) => MAT.gold(c),
  eyeRed: glowing('eyeRed'),
  eyeYellow: glowing('eyeYellow'),
  eyeOrange: glowing('eyeOrange'),
  eyeCyan: glowing('eyeCyan'),
  eyeGold: glowing('eyeGold'),
  ember: glowing('ember'),
};

// Ellipse of `n` points in the x-y plane at depth z: half width w, half height h, centred at height yc.
const ringXY = (z, w, h, yc, n = 8) => latheRing(0, w, h, n).map(([x, , y]) => [x, yc + y, z]);
const shift = (polys, [dx, dy, dz]) => polys.map((p) => ({ ...p, pts: p.pts.map(([x, y, z]) => [x + dx, y + dy, z + dz]) }));
const pair = (fn) => [-1, 1].forEach((s) => fn(s, s < 0 ? 'left' : 'right'));
const eyes = (m, mat, y, z, spread, size) => pair((s, side) =>
  m.cube(`eye_${side}`, [s * spread - size / 2, y - size / 2, z - size * 0.3], [s * spread + size / 2, y + size / 2, z + size * 0.3], { mat }));

/**
 * The shared biped. Sizes are in metres like the old primitive models, converted to pixels here.
 * `headParts(m, neckY, headS)`, `rightHand(m, x, y, z)`, `leftHand(...)` and `extras(m, dims)` add the
 * creature's own parts inside the right groups.
 */
function humanoid(m, o) {
  const H = o.h * 64, bulk = o.bulk ?? 1;
  const legLen = H * 0.44, torsoH = H * 0.32, armLen = H * (o.armFactor ?? 0.36);
  const limbW = (o.limb ?? 0.11) * 64 * bulk, r = limbW / 2;
  const hipX = 6.4 * bulk, rx = 10.9 * bulk, rz = 6.4 * bulk;
  const neckY = legLen + torsoH, shY = neckY - 3.2, sx = rx + r - 1;
  const headS = o.head * 64;
  const dims = { H, legLen, torsoH, armLen, r, hipX, rx, rz, neckY, shY, sx, headS };
  const mats = { skin: o.skin, torso: o.torso ?? o.cloth ?? o.skin, legs: o.legs ?? o.cloth ?? o.skin, arms: o.arms ?? o.skin, feet: o.feet ?? o.legs ?? o.cloth ?? o.skin };

  pair((s, side) => m.group(`leg_${side}`, () => {
    m.mesh(`leg_${side}`, shift(lathe([[legLen + 1, r * 1.1], [legLen * 0.55, r * 0.9], [legLen * 0.45, r * 0.85], [2.5, r * 0.65]], { sides: 6 }), [s * hipX, 0, 0]), { mat: mats.legs });
    m.cube(`foot_${side}`, [s * hipX - r * 0.9, 0, -r * 0.9], [s * hipX + r * 0.9, 2.8, r * 2.2], { mat: mats.feet });
  }, { origin: [s * hipX, legLen, 0] }));

  m.group('body', () => {
    const torso = [[legLen - 2, rx * 0.85, rz * 0.9], [legLen + torsoH * 0.3, rx * 0.8, rz * 0.85], [legLen + torsoH * 0.7, rx, rz],
      [neckY - 1, rx * 0.95, rz * 0.9], [neckY + 1.5, rx * 0.4, rz * 0.5]];
    m.mesh('torso', loft(torso.map(([y, a, b]) => latheRing(y, a, b, 8))), { mat: mats.torso, info: o.torsoInfo });
    m.group('head', () => {
      if (o.headParts) o.headParts(m, neckY, headS, dims);
      else defaultHead(m, neckY, headS, mats.skin);
      eyes(m, o.eyes, neckY + headS * 0.55, headS * 0.5 + 0.2, headS * 0.22, Math.max(2.2, headS * 0.14));
    }, { origin: [0, neckY, 0] });
    pair((s, side) => m.group(`arm_${side}`, () => {
      const x = s * sx;
      m.mesh(`arm_${side}`, shift(lathe([[shY + r * 1.2, r * 0.9], [shY, r * 1.1], [shY - armLen * 0.5, r * 0.9], [shY - armLen + 2.5, r * 0.75]], { sides: 6 }), [x, 0, 0]), { mat: mats.arms });
      const fist = o.fist ?? 0.9;
      m.cube(`hand_${side}`, [x - r * fist, shY - armLen - r * fist * 0.6, -r * fist], [x + r * fist, shY - armLen + 2.5, r * fist], { mat: o.hands ?? mats.skin });
      const hand = o[s > 0 ? 'rightHand' : 'leftHand'];
      if (hand) hand(m, x, shY - armLen + 0.5, 0, dims);
    }, { origin: [s * sx, shY, 0] }));
    if (o.extras) o.extras(m, dims);
  }, { origin: [0, legLen, 0] });
  return dims;
}

function defaultHead(m, neckY, headS, mat) {
  const w = headS / 2;
  m.mesh('head', loft([[neckY, w * 0.5], [neckY + 1.5, w * 0.85], [neckY + headS * 0.45, w], [neckY + headS * 0.85, w * 0.95], [neckY + headS, w * 0.55]]
    .map(([y, rr]) => latheRing(y, rr, rr * 0.95, 8))), { mat });
}

// Weapons held in a fist at (x, y, z), pointing +z out of the hand. The overhead chop leads with -y.
function blade(m, x, y, z, len, { mat = 'steel', hilt = 'rag', guardMat = 'ironDark' } = {}) {
  m.cube('hilt', [x - 0.9, y - 0.9, z - 3], [x + 0.9, y + 0.9, z + 4], { mat: hilt });
  m.cube('guard', [x - 0.9, y - 4.5, z + 3.2], [x + 0.9, y + 4.5, z + 4.6], { mat: guardMat });
  const L = len * 64;
  m.mesh('blade', loft([[z + 4.6, 1.6], [z + L - 4, 1.4], [z + L, 0]].map(([zz, w]) =>
    w ? [[x, y + w, zz], [x + 0.45, y, zz], [x, y - w, zz], [x - 0.45, y, zz]] : apex(4, [x, y, zz]))), { mat });
}

function axe(m, x, y, z, len) {
  const L = len * 64;
  m.mesh('haft', tube([[x, y, z - 4], [x, y, z + L]], { half: 1.5, sides: 6 }), { mat: 'wood' });
  // The bit hangs below the haft near its end, broadening toward its edge.
  m.mesh('axe_head', loft([[z + L - 9, 1.2, 2.5], [z + L - 5, 0.9, 5], [z + L - 1, 0.4, 11], [z + L, 0.25, 12]].map(([zz, t, drop]) =>
    [[x + t, y + 1.8, zz], [x + t, y - drop, zz], [x - t, y - drop, zz], [x - t, y + 1.8, zz]])), { mat: 'ironDark' });
}

// ---------- the monsters ----------
const monsters = {
  rat: defineModel('rat', MATS, (m) => {
    // A dog-sized rat: long body, pointed snout, round ears, bald tail.
    m.group('body', () => {
      m.mesh('body', loft([[-18, 3.5, 4], [-12, 8.5, 7.5], [-2, 10.5, 8.5], [8, 8.5, 7], [13, 5.5, 5]].map(([z, w, hh]) => ringXY(z, w, hh, 14))), { mat: 'rat' });
      m.mesh('snout', loft([ringXY(12, 5, 4.5, 15), ringXY(18, 3, 2.6, 13.5), apex(8, [0, 12.5, 23])]), { mat: 'rat' });
      m.cube('nose', [-0.8, 11.8, 22.4], [0.8, 13.2, 23.6], { mat: 'pink' });
      pair((s, side) => m.mesh(`ear_${side}`, lathe([[0, 2.6], [0.8, 2.8], [1.2, 0]], { sides: 6 }), { mat: 'pink', origin: [s * 3.4, 19, 11], rotation: [70, 0, s * 25] }));
      eyes(m, 'eyeRed', 16.5, 16.2, 3.2, 1.8);
    }, { origin: [0, 14, 0] });
    m.group('tail', () => {
      const path = Array.from({ length: 7 }, (_, i) => [Math.sin(i * 0.9) * 2, 12 - i * 1.2 + (i > 3 ? (i - 3) * 0.8 : 0), -17 - i * 5]);
      m.mesh('tail', tube(path, { half: (f) => 1.4 - 1.1 * f }), { mat: 'pink' });
    }, { origin: [0, 12, -17] });
    for (const [name, x, z] of [['leg_front_left', -6, 8], ['leg_front_right', 6, 8], ['leg_back_left', -6.5, -9], ['leg_back_right', 6.5, -9]]) {
      m.group(name, () => {
        m.mesh(name, shift(lathe([[11, 2.2], [4, 1.6], [1.5, 1.3]], { sides: 6 }), [x, 0, z]), { mat: 'rat' });
        m.cube(`${name}_paw`, [x - 1.6, 0, z - 1.4], [x + 1.6, 1.6, z + 2.6], { mat: 'pink' });
      }, { origin: [x, 10, z] });
    }
  }, { glow: ['eyeRed'] }),

  bat: defineModel('bat', MATS, (m) => {
    // A cave bat the size of a cat: furry body, big ears, leathery wings on finger bones.
    m.group('body', () => {
      m.mesh('body', revolve([[0, -9], [4.5, -7], [7, -2], [7.5, 2], [6, 6], [3, 8.5], [0, 9]], { sides: 8 }), { mat: 'batFur' });
      pair((s, side) => m.mesh(`ear_${side}`, loft([latheRing(0, 2.2, 1.2, 4), apex(4, [0, 6, 0])]), { mat: 'batFur', origin: [s * 3.6, 7, 1], rotation: [-10, 0, s * -18] }));
      eyes(m, 'eyeRed', 3, 6.6, 2.8, 1.6);
      pair((s, side) => m.group(`wing_${side}`, () => {
        // Membrane stretched between the arm and three fingers, drawn on both sides.
        const tip = (a, len) => [s * (5 + len * Math.cos(a)), 2 + len * Math.sin(a) * 0.35, -len * Math.sin(a)];
        const fan = [[s * 5, 3, 3], tip(0.05, 38), tip(0.45, 34), tip(0.9, 26), tip(1.35, 16), [s * 5, -2, -6]];
        const polys = [];
        for (let i = 1; i < fan.length - 1; i++) polys.push({ pts: [fan[0], fan[i], fan[i + 1]] });
        m.mesh(`wing_${side}`, polys, { mat: 'membrane' });
        m.mesh(`arm_${side}`, tube([[s * 5, 3, 3], [s * 18, 5, 2], tip(0.05, 38)], { half: 0.7 }), { mat: 'batFur' });
      }, { origin: [s * 5, 2, 0] }));
    }, { origin: [0, 0, 0] });
  }, { glow: ['eyeRed'], double: ['membrane'] }),

  slime: defineModel('slime', MATS, (m) => {
    // A green ooze: a see-through dome of gel with a darker core and two glossy eyes.
    m.group('blob', () => {
      m.mesh('gel', revolve([[0, 0], [22, 0], [28, 6], [29, 16], [25, 29], [16, 38], [0, 42]], { sides: 12 }), { mat: 'gel' });
      m.mesh('core', revolve([[0, 10], [8, 12], [10, 18], [7, 25], [0, 27]], { sides: 8 }), { mat: 'core', origin: [3, 0, -3] });
      pair((s, side) => m.mesh(`eye_${side}`, revolve([[0, -2.4], [2.2, -1.2], [2.4, 0.6], [1.4, 2.2], [0, 2.6]], { sides: 6 }), { mat: 'void', origin: [s * 8, 26, 22] }));
    }, { origin: [0, 0, 0] });
  }, { translucent: ['gel'], density: 1 }),

  goblin: defineModel('goblin', MATS, (m) => {
    humanoid(m, {
      h: 1.15, skin: 'goblin', cloth: 'rag', head: 0.26, eyes: 'eyeYellow',
      headParts: (m, neckY, S) => {
        defaultHead(m, neckY, S, 'goblin');
        pair((s, side) => m.mesh(`ear_${side}`, tube([[s * S * 0.45, neckY + S * 0.6, -1], [s * S * 0.95, neckY + S * 0.8, -3], [s * S * 1.35, neckY + S * 1.0, -5]], { half: (f) => 2.4 - 2.1 * f, side: [0, 0, 1] }), { mat: 'goblin' }));
        m.mesh('nose', loft([latheRing(0, 1.6, 1.4, 4), apex(4, [0, -2.5, 5])]), { mat: 'goblin', origin: [0, neckY + S * 0.45, S * 0.45] });
      },
      rightHand: (m, x, y, z) => blade(m, x, y, z, 0.28),
    });
  }, { glow: ['eyeYellow'], density: 2 }),

  archer: defineModel('archer', MATS, (m) => {
    humanoid(m, {
      h: 1.15, skin: 'archer', cloth: 'hood', head: 0.26, eyes: 'eyeYellow',
      headParts: (m, neckY, S) => {
        defaultHead(m, neckY, S, 'archer');
        // A hood over the back of the head, open at the face.
        const half = (y, rr, back) => Array.from({ length: 5 }, (_, k) => { const a = Math.PI * (0.05 + (k / 4) * 0.9); return [rr * Math.cos(a), y, -back * rr * Math.sin(a) + S * 0.18]; });
        m.mesh('hood', loft([half(neckY - 1, S * 0.62, 1), half(neckY + S * 0.6, S * 0.66, 1.1), half(neckY + S * 1.05, S * 0.5, 1.2), apex(5, [0, neckY + S * 1.35, -S * 0.35])], { capStart: false, caps: [[0, 1, 2, 3], [0, 3, 4]] }), { mat: 'hoodCloth' });
      },
      leftHand: (m, x, y, z) => {
        // Recurve bow gripped in the fist, pointing forward out of it like any weapon, so when the arms come up level
        // to aim (the archer's animation in src/monsters/models.js turns the arm forward 90°), it stands upright in
        // front of the fist. `ahead` is how far toward the target each point is then: the limbs curve back toward
        // the archer, and their tips flick forward again.
        const pts = Array.from({ length: 9 }, (_, i) => {
          const t = (i / 8) * 2 - 1;
          const ahead = 1 - 4 * t * t + (Math.abs(t) > 0.8 ? (Math.abs(t) - 0.8) * 10 : 0);
          return [x, y - ahead, z + t * 17];
        });
        m.mesh('bow', tube(pts, { half: 0.8 }), { mat: 'wood' });
      },
    });
  }, { glow: ['eyeYellow'], double: ['hoodCloth'], density: 2 }),

  skeleton: defineModel('skeleton', MATS, (m) => {
    humanoid(m, {
      h: 1.75, skin: 'bone', limb: 0.07, head: 0.24, eyes: 'eyeRed', torso: 'ribs',
      torsoInfo: { base: 49.3, pitch: 4.2 },
      headParts: (m, neckY, S) => {
        // Skull with a jaw and dark sockets; the eyes glow deep inside.
        const w = S / 2;
        m.mesh('skull', loft([[neckY + S * 0.3, w * 0.8], [neckY + S * 0.5, w], [neckY + S * 0.85, w * 0.98], [neckY + S * 1.1, w * 0.6]]
          .map(([y, rr]) => latheRing(y, rr, rr * 1.05, 8))), { mat: 'bone' });
        m.cube('jaw', [-w * 0.7, neckY, -w * 0.2], [w * 0.7, neckY + S * 0.32, w * 0.95], { mat: 'bone' });
        pair((s, side) => m.cube(`socket_${side}`, [s * S * 0.22 - 2.2, neckY + S * 0.44, w * 0.9], [s * S * 0.22 + 2.2, neckY + S * 0.66, w * 1.02], { mat: 'socket' }));
      },
      // The spine and pelvis show through the ribs.
      extras: (m, d) => {
        m.mesh('spine', tube([[0, d.legLen - 1, -2], [0, d.neckY + 1, -1]], { half: 1.3, sides: 6 }), { mat: 'bone' });
        m.mesh('pelvis', lathe([[d.legLen - 3, d.rx * 0.7, d.rz * 0.8], [d.legLen + 2, d.rx * 0.6, d.rz * 0.7]], { sides: 6 }), { mat: 'bone' });
      },
      rightHand: (m, x, y, z) => blade(m, x, y, z, 0.7, { hilt: 'hide' }),
    });
  }, { glow: ['eyeRed'], double: ['ribs'], density: 1 }),

  orc: defineModel('orc', MATS, (m) => {
    humanoid(m, {
      h: 1.95, bulk: 1.35, limb: 0.14, skin: 'orc', cloth: 'hide', torso: 'hide', head: 0.3, eyes: 'eyeRed', arms: 'orc',
      headParts: (m, neckY, S) => {
        defaultHead(m, neckY, S, 'orc');
        m.cube('jaw', [-S * 0.4, neckY, S * 0.05], [S * 0.4, neckY + S * 0.35, S * 0.62], { mat: 'orc' });
        m.cube('brow', [-S * 0.46, neckY + S * 0.62, S * 0.38], [S * 0.46, neckY + S * 0.74, S * 0.6], { mat: 'orc' });
        pair((s, side) => m.mesh(`tusk_${side}`, loft([latheRing(0, 1.1, 1.1, 4), apex(4, [0, 5, 0.8])]), { mat: 'bone', origin: [s * S * 0.26, neckY + S * 0.3, S * 0.58] }));
      },
      extras: (m, d) => {
        // An iron pauldron on the left shoulder and a belt.
        m.mesh('pauldron', revolve([[d.r * 2.6, -2], [d.r * 2.5, 2], [d.r * 1.6, 5], [0, 6]], { sides: 8 }), { mat: 'ironDark', origin: [-d.sx, d.shY + 1, 0], rotation: [0, 0, 20] });
        m.mesh('belt', lathe([[d.legLen - 1, d.rx * 0.9, d.rz * 0.95], [d.legLen + 2.5, d.rx * 0.88, d.rz * 0.93]], { sides: 8 }), { mat: 'ironDark' });
      },
      rightHand: (m, x, y, z) => axe(m, x, y, z, 0.8),
    });
  }, { glow: ['eyeRed'], density: 1 }),

  wraith: defineModel('wraith', MATS, (m) => {
    // A hooded wraith: a see-through robe with a ragged hem, a void where the face should be, reaching arms.
    m.group('body', () => {
      m.mesh('robe', revolve([[26, 0], [22, 30], [17, 62], [15, 82], [11, 92]].map(([rr, y]) => [rr, y]), { sides: 10 }), { mat: 'robe' });
      m.mesh('hood', revolve([[11, 88], [14, 96], [13.5, 104], [9, 110], [0, 112]], { sides: 10 }), { mat: 'robe', origin: [0, 0, -1] });
      m.mesh('face', revolve([[0, -6], [7, -4], [8, 0], [6, 4], [0, 6]], { sides: 8 }), { mat: 'void', origin: [0, 99, 6] });
      eyes(m, 'eyeCyan', 100, 13.8, 3.6, 2.6);
      pair((s, side) => m.group(`arm_${side}`, () => {
        const x = s * 16;
        m.mesh(`sleeve_${side}`, tube([[x, 80, 2], [x, 80, 22]], { half: (f) => 4 - 1.5 * f, sides: 6, side: [0, 1, 0] }), { mat: 'robe' });
        for (const f of [-1, 1]) m.mesh(`claw_${side}_${f < 0 ? 'a' : 'b'}`, tube([[x + f * 1.2, 80, 22], [x + f * 1.8, 78, 28]], { half: (t) => 0.7 - 0.5 * t }), { mat: 'bone' });
      }, { origin: [s * 16, 80, 3] }));
    }, { origin: [0, 0, 0] });
  }, { glow: ['eyeCyan'], translucent: ['robe'], density: 1 }),

  imp: defineModel('imp', MATS, (m) => {
    humanoid(m, {
      h: 0.95, skin: 'imp', cloth: 'impDark', head: 0.24, eyes: 'eyeYellow',
      headParts: (m, neckY, S) => {
        defaultHead(m, neckY, S, 'imp');
        pair((s, side) => m.mesh(`horn_${side}`, tube([[s * S * 0.3, neckY + S * 0.85, 0], [s * S * 0.5, neckY + S * 1.2, -1.5], [s * S * 0.45, neckY + S * 1.5, -4]], { half: (f) => 1.4 - 1.2 * f }), { mat: 'impDark' }));
      },
      extras: (m, d) => {
        pair((s, side) => m.group(`wing_${side}`, () => {
          const base = [s * 3, d.shY - 2, -d.rz];
          const fan = [base, [s * 20, d.shY + 10, -d.rz - 8], [s * 22, d.shY - 2, -d.rz - 10], [s * 16, d.shY - 12, -d.rz - 7], [s * 6, d.shY - 12, -d.rz - 2]];
          const polys = [];
          for (let i = 1; i < fan.length - 1; i++) polys.push({ pts: [fan[0], fan[i], fan[i + 1]] });
          m.mesh(`wing_${side}`, polys, { mat: 'impWing' });
          m.mesh(`wing_bone_${side}`, tube([base, fan[1], fan[2]], { half: 0.6 }), { mat: 'impDark' });
        }, { origin: [s * 3, d.shY - 2, -d.rz] }));
        m.mesh('tail', tube([[0, d.legLen + 1, -d.rz], [0, d.legLen - 6, -d.rz - 8], [0, d.legLen - 4, -d.rz - 16], [0, d.legLen + 1, -d.rz - 19]], { half: (f) => 1.2 - 0.9 * f }), { mat: 'imp' });
      },
    });
  }, { glow: ['eyeYellow'], double: ['impWing'], density: 2 }),

  troll: defineModel('troll', MATS, (m) => {
    humanoid(m, {
      h: 2.3, bulk: 1.6, limb: 0.16, skin: 'troll', cloth: 'hide', torso: 'troll', legs: 'troll', head: 0.34, eyes: 'eyeOrange', armFactor: 0.46, fist: 1.2,
      headParts: (m, neckY, S) => {
        defaultHead(m, neckY, S, 'troll');
        m.cube('jaw', [-S * 0.44, neckY - 1, S * 0.05], [S * 0.44, neckY + S * 0.3, S * 0.66], { mat: 'troll' });
        pair((s, side) => m.mesh(`fang_${side}`, loft([latheRing(0, 1.2, 1.2, 4), apex(4, [0, 4.5, 0])]), { mat: 'bone', origin: [s * S * 0.3, neckY + S * 0.28, S * 0.6] }));
        m.mesh('nose', loft([latheRing(0, 3, 2.4, 6), apex(6, [0, -3, 5])]), { mat: 'troll', origin: [0, neckY + S * 0.55, S * 0.48] });
      },
      extras: (m, d) => m.mesh('loincloth', lathe([[d.legLen - 8, d.rx * 1.0, d.rz * 1.05], [d.legLen + 2, d.rx * 0.9, d.rz * 0.95]], { sides: 8 }), { mat: 'hide' }),
      rightHand: (m, x, y, z) => m.mesh('club', tube([[x, y, z - 4], [x, y, z + 30], [x, y - 1, z + 54]], { half: (f) => 2 + 4.5 * f * f, sides: 6 }), { mat: 'wood' }),
    });
  }, { glow: ['eyeOrange'], density: 1 }),

  golem: defineModel('golem', MATS, (m) => {
    humanoid(m, {
      h: 2.35, bulk: 1.9, skin: 'stone', head: 0.34, eyes: 'eyeOrange', limb: 0.14, fist: 1.5,
      headParts: (m, neckY, S) => {
        const w = S / 2;
        m.mesh('head', loft([octRingZ(-w, w * 1.1, w, neckY + w, 0.25), octRingZ(w * 1.1, w * 1.1, w, neckY + w, 0.25)]), { mat: 'stone' });
        m.cube('brow', [-w * 1.15, neckY + S * 0.62, w * 0.9], [w * 1.15, neckY + S * 0.8, w * 1.3], { mat: 'stone' });
      },
      extras: (m, d) => {
        // A glowing rune-core set into the chest, and boulders for shoulders.
        m.mesh('core', loft([octRingZ(0, 5, 5, d.legLen + d.torsoH * 0.62, 0.3), octRingZ(2, 3.5, 3.5, d.legLen + d.torsoH * 0.62, 0.3)].map((ring) => ring.map(([x, y, z]) => [x, y, z + d.rz * 1.0]))), { mat: 'ember' });
        pair((s, side) => m.mesh(`shoulder_${side}`, revolve([[0, -6], [8, -4], [10, 1], [7, 6], [0, 7]], { sides: 6 }), { mat: 'stone', origin: [s * (d.sx + 1), d.shY + 3, 0], rotation: [0, 30, s * 15] }));
      },
    });
  }, { glow: ['eyeOrange', 'ember'], density: 1 }),

  warden: defineModel('warden', MATS, (m) => {
    humanoid(m, {
      h: 2.7, bulk: 1.6, limb: 0.13, skin: 'warden', cloth: 'plate', torso: 'plate', legs: 'plate', arms: 'plate', hands: 'plate', head: 0.36, eyes: 'eyeGold',
      torsoInfo: { trim: [[74, 78.5], [124, 130]] },
      headParts: (m, neckY, S) => {
        // A great helm crowned with gold spikes; the eyes burn through its visor.
        const w = S / 2;
        m.mesh('helm', loft([[neckY, w * 0.9], [neckY + S * 0.5, w * 1.05], [neckY + S * 0.95, w], [neckY + S * 1.05, w * 0.8]].map(([y, rr]) => latheRing(y, rr, rr, 8))), { mat: 'plate' });
        m.cube('visor', [-w * 0.8, neckY + S * 0.48, w * 0.9], [w * 0.8, neckY + S * 0.62, w * 1.06], { mat: 'void' });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          m.mesh(`crown_spike_${i + 1}`, loft([latheRing(0, 1.6, 1.6, 4), apex(4, [0, 9, 0])]), { mat: 'gold', origin: [Math.sin(a) * w * 0.8, neckY + S, Math.cos(a) * w * 0.8] });
        }
      },
      extras: (m, d) => {
        m.mesh('cape', [{ pts: [[-d.rx, d.neckY - 2, -d.rz - 1], [d.rx, d.neckY - 2, -d.rz - 1], [d.rx * 1.4, 6, -d.rz - 9], [-d.rx * 1.4, 6, -d.rz - 9]] }], { mat: 'capeCloth' });
        pair((s, side) => m.mesh(`pauldron_${side}`, revolve([[d.r * 2.8, -3], [d.r * 2.7, 2], [d.r * 1.8, 6], [0, 7]], { sides: 8 }), { mat: 'plate', origin: [s * d.sx, d.shY + 2, 0], rotation: [0, 0, -s * 20] }));
      },
      rightHand: (m, x, y, z) => {
        // Halberd: a long pole with a gilded blade hanging below its end and a spike beyond.
        m.mesh('pole', tube([[x, y, z - 30], [x, y, z + 100]], { half: 1.8, sides: 6 }), { mat: 'wood' });
        m.mesh('halberd_blade', loft([[z + 78, 1.2, 3], [z + 86, 0.9, 14], [z + 94, 0.4, 20], [z + 96, 0.3, 18]].map(([zz, t, drop]) =>
          [[x + t, y + 2, zz], [x + t, y - drop, zz], [x - t, y - drop, zz], [x - t, y + 2, zz]])), { mat: 'gold' });
        m.mesh('spike', loft([latheRing(0, 1.8, 1.8, 4), apex(4, [0, 14, 0])]), { mat: 'gold', origin: [x, y, z + 100], rotation: [90, 0, 0] });
      },
    });
  }, { glow: ['eyeGold'], double: ['capeCloth'], density: 1 }),
};

MATS.hoodCloth = MATS.hood;
MATS.impWing = skin('impDark', { seed: 13 });
MATS.capeCloth = MATS.cape;

export { monsters };
