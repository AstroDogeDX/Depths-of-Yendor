import * as THREE from 'three';
import { TILE, PLAYER_RADIUS, POOL } from '../config.js';
import { rand } from '../rng.js';
import { spawnProjectile } from '../fx/projectiles.js';
import { burst, ring } from '../fx/particles.js';
import { glowSprite } from '../fx/glow.js';
import { cure } from '../status.js';
import { damageType } from '../damage.js';

// Bosses with ways of fighting of their own: a monster def's `ai` (see defs.js) names one here. Each is
//   think(m, dt, game, level, dist, dx, dz, speed)  what it does while it isn't attacking or asleep (in place of
//                                                   Monster.think's hunting and wandering): returns whether it moved
//   strike(m, move, game, level, target)            one of its `moves` landing, its windup done (see Monster.startAttack)
//   update(m, dt, game, level)                      every frame it's alive: its own cooldowns, and what shows of them
//   enrage(m, game, { quiet })                      down to its `enrage` share of its health (or brought back so from a
//                                                   save, `quiet`)
//   wake(m, game)                                   it has seen you, and hunts you (see Monster.notice)
//   die(m, game, level)                             as it dies
//   dying(m, level)                                 its death playing out, each frame (m.deathT), in place of the fall
// What its model does meanwhile is in models.js, from the move it's winding up and striking with (`move`).

// --- The Maledicted Ooze (MONSTERS.maledicted_ooze): the Sewers' boss, in its lair, the arena on their last floor ---

const GEL = 0x5a1a78; // the colour of its gel, flying
const TAINT = 0xe040c0; // its taint's glow: its globs, the ring of its blast
const ICE = 0xd8f2ff;
const ENRAGED_GLOW = 0x2c0626; // the faint glow its gel takes on once its taint boils (see enrage)
const GLOB = { gravity: 6, apex: 0.9, size: 0.2 }; // its globs are lobbed, at most `apex` metres over the straight line
const GLOB_GEO = new THREE.IcosahedronGeometry(1, 0);
const GLOB_MAT = new THREE.MeshBasicMaterial({ color: 0x3c0c52 });
const RING_GEO = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
const DEATH = { flat: 0.9, gone: 1.2 }; // seconds until it's a puddle, and until it's gone (Level.update takes it away)

/** The room it may not leave, if it has one: { x, y, w, h } in tiles (see dungeon/arenas.js). */
const lairOf = (level) => level.data.lair ?? null;

/** Whether (x, z) is in its lair, at least `margin` metres in from the walls. */
const inLair = (lair, x, z, margin = 0) => x >= lair.x * TILE + margin && x <= (lair.x + lair.w) * TILE - margin &&
  z >= lair.y * TILE + margin && z <= (lair.y + lair.h) * TILE - margin;

/** Its lair's middle, in metres. */
const middle = (lair) => ({ x: (lair.x + lair.w / 2) * TILE, z: (lair.y + lair.h / 2) * TILE });

/** Makes for (x, z): straight there if nothing's in the way, else along `field` (a distance field to it: see Level). */
function makeFor(m, x, z, field, speed, dt, game, level) {
  if (level.clearPath(m.x, m.z, x, z, m.flies)) return m.moveTo(x, z, speed, dt, level, game);
  const wp = field && level.step(field, m.x, m.z, false, m.flies);
  return !!wp && m.moveTo(wp.x, wp.z, speed, dt, level, game);
}

/** Back to the middle of its lair, to wait there, turning slowly to look about it. */
function goHome(m, dt, game, level, speed) {
  const lair = lairOf(level);
  if (!lair) return false;
  const home = middle(lair);
  if (Math.hypot(home.x - m.x, home.z - m.z) < 0.6) {
    m.yaw += dt * 0.3;
    return false;
  }
  m.homeField ??= level.fieldTo(level.toTile(home.x), level.toTile(home.z), m.flies);
  return makeFor(m, home.x, home.z, m.homeField, speed, dt, game, level);
}

/** A glob of its taint, lobbed at `target` (you, or an ally of yours) from `m`'s maw, `turn` radians off true. */
function spit(m, game, level, target, turn) {
  const mv = m.def.moves.spit, p = game.player;
  const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
  const ox = m.x + fx * m.radius * 0.85, oy = m.baseY + m.height * 0.62, oz = m.z + fz * m.radius * 0.85;
  const aimY = target === p ? p.eyeHeight() - 0.4 : target.baseY + target.height * 0.5;
  let dx = target.x - ox, dz = target.z - oz;
  const flat = Math.max(0.5, Math.hypot(dx, dz));
  // Its flight: as fast as its `speed`, but quicker over a long way, so its arc stays under the vault.
  const time = Math.min(flat / mv.speed, Math.sqrt((8 * GLOB.apex) / GLOB.gravity));
  const c = Math.cos(turn), s = Math.sin(turn);
  [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
  const mesh = new THREE.Mesh(GLOB_GEO, GLOB_MAT);
  mesh.scale.setScalar(GLOB.size * 0.85);
  const halo = glowSprite(TAINT, 3.4, 0.75, false);
  mesh.add(halo);
  spawnProjectile(level, {
    x: ox, y: oy, z: oz, vx: dx / time, vy: (aimY - oy + 0.5 * GLOB.gravity * time * time) / time, vz: dz / time,
    gravity: GLOB.gravity, life: 4, owner: m.isAlly() ? 'ally' : 'monster', attacker: m, kind: 'glob', color: GEL,
    size: GLOB.size, mesh, trail: GEL, source: m.name, dmg: m.rollDamage(1, mv.dmg), type: damageType(mv),
    onImpact: splat,
  });
}

/**
 * A glob coming down: it bursts, and what it strikes (`target`: you, a monster, or nothing) takes its damage, and a
 * malediction if it got through (see status.js).
 */
function splat(game, pr, target) {
  const level = game.level, p = game.player;
  burst(level, pr.x, pr.y, pr.z, GEL, 12, 2.6, 0.55);
  burst(level, pr.x, pr.y, pr.z, TAINT, 4, 1.8, 0.35);
  const d = Math.hypot(pr.x - p.x, pr.z - p.z);
  if (d < 16) game.audio.splat(1 - d / 16);
  if (target === 'player') {
    // (From the way it came, for a shield: see shield.js.)
    const dealt = game.hurtPlayer(pr.dmg, { source: pr.source, type: pr.type, ranged: true, from: { x: pr.x - pr.vx, z: pr.z - pr.vz } });
    const had = p.status.malediction > 0;
    if (dealt > 0 && !game.over && p.addStatus('malediction', 1, game) && !had) game.audio.maledict();
  } else if (target) {
    const dealt = target.takeDamage(game, pr.dmg, { type: pr.type, attacker: pr.owner === 'player' ? undefined : pr.attacker });
    if (dealt > 0 && !target.dead) target.afflict(game, 'malediction', 1, false);
  } else if (level.inPool(pr.x, pr.z)) {
    level.ripples?.spawn(pr.x, -POOL.surface, pr.z, 0.9, 0.6);
  }
}

/**
 * Its blast: everything about it within its `radius` that it can see (a pillar shelters you) takes its damage and is
 * thrown back, you by your shove (see Player.shove), your allies by a blow's knockback.
 */
function slam(m, game, level) {
  const mv = m.def.moves.slam, p = game.player;
  ring(level, m.x, m.z, TAINT, mv.radius, 0.45);
  ring(level, m.x, m.z, GEL, mv.radius * 0.7, 0.6);
  burst(level, m.x, m.baseY + 0.3, m.z, GEL, 30, 5.5, 0.8);
  burst(level, m.x, m.baseY + 0.3, m.z, TAINT, 10, 4, 0.5);
  const d = Math.hypot(p.x - m.x, p.z - m.z);
  game.audio.slam(Math.max(0.2, 1 - d / 24));
  game.shake(Math.max(0.05, 0.4 * (1 - d / 14)));
  // The pools shiver with it.
  for (const pool of level.data.pools ?? []) for (const t of pool.tiles) {
    const x = level.center(t.x), z = level.center(t.y);
    if (Math.hypot(x - m.x, z - m.z) < mv.radius + 6 && rand.chance(0.5)) level.ripples?.spawn(x, -POOL.surface, z, 0.8, 0.5);
  }
  const caught = (o, r) => Math.hypot(o.x - m.x, o.z - m.z) - r < mv.radius && level.los(m.x, m.z, o.x, o.z);
  if (caught(p, PLAYER_RADIUS)) {
    game.hurtPlayer(m.rollDamage(1, mv.dmg), { source: m.name, monster: m, type: damageType(m.def), from: m });
    const away = Math.max(0.01, d);
    if (!game.over) p.shove(((p.x - m.x) / away) * mv.push, ((p.z - m.z) / away) * mv.push);
  }
  for (const o of level.monsters) {
    if (o === m || o.dead || !o.isAlly() || !caught(o, o.radius)) continue;
    const away = Math.max(0.01, Math.hypot(o.x - m.x, o.z - m.z));
    o.takeDamage(game, m.rollDamage(1, mv.dmg), { type: damageType(m.def), attacker: m, knockback: { x: ((o.x - m.x) / away) * 6, z: ((o.z - m.z) / away) * 6 } });
  }
}

/**
 * The ring that warns of its blast: on the floor round it as far as the blast will reach, fading in as it swells
 * (`k`, 0..1, how far it is through its windup) and pulsing faster as it nears, gone when it isn't (k < 0).
 */
function warn(m, level, k) {
  if (k < 0) {
    if (m.warning) m.warning.visible = false;
    return;
  }
  if (!m.warning) {
    m.warning = new THREE.Group();
    const edge = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: TAINT, transparent: true, depthWrite: false, fog: false }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      color: TAINT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    m.warning.add(edge, fill);
    m.warning.userData = { edge, fill };
    level.group.add(m.warning);
  }
  const { edge, fill } = m.warning.userData, r = m.def.moves.slam.radius;
  m.warning.visible = true;
  m.warning.position.set(m.x, 0.04, m.z);
  m.warning.scale.set(r, 1, r);
  const pulse = 0.5 + 0.5 * Math.sin(m.t * (8 + 18 * k));
  edge.material.opacity = Math.min(1, k * 2.5) * (0.55 + 0.35 * pulse);
  fill.material.opacity = 0.05 + 0.13 * k * pulse;
  fill.scale.setScalar(Math.max(0.05, k));
}

const ooze = {
  think(m, dt, game, level, dist, dx, dz, speed) {
    const p = game.player, mv = m.def.moves, lair = lairOf(level);
    if (m.state !== 'hunt') return lair ? goHome(m, dt, game, level, speed * 0.6) : m.doWander(dt, level, game, speed * 0.55);
    const youIn = !lair || inLair(lair, p.x, p.z);
    const inReach = m.canSee && dist <= m.def.reach + PLAYER_RADIUS;
    if (m.canSee && m.cooldown <= 0) {
      // Its moves: a blast if you're close (but rather its blow, now and then, if you're right in front of it), its blow
      // if you're in reach, and a glob if you're further off.
      if (m.slamT <= 0 && dist < mv.slam.radius * 0.8 && !(inReach && rand.chance(0.3))) {
        m.slamT = rand.range(...mv.slam.every);
        m.startAttack(false, p, 'slam');
        game.audio.swell(1, m.windupOf('slam') * (m.status.chilled > 0 ? 2 : 1));
        return false;
      }
      if (inReach) {
        m.face(dx, dz, dt);
        m.startAttack(false, p);
        return false;
      }
      if (m.spitT <= 0 && dist > m.def.reach + 1 && dist < mv.spit.range) {
        m.spitT = rand.range(...mv.spit.every);
        m.startAttack(true, p, 'spit');
        return false;
      }
    }
    if (inReach) {
      m.face(dx, dz, dt);
      return false;
    }
    // Too big for any doorway, it never leaves its lair: it won't follow you out of it, but watches you, and goes
    // back to its middle once it can't see you.
    if (!youIn) {
      if (!m.canSee) return goHome(m, dt, game, level, speed * 0.6);
      m.face(dx, dz, dt, 3);
      return false;
    }
    if (m.canSee || game.hunted) return makeFor(m, p.x, p.z, level.flowFor(m.flies), speed, dt, game, level);
    // Lost sight of you, it makes for where it last saw or heard you, and having looked there (or with nowhere to look),
    // goes back to the middle of its lair, where it can see most of it.
    const at = m.searchAt;
    if (at && (level.toTile(m.x) !== at.tx || level.toTile(m.z) !== at.ty)) return m.search(dt, level, game, speed);
    m.searchAt = null;
    return lair ? goHome(m, dt, game, level, speed * 0.8) : m.search(dt, level, game, speed);
  },

  wake(m, game) {
    game.audio.roar();
    game.shake(0.15);
  },

  strike(m, move, game, level, target) {
    if (move === 'slam') {
      slam(m, game, level);
      return;
    }
    const n = m.enraged ? m.def.enrage.volley : 1, spread = m.def.enrage.spread;
    const wild = m.status.confused > 0 ? rand.range(-0.6, 0.6) : 0; // (confused, its aim goes astray)
    for (let i = 0; i < n; i++) spit(m, game, level, target, (i - (n - 1) / 2) * spread + wild);
    const d = Math.hypot(game.player.x - m.x, game.player.z - m.z);
    if (d < 22) game.audio.spit(1 - d / 22);
  },

  update(m, dt, game, level) {
    m.spitT = (m.spitT ?? rand.range(1, 2)) - dt;
    m.slamT = (m.slamT ?? rand.range(2, 4)) - dt;
    // It never leaves its lair (see think): whatever moves it, it stays clear of the doorways.
    const lair = lairOf(level);
    if (lair && !inLair(lair, m.x, m.z, m.radius)) {
      m.x = Math.min(Math.max(m.x, lair.x * TILE + m.radius), (lair.x + lair.w) * TILE - m.radius);
      m.z = Math.min(Math.max(m.z, lair.y * TILE + m.radius), (lair.y + lair.h) * TILE - m.radius);
    }
    // Waking, it heaves itself up out of its filth (see its model's `reveal`).
    if (m.wasAsleep && m.state !== 'sleep') m.revealT = 0;
    m.wasAsleep = m.state === 'sleep';
    if (!m.enraged && m.hp < m.maxHp * m.def.enrage.at) this.enrage(m, game);
    const a = m.attack;
    warn(m, level, a.phase === 'windup' && a.move === 'slam' ? Math.min(1, a.t / m.windupOf('slam')) : -1);
  },

  /**
   * Down to half its health, its taint boils up: no cold will freeze it now, only chill it (see Frozen in status.js),
   * and ice on it bursts off; its gel glows faintly, and it spits three globs at a time (see strike).
   */
  enrage(m, game, { quiet = false } = {}) {
    m.enraged = true;
    m.noFreeze = true;
    for (const mat of m.model.materials) mat.userData.baseEmissive = ENRAGED_GLOW;
    m.tintKey = null; // (see updateTint)
    if (quiet) return;
    const level = game.level;
    if (m.status.frozen > 0) {
      cure(game, m, 'frozen');
      burst(level, m.x, m.baseY + m.height * 0.6, m.z, ICE, 24, 4.5, 0.7);
      game.audio.shatter();
    }
    burst(level, m.x, m.baseY + m.height * 0.7, m.z, TAINT, 18, 3.5, 0.8);
    m.revealT = 0.25; // (a heave, as it wakes)
    game.log(m.def.enrage.say, 'danger');
    game.audio.roar(0.85);
    game.shake(0.2);
  },

  die(m, game, level) {
    if (m.warning) {
      level.group.remove(m.warning);
      m.warning.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      m.warning = null;
    }
    burst(level, m.x, m.baseY + m.height * 0.5, m.z, GEL, 40, 6, 1.1);
    burst(level, m.x, m.baseY + m.height * 0.5, m.z, TAINT, 14, 4, 0.8);
    ring(level, m.x, m.z, GEL, 5, 0.8);
    game.audio.oozeDeath();
    game.shake(0.35);
  },

  /** It slumps into a puddle, and sinks away into the floor. */
  dying(m, level) {
    const k = Math.min(1, m.deathT / DEATH.flat);
    m.model.animate({ t: m.t, walk: 0, windup: -1, strike: -1, move: null, reveal: -1, asleep: false, dying: k });
    m.mesh.position.y = level.groundY(m.x, m.z) - Math.max(0, m.deathT - DEATH.flat) * 1.5;
  },
};

export const BOSS_AI = { ooze };
