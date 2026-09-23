// Static item catalog. Instances are plain objects created in items/generate.js.

export const WEAPONS = {
  dagger:     { name: 'dagger',      dmg: [2, 5],   recharge: 0.55, reach: 1.8, str: 10, tier: 1, model: 'dagger',
                desc: 'A short, quick blade. Little reach, but it recovers almost instantly.' },
  shortsword: { name: 'short sword', dmg: [3, 8],   recharge: 0.85, reach: 2.0, str: 12, tier: 1, model: 'sword',
                desc: 'A dependable sidearm of plain steel.' },
  mace:       { name: 'mace',        dmg: [4, 11],  recharge: 1.15, reach: 2.0, str: 13, tier: 2, model: 'mace',
                desc: 'A flanged iron head on an oak haft.' },
  spear:      { name: 'spear',       dmg: [4, 10],  recharge: 1.05, reach: 2.8, str: 13, tier: 2, model: 'spear',
                desc: 'Long reach lets you strike before most foes can reach you.' },
  longsword:  { name: 'long sword',  dmg: [6, 14],  recharge: 1.15, reach: 2.3, str: 14, tier: 3, model: 'longsword',
                desc: 'A knightly blade, balanced and keen.' },
  battleaxe:  { name: 'battle axe',  dmg: [8, 18],  recharge: 1.45, reach: 2.3, str: 15, tier: 4, model: 'axe',
                desc: 'A broad bearded axe. Slow to recover, brutal on impact.' },
  warhammer:  { name: 'war hammer',  dmg: [11, 24], recharge: 1.85, reach: 2.2, str: 17, tier: 5, model: 'hammer',
                desc: 'A crushing maul that only the strong can swing well.' },
};

export const ARMORS = {
  leather: { name: 'leather armor',   def: 2, str: 10, tier: 1, color: 0x7a5230, desc: 'Boiled leather. Light and quiet.' },
  studded: { name: 'studded leather', def: 3, str: 12, tier: 2, color: 0x6b4a2b, desc: 'Leather reinforced with iron rivets.' },
  chain:   { name: 'chain mail',      def: 5, str: 13, tier: 3, color: 0x9aa0a8, desc: 'Interlocking iron rings.' },
  splint:  { name: 'splint mail',     def: 7, str: 15, tier: 4, color: 0x7d8590, desc: 'Metal strips riveted over mail.' },
  plate:   { name: 'plate armor',     def: 9, str: 17, tier: 5, color: 0xc0c6cc, desc: 'Full plate. Heavy, and very hard to get through.' },
};

export const POTIONS = {
  healing:    { name: 'healing',     freq: 24, good: true,  desc: 'Mends wounds and purges poison.' },
  strength:   { name: 'strength',    freq: 6,  good: true,  desc: 'Permanently increases your strength.' },
  experience: { name: 'experience',  freq: 4,  good: true,  desc: 'Floods you with hard-won insight: you gain a level.' },
  haste:      { name: 'haste',       freq: 10, good: true,  desc: 'Your movements and strikes quicken for a time.' },
  mindvision: { name: 'mind vision', freq: 10, good: true,  desc: 'You sense the minds of every creature on the floor.' },
  poison:     { name: 'poison',      freq: 10, good: false, desc: 'Toxic. Better thrown than drunk.' },
  confusion:  { name: 'confusion',   freq: 8,  good: false, desc: 'Addles the senses. Thrown, it befuddles monsters.' },
  blindness:  { name: 'darkness',    freq: 7,  good: false, desc: 'Smothers your sight. Thrown, it blinds monsters.' },
  paralysis:  { name: 'paralysis',   freq: 6,  good: false, desc: 'Locks the limbs rigid. Thrown, it freezes monsters.' },
  flame:      { name: 'liquid flame',freq: 8,  good: false, desc: 'Bursts into flame on contact with air.' },
};

export const SCROLLS = {
  identify:    { name: 'identify',        freq: 24, desc: 'Reveals the true nature of one item.' },
  enchant:     { name: 'enchanting',      freq: 14, desc: 'Improves a weapon, armor, ring or wand, and breaks its curse.' },
  removecurse: { name: 'remove curse',    freq: 10, desc: 'Lifts every curse on the items you carry.' },
  teleport:    { name: 'teleportation',   freq: 10, desc: 'Hurls you to a random place on this floor.' },
  mapping:     { name: 'magic mapping',   freq: 10, desc: 'Etches the layout of this floor into your mind.' },
  aggravate:   { name: 'aggravate monsters', freq: 7, desc: 'A piercing shriek that wakes the whole floor.' },
  terror:      { name: 'terror',          freq: 8,  desc: 'Nearby monsters flee in panic.' },
  summon:      { name: 'summon monster',  freq: 7,  desc: 'Calls monsters to your side. Not in a good way.' },
  recharge:    { name: 'recharging',      freq: 8,  desc: 'Restores all charges to your wands.' },
};

export const WANDS = {
  missile:   { name: 'magic missile', freq: 30, charges: [4, 6], desc: 'Fires a bolt of force.' },
  lightning: { name: 'lightning',     freq: 18, charges: [3, 5], desc: 'A bolt of lightning that tears through everything in a line.' },
  fire:      { name: 'firebolt',      freq: 18, charges: [3, 5], desc: 'A gout of flame that sets its target alight.' },
  slow:      { name: 'slowness',      freq: 16, charges: [3, 5], desc: 'Drags a creature down to a crawl.' },
  teleother: { name: 'teleport other',freq: 14, charges: [2, 4], desc: 'Sends a creature somewhere else on the floor.' },
};

export const RINGS = {
  protection:    { name: 'protection',    freq: 18, desc: 'Wards off blows. Adds its bonus to your defense.' },
  regeneration:  { name: 'regeneration',  freq: 14, desc: 'Your wounds knit much faster.' },
  strength:      { name: 'strength',      freq: 12, desc: 'Adds its bonus to your strength.' },
  sustenance:    { name: 'sustenance',    freq: 12, desc: 'You grow hungry far more slowly.' },
  stealth:       { name: 'stealth',       freq: 12, desc: 'Sleeping monsters are far less likely to notice you.' },
  teleportation: { name: 'teleportation', freq: 8,  desc: 'Teleports you at random. Always cursed.' },
};

// Unique items of power. Active abilities are triggered with R (slot 1) and T (slot 2).
export const ARTEFACTS = {
  chalice: { name: 'Chalice of Crimson Thirst', color: 0xb01030,
    desc: 'Heals you for a quarter of all melee damage you deal.' },
  eye:     { name: 'Eye of the Deep', color: 0x30c0b0,
    desc: 'Every creature on the floor shows on your map, and hidden traps reveal themselves.' },
  horn:    { name: 'Horn of Thunder', color: 0xd0a040, active: { cooldown: 40, label: 'Sound the horn' },
    desc: 'Active: a thunderclap that stuns and hurls back every nearby monster.' },
  cloak:   { name: 'Cloak of Shadows', color: 0x404060, active: { cooldown: 50, label: 'Vanish' },
    desc: 'Active: become invisible for 8 seconds. Monsters lose track of you.' },
  boots:   { name: 'Boots of the Wind', color: 0x90c0e0,
    desc: 'You move a third faster.' },
  ember:   { name: 'Emberheart', color: 0xff5a10,
    desc: 'Your melee strikes set foes alight, and fire cannot harm you.' },
};

export const FOOD = {
  ration: { name: 'ration', nutrition: 800, desc: 'Dried meat, hard bread. It will keep you going.' },
  apple:  { name: 'withered apple', nutrition: 250, desc: 'Better than nothing.' },
};

// --- Unidentified appearances, shuffled per run ---

export const POTION_COLORS = [
  { name: 'crimson', color: 0xc0102a }, { name: 'azure', color: 0x2a6ae0 }, { name: 'emerald', color: 0x18a048 },
  { name: 'amber', color: 0xe09a18 }, { name: 'violet', color: 0x8a2ac0 }, { name: 'murky', color: 0x5a5a30 },
  { name: 'silver', color: 0xc0c8d0 }, { name: 'golden', color: 0xf0c830 }, { name: 'turquoise', color: 0x20c0b8 },
  { name: 'inky', color: 0x181828 }, { name: 'rose', color: 0xf07090 }, { name: 'milky', color: 0xe8e4d8 },
];

export const SCROLL_SYLLABLES = [
  'ZEL', 'GO', 'MER', 'JUY', 'ED', 'AWK', 'YAC', 'FOO', 'BAR', 'VEN', 'ZUN', 'KER', 'NIH', 'ELB', 'IB',
  'THA', 'RAX', 'OLM', 'PRA', 'TUR', 'XOK', 'VAS', 'HAR', 'LEP', 'DUA', 'MOR', 'KAH', 'SIN', 'EO', 'QUA',
];

export const WAND_MATERIALS = [
  { name: 'oak', color: 0x8a6030 }, { name: 'ebony', color: 0x1a1414 }, { name: 'iron', color: 0x6a6e74 },
  { name: 'bone', color: 0xe0d8c0 }, { name: 'copper', color: 0xc07040 }, { name: 'crystal', color: 0xa0e0ff },
  { name: 'ivory', color: 0xf4efe0 }, { name: 'willow', color: 0xa0a060 },
];

export const RING_GEMS = [
  { name: 'ruby', color: 0xe0103a }, { name: 'sapphire', color: 0x1040e0 }, { name: 'emerald', color: 0x10c050 },
  { name: 'onyx', color: 0x202020 }, { name: 'opal', color: 0xe0e8f0 }, { name: 'amethyst', color: 0xa040e0 },
  { name: 'topaz', color: 0xf0b020 }, { name: 'garnet', color: 0x901020 }, { name: 'jade', color: 0x40a070 },
];

export const KIND_GLYPH = {
  weapon: ')', armor: '[', potion: '!', scroll: '?', wand: '/', ring: '=', food: '%',
  artefact: '*', amulet: '"', gold: '$', key: '-',
};
