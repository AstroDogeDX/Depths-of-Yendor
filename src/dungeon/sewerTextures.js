import { RNG } from '../rng.js';
import { rgb, mix, scale, paint, noise, bricks } from './texturePaint.js';

// The Sewers' own textures, painted pixel by pixel like the others in textures.js: slimy brickwork with a damp
// band and a tide mark along the bottom of the walls, wet cobbles, a brick vault overhead, algae-furred channel
// walls, murky water and puddles.

/**
 * Walls span their full height (2.8 m) once, so the damp reaches the same way up every wall: 64×90 texels,
 * top row at the top of the wall.
 */
function wall(theme) {
  const W = 64, H = 90, rng = new RNG('sewer:wall');
  const pal = theme.wall.map(rgb), mortar = rgb(theme.mortar), moss = rgb(theme.moss), tide = rgb('#5a5234');
  const damp = noise(rng, W, H, 8, 3), blot = noise(rng, W, H, 6, 8), grain = () => 0.9 + rng.next() * 0.18;
  const shade = new Map();
  // Grime runs down from the ceiling in a few places.
  const streaks = Array.from({ length: 6 }, () => ({ x: rng.int(0, W - 1), y0: rng.int(0, 30), len: rng.int(18, 55), w: rng.int(1, 2) }));
  return paint(W, H, (x, y) => {
    const b = bricks(x, y, W, 32, 10);
    let col;
    if (b.mortar) col = mortar;
    else {
      const key = `${b.row}:${b.col}`;
      if (!shade.has(key)) shade.set(key, { c: rng.pick(pal), k: 0.8 + rng.next() * 0.3, stained: rng.chance(0.08) });
      const s = shade.get(key);
      let k = s.k * grain() * (s.stained ? 0.72 : 1);
      if (b.ly === 1) k *= 1.1; // top edges of the bricks catch the light
      if (b.ly === 9 || b.lx === 31) k *= 0.75;
      col = scale(s.c, k);
      if (blot(x, y) > 0.68) col = mix(col, moss, 0.35); // lichen
    }
    // The damp band: the bottom 60 cm or so, darker and greener, with a tide mark along its top.
    const line = 70 + (damp(x, y) - 0.5) * 10;
    if (y > line) {
      col = mix(scale(col, 0.72), moss, 0.25 + Math.min(0.45, (y - line) / 30));
      if (y > 84 && rng.chance(0.35)) col = mix(col, moss, 0.5); // algae at the foot
    } else if (y > line - 2) col = mix(col, tide, 0.5);
    for (const s of streaks) {
      const dx = Math.abs(((x - s.x + W + W / 2) % W) - W / 2);
      if (dx < s.w && y >= s.y0 && y < s.y0 + s.len) col = mix(scale(col, 0.72), moss, 0.12 * (1 - (y - s.y0) / s.len));
    }
    if (y < 6) col = scale(col, 0.82 + y * 0.03); // shadowed where the vault springs
    return col;
  });
}

/** Wet cobbles: rounded setts in dark grout, with puddled hollows that catch the light. */
function floor(theme) {
  const S = 64, rng = new RNG('sewer:floor');
  const pal = theme.floor.map(rgb), grout = scale(rgb(theme.mortar), 0.9), moss = rgb(theme.moss);
  const wet = noise(rng, S, S, 4), grain = () => 0.88 + rng.next() * 0.2;
  // Setts: points jittered round a grid, so the cells tile and stay roughly even.
  const N = 5, pts = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    pts.push({ x: (i + 0.5 + rng.range(-0.3, 0.3)) * (S / N), y: (j + 0.5 + rng.range(-0.3, 0.3)) * (S / N), c: rng.pick(pal), k: 0.8 + rng.next() * 0.35 });
  }
  return paint(S, S, (x, y) => {
    let d1 = Infinity, d2 = Infinity, best = null;
    for (const p of pts) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const d = Math.hypot(x - p.x - ox, y - p.y - oy);
      if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
    }
    const edge = d2 - d1;
    let col;
    if (edge < 1.6) col = rng.chance(0.2) ? mix(grout, moss, 0.3) : grout;
    else {
      // Domed: lighter toward the middle of each sett.
      col = scale(best.c, best.k * grain() * (0.82 + Math.min(1, edge / 7) * 0.25));
    }
    const w = wet(x, y);
    if (w > 0.58) {
      col = mix(scale(col, 0.7), [30, 40, 42], 0.25);
      if (w > 0.66 && rng.chance(0.012)) col = [96, 108, 100]; // a glint of standing water
    }
    return col;
  });
}

/** The vault overhead: dark brick, dripping. */
function ceiling(theme) {
  const S = 64, rng = new RNG('sewer:ceiling');
  const base = rgb(theme.ceiling), mortar = scale(rgb(theme.mortar), 0.8), moss = rgb(theme.moss);
  const blot = noise(rng, S, S, 5);
  const shade = new Map();
  return paint(S, S, (x, y) => {
    const b = bricks(x, y, S, 32, 8);
    if (b.mortar) return mortar;
    const key = `${b.row}:${b.col}`;
    if (!shade.has(key)) shade.set(key, 0.85 + rng.next() * 0.45);
    let col = scale(base, shade.get(key) * (0.9 + rng.next() * 0.15) * 1.35);
    if (blot(x, y) > 0.66) col = mix(col, moss, 0.3);
    if (blot(x, y) < 0.25) col = scale(col, 0.75); // water stains
    return col;
  });
}

/** The sides of a channel, from the water up to the floor (64×16 texels: 2 m wide, 0.5 m tall). */
function channel(theme) {
  const W = 64, H = 16, rng = new RNG('sewer:channel');
  const pal = theme.wall.map(rgb), mortar = rgb(theme.mortar), moss = rgb(theme.moss);
  const shade = new Map();
  return paint(W, H, (x, y) => {
    const b = bricks(x, y, W, 32, 8);
    let col = b.mortar ? mortar : (() => {
      const key = `${b.row}:${b.col}`;
      if (!shade.has(key)) shade.set(key, { c: rng.pick(pal), k: 0.65 + rng.next() * 0.25 });
      const s = shade.get(key);
      return scale(s.c, s.k * (0.9 + rng.next() * 0.15));
    })();
    // Furred with algae, thickest down by the water.
    col = mix(col, moss, Math.min(0.85, 0.2 + (y / H) * 0.6 + (rng.chance(0.2) ? 0.2 : 0)));
    if (y >= H - 2) col = scale(col, 0.7); // the wet line
    return col;
  });
}

/** Murky water: ripple crests and floating scum, tiling in both directions (it scrolls along the channel). */
function water() {
  const S = 64, rng = new RNG('sewer:water');
  const warp = noise(rng, S, S, 4), murk = noise(rng, S, S, 3);
  const deep = rgb('#151c10'), mid = rgb('#222c18'), crest = rgb('#3a4830'), scum = rgb('#56603c');
  const specks = new Set(Array.from({ length: 18 }, () => rng.int(0, S * S - 1)));
  return paint(S, S, (x, y) => {
    let col = mix(deep, mid, murk(x, y));
    // Low ripples across the flow, broken up so they don't read as stripes.
    const r = Math.sin(((y + warp(x, y) * 6) / S) * Math.PI * 2 * 8 + Math.sin((x / S) * Math.PI * 4) * 0.6);
    if (r > 0.9 && murk(x, y) > 0.35) col = mix(col, crest, 0.7);
    else if (r > 0.7) col = mix(col, crest, 0.25);
    if (specks.has(y * S + x)) col = scum;
    return col;
  });
}

/** A puddle: a ragged blot of dark water with a lighter lip, transparent round it. */
function puddle(seed) {
  const S = 32, rng = new RNG(`sewer:puddle:${seed}`);
  const edge = noise(rng, S, S, 4), sheen = noise(rng, S, S, 3);
  return paint(S, S, (x, y) => {
    const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2) + (edge(x, y) - 0.5) * 0.5;
    if (d > 0.9) return [0, 0, 0, 0];
    const col = mix([22, 30, 26], [60, 72, 62], sheen(x, y) * 0.6);
    return d > 0.78 ? [...scale(col, 1.3), 200] : [...col, 225];
  });
}

export function sewerTextures(theme, toTexture) {
  return {
    wall: toTexture(wall(theme)),
    wallFullHeight: true,
    floor: toTexture(floor(theme)),
    ceiling: toTexture(ceiling(theme)),
    channel: toTexture(channel(theme)),
    water: toTexture(water()),
    puddles: [0, 1, 2].map((i) => toTexture(puddle(i))),
  };
}
