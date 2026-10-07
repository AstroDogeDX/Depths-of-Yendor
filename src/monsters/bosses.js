import * as THREE from 'three';
import { TILE, PLAYER_RADIUS, POOL, WALL_H } from '../config.js';
import { rand } from '../rng.js';
import { spawnProjectile } from '../fx/projectiles.js';
import { burst, ring } from '../fx/particles.js';
import { glowSprite } from '../fx/glow.js';
import { cure } from '../status.js';
import { damageType } from '../damage.js';
import { raisedAgainst, strainGuard } from '../shield.js';
import { buildItemModel } from '../items/models.js';

// Bosses with ways of fighting of their own: a monster def's `ai` (see defs.js) names one here. Each is
//   think(m, dt, game, level, dist, dx, dz, speed)  what it does while it isn't attacking or asleep (in place of
//                                                   Monster.think's hunting and wandering): returns whether it moved
//   strike(m, move, game, level, target)            one of its `moves` landing, its windup done (see Monster.startAttack)
//   update(m, dt, game, level)                      every frame it's alive: its own cooldowns, and what shows of them
//   enrage(m, game, { quiet })                      down to its `enrage` share of its health (or brought back so from a
//                                                   save, `quiet`)
//   wake(m, game)                                   it has seen you for the first time, and hunts you (see
//                                                   Monster.notice)
//   die(m, game, level)                             as it dies
//   dying(m, level)                                 its death playing out, each frame (m.deathT), in place of the fall
//   pose(m)                                         more for its model to animate by (see Monster.update)
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

// --- The Forgotten Jailer (MONSTERS.jailer): the Catacombs' boss, in his cell block on their last floor ---

const LAMP = { color: 0xb8e060, light: 7 }; // his lantern's sickly light, which goes round the cells with him
const DUST = 0xb8b0a0;
const SMOKE = 0x17151d; // the darkness out of his flask, billowing up where it bursts
const LINK = { len: 0.13, geo: new THREE.BoxGeometry(0.03, 0.055, 0.13), mat: new THREE.MeshLambertMaterial({ color: 0x5a4c40 }) };
const MAX_LINKS = 110;
const CUFF_GEO = new THREE.TorusGeometry(0.075, 0.02, 4, 10);
const REEL = 30; // metres a second his chain comes back to him
const FLASK = { gravity: 9, apex: 1.1 }; // his flask is lobbed, at most `apex` metres over the straight line
const DARK = { kind: 'potion', type: 'blindness' }; // what's in it
const WATCHING = Math.cos(0.7); // hiding, how far to either side of his cell's gate he keeps his eye on it (see lurk)
const V = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), Q = new THREE.Vector3(), O = new THREE.Object3D();

/** Walks his rounds of the cell block when he doesn't know where you are: from cell to cell, stopping to listen. */
function patrol(m, dt, game, level, speed) {
  const lair = lairOf(level);
  if (!lair) return m.doWander(dt, level, game, speed);
  if (m.pauseT > 0) {
    m.pauseT -= dt;
    m.yaw += dt * 0.5;
    return false;
  }
  const r = m.round;
  if (!r || (level.toTile(m.x) === r.tx && level.toTile(m.z) === r.ty) || (r.t -= dt) <= 0) {
    if (r) m.pauseT = rand.range(1.2, 2.8);
    for (let k = 0; k < 20; k++) {
      const tx = rand.int(lair.x, lair.x + lair.w - 1), ty = rand.int(lair.y, lair.y + lair.h - 1);
      if (!level.isFloorTile(tx, ty) || Math.hypot(level.center(tx) - m.x, level.center(ty) - m.z) < 6) continue;
      m.round = { tx, ty, t: 20, field: level.fieldTo(tx, ty, m.flies) };
      break;
    }
    return false;
  }
  const wp = level.step(r.field, m.x, m.z, false, m.flies);
  return !!wp && m.moveTo(wp.x, wp.z, speed, dt, level, game);
}

/**
 * Whether he could charge straight from where he is to (x, z): nothing in the way of his bulk along the line, wall or
 * anything solid standing in the room, which would stop him short (he charges anyway, into a wall, if you dodge).
 */
function clearRun(m, level, x, z) {
  const dx = x - m.x, dz = z - m.z, d = Math.hypot(dx, dz);
  if (d < 0.01) return true;
  const nx = -dz / d, nz = dx / d, w = m.radius * 0.85;
  for (let s = 0.5; s < d; s += 0.5) {
    const px = m.x + (dx / d) * s, pz = m.z + (dz / d) * s;
    for (const k of [-w, 0, w]) if (level.isSolid(level.toTile(px + nx * k), level.toTile(pz + nz * k))) return false;
    if (level.obstacles.some((o) => (o.r === undefined ? Math.abs(px - o.x) < o.hw + w && Math.abs(pz - o.z) < o.hd + w
      : Math.hypot(px - o.x, pz - o.z) < o.r + w))) return false;
  }
  return true;
}

/** The hand he throws his chain and his flask from, in the world (its model's `chain_hand`), into `out`. */
function chainHand(m, out) {
  const bone = m.model.bones.chain_hand;
  if (!bone) return out.set(m.x, m.baseY + m.height * 0.55, m.z);
  m.mesh.updateMatrixWorld(true);
  return bone.getWorldPosition(out);
}

/** Lays his chain's links between his hand (`from`) and its end (`to`), sagging `sag` metres in the middle. */
function drawChain(c, from, to, sag) {
  const len = from.distanceTo(to), n = Math.min(MAX_LINKS, Math.max(1, Math.round(len / (LINK.len * 0.8))));
  const at = (t, out) => out.lerpVectors(from, to, t).setY(out.y - sag * 4 * t * (1 - t));
  for (let i = 0; i < n; i++) {
    at((i + 0.5) / n, Q);
    at(Math.min(1, (i + 1.5) / n), V);
    O.position.copy(Q);
    O.lookAt(V);
    O.rotateZ(i % 2 ? Math.PI / 2 : 0); // (each link turned a quarter from the last)
    O.updateMatrix();
    c.links.setMatrixAt(i, O.matrix);
  }
  c.links.count = n;
  c.links.instanceMatrix.needsUpdate = true;
  c.cuff.position.copy(to);
  c.cuff.lookAt(from);
}

/** Whirls his chain round over his head to throw it at you (see throwChain), once he's turned it `turns` times. */
function whirlChain(m, game, dist) {
  const mv = m.def.moves.chain;
  m.chainT = rand.range(...mv.every);
  m.startAttack(false, game.player, 'chain');
  game.audio.whirl(Math.max(0.3, 1 - dist / 24), m.windupOf('chain') * (m.status.chilled > 0 ? 2 : 1), mv.turns);
}

/** Flings his chain from his hand at `target` (you, or a monster of yours), as far as his chain's `range`. */
function throwChain(m, game, level, target) {
  const mv = m.def.moves.chain, p = game.player;
  chainHand(m, A);
  const aim = target === p ? B.set(p.x, p.eyeHeight() - 0.55, p.z) : B.set(target.x, target.baseY + target.height * 0.5, target.z);
  const dir = aim.clone().sub(A).normalize();
  const links = new THREE.InstancedMesh(LINK.geo, LINK.mat, MAX_LINKS), cuff = new THREE.Mesh(CUFF_GEO, LINK.mat), group = new THREE.Group();
  links.frustumCulled = false;
  group.add(links, cuff);
  level.group.add(group);
  // (It flies on its line from where it left his hand, whatever his arm does after.)
  m.chain = { phase: 'out', len: 0, from: A.clone(), dir, tip: A.clone(), target, hold: 0, group, links, cuff };
  const d = Math.hypot(p.x - m.x, p.z - m.z);
  if (d < 24) game.audio.chainOut(1 - d / 24);
}

/** Drops his chain's links from the floor (it's back in his hand, or he's gone). */
function dropChain(m) {
  if (!m.chain) return;
  m.chain.group.removeFromParent();
  m.chain.links.dispose();
  m.chain = null;
}

/**
 * His chain, each frame it's out: flying out along its line until it catches something, strikes a wall or runs out
 * ('out'); reeling in what it caught (`hold`); and coming back to his hand ('back'). What it catches: you, unless your
 * raised shield takes it (it wraps round it, and you wrench it free), reeled in to just short of his reach and
 * shackled; or a monster fighting for you, likewise.
 */
function reel(m, dt, game, level) {
  const c = m.chain, mv = m.def.moves.chain, p = game.player;
  chainHand(m, A);
  if (c.phase === 'out') {
    const step = mv.speed * dt, n = Math.max(1, Math.ceil(step / 0.15));
    for (let i = 0; i < n && c.phase === 'out'; i++) {
      c.len += step / n;
      c.tip.copy(c.from).addScaledVector(c.dir, c.len);
      const t = c.target, tx = level.toTile(c.tip.x), tz = level.toTile(c.tip.z);
      if (level.blocksSight(tx, tz) || c.tip.y < 0.05 || c.tip.y > WALL_H || c.len >= mv.range) {
        if (c.len < mv.range) {
          burst(level, c.tip.x, c.tip.y, c.tip.z, 0xd0c0a0, 5, 2, 0.3);
          const d = Math.hypot(c.tip.x - p.x, c.tip.z - p.z);
          if (d < 18) game.audio.clank(1 - d / 18);
        }
        c.phase = 'back';
        break;
      }
      const caught = t === p ? Math.hypot(p.x - c.tip.x, p.z - c.tip.z) < 0.32 + 0.14 && c.tip.y < p.eyeHeight() + 0.2
        : !t.dead && Math.hypot(t.x - c.tip.x, t.z - c.tip.z) < t.radius + 0.14;
      if (!caught) continue;
      if (t === p && raisedAgainst(p, m)) {
        // It wraps round your shield, and you wrench it free.
        strainGuard(game, p, 14);
        game.audio.clank(1);
        game.log('The chain wraps round your shield, and you wrench it free!', 'good');
        c.phase = 'back';
        break;
      }
      c.phase = 'hold';
      c.hold = 0.42; // (the shove's length: see Player.shove)
      const away = Math.max(0.01, Math.hypot(t.x - m.x, t.z - m.z)), keep = m.radius + (t === p ? 0.32 : t.radius) + 0.55;
      const pull = Math.max(0, away - keep), ux = (m.x - t.x) / away, uz = (m.z - t.z) / away;
      game.audio.yank();
      if (t === p) {
        // (Wrapped round you, it wrenches you however you're armoured: only a shield, above, keeps it off.)
        game.hurtPlayer(m.rollDamage(1, mv.dmg), { source: m.name, monster: m, type: 'bash', from: m, ignoreArmor: true });
        if (!game.over) p.shove(ux * pull, uz * pull);
        game.shake(0.25);
      } else {
        t.takeDamage(game, m.rollDamage(1, mv.dmg), { type: 'bash', attacker: m, knockback: { x: (ux * pull) / 0.35, z: (uz * pull) / 0.35 } });
      }
      m.cooldown = 0; // (and he'll swing as soon as you're in reach)
    }
  } else if (c.phase === 'hold') {
    const t = c.target;
    if (t === p) c.tip.set(p.x, p.eyeHeight() - 0.55, p.z);
    else c.tip.set(t.x, t.baseY + t.height * 0.4, t.z);
    if ((c.hold -= dt) <= 0) {
      if (t === p) p.addStatus('shackled', mv.shackle, game);
      else if (!t.dead) t.afflict(game, 'shackled', mv.shackle, false);
      c.phase = 'back';
    }
  } else {
    // Back to his hand, sagging as it comes slack.
    const left = c.tip.distanceTo(A) - REEL * dt;
    if (left <= 0.2) {
      dropChain(m);
      return;
    }
    c.tip.sub(A).setLength(left).add(A);
  }
  drawChain(c, A, c.tip, c.phase === 'back' ? Math.min(0.6, c.tip.distanceTo(A) * 0.08) : 0);
}

/**
 * Which way he can back off from you, to make room to throw his chain (see `space` in his def): straight away from you,
 * or as near it as the walls let him. Null if he's backed into a corner.
 */
function wayBack(m, level, p) {
  const d = Math.max(0.01, Math.hypot(m.x - p.x, m.z - p.z)), ax = (m.x - p.x) / d, az = (m.z - p.z) / d;
  for (const turn of [0, 0.6, -0.6, 1.2, -1.2]) {
    const c = Math.cos(turn), s = Math.sin(turn), dx = ax * c - az * s, dz = ax * s + az * c, r = m.radius + 1;
    if (!level.isSolid(level.toTile(m.x + dx * r), level.toTile(m.z + dz * r))) return { dx, dz };
  }
  return null;
}

/**
 * His charge (or his charge out of hiding: `c.mv`, its move), each frame of it: straight on along its line, fast,
 * until he runs out of it (and pulls up), runs into you (and you're thrown aside, hurt), a monster of yours, or a wall,
 * which stuns him a while. Out of hiding, once he's out through the gate (`c.gate`, the way he set off: `c.ox`, `c.oz`),
 * he wheels round, once, at where you'll be by the time he gets to you (see ambushAim), as far as he can (`turn`).
 */
function dash(m, dt, game, level) {
  const c = m.charging, mv = c.mv, p = game.player;
  const step = mv.speed * dt, n = Math.max(1, Math.ceil(step / 0.2));
  if (mv.turn && c.gate && !c.wheeled && (m.x - c.gate.x) * c.ox + (m.z - c.gate.z) * c.oz > TILE / 2 + m.radius) {
    c.wheeled = true;
    const aim = ambushAim(m, level, p); // (with no clear way at you, straight on)
    if (aim) {
      const have = Math.atan2(c.dx, c.dz), want = Math.atan2(aim.x - m.x, aim.z - m.z);
      const a = have + Math.max(-mv.turn, Math.min(mv.turn, Math.atan2(Math.sin(want - have), Math.cos(want - have))));
      c.dx = Math.sin(a);
      c.dz = Math.cos(a);
    }
  }
  m.walk += dt * mv.speed * 1.4; // (his legs pounding)
  m.yaw = Math.atan2(c.dx, c.dz);
  for (let i = 0; i < n; i++) {
    const s = step / n, x0 = m.x, z0 = m.z;
    m.x += c.dx * s;
    m.z += c.dz * s;
    c.left -= s;
    // A wall (or anything solid) stops him dead.
    if (level.collide(m, m.radius, m.flies) && Math.hypot(m.x - x0 - c.dx * s, m.z - z0 - c.dz * s) > s * 0.5) {
      m.charging = null;
      m.afflict(game, 'stunned', mv.stun * 2, false); // (a boss takes it for half as long)
      burst(level, m.x + c.dx * m.radius, 1.2, m.z + c.dz * m.radius, DUST, 22, 3.5, 0.8);
      const d = Math.hypot(p.x - m.x, p.z - m.z);
      game.audio.crash(Math.max(0.2, 1 - d / 22));
      game.shake(Math.max(0.05, 0.35 * (1 - d / 14)));
      const wall = level.isSolid(level.toTile(m.x + c.dx * (m.radius + 0.3)), level.toTile(m.z + c.dz * (m.radius + 0.3)));
      if (level.isVisibleWorld(m.x, m.z)) game.log(`The ${m.name} ${wall ? 'slams into the wall' : 'crashes into it headlong'}, and reels, stunned!`, 'good');
      return;
    }
    if (Math.hypot(p.x - m.x, p.z - m.z) < m.radius + 0.32 + 0.2) {
      m.charging = null;
      game.hurtPlayer(m.rollDamage(1, mv.dmg), { source: m.name, monster: m, type: 'bash', from: m });
      if (!game.over) p.shove(c.dx * mv.push, c.dz * mv.push);
      game.shake(0.4);
      m.cooldown = 0.8;
      return;
    }
    const ally = level.monsters.find((o) => o !== m && !o.dead && o.isAlly() && Math.hypot(o.x - m.x, o.z - m.z) < m.radius + o.radius + 0.1);
    if (ally) ally.takeDamage(game, m.rollDamage(1, mv.dmg), { type: 'bash', attacker: m, knockback: { x: c.dx * 8, z: c.dz * 8 } });
    if (c.left <= 0) {
      m.charging = null;
      m.cooldown = 0.5;
      return;
    }
  }
}

/** His lantern: its glow, and a light of the level's own going round the cells with him (see shareLights). */
function lantern(m, level) {
  const bone = m.model.bones.lamp;
  if (!bone) return;
  if (!m.lamp) {
    bone.add(glowSprite(LAMP.color, 0.8, 0.6));
    m.lamp = { pos: new THREE.Vector3(), fire: LAMP, moving: true };
    level.lightShare.sources.push(m.lamp);
  }
  bone.getWorldPosition(m.lamp.pos);
}

/** How fast you're going, and which way, as he makes it out (`m.youV`, smoothed): to lead you with a charge out of hiding. */
function watchYou(m, dt, p) {
  const v = (m.youV ??= { x: 0, z: 0, px: p.x, pz: p.z });
  if (dt > 0) {
    // (A jump, the stairs or a shove, is no pace to lead you by.)
    const vx = (p.x - v.px) / dt, vz = (p.z - v.pz) / dt, fast = Math.hypot(vx, vz) > 9, k = Math.min(1, dt * 8);
    v.x += ((fast ? 0 : vx) - v.x) * k;
    v.z += ((fast ? 0 : vz) - v.z) * k;
  }
  v.px = p.x;
  v.pz = p.z;
}

/**
 * Where to charge at you out of hiding: where you'll be by the time he gets to you, going as you are (`m.youV`), if
 * his way there's clear; failing that, as near it as is, toward where you are now; or null, if there's no clear way.
 */
function ambushAim(m, level, p) {
  const v = m.youV ?? { x: 0, z: 0 }, t = Math.hypot(p.x - m.x, p.z - m.z) / m.def.moves.ambush.speed;
  for (const k of [1, 0.6, 0.3, 0]) {
    const x = p.x + v.x * t * k, z = p.z + v.z * t * k;
    if (clearRun(m, level, x, z)) return { x, z };
  }
  return null;
}

/** Lobs a flask of darkness at `target` (you) from his free hand: it bursts where it comes down (see flaskBurst). */
function throwFlask(m, game, level, target) {
  const mv = m.def.moves.flask, p = game.player;
  chainHand(m, A);
  const aimY = target === p ? p.eyeHeight() - 0.5 : target.baseY + target.height * 0.5;
  const dx = target.x - A.x, dz = target.z - A.z, flat = Math.max(0.5, Math.hypot(dx, dz));
  // (As fast as its `speed`, but quicker over a long way, so its arc stays under the vault.)
  const time = Math.min(flat / mv.speed, Math.sqrt((8 * FLASK.apex) / FLASK.gravity));
  spawnProjectile(level, {
    x: A.x, y: A.y, z: A.z, vx: dx / time, vy: (aimY - A.y + 0.5 * FLASK.gravity * time * time) / time, vz: dz / time,
    gravity: FLASK.gravity, life: 4, owner: 'monster', attacker: m, kind: 'potion', size: 0.12, source: m.name,
    mesh: buildItemModel(DARK, game.knowledge.color(DARK)),
    onImpact: (g, pr) => flaskBurst(g, m, pr.x, pr.y, pr.z),
  });
  game.audio.swing();
}

/**
 * His flask bursting at (x, y, z): darkness billows up out of it, and blinds you if you're near enough (its `splash`),
 * for its `blind` seconds, and any monster of yours with you. You know a potion of darkness when you see one after.
 */
function flaskBurst(game, m, x, y, z) {
  const level = game.level, p = game.player, mv = m.def.moves.flask, k = game.knowledge;
  const color = k.appearance.potion.blindness.color;
  burst(level, x, Math.max(0.3, y), z, color, 14, 2.6, 0.6);
  burst(level, x, 1, z, SMOKE, 30, 1.6, 1.6);
  ring(level, x, z, color, mv.splash, 0.6);
  game.audio.shatter();
  for (const o of level.monsters) if (!o.dead && o.isAlly() && Math.hypot(o.x - x, o.z - z) < mv.splash + o.radius) o.afflict(game, 'blind', mv.blind);
  if (Math.hypot(p.x - x, p.z - z) < mv.splash && !game.over) {
    game.log(k.learn(DARK) ? `The flask bursts over you. It was a ${k.name(DARK)}!` : 'The flask bursts over you!', 'danger');
    p.addStatus('blind', mv.blind, game);
  } else if (level.isVisibleWorld(x, z)) game.log('The flask bursts, and darkness billows up out of it.', 'info');
}

/**
 * Hurt (down to a share of his health in his def's `hide`), he leaves off the fight a while: he throws a flask of
 * darkness at you, if he can see you (see throwFlask), and makes for a hiding place (`hides` in his lair: see
 * dungeon/arenas.js), to lie in wait there (see lurk): the furthest from you by the way there, of those you're not in
 * and he didn't hide in last. Both shares passed at once, by one great blow, he hides once, as for the second.
 */
function hide(m, game, level) {
  const h = m.def.hide, p = game.player, hides = lairOf(level)?.hides ?? [];
  m.hides = h.at.filter((a) => m.hp < m.maxHp * a).length;
  const flow = level.flowFor(m.flies), ptx = level.toTile(p.x), pty = level.toTile(p.z);
  // (Your cell: its three rows between the gate and the back wall, and the gate.)
  const yours = (s) => Math.abs(ptx - s.x) <= 1 && (pty - s.y) * (pty - s.gate.y) <= 0;
  const spot = hides.filter((s) => s !== m.lastHide && !yours(s) && flow?.[level.idx(s.x, s.y)] >= 0)
    .sort((a, b) => flow[level.idx(b.x, b.y)] - flow[level.idx(a.x, a.y)])[0];
  if (!spot) return;
  m.lastHide = spot;
  m.hiding = { spot, watch: h.watch[m.hides - 1], field: level.fieldTo(spot.x, spot.y, m.flies), t: 0 };
  m.attack.phase = 'none';
  m.backing = null;
  if (m.lurk) {
    // (Hurt as he lay in wait, by something burning him, say: he moves on to another hiding place.)
    m.lurk = null;
    m.state = 'hunt';
  }
  if (m.chain && m.chain.phase !== 'back') m.chain.phase = 'back';
  game.audio.bellow(Math.max(0.3, 1 - Math.hypot(p.x - m.x, p.z - m.z) / 24));
  if (m.canSee && !game.over) {
    game.log(h.say[m.hides - 1], 'danger');
    m.startAttack(false, p, 'flask');
  }
}

/**
 * Off to his hiding place as fast as he can go, paying you no mind; there, he turns to lie in wait (see lurk). If
 * you've come after him and you're on him, he turns on you instead; and if he can't get there, he gives it up.
 */
function flee(m, dt, game, level, speed) {
  const hd = m.hiding, s = hd.spot, x = level.center(s.x), z = level.center(s.y), p = game.player;
  if (Math.hypot(x - m.x, z - m.z) < 0.3) {
    m.hiding = null;
    if (m.canSee && Math.hypot(p.x - m.x, p.z - m.z) < 6) return false;
    m.lurk = { gate: { x: level.center(s.gate.x), z: level.center(s.gate.y) }, watch: hd.watch, t: 0, listenT: 0 };
    m.state = 'lurk';
    return false;
  }
  if ((hd.t += dt) > 15) {
    m.hiding = null;
    return false;
  }
  return makeFor(m, x, z, hd.field, speed * m.def.hide.speed, dt, game, level);
}

/** Whether you're out in front of his cell's gate, as he watches it from hiding: where he'd charge out at you. */
function beforeGate(m, p, gate) {
  const gx = gate.x - m.x, gz = gate.z - m.z, dx = p.x - m.x, dz = p.z - m.z;
  return dx * gx + dz * gz >= WATCHING * Math.hypot(dx, dz) * Math.hypot(gx, gz);
}

/**
 * Lying in wait, watching his cell's gate (`watch` 'gate'), or every way in ('all'): he goes for you when he sees you
 * there (see spring), and goes to look when he hears you (the first time only if you're running). The first time,
 * then, you can steal up on him through a hole in the wall and take him unawares (see combat.js). He tires of waiting
 * after his `hide`'s `wait`, and comes looking for you.
 */
function lurk(m, dt, game, level) {
  const L = m.lurk, p = game.player;
  m.face(L.gate.x - m.x, L.gate.z - m.z, dt, 3);
  if (m.canSee && (L.watch === 'all' || beforeGate(m, p, L.gate))) return spring(m, game, level);
  if ((L.listenT -= dt) <= 0) {
    L.listenT = 0.2; // (as often as he looks: see Monster.update)
    const heard = L.watch === 'all' || p.mode === 'sprint' ? m.hearing(p, level) : 0;
    if (heard > 0 && rand.chance(0.45 * heard * p.stealth())) {
      m.lurk = null;
      m.hear(game, level);
      return false;
    }
  }
  if ((L.t += dt) > m.def.hide.wait) {
    m.lurk = null;
    m.state = 'hunt';
    m.seen = false;
    m.searchAt = null;
  }
  return false;
}

/**
 * Seeing you from hiding, he comes for you: out through the gate at you, with a charge poised to go, if you're out in
 * front of it with a clear way to you; else he turns on you as he would anyway (see think), his chain to hand.
 */
function spring(m, game, level) {
  const p = game.player, gate = m.lurk.gate, d = Math.hypot(p.x - m.x, p.z - m.z);
  m.lurk = null;
  m.notice(game);
  if (d > 3 && d < m.def.moves.ambush.range - 1 && beforeGate(m, p, gate) && ambushAim(m, level, p)) {
    m.ambushGate = gate;
    m.startAttack(false, p, 'ambush');
    game.audio.bellow(Math.max(0.3, 1 - d / 24));
    if (level.isVisibleWorld(m.x, m.z)) game.log(`The ${m.name} bursts out of his cell at you!`, 'danger');
  } else {
    m.cooldown = 0;
    m.chainT = Math.min(m.chainT, 0);
  }
  return false;
}

const jailer = {
  think(m, dt, game, level, dist, dx, dz, speed) {
    const p = game.player, mv = m.def.moves, sp = speed * (m.enraged ? m.def.enrage.speed : 1);
    // His chain out, or charging, he does nothing else.
    if (m.chain || m.charging) {
      if (m.chain) m.face(dx, dz, dt, 4);
      return false;
    }
    if (m.hiding) return flee(m, dt, game, level, sp);
    if (m.lurk) return lurk(m, dt, game, level);
    if (m.state !== 'hunt') return patrol(m, dt, game, level, sp * 0.55);
    // Backing off to make room for his chain (see `space`): then he throws it, however near you've kept.
    if (m.backing) {
      const b = m.backing, way = wayBack(m, level, p);
      if (!way || (b.t -= dt) <= 0 || dist >= m.def.space.far || b.stuck > 0.3) {
        m.backing = null;
        if (m.canSee) whirlChain(m, game, dist);
        return false;
      }
      const x0 = m.x, z0 = m.z, go = sp * m.def.space.speed;
      m.moveTo(m.x + way.dx, m.z + way.dz, go, dt, level, game, false);
      m.face(dx, dz, dt);
      b.stuck = Math.hypot(m.x - x0, m.z - z0) < go * dt * 0.3 ? b.stuck + dt : 0;
      return true;
    }
    const inReach = m.canSee && dist <= m.def.reach + PLAYER_RADIUS;
    if (m.canSee && m.cooldown <= 0) {
      // Too close to throw his chain at you, he may back off to make room to (but not while it holds you).
      const space = m.def.space;
      if (dist < 3.2 && m.chainT <= 0 && !(p.status.shackled > 0) && m.spaceT <= 0) {
        m.spaceT = space.every;
        if (rand.chance(space.chance) && wayBack(m, level, p)) {
          m.backing = { t: space.secs, stuck: 0 };
          return false;
        }
      }
      // His mace in reach; further off, past half his health, a charge if his way's clear; or his chain.
      if (inReach) {
        m.face(dx, dz, dt);
        m.startAttack(false, p);
        return false;
      }
      if (m.enraged && m.chargeT <= 0 && dist > 4 && dist < mv.charge.range - 1 && clearRun(m, level, p.x, p.z)) {
        m.chargeT = rand.range(...mv.charge.every);
        m.startAttack(false, p, 'charge');
        game.audio.bellow(Math.max(0.3, 1 - dist / 24));
        return false;
      }
      if (m.chainT <= 0 && dist > 3 && dist < mv.chain.range) {
        whirlChain(m, game, dist);
        return false;
      }
    }
    if (inReach) {
      m.face(dx, dz, dt);
      return false;
    }
    if (m.canSee || game.hunted) return makeFor(m, p.x, p.z, level.flowFor(m.flies), sp, dt, game, level);
    // Lost sight of you, he makes for where he last saw or heard you, and having looked there, walks his rounds again,
    // listening for you.
    const at = m.searchAt;
    if (at && (level.toTile(m.x) !== at.tx || level.toTile(m.z) !== at.ty)) return m.search(dt, level, game, sp);
    m.searchAt = null;
    return patrol(m, dt, game, level, sp * 0.55);
  },

  wake(m, game) {
    game.audio.bellow(0.8);
    game.shake(0.12);
    m.chainT = 0.8; // (his chain's the first thing he reaches for)
  },

  strike(m, move, game, level, target) {
    if (move === 'chain') return throwChain(m, game, level, target);
    if (move === 'flask') return throwFlask(m, game, level, target);
    // A charge: straight at where you are now, or out of hiding, at where you'll be, if he's a clear way there through
    // his cell's gate, or else straight out of it (to wheel round at you once he's out: see dash).
    const mv = m.def.moves[move], gate = m.ambushGate;
    const aim = move !== 'ambush' ? target : ambushAim(m, level, target) ?? { x: 2 * gate.x - m.x, z: 2 * gate.z - m.z };
    const dx = aim.x - m.x, dz = aim.z - m.z, d = Math.max(0.01, Math.hypot(dx, dz));
    m.charging = { dx: dx / d, dz: dz / d, left: mv.range, mv, gate: move === 'ambush' ? gate : null, ox: dx / d, oz: dz / d };
    const pd = Math.hypot(game.player.x - m.x, game.player.z - m.z);
    game.audio.stomp(Math.max(0.2, 1 - pd / 22));
  },

  update(m, dt, game, level) {
    m.chainT = (m.chainT ?? rand.range(2, 4)) - dt;
    m.chargeT = (m.chargeT ?? rand.range(1, 2)) - dt;
    m.spaceT = (m.spaceT ?? 0) - dt;
    lantern(m, level);
    watchYou(m, dt, game.player);
    // Waking, he lifts his head (see his model's `reveal`).
    if (m.wasAsleep && m.state !== 'sleep') m.revealT = 0;
    m.wasAsleep = m.state === 'sleep';
    if (!m.enraged && m.hp < m.maxHp * m.def.enrage.at) this.enrage(m, game);
    // Hurt enough, he hides (see hide), once he's free to: not charging, nor held fast. Whatever brings him out of hiding
    // (a blow, a noise, a charm) ends it, and so does a save: he's hunting you again when it's taken up.
    const h = m.def.hide;
    m.hides ??= h.at.filter((a) => m.hp < m.maxHp * a).length;
    if (m.lurk && m.state !== 'lurk') m.lurk = null;
    else if (!m.lurk && m.state === 'lurk') {
      m.state = 'hunt';
      m.seen = false;
    }
    if (m.hides < h.at.length && m.hp < m.maxHp * h.at[m.hides] && !m.charging && !m.held() && !m.charmed()) hide(m, game, level);
    // Held fast (stunned, frozen), his chain falls slack and comes back to him, and his charge is over.
    if (m.held()) {
      m.charging = null;
      m.backing = null;
      if (m.chain && m.chain.phase !== 'back') m.chain.phase = 'back';
    }
    if (m.charging) dash(m, dt, game, level);
    if (m.chain) reel(m, dt, game, level);
  },

  /** Down to half his health: from then on he charges, and goes a little quicker (and first, he hides: see hide). */
  enrage(m, game, { quiet = false } = {}) {
    m.enraged = true;
    if (quiet) return;
    burst(game.level, m.x, m.baseY + m.height * 0.7, m.z, DUST, 18, 3, 0.8);
    m.revealT = 0.4; // (he straightens up, roaring)
    game.shake(0.2);
  },

  die(m, game, level) {
    dropChain(m);
    m.charging = null;
    if (m.lamp) {
      m.lamp.gone = true; // (its light goes back to the walls' fittings: see shareLights)
      const i = level.lightShare.sources.indexOf(m.lamp);
      if (i >= 0) level.lightShare.sources.splice(i, 1);
    }
    burst(level, m.x, m.baseY + m.height * 0.6, m.z, DUST, 26, 4, 1);
    game.audio.rattle();
    game.shake(0.3);
  },

  pose: (m) => ({ chainOut: !!m.chain, charging: !!m.charging, lurking: !!m.lurk, turns: m.def.moves.chain.turns }),
};

export const BOSS_AI = { ooze, jailer };
