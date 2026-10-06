import * as THREE from 'three';
import { HUNGER_HUNGRY, HUNGER_FAMISHED } from '../config.js';
import { RNG } from '../rng.js';
import { SENSED_LAYER } from '../monsters/models.js';

// What's afflicting you shows over your view (see STATUSES in status.js), as monsters' show on them (fx/statusFx.js):
//   burning      a fiery glow round the edges, deepest below, flames licking up from the bottom (higher at the sides),
//                embers rising, and the air shimmering low down
//   chilled      the view cools and pales, frost creeps in from the edges, thickest in the corners, and snow drifts down
//   frozen       the frost thickens and the view goes blue and grey, cracked across like a sheet of ice
//   poisoned     a sickly purple round the edges, throbbing, the view swimming, bubbles rising up the sides
//   malediction  a dark purple ichor round the edges, the colour soured a little, and thick drips of the taint creeping
//                down from the top, each catching the light in magenta at its tip
//   bleeding     red round the edges, beating with each second's loss, and blood running down from the top
//   wet          drops of water by the edges, each a little lens on the view, sliding down
//   oiled        a dark amber smear round the edges, with a sheen sliding over it
//   weakened     the colour drains out, and the edges darken
//   confused     the view swims, and a second image of it drifts about the first, lilac at the edges
//   paralysed    grey and blue, static crackling round the edges, the view jolting in fits as you strain
//   charmed      a rosy glow, pink at the edges, hearts floating up the sides
//   heartbroken  a cold grey round the edges, the colour drained a little
//   hasted       streaks rushing out past the edges
//   mind vision  violet at the edges, rings rippling out, and you sense (below)
//   sensing      (mind vision, or the Eye of the Deep attuned) every creature on the floor outlined in violet, walls or
//                no walls (see sense): brighter the nearer it is
//   invisible    the edges shimmer, as if the air there bent round you
//   hungry       next to nothing; famished, the colour drains toward the edges; starving, more, the edges dark, and
//                now and then it all swims as you nearly faint
//   hunted       (carrying the Amulet) the edges darken red with a heartbeat
//   winded       the edges darken and lighten with your breath
//   wounded      (below WOUNDED of your health) your heart pounding in red at the edges, faster as you weaken, the
//                colour draining and the dark closing in; near death, veins creeping in from the edges (growVeins)
//   healing      a warm green glow round the edges, swelling and ebbing, green crosses rising up the sides
// Blindness has its own darkness (#dark in the page, and the lantern's light: see Game.updateCamera), and a blow its own
// red flash (#hurt).
//
// It's one pass over the finished frame (world, hands and all), at the game's own resolution: the frame is copied, and
// drawn again through a shader that bends it, grades it and paints over it in chunky dithered pixels to match the
// textures (an effect pixel is a pixel at 270 lines, however finely the view's drawn). Each effect fades in and out over
// the seconds EFFECTS gives it; with none showing, the pass is skipped.

/**
 * Each effect's uniform: how strongly it shows (`show`: 0 to 1), fading in over `in` seconds and out over `out`, and
 * eased in and out of that, unless it's `raw` (your wounds, which follow your health as it is).
 */
const EFFECTS = {
  uBurn: { show: (g, p) => p.status.burning > 0, in: 0.4, out: 1 },
  uChill: { show: (g, p) => p.status.chilled > 0, in: 0.6, out: 1.5 },
  uFrozen: { show: (g, p) => p.status.frozen > 0, in: 0.15, out: 1.2 },
  uPoison: { show: (g, p) => p.status.poisoned > 0, in: 0.8, out: 1.2 },
  uMalediction: { show: (g, p) => p.status.malediction > 0, in: 0.6, out: 1.2 },
  uBleed: { show: (g, p) => p.status.bleeding > 0, in: 0.5, out: 1 },
  uWet: { show: (g, p) => p.status.wet > 0, in: 0.5, out: 1.5 },
  uOil: { show: (g, p) => p.status.oiled > 0, in: 0.5, out: 1.5 },
  uWeak: { show: (g, p) => p.status.weakened > 0, in: 1, out: 1 },
  uConfused: { show: (g, p) => p.status.confused > 0, in: 0.8, out: 1.2 },
  uParalysed: { show: (g, p) => p.status.paralysed > 0, in: 0.2, out: 0.6 },
  uCharmed: { show: (g, p) => p.status.charmed > 0, in: 0.8, out: 1 },
  uHeartbroken: { show: (g, p) => p.status.heartbroken > 0, in: 1, out: 1.5 },
  uHaste: { show: (g, p) => p.status.hasted > 0, in: 0.5, out: 0.8 },
  uMind: { show: (g, p) => p.status.mindvision > 0, in: 0.8, out: 1 },
  uSense: { show: (g, p) => p.status.mindvision > 0 || p.hasArtefact('eye'), in: 0.6, out: 0.8 },
  uInvisible: { show: (g, p) => p.status.invisible > 0, in: 0.6, out: 0.8 },
  uHunger: { show: (g, p) => (p.hunger <= 0 ? 1 : p.hunger < HUNGER_FAMISHED ? 0.55 : p.hunger < HUNGER_HUNGRY ? 0.12 : 0), in: 2, out: 2 },
  uHunted: { show: (g) => g.hunted, in: 1.5, out: 1.5 },
  uWinded: { show: (g, p) => p.winded, in: 0.4, out: 0.8 },
  uWounds: { show: (g, p) => Math.min(1, Math.max(0, (WOUNDED - p.hp / p.maxHp) / WOUNDED)), in: 0.3, out: 0.8, raw: true },
  uHealing: { show: (g, p) => p.status.healing > 0, in: 0.4, out: 1 },
};
const NAMES = Object.keys(EFFECTS);
const WOUNDED = 0.45; // the share of your health below which your wounds show, more and more as it runs out
const VEIN_REACH = 0.2; // the furthest in from the edge that a vein runs, at death's door: a share of the view's height
const smooth = (x) => x * x * (3 - 2 * x);

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uWorld; // the frame before your hands were drawn over it (only while you're invisible)
uniform sampler2D uSensed; // the creatures sensed (only with mind vision): how bright each one's outline, where it is
uniform sampler2D uVeins;  // the veins of the wounded (see growVeins)
uniform vec2 uRes;   // the frame, in pixels
uniform float uPix;  // the frame's pixels to an effect pixel
uniform float uTime;
${NAMES.map((n) => `uniform float ${n};`).join('\n')}
varying vec2 vUv;

// The torches' flame colours (fx/flame.js). Colours here are display colours, like the frame's.
const vec3 F_WHITE = vec3(1.0, 0.957, 0.784);
const vec3 F_YELLOW = vec3(1.0, 0.824, 0.29);
const vec3 F_ORANGE = vec3(1.0, 0.54, 0.11);
const vec3 F_RED = vec3(0.82, 0.25, 0.09);
const int HEART[6] = int[6](8, 28, 62, 127, 127, 54); // a heart 7 pixels across, its bottom row first

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 3.7) * 0.3 + noise(p * 4.3 + 9.1) * 0.15; }
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec2 px;     // the effect pixel this is
vec2 grid;   // effect pixels across and up
float dith;  // its place in the dither pattern
float rv;    // how far out it is: 0 in the middle, about 1 at the middle of an edge, more in the corners

/** v (0 to 1) in n dithered steps: a gradient comes out in bands of pixels, like the textures'. */
float steps(float v, float n) { return clamp(floor(v * n + dith) / n, 0.0, 1.0); }

/** The rim of the view tinted toward tint, from rv = from out to rv = to, by up to k. */
vec3 rim(vec3 col, vec3 tint, float from, float to, float k) { return mix(col, tint, steps(smoothstep(from, to, rv) * k, 4.0)); }

/**
 * A sprite drifting with the grid of cells (size pixels across) that it's in, moved off pixels: there's one in a share
 * (chance) of cells, somewhere in its cell, and none in a cell nearer the middle than apart (a share of the width,
 * either side). Leaves d where this pixel is from the sprite's corner.
 */
bool sprite(float size, vec2 off, float chance, float seed, float apart, out vec2 d) {
  vec2 sp = px - off, id = floor(sp / size);
  d = vec2(-1.0);
  if (hash(id + seed) >= chance || abs(((id.x + 0.5) * size + off.x) / grid.x - 0.5) < apart) return false;
  d = sp - id * size - floor(vec2(hash(id + seed + 1.7), hash(id + seed + 4.3)) * (size - 10.0)) - 2.0;
  return true;
}

bool heart(vec2 d) {
  if (d.x < 0.0 || d.y < 0.0 || d.x > 6.0 || d.y > 5.0) return false;
  ivec2 i = ivec2(d);
  return ((HEART[i.y] >> (6 - i.x)) & 1) == 1;
}

bool plus(vec2 d) {
  return d.x >= 0.0 && d.y >= 0.0 && d.x <= 5.0 && d.y <= 5.0 && ((d.x >= 2.0 && d.x <= 3.0) || (d.y >= 2.0 && d.y <= 3.0));
}

bool flake(vec2 d) {
  vec2 e = abs(d - 2.0);
  return (e.x == 0.0 && e.y <= 2.0) || (e.y == 0.0 && e.x <= 2.0) || (e.x == 1.0 && e.y == 1.0);
}

void main() {
  px = floor(gl_FragCoord.xy / uPix);
  grid = floor(uRes / uPix);
  dith = bayer4(px);
  vec2 uv = (px + 0.5) / grid, one = 1.0 / grid;
  float aspect = uRes.x / uRes.y, t = uTime;
  rv = length((uv - 0.5) * 2.0 * vec2(1.0, 0.82));
  vec2 ed = vec2(min(uv.x, 1.0 - uv.x) * aspect, min(uv.y, 1.0 - uv.y));
  // How near the edges it is, in screen heights: nearer in a corner, where two edges meet.
  float edge = 0.5 * (min(ed.x, ed.y) + 1.0 / (1.0 / max(ed.x, 1e-3) + 1.0 / max(ed.y, 1e-3)));
  float side = smoothstep(0.08, 0.48, abs(uv.x - 0.5)); // 0 in the middle, 1 at the sides
  float fit = pow(max(0.0, sin(t * 2.2)), 3.0); // a fit of straining, every few seconds
  vec2 d;

  // --- What bends the view: where the frame is looked up ---
  vec2 s = vUv;
  if (uBurn > 0.001) s.x += (noise(vec2(px.y * 0.4, t * 7.0)) - 0.5) * 2.0 * one.x * uBurn * (1.0 - smoothstep(0.0, 0.45, uv.y));
  if (uPoison > 0.001) s += vec2(sin(uv.y * 8.0 + t * 1.7), sin(uv.x * 6.0 + t * 1.3)) * 1.5 * one * uPoison;
  if (uConfused > 0.001) s += vec2(sin(uv.y * 5.0 + t * 2.3), cos(uv.x * 4.0 + t * 1.9)) * 2.0 * one * uConfused;
  if (uInvisible > 0.001) {
    vec2 w = vec2(noise(px * 0.15 + t * 1.5), noise(px * 0.15 - t * 1.5 + 9.0)) - 0.5;
    s += w * 4.0 * one * uInvisible * smoothstep(0.6, 1.25, rv);
  }
  if (uHunger > 0.75) s += vec2(sin(uv.y * 4.0 + t * 1.1), cos(uv.x * 3.0 + t * 0.8)) * 2.5 * one * pow(max(0.0, sin(t * 0.9)), 6.0) * (uHunger - 0.75) * 4.0;
  if (uParalysed > 0.001) s.x += (hash(vec2(floor(t * 18.0), 3.0)) - 0.5) * 2.0 * one.x * uParalysed * fit;
  // Water on your face: drops near the edges, each a little lens turning what's behind it upside down, sliding down.
  float drop = 0.0;
  if (uWet > 0.001) {
    float size = 40.0;
    vec2 id = floor(px / size), cc = (id + 0.5) * size / grid;
    float h = hash(id + 11.0);
    if (min(min(cc.x, 1.0 - cc.x) * aspect, min(cc.y, 1.0 - cc.y)) < 0.18 && h < 0.5 * uWet) {
      float ph = fract(t / (3.0 + 3.0 * hash(id + 3.0)) + h * 5.0);
      float top = size * 0.85, fall = size * 0.7 * ph * ph;
      vec2 at = id * size + floor(vec2(size * (0.25 + 0.5 * hash(id + 7.0)), top - fall));
      float r = 3.0 + floor(2.0 * hash(id + 9.0));
      vec2 e = px - at;
      if (ph < 0.92) {
        if (dot(e, e) <= r * r + r) {
          drop = dot(e, e) > r * r - r ? 1.0 : 2.0;
          s = (at + 0.5 - e * 1.6) / grid;
          if (e.x == -1.0 && e.y == 1.0) drop = 3.0;
        } else if (abs(e.x) <= 1.0 && e.y > 0.0 && e.y < fall) drop = 0.5; // (the wet trail it leaves)
      }
    }
  }

  vec3 col = texture2D(uScene, s).rgb;
  if (uInvisible > 0.001) col = mix(col, texture2D(uWorld, s).rgb, 0.6 * uInvisible); // your hands, ghostly
  if (uConfused > 0.001) col = mix(col, texture2D(uScene, s + vec2(sin(t * 1.3), cos(t * 0.9)) * 3.0 * one * uConfused).rgb, 0.4 * uConfused);
  // (A drop: its glint, the view through it lifted a little, a pale rim; the trail behind it, a faint sheen.)
  if (drop > 2.5) col = vec3(0.95, 0.98, 1.0);
  else if (drop > 1.5) col = col * vec3(0.95, 1.0, 1.1) + vec3(0.07, 0.09, 0.13);
  else if (drop > 0.75) col = mix(col, vec3(0.55, 0.7, 0.86), 0.6);
  else if (drop > 0.0) col = col * 1.1 + vec3(0.04, 0.06, 0.09);

  // Wounded, your heart pounds (lub-dub), faster as you weaken.
  float beat = 0.0;
  if (uWounds > 0.001) {
    float b = fract(t / mix(1.1, 0.5, uWounds));
    beat = exp(-b * 14.0) + 0.55 * step(0.16, b) * exp(-(b - 0.16) * 14.0);
  }

  // --- How the view's coloured ---
  float cold = clamp(uChill * 0.45 + uFrozen, 0.0, 1.0);
  float grey = 0.35 * uWeak + 0.45 * uParalysed + 0.35 * uFrozen + 0.12 * uChill + 0.25 * uHeartbroken + 0.15 * uInvisible
    + uHunger * (0.2 + 0.4 * smoothstep(0.3, 1.2, rv)) + uWounds * (0.15 + 0.55 * smoothstep(0.2, 1.1, rv));
  col = mix(col, vec3(luma(col)), clamp(grey, 0.0, 0.85));
  col *= mix(vec3(1.0), vec3(0.84, 0.96, 1.14), 0.35 * uChill + 0.45 * uFrozen);
  col *= mix(vec3(1.0), vec3(1.02, 0.84, 1.08), 0.3 * uPoison);
  col *= mix(vec3(1.0), vec3(0.92, 0.8, 0.96), 0.4 * uMalediction);
  col *= mix(vec3(1.0), vec3(0.92, 0.92, 1.1), 0.35 * uParalysed);
  col += (vec3(1.0, 0.72, 0.84) - col) * 0.07 * uCharmed;
  col += (vec3(0.85, 1.0, 0.75) - col) * 0.05 * uHealing;

  // --- The rims of the view ---
  if (uBurn > 0.001) {
    float flick = 0.8 + 0.2 * noise(vec2(t * 8.0, 1.3));
    float v = smoothstep(0.65, 1.35, rv) * 0.5 + (1.0 - smoothstep(0.0, 0.3, uv.y)) * 0.3;
    col = mix(col, vec3(0.9, 0.28, 0.05), steps(v * flick * uBurn, 4.0) * 0.6);
  }
  if (cold > 0.001) col = rim(col, vec3(0.62, 0.84, 1.0), 0.6, 1.3, 0.5 * cold);
  if (uPoison > 0.001) col = rim(col, vec3(0.42, 0.12, 0.58), 0.5, 1.35, 0.55 * (0.7 + 0.3 * sin(t * 2.1)) * uPoison);
  if (uMalediction > 0.001) col = rim(col, vec3(0.13, 0.02, 0.17), 0.45, 1.3, (0.55 + 0.15 * sin(t * 1.4)) * uMalediction);
  if (uWet > 0.001) col = rim(col, vec3(0.2, 0.32, 0.45), 0.7, 1.35, 0.35 * uWet);
  if (uBleed > 0.001) col = rim(col, vec3(0.45, 0.0, 0.02), 0.55, 1.3, (0.4 + 0.25 * exp(-fract(t) * 5.0)) * uBleed);
  if (uOil > 0.001) {
    float v = smoothstep(0.6, 1.3, rv + (fbm(px / grid.y * vec2(6.0, 2.0) + vec2(0.0, t * 0.05)) - 0.5) * 0.35) * uOil;
    col = mix(col, vec3(0.3, 0.2, 0.05), steps(v * 0.7, 4.0));
    // (its sheen: the swirling bands of a film of oil)
    float film = fbm(px / grid.y * 5.0 + vec2(t * 0.05, 0.0));
    if (v > 0.15 && abs(fract(film * 5.0 + t * 0.15) - 0.5) < 0.06) col = mix(col, vec3(1.0, 0.85, 0.45), 0.22);
  }
  if (uWeak > 0.001) col = rim(col, vec3(0.05, 0.04, 0.03), 0.55, 1.3, 0.45 * uWeak);
  if (uConfused > 0.001) col = rim(col, vec3(0.75, 0.55, 0.95), 0.65, 1.35, 0.4 * uConfused);
  if (uParalysed > 0.001) col = rim(col, vec3(0.5, 0.55, 0.85), 0.65, 1.35, 0.4 * uParalysed);
  if (uCharmed > 0.001) col = rim(col, vec3(1.0, 0.45, 0.7), 0.55, 1.35, 0.5 * uCharmed);
  if (uHeartbroken > 0.001) col = rim(col, vec3(0.25, 0.27, 0.35), 0.6, 1.3, 0.4 * uHeartbroken);
  if (uMind > 0.001) {
    col = rim(col, vec3(0.55, 0.35, 0.9), 0.65, 1.35, 0.45 * uMind);
    if (fract(rv * 2.0 - t * 0.35) > 0.94 && rv > 0.55) col = mix(col, vec3(0.8, 0.65, 1.0), 0.35 * uMind);
  }
  if (uInvisible > 0.001) col = rim(col, vec3(0.75, 0.85, 0.9), 0.7, 1.35, 0.35 * uInvisible);
  if (uHunger > 0.001) {
    float swoon = uHunger > 0.75 ? pow(max(0.0, sin(t * 0.9)), 6.0) : 0.0; // starving, now and then it all swims
    col = rim(col, vec3(0.04, 0.03, 0.02), 0.45, 1.3, (0.45 + 0.35 * swoon) * uHunger);
  }
  if (uHunted > 0.001) {
    float b = fract(t / 1.15), beat = exp(-b * 16.0) + 0.6 * step(0.18, b) * exp(-(b - 0.18) * 16.0); // lub-dub
    col = rim(col, vec3(0.4, 0.03, 0.02), 0.7, 1.35, (0.25 + 0.45 * beat) * uHunted);
  }
  if (uWinded > 0.001) col = rim(col, vec3(0.0), 0.6, 1.3, (0.2 + 0.25 * (0.5 + 0.5 * sin(t * 4.5))) * uWinded);
  if (uWounds > 0.001) {
    // Red throbbing in from the edges with each beat, deeper as you weaken, and the dark closing in behind it.
    col = rim(col, vec3(0.62, 0.02, 0.03), mix(0.95, 0.45, uWounds), 1.35, (0.3 + 0.45 * beat) * sqrt(uWounds) * 0.85);
    col = rim(col, vec3(0.05, 0.0, 0.0), mix(1.15, 0.55, uWounds), 1.45, (0.35 + 0.2 * beat) * uWounds * uWounds);
  }
  if (uHealing > 0.001) col = rim(col, vec3(0.45, 0.85, 0.35), 0.6, 1.35, (0.3 + 0.15 * sin(t * 2.6)) * uHealing);

  // --- What's over the view ---
  // Burning: flames licking up from the bottom, taller at the sides; embers rising.
  if (uBurn > 0.001) {
    float fx = px.x / grid.y * 14.0;
    float n = noise(vec2(fx, t * 2.4)) * 0.65 + noise(vec2(fx * 2.3 + 4.0, t * 3.9)) * 0.35;
    float top = (0.04 + 0.17 * side) * uBurn * max(0.0, 1.6 * n - 0.35); // (with gaps between the flames)
    if (uv.y < top) {
      float f = 1.15 - uv.y / top;
      f -= noise(vec2(fx * 1.9, uv.y * 40.0 - t * 7.0)) * 0.45 * (1.0 - f * 0.5);
      if (f > 0.14) col = mix(col, f > 0.85 ? F_WHITE : f > 0.62 ? F_YELLOW : f > 0.38 ? F_ORANGE : F_RED, 0.9);
    }
    if (uv.y < 0.45 && sprite(16.0, vec2(floor(sin(t * 2.0) * 2.0), floor(t * 30.0)), 0.25 * uBurn, 41.0, 0.0, d)
      && d == vec2(0.0)) col = mix(F_YELLOW, F_RED, uv.y / 0.45);
  }
  // Cold: frost creeping in from the edges, thickest in the corners, veined with crystals; snow drifting down.
  if (cold > 0.001) {
    vec2 fp = px / grid.y * 8.0;
    float reach = 0.03 + 0.06 * uChill + 0.16 * uFrozen;
    float f = (reach * (0.5 + fbm(fp)) - edge) / reach;
    if (f > 0.0) {
      float vein = 1.0 - abs(noise(fp * 3.0 + 3.1) - 0.5) * 2.0;
      vec3 ice = vein > 0.93 ? vec3(0.9, 0.96, 1.0) : mix(vec3(0.5, 0.68, 0.82), vec3(0.8, 0.9, 0.98), fbm(fp * 2.0 + 5.0));
      col = mix(col, ice, steps(clamp(f * 2.0, 0.0, 1.0), 3.0) * 0.8);
    }
    float snow = max(uChill, uFrozen * 0.6);
    for (int i = 0; i < 2; i++) {
      float fi = float(i), size = 28.0 + 14.0 * fi;
      if (sprite(size, vec2(floor(sin(t * 0.6 + fi * 2.0) * 4.0), -floor(t * (9.0 + 5.0 * fi))), 0.35 * snow, 13.0 * fi + 50.0, 0.0, d)
        && flake(d)) col = mix(col, vec3(0.92, 0.97, 1.0), 0.8 * (0.35 + 0.65 * smoothstep(0.3, 1.0, rv)));
    }
  }
  // Frozen: the view cracked across like a sheet of ice, each shard its own shade, the cracks fainter in the middle.
  if (uFrozen > 0.001) {
    vec2 g = (uv - 0.5) * vec2(aspect, 1.0) * 3.0 + 7.0;
    g += (vec2(noise(g * 3.0), noise(g * 3.0 + 7.0)) - 0.5) * 0.35; // (crooked)
    vec2 gi = floor(g), gf = fract(g), id = gi;
    float d1 = 8.0, d2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 o = vec2(float(i), float(j)), pt = o + vec2(hash(gi + o), hash(gi + o + 19.7)) * 0.8 + 0.1;
        float dd = length(pt - gf);
        if (dd < d1) { d2 = d1; d1 = dd; id = gi + o; } else if (dd < d2) d2 = dd;
      }
    }
    col = mix(col, col * (0.86 + 0.28 * hash(id)) + vec3(0.04, 0.06, 0.09), 0.5 * uFrozen);
    if (d2 - d1 < one.y * 3.0 * 1.3) col = mix(col, vec3(0.94, 0.99, 1.0), (0.5 + 0.35 * smoothstep(0.3, 1.0, rv)) * uFrozen);
  }
  // Poisoned: bubbles rising up the sides.
  if (uPoison > 0.001 && sprite(24.0, vec2(floor(sin(t * 1.4) * 2.0), floor(t * 18.0)), 0.18 * uPoison, 31.0, 0.33, d)) {
    vec2 e = d - 2.0;
    float r2 = dot(e, e);
    if (e == vec2(-1.0, 1.0)) col = vec3(0.98, 0.9, 1.0);
    else if (r2 >= 2.5 && r2 <= 5.5) col = vec3(0.72, 0.42, 0.92);
  }
  // Bleeding: blood running down from the top.
  if (uBleed > 0.001) {
    float lane = floor(px.x / 2.0), h = hash(vec2(lane, 5.0));
    if (h < (0.04 + 0.16 * side) * uBleed) {
      float ph = fract(t * (0.05 + 0.07 * hash(vec2(lane, 9.0))) + h * 13.0);
      float len = ph * (0.15 + 0.3 * hash(vec2(lane, 2.0))), down = 1.0 - uv.y;
      if (down < len) col = mix(col, down > len - one.y * 2.0 ? vec3(0.75, 0.05, 0.06) : vec3(0.5, 0.02, 0.03), 0.85 * (1.0 - smoothstep(0.75, 1.0, ph)));
    }
  }
  // Malediction: thick drips of the taint creeping down from the top, three pixels wide, dark, catching the light in
  // magenta at their tips, oftener toward the sides.
  if (uMalediction > 0.001) {
    float lane = floor(px.x / 3.0), h = hash(vec2(lane, 17.0));
    if (h < (0.05 + 0.2 * side) * uMalediction) {
      float ph = fract(t * (0.02 + 0.03 * hash(vec2(lane, 23.0))) + h * 7.0);
      float len = ph * (0.08 + 0.22 * hash(vec2(lane, 29.0))), down = 1.0 - uv.y;
      if (down < len) col = mix(col, down > len - one.y * 2.0 ? vec3(0.86, 0.32, 0.76) : vec3(0.17, 0.03, 0.22), 0.92 * (1.0 - smoothstep(0.8, 1.0, ph)));
    }
  }
  // Paralysed: static crackling round the edges, worst as you strain.
  if (uParalysed > 0.001 && hash(px + floor(t * 14.0) * 17.0) > 1.0 - 0.06 * smoothstep(0.85, 1.3, rv) * (0.3 + 0.7 * fit) * uParalysed) {
    col = vec3(0.75, 0.85, 1.0);
  }
  // Charmed: hearts floating up the sides.
  if (uCharmed > 0.001 && sprite(30.0, vec2(floor(sin(t * 0.8) * 3.0), floor(t * 14.0)), 0.2 * uCharmed, 21.0, 0.3, d) && heart(d)) {
    col = d == vec2(1.0, 4.0) ? vec3(1.0) : vec3(1.0, 0.36, 0.62);
  }
  // Healing: green crosses rising up the sides, each with a glint.
  if (uHealing > 0.001 && sprite(28.0, vec2(floor(sin(t * 0.9) * 2.0), floor(t * 16.0)), 0.22 * uHealing, 61.0, 0.3, d) && plus(d)) {
    col = d == vec2(2.0, 4.0) ? vec3(1.0, 0.97, 0.8) : (d.x >= 3.0 && d.y <= 2.0) ? vec3(0.35, 0.7, 0.3) : vec3(0.6, 0.95, 0.55);
  }
  // Near death: veins creeping in from the edges (see growVeins), further the nearer death, throbbing with each beat;
  // each a little lighter down its middle.
  if (uWounds > 0.5) {
    vec4 v = texture2D(uVeins, (px + 0.5) / grid);
    if (v.a > 0.5 && v.r <= (uWounds - 0.5) * 2.0) {
      vec3 vc = mix(vec3(0.32, 0.0, 0.03), vec3(0.6, 0.04, 0.05), beat);
      col = v.g > 0.75 ? mix(col, vc, 0.9) : mix(col, vc * 0.6, 0.7);
    }
  }
  // Sensing: an outline round every creature sensed, two pixels wide, brightest next to it, pulsing slowly.
  if (uSense > 0.001 && texture2D(uSensed, (px + 0.5) / grid).r < 0.01) {
    float glow = 0.0;
    for (int j = -2; j <= 2; j++) {
      for (int i = -2; i <= 2; i++) {
        int out1 = abs(i) + abs(j);
        if (out1 == 0 || out1 > 3) continue;
        glow = max(glow, texture2D(uSensed, (px + vec2(float(i), float(j)) + 0.5) / grid).r * (out1 == 1 ? 1.0 : 0.55));
      }
    }
    if (glow > 0.01) col = mix(col, vec3(0.8, 0.62, 1.0), min(1.0, glow * (0.85 + 0.15 * sin(t * 3.0))) * uSense);
  }
  // Hasted: streaks rushing out past the edges.
  if (uHaste > 0.001 && rv > 0.6) {
    vec2 q = (uv - 0.5) * vec2(aspect, 1.0);
    float a = atan(q.y, q.x) / 6.2832 * 160.0, lane = floor(a), h = hash(vec2(lane, 1.0));
    if (h > 0.82 && abs(fract(a) - 0.5) < 0.2 && fract(rv * 0.8 - t * (1.2 + h) + h * 7.0) > 0.55) {
      col = mix(col, vec3(0.85, 1.0, 0.8), 0.45 * uHaste * smoothstep(0.6, 1.0, rv));
    }
  }

  gl_FragColor = vec4(col, 1.0);
}`;

const SIZE = new THREE.Vector2();
const CLEAR = new THREE.Color();

// What mind vision draws to find the creatures it outlines: each one white, dimmer the further off (to a quarter, from
// 12 m out to 40 m), whatever's in the way.
const sensedMaterial = new THREE.ShaderMaterial({
  vertexShader: `
varying float vAway;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vAway = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
  fragmentShader: `
varying float vAway;
void main() { gl_FragColor = vec4(vec3(1.0 - 0.75 * smoothstep(12.0, 40.0, vAway)), 1.0); }`,
});

// A vein's thickness at a step, as the pixels it covers round the step (1, 2 or 3 across: the 3 a plus, to look round).
const VEIN_WIDTH = { 1: [[0, 0]], 2: [[0, 0], [1, 0], [0, 1], [1, 1]], 3: [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] };

/**
 * The veins that creep in from the edges near death (see uWounds), grown once for a view `w` × `h` effect pixels: from
 * roots spaced round the edges (and one in each corner), each grows inward a pixel at a time, wandering, 3 or 2 pixels
 * thick at its root and thinning to 1, and now and then a thinner, shorter branch forks off it. None runs further in
 * than VEIN_REACH of the view's height. Each pixel of one holds how far along from the edge it is (red, 0 to 1 of that
 * reach: the shader shows a vein only as far in as your wounds have come), and whether it's the middle of the vein
 * (green, full) or its side.
 */
function growVeins(w, h) {
  const rng = new RNG('veins'), data = new Uint8Array(w * h * 4), reach = h * VEIN_REACH;
  const stamp = (x, y, width, along) => {
    for (const [dx, dy] of VEIN_WIDTH[width]) {
      const px = Math.round(x) + dx, py = Math.round(y) + dy, a = Math.min(255, Math.round(along * 255));
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const o = (py * w + px) * 4;
      if (data[o + 3] && data[o] <= a) continue; // (where veins cross, the one nearer its root shows first)
      data[o] = a;
      data[o + 1] = dx === 0 && dy === 0 ? 255 : 110;
      data[o + 3] = 255;
    }
  };
  const grow = (x, y, angle, length, width, from) => {
    for (let s = 0; s < length; s++) {
      stamp(x, y, Math.max(1, Math.round(width * (0.45 + 0.55 * (1 - s / length)))), (from + s) / reach);
      angle += rng.range(-0.22, 0.22);
      x += Math.cos(angle);
      y += Math.sin(angle);
      if (width > 1 && length - s > 10 && rng.chance(0.05)) {
        grow(x, y, angle + rng.pick([-1, 1]) * rng.range(0.45, 0.95), (length - s) * rng.range(0.35, 0.65), width - 1, from + s);
      }
    }
  };
  // Roots about every 15th of the way round the edges (bottom, right, top, left: the rows run up from the bottom), each
  // growing in from its edge, give or take; and one in each corner, toward the middle.
  const round = 2 * (w + h), gap = round / 15;
  for (let d = rng.range(0, gap); d < round; d += gap * rng.range(0.6, 1.4)) {
    const [x, y, a] = d < w ? [d, 0, Math.PI / 2] : d < w + h ? [w - 1, d - w, Math.PI]
      : d < 2 * w + h ? [w - 1 - (d - w - h), h - 1, -Math.PI / 2] : [0, h - 1 - (d - 2 * w - h), 0];
    grow(x, y, a + rng.range(-0.5, 0.5), reach * rng.range(0.45, 1), rng.pick([2, 3]), 0);
  }
  for (const [x, y] of [[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]]) {
    grow(x, y, Math.atan2(h / 2 - y, w / 2 - x) + rng.range(-0.3, 0.3), reach * rng.range(0.6, 1), 3, 0);
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Your statuses shown over your view (see the top of this file): update() as the game runs, render() after each frame. */
export class ScreenFx {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uScene: { value: null }, uWorld: { value: null }, uSensed: { value: null }, uVeins: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uPix: { value: 1 }, uTime: { value: 0 },
    };
    for (const name of NAMES) uniforms[name] = { value: 0 };
    this.material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.copy = null; // the frame, copied (see render)
    this.reset();
  }

  /** Clears every effect at once (a new run). */
  reset() {
    this.level = Object.fromEntries(NAMES.map((name) => [name, 0]));
    this.on = false;
  }

  update(dt, game) {
    const p = game.player, u = this.material.uniforms;
    this.on = false;
    for (const name of NAMES) {
      const e = EFFECTS[name], want = +e.show(game, p), now = this.level[name];
      this.level[name] = want > now ? Math.min(want, now + dt / e.in) : Math.max(want, now - dt / e.out);
      u[name].value = e.raw ? this.level[name] : smooth(this.level[name]);
      if (this.level[name] > 0.001) this.on = true;
    }
    u.uTime.value = game.time;
  }

  /** A copy of the frame drawn so far, in a texture the size of the canvas's (kept, and made again if that changes). */
  grab(renderer, key) {
    const { x: w, y: h } = renderer.getDrawingBufferSize(SIZE);
    let tex = this[key];
    if (!tex || tex.image.width !== w || tex.image.height !== h) {
      tex?.dispose();
      tex = this[key] = new THREE.FramebufferTexture(w, h);
    }
    renderer.copyFramebufferToTexture(tex);
    return tex;
  }

  /** Before your hands are drawn: while you're invisible, keeps the world without them, to show them see-through. */
  beforeHands(renderer) {
    if (this.level.uInvisible > 0.001) this.material.uniforms.uWorld.value = this.grab(renderer, 'world');
  }

  /**
   * Sensing (see uSense), draws the creatures sensed (every living monster, and mimics passing for chests: SENSED_LAYER)
   * by themselves, as the camera sees them but through anything in the way, into a texture the shader outlines them
   * from (uSensed).
   */
  sense(renderer, game, w, h) {
    if (!this.sensed || this.sensed.width !== w || this.sensed.height !== h) {
      this.sensed?.dispose();
      this.sensed = new THREE.WebGLRenderTarget(w, h, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
      this.sensedCamera = new THREE.PerspectiveCamera();
    }
    const cam = this.sensedCamera.copy(game.camera), scene = game.scene, alpha = renderer.getClearAlpha();
    cam.layers.set(SENSED_LAYER);
    renderer.getClearColor(CLEAR);
    renderer.setRenderTarget(this.sensed);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    scene.overrideMaterial = sensedMaterial;
    renderer.render(scene, cam);
    scene.overrideMaterial = null;
    renderer.setRenderTarget(null);
    renderer.setClearColor(CLEAR, alpha);
    return this.sensed.texture;
  }

  /** The veins for a view `gw` × `gh` effect pixels (see growVeins), grown again if that changes. */
  veinsFor(gw, gh) {
    if (!this.veins || this.veins.image.width !== gw || this.veins.image.height !== gh) {
      this.veins?.dispose();
      this.veins = growVeins(gw, gh);
    }
    return this.veins;
  }

  /** Draws the frame on the canvas again, through the effects, if any are showing. */
  render(renderer, game) {
    if (!this.on) return;
    const { x: w, y: h } = renderer.getDrawingBufferSize(SIZE), u = this.material.uniforms;
    u.uSensed.value = this.level.uSense > 0.001 ? this.sense(renderer, game, w, h) : null;
    u.uScene.value = this.grab(renderer, 'copy');
    if (!(this.level.uInvisible > 0.001)) u.uWorld.value = u.uScene.value; // (not looked at)
    u.uRes.value.set(w, h);
    const pix = (u.uPix.value = Math.max(1, Math.round(h / 270)));
    if (this.level.uWounds > 0.5) u.uVeins.value = this.veinsFor(Math.floor(w / pix), Math.floor(h / pix));
    renderer.render(this.scene, this.camera);
  }
}
