import { RNG } from '../rng.js';
import { rgb, mix, scale, paint, noise } from './texturePaint.js';

// The water standing in pools (see pools.js), painted for each theme from its `pools.water` colours in config.js,
// [deep, murk, ripple, film]: clouds of murk over the deep, the rings of slow ripples, and a film floating on top
// (scum in the Sewers, bone dust in the Catacombs). A theme whose pools `glow` also gets `poolGlow`: its ripples and
// film shining faintly by themselves.

const S = 64;

export function poolTextures(theme, toTexture) {
  const rng = new RNG(`pool:${theme.name}`);
  const [deep, murk, ripple, film] = theme.pools.water.map(rgb);
  const cloud = noise(rng, S, S, 3), swell = noise(rng, S, S, 4), chop = noise(rng, S, S, 8), calm = noise(rng, S, S, 4);
  const skin = noise(rng, S, S, 5);
  const specks = new Set(Array.from({ length: 14 }, () => rng.int(0, S * S - 1)));
  const cols = [], lit = []; // each texel's colour, and how much of it shines
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let col = mix(deep, murk, cloud(x, y)), shine = 0;
      // Ripples: arcs of the contours of a slow swell, so they curve round its rises and hollows, never in lines, and
      // die away where the water lies calm.
      const r = Math.cos((swell(x, y) * 0.75 + chop(x, y) * 0.25) * Math.PI * 8), still = calm(x, y);
      if (r > 0.95 && still > 0.5) {
        col = mix(col, ripple, 0.6);
        shine = 0.8;
      } else if (r > 0.82 && still > 0.38) {
        col = mix(col, ripple, 0.2);
        shine = 0.25;
      }
      const f = skin(x, y);
      if (f > 0.7) {
        col = mix(col, film, Math.min(0.45, (f - 0.7) * 3));
        shine = Math.max(shine, 0.4);
      }
      if (specks.has(y * S + x)) {
        col = film;
        shine = 1;
      }
      cols.push(col.map((v) => v * (0.94 + rng.next() * 0.1)));
      lit.push(shine);
    }
  }
  const glow = theme.pools.glow ?? 0;
  return {
    pool: toTexture(paint(S, S, (x, y) => cols[y * S + x])),
    poolGlow: glow ? toTexture(paint(S, S, (x, y) => scale(cols[y * S + x], lit[y * S + x] * glow * 2))) : null,
  };
}
