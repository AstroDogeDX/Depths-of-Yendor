// The six artefacts. Origin = the item's centre, where it bobs and spins; +y up, +z the front.
import { defineModel, loft, lathe, revolve, tube, apex, latheRing, octRingZ, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, clamp01, patches, bevel, gem } from './materials.mjs';

const ART_PAL = {
  wine: P('#2a0208', '#4e0612', '#78091d', '#a0102c', '#c8243f', '#e8506a'),
  white: P('#6e6252', '#948672', '#b6a992', '#d2c7b0', '#e8e0cf', '#f6f1e6'),
  vein: P('#5a1210', '#8a2018', '#b03a2a'),
  iris: P('#020606', '#0c3a36', '#136a62', '#1f9a8e', '#30c0b0', '#7ae6d8', '#e6fffb'),
  ivory: P('#4d4230', '#6e6048', '#8f7f60', '#afa07c', '#cbbd98', '#e2d7b6', '#f3ecd6'),
  rune: P('#5a3a08', '#8a5c12', '#c08a1e', '#e8b43a', '#ffe08a', '#fff6d6'),
  cloak: P('#0e0d18', '#16152a', '#201e3a', '#2b294b', '#38365e', '#47457a'),
  silver: P('#3a3f47', '#5b626c', '#838b95', '#adb4bc', '#d6dbe0', '#f2f4f6'),
  amethyst: P('#1e1040', '#3a2276', '#5a3aa8', '#8a6ad8', '#bca6f2', '#eee4ff'),
  boot: P('#161c24', '#212a35', '#2e3a48', '#3d4c5d', '#4e5f72', '#627589'),
  wind: P('#2d5a7a', '#4a86aa', '#72acd0', '#a2d0ec', '#d6eefa', '#ffffff'),
  fire: P('#3a0802', '#7a1604', '#c03008', '#f05a10', '#ff8c28', '#ffc050', '#fff0b0'),
};

const MATS = {
  ...MAT,
  // Wine brimming in the chalice: emissive, swirling from dark to bright crimson.
  wine(c) {
    const { p } = c;
    const r = Math.hypot(p.x, p.z), a = Math.atan2(p.z, p.x);
    return ramp(ART_PAL.wine, 0.45 + 0.35 * Math.sin(a * 2 + r * 1.3) * 0.5 + 0.2 * patches(p, 301, 0.9), c.ax, c.ay);
  },
  // Eyeball: off-white, veined toward the back.
  eyeWhite(c) {
    const { p } = c;
    // Thin veins, creeping in from the back.
    const veins = Math.abs(noise3(p.x * 0.45, p.y * 0.45, p.z * 0.45, 302) - 0.5);
    if (veins < clamp01((2 - p.z) / 10) * 0.035) return ramp(ART_PAL.vein, 0.5 + 0.4 * patches(p, 303, 1), c.ax, c.ay);
    return ramp(ART_PAL.white, 0.62 + 0.12 * patches(p, 304, 0.4) + 0.1 * c.n.y, c.ax, c.ay);
  },
  // Emissive iris facing +z: a slit pupil, radiating streaks, a dark limbal ring and a glint.
  iris(c) {
    const { p } = c;
    const r = Math.hypot(p.x, p.y);
    if (Math.abs(p.x) < 0.6 && Math.abs(p.y) < 3.2 - Math.abs(p.x) * 2) return ramp(ART_PAL.iris, 0, c.ax, c.ay);
    if (Math.hypot(p.x - 1.6, p.y - 1.6) < 0.7) return ramp(ART_PAL.iris, 1, c.ax, c.ay);
    if (r > 3.9) return ramp(ART_PAL.iris, 0.18, c.ax, c.ay);
    const streak = fract((Math.atan2(p.y, p.x) / (2 * Math.PI)) * 18) < 0.4 ? 0.1 : 0;
    return ramp(ART_PAL.iris, 0.45 + (r / 4) * 0.25 + streak, c.ax, c.ay);
  },
  // Ivory with growth rings round the curve of the horn (`info.center` is the curve's centre).
  ivory(c) {
    const { p, info } = c;
    const a = Math.atan2(p.y - info.center[1], p.x - info.center[0]);
    let v = 0.62 + 0.1 * patches(p, 305, 0.5) + bevel(c, 0.1);
    if (fract(a * 2.4) < 0.12) v -= 0.2;
    return ramp(ART_PAL.ivory, v, c.ax, c.ay);
  },
  hornMouth(c) {
    const r = Math.hypot(c.p.x - c.info.mouth[0], c.p.y - c.info.mouth[1]);
    return ramp(ART_PAL.ivory, r > 3.2 ? 0.55 : 0.02, c.ax, c.ay);
  },
  // Emissive band of thunder runes.
  rune(c) {
    const { p } = c;
    const f = fract((p.x + p.y) * 0.8);
    return ramp(ART_PAL.rune, f < 0.3 ? 0.9 : 0.45 + 0.1 * patches(p, 306, 1), c.ax, c.ay);
  },
  // Deep blue cloth with a pale thread border at the hem.
  cloak(c) {
    const { p } = c;
    let v = 0.46 + 0.14 * patches(p, 307, 0.3);
    if ((c.ax + c.ay) % 4 === 0) v -= 0.06;
    if (p.y < -12.6 && p.y > -13.6) return ramp(ART_PAL.silver, fract(Math.atan2(p.z, p.x) * 6) < 0.5 ? 0.45 : 0.25, c.ax, c.ay);
    return ramp(ART_PAL.cloak, v, c.ax, c.ay);
  },
  silver(c) {
    return ramp(ART_PAL.silver, 0.55 + 0.2 * c.n.y + bevel(c, 0.2), c.ax, c.ay);
  },
  amethyst: gem(ART_PAL.amethyst),
  // Soft boot leather, with a stitched seam down the back and round the foot.
  boot(c) {
    const { p, n } = c;
    let v = 0.5 + 0.14 * patches(p, 308, 0.4) + bevel(c, 0.15);
    if (n.z < -0.5 && Math.abs(p.x - c.info.x) < 0.3 && fract(p.y * 0.9) < 0.5) v = 0.9;
    if (p.y < -7.3) v -= 0.25; // the sole
    return ramp(ART_PAL.boot, v, c.ax, c.ay);
  },
  // Emissive feathered wing: pale, with darker lines along each feather.
  wind(c) {
    const { p } = c;
    return ramp(ART_PAL.wind, fract((p.y - p.z * 0.5) * 0.9) < 0.22 ? 0.35 : 0.75 + 0.1 * patches(p, 309, 1), c.ax, c.ay);
  },
  // Emissive crystal of living fire: bright cracks running through orange and red.
  fire(c) {
    const { p, n } = c;
    const g = noise3(p.x * 0.7, p.y * 0.7, p.z * 0.7, 310);
    let v = 0.42 + 0.3 * Math.max(0, n.y * 0.6 + n.z * 0.5) + 0.15 * patches(p, 311, 0.6);
    if (fract(g * 5) < 0.14) v = 0.95;
    return ramp(ART_PAL.fire, v, c.ax, c.ay);
  },
};

// Tapering octagonal horn along a curve: [point, radius] samples, bell first.
function hornRings(samples) {
  return samples.map(([c, r], i) => {
    const prev = samples[Math.max(0, i - 1)][0], next = samples[Math.min(samples.length - 1, i + 1)][0];
    const t = [next[0] - prev[0], next[1] - prev[1]], tl = Math.hypot(...t);
    const u = [-t[1] / tl, t[0] / tl]; // in-plane normal; the other axis is z
    return Array.from({ length: 8 }, (_, k) => {
      const a = ((k + 0.5) / 8) * 2 * Math.PI;
      return [c[0] + u[0] * r * Math.cos(a), c[1] + u[1] * r * Math.cos(a), r * Math.sin(a)];
    });
  });
}

export const artefacts = {
  chalice: defineModel('chalice', MATS, (m) => {
    // A gold goblet brimming with glowing wine: foot, knopped stem, bowl, lip and the wine inside.
    m.mesh('goblet', revolve([[0, -12], [5.6, -12], [5.8, -11], [3.4, -10.2], [1.3, -9], [1.1, -5], [2.0, -4.2], [1.1, -3.4], [1.2, -1.5],
      [3.8, 1], [6.8, 5], [7.8, 9.5], [8.2, 12.4], [7.4, 12.6], [7.0, 11.2], [0, 11.4]], { sides: 10, mat: (i) => (i === 14 ? 'wine' : 'gold') }));
  }, { glow: ['wine'] }),

  eye: defineModel('eye', MATS, (m) => {
    // A great veined eye staring out of the front, its iris glowing.
    const sphere = Array.from({ length: 9 }, (_, k) => { const a = -Math.PI / 2 + (k / 8) * Math.PI; return [8.5 * Math.cos(a), 8.5 * Math.sin(a)]; });
    sphere[0][0] = sphere[8][0] = 0;
    m.mesh('eyeball', revolve(sphere, { sides: 10 }), { mat: 'eyeWhite' });
    // The iris: a lens built up the y axis and turned to face +z.
    m.mesh('iris', lathe([[7.0, 4.6], [8.4, 4.2], [9.0, 2.6], [9.3, 0]]), { mat: 'iris', rotation: [90, 0, 0] });
  }, { glow: ['iris'] }),

  horn: defineModel('horn', MATS, (m) => {
    // The Horn of Thunder: an ivory horn curling round a centre, bound in gold, one band glowing with runes.
    const center = [1.5, -1.5], R = 8.5;
    const at = (f) => {
      const a = ((200 - f * 190) * Math.PI) / 180;
      return [[center[0] + R * Math.cos(a), center[1] + R * Math.sin(a)], 4.0 * Math.pow(1 - f, 0.85) + 0.6];
    };
    const samples = Array.from({ length: 11 }, (_, i) => at(i / 10));
    const mouth = samples[0][0];
    m.mesh('horn', loft(hornRings(samples), { mat: (seg) => (seg === 'start' ? 'hornMouth' : 'ivory') }), { info: { center, mouth } });
    const band = (f, mat, name) => {
      const [[c0, r0], [c1]] = [at(f - 0.025), at(f + 0.025)];
      m.mesh(name, loft(hornRings([[c0, r0 + 0.35], [c1, r0 + 0.3]])), { mat });
    };
    band(0.06, 'gold', 'bell_band');
    band(0.3, 'rune', 'rune_band');
    band(0.62, 'gold', 'band');
    m.mesh('mouthpiece', loft(hornRings([[at(0.96)[0], 0.8], [at(1)[0], 0.95]])), { mat: 'gold' });
  }, { glow: ['rune'] }),

  cloak: defineModel('cloak', MATS, (m) => {
    // The Cloak of Shadows, hanging as if from unseen shoulders: deep folds, a hood behind, and a silver
    // clasp with a glowing stone. The hem is open, so the cloth is double-sided.
    const SIDES = 16;
    const ring = (y, r, fold) => Array.from({ length: SIDES }, (_, k) => {
      const a = (k / SIDES) * 2 * Math.PI;
      const rr = r * (1 + fold * Math.sin(a * 5 + y * 0.15));
      return [rr * Math.cos(a), y, rr * 0.8 * Math.sin(a)];
    });
    const fan = Array.from({ length: 7 }, (_, i) => [0, 2 * i + 1, 2 * i + 2, 2 * i + 3]);
    m.mesh('cloak', loft([ring(-14, 9.5, 0.16), ring(-8, 8.2, 0.13), ring(-2, 7.0, 0.1), ring(4, 5.8, 0.07), ring(8, 4.6, 0.04), ring(10, 2.6, 0)],
      { capStart: false, caps: fan }), { mat: 'cloak' });
    m.mesh('hood', lathe([[-1.5, 3.2], [1.5, 3.6], [4, 3.0], [5.5, 1.6], [6.2, 0]]), { mat: 'cloak', origin: [0, 8.6, -2.4], rotation: [-24, 0, 0] });
    m.mesh('clasp', lathe([[-0.4, 1.4], [0.6, 1.4], [0.9, 0.7]]), { mat: 'silver', origin: [0, 8.2, 3.0], rotation: [90, 0, 0] });
    m.mesh('clasp_stone', loft([latheRing(0.8, 0.8, 0.8, 6), apex(6, [0, 1.7, 0])], { capEnd: false }), { mat: 'amethyst', origin: [0, 8.2, 3.0], rotation: [90, 0, 0] });
  }, { glow: ['amethyst'], double: ['cloak'] }),

  boots: defineModel('boots', MATS, (m) => {
    // Boots of the Wind: a pair of soft boots with little feathered wings at the heels, glowing pale blue.
    for (const [s, turn] of [[-1, -8], [1, 10]]) {
      const x = s * 3.4, side = s < 0 ? 'left' : 'right';
      const opts = { mat: 'boot', info: { x }, origin: [x, 0, 0], rotation: [0, turn, 0] };
      m.mesh(`shaft_${side}`, lathe([[-5.4, 2.0, 2.3], [2.5, 2.1, 2.4], [5.2, 2.6, 2.8], [5.6, 2.3, 2.5]], { mat: (seg) => (seg === 'end' ? 'inside' : 'boot') }), opts);
      m.mesh(`foot_${side}`, loft([octRingZ(-2.6, 2.0, 2.0, -5.8), octRingZ(0.4, 2.2, 2.2, -5.9), octRingZ(3.4, 2.0, 1.6, -6.5), octRingZ(5.8, 1.3, 1.0, -7.0)]), opts);
      const wing = (dx) => [[-0.6, -2.0], [1.0, -2.6], [2.8, -4.6], [1.6, -4.0], [0.6, -4.4]].map(([y, z]) => [s * 2.45 + dx, y, z]);
      m.mesh(`wing_${side}`, loft([wing(-0.15), wing(0.15)]), { ...opts, mat: 'wind' });
    }
  }, { glow: ['wind'] }),

  ember: defineModel('ember', MATS, (m) => {
    // Emberheart: a crystal of living fire, with a few shards drifting round it.
    m.mesh('heart', loft([apex(8, [0, -8, 0]), latheRing(1.2, 5.0, 5.0, 8), latheRing(4.4, 3.0, 3.0, 8)]), { mat: 'fire' });
    for (const [i, [x, y, z]] of [[-7, 3, 1], [6, -2, 3], [2, 6, -5]].entries()) {
      m.mesh(`shard_${i + 1}`, loft([apex(4, [0, -1.4, 0]), latheRing(0, 0.9, 0.9, 4), apex(4, [0, 1.6, 0])]), { mat: 'fire', origin: [x, y, z], rotation: [20 * i, 35 * i, 15] });
    }
  }, { glow: ['fire'] }),
};

MATS.inside = (c) => ramp(P('#0c0f14', '#151b22'), 0.4, c.ax, c.ay);
