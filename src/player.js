import {
  PLAYER_RADIUS, PLAYER_SPEED, TURN_SPEED, MOUSE_SENS, HUNGER_MAX, HUNGER_HUNGRY, HUNGER_FAMISHED, INVENTORY_SIZE, HOTBAR_SIZE,
  STAMINA_BASE, STAMINA_PER_LEVEL, STAMINA_DRAIN, STAMINA_REGEN, STAMINA_REGEN_DELAY, STAMINA_RECOVER, MODE_SPEED, NOISE,
} from './config.js';
import { WEAPONS, ARMORS, ARTEFACTS } from './items/defs.js';
import { stackable } from './items/generate.js';
import { playerStrike } from './combat.js';
import { damageType, damageMult } from './damage.js';
import { STATUSES, blankStatus, restoreStatus, saveStatus, afflict, tickStatuses } from './status.js';
import { rand } from './rng.js';
import { round2 } from './save.js';

// What a save keeps of you as it is (see snapshot): the rest is either rebuilt or not worth keeping.
const SAVED = [
  'x', 'z', 'yaw', 'pitch', 'maxHp', 'hp', 'baseStr', 'level', 'xp', 'gold', 'hunger', 'hungerState', 'charge',
  'maxStamina', 'stamina', 'winded', 'sneaking', 'artefactCD', 'teleT', 'kills', 'maxDepth', 'keys', 'hotbar', 'inventory',
];

const FISTS = { name: 'fists', dmgType: 'bash', dmg: [1, 3], recharge: 0.6, reach: 1.4, str: 0, model: null };

export class Player {
  constructor() {
    this.x = 0; this.z = 0; this.yaw = 0; this.pitch = 0;
    this.maxHp = 24; this.hp = 24;
    this.baseStr = 12;
    this.level = 1; this.xp = 0;
    this.gold = 0;
    this.hunger = HUNGER_MAX;
    this.inventory = [];
    this.equip = { weapon: null, armor: null, rings: [null, null], artefacts: [null, null] };
    this.hotbar = new Array(HOTBAR_SIZE).fill(null);
    this.keys = {}; // depth -> iron keys held for that floor
    this.charge = 1;
    this.maxStamina = STAMINA_BASE;
    this.stamina = STAMINA_BASE;
    this.winded = false; // ran dry: no sprinting or sneaking until it recovers
    this.staminaRestT = 0;
    this.mode = 'walk'; // walk | sprint | sneak
    this.sneaking = false; // toggled with C (see update)
    this.crouch = 0; // 0..1, eases the camera down while sneaking
    this.noise = 0; // metres of walking distance at which monsters can hear you this frame
    this.swingT = -1; this.swingDur = 0.3; this.swingHit = false; this.swingPower = 1;
    this.status = blankStatus(true); // seconds left of each status (see status.js)
    this.isPlayer = true;
    this.boss = false;
    this.artefactCD = [0, 0];
    this.regenT = 0; this.dotT = 0; this.starveT = 0; this.teleT = rand.range(40, 90);
    this.moving = false; this.bob = 0;
    this.kills = 0;
    this.maxDepth = 1;
    this.lastWand = null;
    this.hungerState = 0;
    this.lastTrapTile = -1;
    this.creeping = null; // a found trap you're sneaking over (see update)
  }

  // --- Saving (see Game.save) ---

  /** What a save keeps of you. Your things go as they are; what's equipped (and your last wand) by uid. */
  snapshot() {
    const s = {};
    for (const k of SAVED) s[k] = typeof this[k] === 'number' ? round2(this[k]) : this[k];
    const uid = (item) => item?.uid ?? null;
    const e = this.equip;
    s.equip = { weapon: uid(e.weapon), armor: uid(e.armor), rings: e.rings.map(uid), artefacts: e.artefacts.map(uid) };
    s.lastWand = uid(this.lastWand);
    s.status = saveStatus(this.status);
    return s;
  }

  /** Takes up where snapshot() left you. */
  restore(s) {
    for (const k of SAVED) if (k in s) this[k] = s[k];
    const byUid = (uid) => (uid == null ? null : this.inventory.find((it) => it.uid === uid) ?? null);
    this.equip = {
      weapon: byUid(s.equip.weapon), armor: byUid(s.equip.armor),
      rings: s.equip.rings.map(byUid), artefacts: s.equip.artefacts.map(byUid),
    };
    this.lastWand = byUid(s.lastWand);
    restoreStatus(this.status, s.status);
  }

  // --- Derived stats ---

  ringBonus(type) {
    let b = 0;
    for (const r of this.equip.rings) if (r && r.type === type) b += r.ench;
    return b;
  }
  wearingRing(type) { return this.equip.rings.some((r) => r && r.type === type); }
  hasArtefact(type) { return this.equip.artefacts.some((a) => a && a.type === type); }
  hasAmulet() { return this.inventory.some((i) => i.kind === 'amulet'); }

  get str() { return this.baseStr + this.ringBonus('strength') - (this.status.weakened > 0 ? 3 : 0); }

  /** Paralysed or frozen: no moving, looking, fighting or using things. */
  held() { return this.status.paralysed > 0 || this.status.frozen > 0; }

  weaponStats() {
    const it = this.equip.weapon;
    const d = it ? WEAPONS[it.type] : FISTS;
    const ench = it ? it.ench : 0;
    const short = Math.max(0, d.str - this.str);
    return {
      dmg: d.dmg, dmgType: damageType(d), ench, reach: d.reach, model: d.model,
      recharge: (d.recharge * (1 + short * 0.15) * (this.status.chilled > 0 ? 1.25 : 1)) / (this.status.hasted > 0 ? 1.35 : 1),
      accuracy: ench * 0.03 - short * 0.08,
      excess: Math.max(0, this.str - d.str),
    };
  }

  /** The multiplier on damage of this type you take (see damage.js), from your armour and artefacts' `resist`. */
  resistMult(type) {
    let mult = 1;
    const a = this.equip.armor;
    if (a) mult *= damageMult(ARMORS[a.type], type);
    for (const art of this.equip.artefacts) if (art) mult *= damageMult(ARTEFACTS[art.type], type);
    return mult;
  }

  get defense() {
    const a = this.equip.armor;
    return Math.max(0, (a ? ARMORS[a.type].def + a.ench : 0) + this.ringBonus('protection'));
  }

  moveSpeed() {
    let s = PLAYER_SPEED;
    if (this.status.hasted > 0) s *= 1.45;
    if (this.status.chilled > 0) s *= 0.6;
    if (this.hasArtefact('boots')) s *= 1.33;
    const a = this.equip.armor;
    if (a) s *= Math.max(0.6, 1 - Math.max(0, ARMORS[a.type].str - this.str) * 0.08);
    if (this.hunger <= 0) s *= 0.8;
    return s;
  }

  /** Multiplier on monsters' chance to notice you (lower is stealthier). */
  stealth() {
    let s = 1;
    if (this.wearingRing('stealth')) s *= Math.max(0.15, 0.5 - this.ringBonus('stealth') * 0.1);
    if (this.heavyArmor()) s *= 1.25;
    if (!this.moving) s *= 0.7;
    return s;
  }

  evasion() { return this.level * 0.008; }
  // There are about 2.7 floors to each step of `danger`, each with its usual share of monsters, so levels take
  // that much more experience: your level keeps pace with how dangerous the floors get.
  xpToNext() { return 21 + this.level * 16; }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  /** Gives you a status (see status.js). Returns whether it took. */
  addStatus(key, dur, game) { return afflict(game, this, key, dur); }

  hasTrait() { return false; }

  /** The log's word on what's happened to one of your statuses (see status.js). */
  statusNote(game, key, event) {
    const def = STATUSES[key];
    if (event === 'start' && def.start) game.log(...def.start);
    else if (event === 'end' && def.end) game.log(def.end, 'info');
    else if (event === 'doused') game.log('The flames on you go out.', 'good');
    else if (event === 'thawed') game.log('Warmth floods back into your limbs.', 'good');
  }

  gainXp(n, game) {
    this.xp += n;
    while (this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.levelUp(game);
    }
  }

  levelUp(game) {
    this.level++;
    const gain = rand.int(4, 6);
    this.maxHp += gain;
    this.hp += gain;
    this.maxStamina += STAMINA_PER_LEVEL;
    this.stamina += STAMINA_PER_LEVEL;
    game.log(`Welcome to experience level ${this.level}!`, 'good');
    game.audio.levelUp();
  }

  // --- Inventory ---

  packCount() { return this.inventory.length; }

  /** Adds an item, stacking where possible. Returns false if the pack is full. */
  addItem(item) {
    if (item.kind === 'gold') {
      this.gold += item.qty;
      return true;
    }
    if (item.kind === 'key') {
      this.keys[item.depth] = (this.keys[item.depth] || 0) + 1;
      return true;
    }
    if (stackable(item)) {
      const same = this.inventory.find((i) => i.kind === item.kind && i.type === item.type);
      if (same) {
        same.qty += item.qty;
        return true;
      }
    }
    // The Amulet always fits: a full pack must never block the end of the quest.
    if (this.inventory.length >= INVENTORY_SIZE && item.kind !== 'amulet') return false;
    this.inventory.push(item);
    return true;
  }

  /** Removes one of an item (splitting stacks). Returns the removed instance. */
  takeOne(item) {
    if (item.qty > 1) {
      item.qty--;
      return { ...item, qty: 1 };
    }
    const i = this.inventory.indexOf(item);
    if (i >= 0) this.inventory.splice(i, 1);
    return item;
  }

  isEquipped(item) {
    const e = this.equip;
    return e.weapon === item || e.armor === item || e.rings.includes(item) || e.artefacts.includes(item);
  }

  // --- Per-frame ---

  update(dt, game, input) {
    const level = game.level;
    this.tickStatus(dt, game);
    if (game.over) return;
    const para = this.held();

    if (!para) {
      this.yaw -= input.mouseDX * MOUSE_SENS;
      this.pitch -= input.mouseDY * MOUSE_SENS;
      if (input.down('ArrowLeft')) this.yaw += TURN_SPEED * dt;
      if (input.down('ArrowRight')) this.yaw -= TURN_SPEED * dt;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));
    }

    let f = 0, s = 0;
    if (!para) {
      if (input.down('KeyW') || input.down('ArrowUp')) f += 1;
      if (input.down('KeyS') || input.down('ArrowDown')) f -= 1;
      if (input.down('KeyD')) s += 1;
      if (input.down('KeyA')) s -= 1;
    }
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = fx * f + rx * s, mz = fz * f + rz * s;
    const ml = Math.hypot(mx, mz);
    this.moving = ml > 0;
    // C toggles sneaking. Sprinting stands you back up, and so does running out of breath (else you'd drop back
    // into a crouch the moment it came back). Neither costs anything while standing still.
    if (!para && input.wasPressed('KeyC')) this.sneaking = !this.sneaking;
    if (input.sprint || this.winded) this.sneaking = false;
    let mode = para ? 'walk' : this.sneaking ? 'sneak' : input.sprint ? 'sprint' : 'walk';
    if (this.winded) mode = 'walk';
    this.mode = mode;
    this.crouch += ((mode === 'sneak' ? 1 : 0) - this.crouch) * Math.min(1, dt * 8);
    this.updateStamina(dt, game, this.moving && mode !== 'walk');
    this.noise = this.moving ? NOISE[mode] * (this.heavyArmor() ? 1.25 : 1) : 0;
    if (this.moving) {
      mx /= ml; mz /= ml;
      if (this.status.confused > 0) {
        const a = Math.sin(game.time * 1.3) * 1.6 + Math.sin(game.time * 3.7) * 0.6;
        const c = Math.cos(a), sn = Math.sin(a);
        [mx, mz] = [mx * c - mz * sn, mx * sn + mz * c];
      }
      const sp = this.moveSpeed() * MODE_SPEED[mode];
      this.x += mx * sp * dt;
      this.z += mz * sp * dt;
      const before = Math.floor(this.bob / Math.PI);
      this.bob += dt * 8.5 * (sp / PLAYER_SPEED);
      if (Math.floor(this.bob / Math.PI) !== before) game.audio.step(mode);
      // Walking into a closed door opens it (or tries its lock).
      const door = level.doorAhead(this.x, this.z, mx, mz, PLAYER_RADIUS);
      if (door) game.useDoor(door);
    }
    level.collide(this, PLAYER_RADIUS);
    for (const m of level.monsters) {
      if (m.dead) continue;
      const dx = this.x - m.x, dz = this.z - m.z, d = Math.hypot(dx, dz), min = PLAYER_RADIUS + m.radius;
      if (d < min && d > 1e-5) {
        this.x = m.x + (dx / d) * min;
        this.z = m.z + (dz / d) * min;
      }
    }
    level.collide(this, PLAYER_RADIUS);

    // King's Field attack meter: a click swings once it's above 20% and damage scales with the charge;
    // holding the button only re-swings at full charge, so mashing never beats timing.
    const w = this.weaponStats();
    this.charge = Math.min(1, this.charge + dt / w.recharge);
    if (this.swingT >= 0) {
      this.swingT += dt;
      if (!this.swingHit && this.swingT >= this.swingDur * 0.45) {
        this.swingHit = true;
        playerStrike(game, this.swingPower);
      }
      if (this.swingT >= this.swingDur) this.swingT = -1;
    } else if (!para && ((input.attackPressed && this.charge >= 0.2) || (input.attack && this.charge >= 1)) && game.canFight()) {
      this.swingPower = 0.3 + 0.7 * this.charge;
      this.charge = 0;
      this.swingT = 0;
      this.swingHit = false;
      this.swingDur = Math.max(0.24, Math.min(0.45, w.recharge * 0.35));
      game.viewmodel.swing(this.swingDur);
      game.audio.swing();
    }

    for (let i = 0; i < 2; i++) this.artefactCD[i] = Math.max(0, this.artefactCD[i] - dt);

    this.updateHunger(dt, game);
    this.updateRegen(dt);
    this.updateGear(dt, game);

    // Traps trigger when you step onto their tile, unless you sneak onto one you've found: then you creep over it,
    // and it goes off only if you stop sneaking (tap C, sprint, or get winded) before you're off it. Sneaking
    // doesn't disarm it, and it's no help with a trap you don't know is there.
    const tx = level.toTile(this.x), ty = level.toTile(this.z);
    const tileIdx = level.idx(tx, ty);
    if (tileIdx !== this.lastTrapTile) {
      this.lastTrapTile = tileIdx;
      this.creeping = null;
      const trap = level.trapAt(tx, ty);
      if (trap && mode === 'sneak' && !trap.hidden) {
        this.creeping = trap;
        game.log(`You creep over the ${trap.type} trap, careful not to set it off.`, 'info');
      } else if (trap) game.triggerTrap(trap);
    } else if (this.creeping && mode !== 'sneak') {
      const trap = this.creeping;
      this.creeping = null;
      if (!trap.triggered && level.trapAt(tx, ty) === trap) {
        game.log('Your weight comes down on the plate!', 'warn');
        game.triggerTrap(trap);
      }
    }
  }

  tickStatus(dt, game) { tickStatuses(game, this, dt); }

  updateStamina(dt, game, spending) {
    if (spending) {
      this.stamina = Math.max(0, this.stamina - dt * STAMINA_DRAIN[this.mode]);
      this.staminaRestT = 0;
      if (this.stamina <= 0 && !this.winded) {
        this.winded = true;
        this.mode = 'walk';
        game.log('You are out of breath.', 'warn');
      }
      return;
    }
    this.staminaRestT += dt;
    if (this.staminaRestT > STAMINA_REGEN_DELAY) {
      this.stamina = Math.min(this.maxStamina, this.stamina + dt * STAMINA_REGEN * (this.moving ? 1 : 1.5));
    }
    if (this.winded && this.stamina >= this.maxStamina * STAMINA_RECOVER) this.winded = false;
  }

  heavyArmor() {
    const a = this.equip.armor;
    return !!a && (a.type === 'plate' || a.type === 'splint');
  }

  updateHunger(dt, game) {
    let rate = 1;
    if (this.wearingRing('sustenance')) rate = this.ringBonus('sustenance') >= 0 ? 0.4 : 1.6;
    if (this.wearingRing('regeneration')) rate *= 1.3;
    this.hunger = Math.max(0, this.hunger - dt * rate);
    // Hungry is a warning; Famished, your wounds stop healing; Starving, you waste away.
    const state = this.hunger <= 0 ? 3 : this.hunger < HUNGER_FAMISHED ? 2 : this.hunger < HUNGER_HUNGRY ? 1 : 0;
    if (state > this.hungerState) {
      game.log(['', 'You are getting hungry.', "You are famished. Your wounds won't heal until you eat.", 'You are starving to death!'][state],
        state > 1 ? 'danger' : 'warn');
    }
    this.hungerState = state;
    if (this.hunger <= 0) {
      this.starveT += dt;
      if (this.starveT >= 3) {
        this.starveT = 0;
        game.hurtPlayer(1, { source: 'starvation', ignoreArmor: true, dot: true });
      }
    }
  }

  updateRegen(dt) {
    // Nothing heals while you're famished, poisoned or bleeding.
    if (this.hunger < HUNGER_FAMISHED || this.hp >= this.maxHp || this.status.poisoned > 0 || this.status.bleeding > 0) return;
    let mult = 1;
    if (this.wearingRing('regeneration')) mult = Math.max(0.25, 1 + this.ringBonus('regeneration') * 0.8);
    const interval = Math.max(1.5, 8 - this.level * 0.35);
    this.regenT += dt * mult;
    while (this.regenT >= interval) {
      this.regenT -= interval;
      this.heal(1);
    }
  }

  updateGear(dt, game) {
    for (const it of this.inventory) {
      if (it.kind === 'wand' && it.charges < it.maxCharges) {
        it.rechargeT += dt;
        if (it.rechargeT >= 75) {
          it.rechargeT = 0;
          it.charges++;
        }
      }
    }
    for (const r of this.equip.rings) {
      if (!r || r.identified) continue;
      r.wornTime += dt;
      if (r.wornTime >= 100) {
        game.knowledge.identify(r);
        game.log(`You have worn your ring long enough to know it: ${game.knowledge.name(r)}.`, 'info');
      }
    }
    if (this.wearingRing('teleportation')) {
      this.teleT -= dt;
      if (this.teleT <= 0) {
        this.teleT = rand.range(40, 90);
        const ring = this.equip.rings.find((r) => r && r.type === 'teleportation');
        game.teleportPlayer();
        if (game.knowledge.learn(ring)) game.log('Your ring must be one of teleportation!', 'warn');
      }
    }
  }

  artefactSlotActive(i) {
    const a = this.equip.artefacts[i];
    return a && ARTEFACTS[a.type].active ? a : null;
  }
}
