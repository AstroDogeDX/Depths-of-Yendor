// Body armour, one model per type, displayed as if worn by an unseen body facing +z (south).
// Origin = the middle of the chest, where the item bobs and spins.
import { defineModel, loft, lathe, latheRing, noise3, rand, fract, ramp } from './lib.mjs';
import { MAT, PAL, P, clamp01, patches, bevel } from './materials.mjs';

const ARMOR_PAL = {
  leather: P('#2e1c0f', '#442a17', '#5c3a20', '#744a29', '#8a5b33', '#a06e41'),
  studded: P('#281a0e', '#3b2715', '#51351d', '#674425', '#7c532e', '#90643a'),
  mail: P('#23272c', '#383e45', '#50575f', '#6a727b', '#868f98', '#a5aeb6', '#c4cbd1'),
  plate: P('#262c34', '#3a424c', '#535d68', '#707b87', '#8f9aa5', '#b2bcc5', '#d6dde3', '#f2f5f7'),
  belt: P('#1a110a', '#2a1b10', '#3b2716', '#4c341e'),
  inside: P('#0e0a07', '#18120c', '#231a12'),
};

// Angle round the body, 0 at the front.
const around = (p) => Math.atan2(p.x, p.z);

const MATS = {
  ...MAT,
  // Boiled leather: stitched down the front, darker toward its edges, with a couple of moulded panel lines.
  leatherArmor(c) {
    const { p, n } = c;
    let v = 0.5 + 0.14 * patches(p, 201, 0.35) + bevel(c, 0.18);
    if (n.z > 0.4 && Math.abs(Math.abs(p.x) - 0.5) < 0.2 && fract(p.y * 0.8) < 0.5) v = 0.85; // stitches
    if (Math.abs(p.y + 4) < 0.25 || Math.abs(p.y - 3) < 0.25) v -= 0.2;
    return ramp(ARMOR_PAL.leather, v, c.ax, c.ay);
  },
  // Leather set with rows of iron studs.
  studded(c) {
    const { p } = c;
    let v = 0.46 + 0.12 * patches(p, 202, 0.35) + bevel(c, 0.15);
    const row = Math.round(p.y / 2.2), col = around(p) * 3 + (row % 2) * 0.5;
    const dy = p.y - row * 2.2, dc = (col - Math.round(col)) * 3;
    if (dy * dy + dc * dc < 0.35) return ramp(PAL.iron, dy > 0 ? 0.85 : 0.55, c.ax, c.ay);
    if (Math.abs(dc) < 0.5 && dy < -0.4 && dy > -0.9) v -= 0.2; // shadow under each stud
    return ramp(ARMOR_PAL.studded, v, c.ax, c.ay);
  },
  // Mail: a fine pattern of little lit rings, staggered row by row.
  mail(c) {
    const { p } = c;
    const row = c.ay >> 1, col = (c.ax + (row & 1)) >> 1;
    const inRing = ((c.ax + (row & 1)) & 1) === 0;
    let v = 0.48 + 0.1 * patches(p, 203, 0.4) + (inRing ? ((c.ay & 1) ? -0.15 : 0.2) : -0.05) + bevel(c, 0.1);
    if (rand(col, row, 204) > 0.97) v -= 0.2;
    return ramp(ARMOR_PAL.mail, v, c.ax, c.ay);
  },
  // Splint: vertical steel strips riveted over mail.
  splint(c) {
    const { p } = c;
    const f = fract((around(p) / (2 * Math.PI)) * 16);
    if (f < 0.72 && p.y > -12.5 && p.y < 6) {
      let v = 0.55 + 0.25 * (0.36 - Math.abs(f - 0.36)) + 0.08 * patches(p, 205, 0.4);
      if (Math.abs(f - 0.36) < 0.12 && (Math.abs(p.y + 11.5) < 0.4 || Math.abs(p.y - 5) < 0.4)) v = 0.9; // rivets
      return ramp(ARMOR_PAL.plate, v, c.ax, c.ay);
    }
    return MATS.mail(c);
  },
  // Plate: polished steel with a sheen down each side, a bright ridge down the front and gilded edges.
  plate(c) {
    const { p, n } = c;
    if (p.y > 9.2 || Math.abs(p.y + 12.9) < 0.35 || (c.info.trim && p.y < c.info.trim)) {
      return ramp(PAL.gold, 0.55 + 0.25 * n.y + 0.1 * patches(p, 206, 0.8), c.ax, c.ay);
    }
    let v = 0.5 + 0.1 * patches(p, 207, 0.25) + bevel(c, 0.18);
    if (Math.cos(around(p) - 0.9) > 0.9) v += 0.25; // sheen
    if (n.z > 0.3 && Math.abs(p.x) < 0.45) v += 0.3; // the ridge
    return ramp(ARMOR_PAL.plate, v, c.ax, c.ay);
  },
  belt(c) {
    const { p, n } = c;
    if (n.z > 0.5 && Math.abs(p.x) < 1.3) return ramp(PAL.brass, 0.6 + 0.2 * n.y + (Math.abs(p.x) < 0.5 ? -0.25 : 0), c.ax, c.ay);
    return ramp(ARMOR_PAL.belt, 0.5 + 0.2 * patches(p, 208, 0.8), c.ax, c.ay);
  },
  // The hollow inside, seen through the neck and hem.
  inside(c) {
    return ramp(ARMOR_PAL.inside, 0.3 + 0.3 * patches(c.p, 209, 0.5), c.ax, c.ay);
  },
};

// Torso rings, waist to shoulders: [y, half width, half depth]. Ring vertex 2 points straight forward (+z).
const TORSO = [[-13, 9.2, 5.4], [-9.5, 8.6, 5.0], [-4, 9.4, 5.4], [2, 10.6, 5.9], [6.5, 11, 6.0], [9, 9.8, 5.6], [10.5, 6.2, 4.2]];
const ring8 = (y, rx, rz, ridge = 0) => latheRing(y, rx, rz, 8, 0).map(([x, yy, z], k) => [x, yy, k === 2 ? z + ridge : z]);

function armor(type, { skin, ridge = 0, shoulders, sleeves, skirt, belt = true, trim }) {
  return defineModel(`armor_${type}`, MATS, (m) => {
    const ridgeAt = (i) => (i >= 1 && i <= 4 ? ridge : 0);
    m.mesh('cuirass', loft(TORSO.map(([y, rx, rz], i) => ring8(y, rx, rz, ridgeAt(i))), {
      mat: (seg) => (seg === 'start' || seg === 'end' ? 'inside' : skin),
    }), { info: { trim } });
    if (belt) m.mesh('belt', lathe([[-11.6, 9.4, 5.6], [-9.8, 9.1, 5.4]], { phase: 0 }), { mat: 'belt' });
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'left' : 'right';
      if (shoulders) {
        // A domed pauldron over each shoulder, tipped outward; big ones are layered.
        const [r, layers] = shoulders;
        for (let l = 0; l < layers; l++) {
          const k = 1 - l * 0.22;
          m.mesh(`pauldron_${side}${layers > 1 ? `_${l + 1}` : ''}`, lathe([[-2.2 * k, r * k], [0, r * k * 1.05], [1.6 * k, r * k * 0.85], [2.6 * k, r * k * 0.45], [3 * k, 0]], {
            mat: (seg) => (seg === 'start' ? 'inside' : skin),
          }), { mat: skin, origin: [s * 10.2, 8.2 - l * 2.2, 0], rotation: [0, 0, -s * 24] });
        }
      }
      if (sleeves) {
        m.mesh(`sleeve_${side}`, lathe([[-5, 2.5], [2, 3.0]], { mat: (seg) => (seg === 'start' || seg === 'end' ? 'inside' : skin) }),
          { mat: skin, origin: [s * 11.6, 4.6, 0], rotation: [0, 0, -s * 14] });
      }
    }
    if (skirt) {
      // Tassets flaring below the waist.
      m.mesh('tassets', loft([ring8(-12.6, 9.3, 5.5), ring8(-17.5, 10.8, 6.6)], {
        capStart: false,
        mat: (seg) => (seg === 'end' ? 'inside' : skin),
      }), { info: { trim } });
    }
  });
}

export const armors = {
  armor_leather: armor('leather', { skin: 'leatherArmor', shoulders: [3.4, 1] }),
  armor_studded: armor('studded', { skin: 'studded', shoulders: [3.6, 1] }),
  armor_chain: armor('chain', { skin: 'mail', sleeves: true }),
  armor_splint: armor('splint', { skin: 'splint', shoulders: [4.0, 1], skirt: true }),
  armor_plate: armor('plate', { skin: 'plate', ridge: 1.1, shoulders: [4.6, 2], skirt: true, belt: false, trim: -16.8 }),
};
