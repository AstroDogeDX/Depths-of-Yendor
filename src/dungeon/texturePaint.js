import { RNG } from '../rng.js';

// Helpers for the themes' hand-painted textures (sewerTextures.js, catacombTextures.js...): colour maths, a
// texel-by-texel canvas painter, tiling noise, brickwork, cracks, and the variants of each texture.

export const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const scale = (c, k) => c.map((v) => v * k);

/** Paints a w×h canvas with fn(x, y) → [r, g, b] or [r, g, b, a]. */
export function paint(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = fn(x, y), i = (y * w + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = col[3] ?? 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Smooth value noise over a w×h texture that tiles, with `cx`×`cy` cells. */
export function noise(rng, w, h, cx, cy = cx) {
  const g = Array.from({ length: cx * cy }, () => rng.next());
  const at = (a, b) => g[((b % cy) + cy) % cy * cx + ((a % cx) + cx) % cx];
  return (x, y) => {
    const fx = (x / w) * cx, fy = (y / h) * cy, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = (fx - ix) ** 2 * (3 - 2 * (fx - ix)), ty = (fy - iy) ** 2 * (3 - 2 * (fy - iy));
    const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx, bot = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
    return top * (1 - ty) + bot * ty;
  };
}

/**
 * Running-bond brickwork: which brick a texel is in, and where it sits inside it. `wraps`: the brick runs off one
 * side of the texture and on at the other.
 */
export function bricks(x, y, w, bw, bh) {
  const row = Math.floor(y / bh), off = row % 2 ? bw / 2 : 0;
  const col = Math.floor((x + off) / bw) % Math.round(w / bw);
  return { row, col, lx: (x + off) % bw, ly: y % bh, mortar: (x + off) % bw === 0 || y % bh === 0, wraps: off > 0 && col === 0 };
}

/**
 * A few cracks (or veins): random walks, as a set of texel indices, wandering mostly `down` (or across), `steady` the
 * chance of a step that way. Given `keep(x, y)`, a walk stays where it says, stopping where it would leave; without, it
 * wraps round the edges, for a texture that tiles with itself alone.
 */
export function cracks(rng, w, h, n, len, { down = true, steady = 0.75, keep = null } = {}) {
  const out = new Set();
  for (let k = 0; k < n; k++) {
    let x = rng.int(0, w - 1), y = rng.int(0, h - 1);
    for (let tries = 0; keep && !keep(x, y) && tries < 30; tries++) { x = rng.int(0, w - 1); y = rng.int(0, h - 1); }
    for (let s = 0; s < len; s++) {
      if (keep && (x < 0 || y < 0 || x >= w || y >= h || !keep(x, y))) break;
      out.add(((y % h) + h) % h * w + ((x % w) + w) % w);
      if (down) { x += rng.int(-1, 1); y += rng.chance(steady) ? 1 : 0; } else { y += rng.int(-1, 1); x += rng.chance(steady) ? 1 : 0; }
    }
  }
  return out;
}


/**
 * A pattern of cells tiling a w×h texture: the nearest of `pts` to each texel (`cell`, an index into pts), and how far
 * it is from the next nearest (`gap`), worked out once for every variant; and the cells that reach an edge (`atEdge`),
 * which carry on into the next tile.
 */
export function cells(pts, w, h) {
  const cell = new Int16Array(w * h), gap = new Float32Array(w * h), atEdge = new Set();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let d1 = Infinity, d2 = Infinity, best = 0;
    pts.forEach((p, i) => {
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        const d = Math.hypot(x - p.x - ox, y - p.y - oy);
        if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
      }
    });
    cell[y * w + x] = best;
    gap[y * w + x] = d2 - d1;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) atEdge.add(best);
  }
  return { cell, gap, atEdge };
}

// --- Variants ---
// The walls, floors and vaults come in variants, which the level builder scatters among the tiles (see
// buildLevelMeshes), so the same stains and cracks don't come round every two metres. Two things vary:
// - The broad features (soot, damp, stains, wear: the noise fields) come in two flavours, and every corner of the grid
//   has one of them, at random (and on a wall, every upright edge between two faces). A tile's texture is painted with
//   the flavours of its four corners (a wall face's, its two edges), each holding sway nearest its own corner, so the
//   next tile, sharing two of them, carries on without a seam, and no corner looks like every other: CORNER_PATTERNS
//   ways for a tile, EDGE_PATTERNS for a wall's face.
// - The small features (the shades of the bricks and slabs wholly inside, cracks, veins, streaks, pebbles...) are each
//   variant's own, kept off its edges. What crosses an edge (a brick wrapping round it) is the same in every variant.

export const CORNER_PATTERNS = 16;
export const EDGE_PATTERNS = 4;

/**
 * A texture painted in variants: seeded `name`, w×h texels, a wall's if `across` (it spans the wall's full height, so
 * only its sides meet the next one's), in `sets` sets of small features for each pattern of corners (or edges): see
 * variantFor in the level builder for how they're numbered. Gives:
 *   base       the shared RNG, for what's the same in every variant: its layout, and what crosses an edge
 *   pair(make) the two flavours of a noise field (or anything else), make(rng) each
 *   all(fn)    fn(variant) for each variant, in order, where a variant has:
 *     own              its own RNG, for its small features
 *     field([a, b])    a pair (see pair) mixed by the flavours of its corners
 *     weight(x, y)     the share of the second flavour there, to mix anything else the same way
 *     away(x, y)       whether a small feature of its own may go there: `band` texels or more from its edges
 *     keyed(key, wraps)  an RNG for one element (a brick, a slab): its own, or the shared one's if it `wraps` round an
 *                      edge
 */
export function variants(name, w, h, { across = false, sets = across ? 3 : 1, band = 6 } = {}) {
  const base = new RNG(name), alt = new RNG(`${name}:alt`), patterns = across ? EDGE_PATTERNS : CORNER_PATTERNS;
  const smooth = (t) => t * t * (3 - 2 * t);
  const edge = (x, y) => (across ? Math.min(x, w - 1 - x) : Math.min(x, y, w - 1 - x, h - 1 - y));
  // How far across (u) and up (t) the texture a texel is, for weighing its corners: bent by a little noise inside (but
  // not at the edges), so where one flavour gives way to the next wanders, rather than running straight across.
  const warp = new RNG(`${name}:warp`), du = noise(warp, w, h, 3), dt = noise(warp, w, h, 3);
  const bend = (s, n) => smooth(Math.max(0, Math.min(1, s + 0.9 * Math.sin(Math.PI * s) * (n - 0.5))));
  const variant = (v) => {
    // The flavours of its corners: bit 0 at the texture's (u, v) = (0, 0), 1 at (1, 0), 2 at (1, 1) and 3 at (0, 1); or
    // of its edges, bit 0 at u = 0 and 1 at u = 1. (A canvas's top row is at v = 1.)
    const p = v % patterns, bit = (i) => (p >> i) & 1;
    const weight = across
      ? (x, y) => { const u = bend((x + 0.5) / w, du(x, y)); return bit(0) * (1 - u) + bit(1) * u; }
      : (x, y) => {
        const u = bend((x + 0.5) / w, du(x, y)), t = bend(1 - (y + 0.5) / h, dt(x, y));
        return bit(0) * (1 - u) * (1 - t) + bit(1) * u * (1 - t) + bit(2) * u * t + bit(3) * (1 - u) * t;
      };
    return {
      own: new RNG(`${name}:${v}`),
      weight,
      // (Two fields mixed are smoother than either: the mix is stretched back out about the middle.)
      field: ([a, b]) => (x, y) => {
        const k = weight(x, y);
        if (k <= 0) return a(x, y);
        if (k >= 1) return b(x, y);
        const f = a(x, y) * (1 - k) + b(x, y) * k;
        return Math.max(0, Math.min(1, 0.5 + (f - 0.5) / Math.hypot(1 - k, k)));
      },
      away: (x, y) => edge(x, y) >= band,
      keyed: (key, wraps = false) => new RNG(`${name}:${wraps ? 'base' : v}:${key}`),
    };
  };
  return {
    base,
    pair: (make) => [make(base), make(alt)],
    all: (fn) => Array.from({ length: patterns * sets }, (_, v) => fn(variant(v))),
  };
}
