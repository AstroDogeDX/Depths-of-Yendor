import { SHIELDS } from './items/defs.js';
import { enchantOf, baneOf } from './items/enchant.js';
import { rand } from './rng.js';

// Shields (kind 'shield', SHIELDS in items/defs.js): what one in your off hand does. Any shield works this way, by its
// numbers there (with its + and its enchantment or curse: see shieldStats).
//
//   Raised      hold right-click, with your weapon in one hand: it comes up over GUARD_RAISE seconds (Player.guard),
//               and once it's up (Player.guarding) it takes its `block` off each blow from in front of you, before
//               your armour does, and each point it takes costs you `stamina`. Meanwhile your stamina doesn't come back,
//               you move at `slow` of your speed and can't sprint, and a click shoves with it (a bash) instead of
//               swinging your weapon. Run out of stamina and your guard breaks: you're winded, and can't raise it
//               again until you've your breath back (STAMINA_RECOVER in config.js).
//   On your back  gripping your weapon in both hands slings it on your back, where it takes its `back` off each blow
//               from behind, for nothing.
// Only blows that come from somewhere count (a monster's, or a shot's): not traps, nor anything that ignores armour.

export const GUARD_RAISE = 0.18; // seconds for a shield to come up, or go down
const BASH_CONE = Math.cos(0.8); // how far either side of where you face a bash reaches

/** The shield in your off hand, or null. */
export const shieldOf = (p) => (p.equip.offhand?.kind === 'shield' ? p.equip.offhand : null);

/**
 * A shield's numbers, with its + and its enchantment or curse (see items/enchant.js): { block, back, arc, stamina (a
 * point blocked costs), slow, thorns ([min, max] or null), bash { dmg, stamina, reach, push, recharge } }.
 */
export function shieldStats(item) {
  const d = SHIELDS[item.type], fx = { ...enchantOf(item), ...baneOf(item) };
  return {
    block: d.block + item.plus, back: d.back + item.plus, arc: d.arc,
    stamina: d.stamina * (fx.blockStamina ?? 1),
    slow: d.slow * (fx.guardSpeed ?? 1),
    thorns: fx.thorns ?? null,
    bash: { ...d.bash, dmg: [d.bash.dmg[0] + item.plus, d.bash.dmg[1] + item.plus], stamina: d.bash.stamina * (fx.bashStamina ?? 1) },
  };
}

/**
 * Raises your shield while `want` (right-click held), or lowers it: only a shield in your off hand, with your weapon in
 * one hand, while you have the stamina (not winded) and nothing's held up from the hotbar (`free`). Eases Player.guard
 * toward up (1) or down (0), and sets Player.guarding once it's all the way up.
 */
export function updateGuard(p, want, free, dt) {
  const up = want && free && !!shieldOf(p) && !p.twoHanded && !p.winded;
  p.guard = up ? Math.min(1, p.guard + dt / GUARD_RAISE) : Math.max(0, p.guard - dt / GUARD_RAISE);
  p.guarding = up && p.guard >= 1;
}

/**
 * A blow of `dmg` on you from `from` ({ x, z }, where it came from), struck by `attacker` (a monster, if one struck
 * it): what your shield takes off it, raised against a blow from in front or slung on your back against one from
 * behind, or 0. Raised, what it takes costs you stamina, and if that runs you dry, your guard breaks.
 */
export function blockHit(game, p, dmg, from, attacker = null) {
  const item = shieldOf(p);
  if (!item || !from || dmg <= 0) return 0;
  const s = shieldStats(item);
  const dx = from.x - p.x, dz = from.z - p.z, d = Math.hypot(dx, dz);
  if (d < 1e-4) return 0;
  const facing = (dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / d; // the cosine of how far off where you face it is
  const raised = p.guarding && facing >= Math.cos(s.arc);
  const slung = p.twoHanded && facing <= -Math.cos(s.arc);
  if (!raised && !slung) return 0;
  const def = raised ? s.block : s.back;
  const took = Math.min(dmg, rand.int(Math.ceil(def * 0.4), def));
  if (took <= 0) return 0;
  // A shield is learnt by use, as armour is.
  if (!item.identified && --item.hitsToId <= 0) {
    game.knowledge.identify(item);
    game.log(`You've turned aside enough blows to know your shield: ${game.knowledge.name(item)}.`, 'info');
  }
  if (raised) {
    p.stamina = Math.max(0, p.stamina - took * s.stamina);
    p.staminaRestT = 0;
    if (s.thorns && attacker && !attacker.dead) attacker.takeDamage(game, rand.int(s.thorns[0], s.thorns[1]), { type: 'stab' });
    if (p.stamina <= 0) breakGuard(game, p);
  }
  return took;
}

/** Whether your shield is up against something coming from `from` ({ x, z }): raised, and it in front of you, in its arc. */
export function raisedAgainst(p, from) {
  const item = shieldOf(p);
  if (!item || !p.guarding) return false;
  const dx = from.x - p.x, dz = from.z - p.z, d = Math.hypot(dx, dz);
  return d > 1e-4 && (dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / d >= Math.cos(shieldStats(item).arc);
}

/** What holding your shield up against something costs you (`cost` stamina), which may break your guard. */
export function strainGuard(game, p, cost) {
  p.stamina = Math.max(0, p.stamina - cost);
  p.staminaRestT = 0;
  if (p.stamina <= 0) breakGuard(game, p);
}

/** Your guard breaks: out of stamina, you're winded, and your shield drops until you've your breath back. */
function breakGuard(game, p) {
  p.winded = true;
  p.guarding = false;
  game.log('Your guard is broken!', 'warn');
  game.popup({ x: p.x - Math.sin(p.yaw) * 0.8, y: p.eyeHeight() - 0.2, z: p.z - Math.cos(p.yaw) * 0.8 }, 'GUARD BROKEN', 'alert');
  game.audio.guardBreak();
}

/**
 * A click with your shield raised: a shove with it, in place of a swing (its `bash`), once it's ready again. It costs
 * stamina (which may break your guard), hits the nearest monster in reach in front of you for a little damage, pushes
 * it back, and knocks it out of any blow it was winding up. Returns whether it shoved.
 */
export function shieldBash(game) {
  const p = game.player, level = game.level, item = shieldOf(p);
  if (!item || !p.guarding || p.bashT > 0) return false;
  const b = shieldStats(item).bash;
  p.bashT = b.recharge;
  p.stamina = Math.max(0, p.stamina - b.stamina);
  p.staminaRestT = 0;
  game.viewmodel.bash();
  game.audio.swing();
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  let best = null, bestD = Infinity;
  for (const m of level.monsters) {
    if (m.dead) continue;
    const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
    if (d - m.radius > b.reach || (dx * fx + dz * fz) / (d || 1) < BASH_CONE || !level.los(p.x, p.z, m.x, m.z)) continue;
    const key = d + (m.isAlly() ? 100 : 0);
    if (key < bestD) { best = m; bestD = key; }
  }
  if (best) {
    const d = Math.max(0.01, Math.hypot(best.x - p.x, best.z - p.z));
    // (takeDamage moves it 0.35 of the knockback it's given.)
    const push = { x: ((best.x - p.x) / d) * (b.push / 0.35), z: ((best.z - p.z) / d) * (b.push / 0.35) };
    best.takeDamage(game, rand.int(b.dmg[0], b.dmg[1]), { type: 'bash', knockback: push });
    if (!best.dead && !best.boss && best.attack?.phase === 'windup') {
      best.attack.phase = 'none';
      best.cooldown = 0.6;
    }
    game.audio.hit(null);
    game.shake(0.05);
  }
  if (p.stamina <= 0) breakGuard(game, p);
  return true;
}
