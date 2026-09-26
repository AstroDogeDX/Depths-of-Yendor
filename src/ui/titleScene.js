import * as THREE from 'three';
import { THEMES, FLOORS_PER_THEME, TILE, EYE_H } from '../config.js';
import { generateLevel } from '../dungeon/generator.js';
import { buildLevelMeshes, disposeGroup, flowWater, propsForTheme, poseDoor } from '../dungeon/levelBuilder.js';
import { loadProps } from '../dungeon/props.js';
import { T } from '../dungeon/tiles.js';
import { Drips } from '../fx/drips.js';

// Behind the title screen: a slow walk through a floor of each theme in turn, from the stairs you arrive by
// to the stairs down, and down them into the next theme. Only the level's architecture is built: no monsters
// or items. Each theme's props are fetched during the walk before it, so the next walk is ready by the time the
// last one ends; if one isn't, the screen stays black until it is.

const SPEED = 1.7; // m/s: an unhurried walk
const FADE_IN = 1.5; // seconds
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W, as stairs' `dir`
const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class TitleScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x000000, 2, 20);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
    this.camera.rotation.order = 'YXZ';
    this.torch = new THREE.PointLight(0xffb060, 24, 26, 1.7);
    this.ambient = new THREE.AmbientLight(0xffffff, 5);
    this.scene.add(this.camera, this.torch, this.ambient);
    this.themeIndex = -1;
    this.token = 0; // bumped by stop(), so a walk still waiting for its props doesn't start after all
    this.built = null;
    this.curve = null;
    this.fade = 1; // 1 = black; the title screen lays this over the view
    this.caption = '';
  }

  /** Starts the walk again, in the theme after the last one shown. */
  start() {
    this.next();
  }

  /** Frees the current floor while the game is being played. */
  stop() {
    this.token++;
    if (this.built) {
      this.scene.remove(this.built.group);
      disposeGroup(this.built.group);
    }
    this.built = null;
    this.curve = null;
  }

  next() {
    this.stop();
    this.themeIndex = (this.themeIndex + 1) % THEMES.length;
    const theme = THEMES[this.themeIndex];
    const pending = loadProps(propsForTheme(theme));
    if (!pending) {
      this.walk(theme);
      return;
    }
    const token = this.token;
    pending.then(() => { if (token === this.token) this.walk(theme); },
      () => setTimeout(() => { if (token === this.token) this.next(); }, 3000)); // couldn't load: try the next theme
  }

  walk(theme) {
    // Fetch the next theme's props while this one plays.
    loadProps(propsForTheme(THEMES[(this.themeIndex + 1) % THEMES.length]))?.catch(() => {});
    // One of the theme's ordinary floors: not its first (which has the shop) or its last (the boss's).
    const first = this.themeIndex * FLOORS_PER_THEME + 1;
    let data = null, points = null;
    for (let i = 0; i < 10 && !points; i++) {
      data = generateLevel(`title:${Math.random()}`, first + 1 + Math.floor(Math.random() * (FLOORS_PER_THEME - 2)));
      points = planWalk(data);
    }
    if (!points) return;

    this.built = buildLevelMeshes(data);
    this.drips = new Drips(this.built.group, this.built.drips);
    for (const d of this.built.doors) poseDoor(d, 1); // every door stands open
    this.scene.add(this.built.group);
    this.scene.fog.color.setHex(theme.fog);
    this.scene.fog.near = theme.fogNear;
    this.scene.fog.far = theme.fogFar;
    this.ambient.color.setHex(theme.ambient);
    this.fogColor = theme.fog;

    this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    this.length = this.curve.getLength();
    this.descent = points.descent; // the last stretch, down the stairs, fades to black
    this.dist = 0;
    this.t = 0;
    this.yaw = null;
    this.pitch = 0;
    this.caption = `${ROMAN[this.themeIndex]} · ${theme.name} · floors ${first}–${first + FLOORS_PER_THEME - 1}`;
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    if (!this.curve) return;
    this.t += dt;
    this.dist += SPEED * dt;
    if (this.dist >= this.length) {
      this.next();
      return;
    }
    const pos = this.curve.getPointAt(this.dist / this.length);
    const ahead = this.curve.getPointAt(Math.min(1, (this.dist + 2.5) / this.length));
    const dx = ahead.x - pos.x, dz = ahead.z - pos.z, flat = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz);
    const turn = Math.min(1, dt * 2);
    this.yaw = this.yaw === null ? yaw : this.yaw + wrapAngle(yaw - this.yaw) * turn;
    this.pitch += (Math.atan2(ahead.y - pos.y, Math.max(flat, 0.5)) * 0.7 - 0.05 - this.pitch) * turn;
    const bob = Math.sin(this.dist * 3.4) * 0.025;
    this.camera.position.set(pos.x, pos.y + bob, pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.t * 0.4) * 0.012);
    // The torch you carry, a little ahead and to the left.
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.torch.position.set(pos.x + fx * 0.35 + fz * 0.25, pos.y - 0.1, pos.z + fz * 0.35 - fx * 0.25);
    this.torch.intensity = 24 * (0.9 + Math.sin(this.t * 21) * 0.04 + Math.sin(this.t * 7.7) * 0.06);

    const left = this.length - this.dist;
    this.fade = Math.max(1 - this.t / FADE_IN, left < this.descent ? 1 - left / this.descent : 0);

    flowWater(this.built.water, this.t);
    this.built.haze?.update(this.t);
    this.drips.update(dt, this.camera.position);
    for (const f of this.built.flames) {
      const k = 0.85 + Math.sin(this.t * 17 + f.phase) * 0.08 + Math.sin(this.t * 5.3 + f.phase * 2) * 0.07;
      f.flame.update(this.t, k);
      f.halo.material.opacity = 0.35 + (k - 0.85) * 1.6;
      if (f.light) f.light.intensity = f.light.userData.base * k;
    }
  }

  render() {
    const r = this.renderer;
    r.setClearColor(this.fogColor ?? 0);
    r.clear();
    if (this.curve) r.render(this.scene, this.camera);
  }
}

/**
 * The walk's waypoints at eye height: the cheapest route from the tile in front of the up stairs to the one in
 * front of the down stairs, keeping to the middle of rooms, smoothed, then down into the stairwell. Null if
 * the floor makes a poor walk (too short or too long).
 */
function planWalk(data) {
  const { w, h, grid, up, down } = data;
  if (!down) return null;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? T.WALL : grid[y * w + x]);
  const open = (x, y) => at(x, y) === T.FLOOR || at(x, y) === T.DOOR || at(x, y) === T.BRIDGE;
  const [ux, uy] = DIRS[up.dir], [ddx, ddy] = DIRS[down.dir];
  const start = (up.y + uy) * w + up.x + ux, goal = (down.y + ddy) * w + down.x + ddx;

  // Dijkstra. Tiles beside a wall cost a little more, so the route crosses rooms rather than hugging walls.
  const cost = new Float64Array(w * h).fill(Infinity), prev = new Int32Array(w * h).fill(-1);
  const heap = [[0, start]];
  cost[start] = 0;
  while (heap.length) {
    const [c, i] = pop(heap);
    if (c > cost[i]) continue;
    if (i === goal) break;
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy, step] of N8) {
      const nx = x + dx, ny = y + dy;
      if (!open(nx, ny) || (dx && dy && (!open(x + dx, y) || !open(x, y + dy)))) continue;
      let walls = 0;
      for (const [ax, ay] of N8) if (at(nx + ax, ny + ay) === T.WALL) walls++;
      const n = ny * w + nx, nc = c + step + (walls ? 0.6 : 0);
      if (nc < cost[n]) {
        cost[n] = nc;
        prev[n] = i;
        push(heap, [nc, n]);
      }
    }
  }
  if (prev[goal] < 0) return null;
  const tiles = [];
  for (let i = goal; i >= 0; i = prev[i]) tiles.push(i);
  tiles.reverse();
  if (tiles.length < 14 || tiles.length > 70) return null;

  let pts = tiles.map((i) => [((i % w) + 0.5) * TILE, EYE_H, (((i / w) | 0) + 0.5) * TILE]);
  // Chaikin smoothing rounds the grid's corners off; the ends stay put.
  for (let k = 0; k < 2; k++) {
    const out = [pts[0]];
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j], b = pts[j + 1];
      out.push(a.map((v, m) => v * 0.75 + b[m] * 0.25), a.map((v, m) => v * 0.25 + b[m] * 0.75));
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  // Down the stairs: step into the stairwell and sink, heading away from its opening.
  const sx = (down.x + 0.5) * TILE, sz = (down.y + 0.5) * TILE;
  pts.push([sx + ddx * 0.5, EYE_H - 0.35, sz + ddy * 0.5], [sx, EYE_H - 0.9, sz], [sx - ddx * 0.6, EYE_H - 1.8, sz - ddy * 0.6]);
  const points = pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  points.descent = TILE * 1.3;
  return points;
}

function push(heap, item) {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p][0] <= heap[i][0]) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}

function pop(heap) {
  const top = heap[0], last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      i = m;
    }
  }
  return top;
}
