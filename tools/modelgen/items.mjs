// Floor items. Origin = the item's centre, where it bobs and spins about the vertical; +y up.
import * as THREE from 'three';
import { defineModel, loft, lathe, revolve, tube, apex, latheRing, octRingZ, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, clamp01, patches, bevel, gem } from './materials.mjs';

const ITEM_PAL = {
  glass: P('#5d6f78', '#7f949e', '#a3b8c1', '#c6d7de', '#e6f0f3'),
  cork: P('#4a3218', '#624322', '#7b562d', '#946a3a', '#ab7f4b'),
  parchment: P('#5c4a2e', '#7d6843', '#9c8759', '#b9a572', '#d2c08c', '#e6d8ab', '#f3ead0'),
  ribbon: P('#3d0c0a', '#5c1410', '#7d1e17', '#9c2a1f', '#b53a2a'),
  wax: P('#4a0a08', '#6e120e', '#931c15', '#b82a1e', '#d6452f'),
  apple: P('#2e0e08', '#4a170c', '#6a2312', '#8a3319', '#a64722', '#bd6230', '#c98a3c'),
  leaf: P('#1c240c', '#2e3a14', '#43521d', '#586b27'),
  cloth: P('#3b3122', '#51452f', '#685a3d', '#7f704c', '#96865d', '#ab9c70'),
  twine: P('#3a2c18', '#5a4526', '#7a6036', '#997a48', '#b08f58'),
  crystal: P('#1c3a55', '#2f6690', '#4f9ac8', '#8cc8ec', '#d0eeff', '#ffffff'),
  ruby: P('#3a0008', '#6a0010', '#a0081c', '#d8203a', '#ff5a6e', '#ffc0c8'),
};

const MATS = {
  ...MAT,
  // Potion liquid, in greys: the game tints it the potion's colour.
  liquid(c) {
    const { p } = c;
    const a = Math.atan2(p.z, p.x);
    let v = 0.72 + 0.1 * patches(p, 121, 0.5) - clamp01((-p.y - 2.5) / 4) * 0.25;
    if (Math.cos(a - 0.8) > 0.8 && p.y > -3 && p.y < 0.6) v = 0.97; // a window reflected in the glass
    if (rand(c.ax, c.ay, 122) > 0.975) v += 0.15; // bubbles
    if (p.y > 0.9) v -= 0.12; // the meniscus
    return ramp(PAL.grey, v, c.ax, c.ay);
  },
  glass(c) {
    const { p } = c;
    let v = 0.5 + 0.08 * patches(p, 131, 0.6) + bevel(c, 0.2);
    if (Math.cos(Math.atan2(p.z, p.x) - 0.8) > 0.85) v = 0.95;
    return ramp(ITEM_PAL.glass, v, c.ax, c.ay);
  },
  cork(c) {
    let v = 0.5 + 0.2 * patches(c.p, 141, 0.9) + 0.1 * c.n.y;
    if (rand(c.ax, c.ay, 142) > 0.85) v -= 0.2;
    return ramp(ITEM_PAL.cork, v, c.ax, c.ay);
  },
  // Scroll lying along x: its rolled ends show a spiral of paper edges, and the outer ends are browned.
  parchment(c) {
    const { p, n } = c;
    if (Math.abs(n.x) > 0.9) {
      const spiral = fract(Math.hypot(p.y, p.z) / 0.9 - Math.atan2(p.z, p.y) / (2 * Math.PI));
      return ramp(ITEM_PAL.parchment, spiral < 0.3 ? 0.25 : 0.7, c.ax, c.ay);
    }
    let v = 0.66 + 0.16 * patches(p, 151, 0.4) - clamp01((Math.abs(p.x) - 7) / 2) * 0.3;
    if (rand(c.ax, c.ay, 152) > 0.97) v -= 0.2; // foxing
    return ramp(ITEM_PAL.parchment, v, c.ax, c.ay);
  },
  ribbon(c) {
    return ramp(ITEM_PAL.ribbon, 0.5 + 0.15 * patches(c.p, 153, 0.8) + bevel(c, 0.2), c.ax, c.ay);
  },
  wax(c) {
    const { p, n } = c;
    let v = 0.45 + 0.3 * n.y;
    if (n.y > 0.8 && Math.hypot(p.x, p.z) < 0.9) v -= 0.25; // pressed seal
    return ramp(ITEM_PAL.wax, v, c.ax, c.ay);
  },
  // Wand shaft, in greys (tinted by the wand's wood or metal): grain, and a carved grip. `info.axis` is the
  // wand's direction.
  wandWood(c) {
    const { p, info } = c;
    const s = p.x * info.axis[0] + p.y * info.axis[1] + p.z * info.axis[2];
    let v = 0.68 + 0.14 * (noise3(s * 0.25, p.z * 2, 0, 161) - 0.5) + bevel(c, 0.1);
    if (s > -7.6 && s < -2.8 && fract(s / 1.1) < 0.3) v = 0.4;
    return ramp(PAL.grey, v, c.ax, c.ay);
  },
  crystal: gem(ITEM_PAL.crystal),
  gemTint: gem(PAL.grey),
  ruby: gem(ITEM_PAL.ruby),
  apple(c) {
    const { p, n } = c;
    let v = 0.45 + 0.2 * patches(p, 171, 0.5) + 0.12 * n.y;
    if (noise3(Math.atan2(p.z, p.x) * 3, p.y * 0.25, 0, 173) > 0.68) v += 0.18; // yellowed streaks
    if (fract(noise3(p.x * 0.4, p.y * 0.8, p.z * 0.4, 172) * 5) < 0.1) v -= 0.22; // wrinkles
    return ramp(ITEM_PAL.apple, v, c.ax, c.ay);
  },
  stalk(c) {
    return ramp(ITEM_PAL.twine, 0.2 + 0.2 * c.n.y, c.ax, c.ay);
  },
  leaf(c) {
    let v = 0.5 + 0.25 * c.n.y;
    if (Math.abs(c.p.z - (c.p.x - 0.5) * 0.3) < 0.2) v -= 0.25; // the midrib
    return ramp(ITEM_PAL.leaf, v, c.ax, c.ay);
  },
  cloth(c) {
    const { p } = c;
    let v = 0.55 + 0.1 * patches(p, 181, 0.35) + bevel(c, 0.15);
    if ((c.ax + c.ay) % 3 === 0) v -= 0.08; // weave
    if (fract(noise3(p.x * 0.3, p.y * 0.3, p.z * 0.3, 182) * 4) < 0.08) v -= 0.18; // creases
    return ramp(ITEM_PAL.cloth, v, c.ax, c.ay);
  },
  twine(c) {
    const { p } = c;
    return ramp(ITEM_PAL.twine, fract((p.x + p.y + p.z) * 1.4) < 0.4 ? 0.3 : 0.65, c.ax, c.ay);
  },
  // Coin with a raised rim and a boss in the middle; its edge is milled. `info.center`/`info.axis` place it.
  coin(c) {
    const { p, n, info } = c;
    const [cx, cy, cz] = info.center, [ux, uy, uz] = info.axis;
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    const along = dx * ux + dy * uy + dz * uz;
    const r = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along));
    let v;
    if (Math.abs(n.x * ux + n.y * uy + n.z * uz) < 0.7) v = fract((p.x + p.y + p.z) * 2) < 0.5 ? 0.45 : 0.72;
    else v = r > 2.1 ? 0.8 : r > 1.75 ? 0.42 : r < 0.9 ? 0.75 : 0.56;
    return ramp(PAL.gold, v + 0.08 * patches(p, 191, 0.8), c.ax, c.ay);
  },
  // Chain painted onto a loop of bar: dark gaps between links, and every other link shows its hole face-on.
  // `info` gives the loop's centre height and how many links it has.
  chain(c) {
    const { p, n, info } = c;
    const link = ((Math.atan2(p.y - info.cy, p.x) / (2 * Math.PI)) + 1) * info.links;
    const f = fract(link);
    let v = 0.62 + 0.12 * n.y;
    if (f < 0.14 || f > 0.9) v = 0.22;
    else if (Math.floor(link) % 2 && Math.abs(n.z) > 0.6 && Math.abs(f - 0.52) < 0.18) v = 0.28;
    return ramp(PAL.gold, v, c.ax, c.ay);
  },
};

const circle = (r, n, [cx, cy, cz] = [0, 0, 0]) =>
  Array.from({ length: n }, (_, k) => [cx + r * Math.cos((k / n) * 2 * Math.PI), cy + r * Math.sin((k / n) * 2 * Math.PI), cz]);
// Closed loop round a rounded rectangle (half sizes a, b, corner radius r); `to3` maps (u, v) into 3D.
const roundLoop = (a, b, r, to3) => {
  const pts = [];
  for (const [cu, cv, a0] of [[a - r, b - r, 0], [-(a - r), b - r, 90], [-(a - r), -(b - r), 180], [a - r, -(b - r), 270]]) {
    for (let k = 0; k <= 2; k++) {
      const t = ((a0 + k * 45) * Math.PI) / 180;
      pts.push(to3(cu + r * Math.cos(t), cv + r * Math.sin(t)));
    }
  }
  return pts;
};
const DEG = Math.PI / 180;
const axisOf = (rotation) => new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(...rotation.map((d) => d * DEG), 'ZYX')).toArray();

export const items = {
  potion: defineModel('potion', MATS, (m) => {
    // Round-bottomed flask, walked from the bottom up and over the cork: liquid fills the bowl up to y 1.6,
    // then clear glass, the neck and lip, and the cork.
    const profile = [[0, -6.4], [3.1, -5.8], [5.1, -3.6], [5.9, -0.6], [5.6, 1.6], [4.6, 3.6], [2.6, 5.4], [1.7, 6.2],
      [1.6, 9.4], [2.2, 9.7], [2.2, 10.5], [1.5, 10.6], [1.6, 12.4], [0, 12.6]];
    m.mesh('flask', revolve(profile, { mat: (i) => (i <= 3 ? 'liquid' : i <= 10 ? 'glass' : 'cork') }));
  }, { tint: ['liquid'] }),

  scroll: defineModel('scroll', MATS, (m) => {
    // Rolled sheet lying along x (modelled up the y axis and laid down), tied with a ribbon and sealed.
    const lay = { rotation: [0, 0, 90] };
    m.mesh('roll', lathe([[-9, 2.6], [9, 2.6]]), { mat: 'parchment', ...lay });
    m.mesh('ribbon', lathe([[-1.2, 2.85], [1.2, 2.85]]), { mat: 'ribbon', ...lay });
    m.mesh('seal', lathe([[2.4, 1.5], [3.3, 1.7], [3.6, 1.2], [3.7, 0]]), { mat: 'wax' });
  }),

  wand: defineModel('wand', MATS, (m) => {
    // A shaft with a carved grip, a brass ferrule and a glowing crystal, tilted as if it had been dropped.
    const tilt = { rotation: [0, 0, 72] };
    const axis = axisOf(tilt.rotation);
    m.mesh('shaft', lathe([[-10.5, 0.65], [-10, 1.2], [-8.9, 1.2], [-8.4, 1.0], [-3, 1.1], [0, 0.95], [7.6, 0.78], [8.5, 0.92]]),
      { mat: 'wandWood', info: { axis }, ...tilt });
    m.mesh('ferrule', lathe([[8.3, 1.05], [9.7, 1.1]]), { mat: 'brass', ...tilt });
    m.mesh('crystal', loft([latheRing(9.5, 0.85, 0.85, 6), latheRing(10.9, 1.15, 1.15, 6), apex(6, [0, 13.2, 0])], { capEnd: false }),
      { mat: 'crystal', ...tilt });
  }, { tint: ['wandWood'], glow: ['crystal'] }),

  ring: defineModel('ring', MATS, (m) => {
    // A band standing on edge with a stone in a cup setting on top; the stone takes the ring's gem colour.
    m.mesh('band', tube(circle(5.4, 12), { half: 0.9, side: [0, 0, 1], closed: true }), { mat: 'gold' });
    m.mesh('setting', lathe([[5.0, 1.0], [5.8, 1.3], [7.3, 2.1], [7.6, 1.9]]), { mat: 'gold' });
    m.mesh('stone', loft([apex(8, [0, 5.9, 0]), latheRing(7.9, 2.0, 2.0, 8), latheRing(9.1, 1.15, 1.15, 8)]), { mat: 'gemTint' });
  }, { tint: ['gemTint'] }),

  apple: defineModel('apple', MATS, (m) => {
    // A withered apple: dimpled top and bottom, a stalk and a leaf.
    m.mesh('apple', revolve([[0, -3.4], [1.6, -4.3], [3.6, -3.9], [4.9, -2], [5.2, 0.4], [4.6, 2.6], [3.2, 3.9], [1.4, 4.1], [0, 3.2]]),
      { mat: 'apple' });
    m.mesh('stalk', tube([[0, 3.0, 0], [0.3, 4.6, 0], [0.9, 5.6, 0]], { half: 0.3 }), { mat: 'stalk' });
    const leaf = (dy) => [[0.5, 4.5, 0], [2.4, 5.0, 1.0], [4.4, 5.5, 0.2], [2.3, 5.0, -0.8]].map(([x, y, z]) => [x, y + dy, z]);
    m.mesh('leaf', loft([leaf(-0.12), leaf(0.12)]), { mat: 'leaf' });
  }),

  ration: defineModel('ration', MATS, (m) => {
    // A parcel of rations wrapped in cloth and tied with twine.
    const box = (z, hx, hy) => octRingZ(z, hx, hy, 0, 0.35);
    m.mesh('parcel', loft([box(-5, 6.8, 2.6), box(-4.4, 7.5, 3.2), box(4.4, 7.5, 3.2), box(5, 6.8, 2.6)]), { mat: 'cloth' });
    m.mesh('twine_long', tube(roundLoop(7.6, 3.3, 0.8, (u, v) => [u, v, 0]), { half: 0.3, side: [0, 0, 1], closed: true }), { mat: 'twine' });
    m.mesh('twine_short', tube(roundLoop(5.1, 3.35, 0.8, (u, v) => [0.4, v, u]), { half: 0.3, side: [1, 0, 0], closed: true }), { mat: 'twine' });
    m.cube('knot', [-0.5, 3.2, -0.6], [1.3, 4.0, 0.6], { mat: 'twine' });
  }),

  gold: defineModel('gold', MATS, (m) => {
    // A little heap of coins: a short stack and a few loose ones, tipped at odd angles.
    const coins = [
      [[0.8, -3.3, 0.2], [0, 0, 0]], [[1.0, -2.6, 0.0], [0, 0, 4]], [[0.6, -1.9, 0.3], [3, 0, 0]], [[0.9, -1.2, 0.1], [0, 0, -3]],
      [[-3.6, -3.1, 1.6], [0, 0, 14]], [[3.0, -2.9, 2.8], [20, 0, -10]], [[-1.4, -2.8, -3.0], [-24, 0, 6]], [[4.1, -1.6, -1.4], [0, 30, 72]],
    ];
    coins.forEach(([center, rotation], i) => m.mesh(`coin_${i + 1}`, lathe([[-0.35, 2.5], [0.35, 2.5]]),
      { mat: 'coin', origin: center, rotation, info: { center, axis: axisOf(rotation) } }));
  }),

  key: defineModel('key', MATS, (m) => {
    // An old brass key standing on edge: looped bow, collar, shaft and a notched bit.
    m.mesh('bow', tube(circle(2.6, 10, [-6.5, 0, 0]), { half: 0.65, side: [0, 0, 1], closed: true }), { mat: 'brass' });
    m.mesh('collar', tube([[-3.9, 0, 0], [-2.8, 0, 0]], { half: 0.95, sides: 8 }), { mat: 'brass' });
    m.mesh('shaft', tube([[-2.9, 0, 0], [7.6, 0, 0]], { half: 0.55, sides: 8 }), { mat: 'brass' });
    m.cube('bit', [5.0, -2.6, -0.35], [7.2, -0.3, 0.35], { mat: 'brass' });
    m.cube('tooth', [5.6, -3.4, -0.35], [6.4, -2.6, 0.35], { mat: 'brass' });
  }),

  amulet: defineModel('amulet', MATS, (m) => {
    // The Amulet of Yendor: a heavy gold chain, and a great glowing ruby in a gold frame hanging from it.
    m.mesh('chain', tube(circle(7.2, 16, [0, 2.5, 0]), { half: 0.55, side: [0, 0, 1], closed: true }),
      { mat: 'chain', info: { cy: 2.5, links: 22 } });
    m.cube('bail', [-0.6, -5.8, -0.6], [0.6, -4.2, 0.6], { mat: 'gold' });
    m.mesh('frame', tube(circle(3.4, 6, [0, -9, 0]), { half: 0.55, side: [0, 0, 1], closed: true }), { mat: 'gold' });
    // The ruby faces the front: a hexagonal girdle with a table in front and a point behind.
    const ring6 = (r, z) => circle(r, 6, [0, -9, z]);
    m.mesh('ruby', loft([apex(6, [0, -9, -2.0]), ring6(3.1, 0), ring6(1.9, 1.5)]), { mat: 'ruby' });
  }, { glow: ['ruby'] }),
};

