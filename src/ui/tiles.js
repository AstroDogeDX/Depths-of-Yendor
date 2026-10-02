// What a tile in the pack shows besides the item's icon (see UI.renderInventory, and icons.js for the icons):
//   top left      a piece of equipment's + (a cursed ring's as the minus it gives you), or ? until you know it
//   top right     how many there are, or a wand's charges (? until you know the wand)
//   bottom right  a mark for what it does: its element or enchantment, or what a potion, scroll, wand or ring you
//                 know does
//   bottom left   nothing yet
// and its tint: red for a curse you know of (still, once you know everything else about it), blue for equipment you
// know is free of curses but haven't identified yet. Equipment you know nothing of has no tint, since that would tell you
// something: you learn whether it's cursed by putting it on (or zapping a wand), or by a scroll. Identified and clean,
// it looks like anything that can't be cursed.
//
// Each mark is named for what it stands for (fire, ice, a map...), with the words for it (the tile's tooltip) here and
// its picture in MARK_ICONS in iconArt.js.

export const MARKS = {
  fire: 'fire', ice: 'ice', lightning: 'lightning', poison: 'poison', magic: 'magic', heal: 'healing', strength: 'strength',
  experience: 'experience', haste: 'haste', mind: 'mind vision', confusion: 'confusion', darkness: 'darkness',
  paralysis: 'paralysis', identify: 'identify', upgrade: 'upgrade', cleanse: 'remove curse', teleport: 'teleportation',
  map: 'mapping', aggravate: 'aggravation', fear: 'terror', summon: 'summoning', recharge: 'recharging',
  enchant: 'enchantment', protection: 'protection', food: 'sustenance', quiet: 'quiet', steady: 'steadfastness',
  thorns: 'thorns',
};

// Which mark each thing gets: by type for potions, scrolls, wands, rings and artefacts (once you know what kind it is),
// by enchantment for weapons, armour, shields and bows (once you know it's there).
const MARK_OF = {
  potion: {
    healing: 'heal', strength: 'strength', experience: 'experience', haste: 'haste', mindvision: 'mind', poison: 'poison',
    confusion: 'confusion', blindness: 'darkness', paralysis: 'paralysis', flame: 'fire',
  },
  scroll: {
    identify: 'identify', upgrade: 'upgrade', removecurse: 'cleanse', teleport: 'teleport', mapping: 'map', aggravate: 'aggravate',
    terror: 'fear', summon: 'summon', recharge: 'recharge', enchant: 'enchant',
  },
  wand: { missile: 'magic', lightning: 'lightning', fire: 'fire', frost: 'ice', teleother: 'teleport' },
  ring: { protection: 'protection', regeneration: 'heal', strength: 'strength', sustenance: 'food', stealth: 'quiet', teleportation: 'teleport' },
  artefact: { ember: 'fire' },
  weapon: { flames: 'fire', frost: 'ice', venom: 'poison' },
  armor: { warding: 'magic', embers: 'fire', silence: 'quiet' },
  shield: { steadfastness: 'steady', thorns: 'thorns' },
  bow: { flames: 'fire', frost: 'ice', venom: 'poison' },
};

const CURSABLE = new Set(['weapon', 'armor', 'shield', 'bow', 'ring', 'wand']);

/**
 * A tile's corners and tint for `item`, as far as `k` (the run's Knowledge) says you know it: { level, count, mark
 * ({ name, label }, a key of MARKS and its words, or null), tint ('cursed', 'clean' or '') }.
 */
export function tileInfo(item, k) {
  let level = '', count = '', mark = null, tint = '';
  if (CURSABLE.has(item.kind)) {
    if (!item.identified) level = '?';
    else if (item.kind === 'ring') level = item.type === 'teleportation' ? '' : `${item.curse > 0 ? '−' : '+'}${item.plus}`;
    else level = `+${item.plus}`;
    if (item.curseKnown && item.curse > 0) tint = 'cursed';
    else if (item.curseKnown && !item.identified) tint = 'clean';
  }
  if (item.kind === 'wand') count = item.identified ? `${item.charges}/${item.maxCharges}` : '?';
  else if (item.qty > 1) count = String(item.qty);
  if (['weapon', 'armor', 'shield', 'bow'].includes(item.kind)) {
    if (item.enchant && (item.identified || item.enchantKnown)) mark = MARK_OF[item.kind][item.enchant];
  } else if (k.isKnown(item)) mark = MARK_OF[item.kind]?.[item.type];
  return { level, count, mark: mark ? { name: mark, label: MARKS[mark] } : null, tint };
}
