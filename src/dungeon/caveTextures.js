import { RNG } from '../rng.js';
import { rgb, mix, scale, paint, noise } from './texturePaint.js';

// The Caves' own textures: natural rock, no masonry anywhere. Walls are banded strata, cracked and threaded with
// pale mineral veins and dark seeps; the floor is rock and grit; the vault is dark rock; a chasm's sides are rock
// that tiles every way (the level builder darkens them into the depths).

/** A few cracks: random walks as a set of texel indices, wandering mostly `down` (or across). */
function cracks(rng, w, h, n, len, down = true) {
  const out = new Set();
  for (let k = 0; k < n; k++) {
    let x = rng.int(0, w - 1), y = rng.int(0, h - 1);
    for (let s = 0; s < len; s++) {
      out.add(((y % h) + h) % h * w + ((x % w) + w) % w);
      if (down) { x += rng.int(-1, 1); y += rng.chance(0.75) ? 1 : 0; }
      else { y += rng.int(-1, 1); x += rng.chance(0.75) ? 1 : 0; }
    }
  }
  return out;
}

/** Rock strata: bands of shade that wave across the texture, as a function of (x, y). */
function strata(rng, w, h, bands) {
  const warp = noise(rng, w, h, 4, 3), shade = Array.from({ length: bands + 1 }, () => 0.78 + rng.next() * 0.35);
  return (x, y) => {
    const v = ((y + (warp(x, y) - 0.5) * 14) / h) * bands;
    const i = ((Math.floor(v) % bands) + bands) % bands, f = v - Math.floor(v);
    return { k: shade[i], edge: f < 0.08 };
  };
}

/** Walls (64×90, the full height once): strata, cracks, veins and seeps, darker toward the floor. */
function wall(theme) {
  const W = 64, H = 90, rng = new RNG('caves:wall');
  const pal = theme.wall.map(rgb), vein = rgb('#a89a80'), seep = rgb('#1c1712');
  const band = strata(rng, W, H, 7), grain = noise(rng, W, H, 10, 12), blot = noise(rng, W, H, 5, 6);
  const crack = cracks(rng, W, H, 6, 22), veins = cracks(rng, W, H, 3, 40, false);
  return paint(W, H, (x, y) => {
    const b = band(x, y);
    let c = scale(mix(pal[0], pal[2], grain(x, y)), b.k * (0.9 + rng.next() * 0.14));
    if (b.edge) c = scale(c, 0.8); // the seam between two layers
    if (blot(x, y) > 0.7) c = mix(c, pal[1], 0.5);
    if (veins.has(y * W + x)) c = mix(c, vein, 0.55);
    if (crack.has(y * W + x)) c = scale(c, 0.5);
    if (blot(x, y) < 0.22) c = mix(c, seep, 0.35); // damp where water seeps through
    return scale(c, 1 - Math.max(0, (y - 60) / 30) * 0.2);
  });
}

/** The floor: rock worn smooth in places, grit and pebbles in others. */
function floor(theme) {
  const S = 64, rng = new RNG('caves:floor');
  const pal = theme.floor.map(rgb), grit = noise(rng, S, S, 6), big = noise(rng, S, S, 3), crack = cracks(rng, S, S, 5, 14);
  const pebbles = new Map();
  for (let k = 0; k < 40; k++) {
    const x = rng.int(0, S - 1), y = rng.int(0, S - 1), r = rng.chance(0.3) ? 1 : 0, shade = 0.85 + rng.next() * 0.5;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) pebbles.set(((y + dy + S) % S) * S + (x + dx + S) % S, shade);
    pebbles.set(((y + r + 1) % S) * S + x, 0.55); // its shadow
  }
  return paint(S, S, (x, y) => {
    let c = scale(mix(pal[0], pal[1], big(x, y)), 0.85 + grit(x, y) * 0.3 + (rng.next() - 0.5) * 0.12);
    const p = pebbles.get(y * S + x);
    if (p) c = scale(pal[0], p);
    if (crack.has(y * S + x)) c = scale(c, 0.55);
    return c;
  });
}

/** The vault: dark rock, blotched and cracked. */
function ceiling(theme) {
  const S = 64, rng = new RNG('caves:ceiling');
  const base = rgb(theme.ceiling), blot = noise(rng, S, S, 5), grain = noise(rng, S, S, 12), crack = cracks(rng, S, S, 5, 14);
  return paint(S, S, (x, y) => {
    const c = scale(base, (0.9 + blot(x, y) * 0.5 + grain(x, y) * 0.25) * (0.92 + rng.next() * 0.12) * 1.2);
    return crack.has(y * S + x) ? scale(c, 0.55) : c;
  });
}

/** A chasm's sides: rock that tiles in both directions, as it repeats down the walls. */
function channel(theme) {
  const S = 64, rng = new RNG('caves:chasm');
  const pal = theme.wall.map(rgb), grain = noise(rng, S, S, 8), band = strata(rng, S, S, 4), crack = cracks(rng, S, S, 6, 18);
  return paint(S, S, (x, y) => {
    let c = scale(mix(pal[1], pal[2], grain(x, y)), band(x, y).k * (0.88 + rng.next() * 0.15));
    if (crack.has(y * S + x)) c = scale(c, 0.5);
    return c;
  });
}

export function caveTextures(theme, toTexture) {
  return {
    wall: toTexture(wall(theme)),
    wallFullHeight: true,
    floor: toTexture(floor(theme)),
    ceiling: toTexture(ceiling(theme)),
    channel: toTexture(channel(theme)),
  };
}
