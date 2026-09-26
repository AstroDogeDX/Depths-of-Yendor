import {
  WEAPONS, ARMORS, POTIONS, SCROLLS, WANDS, RINGS, ARTEFACTS, FOOD,
  POTION_COLORS, SCROLL_SYLLABLES, WAND_MATERIALS, RING_GEMS,
} from './defs.js';
import { DAMAGE_TYPES, damageType, describeResist } from '../damage.js';
import { WAND_PLUS_DMG, wandRecharge } from './defs.js';
import { enchantOf, baneOf } from './enchant.js';

const GEAR = new Set(['weapon', 'armor', 'ring', 'wand']);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** What you know of an item's curse, in words (or '' if you don't know). */
function curseNote(item) {
  if (!item.curseKnown) return '';
  if (item.curse >= 2) return 'A malevolent curse clings to it: once put on, it won\'t come off.';
  if (item.curse === 1) return 'Its curse is weakened: you can put it aside, though its taint remains.';
  return 'It is free of curses.';
}

/** A weapon's or armour's Enchantment or Curse of ___, as far as you know it: [label, description] or null. */
function effectOf(item) {
  const e = (item.identified || item.enchantKnown) && enchantOf(item);
  if (e) return [`Enchantment of ${cap(e.name)}`, e];
  const b = item.curseKnown && baneOf(item);
  return b ? [`Curse of ${cap(b.name)}`, b] : null;
}

// Per-run knowledge: which unidentified appearance maps to which item type, and what the player knows.
export class Knowledge {
  constructor(rng) {
    this.appearance = { potion: {}, scroll: {}, wand: {}, ring: {} };
    this.known = { potion: new Set(), scroll: new Set(), wand: new Set(), ring: new Set() };
    this.tried = { potion: new Set(), scroll: new Set(), wand: new Set(), ring: new Set() };
    this.resists = new Set(); // "monster:damage type" pairs you've seen it resist or be weak to (see learnResist)

    const colors = rng.shuffle([...POTION_COLORS]);
    Object.keys(POTIONS).forEach((k, i) => (this.appearance.potion[k] = colors[i]));

    const usedLabels = new Set();
    for (const k of Object.keys(SCROLLS)) {
      let label;
      do {
        const words = rng.int(1, 2);
        const parts = [];
        for (let w = 0; w < words; w++) {
          let word = '';
          const syl = rng.int(2, 3);
          for (let s = 0; s < syl; s++) word += rng.pick(SCROLL_SYLLABLES);
          parts.push(word);
        }
        label = parts.join(' ');
      } while (usedLabels.has(label));
      usedLabels.add(label);
      this.appearance.scroll[k] = { name: label, color: 0xd8c8a0 };
    }

    const woods = rng.shuffle([...WAND_MATERIALS]);
    Object.keys(WANDS).forEach((k, i) => (this.appearance.wand[k] = woods[i]));

    const gems = rng.shuffle([...RING_GEMS]);
    Object.keys(RINGS).forEach((k, i) => (this.appearance.ring[k] = gems[i]));
  }

  isKnown(item) {
    const set = this.known[item.kind];
    return set ? set.has(item.type) : true;
  }

  learn(item) {
    const set = this.known[item.kind];
    if (set && !set.has(item.type)) {
      set.add(item.type);
      return true;
    }
    return false;
  }

  /**
   * What a save keeps of what you know, and of how things look: the appearances come from the seed too, but kept,
   * they stay put through changes to the game (a new kind of scroll shifts everything drawn after it).
   */
  snapshot() {
    const lists = (sets) => Object.fromEntries(Object.entries(sets).map(([k, set]) => [k, [...set]]));
    return { known: lists(this.known), tried: lists(this.tried), resists: [...this.resists], appearance: this.appearance };
  }

  /** Takes up what snapshot() kept. Kinds added to the game since keep the look the seed gives them now. */
  restore(s) {
    for (const k in this.known) this.known[k] = new Set(s.known[k] ?? []);
    for (const k in this.tried) this.tried[k] = new Set(s.tried[k] ?? []);
    this.resists = new Set(s.resists ?? []);
    for (const kind in s.appearance ?? {}) {
      for (const type in s.appearance[kind]) if (this.appearance[kind]?.[type]) this.appearance[kind][type] = s.appearance[kind][type];
    }
  }

  /** Notes that you've seen a kind of monster resist a damage type or be weak to it. True the first time. */
  learnResist(monster, dmgType) {
    const key = `${monster}:${dmgType}`;
    if (this.resists.has(key)) return false;
    this.resists.add(key);
    return true;
  }

  /** Fully identify an item: its type and, for equipment, its +, its enchantment and its curse (and a wand's charges). */
  identify(item) {
    this.learn(item);
    item.identified = true;
    item.curseKnown = true;
  }

  color(item) {
    switch (item.kind) {
      case 'potion': case 'scroll': case 'wand': case 'ring':
        return this.appearance[item.kind][item.type].color;
      case 'weapon': return 0xa8adb4;
      case 'armor': return ARMORS[item.type].color;
      case 'artefact': return ARTEFACTS[item.type].color;
      case 'food': return 0x8a5a2a;
      case 'gold': return 0xf0c040;
      case 'amulet': return 0xffd040;
      case 'key': return 0xb8b0a0;
    }
    return 0xffffff;
  }

  name(item, { article = false } = {}) {
    const n = this._baseName(item);
    if (!article) return n;
    if (item.qty > 1 || item.kind === 'gold' || item.kind === 'artefact' || item.kind === 'amulet') return n;
    return (/^[aeiou+]/i.test(n) ? 'an ' : 'a ') + n;
  }

  _baseName(item) {
    const known = this.isKnown(item);
    const q = item.qty || 1;
    const plural = q > 1;
    const plus = `+${item.plus}`;
    const effect = effectOf(item);
    const of = effect ? ` of ${effect[1].name}` : '';
    // What you know of its curse: bound, weakened, or (if you know that much but no more) none. A known enchantment
    // says it's clean itself.
    const curseTag = !item.curseKnown ? '' : item.curse >= 2 ? ' (cursed)' : item.curse === 1 ? ' (curse weakened)'
      : !item.identified && !effect && GEAR.has(item.kind) ? ' (uncursed)' : '';

    switch (item.kind) {
      case 'weapon': {
        const base = WEAPONS[item.type].name;
        return (item.identified ? `${plus} ${base}` : base) + of + curseTag;
      }
      case 'armor': {
        const base = ARMORS[item.type].name;
        return (item.identified ? `${plus} ${base}` : base) + of + curseTag;
      }
      case 'potion': {
        const app = this.appearance.potion[item.type].name;
        const noun = plural ? 'potions' : 'potion';
        const prefix = plural ? `${q} ` : '';
        return known ? `${prefix}${noun} of ${POTIONS[item.type].name}` : `${prefix}${app} ${noun}`;
      }
      case 'scroll': {
        const noun = plural ? 'scrolls' : 'scroll';
        const prefix = plural ? `${q} ` : '';
        return known
          ? `${prefix}${noun} of ${SCROLLS[item.type].name}`
          : `${prefix}${noun} labeled "${this.appearance.scroll[item.type].name}"`;
      }
      case 'wand': {
        // Its + and charges only once you know it (see zapWand).
        const tag = item.identified ? ` ${plus} [${item.charges}/${item.maxCharges}]` : '';
        return (known ? `wand of ${WANDS[item.type].name}` : `${this.appearance.wand[item.type].name} wand`) + tag + curseTag;
      }
      case 'ring': {
        const tag = item.identified && item.type !== 'teleportation' ? ` ${plus}` : '';
        return (known ? `ring of ${RINGS[item.type].name}` : `${this.appearance.ring[item.type].name} ring`) + tag + curseTag;
      }
      case 'food': {
        const base = FOOD[item.type].name;
        return plural ? `${q} ${base}s` : base;
      }
      case 'artefact': return ARTEFACTS[item.type].name;
      case 'amulet': return 'the Amulet of Yendor';
      case 'gold': return `${q} gold`;
      case 'key': return 'iron key';
    }
    return 'strange object';
  }

  describe(item) {
    const known = this.isKnown(item);
    switch (item.kind) {
      case 'weapon': case 'armor': {
        const weapon = item.kind === 'weapon', d = weapon ? WEAPONS[item.type] : ARMORS[item.type];
        const plus = item.identified && item.plus ? ` (+${item.plus})` : '';
        const stats = weapon
          ? [`Damage ${d.dmg[0]}–${d.dmg[1]}${plus} (${DAMAGE_TYPES[damageType(d)].name}), recovery ${d.recharge.toFixed(2)}s, reach ${d.reach}m. Requires ${d.str} strength.`]
          : [`Defense ${d.def}${plus}.`, describeResist(d), `Requires ${d.str} strength; each point short slows you.`];
        const parts = [d.desc, stats.filter(Boolean).join(' ')];
        const effect = effectOf(item);
        if (effect) parts.push(`${effect[0]}: ${effect[1].desc}`);
        if (!item.identified) parts.push(weapon ? 'You do not know how fine it is. Fight with it for a while to learn more.'
          : 'You do not know how fine it is. Wear it into a few fights to learn more.');
        parts.push(curseNote(item));
        return parts.filter(Boolean).join('\n\n');
      }
      case 'potion': return known ? POTIONS[item.type].desc
        : `A flask of ${this.appearance.potion[item.type].name} liquid. Who knows what it does?` +
          (this.tried.potion.has(item.type) ? ' (tried)' : '');
      case 'scroll': return known ? SCROLLS[item.type].desc
        : 'The words are in no language you can read aloud safely... or can you?';
      case 'wand': {
        const d = WANDS[item.type];
        const parts = [known ? d.desc : `A slender ${this.appearance.wand[item.type].name} wand humming with unknown power.` +
          (this.tried.wand.has(item.type) ? ' (tried)' : '')];
        if (known && d.dmg) {
          const up = item.identified ? item.plus * WAND_PLUS_DMG : 0;
          parts.push(`Damage ${d.dmg[0] + up}–${d.dmg[1] + up} (${DAMAGE_TYPES[d.dmgType].name})${item.identified && item.plus ? `, with its +${item.plus}` : ''}.`);
        }
        // Charges come back one at a time, faster for each + (see wandRecharge). Until you know the wand, you can tell
        // it's recharging, but not how many charges it has, or how fast they come back.
        if (item.identified) {
          const every = Math.round(wandRecharge(item.plus));
          parts.push(`${item.charges} of ${item.maxCharges} charges.` + (item.charges < item.maxCharges
            ? ` The next returns in ${Math.ceil(wandRecharge(item.plus) - item.rechargeT)}s (one every ${every}s).` : ` A spent charge returns every ${every}s.`));
        } else {
          parts.push((item.charges < item.maxCharges ? 'It is recharging. ' : '') +
            'You do not know how strong it is, or how many charges it holds. Zap it a few times to learn more.');
        }
        if (item.curseKnown && item.curse > 0) {
          parts.push(item.curse >= 2 ? 'A curse twists its magic: it misfires, and may turn on you.' : 'Its curse is weakened, but its magic still goes astray.');
        } else if (item.curseKnown) parts.push('It is free of curses.');
        return parts.join('\n\n');
      }
      case 'ring': {
        const parts = [known ? RINGS[item.type].desc
          : `A ring set with ${/^[aeiou]/.test(this.appearance.ring[item.type].name) ? 'an' : 'a'} ${this.appearance.ring[item.type].name}. Wear it long enough and you will learn its nature.`];
        if (item.identified && item.curse > 0 && item.type !== 'teleportation') parts.push(`While it's cursed, its +${item.plus} works against you.`);
        parts.push(curseNote(item));
        return parts.filter(Boolean).join('\n\n');
      }
      case 'food': return FOOD[item.type].desc;
      case 'artefact': return ARTEFACTS[item.type].desc;
      case 'amulet': return 'The Amulet of Yendor. It thrums with the heartbeat of the dungeon itself. Invoke it to escape now, or carry it back to the surface for true glory.';
      case 'gold': return 'Shiny.';
      case 'key': return `A heavy iron key. It opens a locked door somewhere on depth ${item.depth}.`;
    }
    return '';
  }
}
