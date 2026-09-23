import {
  WEAPONS, ARMORS, POTIONS, SCROLLS, WANDS, RINGS, ARTEFACTS, FOOD,
  POTION_COLORS, SCROLL_SYLLABLES, WAND_MATERIALS, RING_GEMS,
} from './defs.js';

// Per-run knowledge: which unidentified appearance maps to which item type, and what the player knows.
export class Knowledge {
  constructor(rng) {
    this.appearance = { potion: {}, scroll: {}, wand: {}, ring: {} };
    this.known = { potion: new Set(), scroll: new Set(), wand: new Set(), ring: new Set() };
    this.tried = { potion: new Set(), scroll: new Set(), wand: new Set(), ring: new Set() };

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

  /** Fully identify an item: its type and, for equipment, its enchantment and curse. */
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
    const ench = (e) => (e >= 0 ? `+${e}` : `${e}`);
    const curseTag = item.curseKnown && item.cursed ? ' (cursed)' : '';

    switch (item.kind) {
      case 'weapon': {
        const base = WEAPONS[item.type].name;
        return (item.identified ? `${ench(item.ench)} ${base}` : base) + curseTag;
      }
      case 'armor': {
        const base = ARMORS[item.type].name;
        return (item.identified ? `${ench(item.ench)} ${base}` : base) + curseTag;
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
        const charges = item.identified ? ` [${item.charges}/${item.maxCharges}]` : '';
        return (known ? `wand of ${WANDS[item.type].name}` : `${this.appearance.wand[item.type].name} wand`) + charges;
      }
      case 'ring': {
        const tag = item.identified && item.type !== 'teleportation' ? ` ${ench(item.ench)}` : '';
        return (known ? `ring of ${RINGS[item.type].name}` : `${this.appearance.ring[item.type].name} ring`) + tag + curseTag;
      }
      case 'food': {
        const base = FOOD[item.type].name;
        return plural ? `${q} ${base}s` : base;
      }
      case 'artefact': return ARTEFACTS[item.type].name;
      case 'amulet': return 'the Amulet of Yendor';
      case 'gold': return `${q} gold`;
    }
    return 'strange object';
  }

  describe(item) {
    const known = this.isKnown(item);
    switch (item.kind) {
      case 'weapon': {
        const d = WEAPONS[item.type];
        let s = `${d.desc}\n\nDamage ${d.dmg[0]}–${d.dmg[1]}, recovery ${d.recharge.toFixed(2)}s, reach ${d.reach}m. Requires ${d.str} strength.`;
        if (!item.identified) s += '\n\nYou do not know its enchantment. Fight with it for a while to learn more.';
        if (item.curseKnown && item.cursed) s += '\n\nA malevolent curse clings to it.';
        return s;
      }
      case 'armor': {
        const d = ARMORS[item.type];
        let s = `${d.desc}\n\nDefense ${d.def}. Requires ${d.str} strength; each point short slows you.`;
        if (!item.identified) s += '\n\nYou do not know its enchantment. Wear it into a few fights to learn more.';
        if (item.curseKnown && item.cursed) s += '\n\nA malevolent curse clings to it.';
        return s;
      }
      case 'potion': return known ? POTIONS[item.type].desc
        : `A flask of ${this.appearance.potion[item.type].name} liquid. Who knows what it does?` +
          (this.tried.potion.has(item.type) ? ' (tried)' : '');
      case 'scroll': return known ? SCROLLS[item.type].desc
        : 'The words are in no language you can read aloud safely... or can you?';
      case 'wand': return known ? WANDS[item.type].desc + ' Wands slowly recharge over time.'
        : `A slender ${this.appearance.wand[item.type].name} wand humming with unknown power.` +
          (this.tried.wand.has(item.type) ? ' (tried)' : '');
      case 'ring': return known ? RINGS[item.type].desc
        : `A ring set with ${/^[aeiou]/.test(this.appearance.ring[item.type].name) ? 'an' : 'a'} ${this.appearance.ring[item.type].name}. Wear it long enough and you will learn its nature.`;
      case 'food': return FOOD[item.type].desc;
      case 'artefact': return ARTEFACTS[item.type].desc;
      case 'amulet': return 'The Amulet of Yendor. It thrums with the heartbeat of the dungeon itself. Invoke it to escape now, or carry it back to the surface for true glory.';
      case 'gold': return 'Shiny.';
    }
    return '';
  }
}
