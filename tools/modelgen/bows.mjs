// Bows (BOWS in src/items/defs.js), held in your off hand, and the arrows they shoot (ARROWS).
//
// A bow is held by its origin, at the middle of its grip: its limbs run up and down (±y), its back (the side away from
// you) faces +z, and its limbs sweep back from the grip toward you (−z) to the tips, where the string is tied. The string
// is on a texture of its own, "<name>_string", which the game hides in your hand to draw its own, one it can pull back
// (see ViewModel); empty groups "string_top" and "string_bottom" mark where it's tied, and "rest" where an arrow lies
// across the grip, nocked. On the floor it lies on its side.
//
// An arrow's origin is its nock, at the back, and its point is up (+y): the game turns it to fly point first.
import { Model, loft, tube, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, P, clamp01, patches, bevel } from './materials.mjs';

const PAL = {
  // Yew: pale sapwood on the back of the bow, the darker heartwood on its belly, toward you.
  sapwood: P('#4e3418', '#6c4a22', '#8c6430', '#ad8044', '#c89c5c', '#dcb878'),
  heartwood: P('#260f05', '#3a190a', '#522510', '#6c3417', '#86441f', '#a05628'),
  horn: P('#141010', '#221c18', '#342b23', '#4a3e30', '#625440', '#7e6e54'),
  linen: P('#3e3628', '#5c5240', '#7c7058', '#9c9076', '#bcb094', '#d8ceb2'),
  ash: P('#4c3c28', '#68543a', '#86704e', '#a28c64', '#bca67c', '#d2be96'),
  goose: P('#4a4a48', '#6c6c68', '#8e8e88', '#b0b0a8', '#cecec4', '#ecebe0'),
  dyed: P('#2a0806', '#46100c', '#661a12', '#88261a', '#a83624', '#c44c32'),
};

const mats = {
  ...MAT,
  // A yew stave, the grain running along it: sapwood on the back (+z), heartwood elsewhere, and a pin knot here and
  // there.
  yew(c) {
    const { p, n } = c;
    const back = n.z > 0.35;
    let v = 0.5 + 0.18 * (noise3(p.x * 0.6, p.y * 0.05, p.z * 0.6, 401) - 0.5) + bevel(c, 0.12);
    if (fract(noise3(p.x * 0.9, p.y * 0.04, p.z * 0.9, 402) * 5) < 0.14) v -= 0.14; // grain
    if (rand(Math.floor(p.y * 0.5), 403) > 0.93 && fract(p.y * 0.5) < 0.4) v -= 0.18; // pin knots
    return ramp(back ? PAL.sapwood : PAL.heartwood, v, c.ax, c.ay);
  },
  horn: (c) => ramp(PAL.horn, 0.45 + 0.2 * c.n.y + 0.12 * patches(c.p, 411, 0.8) + bevel(c, 0.2), c.ax, c.ay),
  // Linen bowstring: tight twisted turns.
  linen(c) {
    const f = fract(c.p.y * 0.9 + c.p.x + c.p.z);
    return ramp(PAL.linen, f < 0.3 ? 0.35 : 0.68, c.ax, c.ay);
  },
  ash(c) {
    const { p } = c;
    let v = 0.55 + 0.14 * (noise3(p.x, p.y * 0.08, p.z, 421) - 0.5);
    if (fract(noise3(p.x * 2, p.y * 0.05, p.z * 2, 422) * 4) < 0.12) v -= 0.12;
    return ramp(PAL.ash, v, c.ax, c.ay);
  },
  // Feathers, their barbs slanting back from the shaft, and the cock feather dyed red.
  feather: (c) => vane(PAL.goose, c),
  cock: (c) => vane(PAL.dyed, c),
};

function vane(pal, c) {
  const { p } = c;
  const r = Math.hypot(p.x, p.z);
  let v = 0.62 - r * 0.08;
  if (fract(p.y * 1.4 - r * 0.6) < 0.25) v -= 0.16;
  if (r < 0.55) v = 0.3; // the quill
  return ramp(pal, clamp01(v), c.ax, c.ay);
}

/**
 * A stave along a curve in the y-z plane: `at(y)` its z, and `w(y)`, `t(y)` its half-width (x) and half-thickness
 * across it, at each of `ys`.
 */
function stave(ys, at, w, t) {
  return ys.map((y) => {
    const dz = (at(y + 0.01) - at(y - 0.01)) / 0.02, len = Math.hypot(1, dz);
    const ny = -dz / len, nz = 1 / len; // across the stave, in the y-z plane
    const z = at(y);
    return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([sx, st]) => [sx * w(y), y + ny * st * t(y), z + nz * st * t(y)]);
  });
}

/** The wooden bow: a yew self bow, its grip wrapped in leather, horn nocks at its tips, strung with linen. */
export function woodenBow() {
  const L = 34, TIP = -9; // half its length, and how far back toward you its tips sweep
  const GRIP = 4.5; // half the grip's length
  const m = new Model('wooden_bow', {
    materials: mats,
    sheets: [{ name: 'wooden_bow', mode: 'default' }, { name: 'wooden_bow_string', mode: 'default' }],
    sheetOf: { linen: 1 },
  });
  const z = (y) => TIP * Math.max(0, (Math.abs(y) - GRIP) / (L - GRIP)) ** 1.6;
  const w = (y) => (Math.abs(y) < GRIP ? 1.3 : 1.25 - 0.65 * ((Math.abs(y) - GRIP) / (L - GRIP)));
  const t = (y) => (Math.abs(y) < GRIP ? 1.5 : 1.05 - 0.5 * ((Math.abs(y) - GRIP) / (L - GRIP)));
  const span = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  m.mesh('limb_upper', loft(stave(span(GRIP, L, 8), z, w, t)), { mat: 'yew' });
  m.mesh('limb_lower', loft(stave(span(-L, -GRIP, 8), z, w, t)), { mat: 'yew' });
  m.mesh('grip', loft(stave(span(-GRIP, GRIP, 3), z, (y) => w(y) + 0.25, (y) => t(y) + 0.25)), { mat: 'leather' });
  // Horn nocks capping the tips, the string tied just under them.
  for (const s of [1, -1]) {
    const ys = s > 0 ? [L - 2.6, L + 0.6] : [-L - 0.6, -L + 2.6];
    m.mesh(`nock_${s > 0 ? 'top' : 'bottom'}`, loft(stave(ys, z, (y) => w(y) + 0.2, (y) => t(y) + 0.2)), { mat: 'horn' });
  }
  const tie = L - 1.4, back = z(tie) - 0.6;
  m.mesh('string', tube([[0, tie, back], [0, -tie, back]], { half: 0.22 }), { mat: 'linen' });
  m.group('string_top', undefined, { origin: [0, tie, back] });
  m.group('string_bottom', undefined, { origin: [0, -tie, back] });
  // An arrow nocked lies across the grip, against its left side, just over your hand.
  m.group('rest', undefined, { origin: [1.9, GRIP + 1, 0] });
  return m;
}

/** An arrow: an ash shaft, goose fletching with a red cock feather, and an iron bodkin. */
export function arrow() {
  const m = new Model('arrow', { materials: mats });
  m.mesh('shaft', tube([[0, 0.5, 0], [0, 38, 0]], { half: 0.35 }), { mat: 'ash' });
  m.cube('nock', [-0.5, -0.6, -0.5], [0.5, 1.2, 0.5], { mat: 'horn' });
  // Three vanes a third of the way round from each other, each a face either side.
  const shape = [[0.35, 2.4], [2, 3.2], [1.5, 9.2], [0.35, 11.6]];
  [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 - (2 * Math.PI) / 3].forEach((a, i) => {
    const pts = shape.map(([r, y]) => [Math.cos(a) * r, y, Math.sin(a) * r]);
    m.mesh(`vane_${i + 1}`, [{ pts }, { pts: pts.slice().reverse() }], { mat: i === 0 ? 'cock' : 'feather' });
  });
  const ring = (y, r) => [[0, y, -r], [r, y, 0], [0, y, r], [-r, y, 0]];
  m.mesh('head', loft([ring(37.4, 0.5), ring(39.6, 1.1), ring(42.4, 0.7), ring(44.6, 0)]), { mat: 'iron' });
  return m;
}
