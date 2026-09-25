import * as THREE from 'three';
import { TILE, VIEW_RADIUS_TILES, MAX_DEPTH, PLAYER_RADIUS, danger } from '../config.js';
import { T } from '../dungeon/tiles.js';
import { buildLevelMeshes, flowWater } from '../dungeon/levelBuilder.js';
import { TrapView, loadTraps, trapsLoaded } from './trapModels.js';
import { buildItemModel } from '../items/models.js';
import { shopPrice, stackable } from '../items/generate.js';
import { Monster } from '../monsters/monster.js';
import { spawnTable } from '../monsters/defs.js';
import { updateProjectiles } from '../fx/projectiles.js';
import { updateParticles } from '../fx/particles.js';
import { rand } from '../rng.js';
import { glowSprite } from '../fx/glow.js';
import { Drips } from '../fx/drips.js';
import { Shopkeeper } from './shopkeeper.js';
import { fingerprint, packBits, unpackBits, round2 } from '../save.js';

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Traps on the map: grey spikes, green gas, azure teleport, yellow alarm (as their models; see trapModels.js).
export const TRAP_COLORS = { spike: 0xa0a0a0, poison: 0x40c040, teleport: 0x3aa0ff, alarm: 0xe0c020 };

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
    this.obstacles = built.obstacles;
    this.water = built.water;
    this.haze = built.haze; // the haze rising out of the channels
    this.rough = built.rough; // the rough rock's shape (see roughRock.js), for setting things on it
    // Channel tiles, for the sound they make as you near them: running water, wind rising out of a chasm, the
    // uneasy hum of a rift, or lava's rumble and bubbling.
    this.channelSound = { water: 'water', chasm: 'wind', rift: 'rift', lava: 'lava' }[this.theme.channels?.fill];
    this.waterTiles = this.channelSound ? data.channels.flatMap((c) => c.tiles.map((t) => ({ x: this.center(t.x), z: this.center(t.y) }))) : [];
    this.waterT = 0;
    this.drips = built.drips.length ? new Drips(this.group, built.drips) : null;

    // Doors: open when something walks into them, swing shut once the doorway has been clear a while.
    this.doors = data.doors.map((d, i) => ({ ...d, open: false, amt: 0, clearT: 0, ...built.doors[i] }));
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
    this.traps = [];
    this.projectiles = [];
    this.particles = [];

    this.flow = null;
    this.flowT = 0;
    this.flowTile = -1;
    this.spawnT = 75;
    this.searchT = 0;

    for (const t of data.traps) this.traps.push({ ...t, hidden: true, triggered: false, view: null });

    // Where the shop's wares rest: the counter and display tables hold its stock, and things the player sells
    // go in any free spot, filling the rug last.
    this.shopSpots = built.shopSlots;
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
    if (data.shrine) this.addItem(data.shrine.item, (data.shrine.x + 0.5) * TILE, (data.shrine.y + 0.5) * TILE, { onPedestal: true });
    if (data.amulet) {
      this.addItem(this.game.makeAmulet(), (data.amulet.x + 0.5) * TILE, (data.amulet.y + 0.5) * TILE, { onPedestal: true });
    }
    data.shop?.stock.forEach(({ item, price }, i) => this.shelve(item, price, i));
  }

  // --- Saving (see save.js) ---

  /**
   * What a save keeps of this floor: what's changed since it was made (the rest comes back from the seed), with
   * its layout's fingerprint to check it against when it's restored. Doors and traps are a digit each, in order:
   * doors 1 locked + 2 open; traps 1 found + 2 spent.
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
      spawnT: Math.round(this.spawnT),
      resales: this.resales,
    };
  }

  /** Puts back what snapshot() kept, on a floor made from the same seed. */
  restore(s) {
    this.explored = unpackBits(s.explored, this.w * this.h);
    this.doors.forEach((d, i) => {
      const v = +s.doors[i] || 0;
      d.locked = !!(v & 1);
      d.open = !!(v & 2);
      d.amt = d.open ? 1 : 0;
      d.pivot.rotation.y = (d.swing * d.amt * Math.PI) / 2;
    });
    this.traps.forEach((t, i) => {
      const v = +s.traps[i] || 0;
      t.triggered = !!(v & 2);
      if (v & 1) this.revealTrap(t);
    });
    for (const ms of s.monsters) {
      this.addMonster(ms.type, ms.x, ms.z, { asleep: ms.state === 'sleep', boss: ms.boss, guardian: ms.guardian }).restore(ms);
    }
    for (const e of s.items) {
      const entry = this.addItem(e.item, e.x, e.z, { onPedestal: !!e.onPedestal, y0: e.y0, price: e.price ?? 0 });
      if (e.spot !== undefined) entry.spot = e.spot;
      if (e.resale) entry.resale = e.resale;
      entry.seen = !!e.seen;
    }
    this.spawnT = s.spawnT;
    this.resales = s.resales;
  }

  // --- Grid queries ---

  idx(tx, ty) { return ty * this.w + tx; }
  tile(tx, ty) { return tx < 0 || ty < 0 || tx >= this.w || ty >= this.h ? T.WALL : this.grid[ty * this.w + tx]; }
  toTile(v) { return Math.floor(v / TILE); }
  center(t) { return (t + 0.5) * TILE; }

  doorAt(tx, ty) {
    return tx < 0 || ty < 0 || tx >= this.w || ty >= this.h ? undefined : this.doorByTile.get(ty * this.w + tx);
  }

  /** Movement blockers: walls, the stair structures, closed doors, and channels unless `flying`. */
  isSolid(tx, ty, flying = false) {
    const t = this.tile(tx, ty);
    if (t === T.DOOR) return !this.doorAt(tx, ty).open;
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

  /** Whether something can go straight from one point to another: nothing on the line it can't walk (or fly) over. */
  clearPath(x0, z0, x1, z1, flying = false) {
    return this.traverse(x0, z0, x1, z1, (tx, tz) => this.blocksPath(tx, tz, flying));
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
   * and food join a pile of the same kind the player already sold; anything else takes the first free spot.
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
    let spot = this.shopSpots.findIndex((_, i) => !taken.has(i));
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
  revealTrap(trap) {
    if (!trap.hidden) return;
    trap.hidden = false;
    this.showTrap(trap);
  }

  showTrap(trap) {
    // (The models download as the game starts; one found in the first moments shows once they're here.)
    if (!trapsLoaded()) {
      loadTraps().then(() => this.showTrap(trap), () => {});
      return;
    }
    const x = this.center(trap.x), z = this.center(trap.y);
    trap.view = new TrapView(trap.type, x, z);
    // On a rough floor, raised clear of the rock beneath it.
    if (this.rough) trap.view.root.position.y = Math.max(0, ...[[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([dx, dz]) => this.rough.offset([x + dx, 0, z + dz], [0, 1, 0])));
    if (trap.triggered) trap.view.set('used');
    this.group.add(trap.view.root);
  }

  trapAt(tx, ty) { return this.traps.find((t) => t.x === tx && t.y === ty && !t.triggered); }

  // --- Doors ---

  /** The closed door just ahead of something at (x, z) moving along (dx, dz), if any. */
  doorAhead(x, z, dx, dz, r) {
    const d = this.doorAt(this.toTile(x + dx * (r + 0.3)), this.toTile(z + dz * (r + 0.3)));
    return d && !d.open ? d : null;
  }

  /** Opens an unlocked door. Locked doors are the player's business (see Game.useDoor). */
  openDoor(d) {
    if (d.open || d.locked) return false;
    d.open = true;
    d.clearT = 0;
    if (this.nearPlayer(d, 14)) this.game.audio.door(true);
    return true;
  }

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
          if (this.nearPlayer(d, 14)) this.game.audio.door(false);
        }
      }
      const target = d.open ? 1 : 0;
      if (d.amt !== target) {
        d.amt += Math.max(-dt * 3, Math.min(dt * 3, target - d.amt));
        d.pivot.rotation.y = (d.swing * d.amt * Math.PI) / 2;
      }
    }
  }

  // --- Per-frame ---

  update(dt, game) {
    const p = game.player;
    const t = game.time;

    for (const f of this.flames) {
      const k = 0.85 + Math.sin(t * 17 + f.phase) * 0.08 + Math.sin(t * 5.3 + f.phase * 2) * 0.07;
      f.flame.update(t, k);
      f.halo.material.opacity = 0.35 + (k - 0.85) * 1.6;
      if (f.light) f.light.intensity = f.light.userData.base * k;
    }
    flowWater(this.water, t);
    this.haze?.update(t);
    for (const tr of this.traps) tr.view?.update(dt, t);
    this.drips?.update(dt, p, game.audio);
    if (this.waterTiles.length && (this.waterT -= dt) <= 0) {
      this.waterT = 0.25;
      let d = Infinity;
      for (const w of this.waterTiles) d = Math.min(d, Math.hypot(w.x - p.x, w.z - p.z));
      game.audio[this.channelSound](Math.max(0, 1 - d / 16) ** 2);
    }
    for (const it of this.items) {
      it.mesh.position.y = it.y0 + Math.sin(t * 2 + it.phase) * 0.05;
      it.mesh.rotation.y += dt * (it.onPedestal ? 1.2 : 0.6);
    }

    this.updateDoors(dt);

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

    updateProjectiles(dt, game, this);
    updateParticles(dt, this);

    // Passive search for traps near the player.
    this.searchT -= dt;
    if (this.searchT <= 0) {
      this.searchT = 0.5;
      const eye = p.hasArtefact('eye');
      const ptx = this.toTile(p.x), pty = this.toTile(p.z);
      for (const tr of this.traps) {
        if (!tr.hidden) continue;
        const d = Math.max(Math.abs(tr.x - ptx), Math.abs(tr.y - pty));
        if (eye ? this.visible[this.idx(tr.x, tr.y)] : d <= 2 && rand.chance(0.18)) {
          this.revealTrap(tr);
          if (!eye) game.log('You notice a hidden trap.', 'warn');
        }
      }
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
