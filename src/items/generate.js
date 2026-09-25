import { WEAPONS, ARMORS, POTIONS, SCROLLS, WANDS, RINGS } from './defs.js';
import { danger } from '../config.js';

let nextUid = 1;

/** The uid the next item will get, for a save to keep (see reserveUids). */
export const nextItemUid = () => nextUid;
/** Makes sure new items get uids from `uid` on, so none collides with one from a save. */
export function reserveUids(uid) { nextUid = Math.max(nextUid, uid); }

export function makeItem(kind, type, extra = {}) {
  return {
    uid: nextUid++,
    kind, type,
    qty: 1,
    ench: 0,
    cursed: false,
    identified: kind === 'food' || kind === 'artefact' || kind === 'amulet' || kind === 'gold' || kind === 'key',
    curseKnown: false,
    ...extra,
  };
}

const freqTable = (defs) => Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, v.freq]));

function rollEnchant(rng, item, depth) {
  const r = rng.next(), d = danger(depth);
  if (r < 0.16) {
    item.cursed = true;
    item.ench = -rng.int(1, 3);
  } else if (r < 0.16 + 0.18 + d * 0.015) {
    item.ench = rng.int(1, d > 6 ? 3 : 2);
  }
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
      rollEnchant(rng, it, depth);
      return it;
    }
    case 'armor': {
      const it = makeItem('armor', pickTiered(rng, ARMORS, depth), { hitsToId: 14 });
      rollEnchant(rng, it, depth);
      return it;
    }
    case 'wand': return randomWand(rng);
    case 'ring': {
      const type = rng.weighted(freqTable(RINGS));
      const it = makeItem('ring', type, { wornTime: 0 });
      if (type === 'teleportation' || rng.chance(0.2)) {
        it.cursed = true;
        it.ench = -rng.int(1, 3);
      } else {
        it.ench = rng.int(1, danger(depth) > 5 ? 3 : 2);
      }
      return it;
    }
    case 'food': return makeItem('food', rng.chance(0.7) ? 'ration' : 'apple');
  }
  return makeItem('food', 'ration');
}

// Shop prices by kind. They never depend on an unidentified item's type or enchantment, so a price can't
// give away what something is. Weapons and armour, whose type is always known, are priced by tier.
const PRICES = { food: 15, potion: 35, scroll: 30, wand: 110, ring: 130, artefact: 400 };
const SELL_RATE = 0.4; // the shopkeeper buys at 40% of what it charges
const markup = (depth) => 1 + Math.max(0, danger(depth) - 3) * 0.1; // deeper merchants charge (and pay) more

function basePrice(item) {
  if (item.kind === 'weapon') return 45 + WEAPONS[item.type].tier * 35;
  if (item.kind === 'armor') return 45 + ARMORS[item.type].tier * 35;
  return PRICES[item.kind];
}

/** What the shopkeeper pays for one of this item, or 0 if it won't buy it (the Amulet). */
export function sellPrice(item, depth) {
  const base = basePrice(item);
  return base ? Math.max(1, Math.round(base * markup(depth) * SELL_RATE)) : 0;
}

/** What the shop on this floor charges for an item. */
export function shopPrice(item, depth) {
  return Math.round((basePrice(item) * markup(depth)) / 5) * 5;
}

/** Wares for a shop on this floor: [{ item, price }]. Never cursed. */
export function shopStock(rng, depth) {
  const gear = rng.chance(0.5)
    ? makeItem('weapon', pickTiered(rng, WEAPONS, depth + 3), { hitsToId: 20, ench: rng.chance(0.3) ? 1 : 0 })
    : makeItem('armor', pickTiered(rng, ARMORS, depth + 3), { hitsToId: 14, ench: rng.chance(0.3) ? 1 : 0 });
  const trinket = rng.chance(0.5) ? randomWand(rng) : makeItem('ring', rng.weighted({ ...freqTable(RINGS), teleportation: 0 }), { wornTime: 0, ench: rng.int(1, 2) });
  const wares = [
    makeItem('food', 'ration'),
    makeItem('potion', rng.chance(0.5) ? 'healing' : rng.weighted(freqTable(POTIONS))),
    makeItem('scroll', rng.chance(0.4) ? 'identify' : rng.weighted(freqTable(SCROLLS))),
    gear,
    trinket,
  ];
  return wares.map((item) => ({ item, price: shopPrice(item, depth) }));
}

function randomWand(rng) {
  const type = rng.weighted(freqTable(WANDS));
  const [a, b] = WANDS[type].charges;
  const max = rng.int(a, b);
  return makeItem('wand', type, { charges: max, maxCharges: max, rechargeT: 0 });
}

export function stackable(item) {
  return item.kind === 'potion' || item.kind === 'scroll' || item.kind === 'food';
}

export function isEquipment(item) {
  return item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'ring' || item.kind === 'artefact';
}
