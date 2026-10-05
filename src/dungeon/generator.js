import { RNG } from '../rng.js';
import { TILE, MAX_DEPTH, THEMES, themeForDepth, isShopDepth, danger } from '../config.js';
import { MONSTERS, spawnTable } from '../monsters/defs.js';
import { randomItem, makeItem, chestLoot, goldPile } from '../items/generate.js';
import { T } from './tiles.js';
import { ROOM_TYPES } from './rooms.js';
import { digChannels } from './channels.js';
import { digPools, growPool, dryMask } from './pools.js';
import { decorate, faceKey } from './decor.js';

export { T };

// The map, in tiles: the Sewers' 52 across, and a little more for each theme down, room for its extra side rooms
// (see planRooms). The loop of rooms keeps the Sewers' size in the middle of it, so the room goes to the wings.
const MAP = 52;
const MAP_GROWTH = 5;
const GAP = 3;  // min tiles between room interiors: each room's wall plus one corridor lane
const EDGE = 3; // min distance from a room interior to the map border
const SIDES = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
const FACING = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 }; // turns a prop against the wall on that side to face into the room
const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W, as stairs' `dir`
const FIXTURES = new Set([T.STAIRS_UP, T.STAIRS_DOWN, T.PEDESTAL]);
const CHEST_BACK = 0.25; // tiles a chest stands back from the middle of its tile, toward the wall behind it
const SPRAWL = 0.6; // the chance of each extra side room a theme may add (see planRooms)
const SIGN_OFF = 0.64; // tiles from the middle of a shop's door to each of the blue flames beside it (see shopSigns)

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
 *  4. Furnish each room by type, then populate: chests, monsters, the odd thing lying loose, traps.
 *
 * opts.artefact       artefact type for this floor's shrine, if any
 * opts.wares          what its shop has on its plinths, if it has a shop: { container, artefact } (see shopStock)
 * opts.extraBranches  extra branch specs, e.g. [{ type: 'standard', locked: true }]
 *
 * A branch spec may name its parent room's type, e.g. { type: 'shop', parent: 'entrance' }, or with `offBranch` hang
 * off another branch where there is one. A `locked` branch is behind a locked door, and nothing hangs off it.
 */
export function generateLevel(seed, depth, opts = {}) {
  const rng = new RNG(`${seed}:depth:${depth}`);
  for (let attempt = 0; attempt < 100; attempt++) {
    // Pools and the passages' dressing draw on streams of their own, so how they're laid never moves anything else on
    // the floor (the traps a save keeps track of, say).
    const level = attemptLevel(rng, depth, opts, (name) => new RNG(`${seed}:depth:${depth}:${name}:${attempt}`));
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
  // The shop goes first, so the room beside the entrance is still free for it. It opens straight off the entrance
  // room, through a door in a wall they share, so you can see it (and get to it) the moment you arrive.
  if (isShopDepth(depth)) branches.push({ type: 'shop', required: true, parent: 'entrance', beside: true });
  if (opts.artefact) branches.push({ type: 'shrine', required: true });
  for (const b of opts.extraBranches ?? []) branches.push({ required: true, ...b });
  // Locked side rooms, from the second floor on: often one, and deeper down now and then a second. Each is a dead
  // end (nothing ever hangs off a locked room), so its iron key can always be put somewhere you can reach without one.
  const locked = depth < 2 ? 0 : (rng.chance(0.3 + d * 0.04) ? 1 : 0) + (d >= 6 && rng.chance(0.3) ? 1 : 0);
  for (let i = 0; i < locked; i++) branches.push({ type: 'standard', locked: true });
  const optional = rng.int(1, 3) + (d >= 6 ? 1 : 0);
  for (let i = 0; i < optional; i++) branches.push({ type: 'standard' });
  // Each theme after the first sprawls further: a chance of one more side room for each theme down, hung off another
  // side room where there is one, so the deeper floors grow wings of rooms off the loop.
  const sprawl = THEMES.indexOf(themeForDepth(depth));
  for (let i = 0; i < sprawl; i++) if (rng.chance(SPRAWL)) branches.push({ type: 'standard', offBranch: true });
  return { loop, branches };
}

function attemptLevel(rng, depth, opts, stream) {
  const W = MAP + MAP_GROWTH * THEMES.indexOf(themeForDepth(depth)), H = W;
  const grid = new Uint8Array(W * H); // all WALL
  const foot = new Int16Array(W * H).fill(-1); // owning room id for interior + wall-ring tiles
  const corr = new Uint8Array(W * H); // 1 = loop corridor, 2 = branch corridor
  const rooms = [];
  const doorways = [];
  const edges = [];
  const idx = (x, y) => y * W + x;

  /** Whether a room fits at (x, y), w × h, clear of the rest by GAP (but for `beside`, which it may share a wall with). */
  const fits = (x, y, w, h, beside = null) => {
    if (x < EDGE || y < EDGE || x + w > W - EDGE || y + h > H - EDGE) return false;
    if (!rooms.every((o) => o === beside || x + w + GAP <= o.x || o.x + o.w + GAP <= x || y + h + GAP <= o.y || o.y + o.h + GAP <= y)) return false;
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

  /**
   * Puts a room of `type` right beside `parent`, sharing a wall with it, and joins them by one doorway in that wall: no
   * corridor between. The rooms share at least three tiles of wall, and the doorway goes in that stretch, with wall
   * either side of it (see shopSigns): anywhere along it, or for a `centred` room type, in the middle of the room's own
   * wall. The doorway is in both rooms' `doorways`, each with the side of the room it's on, and once in the floor's.
   * Returns the room, or null if there's no room for it beside the parent.
   */
  const placeBeside = (type, parent) => {
    const def = ROOM_TYPES[type], flip = { N: 'S', S: 'N', E: 'W', W: 'E' };
    for (let tries = 0; tries < 12; tries++) {
      const size = def.size(rng, depth);
      for (const side of rng.shuffle(['N', 'S', 'E', 'W'])) {
        const horiz = side === 'E' || side === 'W';
        // (A centred room's `w` runs along the wall its door's in.)
        const { w, h } = def.centred && horiz ? { w: size.h, h: size.w } : size;
        const len = horiz ? h : w, plen = horiz ? parent.h : parent.w, half = (len - 1) >> 1;
        // Where it starts along the shared wall, from where the parent does: so they share three tiles of it, or a
        // centred room's middle tile and one either side.
        const off = def.centred ? rng.int(1 - half, plen - 2 - half) : rng.int(3 - len, plen - 3);
        const x = side === 'E' ? parent.x + parent.w + 1 : side === 'W' ? parent.x - 1 - w : parent.x + off;
        const y = side === 'S' ? parent.y + parent.h + 1 : side === 'N' ? parent.y - 1 - h : parent.y + off;
        if (!fits(x, y, w, h, parent)) continue;
        const a = Math.max(horiz ? parent.y : parent.x, horiz ? y : x), b = Math.min(horiz ? parent.y + parent.h : parent.x + parent.w, horiz ? y + h : x + w) - 1;
        const at = def.centred ? (horiz ? y : x) + half : rng.int(a + 1, b - 1);
        const wall = { E: parent.x + parent.w, W: parent.x - 1, S: parent.y + parent.h, N: parent.y - 1 }[side];
        const [dx, dy] = horiz ? [wall, at] : [at, wall];
        if (parent.doorways.some((d) => Math.abs(d.x - dx) + Math.abs(d.y - dy) < 3)) continue;
        const r = makeRoom(type, x, y, w, h, { onLoop: false, locked: false, parent: parent.id });
        rooms.push(r);
        claim(r, r.id);
        grid[idx(dx, dy)] = r.doorStyle === 'door' ? T.DOOR : T.FLOOR;
        const dw = { x: dx, y: dy, side: flip[side], room: r.id, style: r.doorStyle, locked: false, kind: 'branch' };
        r.doorways.push(dw);
        parent.doorways.push({ ...dw, side, room: parent.id });
        doorways.push(dw);
        edges.push({ a: parent.id, b: r.id, kind: 'branch', locked: false });
        r.beside = { parent: parent.id, door: dw, side };
        return r;
      }
    }
    return null;
  };

  // --- 1 & 2: plan and lay out the loop ---

  const plan = planRooms(rng, depth, opts);
  const n = plan.loop.length;
  const rx = MAP * rng.range(0.25, 0.3), ry = MAP * rng.range(0.25, 0.3);
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
    if (spec.beside) {
      if (!placeBeside(spec.type, rooms.find((r) => r.type === spec.parent)) && spec.required) return null;
      continue;
    }
    let placed = false;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const parents = rooms.filter((r) => ROOM_TYPES[r.type].branchable && !r.locked && (!spec.parent || r.type === spec.parent));
      const loopParents = parents.filter((r) => r.onLoop), sideParents = spec.offBranch ? parents.filter((r) => !r.onLoop) : [];
      const parent = sideParents.length ? rng.pick(sideParents) : rng.pick(rng.chance(0.7) && loopParents.length ? loopParents : parents);
      const { w, h } = def.size(rng, depth);
      const a = rng.range(0, Math.PI * 2);
      const dist = (Math.max(parent.w, parent.h) + Math.max(w, h)) / 2 + rng.int(GAP + 1, GAP + 5);
      const x = Math.round(parent.cx + Math.cos(a) * dist - w / 2), y = Math.round(parent.cy + Math.sin(a) * dist - h / 2);
      if (!fits(x, y, w, h)) continue;
      const r = makeRoom(spec.type, x, y, w, h, { onLoop: false, locked: !!spec.locked, sprawl: !!spec.offBranch, parent: parent.id });
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
    rng, depth, artefact: opts.artefact, wares: opts.wares ?? {},
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
    /**
     * Grows a pool of up to `size` tiles in `room` from tile `at` (see growPool in pools.js), keeping clear of its
     * doorways and of anything placed so far. Returns the tiles it flooded.
     */
    growPool(room, at, size) {
      const tiles = growPool(rng, grid, W, room, at, size, dryMask(grid, W, rooms));
      if (tiles.length) ctx.pools.push({ room: room.id, tiles });
      return tiles;
    },
    pools: [],
    addMonster(m) { ctx.monsters.push(m); },
  };
  for (const r of rooms) ROOM_TYPES[r.type].furnish(ctx, r);
  // A shop opening off the entrance room has a blue flame either side of its door on that side too, as it has inside,
  // so it's seen the moment you arrive.
  const shopBeside = rooms.find((r) => r.type === 'shop' && r.beside);
  const signs = ctx.shop && shopBeside ? shopSigns(shopBeside.beside) : null;
  if (signs) ctx.shop.sconces.push(...signs.spots);

  // --- 5: theme features: water channels, pools, then decorations ---

  const theme = themeForDepth(depth);
  const [sx, sy] = STEPS[ctx.up.dir];
  const channels = theme.channels ? digChannels({ rng, grid, w: W, rooms, start: idx(ctx.up.x + sx, ctx.up.y + sy), count: theme.channels.count }) : [];
  const pools = [...ctx.pools];
  if (theme.pools) {
    const where = rooms.filter((r) => ROOM_TYPES[r.type].pools && !r.locked);
    pools.push(...digPools({ rng: stream('pools'), grid, w: W, rooms: where, count: theme.pools.count, flood: theme.pools.flood }));
  }
  const occupied = new Set([idx(ctx.up.x, ctx.up.y)]);
  if (ctx.down) occupied.add(idx(ctx.down.x, ctx.down.y));
  for (const m of ctx.monsters) occupied.add(idx(m.x, m.y));
  const decor = decorate({ style: theme.style, rng, tunnelRng: stream('tunnels'), grid, w: W, rooms, channels, occupied });
  for (const f of signs?.faces ?? []) decor.wallUsed.add(f);

  // --- 6: populate ---

  const entrance = rooms[0];
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
  const d = danger(depth);
  const items = [];

  // Chests: most of what there is to find is in them. Each stands against a wall of a room the population pass may
  // fill, facing into it, on a tile of its own clear of doorways, stairs and pedestals and of anything hung on the
  // wall behind it; they spread across the rooms before any room gets two. From the mimic's first floor on, some are
  // mimics (never in the room you arrive in). Now and then there's a locked chest too, likeliest in a side room, whose
  // gold key is in one of the others (never a mimic) or lying loose.
  const chests = [];
  const chestSpot = (room) => {
    const faces = [];
    for (let x = room.x; x < room.x + room.w; x++) faces.push([x, room.y, 'N'], [x, room.y + room.h - 1, 'S']);
    for (let y = room.y; y < room.y + room.h; y++) faces.push([room.x, y, 'W'], [room.x + room.w - 1, y, 'E']);
    for (const [x, y, side] of rng.shuffle(faces)) {
      const [nx, ny] = SIDES[side];
      if (ctx.get(x, y) !== T.FLOOR || occupied.has(idx(x, y)) || ctx.get(x + nx, y + ny) !== T.WALL) continue;
      if (decor.wallUsed.has(faceKey(x, y, side)) || room.doorways.some((dw) => Math.max(Math.abs(dw.x - x), Math.abs(dw.y - y)) <= 1)) continue;
      if ([-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => FIXTURES.has(ctx.get(x + dx, y + dy))))) continue;
      occupied.add(idx(x, y));
      const along = rng.range(-0.2, 0.2);
      return {
        x, y, // its tile; where it stands in it, in tiles:
        px: x + 0.5 + nx * CHEST_BACK + (ny ? along : 0), py: y + 0.5 + ny * CHEST_BACK + (nx ? along : 0),
        yaw: FACING[side] + rng.range(-0.12, 0.12),
      };
    }
    return null;
  };
  const chestRooms = rng.shuffle([...itemRooms]);
  const mimicChance = depth < MONSTERS.mimic.depth[0] ? 0 : Math.min(0.2, 0.05 + d * 0.015);
  const chestCount = rng.int(2, 4) + (d > 5 ? 1 : 0);
  for (let i = 0; i < chestCount && chestRooms.length; i++) {
    const room = chestRooms[i % chestRooms.length], at = chestSpot(room);
    if (!at) continue;
    const kind = room.type !== 'entrance' && rng.chance(mimicChance) ? 'mimic' : 'chest';
    chests.push({ ...at, kind, items: chestLoot(rng, depth, kind) });
  }
  // Behind each locked door, a stash worth its key: a chest or two (never a mimic), and a heap of gold.
  const lockedRooms = rooms.filter((r) => r.locked);
  for (const room of lockedRooms) {
    for (let i = rng.int(1, 2); i > 0; i--) {
      const at = chestSpot(room);
      if (at) chests.push({ ...at, kind: 'chest', items: chestLoot(rng, depth, 'chest') });
    }
    const t = freeTileIn(room);
    if (t) items.push({ item: goldPile(rng, depth, 1.5), ...t });
  }
  if (itemRooms.length && rng.chance(0.3 + d * 0.02)) {
    // Likeliest in a side room, and half the time, where there is one, behind a locked door too.
    const side = itemRooms.filter((r) => !r.onLoop);
    const room = lockedRooms.length && rng.chance(0.5) ? rng.pick(lockedRooms) : rng.pick(side.length ? side : itemRooms);
    const at = chestSpot(room);
    if (at) {
      const key = makeItem('key', 'gold', { depth });
      const holders = chests.filter((c) => c.kind === 'chest');
      let hidden = holders.length > 0 && rng.chance(0.5);
      if (hidden) rng.pick(holders).items.push(key);
      for (let k = 0; k < 10 && !hidden; k++) {
        const t = freeTileIn(rng.pick(itemRooms));
        if (t) {
          items.push({ item: key, ...t });
          hidden = true;
        }
      }
      if (hidden) chests.push({ ...at, kind: 'locked', items: chestLoot(rng, depth, 'locked') });
    }
  }

  const monsters = ctx.monsters;
  const table = spawnTable(depth);
  // (A floor that sprawls has more to fill: a monster more for each of its extra side rooms.)
  const monsterCount = 4 + Math.floor(d * 1.3) + rng.int(0, 2) + rooms.filter((r) => r.sprawl).length;
  for (let i = 0; i < monsterCount && monsterRooms.length; i++) {
    const t = freeTileIn(rng.pick(monsterRooms), 7);
    if (t) monsters.push({ type: rng.weighted(table), x: t.x, y: t.y });
  }

  // A few things still lie loose, and food and gold.
  const itemCount = rng.int(0, 2);
  for (let i = 0; i < itemCount; i++) {
    const t = freeTileIn(rng.pick(itemRooms));
    if (t) items.push({ item: randomItem(rng, depth), ...t });
  }
  if (depth % 2 === 1 || rng.chance(0.4)) {
    const t = freeTileIn(rng.pick(itemRooms));
    if (t) items.push({ item: makeItem('food', 'ration'), ...t });
  }
  const goldCount = rng.int(1, 3);
  for (let i = 0; i < goldCount; i++) {
    const t = freeTileIn(rng.pick(itemRooms));
    if (t) items.push({ item: goldPile(rng, depth), ...t });
  }
  // Every locked door's iron key lies loose in a room you can reach without one: any room but the locked ones, since
  // nothing ever hangs off a locked room (see planRooms), so no other room is behind a lock.
  for (let i = 0; i < lockedRooms.length; i++) {
    let t = null;
    for (let k = 0; k < 20 && !t; k++) t = freeTileIn(rng.pick(itemRooms));
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
    channels, pools, decor: decor.props, wallUsed: decor.wallUsed,
    monsters, items, chests, traps, theme,
  };
}

/**
 * The two blue-flamed sconces either side of the door of a shop beside the entrance room (see placeBeside), on the
 * entrance's side of the wall. `side` is the side of the entrance the shop is on. Returns their spots, as the shop's own
 * are ({ x, z in metres, 0.1 m out from the wall, ry facing away from it }), and the wall faces they take (faceKey), so
 * nothing else is hung there.
 */
function shopSigns({ door, side }) {
  const [nx, ny] = SIDES[side], ax = Math.abs(ny), ay = Math.abs(nx); // toward the shop, and along the wall
  const spots = [], faces = [];
  for (const s of [-1, 1]) {
    const fx = door.x + 0.5 - nx * 0.5 + ax * s * SIGN_OFF, fz = door.y + 0.5 - ny * 0.5 + ay * s * SIGN_OFF;
    spots.push({ x: fx * TILE - nx * 0.1, z: fz * TILE - ny * 0.1, ry: FACING[side] });
    faces.push(faceKey(door.x - nx + ax * s, door.y - ny + ay * s, side));
  }
  return { spots, faces };
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
