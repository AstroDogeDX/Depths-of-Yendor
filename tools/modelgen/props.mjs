// Room furniture and decorations. Origin = on the floor at the prop's middle, its front facing +z (south).
// Empty groups named slot_1, slot_2... mark where the game sets items out on a prop (shop wares).
import { defineModel, loft, lathe, revolve, tube, apex, latheRing, octRingZ, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, clamp01, patches, bevel } from './materials.mjs';

const CLEAR = [0, 0, 0, 0];

const PROP_PAL = {
  oak: P('#24170c', '#352213', '#48301b', '#5c3e23', '#6f4d2c', '#835d36'),
  darkOak: P('#150d07', '#20140b', '#2c1c10', '#3a2616', '#48301c'),
  iron: PAL.iron,
  rugRed: P('#2a0808', '#420c0c', '#5c1412', '#761c16', '#8e281e'),
  rugGold: P('#4a3208', '#6e4c12', '#94681c', '#b8862a', '#d4a440'),
  rugBlue: P('#0a1024', '#121a36', '#1a2648', '#24325c'),
  velvet: P('#1e0208', '#34060e', '#4e0a16', '#6a1020', '#86182c', '#a4263a'),
  clay: P('#3a2216', '#54321f', '#6e4429', '#8a5734', '#a36c42', '#b98252'),
  glassGreen: P('#0c2414', '#14381e', '#1e4e2a', '#2c6a3a', '#4a8e56', '#8cc49a'),
  glassBlue: P('#0c1830', '#142648', '#1e3862', '#2c4e82', '#4a70a8', '#8cb0d8'),
  glassAmber: P('#2a1404', '#44200a', '#643210', '#88481a', '#ac662a', '#d49a58'),
  bookRed: P('#260808', '#3c0e0c', '#561612', '#6e2018'),
  bookGreen: P('#0c1a0c', '#142a14', '#1e3c1e', '#2a4e28'),
  bookBlue: P('#0c1224', '#141e38', '#1e2c4e', '#283a62'),
  paper: P('#6e6048', '#8f7f60', '#afa07c', '#cbbd98'),
  baize: P('#06160c', '#0a2214', '#0e2e1a', '#143c22', '#1c4c2c', '#265e36'),
  royal: P('#04081a', '#081028', '#0e1a3c', '#162650', '#203466', '#2c447e'),
  burlap: P('#2e2112', '#45321b', '#5e4625', '#785b31', '#91703e', '#a8864e'),
  grain: P('#4a3812', '#6a521c', '#8c6e28', '#ab8a36', '#c6a448', '#dcbe62'),
};

// Wooden planks: `across` is the axis the planks are laid across (each plank is `width` pixels of it) and
// `along` the axis they run along, so the grain follows them.
const planks = (pal, across, along, width, seed = 0) => (c) => {
  const { p } = c;
  const a = p[across], l = p[along];
  const k = Math.floor(a / width), f = fract(a / width);
  let v = 0.46 + 0.2 * (rand(k, seed) - 0.5) + 0.12 * (noise3(a * 0.9, l * 0.07, k, 600 + seed) - 0.5) + bevel(c, 0.12);
  if (f < 0.07) v = 0.1; // the gap between planks
  if (rand(k, Math.floor(l / 9), 601 + seed) > 0.975) v -= 0.22; // knots
  return ramp(PROP_PAL[pal], v, c.ax, c.ay);
};
// Crate boards: horizontal planks on the sides, framed by darker battens round each face.
function crate(c) {
  const { n } = c;
  const across = Math.abs(n.y) > 0.5 ? 'z' : 'y', along = Math.abs(n.y) > 0.5 ? 'x' : Math.abs(n.x) > 0.5 ? 'z' : 'x';
  if (c.edge < 3.5) return ramp(PROP_PAL.darkOak, 0.5 + 0.2 * patches(c.p, 610, 0.5) + bevel(c, 0.2), c.ax, c.ay);
  return planks('oak', across, along, 5, 611)(c);
}

const MATS = {
  ...MAT,
  counterTop: planks('oak', 'z', 'x', 8),
  counterFront: planks('oak', 'x', 'y', 7, 1),
  darkOak: (c) => ramp(PROP_PAL.darkOak, 0.45 + 0.16 * patches(c.p, 620, 0.4) + bevel(c, 0.18), c.ax, c.ay),
  crate,
  // Barrel staves round the body, hooped in iron.
  staves(c) {
    const { p } = c;
    const hoop = [4, 14, 44, 54].some((y) => Math.abs(p.y - y) < 1.3);
    if (hoop) return ramp(PAL.iron, 0.4 + 0.3 * Math.max(0, c.n.y + 0.5) + 0.1 * patches(p, 630, 1), c.ax, c.ay);
    const a = (Math.atan2(p.z, p.x) / (2 * Math.PI) + 1) * 14;
    const k = Math.floor(a), f = fract(a);
    let v = 0.45 + 0.2 * (rand(k, 631) - 0.5) + 0.1 * (noise3(k, p.y * 0.08, 0, 632) - 0.5);
    if (f < 0.08) v = 0.12;
    return ramp(PROP_PAL.oak, v, c.ax, c.ay);
  },
  barrelLid: planks('oak', 'x', 'z', 6, 2),
  // A woven rug: a red field with a gold diamond lattice, inside a blue-and-gold border.
  rug(c) {
    const { p, info } = c;
    const bx = info.w - Math.abs(p.x), bz = info.d - Math.abs(p.z);
    const edge = Math.min(bx, bz);
    const weave = (c.ax + c.ay) % 2 ? 0.05 : -0.05;
    if (edge < 3) return ramp(PROP_PAL.rugGold, 0.5 + weave, c.ax, c.ay); // fringe band
    if (edge < 10) return ramp(PROP_PAL.rugBlue, (edge > 5 && edge < 7 ? 0.9 : 0.45) + weave, c.ax, c.ay);
    const d = fract((Math.abs(p.x) + Math.abs(p.z)) / 14);
    if (d < 0.12) return ramp(PROP_PAL.rugGold, 0.55 + weave, c.ax, c.ay);
    return ramp(PROP_PAL.rugRed, 0.5 + 0.15 * patches(p, 640, 0.2) + weave, c.ax, c.ay);
  },
  // Crushed velvet: soft sheen that brightens toward the top of the cushion, darker in the folds.
  velvet(c) {
    const { p, n } = c;
    const v = 0.45 + 0.22 * n.y + 0.14 * patches(p, 680, 0.5) + ((c.ax + c.ay) % 2 ? 0.03 : -0.03);
    return ramp(PROP_PAL.velvet, v, c.ax, c.ay);
  },
  clay: (c) => ramp(PROP_PAL.clay, 0.5 + 0.16 * patches(c.p, 650, 0.6) + 0.12 * c.n.y + bevel(c, 0.1), c.ax, c.ay),
  glassGreen: (c) => glass('glassGreen', c),
  glassBlue: (c) => glass('glassBlue', c),
  glassAmber: (c) => glass('glassAmber', c),
  bookRed: (c) => book('bookRed', c),
  bookGreen: (c) => book('bookGreen', c),
  bookBlue: (c) => book('bookBlue', c),
  paper: (c) => ramp(PROP_PAL.paper, fract(c.p.y * 1.2) < 0.3 ? 0.35 : 0.7, c.ax, c.ay),
  // Green baize on a display table, edged with a gold thread.
  baize(c) {
    if (c.edge < 1.2) return ramp(PAL.gold, 0.55 + 0.1 * patches(c.p, 701, 0.8), c.ax, c.ay);
    return ramp(PROP_PAL.baize, 0.5 + 0.12 * patches(c.p, 700, 0.4) + ((c.ax + c.ay) % 2 ? 0.03 : -0.03), c.ax, c.ay);
  },
  // The merchant's hanging (see tapestry): deep blue, bordered in gold, with a pair of scales in gold in its middle,
  // and its hem cut into points with a gold tassel at each.
  hanging(c) {
    const { p, info } = c, x = p.x, y = p.y, ax = Math.abs(x);
    const tip = 1 - Math.abs(2 * fract((x + info.W) / 12) - 1); // across each point of the hem: 1 at its tip
    if (y < info.BOT - 9 * tip) return CLEAR;
    const weave = (c.ax + c.ay) % 2 ? 0.04 : -0.04;
    const gold = () => ramp(PAL.gold, 0.6 + weave + 0.1 * patches(p, 731, 0.5), c.ax, c.ay);
    if (y < info.BOT - 5 && tip > 0.7) return gold(); // the tassels
    if ((ax > info.W - 6 && ax < info.W - 3) || (y > info.TOP - 7 && y < info.TOP - 4) || (y > info.BOT + 2 && y < info.BOT + 5)) return gold();
    // The scales: a post on a foot, a beam across its top with a knob, and a pan hung by two cords from each end.
    const cy = (info.TOP + info.BOT) / 2 + 2;
    const pan = (s) => {
      const dx = (x - s * 15) * 0.8, dy = y - (cy - 6), r = Math.hypot(dx, dy);
      return (dy < 0 && r < 7.5 && r > 5) || (Math.abs(dy) < 0.8 && Math.abs(x - s * 15) < 9.4);
    };
    const cords = (s) => {
      const t = (cy + 14 - y) / 20; // from the beam (0) to the pan's rim (1)
      return t >= 0 && t <= 1 && [-1, 1].some((e) => Math.abs(x - (s * 15 + e * 9 * t)) < 0.8);
    };
    if ((ax < 1.3 && y > cy - 20 && y < cy + 16) || (Math.abs(y - (cy + 14)) < 1.3 && ax < 17) || Math.hypot(x, y - (cy + 18)) < 2.8 ||
      (y > cy - 24 && y < cy - 20 && ax < 9 - (y - (cy - 24)) * 1.2) || pan(-1) || pan(1) || cords(-1) || cords(1)) return gold();
    return ramp(PROP_PAL.royal, 0.5 + weave + 0.12 * patches(p, 730, 0.3), c.ax, c.ay);
  },
  // Burlap: a coarse weave of tan threads, with the odd slub.
  burlap(c) {
    const weave = ((c.ax >> 1) + (c.ay >> 1)) % 2 ? 0.05 : -0.05;
    let v = 0.5 + weave + 0.16 * patches(c.p, 710, 0.35) + 0.12 * c.n.y;
    if (rand(c.ax, c.ay, 711) > 0.95) v -= 0.18;
    return ramp(PROP_PAL.burlap, v, c.ax, c.ay);
  },
  grain(c) {
    const r = rand(c.ax, c.ay, 720);
    return ramp(PROP_PAL.grain, 0.45 + (r > 0.5 ? 0.25 : 0) - (r < 0.12 ? 0.25 : 0) + 0.1 * c.n.y, c.ax, c.ay);
  },
};
function glass(pal, c) {
  let v = 0.5 + 0.1 * patches(c.p, 660, 0.8) + bevel(c, 0.15);
  if (Math.cos(Math.atan2(c.p.z - (c.info.cz ?? 0), c.p.x - (c.info.cx ?? 0)) - 0.9) > 0.85) v = 0.95; // highlight
  return ramp(PROP_PAL[pal], v, c.ax, c.ay);
}
function book(pal, c) {
  // Spines facing out get two gilt bands; the rest is cloth.
  if (c.n.z > 0.7 && [0.25, 0.75].some((f) => Math.abs(fract((c.p.y - c.info.y0) / c.info.h) - f) < 0.06)) return ramp(PAL.gold, 0.6, c.ax, c.ay);
  return ramp(PROP_PAL[pal], 0.5 + 0.12 * patches(c.p, 670, 1) + bevel(c, 0.15), c.ax, c.ay);
}

const slot = (m, i, pos) => m.group(`slot_${i}`, undefined, { origin: pos });

/** A polygon wound to face `out`. */
function facing(pts, out) {
  const [a, b, c] = pts;
  const u = b.map((v, i) => v - a[i]), w = c.map((v, i) => v - a[i]);
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  return { pts: n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? pts : [...pts].reverse() };
}

/**
 * Something round and soft, a sack, up the y axis: a ring of `sides` at each [y, r] of `profile` (r 0 for a point), each
 * pushed in and out a little, by `seed`, so it slumps.
 */
const lumpy = (profile, seed, { sides = 9, capEnd = true } = {}) => loft(profile.map(([y, r], i) => (r <= 0 ? apex(sides, [0, y, 0])
  : Array.from({ length: sides }, (_, k) => {
    const a = (k / sides) * 2 * Math.PI, j = 1 + 0.14 * (noise3(Math.cos(a) * 1.4, i * 0.8, Math.sin(a) * 1.4, seed) - 0.5);
    return [Math.cos(a) * r * j, y, Math.sin(a) * r * j];
  }))), { capEnd });

export const props = {
  shop_counter: defineModel('shop_counter', MATS, (m) => {
    // A long plank counter: panelled front, a top that overhangs it, and a dark plinth.
    m.cube('plinth', [-102, 0, -22], [102, 4, 20], { mat: 'darkOak' });
    m.cube('body', [-100, 4, -20], [100, 46, 18], { mat: 'counterFront' });
    m.cube('rail', [-101, 43, 17], [101, 46, 20], { mat: 'darkOak' });
    m.cube('top', [-106, 46, -25], [106, 51, 24], { mat: 'counterTop' });
    for (const x of [-100, 100]) m.cube(`post_${x < 0 ? 'left' : 'right'}`, [x - 3, 0, 16], [x + 3, 46, 21], { mat: 'darkOak' });
    [-62, 0, 62].forEach((x, i) => slot(m, i + 1, [x, 51, 0]));
  }, { density: 1 }),

  display_plinth: defineModel('display_plinth', MATS, (m) => {
    // A pedestal for the shop's finest: a turned column on a stepped base and a square capital, with a red velvet
    // cushion on top, gold-tasselled at its corners.
    m.cube('base', [-16, 0, -16], [16, 5, 16], { mat: 'darkOak' });
    m.cube('step', [-13, 5, -13], [13, 8, 13], { mat: 'counterTop' });
    m.mesh('column', lathe([[8, 8], [11, 6], [36, 6], [40, 8.5], [42, 8.5]], { sides: 8 }), { mat: 'darkOak' });
    m.cube('capital', [-14, 42, -14], [14, 46, 14], { mat: 'counterTop' });
    const pad = (y, h) => [[h, y, h], [h, y, -h], [-h, y, -h], [-h, y, h]];
    m.mesh('cushion', loft([pad(46, 11.5), pad(48.5, 13), pad(51, 12.2), pad(52.5, 9.5)]), { mat: 'velvet' });
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      m.cube(`tassel_${x > 0 ? 'e' : 'w'}${z > 0 ? 's' : 'n'}`, [x * 15 - 1, 40, z * 15 - 1], [x * 15 + 1, 46, z * 15 + 1], { mat: 'gold' });
    }
    slot(m, 1, [0, 52.5, 0]);
  }, { density: 2 }),

  display_table: defineModel('display_table', MATS, (m) => {
    // A long oak table for laying out three of the shop's wares, on square legs joined low down by a stretcher, with a
    // runner of green baize along its top and down over its front.
    const L = 76, D = 23, H = 44; // half its length and depth, and the height of its top
    m.cube('top', [-L, H - 4, -D], [L, H, D], { mat: 'counterTop' });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * (L - 7), z = sz * (D - 5);
      m.cube(`leg_${sx < 0 ? 'left' : 'right'}_${sz < 0 ? 'back' : 'front'}`, [x - 3, 0, z - 3], [x + 3, H - 4, z + 3], { mat: 'darkOak' });
    }
    for (const z of [-(D - 5), D - 5]) m.cube(`apron_${z < 0 ? 'back' : 'front'}`, [-L + 7, H - 10, z - 1.5], [L - 7, H - 4, z + 1.5], { mat: 'darkOak' });
    m.cube('stretcher', [-L + 7, 9, -1.5], [L - 7, 13, 1.5], { mat: 'darkOak' });
    m.cube('runner', [-L + 10, H, -D + 4], [L - 10, H + 0.6, D + 0.6], { mat: 'baize', faces: ['up'] });
    m.cube('runner_drape', [-L + 10, H - 10, D], [L - 10, H + 0.6, D + 0.6], { mat: 'baize', faces: ['south'] });
    [-50, 0, 50].forEach((x, i) => slot(m, i + 1, [x, H + 0.6, 0]));
  }, { density: 1.5 }),

  tapestry: defineModel('tapestry', MATS, (m) => {
    // The merchant's hanging, on the wall behind the counter (its origin on the wall, at the floor): deep blue cloth on
    // a brass rod, bordered in gold, a gold pair of scales on it, and its hem cut into points with a tassel at each.
    const TOP = 160, BOT = 70, W = 34;
    m.mesh('rod', tube([[-W - 6, TOP + 3, 6], [W + 6, TOP + 3, 6]], { half: 1.2, sides: 6 }), { mat: 'brass' });
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'left' : 'right';
      m.cube(`finial_${side}`, [s * (W + 6) - 2, TOP + 1, 4], [s * (W + 6) + 2, TOP + 5, 8], { mat: 'brass' });
      m.cube(`bracket_${side}`, [s * (W - 4) - 1.2, TOP + 1.5, 0], [s * (W - 4) + 1.2, TOP + 4.5, 7], { mat: 'iron' });
    }
    // The cloth hangs from the rod in a gentle fold down its middle.
    const cloth = (x0, x1, z0, z1) => facing([[x0, BOT - 9, z0], [x1, BOT - 9, z1], [x1, TOP + 2, z1], [x0, TOP + 2, z0]], [0, 0, 1]);
    m.mesh('cloth', [cloth(-W, 0, 4.5, 6.5), cloth(0, W, 6.5, 4.5)], { mat: 'hanging', info: { W, TOP, BOT } });
  }, { density: 2, double: ['hanging'] }),

  weapon_rack: defineModel('weapon_rack', MATS, (m) => {
    // An oak rack against the wall (its origin on the wall, at the floor), with a spear, a sword (point down) and an axe
    // stood in it, leaning back against its rail.
    m.cube('base', [-36, 0, 1], [36, 7, 18], { mat: 'darkOak' });
    for (const x of [-36, 32]) m.cube(`upright_${x < 0 ? 'left' : 'right'}`, [x, 0, 1], [x + 4, 96, 7], { mat: 'darkOak' });
    m.cube('rail', [-38, 82, 1], [38, 88, 9], { mat: 'counterTop' });
    m.cube('rail_low', [-36, 40, 1], [36, 44, 7], { mat: 'darkOak' });
    const lean = (x) => ({ origin: [x, 7, 14], rotation: [-3, 0, 0] });
    // A blade's section, its edges to either side (x) and its flats to the front and back.
    const flat = (y, w, t) => [[-w, y, 0], [0, y, t], [w, y, 0], [0, y, -t]];
    m.mesh('spear_shaft', tube([[0, 0, 0], [0, 126, 0]], { half: 0.95, sides: 6 }), { mat: 'wood', ...lean(-22) });
    m.mesh('spear_socket', lathe([[121, 1.3], [128, 1.05]], { sides: 6 }), { mat: 'iron', ...lean(-22) });
    m.mesh('spear_head', loft([flat(127, 0.9, 0.7), flat(130.5, 2.6, 0.6), flat(137, 1.8, 0.45), apex(4, [0, 143, 0])], { capEnd: false }),
      { mat: 'honed', ...lean(-22) });
    m.mesh('sword_blade', loft([apex(4, [0, 0, 0]), flat(6, 1.7, 0.55), flat(58, 2.0, 0.55)], { capStart: false }), { mat: 'honed', ...lean(0) });
    // (A cube's corners are where it is in the model, where a mesh's points are from its origin.)
    m.cube('sword_guard', [-7, 7 + 58, 14 - 1], [7, 7 + 61.5, 14 + 1], { mat: 'brass', ...lean(0) });
    m.mesh('sword_grip', lathe([[61.5, 1.1], [73, 1.2]], { sides: 6 }), { mat: 'leather', ...lean(0) });
    m.mesh('sword_pommel', lathe([[73, 1.6], [74.5, 2.1], [77, 1.4], [77.6, 0]], { sides: 6 }), { mat: 'brass', ...lean(0) });
    m.mesh('axe_haft', tube([[0, 0, 0], [0, 100, 0]], { half: 1.15, sides: 6 }), { mat: 'wood', ...lean(21) });
    m.mesh('axe_eye', lathe([[87, 2], [97, 2]], { sides: 6 }), { mat: 'iron', ...lean(21) });
    // The bit, out to the left of the haft, flaring to its edge.
    const bit = (x, h, t) => [[x, 92 + h, -t], [x, 92 + h, t], [x, 92 - h, t], [x, 92 - h, -t]];
    m.mesh('axe_bit', loft([bit(-1.5, 4.5, 1.6), bit(-6, 6, 1.1), bit(-10, 9.5, 0.6), bit(-12.5, 12, 0.2)], { mat: (i) => (i === 2 ? 'honed' : 'iron') }),
      { mat: 'iron', ...lean(21) });
  }, { density: 1.5 }),

  sacks: defineModel('sacks', MATS, (m) => {
    // Sacks of the merchant's stores slumped together: a big one and a smaller one leaning on it, both tied at the
    // neck, and one rolled open at the top on a heap of grain, some of it spilt on the floor.
    m.mesh('sack_big', lumpy([[0, 0], [0, 14], [8, 17], [22, 17.5], [34, 14], [41, 7], [44, 3.2], [45, 3.6], [48, 5], [51, 2.6], [52, 0]], 740),
      { mat: 'burlap', origin: [-12, 0, -5] });
    m.mesh('tie_big', tube(latheRing(44.5, 3.9, 3.9, 8), { half: 0.6, side: [0, 1, 0], closed: true }), { mat: 'cord', origin: [-12, 0, -5] });
    m.mesh('sack_small', lumpy([[0, 0], [0, 11], [7, 13.5], [18, 13.5], [27, 10], [32, 5], [34, 2.6], [35, 3], [37.5, 4.2], [40, 2], [41, 0]], 741),
      { mat: 'burlap', origin: [12, 0, -8], rotation: [0, 0, -9] });
    m.mesh('tie_small', tube(latheRing(34.5, 3.3, 3.3, 8), { half: 0.55, side: [0, 1, 0], closed: true }), { mat: 'cord', origin: [12, 0, -8], rotation: [0, 0, -9] });
    m.mesh('sack_open', lumpy([[0, 0], [0, 10.5], [6, 12.5], [16, 12.5], [22, 11.5], [24, 12.5], [25.5, 11.8]], 742, { capEnd: false }),
      { mat: 'burlap', origin: [2, 0, 15] });
    m.mesh('grain_heap', lathe([[23, 11.4], [26, 8.5], [28.5, 4], [29.5, 0]], { sides: 9 }), { mat: 'grain', origin: [2, 0, 15] });
    m.mesh('grain_spilt', lathe([[0, 9], [1, 6.5], [2.2, 0]], { sides: 9 }), { mat: 'grain', origin: [17, 0, 22] });
  }, { density: 1.5 }),

  shelf: defineModel('shelf', MATS, (m) => {
    // A tall shelf against the wall, cluttered with jars, bottles and books.
    const W = 50, D = 12, H = 138;
    m.cube('back', [-W, 0, -D], [W, H, -D + 2], { mat: 'counterFront' });
    for (const x of [-W, W - 4]) m.cube(`side_${x < 0 ? 'left' : 'right'}`, [x, 0, -D], [x + 4, H, D], { mat: 'darkOak' });
    const levels = [4, 40, 74, 108, H - 4];
    levels.forEach((y, i) => m.cube(`board_${i + 1}`, [-W + 4, y - 3, -D + 2], [W - 4, y, D], { mat: 'counterTop' }));
    // Wares on the shelves, a little different on each.
    const jar = (x, y, r, h, mat, name) => m.mesh(name, revolve([[0, 0], [r * 0.85, 0], [r, h * 0.35], [r, h * 0.8], [r * 0.6, h], [r * 0.65, h * 1.12], [0, h * 1.12]], { sides: 6 }), { mat, origin: [x, y, 1] });
    const bottle = (x, y, r, h, mat, name) => m.mesh(name, revolve([[0, 0], [r, 0], [r, h * 0.55], [r * 0.4, h * 0.75], [r * 0.35, h], [0, h]], { sides: 5 }), { mat, origin: [x, y, 2], info: { cx: x, cz: 2 } });
    const books = (x0, y, n, name) => {
      let x = x0;
      for (let i = 0; i < n; i++) {
        const w = 3 + rand(i, y, 690) * 2, h = 18 + rand(i, y, 691) * 8;
        const mat = ['bookRed', 'bookGreen', 'bookBlue'][Math.floor(rand(i, y, 692) * 3)];
        m.cube(`${name}_${i + 1}`, [x, y, -D + 3], [x + w, y + h, D - 3], { mat, info: { y0: y, h }, faces: ['south', 'up', 'east', 'west'] });
        x += w + 0.3;
      }
    };
    jar(-36, 4, 7, 20, 'clay', 'jar_1');
    jar(-20, 4, 6, 16, 'clay', 'jar_2');
    bottle(-4, 4, 4, 22, 'glassGreen', 'bottle_1');
    books(10, 4, 7, 'books_low');
    books(-44, 40, 6, 'books_mid');
    bottle(-2, 40, 3.5, 20, 'glassBlue', 'bottle_2');
    bottle(10, 40, 4, 24, 'glassAmber', 'bottle_3');
    jar(30, 40, 8, 22, 'clay', 'jar_3');
    jar(-32, 74, 9, 24, 'clay', 'jar_4');
    bottle(-12, 74, 3.5, 20, 'glassAmber', 'bottle_4');
    bottle(-2, 74, 3.5, 22, 'glassGreen', 'bottle_5');
    books(12, 74, 8, 'books_top');
    m.cube('scroll_pile', [-40, 108, -6], [-16, 114, 8], { mat: 'paper' });
    jar(8, 108, 6, 18, 'clay', 'jar_5');
    bottle(26, 108, 4, 22, 'glassBlue', 'bottle_6');
  }, { density: 0.8 }),

  barrel: defineModel('barrel', MATS, (m) => {
    // An oak barrel, bellied and iron-hooped, with a planked lid.
    const profile = [[0, 0], [15, 0], [17.5, 12], [19, 29], [17.5, 46], [15, 58], [0, 58]];
    m.mesh('barrel', revolve(profile, { sides: 12, mat: (i) => (i === profile.length - 2 ? 'barrelLid' : 'staves') }));
  }, { density: 2 }),

  crates: defineModel('crates', MATS, (m) => {
    // Two crates, one stacked askew on the other.
    m.cube('crate_big', [-25, 0, -25], [25, 50, 25], { mat: 'crate' });
    m.cube('crate_small', [-17, 50, -17], [17, 84, 17], { mat: 'crate', origin: [0, 67, 0], rotation: [0, 22, 0] });
  }, { density: 1 }),

  rug: defineModel('rug', MATS, (m) => {
    // A woven rug lying flat on the floor, where the shopkeeper lays out things bought from the player.
    m.cube('rug', [-90, 0.05, -58], [90, 0.5, 58], { mat: 'rug', info: { w: 90, d: 58 }, faces: ['up'] });
    [-26, 26].forEach((z, row) => [-55, 0, 55].forEach((x, i) => slot(m, row * 3 + i + 1, [x, 0.5, z])));
  }, { density: 1 }),
};
