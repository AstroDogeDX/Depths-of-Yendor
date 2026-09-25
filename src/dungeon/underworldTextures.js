import { RNG } from '../rng.js';
import { rgb, mix, scale, paint, noise } from './texturePaint.js';

// The Underworld's own textures: a temple to the evil below, dug into caverns in the dark depths. Its rooms are
// walled in black-violet brick up to the raw rock of the cavern, a frieze of runes glowing violet running round
// them (`wallGlow`: what shines by itself), and floored with great slabs of basalt. The passages between them
// are raw rock veined with faint violet light (`tunnelWall`, `tunnelGlow`), floored with rock and ash
// (`tunnelFloor`). The vaults are rough rock glinting with specks of crystal (`ceilingGlow`). Lava runs in
// channels whose sides glow with its heat (`channel`, `channelGlow`), its crust breaking over molten rock (`lava`).

const VIOLET = ['#12051c', '#2c0c46', '#4e1a78', '#7a34b0', '#b070e8', '#e0b8ff'].map(rgb);
const LAVA = ['#1a0604', '#3a0c06', '#6a1a08', '#a8340c', '#e0601a', '#ff9a30', '#ffd070'].map(rgb);
const BRICK = ['#2e2534', '#261e2c', '#1e1824'].map(rgb);
const ASH = rgb('#4a4450');
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

/** `n` runes, each a 5×7 bitmap of three to five strokes between points of a 3×4 lattice. */
function runes(rng, n) {
  const steps = [[1, 0], [0, 1], [1, 1], [1, -1], [0, 2], [2, 0]];
  return Array.from({ length: n }, () => {
    const bits = new Uint8Array(35), want = rng.int(3, 5);
    for (let drawn = 0, tries = 0; drawn < want && tries < 60; tries++) {
      const a = [rng.int(0, 2) * 2, rng.int(0, 3) * 2], [dx, dy] = rng.pick(steps), b = [a[0] + dx * 2, a[1] + dy * 2];
      if (b[0] < 0 || b[0] > 4 || b[1] < 0 || b[1] > 6) continue;
      const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      for (let s = 0; s <= n; s++) bits[Math.round(a[1] + ((b[1] - a[1]) * s) / n) * 5 + Math.round(a[0] + ((b[0] - a[0]) * s) / n)] = 1;
      drawn++;
    }
    return bits;
  });
}

/** Paints a texture and the glow that goes with it together: fn(x, y) → [colour, glow]. */
function paintBoth(w, h, fn) {
  const glow = new Map();
  const colour = paint(w, h, (x, y) => { const [c, g] = fn(x, y); if (g) glow.set(y * w + x, g); return c; });
  return { colour, glow: paint(w, h, (x, y) => glow.get(y * w + x) ?? BLACK) };
}

/**
 * The temple's walls, full height once (64×90, the top row under the vault): the cavern's rock above a ragged
 * coping, brick courses, a frieze of runes glowing violet, more brick, a plinth; ash drifted at the foot.
 */
function wall(theme) {
  const W = 64, H = 90, rng = new RNG('underworld:wall');
  const rock = theme.wall.map(rgb), mortar = rgb(theme.mortar);
  const grain = noise(rng, W, H, 12, 16), strata = noise(rng, W, H, 3, 8), top = noise(rng, W, 1, 6, 1), ash = noise(rng, W, H, 8, 2);
  const glyphs = runes(rng, 16), order = Array.from({ length: 8 }, () => rng.int(0, 15));
  const crack = cracks(rng, W, H, 4, 16), shade = new Map();
  const brickAt = (x, y, y0, section) => {
    const row = Math.floor((y - y0) / 6), off = row % 2 ? 8 : 0, lx = (x + off) % 16, ly = (y - y0) % 6;
    if (lx === 0 || ly === 0) return mortar;
    const key = `${section}:${row}:${Math.floor(((x + off) % W) / 16)}`;
    if (!shade.has(key)) shade.set(key, { c: rng.pick(BRICK), k: 0.85 + rng.next() * 0.3 });
    const b = shade.get(key);
    let k = b.k * (0.9 + grain(x, y) * 0.15) * (ly === 1 ? 1.15 : ly === 5 ? 0.78 : 1);
    if (rng.chance(0.04)) k *= 0.75; // chips
    return scale(b.c, k);
  };
  const { colour, glow } = paintBoth(W, H, (x, y) => {
    let c, g = null;
    const edge = 11 + Math.round(top(x, 0) * 6);
    if (y < edge) {
      // The cavern's rock, the masonry built up against it.
      c = scale(mix(rock[1], rock[2], grain(x, y)), (0.78 + rng.next() * 0.15) * ((strata(x, y) * 5) % 1 < 0.15 ? 0.75 : 1));
      if (y === edge - 1) c = scale(c, 0.6);
    } else if (y < 18) {
      c = x % 32 === 0 ? mortar : scale(BRICK[0], y === edge ? 1.25 : y === 17 ? 0.7 : 1.05 + (grain(x, y) - 0.5) * 0.2);
    } else if (y < 58) c = brickAt(x, y, 18, 'upper');
    else if (y < 68) {
      // The rune frieze: a recessed band between two ledges, runes cut into it that shine violet.
      const ly = y - 58;
      if (ly === 0) c = scale(BRICK[0], 1.25);
      else if (ly === 9) c = scale(BRICK[0], 0.6);
      else {
        c = scale(BRICK[2], 0.7);
        const gx = (x % 8) - 1, gy = ly - 1;
        if (gx >= 0 && gx < 5 && gy < 7 && glyphs[order[Math.floor(x / 8)]][gy * 5 + gx]) {
          c = VIOLET[2];
          g = rng.chance(0.25) ? VIOLET[4] : VIOLET[3];
        }
      }
    } else if (y < 84) c = brickAt(x, y, 68, 'lower');
    else c = x % 32 === 0 || y === 84 ? mortar : scale(BRICK[1], y === 85 ? 1.15 : 0.9);
    if (crack.has(y * W + x)) c = scale(c, 0.5);
    const d = (y - (H - 10 - ash(x, y) * 5)) / 10;
    if (d > 0) c = mix(c, ASH, Math.min(0.35, d * 0.35) * (0.7 + rng.next() * 0.3));
    return [c, g];
  });
  return { colour, glow };
}

/** The passages' walls, full height once: raw rock in strata, veined here and there with violet light. */
function tunnelWall(theme) {
  const W = 64, H = 90, rng = new RNG('underworld:tunnel');
  const rock = theme.wall.map(rgb), grain = noise(rng, W, H, 10, 14), band = noise(rng, W, H, 4, 3), blot = noise(rng, W, H, 5, 6);
  const crack = cracks(rng, W, H, 6, 22), veins = cracks(rng, W, H, 3, 36, false);
  return paintBoth(W, H, (x, y) => {
    const v = ((y + (band(x, y) - 0.5) * 14) / H) * 7;
    let c = scale(mix(rock[0], rock[2], grain(x, y)), (0.82 + rng.next() * 0.14) * (v % 1 < 0.08 ? 0.75 : 1));
    if (blot(x, y) > 0.7) c = mix(c, rock[1], 0.5);
    if (crack.has(y * W + x)) c = scale(c, 0.5);
    if (veins.has(y * W + x)) return [VIOLET[2], rng.chance(0.3) ? VIOLET[3] : VIOLET[2]];
    return [scale(c, 1 - Math.max(0, (y - 62) / 28) * 0.2), null];
  });
}

/** The temple's floor: great slabs of basalt, two to a tile each way, a groove round each; ash and cracks. */
function floor(theme) {
  const S = 64, rng = new RNG('underworld:floor');
  const pal = theme.floor.map(rgb), joint = rgb(theme.mortar), grit = noise(rng, S, S, 8), ash = noise(rng, S, S, 4), crack = cracks(rng, S, S, 4, 14);
  const shade = new Map(), circled = rng.int(0, 3);
  return paint(S, S, (x, y) => {
    const lx = x % 32, ly = y % 32, slab = Math.floor(x / 32) + Math.floor(y / 32) * 2;
    if (lx === 0 || ly === 0) return joint;
    if (!shade.has(slab)) shade.set(slab, { c: rng.pick(pal), k: 0.85 + rng.next() * 0.25 });
    const s = shade.get(slab), e = Math.min(lx, ly, 32 - lx, 32 - ly);
    let c = scale(s.c, s.k * (0.88 + grit(x, y) * 0.2 + (rng.next() - 0.5) * 0.08));
    if (e === 3) c = scale(c, 0.62); // the groove round the slab
    const r = Math.hypot(lx - 16, ly - 16);
    if (slab === circled && (Math.abs(r - 9) < 0.8 || Math.abs(r - 6) < 0.6)) c = scale(c, 0.6); // a carved ring
    if (crack.has(y * S + x)) c = scale(c, 0.55);
    if (ash(x, y) > 0.65) c = mix(c, ASH, 0.25);
    return c;
  });
}

/** The passages' floor: rock, grit and ash. */
function tunnelFloor(theme) {
  const S = 64, rng = new RNG('underworld:tunnelfloor');
  const pal = theme.floor.map(rgb), grit = noise(rng, S, S, 7), big = noise(rng, S, S, 3), crack = cracks(rng, S, S, 5, 14);
  return paint(S, S, (x, y) => {
    let c = scale(mix(pal[0], pal[1], big(x, y)), 0.8 + grit(x, y) * 0.35 + (rng.next() - 0.5) * 0.14);
    if (rng.chance(0.03)) c = mix(c, ASH, 0.5);
    if (rng.chance(0.02)) c = scale(c, 1.3); // pebbles
    return crack.has(y * S + x) ? scale(c, 0.5) : c;
  });
}

/** The vault: dark rock, glinting with specks of violet crystal. */
function ceiling(theme) {
  const S = 64, rng = new RNG('underworld:ceiling');
  const base = rgb(theme.ceiling), blot = noise(rng, S, S, 5), grain = noise(rng, S, S, 12), crack = cracks(rng, S, S, 5, 14);
  return paintBoth(S, S, (x, y) => {
    if (rng.chance(0.0045)) return [VIOLET[3], rng.chance(0.4) ? VIOLET[4] : VIOLET[3]];
    const c = scale(base, (0.9 + blot(x, y) * 0.5 + grain(x, y) * 0.25) * (0.92 + rng.next() * 0.12) * 1.15);
    return [crack.has(y * S + x) ? scale(c, 0.55) : c, null];
  });
}

/** A lava channel's sides (64×24: 2 m wide, 0.75 m deep): rock, glowing with the heat toward the lava. */
function channel(theme) {
  const W = 64, H = 24, rng = new RNG('underworld:lavabank');
  const rock = theme.wall.map(rgb), grain = noise(rng, W, H, 8, 4), veins = cracks(rng, W, H, 6, 10, true);
  return paintBoth(W, H, (x, y) => {
    const heat = Math.max(0, (y - 14) / 10) + (veins.has(y * W + x) && y > 8 ? 0.5 : 0);
    let c = scale(mix(rock[1], rock[2], grain(x, y)), 0.8 + rng.next() * 0.2);
    if (y < 2) c = scale(c, 1.15); // the worn lip
    c = mix(c, LAVA[2], Math.min(0.8, heat));
    const g = heat > 0.15 ? LAVA[Math.min(5, 1 + Math.floor(heat * 4 + rng.next() * 0.6))] : null;
    return [c, g];
  });
}

/** Lava: plates of crust, dark and cooling, breaking apart over the molten rock beneath. Tiles every way. */
function lava() {
  const S = 64, rng = new RNG('underworld:lava');
  const pts = Array.from({ length: 11 }, () => [rng.next() * S, rng.next() * S]), heat = noise(rng, S, S, 4);
  return paint(S, S, (x, y) => {
    let d1 = Infinity, d2 = Infinity;
    for (const [px, py] of pts) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const d = Math.hypot(x - px - ox, y - py - oy);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    const e = d2 - d1 - heat(x, y) * 2; // how far into a plate of crust
    if (e < 1.2) return LAVA[6];
    if (e < 2.4) return LAVA[5];
    if (e < 3.8) return LAVA[4];
    if (e < 5.5) return LAVA[3];
    return rng.chance(0.03) ? LAVA[3] : LAVA[e < 8 ? 2 : 1];
  });
}

export function underworldTextures(theme, toTexture) {
  const walls = wall(theme), tunnel = tunnelWall(theme), vault = ceiling(theme), banks = channel(theme);
  return {
    wall: toTexture(walls.colour),
    wallGlow: toTexture(walls.glow),
    wallFullHeight: true,
    tunnelWall: toTexture(tunnel.colour),
    tunnelGlow: toTexture(tunnel.glow),
    floor: toTexture(floor(theme)),
    tunnelFloor: toTexture(tunnelFloor(theme)),
    ceiling: toTexture(vault.colour),
    ceilingGlow: toTexture(vault.glow),
    channel: toTexture(banks.colour),
    channelGlow: toTexture(banks.glow),
    lava: toTexture(lava()),
  };
}
