// Damage types. A melee blow, yours or a monster's, is one of three kinds of physical damage: slash (edges:
// swords, axes, claws), stab (points: daggers, spears, fangs) or bash (blunt weight: maces, hammers, fists).
// Weapons give theirs as `dmgType` in items/defs.js, monsters theirs in monsters/defs.js; one that doesn't say
// deals generic physical damage. Damage that isn't a blow (fire, poison, magic, falling rocks...) has no type.
//
// A monster can take more or less from some types: `resist` in its def maps a type to a multiplier on the
// damage that gets through, e.g. { slash: 0.5, bash: 1.5 } (below 1 resists it, above 1 is a weakness, 0 is
// immune). Types it doesn't list, and damage with no type, hit it as normal.

export const DAMAGE_TYPES = {
  slash: { name: 'slash' },
  stab: { name: 'stab' },
  bash: { name: 'bash' },
  generic: { name: 'physical' },
};

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

/** The multiplier on a hit of this type (or none) against something with this def (see `resist` above). */
export const damageMult = (def, type) => (type ? def.resist?.[type] ?? 1 : 1);
