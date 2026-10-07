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
  emerald: P('#022414', '#064a26', '#0c7a3a', '#1eae56', '#5ee08a', '#c0ffd8'),
  hide: P('#24170c', '#362312', '#4c321c', '#634227', '#7a5534', '#906a44'),
  tan: P('#2e1a0c', '#452814', '#5e381d', '#7a4b28', '#955f35', '#ad7443'),
  bone: P('#4a4234', '#6e6450', '#9a8e72', '#c4b898', '#e2d8bc'),
  ebony: P('#0a0808', '#161111', '#241c1b', '#342927', '#463834'),
  lead: P('#1e2024', '#2e3136', '#42464c', '#585d64', '#72777e', '#90959c'),
  wine: P('#1c0206', '#38040c', '#5c0a16', '#861424', '#b02a36', '#e0707a'),
  sea: P('#020c1c', '#061a38', '#0c2c5c', '#164486', '#2c64b0', '#80b0e0'),
  moss: P('#041406', '#0a260c', '#124016', '#1e5e22', '#348232', '#7abc6a'),
  blackIron: P('#0a0b0e', '#14161a', '#1f2227', '#2c3036', '#3c4148', '#50565f', '#6a717b'),
  taint: P('#3a0630', '#6a0e56', '#a01c84', '#d836b4', '#ff6ad8', '#ffc8f0'),
  grave: P('#2a3606', '#4a600c', '#78961a', '#a8c834', '#d4ee70', '#f4ffc8'), // the Jailer's sickly light (see bossdoors.mjs)
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
  taintGem: gem(ITEM_PAL.taint),
  graveGem: gem(ITEM_PAL.grave),
  blackIron: (c) => ramp(ITEM_PAL.blackIron, 0.42 + 0.14 * patches(c.p, 175, 0.6) + bevel(c, 0.25) + 0.1 * c.n.y, c.ax, c.ay),
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
  // Pack expansions' leather: tan hide, darker toward the edges of each piece, with a row of stitches round them
  // where `info.stitch(p)` says (a distance from the seam, in pixels).
  tan(c) {
    const { p, info } = c;
    let v = 0.5 + 0.14 * patches(p, 201, 0.35) + bevel(c, 0.18);
    const d = info.stitch?.(p);
    if (d !== undefined && Math.abs(d - 1.2) < 0.35 && fract((p.x + p.y + p.z) * 0.7) < 0.5) v = 0.9;
    return ramp(ITEM_PAL.tan, v, c.ax, c.ay);
  },
  strap(c) {
    return ramp(PAL.leather, 0.42 + 0.14 * patches(c.p, 203, 0.5) + bevel(c, 0.2), c.ax, c.ay);
  },
  // A scroll standing on end: the end shows a spiral of paper edges round `info` (cx, cz), the side plain paper.
  paperEnd(c) {
    const { p, n, info } = c;
    if (Math.abs(n.y) > 0.9) {
      const dx = p.x - info.cx, dz = p.z - info.cz;
      const spiral = fract(Math.hypot(dx, dz) / 0.8 - Math.atan2(dz, dx) / (2 * Math.PI));
      return ramp(ITEM_PAL.parchment, spiral < 0.3 ? 0.25 : 0.72, c.ax, c.ay);
    }
    return ramp(ITEM_PAL.parchment, 0.62 + 0.14 * patches(p, 205, 0.4), c.ax, c.ay);
  },
  // An open scroll's sheet, facing +z: plain paper, browned toward its sides and a little foxed, to take a rune.
  sheet(c) {
    const { p } = c;
    let v = 0.74 + 0.12 * patches(p, 211, 0.4) - clamp01((Math.abs(p.x) - 4) / 2) * 0.24;
    if (rand(c.ax, c.ay, 212) > 0.975) v -= 0.18; // foxing
    return ramp(ITEM_PAL.parchment, v, c.ax, c.ay);
  },
  // An open scroll's rolls, along x at height `info.y`: their ends show a spiral of paper edges.
  roll(c) {
    const { p, n, info } = c;
    if (Math.abs(n.x) > 0.9) {
      const dy = p.y - info.y, spiral = fract(Math.hypot(dy, p.z) / 0.7 - Math.atan2(p.z, dy) / (2 * Math.PI));
      return ramp(ITEM_PAL.parchment, spiral < 0.3 ? 0.25 : 0.7, c.ax, c.ay);
    }
    return ramp(ITEM_PAL.parchment, 0.56 + 0.12 * patches(p, 213, 0.4) - clamp01((Math.abs(p.x) - 5.5) / 1.5) * 0.2, c.ax, c.ay);
  },
  // Rough hide for a pouch, creased where it's gathered in at the neck (`info.neck`).
  hide(c) {
    const { p, info } = c;
    let v = 0.5 + 0.18 * patches(p, 207, 0.3) + 0.1 * c.n.y;
    if (p.y > info.neck - 5 && fract(Math.atan2(p.z, p.x) * 1.9) < 0.22) v -= 0.22; // gathers
    if (rand(c.ax, c.ay, 208) > 0.96) v -= 0.14;
    return ramp(ITEM_PAL.hide, v, c.ax, c.ay);
  },
  lead: (c) => ramp(ITEM_PAL.lead, 0.5 + 0.2 * c.n.y + 0.1 * patches(c.p, 209, 0.9), c.ax, c.ay),
  bone: (c) => ramp(ITEM_PAL.bone, 0.55 + 0.12 * patches(c.p, 211, 0.6) + bevel(c, 0.15), c.ax, c.ay),
  ebony: (c) => ramp(ITEM_PAL.ebony, 0.5 + 0.15 * patches(c.p, 213, 0.6) + bevel(c, 0.2), c.ax, c.ay),
  emerald: gem(ITEM_PAL.emerald),
  // The potions in a bandolier, each a colour of its own (not tinted: you can't tell which they are anyway).
  wine: (c) => vial('wine', c),
  sea: (c) => vial('sea', c),
  moss: (c) => vial('moss', c),

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

function vial(pal, c) {
  const { p, info } = c;
  let v = 0.55 + 0.1 * patches(p, 215, 0.5);
  if (Math.cos(Math.atan2(p.z - info.cz, p.x - info.cx) - 0.8) > 0.8) v = 0.95;
  return ramp(ITEM_PAL[pal], v, c.ax, c.ay);
}

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

/**
 * A boss key, standing on edge (see key_boss): a great key of black iron, its bow a ring of spikes round a glowing gem
 * (`gem`, its material), a double collar, a long shaft and a heavy bit cut with three wards.
 */
function bossKey(m, gem) {
  const bow = [-10, 0, 0];
  m.mesh('bow', tube(circle(3.3, 12, bow), { half: 0.75, side: [0, 0, 1], closed: true }), { mat: 'blackIron' });
  [Math.PI, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, (-3 * Math.PI) / 4].forEach((a, i) => {
    const c = Math.cos(a), s = Math.sin(a);
    m.mesh(`spike_${i + 1}`, tube([[bow[0] + c * 3.6, s * 3.6, 0], [bow[0] + c * 6.4, s * 6.4, 0]], { half: (f) => 0.75 * (1 - f) + 0.08, side: [0, 0, 1] }), { mat: 'blackIron' });
  });
  m.mesh('gem', loft([apex(6, [bow[0], 0, -1.3]), circle(2.1, 6, bow), apex(6, [bow[0], 0, 1.3])]), { mat: gem });
  m.mesh('collar', tube([[-6.6, 0, 0], [-5.4, 0, 0]], { half: 1.15, sides: 8 }), { mat: 'blackIron' });
  m.mesh('collar_2', tube([[-4.4, 0, 0], [-3.7, 0, 0]], { half: 0.95, sides: 8 }), { mat: 'blackIron' });
  m.mesh('shaft', tube([[-6.7, 0, 0], [10.6, 0, 0]], { half: 0.7, sides: 8 }), { mat: 'blackIron' });
  m.cube('bit', [6.4, -3.6, -0.45], [10.4, -0.4, 0.45], { mat: 'blackIron' });
  m.cube('ward_1', [6.4, -5.0, -0.45], [7.3, -3.6, 0.45], { mat: 'blackIron' });
  m.cube('ward_2', [8.0, -4.6, -0.45], [8.8, -3.6, 0.45], { mat: 'blackIron' });
  m.cube('ward_3', [9.5, -5.0, -0.45], [10.4, -3.6, 0.45], { mat: 'blackIron' });
}

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

  scroll_open: defineModel('scroll_open', MATS, (m) => {
    // An open scroll, for a scroll's icon (see ui/icons.js) rather than the floor: a plain sheet facing +z between two
    // rolls, for the icon to paint the scroll's rune on, centred on the empty group `rune`.
    m.cube('sheet', [-6, -6.6, -0.25], [6, 6.6, 0.25], { mat: 'sheet' });
    for (const y of [7, -7]) {
      m.mesh(y > 0 ? 'roll_top' : 'roll_bottom', lathe([[-7, 1.4], [7, 1.4]]), { mat: 'roll', info: { y }, origin: [0, y, 0], rotation: [0, 0, 90] });
    }
    m.group('rune', () => {}, { origin: [0, 0, 0.25] });
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
    // An old iron key standing on edge, for a locked door: looped bow, collar, shaft and a notched bit.
    m.mesh('bow', tube(circle(2.6, 10, [-6.5, 0, 0]), { half: 0.65, side: [0, 0, 1], closed: true }), { mat: 'iron' });
    m.mesh('collar', tube([[-3.9, 0, 0], [-2.8, 0, 0]], { half: 0.95, sides: 8 }), { mat: 'iron' });
    m.mesh('shaft', tube([[-2.9, 0, 0], [7.6, 0, 0]], { half: 0.55, sides: 8 }), { mat: 'iron' });
    m.cube('bit', [5.0, -2.6, -0.35], [7.2, -0.3, 0.35], { mat: 'iron' });
    m.cube('tooth', [5.6, -3.4, -0.35], [6.4, -2.6, 0.35], { mat: 'iron' });
  }),

  // The boss keys (BOSS_KEYS in src/items/defs.js): the Maledicted Ooze's, its gem of the ooze's taint, and the Forgotten
  // Jailer's, burning with his grave light, each the glow of its door's lock (see bossdoors.mjs).
  key_boss: defineModel('key_boss', MATS, (m) => bossKey(m, 'taintGem'), { glow: ['taintGem'] }),
  key_boss_jailer: defineModel('key_boss_jailer', MATS, (m) => bossKey(m, 'graveGem'), { glow: ['graveGem'] }),

  key_gold: defineModel('key_gold', MATS, (m) => {
    // A gold key standing on edge, for a locked chest, finely wrought: a trefoil bow set with a ruby, a ringed collar,
    // and a bit with two teeth.
    const bow = [-8, 0, 0];
    [Math.PI, Math.PI / 3, -Math.PI / 3].forEach((a, i) => {
      const at = [bow[0] + Math.cos(a) * 2.1, Math.sin(a) * 2.1, 0];
      m.mesh(`bow_${i + 1}`, tube(circle(1.7, 8, at), { half: 0.5, side: [0, 0, 1], closed: true }), { mat: 'gold' });
    });
    m.mesh('ruby', loft([apex(4, [bow[0], 0, -0.9]), circle(1.1, 4, bow), apex(4, [bow[0], 0, 0.9])]), { mat: 'ruby' });
    m.mesh('collar', tube([[-5.6, 0, 0], [-4.5, 0, 0]], { half: 1.0, sides: 8 }), { mat: 'gold' });
    m.mesh('collar_2', tube([[-3.6, 0, 0], [-3.0, 0, 0]], { half: 0.85, sides: 8 }), { mat: 'gold' });
    m.mesh('shaft', tube([[-4.6, 0, 0], [7.8, 0, 0]], { half: 0.55, sides: 8 }), { mat: 'gold' });
    m.cube('bit', [5.0, -2.8, -0.35], [7.6, -0.3, 0.35], { mat: 'gold' });
    m.cube('tooth_1', [5.0, -3.7, -0.35], [5.8, -2.8, 0.35], { mat: 'gold' });
    m.cube('tooth_2', [6.8, -3.7, -0.35], [7.6, -2.8, 0.35], { mat: 'gold' });
  }, { glow: ['ruby'] }),

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

  // --- Pack expansions (CONTAINERS in src/items/defs.js) ---

  scroll_holder: defineModel('scroll_holder', MATS, (m) => {
    // Three stiff leather tubes bound side by side with two straps, brass-capped at each end, a rolled scroll standing
    // in each, and a strap over the top to carry it by.
    const X = [-6.2, 0, 6.2], rise = [3.4, 4.8, 2.6];
    X.forEach((x, i) => {
      const o = { origin: [x, 0, 0] };
      m.mesh(`tube_${i + 1}`, lathe([[-8.4, 2.8], [8.2, 2.8]], { capStart: false, capEnd: false }), { mat: 'tan', ...o });
      m.mesh(`cap_${i + 1}`, lathe([[-9.4, 3.05], [-8.2, 3.05]]), { mat: 'brass', ...o });
      m.mesh(`rim_${i + 1}`, lathe([[7.8, 3.05], [8.8, 3.05]]), { mat: 'brass', ...o });
      m.mesh(`scroll_${i + 1}`, lathe([[8.8, 2.1], [8.8 + rise[i], 2.1]], { capStart: false }), { mat: 'paperEnd', info: { cx: x, cz: 0 }, ...o });
    });
    for (const [i, y] of [-4, 3].entries()) {
      m.mesh(`band_${i + 1}`, tube(roundLoop(9.35, 3.15, 2.95, (u, v) => [u, y, v]), { half: 0.55, side: [0, 1, 0], closed: true }), { mat: 'strap' });
      m.cube(`buckle_${i + 1}`, [-1.3, y - 1.0, 3.0], [1.3, y + 1.0, 3.9], { mat: 'brass' });
    }
    m.mesh('handle', tube([[-9.4, 3, 0], [-9.9, 9, 0], [-7.6, 15.8, 0], [0, 18.4, 0], [7.6, 15.8, 0], [9.9, 9, 0], [9.4, 3, 0]],
      { half: 0.6, side: [0, 0, 1] }), { mat: 'strap' });
  }),

  potion_bandolier: defineModel('potion_bandolier', MATS, (m) => {
    // A leather belt lying in a loop, brass-buckled, with a padded loop for a flask every so often round it: five
    // stoppered flasks in them, and one loop empty.
    m.mesh('belt', revolve([[8.2, -1.6], [9, -1.6], [9, 1.6], [8.2, 1.6], [8.2, -1.6]], { sides: 16 }), { mat: 'strap' });
    m.cube('buckle', [-9.8, -2.0, -1.8], [-8.8, 2.0, 1.8], { mat: 'brass' });
    m.cube('tongue', [-9.95, -0.3, -0.35], [-9.75, 0.3, 2.6], { mat: 'brass' });
    const liquids = ['wine', 'sea', 'moss', 'wine', 'moss'];
    for (let k = 0; k < 6; k++) {
      const a = ((k * 60 + 30) * Math.PI) / 180, cx = Math.cos(a) * 10.9, cz = Math.sin(a) * 10.9, o = { origin: [cx, 0, cz] };
      m.mesh(`loop_${k + 1}`, lathe([[-0.2, 2.05], [1.8, 2.05]], { capStart: false, capEnd: false }), { mat: 'tan', ...o });
      if (k === 5) continue;
      const liquid = liquids[k];
      m.mesh(`flask_${k + 1}`, revolve([[0, -1.9], [1.5, -1.7], [1.8, -0.6], [1.8, 3.6], [1.0, 4.6], [0.8, 5.6], [1.1, 5.9], [0, 6.3]],
        { sides: 6, mat: (i) => (i <= 2 ? liquid : i <= 4 ? 'glass' : 'cork') }), { info: { cx, cz }, ...o });
    }
  }),

  wand_holster: defineModel('wand_holster', MATS, (m) => {
    // A flat sheath of stitched leather, narrowing to its tip, with a belt loop behind and a strap round its mouth,
    // and three wands standing in it: oak, bone and ebony, each with its gem.
    m.mesh('sheath', lathe([[-10, 1.6, 1.1], [-8, 3.0, 1.8], [2, 4.6, 2.3], [6, 4.8, 2.4]], { sides: 10 }),
      { mat: 'tan', info: { stitch: (p) => (p.z > 0.5 ? Math.abs(p.x) + 1.2 : undefined) } });
    m.mesh('mouth', lathe([[4.8, 5.05, 2.65], [6.3, 5.05, 2.65]], { sides: 10, capEnd: false }), { mat: 'strap' });
    m.cube('loop', [-1.6, -2, -3.2], [1.6, 5.4, -2.3], { mat: 'strap' });
    [[-2.4, 9, 'wood', 'crystal', 11], [0.2, -2, 'bone', 'ruby', 13.5], [2.6, -11, 'ebony', 'emerald', 10]].forEach(([x, tilt, wood, gemMat, L], i) => {
      const o = { origin: [x, 2, 0], rotation: [0, 0, tilt] };
      m.mesh(`wand_${i + 1}`, lathe([[0, 0.75], [L - 1, 0.75], [L, 0.9]], { capStart: false }), { mat: wood, ...o });
      m.mesh(`gem_${i + 1}`, loft([latheRing(L, 0.85, 0.85, 6), latheRing(L + 1.2, 1.1, 1.1, 6), apex(6, [0, L + 3, 0])], { capStart: false }),
        { mat: gemMat, ...o });
    });
  }, { glow: ['crystal', 'ruby', 'emerald'] }),

  bullet_pouch: defineModel('bullet_pouch', MATS, (m) => {
    // A pouch of rough hide gathered in at the neck by a drawstring, its mouth frilled open on a few lead bullets.
    m.mesh('pouch', revolve([[0, -6], [4.5, -5.8], [6.4, -4.2], [6.8, -1.5], [6.0, 1.2], [4.2, 3.2], [2.3, 4.4], [2.0, 5.2], [3.0, 6.2],
      [3.4, 7.2], [2.8, 7.4], [1.6, 5.9], [0, 5.9]], { sides: 10 }), { mat: 'hide', info: { neck: 4.4 } });
    m.mesh('drawstring', tube(circle(2.35, 8).map(([x, z]) => [x, 4.8, z]), { half: 0.42, side: [0, 1, 0], closed: true }), { mat: 'twine' });
    m.mesh('string_end', tube([[2.4, 4.8, 0], [3.9, 3.4, 0.8], [4.6, 0.8, 1.3]], { half: 0.38 }), { mat: 'twine' });
    m.cube('knot', [3.9, -0.1, 0.6], [5.3, 1.1, 2.0], { mat: 'twine' });
    [[-0.6, 6.5, 0.4], [0.7, 6.4, -0.3], [0, 7.1, -0.6]].forEach((at, i) =>
      m.mesh(`bullet_${i + 1}`, lathe([[-0.9, 0], [-0.6, 0.7], [0, 0.9], [0.6, 0.7], [0.9, 0]], { sides: 6 }), { mat: 'lead', origin: at }));
  }),
};

