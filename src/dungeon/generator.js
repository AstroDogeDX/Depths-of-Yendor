import { RNG } from '../rng.js';
import { MAX_DEPTH, themeForDepth } from '../config.js';
import { spawnTable } from '../monsters/defs.js';
import { randomItem, makeItem } from '../items/generate.js';

export const T = { WALL: 0, FLOOR: 1, STAIRS_DOWN: 2, STAIRS_UP: 3, PEDESTAL: 4 };

const W = 48;
const H = 48;

// Rooms-and-corridors in the Rogue tradition: scatter rooms, join them with a minimum spanning tree,
// then add a few extra corridors so the floor has loops you can circle a monster around.
export function generateLevel(seed, depth, { artefact = null } = {}) {
  const rng = new RNG(`${seed}:depth:${depth}`);
  const grid = new Uint8Array(W * H); // all WALL
  const idx = (x, y) => y * W + x;
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T.WALL : grid[idx(x, y)]);
  const set = (x, y, v) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) grid[idx(x, y)] = v; };

  // --- Rooms ---
  const rooms = [];
  const target = rng.int(8, 12);
  for (let attempt = 0; attempt < 400 && rooms.length < target; attempt++) {
    const w = rng.int(4, 10);
    const h = rng.int(4, 9);
    const x = rng.int(1, W - w - 2);
    const y = rng.int(1, H - h - 2);
    const overlaps = rooms.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y);
    if (overlaps) continue;
    rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
  }
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, T.FLOOR);
  }

  // --- Corridors (Prim's MST over room centres + loops) ---
  const dist2 = (a, b) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
  const inTree = new Set([0]);
  const edges = [];
  while (inTree.size < rooms.length) {
    let best = null;
    for (const i of inTree) {
      for (let j = 0; j < rooms.length; j++) {
        if (inTree.has(j)) continue;
        const d = dist2(rooms[i], rooms[j]);
        if (!best || d < best.d) best = { i, j, d };
      }
    }
    inTree.add(best.j);
    edges.push([best.i, best.j]);
  }
  const extra = Math.max(1, Math.floor(rooms.length / 3));
  for (let k = 0; k < extra; k++) {
    const i = rng.int(0, rooms.length - 1);
    const near = rooms.map((r, j) => [j, dist2(rooms[i], r)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
    const j = near[rng.int(0, Math.min(3, near.length - 1))][0];
    edges.push([i, j]);
  }
  for (const [i, j] of edges) {
    const a = rooms[i], b = rooms[j];
    if (rng.chance(0.5)) {
      carveH(a.cx, b.cx, a.cy); carveV(a.cy, b.cy, b.cx);
    } else {
      carveV(a.cy, b.cy, a.cx); carveH(a.cx, b.cx, b.cy);
    }
  }
  function carveH(x0, x1, y) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) set(x, y, T.FLOOR); }
  function carveV(y0, y1, x) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) set(x, y, T.FLOOR); }

  // --- Special rooms ---
  const startIdx = rng.int(0, rooms.length - 1);
  const start = rooms[startIdx];
  const distFromStart = bfs(grid, W, H, start.cx, start.cy);
  const roomDist = rooms.map((r) => distFromStart[idx(r.cx, r.cy)]);
  const order = rooms.map((_, i) => i).filter((i) => i !== startIdx).sort((a, b) => roomDist[b] - roomDist[a]);
  const farIdx = order[0];

  const special = new Set([startIdx]);
  let vaultIdx = -1, shrineIdx = -1;
  if (depth >= MAX_DEPTH) {
    vaultIdx = farIdx;
    special.add(vaultIdx);
  }
  if (artefact) {
    // A room roughly midway between start and exit.
    const candidates = order.filter((i) => i !== farIdx);
    shrineIdx = candidates.length ? candidates[Math.floor(candidates.length / 2)] : farIdx;
    special.add(shrineIdx);
  }

  // Pillars break up large ordinary rooms (single-tile pillars can never disconnect a room).
  rooms.forEach((r, i) => {
    if (special.has(i) || r.w < 7 || r.h < 7 || !rng.chance(0.6)) return;
    const px = [r.x + 2, r.x + r.w - 3], py = [r.y + 2, r.y + r.h - 3];
    for (const x of px) for (const y of py) set(x, y, T.WALL);
  });

  // --- Stairs ---
  const openAround = (x, y) => {
    if (get(x, y) !== T.FLOOR) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (get(x + dx, y + dy) !== T.FLOOR) return false;
    return true;
  };
  const roomTiles = (r, pred) => {
    const out = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (pred(x, y)) out.push({ x, y });
    return out;
  };
  const placeStairs = (room, type) => {
    const tiles = roomTiles(room, openAround);
    const t = tiles.length ? rng.pick(tiles) : { x: room.cx, y: room.cy };
    set(t.x, t.y, type);
    return { x: t.x, y: t.y, dir: rng.int(0, 3) };
  };

  if (vaultIdx >= 0) set(rooms[vaultIdx].cx, rooms[vaultIdx].cy, T.PEDESTAL);
  if (shrineIdx >= 0) set(rooms[shrineIdx].cx, rooms[shrineIdx].cy, T.PEDESTAL);

  const up = placeStairs(start, T.STAIRS_UP);
  const down = depth < MAX_DEPTH ? placeStairs(rooms[farIdx], T.STAIRS_DOWN) : null;

  let amulet = null, shrine = null;
  const monsters = [];
  const items = [];

  if (vaultIdx >= 0) {
    const r = rooms[vaultIdx];
    amulet = { x: r.cx, y: r.cy };
    const spot = roomTiles(r, (x, y) => get(x, y) === T.FLOOR && Math.abs(x - r.cx) + Math.abs(y - r.cy) >= 2);
    const s = spot.length ? rng.pick(spot) : { x: r.x, y: r.y };
    monsters.push({ type: 'warden', x: s.x, y: s.y, asleep: true, boss: true });
  }
  if (shrineIdx >= 0) {
    const r = rooms[shrineIdx];
    shrine ={ x: r.cx, y: r.cy, item: makeItem('artefact', artefact) };
    // An out-of-depth guardian dozes beside it.
    const guardTable = spawnTable(Math.min(MAX_DEPTH, depth + 2));
    const spot = roomTiles(r, (x, y) => get(x, y) === T.FLOOR && Math.abs(x - r.cx) + Math.abs(y - r.cy) === 1);
    if (spot.length) {
      const s = rng.pick(spot);
      monsters.push({ type: rng.weighted(guardTable), x: s.x, y: s.y, asleep: true, guardian: true });
    }
  }

  // --- Population ---
  const occupied = new Set([idx(up.x, up.y)]);
  if (down) occupied.add(idx(down.x, down.y));
  for (const m of monsters) occupied.add(idx(m.x, m.y));

  const freeTileIn = (room, minStartDist = 0) => {
    for (let tries = 0; tries < 30; tries++) {
      const x = rng.int(room.x, room.x + room.w - 1);
      const y = rng.int(room.y, room.y + room.h - 1);
      if (get(x, y) !== T.FLOOR || occupied.has(idx(x, y))) continue;
      if (Math.abs(x - start.cx) + Math.abs(y - start.cy) < minStartDist) continue;
      occupied.add(idx(x, y));
      return { x, y };
    }
    return null;
  };
  const nonStartRooms = rooms.filter((_, i) => i !== startIdx);

  const table = spawnTable(depth);
  const monsterCount = 4 + Math.floor(depth * 1.3) + rng.int(0, 2);
  for (let i = 0; i < monsterCount; i++) {
    const t = freeTileIn(rng.pick(nonStartRooms), 7);
    if (!t) continue;
    monsters.push({ type: rng.weighted(table), x: t.x, y: t.y });
  }

  const itemCount = rng.int(4, 6) + (depth > 5 ? 1 : 0);
  for (let i = 0; i < itemCount; i++) {
    const t = freeTileIn(rng.pick(rooms));
    if (t) items.push({ item: randomItem(rng, depth), ...t });
  }
  if (depth % 2 === 1 || rng.chance(0.4)) {
    const t = freeTileIn(rng.pick(rooms));
    if (t) items.push({ item: makeItem('food', 'ration'), ...t });
  }
  const goldCount = rng.int(2, 4);
  for (let i = 0; i < goldCount; i++) {
    const t = freeTileIn(rng.pick(rooms));
    if (t) items.push({ item: makeItem('gold', 'gold', { qty: rng.int(8, 20) + depth * rng.int(3, 8) }), ...t });
  }

  const traps = [];
  const trapCount = rng.int(1, 2) + Math.floor(depth / 2);
  for (let i = 0; i < trapCount; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const x = rng.int(1, W - 2), y = rng.int(1, H - 2);
      if (get(x, y) !== T.FLOOR || occupied.has(idx(x, y))) continue;
      if (Math.abs(x - start.cx) + Math.abs(y - start.cy) < 6) continue;
      occupied.add(idx(x, y));
      traps.push({ x, y, type: rng.weighted({ spike: 35, poison: 25, teleport: 20, alarm: 20 }) });
      break;
    }
  }

  return {
    depth, w: W, h: H, grid, rooms, up, down, amulet, shrine, monsters, items, traps,
    theme: themeForDepth(depth),
  };
}

/** Breadth-first distances over walkable (non-wall) tiles. Unreachable = -1. */
export function bfs(grid, w, h, sx, sy) {
  const dist = new Int16Array(w * h).fill(-1);
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  dist[sy * w + sx] = 0;
  q[tail++] = sy * w + sx;
  while (head < tail) {
    const c = q[head++];
    const cx = c % w, cy = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (grid[n] === T.WALL || dist[n] >= 0) continue;
      dist[n] = dist[c] + 1;
      q[tail++] = n;
    }
  }
  return dist;
}
