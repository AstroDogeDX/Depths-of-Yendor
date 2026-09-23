import { WEAPONS, ARMORS, POTIONS, SCROLLS, WANDS, RINGS } from './defs.js';

let nextUid = 1;

export function makeItem(kind, type, extra = {}) {
  return {
    uid: nextUid++,
    kind, type,
    qty: 1,
    ench: 0,
    cursed: false,
    identified: kind === 'food' || kind === 'artefact' || kind === 'amulet' || kind === 'gold',
    curseKnown: false,
    ...extra,
  };
}

const freqTable = (defs) => Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, v.freq]));

function rollEnchant(rng, item, depth) {
  const r = rng.next();
  if (r < 0.16) {
    item.cursed = true;
    item.ench = -rng.int(1, 3);
  } else if (r < 0.16 + 0.18 + depth * 0.015) {
    item.ench = rng.int(1, depth > 6 ? 3 : 2);
  }
}

function pickTiered(rng, defs, depth) {
  const maxTier = Math.min(5, 1 + Math.floor((depth + 1) / 2));
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
    case 'wand': {
      const type = rng.weighted(freqTable(WANDS));
      const [a, b] = WANDS[type].charges;
      const max = rng.int(a, b);
      return makeItem('wand', type, { charges: max, maxCharges: max, rechargeT: 0 });
    }
    case 'ring': {
      const type = rng.weighted(freqTable(RINGS));
      const it = makeItem('ring', type, { wornTime: 0 });
      if (type === 'teleportation' || rng.chance(0.2)) {
        it.cursed = true;
        it.ench = -rng.int(1, 3);
      } else {
        it.ench = rng.int(1, depth > 5 ? 3 : 2);
      }
      return it;
    }
    case 'food': return makeItem('food', rng.chance(0.7) ? 'ration' : 'apple');
  }
  return makeItem('food', 'ration');
}

export function stackable(item) {
  return item.kind === 'potion' || item.kind === 'scroll' || item.kind === 'food';
}

export function isEquipment(item) {
  return item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'ring' || item.kind === 'artefact';
}
