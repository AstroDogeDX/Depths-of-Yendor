// Static item catalog. Instances are plain objects created in items/generate.js.
// A weapon's dmgType is the kind of damage it deals: slash, stab or bash (see damage.js).
// `value` is what a thing is worth, for the shop (see sellPrice in items/generate.js).

export const WEAPONS = {
  dagger:     { name: 'dagger',      dmgType: 'stab',  dmg: [2, 5],   recharge: 0.55, reach: 1.8, str: 10, tier: 1, model: 'dagger',
                value: 80, desc: 'A short, quick blade. Little reach, but it recovers almost instantly.' },
  shortsword: { name: 'short sword', dmgType: 'slash', dmg: [3, 8],   recharge: 0.85, reach: 2.0, str: 12, tier: 1, model: 'sword',
                value: 80, desc: 'A dependable sidearm of plain steel.' },
  mace:       { name: 'mace',        dmgType: 'bash',  dmg: [4, 11],  recharge: 1.15, reach: 2.0, str: 13, tier: 2, model: 'mace',
                value: 115, desc: 'A flanged iron head on an oak haft.' },
  spear:      { name: 'spear',       dmgType: 'stab',  dmg: [4, 10],  recharge: 1.05, reach: 2.8, str: 13, tier: 2, model: 'spear',
                value: 115, desc: 'Long reach lets you strike before most foes can reach you.' },
  longsword:  { name: 'long sword',  dmgType: 'slash', dmg: [6, 14],  recharge: 1.15, reach: 2.3, str: 14, tier: 3, model: 'longsword',
                value: 150, desc: 'A knightly blade, balanced and keen.' },
  battleaxe:  { name: 'battle axe',  dmgType: 'slash', dmg: [8, 18],  recharge: 1.45, reach: 2.3, str: 15, tier: 4, model: 'axe',
                value: 185, desc: 'A broad bearded axe. Slow to recover, brutal on impact.' },
  warhammer:  { name: 'war hammer',  dmgType: 'bash',  dmg: [11, 24], recharge: 1.85, reach: 2.2, str: 17, tier: 5, model: 'hammer',
                value: 220, desc: 'A crushing maul that only the strong can swing well.' },
};

// resist: how much of each kind of blow gets through the armour (see damage.js). Each turns some kinds of blow
// better than others.
export const ARMORS = {
  leather: { name: 'leather armor',   def: 2, str: 10, tier: 1, color: 0x7a5230, resist: { bash: 0.85, slash: 1.15 },
             value: 80, desc: 'Boiled leather. Light and quiet, and it softens a blow, but a blade cuts through it.' },
  studded: { name: 'studded leather', def: 3, str: 12, tier: 2, color: 0x6b4a2b, resist: { slash: 0.85, stab: 1.15 },
             value: 115, desc: 'Leather reinforced with iron rivets, which turn an edge. A point slips in between them.' },
  chain:   { name: 'chain mail',      def: 5, str: 13, tier: 3, color: 0x9aa0a8, resist: { slash: 0.7, stab: 1.2, bash: 1.2 },
             value: 150, desc: 'Interlocking iron rings. Proof against a blade, but a point can burst the links, and it does nothing to soften a blow.' },
  splint:  { name: 'splint mail',     def: 7, str: 15, tier: 4, color: 0x7d8590, resist: { slash: 0.8, bash: 0.9, stab: 1.15 },
             value: 185, desc: 'Metal strips riveted over mail. They turn edges and spread a blow, but a point finds the gaps between them.' },
  plate:   { name: 'plate armor',     def: 9, str: 17, tier: 5, color: 0xc0c6cc, resist: { slash: 0.7, stab: 0.8, bash: 1.25 },
             value: 220, desc: 'Full plate. Heavy, and very hard to get through with an edge or a point, but a hammer blow rings right through it.' },
};

export const POTIONS = {
  healing:    { name: 'healing',     freq: 24, value: 50, good: true,  desc: 'Mends wounds and purges poison.' },
  strength:   { name: 'strength',    freq: 6, value: 120,  good: true,  desc: 'Permanently increases your strength.' },
  experience: { name: 'experience',  freq: 4, value: 150,  good: true,  desc: 'Floods you with hard-won insight: you gain a level.' },
  haste:      { name: 'haste',       freq: 10, value: 60, good: true,  desc: 'Your movements and strikes quicken for a time.' },
  mindvision: { name: 'mind vision', freq: 10, value: 45, good: true,  desc: 'You sense the minds of every creature on the floor.' },
  poison:     { name: 'poison',      freq: 10, value: 25, good: false, desc: 'Toxic. Better thrown than drunk.' },
  confusion:  { name: 'confusion',   freq: 8, value: 25,  good: false, desc: 'Addles the senses. Thrown, it befuddles monsters.' },
  blindness:  { name: 'darkness',    freq: 7, value: 25,  good: false, desc: 'Smothers your sight. Thrown, it blinds monsters.' },
  paralysis:  { name: 'paralysis',   freq: 6, value: 30,  good: false, desc: 'Locks the limbs rigid. Thrown, it freezes monsters.' },
  flame:      { name: 'liquid flame',freq: 8, value: 35,  good: false, desc: 'Bursts into flame on contact with air.' },
};

// (New kinds go at the end: each kind's label is drawn from the seed in this order.)
export const SCROLLS = {
  identify:    { name: 'identify',        freq: 24, value: 30, desc: 'Reveals the true nature of one item.' },
  upgrade:     { name: 'upgrade',         freq: 14, value: 80,
                 desc: 'Improves a weapon, armour, ring or wand by one. On a cursed thing it weakens the curse instead, and may lift it altogether.' },
  removecurse: { name: 'remove curse',    freq: 10, value: 60, desc: 'Lifts any curse on one item, and tells you whether it bore one.' },
  teleport:    { name: 'teleportation',   freq: 10, value: 40, desc: 'Hurls you to a random place on this floor.' },
  mapping:     { name: 'magic mapping',   freq: 10, value: 50, desc: 'Etches the layout of this floor into your mind.' },
  aggravate:   { name: 'aggravate monsters', freq: 7, value: 15, desc: 'A piercing shriek that wakes the whole floor.' },
  terror:      { name: 'terror',          freq: 8,  value: 45, desc: 'Nearby monsters flee in panic.' },
  summon:      { name: 'summon monster',  freq: 7,  value: 15, desc: 'Calls monsters to your side. Not in a good way.' },
  recharge:    { name: 'recharging',      freq: 8,  value: 70, desc: 'Restores all charges to your wands.' },
  enchant:     { name: 'enchantment',     freq: 8,  value: 90,
                 desc: 'Lays a random enchantment on a weapon or armour, in place of any it had. It takes only on something free of every curse.' },
};

// dmg and dmgType: what a wand's zap does, for those that hurt (see damage.js); each + adds WAND_PLUS_DMG to both
// ends. `bolt`: it fires a bolt (a projectile), which a cursed wand may fire in its place (see zapWand).
export const WANDS = {
  missile:   { name: 'magic missile', freq: 30, charges: [4, 6], value: 100, bolt: true, dmg: [4, 9], dmgType: 'magic',
               desc: 'Fires a bolt of force.' },
  lightning: { name: 'lightning',     freq: 18, charges: [3, 5], value: 140, dmg: [6, 12], dmgType: 'lightning',
               desc: 'A bolt of lightning that tears through everything in a line.' },
  fire:      { name: 'firebolt',      freq: 18, charges: [3, 5], value: 130, bolt: true, dmg: [5, 10], dmgType: 'fire',
               desc: 'A gout of flame that sets its target alight.' },
  frost:     { name: 'frost',         freq: 16, charges: [3, 5], value: 120, bolt: true, dmg: [3, 7], dmgType: 'ice',
               desc: 'A lance of bitter cold that chills its target to a crawl, and freezes it solid if it\'s wet.' },
  teleother: { name: 'teleport other',freq: 14, charges: [2, 4], value: 110, bolt: true,
               desc: 'Sends a creature somewhere else on the floor.' },
};
export const WAND_PLUS_DMG = 2;
// Seconds for a wand to regain a charge: WAND_RECHARGE at +0, a tenth less for each + (to no less than half).
export const WAND_RECHARGE = 55;
export const wandRecharge = (plus) => WAND_RECHARGE * Math.max(0.5, 1 - 0.1 * plus);

export const RINGS = {
  protection:    { name: 'protection',    freq: 18, value: 130, desc: 'Wards off blows. Adds its bonus to your defense.' },
  regeneration:  { name: 'regeneration',  freq: 14, value: 150, desc: 'Your wounds knit much faster.' },
  strength:      { name: 'strength',      freq: 12, value: 150, desc: 'Adds its bonus to your strength.' },
  sustenance:    { name: 'sustenance',    freq: 12, value: 110, desc: 'You grow hungry far more slowly.' },
  stealth:       { name: 'stealth',       freq: 12, value: 120, desc: 'Sleeping monsters are far less likely to notice you.' },
  teleportation: { name: 'teleportation', freq: 8, value: 40,  desc: 'Teleports you at random. Always cursed.' },
};

// Unique items of power. Active abilities are triggered with R (slot 1) and T (slot 2). `resist` protects you
// from damage types while you're attuned (see damage.js).
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
  ember:   { name: 'Emberheart', color: 0xff5a10, resist: { fire: 0 },
    desc: 'Your melee strikes set foes alight, and fire cannot harm you.' },
};

export const FOOD = {
  ration: { name: 'ration', nutrition: 800, value: 15, desc: 'Dried meat, hard bread. It will keep you going.' },
  apple:  { name: 'withered apple', nutrition: 250, value: 5, desc: 'Better than nothing.' },
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
