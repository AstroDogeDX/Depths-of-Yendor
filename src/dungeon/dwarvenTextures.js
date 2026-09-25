import { RNG } from '../rng.js';
import { rgb, mix, scale, paint, noise } from './texturePaint.js';
import { cobweb } from './catacombTextures.js';

// The Dwarven Ruins' own textures: the halls of a fallen kingdom of red porphyry and gold. Walls of polished
// ashlar under a gilded cornice, a frieze of dwarven knotwork (its gold prised out here and there by looters)
// and a dark panelled dado; floors inlaid in red and cream marble with lines of gold; a coffered vault. All of
// it cracked, sooted and dusty. The rifts the evil below has torn through the floors have raw, broken sides
// veined with a violet glow, and a violet glow far down in them.

const GOLD = ['#4a320c', '#7a5616', '#a87c24', '#d0a238', '#ecc85e', '#fae29a'].map(rgb);
const gold = (v) => GOLD[Math.max(0, Math.min(GOLD.length - 1, Math.round(v * (GOLD.length - 1))))];
const VIOLET = ['#12051c', '#2c0c46', '#4e1a78', '#7a34b0', '#b070e8', '#e0b8ff'].map(rgb);
const JOINT = rgb('#1a0d0a');
const DARK = rgb('#26150f'); // the dark stone of the dado, the frieze's ground and the vault
const DUST = rgb('#6e5e4c');
const BLACK = [0, 0, 0];

/** A few cracks: random walks (wrapping round the edges), as a set of texel indices, wandering down or across. */
function cracks(rng, w, h, n, len, down = true) {
  const out = new Set();
  for (let k = 0; k < n; k++) {
    let x = rng.int(0, w - 1), y = rng.int(0, h - 1);
    for (let s = 0; s < len; s++) {
      out.add(((y % h) + h) % h * w + ((x % w) + w) % w);
      if (down) { x += rng.int(-1, 1); y += rng.chance(0.75) ? 1 : 0; } else { y += rng.int(-1, 1); x += rng.chance(0.75) ? 1 : 0; }
    }
  }
  return out;
}

/** Walls, full height once (64×90, the top row under the vault): cornice, ashlar, frieze, dado. */
function wall(theme) {
  const W = 64, H = 90, rng = new RNG('dwarven:wall');
  const pal = theme.wall.map(rgb), fleck = rgb('#b08272');
  const grain = noise(rng, W, H, 16, 22), soot = noise(rng, W, H, 6, 3), spall = noise(rng, W, H, 5, 7), dust = noise(rng, W, H, 8, 2);
  const crack = cracks(rng, W, H, 5, 20);
  // Three courses of ashlar between the cornice and the frieze, two blocks to a tile, the joints staggered.
  const courses = [[8, 25], [25, 41], [41, 58]];
  const blocks = courses.map(() => [0, 1].map(() => ({ c: rng.pick(pal), k: 0.85 + rng.next() * 0.25 })));
  // Looters have prised the gold out of some of the frieze's knots.
  const looted = Array.from({ length: 4 }, () => rng.chance(0.35));
  return paint(W, H, (x, y) => {
    let c;
    if (y < 8) {
      // The cornice: a gilded moulding, a row of gilt dentils, and a gold fillet above the stone.
      c = [scale(DARK, 0.5), gold(0.8), gold(0.55), scale(DARK, 0.9), null, null, DARK, gold(0.35)][y]
        ?? (x % 4 < 2 ? gold(0.5 - (y - 4) * 0.15) : scale(DARK, 0.6));
    } else if (y < 58) {
      // Polished porphyry ashlar, flecked, lighter toward the top of each block.
      const ci = courses.findIndex(([, y1]) => y < y1), [y0, y1] = courses[ci], ly = y - y0, h = y1 - y0;
      const off = ci % 2 ? 16 : 0, lx = (x + off) % 32, b = blocks[ci][Math.floor(((x + off) % W) / 32)];
      if (ly === 0 || lx === 0) return JOINT;
      let k = b.k * (1.08 - 0.14 * (ly / h)) * (0.9 + grain(x, y) * 0.2);
      if (ly === 1) k *= 1.15;
      if (lx === 1) k *= 1.08;
      if (ly === h - 1) k *= 0.75;
      if (lx === 31) k *= 0.85;
      c = scale(b.c, k);
      const r = rng.next();
      if (r < 0.05) c = scale(c, 0.7);
      else if (r > 0.95) c = mix(c, fleck, 0.45);
      // Where the polished face has spalled away: rougher, darker stone, a lit edge round it.
      const s = spall(x, y);
      if (s > 0.8) c = scale(b.c, 0.6 + rng.next() * 0.12);
      else if (s > 0.78) c = scale(c, 1.2);
    } else if (y < 66) {
      // The frieze: dwarven knots in gold on dark stone, edged with gold.
      const ly = y - 58, lx = x % 16;
      if (ly === 0 || ly === 7) c = gold(0.45);
      else {
        const dx = Math.abs(lx - 7.5), dy = Math.abs(ly - 3.5), s = dx + dy;
        const knot = (s >= 3 && s < 4.2) || s < 1.1 || (dy < 0.6 && dx > 5.5);
        if (!knot) c = scale(DARK, 0.85);
        else c = looted[Math.floor(x / 16)] ? scale(DARK, 0.5) : gold(ly < 3.5 ? 0.75 : 0.5);
      }
    } else {
      // The dado: panels of dark polished stone with gold inlay, a gilded rail above and a skirting below.
      const ly = y - 66, px = x % 32;
      if (ly === 0) c = gold(0.6);
      else if (ly === 1) c = gold(0.35);
      else if (ly === 2) c = JOINT;
      else if (ly >= 22) c = scale(DARK, ly === 22 ? 1.15 : 0.75);
      else if (px < 2 || px > 29) c = scale(DARK, px === 0 ? 0.7 : 1.1);
      else if (((px === 5 || px === 26) && ly >= 6 && ly <= 18) || ((ly === 6 || ly === 18) && px >= 5 && px <= 26)) c = gold(0.4);
      else {
        c = scale(DARK, 0.9 + rng.next() * 0.1);
        if ((grain(x, y) * 7) % 1 < 0.08) c = mix(c, pal[0], 0.35); // veins in the stone
      }
    }
    if (crack.has(y * W + x)) c = scale(c, 0.45);
    // Soot under the vault, dust drifted against the foot of the wall.
    c = scale(c, 1 - Math.max(0, 1 - y / (24 + soot(x, y) * 18)) * 0.45);
    const d = (y - (H - 8 - dust(x, y) * 5)) / 8;
    if (d > 0) c = mix(c, DUST, Math.min(0.35, d * 0.35) * (0.7 + rng.next() * 0.3));
    return c;
  });
}

/** Inlaid marble, a tile each: a cream lozenge with a red heart on a red ground, lines of gold between. */
function floor(theme) {
  const S = 64, rng = new RNG('dwarven:floor');
  const [red, cream] = theme.floor.map(rgb), joint = scale(red, 0.55);
  const vein = noise(rng, S, S, 6), wear = noise(rng, S, S, 4), broken = noise(rng, S, S, 3), crack = cracks(rng, S, S, 4, 14);
  return paint(S, S, (x, y) => {
    if (x === 0 || y === 0) return joint;
    const d = Math.abs(x - 31.5) + Math.abs(y - 31.5);
    let c;
    if ((d >= 23 && d < 25) || (d >= 8 && d < 9.5) || (d >= 47 && d < 48.5)) c = gold(0.3 + (rng.next() - 0.5) * 0.12);
    else {
      c = d < 8 || (d >= 25 && d < 47) ? red : cream;
      const v = vein(x, y) * 8;
      if (v % 1 < 0.07) c = c === red ? mix(c, cream, 0.35) : scale(c, 0.82); // veins in the marble
      c = scale(c, (0.92 + rng.next() * 0.12) * (0.82 + wear(x, y) * 0.28));
    }
    // A piece broken out here and there, down to the rubble bed beneath.
    if (broken(x, y) > 0.86) c = scale(joint, 0.9 + (rng.chance(0.25) ? 0.5 : 0));
    else if (broken(x, y) > 0.845) c = scale(c, 0.65);
    if (crack.has(y * S + x)) c = scale(c, 0.5);
    if (rng.chance(0.012)) c = mix(c, DUST, 0.5);
    return c;
  });
}

/** The vault: coffers, four to a tile, framed in stone and gilt, a gold boss in each. */
function ceiling(theme) {
  const S = 64, rng = new RNG('dwarven:ceiling');
  const base = rgb(theme.ceiling), soot = noise(rng, S, S, 5);
  return paint(S, S, (x, y) => {
    const lx = x % 32, ly = y % 32, e = Math.min(lx, ly, 31 - lx, 31 - ly), r = Math.hypot(lx - 15.5, ly - 15.5);
    let c;
    if (e < 1) c = scale(base, 0.6);
    else if (e < 5) c = scale(base, lx < 5 || ly < 5 ? 1.4 : 1.15); // the frame, lit along its inner edge
    else if (e < 6) c = gold(0.2);
    else if (e < 8) c = scale(base, 0.85);
    else if (r < 2.2) c = gold(0.4);
    else if (r < 3.6 && (Math.round(Math.atan2(ly - 15.5, lx - 15.5) / (Math.PI / 4)) % 2 === 0)) c = gold(0.15); // the boss's petals
    else c = scale(base, 0.62);
    return scale(c, (0.7 + soot(x, y) * 0.5) * (0.92 + rng.next() * 0.12));
  });
}

/**
 * A rift's sides: raw rock torn through the foundations, in strata, and veins of violet light running down it
 * (`channelGlow`, lit by nothing but itself). Tiles every way, repeating down the rift.
 */
function riftSides(theme) {
  const S = 64, rng = new RNG('dwarven:rift');
  const pal = theme.wall.map(rgb), rock = noise(rng, S, S, 8), band = noise(rng, S, S, 2, 6);
  const veins = cracks(rng, S, S, 4, 44), bright = new Set([...veins].filter(() => rng.chance(0.3)));
  const sides = paint(S, S, (x, y) => {
    let c = scale(mix(pal[2], JOINT, 0.35 + rock(x, y) * 0.4), 0.8 + rng.next() * 0.25);
    if ((band(x, y) * 5) % 1 < 0.12) c = scale(c, 0.7);
    return veins.has(y * S + x) ? VIOLET[2] : c;
  });
  const glow = paint(S, S, (x, y) => (bright.has(y * S + x) ? VIOLET[4] : veins.has(y * S + x) ? VIOLET[3] : BLACK));
  return { sides, glow };
}

/** The glow at the bottom of a rift: churning violet light. */
function abyss() {
  const S = 64, rng = new RNG('dwarven:abyss'), broad = noise(rng, S, S, 4), fine = noise(rng, S, S, 9);
  return paint(S, S, (x, y) => {
    const v = broad(x, y) * 0.7 + fine(x, y) * 0.3;
    return VIOLET[v < 0.35 ? 0 : v < 0.48 ? 1 : v < 0.6 ? 2 : v < 0.7 ? 3 : 4];
  });
}

export function dwarvenTextures(theme, toTexture) {
  const rift = riftSides(theme);
  return {
    wall: toTexture(wall(theme)),
    wallFullHeight: true,
    floor: toTexture(floor(theme)),
    ceiling: toTexture(ceiling(theme)),
    channel: toTexture(rift.sides),
    channelGlow: toTexture(rift.glow),
    abyss: toTexture(abyss()),
    cobweb: toTexture(cobweb()),
  };
}
