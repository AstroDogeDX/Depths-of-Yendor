import * as THREE from 'three';
import { PLAYER_RADIUS, WALL_H } from '../config.js';
import { burst } from './particles.js';
import { glowSprite } from './glow.js';

const ARROW_GEO = new THREE.BoxGeometry(0.03, 0.03, 0.55);
const ORB_GEO = new THREE.IcosahedronGeometry(1, 0);

/**
 * o: { x, y, z, vx, vy, vz, owner: 'monster'|'player'|'ally', attacker (the monster that shot it), dmg, kind, color,
 *      size, source,
 *      type? (its damage type, see damage.js: fire sets what it hits burning), harmless? (a spell that does no harm:
 *      teleport other), gravity?, life?, mesh? (a model of its own: an arrow's or a thrown weapon's faces +z, the way
 *      it flies), spin? (a thrown weapon's mesh's first child turns end over end, about x, this many radians a second),
 *      onImpact?(game, pr, target) }
 * A shot stops at a shut chest. One of yours strikes it (see Game.hitChest), and if that wakes a mimic, the shot hits
 * the mimic; `pr.chest` is the chest it hit.
 */
export function spawnProjectile(level, o) {
  let mesh;
  if (o.mesh) {
    mesh = o.mesh;
  } else if (o.kind === 'arrow') {
    mesh = new THREE.Mesh(ARROW_GEO, new THREE.MeshLambertMaterial({ color: o.color }));
  } else {
    mesh = new THREE.Mesh(ORB_GEO, new THREE.MeshBasicMaterial({ color: o.color, fog: false }));
    mesh.scale.setScalar(o.size ?? 0.15);
    mesh.add(glowSprite(o.color, 5, 0.8, false));
  }
  mesh.position.set(o.x, o.y, o.z);
  level.group.add(mesh);
  const pr = { gravity: 0, life: 3, size: 0.15, ...o, mesh };
  level.projectiles.push(pr);
  return pr;
}

export function updateProjectiles(dt, game, level) {
  const list = level.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const pr = list[i];
    pr.life -= dt;
    pr.vy -= pr.gravity * dt;
    const speed = Math.hypot(pr.vx, pr.vy, pr.vz);
    const steps = Math.max(1, Math.ceil((speed * dt) / 0.2));
    const h = dt / steps;
    let target, done = pr.life <= 0;
    for (let s = 0; s < steps && !done; s++) {
      pr.x += pr.vx * h;
      pr.y += pr.vy * h;
      pr.z += pr.vz * h;
      // (Over a pool, it goes down to the water, where what's wading in it can still be hit.)
      if (level.blocksSight(level.toTile(pr.x), level.toTile(pr.z)) || pr.y < level.surfaceY(pr.x, pr.z) + 0.03 || pr.y > WALL_H) {
        done = true;
        break;
      }
      // A hostile's shot hits you, or an ally of yours (charmed: see Monster.isAlly). Yours and your allies' pass by
      // your allies and hit anything else.
      const hostile = pr.owner === 'monster';
      const p = game.player;
      if (hostile && Math.hypot(p.x - pr.x, p.z - pr.z) < PLAYER_RADIUS + pr.size && pr.y < 2.0) {
        target = 'player';
        done = true;
        break;
      }
      for (const m of level.monsters) {
        if (m.dead || m === pr.attacker || m.isAlly() !== hostile) continue;
        if (Math.hypot(m.x - pr.x, m.z - pr.z) < m.radius + pr.size &&
            pr.y > m.baseY - 0.2 && pr.y < m.baseY + m.height + 0.3) {
          target = m;
          done = true;
          break;
        }
      }
      if (!done && (pr.chest = level.chestAt(pr.x, pr.y, pr.z))) done = true;
    }
    pr.mesh.position.set(pr.x, pr.y, pr.z);
    if (pr.kind === 'arrow' || pr.kind === 'thrown') pr.mesh.lookAt(pr.x + pr.vx, pr.y + pr.vy, pr.z + pr.vz);
    else pr.mesh.rotation.y += dt * 8;
    if (pr.spin) pr.mesh.children[0].rotation.x += pr.spin * dt;

    if (done) {
      // (A potion is the splash's business: see potionSplash.)
      if (pr.chest && pr.owner === 'player' && pr.kind !== 'potion') target = game.hitChest(pr.chest, pr) ?? undefined;
      impact(game, level, pr, target);
      level.group.remove(pr.mesh);
      list.splice(i, 1);
    }
  }
}

function impact(game, level, pr, target) {
  if (pr.onImpact) {
    pr.onImpact(game, pr, target);
    return;
  }
  burst(level, pr.x, pr.y, pr.z, pr.color, pr.kind === 'arrow' ? 3 : 10, 2.5, 0.4);
  if (target === 'player') {
    // (From the way it came, for a shield: see shield.js.)
    game.hurtPlayer(pr.dmg, { source: pr.source, type: pr.type, ranged: true, from: { x: pr.x - pr.vx, z: pr.z - pr.vz } });
  } else if (target) {
    target.takeDamage(game, pr.dmg, {
      type: pr.type, ignite: pr.type === 'fire' ? 4 : 0, knockback: { x: pr.vx / 20, z: pr.vz / 20 },
      attacker: pr.owner === 'player' ? undefined : pr.attacker,
    });
  }
}
