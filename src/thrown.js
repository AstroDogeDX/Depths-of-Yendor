import * as THREE from 'three';
import { THROWN } from './items/defs.js';
import { heldModel } from './items/models.js';
import { spawnProjectile } from './fx/projectiles.js';
import { THROW_NEXT } from './fx/viewmodel.js';
import { lookDir, missileHit, missileLands } from './combat.js';
import { rand } from './rng.js';

// Thrown weapons (kind 'thrown', THROWN in items/defs.js): stones, darts and throwing knives, a stack to a type, kept in
// the bullet pouch and thrown from the hotbar (see HELD in hotbar.js). Any works this way, by its numbers there.
//
//   Take one up  hold its hotbar slot's key: your weapon goes down, and one comes up in your hand (see Game.holdSlot).
//   Wind up      then hold right-click: you draw your arm back (WIND seconds), and then the throw charges over its
//                `draw` seconds, filling the attack meter. Meanwhile you slow to THROW_SLOW, and can't sprint.
//   Throw        click: it flies where you're looking, as hard as it's charged (a click before MIN_CHARGE waits for it):
//                harder, it flies faster and drops less, and hits harder. The next comes up into your hand (THROW_NEXT
//                in fx/viewmodel.js), and while you still hold right-click, you draw back to throw it in turn.
//   Hold back    let go of right-click first and the throw's off: you lower your arm, and it's still in your hand.
// A throw goes up a little over where you're looking (LOFT), so it comes down through the crosshair a few metres off,
// then drops below it. One that strikes a monster may break (its `breaks`); otherwise it falls where it struck, to be
// picked up again, and one that strikes a wall clatters, which monsters nearby may come to look into (see missileLands
// in combat.js). A monster unaware of you takes double damage, as from any blow, and a dodgy one may dodge one it sees
// coming. From the pack, Throw tosses one (TOSS as hard as you can throw), there being no winding up there.

export const WIND = 0.25; // seconds to draw your arm back, before the throw charges
export const MIN_CHARGE = 0.2; // a click before the throw's this charged waits for it
export const THROW_SLOW = 0.75; // your speed with your arm drawn back
const GRAVITY = 6; // m/s² a thrown weapon drops
const LOFT = 1.2; // m/s up it's thrown, over where you're looking
const TOSS = 0.5;
// What each is made of (its `stuff`): the colour of the bits it breaks into, and chips off what it strikes.
const STUFF = { stone: 0x8a8478, wood: 0xb09070, steel: 0xc8d0d8 };

/**
 * Each frame: a thrown weapon held up from the hotbar (see Game.holdSlot) is wound up while right-click is held
 * (`free`: you're not held fast), and thrown with a click, which Game.holdSlot keeps for it (`hold.queued`). Keeps the
 * attack meter at the throw's charge meanwhile. Anything else held up, or nothing, leaves your arm down.
 */
export function updateThrow(game, p, input, dt, free) {
  const h = game.hold, item = game.heldItem()?.item, thrown = item?.kind === 'thrown' ? item : null;
  if (!thrown || !free || !input.guard) {
    // Let go of right-click (or of the slot's key) with your arm drawn back: the throw's off, and it's still in your hand.
    if (p.windup > 0) {
      p.charge = 0;
      game.audio.ease();
    }
    p.windup = p.throwCharge = 0;
    if (thrown) h.queued = null; // (a click without right-click held does nothing)
    return;
  }
  // Still coming up into your hand (the first, or the next after a throw): your arm waits for it, and so does a click.
  if (game.time < h.readyAt) {
    p.charge = 0;
    return;
  }
  const d = THROWN[thrown.type], quick = (p.status.hasted > 0 ? 1.35 : 1) / (p.status.chilled > 0 ? 1.25 : 1);
  if (p.windup === 0) game.audio.windUp();
  if (p.windup < 1) p.windup = Math.min(1, p.windup + (dt * quick) / WIND);
  else p.throwCharge = Math.min(1, p.throwCharge + (dt * quick) / d.draw);
  p.charge = p.throwCharge;
  if (h.queued === 'left' && p.windup >= 1 && p.throwCharge >= MIN_CHARGE) {
    h.queued = null;
    if (game.canFight()) hurl(game, p, thrown, h);
  }
}

/** Throws the one in your hand, as hard as the throw's charged: your arm snaps forward, and the next comes up. */
function hurl(game, p, item, h) {
  const last = launch(game, p, item, p.throwCharge);
  p.windup = p.throwCharge = p.charge = 0;
  h.readyAt = game.time + THROW_NEXT;
  game.viewmodel.hurl(last);
  game.ui.flashSlot(h.i);
}

/** The pack's Throw (see itemActions in items/use.js): tosses one where you're looking. Returns whether it did. */
export function toss(game, item) {
  if (!game.canFight()) return false;
  const p = game.player;
  launch(game, p, item, TOSS);
  game.viewmodel.dip();
  p.charge = Math.min(p.charge, 0.3);
  return true;
}

/** Throws one of `item` where you're looking, `charge` (0 to 1) as hard as you can. Returns whether it was the last. */
function launch(game, p, item, charge) {
  const d = THROWN[item.type], one = p.takeOne(item);
  const speed = d.speed * (0.4 + 0.6 * charge), dir = lookDir(p);
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw); // from your right hand
  spawnProjectile(game.level, {
    x: p.x + dir.x * 0.4 + rx * 0.08, y: p.eyeHeight() - 0.05 + dir.y * 0.4, z: p.z + dir.z * 0.4 + rz * 0.08,
    vx: dir.x * speed, vy: dir.y * speed + LOFT, vz: dir.z * speed, gravity: GRAVITY,
    owner: 'player', kind: 'thrown', mesh: flying(item.type), spin: d.spin, size: d.size, life: 4, type: d.dmgType,
    item: one, power: 0.3 + 0.7 * charge,
    onImpact: (g, pr, target) => missileLands(g, pr, target, {
      hit: thrownHit, breaks: d.breaks, chips: STUFF[d.stuff],
      clatter: () => g.audio.clatter(d.stuff), crack: () => g.audio.crack(d.stuff),
    }),
  });
  game.audio.hurl();
  if (one !== item) return false;
  game.log(`That was the last of your ${d.plural ?? `${d.name}s`}.`, 'warn');
  return true;
}

/** One strikes a monster, as hard as it was thrown (see missileHit). Returns whether it struck. */
function thrownHit(game, pr, m) {
  const d = THROWN[pr.item.type];
  return missileHit(game, pr, m, { dmg: rand.int(d.dmg[0], d.dmg[1]), type: d.dmgType, what: d.name }) >= 0;
}

/**
 * One of `type` as it flies, facing +z (which Object3D.lookAt turns where it goes): point first, about its middle, where
 * it turns end over end (its first child, which spawnProjectile turns by its `spin`).
 */
function flying(type) {
  const g = new THREE.Group(), turn = new THREE.Group(), m = heldModel(THROWN[type].model);
  m.rotation.x = Math.PI / 2;
  m.position.sub(new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()));
  turn.add(m);
  g.add(turn);
  return g;
}
