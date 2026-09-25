// Enchantments and curses on weapons and armour.
//
// An Enchantment of ___ (a scroll of enchantment lays one, at random) and a Curse of ___ (a cursed weapon or armour
// comes with one) are each an effect on the item, named after it: "long sword of flames", "chain mail of clamour".
// An item has one or the other, never both: a scroll of enchantment only takes on something free of every curse.
//
// Curses come in two strengths (item.curse): 2, a full curse, binds the item to you once you put it on; 1, a curse a
// scroll of upgrade has weakened, lets you take it off, but its effect lingers. At 0 it's clean. On a ring, a curse
// turns its bonus against you (see Player.ringBonus); a cursed wand misfires (see zapWand).
//
// What each can do (all optional):
//   weapons: onHit { ignite, chill, poison } (seconds of that status a blow brings, see status.js),
//            accuracy (added to your chance to hit), dmgMult (on your blows' damage)
//   armour:  resist { type: multiplier } (see damage.js), noise (a multiplier on how far your steps carry),
//            speed (a multiplier on how fast you move)
//
// These are a first few, to be filled out.

export const ENCHANTMENTS = {
  weapon: {
    flames: { name: 'flames', desc: 'Its blows set foes alight.', onHit: { ignite: 3 } },
    frost: { name: 'frost', desc: 'Its blows chill foes to the bone.', onHit: { chill: 5 } },
    venom: { name: 'venom', desc: 'Its blows poison foes.', onHit: { poison: 6 } },
  },
  armor: {
    warding: { name: 'warding', desc: 'Magic finds it hard to get through: a third less magic damage.', resist: { magic: 0.67 } },
    embers: { name: 'embers', desc: 'Fire washes off it: half the fire damage.', resist: { fire: 0.5 } },
    silence: { name: 'silence', desc: 'It muffles your steps: monsters hear you from much less far off.', noise: 0.6 },
  },
};

export const CURSES = {
  weapon: {
    clumsiness: { name: 'clumsiness', desc: 'It twists in your grip: you miss far more often.', accuracy: -0.15 },
    frailty: { name: 'frailty', desc: 'Its blows land feebly: a quarter less damage.', dmgMult: 0.75 },
  },
  armor: {
    burden: { name: 'burden', desc: 'It drags at you: you move more slowly.', speed: 0.85 },
    clamour: { name: 'clamour', desc: 'It clanks and rattles: monsters hear you from much further off.', noise: 1.5 },
  },
};

/** An item's enchantment's def, or null. */
export const enchantOf = (item) => (item?.enchant && ENCHANTMENTS[item.kind]?.[item.enchant]) || null;

/** An item's curse effect's def (while it has any curse), or null. */
export const baneOf = (item) => (item?.curse > 0 && item.bane && CURSES[item.kind]?.[item.bane]) || null;

/** A curse effect for a weapon or armour, at random. */
export const randomBane = (rng, kind) => rng.pick(Object.keys(CURSES[kind]));

/** Whether a weapon, armour or ring is stuck on you: fully cursed. */
export const binds = (item) => item.curse >= 2 && item.kind !== 'artefact';
