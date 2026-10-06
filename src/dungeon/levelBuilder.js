import * as THREE from 'three';
import { TILE, WALL_H, MODEL_PX, THEMES, POOL, themeForDepth } from '../config.js';
import { T } from './tiles.js';
import { getTextures } from './textures.js';
import { arenaFor } from './arenas.js';
import { CORNER_PATTERNS, EDGE_PATTERNS } from './texturePaint.js';
import { RNG } from '../rng.js';
import { glowSprite } from '../fx/glow.js';
import { Flame } from '../fx/flame.js';
import { buildBBModel } from '../items/bbmodel.js';
import { placeProp, propTemplate, propRig } from './props.js';
import { roughRock } from './roughRock.js';
import { Haze } from '../fx/haze.js';
import { faceKey, wallFace, decorProps, corridorMask } from './decor.js';
import { SHOP_PROPS } from './rooms.js';
import { rgb, mix, paint, noise } from './texturePaint.js';
import sconceModel from '../../assets/models/sconce.bbmodel';

// Channels by what fills them (the theme's `channels.fill`): how far below the floor their surface lies, the
// prop that bridges them, the props at their ends, along their beds and on their lips, and the haze rising out of
// them (see fx/haze.js).
const FILLS = {
  // Murky water flowing along it, running in and out through a grate in the wall at each end.
  water: { depth: 0.5, bridge: 'bridge', end: 'channel_grate' },
  // A deep pit, spikes and bones at the bottom, crossed on iron grating.
  spikes: { depth: 1.5, bridge: 'grate_bridge', bed: 'spike_pit' },
  // A chasm with no bottom to be seen, its sides fading into black, crossed on rickety rope bridges.
  chasm: { depth: 8, bridge: 'rope_bridge', dark: 5 },
  // A rift torn open by the evil below: its sides fall away into the dark, veined with violet light, a violet
  // glow far down it and a miasma welling up out of it; broken floor sags over its lips, and it's crossed on
  // makeshift bridges.
  rift: { depth: 8, bridge: 'rift_bridge', dark: 5, haze: 'miasma', lips: ['rift_lip', 'rift_lip_2'] },
  // Lava creeping along it, its crust breaking over the molten rock, poured from a demon's mouth carved in the
  // wall at one end; embers fly up off it and it lights the room. Crusted rock sags over its lips, and it's
  // crossed on stone arches.
  lava: { depth: 0.7, bridge: 'lava_bridge', end: 'lava_mouth', lips: ['lava_lip', 'lava_lip_2'], lava: true, haze: 'embers' },
};
const WATER_Y = -FILLS.water.depth;
const FLOW_SPEED = 0.35; // tiles a second
// Pools' standing water sways a little (texture repeats, and radians a second), and on rough rock reaches this far
// (metres) under the banks, so it meets the rock wherever the rock has moved.
const POOL_SWAY = { amt: 0.035, speed: [0.23, 0.19] };
const POOL_REACH = 0.22;
const LAVA_SPEED = 0.06; // tiles a second
const LAVA_FALL = { width: 0.34, top: 0.6, out: 0.27, speed: 0.9 }; // metres (out from the wall), and texture repeats a second
const PUDDLE_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

// Each theme's stairs: the props stairs_down_<style> and stairs_up_<style> (see tools/modelgen/stairkit.mjs), set in
// the middle of their tile, turned so the side you step off them on arriving faces the way their `dir` says. The
// floor round the way down and the vault round the way up are the level's own, laid round the hole each leaves:
// 'full' (the whole tile), { r } (round) or { rect: [x0, z0, x1, z1] }, in metres in the stairs' own frame (+z the
// side you step off them), which must match the model's. `descent` is how the title screen's walk goes down them
// (see DESCENTS). The tile is solid, unless the theme gives `blocks` for its way up or down: the shapes that stop you
// there instead, in the same frame, { r } (a circle round the middle) or { rect }. So you can walk up to a ladder,
// or round a manhole's rim, rather than bump into the air about it.
const STAIRS = {
  // A manhole, and a ladder down its shaft; a ladder up into another in the vault. You stop at the manhole's rim and
  // the grab rails behind it, and at the ladder (its stays running back to the wall behind).
  sewers: {
    down: { r: 0.53125 }, up: { r: 0.53125 }, descent: 'shaft',
    blocks: { down: [{ r: 0.6 }, { rect: [-0.22, -0.78, 0.22, -0.45] }], up: [{ rect: [-0.31, -0.98, 0.31, -0.38] }] },
  },
  // Stone steps down a stairwell, and up a flight into the vault.
  catacombs: { down: { rect: [-0.71875, -0.8125, 0.71875, 1] }, up: 'full', descent: 'steps' },
  // A roughly squared hole, braced with timber, a rope ladder down it; a rope ladder up into another.
  // You stop at the collar of timbers round the hole, and at the ladder and the two props behind it.
  caves: {
    down: { rect: [-0.625, -0.625, 0.625, 0.625] }, up: { rect: [-0.625, -0.625, 0.625, 0.625] }, descent: 'shaft',
    blocks: { down: [{ rect: [-0.8, -0.8, 0.8, 0.8] }], up: [{ rect: [-0.8, -0.8, 0.8, -0.44] }] },
  },
  // Spiral stairs round a column, down through the floor and up through the vault.
  dwarven: { down: { r: 0.875 }, up: { r: 0.875 }, descent: 'spiral' },
  // Black steps carved with glowing runes, down a stairwell and up a flight into the vault.
  underworld: { down: { rect: [-0.6875, -0.8125, 0.6875, 1] }, up: 'full', descent: 'steps' },
};
// The title screen's walk down each kind of stairs: points in the stairs' own frame, in metres (y down from eye
// height), from the tile in front of them.
const DESCENTS = {
  steps: [[0, -0.35, 1], [0, -0.9, 0], [0, -2.2, -0.6]],
  shaft: [[0, -0.15, 1.05], [0, -0.7, 0.2], [0, -2.6, -0.1]],
  spiral: [[0, -0.2, 1.1], [0.25, -0.6, 0.65], [0.62, -1.1, 0.1], [0.35, -1.6, -0.5], [-0.25, -2.1, -0.6]],
};
// What comes down the way up from the first floor (see sunlight): the glow of the day about the foot of it, and the sun
// itself, a spotlight down its shaft (its cone's half-angle in radians).
const DAYLIGHT = { color: 0xffeccc, light: 7 };
const SUN = { light: 260, angle: 0.2 };
const SURFACE_TOP = WALL_H + 0.75; // how high the first floor's way up reaches, to the open sky (SURFACE in tools/modelgen/stairkit.mjs)
const CANDLE = { width: 0.07, height: 0.14, pixel: 0.012 }; // a candle's flame
const BRAZIER = { width: 0.36, height: 0.54, pixel: 0.026 }; // a prop's fire (fire_N anchors)

// The level's real lights: this many (constant per level so shaders never need recompiling between floors), handed
// round the fittings nearest the viewer (see shareLights), each fading `LIGHT_FADE` of the way a second as it goes.
const SCONCE_LIGHTS = 6;
const LIGHT_FADE = 2;
// The shop's blue flames count as nearer than they are (`by` times as far) while you're within `within` metres of them,
// so the shop is lit whenever you're about it, and seen lit through its door.
const SHOP_PULL = { within: 20, by: 0.5 };
const CORRIDOR_GAP = 6; // tiles: the least between two lights along the passages (see buildSconces)
// Sconce fire: its glow and light colour, and the light's strength. Blue light looks dimmer, so it's stronger.
const FIRE = { color: 0xff9040, light: 9 };
const BLUE_FIRE = { color: 0x4090ff, light: 14 };
const LAMP_FIRE = { color: 0xffb860, light: 9 }; // an oil flame behind glass, yellower
const RUBY_FIRE = { color: 0xff7048, light: 9 }; // a flame over ruby glass
const VIOLET_FIRE = { color: 0xa060ff, light: 14 }; // every flame in a theme whose `fire` is 'violet'
const LAVA_GLOW = { color: 0xff5a1a, light: 12 }; // the light off a channel of lava
// Wall lights: a theme's are named by `lights` in config.js (the sconce if it names none). Each is a Blockbench
// model whose origin sits on the wall 1.85 m up, with an empty group "flame" marking where its fire burns. A theme
// whose `fire` is 'violet' burns them all violet.
const FITTINGS = {
  sconce: { flame: { width: 0.3, height: 0.46, pixel: 0.025 }, halo: 0.9, fire: FIRE },
  wall_torch: { flame: { width: 0.26, height: 0.42, pixel: 0.024 }, halo: 0.9, fire: FIRE },
  lantern: { flame: { width: 0.09, height: 0.17, pixel: 0.013 }, halo: 1.3, fire: LAMP_FIRE },
  wall_brazier: { flame: { width: 0.34, height: 0.5, pixel: 0.026 }, halo: 1.0, fire: FIRE },
  hanging_lamp: { flame: { width: 0.11, height: 0.2, pixel: 0.013 }, halo: 1.3, fire: RUBY_FIRE },
  skull_sconce: { flame: { width: 0.3, height: 0.46, pixel: 0.025 }, halo: 0.9, fire: FIRE },
};
// The colour of the glow about props that shine (glow_N anchors).
const GLOWS = {
  crystals: 0x50d8ff, void_shards: 0xa050ff, rune_circle: 0x9050ff, obelisk: 0x9050ff, demon_face: 0xff5020, demon_statue: 0xff5020,
  lava_mouth: 0xff6020, magma_crack: 0xff6020,
};
let sconceTemplate = null; // built once; every sconce is a clone sharing its geometry and materials
let blueSconceTemplate = null; // the same, its embers burning blue

class GeoBuilder {
  /** `rough` (see roughRock.js) splits every quad into pieces and moves their corners, for rough-hewn rock. */
  constructor(rough = null) {
    this.pos = []; this.nrm = []; this.uv = []; this.col = [];
    this.rough = rough;
  }

  /**
   * p: 4 corners, n: desired normal, uv: 4 uvs, c: 4 brightness values (or, with `rough`, a function giving
   * the brightness at a point).
   */
  quad(p, n, uv, c) {
    if (this.rough) {
      this.roughQuad(p, n, uv, c);
      return;
    }
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const order = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 3, 2, 0, 2, 1];
    for (const i of order) {
      this.pos.push(...p[i]);
      this.nrm.push(...n);
      this.uv.push(...uv[i]);
      this.col.push(c[i], c[i], c[i]);
    }
  }

  roughQuad(p, n, uv, c) {
    const [nu, nv] = this.rough.split(p);
    const at = (arr, s, t) => arr[0].map((_, k) => arr[0][k] * (1 - s) * (1 - t) + arr[1][k] * s * (1 - t) + arr[2][k] * s * t + arr[3][k] * (1 - s) * t);
    const shade = typeof c === 'function' ? c : (q, s, t) => c[0] * (1 - s) * (1 - t) + c[1] * s * (1 - t) + c[2] * s * t + c[3] * (1 - s) * t;
    // Wound by the flat quad, so the pieces face the same way however far the rock moves them.
    const e1 = p[1].map((v, k) => v - p[0][k]), e2 = p[3].map((v, k) => v - p[0][k]);
    const flip = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2] < 0;
    // The corners of the pieces, each worked out once: where it moves to, its uv and its shade.
    const pts = [], uvs = [], cs = [];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const s = i / nu, t = j / nv, flat = at(p, s, t);
        pts.push(this.rough.move(flat));
        uvs.push(at(uv, s, t));
        cs.push(shade(flat, s, t));
      }
    }
    const tris = flip ? [[0, 3, 2], [0, 2, 1]] : [[0, 1, 2], [0, 2, 3]];
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const corners = [j * (nu + 1) + i, j * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i];
        for (const tri of tris) {
          const v = tri.map((k) => corners[k]);
          this.facet(v.map((k) => pts[k]), v.map((k) => uvs[k]), v.map((k) => cs[k]));
        }
      }
    }
  }

  /** One triangle with its own flat normal: the chiselled facets of rough rock. */
  facet(p, uv, c) {
    const e1 = p[1].map((v, k) => v - p[0][k]), e2 = p[2].map((v, k) => v - p[0][k]);
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    for (let k = 0; k < 3; k++) {
      this.pos.push(...p[k]);
      this.nrm.push(nx / len, ny / len, nz / len);
      this.uv.push(...uv[k]);
      this.col.push(c[k], c[k], c[k]);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const DIR_ANGLE = [Math.PI, Math.PI / 2, 0, -Math.PI / 2]; // N, E, S, W: rotate local +z to face that way

/** A surface's textures as a list: its variants (see variants in texturePaint.js), or the one it has. */
const variants = (t) => (Array.isArray(t) ? t : [t]);

/** A number for (x, y) on floor `depth`, and `salt`: the same every time the floor is built. */
function gridHash(depth, x, y, salt) {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(salt + 1, 83492791) ^ Math.imul(depth + 1, 2654435761 | 0);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/** A theme's door: a prop with moving parts (see tools/modelgen/doorkit.mjs, and buildDoor). */
const doorModel = (theme) => `door_${theme.style}`;

/** The way the title screen's walk goes down a theme's stairs: points in their own frame (see DESCENTS). */
export const stairsDescent = (theme) => DESCENTS[STAIRS[theme.style].descent];

/**
 * Every prop a floor of `theme` might use: its doors' and stairs', the chests (see Level.addChest), its decorations',
 * its channels', its wall lights and, in every theme after the first, the shop's. They must be loaded (loadProps)
 * before one of its floors is built.
 */
export function propsForTheme(theme) {
  const fill = FILLS[theme.channels?.fill];
  return [...new Set([
    doorModel(theme),
    `stairs_down_${theme.style}`, `stairs_up_${theme.style}`, ...(THEMES.indexOf(theme) === 0 ? ['stairs_surface'] : []),
    'chest', 'chest_locked',
    ...decorProps(theme.style),
    ...(fill ? [fill.bridge, fill.end, fill.bed, ...(fill.lips ?? [])].filter(Boolean) : []),
    ...(THEMES.indexOf(theme) > 0 ? SHOP_PROPS : []),
    ...(theme.lights ?? []),
  ])];
}

/** Every prop floor `depth` might use: its theme's (see propsForTheme), and those of an arena laid out by hand (see arenas.js). */
export const propsForFloor = (depth) => [...new Set([...propsForTheme(themeForDepth(depth)), ...(arenaFor(depth)?.props ?? [])])];

export function buildLevelMeshes(data) {
  const { w, h, grid, theme } = data;
  const tex = getTextures(theme);
  const rng = new RNG(`deco:${data.depth}`);
  const get = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? T.WALL : grid[y * w + x]);
  const isWall = (x, y) => get(x, y) === T.WALL;

  // Rough rock (see roughRock.js), calm round whatever is fixed flat to a wall or stands across a passage from wall to
  // wall, the chests backed up against them, and about the shop. A theme whose `rough` is 'tunnels' is a temple dug
  // into the rock: rough passages between rooms of masonry.
  const rough = theme.rough ? roughRock(data, [
    ...(data.decor ?? []).filter((p) => p.wall).map((p) => ({ x: p.x * TILE, z: p.y * TILE, r: 1.6 })),
    ...(data.decor ?? []).filter((p) => p.span).map((p) => ({ x: p.x * TILE, z: p.y * TILE, r: 2.1 })),
    ...(data.chests ?? []).map((c) => ({ x: c.px * TILE, z: c.py * TILE, r: 1.5 })),
    ...(data.shop ? [...data.shop.props, data.shop.keeper].map((p) => ({ x: p.x * TILE, z: p.y * TILE, r: 2 })) : []),
    ...(data.shop?.sconces ?? []).map((s) => ({ x: s.x, z: s.z, r: 1.4 })),
  ], { builtRooms: theme.rough === 'tunnels' }) : null;
  // The walls, floors and vaults come in variants of their textures (see variants in texturePaint.js), each a mesh of
  // its own. Every corner of the grid has a flavour (one lattice of them for the floors, another for the vaults and
  // another for the walls), and a tile of floor or vault takes the variant painted with its four corners' flavours
  // (`tileOf`); a wall's face, the one painted with those of the corners at its ends, in a set of small features of
  // its own, at random (`faceOf`). So neighbours share the flavours along the edge between them, and meet seamlessly.
  const builders = (t) => variants(t).map(() => new GeoBuilder(rough));
  const floors = builders(tex.floor), ceils = builders(tex.ceiling), walls = builders(tex.wall);
  const banks = new GeoBuilder(rough), abyss = new GeoBuilder(rough);
  // A style with passages of its own (`tunnelWall`, `tunnelFloor`) uses them outside the rooms.
  const roomTile = new Uint8Array(w * h);
  for (const r of data.rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) roomTile[y * w + x] = 1;
  const tunnelWalls = tex.tunnelWall ? builders(tex.tunnelWall) : walls, tunnelFloors = tex.tunnelFloor ? builders(tex.tunnelFloor) : floors;
  const flavour = (gx, gy, lattice) => gridHash(data.depth, gx, gy, lattice) & 1;
  const tileOf = (list, x, y, lattice) => (list.length < CORNER_PATTERNS ? list[0]
    : list[flavour(x, y, lattice) | (flavour(x + 1, y, lattice) << 1) | (flavour(x + 1, y + 1, lattice) << 2) | (flavour(x, y + 1, lattice) << 3)]);
  // (`a` and `b`, the corners where its texture's u is 0 and 1.)
  const faceOf = (list, x, y, face, a, b) => (list.length < EDGE_PATTERNS ? list[0]
    : list[(flavour(...a, 0) | (flavour(...b, 0) << 1)) + EDGE_PATTERNS * (gridHash(data.depth, x, y, face) % (list.length / EDGE_PATTERNS))]);
  const violet = theme.fire === 'violet';
  const vh = WALL_H / TILE;
  const sunk = (t) => t === T.CHANNEL || t === T.BRIDGE; // a channel: the floor drops away
  const fill = FILLS[theme.channels?.fill];
  // Each stairs' kind: the theme's, or (`style`) another's, as the Catacombs' steps down from the Sewers' last floor.
  const stairsOf = (s) => STAIRS[s.style ?? theme.style];
  // Where the next theme is worked in round the way on (an arena's `blend`: see arenas.js), each tile's floor, vault and
  // walls are of its stone or the theme's own, as its share in `mix` says, each one by a throw of its own.
  const blend = data.blend ?? null, blendTex = blend && getTextures(blend.theme);
  const blended = blend ? { floors: builders(blendTex.floor), ceils: builders(blendTex.ceiling), walls: builders(blendTex.wall) } : null;
  const theirs = (x, y, salt) => blend && blend.mix[y * w + x] > (gridHash(data.depth, x, y, 60 + salt) % 1000) / 1000;
  const wallUV = (t) => (t.wallFullHeight ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [1, 0], [1, vh], [0, vh]]);

  // Corner ambient occlusion: darken grid corners that touch walls.
  const cornerAO = (gx, gy) => {
    let n = 0;
    if (isWall(gx - 1, gy - 1)) n++;
    if (isWall(gx, gy - 1)) n++;
    if (isWall(gx - 1, gy)) n++;
    if (isWall(gx, gy)) n++;
    return 1 - n * 0.14;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = get(x, y);
      if (t === T.WALL) continue;
      const x0 = x * TILE, x1 = (x + 1) * TILE, z0 = y * TILE, z1 = (y + 1) * TILE;
      const tint = 0.9 + rng.next() * 0.12, inRoom = roomTile[y * w + x] === 1;
      const ao = [cornerAO(x, y), cornerAO(x + 1, y), cornerAO(x + 1, y + 1), cornerAO(x, y + 1)].map((v) => v * tint);

      // (A pool's floor is its bed, a step down, and in shadow under the water. Stairs leave a hole in the floor, or
      // the vault.)
      const y0 = t === T.POOL ? -POOL.bed : 0;
      const floor = theirs(x, y, 0) ? tileOf(blended.floors, x, y, 1) : tileOf(inRoom ? floors : tunnelFloors, x, y, 1);
      const ceil = theirs(x, y, 1) ? tileOf(blended.ceils, x, y, 2) : tileOf(ceils, x, y, 2);
      if (t === T.STAIRS_DOWN) holed(floor, x, y, 0, stairsOf(data.down).down, data.down.dir, ao);
      else if (!sunk(t)) {
        floor.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, 1, 0],
          [[0, 0], [1, 0], [1, 1], [0, 1]], y0 ? ao.map((v) => v * 0.55) : ao);
      }
      if (t === T.STAIRS_UP) holed(ceil, x, y, WALL_H, stairsOf(data.up).up, data.up.dir, ao.map((v) => v * 0.8));
      else {
        ceil.quad([[x0, WALL_H, z0], [x1, WALL_H, z0], [x1, WALL_H, z1], [x0, WALL_H, z1]], [0, -1, 0],
          [[0, 0], [1, 0], [1, 1], [0, 1]], ao.map((v) => v * 0.8));
      }

      const b = 0.62 * tint, tp = 1.0 * tint;
      const wc = [b, b, tp, tp];
      const wuv = wallUV(tex);
      // (Each face takes a variant from `list` by the corners at its ends: a pool's side, under a wall, the wall's. A wall
      // face where the next theme is worked in may be of its stone: `blend`.)
      const side = (ya, yb, uv, c, list, open, blend = false) => {
        const pick = (face) => (blend && theirs(x, y, 1 + face) ? [blended.walls, wallUV(blendTex)] : [list, uv]);
        const at = (face, a, b, pts, n) => {
          const [l, u] = pick(face);
          faceOf(l, x, y, face, a, b).quad(pts, n, u, c);
        };
        if (open(x, y - 1)) at(1, [x, y], [x + 1, y], [[x0, ya, z0], [x1, ya, z0], [x1, yb, z0], [x0, yb, z0]], [0, 0, 1]);
        if (open(x, y + 1)) at(2, [x + 1, y + 1], [x, y + 1], [[x1, ya, z1], [x0, ya, z1], [x0, yb, z1], [x1, yb, z1]], [0, 0, -1]);
        if (open(x - 1, y)) at(3, [x, y + 1], [x, y], [[x0, ya, z1], [x0, ya, z0], [x0, yb, z0], [x0, yb, z1]], [1, 0, 0]);
        if (open(x + 1, y)) at(4, [x + 1, y], [x + 1, y + 1], [[x1, ya, z0], [x1, ya, z1], [x1, yb, z1], [x1, yb, z0]], [-1, 0, 0]);
      };
      side(0, WALL_H, wuv, wc, inRoom ? walls : tunnelWalls, isWall, true);
      // A channel's sides run from the floor down to its surface, under the walls at its ends and along its banks.
      // A chasm's are rock that fades to black as it falls away; its texture repeats every two metres down.
      if (sunk(t)) {
        const deep = fill.dark ? (q) => 0.85 * tint * Math.max(0, 1 + q[1] / fill.dark) ** 1.5 : null;
        const buv = fill.dark ? [[0, 0], [1, 0], [1, fill.depth / TILE], [0, fill.depth / TILE]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
        side(-fill.depth, 0, buv, deep ?? [0.5 * tint, 0.5 * tint, 0.85 * tint, 0.85 * tint], [banks], (nx, ny) => !sunk(get(nx, ny)));
      }
      // A pool's sides are the foot of the wall carried down to its bed, darker below the water.
      if (t === T.POOL) {
        const v = POOL.bed / (tex.wallFullHeight ? WALL_H : TILE);
        side(-POOL.bed, 0, [[0, 0], [1, 0], [1, v], [0, v]], [0.4 * tint, 0.4 * tint, 0.75 * tint, 0.75 * tint],
          inRoom ? walls : tunnelWalls, (nx, ny) => get(nx, ny) !== T.POOL);
      }
    }
  }

  const group = new THREE.Group();
  // A surface's material, with `glow` where the style paints what shines by itself (runes, veins, embers): a mesh
  // for each variant of its texture that's used.
  const mat = (map, glow) => new THREE.MeshLambertMaterial(glow ? { map, vertexColors: true, emissive: 0xffffff, emissiveMap: glow } : { map, vertexColors: true });
  const surface = (list, maps, glows) => list.forEach((b, i) => {
    if (b.pos.length) group.add(new THREE.Mesh(b.build(), mat(variants(maps)[i], glows && variants(glows)[i])));
  });
  surface(floors, tex.floor);
  if (tunnelFloors !== floors) surface(tunnelFloors, tex.tunnelFloor);
  surface(ceils, tex.ceiling, tex.ceilingGlow);
  surface(walls, tex.wall, tex.wallGlow);
  if (tunnelWalls !== walls) surface(tunnelWalls, tex.tunnelWall, tex.tunnelGlow);
  if (blended) {
    surface(blended.floors, blendTex.floor);
    surface(blended.ceils, blendTex.ceiling, blendTex.ceilingGlow);
    surface(blended.walls, blendTex.wall, blendTex.wallGlow);
  }
  if (data.channels?.length) group.add(new THREE.Mesh(banks.build(), mat(tex.channel, tex.channelGlow)));

  const stoneMat = new THREE.MeshLambertMaterial({ map: variants(tex.floor)[0], color: 0xb0a898 });

  const obstacles = [];
  for (const p of [data.amulet, data.shrine].filter(Boolean)) {
    group.add(buildPedestal(p, stoneMat));
    obstacles.push({ x: (p.x + 0.5) * TILE, z: (p.y + 0.5) * TILE, r: 0.55 });
  }

  // The shop's furniture. Items for sale rest in the slots of the counter, plinths and display tables, in order; the
  // plinths' are kept for the shop's own wares, and the rug's are where what the player sells goes first (see
  // layoutShop).
  const shopSlots = [], shopKept = new Set(), shopResale = [];
  for (const p of data.shop?.props ?? []) {
    const prop = placeProp(p);
    group.add(prop.mesh);
    if (prop.obstacle) obstacles.push(prop.obstacle);
    for (const slot of prop.slots) {
      if (p.resale === false) shopKept.add(shopSlots.length);
      if (p.resale === true) shopResale.push(shopSlots.length);
      shopSlots.push(slot);
    }
  }

  const candles = [], glows = [], drips = [], fires = []; // from props' candle_N, glow_N, drip_N and fire_N anchors
  const place = (p) => {
    const prop = placeProp(p);
    // Things hung from the vault follow the rock up or down.
    if (p.ceiling && rough) prop.mesh.position.y += rough.offset([p.x * TILE, WALL_H, p.y * TILE], [0, 1, 0]);
    group.add(prop.mesh);
    if (prop.obstacle) obstacles.push(prop.obstacle);
    const lift = prop.mesh.position.y;
    candles.push(...prop.candles);
    glows.push(...prop.glows.map(([x, y, z]) => ({ x, y: y + lift, z, color: GLOWS[p.type] })));
    drips.push(...prop.drips.map(([x, y, z]) => ({ x, y: y + lift, z })));
    fires.push(...prop.fires.map(([x, y, z]) => ({ x, y: y + lift, z })));
  };
  // Channels: each one's surface (flowing water, or the floor of a pit), with bridges across and whatever its
  // fill puts at its ends and along its bed.
  const water = [], glowing = []; // flowing surfaces; lights cast by lava
  for (const c of data.channels ?? []) {
    const g = fill.dark ? abyss : new GeoBuilder(), y0 = -fill.depth;
    for (const { x, y } of c.tiles) {
      const x0 = x * TILE, x1 = x0 + TILE, z0 = y * TILE, z1 = z0 + TILE;
      g.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, 1, 0], [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], [1, 1, 1, 1]);
      // Turned a quarter at a time by position, so the pit floors don't all match.
      if (fill.bed) place({ type: fill.bed, x: x + 0.5, y: y + 0.5, yaw: ((x * 7 + y * 13) % 4) * (Math.PI / 2) });
    }
    if (fill.lava) {
      const map = tex.lava.clone();
      map.needsUpdate = true;
      group.add(new THREE.Mesh(g.build(), new THREE.MeshBasicMaterial({ map })));
      water.push({ map, axis: c.axis, flow: c.flow, speed: LAVA_SPEED });
      water.push(lavaFall(group, tex.lava, c.ends[c.flow > 0 ? 0 : 1], fill.depth));
      const mid = c.tiles[c.tiles.length >> 1];
      glowing.push({ pos: new THREE.Vector3((mid.x + 0.5) * TILE, 0.5, (mid.y + 0.5) * TILE), fire: LAVA_GLOW });
    } else if (theme.channels.fill === 'water') {
      const map = tex.water.clone();
      map.needsUpdate = true;
      group.add(new THREE.Mesh(g.build(), new THREE.MeshPhongMaterial({ map, vertexColors: true, shininess: 60, specular: 0x3c4a38 })));
      water.push({ map, axis: c.axis, flow: c.flow });
    } else if (!fill.dark) group.add(new THREE.Mesh(g.build(), mat(tex.pitFloor)));
    for (const b of c.bridges) place({ type: fill.bridge, x: b.x + 0.5, y: b.y + 0.5, yaw: c.axis === 'x' ? 0 : Math.PI / 2 });
    // Broken lips along both banks (not where a bridge lands), each facing out over the channel.
    if (fill.lips) {
      for (const { x, y } of c.tiles) {
        if (c.bridges.some((b) => b.x === x && b.y === y)) continue;
        const banks = c.axis === 'x' ? [[x + 0.5, y, 0], [x + 0.5, y + 1, Math.PI]] : [[x, y + 0.5, Math.PI / 2], [x + 1, y + 0.5, -Math.PI / 2]];
        for (const [px, py, yaw] of banks) place({ type: rng.pick(fill.lips), x: px, y: py, yaw });
      }
    }
    if (fill.end) for (const e of c.ends) place({ type: fill.end, ...wallFace(e.x, e.y, e.side) });
  }
  // Pools: the still water standing in them, one surface over them all, swaying a little (see flowWater). On rough rock
  // it reaches in under the banks, where the floor hides it, so it meets the rock however far that has moved.
  if (tex.pool) {
    const surface = new GeoBuilder(), sy = -POOL.surface;
    const sheet = (xa, za, xb, zb) => surface.quad([[xa, sy, za], [xb, sy, za], [xb, sy, zb], [xa, sy, zb]], [0, 1, 0],
      [[xa / TILE, za / TILE], [xb / TILE, za / TILE], [xb / TILE, zb / TILE], [xa / TILE, zb / TILE]], [1, 1, 1, 1]);
    let any = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (get(x, y) !== T.POOL) continue;
        any = true;
        const x0 = x * TILE, x1 = x0 + TILE, z0 = y * TILE, z1 = z0 + TILE, r = POOL_REACH;
        sheet(x0, z0, x1, z1);
        if (!rough) continue;
        if (get(x - 1, y) !== T.POOL) sheet(x0 - r, z0, x0, z1);
        if (get(x + 1, y) !== T.POOL) sheet(x1, z0, x1 + r, z1);
        if (get(x, y - 1) !== T.POOL) sheet(x0, z0 - r, x1, z0);
        if (get(x, y + 1) !== T.POOL) sheet(x0, z1, x1, z1 + r);
      }
    }
    if (any) {
      const map = tex.pool.clone(), glow = tex.poolGlow?.clone();
      for (const m of [map, glow].filter(Boolean)) {
        m.needsUpdate = true;
        water.push({ map: m, sway: true });
      }
      group.add(new THREE.Mesh(surface.build(), new THREE.MeshPhongMaterial({
        map, transparent: true, opacity: POOL.opacity, depthWrite: false, shininess: 36, specular: 0x6a7880,
        ...(glow ? { emissive: 0xffffff, emissiveMap: glow } : {}),
      })));
    }
  }
  // A chasm's floor is only darkness, far down, or where the style has an `abyss`, a glow far down.
  if (fill?.dark) group.add(new THREE.Mesh(abyss.build(), new THREE.MeshBasicMaterial(tex.abyss ? { map: tex.abyss, fog: false } : { color: 0x000000 })));
  // The haze rising out of the channels: the rifts' miasma (the glow down them churning with it), the lava's embers.
  const haze = fill?.haze && data.channels?.length
    ? new Haze(group, data.channels.flatMap((c) => c.tiles.map((t) => ({ x: (t.x + 0.5) * TILE, z: (t.y + 0.5) * TILE }))), fill.haze, theme, fill.dark ? tex.abyss : null)
    : null;
  // The theme's decorations (see decor.js). Puddles, cobwebs (the next theme's, where it's worked in: see `blend`) and an
  // arena's `taint`, the Maledicted Ooze's filth, are drawn here; the rest are props.
  const webTex = tex.cobweb ?? blendTex?.cobweb;
  const webMat = webTex && new THREE.MeshLambertMaterial({ map: webTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const puddleMats = tex.puddles?.map((map) => new THREE.MeshPhongMaterial({
    map, transparent: true, depthWrite: false, shininess: 80, specular: 0x506050,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  let taintMat = null;
  for (const p of data.decor ?? []) {
    if (p.type === 'cobweb') {
      if (webMat) group.add(cobweb(p, webMat));
      continue;
    }
    if (p.type === 'taint') {
      taintMat ??= new THREE.MeshPhongMaterial({
        map: taintTexture(), transparent: true, depthWrite: false, shininess: 90, specular: 0x6a3a7a,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      });
      const m = new THREE.Mesh(PUDDLE_GEO, taintMat);
      m.position.set(p.x * TILE, 0.006, p.y * TILE);
      m.rotation.y = p.yaw;
      m.scale.set(p.size, 1, p.size * 0.85);
      group.add(m);
      continue;
    }
    if (p.type !== 'puddle') {
      place(p);
      continue;
    }
    if (!puddleMats) continue;
    const m = new THREE.Mesh(PUDDLE_GEO, puddleMats[Math.floor(p.yaw * 7) % puddleMats.length]);
    m.position.set(p.x * TILE, 0.005, p.y * TILE);
    m.rotation.y = p.yaw;
    m.scale.set(p.size, 1, p.size * 0.75);
    group.add(m);
  }

  // The stairs (see STAIRS). The first floor's way up comes out under the open sky (stairs_surface), and daylight falls
  // down it. Stairs with `blocks` stop you with those, not their whole tile (openStairs: their tiles).
  const openStairs = new Set();
  for (const [s, way] of [[data.down, 'down'], [data.up, 'up']]) {
    if (!s) continue;
    place({ type: s === data.up && data.depth === 1 ? 'stairs_surface' : `stairs_${way}_${s.style ?? theme.style}`, x: s.x + 0.5, y: s.y + 0.5, yaw: DIR_ANGLE[s.dir] });
    const blocks = stairsOf(s).blocks?.[way];
    if (!blocks) continue;
    openStairs.add(s.y * w + s.x);
    obstacles.push(...blocks.map((b) => stairsBlock(b, s)));
  }
  const daylight = data.depth === 1 ? sunlight(group, data.up, stairsOf(data.up).up) : null;
  if (daylight) glowing.unshift(daylight.source);
  // The sun, shining down that way up. Every floor has it, parked in the dark on all but the first, so every floor has
  // the same lights and no shader needs recompiling between them (as with SCONCE_LIGHTS).
  const sun = new THREE.SpotLight(0xfff2dc, daylight ? SUN.light : 0, SURFACE_TOP + 1, SUN.angle, 0.55, 1.2);
  sun.position.set(daylight ? (data.up.x + 0.5) * TILE : 0, daylight ? SURFACE_TOP : -50, daylight ? (data.up.y + 0.5) * TILE : 0);
  sun.target.position.set(sun.position.x, -60, sun.position.z);
  group.add(sun, sun.target);

  const flames = buildSconces(data, group, rng, isWall, rough, violet);
  // Props' fires (fire_N anchors): full-size flames, like the wall lights'.
  for (const { x, y, z } of fires) {
    const look = violet ? VIOLET_FIRE : FIRE;
    const flame = new Flame({ ...BRAZIER, seed: rng.next(), violet });
    flame.position.set(x, y, z);
    const halo = glowSprite(look.color, 1.0, 0.55);
    halo.position.set(x, y + BRAZIER.height * 0.35, z);
    group.add(flame, halo);
    flames.push({ flame, halo, fire: look, phase: rng.next() * 10, pos: new THREE.Vector3(x, y + 0.3, z) });
  }
  // The level's few real lights: the shop's sconces first, so it's sure of them, then lava, then the rest.
  // (Every fitting with a fire, lava's glow and daylight share the level's few real lights: see shareLights.)
  const { lights, share } = castLights(group, [...flames.filter((f) => f.shop), ...glowing, ...flames.filter((f) => f.fire && !f.shop)]);
  // Soft glows about things that shine by themselves (glow_N anchors: the caves' crystals, the ruins' void shards).
  for (const g of glows) {
    const halo = glowSprite(g.color, 0.9, 0.45);
    halo.position.set(g.x, g.y, g.z);
    group.add(halo);
  }
  // Candles: small flames of their own, flickering with the sconces', but giving no light.
  for (const [x, y, z] of candles) {
    const flame = new Flame({ ...CANDLE, seed: rng.next(), violet });
    flame.position.set(x, y, z);
    const halo = glowSprite(violet ? 0xb070ff : 0xffa050, 0.28, 0.5);
    halo.position.set(x, y + 0.06, z);
    group.add(flame, halo);
    flames.push({ flame, halo, phase: rng.next() * 10 });
  }

  const doors = data.doors.map((d) => {
    const built = buildDoor(d, d.model ?? doorModel(theme)); // (a door may be a model of its own: an arena's boss door)
    group.add(built.group);
    return built;
  });
  return { group, flames, lights, share, obstacles, openStairs, doors, shopSlots, shopKept, shopResale, water, haze, rough, sunlight: daylight, drips: dripSources(data, rng, drips) };
}

/**
 * The floor of the stairs tile (x, y) (or the vault, `height` up), round the hole its stairs leave: `hole` as in STAIRS,
 * turned to face `dir`. `ao` is the tile's corner shading, as the other floors have it.
 */
function holed(builder, x, y, height, hole, dir, ao) {
  if (hole === 'full') return;
  const h = TILE / 2, cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE, n = [0, height ? -1 : 1, 0];
  // Where a point of the tile (metres from its middle) is on its texture, and how shaded (between the corners).
  const quad = (pts) => {
    const uv = pts.map(([px, pz]) => [(px + h) / TILE, (pz + h) / TILE]);
    const c = uv.map(([u, v]) => ao[0] * (1 - u) * (1 - v) + ao[1] * u * (1 - v) + ao[2] * u * v + ao[3] * (1 - u) * v);
    builder.quad(pts.map(([px, pz]) => [cx + px, height, cz + pz]), n, uv, c);
  };
  if (hole.rect) {
    // The rectangle turned to face `dir`, and the tile round it as up to four strips.
    const [p, q] = turnRect(hole.rect, dir);
    const x0 = Math.max(-h, Math.min(p[0], q[0])), x1 = Math.min(h, Math.max(p[0], q[0]));
    const z0 = Math.max(-h, Math.min(p[1], q[1])), z1 = Math.min(h, Math.max(p[1], q[1]));
    const strip = (xa, za, xb, zb) => { if (xb > xa && zb > za) quad([[xa, za], [xb, za], [xb, zb], [xa, zb]]); };
    strip(-h, -h, h, z0);
    strip(-h, z1, h, h);
    strip(-h, z0, x0, z1);
    strip(x1, z0, h, z1);
    return;
  }
  // Round: a sixteen-sided hole (as the models' shafts are), each side joined to where a line from the middle through
  // its corners meets the edge of the tile. The corners of the tile fall on those lines, so every piece is flat.
  for (let k = 0; k < 16; k++) {
    const pt = (i, r) => {
      const a = (i * Math.PI) / 8, c = Math.cos(a), s = Math.sin(a);
      return r === null ? [(c * h) / Math.max(Math.abs(c), Math.abs(s)), (s * h) / Math.max(Math.abs(c), Math.abs(s))] : [c * r, s * r];
    };
    quad([pt(k, hole.r), pt(k + 1, hole.r), pt(k + 1, null), pt(k, null)]);
  }
}

/**
 * A rectangle [x0, z0, x1, z1] in stairs' own frame, turned the way `dir` says (a quarter turn at a time, so it stays
 * square to the grid): two opposite corners.
 */
function turnRect([ax, az, bx, bz], dir) {
  const a = DIR_ANGLE[dir], cs = Math.round(Math.cos(a)), sn = Math.round(Math.sin(a));
  const turn = ([px, pz]) => [px * cs + pz * sn, -px * sn + pz * cs];
  return [turn([ax, az]), turn([bx, bz])];
}

/** One of the shapes that stop you at stairs `s` (see STAIRS), as an obstacle (see Level.collide). */
function stairsBlock(b, s) {
  const cx = (s.x + 0.5) * TILE, cz = (s.y + 0.5) * TILE;
  if (b.r) return { x: cx, z: cz, r: b.r };
  const [p, q] = turnRect(b.rect, s.dir);
  return { x: cx + (p[0] + q[0]) / 2, z: cz + (p[1] + q[1]) / 2, hw: Math.abs(q[0] - p[0]) / 2, hd: Math.abs(q[1] - p[1]) / 2 };
}

/**
 * Daylight down the way up from the first floor, the stairs `s`: the sky over the top of its shaft (covering what the
 * model has up there), a shaft of sunlight falling from it, dust drifting in the sun, and the light itself (`source`,
 * for castLights). `hole` is the way up's, as in STAIRS. Returns { source, update(dt), x, z (where it falls) }.
 */
function sunlight(group, s, hole) {
  const cx = (s.x + 0.5) * TILE, cz = (s.y + 0.5) * TILE;
  const r = hole.r ?? (hole.rect ? Math.min(hole.rect[2] - hole.rect[0], hole.rect[3] - hole.rect[1]) / 2 : TILE / 2);
  const sky = new THREE.Mesh(new THREE.CircleGeometry(r * 1.05, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: skyTexture(), fog: false }));
  sky.position.set(cx, SURFACE_TOP - 0.02, cz);
  // The shaft of light, brightest at the top, faded out at the bottom: straight down the shaft, clear of its walls and
  // the frame at its top, then widening from the vault down to the floor.
  const beamGeo = new THREE.LatheGeometry([new THREE.Vector2(r * 1.6, 0), new THREE.Vector2(r * 0.85, WALL_H), new THREE.Vector2(r * 0.85, SURFACE_TOP)], 16);
  const { position: at, uv } = beamGeo.attributes;
  for (let i = 0; i < uv.count; i++) uv.setY(i, at.getY(i) / SURFACE_TOP); // (the fade runs by height, not by the profile's points)
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    map: beamTexture(), color: 0x9a8c6c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }));
  beam.position.set(cx, 0, cz);
  // Where it falls on the floor.
  const pool = new THREE.Mesh(new THREE.CircleGeometry(r * 1.9, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: poolTexture(), color: 0x6a5e46, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  pool.position.set(cx, 0.004, cz);
  // Dust in the sun: motes drifting slowly down and round, in the light's cone.
  const N = 48, motes = Array.from({ length: N }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), y: Math.random() * WALL_H * 1.2, spin: 0.1 + Math.random() * 0.25, fall: 0.03 + Math.random() * 0.05 }));
  const pos = new Float32Array(N * 3);
  const dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({
    color: 0xfff4d8, size: 0.022, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  group.add(sky, beam, pool, dust);
  const update = (dt) => {
    motes.forEach((m, i) => {
      m.a += m.spin * dt;
      m.y -= m.fall * dt;
      if (m.y < 0.05) m.y = WALL_H * 1.2;
      const edge = m.y > WALL_H ? 0.85 : 1.6 - (0.75 * m.y) / WALL_H, rr = m.r * r * edge * 0.9; // (inside the beam)
      pos.set([cx + Math.cos(m.a) * rr, m.y, cz + Math.sin(m.a) * rr], i * 3);
    });
    dust.geometry.attributes.position.needsUpdate = true;
  };
  update(0);
  return { source: { pos: new THREE.Vector3(cx, WALL_H - 1.2, cz), fire: DAYLIGHT }, update, x: cx, z: cz };
}

/** A patch of summer sky, as seen straight up a shaft: blue, and a few soft clouds going over. */
function skyTexture() {
  const rng = new RNG('sky'), cloud = noise(rng, 64, 64, 4), wisp = noise(rng, 64, 64, 9);
  return canvasTexture(paint(64, 64, (x, y) => {
    const c = cloud(x, y) * 0.75 + wisp(x, y) * 0.25, d = Math.hypot(x - 31.5, y - 31.5) / 32;
    const blue = mix(rgb('#8cc4f4'), rgb('#5a98e0'), d);
    return c > 0.62 ? mix(blue, rgb('#fbfdff'), Math.min(1, (c - 0.62) * 5)) : blue;
  }));
}

/** Down the shaft of sunlight: bright at the top, fading away to nothing at the floor, in soft streaks. */
function beamTexture() {
  const rng = new RNG('beam'), streak = noise(rng, 64, 64, 8, 1);
  const t = canvasTexture(paint(64, 64, (x, y) => {
    const k = (1 - y / 63) ** 1.6 * (0.55 + 0.45 * streak(x, 0));
    return [255 * k, 240 * k, 210 * k];
  }));
  t.magFilter = THREE.LinearFilter;
  return t;
}

/** The sunlit patch on the floor: brightest in the middle, soft at its edge. */
function poolTexture() {
  const t = canvasTexture(paint(32, 32, (x, y) => {
    const k = Math.max(0, 1 - Math.hypot(x - 15.5, y - 15.5) / 16) ** 1.4;
    return [255 * k, 245 * k, 220 * k];
  }));
  t.magFilter = THREE.LinearFilter;
  return t;
}

function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

let taint = null;
/**
 * The Maledicted Ooze's filth, where it lies and where it has dragged itself (an arena's `taint`: see arenas.js): a
 * ragged spill of dark purple slime, glossy, with paler skins drying at its edge, bubbles in it, and flecks of the taint
 * glowing magenta.
 */
function taintTexture() {
  if (taint) return taint;
  const S = 48, rng = new RNG('taint'), edge = noise(rng, S, S, 5), body = noise(rng, S, S, 4), fleck = noise(rng, S, S, 12);
  const bubbles = Array.from({ length: 7 }, () => [rng.range(12, 36), rng.range(12, 36), rng.range(1.2, 2.6)]);
  taint = canvasTexture(paint(S, S, (x, y) => {
    const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2) + (edge(x, y) - 0.5) * 0.7;
    if (d > 0.92) return [0, 0, 0, 0];
    let col = mix(rgb('#1a0626'), rgb('#4a1666'), body(x, y));
    if (d > 0.78) col = mix(col, rgb('#6a3a7a'), 0.55); // (its edge, drying)
    for (const [bx, by, r] of bubbles) {
      const b = Math.hypot(x - bx, y - by);
      if (b < r && b > r - 1.1) col = mix(col, rgb('#9a5ab8'), 0.7);
      else if (b < r && x < bx && y < by) col = mix(col, rgb('#2a0a3a'), 0.5);
    }
    if (fleck(x, y) > 0.86 && d < 0.7) col = rgb('#e040c0');
    return [...col, d > 0.78 ? 215 : 240];
  }));
  return taint;
}

/**
 * Where water drips (see fx/drips.js): from every drain pipe's mouth, from the vault over half the puddles and
 * pools and a tile or two of each water channel, and from props' drip_N anchors (the caves' stalactites), given as
 * `tips`. Each is { x, y, z, floor (where it lands), every: [min, max] s }.
 */
function dripSources(data, rng, tips) {
  const out = tips.map((t) => ({ ...t, floor: 0.01, every: [2, 5] }));
  for (const p of data.decor ?? []) {
    if (p.type === 'drain_pipe') {
      // Off the lip of the pipe's mouth, 0.44 m out from the wall, into its pool of slime.
      const x = p.x * TILE + Math.sin(p.yaw) * 0.44, z = p.y * TILE + Math.cos(p.yaw) * 0.44;
      out.push({ x, y: 0.28, z, floor: 0.01, every: [0.5, 1.6] });
    } else if (p.type === 'puddle' && rng.chance(0.5)) {
      out.push({ x: p.x * TILE, y: WALL_H - 0.05, z: p.y * TILE, floor: 0.01, every: [2.5, 6] });
    }
  }
  for (const c of data.theme.channels?.fill === 'water' ? data.channels : []) {
    for (let i = rng.int(1, 2); i > 0; i--) {
      const t = rng.pick(c.tiles);
      out.push({ x: (t.x + rng.range(0.25, 0.75)) * TILE, y: WALL_H - 0.05, z: (t.y + rng.range(0.25, 0.75)) * TILE, floor: WATER_Y, every: [1.5, 4] });
    }
  }
  for (const p of data.pools ?? []) {
    if (!rng.chance(0.5)) continue;
    const t = rng.pick(p.tiles);
    out.push({ x: (t.x + rng.range(0.25, 0.75)) * TILE, y: WALL_H - 0.05, z: (t.y + rng.range(0.25, 0.75)) * TILE, floor: -POOL.surface, every: [2, 5] });
  }
  return out;
}

/**
 * A cobweb strung across the upper corner of a room: a triangle from the ceiling along each wall down to a
 * point in the corner. `p.x`, `p.y` is the corner (grid tiles) and `p.corner` [dx, dy] the way into the room.
 */
function cobweb(p, material) {
  const [dx, dz] = p.corner, cx = p.x * TILE, cz = p.y * TILE, L = 0.95, top = WALL_H - 0.01;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    cx + dx * L, top, cz + dz * 0.01, cx + dx * 0.01, top, cz + dz * L, cx + dx * 0.04, top - 0.9, cz + dz * 0.04,
  ], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

/** Scrolls each channel's water (or lava) along its course, and sways the pools' (`water` from buildLevelMeshes). */
export function flowWater(water, time) {
  for (const w of water) {
    if (w.sway) w.map.offset.set(Math.sin(time * POOL_SWAY.speed[0]) * POOL_SWAY.amt, Math.cos(time * POOL_SWAY.speed[1]) * POOL_SWAY.amt);
    else w.map.offset[w.axis] = (-w.flow * time * (w.speed ?? FLOW_SPEED)) % 1;
  }
}

/**
 * Lava pouring out of the demon's mouth over the end `e` of a channel (see decor.js's wallFace) down into it,
 * `depth` below the floor: a strip of lava falling down the wall. Returns it to flow like a channel's surface.
 */
function lavaFall(group, texture, e, depth) {
  const f = wallFace(e.x, e.y, e.side), out = [Math.sin(f.yaw), Math.cos(f.yaw)], height = LAVA_FALL.top + depth;
  const map = texture.clone();
  map.needsUpdate = true;
  map.repeat.set(LAVA_FALL.width / TILE, height / TILE);
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(LAVA_FALL.width, height), new THREE.MeshBasicMaterial({ map }));
  fall.position.set(f.x * TILE + out[0] * LAVA_FALL.out, LAVA_FALL.top - height / 2, f.y * TILE + out[1] * LAVA_FALL.out);
  fall.rotation.y = f.yaw;
  const splash = glowSprite(LAVA_GLOW.color, 1.2, 0.6);
  splash.position.set(f.x * TILE + out[0] * (LAVA_FALL.out + 0.1), -depth + 0.15, f.y * TILE + out[1] * (LAVA_FALL.out + 0.1));
  group.add(fall, splash);
  return { map, axis: 'y', flow: -1, speed: LAVA_FALL.speed };
}

/** Frees a level's geometry and materials. Textures are shared between levels and kept. */
export function disposeGroup(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) for (const m of [].concat(o.material)) m.dispose();
  });
}

/**
 * A door in a wall-ring tile: the theme's door model (see tools/modelgen/doorkit.mjs), its passage along local z,
 * turned for east/west walls. Its moving parts (`parts`: a swinging `leaf`, or `leaf_left` and `leaf_right`
 * that slide apart, and the `lock` shown while it's locked) are moved by Level.poseDoor. `slide`: how far each
 * sliding half goes, its own width.
 */
function buildDoor(d, type) {
  const group = propRig(type).clone();
  const parts = {};
  group.traverse((o) => {
    if (!o.isGroup || !o.name) return;
    parts[o.name] = o;
    o.userData.rest = o.position.clone();
  });
  if (parts.lock) parts.lock.visible = !!d.locked;
  const slide = parts.leaf_left ? new THREE.Box3().setFromObject(parts.leaf_left).getSize(new THREE.Vector3()).x : 0;
  const alongZ = d.side === 'N' || d.side === 'S';
  group.rotation.y = alongZ ? 0 : Math.PI / 2;
  group.position.set((d.x + 0.5) * TILE, 0, (d.y + 0.5) * TILE);
  return { group, parts, alongZ, slide };
}

/**
 * Puts a door's moving parts where being `amt` open (0..1, eased) has them: its leaf swung round, `swing` (±1)
 * saying which way (toward +z for -1), or its two halves slid apart.
 */
export function poseDoor(door, amt, swing = 1) {
  const k = amt * amt * (3 - 2 * amt);
  const { leaf, leaf_left: l, leaf_right: r } = door.parts;
  if (leaf) leaf.rotation.y = (swing * k * Math.PI) / 2;
  if (l) l.position.x = l.userData.rest.x - k * door.slide;
  if (r) r.position.x = r.userData.rest.x + k * door.slide;
}

function buildPedestal(p, stoneMat) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 1.0), stoneMat);
  base.position.y = 0.1;
  const col = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.6), stoneMat);
  col.position.y = 0.6;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.85), stoneMat);
  top.position.y = 1.06;
  g.add(base, col, top);
  g.position.set((p.x + 0.5) * TILE, 0, (p.y + 0.5) * TILE);
  return g;
}

/**
 * The wall lights' flames, sconces and all (`violet`: burning violet). The shop's are marked `shop`. A room may bring
 * its own (`sconces`, an arena's: see arenas.js), in place of one or two on its walls at random.
 */
function buildSconces(data, group, rng, isWall, rough, violet) {
  const spots = [];
  for (const r of data.rooms) {
    if (r.id === data.shop?.room) continue; // the shop brings its own
    if (r.sconces) {
      spots.push(...r.sconces);
      continue;
    }
    const cands = [];
    // Not on a wall that already has something on it (see decor.js).
    const free = (x, y, side) => !data.wallUsed?.has(faceKey(x, y, side));
    for (let x = r.x; x < r.x + r.w; x++) {
      if (isWall(x, r.y - 1) && free(x, r.y, 'N')) cands.push({ x: (x + 0.5) * TILE, z: r.y * TILE + 0.1, ry: 0 });
      if (isWall(x, r.y + r.h) && free(x, r.y + r.h - 1, 'S')) cands.push({ x: (x + 0.5) * TILE, z: (r.y + r.h) * TILE - 0.1, ry: Math.PI });
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      if (isWall(r.x - 1, y) && free(r.x, y, 'W')) cands.push({ x: r.x * TILE + 0.1, z: (y + 0.5) * TILE, ry: Math.PI / 2 });
      if (isWall(r.x + r.w, y) && free(r.x + r.w - 1, y, 'E')) cands.push({ x: (r.x + r.w) * TILE - 0.1, z: (y + 0.5) * TILE, ry: -Math.PI / 2 });
    }
    rng.shuffle(cands);
    const n = Math.min(cands.length, rng.int(1, 2));
    for (let i = 0; i < n; i++) spots.push(cands[i]);
  }
  // Along the passages between the rooms, a light every so often (none nearer another than CORRIDOR_GAP tiles), clear
  // of the doorways (see corridorMask) and of walls with something on them.
  const passage = corridorMask(data.grid, data.w, data.rooms), cands = [];
  for (let i = 0; i < passage.length; i++) {
    if (!passage[i]) continue;
    const x = i % data.w, y = (i / data.w) | 0, free = (side) => !data.wallUsed?.has(faceKey(x, y, side));
    if (isWall(x, y - 1) && free('N')) cands.push({ x, y, spot: { x: (x + 0.5) * TILE, z: y * TILE + 0.1, ry: 0 } });
    if (isWall(x, y + 1) && free('S')) cands.push({ x, y, spot: { x: (x + 0.5) * TILE, z: (y + 1) * TILE - 0.1, ry: Math.PI } });
    if (isWall(x - 1, y) && free('W')) cands.push({ x, y, spot: { x: x * TILE + 0.1, z: (y + 0.5) * TILE, ry: Math.PI / 2 } });
    if (isWall(x + 1, y) && free('E')) cands.push({ x, y, spot: { x: (x + 1) * TILE - 0.1, z: (y + 0.5) * TILE, ry: -Math.PI / 2 } });
  }
  const lit = [];
  for (const c of rng.shuffle(cands)) {
    if (lit.some((l) => Math.max(Math.abs(l.x - c.x), Math.abs(l.y - c.y)) < CORRIDOR_GAP)) continue;
    lit.push(c);
    spots.push(c.spot);
  }
  rng.shuffle(spots);
  // The shop's sconces burn blue. They go first, so they're sure of a light.
  if (data.shop) spots.unshift(...data.shop.sconces.map((s) => ({ ...s, blue: true })));

  sconceTemplate ??= buildBBModel(sconceModel, MODEL_PX);
  blueSconceTemplate ??= blueEmbers(sconceTemplate.clone());
  const lightsOf = data.theme.lights;
  const flames = [];
  for (const s of spots) {
    const kind = s.blue || !lightsOf ? 'sconce' : rng.pick(lightsOf), fit = FITTINGS[kind];
    const template = kind !== 'sconce' ? propTemplate(kind) : s.blue ? blueSconceTemplate : sconceTemplate;
    const sg = template.clone();
    const fire = new THREE.Vector3().fromArray(template.userData.anchors.flame);
    const flame = new Flame({ ...fit.flame, seed: rng.next(), blue: s.blue, violet: violet && !s.blue });
    flame.position.copy(fire);
    const fireLook = s.blue ? BLUE_FIRE : violet ? VIOLET_FIRE : fit.fire;
    const halo = glowSprite(fireLook.color, fit.halo, 0.55);
    halo.position.set(fire.x, fire.y + fit.flame.height * 0.35, fire.z + 0.02);
    sg.add(flame, halo);
    // Spots are 0.1 m out from the wall face; step back onto it, and on rough rock, out or in with the rock.
    const out = new THREE.Vector3(Math.sin(s.ry), 0, Math.cos(s.ry)); // away from the wall
    const onWall = [s.x - out.x * 0.1, 1.85, s.z - out.z * 0.1];
    const bump = rough ? rough.offset(onWall, out.toArray()) : 0;
    sg.position.set(onWall[0] + out.x * bump, 1.85, onWall[2] + out.z * bump);
    sg.rotation.y = s.ry;
    group.add(sg);
    flames.push({ flame, halo, fire: fireLook, phase: rng.next() * 10, pos: new THREE.Vector3(s.x, 2.0, s.z).addScaledVector(out, 0.6 + bump), shop: s.blue });
  }
  return flames;
}

/**
 * The level's point lights, SCONCE_LIGHTS of them, given to the first of `sources` ({ pos, fire, flame? }) to begin
 * with; shareLights moves them on. Returns { lights, share }: `share` is what shareLights keeps between calls.
 */
function castLights(group, sources) {
  const lights = [];
  for (let i = 0; i < SCONCE_LIGHTS; i++) {
    const l = new THREE.PointLight(0xff9040, 0, 11, 1.8);
    lightUp(l, sources[i] ?? null, 1);
    group.add(l);
    lights.push(l);
  }
  return { lights, share: { sources, t: 0, want: null, near: null, ready: false } };
}

/**
 * Gives light `l` to `src` (a source as castLights takes them), or parks it in the dark with none, `w` (0..1) of the way
 * faded in. A source with a flame keeps its light (`light`), to flicker with it.
 */
function lightUp(l, src, w) {
  if (l.userData.src) l.userData.src.light = null;
  l.userData.src = src;
  l.userData.w = w;
  if (!src) {
    l.position.set(0, -50, 0);
    l.userData.base = 0;
    l.intensity = 0;
    return;
  }
  l.color.setHex(src.fire.color);
  l.position.copy(src.pos); // already nudged off the wall so it lights the room, not just the bricks
  l.userData.base = src.fire.light;
  l.intensity = src.fire.light * w;
  src.light = l;
}

/**
 * Hands the level's few real lights (`lights`, SCONCE_LIGHTS of them) round the sources nearest the viewer at (x, z),
 * so the fittings about you light the walls wherever you go: `share` is castLights'. A light whose source has fallen
 * behind the rest fades out, then fades in again at the nearest one without a light; one whose source is still about
 * as near as the others stays put, so they don't shuffle back and forth. The first call gives them out at once. Call
 * it every frame; a flame's own flicker sets its light's strength (times `userData.w`, how far faded in). The shop's
 * blue flames count as nearer than they are, while you're near them (SHOP_PULL).
 */
export function shareLights(lights, share, x, z, dt) {
  const dist = (src) => {
    const d = Math.hypot(src.pos.x - x, src.pos.z - z);
    return src.shop && d < SHOP_PULL.within ? d * SHOP_PULL.by : d;
  };
  if ((share.t -= dt) <= 0 || !share.ready) {
    share.t = 0.25;
    const ranked = [...share.sources].sort((a, b) => dist(a) - dist(b));
    share.want = ranked.slice(0, SCONCE_LIGHTS);
    share.near = ranked.length ? dist(ranked[Math.min(SCONCE_LIGHTS, ranked.length) - 1]) + 3 : 0;
  }
  if (!share.ready) {
    share.ready = true;
    lights.forEach((l, i) => lightUp(l, share.want[i] ?? null, 1));
    return;
  }
  for (const l of lights) {
    const u = l.userData, stay = u.src && dist(u.src) <= share.near;
    u.w = stay ? Math.min(1, u.w + dt * LIGHT_FADE) : Math.max(0, u.w - dt * LIGHT_FADE);
    if (u.w === 0) lightUp(l, share.want.find((src) => !src.light) ?? null, 0);
    if (u.src && !u.src.flame) l.intensity = u.base * u.w;
  }
}

/** Swaps red and blue in a sconce's glowing materials, so its embers match a blue flame. */
function blueEmbers(sconce) {
  sconce.traverse((o) => {
    if (!o.isMesh || !o.material.isMeshBasicMaterial) return;
    o.material = o.material.clone();
    o.material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n\tdiffuseColor.rgb = diffuseColor.bgr;');
    };
    o.material.customProgramCacheKey = () => 'bgr';
  });
  return sconce;
}
