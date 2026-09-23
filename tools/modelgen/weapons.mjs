// The seven weapon models. Frame (shared with the game's viewmodel):
//   origin = where the hand grips, +y = toward the tip or head, -z (north) = cutting edge / striking face.
import { Model, loft, lathe, apex, hexRing, diamondRing, octRingZ, rectRingZ, latheRing } from './lib.mjs';
import { MAT, interp } from './materials.mjs';

const blade = (m, prof, tipY, ring, info) => {
  const rings = [...prof.map(([y, w, t]) => ring(y, w, t)), apex(ring(0, 1, 1).length, [0, tipY, 0])];
  const hw = interp([...prof.map(([y, w]) => [y, w]), [tipY, 0.05]]);
  m.mesh('blade', loft(rings, { capEnd: false }), { mat: 'steel', info: { hw, base: prof[0][0], ...info } });
};
const bar = (m, name, rings, mat = 'brass') => m.mesh(name, loft(rings.map(([z, hx, hy, yc]) => octRingZ(z, hx, hy, yc))), { mat });
const mirrorZ = (half) => [...half.map(([z, ...r]) => [-z, ...r]), ...half.slice().reverse().map(([z, ...r]) => [z, ...r])];

// ---------- the weapons ----------
const models = {};

models.dagger = (m) => {
  m.group('blade', () => blade(m, [[5.2, 1.5, 0.5], [7.2, 1.7, 0.52], [14.5, 1.55, 0.46], [21, 0.72, 0.3]], 25, diamondRing, { style: 'diamond', glints: [16] }));
  m.group('hilt', () => {
    m.cube('guard_block', [-0.8, 4.3, -1.3], [0.8, 6.3, 1.3], { mat: 'brass' });
    bar(m, 'quillons', mirrorZ([[4.5, 0.72, 0.72, 6.0], [3.6, 0.55, 0.55, 5.6], [1.2, 0.6, 0.6, 5.3]]));
    m.mesh('grip', lathe([[-3.2, 1.0], [0.6, 1.2], [4.6, 1.05]]), { mat: 'leather' });
    m.mesh('pommel', lathe([[-6.3, 0.5], [-5.9, 1.3], [-4.3, 1.5], [-3.3, 1.0]]), { mat: 'brass' });
  });
};

models.sword = (m) => {
  m.group('blade', () => blade(m, [[7.5, 2.15, 0.56], [9.5, 2.1, 0.56], [36, 1.85, 0.5], [41, 1.05, 0.36]], 45, hexRing,
    { style: 'hex', fuller: [9.5, 33, 0.72], glints: [24, 37] }));
  m.group('hilt', () => {
    m.cube('guard_block', [-0.95, 6, -1.7], [0.95, 8.4, 1.7], { mat: 'brass' });
    bar(m, 'crossguard', mirrorZ([[6.6, 0.95, 0.95, 6.35], [5.7, 0.72, 0.68, 6.65], [2, 0.8, 0.75, 7.1]]));
    m.mesh('grip', lathe([[-4, 1.1], [1, 1.3], [6, 1.15]]), { mat: 'leather' });
    m.mesh('pommel', lathe([[-7.8, 0.7, 0.8], [-7.3, 1.15, 2.0], [-5.6, 1.25, 2.2], [-4.4, 1.0, 1.5], [-3.9, 0.9, 1.1]]), { mat: 'brass' });
  });
};

models.longsword = (m) => {
  m.group('blade', () => blade(m, [[9.5, 2.35, 0.6], [12.5, 2.3, 0.6], [55, 2.0, 0.52], [60.5, 1.15, 0.38]], 64.5, hexRing,
    { style: 'hex', fuller: [12.5, 50, 0.8], glints: [33, 53] }));
  m.group('hilt', () => {
    m.cube('guard_block', [-1.15, 8, -2.3], [1.15, 10.8, 2.3], { mat: 'brass' });
    bar(m, 'crossguard', mirrorZ([[9.4, 0.7, 0.7, 8.25], [8.8, 1.15, 1.15, 8.35], [7.9, 0.72, 0.72, 8.65], [2.2, 0.95, 0.85, 9.45]]));
    m.mesh('collar', lathe([[6.8, 1.35], [8.1, 1.45]]), { mat: 'brass' });
    m.mesh('grip', lathe([[-9, 1.2], [-1, 1.42], [6.8, 1.25]]), { mat: 'leather' });
    m.mesh('pommel', lathe([[-14.6, 0.5], [-14.1, 1.4], [-12.6, 2.3], [-11, 2.1], [-9.8, 1.4], [-9, 1.1]]), { mat: 'brass' });
  });
};

models.mace = (m) => {
  m.group('head', () => {
    m.mesh('core', lathe([[27.4, 1.55], [29.2, 2.5], [35.2, 2.5], [37, 1.6], [38.2, 0.8], [39.6, 0]]), { mat: 'iron' });
    // One flange, repeated round the core by rotation so it can be edited once and re-duplicated.
    const prof = [[27.8, 2.0], [30.2, 5.0], [33.8, 5.5], [37.2, 4.0], [38.3, 2.0]];
    const side = (x) => prof.map(([y, r]) => [x, y, r]);
    const flange = loft([side(-0.45), side(0.45)], { caps: [[0, 1, 2, 3], [0, 3, 4]] });
    for (let k = 0; k < 6; k++) m.mesh(`flange_${k + 1}`, flange, { mat: 'iron', rotation: [0, k * 60, 0] });
    m.mesh('collar', lathe([[25.4, 1.35], [26.4, 1.7], [27.6, 1.7]]), { mat: 'iron' });
  });
  m.group('haft', () => {
    m.mesh('shaft', lathe([[6.2, 1.15], [25.6, 1.05]]), { mat: 'wood' });
    m.mesh('ring', lathe([[5, 1.45], [6.2, 1.45]]), { mat: 'iron' });
    m.mesh('grip', lathe([[-6.6, 1.25], [5, 1.3]]), { mat: 'leather' });
    m.mesh('pommel', lathe([[-9, 0.6], [-8.6, 1.6], [-7.2, 1.7], [-6.6, 1.25]]), { mat: 'iron' });
  });
};

models.spear = (m) => {
  m.group('head', () => {
    blade(m, [[40.8, 0.9, 0.75], [42.5, 2.3, 0.72], [46, 3.0, 0.6], [51.5, 1.9, 0.42]], 56.5, diamondRing, { style: 'diamond', glints: [48] });
    m.mesh('socket', lathe([[35, 1.2], [40.5, 0.95], [41.6, 0.8]]), { mat: 'iron' });
    m.mesh('binding', lathe([[36.2, 1.32], [38.8, 1.25]]), { mat: 'cord' });
  });
  m.group('shaft', () => {
    m.mesh('shaft', lathe([[-53, 1.0], [36, 0.95]]), { mat: 'wood' });
    m.mesh('grip', lathe([[-5, 1.22], [7, 1.22]]), { mat: 'leather' });
    m.mesh('butt', lathe([[-58, 0.45], [-57.3, 1.2], [-53.5, 1.15], [-53, 0.95]]), { mat: 'iron' });
  });
};

models.axe = (m) => {
  m.group('head', () => {
    // Bearded bit, sectioned from the eye out to the edge. Each column: half-thickness, then
    // [z, y] for the top, middle and bottom of the profile.
    const cols = [
      [1.3, [-1.2, 42.4], [-1.2, 38.5], [-1.2, 34.6]],
      [1.1, [-4.5, 42.0], [-4.5, 38.5], [-4.5, 35.2]],
      [0.9, [-8.0, 42.4], [-8.2, 37.5], [-7.6, 33.0]],
      [0.72, [-11.2, 43.4], [-11.8, 36], [-10.2, 28.6]],
      [0.48, [-14.2, 44.8], [-15.2, 35.5], [-12.6, 25.8]],
      [0.14, [-15.6, 45.6], [-16.7, 35.5], [-13.8, 24.8]],
    ];
    const rings = cols.map(([t, a, b, c]) => [[t, a[1], a[0]], [t, b[1], b[0]], [t, c[1], c[0]], [-t, c[1], c[0]], [-t, b[1], b[0]], [-t, a[1], a[0]]]);
    m.mesh('bit', loft(rings, { caps: [[0, 1, 4, 5], [1, 2, 3, 4]] }), { mat: 'axeBit' });
    m.mesh('spike', loft([rectRingZ(1.2, 1.05, 2.0, 38.4), rectRingZ(4.6, 0.7, 1.1, 38.2), apex(4, [0, 37.6, 7.6])], { capEnd: false }), { mat: 'iron' });
    m.mesh('eye', lathe([[32.5, 1.65], [33.5, 1.95], [42.5, 1.95], [43.5, 1.65]]), { mat: 'iron' });
    for (const s of [-1, 1]) {
      const x0 = s * 1.12, x1 = s * 1.5;
      m.cube(`langet_${s < 0 ? 'l' : 'r'}`, [Math.min(x0, x1), 25.5, -0.55], [Math.max(x0, x1), 32.6, 0.55], { mat: 'iron' });
      m.cube(`rivet_${s < 0 ? 'l' : 'r'}`, [Math.min(s * 1.45, s * 1.8), 28.4, -0.35], [Math.max(s * 1.45, s * 1.8), 29.1, 0.35], { mat: 'brass' });
    }
  });
  m.group('haft', () => {
    m.mesh('shaft', lathe([[4.5, 1.3], [44.5, 1.2]]), { mat: 'wood' });
    m.mesh('top_cap', lathe([[44.5, 1.35], [45.8, 1.3], [46.4, 0.8]]), { mat: 'iron' });
    m.mesh('grip', lathe([[-7.6, 1.35], [4.5, 1.4]]), { mat: 'leather' });
    m.mesh('end_cap', lathe([[-10, 0.7], [-9.5, 1.55], [-8.2, 1.55], [-7.6, 1.3]]), { mat: 'iron' });
  });
};

models.hammer = (m) => {
  m.group('head', () => {
    const head = [[2.4, 3.0, 3.1], [-0.8, 3.2, 3.3], [-2.6, 2.5, 2.7], [-7.6, 3.3, 3.5], [-8.9, 3.7, 3.9], [-9.8, 3.1, 3.3]];
    m.mesh('head', loft(head.map(([z, hx, hy]) => octRingZ(z, hx, hy, 46)), { mat: (i) => (i === 'end' ? 'hammerFace' : 'iron') }), { mat: 'iron' });
    m.mesh('beak', loft([octRingZ(2.2, 1.9, 2.3, 46), octRingZ(5.5, 1.4, 1.6, 45.6), octRingZ(9.5, 0.8, 0.9, 44.4), apex(8, [0, 42.6, 13.8])], { capEnd: false }), { mat: 'iron' });
    m.mesh('top_spike', loft([latheRing(49, 1.4, 1.4, 4, Math.PI / 4), latheRing(51, 1.0, 1.0, 4, Math.PI / 4), apex(4, [0, 56, 0])], { capEnd: false }), { mat: 'iron' });
    for (const [name, from, to, rf, rt] of [
      ['langet_e', [1.2, 33, -0.5], [1.6, 42.8, 0.5], [1.5, 35.2, -0.3], [1.85, 35.9, 0.3]],
      ['langet_w', [-1.6, 33, -0.5], [-1.2, 42.8, 0.5], [-1.85, 35.2, -0.3], [-1.5, 35.9, 0.3]],
      ['langet_s', [-0.5, 33, 1.2], [0.5, 42.8, 1.6], [-0.3, 35.2, 1.5], [0.3, 35.9, 1.85]],
      ['langet_n', [-0.5, 33, -1.6], [0.5, 42.8, -1.2], [-0.3, 35.2, -1.85], [0.3, 35.9, -1.5]],
    ]) {
      m.cube(name, from, to, { mat: 'iron' });
      m.cube(name.replace('langet', 'rivet'), rf, rt, { mat: 'brass' });
    }
  });
  m.group('haft', () => {
    m.mesh('shaft', lathe([[5, 1.35], [44, 1.25]]), { mat: 'wood' });
    m.mesh('grip', lathe([[-8.5, 1.4], [5, 1.45]]), { mat: 'leather' });
    m.mesh('pommel', lathe([[-11, 0.8], [-10.5, 1.75], [-9, 1.75], [-8.5, 1.4]]), { mat: 'iron' });
  });
};

/** Model name -> () => Model. */
export const weapons = Object.fromEntries(Object.entries(models).map(([name, fill]) => [name, () => {
  const m = new Model(name, { materials: MAT });
  fill(m);
  return m;
}]));
