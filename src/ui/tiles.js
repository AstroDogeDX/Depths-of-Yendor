// What a tile in the pack shows besides the item's glyph (see UI.renderInventory):
//   top left      a piece of equipment's + (a cursed ring's as the minus it gives you), or ? until you know it
//   top right     how many there are, or a wand's charges (? until you know the wand)
//   bottom right  a mark for what it does: its element or enchantment, or what a potion, scroll, wand or ring you
//                 know does
//   bottom left   nothing yet
// and its tint: red for a curse you know of, blue for equipment you don't know yet (not identified, and whether it's
// cursed unknown too). Identified, or known to be clean, it looks like anything that can't be cursed.
//
// The marks are placeholders until they have sprites: a coloured letter each. Each is named for what it stands for
// (fire, ice, a map...), so the art pass need only change MARKS, not what uses them.

export const MARKS = {
  fire: { text: 'F', color: '#ff8030', label: 'fire' },
  ice: { text: 'I', color: '#8ad0ff', label: 'ice' },
  lightning: { text: 'L', color: '#ffe060', label: 'lightning' },
  poison: { text: 'P', color: '#60d050', label: 'poison' },
  magic: { text: 'M', color: '#c080ff', label: 'magic' },
  heal: { text: '+', color: '#ff5a6a', label: 'healing' },
  strength: { text: 'S', color: '#e0a040', label: 'strength' },
  experience: { text: 'X', color: '#f0d060', label: 'experience' },
  haste: { text: '»', color: '#60e0d0', label: 'haste' },
  mind: { text: 'V', color: '#b090ff', label: 'mind vision' },
  confusion: { text: '~', color: '#e070e0', label: 'confusion' },
  darkness: { text: 'D', color: '#8a8aa8', label: 'darkness' },
  paralysis: { text: 'Z', color: '#a0c0ff', label: 'paralysis' },
  identify: { text: '?', color: '#e8dcb0', label: 'identify' },
  upgrade: { text: '↑', color: '#80b8ff', label: 'upgrade' },
  cleanse: { text: '*', color: '#fff0c0', label: 'remove curse' },
  teleport: { text: 'T', color: '#a060ff', label: 'teleportation' },
  map: { text: '#', color: '#d8b070', label: 'mapping' },
  aggravate: { text: '!', color: '#ff6040', label: 'aggravation' },
  fear: { text: 'Fe', color: '#d0d060', label: 'terror' },
  summon: { text: '&', color: '#ff7050', label: 'summoning' },
  recharge: { text: 'R', color: '#ffd850', label: 'recharging' },
  enchant: { text: 'E', color: '#f0c860', label: 'enchantment' },
  protection: { text: 'A', color: '#c8d0d8', label: 'protection' },
  food: { text: '%', color: '#c09060', label: 'sustenance' },
  quiet: { text: 'Q', color: '#8a98a8', label: 'quiet' },
};

// Which mark each thing gets: by type for potions, scrolls, wands, rings and artefacts (once you know what kind it is),
// by enchantment for weapons and armour (once you know it's there).
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
};

const CURSABLE = new Set(['weapon', 'armor', 'ring', 'wand']);

/**
 * A tile's corners and tint for `item`, as far as `k` (the run's Knowledge) says you know it: { level, count, mark
 * (a MARKS entry or null), tint ('cursed', 'unknown' or '') }.
 */
export function tileInfo(item, k) {
  let level = '', count = '', mark = null, tint = '';
  if (CURSABLE.has(item.kind)) {
    if (!item.identified) level = '?';
    else if (item.kind === 'ring') level = item.type === 'teleportation' ? '' : `${item.curse > 0 ? '−' : '+'}${item.plus}`;
    else level = `+${item.plus}`;
    if (item.curseKnown && item.curse > 0) tint = 'cursed';
    else if (!item.identified && !item.curseKnown) tint = 'unknown';
  }
  if (item.kind === 'wand') count = item.identified ? `${item.charges}/${item.maxCharges}` : '?';
  else if (item.qty > 1) count = String(item.qty);
  if (item.kind === 'weapon' || item.kind === 'armor') {
    if (item.enchant && (item.identified || item.enchantKnown)) mark = MARK_OF[item.kind][item.enchant];
  } else if (k.isKnown(item)) mark = MARK_OF[item.kind]?.[item.type];
  return { level, count, mark: mark ? MARKS[mark] : null, tint };
}
