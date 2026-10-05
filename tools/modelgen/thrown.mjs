// Thrown weapons (THROWN in src/items/defs.js): a stone, a dart and a throwing knife, held in your hand to throw, lying
// in piles on the floor, and turning in the air.
//
// Each has its origin where the hand holds it, and its point, if it has one, up (+y): the game turns a dart to fly point
// first, and a stone or a knife end over end about its middle. A knife's edges face ±z, as a weapon's do.
import { Model, loft, lathe, tube, apex, diamondRing, noise3, rand, ramp } from './lib.mjs';
import { P, interp, patches, bevel } from './materials.mjs';
import { mats as arrowMats } from './bows.mjs';

const PAL = {
  // A river stone, grey-brown, smoothed by the water.
  stone: P('#2c2a26', '#403d37', '#57534b', '#6f6a60', '#898378', '#a39d90', '#bcb6a8'),
  lead: P('#1e2024', '#2e3136', '#42464c', '#585d64', '#72777e', '#90959c'),
};

const mats = {
  ...arrowMats,
  // Smooth stone, lit from above, with darker flecks, and a pale band of quartz round it.
  pebble(c) {
    const { p, n } = c;
    let v = 0.46 + 0.2 * n.y + 0.14 * patches(p, 501, 0.5) + bevel(c, 0.1);
    if (Math.abs(p.x * 0.35 + p.z * 0.9 - 0.4) < 0.35) v += 0.24; // the quartz
    if (rand(c.ax, c.ay, 502) > 0.92) v -= 0.16; // flecks
    return ramp(PAL.stone, v, c.ax, c.ay);
  },
  lead: (c) => ramp(PAL.lead, 0.48 + 0.22 * c.n.y + 0.1 * patches(c.p, 511, 0.9), c.ax, c.ay),
};

/** A stone the size of an egg, a little flattened and lopsided, lying along x: its origin at its middle. */
export function throwingStone() {
  const m = new Model('throwing_stone', { materials: mats, density: 4 });
  // Rings round its length (modelled up y, and laid down), each pushed in and out a little.
  const SIDES = 10;
  const prof = [[-2.5, 0], [-2.1, 1.0], [-1.2, 1.6], [0, 1.78], [1.1, 1.62], [2.0, 1.1], [2.5, 0]];
  const rings = prof.map(([y, r], i) => (r === 0 ? apex(SIDES, [0, y, 0]) : Array.from({ length: SIDES }, (_, k) => {
    const a = (k / SIDES) * 2 * Math.PI, j = 1 + 0.16 * (noise3(Math.cos(a) * 1.3, i * 0.7, Math.sin(a) * 1.3, 520) - 0.5);
    return [Math.cos(a) * r * 0.78 * j, y, Math.sin(a) * r * 1.15 * j];
  })));
  m.mesh('stone', loft(rings), { mat: 'pebble', rotation: [0, 0, 90] });
  return m;
}

/**
 * A dart, point up, held just behind its head: an ash shaft, a lead collar weighting it there, an iron point, and three
 * goose vanes at its tail, one dyed red.
 */
export function dart() {
  const m = new Model('dart', { materials: mats });
  m.mesh('shaft', tube([[0, -5.8, 0], [0, 2.4, 0]], { half: 0.34 }), { mat: 'ash' });
  m.mesh('collar', lathe([[1.2, 0.5], [1.8, 0.8], [3.0, 0.8], [3.5, 0.5]], { sides: 6 }), { mat: 'lead' });
  const square = (y, r) => [[0, y, -r], [r, y, 0], [0, y, r], [-r, y, 0]];
  m.mesh('head', loft([square(3.3, 0.5), square(4.1, 0.85), square(6.0, 0.4), apex(4, [0, 7.6, 0])]), { mat: 'iron' });
  // Three vanes a third of the way round from each other, each a face either side.
  const shape = [[0.34, -5.6], [1.4, -5.0], [1.2, -3.2], [0.34, -2.5]];
  [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 - (2 * Math.PI) / 3].forEach((a, i) => {
    const pts = shape.map(([r, y]) => [Math.cos(a) * r, y, Math.sin(a) * r]);
    m.mesh(`vane_${i + 1}`, [{ pts }, { pts: pts.slice().reverse() }], { mat: i === 0 ? 'cock' : 'feather' });
  });
  return m;
}

/**
 * A throwing knife, point up, held by its handle: a slim leaf of a blade with no guard, its edges to ±z, a handle bound
 * in cord, and a ring at its end.
 */
export function throwingKnife() {
  const m = new Model('throwing_knife', { materials: mats });
  const prof = [[2.4, 0.62, 0.3], [3.2, 0.95, 0.32], [6.6, 1.12, 0.3], [9.0, 0.7, 0.22]], tip = 11;
  const hw = interp([...prof.map(([y, w]) => [y, w]), [tip, 0.05]]);
  m.mesh('blade', loft([...prof.map(([y, w, t]) => diamondRing(y, w, t)), apex(4, [0, tip, 0])], { capEnd: false }),
    { mat: 'steel', info: { hw, base: prof[0][0], style: 'diamond', glints: [6] } });
  m.mesh('handle', lathe([[-3.0, 0.5, 0.36], [2.5, 0.56, 0.38]], { sides: 6 }), { mat: 'cord' });
  const ring = Array.from({ length: 8 }, (_, k) => [0, -4.1 + Math.sin((k / 8) * 2 * Math.PI), Math.cos((k / 8) * 2 * Math.PI)]);
  m.mesh('ring', tube(ring, { half: 0.3, side: [1, 0, 0], closed: true }), { mat: 'iron' });
  return m;
}
