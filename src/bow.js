import * as THREE from 'three';
import { BOWS, ARROWS } from './items/defs.js';
import { enchantOf, baneOf } from './items/enchant.js';
import { heldModel } from './items/models.js';
import { spawnProjectile } from './fx/projectiles.js';
import { lookDir, missileHit, missileLands } from './combat.js';
import { rand } from './rng.js';

// Bows (kind 'bow', BOWS in items/defs.js) and the arrows they shoot (kind 'arrow', ARROWS): what a bow in your off hand
// does. Any bow works this way, by its numbers there (with its + and its enchantment or curse: see bowStats), and any
// arrow by its own.
//
//   In hand     with a bow in your off hand, your weapon goes down, and your main hand takes an arrow from your quiver
//               (Player.equip.arrows, the Arrows slot on the doll, where arrows stay whether you've a bow or not).
//   Jab         a click: a stab with the arrow in your hand, as a weapon swings (the attack meter, and playerStrike), for
//               JAB of what it would do shot. Something for when a monster gets too close.
//   Nock        hold right-click: an arrow goes to the string, over the bow's `nock` seconds (Player.nock).
//   Draw        then hold click as well: the string comes back over its `draw` seconds (Player.draw), filling the attack
//               meter, and you slow to its `slow`. Let go of click to loose the arrow, once it's drawn past MIN_DRAW (or
//               it eases back, still nocked); a fuller draw flies faster and hits harder. Let go of right-click first
//               and the shot's off: the arrow goes back to your hand, and the click does nothing more until it's let go.
//               While right-click is held another arrow is nocked after each shot.
//   On your back  gripping your weapon in both hands (F) slings it over your shoulder, and your weapon comes back up.
// An arrow that strikes a monster may break (its `breaks`); otherwise it falls where it struck, to be picked up again,
// and one that strikes a wall clatters, which monsters nearby may come to look into (see missileLands in combat.js). A
// monster unaware of you takes double damage, as from any blow, and a dodgy one may dodge an arrow it sees coming.

export const MIN_DRAW = 0.2; // drawn less than this, letting go of click looses nothing
export const JAB = 0.3; // a jab does this share of what the arrow would do shot at full draw
const JAB_REACH = 1.5, JAB_RECHARGE = 0.6;
const GRAVITY = 4; // m/s² an arrow drops
const SPLINTERS = 0xb09070; // an arrow breaking, or clattering off a wall

/** The bow in your off hand, or null. */
export const bowOf = (p) => (p.equip.offhand?.kind === 'bow' ? p.equip.offhand : null);

/** Whether you're shooting: a bow in your off hand, in hand (not slung over your shoulder). */
export const archer = (p) => !!bowOf(p) && !p.twoHanded;

/** The arrows in your quiver, or null if it's empty. */
export function quiverOf(p) {
  const a = p.equip.arrows;
  return a && a.qty > 0 && p.inventory.includes(a) ? a : null;
}

/**
 * A bow's numbers, with its + and its enchantment or curse (see items/enchant.js): { dmg, plus, draw, nock, speed,
 * slow, accuracy, spread, dmgMult, onHit }.
 */
export function bowStats(item) {
  const d = BOWS[item.type], fx = { ...enchantOf(item), ...baneOf(item) };
  return {
    dmg: d.dmg, plus: item.plus, draw: d.draw, nock: d.nock, speed: d.speed, slow: d.slow,
    accuracy: item.plus * 0.03 + (fx.accuracy ?? 0), spread: fx.spread ?? 0, dmgMult: fx.dmgMult ?? 1,
    onHit: enchantOf(item)?.onHit ?? null,
  };
}

/** The arrow in your hand as a weapon to jab with, as Player.weaponStats gives a weapon's (for playerStrike). */
export function jabStats(p) {
  const s = bowStats(bowOf(p)), a = ARROWS[quiverOf(p)?.type ?? 'standard'];
  const jab = (v) => Math.max(1, Math.round((v + s.plus + a.dmg) * JAB));
  return {
    dmg: [jab(s.dmg[0]), jab(s.dmg[1])], dmgType: a.dmgType, plus: 0, reach: JAB_REACH, model: null, short: 0, excess: 0,
    recharge: (JAB_RECHARGE * (p.status.chilled > 0 ? 1.25 : 1)) / (p.status.hasted > 0 ? 1.35 : 1),
    accuracy: s.accuracy, onHit: a.onHit ?? null, dmgMult: s.dmgMult,
  };
}

/**
 * The bow with right-click held (`free`: not held fast, nor holding something up from the hotbar): nocks an arrow,
 * draws it while click is held too, and looses it when click's let go (see the top of this file). Keeps the attack
 * meter at the draw meanwhile. Returns whether the bow has the mouse: an arrow nocked, or being nocked. Without
 * right-click (or arrows), it lets the string go, and returns false, so a click jabs.
 */
export function updateBow(game, p, input, dt, free) {
  const item = bowOf(p), quiver = quiverOf(p), held = input.guard && free;
  if (held && !quiver && input.wasPressed('Mouse2')) game.log('Your quiver is empty.', 'warn');
  if (!held || !quiver) {
    // Right-click let go mid-draw: the shot's off, and the arrow back in your hand.
    if (p.draw > 0) {
      p.latch = input.attack;
      p.charge = 0;
      game.audio.ease();
    }
    p.nock = 0;
    p.draw = 0;
    p.drawing = false;
    return false;
  }
  const s = bowStats(item), quick = (p.status.hasted > 0 ? 1.35 : 1) / (p.status.chilled > 0 ? 1.25 : 1);
  if (p.nock < 1) {
    p.nock = Math.min(1, p.nock + (dt * quick) / s.nock);
    p.charge = 0;
    return true;
  }
  if (input.attack && !p.latch && (p.drawing || game.canFight())) {
    if (!p.drawing) {
      p.drawing = true;
      game.audio.drawBow();
    }
    p.draw = Math.min(1, p.draw + (dt * quick) / s.draw);
  } else if (p.drawing) {
    p.drawing = false;
    if (p.draw >= MIN_DRAW && game.canFight()) loose(game, p, item, quiver);
    else if (p.draw > 0) game.audio.ease();
    p.draw = 0;
  }
  p.charge = p.draw;
  return true;
}

/** Looses the nocked arrow, as far as it's drawn, where you're looking (or near it, from a bow that makes them wander). */
function loose(game, p, bow, quiver) {
  const s = bowStats(bow), type = quiver.type, draw = p.draw;
  const one = p.takeOne(quiver);
  const speed = s.speed * (0.4 + 0.6 * draw);
  let d = lookDir(p);
  if (s.spread) d = veer(d, s.spread);
  spawnProjectile(game.level, {
    x: p.x + d.x * 0.3, y: p.eyeHeight() - 0.06 + d.y * 0.3, z: p.z + d.z * 0.3,
    vx: d.x * speed, vy: d.y * speed, vz: d.z * speed, gravity: GRAVITY,
    owner: 'player', kind: 'arrow', mesh: flyingArrow(type), size: 0.06, life: 4, type: ARROWS[type].dmgType,
    item: one, bow, stats: s, power: 0.3 + 0.7 * draw,
    onImpact: (g, pr, target) => missileLands(g, pr, target, {
      hit: arrowHit, breaks: ARROWS[type].breaks, chips: SPLINTERS, clatter: () => g.audio.thunk(),
    }),
  });
  p.nock = 0;
  p.charge = 0;
  game.viewmodel.loose();
  game.audio.loose();
  if (!quiverOf(p)) game.log('That was the last arrow in your quiver.', 'warn');
}

/** `d` turned at random by up to `spread` radians to either side, and half that up or down. */
function veer(d, spread) {
  const a = rand.range(-spread, spread), c = Math.cos(a), s = Math.sin(a);
  const x = d.x * c + d.z * s, z = d.z * c - d.x * s, y = d.y + rand.range(-spread, spread) * 0.5;
  const len = Math.hypot(x, y, z);
  return { x: x / len, y: y / len, z: z / len };
}

/**
 * An arrow strikes a monster: it may dodge one it's ready for (as it would a blow, less your bow's aim), or else takes
 * the arrow's damage, by how far it was drawn, double if it was unaware of you (see missileHit), and whatever the bow
 * and the arrow bring (see items/enchant.js). Hits teach you the bow. Returns whether it struck.
 */
function arrowHit(game, pr, m) {
  const s = pr.stats, a = ARROWS[pr.item.type];
  const dealt = missileHit(game, pr, m, {
    dmg: rand.int(s.dmg[0], s.dmg[1]) + s.plus + a.dmg, type: a.dmgType, accuracy: s.accuracy, mult: s.dmgMult, what: 'arrow',
  });
  if (dealt < 0) return false;
  for (const fx of [s.onHit, a.onHit]) {
    if (!fx || dealt <= 0 || m.dead) continue;
    if (fx.ignite) m.afflict(game, 'burning', fx.ignite, false);
    if (fx.chill) m.afflict(game, 'chilled', fx.chill, false);
    if (fx.poison) m.afflict(game, 'poisoned', fx.poison, false);
  }
  const bow = pr.bow;
  if (dealt > 0 && !bow.identified && --bow.hitsToId <= 0) {
    game.knowledge.identify(bow);
    game.log(`You've put enough arrows home to know your bow: ${game.knowledge.name(bow)}.`, 'info');
  }
  return true;
}

/** An arrow of `type` as it flies: its point at its origin, and pointing +z (which Object3D.lookAt turns where it goes). */
function flyingArrow(type) {
  const g = new THREE.Group(), m = heldModel(ARROWS[type].model);
  m.rotation.x = Math.PI / 2;
  m.position.z = -new THREE.Box3().setFromObject(m).max.z;
  g.add(m);
  return g;
}
