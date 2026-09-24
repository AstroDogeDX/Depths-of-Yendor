// Room furniture and decorations. Origin = on the floor at the prop's middle, its front facing +z (south).
// Empty groups named slot_1, slot_2... mark where the game sets items out on a prop (shop wares).
import { defineModel, loft, lathe, revolve, tube, apex, latheRing, octRingZ, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, clamp01, patches, bevel } from './materials.mjs';

const PROP_PAL = {
  oak: P('#24170c', '#352213', '#48301b', '#5c3e23', '#6f4d2c', '#835d36'),
  darkOak: P('#150d07', '#20140b', '#2c1c10', '#3a2616', '#48301c'),
  iron: PAL.iron,
  rugRed: P('#2a0808', '#420c0c', '#5c1412', '#761c16', '#8e281e'),
  rugGold: P('#4a3208', '#6e4c12', '#94681c', '#b8862a', '#d4a440'),
  rugBlue: P('#0a1024', '#121a36', '#1a2648', '#24325c'),
  clay: P('#3a2216', '#54321f', '#6e4429', '#8a5734', '#a36c42', '#b98252'),
  glassGreen: P('#0c2414', '#14381e', '#1e4e2a', '#2c6a3a', '#4a8e56', '#8cc49a'),
  glassBlue: P('#0c1830', '#142648', '#1e3862', '#2c4e82', '#4a70a8', '#8cb0d8'),
  glassAmber: P('#2a1404', '#44200a', '#643210', '#88481a', '#ac662a', '#d49a58'),
  bookRed: P('#260808', '#3c0e0c', '#561612', '#6e2018'),
  bookGreen: P('#0c1a0c', '#142a14', '#1e3c1e', '#2a4e28'),
  bookBlue: P('#0c1224', '#141e38', '#1e2c4e', '#283a62'),
  paper: P('#6e6048', '#8f7f60', '#afa07c', '#cbbd98'),
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
  clay: (c) => ramp(PROP_PAL.clay, 0.5 + 0.16 * patches(c.p, 650, 0.6) + 0.12 * c.n.y + bevel(c, 0.1), c.ax, c.ay),
  glassGreen: (c) => glass('glassGreen', c),
  glassBlue: (c) => glass('glassBlue', c),
  glassAmber: (c) => glass('glassAmber', c),
  bookRed: (c) => book('bookRed', c),
  bookGreen: (c) => book('bookGreen', c),
  bookBlue: (c) => book('bookBlue', c),
  paper: (c) => ramp(PROP_PAL.paper, fract(c.p.y * 1.2) < 0.3 ? 0.35 : 0.7, c.ax, c.ay),
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

  display_table: defineModel('display_table', MATS, (m) => {
    // A round pedestal table for showing off a single piece of merchandise.
    m.mesh('top', lathe([[43, 26], [46, 26]], { sides: 12 }), { mat: 'counterTop' });
    m.mesh('leg', lathe([[2, 5], [8, 3.5], [30, 3.5], [40, 5], [43, 7]], { sides: 8 }), { mat: 'darkOak' });
    for (let k = 0; k < 3; k++) {
      m.mesh(`foot_${k + 1}`, tube([[0, 3, 0], [13, 1.2, 0]], { half: 1.6 }), { mat: 'darkOak', rotation: [0, k * 120, 0] });
    }
    slot(m, 1, [0, 46, 0]);
  }, { density: 2 }),

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
