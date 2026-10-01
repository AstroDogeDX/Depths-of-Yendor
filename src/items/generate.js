import { WEAPONS, ARMORS, SHIELDS, SHIELD_HITS_TO_ID, POTIONS, SCROLLS, WANDS, RINGS, FOOD, OFFHANDS, CONTAINERS, WAND_ZAPS_TO_ID } from './defs.js';
import { randomBane, randomEnchant } from './enchant.js';
import { danger } from '../config.js';

let nextUid = 1;

/** The uid the next item will get, for a save to keep (see reserveUids). */
export const nextItemUid = () => nextUid;
/** Makes sure new items get uids from `uid` on, so none collides with one from a save. */
export function reserveUids(uid) { nextUid = Math.max(nextUid, uid); }

/**
 * A new item. Equipment has `plus` (its +N, never below 0), `curse` (0 clean, 1 weakened, 2 full: see enchant.js),
 * and for weapons, armour and shields `enchant` or `bane` (an Enchantment or Curse of ___). `identified`: you know its +, its
 * enchantment and its curse (and a wand's charges); `curseKnown`: you know at least whether it's cursed (and so its
 * Curse of ___); `enchantKnown`: you know its enchantment, having put it on.
 */
export function makeItem(kind, type, extra = {}) {
  return {
    uid: nextUid++,
    kind, type,
    qty: 1,
    plus: 0,
    curse: 0,
    identified: ['food', 'offhand', 'artefact', 'amulet', 'gold', 'key', 'container'].includes(kind),
    curseKnown: false,
    ...extra,
  };
}

const freqTable = (defs) => Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, v.freq]));

/** A found weapon's, armour's or shield's +, and whether it's cursed (with its Curse of ___) or, now and then, enchanted. */
function rollGear(rng, item, depth) {
  const d = danger(depth);
  if (rng.next() < 0.18 + d * 0.015) item.plus = rng.int(1, d > 6 ? 3 : 2);
  if (rng.chance(0.16)) {
    item.curse = 2;
    item.bane = randomBane(rng, item.kind);
  } else if (rng.chance(0.045 + d * 0.005)) item.enchant = randomEnchant(rng, item.kind);
}

function pickTiered(rng, defs, depth) {
  const maxTier = Math.min(5, 1 + Math.floor((danger(depth) + 1) / 2));
  const table = {};
  for (const [k, d] of Object.entries(defs)) {
    if (d.tier <= maxTier) table[k] = 1 + (d.tier === maxTier ? 1.5 : 0) + d.tier * 0.4;
  }
  return rng.weighted(table);
}

export function randomItem(rng, depth) {
  const kind = rng.weighted({ potion: 30, scroll: 30, weapon: 8, armor: 7, shield: 4, wand: 6, ring: 5, food: 8 });
  switch (kind) {
    case 'potion': return makeItem('potion', rng.weighted(freqTable(POTIONS)));
    case 'scroll': return makeItem('scroll', rng.weighted(freqTable(SCROLLS)));
    case 'weapon': {
      const it = makeItem('weapon', pickTiered(rng, WEAPONS, depth), { hitsToId: 20 });
      rollGear(rng, it, depth);
      return it;
    }
    case 'armor': {
      const it = makeItem('armor', pickTiered(rng, ARMORS, depth), { hitsToId: 14 });
      rollGear(rng, it, depth);
      return it;
    }
    case 'shield': {
      const it = makeItem('shield', pickTiered(rng, SHIELDS, depth), { hitsToId: SHIELD_HITS_TO_ID });
      rollGear(rng, it, depth);
      return it;
    }
    case 'wand': return randomWand(rng, depth);
    case 'ring': {
      const type = rng.weighted(freqTable(RINGS));
      // A cursed ring's + works against you (see Player.ringBonus).
      const it = makeItem('ring', type, { wornTime: 0 });
      if (type === 'teleportation' || rng.chance(0.2)) {
        it.curse = 2;
        it.plus = rng.int(1, 3);
      } else {
        it.plus = rng.int(1, danger(depth) > 5 ? 3 : 2);
      }
      return it;
    }
    case 'food': return makeItem('food', rng.chance(0.7) ? 'ration' : 'apple');
  }
  return makeItem('food', 'ration');
}

/** A pile of gold, as one lies about a floor of this depth: `mult` times as much in a locked chest. */
export function goldPile(rng, depth, mult = 1) {
  return makeItem('gold', 'gold', { qty: Math.round((rng.int(8, 20) + Math.round(danger(depth) * rng.int(3, 8))) * mult) });
}

/**
 * What a chest holds (see generator.js): a chest, or a mimic (which drops it when it dies), one thing most often, two
 * now and then and three rarely, with a pile of gold about a third of the time; a locked chest a treasure and a bigger
 * pile of gold.
 */
export function chestLoot(rng, depth, kind) {
  if (kind === 'locked') return [treasure(rng, depth), goldPile(rng, depth, 2)];
  const n = +rng.weighted({ 1: 72, 2: 22, 3: 6 });
  const items = Array.from({ length: n }, () => randomItem(rng, depth));
  if (rng.chance(0.3)) items.push(goldPile(rng, depth));
  return items;
}

// A locked chest's treasure: mostly equipment, +2 or better (+3 or +4 deeper down) and from a little deeper than the
// floor, which may still be cursed or, if not, enchanted; otherwise something as precious.
const TREASURE_CURSE = 0.12;
const TREASURE_ENCHANT = 0.3;
function treasure(rng, depth) {
  const d = danger(depth);
  const kind = rng.weighted({ weapon: 30, armor: 26, shield: 8, ring: 11, wand: 10, rare: 15 });
  const plus = 2 + (rng.chance(0.2 + d * 0.04) ? 1 : 0) + (d >= 6 && rng.chance(0.3) ? 1 : 0);
  switch (kind) {
    case 'weapon': case 'armor': case 'shield': {
      const it = makeItem(kind, pickTiered(rng, DEFS[kind], depth + 3), { hitsToId: GEAR_HITS_TO_ID[kind], plus });
      if (rng.chance(TREASURE_CURSE)) {
        it.curse = 2;
        it.bane = randomBane(rng, kind);
      } else if (rng.chance(TREASURE_ENCHANT)) it.enchant = randomEnchant(rng, kind);
      return it;
    }
    case 'ring': {
      const it = makeItem('ring', rng.weighted({ ...freqTable(RINGS), teleportation: 0 }), { wornTime: 0, plus });
      if (rng.chance(TREASURE_CURSE)) it.curse = 2;
      return it;
    }
    case 'wand': {
      const type = rng.weighted(freqTable(WANDS)), [a, b] = WANDS[type].charges;
      const it = makeItem('wand', type, { maxCharges: rng.int(a, b) + plus, rechargeT: 0, zapsToId: WAND_ZAPS_TO_ID, plus });
      it.charges = it.maxCharges;
      if (rng.chance(TREASURE_CURSE)) it.curse = 2;
      return it;
    }
  }
  const rare = rng.weighted({ strength: 30, experience: 20, upgrade: 30, enchant: 20 });
  return rare === 'upgrade' || rare === 'enchant' ? makeItem('scroll', rare, { qty: rare === 'upgrade' ? 2 : 1 }) : makeItem('potion', rare);
}

// What the shop charges never depends on what's hidden about a thing, so a price can't give it away: potions,
// scrolls, wands and rings are one price a kind, and weapons, armour, shields and off-hand things (whose kind you can
// always see) go by their `value` in items/defs.js, as do pack expansions. An artefact is very dear. What the shopkeeper pays
// depends on what you know of a thing (see worth).
const BUY = { food: 15, potion: 35, scroll: 30, wand: 110, ring: 130, artefact: 1500 };
const ARTEFACT_WORTH = 400; // what the shopkeeper counts an artefact worth, buying one from you
const DEFS = {
  weapon: WEAPONS, armor: ARMORS, shield: SHIELDS, potion: POTIONS, scroll: SCROLLS, wand: WANDS, ring: RINGS, food: FOOD,
  offhand: OFFHANDS, container: CONTAINERS,
};
// How many hits a found weapon (dealt), armour (taken) or shield (taken on it) needs before you know it.
const GEAR_HITS_TO_ID = { weapon: 20, armor: 14, shield: SHIELD_HITS_TO_ID };
const UNKNOWN = { potion: 15, scroll: 12, wand: 55, ring: 60 }; // what a potion, scroll, wand or ring of a kind you don't know is worth
const UNKNOWN_GEAR = 0.4; // equipment you know nothing about (not even whether it's cursed) is worth this share
const PER_PLUS = { weapon: 30, armor: 30, shield: 25, ring: 35, wand: 30 }; // what each + adds, once you know it
const ENCHANTED = 60; // what an enchantment adds
const WEAK_CURSE = 0.5; // a weakened curse (known) leaves it worth this share
const SELL_RATE = 0.4; // the shopkeeper pays 40% of what a thing is worth
const markup = (depth) => 1 + Math.max(0, danger(depth) - 3) * 0.1; // deeper merchants charge (and pay) more

function buyBase(item) {
  return ['weapon', 'armor', 'shield', 'offhand', 'container'].includes(item.kind) ? DEFS[item.kind][item.type].value : BUY[item.kind];
}

/**
 * What one of this item is worth to the shopkeeper, as far as you know it (the shopkeeper won't tell you more), or 0
 * if it won't buy it: a thing it knows is fully cursed, or gold, keys and the Amulet.
 * - Potions, scrolls, wands and rings: if you don't know what kind they are, a low price, the same for every kind.
 * - Equipment you know nothing more about: a share of what its kind is worth.
 * - Identified: its value, plus what its + and enchantment add. Known to be clean but not identified: its value.
 * - A weakened curse you know of halves it.
 */
export function worth(item, k) {
  switch (item.kind) {
    case 'potion': case 'scroll': return k.isKnown(item) ? DEFS[item.kind][item.type].value : UNKNOWN[item.kind];
    case 'food': case 'offhand': return DEFS[item.kind][item.type].value;
    case 'artefact': return ARTEFACT_WORTH;
    case 'weapon': case 'armor': case 'shield': case 'wand': case 'ring': {
      if (item.curseKnown && item.curse >= 2) return 0;
      if (!(item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'shield' || k.isKnown(item))) return UNKNOWN[item.kind];
      let v = DEFS[item.kind][item.type].value;
      if (!item.identified && !item.curseKnown) return v * UNKNOWN_GEAR;
      if (item.identified) v += item.plus * PER_PLUS[item.kind];
      if (item.enchant && (item.identified || item.enchantKnown)) v += ENCHANTED;
      if (item.curseKnown && item.curse === 1) v *= WEAK_CURSE;
      return v;
    }
  }
  return 0;
}

/** Whether the shopkeeper won't buy this because it's cursed (and you both know it). */
export const refusedAsCursed = (item) => item.curseKnown && item.curse >= 2 && ['weapon', 'armor', 'shield', 'wand', 'ring'].includes(item.kind);

/** What the shopkeeper here pays for one of this item (see worth), or 0 if it won't buy it. */
export function sellPrice(item, depth, k) {
  const v = worth(item, k);
  return v ? Math.max(1, Math.round(v * markup(depth) * SELL_RATE)) : 0;
}

/** What the shop on this floor charges for an item. */
export function shopPrice(item, depth) {
  return Math.round((buyBase(item) * markup(depth)) / 5) * 5;
}

/**
 * Wares for a shop on this floor, in the order of its display slots (see layoutShop): [{ item, price }], or null for a
 * slot left empty. Never cursed.
 *   the counter        a ration, a potion and a scroll
 *   the two plinths    `wares.container` (a pack expansion), and `wares.artefact` or, without one, a prize: a piece of
 *                      equipment you can see is fine work (identified, +2 or better and often enchanted), dearly priced
 *   the six tables     three pieces of equipment (a weapon, an armour, and a weapon, armour or shield), and three
 *                      wands and rings
 */
export function shopStock(rng, depth, wares = {}) {
  const gear = (kind) => makeItem(kind, pickTiered(rng, DEFS[kind], depth + 3), { hitsToId: GEAR_HITS_TO_ID[kind], plus: rng.chance(0.3) ? 1 : 0 });
  const trinket = (kind) => kind === 'wand' ? randomWand(rng)
    : makeItem('ring', rng.weighted({ ...freqTable(RINGS), teleportation: 0 }), { wornTime: 0, plus: rng.int(1, 2) });
  const priced = (item) => item && { item, price: shopPrice(item, depth) };
  return [
    priced(makeItem('food', 'ration')),
    priced(makeItem('potion', rng.chance(0.5) ? 'healing' : rng.weighted(freqTable(POTIONS)))),
    priced(makeItem('scroll', rng.chance(0.4) ? 'identify' : rng.weighted(freqTable(SCROLLS)))),
    priced(wares.container && makeItem('container', wares.container)),
    wares.artefact ? priced(makeItem('artefact', wares.artefact)) : prize(rng, depth),
    ...['weapon', 'armor', rng.pick(['weapon', 'armor', 'shield'])].map((k) => priced(gear(k))),
    ...['wand', 'ring', rng.chance(0.5) ? 'wand' : 'ring'].map((k) => priced(trinket(k))),
  ];
}

// A shop's prize (see shopStock) costs PRIZE_MARKUP times what it's worth: its kind's value and what its + and
// enchantment add.
const PRIZE_MARKUP = 2;
function prize(rng, depth) {
  const d = danger(depth), kind = rng.chance(0.5) ? 'weapon' : 'armor';
  const plus = 2 + (rng.chance(0.3 + d * 0.04) ? 1 : 0);
  const item = makeItem(kind, pickTiered(rng, kind === 'weapon' ? WEAPONS : ARMORS, depth + 4), {
    hitsToId: kind === 'weapon' ? 20 : 14, plus, identified: true, curseKnown: true,
  });
  if (rng.chance(0.5)) item.enchant = randomEnchant(rng, kind);
  const worth = DEFS[kind][item.type].value + plus * PER_PLUS[kind] + (item.enchant ? ENCHANTED : 0);
  return { item, price: Math.round((worth * PRIZE_MARKUP * markup(depth)) / 5) * 5 };
}

/**
 * A wand, full of charges. One found at `depth` is cursed (so it misfires: see zapWand) about one time in eight, and
 * may have a + (a charge more for each), as a weapon might. A shop's (no depth) has neither.
 */
function randomWand(rng, depth) {
  const type = rng.weighted(freqTable(WANDS));
  const [a, b] = WANDS[type].charges;
  const it = makeItem('wand', type, { maxCharges: rng.int(a, b), rechargeT: 0, zapsToId: WAND_ZAPS_TO_ID });
  if (depth) {
    if (rng.chance(0.12)) it.curse = 2;
    const d = danger(depth);
    if (rng.next() < 0.18 + d * 0.015) it.plus = rng.int(1, d > 6 ? 3 : 2);
  }
  it.maxCharges += it.plus;
  it.charges = it.maxCharges;
  return it;
}

export function stackable(item) {
  return item.kind === 'potion' || item.kind === 'scroll' || item.kind === 'food';
}

export function isEquipment(item) {
  return ['weapon', 'offhand', 'shield', 'armor', 'ring', 'artefact'].includes(item.kind);
}
