import { rand } from './rng.js';
import { damageMult } from './damage.js';
import { burst } from './fx/particles.js';

const CONE = Math.cos(0.75); // ~43° either side of the crosshair
const PILE = 0.8; // a missile of yours that falls this near a pile of its kind joins it
const HEARD = 6; // monsters this near where a missile of yours clatters may come to look

/** Which way you're looking, as a unit vector. */
export function lookDir(p) {
  const cp = Math.cos(p.pitch);
  return { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
}

/**
 * Resolve the player's melee swing at the moment the blade connects. power is 0.3..1 from the attack meter. `w`: what
 * strikes, as Player.weaponStats gives it; `jab`: it's a jab with an arrow (see bow.js), which teaches you nothing of
 * your weapon.
 */
export function playerStrike(game, power, w = game.player.weaponStats(), jab = false) {
  const p = game.player, level = game.level;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);

  // The nearest monster in reach, in front of you; your allies only if there's nothing else to hit.
  let best = null, bestD = Infinity, bestKey = Infinity;
  for (const m of level.monsters) {
    if (m.dead) continue;
    const dx = m.x - p.x, dz = m.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d - m.radius > w.reach) continue;
    const cos = (dx * fx + dz * fz) / (d || 1);
    if (d > m.radius + 0.35 && cos < CONE) continue;
    if (!level.los(p.x, p.z, m.x, m.z)) continue;
    const key = d + (m.isAlly() ? 100 : 0);
    if (key < bestKey) { best = m; bestD = d; bestKey = key; }
  }
  // No monster in reach: the blow lands on a chest, if the crosshair's on one (so a swing at something else never
  // smashes one by chance), and a blade that burns burns it. A mimic wakes to it, and takes it unawares.
  let revealed = false;
  if (!best) {
    const d = lookDir(p);
    const chest = level.chestInSight(p.x, p.eyeHeight(), p.z, d.x, d.y, d.z, Math.hypot(w.reach, 1.1));
    best = chest && game.hitChest(chest, { type: w.onHit?.ignite || p.hasArtefact('ember') ? 'fire' : w.dmgType });
    if (!best) return !!chest;
    bestD = Math.hypot(best.x - p.x, best.z - p.z);
    revealed = true;
  }

  const m = best;
  // Unaware: asleep, wandering, or still searching for a noise it hasn't traced to you (or a mimic you've found out).
  const sneak = revealed || m.state !== 'hunt' || !m.seen || m.held();
  const acc = Math.max(0.35, Math.min(0.98, 0.88 + w.accuracy - m.def.dodge + (p.level - m.danger) * 0.015));
  if (!sneak && !rand.chance(acc)) {
    game.popup(m.headPos(), 'miss', 'miss');
    game.audio.whiff();
    m.notice(game);
    return true;
  }

  let dmg = rand.int(w.dmg[0], w.dmg[1]) + w.plus + (w.excess > 0 ? rand.int(0, w.excess) : 0);
  dmg = Math.round(dmg * power * w.dmgMult);
  if (sneak) dmg *= 2;
  dmg -= rand.int(0, m.def.def);
  dmg = Math.max(1, dmg);

  if (revealed) game.log(`Your blow catches the ${m.name} before it can spring!`, 'good');
  else if (sneak) game.log(`You strike the unsuspecting ${m.name}!`, 'good');
  const dist = Math.max(0.01, bestD);
  const dealt = m.takeDamage(game, dmg, { type: w.dmgType, knockback: { x: (m.x - p.x) / dist, z: (m.z - p.z) / dist }, sneak });
  const mult = damageMult(m.def, w.dmgType);
  if (dealt > 0) game.audio.hit(mult > 1 ? 'weak' : mult < 1 ? 'resist' : null);
  game.shake(0.06);

  // An enchanted weapon's blows bring its effect (see items/enchant.js).
  if (dealt > 0 && w.onHit && !m.dead) {
    if (w.onHit.ignite) m.afflict(game, 'burning', w.onHit.ignite, false);
    if (w.onHit.chill) m.afflict(game, 'chilled', w.onHit.chill, false);
    if (w.onHit.poison) m.afflict(game, 'poisoned', w.onHit.poison, false);
  }
  if (dealt > 0 && p.hasArtefact('chalice')) {
    const heal = Math.max(1, Math.round(dealt * 0.25));
    p.heal(heal);
  }
  if (p.hasArtefact('ember') && !m.dead) m.afflict(game, 'burning', 3, false);

  const weapon = p.equip.weapon;
  if (weapon && !jab && !weapon.identified && --weapon.hitsToId <= 0) {
    game.knowledge.identify(weapon);
    game.log(`You are now familiar enough with your weapon to know it: ${game.knowledge.name(weapon)}.`, 'info');
  }
  return true;
}

/**
 * A missile of yours (`pr`: an arrow, a thrown weapon) striking a monster: it may dodge one it's ready for (as it would
 * a blow, less your `accuracy`), or else takes `dmg` (rolled) times how hard it was shot or thrown (`pr.power`) and
 * `mult`, double if it was unaware of you, less a roll up to its defense. `what` names it for the log. Returns what got
 * through (see Monster.takeDamage), or -1 if it dodged.
 */
export function missileHit(game, pr, m, { dmg, type, accuracy = 0, mult = 1, what }) {
  const sneak = m.state !== 'hunt' || !m.seen || m.held();
  if (!sneak && rand.chance(m.def.dodge - accuracy)) {
    game.popup(m.headPos(), 'dodge', 'miss');
    game.audio.whiff();
    m.notice(game);
    return -1;
  }
  let n = Math.round(dmg * pr.power * mult);
  if (sneak) n *= 2;
  n = Math.max(1, n - rand.int(0, m.def.def));
  if (sneak) game.log(`Your ${what} takes the unsuspecting ${m.name}!`, 'good');
  const dealt = m.takeDamage(game, n, { type, sneak, knockback: { x: pr.vx / 40, z: pr.vz / 40 } });
  const k = damageMult(m.def, type);
  if (dealt > 0) game.audio.hit(k > 1 ? 'weak' : k < 1 ? 'resist' : null);
  return dealt;
}

/**
 * A missile of yours (an arrow, a thrown weapon: `pr.item`) comes down: in a monster (`target`), which `hit` resolves
 * (returning whether it struck), or against a wall, a chest or the floor. One that strikes may break (`breaks`), into
 * bits of `chips` (with `crack`, if it makes a sound); otherwise it falls where it struck, onto any pile of its kind
 * there, to be picked up again. One that strikes a wall clatters (`clatter`), and monsters near where it fell that
 * aren't hunting you may come to look into it.
 */
export function missileLands(game, pr, target, { hit, breaks, chips, clatter, crack = null }) {
  const level = game.level;
  const struck = !!target && target !== 'player' && hit(game, pr, target);
  if (struck && rand.chance(breaks)) {
    burst(level, pr.x, pr.y, pr.z, chips, 5, 1.6, 0.35);
    crack?.();
    return;
  }
  if (target && target !== 'player') {
    dropPile(game, pr.item, target.x, target.z);
    return;
  }
  // It clatters off what it struck, and falls back from it.
  burst(level, pr.x, pr.y, pr.z, chips, 4, 1.4, 0.3);
  clatter();
  for (const m of level.monsters) {
    if (m.dead || m.state === 'hunt' || Math.hypot(m.x - pr.x, m.z - pr.z) > HEARD) continue;
    if (rand.chance(m.state === 'sleep' ? 0.25 : 0.6)) m.hear(game, level, pr.x, pr.z);
  }
  const sp = Math.hypot(pr.vx, pr.vz) || 1;
  dropPile(game, pr.item, pr.x - (pr.vx / sp) * 0.4, pr.z - (pr.vz / sp) * 0.4);
}

/** Lays a stack (arrows, thrown weapons) on the floor near (x, z), on the pile of its kind there if there's one. */
export function dropPile(game, item, x, z) {
  const level = game.level, at = level.landSpot(x, z);
  level.collide(at, 0.2);
  const pile = level.items.find((e) => !e.price && e.item.kind === item.kind && e.item.type === item.type && Math.hypot(e.x - at.x, e.z - at.z) < PILE);
  if (pile) {
    level.removeItem(pile);
    level.addItem({ ...pile.item, qty: pile.item.qty + item.qty }, pile.x, pile.z);
  } else level.addItem(item, at.x, at.z);
}

/** Point just in front of the player's face, used for popups about the player. */
export function playerPopupPos(p) {
  return { x: p.x - Math.sin(p.yaw) * 0.9, y: p.eyeHeight() - 0.2, z: p.z - Math.cos(p.yaw) * 0.9 };
}
