// The doors out of the bosses' lairs (the arenas' boss doors: see src/dungeon/arenas.js), named door_boss_<style> for
// the theme beyond them, whose door each is: where one theme gives way to the next, the next one's door, chained shut
// with a boss's lock, which only the boss key its boss leaves opens. See doorkit.mjs for how doors go together.
import { defineModel, revolve, tube, noise3, ramp } from './lib.mjs';
import { P, patches } from './materials.mjs';
import { bothFaces } from './doorkit.mjs';
import { MATS as CATACOMB_MATS, oakDoor, chainRun, skull } from './catacombs.mjs';
import { MATS as CAVE_MATS, timberDoor } from './caves.mjs';

const LOCK_PAL = {
  // The Maledicted Ooze's taint, glowing, and its filth, seeped under its door.
  taint: P('#4a0a3a', '#7a1462', '#b0228c', '#e040c0', '#ff7ae0', '#ffd0f4'),
  ooze: P('#0e0316', '#1c0729', '#2c0c3e', '#3e1456', '#55206f', '#8a4aa6'),
  // The Forgotten Jailer's sickly green light.
  grave: P('#2a3606', '#4a600c', '#78961a', '#a8c834', '#d4ee70', '#f4ffc8'),
};

// What the lock is made of, wherever it's hung: the Catacombs' chains, padlock and skull, and its keyhole's glow.
const LOCK_MATS = {
  bone: CATACOMB_MATS.bone,
  skull: CATACOMB_MATS.skull,
  chainRun: CATACOMB_MATS.chainRun,
  lockIron: CATACOMB_MATS.lockIron,
  taintGlow: (c) => ramp(LOCK_PAL.taint, 0.6 + 0.3 * patches(c.p, 970, 1), c.ax, c.ay),
  graveGlow: (c) => ramp(LOCK_PAL.grave, 0.6 + 0.3 * patches(c.p, 973, 1), c.ax, c.ay),
  ooze(c) {
    const { p } = c;
    let v = 0.4 + 0.25 * patches(p, 971, 0.2) + 0.2 * c.n.y;
    if (noise3(p.x * 0.3, 0, p.z * 0.3, 972) > 0.7) v = 0.85; // a wet glint
    return ramp(LOCK_PAL.ooze, v, c.ax, c.ay);
  },
};

/**
 * A boss's lock, on both faces of a door: two heavy chains crossed over it from staples high and low on its jambs
 * (whose faces stand `jamb` px out from the middle), meeting at a great padlock, a skull on its face and its keyhole
 * glowing with its boss's light (`glow`, a glowing material). `zs` is the door builder's (see oakDoor).
 */
function bossLock(m, zs, glow, { jamb = 18 } = {}) {
  bothFaces((s) => {
    const side = s > 0 ? 'front' : 'back', [b0, b1] = zs(s, 9, 16);
    for (const [x0, y0, x1, y1, k] of [[-58, 140, 58, 24, 1], [58, 140, -58, 24, 2]]) {
      for (const [x, y] of [[x0, y0], [x1, y1]]) {
        m.mesh(`staple_${k}_${x < 0 ? 'left' : 'right'}_${y > 80 ? 'top' : 'bottom'}_${side}`,
          tube([[x - 3, y - 3, s * jamb], [x - 3, y + 3, s * (jamb + 2)], [x + 3, y + 3, s * (jamb + 2)], [x + 3, y - 3, s * jamb]], { half: 1.1, side: [0, 0, 1] }), { mat: 'rustyIron' });
      }
      // Each chain from its upper staple down to the padlock, and on from it to the lower one.
      chainRun(m, (i) => `chain_${k}_upper_${i}_${side}`, [x0, y0, jamb + 1], [0, 82, 12], s, { sag: 4, runs: 4, w: 2.6 });
      chainRun(m, (i) => `chain_${k}_lower_${i}_${side}`, [0, 82, 12], [x1, y1, jamb + 1], s, { sag: 4, runs: 4, w: 2.6 });
    }
    m.cube(`padlock_${side}`, [-9, 66, b0], [9, 86, b1], { mat: 'lockIron', info: { kx: 0, ky: 200 } });
    m.mesh(`padlock_shackle_${side}`, tube([[-6, 85, s * 12.5], [-6, 93, s * 12.5], [0, 97, s * 12.5], [6, 93, s * 12.5], [6, 85, s * 12.5]], { half: 1.6, side: [0, 0, 1] }), { mat: 'rustyIron' });
    skull(m, `padlock_skull_${side}`, [0, 79.5, s * 16.2], { s: 7, rot: s > 0 ? [0, 0, 0] : [0, 180, 0] });
    const [g0, g1] = zs(s, 16, 16.6);
    m.cube(`keyhole_${side}`, [-1.2, 67.5, g0], [1.2, 72.5, g1], { mat: glow });
  });
}

export const bossDoors = {
  door_boss_catacombs: defineModel('door_boss_catacombs', { ...CATACOMB_MATS, ...LOCK_MATS }, (m) => {
    // Out of the Maledicted Ooze's lair, at the bottom of the Sewers: the Catacombs' door under its skull-keyed arch,
    // its keyhole glowing with the ooze's magenta taint, which has seeped out under the door and pools on the floor
    // before it on its side (-z).
    oakDoor(m, (zs) => bossLock(m, zs, 'taintGlow'), () => {
      m.mesh('ooze', revolve([[0, 0], [30, 0], [27, 0.8], [12, 1.3], [0, 1.5]], { sides: 10 }), { mat: 'ooze', origin: [6, 0, -27] });
      m.mesh('ooze_2', revolve([[0, 0], [14, 0], [12, 0.7], [0, 1.1]], { sides: 8 }), { mat: 'ooze', origin: [-30, 0, -22] });
    });
  }, { density: 1, glow: ['taintGlow'], double: ['chainRun', 'ooze'] }),

  door_boss_caves: defineModel('door_boss_caves', { ...CAVE_MATS, ...LOCK_MATS }, (m) => {
    // Out of the Forgotten Jailer's cell block, at the bottom of the Catacombs: the Caves' door of odd boards in its
    // leaning mine timbers, its keyhole glowing the sickly green of his lantern.
    timberDoor(m, (zs) => bossLock(m, zs, 'graveGlow', { jamb: 13 }));
  }, { density: 1, glow: ['graveGlow'], double: ['chainRun'] }),
};
