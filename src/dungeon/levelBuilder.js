import * as THREE from 'three';
import { TILE, WALL_H } from '../config.js';
import { T } from './tiles.js';
import { getTextures, getDoorTexture } from './textures.js';
import { RNG } from '../rng.js';
import { glowSprite } from '../fx/glow.js';
import { Flame } from '../fx/flame.js';

const SCONCE_LIGHTS = 6; // constant per level so shaders never need recompiling between floors

class GeoBuilder {
  constructor() {
    this.pos = []; this.nrm = []; this.uv = []; this.col = [];
  }

  /** p: 4 corners, n: desired normal, uv: 4 uvs, c: 4 brightness values */
  quad(p, n, uv, c) {
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

export function buildLevelMeshes(data) {
  const { w, h, grid, theme } = data;
  const tex = getTextures(theme);
  const rng = new RNG(`deco:${data.depth}`);
  const get = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? T.WALL : grid[y * w + x]);
  const isWall = (x, y) => get(x, y) === T.WALL;

  const floor = new GeoBuilder(), ceil = new GeoBuilder(), walls = new GeoBuilder();
  const vh = WALL_H / TILE;

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

      if (t !== T.STAIRS_DOWN) {
        floor.quad([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], [0, 1, 0],
          [[0, 0], [1, 0], [1, 1], [0, 1]], ao);
      }
      if (t !== T.STAIRS_UP) {
        ceil.quad([[x0, WALL_H, z0], [x1, WALL_H, z0], [x1, WALL_H, z1], [x0, WALL_H, z1]], [0, -1, 0],
          [[0, 0], [1, 0], [1, 1], [0, 1]], ao.map((v) => v * 0.8));
      }

      const b = 0.62 * tint, tp = 1.0 * tint;
      const wc = [b, b, tp, tp];
      const wuv = [[0, 0], [1, 0], [1, vh], [0, vh]];
      if (isWall(x, y - 1)) walls.quad([[x0, 0, z0], [x1, 0, z0], [x1, WALL_H, z0], [x0, WALL_H, z0]], [0, 0, 1], wuv, wc);
      if (isWall(x, y + 1)) walls.quad([[x1, 0, z1], [x0, 0, z1], [x0, WALL_H, z1], [x1, WALL_H, z1]], [0, 0, -1], wuv, wc);
      if (isWall(x - 1, y)) walls.quad([[x0, 0, z1], [x0, 0, z0], [x0, WALL_H, z0], [x0, WALL_H, z1]], [1, 0, 0], wuv, wc);
      if (isWall(x + 1, y)) walls.quad([[x1, 0, z0], [x1, 0, z1], [x1, WALL_H, z1], [x1, WALL_H, z0]], [-1, 0, 0], wuv, wc);
    }
  }

  const group = new THREE.Group();
  const mat = (map) => new THREE.MeshLambertMaterial({ map, vertexColors: true });
  group.add(new THREE.Mesh(floor.build(), mat(tex.floor)));
  group.add(new THREE.Mesh(ceil.build(), mat(tex.ceiling)));
  group.add(new THREE.Mesh(walls.build(), mat(tex.wall)));

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

  const { flames, lights } = buildSconces(data, group, rng, isWall);

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
  return { group, flames, lights, obstacles, doors };
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

function buildSconces(data, group, rng, isWall) {
  const spots = [];
  for (const r of data.rooms) {
    const cands = [];
    for (let x = r.x; x < r.x + r.w; x++) {
      if (isWall(x, r.y - 1)) cands.push({ x: (x + 0.5) * TILE, z: r.y * TILE + 0.1, ry: 0 });
      if (isWall(x, r.y + r.h)) cands.push({ x: (x + 0.5) * TILE, z: (r.y + r.h) * TILE - 0.1, ry: Math.PI });
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      if (isWall(r.x - 1, y)) cands.push({ x: r.x * TILE + 0.1, z: (y + 0.5) * TILE, ry: Math.PI / 2 });
      if (isWall(r.x + r.w, y)) cands.push({ x: (r.x + r.w) * TILE - 0.1, z: (y + 0.5) * TILE, ry: -Math.PI / 2 });
    }
    rng.shuffle(cands);
    const n = Math.min(cands.length, rng.int(1, 2));
    for (let i = 0; i < n; i++) spots.push(cands[i]);
  }
  rng.shuffle(spots);

  const bracketMat = new THREE.MeshLambertMaterial({ color: 0x2a2420 });
  const flames = [];
  for (const s of spots) {
    const sg = new THREE.Group();
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.2), bracketMat);
    bracket.position.set(0, -0.1, 0.08);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.1, 6), bracketMat);
    cup.position.set(0, 0.08, 0.18);
    const flame = new Flame({ width: 0.3, height: 0.46, pixel: 0.025, seed: rng.next() });
    flame.position.set(0, 0.1, 0.18);
    const halo = glowSprite(0xff9040, 0.9, 0.55);
    halo.position.set(0, 0.26, 0.2);
    sg.add(bracket, cup, flame, halo);
    sg.position.set(s.x, 1.85, s.z);
    sg.rotation.y = s.ry;
    group.add(sg);
    const out = new THREE.Vector3(Math.sin(s.ry), 0, Math.cos(s.ry)); // away from the wall
    flames.push({ flame, halo, phase: rng.next() * 10, pos: new THREE.Vector3(s.x, 2.0, s.z).addScaledVector(out, 0.6) });
  }

  const lights = [];
  for (let i = 0; i < SCONCE_LIGHTS; i++) {
    const l = new THREE.PointLight(0xff9040, 0, 11, 1.8);
    const f = flames[i];
    if (f) {
      l.position.copy(f.pos); // already nudged off the wall so it lights the room, not just the bricks
      l.userData.base = 9;
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
