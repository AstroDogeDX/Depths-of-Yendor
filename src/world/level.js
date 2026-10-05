import * as THREE from 'three';
import { TILE, VIEW_RADIUS_TILES, MAX_DEPTH, PLAYER_RADIUS, POOL, danger } from '../config.js';
import { T } from '../dungeon/tiles.js';
import { buildLevelMeshes, flowWater, poseDoor, shareLights } from '../dungeon/levelBuilder.js';
import { propRig } from '../dungeon/props.js';
import { TrapView, loadTraps, trapsLoaded } from './trapModels.js';
import { buildItemModel } from '../items/models.js';
import { shopPrice, stackable } from '../items/generate.js';
import { Monster } from '../monsters/monster.js';
import { buildMonsterModel } from '../monsters/models.js';
import { spawnTable } from '../monsters/defs.js';
import { updateProjectiles } from '../fx/projectiles.js';
import { updateParticles, burst, ring } from '../fx/particles.js';
import { rand } from '../rng.js';
import { glowSprite } from '../fx/glow.js';
import { Drips } from '../fx/drips.js';
import { Ripples } from '../fx/ripples.js';
import { StatusFx } from '../fx/statusFx.js';
import { Shopkeeper } from './shopkeeper.js';
import { fingerprint, packBits, unpackBits, round2 } from '../save.js';
import { tickStatuses } from '../status.js';

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Traps on the map: grey spikes, green gas, azure teleport, yellow alarm (as their models; see trapModels.js).
export const TRAP_COLORS = { spike: 0xa0a0a0, poison: 0xa050d8, teleport: 0x3aa0ff, alarm: 0xe0c020 };

// Chests (see addChest): how far a lid swings open (radians) and how long it takes; how long things take to fly out of
// one, and how far they land in front of it; how long a mimic's lick of its lips takes, and how long it waits between
// them while you're about; and what shatters when a chest is smashed.
const LID_OPEN = 1.85;
const LID_TIME = 0.5;
const SPILL_TIME = 0.45;
const SPILL_OUT = 0.5;
const LICK_TIME = 1.6;
const LICK_WAIT = [15, 35];
const SMASH = 0.5; // the chance each thing in a chest you smash is lost with it (gold and keys never are)
const footprints = new Map();

/** A chest's size where it stands (not counting the wreck a smashed one leaves): its model's bounds, without `broken`. */
function chestBounds(type) {
  if (!footprints.has(type)) {
    const b = new THREE.Box3();
    for (const part of propRig(type).children) if (part.name !== 'broken') b.expandByObject(part);
    footprints.set(type, b);
  }
  return footprints.get(type);
}

/**
 * How far along a ray (from o in the direction d) it first meets a chest's box, a little bigger than the chest: 0 if
 * it starts inside, null if it misses. (With d all 0, whether a point is inside.)
 */
function rayChest(c, ox, oy, oz, dx, dy, dz) {
  const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), b = c.bounds, pad = 0.06;
  const rx = ox - c.x, rz = oz - c.z;
  // Into the chest's own frame, where its box lines up with the axes.
  const o = [rx * cs - rz * sn, oy, rx * sn + rz * cs], d = [dx * cs - dz * sn, dy, dx * sn + dz * cs];
  const lo = [b.min.x - pad, b.min.y, b.min.z - pad], hi = [b.max.x + pad, b.max.y + pad, b.max.z + pad];
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
      continue;
    }
    const a = (lo[i] - o[i]) / d[i], e = (hi[i] - o[i]) / d[i];
    t0 = Math.max(t0, Math.min(a, e));
    t1 = Math.min(t1, Math.max(a, e));
    if (t0 > t1) return null;
  }
  return t0;
}

/** A chest as the generator lays it out (see generator.js), as addChest takes it. */
const chestFromData = (c) => ({ x: c.px * TILE, z: c.py * TILE, yaw: c.yaw, kind: c.kind, items: c.items });

export class Level {
  /** A floor from its generated `data`: as new, or as a save left it (`saved`, from snapshot()). */
  constructor(game, data, saved = null) {
    this.game = game;
    this.data = data;
    this.depth = data.depth;
    this.w = data.w;
    this.h = data.h;
    this.grid = data.grid;
    this.theme = data.theme;

    const built = buildLevelMeshes(data);
    this.group = built.group;
    this.flames = built.flames;
    this.lights = built.lights;
    this.lightShare = built.share; // how they're handed round the fittings near you (see shareLights)
    this.obstacles = built.obstacles;
    this.openStairs = built.openStairs; // stairs tiles whose own shapes stop you, not the tile (STAIRS in levelBuilder.js)
    this.water = built.water;
    this.haze = built.haze; // the haze rising out of the channels
    this.sunlight = built.sunlight; // on the first floor, daylight down the way up (see sunlight in levelBuilder.js)
    this.rough = built.rough; // the rough rock's shape (see roughRock.js), for setting things on it
    // Channel tiles, for the sound they make as you near them: running water, wind rising out of a chasm, the
    // uneasy hum of a rift, or lava's rumble and bubbling.
    this.channelSound = { water: 'water', chasm: 'wind', rift: 'rift', lava: 'lava' }[this.theme.channels?.fill];
    this.waterTiles = this.channelSound ? data.channels.flatMap((c) => c.tiles.map((t) => ({ x: this.center(t.x), z: this.center(t.y) }))) : [];
    this.waterT = 0;
    this.drips = built.drips.length ? new Drips(this.group, built.drips) : null;
    this.ripples = this.theme.pools ? new Ripples(this.group, this.theme.pools.water[3]) : null; // round anything wading
    this.statusFx = new StatusFx(this.group); // what's afflicting its monsters, shown on them

    // Doors: open when something walks into them, shut again once the doorway has been clear a while. `amt` is how
    // far open (0..1), `swing` which way a swinging door turns (see openDoor).
    this.doors = data.doors.map((d, i) => ({ ...d, open: false, amt: 0, clearT: 0, swing: 1, ...built.doors[i] }));
    this.doorByTile = new Map(this.doors.map((d) => [d.y * this.w + d.x, d]));
    // Tiles inside locked rooms: never a teleport destination or a wanderer's spawn point.
    this.lockedMask = new Uint8Array(this.w * this.h);
    // Tiles inside the shop: no monster spawns, wanders or is teleported there, and only one chasing the
    // player follows them in (see Monster.moveTo).
    this.shopMask = new Uint8Array(this.w * this.h);
    for (const r of data.rooms) {
      const mask = r.locked ? this.lockedMask : r.type === 'shop' ? this.shopMask : null;
      if (!mask) continue;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) mask[y * this.w + x] = 1;
    }
    this.wanderRooms = data.rooms.filter((r) => !r.locked && r.type !== 'shop');
    this.playerInShop = false;
    this.shopPursuers = new Set(); // monsters allowed through the shop door: see Level.update

    this.explored = new Uint8Array(this.w * this.h);
    this.visible = new Uint8Array(this.w * this.h);
    this.visT = 0;

    this.monsters = [];
    this.items = [];
    this.chests = [];
    this.traps = [];
    this.projectiles = [];
    this.particles = [];

    this.flow = null;
    this.flowT = 0;
    this.flowTile = -1;
    this.spawnT = 75;
    this.searchT = 0;

    for (const t of data.traps) this.traps.push({ ...t, hidden: true, triggered: false, view: null });

    // Where the shop's wares rest: the counter, plinths and display tables hold its stock, and things the player sells
    // go on the rug, and once that's full, in any free spot but the plinths'.
    this.shopSpots = built.shopSlots;
    this.shopKept = built.shopKept;
    this.shopResale = built.shopResale;
    this.resales = 0;
    this.shopkeeper = null;
    if (data.shop) {
      this.shopkeeper = new Shopkeeper(data.shop.keeper);
      this.group.add(this.shopkeeper.mesh);
      this.obstacles.push({ x: this.shopkeeper.x, z: this.shopkeeper.z, r: 0.35 });
    }

    this.restored = !!saved;
    if (saved) this.restore(saved);
    else this.populate();
  }

  /** A new floor's monsters and things, as generated. */
  populate() {
    const data = this.data;
    for (const m of data.monsters) {
      this.addMonster(m.type, (m.x + 0.5) * TILE, (m.y + 0.5) * TILE, { asleep: m.asleep, boss: m.boss, guardian: m.guardian });
    }
    for (const it of data.items) {
      this.addItem(it.item, (it.x + 0.5 + rand.range(-0.2, 0.2)) * TILE, (it.y + 0.5 + rand.range(-0.2, 0.2)) * TILE);
    }
    for (const c of data.chests) this.addChest(chestFromData(c));
    if (data.shrine) this.addItem(data.shrine.item, (data.shrine.x + 0.5) * TILE, (data.shrine.y + 0.5) * TILE, { onPedestal: true });
    if (data.amulet) {
      this.addItem(this.game.makeAmulet(), (data.amulet.x + 0.5) * TILE, (data.amulet.y + 0.5) * TILE, { onPedestal: true });
    }
    data.shop?.stock.forEach((w, i) => w && this.shelve(w.item, w.price, i));
  }

  // --- Saving (see save.js) ---

  /**
   * What a save keeps of this floor: what's changed since it was made (the rest comes back from the seed), with
   * its layout's fingerprint to check it against when it's restored. Doors and traps are a digit each, in order:
   * doors 1 locked + 2 open; traps 1 found + 2 spent. Chests are kept whole, what's in them and all (a mimic that
   * has woken is a monster, and carries what was in it: see Monster.loot).
   */
  snapshot() {
    return {
      depth: this.depth,
      layout: fingerprint(this.grid),
      explored: packBits(this.explored),
      doors: this.doors.map((d) => (d.locked ? 1 : 0) + (d.open ? 2 : 0)).join(''),
      traps: this.traps.map((t) => (t.hidden ? 0 : 1) + (t.triggered ? 2 : 0)).join(''),
      monsters: this.monsters.filter((m) => !m.dead).map((m) => m.snapshot()),
      items: this.items.map((e) => ({
        item: e.item, x: round2(e.x), z: round2(e.z), y0: round2(e.y0), onPedestal: e.onPedestal || undefined,
        price: e.price || undefined, spot: e.spot, resale: e.resale, seen: e.seen || undefined,
      })),
      chests: this.chests.map((c) => ({
        x: round2(c.x), z: round2(c.z), yaw: round2(c.yaw), kind: c.kind, state: c.state,
        items: c.items.length ? c.items : undefined, seen: c.seen || undefined,
      })),
      spawnT: Math.round(this.spawnT),
      resales: this.resales,
      leftAt: this.leftAt ?? undefined,
    };
  }

  /** Runs its monsters' statuses on by the `secs` you were away, as if you'd been here (but without their harm). */
  catchUp(game, secs) {
    if (secs > 0) for (const m of this.monsters) if (!m.dead) tickStatuses(game, m, secs, { damage: false });
  }

  /** Puts back what snapshot() kept, on a floor made from the same seed. */
  restore(s) {
    this.explored = unpackBits(s.explored, this.w * this.h);
    this.doors.forEach((d, i) => {
      const v = +s.doors[i] || 0;
      d.locked = !!(v & 1);
      d.open = !!(v & 2);
      d.amt = d.open ? 1 : 0;
      if (d.parts.lock) d.parts.lock.visible = d.locked;
      this.poseDoor(d);
    });
    // (Traps are kept by their order, so a floor saved before there were chests, which moved them, keeps none of them
    // found or spent: they're somewhere else now.)
    if (s.chests) {
      this.traps.forEach((t, i) => {
        const v = +s.traps[i] || 0;
        t.triggered = !!(v & 2);
        if (v & 1) this.revealTrap(t);
      });
    }
    for (const ms of s.monsters) {
      this.addMonster(ms.type, ms.x, ms.z, { asleep: ms.state === 'sleep', boss: ms.boss, guardian: ms.guardian }).restore(ms);
    }
    for (const e of s.items) {
      const entry = this.addItem(e.item, e.x, e.z, { onPedestal: !!e.onPedestal, y0: e.y0, price: e.price ?? 0 });
      if (e.spot !== undefined) entry.spot = e.spot;
      if (e.resale) entry.resale = e.resale;
      entry.seen = !!e.seen;
    }
    // (A floor saved before there were chests gets the ones the seed gives it now.)
    for (const c of s.chests ?? this.data.chests.map(chestFromData)) this.addChest(c).seen = !!c.seen;
    this.spawnT = s.spawnT;
    this.resales = s.resales;
    this.leftAt = s.leftAt ?? null;
  }

  // --- Grid queries ---

  idx(tx, ty) { return ty * this.w + tx; }
  tile(tx, ty) { return tx < 0 || ty < 0 || tx >= this.w || ty >= this.h ? T.WALL : this.grid[ty * this.w + tx]; }
  toTile(v) { return Math.floor(v / TILE); }
  center(t) { return (t + 0.5) * TILE; }

  doorAt(tx, ty) {
    return tx < 0 || ty < 0 || tx >= this.w || ty >= this.h ? undefined : this.doorByTile.get(ty * this.w + tx);
  }

  /**
   * Movement blockers: walls, the stair structures (but for ladders and the like, where their own obstacles stop you:
   * see openStairs), closed doors, and channels unless `flying`.
   */
  isSolid(tx, ty, flying = false) {
    const t = this.tile(tx, ty);
    if (t === T.DOOR) return !this.doorAt(tx, ty).open;
    if ((t === T.STAIRS_DOWN || t === T.STAIRS_UP) && this.openStairs.has(this.idx(tx, ty))) return false;
    return t === T.WALL || t === T.STAIRS_DOWN || t === T.STAIRS_UP || (t === T.CHANNEL && !flying);
  }

  blocksSight(tx, ty) {
    const t = this.tile(tx, ty);
    return t === T.WALL || (t === T.DOOR && !this.doorAt(tx, ty).open);
  }

  /**
   * For pathfinding: closed doors are routes (monsters open them), locked ones are walls, and channels are gone
   * round, except by things that fly.
   */
  blocksPath(tx, ty, flying = false) {
    const t = this.tile(tx, ty);
    if (t === T.DOOR) return this.doorAt(tx, ty).locked;
    return t === T.WALL || t === T.STAIRS_DOWN || t === T.STAIRS_UP || (t === T.CHANNEL && !flying);
  }

  /** Grid line of sight between two world points. */
  los(x0, z0, x1, z1) {
    return this.traverse(x0, z0, x1, z1, (tx, tz) => this.blocksSight(tx, tz));
  }

  /**
   * Whether something can go straight from one point to another: nothing on the line it can't walk (or fly) over. The
   * tile at the far end doesn't count, since whatever's there stands in it: you, say, on the edge of a stairs tile.
   */
  clearPath(x0, z0, x1, z1, flying = false) {
    const ex = this.toTile(x1), ez = this.toTile(z1);
    return this.traverse(x0, z0, x1, z1, (tx, tz) => (tx !== ex || tz !== ez) && this.blocksPath(tx, tz, flying));
  }

  /** Walks the grid tiles on the line between two world points (Amanatides–Woo); false if one is `blocked`. */
  traverse(x0, z0, x1, z1, blocked) {
    let tx = Math.floor(x0 / TILE), tz = Math.floor(z0 / TILE);
    const ex = Math.floor(x1 / TILE), ez = Math.floor(z1 / TILE);
    const dx = x1 - x0, dz = z1 - z0;
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
    const tDZ = dz !== 0 ? Math.abs(TILE / dz) : Infinity;
    let tMX = dx !== 0 ? (dx > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE) / Math.abs(dx) : Infinity;
    let tMZ = dz !== 0 ? (dz > 0 ? (tz + 1) * TILE - z0 : z0 - tz * TILE) / Math.abs(dz) : Infinity;
    let n = Math.abs(ex - tx) + Math.abs(ez - tz);
    while (n-- > 0) {
      if (tMX < tMZ) { tMX += tDX; tx += stepX; } else { tMZ += tDZ; tz += stepZ; }
      if (blocked(tx, tz)) return false;
    }
    return true;
  }

  /**
   * Push a circle {x, z} out of solid tiles and obstacles: circles { x, z, r } and boxes { x, z, hw, hd }.
   * Something `flying` passes over water. Returns true if it touched anything.
   */
  collide(e, r, flying = false) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const minTx = Math.floor((e.x - r) / TILE), maxTx = Math.floor((e.x + r) / TILE);
      const minTy = Math.floor((e.z - r) / TILE), maxTy = Math.floor((e.z + r) / TILE);
      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          if (this.isSolid(tx, ty, flying) && pushOutOfBox(e, r, tx * TILE, tx * TILE + TILE, ty * TILE, ty * TILE + TILE)) hit = true;
        }
      }
    }
    for (const o of this.obstacles) {
      if (o.r === undefined) {
        if (pushOutOfBox(e, r, o.x - o.hw, o.x + o.hw, o.z - o.hd, o.z + o.hd)) hit = true;
        continue;
      }
      const dx = e.x - o.x, dz = e.z - o.z, d = Math.hypot(dx, dz), min = r + o.r;
      if (d < min && d > 1e-6) {
        e.x = o.x + (dx / d) * min;
        e.z = o.z + (dz / d) * min;
        hit = true;
      }
    }
    return hit;
  }

  isFloorTile(tx, ty) { return this.tile(tx, ty) === T.FLOOR; }

  /** Whether the point (x, z) is in a pool's water (see dungeon/pools.js). */
  inPool(x, z) { return this.tile(this.toTile(x), this.toTile(z)) === T.POOL; }

  /** How high what stands at (x, z) stands: a pool's bed, or the floor. */
  groundY(x, z) { return this.inPool(x, z) ? -POOL.bed : 0; }

  /** How high the first thing something falling at (x, z) meets is: a pool's water, or the floor. */
  surfaceY(x, z) { return this.inPool(x, z) ? -POOL.surface : 0; }

  /**
   * The water stirred by `who` (you or a monster, `radius` across) wading through a pool: a splash as it steps in
   * (`entered`), heard if it's near you, and ripples spreading from it every so often while it's `moving`. Only near
   * you, where they can be seen.
   */
  stir(who, dt, { radius, moving, entered }) {
    const p = this.game.player, d = Math.hypot(who.x - p.x, who.z - p.z);
    if (entered && d < 14) this.game.audio.splash(who === p ? 1 : 1 - d / 14);
    if (!this.ripples || d > 20) return;
    who.rippleT = (who.rippleT ?? 0) - dt;
    if (!entered && (!moving || who.rippleT > 0)) return;
    who.rippleT = 0.35;
    this.ripples.spawn(who.x, -POOL.surface, who.z, radius + (entered ? 1 : 0.55), entered ? 0.9 : 0.6);
  }

  /**
   * Where something dropped at (x, z) comes to rest: there, or if that's over a channel, the nearest point of
   * the nearest tile beside it.
   */
  landSpot(x, z) {
    const tx = this.toTile(x), ty = this.toTile(z);
    if (this.tile(tx, ty) !== T.CHANNEL) return { x, z };
    let best = null, bestD = Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (this.isSolid(tx + dx, ty + dy)) continue;
      const x0 = (tx + dx) * TILE + 0.3, x1 = (tx + dx + 1) * TILE - 0.3, z0 = (ty + dy) * TILE + 0.3, z1 = (ty + dy + 1) * TILE - 0.3;
      const px = Math.max(x0, Math.min(x, x1)), pz = Math.max(z0, Math.min(z, z1)), d = Math.hypot(px - x, pz - z);
      if (d < bestD) { bestD = d; best = { x: px, z: pz }; }
    }
    return best ?? { x, z };
  }

  inShop(x, z) {
    const tx = this.toTile(x), ty = this.toTile(z);
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h && this.shopMask[this.idx(tx, ty)] === 1;
  }

  /** A random open floor tile's centre. `monster`: somewhere a monster may be put, so not in the shop. */
  randomFloorPos({ awayFrom = null, minDist = 0, hidden = false, monster = false } = {}) {
    for (let tries = 0; tries < 300; tries++) {
      const tx = rand.int(1, this.w - 2), ty = rand.int(1, this.h - 2);
      if (!this.isFloorTile(tx, ty) || this.lockedMask[this.idx(tx, ty)]) continue;
      if (monster && this.shopMask[this.idx(tx, ty)]) continue;
      const x = this.center(tx), z = this.center(ty);
      if (awayFrom && Math.hypot(x - awayFrom.x, z - awayFrom.z) < minDist) continue;
      if (hidden && this.visible[this.idx(tx, ty)]) continue;
      return { x, z };
    }
    return null;
  }

  // --- Pathing: one BFS rooted at the player serves every hunting monster (and one more for fliers, where
  // there are channels for them to cross) ---

  computeFlow(px, pz) {
    const start = this.idx(this.toTile(px), this.toTile(pz));
    this.flow = this.distances(start, false, this.flow);
    this.flowFly = this.data.channels.length ? this.distances(start, true, this.flowFly) : this.flow;
    this.flowTile = start;
  }

  /** The distance field toward the player that a monster follows, depending on whether it flies. */
  flowFor(flying) { return flying ? this.flowFly : this.flow; }

  /** BFS distance field toward an arbitrary tile (used for wandering). */
  fieldTo(tx, ty, flying = false) {
    return this.distances(this.idx(tx, ty), flying);
  }

  /** Steps from tile index `start` to every tile reachable on foot, or by air if `flying`, into `dist` (reused if given). */
  distances(start, flying, dist) {
    dist ??= new Int16Array(this.w * this.h);
    dist.fill(-1);
    const q = new Int32Array(this.w * this.h);
    let head = 0, tail = 0;
    dist[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const c = q[head++];
      const cx = c % this.w, cy = (c / this.w) | 0;
      for (const [dx, dy] of N8) {
        const nx = cx + dx, ny = cy + dy;
        if (this.blocksPath(nx, ny, flying)) continue;
        if (dx && dy && (this.blocksPath(cx + dx, cy, flying) || this.blocksPath(cx, cy + dy, flying))) continue;
        const n = this.idx(nx, ny);
        if (dist[n] >= 0) continue;
        dist[n] = dist[c] + 1;
        q[tail++] = n;
      }
    }
    return dist;
  }

  /** Next waypoint (world coords) descending (or ascending, if flee) a distance field from (x, z). */
  step(field, x, z, flee = false, flying = false) {
    const tx = this.toTile(x), ty = this.toTile(z);
    const here = field[this.idx(tx, ty)];
    if (here < 0) return null;
    let best = null, bestD = here;
    for (const [dx, dy] of N8) {
      const nx = tx + dx, ny = ty + dy;
      if (this.blocksPath(nx, ny, flying)) continue;
      if (dx && dy && (this.blocksPath(tx + dx, ty, flying) || this.blocksPath(tx, ty + dy, flying))) continue;
      const d = field[this.idx(nx, ny)];
      if (d < 0) continue;
      if (flee ? d > bestD : d < bestD) { bestD = d; best = { x: this.center(nx), z: this.center(ny) }; }
    }
    return best;
  }

  // --- Visibility / fog of war ---

  updateVisibility(px, pz) {
    this.visible.fill(0);
    const ptx = this.toTile(px), pty = this.toTile(pz);
    const R = VIEW_RADIUS_TILES;
    for (let ty = pty - R; ty <= pty + R; ty++) {
      for (let tx = ptx - R; tx <= ptx + R; tx++) {
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        if ((tx - ptx) ** 2 + (ty - pty) ** 2 > R * R) continue;
        if (this.blocksSight(tx, ty)) continue;
        if (!this.los(px, pz, this.center(tx), this.center(ty))) continue;
        this.reveal(tx, ty);
        this.visible[this.idx(tx, ty)] = 1;
      }
    }
  }

  reveal(tx, ty) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        if (dx === 0 && dy === 0) this.explored[this.idx(nx, ny)] = 1;
        else if (this.blocksSight(nx, ny)) this.explored[this.idx(nx, ny)] = 1;
      }
    }
  }

  revealAll() {
    for (let ty = 0; ty < this.h; ty++) for (let tx = 0; tx < this.w; tx++) if (!this.blocksSight(tx, ty)) this.reveal(tx, ty);
  }

  isVisibleWorld(x, z) { return !!this.visible[this.idx(this.toTile(x), this.toTile(z))]; }

  // --- Contents ---

  /** Puts an item in the world, floating at y0. One with a `price` is for sale (see Game.buy). */
  addItem(item, x, z, { onPedestal = false, y0 = onPedestal ? 1.4 : 0.22, price = 0 } = {}) {
    const mesh = buildItemModel(item, this.game.knowledge.color(item), { floor: true });
    if (item.kind === 'artefact' || item.kind === 'amulet' || item.kind === 'key') mesh.add(glowSprite(this.game.knowledge.color(item), 1.1, 0.7));
    mesh.position.set(x, y0, z);
    this.group.add(mesh);
    const entry = { item, x, z, mesh, y0, phase: rand.next() * 6, onPedestal, price, seen: false };
    this.items.push(entry);
    return entry;
  }

  /** Sets an item out for sale on the shop's spot `spot`. */
  shelve(item, price, spot) {
    const [x, y, z] = this.shopSpots[spot];
    const entry = this.addItem(item, x, z, { y0: y + 0.22, price });
    entry.spot = spot;
    return entry;
  }

  /**
   * Puts something the player sold on display, so they can buy it back at the shop's price. Potions, scrolls
   * and food join a pile of the same kind the player already sold; anything else takes the first free spot on the
   * rug, or once that's full, the first free spot on the counter or a table (not a plinth's).
   * When there's none, the thing that has been on sale longest of those the player sold makes way.
   */
  displaySold(item) {
    const pile = stackable(item) && this.items.find((e) => e.resale && e.item.kind === item.kind && e.item.type === item.type);
    if (pile) {
      pile.item.qty += item.qty;
      pile.resale = ++this.resales;
      return;
    }
    const taken = new Set(this.items.map((e) => e.spot));
    const free = (i) => !taken.has(i) && !this.shopKept.has(i);
    let spot = this.shopResale.find(free) ?? this.shopSpots.findIndex((_, i) => free(i));
    if (spot < 0) {
      const oldest = this.items.filter((e) => e.resale).sort((a, b) => a.resale - b.resale)[0];
      if (!oldest) return;
      spot = oldest.spot;
      this.removeItem(oldest);
    }
    this.shelve(item, shopPrice(item, this.depth), spot).resale = ++this.resales;
  }

  removeItem(entry) {
    this.group.remove(entry.mesh);
    this.items.splice(this.items.indexOf(entry), 1);
  }

  addMonster(type, x, z, opts = {}) {
    const m = new Monster(type, x, z, this.depth, opts);
    this.group.add(m.mesh);
    this.monsters.push(m);
    return m;
  }

  /** Shows a hidden trap, armed (or spent, if it has gone off): see world/trapModels.js. */
  /**
   * Shows a hidden trap. `found`: you've just found it (rather than set it off, or come back to it in a save): it fades
   * into view, sparkling, a ring spreading across the floor round it, so you see where it is (the chime is the
   * finder's: Sfx.trapFound). Returns whether it was hidden.
   */
  revealTrap(trap, { found = false } = {}) {
    if (!trap.hidden) return false;
    trap.hidden = false;
    this.showTrap(trap, found);
    return true;
  }

  showTrap(trap, found = false) {
    // (The models download as the game starts; one found in the first moments shows once they're here.)
    if (!trapsLoaded()) {
      loadTraps().then(() => this.showTrap(trap, found), () => {});
      return;
    }
    const x = this.center(trap.x), z = this.center(trap.y);
    trap.view = new TrapView(trap.type, x, z);
    // On a rough floor, raised clear of the rock beneath it.
    if (this.rough) trap.view.root.position.y = Math.max(0, ...[[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([dx, dz]) => this.rough.offset([x + dx, 0, z + dz], [0, 1, 0])));
    if (trap.triggered) trap.view.set('used');
    if (found) {
      trap.view.fadeIn();
      this.statusFx.sparkle(x, trap.view.root.position.y, z);
      ring(this, x, z, 0xffe6a0, 1, 0.7);
    }
    this.group.add(trap.view.root);
  }

  trapAt(tx, ty) { return this.traps.find((t) => t.x === tx && t.y === ty && !t.triggered); }

  // --- Chests ---

  /**
   * Sets a chest down: { x, z (metres), yaw, kind: 'chest' | 'locked' | 'mimic', state: 'closed' | 'open' | 'broken',
   * items }. Its model's parts move and show by name (see tools/modelgen/chests.mjs): its `lid`, a locked chest's
   * `lock`, and the `broken` wreck a smashed one leaves in place of its `body` and lid. A mimic is a chest like any
   * other until something wakes it (see wakeMimic): its model is the mimic's own, at rest (but for the odd lick of its
   * lips: see updateChests), and it stands and blocks exactly as a chest does. Returns the chest.
   */
  addChest({ x, z, yaw, kind, state = 'closed', items = [] }) {
    const model = kind === 'mimic' ? buildMonsterModel('mimic') : null;
    const root = model ? model.root : propRig(kind === 'locked' ? 'chest_locked' : 'chest').clone();
    const parts = {};
    root.traverse((o) => {
      if (!o.isGroup || !o.name) return;
      parts[o.name] = o;
      if (!model) o.userData.rest = { p: o.position.clone(), r: o.rotation.clone() }; // (a monster model's has them)
    });
    root.position.set(x, 0, z);
    root.rotation.y = yaw;
    this.group.add(root);
    const bounds = chestBounds(kind === 'locked' ? 'chest_locked' : 'chest');
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const mx = (bounds.min.x + bounds.max.x) / 2, mz = (bounds.min.z + bounds.max.z) / 2;
    const hw = (bounds.max.x - bounds.min.x) / 2, hd = (bounds.max.z - bounds.min.z) / 2;
    const obstacle = { x: x + mx * c + mz * s, z: z - mx * s + mz * c, hw: Math.abs(c) * hw + Math.abs(s) * hd, hd: Math.abs(s) * hw + Math.abs(c) * hd };
    this.obstacles.push(obstacle);
    const chest = {
      x, z, yaw, kind, state, items, root, parts, model, obstacle, bounds, seen: false,
      openT: state === 'open' ? 1 : -1, lick: -1, lickT: rand.range(...LICK_WAIT) * 0.5,
    };
    this.chests.push(chest);
    this.poseChest(chest);
    return chest;
  }

  /** Shows a chest as it is: shut, its lid swinging open (`openT`, 0..1) or open, locked, or smashed. */
  poseChest(chest) {
    const { parts: { lid, lock, body, broken }, state } = chest;
    if (chest.model) {
      chest.model.animate({ t: 0, walk: 0, windup: -1, strike: -1, dormant: true, lick: chest.lick });
      return;
    }
    const k = chest.openT <= 0 ? 0 : 1 + 2.1 * (chest.openT - 1) ** 3 + 1.1 * (chest.openT - 1) ** 2; // (overshooting a little)
    if (lid) lid.rotation.x = lid.userData.rest.r.x - LID_OPEN * k;
    if (lock) lock.visible = state === 'closed';
    if (broken) {
      broken.visible = state === 'broken';
      body.visible = lid.visible = state !== 'broken';
    }
  }

  /** Opens a chest (unlocked by now, if it was locked): its lid swings up and what's in it flies out. Returns what was. */
  openChest(chest) {
    const items = chest.items;
    chest.items = [];
    chest.state = 'open';
    chest.openT = 0;
    this.poseChest(chest);
    this.spill(items, chest, { delay: LID_TIME * 0.45 });
    return items;
  }

  /**
   * Smashes a chest: a wreck is left where it stood, and what was in it is thrown out, but for what's lost with it
   * (each thing by the chance SMASH; gold and keys never are). Returns what's lost.
   */
  breakChest(chest) {
    const kept = [], lost = [];
    for (const it of chest.items) (it.kind === 'gold' || it.kind === 'key' || !rand.chance(SMASH) ? kept : lost).push(it);
    chest.items = [];
    chest.state = 'broken';
    this.poseChest(chest);
    burst(this, chest.x, 0.35, chest.z, 0x6b4a2c, 18, 3.4, 0.8); // splinters
    burst(this, chest.x, 0.35, chest.z, 0x3c4148, 5, 2.6, 0.6); // and bits of its ironwork
    this.spill(kept, chest, { from: 0.25, scatter: 0.35 });
    return lost;
  }

  /**
   * A mimic wakes: the chest it was is gone, and in its place is the monster, turned as the chest stood, hunting you
   * and carrying what was in it (see Monster.loot). Returns the monster.
   */
  wakeMimic(chest) {
    this.removeChest(chest);
    const m = this.addMonster('mimic', chest.x, chest.z, { asleep: false });
    m.yaw = chest.yaw;
    m.mesh.rotation.y = m.yaw;
    m.loot = chest.items;
    m.state = 'hunt';
    m.seen = true;
    m.revealT = 0;
    m.cooldown = 0.9;
    return m;
  }

  removeChest(chest) {
    this.group.remove(chest.root);
    for (const m of chest.model?.materials ?? []) m.dispose(); // (a mimic's own copies: see buildMonsterModel)
    this.obstacles.splice(this.obstacles.indexOf(chest.obstacle), 1);
    this.chests.splice(this.chests.indexOf(chest), 1);
  }

  /**
   * Throws things out of a chest (or a dead mimic's maw) at { x, z, yaw }, to land on the floor in front of it, side by
   * side, each a moment after the last: from `from` metres up, `out` metres ahead of it, starting after `delay` seconds.
   * `scatter` throws them about more.
   */
  spill(items, { x, z, yaw }, { from = 0.5, out = SPILL_OUT, delay = 0, scatter = 0 } = {}) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    items.forEach((item, i) => {
      const side = (i - (items.length - 1) / 2) * 0.4 + rand.range(-0.08, 0.08) + rand.range(-scatter, scatter);
      const ahead = out + rand.range(0, 0.25) + rand.range(0, scatter);
      const at = this.landSpot(x + fx * ahead + fz * side, z + fz * ahead - fx * side);
      this.collide(at, 0.2);
      const entry = this.addItem(item, at.x, at.z);
      entry.fly = { x, y: from, z, t: -delay - i * 0.12 };
      entry.mesh.visible = false;
      entry.mesh.position.set(x, from, z);
    });
  }

  /** Moves a thing along its arc out of a chest to where it lands (see spill). False once it has landed. */
  fly(it, dt) {
    const f = it.fly;
    if ((f.t += dt) < 0) return true;
    const k = Math.min(1, f.t / SPILL_TIME);
    it.mesh.visible = true;
    it.mesh.position.set(f.x + (it.x - f.x) * k, f.y + (it.y0 - f.y) * k + 0.45 * Math.sin(Math.PI * k), f.z + (it.z - f.z) * k);
    it.mesh.rotation.y += dt * 7;
    if (k < 1) return true;
    delete it.fly;
    return false;
  }

  /**
   * Lids swinging open, and the dormant mimics' licks of their lips: rare, and only while you're about and can see
   * them (with a wet little sound, if you're close).
   */
  updateChests(dt, game) {
    const p = game.player;
    for (const c of this.chests) {
      if (c.openT >= 0 && c.openT < 1) {
        c.openT = Math.min(1, c.openT + dt / LID_TIME);
        this.poseChest(c);
      }
      if (!c.model) continue;
      if (c.lick >= 0) {
        c.lick += dt / LICK_TIME;
        if (c.lick >= 1) c.lick = -1;
        this.poseChest(c);
        continue;
      }
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < 12 && this.isVisibleWorld(c.x, c.z) && (c.lickT -= dt) <= 0) {
        c.lickT = rand.range(...LICK_WAIT);
        c.lick = 0;
        if (d < 7) game.audio.lick(1 - d / 7);
      }
    }
  }

  /**
   * The nearest shut chest along a ray from (ox, oy, oz) in the direction (dx, dy, dz), a unit vector, within `max`
   * metres: what a blow at the crosshair lands on (see playerStrike). Null if there's none, or a wall is in the way.
   */
  chestInSight(ox, oy, oz, dx, dy, dz, max) {
    let best = null, bestT = max;
    for (const c of this.chests) {
      if (c.state !== 'closed') continue;
      const t = rayChest(c, ox, oy, oz, dx, dy, dz);
      if (t !== null && t < bestT && this.los(ox, oz, c.x, c.z)) {
        best = c;
        bestT = t;
      }
    }
    return best;
  }

  /** The shut chest a point (a shot in flight) is in, if any. */
  chestAt(x, y, z) {
    return this.chests.find((c) => c.state === 'closed' && rayChest(c, x, y, z, 0, 0, 0) === 0) ?? null;
  }

  /** The shut chests within `r` of (x, z): what a splash catches. */
  chestsNear(x, z, r) {
    return this.chests.filter((c) => c.state === 'closed' && Math.hypot(c.x - x, c.z - z) < r + 0.3);
  }

  // --- Doors ---

  /** The closed door just ahead of something at (x, z) moving along (dx, dz), if any. */
  doorAhead(x, z, dx, dz, r) {
    const d = this.doorAt(this.toTile(x + dx * (r + 0.3)), this.toTile(z + dz * (r + 0.3)));
    return d && !d.open ? d : null;
  }

  /**
   * Opens an unlocked door. Locked doors are the player's business (see Game.useDoor). A swinging door swings
   * away from `by`, whoever opens it, so it never opens into their face: unless it's still closing, when it goes
   * back the way it came.
   */
  openDoor(d, by = null) {
    if (d.open || d.locked) return false;
    if (by && d.amt === 0) {
      // Which side of the door they're on, along its passage (the door's local z: see buildDoor). The leaf turns
      // toward +z for a negative swing.
      const off = d.alongZ ? by.z - this.center(d.y) : by.x - this.center(d.x);
      d.swing = off < 0 ? -1 : 1;
    }
    d.open = true;
    d.clearT = 0;
    if (this.nearPlayer(d, 14)) this.game.audio.door(true, d.parts.leaf_left ? 'slide' : 'swing');
    return true;
  }

  /** Unlocks a door: its lock (a bar, a chain, a seal) is gone. */
  unlockDoor(d) {
    d.locked = false;
    if (d.parts.lock) d.parts.lock.visible = false;
  }

  poseDoor(d) { poseDoor(d, d.amt, d.swing); }

  nearPlayer(d, range) {
    const p = this.game.player;
    return Math.hypot(p.x - this.center(d.x), p.z - this.center(d.y)) < range;
  }

  doorOccupied(d) {
    const x0 = d.x * TILE, z0 = d.y * TILE;
    const overlaps = (e, r) => e.x + r > x0 && e.x - r < x0 + TILE && e.z + r > z0 && e.z - r < z0 + TILE;
    return overlaps(this.game.player, PLAYER_RADIUS) || this.monsters.some((m) => !m.dead && overlaps(m, m.radius));
  }

  updateDoors(dt) {
    for (const d of this.doors) {
      if (d.open) {
        if (this.doorOccupied(d)) d.clearT = 0;
        else if ((d.clearT += dt) > 2.5) {
          d.open = false;
          if (this.nearPlayer(d, 14)) this.game.audio.door(false, d.parts.leaf_left ? 'slide' : 'swing');
        }
      }
      const target = d.open ? 1 : 0;
      if (d.amt !== target) {
        d.amt += Math.max(-dt * 3, Math.min(dt * 3, target - d.amt));
        this.poseDoor(d);
      }
    }
  }

  // --- Per-frame ---

  update(dt, game) {
    const p = game.player;
    const t = game.time;

    shareLights(this.lights, this.lightShare, p.x, p.z, dt);
    for (const f of this.flames) {
      const k = 0.85 + Math.sin(t * 17 + f.phase) * 0.08 + Math.sin(t * 5.3 + f.phase * 2) * 0.07;
      f.flame.update(t, k);
      f.halo.material.opacity = 0.35 + (k - 0.85) * 1.6;
      if (f.light) f.light.intensity = f.light.userData.base * f.light.userData.w * k;
    }
    flowWater(this.water, t);
    this.haze?.update(t);
    this.sunlight?.update(dt);
    // The world above, heard down the way up to it as you near it.
    if (this.sunlight && (this.dayT = (this.dayT ?? 0) - dt) <= 0) {
      this.dayT = 0.25;
      game.audio.outdoors(Math.max(0, 1 - Math.hypot(this.sunlight.x - p.x, this.sunlight.z - p.z) / 14) ** 2);
    }
    for (const tr of this.traps) tr.view?.update(dt, t);
    this.drips?.update(dt, p, game.audio);
    this.ripples?.update(dt);
    if (this.waterTiles.length && (this.waterT -= dt) <= 0) {
      this.waterT = 0.25;
      let d = Infinity;
      for (const w of this.waterTiles) d = Math.min(d, Math.hypot(w.x - p.x, w.z - p.z));
      game.audio[this.channelSound](Math.max(0, 1 - d / 16) ** 2);
    }
    for (const it of this.items) {
      if (it.fly && this.fly(it, dt)) continue;
      it.mesh.position.y = it.y0 + Math.sin(t * 2 + it.phase) * 0.05;
      it.mesh.rotation.y += dt * (it.onPedestal ? 1.2 : 0.6);
    }

    this.updateDoors(dt);
    this.updateChests(dt, game);

    // Monsters hunting the player as they step into the shop may follow them in; any others must wait
    // outside, unless the player picks a fight with them from in there (see Monster.takeDamage).
    const inShop = this.inShop(p.x, p.z);
    if (inShop !== this.playerInShop) {
      this.playerInShop = inShop;
      this.shopPursuers.clear();
      if (inShop) for (const m of this.monsters) if (!m.dead && m.state === 'hunt' && m.seen) this.shopPursuers.add(m);
    }
    this.shopkeeper?.update(dt, game, this);

    this.visT -= dt;
    if (this.visT <= 0) {
      this.visT = 0.12;
      this.updateVisibility(p.x, p.z);
      for (const it of this.items) if (!it.seen && this.isVisibleWorld(it.x, it.z)) it.seen = true;
      for (const c of this.chests) if (!c.seen && this.isVisibleWorld(c.x, c.z)) c.seen = true;
    }

    const ptile = this.idx(this.toTile(p.x), this.toTile(p.z));
    this.flowT -= dt;
    if (this.flowT <= 0 || ptile !== this.flowTile) {
      this.flowT = 0.4;
      this.computeFlow(p.x, p.z);
    }

    for (const m of this.monsters) m.update(dt, game, this);
    this.separateMonsters();
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      if (m.dead && m.deathT > 1.2) {
        this.group.remove(m.mesh);
        this.monsters.splice(i, 1);
      }
    }
    this.statusFx.update(dt, game, this);

    updateProjectiles(dt, game, this);
    updateParticles(dt, this);

    // Passive search for traps near the player.
    this.searchT -= dt;
    if (this.searchT <= 0) {
      this.searchT = 0.5;
      const eye = p.hasArtefact('eye');
      const ptx = this.toTile(p.x), pty = this.toTile(p.z);
      let found = false;
      for (const tr of this.traps) {
        if (!tr.hidden) continue;
        const d = Math.max(Math.abs(tr.x - ptx), Math.abs(tr.y - pty));
        if (eye ? this.visible[this.idx(tr.x, tr.y)] : d <= 2 && rand.chance(0.18)) {
          found = this.revealTrap(tr, { found: true });
          if (!eye) game.log('You notice a hidden trap.', 'warn');
        }
      }
      if (found) game.audio.trapFound(); // (once, for however many)
    }

    // The dungeon restocks itself. Carrying the Amulet makes it furious.
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      const amulet = p.hasAmulet();
      this.spawnT = amulet ? rand.range(18, 28) : rand.range(60, 90);
      const alive = this.monsters.filter((m) => !m.dead).length;
      if (alive < 8 + danger(this.depth) * 1.5 + (amulet ? 6 : 0)) this.spawnWanderer(amulet);
    }
  }

  spawnWanderer(hunting) {
    const pos = this.randomFloorPos({ awayFrom: this.game.player, minDist: 16, hidden: true, monster: true });
    if (!pos) return;
    const depth = hunting ? Math.min(MAX_DEPTH, this.depth + 8) : this.depth;
    const type = rand.weighted(spawnTable(Math.max(1, depth)));
    const m = this.addMonster(type, pos.x, pos.z, { asleep: false, depthOverride: depth });
    if (hunting) m.state = 'hunt';
  }

  separateMonsters() {
    const ms = this.monsters;
    for (let i = 0; i < ms.length; i++) {
      const a = ms[i];
      if (a.dead) continue;
      for (let j = i + 1; j < ms.length; j++) {
        const b = ms[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz), min = a.radius + b.radius;
        if (d < min && d > 1e-5) {
          const push = (min - d) / 2 / d;
          a.x -= dx * push; a.z -= dz * push;
          b.x += dx * push; b.z += dz * push;
        }
      }
      this.collide(a, a.radius, a.flies);
    }
  }
}

/** Pushes a circle out of an axis-aligned box. Returns true if they overlapped. */
function pushOutOfBox(e, r, x0, x1, z0, z1) {
  const cx = Math.max(x0, Math.min(e.x, x1)), cz = Math.max(z0, Math.min(e.z, z1));
  const dx = e.x - cx, dz = e.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2), push = (r - d) / d;
    e.x += dx * push;
    e.z += dz * push;
  } else {
    const l = e.x - x0, rr = x1 - e.x, t = e.z - z0, b = z1 - e.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) e.x = x0 - r; else if (m === rr) e.x = x1 + r; else if (m === t) e.z = z0 - r; else e.z = z1 + r;
  }
  return true;
}
