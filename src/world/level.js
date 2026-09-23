import * as THREE from 'three';
import { TILE, VIEW_RADIUS_TILES, MAX_DEPTH, PLAYER_RADIUS } from '../config.js';
import { T } from '../dungeon/tiles.js';
import { buildLevelMeshes } from '../dungeon/levelBuilder.js';
import { getTrapTexture } from '../dungeon/textures.js';
import { buildItemModel } from '../items/models.js';
import { Monster } from '../monsters/monster.js';
import { spawnTable } from '../monsters/defs.js';
import { updateProjectiles } from '../fx/projectiles.js';
import { updateParticles } from '../fx/particles.js';
import { rand } from '../rng.js';
import { glowSprite } from '../fx/glow.js';

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export const TRAP_COLORS = { spike: 0xa0a0a0, poison: 0x40c040, teleport: 0x8040e0, alarm: 0xe0c020 };

export class Level {
  constructor(game, data) {
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

    // Doors: open when something walks into them, swing shut once the doorway has been clear a while.
    this.doors = data.doors.map((d, i) => ({ ...d, open: false, amt: 0, clearT: 0, ...built.doors[i] }));
    this.doorByTile = new Map(this.doors.map((d) => [d.y * this.w + d.x, d]));
    // Tiles inside locked rooms: never a teleport destination or a wanderer's spawn point.
    this.lockedMask = new Uint8Array(this.w * this.h);
    for (const r of data.rooms) {
      if (!r.locked) continue;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) this.lockedMask[y * this.w + x] = 1;
    }
    this.wanderRooms = data.rooms.filter((r) => !r.locked);

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

    for (const m of data.monsters) {
      this.addMonster(m.type, (m.x + 0.5) * TILE, (m.y + 0.5) * TILE, { asleep: m.asleep, boss: m.boss, guardian: m.guardian });
    }
    for (const it of data.items) {
      this.addItem(it.item, (it.x + 0.5 + rand.range(-0.2, 0.2)) * TILE, (it.y + 0.5 + rand.range(-0.2, 0.2)) * TILE);
    }
    for (const t of data.traps) this.traps.push({ ...t, hidden: true, triggered: false, mesh: null });
    if (data.shrine) this.addItem(data.shrine.item, (data.shrine.x + 0.5) * TILE, (data.shrine.y + 0.5) * TILE, { onPedestal: true });
    if (data.amulet) {
      this.addItem(game.makeAmulet(), (data.amulet.x + 0.5) * TILE, (data.amulet.y + 0.5) * TILE, { onPedestal: true });
    }
  }

  // --- Grid queries ---

  idx(tx, ty) { return ty * this.w + tx; }
  tile(tx, ty) { return tx < 0 || ty < 0 || tx >= this.w || ty >= this.h ? T.WALL : this.grid[ty * this.w + tx]; }
  toTile(v) { return Math.floor(v / TILE); }
  center(t) { return (t + 0.5) * TILE; }

  doorAt(tx, ty) {
    return tx < 0 || ty < 0 || tx >= this.w || ty >= this.h ? undefined : this.doorByTile.get(ty * this.w + tx);
  }

  /** Movement blockers: walls, the stair structures and closed doors. */
  isSolid(tx, ty) {
    const t = this.tile(tx, ty);
    if (t === T.DOOR) return !this.doorAt(tx, ty).open;
    return t === T.WALL || t === T.STAIRS_DOWN || t === T.STAIRS_UP;
  }

  blocksSight(tx, ty) {
    const t = this.tile(tx, ty);
    return t === T.WALL || (t === T.DOOR && !this.doorAt(tx, ty).open);
  }

  /** For pathfinding: closed doors are routes (monsters open them), locked ones are walls. */
  blocksPath(tx, ty) {
    const t = this.tile(tx, ty);
    if (t === T.DOOR) return this.doorAt(tx, ty).locked;
    return t === T.WALL || t === T.STAIRS_DOWN || t === T.STAIRS_UP;
  }

  /** Grid line of sight between two world points (Amanatides–Woo traversal). */
  los(x0, z0, x1, z1) {
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
      if (this.blocksSight(tx, tz)) return false;
    }
    return true;
  }

  /** Push a circle {x, z} out of solid tiles and obstacles. Returns true if it touched anything. */
  collide(e, r) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const minTx = Math.floor((e.x - r) / TILE), maxTx = Math.floor((e.x + r) / TILE);
      const minTy = Math.floor((e.z - r) / TILE), maxTy = Math.floor((e.z + r) / TILE);
      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          if (!this.isSolid(tx, ty)) continue;
          const bx0 = tx * TILE, bx1 = bx0 + TILE, bz0 = ty * TILE, bz1 = bz0 + TILE;
          const cx = Math.max(bx0, Math.min(e.x, bx1)), cz = Math.max(bz0, Math.min(e.z, bz1));
          const dx = e.x - cx, dz = e.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          hit = true;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2), push = (r - d) / d;
            e.x += dx * push;
            e.z += dz * push;
          } else {
            const l = e.x - bx0, rr = bx1 - e.x, t = e.z - bz0, b = bz1 - e.z;
            const m = Math.min(l, rr, t, b);
            if (m === l) e.x = bx0 - r; else if (m === rr) e.x = bx1 + r; else if (m === t) e.z = bz0 - r; else e.z = bz1 + r;
          }
        }
      }
    }
    for (const o of this.obstacles) {
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

  randomFloorPos({ awayFrom = null, minDist = 0, hidden = false } = {}) {
    for (let tries = 0; tries < 300; tries++) {
      const tx = rand.int(1, this.w - 2), ty = rand.int(1, this.h - 2);
      if (!this.isFloorTile(tx, ty) || this.lockedMask[this.idx(tx, ty)]) continue;
      const x = this.center(tx), z = this.center(ty);
      if (awayFrom && Math.hypot(x - awayFrom.x, z - awayFrom.z) < minDist) continue;
      if (hidden && this.visible[this.idx(tx, ty)]) continue;
      return { x, z };
    }
    return null;
  }

  // --- Pathing: one BFS rooted at the player serves every hunting monster ---

  computeFlow(px, pz) {
    const tx = this.toTile(px), ty = this.toTile(pz);
    const start = this.idx(tx, ty);
    const dist = this.flow ?? new Int16Array(this.w * this.h);
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
        if (this.blocksPath(nx, ny)) continue;
        if (dx && dy && (this.blocksPath(cx + dx, cy) || this.blocksPath(cx, cy + dy))) continue;
        const n = this.idx(nx, ny);
        if (dist[n] >= 0) continue;
        dist[n] = dist[c] + 1;
        q[tail++] = n;
      }
    }
    this.flow = dist;
    this.flowTile = start;
  }

  /** BFS distance field toward an arbitrary tile (used for wandering). */
  fieldTo(tx, ty) {
    const dist = new Int16Array(this.w * this.h).fill(-1);
    const q = new Int32Array(this.w * this.h);
    let head = 0, tail = 0;
    dist[this.idx(tx, ty)] = 0;
    q[tail++] = this.idx(tx, ty);
    while (head < tail) {
      const c = q[head++];
      const cx = c % this.w, cy = (c / this.w) | 0;
      for (const [dx, dy] of N8) {
        const nx = cx + dx, ny = cy + dy;
        if (this.blocksPath(nx, ny)) continue;
        if (dx && dy && (this.blocksPath(cx + dx, cy) || this.blocksPath(cx, cy + dy))) continue;
        const n = this.idx(nx, ny);
        if (dist[n] >= 0) continue;
        dist[n] = dist[c] + 1;
        q[tail++] = n;
      }
    }
    return dist;
  }

  /** Next waypoint (world coords) descending (or ascending, if flee) a distance field from (x, z). */
  step(field, x, z, flee = false) {
    const tx = this.toTile(x), ty = this.toTile(z);
    const here = field[this.idx(tx, ty)];
    if (here < 0) return null;
    let best = null, bestD = here;
    for (const [dx, dy] of N8) {
      const nx = tx + dx, ny = ty + dy;
      if (this.blocksPath(nx, ny)) continue;
      if (dx && dy && (this.blocksPath(tx + dx, ty) || this.blocksPath(tx, ty + dy))) continue;
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

  addItem(item, x, z, { onPedestal = false } = {}) {
    const mesh = buildItemModel(item, this.game.knowledge.color(item));
    if (item.kind === 'artefact' || item.kind === 'amulet' || item.kind === 'key') mesh.add(glowSprite(this.game.knowledge.color(item), 1.1, 0.7));
    const y0 = onPedestal ? 1.4 : 0.22;
    mesh.position.set(x, y0, z);
    this.group.add(mesh);
    const entry = { item, x, z, mesh, y0, phase: rand.next() * 6, onPedestal, seen: false };
    this.items.push(entry);
    return entry;
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

  revealTrap(trap) {
    if (!trap.hidden) return;
    trap.hidden = false;
    const mat = new THREE.MeshLambertMaterial({ map: getTrapTexture(), color: TRAP_COLORS[trap.type], transparent: true, opacity: 0.9 });
    trap.mesh = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 0.7, TILE * 0.7), mat);
    trap.mesh.rotation.x = -Math.PI / 2;
    trap.mesh.position.set(this.center(trap.x), 0.02, this.center(trap.y));
    this.group.add(trap.mesh);
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
      f.mesh.scale.set(1, k, 1);
      f.halo.material.opacity = 0.35 + (k - 0.85) * 1.6;
      if (f.light) f.light.intensity = f.light.userData.base * k;
    }
    for (const it of this.items) {
      it.mesh.position.y = it.y0 + Math.sin(t * 2 + it.phase) * 0.05;
      it.mesh.rotation.y += dt * (it.onPedestal ? 1.2 : 0.6);
    }

    this.updateDoors(dt);

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
      if (alive < 8 + this.depth * 1.5 + (amulet ? 6 : 0)) this.spawnWanderer(amulet);
    }
  }

  spawnWanderer(hunting) {
    const pos = this.randomFloorPos({ awayFrom: this.game.player, minDist: 16, hidden: true });
    if (!pos) return;
    const depth = hunting ? Math.min(MAX_DEPTH, this.depth + 3) : this.depth;
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
      this.collide(a, a.radius);
    }
  }
}
