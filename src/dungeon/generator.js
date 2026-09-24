import { RNG } from '../rng.js';
import { MAX_DEPTH, themeForDepth, isShopDepth, danger } from '../config.js';
import { spawnTable } from '../monsters/defs.js';
import { randomItem, makeItem } from '../items/generate.js';
import { T } from './tiles.js';
import { ROOM_TYPES } from './rooms.js';

export { T };

const W = 52;
const H = 52;
const GAP = 3;  // min tiles between room interiors: each room's wall plus one corridor lane
const EDGE = 3; // min distance from a room interior to the map border
const SIDES = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

/**
 * Pixel Dungeon-style layout, built graph-first:
 *
 *  1. Plan: a *loop* of rooms with the entrance on one side and the exit (or the Amulet vault) opposite,
 *     so there are always two independent routes between them; plus *branches*, rooms that hang off
 *     the loop (or off other branches) as dead ends. Specialist rooms live in rooms.js.
 *  2. Lay the loop out around a ring, then fit branch rooms into free space beside their parent.
 *  3. Connect: each connection gets a doorway on both rooms' walls and an A*-routed corridor between
 *     them. Rooms are sealed boxes corridors can never cut through, so a room can only be entered
 *     through its own doorways. That is what makes a lock mean something, and why locked doors
 *     can only ever sit on a branch, never the loop.
 *  4. Furnish each room by type, then populate.
 *
 * opts.artefact       artefact type for this floor's shrine, if any
 * opts.extraBranches  extra branch specs, e.g. [{ type: 'standard', locked: true }]
 *
 * A branch spec may name its parent room's type, e.g. { type: 'shop', parent: 'entrance' }.
 */
export function generateLevel(seed, depth, opts = {}) {
  const rng = new RNG(`${seed}:depth:${depth}`);
  for (let attempt = 0; attempt < 100; attempt++) {
    const level = attemptLevel(rng, depth, opts);
    if (level) return level;
  }
  throw new Error(`Level generation failed for seed ${seed}, depth ${depth}`);
}

function planRooms(rng, depth, opts) {
  const d = danger(depth);
  const n = rng.int(5, 6) + (d >= 4 ? 1 : 0) + (d >= 8 ? 1 : 0);
  const loop = new Array(n).fill('standard');
  loop[0] = 'entrance';
  // Boss floors (isBossDepth) are built like the rest for now; the last one holds the Amulet's vault.
  loop[Math.floor(n / 2)] = depth >= MAX_DEPTH ? 'vault' : 'exit';
  const branches = [];
  // The shop goes first, so the room beside the entrance is still free for it.
  if (isShopDepth(depth)) branches.push({ type: 'shop', required: true, parent: 'entrance' });
  if (opts.artefact) branches.push({ type: 'shrine', required: true });
  for (const b of opts.extraBranches ?? []) branches.push({ required: true, ...b });
  const optional = rng.int(1, 3) + (d >= 6 ? 1 : 0);
  for (let i = 0; i < optional; i++) branches.push({ type: 'standard' });
  return { loop, branches };
}

function attemptLevel(rng, depth, opts) {
  const grid = new Uint8Array(W * H); // all WALL
  const foot = new Int16Array(W * H).fill(-1); // owning room id for interior + wall-ring tiles
  const corr = new Uint8Array(W * H); // 1 = loop corridor, 2 = branch corridor
  const rooms = [];
  const doorways = [];
  const edges = [];
  const idx = (x, y) => y * W + x;

  const fits = (x, y, w, h) => {
    if (x < EDGE || y < EDGE || x + w > W - EDGE || y + h > H - EDGE) return false;
    if (!rooms.every((o) => x + w + GAP <= o.x || o.x + o.w + GAP <= x || y + h + GAP <= o.y || o.y + o.h + GAP <= y)) return false;
    // Branch rooms arrive after corridors exist: a room dropped on a corridor would let it cut through the walls.
    for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) if (corr[idx(xx, yy)]) return false;
    return true;
  };
  const findSpot = (tx, ty, w, h, radius) => {
    if (fits(tx, ty, w, h)) return { x: tx, y: ty };
    for (let k = 0; k < 80; k++) {
      const x = tx + rng.int(-radius, radius), y = ty + rng.int(-radius, radius);
      if (fits(x, y, w, h)) return { x, y };
    }
    return null;
  };
  const makeRoom = (type, x, y, w, h, extra) => {
    const def = ROOM_TYPES[type];
    const doorStyle = def.doors === 'mixed' ? (rng.chance(0.45) ? 'door' : 'arch') : def.doors;
    return { id: rooms.length, type, x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1), doorStyle, doorways: [], ...extra };
  };
  const claim = (r, id) => {
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) foot[idx(x, y)] = id;
  };

  // --- Doorways and corridors ---

  const pickDoorway = (room, other) => {
    const dx = other.cx - room.cx, dy = other.cy - room.cy;
    const horiz = Math.abs(dx) >= Math.abs(dy);
    const primary = horiz ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
    const secondary = horiz ? (dy > 0 ? 'S' : 'N') : (dx > 0 ? 'E' : 'W');
    const order = [primary, secondary, ...['N', 'S', 'E', 'W'].filter((s) => s !== primary && s !== secondary)];
    for (const side of order) {
      const [nx, ny] = SIDES[side];
      const cands = [];
      if (nx === 0) {
        const y = ny < 0 ? room.y - 1 : room.y + room.h;
        for (let x = room.x; x < room.x + room.w; x++) cands.push({ x, y });
      } else {
        const x = nx < 0 ? room.x - 1 : room.x + room.w;
        for (let y = room.y; y < room.y + room.h; y++) cands.push({ x, y });
      }
      // Aim at the other room, with some wobble so doorways aren't always dead centre.
      const aim = nx === 0 ? other.cx : other.cy;
      const scored = cands.map((c) => [Math.abs((nx === 0 ? c.x : c.y) - aim) + rng.next() * 2.5, c]).sort((p, q) => p[0] - q[0]);
      for (const [, c] of scored) {
        const ox = c.x + nx, oy = c.y + ny;
        if (ox < 1 || oy < 1 || ox > W - 2 || oy > H - 2 || foot[idx(ox, oy)] >= 0) continue;
        if (room.doorways.some((d) => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) < 2)) continue;
        return { x: c.x, y: c.y, ox, oy, side };
      }
    }
    return null;
  };

  // Loop corridors avoid crossing each other; branch corridors are happy to join existing ones.
  const tileCost = (i, kind) => {
    if (corr[i]) return kind === 'loop' ? 6 : -0.6;
    const near = corr[i - 1] || corr[i + 1] || corr[i - W] || corr[i + W];
    return near ? (kind === 'loop' ? 1.5 : 0.4) : 0;
  };

  // A* over (tile, heading) with a turn penalty, so corridors run straight and bend deliberately.
  // Room footprints are impassable: corridors can only touch a room at its doorways.
  const route = (sx, sy, gx, gy, kind) => {
    const N = W * H * 4;
    const g = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const heap = new Heap();
    const start = idx(sx, sy), goal = idx(gx, gy);
    const hh = (i) => (Math.abs((i % W) - gx) + Math.abs(((i / W) | 0) - gy)) * 0.5;
    for (let d = 0; d < 4; d++) {
      g[start * 4 + d] = 0;
      heap.push(start * 4 + d, hh(start));
    }
    const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
    while (heap.size) {
      const [st, f] = heap.pop();
      const i = st >> 2, d = st & 3;
      if (f > g[st] + hh(i) + 1e-6) continue;
      if (i === goal) {
        const path = [];
        for (let s = st; s >= 0; s = from[s]) path.push(s >> 2);
        return path;
      }
      const x = i % W, y = (i / W) | 0;
      for (let nd = 0; nd < 4; nd++) {
        const nx = x + DX[nd], ny = y + DY[nd];
        if (nx < 1 || ny < 1 || nx > W - 2 || ny > H - 2) continue;
        const ni = idx(nx, ny);
        if (foot[ni] >= 0) continue;
        const ng = g[st] + 1 + (nd !== d ? 0.9 : 0) + tileCost(ni, kind);
        const ns = ni * 4 + nd;
        if (ng < g[ns]) {
          g[ns] = ng;
          from[ns] = st;
          heap.push(ns, ng + hh(ni));
        }
      }
    }
    return null;
  };

  /** Join room a to room b. For a branch, a is the parent and b the new room (whose door may be locked). */
  const connect = (a, b, kind, locked) => {
    const da = pickDoorway(a, b), db = pickDoorway(b, a);
    if (!da || !db) return false;
    const path = route(da.ox, da.oy, db.ox, db.oy, kind);
    if (!path) return false;
    for (const i of path) {
      grid[i] = T.FLOOR;
      if (!corr[i]) corr[i] = kind === 'loop' ? 1 : 2;
    }
    const open = (room, d, lock) => {
      const style = lock ? 'door' : room.doorStyle;
      grid[idx(d.x, d.y)] = style === 'door' ? T.DOOR : T.FLOOR;
      const dw = { x: d.x, y: d.y, side: d.side, room: room.id, style, locked: !!lock, kind };
      room.doorways.push(dw);
      doorways.push(dw);
    };
    open(a, da, false);
    open(b, db, locked);
    edges.push({ a: a.id, b: b.id, kind, locked: !!locked });
    return true;
  };

  // --- 1 & 2: plan and lay out the loop ---

  const plan = planRooms(rng, depth, opts);
  const n = plan.loop.length;
  const rx = W * rng.range(0.25, 0.3), ry = H * rng.range(0.25, 0.3);
  const a0 = rng.range(0, Math.PI * 2);
  const turn = rng.chance(0.5) ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const { w, h } = ROOM_TYPES[plan.loop[i]].size(rng, depth);
    const a = a0 + turn * ((i + rng.range(-0.2, 0.2)) / n) * Math.PI * 2;
    const s = rng.range(0.85, 1.1);
    const spot = findSpot(Math.round(W / 2 + Math.cos(a) * rx * s - w / 2), Math.round(H / 2 + Math.sin(a) * ry * s - h / 2), w, h, 7);
    if (!spot) return null;
    const r = makeRoom(plan.loop[i], spot.x, spot.y, w, h, { onLoop: true });
    rooms.push(r);
    claim(r, r.id);
  }

  // --- 3: connect the loop, then grow branches ---

  for (let i = 0; i < n; i++) {
    if (!connect(rooms[i], rooms[(i + 1) % n], 'loop', false)) return null;
  }

  for (const spec of plan.branches) {
    const def = ROOM_TYPES[spec.type];
    let placed = false;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const parents = rooms.filter((r) => ROOM_TYPES[r.type].branchable && !r.locked && (!spec.parent || r.type === spec.parent));
      const loopParents = parents.filter((r) => r.onLoop);
      const parent = rng.pick(rng.chance(0.7) && loopParents.length ? loopParents : parents);
      const { w, h } = def.size(rng, depth);
      const a = rng.range(0, Math.PI * 2);
      const dist = (Math.max(parent.w, parent.h) + Math.max(w, h)) / 2 + rng.int(GAP + 1, GAP + 5);
      const x = Math.round(parent.cx + Math.cos(a) * dist - w / 2), y = Math.round(parent.cy + Math.sin(a) * dist - h / 2);
      if (!fits(x, y, w, h)) continue;
      const r = makeRoom(spec.type, x, y, w, h, { onLoop: false, locked: !!spec.locked, parent: parent.id });
      rooms.push(r);
      claim(r, r.id);
      if (connect(parent, r, 'branch', spec.locked)) placed = true;
      else {
        rooms.pop();
        claim(r, -1);
      }
    }
    if (!placed && spec.required) return null;
  }

  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[idx(x, y)] = T.FLOOR;
  }

  // --- 4: furnish ---

  const inRoom = new Int16Array(W * H).fill(-1); // room id for interior tiles only
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) inRoom[idx(x, y)] = r.id;

  const ctx = {
    rng, depth, artefact: opts.artefact,
    up: null, down: null, amulet: null, shrine: null, shop: null, monsters: [],
    get: (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T.WALL : grid[idx(x, y)]),
    set: (x, y, v) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) grid[idx(x, y)] = v; },
    roomTiles(room, pred) {
      const out = [];
      for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (pred(x, y)) out.push({ x, y });
      return out;
    },
    openAround(x, y) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (ctx.get(x + dx, y + dy) !== T.FLOOR) return false;
      return true;
    },
    /** Stairs are solid, so they go on a tile with open floor all round: they can never block a path. */
    placeStairs(room, type) {
      const tiles = ctx.roomTiles(room, (x, y) => ctx.openAround(x, y));
      const t = tiles.length ? rng.pick(tiles) : { x: room.cx, y: room.cy };
      ctx.set(t.x, t.y, type);
      return { x: t.x, y: t.y, dir: rng.int(0, 3) };
    },
    setPedestal(room) {
      ctx.set(room.cx, room.cy, T.PEDESTAL);
      return { x: room.cx, y: room.cy };
    },
    addMonster(m) { ctx.monsters.push(m); },
  };
  for (const r of rooms) ROOM_TYPES[r.type].furnish(ctx, r);

  // --- 5: populate ---

  const entrance = rooms[0];
  const occupied = new Set([idx(ctx.up.x, ctx.up.y)]);
  if (ctx.down) occupied.add(idx(ctx.down.x, ctx.down.y));
  for (const m of ctx.monsters) occupied.add(idx(m.x, m.y));
  const freeTileIn = (room, minStartDist = 0) => {
    for (let tries = 0; tries < 30; tries++) {
      const x = rng.int(room.x, room.x + room.w - 1), y = rng.int(room.y, room.y + room.h - 1);
      if (ctx.get(x, y) !== T.FLOOR || occupied.has(idx(x, y))) continue;
      if (Math.abs(x - entrance.cx) + Math.abs(y - entrance.cy) < minStartDist) continue;
      occupied.add(idx(x, y));
      return { x, y };
    }
    return null;
  };
  const monsterRooms = rooms.filter((r) => ROOM_TYPES[r.type].monsters && !r.locked);
  const itemRooms = rooms.filter((r) => ROOM_TYPES[r.type].items && !r.locked);

  const monsters = ctx.monsters;
  const table = spawnTable(depth);
  const d = danger(depth);
  const monsterCount = 4 + Math.floor(d * 1.3) + rng.int(0, 2);
  for (let i = 0; i < monsterCount && monsterRooms.length; i++) {
    const t = freeTileIn(rng.pick(monsterRooms), 7);
    if (t) monsters.push({ type: rng.weighted(table), x: t.x, y: t.y });
  }

  const items = [];
  const itemCount = rng.int(4, 6) + (d > 5 ? 1 : 0);
  for (let i = 0; i < itemCount; i++) {
    const t = freeTileIn(rng.pick(itemRooms));
    if (t) items.push({ item: randomItem(rng, depth), ...t });
  }
  if (depth % 2 === 1 || rng.chance(0.4)) {
    const t = freeTileIn(rng.pick(itemRooms));
    if (t) items.push({ item: makeItem('food', 'ration'), ...t });
  }
  const goldCount = rng.int(2, 4);
  for (let i = 0; i < goldCount; i++) {
    const t = freeTileIn(rng.pick(itemRooms));
    if (t) items.push({ item: makeItem('gold', 'gold', { qty: rng.int(8, 20) + Math.round(d * rng.int(3, 8)) }), ...t });
  }
  // Every locked room's key lies somewhere on the loop, which is always reachable without keys.
  const loopRooms = rooms.filter((r) => r.onLoop && r.type !== 'vault');
  for (const r of rooms.filter((q) => q.locked)) {
    let t = null;
    for (let k = 0; k < 10 && !t; k++) t = freeTileIn(rng.pick(loopRooms));
    if (!t) return null;
    items.push({ item: makeItem('key', 'iron', { depth }), ...t });
  }

  const traps = [];
  const trapCount = rng.int(1, 2) + Math.floor(depth / 2);
  for (let i = 0; i < trapCount; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const x = rng.int(1, W - 2), y = rng.int(1, H - 2), i2 = idx(x, y);
      if (grid[i2] !== T.FLOOR || occupied.has(i2)) continue;
      if (foot[i2] >= 0 && inRoom[i2] < 0) continue; // an open doorway in a wall
      const room = inRoom[i2] >= 0 ? rooms[inRoom[i2]] : null;
      if (room && (!ROOM_TYPES[room.type].traps || room.locked)) continue;
      if (Math.abs(x - entrance.cx) + Math.abs(y - entrance.cy) < 6) continue;
      occupied.add(i2);
      traps.push({ x, y, type: rng.weighted({ spike: 35, poison: 25, teleport: 20, alarm: 20 }) });
      break;
    }
  }

  return {
    depth, w: W, h: H, grid, rooms, edges, doorways,
    doors: doorways.filter((d) => d.style === 'door'),
    up: ctx.up, down: ctx.down, amulet: ctx.amulet, shrine: ctx.shrine, shop: ctx.shop,
    monsters, items, traps, theme: themeForDepth(depth),
  };
}

/** Minimal binary min-heap of (key, priority). */
class Heap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p;
    let i = k.length;
    k.push(key); p.push(pri);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up] <= p[i]) break;
      [k[up], k[i]] = [k[i], k[up]];
      [p[up], p[i]] = [p[i], p[up]];
      i = up;
    }
  }
  pop() {
    const k = this.k, p = this.p;
    const top = [k[0], p[0]];
    const lk = k.pop(), lp = p.pop();
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}
