import * as THREE from 'three';
import { TILE, WALL_H, MODEL_PX, THEMES } from '../config.js';
import { T } from './tiles.js';
import { getTextures, getDoorTexture } from './textures.js';
import { RNG } from '../rng.js';
import { glowSprite } from '../fx/glow.js';
import { Flame } from '../fx/flame.js';
import { buildBBModel } from '../items/bbmodel.js';
import { placeProp, propTemplate } from './props.js';
import { roughRock } from './roughRock.js';
import { faceKey, wallFace, decorProps } from './decor.js';
import { SHOP_PROPS } from './rooms.js';
import sconceModel from '../../assets/models/sconce.bbmodel';

// Channels by what fills them (the theme's `channels.fill`): how far below the floor their surface lies, the
// prop that bridges them, and the props at their ends and along their beds.
const FILLS = {
  // Murky water flowing along it, running in and out through a grate in the wall at each end.
  water: { depth: 0.5, bridge: 'bridge', end: 'channel_grate' },
  // A deep pit, spikes and bones at the bottom, crossed on iron grating.
  spikes: { depth: 1.5, bridge: 'grate_bridge', bed: 'spike_pit' },
  // A chasm with no bottom to be seen, its sides fading into black, crossed on rickety rope bridges.
  chasm: { depth: 8, bridge: 'rope_bridge', dark: 5 },
};
const WATER_Y = -FILLS.water.depth;
const FLOW_SPEED = 0.35; // tiles a second
const PUDDLE_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const CANDLE = { width: 0.07, height: 0.14, pixel: 0.012 }; // a candle's flame

const SCONCE_LIGHTS = 6; // constant per level so shaders never need recompiling between floors
// Sconce fire: its glow and light colour, and the light's strength. Blue light looks dimmer, so it's stronger.
const FIRE = { color: 0xff9040, light: 9 };
const BLUE_FIRE = { color: 0x4090ff, light: 14 };
const LAMP_FIRE = { color: 0xffb860, light: 9 }; // an oil flame behind glass, yellower
// Wall lights: a theme's are named by `lights` in config.js (the sconce if it names none). Each is a Blockbench
// model whose origin sits on the wall 1.85 m up, with an empty group "flame" marking where its fire burns.
const FITTINGS = {
  sconce: { flame: { width: 0.3, height: 0.46, pixel: 0.025 }, halo: 0.9, fire: FIRE },
  wall_torch: { flame: { width: 0.26, height: 0.42, pixel: 0.024 }, halo: 0.9, fire: FIRE },
  lantern: { flame: { width: 0.09, height: 0.17, pixel: 0.013 }, halo: 1.3, fire: LAMP_FIRE },
};
// The colour of the glow about props that shine (glow_N anchors).
const GLOWS = { crystals: 0x50d8ff };
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

/**
 * Every prop a floor of `theme` might use: its decorations', its channels', its wall lights and, in every theme
 * after the first, the shop's. They must be loaded (loadProps) before one of its floors is built.
 */
export function propsForTheme(theme) {
  const fill = FILLS[theme.channels?.fill];
  return [...new Set([
    ...decorProps(theme.style),
    ...(fill ? [fill.bridge, fill.end, fill.bed].filter(Boolean) : []),
    ...(THEMES.indexOf(theme) > 0 ? SHOP_PROPS : []),
    ...(theme.lights ?? []),
  ])];
}

export function buildLevelMeshes(data) {
  const { w, h, grid, theme } = data;
  const tex = getTextures(theme);
  const rng = new RNG(`deco:${data.depth}`);
  const get = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? T.WALL : grid[y * w + x]);
  const isWall = (x, y) => get(x, y) === T.WALL;

  // Rough rock (see roughRock.js), calm round whatever is fixed flat to a wall and about the shop.
  const rough = theme.rough ? roughRock(data, [
    ...(data.decor ?? []).filter((p) => p.wall).map((p) => ({ x: p.x * TILE, z: p.y * TILE, r: 1.6 })),
    ...(data.shop ? [...data.shop.props, data.shop.keeper].map((p) => ({ x: p.x * TILE, z: p.y * TILE, r: 2 })) : []),
    ...(data.shop?.sconces ?? []).map((s) => ({ x: s.x, z: s.z, r: 1.4 })),
  ]) : null;
  const floor = new GeoBuilder(rough), ceil = new GeoBuilder(rough), walls = new GeoBuilder(rough), banks = new GeoBuilder(rough), abyss = new GeoBuilder(rough);
  const vh = WALL_H / TILE;
  const sunk = (t) => t === T.CHANNEL || t === T.BRIDGE; // a channel: the floor drops away
  const fill = FILLS[theme.channels?.fill];

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
      const tint = 0.9 + rng.next() * 0.12;
      const ao = [cornerAO(x, y), cornerAO(x + 1, y), cornerAO(x + 1, y + 1), cornerAO(x, y + 1)].map((v) => v * tint);

      if (t !== T.STAIRS_DOWN && !sunk(t)) {
        floor.quad([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], [0, 1, 0],
          [[0, 0], [1, 0], [1, 1], [0, 1]], ao);
      }
      if (t !== T.STAIRS_UP) {
        ceil.quad([[x0, WALL_H, z0], [x1, WALL_H, z0], [x1, WALL_H, z1], [x0, WALL_H, z1]], [0, -1, 0],
          [[0, 0], [1, 0], [1, 1], [0, 1]], ao.map((v) => v * 0.8));
      }

      const b = 0.62 * tint, tp = 1.0 * tint;
      const wc = [b, b, tp, tp];
      const wuv = tex.wallFullHeight ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [1, 0], [1, vh], [0, vh]];
      const side = (ya, yb, uv, c, builder, open) => {
        if (open(x, y - 1)) builder.quad([[x0, ya, z0], [x1, ya, z0], [x1, yb, z0], [x0, yb, z0]], [0, 0, 1], uv, c);
        if (open(x, y + 1)) builder.quad([[x1, ya, z1], [x0, ya, z1], [x0, yb, z1], [x1, yb, z1]], [0, 0, -1], uv, c);
        if (open(x - 1, y)) builder.quad([[x0, ya, z1], [x0, ya, z0], [x0, yb, z0], [x0, yb, z1]], [1, 0, 0], uv, c);
        if (open(x + 1, y)) builder.quad([[x1, ya, z0], [x1, ya, z1], [x1, yb, z1], [x1, yb, z0]], [-1, 0, 0], uv, c);
      };
      side(0, WALL_H, wuv, wc, walls, isWall);
      // A channel's sides run from the floor down to its surface, under the walls at its ends and along its banks.
      // A chasm's are rock that fades to black as it falls away; its texture repeats every two metres down.
      if (sunk(t)) {
        const deep = fill.dark ? (q) => 0.85 * tint * Math.max(0, 1 + q[1] / fill.dark) ** 1.5 : null;
        const buv = fill.dark ? [[0, 0], [1, 0], [1, fill.depth / TILE], [0, fill.depth / TILE]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
        side(-fill.depth, 0, buv, deep ?? [0.5 * tint, 0.5 * tint, 0.85 * tint, 0.85 * tint], banks, (nx, ny) => !sunk(get(nx, ny)));
      }
    }
  }

  const group = new THREE.Group();
  const mat = (map) => new THREE.MeshLambertMaterial({ map, vertexColors: true });
  group.add(new THREE.Mesh(floor.build(), mat(tex.floor)));
  group.add(new THREE.Mesh(ceil.build(), mat(tex.ceiling)));
  group.add(new THREE.Mesh(walls.build(), mat(tex.wall)));
  if (data.channels?.length) group.add(new THREE.Mesh(banks.build(), mat(tex.channel)));

  const stoneMat = new THREE.MeshLambertMaterial({ map: tex.floor, color: 0xb0a898 });
  const pitWallTex = tex.wall.clone();
  pitWallTex.repeat.set(1, 1.6);
  const pitMat = new THREE.MeshLambertMaterial({ map: pitWallTex, color: 0x807870 });

  if (data.down) group.add(buildDownStairs(data.down, stoneMat, pitMat));
  group.add(buildUpStairs(data.up, stoneMat, pitMat, data.depth === 1));

  const obstacles = [];
  for (const p of [data.amulet, data.shrine].filter(Boolean)) {
    group.add(buildPedestal(p, stoneMat));
    obstacles.push({ x: (p.x + 0.5) * TILE, z: (p.y + 0.5) * TILE, r: 0.55 });
  }

  // The shop's furniture. Items for sale rest in the slots of the counter and display tables, in order.
  const shopSlots = [];
  for (const p of data.shop?.props ?? []) {
    const prop = placeProp(p);
    group.add(prop.mesh);
    if (prop.obstacle) obstacles.push(prop.obstacle);
    shopSlots.push(...prop.slots);
  }

  const candles = [], glows = [], drips = []; // from props' candle_N, glow_N and drip_N anchors
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
  };
  // Channels: each one's surface (flowing water, or the floor of a pit), with bridges across and whatever its
  // fill puts at its ends and along its bed.
  const water = [];
  for (const c of data.channels ?? []) {
    const g = fill.dark ? abyss : new GeoBuilder(), y0 = -fill.depth;
    for (const { x, y } of c.tiles) {
      const x0 = x * TILE, x1 = x0 + TILE, z0 = y * TILE, z1 = z0 + TILE;
      g.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, 1, 0], [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], [1, 1, 1, 1]);
      // Turned a quarter at a time by position, so the pit floors don't all match.
      if (fill.bed) place({ type: fill.bed, x: x + 0.5, y: y + 0.5, yaw: ((x * 7 + y * 13) % 4) * (Math.PI / 2) });
    }
    if (theme.channels.fill === 'water') {
      const map = tex.water.clone();
      map.needsUpdate = true;
      group.add(new THREE.Mesh(g.build(), new THREE.MeshPhongMaterial({ map, vertexColors: true, shininess: 60, specular: 0x3c4a38 })));
      water.push({ map, axis: c.axis, flow: c.flow });
    } else if (!fill.dark) group.add(new THREE.Mesh(g.build(), mat(tex.pitFloor)));
    for (const b of c.bridges) place({ type: fill.bridge, x: b.x + 0.5, y: b.y + 0.5, yaw: c.axis === 'x' ? 0 : Math.PI / 2 });
    if (fill.end) for (const e of c.ends) place({ type: fill.end, ...wallFace(e.x, e.y, e.side) });
  }
  // A chasm's floor is only darkness, far down.
  if (fill?.dark) group.add(new THREE.Mesh(abyss.build(), new THREE.MeshBasicMaterial({ color: 0x000000 })));
  // The theme's decorations (see decor.js). Puddles and cobwebs are drawn here; the rest are props.
  const webMat = tex.cobweb && new THREE.MeshLambertMaterial({ map: tex.cobweb, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const puddleMats = tex.puddles?.map((map) => new THREE.MeshPhongMaterial({
    map, transparent: true, depthWrite: false, shininess: 80, specular: 0x506050,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  for (const p of data.decor ?? []) {
    if (p.type === 'cobweb') {
      if (webMat) group.add(cobweb(p, webMat));
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

  const { flames, lights } = buildSconces(data, group, rng, isWall, rough);
  // Soft glows about things that shine by themselves (glow_N anchors: the caves' crystals).
  for (const g of glows) {
    const halo = glowSprite(g.color, 0.9, 0.45);
    halo.position.set(g.x, g.y, g.z);
    group.add(halo);
  }
  // Candles: small flames of their own, flickering with the sconces', but giving no light.
  for (const [x, y, z] of candles) {
    const flame = new Flame({ ...CANDLE, seed: rng.next() });
    flame.position.set(x, y, z);
    const halo = glowSprite(0xffa050, 0.28, 0.5);
    halo.position.set(x, y + 0.06, z);
    group.add(flame, halo);
    flames.push({ flame, halo, phase: rng.next() * 10 });
  }

  const frameMat = new THREE.MeshLambertMaterial({ map: tex.wall, color: 0x8a8070 });
  const doorMats = {
    plain: new THREE.MeshLambertMaterial({ map: getDoorTexture(false) }),
    locked: new THREE.MeshLambertMaterial({ map: getDoorTexture(true) }),
    lock: new THREE.MeshLambertMaterial({ color: 0xc8a030, emissive: 0x302000 }),
  };
  const doors = data.doors.map((d) => {
    const built = buildDoor(d, frameMat, doorMats);
    group.add(built.group);
    return built;
  });
  return { group, flames, lights, obstacles, doors, shopSlots, water, drips: dripSources(data, rng, drips) };
}

/**
 * Where water drips (see fx/drips.js): from every drain pipe's mouth, from the vault over half the puddles and
 * a tile or two of each water channel, and from props' drip_N anchors (the caves' stalactites), given as
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

/** Scrolls each channel's water along its course (`water` from buildLevelMeshes). */
export function flowWater(water, time) {
  for (const w of water) w.map.offset[w.axis] = (-w.flow * time * FLOW_SPEED) % 1;
}

/** Frees a level's geometry and materials. Textures are shared between levels and kept. */
export function disposeGroup(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) for (const m of [].concat(o.material)) m.dispose();
  });
}

export const DOOR_HEIGHT = 2.35;

/**
 * A door in a wall-ring tile: lintel, jambs and a leaf hinged on one side. Built with the passage along
 * local z, then turned for east/west walls. The leaf swings into the room (see Level.update for `swing`).
 */
function buildDoor(d, frameMat, mats) {
  const g = new THREE.Group();
  const half = TILE / 2, DH = DOOR_HEIGHT, depth = 0.5;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(TILE, WALL_H - DH, depth), frameMat);
  lintel.position.set(0, DH + (WALL_H - DH) / 2, 0);
  g.add(lintel);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, DH, depth), frameMat);
    post.position.set(s * (half - 0.08), DH / 2, 0);
    g.add(post);
  }
  const pivot = new THREE.Group();
  pivot.position.set(-half + 0.16, 0, 0);
  const leafW = TILE - 0.32;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, DH - 0.03, 0.1), d.locked ? mats.locked : mats.plain);
  leaf.position.set(leafW / 2, DH / 2, 0);
  pivot.add(leaf);
  if (d.locked) {
    for (const z of [-0.07, 0.07]) {
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.05), mats.lock);
      lock.position.set(leafW - 0.25, 1.1, z);
      pivot.add(lock);
    }
  }
  g.add(pivot);
  const alongZ = d.side === 'N' || d.side === 'S';
  g.rotation.y = alongZ ? 0 : Math.PI / 2;
  g.position.set((d.x + 0.5) * TILE, 0, (d.y + 0.5) * TILE);
  // The room lies on local +z for north/west doors, -z for south/east; a negative turn swings toward +z.
  const swing = d.side === 'N' || d.side === 'W' ? -1 : 1;
  return { group: g, pivot, swing, leaf };
}

function buildDownStairs(s, stoneMat, pitMat) {
  const g = new THREE.Group();
  const half = TILE / 2, depth = 3.2;
  const wall = (x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(TILE, depth), pitMat);
    m.position.set(x, -depth / 2, z);
    m.rotation.y = ry;
    g.add(m);
  };
  wall(0, -half, 0);
  wall(-half, 0, Math.PI / 2);
  wall(half, 0, -Math.PI / 2);
  wall(0, half, Math.PI);

  const N = 6, sd = TILE / N;
  for (let i = 0; i < N; i++) {
    const top = -(i + 1) * 0.42;
    const bh = depth + top;
    const m = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.98, bh, sd), stoneMat);
    m.position.set(0, -depth + bh / 2, half - (i + 0.5) * sd);
    g.add(m);
  }
  // Knee-high rim on the three closed sides.
  const rimH = 0.55, th = 0.16;
  const rim = (sx, sz, px, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, rimH, sz), stoneMat);
    m.position.set(px, rimH / 2, pz);
    g.add(m);
  };
  rim(th, TILE, -half + th / 2, 0);
  rim(th, TILE, half - th / 2, 0);
  rim(TILE, th, 0, -half + th / 2);

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 0.9, TILE * 0.9),
    new THREE.MeshBasicMaterial({ color: 0x1a3a70, transparent: true, opacity: 0.7, fog: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -depth + 0.05;
  g.add(glow);

  g.position.set((s.x + 0.5) * TILE, 0, (s.y + 0.5) * TILE);
  g.rotation.y = DIR_ANGLE[s.dir];
  return g;
}

function buildUpStairs(s, stoneMat, pitMat, toSurface) {
  const g = new THREE.Group();
  const half = TILE / 2, shaft = 3;
  const N = 7, sd = TILE / N;
  for (let i = 0; i < N; i++) {
    const top = (i + 1) * (WALL_H / N);
    const m = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.98, top, sd), stoneMat);
    m.position.set(0, top / 2, half - (i + 0.5) * sd);
    g.add(m);
  }
  const wall = (x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(TILE, shaft), pitMat);
    m.position.set(x, WALL_H + shaft / 2, z);
    m.rotation.y = ry;
    g.add(m);
  };
  wall(0, -half, 0);
  wall(-half, 0, Math.PI / 2);
  wall(half, 0, -Math.PI / 2);
  wall(0, half, Math.PI);
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE),
    new THREE.MeshBasicMaterial({ color: toSurface ? 0xfff0c8 : 0x6a5030, fog: false }));
  cap.rotation.x = Math.PI / 2;
  cap.position.y = WALL_H + shaft;
  g.add(cap);

  g.position.set((s.x + 0.5) * TILE, 0, (s.y + 0.5) * TILE);
  g.rotation.y = DIR_ANGLE[s.dir];
  return g;
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

function buildSconces(data, group, rng, isWall, rough) {
  const spots = [];
  for (const r of data.rooms) {
    if (r.id === data.shop?.room) continue; // the shop brings its own
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
    const flame = new Flame({ ...fit.flame, seed: rng.next(), blue: s.blue });
    flame.position.copy(fire);
    const fireLook = s.blue ? BLUE_FIRE : fit.fire;
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
    flames.push({ flame, halo, fire: fireLook, phase: rng.next() * 10, pos: new THREE.Vector3(s.x, 2.0, s.z).addScaledVector(out, 0.6 + bump) });
  }

  const lights = [];
  for (let i = 0; i < SCONCE_LIGHTS; i++) {
    const l = new THREE.PointLight(0xff9040, 0, 11, 1.8);
    const f = flames[i];
    if (f) {
      l.color.setHex(f.fire.color);
      l.position.copy(f.pos); // already nudged off the wall so it lights the room, not just the bricks
      l.userData.base = f.fire.light;
      f.light = l;
    } else {
      l.position.set(0, -50, 0);
      l.userData.base = 0;
    }
    l.intensity = l.userData.base;
    group.add(l);
    lights.push(l);
  }
  return { flames, lights };
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
