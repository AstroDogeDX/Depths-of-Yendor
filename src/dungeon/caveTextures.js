import { RNG } from '../rng.js';
import { rgb, mix, scale, paint, noise, cracks, variants } from './texturePaint.js';

// The Caves' own textures: natural rock, no masonry anywhere. Walls are banded strata, cracked and threaded with
// pale mineral veins and dark seeps; the floor is rock and grit; the vault is dark rock; a chasm's sides are rock
// that tiles every way (the level builder darkens them into the depths). The walls, floor and vault come in variants
// (see variants in texturePaint.js).

/**
 * Rock strata: bands of shade that wave across the texture, as a function of (x, y): `warp(x, y)` how they wave, and
 * `shade(i, x, y)` band i's shade there.
 */
function strata(warp, shade, h, bands) {
  return (x, y) => {
    const v = ((y + (warp(x, y) - 0.5) * 14) / h) * bands;
    const i = ((Math.floor(v) % bands) + bands) % bands, f = v - Math.floor(v);
    return { k: shade(i, x, y), edge: f < 0.08 };
  };
}
const bandShades = (rng, bands) => Array.from({ length: bands }, () => 0.78 + rng.next() * 0.35);

/** Walls (64×90, the full height once): strata, cracks, veins and seeps, darker toward the floor. */
function wall(theme) {
  const W = 64, H = 90, T = variants('caves:wall', W, H, { across: true });
  const pal = theme.wall.map(rgb), vein = rgb('#a89a80'), seep = rgb('#1c1712');
  // The strata run on from face to face, waving and shaded by the flavours of the edges between them.
  const warps = T.pair((r) => noise(r, W, H, 4, 3)), [k0, k1] = T.pair((r) => bandShades(r, 7));
  const grains = T.pair((r) => noise(r, W, H, 10, 12)), blots = T.pair((r) => noise(r, W, H, 5, 6));
  return T.all((V) => {
    const rng = V.own, grain = V.field(grains), blot = V.field(blots);
    const band = strata(V.field(warps), (i, x, y) => k0[i] + (k1[i] - k0[i]) * V.weight(x, y), H, 7);
    const crack = cracks(rng, W, H, 6, 22, { keep: V.away }), veins = cracks(rng, W, H, 3, 40, { down: false, keep: V.away });
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
  });
}

/** The floor: rock worn smooth in places, grit and pebbles in others. */
function floor(theme) {
  const S = 64, T = variants('caves:floor', S, S);
  const pal = theme.floor.map(rgb), grits = T.pair((r) => noise(r, S, S, 6)), bigs = T.pair((r) => noise(r, S, S, 3));
  // Pebbles: those near the edges are the same in every variant, so they carry on into the next tile; those inside
  // are each variant's own.
  const scatter = (r, keep, into) => {
    for (let k = 0; k < 40; k++) {
      const x = r.int(0, S - 1), y = r.int(0, S - 1), rad = r.chance(0.3) ? 1 : 0, shade = 0.85 + r.next() * 0.5;
      if (!keep(x, y)) continue;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) into.set(((y + dy + S) % S) * S + (x + dx + S) % S, shade);
      into.set(((y + rad + 1) % S) * S + x, 0.55); // its shadow
    }
    return into;
  };
  const near = (x, y) => Math.min(x, y, S - 1 - x, S - 1 - y) < 6, edgePebbles = scatter(T.base, near, new Map());
  return T.all((V) => {
    const rng = V.own, grit = V.field(grits), big = V.field(bigs);
    const crack = cracks(rng, S, S, 5, 14, { keep: V.away }), pebbles = scatter(rng, V.away, new Map(edgePebbles));
    return paint(S, S, (x, y) => {
      let c = scale(mix(pal[0], pal[1], big(x, y)), 0.85 + grit(x, y) * 0.3 + (rng.next() - 0.5) * 0.12);
      const p = pebbles.get(y * S + x);
      if (p) c = scale(pal[0], p);
      if (crack.has(y * S + x)) c = scale(c, 0.55);
      return c;
    });
  });
}

/** The vault: dark rock, blotched and cracked. */
function ceiling(theme) {
  const S = 64, T = variants('caves:ceiling', S, S);
  const base = rgb(theme.ceiling), blots = T.pair((r) => noise(r, S, S, 5)), grains = T.pair((r) => noise(r, S, S, 12));
  return T.all((V) => {
    const rng = V.own, blot = V.field(blots), grain = V.field(grains), crack = cracks(rng, S, S, 5, 14, { keep: V.away });
    return paint(S, S, (x, y) => {
      const c = scale(base, (0.9 + blot(x, y) * 0.5 + grain(x, y) * 0.25) * (0.92 + rng.next() * 0.12) * 1.2);
      return crack.has(y * S + x) ? scale(c, 0.55) : c;
    });
  });
}

/** A chasm's sides: rock that tiles in both directions, as it repeats down the walls. */
function channel(theme) {
  const S = 64, rng = new RNG('caves:chasm');
  const pal = theme.wall.map(rgb), grain = noise(rng, S, S, 8), warp = noise(rng, S, S, 4, 3), ks = bandShades(rng, 4);
  const band = strata(warp, (i) => ks[i], S, 4), crack = cracks(rng, S, S, 6, 18);
  return paint(S, S, (x, y) => {
    let c = scale(mix(pal[1], pal[2], grain(x, y)), band(x, y).k * (0.88 + rng.next() * 0.15));
    if (crack.has(y * S + x)) c = scale(c, 0.5);
    return c;
  });
}

export function caveTextures(theme, toTexture) {
  return {
    wall: wall(theme).map(toTexture),
    wallFullHeight: true,
    floor: floor(theme).map(toTexture),
    ceiling: ceiling(theme).map(toTexture),
    channel: toTexture(channel(theme)),
  };
}
