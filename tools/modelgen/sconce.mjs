// The wall sconce: a wrought-iron bowl of burning coals on a twisted arm. Origin = where it meets the wall,
// +z (south) = out of the wall, +y up. An empty group "flame" marks where the game attaches the flame effect.
import { Model, loft, lathe, revolve, tube } from './lib.mjs';
import { MAT, clamp01 } from './materials.mjs';

const BOWL_Z = 19; // how far the bowl stands out from the wall
const COALS_Y = 6.6; // height of the coal surface

export function sconce() {
  const m = new Model('sconce', {
    materials: MAT,
    sheets: [{ name: 'sconce', mode: 'default' }, { name: 'sconce_embers', mode: 'emissive' }],
    sheetOf: { embers: 1 },
  });
  const bowl = [0, 0, BOWL_Z];

  m.group('mount', () => {
    // Hexagonal plate against the wall, riveted top and bottom.
    const hex = (z) => [[0, 4, z], [3.6, 0.8, z], [3.6, -13.6, z], [0, -18, z], [-3.6, -13.6, z], [-3.6, 0.8, z]];
    m.mesh('plate', loft([hex(0), hex(0.9)]), { mat: 'rustyIron' });
    m.cube('rivet_top', [-0.6, 1.0, 0.9], [0.6, 2.2, 1.6], { mat: 'iron' });
    m.cube('rivet_bottom', [-0.6, -15.4, 0.9], [0.6, -14.2, 1.6], { mat: 'iron' });

    // Arm: out from the plate as a twisted square bar (the twist is painted on), then bending up under the bowl.
    const R = 5.5, bendZ = BOWL_Z - R, armY = -9;
    const path = [];
    for (let z = 0.5; z < bendZ; z += 2) path.push([0, armY, z]);
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      path.push([0, armY + R - R * Math.cos(a), bendZ + R * Math.sin(a)]);
    }
    path.push([0, -1.8, BOWL_Z]);
    m.mesh('arm', tube(path, { half: 0.9 }), { mat: 'rustyIron', info: { twist: { yc: armY, until: bendZ, pitch: 3.4 } } });
    m.mesh('brace', tube([[0, -15.2, 0.5], [0, -9.8, 8]], { half: 0.6 }), { mat: 'rustyIron' });
  });

  m.group('bowl', () => {
    // Flared bowl, walked out across the base, up the outside, over the lip and down onto the coals.
    const profile = [[0, -1.9], [2.2, -1.9], [3.4, 0.2], [5.3, 3.8], [6.5, 6.7], [6.6, 7.7], [5.6, 7.8], [4.9, 6.0], [0, COALS_Y]];
    const coals = profile.length - 2;
    m.mesh('bowl', revolve(profile, { mat: (i) => (i === coals ? 'embers' : 'rustyIron') }), {
      origin: bowl,
      // The coals glow hottest in the middle.
      info: { heat: (p) => clamp01(1 - Math.hypot(p.x, p.z - BOWL_Z) / 4.8) },
    });
    m.mesh('knop', lathe([[-3.1, 1.3], [-2.4, 1.7], [-1.6, 1.7], [-1.2, 1.3]]), { mat: 'rustyIron', origin: bowl });
    // One prong on the rim, repeated round it by rotation.
    const prong = tube([[6.1, 7.1, 0], [7.6, 10.3, 0]], { half: (f) => 0.45 - 0.38 * f });
    for (let k = 0; k < 6; k++) m.mesh(`prong_${k + 1}`, prong, { mat: 'rustyIron', origin: bowl, rotation: [0, 30 + k * 60, 0] });
    m.group('flame', undefined, { origin: [0, COALS_Y, BOWL_Z] });
  });
  return m;
}
