import { WEAPONS, ARMORS, POTIONS, SCROLLS, WANDS, RINGS, FOOD, OFFHANDS, WAND_ZAPS_TO_ID } from './defs.js';
import { randomBane, randomEnchant } from './enchant.js';
import { danger } from '../config.js';

let nextUid = 1;

/** The uid the next item will get, for a save to keep (see reserveUids). */
export const nextItemUid = () => nextUid;
/** Makes sure new items get uids from `uid` on, so none collides with one from a save. */
export function reserveUids(uid) { nextUid = Math.max(nextUid, uid); }

/**
 * A new item. Equipment has `plus` (its +N, never below 0), `curse` (0 clean, 1 weakened, 2 full: see enchant.js),
 * and for weapons and armour `enchant` or `bane` (an Enchantment or Curse of ___). `identified`: you know its +, its
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
    identified: kind === 'food' || kind === 'offhand' || kind === 'artefact' || kind === 'amulet' || kind === 'gold' || kind === 'key',
    curseKnown: false,
    ...extra,
  };
}

const freqTable = (defs) => Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, v.freq]));

/** A found weapon's or armour's +, and whether it's cursed (with its Curse of ___) or, now and then, enchanted. */
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
  const kind = rng.weighted({ potion: 30, scroll: 30, weapon: 8, armor: 7, wand: 6, ring: 5, food: 8 });
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

// What the shop charges never depends on what's hidden about a thing, so a price can't give it away: potions,
// scrolls, wands and rings are one price a kind, and weapons, armour and off-hand things (whose kind you can always
// see) go by their `value` in items/defs.js. What the shopkeeper pays depends on what you know of a thing (see worth).
const BUY = { food: 15, potion: 35, scroll: 30, wand: 110, ring: 130, artefact: 400 };
const DEFS = { weapon: WEAPONS, armor: ARMORS, potion: POTIONS, scroll: SCROLLS, wand: WANDS, ring: RINGS, food: FOOD, offhand: OFFHANDS };
const UNKNOWN = { potion: 15, scroll: 12, wand: 55, ring: 60 }; // what a potion, scroll, wand or ring of a kind you don't know is worth
const UNKNOWN_GEAR = 0.4; // equipment you know nothing about (not even whether it's cursed) is worth this share
const PER_PLUS = { weapon: 30, armor: 30, ring: 35, wand: 30 }; // what each + adds, once you know it
const ENCHANTED = 60; // what an enchantment adds
const WEAK_CURSE = 0.5; // a weakened curse (known) leaves it worth this share
const SELL_RATE = 0.4; // the shopkeeper pays 40% of what a thing is worth
const markup = (depth) => 1 + Math.max(0, danger(depth) - 3) * 0.1; // deeper merchants charge (and pay) more

function buyBase(item) {
  return item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'offhand' ? DEFS[item.kind][item.type].value : BUY[item.kind];
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
    case 'artefact': return BUY.artefact;
    case 'weapon': case 'armor': case 'wand': case 'ring': {
      if (item.curseKnown && item.curse >= 2) return 0;
      if (!(item.kind === 'weapon' || item.kind === 'armor' || k.isKnown(item))) return UNKNOWN[item.kind];
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
export const refusedAsCursed = (item) => item.curseKnown && item.curse >= 2 && ['weapon', 'armor', 'wand', 'ring'].includes(item.kind);

/** What the shopkeeper here pays for one of this item (see worth), or 0 if it won't buy it. */
export function sellPrice(item, depth, k) {
  const v = worth(item, k);
  return v ? Math.max(1, Math.round(v * markup(depth) * SELL_RATE)) : 0;
}

/** What the shop on this floor charges for an item. */
export function shopPrice(item, depth) {
  return Math.round((buyBase(item) * markup(depth)) / 5) * 5;
}

/** Wares for a shop on this floor: [{ item, price }]. Never cursed. */
export function shopStock(rng, depth) {
  const gear = rng.chance(0.5)
    ? makeItem('weapon', pickTiered(rng, WEAPONS, depth + 3), { hitsToId: 20, plus: rng.chance(0.3) ? 1 : 0 })
    : makeItem('armor', pickTiered(rng, ARMORS, depth + 3), { hitsToId: 14, plus: rng.chance(0.3) ? 1 : 0 });
  const trinket = rng.chance(0.5) ? randomWand(rng)
    : makeItem('ring', rng.weighted({ ...freqTable(RINGS), teleportation: 0 }), { wornTime: 0, plus: rng.int(1, 2) });
  const wares = [
    makeItem('food', 'ration'),
    makeItem('potion', rng.chance(0.5) ? 'healing' : rng.weighted(freqTable(POTIONS))),
    makeItem('scroll', rng.chance(0.4) ? 'identify' : rng.weighted(freqTable(SCROLLS))),
    gear,
    trinket,
  ];
  return wares.map((item) => ({ item, price: shopPrice(item, depth) }));
}

/**
 * A wand, full of charges. One found at `depth` is cursed (so it misfires: see zapWand) about one time in eight, and
 * may have a + (a charge more for each), as a weapon might. A shop's (no depth) has neither, and takes no more draws
 * from the floor's generator than it always has, so floors with shops keep their layouts.
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
  return item.kind === 'weapon' || item.kind === 'offhand' || item.kind === 'armor' || item.kind === 'ring' || item.kind === 'artefact';
}
