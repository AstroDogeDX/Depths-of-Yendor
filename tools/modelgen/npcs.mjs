// Characters who aren't monsters. Rigged like the monsters: moving parts are groups pivoting at their joints.
// Origin = on the floor between the feet, facing +z (south).
import { defineModel, loft, lathe, revolve, tube, apex, latheRing, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, clamp01, patches, bevel } from './materials.mjs';

const NPC_PAL = {
  cloak: P('#0c0a16', '#141024', '#1d1834', '#272044', '#322a56', '#3e3468'),
  leather: P('#1e120a', '#2e1c10', '#402818', '#533521', '#66432a', '#7a5234'),
  rope: P('#3a2c18', '#5a4526', '#7a6036', '#997a48'),
  wood: PAL.wood,
  eyes: P('#5a4004', '#a07808', '#e0b820', '#ffe070', '#fff8d0'),
  black: P('#000000', '#06050a'),
};

const MATS = {
  ...MAT,
  // Deep indigo cloak, folds running down it, gold trim round the hem and the hood's edge.
  cloak(c) {
    const { p, info } = c;
    if (info.trim && info.trim.some(([lo, hi]) => p.y > lo && p.y < hi)) return ramp(PAL.gold, 0.55 + 0.2 * c.n.y + ((c.ax + c.ay) % 3 ? 0 : -0.15), c.ax, c.ay);
    let v = 0.46 + 0.14 * patches(p, 700, 0.3) + ((c.ax + c.ay) % 4 === 0 ? -0.05 : 0);
    if (fract(Math.atan2(p.z, p.x) * 1.4 + noise3(p.x * 0.1, p.y * 0.05, p.z * 0.1, 701) * 0.5) < 0.1) v -= 0.16; // folds
    return ramp(NPC_PAL.cloak, v, c.ax, c.ay);
  },
  void: (c) => ramp(NPC_PAL.black, 0, c.ax, c.ay),
  eyes: (c) => ramp(NPC_PAL.eyes, 0.6 + 0.3 * Math.max(0, c.n.z), c.ax, c.ay),
  // The purse: stitched leather gathered at a drawstring neck.
  purse(c) {
    const { p } = c;
    let v = 0.48 + 0.16 * patches(p, 710, 0.8) + 0.1 * c.n.y;
    if (fract(Math.atan2(p.z, p.x) * 1.9) < 0.08) v -= 0.2; // gathers
    return ramp(NPC_PAL.leather, v, c.ax, c.ay);
  },
  rope: (c) => ramp(NPC_PAL.rope, fract((c.p.x + c.p.y + c.p.z) * 1.5) < 0.4 ? 0.3 : 0.65, c.ax, c.ay),
  stool: (c) => ramp(NPC_PAL.wood, 0.45 + 0.16 * patches(c.p, 720, 0.4) + bevel(c, 0.15), c.ax, c.ay),
};

const pair = (fn) => [-1, 1].forEach((s) => fn(s, s < 0 ? 'left' : 'right'));

export const npcs = {
  shopkeeper: defineModel('shopkeeper', MATS, (m) => {
    // The merchant: a little hooded figure in an indigo cloak, standing on a stool behind the counter so it
    // can see over it, eyes glinting in the dark of its hood and a purse of coins in one hand.
    const S = 30; // stool height: the figure stands on it
    m.mesh('stool', revolve([[0, 0], [9, 0], [9, 2], [7, 4], [7, S - 3], [10, S - 2], [10, S], [0, S]], { sides: 8 }), { mat: 'stool' });
    m.group('body', () => {
      m.mesh('cloak', revolve([[0, S], [15, S], [14, S + 16], [11.5, S + 36], [9, S + 46], [4, S + 50], [0, S + 50]], { sides: 10 }),
        { mat: 'cloak', info: { trim: [[S, S + 2.5]] } });
      m.mesh('belt', lathe([[S + 24, 12.6], [S + 26.5, 12.2]], { sides: 10 }), { mat: 'rope' });
      m.group('head', () => {
        const H = S + 48;
        // A deep, pointed hood with a dark opening and two glinting eyes; its tip droops backward.
        m.mesh('hood', revolve([[0, H - 2], [9, H - 2], [12, H + 5], [12, H + 13], [9, H + 19], [4, H + 23], [0, H + 24]], { sides: 10 }),
          { mat: 'cloak', info: { trim: [[H - 2, H]] } });
        m.mesh('hood_tip', tube([[0, H + 22, -1], [0, H + 27, -4], [0, H + 26, -10]], { half: (f) => 3.2 - 2.9 * f, sides: 6 }), { mat: 'cloak' });
        m.mesh('face', revolve([[0, -7], [8, -5], [9, 0], [7, 5], [0, 7]], { sides: 8 }), { mat: 'void', origin: [0, H + 9, 5] });
        pair((s, side) => m.cube(`eye_${side}`, [s * 3.4 - 1.2, H + 9, 12.6], [s * 3.4 + 1.2, H + 11, 13.6], { mat: 'eyes' }));
      }, { origin: [0, S + 46, 0] });
      pair((s, side) => m.group(`arm_${side}`, () => {
        // Sleeves reaching forward; the right hand holds up the purse.
        const x = s * 11;
        // The purse is held up high enough to show over the shop counter.
        const hand = s > 0 ? [7, S + 44, 13] : [5, S + 28, 9];
        m.mesh(`sleeve_${side}`, tube([[x, S + 42, 0], [s * 12, S + 34, 5], hand], { half: (f) => 3.6 - 1.2 * f, sides: 6 }), { mat: 'cloak' });
        m.cube(`hand_${side}`, [hand[0] - 1.8, hand[1] - 2.2, hand[2] - 1], [hand[0] + 1.8, hand[1] + 1.2, hand[2] + 2.6], { mat: 'void' });
        if (s > 0) {
          m.group('purse', () => {
            const [px, py, pz] = [hand[0], hand[1] - 2, hand[2] + 1];
            m.mesh('purse', revolve([[0, -12], [5, -11], [7.5, -7], [7, -3], [3, 0], [0, 0]], { sides: 8 }), { mat: 'purse', origin: [px, py, pz] });
            m.mesh('drawstring', lathe([[-1.2, 3.4], [0.4, 3.4]], { sides: 8 }), { mat: 'rope', origin: [px, py, pz] });
            [[-2, 2], [2.4, -1], [0, -2.6]].forEach(([dx, dz], i) => m.mesh(`coin_${i + 1}`, lathe([[-0.3, 1.8], [0.3, 1.8]], { sides: 6 }),
              { mat: 'gold', origin: [px + dx, py + 0.8, pz + dz], rotation: [70, i * 50, 20] }));
          }, { origin: [hand[0], hand[1], hand[2]] });
        }
      }, { origin: [s * 11, S + 42, 0] }));
    }, { origin: [0, S, 0] });
  }, { glow: ['eyes'] }),
};
