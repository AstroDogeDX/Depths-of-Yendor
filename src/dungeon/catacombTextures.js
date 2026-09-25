import { RNG } from '../rng.js';
import { rgb, mix, scale, paint, noise } from './texturePaint.js';

// The Catacombs' own textures: heavy rough-hewn blocks blackened by centuries of torches overhead and grey
// with bone dust at their feet, worn flagstones, a rough vault, the hacked-out sides of the spike pits fading
// to black, the bone-strewn floor of the pits, and cobwebs.

const DUST = rgb('#8e8574'); // bone dust
const JOINT = rgb('#1c1a17');

/** Rows of ashlar blocks, each course a different height, joints staggered and tiling across 64 texels. */
function courses(rng, heights, w) {
  let y0 = 0;
  return heights.map((h) => {
    const n = rng.int(2, 3), weights = Array.from({ length: n }, () => 0.7 + rng.next() * 0.6);
    const total = weights.reduce((a, b) => a + b, 0), off = rng.int(0, w - 1);
    let at = off;
    const joints = weights.map((k) => { const j = Math.round(at) % w; at += (k / total) * w; return j; });
    const c = { y0, h, joints: joints.sort((a, b) => a - b), shade: Array.from({ length: n }, () => 0.72 + rng.next() * 0.33) };
    y0 += h;
    return c;
  });
}

/** Which block of a course a texel lies in, and how far it is from that block's left joint. */
function blockAt(course, x, w) {
  const j = course.joints;
  for (let i = j.length - 1; i >= 0; i--) if (x >= j[i]) return { i, lx: x - j[i] };
  return { i: j.length - 1, lx: x + w - j[j.length - 1] };
}

/** A few hairline cracks: random walks, as a set of texel indices. */
function cracks(rng, w, h, n, len) {
  const out = new Set();
  for (let k = 0; k < n; k++) {
    let x = rng.int(0, w - 1), y = rng.int(0, h - 1);
    for (let s = 0; s < len; s++) {
      out.add(y * w + ((x % w) + w) % w);
      x += rng.int(-1, 1);
      y += rng.chance(0.7) ? 1 : 0;
      if (y >= h) break;
    }
  }
  return out;
}

/** Walls, full height once (64×90, top row at the top of the wall). */
function wall(theme) {
  const W = 64, H = 90, rng = new RNG('catacombs:wall');
  const pal = theme.wall.map(rgb);
  const rows = courses(rng, [13, 15, 12, 16, 14, 20], W);
  const colour = rows.map((r) => r.shade.map(() => rng.pick(pal)));
  const soot = noise(rng, W, H, 8, 4), grime = noise(rng, W, H, 6, 3), crack = cracks(rng, W, H, 5, 9);
  return paint(W, H, (x, y) => {
    const ri = rows.findIndex((r) => y < r.y0 + r.h), r = rows[ri], ly = y - r.y0;
    const { i, lx } = blockAt(r, x, W);
    if (ly === 0 || lx === 0) return JOINT;
    let k = r.shade[i] * (0.9 + rng.next() * 0.16);
    if (ly === 1) k *= 1.12;
    if (ly === r.h - 1) k *= 0.7;
    if (lx === 1) k *= 1.06;
    if (rng.chance(0.05)) k *= 0.78; // chisel marks
    let col = scale(colour[ri][i], k);
    if (crack.has(y * W + x)) col = scale(col, 0.55);
    // Soot from centuries of torches, thickest under the vault.
    const s = Math.max(0, 1 - y / (30 + soot(x, y) * 20));
    col = scale(col, 1 - s * 0.55);
    // Bone dust drifted against the foot of the wall.
    const d = (y - (H - 11 - grime(x, y) * 6)) / 10;
    if (d > 0) col = mix(col, DUST, Math.min(0.4, d * 0.4) * (0.7 + rng.next() * 0.3));
    return col;
  });
}

/** Big worn flagstones, two to a tile each way, joints staggered on alternate rows. */
function floor(theme) {
  const S = 64, rng = new RNG('catacombs:floor');
  const pal = theme.floor.map(rgb);
  const shade = new Map(), crack = cracks(rng, S, S, 4, 10), stain = noise(rng, S, S, 4);
  return paint(S, S, (x, y) => {
    const row = Math.floor(y / 32), off = row % 2 ? 16 : 0, col = Math.floor(((x + off) % S) / 32);
    const lx = (x + off) % 32, ly = y % 32;
    if (lx === 0 || ly === 0) return JOINT;
    const key = `${row}:${col}`;
    if (!shade.has(key)) shade.set(key, { c: rng.pick(pal), k: 0.8 + rng.next() * 0.3 });
    const f = shade.get(key);
    // Worn: smooth and pale in the middle, darker toward the edges, chipped at the corners.
    const edge = Math.min(lx, ly, 32 - lx, 32 - ly);
    if (edge < 3 && Math.min(lx, 32 - lx) < 4 && Math.min(ly, 32 - ly) < 4) return scale(JOINT, 1.4);
    let c = scale(f.c, f.k * (0.9 + rng.next() * 0.14) * (0.85 + Math.min(1, edge / 8) * 0.18));
    if (crack.has(y * S + x)) c = scale(c, 0.6);
    if (stain(x, y) < 0.3) c = scale(c, 0.85);
    if (rng.chance(0.006)) c = mix(c, DUST, 0.35); // specks of bone dust
    return c;
  });
}

/** The vault: rough rock in big irregular stones, sooty. */
function ceiling(theme) {
  const S = 64, rng = new RNG('catacombs:ceiling');
  const base = rgb(theme.ceiling);
  const pts = Array.from({ length: 9 }, () => ({ x: rng.next() * S, y: rng.next() * S, k: 0.8 + rng.next() * 0.5 }));
  const rough = noise(rng, S, S, 8);
  return paint(S, S, (x, y) => {
    let d1 = Infinity, d2 = Infinity, best = null;
    for (const p of pts) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const d = Math.hypot(x - p.x - ox, y - p.y - oy);
      if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
    }
    if (d2 - d1 < 1.2) return scale(base, 0.8);
    return scale(base, best.k * (0.85 + rough(x, y) * 0.35) * (0.9 + rng.next() * 0.15) * 1.4);
  });
}

/** A pit's hacked-out sides (64×48: 2 m wide, 1.5 m deep), falling away into darkness. */
function channel(theme) {
  const W = 64, H = 48, rng = new RNG('catacombs:pit');
  const pal = theme.wall.map(rgb), rough = noise(rng, W, H, 8, 6), crack = cracks(rng, W, H, 6, 12);
  return paint(W, H, (x, y) => {
    let c = scale(mix(pal[1], pal[2], rough(x, y)), 0.85 + rng.next() * 0.2);
    if (rng.chance(0.06)) c = scale(c, 0.7); // pick marks
    if (crack.has(y * W + x)) c = scale(c, 0.5);
    if (y < 2) c = scale(c, 1.15); // the worn lip
    return scale(c, 1 - (y / H) * 0.75);
  });
}

/** The floor of a pit: black earth and the scattered bones of those who fell. */
function pitFloor() {
  const S = 64, rng = new RNG('catacombs:pitfloor');
  const earth = rgb('#221e19'), bone = rgb('#b8ae96'), dirt = noise(rng, S, S, 5);
  const bones = new Map();
  for (let k = 0; k < 16; k++) {
    const a = rng.range(0, Math.PI), len = rng.int(3, 8), w = rng.chance(0.3) ? 2 : 1;
    const x0 = rng.int(0, S - 1), y0 = rng.int(0, S - 1), shade = 0.6 + rng.next() * 0.4;
    for (let t = 0; t <= len; t++) for (let o = 0; o < w; o++) {
      const x = Math.round(x0 + Math.cos(a) * t + o * Math.sin(a)), y = Math.round(y0 + Math.sin(a) * t);
      bones.set(((y % S) + S) % S * S + ((x % S) + S) % S, t === 0 || t === len ? shade * 1.1 : shade);
    }
  }
  return paint(S, S, (x, y) => {
    const b = bones.get(y * S + x);
    if (b) return scale(bone, b);
    return scale(earth, 0.8 + dirt(x, y) * 0.5 + (rng.chance(0.03) ? 0.4 : 0));
  });
}

/** A cobweb: strands from the corner (bottom middle) fanning up to the top edge, with sagging threads across. */
export function cobweb() {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d'), rng = new RNG('catacombs:cobweb');
  ctx.strokeStyle = 'rgba(214, 210, 198, 0.55)';
  ctx.lineWidth = 1;
  const apex = [S / 2, S - 1];
  const ends = [0, 0.14, 0.3, 0.46, 0.6, 0.76, 0.9, 1].map((f) => [f * (S - 1) + rng.range(-2, 2), rng.range(0, 3)]);
  for (const [x, y] of ends) {
    ctx.beginPath();
    ctx.moveTo(...apex);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  for (const t of [0.2, 0.38, 0.55, 0.72, 0.88]) {
    ctx.beginPath();
    ends.forEach(([x, y], i) => {
      const px = apex[0] + (x - apex[0]) * t, py = apex[1] + (y - apex[1]) * t;
      if (i === 0) ctx.moveTo(px, py);
      else {
        // Each span sags toward the corner.
        const [qx, qy] = ends[i - 1], mx = apex[0] + ((x + qx) / 2 - apex[0]) * (t - 0.06), my = apex[1] + ((y + qy) / 2 - apex[1]) * (t - 0.06);
        ctx.quadraticCurveTo(mx, my, px, py);
      }
    });
    ctx.stroke();
  }
  return c;
}

export function catacombTextures(theme, toTexture) {
  return {
    wall: toTexture(wall(theme)),
    wallFullHeight: true,
    floor: toTexture(floor(theme)),
    ceiling: toTexture(ceiling(theme)),
    channel: toTexture(channel(theme)),
    pitFloor: toTexture(pitFloor()),
    cobweb: toTexture(cobweb()),
  };
}
