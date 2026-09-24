// Helpers for the themes' hand-painted textures (sewerTextures.js, catacombTextures.js): colour maths, a
// texel-by-texel canvas painter, tiling noise and brickwork.

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

/** Running-bond brickwork: which brick a texel is in, and where it sits inside it. */
export function bricks(x, y, w, bw, bh) {
  const row = Math.floor(y / bh), off = row % 2 ? bw / 2 : 0;
  const col = Math.floor((x + off) / bw) % Math.round(w / bw);
  return { row, col, lx: (x + off) % bw, ly: y % bh, mortar: (x + off) % bw === 0 || y % bh === 0 };
}
