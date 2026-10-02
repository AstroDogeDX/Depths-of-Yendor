// Shields (SHIELDS in src/items/defs.js), held in your off hand: each is held by its origin, at the grip on its back,
// with its face toward +z; on the floor it lies face up.
import { Model, revolve, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, P } from './materials.mjs';

const OAK = P('#2a1a0e', '#3c2716', '#52361f', '#6a4628', '#7e5732', '#93683d', '#a97c4a');

const mats = {
  ...MAT,
  // Oak boards side by side, a dark seam between each, the grain running along them; the back a shade darker than the
  // face, and a nick here and there. (Painted the same whichever way the board is turned: its boards run along y.)
  boards(c) {
    const { p, n } = c;
    const u = p.x + 100, plank = Math.floor(u / 6.5), f = fract(u / 6.5), along = p.y + p.z;
    let v = 0.42 + 0.16 * (rand(plank, 301) - 0.5) + 0.14 * noise3(p.x * 0.4, along * 0.08, plank, 302);
    if (fract(noise3(p.x * 0.6, along * 0.05, 3, 303) * 5) < 0.12) v -= 0.12;
    if (f < 0.08 || f > 0.95) v = 0.12;
    if (n.y < -0.5 || n.z < -0.5) v -= 0.08;
    if (rand(c.ax, c.ay, 304) > 0.985) v -= 0.18;
    return ramp(OAK, v, c.ax, c.ay);
  },
};

/**
 * The wooden shield: a round board of oak, an iron rim and boss, rivets round its face, and an upright leather grip
 * behind.
 */
export function woodenShield() {
  const R = 20, Z = 2.6; // the board's radius, and its middle, in front of the grip
  const m = new Model('wooden_shield', { materials: mats });
  // (Turned up from lying flat, round y, to face +z.)
  const facing = { origin: [0, 0, Z], rotation: [90, 0, 0] };
  m.mesh('board', revolve([[0, -1], [R, -1], [R, 1], [0, 1]], { sides: 16 }), { mat: 'boards', ...facing });
  m.mesh('rim', revolve([[R - 1.4, -1.6], [R + 0.8, -1.6], [R + 0.8, 1.6], [R - 1.4, 1.6]], { sides: 16 }), { mat: 'iron', ...facing });
  m.mesh('boss', revolve([[0, 1], [5, 1], [4.6, 2.6], [3.4, 3.8], [1.6, 4.4], [0, 4.6]], { sides: 12 }), { mat: 'iron', ...facing });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * (R - 3.4), y = Math.sin(a) * (R - 3.4);
    m.cube(`rivet_${k + 1}`, [x - 0.7, y - 0.7, Z + 1], [x + 0.7, y + 0.7, Z + 1.6], { mat: 'iron' });
  }
  m.cube('grip', [-1.3, -5, 0], [1.3, 5, Z - 1], { mat: 'leather' }); // (upright, along the boards)
  return m;
}
