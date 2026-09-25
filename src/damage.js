// Damage types. A melee blow, yours or a monster's, is one of three kinds of physical damage: slash (edges:
// swords, axes, claws), stab (points: daggers, spears, fangs, arrows) or bash (blunt weight: maces, hammers,
// fists). Weapons give theirs as `dmgType` in items/defs.js, monsters theirs in monsters/defs.js; one that doesn't
// say deals generic physical damage.
//
// Everything else is magical: raw magic (magic missiles, bolts, the Horn's blast) or one of the elements: fire,
// ice, lightning, poison and holy light. Wands, potions, artefacts and monsters' spells say which they deal. Ice and
// holy have no source yet; they're here for the items and enchantments to come (holy for the cursed and undead).
// Damage with no type at all (starvation) is just damage.
//
// Monsters, armour and artefacts can take more or less from some types: `resist` in a def maps a type to a
// multiplier on the damage that gets through, e.g. { slash: 0.5, bash: 1.5 } (below 1 resists it, above 1 is a
// weakness, 0 is immune). Types it doesn't list, and damage with no type, hit as normal. Being immune to fire or
// poison also means you can't be set burning or poisoned (see STATUS_TYPES).
//
// `noun` is what the log calls a type ("The troll is weak to fire!"). Magical damage numbers take the type's
// colour (.popup.el-* in style.css).

export const DAMAGE_TYPES = {
  slash: { name: 'slash', noun: 'slashing blows', physical: true },
  stab: { name: 'stab', noun: 'stabbing blows', physical: true },
  bash: { name: 'bash', noun: 'bashing blows', physical: true },
  generic: { name: 'physical', noun: 'physical blows', physical: true },
  magic: { name: 'magic', noun: 'magic' },
  fire: { name: 'fire', noun: 'fire' },
  ice: { name: 'ice', noun: 'ice' },
  lightning: { name: 'lightning', noun: 'lightning' },
  poison: { name: 'poison', noun: 'poison' },
  holy: { name: 'holy', noun: 'holy light' },
};

/** Statuses that hurt over time, and the type of their damage: being immune to it wards off the status too. */
export const STATUS_TYPES = { burning: 'fire', poison: 'poison' };

const warned = new Set();

/** The damage type a weapon's or monster's def deals: its `dmgType`, or generic if it doesn't give one. */
export function damageType(def) {
  const type = def?.dmgType;
  if (type === undefined) return 'generic';
  if (DAMAGE_TYPES[type]) return type;
  if (!warned.has(type)) {
    warned.add(type);
    console.warn(`Unknown dmgType "${type}" on ${def.name ?? 'a def'}: treating it as generic`);
  }
  return 'generic';
}

/** Whether a damage type is a physical blow (as opposed to magic, an element, or no type at all). */
export const isPhysical = (type) => !!DAMAGE_TYPES[type]?.physical;

/** The multiplier on a hit of this type (or none) against something with this def (see `resist` above). */
export const damageMult = (def, type) => (type ? def.resist?.[type] ?? 1 : 1);

const andList = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);

/** A def's resistances in words: "Takes 30% less slash damage and 20% more stab and bash damage." ('' if none). */
export function describeResist(def) {
  const byMult = new Map();
  for (const [type, mult] of Object.entries(def.resist ?? {})) {
    if (mult !== 1) byMult.set(mult, [...(byMult.get(mult) ?? []), DAMAGE_TYPES[type]?.name ?? type]);
  }
  const parts = [...byMult].sort((a, b) => a[0] - b[0]).map(([mult, names]) =>
    `${mult === 0 ? 'no' : `${Math.round(Math.abs(1 - mult) * 100)}% ${mult < 1 ? 'less' : 'more'}`} ${andList(names)} damage`);
  return parts.length ? `Takes ${andList(parts)}.` : '';
}
