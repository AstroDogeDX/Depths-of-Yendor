// The hand torch. Origin = where the hand grips, +y up toward the burning head.
// An empty group "flame" marks where the game attaches the flame effect.
import { Model, loft, lathe, apex, latheRing, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, P, clamp01, patches } from './materials.mjs';

const Y = -3; // shifts the whole torch so the flame sits where the old one did

const TORCH_PAL = {
  wood: P('#1f150d', '#2e2015', '#3e2b1c', '#4f3824', '#61452d', '#735436'),
  rags: P('#110c09', '#1c1510', '#291f17', '#372a1f', '#463628', '#574433'),
};

const mats = {
  ...MAT,
  // Handle: rough wood, blackened with soot toward the head; the cut end shows its rings.
  torchWood(c) {
    const { p, n } = c;
    const a = Math.atan2(p.z, p.x);
    const g = noise3(Math.cos(a) * 1.4 + 3, p.y * 0.05, Math.sin(a) * 1.4, 51);
    let v = 0.34 + 0.38 * g;
    if (fract(g * 6 + 0.4 * noise3(p.x, p.y * 0.15, p.z, 52)) < 0.14) v -= 0.18;
    if (Math.abs(n.y) > 0.9) v = fract(Math.hypot(p.x, p.z) * 1.3) < 0.35 ? 0.3 : 0.55;
    v -= clamp01((p.y - (2 + Y)) / 7) * 0.28;
    return ramp(TORCH_PAL.wood, v, c.ax, c.ay);
  },
  // Pitch-soaked rags wound round the head: ragged diagonal strips of different cloths, each with a dark
  // gap below it, blackened toward the burning top.
  rags(c) {
    const { p } = c;
    const a = Math.atan2(p.z, p.x) / (2 * Math.PI);
    const w = p.y / 1.6 + a + 0.45 * noise3(p.x * 0.6, p.y * 0.35, p.z * 0.6, 61);
    const f = fract(w), strip = Math.floor(w);
    let v = 0.28 + 0.24 * rand(strip, 64) + 0.1 * patches(p, 62, 0.8);
    if (f < 0.14) v = 0.06;
    else if (f > 0.86) v += 0.14; // turned-over edge catching the light
    if (rand(c.ax, c.ay, 63) > 0.96) v += 0.22; // wet pitch
    v -= clamp01((p.y - (14.5 + Y)) / 2.5) * 0.22;
    return ramp(TORCH_PAL.rags, v, c.ax, c.ay);
  },
};

// Head profile: [y, radius]; the bundle is lumpy, so each vertex gets a little random push.
const HEAD = [[12.3, 2.0], [13.6, 2.75], [15.4, 3.05], [17.2, 2.8], [18.4, 2.1]].map(([y, r]) => [y + Y, r]);
const lumpy = (y, r, i) => latheRing(y, r, r, 8).map(([x, yy, z], k) => {
  const j = 1 + (rand(i, k, 81) - 0.5) * 0.14;
  return [x * j, yy + (rand(i, k, 82) - 0.5) * 0.3, z * j];
});

export function torch() {
  const m = new Model('torch', {
    materials: mats,
    sheets: [{ name: 'torch', mode: 'default' }, { name: 'torch_embers', mode: 'emissive' }],
    sheetOf: { embers: 1 },
  });
  m.group('head', () => {
    const rings = [...HEAD.map(([y, r], i) => lumpy(y, r, i)), apex(8, [0.25, 19.3 + Y, -0.2])];
    // The top of the bundle is burning coals, hottest at the crown.
    m.mesh('rags', loft(rings, { capEnd: false, mat: (seg) => (seg === 'start' || seg < 3 ? 'rags' : 'embers') }),
      { info: { heat: (p) => clamp01((p.y - (17 + Y)) / 2.5) } });
    m.mesh('collar', lathe([[9.6, 1.55], [10.2, 2.05], [12.4, 2.1], [12.9, 1.9]].map(([y, r]) => [y + Y, r])), { mat: 'iron' });
    // One iron strap cinching the bundle, repeated round it by rotation.
    const strap = loft(HEAD.slice(0, 4).map(([y, r]) => {
      const rr = r * Math.cos(Math.PI / 8); // straps sit on the flats of the octagonal bundle
      const x0 = rr - 0.05, x1 = rr + 0.35;
      return [[x1, y, -0.45], [x1, y, 0.45], [x0, y, 0.45], [x0, y, -0.45]];
    }));
    for (let k = 0; k < 4; k++) m.mesh(`strap_${k + 1}`, strap, { mat: 'iron', rotation: [0, 45 + k * 90, 0] });
    m.group('flame', undefined, { origin: [0, 18.2 + Y, 0] });
  });
  m.group('handle', () => {
    m.mesh('stick', lathe([[-14, 1.15], [-13.4, 1.3], [0, 1.38], [10.5, 1.5]].map(([y, r]) => [y + Y, r])), { mat: 'torchWood' });
    m.mesh('grip', lathe([[-5.5, 1.52], [2.5, 1.56]].map(([y, r]) => [y + Y, r])), { mat: 'leather' });
  });
  return m;
}
