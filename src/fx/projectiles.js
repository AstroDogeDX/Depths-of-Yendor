import * as THREE from 'three';
import { PLAYER_RADIUS, WALL_H } from '../config.js';
import { burst } from './particles.js';
import { glowSprite } from './glow.js';

const ARROW_GEO = new THREE.BoxGeometry(0.03, 0.03, 0.55);
const ORB_GEO = new THREE.IcosahedronGeometry(1, 0);

/**
 * o: { x, y, z, vx, vy, vz, owner: 'monster'|'player', dmg, kind, color, size, source,
 *      type? (its damage type, see damage.js: fire sets what it hits burning), gravity?, life?, onImpact?(game, pr, target) }
 */
export function spawnProjectile(level, o) {
  let mesh;
  if (o.kind === 'arrow') {
    mesh = new THREE.Mesh(ARROW_GEO, new THREE.MeshLambertMaterial({ color: o.color }));
  } else if (o.mesh) {
    mesh = o.mesh;
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
      if (level.blocksSight(level.toTile(pr.x), level.toTile(pr.z)) || pr.y < 0.03 || pr.y > WALL_H) {
        done = true;
        break;
      }
      if (pr.owner === 'monster') {
        const p = game.player;
        if (Math.hypot(p.x - pr.x, p.z - pr.z) < PLAYER_RADIUS + pr.size && pr.y < 2.0) {
          target = 'player';
          done = true;
        }
      } else {
        for (const m of level.monsters) {
          if (m.dead) continue;
          if (Math.hypot(m.x - pr.x, m.z - pr.z) < m.radius + pr.size &&
              pr.y > m.baseY - 0.2 && pr.y < m.baseY + m.height + 0.3) {
            target = m;
            done = true;
            break;
          }
        }
      }
    }
    pr.mesh.position.set(pr.x, pr.y, pr.z);
    if (pr.kind === 'arrow') pr.mesh.lookAt(pr.x + pr.vx, pr.y + pr.vy, pr.z + pr.vz);
    else pr.mesh.rotation.y += dt * 8;

    if (done) {
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
    game.hurtPlayer(pr.dmg, { source: pr.source, type: pr.type, ranged: true });
  } else if (target) {
    target.takeDamage(game, pr.dmg, { type: pr.type, knockback: { x: pr.vx / 20, z: pr.vz / 20 } });
    if (pr.type === 'fire' && !target.dead) target.afflict(game, 'burning', 4, false);
  }
}
