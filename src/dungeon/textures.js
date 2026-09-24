import * as THREE from 'three';
import { RNG } from '../rng.js';
import { sewerTextures } from './sewerTextures.js';
import { catacombTextures } from './catacombTextures.js';
import { caveTextures } from './caveTextures.js';

const S = 64;
const cache = new Map();

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return c;
}

// Cheap value noise for blotches.
function valueNoise(rng, cells) {
  const g = Array.from({ length: (cells + 1) * (cells + 1) }, () => rng.next());
  return (x, y) => {
    const fx = (x / S) * cells, fy = (y / S) * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const at = (a, b) => g[(b % cells) * (cells + 1) + (a % cells)];
    const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
    const bot = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
    return top * (1 - ty) + bot * ty;
  };
}

function wallTexture(theme) {
  const rng = new RNG(`wall:${theme.name}`);
  const c = canvas();
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const mortar = rgb(theme.mortar);
  const pal = theme.wall.map(rgb);
  const moss = rgb(theme.moss);
  const blot = valueNoise(rng, 4);
  const brickShade = {};
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const row = Math.floor(y / 16);
      const off = row % 2 ? 16 : 0;
      const bx = Math.floor((x + off) / 32) % 2;
      const lx = (x + off) % 32, ly = y % 16;
      let col;
      if (lx === 0 || ly === 0) {
        col = mortar;
      } else {
        const key = `${row}:${bx}`;
        if (!(key in brickShade)) brickShade[key] = { c: rng.pick(pal), k: 0.85 + rng.next() * 0.3 };
        const b = brickShade[key];
        let k = b.k * (0.88 + rng.next() * 0.2);
        if (ly === 1 || lx === 1) k *= 1.12;
        if (ly === 15 || lx === 31) k *= 0.72;
        col = b.c.map((v) => v * k);
        const m = blot(x, y);
        if (m > 0.62 && y > 30) {
          const a = Math.min(1, (m - 0.62) * 4);
          col = col.map((v, i) => v * (1 - a) + moss[i] * a * (0.8 + rng.next() * 0.4));
        }
      }
      const i = (y * S + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

function floorTexture(theme) {
  const rng = new RNG(`floor:${theme.name}`);
  const c = canvas();
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const mortar = rgb(theme.mortar);
  const pal = theme.floor.map(rgb);
  const blot = valueNoise(rng, 3);
  const slab = {};
  // Offset slab layout so it reads as flagstones, not a checkerboard.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const row = Math.floor(y / 32);
      const off = row % 2 ? 20 : 0;
      const sx = Math.floor((x + off) / 32) % 2;
      const lx = (x + off) % 32, ly = y % 32;
      let col;
      if (lx === 0 || ly === 0) col = mortar;
      else {
        const key = `${row}:${sx}`;
        if (!(key in slab)) slab[key] = { c: rng.pick(pal), k: 0.85 + rng.next() * 0.3 };
        const s = slab[key];
        let k = s.k * (0.85 + rng.next() * 0.22) * (0.85 + blot(x, y) * 0.3);
        if (ly === 1 || lx === 1) k *= 1.1;
        col = s.c.map((v) => v * k);
      }
      const i = (y * S + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // A few cracks.
  ctx.strokeStyle = theme.mortar;
  ctx.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    let x = rng.int(4, 60), y = rng.int(4, 60);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += rng.int(-5, 5); y += rng.int(-5, 5);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(c);
}

function ceilingTexture(theme) {
  const rng = new RNG(`ceil:${theme.name}`);
  const c = canvas();
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const base = rgb(theme.ceiling);
  const blot = valueNoise(rng, 5);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = (0.7 + blot(x, y) * 0.6) * (0.85 + rng.next() * 0.25);
      const i = (y * S + x) * 4;
      img.data[i] = base[0] * k; img.data[i + 1] = base[1] * k; img.data[i + 2] = base[2] * k; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

function trapTexture() {
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#555';
  ctx.fillRect(4, 4, S - 8, S - 8);
  ctx.fillStyle = '#222';
  for (let y = 12; y < S - 8; y += 12) for (let x = 12; x < S - 8; x += 12) ctx.fillRect(x - 2, y - 2, 4, 4);
  return toTexture(c);
}

// Themes with a `style` paint their own textures. Besides wall, floor and ceiling, a style may add `channel`
// (a channel's sides, from its surface up to the floor), the surface itself (`water`, or a pit's `pitFloor`),
// and decorations' (`puddles`, `cobweb`), and set `wallFullHeight` for a wall texture that spans the wall's
// height once instead of repeating up it.
const STYLES = { sewers: sewerTextures, catacombs: catacombTextures, caves: caveTextures };

export function getTextures(theme) {
  if (!cache.has(theme.name)) {
    const style = STYLES[theme.style];
    cache.set(theme.name, style ? style(theme, toTexture) : {
      wall: wallTexture(theme),
      floor: floorTexture(theme),
      ceiling: ceilingTexture(theme),
    });
  }
  return cache.get(theme.name);
}

let trapTex = null;
export function getTrapTexture() {
  return (trapTex ??= trapTexture());
}

/** Vertical planks with iron bands; locked doors are darker, with more (and rustier) iron. */
function doorTexture(locked) {
  const rng = new RNG(`door:${locked}`);
  const c = canvas();
  const ctx = c.getContext('2d');
  const woods = locked ? ['#3a2616', '#33200f', '#2c1b0c'] : ['#6a4526', '#5c3b1f', '#71492a'];
  for (let b = 0; b < 4; b++) {
    ctx.fillStyle = rng.pick(woods);
    ctx.fillRect(b * 16, 0, 16, S);
    for (let k = 0; k < 14; k++) { // grain
      ctx.fillStyle = `rgba(0,0,0,${0.08 + rng.next() * 0.12})`;
      ctx.fillRect(b * 16 + rng.int(1, 14), rng.int(0, S), 1, rng.int(6, 20));
    }
    ctx.fillStyle = '#1a0f08';
    ctx.fillRect(b * 16, 0, 1, S);
  }
  const bands = locked ? [8, 30, 52] : [12, 48];
  for (const y of bands) {
    ctx.fillStyle = locked ? '#3a3230' : '#2e2e30';
    ctx.fillRect(0, y, S, 5);
    ctx.fillStyle = locked ? '#8a6a50' : '#707078';
    for (let x = 3; x < S; x += 10) ctx.fillRect(x, y + 1, 2, 2);
  }
  return toTexture(c);
}

const doorTex = {};
export function getDoorTexture(locked) {
  return (doorTex[locked] ??= doorTexture(locked));
}
