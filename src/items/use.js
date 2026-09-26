import { WEAPONS, ARMORS, FOOD, ARTEFACTS, WANDS, WAND_PLUS_DMG } from './defs.js';
import { ENCHANTMENTS, binds, enchantOf } from './enchant.js';
import { buildItemModel } from './models.js';
import { HUNGER_MAX, EYE_H } from '../config.js';
import { rand } from '../rng.js';
import { spawnProjectile } from '../fx/projectiles.js';
import { burst, ring, transient, lightningMesh } from '../fx/particles.js';
import { spawnTable } from '../monsters/defs.js';
import { sellPrice, refusedAsCursed } from './generate.js';
import { cure } from '../status.js';

// --- Inventory actions shown in the pack screen ---

export function itemActions(game, item) {
  const p = game.player;
  const acts = [];
  const equipped = p.isEquipped(item);
  switch (item.kind) {
    case 'potion':
      acts.push({ label: 'Drink', fn: () => drinkPotion(game, item) });
      acts.push({ label: 'Throw', fn: () => throwPotion(game, item) });
      break;
    case 'scroll': acts.push({ label: 'Read', fn: () => readScroll(game, item) }); break;
    case 'food': acts.push({ label: 'Eat', fn: () => eatFood(game, item) }); break;
    case 'wand': acts.push({ label: 'Zap', fn: () => zapWand(game, item) }); break;
    case 'weapon': case 'armor': case 'ring': case 'artefact':
      acts.push(equipped
        ? { label: item.kind === 'weapon' ? 'Unwield' : 'Remove', fn: () => unequipItem(game, item) }
        : { label: item.kind === 'weapon' ? 'Wield' : item.kind === 'armor' ? 'Wear' : 'Put on', fn: () => equipItem(game, item) });
      break;
    case 'amulet': acts.push({ label: 'Invoke', fn: () => game.amuletDialog() }); break;
  }
  // Drop stays last: the pack's D key uses the last action.
  if (game.level.shopkeeper && game.level.playerInShop) {
    const price = sellPrice(item, game.level.depth, game.knowledge);
    if (price) acts.push({ label: `Sell${item.qty > 1 ? ' one' : ''} (${price} gold)`, fn: () => sellItem(game, item) });
    else if (refusedAsCursed(item)) {
      acts.push({ label: 'Sell (refused: cursed)', fn: () => { game.log('The shopkeeper recoils, "Take that cursed thing away from me!"', 'speech'); return false; } });
    }
  }
  acts.push({ label: 'Drop', fn: () => dropItem(game, item) });
  return acts;
}

// Actions return true when the pack screen should close afterwards.

export function eatFood(game, item) {
  const p = game.player;
  const one = p.takeOne(item);
  p.hunger = Math.min(HUNGER_MAX, p.hunger + FOOD[one.type].nutrition);
  p.hungerState = 0;
  p.charge = 0;
  game.log(one.type === 'ration' ? 'That ration hit the spot.' : 'Crunchy, if a little sad.', 'good');
  game.audio.pickup();
  return false;
}

export function drinkPotion(game, item) {
  const p = game.player, k = game.knowledge;
  const one = p.takeOne(item);
  game.audio.drink();
  p.charge = 0;
  switch (one.type) {
    case 'healing':
      p.heal(Math.max(12, Math.round(p.maxHp * 0.75)));
      for (const key of ['poisoned', 'bleeding', 'blind', 'confused']) cure(game, p, key, { quiet: true });
      game.log('You feel much better.', 'good');
      break;
    case 'strength':
      p.baseStr++;
      game.log('Newfound strength surges through your body.', 'good');
      break;
    case 'experience':
      game.log('You feel more experienced.', 'good');
      p.levelUp(game);
      p.xp = 0;
      break;
    case 'haste':
      p.addStatus('hasted', 25, game);
      game.log('You feel yourself speed up.', 'good');
      break;
    case 'mindvision':
      p.addStatus('mindvision', 45, game);
      game.log(game.level.monsters.some((m) => !m.dead)
        ? 'You can somehow sense the minds of the creatures on this floor!' : 'You sense... nothing. You are alone here.', 'good');
      break;
    case 'poison': p.addStatus('poisoned', 10, game); break;
    case 'confusion': p.addStatus('confused', 12, game); break;
    case 'blindness': p.addStatus('blind', 15, game); break;
    case 'paralysis': p.addStatus('paralysed', 4, game); break;
    case 'flame':
      game.log('The flask bursts into flame in your hands!', 'danger');
      potionSplash(game, 'flame', p.x, p.z, false);
      break;
  }
  if (k.learn(one)) game.log(`That was a ${k.name(one)}.`, 'info');
  return false;
}

/** Area effect where a potion shatters. */
export function potionSplash(game, type, x, z, thrown = true) {
  const level = game.level, k = game.knowledge, p = game.player;
  const color = k.appearance.potion[type].color;
  const R = 2.6;
  burst(level, x, 0.4, z, color, 18, 3, 0.7);
  ring(level, x, z, color, R, 0.6);
  const hit = level.monsters.filter((m) => !m.dead && Math.hypot(m.x - x, m.z - z) < R + m.radius);
  const playerHit = Math.hypot(p.x - x, p.z - z) < R;
  let obvious = hit.length > 0;
  for (const m of hit) {
    switch (type) {
      case 'healing': m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.5); game.log(`The ${m.name} looks healthier.`, 'warn'); break;
      case 'poison': m.afflict(game, 'poisoned', 10); break;
      case 'confusion': m.afflict(game, 'confused', 10); break;
      case 'blindness':
        // Blinded, it hunts by ear: a hunter from where you were, anything else from the sound of the flask.
        m.afflict(game, 'blind', 12);
        if (m.state === 'hunt') m.loseTrack(game, level);
        else m.hear(game, level, x, z);
        continue;
      case 'paralysis': m.afflict(game, 'paralysed', 6); break;
      case 'flame': m.takeDamage(game, rand.int(4, 8), { type: 'fire', ignite: 5 }); break;
      case 'haste': case 'strength': case 'experience': case 'mindvision': obvious = false; break;
    }
    if (type !== 'healing' && type !== 'haste' && !m.dead) m.notice(game);
  }
  if (playerHit && thrown) {
    if (type === 'poison') p.addStatus('poisoned', 5, game);
    if (type === 'confusion') p.addStatus('confused', 5, game);
    if (type === 'paralysis') p.addStatus('paralysed', 2, game);
  }
  if (type === 'flame') {
    obvious = true;
    if (playerHit) game.hurtPlayer(rand.int(3, 7), { source: 'a burst of liquid flame', ignoreArmor: true, type: 'fire' });
  }
  game.audio.shatter();
  if (thrown) {
    const it = { kind: 'potion', type };
    if (obvious) {
      if (k.learn(it)) game.log(`The flask shatters. It was a ${k.name(it)}!`, 'info');
    } else {
      game.log(`The flask shatters and ${k.appearance.potion[type].name} liquid splashes harmlessly.`, 'info');
      k.tried.potion.add(type);
    }
  }
}

function lookDir(p) {
  const cp = Math.cos(p.pitch);
  return { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
}

export function throwPotion(game, item) {
  if (!game.canFight()) return false;
  const p = game.player;
  const one = p.takeOne(item);
  const d = lookDir(p);
  const speed = 11;
  const mesh = buildItemModel(one, game.knowledge.color(one));
  spawnProjectile(game.level, {
    x: p.x + d.x * 0.5, y: EYE_H - 0.15, z: p.z + d.z * 0.5,
    vx: d.x * speed, vy: d.y * speed + 2.5, vz: d.z * speed,
    gravity: 9, owner: 'player', kind: 'potion', mesh, size: 0.12, life: 3,
    onImpact: (g, pr) => potionSplash(g, one.type, pr.x, pr.z, true),
  });
  game.viewmodel.dip();
  game.audio.swing();
  p.charge = Math.min(p.charge, 0.3);
  return true;
}

// --- Scrolls ---

export function readScroll(game, item) {
  const p = game.player, k = game.knowledge, level = game.level;
  if (p.status.blind > 0) {
    game.log('You can\'t see to read!', 'warn');
    return false;
  }
  const one = p.takeOne(item);
  game.audio.read();
  const wasKnown = k.isKnown(one);
  k.learn(one);
  const announce = () => { if (!wasKnown) game.log(`It was a ${k.name(one)}.`, 'info'); };
  switch (one.type) {
    case 'identify': {
      announce();
      const candidates = (it) => !fullyKnown(game, it);
      if (!p.inventory.some(candidates)) { game.log('You have nothing left to identify.', 'info'); return false; }
      game.ui.selectItem('Identify which item?', candidates, (it) => {
        k.identify(it);
        game.log(`It is ${k.name(it, { article: true })}.`, 'good');
      });
      return 'select';
    }
    case 'upgrade': {
      announce();
      const can = (it) => GEAR.includes(it.kind);
      if (!p.inventory.some(can)) { game.log('You feel a surge of power, but have nothing to channel it into.', 'info'); return false; }
      game.ui.selectItem('Upgrade which item?', can, (it) => upgrade(game, it));
      return 'select';
    }
    case 'enchant': {
      announce();
      // Weapons and armour, but none you know to be cursed (one you don't, it fails on: see enchantItem).
      const can = (it) => (it.kind === 'weapon' || it.kind === 'armor') && !(it.curseKnown && it.curse > 0);
      if (!p.inventory.some(can)) { game.log('The magic finds nothing it can take hold of: only weapons and armour free of curses.', 'info'); return false; }
      game.ui.selectItem('Enchant which weapon or armour?', can, (it) => enchantItem(game, it));
      return 'select';
    }
    case 'removecurse': {
      announce();
      // Anything that might be cursed: not what you know to be clean.
      const can = (it) => GEAR.includes(it.kind) && !(it.curseKnown && it.curse === 0);
      if (!p.inventory.some(can)) { game.log('A cleansing light flickers over you. You carry nothing that might be cursed.', 'info'); return false; }
      game.ui.selectItem('Cleanse which item?', can, (it) => removeCurse(game, it));
      return 'select';
    }
    case 'teleport':
      game.teleportPlayer();
      announce();
      return true;
    case 'mapping':
      level.revealAll();
      for (const t of level.traps) level.revealTrap(t);
      game.log('An image of your surroundings forms in your mind!', 'good');
      announce();
      return false;
    case 'aggravate':
      // Everything on the floor hears it, and comes to where it rang out.
      for (const m of level.monsters) if (!m.dead) m.hear(game, level);
      game.log('A piercing shriek echoes through the floor. Everything is awake now.', 'danger');
      announce();
      return false;
    case 'terror': {
      let n = 0;
      for (const m of level.monsters) {
        if (m.dead || m.boss || m.isAlly()) continue;
        if (Math.hypot(m.x - p.x, m.z - p.z) < 12 && level.los(p.x, p.z, m.x, m.z) && m.afflict(game, 'feared', 12)) n++;
      }
      game.log(n ? 'You hear maniacal laughter. The monsters flee in terror!' : 'You hear maniacal laughter in the distance.', 'good');
      announce();
      return false;
    }
    case 'summon': {
      const table = spawnTable(level.depth);
      const n = rand.int(2, 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand.range(0, 1);
        const m = level.addMonster(rand.weighted(table), p.x + Math.cos(a) * 2.2, p.z + Math.sin(a) * 2.2, { asleep: false });
        level.collide(m, m.radius, m.flies);
        m.state = 'hunt';
        burst(level, m.x, 0.5, m.z, 0x8040c0, 10, 3, 0.5);
      }
      game.log('The scroll crumbles and monsters appear around you!', 'danger');
      announce();
      return true;
    }
    case 'recharge': {
      let n = 0;
      for (const it of p.inventory) if (it.kind === 'wand') { it.charges = it.maxCharges; n++; }
      game.log(n ? 'Your wands hum with renewed power.' : 'A surge of energy crackles over you, and fades.', 'good');
      announce();
      return false;
    }
  }
  return false;
}

function fullyKnown(game, it) {
  if (it.kind === 'potion' || it.kind === 'scroll') return game.knowledge.isKnown(it);
  if (it.kind === 'wand' || it.kind === 'ring') return game.knowledge.isKnown(it) && it.identified;
  if (it.kind === 'weapon' || it.kind === 'armor') return it.identified;
  return true;
}

const GEAR = ['weapon', 'armor', 'ring', 'wand'];
const LIFT_CHANCE = 0.2; // an upgrade on something fully cursed lifts the curse outright, rather than weakening it

/**
 * A scroll of upgrade on `it`: +1 (and a wand a charge more). On something cursed, it goes into the curse instead:
 * a full curse is weakened (it no longer binds, but its effect remains), now and then lifted outright, and a weakened
 * one is lifted.
 */
function upgrade(game, it) {
  const k = game.knowledge;
  if (it.curse > 0) {
    const lifted = it.curse === 1 || rand.chance(LIFT_CHANCE);
    it.curse = lifted ? 0 : 1;
    if (lifted) it.bane = null;
    it.curseKnown = true;
    game.log(lifted ? `Light floods from the scroll, and the curse on your ${plainName(game, it)} is gone!`
      : `Your ${plainName(game, it)} glows, and the curse on it weakens: you can put it aside now, though its taint remains.`, 'good');
    return;
  }
  it.plus++;
  if (it.kind === 'wand') {
    it.maxCharges++;
    it.charges++;
  }
  it.curseKnown = true;
  game.log(`Your ${k.name(it)} glows blue for a moment.`, 'good');
}

/** A scroll of enchantment on a weapon or armour: a new enchantment at random, if it's free of every curse. */
function enchantItem(game, it) {
  const k = game.knowledge;
  if (it.curse > 0) {
    it.curseKnown = true;
    game.log(`The magic recoils from your ${plainName(game, it)}: a curse lies on it.`, 'warn');
    return;
  }
  const choices = Object.keys(ENCHANTMENTS[it.kind]).filter((e) => e !== it.enchant);
  it.enchant = rand.pick(choices);
  k.identify(it);
  game.log(`Your ${k.name(it)} shimmers as the enchantment takes hold.`, 'good');
}

/** A scroll of remove curse on one item: any curse lifted, and either way, you know it's clean now. */
function removeCurse(game, it) {
  const k = game.knowledge;
  const was = it.curse > 0;
  it.curse = 0;
  it.bane = null;
  it.curseKnown = true;
  game.log(was ? `A cleansing light washes over your ${plainName(game, it)}, and the curse on it lifts!`
    : `A cleansing light washes over your ${plainName(game, it)}. It was never cursed.`, 'good');
}

// --- Wands ---

// What each wand's bolt does to what it hits: a monster, or you when a cursed wand turns on you. `power` is the wand's +,
// adding WAND_PLUS_DMG to its damage. `known`: what it does is plain as soon as it's zapped (else, once it hits).
const WAND_BOLTS = {
  missile: { color: 0xc080ff, speed: 16, known: true,
    hit: (game, who, power, pr) => wandHurt(game, who, 'missile', power, { knockback: pr && { x: pr.vx / 16, z: pr.vz / 16 } }) },
  fire: { color: 0xff6010, speed: 13, known: true, hit: (game, who, power) => wandHurt(game, who, 'fire', power, { ignite: 5 }) },
  frost: { color: 0x9ad8ff, speed: 13, hit: (game, who, power) => wandHurt(game, who, 'frost', power, { chill: 10 + power * 2 }) },
  teleother: { color: 0x8040e0, speed: 12, hit: (game, who) => teleportOther(game, who) },
};
const WILD_BOLT = 0x70ff70; // a cursed wand's bolt, whatever it carries

function wandHurt(game, who, wand, power, opts) {
  const d = WANDS[wand], amount = rand.int(d.dmg[0], d.dmg[1]) + power * WAND_PLUS_DMG;
  if (who.isPlayer) game.hurtPlayer(amount, { source: 'a backfiring wand', type: d.dmgType, ignoreArmor: true, ...opts });
  else who.takeDamage(game, amount, { type: d.dmgType, ...opts });
}

function teleportOther(game, who) {
  if (who.isPlayer) {
    game.teleportPlayer();
    return;
  }
  const level = game.level, pos = level.randomFloorPos({ awayFrom: game.player, minDist: 18, monster: true });
  if (pos && !who.boss) {
    burst(level, who.x, 0.8, who.z, 0x8040e0, 14, 3, 0.6);
    who.x = pos.x; who.z = pos.z;
    who.state = 'wander';
    who.wander = null;
    game.log(`The ${who.name} vanishes!`, 'good');
  } else game.log(`The ${who.name} shudders but resists.`, 'warn');
}

export function zapWand(game, item) {
  if (!game.canFight()) return false;
  const p = game.player, k = game.knowledge, level = game.level;
  p.lastWand = item;
  game.viewmodel.dip();
  if (item.charges <= 0) {
    game.log('You zap the wand, but nothing happens. It is out of charges.', 'warn');
    return true;
  }
  item.charges--;
  game.audio.zap();
  const power = item.plus;
  const d = lookDir(p);
  const ox = p.x + d.x * 0.5, oy = EYE_H - 0.15 + d.y * 0.5, oz = p.z + d.z * 0.5;
  const bolt = (color, speed, onHit) => spawnProjectile(level, {
    x: ox, y: oy, z: oz, vx: d.x * speed, vy: d.y * speed, vz: d.z * speed,
    owner: 'player', kind: 'bolt', color, size: 0.14, life: 2,
    onImpact: (g, pr, target) => {
      burst(level, pr.x, pr.y, pr.z, color, 10, 2.5, 0.4);
      if (target && target !== 'player') onHit(target, pr);
      else if (!k.isKnown(item)) { k.tried.wand.add(item.type); g.log('The bolt fizzles against the wall.', 'info'); }
    },
  });
  const learn = () => { if (k.learn(item)) game.log(`This must be a ${k.name(item)}!`, 'info'); };

  // A cursed wand won't cast its own spell, but some wand's bolt at random, and it may fizzle, or turn on you.
  if (item.curse > 0) wildZap(game, item, power, bolt);
  else if (item.type === 'lightning') {
    const len = 16;
    let ex = ox, ey = oy, ez = oz;
    const hitSet = new Set();
    for (let s = 0; s < len / 0.2; s++) {
      ex += d.x * 0.2; ey += d.y * 0.2; ez += d.z * 0.2;
      if (level.blocksSight(level.toTile(ex), level.toTile(ez)) || ey < 0 || ey > 2.8) break;
      for (const m of level.monsters) {
        if (!m.dead && !m.isAlly() && !hitSet.has(m) && Math.hypot(m.x - ex, m.z - ez) < m.radius + 0.35) hitSet.add(m);
      }
    }
    transient(level, lightningMesh(ox, oy - 0.1, oz, ex, ey, ez), 0.18);
    transient(level, lightningMesh(ox, oy - 0.1, oz, ex, ey, ez, 0xffffff), 0.12);
    const w = WANDS.lightning;
    for (const m of hitSet) m.takeDamage(game, rand.int(w.dmg[0], w.dmg[1]) + power * WAND_PLUS_DMG, { type: w.dmgType });
    game.flash('#c0e0ff', 0.25);
    learn();
  } else {
    const b = WAND_BOLTS[item.type];
    bolt(b.color, b.speed, (m, pr) => {
      b.hit(game, m, power, pr);
      learn();
    });
    if (b.known) learn();
  }

  // A few zaps and you know the wand through and through: its +, and its charges (and its kind and curse, if its
  // spell hasn't shown you those already).
  if (!item.identified && --item.zapsToId <= 0) {
    k.identify(item);
    game.log(`You have used your wand enough to know it: ${k.name(item)}.`, 'info');
  }
  return true;
}

/**
 * A cursed wand's zap: some wand's bolt at random (see WAND_BOLTS) in place of its own spell, which fizzles a fifth of
 * the time (the charge spent all the same), goes off as a wild bolt carrying that spell, or, while the curse is at full
 * strength, a quarter of the time turns on you. Only bolts go in the draw: nothing like lightning's line.
 */
function wildZap(game, item, power, bolt) {
  const k = game.knowledge, p = game.player;
  const spell = WAND_BOLTS[rand.pick(Object.keys(WAND_BOLTS))];
  const roll = rand.next();
  if (!k.isKnown(item)) k.tried.wand.add(item.type);
  if (roll < 0.2) game.log('The wand sputters, and fizzles out.', 'warn');
  else if (item.curse >= 2 && roll < 0.45) {
    game.log('The wand bucks in your grip, and its magic turns on you!', 'danger');
    burst(game.level, p.x, 1.2, p.z, WILD_BOLT, 14, 2.5, 0.5);
    spell.hit(game, p, power);
  } else {
    game.log('The wand spits out a wild, flickering bolt!', 'warn');
    bolt(WILD_BOLT, 11, (m, pr) => spell.hit(game, m, power, pr));
  }
  if (!item.curseKnown) {
    item.curseKnown = true;
    game.log('The wand is cursed!', 'danger');
  }
}

// --- Equipment ---

/**
 * Which paper-doll slot equipping `item` would fill: 'weapon' | 'armor' | 'ring0' | 'ring1' | 'art0' | 'art1',
 * or null if it can't go anywhere (both rings cursed). Equipped cursed items always have curseKnown set,
 * so this never reveals a hidden curse.
 */
export function equipSlotFor(p, item) {
  const e = p.equip;
  switch (item.kind) {
    case 'weapon': return 'weapon';
    case 'armor': return 'armor';
    case 'ring': {
      let s = e.rings.indexOf(null);
      if (s < 0) s = !binds(e.rings[0]) ? 0 : !binds(e.rings[1]) ? 1 : -1;
      return s < 0 ? null : `ring${s}`;
    }
    case 'artefact': {
      const s = e.artefacts.indexOf(null);
      return `art${s < 0 ? 0 : s}`;
    }
  }
  return null;
}

/** An item's name without what you know of its curse, for messages that say it's cursed themselves. */
const plainName = (game, item) => game.knowledge.name({ ...item, curseKnown: false });

function cursedStuck(game, item) {
  item.curseKnown = true;
  game.log(`You can't remove your ${plainName(game, item)} — it is cursed!`, 'danger');
  return false;
}

export function equipItem(game, item) {
  const p = game.player, k = game.knowledge, e = p.equip;
  const name = () => k.name(item);
  // Putting on something cursed tells you so: a full curse binds it to you; a weakened one only taints you. So does
  // something enchanted, and with that, that it's free of curses (an item never has both: see enchant.js).
  const bind = () => {
    if (binds(item)) {
      item.curseKnown = true;
      game.log(`You wince as the ${plainName(game, item)} binds itself to you. It is cursed!`, 'danger');
      game.audio.curse();
    } else if (item.curse > 0 && item.kind !== 'artefact') {
      item.curseKnown = true;
      game.log(`A lingering taint creeps from the ${plainName(game, item)} into you: its curse is weakened, but not gone.`, 'warn');
    } else if (enchantOf(item) && !item.identified && !item.enchantKnown) {
      const e = enchantOf(item), n = plainName(game, item);
      item.enchantKnown = item.curseKnown = true;
      game.log(`Power stirs in the ${n}: an Enchantment of ${e.name[0].toUpperCase() + e.name.slice(1)}! ${e.desc}`, 'good');
    }
  };
  switch (item.kind) {
    case 'weapon':
      if (e.weapon && binds(e.weapon)) return cursedStuck(game, e.weapon);
      e.weapon = item;
      game.viewmodel.setWeapon(WEAPONS[item.type]);
      game.log(`You wield the ${name()}.`);
      if (p.str < WEAPONS[item.type].str) game.log('It is too heavy for you to use well.', 'warn');
      bind();
      break;
    case 'armor':
      if (e.armor && binds(e.armor)) return cursedStuck(game, e.armor);
      e.armor = item;
      game.log(`You strap on the ${name()}.`);
      if (p.str < ARMORS[item.type].str) game.log('Its weight slows you down.', 'warn');
      bind();
      break;
    case 'ring': {
      const key = equipSlotFor(p, item);
      if (!key) return cursedStuck(game, e.rings[0]);
      const slot = +key.slice(4);
      e.rings[slot] = item;
      game.log(`You slip the ${name()} onto your finger.`);
      bind();
      break;
    }
    case 'artefact': {
      const slot = +equipSlotFor(p, item).slice(3);
      e.artefacts[slot] = item;
      p.artefactCD[slot] = 0;
      const a = ARTEFACTS[item.type];
      game.log(`You attune yourself to the ${a.name}.${a.active ? ` Press ${slot === 0 ? 'R' : 'T'} to use it.` : ''}`, 'good');
      break;
    }
  }
  p.charge = 0;
  game.audio.equip();
  return false;
}

export function unequipItem(game, item, silent = false) {
  const p = game.player, k = game.knowledge, e = p.equip;
  if (binds(item)) return cursedStuck(game, item);
  if (e.weapon === item) { e.weapon = null; game.viewmodel.setWeapon(null); }
  if (e.armor === item) e.armor = null;
  e.rings = e.rings.map((r) => (r === item ? null : r));
  e.artefacts = e.artefacts.map((r) => (r === item ? null : r));
  if (!silent) game.log(`You take off the ${k.name(item)}.`);
  return true;
}

export function dropItem(game, item) {
  const p = game.player;
  if (p.isEquipped(item) && !unequipItem(game, item, true)) return false;
  p.inventory.splice(p.inventory.indexOf(item), 1);
  if (p.lastWand === item) p.lastWand = null;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const pos = game.level.landSpot(p.x + fx * 0.7, p.z + fz * 0.7);
  game.level.collide(pos, 0.2);
  game.level.addItem(item, pos.x, pos.z);
  game.log(`You drop ${game.knowledge.name(item, { article: true })}.`);
  return false;
}

/** Sells one of an item (one from a stack) to the shopkeeper. */
export function sellItem(game, item) {
  const p = game.player, level = game.level;
  if (p.isEquipped(item) && !unequipItem(game, item, true)) return false;
  const one = p.takeOne(item);
  if (p.lastWand === one) p.lastWand = null;
  const price = sellPrice(one, level.depth, game.knowledge);
  p.gold += price;
  game.audio.coins();
  game.log(`You sell ${game.knowledge.name(one, { article: true })} for ${price} gold.`, 'good');
  level.displaySold(one);
  level.shopkeeper.boughtFromPlayer(game);
  return false;
}

// --- Artefact active powers ---

export function activateArtefact(game, slot) {
  const p = game.player, level = game.level;
  const a = p.artefactSlotActive(slot);
  if (!a) {
    game.log(`You have no artefact with an active power in slot ${slot + 1}.`, 'info');
    return;
  }
  const def = ARTEFACTS[a.type];
  if (p.artefactCD[slot] > 0) {
    game.log(`The ${def.name} is not ready (${Math.ceil(p.artefactCD[slot])}s).`, 'info');
    return;
  }
  if (a.type === 'horn' && !game.canFight()) return;
  p.artefactCD[slot] = def.active.cooldown;
  if (a.type === 'horn') {
    game.audio.horn();
    game.shake(0.3);
    ring(level, p.x, p.z, 0xd0a040, 6, 0.6);
    for (const m of level.monsters) {
      if (m.dead || m.isAlly()) continue; // (it spares your allies)
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      if (d > 6.5) continue;
      m.afflict(game, 'paralysed', 3.5); // (a boss shakes it off in half the time)
      m.takeDamage(game, rand.int(2, 6), { type: 'magic' }); // a thunderclap of raw magic
      if (!m.boss) {
        m.x += (dx / (d || 1)) * 1.8;
        m.z += (dz / (d || 1)) * 1.8;
        level.collide(m, m.radius, m.flies);
      }
    }
    game.log('You sound the Horn of Thunder. The very stones shudder!', 'good');
  } else if (a.type === 'cloak') {
    p.addStatus('invisible', 8, game);
    for (const m of level.monsters) if (m.state === 'hunt') { m.state = 'wander'; m.wander = null; }
    game.log('You draw the Cloak of Shadows about you and vanish.', 'good');
    game.audio.teleport();
  }
}

