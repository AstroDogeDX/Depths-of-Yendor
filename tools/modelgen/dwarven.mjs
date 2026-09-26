// The Dwarven Ruins' props: the makeshift bridges over its rifts, its wall lights, and the decorations
// dungeon/decor.js sets about its rooms: the trappings of a grand kingdom of red stone and gold, fallen into
// ruin and disarray. Floor props: origin on the floor at the middle, front facing +z. Against-the-wall props
// stand with their origin 36 px out from the wall (at z -36). Wall props: origin on the wall face at floor
// level, standing out along +z. Wall lights: origin on the wall 1.85 m up, an empty "flame" group where the fire
// burns.
import * as THREE from 'three';
import { defineModel, loft, revolve, tube, latheRing, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, patches, bevel } from './materials.mjs';
import { HALF, VAULT as TOP, prism, bothFaces } from './doorkit.mjs';

const DW = {
  stone: P('#1f1614', '#2e211d', '#3f2e28', '#523b33', '#664a3f', '#7c5b4d'),
  porphyry: P('#2a100c', '#3e1811', '#542219', '#6b2c20', '#833829', '#9c4634'),
  bronze: P('#241708', '#3c2810', '#573c18', '#755222', '#946a30', '#b08440'),
  red: P('#1a0504', '#2e0908', '#470f0d', '#621814', '#7e231b', '#9a3224'),
  wood: P('#130b07', '#1d120b', '#291a10', '#372316', '#462d1c', '#553823'),
  rope: P('#3a2c18', '#57442a', '#76603c', '#937a4e'),
  wax: P('#5a5040', '#857a5e', '#aea380', '#cdc29e', '#e6dcb8'),
  void: P('#050208', '#0e0616', '#1c0a2c', '#3a1258', '#6a2a9c', '#a45ad8', '#d8a8ff'),
  ruby: P('#3a0608', '#6a0e10', '#9a1a18', '#c83426', '#f06a40', '#ffb080'),
  paper: P('#4a3e2c', '#6a5a40', '#8a7856', '#a8966e', '#c4b288'),
  dust: P('#231a14', '#33261d', '#453427', '#584535'),
  skin: P('#4a2a1c', '#6e4230', '#8e5a40', '#aa7454'),
  beard: P('#2a1208', '#4a200e', '#6e3216', '#8e4a20', '#b0662e'),
  canvasBg: P('#0e1208', '#161c0e', '#1e2614', '#28321c'),
  sky: P('#101428', '#1c2240', '#3a2e48', '#6a4038', '#a0602c', '#d09040'),
  peak: P('#141018', '#221c28', '#322a38', '#443a48', '#8a8494', '#c8c4d0'),
  books: [P('#260808', '#3c0e0c', '#561612', '#6e2018'), P('#0c1a0c', '#142a14', '#1e3c1e', '#2a4e28'),
    P('#0c1224', '#141e38', '#1e2c4e', '#283a62'), P('#1e140a', '#2e1f10', '#402c18', '#523a20')],
};
const WALL = -36; // where the wall is, for props stood against it

/** The pose of an element (Blockbench origin and rotation), so a painter can find where it is on the element itself. */
const pose = (origin, rot) => new THREE.Matrix4().compose(new THREE.Vector3(...origin),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot.map((d) => (d * Math.PI) / 180), 'ZYX')), new THREE.Vector3(1, 1, 1));
/** A painted point in the element's own space (its `info.inv`, the inverse of its pose). */
const local = (c) => new THREE.Vector3(c.p.x, c.p.y, c.p.z).applyMatrix4(c.info.inv);
/** The element's local +y, in model space: the way a shard points. */
const upOf = (rot) => new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(...rot.map((d) => (d * Math.PI) / 180), 'ZYX')).toArray();
const flecks = (c) => { const r = rand(c.ax, c.ay, 2002); return r > 0.94 ? 0.16 : r < 0.05 ? -0.14 : 0; };
const clear = [0, 0, 0, 0];

function wood(c) {
  const { p, info } = c;
  const a = p[info.along ?? 'y'];
  let v = 0.46 + 0.14 * patches(p, 2007, 0.25) + bevel(c, 0.15);
  if (fract(a * 0.1 + noise3(p.x * 0.3, p.y * 0.3, p.z * 0.3, 2008) * 0.8) < 0.12) v -= 0.14; // grain
  return ramp(DW.wood, v, c.ax, c.ay);
}
const stone = (c) => ramp(DW.stone, 0.5 + 0.14 * patches(c.p, 2000, 0.3) + bevel(c, 0.15) + flecks(c) + 0.06 * c.n.y, c.ax, c.ay);
const gold = MAT.gold;

/** Dwarven knotwork, as in the walls' frieze: gold knots on dark stone, `x`, `y` across and up a band 8 high. */
function knots(c, x, y) {
  const lx = ((x % 16) + 16) % 16, ly = Math.min(7, Math.max(0, y));
  if (ly < 1 || ly > 6) return gold(c);
  const dx = Math.abs(lx - 7.5), dy = Math.abs(ly - 3.5), s = dx + dy;
  return (s >= 3 && s < 4.2) || s < 1.1 || (dy < 0.6 && dx > 5.5) ? gold(c) : ramp(DW.stone, 0.12, c.ax, c.ay);
}

const MATS = {
  ...MAT,
  stone,
  wood,
  porphyry: (c) => ramp(DW.porphyry, 0.52 + 0.1 * patches(c.p, 2003, 0.25) + bevel(c, 0.2) + flecks(c) + 0.06 * c.n.y, c.ax, c.ay),
  bronze: (c) => ramp(DW.bronze, 0.5 + 0.14 * patches(c.p, 2004, 0.35) + 0.12 * c.n.y + bevel(c, 0.24) - (rand(c.ax, c.ay, 2005) > 0.97 ? 0.2 : 0), c.ax, c.ay),
  velvet: (c) => ramp(DW.red, 0.45 + 0.1 * patches(c.p, 2006, 0.5) + 0.2 * Math.max(0, c.n.y) + bevel(c, 0.15) + ((c.ax + c.ay) % 2 ? 0.03 : -0.03), c.ax, c.ay),
  rope: (c) => ramp(DW.rope, fract((c.p.x + c.p.y + c.p.z) * 0.6) < 0.4 ? 0.3 : 0.65, c.ax, c.ay),
  dust: (c) => ramp(DW.dust, 0.45 + 0.25 * patches(c.p, 2090, 0.7), c.ax, c.ay),
  paper: (c) => ramp(DW.paper, 0.55 + 0.1 * patches(c.p, 2091, 0.6) - (rand(c.ax, c.ay, 2092) > 0.9 ? 0.15 : 0), c.ax, c.ay),
  wax: (c) => ramp(DW.wax, 0.5 + 0.1 * patches(c.p, 920, 1) + (c.n.y > 0.7 ? 0.2 : 0) + bevel(c, 0.1), c.ax, c.ay),
  wick: (c) => ramp(DW.void, 0.3, c.ax, c.ay),
  // A beam from some hall's ceiling: lacquered red, banded and edged in gold.
  gildedBeam(c) {
    if (fract((c.p.z + 300) / 26) < 0.12 || c.edge < 1.2) return gold(c);
    return ramp(DW.red, 0.4 + 0.12 * patches(c.p, 2010, 0.3) + bevel(c, 0.12) - (rand(c.ax, c.ay, 2011) > 0.9 ? 0.15 : 0), c.ax, c.ay);
  },
  // A door's face: planks, gold-headed studs, two iron straps.
  door(c) {
    const { p, n } = c;
    if (Math.abs(n.y) < 0.5) return wood({ ...c, info: { along: 'z' } });
    if ([-12, 6].some((z) => Math.abs(p.z - z) < 2)) return MAT.rustyIron(c);
    const k = Math.floor((p.x + 100) / 10), f = fract((p.x + 100) / 10);
    if (Math.abs(f - 0.5) < 0.12 && Math.abs(fract((p.z + 100) / 9) - 0.5) < 0.14) return ramp(PAL.gold, 0.7, c.ax, c.ay);
    if (f < 0.06) return ramp(DW.wood, 0.05, c.ax, c.ay);
    let v = 0.45 + 0.18 * (rand(k, 2012) - 0.5) + 0.1 * patches(p, 2013, 0.3);
    if (fract(p.z * 0.09 + noise3(p.x, 0, p.z * 0.1, 2014)) < 0.1) v -= 0.12;
    return ramp(DW.wood, v, c.ax, c.ay);
  },
  // --- The door (door_dwarven)
  // The leaf's faces: a bronze border a gold line within it, then dark planks set with gold-headed studs, crossed
  // by two bronze bands. Laid out by where a point is on the leaf (see DWARF_LEAF), so the border runs clean round
  // its chamfered top.
  dwarfDoor(c) {
    const { p, n } = c;
    if (Math.abs(n.z) < 0.5) return MATS.bronze(c);
    const ax = Math.abs(p.x), d = Math.min(52 - ax, p.y - 1.5, 147 - p.y, (185.6 - ax - p.y) / Math.SQRT2);
    if (d < 5) return MATS.bronze(c);
    if (d < 6.2) return gold(c);
    const band = [38, 116].find((y) => p.y > y && p.y < y + 6);
    const stud = (y0) => Math.abs(fract((p.x + 100) / 10) - 0.5) < 0.14 && Math.abs(p.y - y0) < 1.2;
    if (band !== undefined) return stud(band + 3) ? ramp(PAL.gold, 0.78, c.ax, c.ay) : MATS.bronze(c);
    // Studs in a staggered grid, every other plank, a row every 26 px, clear of the medallion.
    const row = Math.floor((p.y + 13) / 26), col = Math.floor((p.x + 100) / 10);
    if ((col + row) % 2 === 0 && Math.hypot(p.x, p.y - 84) > 17 && Math.abs(fract((p.x + 100) / 10) - 0.5) < 0.14 && Math.abs(fract((p.y + 13) / 26) - 0.5) < 0.05) {
      return ramp(PAL.gold, 0.7, c.ax, c.ay);
    }
    if (fract((p.x + 100) / 10) < 0.07) return ramp(DW.wood, 0.05, c.ax, c.ay);
    return wood(c);
  },
  // The doorway's jambs: porphyry, a gold line along the edge of the opening.
  dwarfJamb(c) {
    if (Math.abs(c.n.z) > 0.5 && Math.abs(Math.abs(c.p.x) - 54.2) < 0.9) return gold(c);
    return MATS.porphyry(c);
  },
  // The lintel: porphyry, the walls' gold knotwork run along its faces between two gold rules.
  dwarfLintel(c) {
    const { p, n } = c;
    if (Math.abs(n.z) > 0.5) {
      if (p.y > 156 && p.y < 164) return knots(c, p.x + 64, p.y - 156);
      if ((p.y > 153.5 && p.y < 155) || (p.y > 165 && p.y < 166.5)) return gold(c);
    }
    return MATS.porphyry(c);
  },
  // The kingdom's crest over the door: a lozenge of gold, a hammer struck into it.
  crest(c) {
    const { p } = c, y = p.y - 163;
    if ((Math.abs(p.x) < 5.5 && y > 2 && y < 5.5) || (Math.abs(p.x) < 1.1 && y > -7 && y < 3)) return ramp(PAL.gold, 0.25, c.ax, c.ay);
    return gold(c);
  },
  // A medallion on the leaf: gold, a ring cut round its rim, a hammer at its heart.
  medallion(c) {
    const { p } = c, x = p.x, y = p.y - 84, r = Math.hypot(x, y);
    if (Math.abs(r - 9.5) < 0.7 || (Math.abs(x) < 4.5 && y > 1.5 && y < 4.5) || (Math.abs(x) < 1 && y > -6 && y < 2.5)) return ramp(PAL.gold, 0.28, c.ax, c.ay);
    return gold(c);
  },
  // A bar across a locked door: bronze, banded in gold every 24 px.
  lockBar: (c) => (Math.abs(fract((c.p.x + 12) / 24) - 0.5) < 0.1 ? gold(c) : MATS.bronze(c)),
  // A lock box: bronze, edged in gold, a keyhole in a gold escutcheon at (`info.kx`, `info.ky`).
  lockBox(c) {
    const { p, n, info } = c;
    if (Math.abs(n.z) > 0.5) {
      const r = Math.hypot(p.x - info.kx, p.y - info.ky);
      if (r < 1.3 || (Math.abs(p.x - info.kx) < 0.6 && p.y < info.ky && p.y > info.ky - 4)) return ramp(DW.void, 0.1, c.ax, c.ay);
      if (r < 4 || c.edge < 1.5) return gold(c);
    }
    return MATS.bronze(c);
  },
  // A banner of the kingdom: red cloth, a gold border, the royal sigil (a hammer in a lozenge under a crown) and
  // chevrons down to a hem gone to rags; moth-eaten here and there.
  banner(c) {
    const { p, info } = c, x = p.x, y = p.y, ax = Math.abs(x);
    const strip = Math.floor((x + 100) / 4);
    if (y < info.BOT + 8 - 20 * rand(strip, 2201) - 5 * noise3(x * 0.3, 0, 0, 2202)) return clear; // tatters
    if (noise3(x * 0.35, y * 0.35, 0, 2203) > 0.82 && y < info.TOP - 16) return clear; // moth holes
    const weave = (c.ax + c.ay) % 2 ? 0.04 : -0.04;
    const g = () => ramp(PAL.gold, 0.55 + weave + 0.12 * patches(p, 2204, 0.5), c.ax, c.ay);
    if ((ax > info.W - 4 && ax < info.W - 1.5) || (y > info.TOP - 8 && y < info.TOP - 5)) return g();
    const cy = 118, s = ax + Math.abs(y - cy);
    if ((s > 12 && s < 15) || (ax < 7 && Math.abs(y - (cy + 4)) < 2.5) || (ax < 1.3 && y > cy - 9 && y < cy + 4)) return g();
    if (ax < 9 && ((y > 136 && y < 139) || (y >= 139 && y < 144 && Math.abs(fract((x + 9) / 6) - 0.5) < 0.2 - (y - 139) * 0.03))) return g(); // the crown
    if (y < 100 && y > info.BOT - 4 && ax < info.W - 6 && fract((y - ax * 0.9) / 11) < 0.18) return g();
    return ramp(DW.red, 0.5 + weave + 0.12 * patches(p, 2205, 0.3) - (y < info.BOT + 18 ? 0.14 : 0), c.ax, c.ay);
  },
  // A gilt picture frame: beads along its edges, a groove, grime in the carving.
  frame(c) {
    let v = 0.5 + 0.12 * c.n.y + 0.1 * patches(c.p, 2015, 0.6);
    if (c.edge < 1.2) v += 0.22;
    else if (c.edge > 2.5 && c.edge < 3.6) v -= 0.25;
    if (rand(c.ax, c.ay, 2016) > 0.9) v -= 0.18;
    return ramp(PAL.gold, v, c.ax, c.ay);
  },
  // A portrait of a dwarf king: crown, braided beard ringed with gold, a red robe; slashed across by a blade.
  portrait(c) {
    const q = local(c), X = q.x, Y = q.y - c.info.cy;
    const R = (pal, v) => ramp(pal, v, c.ax, c.ay);
    const cut = Math.abs(Y - (X * 0.42 - 9) - 1.5 * Math.sin(X * 0.5));
    if (X > -28 && X < 24 && cut < 0.9) return R(DW.void, 0.1);
    if (X > -28 && X < 24 && cut < 1.7) return R(DW.paper, 0.6);
    let col;
    const head = (X / 7) ** 2 + ((Y - 5) / 8) ** 2 < 1;
    const beard = Y < 4 && Y > -21 && Math.abs(X) < 10 - (4 - Y) * 0.12;
    const crown = Y >= 12 && Y < 19 && Math.abs(X) < 8 && (Y < 15 || Math.abs(fract((X + 8) / 4) - 0.5) < 0.22);
    const robe = Y < -1 && Math.abs(X) < 16 + (-1 - Y) * 0.8;
    if (crown) col = R(PAL.gold, Math.abs(X) < 1.2 && Y > 13 && Y < 15 ? 0.1 : 0.72 - (Y - 12) * 0.03);
    else if (beard) {
      const f = fract((X + 20) / 3.3);
      col = Math.abs(Y + 12) < 1 && f < 0.5 ? R(PAL.gold, 0.6) : R(DW.beard, 0.45 + (f < 0.35 ? 0.2 : -0.05) + Y * 0.008);
    } else if (head) {
      col = R(DW.skin, 0.55 - X * 0.02);
      if (Math.abs(Math.abs(X) - 3) < 1 && Math.abs(Y - 7) < 0.9) col = R(DW.void, 0.3);
      if (Y > 9 && Y < 10.5 && Math.abs(X) < 5.5) col = R(DW.beard, 0.4);
    } else if (robe) col = Math.abs(Y + 2.5) < 1.2 ? R(PAL.gold, 0.55) : R(DW.red, 0.45 + 0.1 * patches(q, 2020, 0.4) - Math.abs(X) * 0.008);
    else col = R(DW.canvasBg, 0.25 + ((Y + 23) / 46) * 0.35 + 0.1 * patches(q, 2021, 0.3));
    return rand(c.ax, c.ay, 2022) > 0.93 ? col.map((v) => v * 0.8) : col; // old varnish, crazed
  },
  // A painting of the kingdom's great gate carved into a mountainside at dusk; a boot has gone through it.
  landscape(c) {
    const q = local(c), X = q.x, Y = q.y - c.info.cy;
    const R = (pal, v) => ramp(pal, v, c.ax, c.ay);
    if (((X - 12) / 5) ** 2 + ((Y + 5) / 8) ** 2 < 1) return R(DW.void, 0.1);
    if (((X - 12) / 6.2) ** 2 + ((Y + 5) / 9.2) ** 2 < 1) return R(DW.paper, 0.55);
    const ridge = 1 + 9 * noise3(X * 0.12, 0, 0, 2030) + 4 * noise3(X * 0.4, 0, 1, 2031);
    let col;
    if (Y > ridge) col = R(DW.sky, 0.8 - ((Y - ridge) / Math.max(4, 21 - ridge)) * 0.75);
    else if (Y > ridge - 1.6) col = R(DW.peak, 0.85);
    else if (Math.abs(X + 5) < 6 && Y < -4) col = Math.abs(X + 5) < 3 && Y < -7 + 2 * Math.cos((X + 5) * 0.5) ? R(DW.void, 0.2) : R(PAL.gold, 0.55 + (Y + 20) * 0.01);
    else col = R(DW.peak, 0.3 + 0.2 * noise3(X * 0.2, Y * 0.2, 2, 2032) + (Y + 20) * 0.006);
    return rand(c.ax, c.ay, 2033) > 0.93 ? col.map((v) => v * 0.8) : col;
  },
  // A round shield's face: an iron rim, a ring of gold runes, gold bands crossing a red field (or all in stone,
  // on a statue: `info.stone`).
  shieldFace(c) {
    const { p, n, info } = c, x = p.x - info.cx, y = p.y - info.cy, r = Math.hypot(x, y);
    const field = info.stone ? stone : (k) => ramp(DW.red, 0.5 + 0.12 * patches(p, 2040, 0.4), k.ax, k.ay);
    const metal = info.stone ? (k) => ramp(DW.stone, 0.7, k.ax, k.ay) : gold;
    if (n.z < 0.5 || r > info.r - 2.2) return info.stone ? stone(c) : ramp(PAL.iron, 0.45 + bevel(c, 0.25) + 0.1 * patches(p, 2041, 0.5), c.ax, c.ay);
    if (r > info.r * 0.58 && r < info.r * 0.7) return Math.abs(fract(Math.atan2(y, x) / (Math.PI / 6)) - 0.5) < 0.15 ? ramp(DW.stone, 0.1, c.ax, c.ay) : metal(c);
    if (Math.abs(x) < 1.2 || Math.abs(y) < 1.2) return metal(c);
    return field(c);
  },
  // A great rug: a gold fringe, a border of gold zigzags, a red field with a gold medallion; frayed, torn, stained
  // and scorched, and one corner folded back (cut away here; the flap shows it turned over).
  grandRug(c) {
    const { p, info } = c, x = p.x, z = p.z, ax = Math.abs(x), az = Math.abs(z);
    if (x + z > info.w + info.d - info.F) return clear;
    const e = Math.min(info.w - ax, info.d - az);
    if (e < 2.4 * noise3(x * 0.5, z * 0.5, 0, 2300)) return clear; // frayed edge
    if (Math.hypot(x + 48, z - 18) < 5 + 3 * noise3(x * 0.4, z * 0.4, 1, 2301)) return clear; // a hole torn through
    const weave = (c.ax + c.ay) % 2 ? 0.04 : -0.04;
    const g = (v = 0.55) => ramp(PAL.gold, v + weave, c.ax, c.ay);
    let col;
    if (e < 3) col = g(0.45);
    else if (e < 14) col = Math.abs(fract((ax + az) / 12 + (e - 3) / 22) - 0.5) < 0.12 ? g() : ramp(DW.red, 0.25 + weave, c.ax, c.ay);
    else if (e < 15.5) col = g(0.5);
    else {
      const m = ax / 1.6 + az;
      if ((m > 18 && m < 21) || m < 6) col = g();
      else if (m < 18) col = ramp(DW.red, 0.3 + weave, c.ax, c.ay);
      else col = fract((ax + az * 1.5) / 16) < 0.08 ? ramp(DW.red, 0.3, c.ax, c.ay) : ramp(DW.red, 0.52 + weave + 0.1 * patches(p, 2302, 0.25), c.ax, c.ay);
    }
    const burn = Math.hypot(x - 42, z + 20) / (12 + 4 * noise3(x * 0.3, z * 0.3, 2, 2303));
    if (burn < 1) col = burn < 0.45 ? ramp(DW.void, 0.1, c.ax, c.ay) : col.map((v) => v * (0.3 + burn * 0.5));
    if (patches(p, 2304, 0.15) < -0.28) col = col.map((v) => v * 0.8); // old stains
    return col;
  },
  rugBack: (c) => ramp(DW.red, 0.28 + ((c.ax + c.ay) % 2 ? 0.04 : -0.04) + 0.08 * patches(c.p, 2305, 0.4), c.ax, c.ay),
  // A tabletop: planks along its length, a gold inlaid border on its face.
  tableTop(c) {
    const { p, n } = c;
    if (n.z > 0.5 && c.edge > 1.4 && c.edge < 3) return gold(c);
    const k = Math.floor((p.y + 100) / 9), f = fract((p.y + 100) / 9);
    if (n.z > 0.5 && f < 0.07) return ramp(DW.wood, 0.05, c.ax, c.ay);
    let v = 0.46 + 0.16 * (rand(k, 2310) - 0.5) + 0.1 * patches(p, 2311, 0.3) + bevel(c, 0.12);
    if (fract(p.x * 0.08 + noise3(k, p.x * 0.05, 0, 2312)) < 0.1) v -= 0.12;
    return ramp(DW.wood, v, c.ax, c.ay);
  },
  // Column stone, fluted: `info.inv` puts the column's axis along its own y.
  column(c) {
    const q = local(c), r = Math.hypot(q.x, q.z);
    let v = 0.5 + 0.12 * patches(c.p, 2050, 0.3) + flecks(c);
    if (r > c.info.r - 1 && fract((Math.atan2(q.z, q.x) / (Math.PI * 2)) * 16) < 0.3) v -= 0.2;
    if (c.info.broken && r < c.info.r - 1) v -= 0.12; // the rough, broken face
    return ramp(DW.stone, v, c.ax, c.ay);
  },
  // Polished steel, dented and pitted, gold trim wherever `info.trim(p)` says.
  armor(c) {
    const { p, info } = c;
    if (info.trim?.(p)) return gold(c);
    let v = 0.4 + 0.14 * patches(p, 2060, 0.4) + 0.18 * c.n.y + bevel(c, 0.22);
    if (rand(c.ax, c.ay, 2061) > 0.975) v -= 0.18;
    return ramp(PAL.steel, v * 0.88, c.ax, c.ay);
  },
  mail: (c) => ramp(PAL.iron, ((c.ax >> 1) + (c.ay >> 1)) % 2 ? 0.55 + 0.1 * c.n.y : 0.25, c.ax, c.ay),
  // Emissive: a shard of the evil below, black glass that glows violet toward its tip and along its edges.
  voidShard(c) {
    const { p, n, info } = c;
    const t = Math.max(0, Math.min(1, ((p.x - info.o[0]) * info.d[0] + (p.y - info.o[1]) * info.d[1] + (p.z - info.o[2]) * info.d[2]) / info.h));
    let v = 0.1 + 0.45 * t + 0.2 * Math.max(0, n.x * 0.3 + n.y * 0.6 + n.z * 0.7);
    if (c.edge < 1) v += 0.25;
    return ramp(DW.void, v, c.ax, c.ay);
  },
  // Emissive: the crack the shards burst out of: black inside, lit violet toward its edges.
  voidCrack(c) {
    const { p, info } = c;
    const t = Math.hypot(p.x - info.cx, p.y - info.cy) / info.R(Math.atan2(p.y - info.cy, p.x - info.cx));
    return ramp(DW.void, t > 0.84 ? 0.7 : t > 0.64 ? 0.45 : 0.06 + 0.1 * noise3(p.x * 0.3, p.y * 0.3, 0, 2070), c.ax, c.ay);
  },
  // Emissive: ruby glass lit from within.
  ruby: (c) => ramp(DW.ruby, 0.4 + 0.3 * Math.max(0, c.n.z * 0.5 + c.n.y * 0.4 + c.n.x * 0.3) + (c.edge < 1 ? 0.18 : 0) + 0.08 * patches(c.p, 2080, 1), c.ax, c.ay),
  book(c) {
    const { info } = c, pal = DW.books[info.b % DW.books.length];
    if (info.h && c.n.z > 0.7 && [0.22, 0.78].some((f) => Math.abs(fract((c.p.y - info.y0) / info.h) - f) < 0.06)) return ramp(PAL.gold, 0.6, c.ax, c.ay);
    if (info.pages && Math.abs(c.n.y) < 0.5 && c.edge > 0.7) return ramp(DW.paper, fract(c.p.y * 1.5) < 0.3 ? 0.4 : 0.7, c.ax, c.ay); // the page edges
    return ramp(pal, 0.5 + 0.12 * patches(c.p, 2081, 1) + bevel(c, 0.15), c.ax, c.ay);
  },
  // A slab of the floors' marble broken away: red and cream on top, a line of gold across it here and there,
  // rough broken stone round its sides.
  slab(c) {
    const { p, n } = c;
    if (n.y < 0.6) return ramp(DW.stone, 0.32 + 0.12 * patches(p, 2720, 0.5) + flecks(c), c.ax, c.ay);
    if (Math.abs(fract((p.x + p.z + 400) / 23) - 0.5) < 0.05) return ramp(PAL.gold, 0.4, c.ax, c.ay);
    return patches(p, 2721, 0.12) > 0.08 ? ramp(DW.paper, 0.35 + 0.1 * patches(p, 2722, 0.6), c.ax, c.ay)
      : ramp(DW.porphyry, 0.4 + 0.1 * patches(p, 2723, 0.5) + flecks(c), c.ax, c.ay);
  },
  crack: (c) => ramp(DW.void, 0.15, c.ax, c.ay),
  // A piece of the walls' gilded frieze, broken off: knots across its face (`info.inv` lays it out).
  frieze(c) {
    const q = local(c);
    return c.info.face(q) ? knots(c, q.x + 100, q.y - c.info.y0) : MATS.porphyry(c);
  },
};

// ---------------------------------------------------------------- shared parts

/** Moves polygons by `d`. */
const shift = (polys, d) => polys.map((poly) => ({ ...poly, pts: poly.pts.map((p) => p.map((v, i) => v + d[i])) }));

/** A polygon wound so it faces `out`. */
function facing(pts, out) {
  const [a, b, c] = pts;
  const u = b.map((v, i) => v - a[i]), w = c.map((v, i) => v - a[i]);
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  return { pts: n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? pts : [...pts].reverse() };
}

/** A candle, `h` tall, its wick marked by an anchor group candle_`i` for the game's flame. */
function candle(m, i, at, h, r = 2) {
  const [x, y, z] = at;
  m.mesh(`candle_${i}_wax`, revolve([[0, 0], [r * 1.25, 0], [r * 1.1, 1.5], [r, 3], [r, h], [0, h]], { sides: 6 }), { mat: 'wax', origin: at });
  m.cube(`candle_${i}_wick`, [x - 0.4, y + h, z - 0.4], [x + 0.4, y + h + 1.6, z + 0.4], { mat: 'wick' });
  m.group(`candle_${i}`, undefined, { origin: [x, y + h + 1.2, z] });
}

/** A goblet (`s` scales it) at `at`, turned by `rot`. */
function goblet(m, name, at, rot = [0, 0, 0], s = 1) {
  const pr = [[0, 0], [4, 0], [3.4, 0.8], [1.2, 1.4], [1.2, 6], [3.8, 8.5], [4.6, 13], [4, 13], [3.4, 9.4], [0, 9]].map(([r, y]) => [r * s, y * s]);
  m.mesh(name, revolve(pr, { sides: 8 }), { mat: 'gold', origin: at, rotation: rot });
}

/** A dwarven axe: a haft from `a` to `b` (in the x-y plane at depth z), a double-bitted head at `b`. */
function axe(m, name, a, b, z) {
  m.mesh(`${name}_haft`, tube([[a[0], a[1], z], [b[0], b[1], z]], { half: 1.4, sides: 6 }), { mat: 'wood' });
  const rot = [0, 0, (Math.atan2(-(b[0] - a[0]), b[1] - a[1]) * 180) / Math.PI];
  const bit = (sgn) => loft([
    [[sgn * 3, 4, 1], [sgn * 3, 4, -1], [sgn * 3, -4, -1], [sgn * 3, -4, 1]],
    [[sgn * 15, 9, 0.5], [sgn * 15, 9, -0.5], [sgn * 15, -9, -0.5], [sgn * 15, -9, 0.5]],
  ]);
  m.mesh(`${name}_head`, [...bit(-1), ...bit(1)], { mat: 'iron', origin: [b[0], b[1] - 2, z], rotation: rot });
  m.cube(`${name}_socket`, [b[0] - 3, b[1] - 7, z - 2], [b[0] + 3, b[1] + 3, z + 2], { mat: 'gold', origin: [b[0], b[1] - 2, z], rotation: rot });
}

/**
 * Broken floor along a rift's lip, one tile's length of it (along x) with the rift in front (+z): slabs cracked
 * away from the bank and sagging out over the edge (so it isn't a clean line), a gap where one fell in, chips
 * of stone on the bank and cracks running back from the edge. `seed` makes each variant different.
 */
function riftLip(name, seed) {
  return defineModel(name, MATS, (m) => {
    const r = (i, k) => rand(seed, i, 2700 + k);
    for (let x = -64, i = 0; x < 63; i++) {
      const x1 = Math.min(64, x + 16 + r(i, 0) * 18);
      if (r(i, 1) > 0.15) {
        const back = -(8 + r(i, 2) * 12), over = 10 + r(i, 3) * 18;
        m.cube(`slab_${i + 1}`, [x + 0.7, -5, back], [x1 - 0.7, 0.3, over], {
          mat: 'slab', origin: [(x + x1) / 2, 0, back], rotation: [3 + r(i, 4) * 16, (r(i, 5) - 0.5) * 10, (r(i, 6) - 0.5) * 8],
        });
      }
      x = x1;
    }
    for (let k = 0; k < 5; k++) {
      const cx = -56 + r(k, 10) * 112, cz = -6 - r(k, 11) * 22, s = 1.6 + r(k, 12) * 2.6;
      m.cube(`chip_${k + 1}`, [cx - s, 0, cz - s], [cx + s, s * 1.3, cz + s], { mat: 'slab', origin: [cx, 0, cz], rotation: [r(k, 13) * 25, r(k, 14) * 90, r(k, 15) * 25] });
    }
    for (let k = 0; k < 3; k++) {
      let x = -48 + r(k, 20) * 96, z = 0;
      const pts = [];
      for (let s = 0; s < 5; s++) { pts.push([x, z]); x += (r(k, 30 + s) - 0.5) * 10; z -= 5 + r(k, 40 + s) * 5; }
      m.mesh(`crack_${k + 1}`, pts.slice(1).map(([bx, bz], s) => {
        const [ax, az] = pts[s], w = 0.8 * (1 - s / 5) + 0.3;
        return facing([[ax - w, 0.25, az], [ax + w, 0.25, az], [bx + w * 0.8, 0.25, bz], [bx - w * 0.8, 0.25, bz]], [0, 1, 0]);
      }), { mat: 'crack' });
    }
  }, { density: 1 });
}

// ---------------------------------------------------------------- props

export const dwarven = {
  rift_bridge: defineModel('rift_bridge', MATS, (m) => {
    // A way over a rift, thrown together from whatever was to hand: two beams (one a gilded beam from some
    // hall's ceiling), planks of odd lengths, half a door, all lashed with rope, and a pole lashed to two posts
    // along one side for a rail. It spans 2 m (along z) and rests on the rift's lips.
    const L = 80;
    m.cube('beam_plain', [-32, -9, -L], [-24, -1, L], { mat: 'wood', info: { along: 'z' }, origin: [-28, -5, 0], rotation: [0, 2, 0] });
    m.cube('beam_gilded', [24, -10, -L - 4], [33, -1, L - 2], { mat: 'gildedBeam', origin: [28, -5, 0], rotation: [0, -3, 0] });
    const planks = [[-72, 38], [-61, 34], [-50, 40], [-39, 30], [26, 36], [37, 39], [49, 33], [61, 37], [71, 35]];
    planks.forEach(([z, hl], i) => {
      const r = (k) => rand(i, k, 2100) - 0.5;
      m.cube(`plank_${i + 1}`, [-hl + r(1) * 8, -1, z - 4.5], [hl + r(1) * 8, 1.5, z + 4.5], { mat: 'wood', info: { along: 'x' }, origin: [0, 0, z], rotation: [r(2) * 4, r(3) * 10, r(4) * 3] });
    });
    m.cube('door', [-30, -1, -24], [30, 2.5, 18], { mat: 'door', origin: [0, 0, -3], rotation: [0, 6, 1.5] });
    for (const [x, z] of [[-28, -61], [-28, 37], [28, -50], [28, 61], [-28, 71], [28, -3]]) {
      m.cube(`lashing_${x < 0 ? 'left' : 'right'}_${z + 100}`, [x - 5.5, -10, z - 1], [x + 5.5, 2.8, z + 1], { mat: 'rope' });
    }
    // The rail: two posts lashed to the plain beam, a pole between them.
    for (const z of [-60, 58]) {
      m.cube(`post_${z < 0 ? 'near' : 'far'}`, [-38, -8, z - 2], [-34, 46, z + 2], { mat: 'wood', origin: [-36, 0, z], rotation: [0, 0, z < 0 ? 4 : -3] });
      m.cube(`post_lashing_${z < 0 ? 'near' : 'far'}`, [-39.5, 38, z - 3], [-32.5, 42, z + 3], { mat: 'rope' });
    }
    m.cube('rail', [-38, 39, -78], [-34.5, 42.5, 76], { mat: 'wood', info: { along: 'z' }, origin: [-36, 40, 0], rotation: [2, 0, 0] });
    // Broken stone wedged under the beams' ends.
    for (const [x, z] of [[-28, -76], [28, 74], [30, -78]]) m.cube(`chock_${x}_${z}`, [x - 6, -14, z - 5], [x + 6, -8, z + 5], { mat: 'stone', origin: [x, -11, z], rotation: [0, 20, 6] });
  }, { density: 1 }),

  banner: defineModel('banner', MATS, (m) => {
    // A long banner of the kingdom on a gilt rod, the cloth in a gentle fold down its middle.
    const TOP = 164, BOT = 56, W = 24;
    m.mesh('rod', tube([[-31, TOP + 2, 7], [31, TOP + 2, 7]], { half: 1.3, sides: 6 }), { mat: 'gold' });
    for (const x of [-33, 33]) m.cube(`finial_${x < 0 ? 'left' : 'right'}`, [x - 2.2, TOP - 0.2, 4.8], [x + 2.2, TOP + 4.2, 9.2], { mat: 'gold' });
    for (const x of [-26, 26]) m.cube(`bracket_${x < 0 ? 'left' : 'right'}`, [x - 1.5, TOP, 0], [x + 1.5, TOP + 4, 8], { mat: 'bronze' });
    const cloth = (x0, x1, z0, z1) => facing([[x0, BOT - 14, z0], [x1, BOT - 14, z1], [x1, TOP, z1], [x0, TOP, z0]], [0, 0, 1]);
    m.mesh('cloth', [cloth(-W, 0, 5, 7.5), cloth(0, W, 7.5, 5)], { mat: 'banner', info: { W, TOP, BOT } });
  }, { density: 2, double: ['banner'] }),

  painting: defineModel('painting', MATS, (m) => {
    // A portrait of one of the kingdom's kings in a gilt frame, hanging crooked from its nail, slashed across.
    const nail = [0, 160, 0], rot = [0, 0, -4], at = { origin: nail, rotation: rot };
    m.cube('canvas', [-33, 105, 1], [33, 151, 2.5], { mat: 'portrait', info: { inv: pose(nail, rot).invert(), cy: -32 }, faces: ['south'], ...at });
    m.cube('backing', [-34, 104, 0], [34, 152, 1], { mat: 'wood', ...at });
    m.cube('frame_top', [-40, 151, 0], [40, 158, 5], { mat: 'frame', ...at });
    m.cube('frame_bottom', [-40, 98, 0], [40, 105, 5], { mat: 'frame', ...at });
    m.cube('frame_left', [-40, 105, 0], [-33, 151, 5], { mat: 'frame', ...at });
    m.cube('frame_right', [33, 105, 0], [40, 151, 5], { mat: 'frame', ...at });
    m.cube('nail', [-1, 159, 0], [1, 161, 3], { mat: 'iron' });
  }, { density: 2 }),

  fallen_painting: defineModel('fallen_painting', MATS, (m) => {
    // A painting fallen from its nail and left leaning against the wall, a corner of its frame broken off and a
    // boot gone through the canvas: the kingdom's great gate at dusk.
    const pivot = [0, 0, -20], rot = [-16, 0, 0], at = { origin: pivot, rotation: rot };
    m.cube('canvas', [-30, 7, -19.5], [30, 47, -18], { mat: 'landscape', info: { inv: pose(pivot, rot).invert(), cy: 27 }, faces: ['south'], ...at });
    m.cube('backing', [-31, 6, -21], [31, 48, -19.5], { mat: 'wood', ...at });
    m.cube('frame_top', [-37, 47, -21], [26, 54, -16], { mat: 'frame', ...at });
    m.cube('frame_bottom', [-37, 0, -21], [37, 7, -16], { mat: 'frame', ...at });
    m.cube('frame_left', [-37, 7, -21], [-30, 47, -16], { mat: 'frame', ...at });
    m.cube('frame_right', [30, 7, -21], [37, 36, -16], { mat: 'frame', ...at });
    m.cube('frame_corner', [28, 0, -2], [40, 7, 3], { mat: 'frame', origin: [34, 2, 0], rotation: [0, 38, 90] }); // the broken-off corner
  }, { density: 2 }),

  wall_shield: defineModel('wall_shield', MATS, (m) => {
    // A round shield of the royal guard hung on the wall over two crossed axes.
    axe(m, 'axe_left', [-30, 72], [22, 148], 3);
    axe(m, 'axe_right', [30, 72], [-22, 148], 3.5);
    m.mesh('shield', revolve([[0, 0], [22, 0], [22, 3], [0, 3]], { sides: 12 }), { mat: 'shieldFace', origin: [0, 110, 6], rotation: [90, 0, 0], info: { cx: 0, cy: 110, r: 22 } });
    m.mesh('boss', revolve([[0, 0], [6, 0], [5, 2.5], [3, 4], [0, 4.5]], { sides: 8 }), { mat: 'gold', origin: [0, 110, 9], rotation: [90, 0, 0] });
  }, { density: 1.5 }),

  grand_rug: defineModel('grand_rug', MATS, (m) => {
    // A great rug from some hall, frayed and torn, scorched at one end, one corner kicked back over itself.
    const w = 80, d = 52, F = 24;
    m.cube('rug', [-w, 0.05, -d], [w, 0.6, d], { mat: 'grandRug', info: { w, d, F }, faces: ['up'] });
    m.mesh('flap', [facing([[w - F, 1, d], [w, 1, d - F], [w - F, 1, d - F]], [0, 1, 0])], { mat: 'rugBack' });
  }, { density: 1 }),

  throne: defineModel('throne', MATS, (m) => {
    // A king's throne of red stone and gold on its dais, an arm broken off, a goblet knocked over.
    m.cube('dais', [-46, 0, -35], [46, 8, 30], { mat: 'stone' });
    m.cube('dais_trim', [-46.5, 5.5, 28], [46.5, 8.4, 30.5], { mat: 'gold' });
    m.cube('seat', [-30, 8, -28], [30, 40, 20], { mat: 'porphyry' });
    m.cube('seat_trim', [-30.5, 33, 19], [30.5, 37, 20.8], { mat: 'gold' });
    m.cube('cushion', [-27, 40, -22], [27, 46, 18], { mat: 'velvet', origin: [0, 43, 0], rotation: [0, 4, 0] });
    m.cube('back', [-30, 40, -34], [30, 150, -26], { mat: 'porphyry' });
    m.cube('back_cushion', [-22, 54, -26], [22, 124, -23], { mat: 'velvet' });
    m.cube('plaque', [-12, 128, -26], [12, 144, -24.5], { mat: 'gold' });
    m.cube('crest_1', [-24, 150, -34], [24, 160, -26], { mat: 'porphyry' });
    m.cube('crest_2', [-14, 160, -34], [14, 170, -26], { mat: 'porphyry' });
    m.cube('crest_cap', [-6, 170, -34], [6, 178, -26], { mat: 'gold' });
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'left' : 'right';
      m.cube(`pillar_${side}`, [s < 0 ? -34 : 28, 40, -34], [s < 0 ? -28 : 34, 156, -24], { mat: 'porphyry' });
      m.cube(`pillar_cap_${side}`, [s < 0 ? -35 : 27, 156, -35], [s < 0 ? -27 : 35, 160, -23], { mat: 'gold' });
    }
    m.cube('arm_left', [-38, 40, -24], [-30, 62, 16], { mat: 'porphyry' });
    m.cube('arm_left_cap', [-39, 62, -25], [-29, 65, 18], { mat: 'gold' });
    m.cube('arm_right_stump', [30, 40, -24], [38, 52, 0], { mat: 'porphyry' });
    m.cube('arm_right_fallen', [52, 0, -4], [62, 9, 20], { mat: 'porphyry', origin: [57, 4, 8], rotation: [0, 25, 0] });
    m.cube('arm_right_fallen_cap', [51, 9, -5], [63, 11, 21], { mat: 'gold', origin: [57, 4, 8], rotation: [0, 25, 0] });
    goblet(m, 'goblet', [18, 12.4, 22], [0, 30, 90]);
  }, { density: 1 }),

  toppled_table: defineModel('toppled_table', MATS, (m) => {
    // A long feast table knocked onto its side, its top turned outward like a barricade and its legs in the air
    // behind; a plate and a goblet flung down in front of it.
    m.cube('top', [-70, 0, -4], [70, 56, 4], { mat: 'tableTop' });
    for (const y of [4, 50]) m.cube(`apron_${y}`, [-62, y - 2, -14], [62, y + 2, -4], { mat: 'wood', info: { along: 'x' } });
    for (const x of [-58, 58]) for (const y of [9, 47]) {
      m.cube(`leg_${x}_${y}`, [x - 5, y - 5, -52], [x + 5, y + 5, -4], { mat: 'wood', info: { along: 'z' } });
      m.cube(`foot_${x}_${y}`, [x - 6.5, y - 6.5, -58], [x + 6.5, y + 6.5, -52], { mat: 'gold' });
    }
    m.mesh('plate', revolve([[0, 0], [8, 0], [8.5, 1], [7, 1.2], [0, 0.8]], { sides: 10 }), { mat: 'gold', origin: [30, 0, 16] });
    goblet(m, 'goblet', [-24, 4.4, 14], [0, -40, 90]);
  }, { density: 1 }),

  chair: defineModel('chair', MATS, (m) => {
    // A heavy dwarven chair knocked over onto its side, a leg snapped. (Built upright over x 35..67, then tipped
    // over about its left side.)
    const tip = { origin: [35, 0, 0], rotation: [0, 0, 90] };
    [[36, -13], [62, -13], [36, 9], [62, 9]].forEach(([x, z], i) => m.cube(`leg_${i + 1}`, [x, i === 3 ? 11 : 0, z], [x + 5, 26, z + 5], { mat: 'wood', info: { along: 'x' }, ...tip }));
    m.cube('seat', [35, 26, -14], [67, 31, 15], { mat: 'wood', ...tip });
    m.cube('cushion', [37, 31, -12], [65, 34, 13], { mat: 'velvet', ...tip });
    for (const x of [35, 62]) m.cube(`post_${x}`, [x, 31, -14], [x + 5, 76, -9], { mat: 'wood', info: { along: 'x' }, ...tip });
    m.cube('back', [40, 38, -14], [62, 70, -11], { mat: 'wood', info: { along: 'x' }, ...tip });
    m.cube('crest', [34, 70, -15], [68, 78, -8], { mat: 'gold', ...tip });
  }, { density: 2 }),

  dwarf_statue: defineModel('dwarf_statue', MATS, (m) => {
    // A statue of a dwarf warrior with hammer and shield on a gilt-banded plinth, its head broken off and lying
    // at its feet.
    m.cube('plinth', [-24, 0, -24], [24, 28, 24], { mat: 'stone' });
    m.cube('plinth_band', [-24.6, 21, -24.6], [24.6, 25, 24.6], { mat: 'gold' });
    m.cube('plinth_top', [-26, 28, -26], [26, 32, 26], { mat: 'stone' });
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'left' : 'right', x0 = s < 0 ? -13 : 2;
      m.cube(`boot_${side}`, [x0, 32, -6], [x0 + 11, 40, 10], { mat: 'stone' });
      m.cube(`leg_${side}`, [x0 + 1, 40, -6], [x0 + 10, 54, 6], { mat: 'stone' });
      m.mesh(`pauldron_${side}`, revolve([[0, 0], [8, 0], [7, 4], [4, 7], [0, 8]], { sides: 7 }), { mat: 'stone', origin: [s * 17, 90, 0], rotation: [0, 0, -s * 25] });
    }
    m.cube('skirt', [-15, 52, -9], [15, 64, 9], { mat: 'stone' });
    m.cube('body', [-16, 64, -10], [16, 96, 10], { mat: 'stone' });
    m.cube('belt', [-16.5, 62, -10.5], [16.5, 67, 10.5], { mat: 'gold' });
    m.cube('neck_stump', [-6, 96, -5], [6, 100, 5], { mat: 'stone' });
    m.cube('break', [-5, 100, -4], [5, 101.5, 4], { mat: 'stone', origin: [0, 100, 0], rotation: [8, 0, -10] });
    // Both hands on the pommel of a great hammer, its head planted on the plinth between the feet.
    m.cube('hammer_head', [-9, 32, 12], [9, 46, 24], { mat: 'stone' });
    m.cube('hammer_band', [-9.4, 37, 11.6], [9.4, 41, 24.4], { mat: 'gold' });
    m.mesh('hammer_haft', tube([[0, 46, 18], [0, 80, 18]], { half: 2, sides: 6 }), { mat: 'stone' });
    m.cube('hands', [-6, 78, 13], [6, 86, 23], { mat: 'stone' });
    for (const s of [-1, 1]) {
      m.mesh(`arm_${s < 0 ? 'left' : 'right'}`, tube([[s * 17, 90, 0], [s * 15, 78, 8], [s * 5, 82, 18]], { half: 3.6 }), { mat: 'stone' });
    }
    // The head on the floor, tipped onto its side: helmed, bearded.
    const head = { origin: [34, 13, 14], rotation: [0, 0, 75] };
    m.cube('head', [27, 5, 8], [41, 20, 20], { mat: 'stone', ...head });
    m.mesh('helm', shift(revolve([[0, 0], [9, 0], [8.5, 5], [5.5, 9], [0, 10]], { sides: 8 }), [0, 3, 0]), { mat: 'stone', ...head });
    m.cube('nose', [32.5, 10, 20], [35.5, 15, 22.5], { mat: 'stone', ...head });
    m.cube('beard', [28, -4, 15], [40, 7, 23], { mat: 'stone', ...head });
    m.cube('helm_band', [24.6, 15, 4.6], [43.4, 17, 23.4], { mat: 'gold', ...head });
  }, { density: 1 }),

  fallen_column: defineModel('fallen_column', MATS, (m) => {
    // What's left of a column: a fluted stump on its plinth, its drums fallen and rolled away, a piece of its
    // gilded capital among them.
    const col = (name, origin, rot, r, h, extra = {}) => m.mesh(name, revolve([[0, 0], [r, 0], [r, h], [0, h]], { sides: 12 }), { mat: 'column', origin, rotation: rot, info: { inv: pose(origin, rot).invert(), r, ...extra } });
    m.cube('plinth', [-22, 0, -35], [22, 10, 7], { mat: 'stone' });
    col('stump', [0, 10, -14], [0, 0, 0], 15, 44);
    col('stump_break', [3, 54, -12], [8, 20, -6], 10, 9, { broken: true });
    col('drum_1', [36, 14, 18], [0, 0, 90], 14, 27);
    col('drum_2', [-26, 13, 22], [0, 58, 90], 13, 24);
    m.cube('capital', [-48, 0, -10], [-26, 12, 10], { mat: 'frieze', origin: [-37, 6, 0], rotation: [0, 24, 0], info: { inv: pose([-37, 6, 0], [0, 24, 0]).invert(), y0: -4, face: (q) => q.z > 9.5 } });
    m.cube('chip_1', [4, 0, 26], [11, 5, 32], { mat: 'stone', origin: [7, 2, 29], rotation: [10, 30, 0] });
    m.cube('chip_2', [-10, 0, 12], [-4, 4, 18], { mat: 'stone', origin: [-7, 2, 15], rotation: [0, 50, 12] });
  }, { density: 1 }),

  candelabra: defineModel('candelabra', MATS, (m) => {
    // A tall gold candelabrum of five branches, two of its candles gone.
    for (let k = 0; k < 3; k++) {
      m.mesh(`foot_${k + 1}`, tube([[0, 6, 0], [9, 3, 0], [13, 0.8, 0]], { half: 1.4 }), { mat: 'gold', rotation: [0, k * 120 + 30, 0] });
    }
    m.mesh('stem', revolve([[0, 3], [5, 3], [3, 6], [1.6, 8], [1.6, 40], [3.4, 42], [1.6, 44], [1.6, 78], [3.4, 80], [1.6, 82], [1.6, 90], [0, 90]], { sides: 8 }), { mat: 'gold' });
    const cup = (name, x, y) => m.mesh(name, revolve([[0, 0], [1.2, 0], [3.4, 2.5], [3.8, 3.5], [3.2, 3.5], [0, 2.8]], { sides: 8 }), { mat: 'gold', origin: [x, y, 0] });
    for (const s of [-1, 1]) {
      m.mesh(`arm_inner_${s}`, tube([[0, 84, 0], [s * 9, 84, 0], [s * 13, 88, 0], [s * 13, 94, 0]], { half: 1 }), { mat: 'gold' });
      m.mesh(`arm_outer_${s}`, tube([[0, 80, 0], [s * 19, 80, 0], [s * 25, 85, 0], [s * 25, 90, 0]], { half: 1 }), { mat: 'gold' });
      cup(`cup_inner_${s}`, s * 13, 94);
      cup(`cup_outer_${s}`, s * 25, 90);
    }
    cup('cup_top', 0, 90);
    candle(m, 1, [0, 92.8, 0], 18, 1.8);
    candle(m, 2, [-13, 96.8, 0], 12, 1.7);
    candle(m, 3, [25, 92.8, 0], 9, 1.6);
    m.mesh('drip', revolve([[0, 0], [2.4, 0], [1.4, 1.4], [0, 1.6]], { sides: 6 }), { mat: 'wax', origin: [13, 97.4, 0] });
  }, { density: 2 }),

  armor_stand: defineModel('armor_stand', MATS, (m) => {
    // A suit of dwarven plate on its stand, gold-trimmed, a masked helm atop it; an axe left leaning against it.
    const Z = -8;
    m.cube('foot_x', [-20, 0, Z - 4], [20, 4, Z + 4], { mat: 'wood', info: { along: 'x' } });
    m.cube('foot_z', [-4, 0, Z - 20], [4, 4, Z + 20], { mat: 'wood', info: { along: 'z' } });
    m.cube('post', [-2.5, 4, Z - 2.5], [2.5, 100, Z + 2.5], { mat: 'wood' });
    const ring = (y, rx, rz) => latheRing(y, rx, rz, 8).map(([x, yy, z]) => [x, yy, z + Z]);
    m.mesh('faulds', loft([ring(40, 16, 12), ring(56, 13.5, 10)], { capStart: false }), { mat: 'mail' });
    const trim = (p) => p.y < 59 || p.y > 95 || Math.abs(p.x) < 1.2;
    m.mesh('cuirass', loft([ring(56, 13.5, 10), ring(70, 14, 10.5), ring(88, 17, 12), ring(98, 15, 10)]), { mat: 'armor', info: { trim } });
    for (const s of [-1, 1]) {
      m.mesh(`pauldron_${s < 0 ? 'left' : 'right'}`, revolve([[0, 0], [9, 0], [8, 4], [5, 7], [0, 8]], { sides: 8 }), { mat: 'armor', origin: [s * 18, 93, Z], rotation: [0, 0, -s * 30], info: { trim: (p) => p.y < 95 } });
    }
    m.cube('aventail', [-10, 98, Z - 8], [10, 106, Z + 9], { mat: 'mail' });
    m.mesh('helm', revolve([[0, 0], [10, 0], [10, 6], [8.5, 12], [5, 16], [0, 17]], { sides: 8 }), { mat: 'armor', origin: [0, 104, Z], info: { trim: (p) => p.y < 106 } });
    m.cube('mask', [-8, 104, Z + 6], [8, 114, Z + 10.5], { mat: 'armor', info: { trim: (p) => Math.abs(p.y - 110.5) > 1.6 && Math.abs(p.x) < 1.4 } });
    m.cube('crest', [-1, 112, Z - 9], [1, 124, Z + 9], { mat: 'gold' });
    axe(m, 'axe', [30, 0], [18, 70], Z + 14);
  }, { density: 1.5 }),

  bookcase: defineModel('bookcase', MATS, (m) => {
    // A tall bookcase, gold-trimmed and looted: half its books gone, a shelf broken, books and papers strewn
    // across the floor in front of it.
    const W = 48, Z0 = WALL + 1, Z1 = WALL + 25, H = 150;
    m.cube('back', [-W, 0, Z0], [W, H, Z0 + 2], { mat: 'wood', info: { along: 'y' } });
    for (const x of [-W, W - 5]) m.cube(`side_${x < 0 ? 'left' : 'right'}`, [x, 0, Z0], [x + 5, H, Z1], { mat: 'wood' });
    m.cube('crown', [-W - 3, H, Z0], [W + 3, H + 7, Z1 + 3], { mat: 'wood', info: { along: 'x' } });
    m.cube('crown_trim', [-W - 3.5, H + 2, Z1 + 3], [W + 3.5, H + 5, Z1 + 3.8], { mat: 'gold' });
    m.cube('plinth', [-W - 2, 0, Z0], [W + 2, 8, Z1 + 2], { mat: 'wood', info: { along: 'x' } });
    const boards = [8, 44, 80, 116];
    boards.forEach((y, i) => {
      const broken = i === 2;
      m.cube(`shelf_${i + 1}`, [-W + 5, y - 3, Z0 + 2], [W - 5, y, Z1], { mat: 'wood', info: { along: 'x' }, origin: broken ? [-W + 5, y, Z0 + 12] : undefined, rotation: broken ? [0, 0, -14] : [0, 0, 0] });
    });
    const books = (x0, y, n, name, lean = 0) => {
      let x = x0;
      for (let i = 0; i < n; i++) {
        const w = 3 + rand(i, y, 2400) * 2, h = 20 + rand(i, y, 2401) * 9, b = Math.floor(rand(i, y, 2402) * 4);
        const tilt = i === n - 1 ? lean : 0;
        m.cube(`${name}_${i + 1}`, [x, y, Z0 + 4], [x + w, y + h, Z1 - 2], { mat: 'book', info: { b, y0: y, h }, origin: [x + w, y, 0], rotation: [0, 0, tilt], faces: ['south', 'up', 'east', 'west'] });
        x += w + 0.4;
      }
    };
    books(-43, 8, 6, 'books_low', -20);
    books(10, 8, 4, 'books_low_right');
    books(-40, 44, 3, 'books_mid', -35);
    books(-43, 116, 8, 'books_top');
    // Strewn on the floor.
    [[-20, 8, 0, 20], [8, 16, 1, -35], [24, 4, 2, 70], [-6, 26, 3, 10]].forEach(([x, z, b, turn], i) => {
      m.cube(`floor_book_${i + 1}`, [x - 6, 0, z - 8], [x + 6, 3.5, z + 8], { mat: 'book', info: { b, pages: true }, origin: [x, 0, z], rotation: [0, turn, 0] });
    });
    m.cube('open_book_left', [-38, 0.6, 10], [-28, 1.8, 24], { mat: 'paper', origin: [-28, 1, 17], rotation: [0, 12, -8] });
    m.cube('open_book_right', [-28, 0.6, 10], [-18, 1.8, 24], { mat: 'paper', origin: [-28, 1, 17], rotation: [0, 12, 8] });
    for (const [x, z, t] of [[30, 24, 20], [-44, 20, -30], [14, 30, 60]]) {
      m.mesh(`page_${x}`, [facing([[-5, 0.3, -6], [5, 0.3, -6], [5, 0.3, 6], [-5, 0.3, 6]], [0, 1, 0])], { mat: 'paper', origin: [x, 0, z], rotation: [0, t, 0] });
    }
  }, { density: 1 }),

  anvil: defineModel('anvil', MATS, (m) => {
    // A smith's anvil on its block, a hammer left on its face and tongs leaning against the block.
    m.cube('block', [-18, 0, -14], [18, 26, 14], { mat: 'stone' });
    m.cube('base', [-13, 26, -9], [13, 32, 9], { mat: 'iron' });
    m.cube('waist', [-7, 32, -6], [7, 42, 6], { mat: 'iron' });
    m.cube('body', [-20, 42, -9], [16, 52, 9], { mat: 'iron' });
    m.mesh('horn', loft([
      [[16, 52, -7], [16, 52, 7], [16, 44, 7], [16, 44, -7]],
      [[34, 50.5, -0.8], [34, 50.5, 0.8], [34, 49, 0.8], [34, 49, -0.8]],
    ]), { mat: 'iron' });
    m.cube('heel', [-27, 46, -5], [-20, 52, 5], { mat: 'iron' });
    m.mesh('hammer_haft', tube([[-12, 54, -8], [8, 54, 10]], { half: 1.3, sides: 6 }), { mat: 'wood' });
    m.cube('hammer_head', [-17, 52, -13], [-7, 58, -3], { mat: 'iron', origin: [-12, 55, -8], rotation: [0, -42, 0] });
    for (const dx of [-1.5, 1.5]) m.mesh(`tongs_${dx}`, tube([[20 + dx, 0, 16], [22 + dx * 2, 34, 12]], { half: 0.9 }), { mat: 'iron' });
  }, { density: 2 }),

  void_shards: defineModel('void_shards', MATS, (m) => {
    // Where the evil below has broken through: a crack in the wall lit violet from within, black crystal
    // bursting out of it.
    const cx = 0, cy = 64, N = 14;
    const R = (a) => 30 + 12 * noise3(Math.cos(a) * 1.4 + 3, Math.sin(a) * 1.4, 0, 2500) - 10 * (rand(Math.round(((a + Math.PI) / (Math.PI * 2)) * N) % N, 2501) > 0.6 ? 1 : 0);
    const rim = Array.from({ length: N }, (_, i) => { const a = -Math.PI + (i / N) * Math.PI * 2; return [cx + Math.cos(a) * R(a) * 0.8, cy + Math.sin(a) * R(a) * 1.1, 0.3]; });
    m.mesh('crack', rim.map((p, i) => facing([[cx, cy, 0.3], p, rim[(i + 1) % N]], [0, 0, 1])), { mat: 'voidCrack', info: { cx, cy, R: (a) => Math.hypot(Math.cos(a) * R(a) * 0.8, Math.sin(a) * R(a) * 1.1) } });
    [[0, 64, 30, 5, [60, 0, 0]], [-12, 72, 22, 4, [40, 0, 30]], [12, 58, 24, 4.5, [70, 0, -35]], [-6, 50, 18, 3.5, [100, 0, 20]],
      [8, 80, 16, 3, [30, 0, -20]], [-18, 60, 14, 3, [75, 0, 60]], [16, 70, 12, 2.6, [55, 0, -60]], [4, 44, 12, 3, [115, 0, -10]]].forEach(([x, y, h, r, rot], i) => {
      const H = h * 1.5, R = r * 1.3;
      m.mesh(`shard_${i + 1}`, revolve([[0, 0], [R, 0], [R * 0.7, H * 0.72], [0, H]], { sides: 4 + (i % 2) }), { mat: 'voidShard', origin: [x, y, 1], rotation: rot, info: { o: [x, y, 1], d: upOf(rot), h: H } });
    });
    [[-20, 0, 4, 12, 3, [20, 0, 25]], [18, 0, 6, 10, 2.6, [25, 0, -30]]].forEach(([x, y, z, h, r, rot], i) => {
      m.mesh(`floor_shard_${i + 1}`, revolve([[0, 0], [r, 0], [r * 0.7, h * 0.72], [0, h]], { sides: 4 }), { mat: 'voidShard', origin: [x, y, z], rotation: rot, info: { o: [x, y, z], d: upOf(rot), h } });
    });
    m.group('glow_1', undefined, { origin: [0, 64, 16] });
  }, { density: 2, glow: ['voidCrack', 'voidShard'] }),

  ruin_rubble: defineModel('ruin_rubble', MATS, (m) => {
    // Fallen masonry: broken blocks of red stone on a heap of grit, a gilded piece of frieze among them.
    m.mesh('mound', revolve([[0, 0], [40, 0], [32, 7], [18, 14], [6, 18], [0, 19]], { sides: 8 }), { mat: 'dust' });
    [[-18, 8, -10, 14, 9, 10], [10, 12, -14, 12, 8, 9], [22, 3, 12, 16, 9, 11], [-4, 16, 6, 10, 7, 8], [-28, 2, 14, 11, 7, 9], [30, 1, -18, 10, 6, 8]].forEach(([x, y, z, sx, sy, sz], i) => {
      const r = (k) => (rand(i, k, 2600) - 0.5) * 2;
      m.cube(`block_${i + 1}`, [x - sx / 2, y, z - sz / 2], [x + sx / 2, y + sy, z + sz / 2], { mat: 'porphyry', origin: [x, y + sy / 2, z], rotation: [r(1) * 25, r(2) * 90, r(3) * 25] });
    });
    const at = [4, 17, -4], rot = [-30, 20, 10];
    m.cube('frieze', [-8, 13, -7], [16, 21, -1], { mat: 'frieze', origin: at, rotation: rot, info: { inv: pose(at, rot).invert(), y0: -4, face: (q) => q.z > 2.5 } });
  }, { density: 2 }),

  rift_lip: riftLip('rift_lip', 1),
  rift_lip_2: riftLip('rift_lip_2', 2),

  wall_brazier: defineModel('wall_brazier', MATS, (m) => {
    // A dwarven wall brazier: a bronze bowl of coals, gold-rimmed, on a stepped corbel from a plate on the wall.
    m.cube('plate', [-8, -24, 0], [8, 4, 2], { mat: 'bronze' });
    m.cube('rune', [-1.5, -20, 2], [1.5, 0, 2.8], { mat: 'gold' });
    m.cube('corbel_1', [-6, -22, 2], [6, -16, 6], { mat: 'bronze' });
    m.cube('corbel_2', [-5, -16, 2], [5, -11, 11], { mat: 'bronze' });
    m.cube('corbel_3', [-4, -11, 2], [4, -7, 16], { mat: 'bronze' });
    const profile = [[0, 0], [4, 0], [8, 3], [11, 8], [12, 11], [11, 11.5], [10, 9.5], [0, 9]];
    m.mesh('bowl', revolve(profile, { sides: 8, mat: (i) => (i === profile.length - 2 ? 'embers' : i === 3 || i === 4 ? 'gold' : 'bronze') }), { origin: [0, -7, 18], info: { heat: (p) => Math.max(0, 1 - Math.hypot(p.x, p.z - 18) / 9) } });
    m.group('flame', undefined, { origin: [0, 2, 18] });
  }, { density: 2, glow: ['embers'] }),

  hanging_lamp: defineModel('hanging_lamp', MATS, (m) => {
    // A dwarven oil lamp hung from a gilt arm: a hexagonal gold frame over a reservoir of ruby glass, lit from
    // within, the flame burning in the open top of it under a pierced cap.
    const Z = 20, at = [0, 0, Z];
    m.cube('plate', [-4, -6, 0], [4, 10, 2], { mat: 'bronze' });
    m.mesh('arm', tube([[0, 6, 2], [0, 6, Z - 2], [0, 8, Z + 1]], { half: 1 }), { mat: 'gold' });
    m.mesh('brace', tube([[0, -4, 2], [0, 5, Z - 8]], { half: 0.8 }), { mat: 'gold' });
    m.mesh('hanger', tube([[0, 6, Z], [0, -2, Z]], { half: 0.5 }), { mat: 'gold' });
    m.mesh('cap', revolve([[0, -8], [7, -8], [5, -5], [1.5, -2], [0, -1.5]], { sides: 6 }), { mat: 'gold', origin: at });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6, x = Math.cos(a) * 5.6, z = Math.sin(a) * 5.6;
      m.cube(`post_${k + 1}`, [x - 0.6, -21, Z + z - 0.6], [x + 0.6, -8, Z + z + 0.6], { mat: 'gold' });
    }
    m.mesh('collar', revolve([[0, -21], [6.8, -21], [6.8, -19.5], [0, -19.5]], { sides: 6 }), { mat: 'gold', origin: at });
    m.mesh('glass', revolve([[0, -35], [3, -35], [6.5, -31], [7, -26], [6.2, -21], [0, -21]], { sides: 6 }), { mat: 'ruby', origin: at });
    m.mesh('finial', revolve([[0, -43], [1.5, -43], [3, -38], [4, -35.5], [0, -35]], { sides: 6 }), { mat: 'gold', origin: at });
    m.cube('wick', [-0.6, -19.5, Z - 0.6], [0.6, -18, Z + 0.6], { mat: 'wick' });
    m.group('flame', undefined, { origin: [0, -18.5, Z] });
  }, { density: 2, glow: ['ruby'] }),

  door_dwarven: defineModel('door_dwarven', MATS, (m) => {
    // A dwarven doorway (see doorkit.mjs for how doors go together): the opening square with its top corners cut
    // away, in jambs of porphyry lined in gold on bronze plinths and capitals, under a lintel carrying the walls'
    // gold knotwork and the kingdom's crest. The door: dark planks in a bronze border, studded with gold, banded in
    // bronze, a gold medallion at its heart, hung on bronze straps, a bronze ring to pull. Locked, it's shut like a
    // vault: two gold-banded bronze bars across it, running into the jambs, and between them an ornate lock box,
    // its bolt shot into the jamb, on both sides.
    const OW = 53, SHOULDER = 134, OH = 148; // the opening; where its corners are cut away, and its top
    const zs = (s, a, b) => (s > 0 ? [a, b] : [-b, -a]); // a to b out from the middle, on the side s faces
    m.group('frame', () => {
      for (const s of [-1, 1]) {
        const side = s < 0 ? 'left' : 'right', [x0, x1] = s < 0 ? [-HALF, -OW] : [OW, HALF];
        m.cube(`jamb_${side}`, [x0, 0, -20], [x1, SHOULDER, 20], { mat: 'dwarfJamb' });
        m.mesh(`shoulder_${side}`, prism(s < 0 ? [[-HALF, SHOULDER], [-OW, SHOULDER], [-39, OH], [-HALF, OH]] : [[OW, SHOULDER], [HALF, SHOULDER], [HALF, OH], [39, OH]], -20, 20), { mat: 'porphyry' });
        m.cube(`plinth_${side}`, [s < 0 ? -HALF - 1 : OW - 1, 0, -22], [s < 0 ? -OW + 1 : HALF + 1, 10, 22], { mat: 'bronze' });
        m.cube(`capital_${side}`, [s < 0 ? -HALF - 1 : OW - 1, SHOULDER - 10, -22], [s < 0 ? -OW + 1 : HALF + 1, SHOULDER, 22], { mat: 'bronze' });
      }
      m.cube('lintel', [-HALF, OH, -20], [HALF, TOP, 20], { mat: 'dwarfLintel' });
      bothFaces((s) => m.mesh(`crest_${s > 0 ? 'front' : 'back'}`, prism([[0, 152], [11, 163], [0, 174], [-11, 163]], ...zs(s, 20, 23.5)), { mat: 'crest' }));
      m.cube('sill', [-OW, 0, -20], [OW, 1.5, 20], { mat: 'bronze' });
    });
    m.group('leaf', () => {
      m.cube('door', [-OW + 1, 1.5, -4], [OW - 1, SHOULDER - 0.4, 4], { mat: 'dwarfDoor' });
      m.mesh('door_top', prism([[-OW + 1, SHOULDER - 0.4], [OW - 1, SHOULDER - 0.4], [38.6, OH - 1], [-38.6, OH - 1]], -4, 4), { mat: 'dwarfDoor' });
      bothFaces((s) => {
        const side = s > 0 ? 'front' : 'back';
        m.mesh(`medallion_${side}`, revolve([[0, 0], [13, 0], [13, 1.2], [11, 2.2], [0, 2.2]], { sides: 12 }), { mat: 'medallion', origin: [0, 84, s * 4], rotation: [s * 90, 0, 0] });
        for (const y of [20, 110]) {
          m.mesh(`hinge_strap_${y < 60 ? 'low' : 'high'}_${side}`, prism([[-OW + 1, y], [-22, y], [-17, y + 3.5], [-22, y + 7], [-OW + 1, y + 7]], ...zs(s, 4, 5.4)), { mat: 'bronze' });
        }
        const [r0, r1] = zs(s, 4, 6.4);
        m.cube(`ring_boss_${side}`, [35, 68, r0], [41, 74, r1], { mat: 'bronze' });
        const ringPts = Array.from({ length: 10 }, (_, i) => [38 + Math.cos((i / 10) * Math.PI * 2) * 6, 63 + Math.sin((i / 10) * Math.PI * 2) * 6, s * 7]);
        m.mesh(`ring_${side}`, tube(ringPts, { half: 1.1, closed: true, side: [0, 0, 1] }), { mat: 'bronze' });
      });
    }, { origin: [-OW, 0, 0] });
    m.group('lock', () => {
      bothFaces((s) => {
        const side = s > 0 ? 'front' : 'back', [l0, l1] = zs(s, 4, 11), [b0, b1] = zs(s, 5, 8.5), [k0, k1] = zs(s, 11, 12.2);
        const [r0, r1] = zs(s, 5.4, 9);
        for (const y of [44, 98]) m.cube(`bar_${y < 70 ? 'low' : 'high'}_${side}`, [-60, y, r0], [60, y + 7, r1], { mat: 'lockBar' });
        m.cube(`lock_box_${side}`, [22, 57, l0], [46, 85, l1], { mat: 'lockBox', info: { kx: 34, ky: 71 } });
        m.cube(`bolt_${side}`, [46, 68, b0], [62, 74, b1], { mat: 'bronze' });
        for (const [x, y] of [[23.2, 58.2], [44.8, 58.2], [23.2, 83.8], [44.8, 83.8]]) m.cube(`knob_${x < 34 ? 'l' : 'r'}${y < 70 ? 'b' : 't'}_${side}`, [x - 1.2, y - 1.2, k0], [x + 1.2, y + 1.2, k1], { mat: 'gold' });
      });
    });
  }, { density: 1 }),
};
