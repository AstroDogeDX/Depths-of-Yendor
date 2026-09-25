import { MONSTERS } from './defs.js';
import { buildMonsterModel } from './models.js';
import { rand } from '../rng.js';
import { PLAYER_RADIUS, EYE_H, TILE, danger } from '../config.js';
import { spawnProjectile } from '../fx/projectiles.js';
import { burst } from '../fx/particles.js';
import { round2 } from '../save.js';
import { DAMAGE_TYPES, damageType, damageMult, isPhysical } from '../damage.js';
import {
  STATUSES, blankStatus, restoreStatus, saveStatus, afflict as applyStatus, tickStatuses, damageTakenMult, hitStatuses,
} from '../status.js';

const BLOOD = {
  rat: 0x901010, bat: 0x901010, slime: 0x40c040, goblin: 0x902010, archer: 0x902010, skeleton: 0xe0d8c0,
  orc: 0x801010, wraith: 0x6040a0, imp: 0xff6010, troll: 0x406020, golem: 0x909090, warden: 0xffc040,
};

const STRIKE_TIME = 0.3;
const TINTS = Object.entries(STATUSES).filter(([, def]) => def.tint); // (in the order they win)
const BLIND_SIGHT = 1.6; // metres a blinded monster can still make you out at: about a tile
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Monster {
  constructor(type, x, z, levelDepth, opts = {}) {
    const def = MONSTERS[type];
    this.type = type;
    this.def = def;
    this.name = def.name;
    const depth = opts.depthOverride ?? levelDepth;
    // Tougher the more dangerous the floor is than the first one it appears on (see `danger` in config.js).
    this.danger = danger(depth);
    const over = def.boss ? 0 : Math.max(0, this.danger - danger(def.depth[0]));
    this.maxHp = Math.round(def.hp * (1 + over * 0.08));
    this.hp = this.maxHp;
    this.dmgMult = 1 + over * 0.05;
    this.x = x;
    this.z = z;
    this.radius = def.radius;
    this.flies = !!def.flying; // passes over water
    this.yaw = rand.range(-Math.PI, Math.PI);
    this.boss = !!opts.boss;
    this.guardian = !!opts.guardian;
    this.state = (opts.asleep ?? rand.chance(def.sleepChance)) ? 'sleep' : 'wander';

    const model = buildMonsterModel(type);
    this.model = model;
    this.mesh = model.root;
    this.mesh.rotation.order = 'YXZ';
    this.height = model.height;
    this.baseY = def.flying ?? 0;
    this.mesh.position.set(x, this.baseY, z);

    this.attack = { phase: 'none', t: 0, ranged: false };
    this.cooldown = rand.range(0.3, 1);
    this.status = blankStatus(false); // seconds left of each status (see status.js)
    this.isPlayer = false;
    this.dotT = 0;
    this.weakBase = null; // its max health before it was weakened
    this.searchAt = null; // the tile it's searching for you at: where it last saw or heard you (see search)
    this.searchField = null;
    this.seeT = rand.range(0, 0.2);
    this.canSee = false;
    this.seen = false; // has laid eyes on the player during this hunt (vs. searching for a noise)
    this.lostT = 0;
    this.decideT = 0;
    this.walk = 0;
    this.t = rand.range(0, 10);
    this.hurtT = 0;
    this.tintKey = null;
    this.dead = false;
    this.deathT = 0;
    this.wander = null;
    this.idleT = 0;
    this.zzzT = rand.range(1, 3);
    this.summoned = false;
  }

  /** What a save keeps of it (see Level.snapshot). Only statuses in effect are kept. */
  snapshot() {
    const status = saveStatus(this.status);
    return {
      type: this.type, x: round2(this.x), z: round2(this.z), yaw: round2(this.yaw), hp: round2(this.hp), maxHp: this.maxHp,
      danger: this.danger, dmgMult: this.dmgMult, state: this.state, seen: this.seen || undefined, status,
      boss: this.boss || undefined, guardian: this.guardian || undefined, summoned: this.summoned || undefined,
      weakBase: this.weakBase ?? undefined,
    };
  }

  /** Takes up where snapshot() left it. */
  restore(s) {
    restoreStatus(this.status, s.status);
    this.weakBase = s.weakBase ?? null;
    this.yaw = s.yaw;
    this.hp = s.hp;
    this.maxHp = s.maxHp;
    this.danger = s.danger;
    this.dmgMult = s.dmgMult;
    this.state = s.state;
    this.seen = !!s.seen;
    this.summoned = !!s.summoned;
    this.mesh.rotation.y = this.yaw;
    return this;
  }

  // --- Statuses (see status.js) ---

  /** Gives it a status. `show`: pop up "IMMUNE" if it can't take it. Returns whether it took. */
  afflict(game, key, secs, show = true) { return applyStatus(game, this, key, secs, { show }); }

  /** Its own resistance to a damage type (see damage.js). */
  resistMult(type) { return damageMult(this.def, type); }

  /** A trait from its def: `bloodless` (can't bleed), `fluid` (always as good as wet: cold freezes it solid). */
  hasTrait(trait) { return !!this.def.traits?.includes(trait); }

  /** Paralysed or frozen: it can't move or strike, and it's open to an unaware blow. */
  held() { return this.status.paralysed > 0 || this.status.frozen > 0; }

  /** Shows what's happened to one of its statuses: a word over it, if you can see it. */
  statusNote(game, key, event) {
    if (this.dead) return;
    if (event === 'immune') {
      game.popup(this.headPos(), 'IMMUNE', 'immune');
      if (STATUSES[key].resist) this.revealResist(game, STATUSES[key].resist, 0);
      return;
    }
    if (!game.level.isVisibleWorld(this.x, this.z)) return;
    if (event === 'start' && STATUSES[key].mark) game.popup(this.headPos(), STATUSES[key].mark, `status s-${key}`);
    else if (event === 'doused' || event === 'thawed') game.popup(this.headPos(), event.toUpperCase(), `status s-${event}`);
  }

  headPos() {
    return { x: this.x, y: this.baseY + this.height + 0.25, z: this.z };
  }

  update(dt, game, level) {
    this.t += dt;
    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.45);
      this.mesh.rotation.x = -k * Math.PI / 2;
      this.mesh.position.y = this.baseY * (1 - k) - Math.max(0, this.deathT - 0.7) * 0.8;
      return;
    }

    this.tickStatus(dt, game, level);
    if (this.dead) return;

    const p = game.player;
    const dx = p.x - this.x, dz = p.z - this.z;
    const dist = Math.hypot(dx, dz);

    this.seeT -= dt;
    if (this.seeT <= 0) {
      this.seeT = 0.2;
      // Blinded, it can make you out only right beside it; it hears as well as ever.
      this.canSee = p.status.invisible <= 0 && dist < (this.status.blind > 0 ? BLIND_SIGHT : 18) &&
        level.los(this.x, this.z, p.x, p.z);
      this.perceive(game, level, dist);
    }
    // Carrying the Amulet, you're Hunted: everything on the floor knows where you are.
    if (game.hunted && (this.state !== 'hunt' || !this.seen)) {
      this.state = 'hunt';
      this.seen = true;
      this.lostT = 0;
      this.wander = null;
    }

    const speedMult = this.status.chilled > 0 ? 0.5 : 1;
    let moving = false;
    if (this.held()) {
      this.attack.phase = 'none';
    } else if (this.attack.phase !== 'none') {
      this.updateAttack(dt * speedMult, game, level, dist, dx, dz);
    } else {
      this.cooldown -= dt * speedMult;
      moving = this.think(dt, game, level, dist, dx, dz, speedMult);
    }

    if (moving) this.walk += dt * this.def.speed * speedMult * 3;
    this.mesh.position.set(this.x, this.baseY, this.z);
    this.mesh.rotation.y = this.yaw;
    const a = this.attack;
    this.model.animate({
      t: this.held() ? 0 : this.t,
      walk: this.walk,
      windup: a.phase === 'windup' ? Math.min(1, a.t / this.def.windup) : -1,
      strike: a.phase === 'strike' ? Math.min(1, a.t / STRIKE_TIME) : -1,
    });
    this.updateTint(dt);

    if (this.state === 'sleep') {
      this.zzzT -= dt;
      if (this.zzzT <= 0) {
        this.zzzT = 2.5;
        if (dist < 10 && level.isVisibleWorld(this.x, this.z)) game.popup(this.headPos(), 'z', 'zzz');
      }
    }
  }

  tickStatus(dt, game, level) {
    tickStatuses(game, this, dt);
    if (this.dead) return;
    if (this.def.regen && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.def.regen * dt);

    if (this.boss && !this.summoned && this.hp < this.maxHp * 0.5) {
      this.summoned = true;
      game.log(`The ${this.name} raises its halberd — the dead answer!`, 'danger');
      game.audio.alert(0.5);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const m = level.addMonster(i === 0 ? 'wraith' : 'skeleton', this.x + Math.cos(a) * 1.6, this.z + Math.sin(a) * 1.6, { asleep: false });
        level.collide(m, m.radius, m.flies);
        m.state = 'hunt';
        burst(level, m.x, 0.5, m.z, 0x8060ff, 12, 3, 0.6);
      }
    }
  }

  perceive(game, level, dist) {
    const p = game.player;
    const stealth = p.stealth();
    const heard = this.hearing(p, level);
    if (this.state === 'sleep') {
      // Sleepers don't watch: they wake to footsteps, or to someone looming right over them.
      // Sneaking keeps your steps near-silent and your presence five times less likely to stir them.
      let chance = 0.25 * heard;
      if (this.canSee && dist < 5) chance += 0.12 * (1 - dist / 5) * (p.mode === 'sneak' ? 0.2 : 1);
      if (this.boss && this.canSee && dist < 9) chance = 1;
      if (rand.chance(chance * stealth)) {
        if (this.canSee) this.notice(game);
        else this.hear(game, level);
      }
    } else if (this.state === 'wander') {
      if (this.canSee && (dist < 4 || rand.chance(0.35 * stealth + 0.08))) this.notice(game);
      else if (heard > 0 && rand.chance(0.45 * heard * stealth)) this.hear(game, level);
    } else if (this.state === 'hunt') {
      if (this.canSee) {
        if (!this.seen) this.notice(game);
        this.setSearch(level, p.x, p.z); // (where it last saw you, should it lose sight of you)
      } else if (heard > 0 && rand.chance(0.45 * heard * stealth)) {
        this.setSearch(level, p.x, p.z); // it heard you again: that's where to look now
        this.lostT = 0;
      }
    }
  }

  /** Where to search for you: the tile at (x, z). */
  setSearch(level, x, z) {
    const tx = level.toTile(x), ty = level.toTile(z);
    if (this.searchAt?.tx === tx && this.searchAt?.ty === ty) return;
    this.searchAt = { tx, ty };
    this.searchField = null;
  }

  /**
   * 0..1: how clearly this monster hears the player's footsteps. Measured in walking distance using the
   * player-rooted flow field, so sound carries along corridors and round corners but not through walls.
   */
  hearing(p, level) {
    const flow = level.flowFor(this.flies);
    if (p.noise <= 0 || !flow) return 0;
    const steps = flow[level.idx(level.toTile(this.x), level.toTile(this.z))];
    if (steps < 0) return 0;
    const d = steps * TILE;
    return d < p.noise ? 1 - d / p.noise : 0;
  }

  /**
   * Heard something at (x, z) (you, by default): it goes to look, without knowing yet what it was, and gives up if it
   * finds nothing and hears no more (see think). Still open to an unaware strike.
   */
  hear(game, level, x = game.player.x, z = game.player.z) {
    if (this.state === 'hunt' && this.seen && this.canSee) return;
    this.state = 'hunt';
    this.seen = false;
    this.lostT = 0;
    this.wander = null;
    this.setSearch(level, x, z);
    if (level.isVisibleWorld(this.x, this.z)) game.popup(this.headPos(), '?', 'alert');
  }

  /** Loses sight of you (blinded): it hunts on by sound, from where you were. */
  loseTrack(game, level) {
    if (this.state !== 'hunt') return;
    this.seen = false;
    this.lostT = 0;
    this.setSearch(level, game.player.x, game.player.z);
  }

  /** Knows where you are now, and hunts you. `mark` shows a "!" over it (not when a hit woke it: that has its own). */
  notice(game, mark = true) {
    if (this.state === 'hunt' && this.seen) return;
    this.state = 'hunt';
    this.seen = true;
    this.lostT = 0;
    if (mark && game.level.isVisibleWorld(this.x, this.z)) game.popup(this.headPos(), '!', 'alert');
    game.audio.alert(this.boss ? 0.4 : 1 + (1.2 - this.height) * 0.4);
    if (this.boss) game.log(`The ${this.name} awakens. "You shall not take it."`, 'danger');
  }

  think(dt, game, level, dist, dx, dz, speedMult) {
    const def = this.def;
    const p = game.player;
    const speed = def.speed * speedMult;

    // It knows where you are while it can see you (or while you're Hunted); otherwise it's searching where it last saw
    // or heard you, and gives up after a while with no sign of you (never, if it's a boss).
    const knows = this.canSee || game.hunted;
    if (this.state === 'hunt' && knows) this.lostT = 0;
    if (this.state === 'hunt' && !knows) {
      this.lostT += dt;
      if ((this.lostT > 12 && !this.boss) || p.status.invisible > 0) {
        this.state = 'wander';
        this.wander = null;
      }
    }
    if (this.status.feared > 0) {
      const wp = level.step(level.flowFor(this.flies), this.x, this.z, true, this.flies);
      return !!wp && this.moveTo(wp.x, wp.z, speed, dt, level, game);
    }
    if (this.state === 'sleep') return false;
    if (this.state === 'wander') return this.doWander(dt, level, game, speed * 0.55);

    const inReach = this.canSee && dist <= def.reach + PLAYER_RADIUS;
    if (def.ranged) {
      const r = def.ranged;
      this.decideT -= dt;
      if (this.cooldown <= 0 && this.canSee && dist <= r.maxRange && this.decideT <= 0) {
        this.decideT = 0.4;
        const prefersMelee = r.keepAway === 0 && inReach;
        if (!prefersMelee && rand.chance(r.chance ?? 1)) {
          this.startAttack(true);
          return false;
        }
      }
      if (r.keepAway > 0 && this.canSee) {
        if (dist < r.keepAway) {
          const wp = level.step(level.flowFor(this.flies), this.x, this.z, true, this.flies);
          if (wp) {
            const moved = this.moveTo(wp.x, wp.z, speed * 0.8, dt, level, game, false);
            this.face(dx, dz, dt);
            return moved;
          }
        } else if (dist < r.maxRange * 0.8) {
          this.face(dx, dz, dt);
          return false;
        }
      }
    }

    if (inReach) {
      this.face(dx, dz, dt);
      if (this.cooldown <= 0) this.startAttack(false);
      return false;
    }
    // Straight at you if it can see you and nothing's in the way (you might be across water); else by the path.
    if (this.canSee && level.clearPath(this.x, this.z, p.x, p.z, this.flies)) return this.moveTo(p.x, p.z, speed, dt, level, game);
    if (knows) {
      const wp = level.step(level.flowFor(this.flies), this.x, this.z, false, this.flies);
      return !!wp && this.moveTo(wp.x, wp.z, speed, dt, level, game);
    }
    return this.search(dt, level, game, speed);
  }

  /** Makes for where it last saw or heard you, and looks about when it gets there. */
  search(dt, level, game, speed) {
    const at = this.searchAt;
    if (!at) return false;
    if (level.toTile(this.x) === at.tx && level.toTile(this.z) === at.ty) {
      this.yaw += dt * 1.4;
      return false;
    }
    this.searchField ??= level.fieldTo(at.tx, at.ty, this.flies);
    const wp = level.step(this.searchField, this.x, this.z, false, this.flies);
    return !!wp && this.moveTo(wp.x, wp.z, speed, dt, level, game);
  }

  doWander(dt, level, game, speed) {
    if (this.idleT > 0) {
      this.idleT -= dt;
      return false;
    }
    if (!this.wander || (this.wander.t -= dt) <= 0) {
      const room = rand.pick(level.wanderRooms);
      const tx = rand.int(room.x, room.x + room.w - 1), ty = rand.int(room.y, room.y + room.h - 1);
      if (!level.isFloorTile(tx, ty)) return false;
      this.wander = { tx, ty, field: level.fieldTo(tx, ty, this.flies), t: 25 };
    }
    if (level.toTile(this.x) === this.wander.tx && level.toTile(this.z) === this.wander.ty) {
      this.wander = null;
      this.idleT = rand.range(1.5, 5);
      return false;
    }
    const wp = level.step(this.wander.field, this.x, this.z, false, this.flies);
    if (!wp) {
      this.wander = null;
      return false;
    }
    return this.moveTo(wp.x, wp.z, speed, dt, level, game);
  }

  /** Steps toward (tx, tz). Returns false if the way is barred: the shop door, to all but its pursuers. */
  moveTo(tx, tz, speed, dt, level, game, turn = true) {
    let dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.02) return true;
    const fromX = this.x, fromZ = this.z;
    dx /= d;
    dz /= d;
    // Monsters open unlocked doors in their way; locked ones are already walls to their pathfinding.
    const door = level.doorAhead(this.x, this.z, dx, dz, this.radius);
    if (door) level.openDoor(door);
    let jitter = 0;
    if (this.def.erratic) jitter += Math.sin(this.t * 3.1) * 0.9;
    if (this.status.confused > 0) jitter += Math.sin(this.t * 2.3) * 2.4;
    if (jitter) {
      const c = Math.cos(jitter), s = Math.sin(jitter);
      [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
    }
    const step = jitter ? speed * dt : Math.min(d, speed * dt);
    this.x += dx * step;
    this.z += dz * step;
    level.collide(this, this.radius, this.flies);
    const p = game.player;
    const px = this.x - p.x, pz = this.z - p.z, pd = Math.hypot(px, pz), min = this.radius + PLAYER_RADIUS;
    if (pd < min && pd > 1e-5) {
      this.x = p.x + (px / pd) * min;
      this.z = p.z + (pz / pd) * min;
    }
    if (turn) this.face(dx, dz, dt);
    if (level.inShop(this.x, this.z) && !level.inShop(fromX, fromZ) && !level.shopPursuers.has(this)) {
      this.x = fromX;
      this.z = fromZ;
      return false;
    }
    return true;
  }

  face(dx, dz, dt, rate = 8) {
    const target = Math.atan2(dx, dz);
    this.yaw += wrapAngle(target - this.yaw) * Math.min(1, dt * rate);
  }

  startAttack(ranged) {
    this.attack.phase = 'windup';
    this.attack.t = 0;
    this.attack.ranged = ranged;
  }

  updateAttack(dt, game, level, dist, dx, dz) {
    const a = this.attack;
    a.t += dt;
    // Monsters track you slowly while winding up — circle-strafe to make them whiff.
    const target = Math.atan2(dx, dz);
    const maxTurn = 2.6 * dt;
    this.yaw += Math.max(-maxTurn, Math.min(maxTurn, wrapAngle(target - this.yaw)));
    if (a.phase === 'windup' && a.t >= this.def.windup) {
      a.phase = 'strike';
      a.t = 0;
      if (a.ranged) this.fire(game, level);
      else this.melee(game, level, dist, dx, dz);
    } else if (a.phase === 'strike' && a.t >= STRIKE_TIME) {
      a.phase = 'none';
      this.cooldown = this.def.cooldown * rand.range(0.8, 1.2);
    }
  }

  /** A roll of its damage: less while it's weakened (see status.js). `scale` for shots, which hit softer. */
  rollDamage(scale = 1) {
    return Math.round(rand.int(this.def.dmg[0], this.def.dmg[1]) * this.dmgMult * scale * (this.status.weakened > 0 ? 0.75 : 1));
  }

  melee(game, level, dist, dx, dz) {
    const p = game.player;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // Confused, it lays about at whatever's nearest: half the time, another monster in reach.
    if (this.status.confused > 0 && rand.chance(0.5)) {
      const other = level.monsters.find((m) => m !== this && !m.dead &&
        Math.hypot(m.x - this.x, m.z - this.z) <= this.def.reach + m.radius + 0.25 &&
        ((m.x - this.x) * fx + (m.z - this.z) * fz) > 0);
      if (other) {
        other.takeDamage(game, this.rollDamage(), { type: damageType(this.def), attacker: this });
        return;
      }
    }
    const facing = (dx * fx + dz * fz) / (dist || 1);
    if (dist <= this.def.reach + PLAYER_RADIUS + 0.25 && facing > 0.35 && p.status.invisible <= 0 &&
        level.los(this.x, this.z, p.x, p.z)) {
      if (rand.chance(Math.max(0.3, 0.9 - p.evasion()))) {
        game.hurtPlayer(this.rollDamage(), { source: this.name, monster: this, type: damageType(this.def) });
        if (this.def.poisonHit && rand.chance(this.def.poisonHit)) p.addStatus('poisoned', 6, game);
      } else {
        game.popup({ x: p.x - Math.sin(p.yaw) * 0.8, y: EYE_H, z: p.z - Math.cos(p.yaw) * 0.8 }, 'dodge', 'miss');
        game.audio.whiff();
      }
    } else {
      game.audio.whiff();
    }
  }

  fire(game, level) {
    const r = this.def.ranged;
    const p = game.player;
    const ox = this.x + Math.sin(this.yaw) * 0.4, oy = this.baseY + this.height * 0.75, oz = this.z + Math.cos(this.yaw) * 0.4;
    const tx = p.x - ox, ty = EYE_H - 0.35 - oy, tz = p.z - oz;
    const len = Math.hypot(tx, ty, tz) || 1;
    const n = r.volley || 1;
    // Confused, its aim goes astray.
    const wild = this.status.confused > 0 ? rand.range(-0.7, 0.7) : 0;
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * 0.2 + wild;
      const c = Math.cos(spread), s = Math.sin(spread);
      const vx = (tx * c - tz * s) / len, vz = (tx * s + tz * c) / len;
      spawnProjectile(level, {
        x: ox, y: oy, z: oz, vx: vx * r.speed, vy: (ty / len) * r.speed, vz: vz * r.speed,
        owner: 'monster', kind: r.kind, color: r.color, size: r.size, source: this.name,
        dmg: this.rollDamage(0.85),
        type: r.dmgType && damageType(r),
      });
    }
    game.audio.shoot(r.kind);
  }

  /**
   * Hurts it by `amount`, less or more if it resists or is weak to the damage's type (`opts.type`, see damage.js), or
   * as its statuses make it (see damageTakenMult in status.js). A hit may thaw it, set it alight (`ignite` seconds)
   * or chill it (`chill` seconds): see hitStatuses. Returns the damage it took.
   * opts: { type, dot, sneak, ignite, chill, knockback: {x, z}, attacker (a monster that struck it, not you) }.
   */
  takeDamage(game, amount, opts = {}) {
    if (this.dead) return 0;
    const own = damageMult(this.def, opts.type);
    // (A frozen monster's resistances don't show: they're stripped.)
    if (own !== 1 && !(own < 1 && this.status.frozen > 0)) this.revealResist(game, opts.type, own);
    const mult = damageTakenMult(this, opts.type, own);
    if (mult === 0) {
      if (!opts.dot) game.popup(this.headPos(), 'IMMUNE', 'immune');
      if (isPhysical(opts.type)) game.audio.block();
      if (!opts.attacker) this.notice(game, false);
      return 0;
    }
    if (mult !== 1) amount = Math.max(1, Math.round(amount * mult));
    this.hp -= amount;
    this.hurtT = 0.18;
    // Magic and the elements tint the number their colour. A weakness or resistance is marked on hits, but not on
    // every tick of burning or poison (the hit that set it going said so).
    const el = opts.type && !isPhysical(opts.type) ? ` el-${opts.type}` : '';
    const cls = (opts.dot ? 'dot' : opts.sneak ? 'crit' : 'dmg') + el;
    if (mult > 1 && !opts.dot) game.popup(this.headPos(), String(amount), `${cls} weak`, 'WEAK!');
    else if (mult < 1 && !opts.dot) game.popup(this.headPos(), String(amount), `${cls} resist`, 'RESISTED');
    else game.popup(this.headPos(), String(amount), cls);
    if (!opts.dot) burst(game.level, this.x, this.baseY + this.height * 0.6, this.z, BLOOD[this.type], 8, 2.5, 0.6);
    if (opts.knockback && !this.boss && this.type !== 'golem' && this.type !== 'troll') {
      this.x += opts.knockback.x * 0.35;
      this.z += opts.knockback.z * 0.35;
      game.level.collide(this, this.radius, this.flies);
    }
    if (!opts.dot && this.hp > 0) hitStatuses(game, this, opts.type, opts);
    if (!opts.attacker) {
      this.notice(game, false); // no-op if it already knows where you are
      if (game.level.playerInShop) game.level.shopPursuers.add(this); // provoked from the shop: it may come in
    }
    // Heavy blows stagger a monster out of its windup.
    if (this.attack.phase === 'windup' && !this.boss && amount >= this.maxHp * 0.3) {
      this.attack.phase = 'none';
      this.cooldown = 0.5;
    }
    if (this.hp <= 0) this.die(game);
    return amount;
  }

  /** The first time in a run you see its kind resist a damage type (or be weak to it), the log says so. */
  revealResist(game, type, mult) {
    if (!game.knowledge.learnResist(this.type, type)) return;
    const noun = DAMAGE_TYPES[type].noun;
    if (mult === 0) game.log(`${noun[0].toUpperCase()}${noun.slice(1)} can't harm the ${this.name}!`, 'warn');
    else if (mult < 1) game.log(`The ${this.name} resists ${noun}.`, 'warn');
    else game.log(`The ${this.name} is weak to ${noun}!`, 'good');
  }

  die(game) {
    this.dead = true;
    this.deathT = 0;
    this.attack.phase = 'none';
    burst(game.level, this.x, this.baseY + this.height * 0.5, this.z, BLOOD[this.type], 16, 3.5, 0.9);
    game.onMonsterKilled(this);
  }

  updateTint(dt) {
    this.hurtT = Math.max(0, this.hurtT - dt);
    let key = 'none', color;
    if (this.hurtT > 0) { key = 'hurt'; color = 0xa01010; }
    else for (const [k, def] of TINTS) if (this.status[k] > 0) { key = k; color = def.tint; break; }
    if (key === this.tintKey) return;
    this.tintKey = key;
    for (const m of this.model.materials) m.emissive.setHex(key === 'none' ? m.userData.baseEmissive : color);
  }
}
