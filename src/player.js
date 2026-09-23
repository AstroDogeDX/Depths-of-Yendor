import {
  PLAYER_RADIUS, PLAYER_SPEED, TURN_SPEED, MOUSE_SENS, HUNGER_MAX, HUNGER_HUNGRY, HUNGER_WEAK, INVENTORY_SIZE, HOTBAR_SIZE,
} from './config.js';
import { WEAPONS, ARMORS, ARTEFACTS } from './items/defs.js';
import { stackable } from './items/generate.js';
import { playerStrike } from './combat.js';
import { rand } from './rng.js';

const FISTS = { dmg: [1, 3], recharge: 0.6, reach: 1.4, str: 0, model: null };

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
    this.charge = 1;
    this.swingT = -1; this.swingDur = 0.3; this.swingHit = false; this.swingPower = 1;
    this.status = { haste: 0, poison: 0, confusion: 0, blind: 0, paralysis: 0, mindvision: 0, invisible: 0, burning: 0 };
    this.artefactCD = [0, 0];
    this.regenT = 0; this.dotT = 0; this.starveT = 0; this.teleT = rand.range(40, 90);
    this.moving = false; this.bob = 0;
    this.kills = 0;
    this.maxDepth = 1;
    this.lastWand = null;
    this.hungerState = 0;
    this.lastTrapTile = -1;
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

  get str() { return this.baseStr + this.ringBonus('strength') - (this.hunger < HUNGER_WEAK ? 1 : 0); }

  weaponStats() {
    const it = this.equip.weapon;
    const d = it ? WEAPONS[it.type] : FISTS;
    const ench = it ? it.ench : 0;
    const short = Math.max(0, d.str - this.str);
    return {
      dmg: d.dmg, ench, reach: d.reach, model: d.model,
      recharge: (d.recharge * (1 + short * 0.15)) / (this.status.haste > 0 ? 1.35 : 1),
      accuracy: ench * 0.03 - short * 0.08,
      excess: Math.max(0, this.str - d.str),
    };
  }

  get defense() {
    const a = this.equip.armor;
    return Math.max(0, (a ? ARMORS[a.type].def + a.ench : 0) + this.ringBonus('protection'));
  }

  moveSpeed() {
    let s = PLAYER_SPEED;
    if (this.status.haste > 0) s *= 1.45;
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
    const a = this.equip.armor;
    if (a && (a.type === 'plate' || a.type === 'splint')) s *= 1.25;
    if (!this.moving) s *= 0.7;
    return s;
  }

  evasion() { return this.level * 0.008; }
  xpToNext() { return 8 + this.level * 6; }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  addStatus(key, dur, game) {
    if (key === 'burning' && this.hasArtefact('ember')) return;
    const fresh = this.status[key] <= 0;
    this.status[key] = Math.max(this.status[key], dur);
    if (fresh && game) {
      const msg = {
        poison: ['You feel very sick.', 'danger'], confusion: ['Huh? What? Where am I?', 'warn'],
        blind: ['Darkness swallows your sight!', 'warn'], paralysis: ['Your limbs lock rigid!', 'danger'],
        burning: ['You are on fire!', 'danger'],
      }[key];
      if (msg) game.log(...msg);
    }
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
    const para = this.status.paralysis > 0;

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
    if (this.moving) {
      mx /= ml; mz /= ml;
      if (this.status.confusion > 0) {
        const a = Math.sin(game.time * 1.3) * 1.6 + Math.sin(game.time * 3.7) * 0.6;
        const c = Math.cos(a), sn = Math.sin(a);
        [mx, mz] = [mx * c - mz * sn, mx * sn + mz * c];
      }
      const sp = this.moveSpeed();
      this.x += mx * sp * dt;
      this.z += mz * sp * dt;
      const before = Math.floor(this.bob / Math.PI);
      this.bob += dt * 8.5 * (sp / PLAYER_SPEED);
      if (Math.floor(this.bob / Math.PI) !== before) game.audio.step();
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
    } else if (!para && ((input.attackPressed && this.charge >= 0.2) || (input.attack && this.charge >= 1))) {
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

    // Traps trigger when you step onto their tile.
    const tx = level.toTile(this.x), ty = level.toTile(this.z);
    const tileIdx = level.idx(tx, ty);
    if (tileIdx !== this.lastTrapTile) {
      this.lastTrapTile = tileIdx;
      const trap = level.trapAt(tx, ty);
      if (trap) game.triggerTrap(trap);
    }
  }

  tickStatus(dt, game) {
    const s = this.status;
    const was = { ...s };
    for (const k in s) if (s[k] > 0) s[k] = Math.max(0, s[k] - dt);
    const ended = {
      haste: 'You feel yourself slow down.', confusion: 'You feel less confused now.',
      blind: 'Your sight returns.', paralysis: 'You can move again.', mindvision: 'Your mind\'s eye closes.',
      invisible: 'You fade back into view.', poison: 'You feel less sick.',
    };
    for (const k in ended) if (was[k] > 0 && s[k] <= 0) game.log(ended[k], 'info');

    if (s.poison > 0 || s.burning > 0) {
      this.dotT += dt;
      if (this.dotT >= 1) {
        this.dotT -= 1;
        if (s.poison > 0) game.hurtPlayer(1 + Math.floor(game.level.depth / 4), { source: 'poison', ignoreArmor: true, dot: true });
        if (s.burning > 0 && !game.over) game.hurtPlayer(rand.int(1, 3), { source: 'flames', ignoreArmor: true, dot: true, fire: true });
      }
    }
  }

  updateHunger(dt, game) {
    let rate = 1;
    if (this.wearingRing('sustenance')) rate = this.ringBonus('sustenance') >= 0 ? 0.4 : 1.6;
    if (this.wearingRing('regeneration')) rate *= 1.3;
    this.hunger = Math.max(0, this.hunger - dt * rate);
    const state = this.hunger <= 0 ? 3 : this.hunger < HUNGER_WEAK ? 2 : this.hunger < HUNGER_HUNGRY ? 1 : 0;
    if (state > this.hungerState) {
      game.log(['', 'You are getting hungry.', 'You feel weak with hunger!', 'You are starving to death!'][state], state > 1 ? 'danger' : 'warn');
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
    if (this.hunger <= 0 || this.hp >= this.maxHp || this.status.poison > 0) return;
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
