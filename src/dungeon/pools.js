import { T } from './tiles.js';

// Pools: standing water a step below the floor (POOL in config.js), which anything on foot has to wade through,
// slowly, coming out wet (see `wade` in status.js). Unlike a channel, a pool never cuts off a way through, so it can
// lie anywhere on open floor. Each is grown as a blob, and blobs that meet run together into one body of water; a
// big room may be flooded almost wall to wall. What colour the water is is the theme's (`pools` in config.js).
//
// Room designs can lay their own with growPool (as ctx.growPool in generator.js's furnish context).

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
// Kept dry, with the tiles round them: the ways in, what stands on the floor, and the channels (whose sides go
// deeper than a pool's).
const DRY = new Set([T.DOOR, T.STAIRS_UP, T.STAIRS_DOWN, T.PEDESTAL, T.CHANNEL, T.BRIDGE]);
const FLOOD_AREA = 36; // tiles: a room this big or bigger may be flooded
const FLOOD_SHARE = [0.7, 0.9]; // how much of the floor a flooded room's water covers

/**
 * The tiles that must stay dry (1) in a mask over the grid: each doorway (arches included) and whatever's in DRY,
 * and every tile beside them, so there's always a dry step in from a doorway, round the stairs and onto a bridge.
 */
export function dryMask(grid, w, rooms) {
  const dry = new Uint8Array(grid.length);
  const mark = (x, y) => {
    for (const [dx, dy] of [[0, 0], ...N8]) {
      const i = (y + dy) * w + x + dx;
      if (i >= 0 && i < dry.length) dry[i] = 1;
    }
  };
  for (const r of rooms) for (const d of r.doorways) mark(d.x, d.y);
  for (let i = 0; i < grid.length; i++) if (DRY.has(grid[i])) mark(i % w, (i / w) | 0);
  return dry;
}

/**
 * Grows a pool of up to `size` tiles in `room` from the tile `at` ({ x, y }): a tile at a time onto open floor beside
 * it that `dry` (see dryMask) doesn't keep dry, favouring tiles with more water round them, so it spreads as a
 * rounded blob. It flows round water already there, so pools that meet join up. Returns the tiles it flooded.
 */
export function growPool(rng, grid, w, room, at, size, dry) {
  const idx = (x, y) => y * w + x;
  const open = (x, y) => x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h &&
    grid[idx(x, y)] === T.FLOOR && !dry[idx(x, y)];
  const wet = (x, y) => grid[idx(x, y)] === T.POOL;
  if (!open(at.x, at.y)) return [];
  const flooded = [], edge = new Map(); // tile index -> [x, y]: open floor beside the water
  const flood = (x, y) => {
    grid[idx(x, y)] = T.POOL;
    flooded.push({ x, y });
    edge.delete(idx(x, y));
    for (const [dx, dy] of N4) if (open(x + dx, y + dy)) edge.set(idx(x + dx, y + dy), [x + dx, y + dy]);
  };
  flood(at.x, at.y);
  while (flooded.length < size && edge.size) {
    const cands = [...edge.values()].map(([x, y]) => {
      const n = N8.reduce((k, [dx, dy]) => k + (wet(x + dx, y + dy) ? 1 : 0), 0);
      return [x, y, 1 + n * n];
    });
    let r = rng.next() * cands.reduce((k, c) => k + c[2], 0);
    const pick = cands.find((c) => (r -= c[2]) <= 0) ?? cands[cands.length - 1];
    flood(pick[0], pick[1]);
  }
  return flooded;
}

/** Fills in the dry notches a room's pools leave (open floor with water on three sides or more). Returns them. */
function smoothPools(grid, w, room, dry) {
  const idx = (x, y) => y * w + x;
  const out = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (grid[idx(x, y)] !== T.FLOOR || dry[idx(x, y)]) continue;
      if (N4.filter(([dx, dy]) => grid[idx(x + dx, y + dy)] === T.POOL).length >= 3) {
        grid[idx(x, y)] = T.POOL;
        out.push({ x, y });
      }
    }
  }
  return out;
}

/**
 * Sinks pools into `count` ([min, max]) of `rooms`, bigger rooms likelier, leaving out any a channel runs across. A
 * room of FLOOD_AREA tiles or more is flooded, by the chance `flood`: one body of water over most of its floor.
 * Otherwise it gets one to three pools, which may run together. Returns [{ room (its id), tiles }].
 */
export function digPools({ rng, grid, w, rooms, count, flood }) {
  const dry = dryMask(grid, w, rooms);
  const channelled = (r) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (grid[y * w + x] === T.CHANNEL) return true;
    return false;
  };
  // A weighted draw without replacement: each room's key is a random number to the power of 1 / its area.
  const order = rooms.filter((r) => !channelled(r))
    .map((r) => [rng.next() ** (1 / (r.w * r.h)), r]).sort((a, b) => b[0] - a[0]).map(([, r]) => r);
  const pools = [];
  for (const room of order.slice(0, rng.int(...count))) {
    const open = [];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) if (grid[y * w + x] === T.FLOOR && !dry[y * w + x]) open.push({ x, y });
    }
    if (open.length < 3) continue;
    const tiles = [];
    if (room.w * room.h >= FLOOD_AREA && rng.chance(flood)) {
      // Flooded: from near the middle of the room, out over most of it.
      const mid = open.reduce((best, t) => (Math.hypot(t.x - room.cx, t.y - room.cy) < Math.hypot(best.x - room.cx, best.y - room.cy) ? t : best));
      tiles.push(...growPool(rng, grid, w, room, mid, Math.round(open.length * rng.range(...FLOOD_SHARE)), dry));
    } else {
      const most = Math.max(4, Math.round(room.w * room.h * 0.22));
      for (let i = rng.int(1, 3); i > 0; i--) {
        const from = rng.pick(open.filter((t) => grid[t.y * w + t.x] === T.FLOOR));
        if (from) tiles.push(...growPool(rng, grid, w, room, from, rng.int(3, most), dry));
      }
    }
    tiles.push(...smoothPools(grid, w, room, dry));
    if (tiles.length) pools.push({ room: room.id, tiles });
  }
  return pools;
}
