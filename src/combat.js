import { rand } from './rng.js';
import { EYE_H } from './config.js';
import { damageMult } from './damage.js';

const CONE = Math.cos(0.75); // ~43° either side of the crosshair

/** Resolve the player's melee swing at the moment the blade connects. power is 0.3..1 from the attack meter. */
export function playerStrike(game, power) {
  const p = game.player, level = game.level;
  const w = p.weaponStats();
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);

  let best = null, bestD = Infinity;
  for (const m of level.monsters) {
    if (m.dead) continue;
    const dx = m.x - p.x, dz = m.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d - m.radius > w.reach) continue;
    const cos = (dx * fx + dz * fz) / (d || 1);
    if (d > m.radius + 0.35 && cos < CONE) continue;
    if (!level.los(p.x, p.z, m.x, m.z)) continue;
    if (d < bestD) { best = m; bestD = d; }
  }
  if (!best) return false;

  const m = best;
  // Unaware: asleep, wandering, or still searching for a noise it hasn't traced to you.
  const sneak = m.state !== 'hunt' || !m.seen || m.status.paralyzed > 0;
  const acc = Math.max(0.35, Math.min(0.98, 0.88 + w.accuracy - m.def.dodge + (p.level - m.danger) * 0.015));
  if (!sneak && !rand.chance(acc)) {
    game.popup(m.headPos(), 'miss', 'miss');
    game.audio.whiff();
    m.notice(game);
    return true;
  }

  let dmg = rand.int(w.dmg[0], w.dmg[1]) + w.ench + (w.excess > 0 ? rand.int(0, w.excess) : 0);
  dmg = Math.round(dmg * power);
  if (sneak) dmg *= 2;
  dmg -= rand.int(0, m.def.def);
  dmg = Math.max(1, dmg);

  if (sneak) game.log(`You strike the unsuspecting ${m.name}!`, 'good');
  const dist = Math.max(0.01, bestD);
  const dealt = m.takeDamage(game, dmg, { type: w.dmgType, knockback: { x: (m.x - p.x) / dist, z: (m.z - p.z) / dist }, sneak });
  const mult = damageMult(m.def, w.dmgType);
  if (dealt > 0) game.audio.hit(mult > 1 ? 'weak' : mult < 1 ? 'resist' : null);
  game.shake(0.06);

  if (dealt > 0 && p.hasArtefact('chalice')) {
    const heal = Math.max(1, Math.round(dealt * 0.25));
    p.heal(heal);
  }
  if (p.hasArtefact('ember') && !m.dead && !m.def.fireImmune) m.status.burning = Math.max(m.status.burning, 3);

  const weapon = p.equip.weapon;
  if (weapon && !weapon.identified && --weapon.hitsToId <= 0) {
    game.knowledge.identify(weapon);
    game.log(`You are now familiar enough with your weapon to know it: ${game.knowledge.name(weapon)}.`, 'info');
  }
  return true;
}

/** Point just in front of the player's face, used for popups about the player. */
export function playerPopupPos(p) {
  return { x: p.x - Math.sin(p.yaw) * 0.9, y: EYE_H - 0.2, z: p.z - Math.cos(p.yaw) * 0.9 };
}
