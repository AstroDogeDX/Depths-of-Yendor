// The hand lantern you carry in your off hand (hand_lantern; the Caves' wall lantern is another model). Origin = where
// the hand grips, at the top of its bail: the lantern hangs below it. An empty group "flame" marks where the game lights
// its flame, on the burner inside the glass.
import { Model, revolve, tube, noise3, fract, ramp } from './lib.mjs';
import { MAT, P, clamp01 } from './materials.mjs';
import { face } from './stairkit.mjs';

const H = 4; // the corner posts stand H either side of the middle
const TOP = -10.4, BOT = -20; // the glass, from under the cap down to the fount
const FLAME = BOT + 1.2; // the burner's top, where the flame stands

// The glass is drawn additively (black adds nothing), so these are how much light it gives off, not its colour.
const GLASS = P('#0e0602', '#211004', '#3c1d08', '#5f3010', '#874818', '#ad6428', '#d08c44');

const mats = {
  ...MAT,
  // Glass lit from within: brightest about the flame, dimming up toward the cap and out to the corners, with a streak or
  // two of light across it and soot along its top.
  glass(c) {
    const { p, n } = c;
    const u = Math.abs(n.x) > 0.5 ? p.z : p.x; // across the pane
    const d = Math.hypot(u * 0.9, (p.y - (FLAME + 3)) * 0.75);
    let v = 0.82 - d * 0.09 + 0.06 * noise3(p.x * 0.5, p.y * 0.5, p.z * 0.5, 201);
    if (fract((u + p.y * 0.6) * 0.16) < 0.09) v += 0.16; // streaks
    v -= clamp01((p.y - (TOP - 2)) / 2) * 0.3; // soot under the cap
    return ramp(GLASS, v, c.ax, c.ay);
  },
};

export function handLantern() {
  const m = new Model('hand_lantern', {
    materials: mats,
    sheets: [{ name: 'hand_lantern', mode: 'default' }, { name: 'hand_lantern_glass', mode: 'additive' }],
    sheetOf: { glass: 1 },
  });
  // The bail: a wire arching over the cap, its ends running down into lugs on its slopes (the cap's face is at about
  // y -9 there, so they sink in).
  const arc = Array.from({ length: 9 }, (_, i) => [Math.cos((i / 8) * Math.PI) * 4.6, -7.6 + Math.sin((i / 8) * Math.PI) * 7.2, 0]);
  m.mesh('bail', tube([[4.6, -9.6, 0], ...arc, [-4.6, -9.6, 0]], { half: 0.5, side: [0, 0, 1] }), { mat: 'iron' });
  for (const s of [-1, 1]) m.cube(`lug_${s < 0 ? 'left' : 'right'}`, [s * 4.6 - 0.8, -9.8, -0.8], [s * 4.6 + 0.8, -8.2, 0.8], { mat: 'brass' });
  // A peaked brass cap with a little chimney, over four iron posts and the glass between them.
  m.mesh('cap', revolve([[0, TOP - 0.2], [7.8, TOP - 0.2], [7.8, TOP + 0.8], [1.4, -6.6], [1.4, -5.6], [0, -5.6]], { sides: 4, phase: Math.PI / 4 }), { mat: 'brass' });
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    m.cube(`post_${dx < 0 ? 'l' : 'r'}${dz < 0 ? 'b' : 'f'}`, [dx * H - 0.6, BOT, dz * H - 0.6], [dx * H + 0.6, TOP, dz * H + 0.6], { mat: 'iron' });
  }
  const w = H - 0.6;
  m.mesh('glass', [
    face([[-w, BOT, H], [w, BOT, H], [w, TOP, H], [-w, TOP, H]], [0, 0, 1]),
    face([[-w, BOT, -H], [w, BOT, -H], [w, TOP, -H], [-w, TOP, -H]], [0, 0, -1]),
    face([[H, BOT, -w], [H, BOT, w], [H, TOP, w], [H, TOP, -w]], [1, 0, 0]),
    face([[-H, BOT, -w], [-H, BOT, w], [-H, TOP, w], [-H, TOP, -w]], [-1, 0, 0]),
  ], { mat: 'glass' });
  // A wire guard round the glass, halfway up.
  const y = (TOP + BOT) / 2;
  for (const [a, b] of [[[-H, -H], [H, -H]], [[H, -H], [H, H]], [[H, H], [-H, H]], [[-H, H], [-H, -H]]]) {
    m.mesh(`guard_${a.join('')}_${b.join('')}`, tube([[a[0], y, a[1]], [b[0], y, b[1]]], { half: 0.35 }), { mat: 'iron' });
  }
  // The oil fount it stands on, and the burner inside.
  m.cube('fount', [-H - 0.8, BOT - 2.6, -H - 0.8], [H + 0.8, BOT, H + 0.8], { mat: 'brass' });
  m.cube('foot', [-H, BOT - 3.4, -H], [H, BOT - 2.6, H], { mat: 'iron' });
  m.cube('burner', [-1, BOT, -1], [1, FLAME, 1], { mat: 'brass' });
  m.group('flame', undefined, { origin: [0, FLAME, 0] });
  return m;
}
