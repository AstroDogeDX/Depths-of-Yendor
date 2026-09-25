import { WEAPONS, ARMORS, FOOD, ARTEFACTS, WANDS } from './defs.js';
import { buildItemModel } from './models.js';
import { HUNGER_MAX, EYE_H } from '../config.js';
import { rand } from '../rng.js';
import { spawnProjectile } from '../fx/projectiles.js';
import { burst, ring, transient, lightningMesh } from '../fx/particles.js';
import { spawnTable } from '../monsters/defs.js';
import { sellPrice } from './generate.js';
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
  const price = game.level.shopkeeper && game.level.playerInShop ? sellPrice(item, game.level.depth) : 0;
  if (price) acts.push({ label: `Sell${item.qty > 1 ? ' one' : ''} (${price} gold)`, fn: () => sellItem(game, item) });
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
    case 'enchant': {
      announce();
      const can = (it) => ['weapon', 'armor', 'ring', 'wand'].includes(it.kind);
      if (!p.inventory.some(can)) { game.log('You feel a surge of power, but have nothing to channel it into.', 'info'); return false; }
      game.ui.selectItem('Enchant which item?', can, (it) => {
        enchant(game, it);
      });
      return 'select';
    }
    case 'removecurse': {
      let n = 0;
      for (const it of p.inventory) {
        if (it.cursed) { it.cursed = false; it.curseKnown = true; n++; }
        else if (['weapon', 'armor', 'ring'].includes(it.kind)) it.curseKnown = true;
      }
      game.log(n ? 'A cleansing light washes over your pack. The curses are lifted!' : 'A cleansing light washes over your pack. You carry nothing cursed.', 'good');
      announce();
      return false;
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

function enchant(game, it) {
  const k = game.knowledge;
  if (it.kind === 'wand') {
    it.maxCharges++;
    it.charges = it.maxCharges;
    it.ench = (it.ench || 0) + 1;
  } else {
    it.ench++;
  }
  const wasCursed = it.cursed;
  it.cursed = false;
  if (it.kind !== 'wand') it.curseKnown = true;
  game.log(`Your ${k.name(it)} glows blue for a moment.${wasCursed ? ' The malevolent aura around it fades.' : ''}`, 'good');
}

// --- Wands ---

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
  const d = lookDir(p);
  const ox = p.x + d.x * 0.5, oy = EYE_H - 0.15 + d.y * 0.5, oz = p.z + d.z * 0.5;
  const power = item.ench || 0;
  const type = WANDS[item.type].dmgType;
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

  switch (item.type) {
    case 'missile':
      bolt(0xc080ff, 16, (m, pr) => m.takeDamage(game, rand.int(4, 9) + power * 2, { type, knockback: { x: pr.vx / 16, z: pr.vz / 16 } }));
      learn();
      break;
    case 'fire':
      bolt(0xff6010, 13, (m) => {
        m.takeDamage(game, rand.int(5, 10) + power * 2, { type, ignite: 5 });
      });
      learn();
      break;
    case 'lightning': {
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
      for (const m of hitSet) m.takeDamage(game, rand.int(6, 12) + power * 2, { type });
      game.flash('#c0e0ff', 0.25);
      learn();
      break;
    }
    case 'frost':
      bolt(0x9ad8ff, 13, (m) => {
        m.takeDamage(game, rand.int(3, 7) + power * 2, { type, chill: 10 + power * 2 });
        learn();
      });
      break;
    case 'teleother':
      bolt(0x8040e0, 12, (m) => {
        const pos = level.randomFloorPos({ awayFrom: p, minDist: 18, monster: true });
        if (pos && !m.boss) {
          burst(level, m.x, 0.8, m.z, 0x8040e0, 14, 3, 0.6);
          m.x = pos.x; m.z = pos.z;
          m.state = 'wander';
          m.wander = null;
          game.log(`The ${m.name} vanishes!`, 'good');
        } else game.log(`The ${m.name} shudders but resists.`, 'warn');
        learn();
      });
      break;
  }
  return true;
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
      if (s < 0) s = !e.rings[0].cursed ? 0 : !e.rings[1].cursed ? 1 : -1;
      return s < 0 ? null : `ring${s}`;
    }
    case 'artefact': {
      const s = e.artefacts.indexOf(null);
      return `art${s < 0 ? 0 : s}`;
    }
  }
  return null;
}

/** An item's name without the "(cursed)" tag, for messages that say it's cursed themselves. */
const plainName = (game, item) => game.knowledge.name({ ...item, curseKnown: false });

function cursedStuck(game, item) {
  item.curseKnown = true;
  game.log(`You can't remove your ${plainName(game, item)} — it is cursed!`, 'danger');
  return false;
}

export function equipItem(game, item) {
  const p = game.player, k = game.knowledge, e = p.equip;
  const name = () => k.name(item);
  const bind = () => {
    if (item.cursed) {
      item.curseKnown = true;
      game.log(`You wince as the ${plainName(game, item)} binds itself to you. It is cursed!`, 'danger');
      game.audio.curse();
    }
  };
  switch (item.kind) {
    case 'weapon':
      if (e.weapon?.cursed) return cursedStuck(game, e.weapon);
      e.weapon = item;
      game.viewmodel.setWeapon(WEAPONS[item.type]);
      game.log(`You wield the ${name()}.`);
      if (p.str < WEAPONS[item.type].str) game.log('It is too heavy for you to use well.', 'warn');
      bind();
      break;
    case 'armor':
      if (e.armor?.cursed) return cursedStuck(game, e.armor);
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
  if (item.cursed && item.kind !== 'artefact') return cursedStuck(game, item);
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
  const price = sellPrice(one, level.depth);
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

