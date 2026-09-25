import { MONSTERS } from './defs.js';
import { buildMonsterModel } from './models.js';
import { rand } from '../rng.js';
import { PLAYER_RADIUS, EYE_H, TILE, danger } from '../config.js';
import { spawnProjectile } from '../fx/projectiles.js';
import { burst } from '../fx/particles.js';
import { DAMAGE_TYPES, STATUS_TYPES, damageType, damageMult, isPhysical } from '../damage.js';

const BLOOD = {
  rat: 0x901010, bat: 0x901010, slime: 0x40c040, goblin: 0x902010, archer: 0x902010, skeleton: 0xe0d8c0,
  orc: 0x801010, wraith: 0x6040a0, imp: 0xff6010, troll: 0x406020, golem: 0x909090, warden: 0xffc040,
};

const STRIKE_TIME = 0.3;
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
    this.status = { poison: 0, confused: 0, paralyzed: 0, slowed: 0, feared: 0, burning: 0, blind: 0 };
    this.dotAcc = 0;
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
      this.canSee = this.status.blind <= 0 && p.status.invisible <= 0 && dist < 18 &&
        level.los(this.x, this.z, p.x, p.z);
      this.perceive(game, level, dist);
    }

    const speedMult = this.status.slowed > 0 ? 0.45 : 1;
    let moving = false;
    if (this.status.paralyzed > 0) {
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
      t: this.status.paralyzed > 0 ? 0 : this.t,
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
    const s = this.status;
    for (const k in s) if (s[k] > 0) s[k] = Math.max(0, s[k] - dt);
    if (s.poison > 0 || s.burning > 0) {
      this.dotAcc += dt;
      if (this.dotAcc >= 1) {
        this.dotAcc -= 1;
        if (s.poison > 0) this.takeDamage(game, 1 + Math.floor(this.danger / 3), { dot: true, type: 'poison' });
        if (s.burning > 0 && !this.dead) this.takeDamage(game, rand.int(2, 4), { dot: true, type: 'fire' });
      }
    }
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
    } else if (this.state === 'hunt' && this.canSee && !this.seen) {
      this.notice(game);
    }
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

  /** Heard something: come and look, without knowing yet what it was. Still open to an unaware strike. */
  hear(game, level) {
    this.state = 'hunt';
    this.seen = false;
    this.lostT = 6; // searches for ~6s (hunters give up at 12) unless it lays eyes on you
    this.wander = null;
    if (level.isVisibleWorld(this.x, this.z)) game.popup(this.headPos(), '?', 'alert');
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

    if (this.state === 'hunt' && this.canSee) this.lostT = 0;
    if (this.state === 'hunt' && !this.canSee) {
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
    const wp = level.step(level.flowFor(this.flies), this.x, this.z, false, this.flies);
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

  melee(game, level, dist, dx, dz) {
    const p = game.player;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const facing = (dx * fx + dz * fz) / (dist || 1);
    if (dist <= this.def.reach + PLAYER_RADIUS + 0.25 && facing > 0.35 && p.status.invisible <= 0 &&
        level.los(this.x, this.z, p.x, p.z)) {
      if (rand.chance(Math.max(0.3, 0.9 - p.evasion()))) {
        const dmg = Math.round(rand.int(this.def.dmg[0], this.def.dmg[1]) * this.dmgMult);
        game.hurtPlayer(dmg, { source: this.name, monster: this, type: damageType(this.def) });
        if (this.def.poisonHit && rand.chance(this.def.poisonHit)) p.addStatus('poison', 6, game);
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
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * 0.2;
      const c = Math.cos(spread), s = Math.sin(spread);
      const vx = (tx * c - tz * s) / len, vz = (tx * s + tz * c) / len;
      spawnProjectile(level, {
        x: ox, y: oy, z: oz, vx: vx * r.speed, vy: (ty / len) * r.speed, vz: vz * r.speed,
        owner: 'monster', kind: r.kind, color: r.color, size: r.size, source: this.name,
        dmg: Math.round(rand.int(this.def.dmg[0], this.def.dmg[1]) * this.dmgMult * 0.85),
        type: r.dmgType && damageType(r),
      });
    }
    game.audio.shoot(r.kind);
  }

  /**
   * Hurts it by `amount`, less or more if it resists or is weak to the damage's type (`opts.type`, see
   * damage.js). Returns the damage it took. opts: { type, dot, sneak, knockback: {x, z} }.
   */
  takeDamage(game, amount, opts = {}) {
    if (this.dead) return 0;
    const mult = damageMult(this.def, opts.type);
    if (mult !== 1) this.revealResist(game, opts.type, mult);
    if (mult === 0) {
      if (!opts.dot) game.popup(this.headPos(), 'IMMUNE', 'immune');
      if (isPhysical(opts.type)) game.audio.block();
      this.notice(game, false);
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
    this.notice(game, false); // no-op if it already knows where you are
    if (game.level.playerInShop) game.level.shopPursuers.add(this); // provoked from the shop: it may come in
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

  /**
   * Sets a status on it for `secs` (at least), unless it's immune to the damage that status does (see STATUS_TYPES
   * in damage.js): nothing burns a fire imp. `show` pops up "IMMUNE" when it is (leave it off when a hit of that
   * type has just said so). Returns whether it took.
   */
  afflict(game, key, secs, show = true) {
    const type = STATUS_TYPES[key];
    if (type && damageMult(this.def, type) === 0) {
      if (show && !this.dead) {
        game.popup(this.headPos(), 'IMMUNE', 'immune');
        this.revealResist(game, type, 0);
      }
      return false;
    }
    this.status[key] = Math.max(this.status[key], secs);
    return true;
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
    const s = this.status;
    let key, color;
    if (this.hurtT > 0) { key = 'hurt'; color = 0xa01010; }
    else if (s.burning > 0) { key = 'burn'; color = 0x802000; }
    else if (s.paralyzed > 0) { key = 'para'; color = 0x103060; }
    else if (s.poison > 0) { key = 'poison'; color = 0x105010; }
    else if (s.slowed > 0) { key = 'slow'; color = 0x202040; }
    else key = 'none';
    if (key === this.tintKey) return;
    this.tintKey = key;
    for (const m of this.model.materials) m.emissive.setHex(key === 'none' ? m.userData.baseEmissive : color);
  }
}
