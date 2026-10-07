// Monster catalog. Speeds in m/s, ranges in metres, times in seconds.
// depth: [first floor it appears, last floor it appears]. freq: spawn weight (0: it never spawns by itself).
// grow: [health, damage] it gains for each step of `danger` (config.js) past its first floor; [0.08, 0.05] if not given.
// dmgType: the kind of damage its melee blows deal (slash, stab or bash; generic if not given). resist: multipliers
// on the damage each type does to it, physical or magical, e.g. { slash: 0.5, fire: 0 }. See damage.js. A ranged
// attack's shots deal its own dmgType (arrows stab, bolts are magic, the imp's fire is fire).
// traits: `bloodless` (can't bleed), `fluid` (always as good as wet, so cold freezes it solid), `maledicted` (made of
// the taint a malediction is: it can't be given one). See status.js.
// Bosses (`boss`): `wake` and `death`, what the log says as one wakes and dies; `summons`, monsters it calls up once
// it's down to half its health (the Warden); `ai`, its own way of fighting (see monsters/bosses.js), with its
// `moves` (their windups, damage and how often) and what changes at half its health (`enrage`).

export const MONSTERS = {
  rat: {
    name: 'giant rat', hp: 7, dmg: [1, 3], speed: 3.4, radius: 0.3, reach: 1.3, windup: 0.35, cooldown: 0.9,
    dmgType: 'stab', // bites
    xp: 1, depth: [1, 9], freq: 10, dodge: 0.05, def: 0, sleepChance: 0.5,
  },
  bat: {
    name: 'cave bat', hp: 6, dmg: [1, 4], speed: 4.4, radius: 0.28, reach: 1.3, windup: 0.25, cooldown: 1.0,
    dmgType: 'stab', resist: { slash: 1.25 }, // bites; its wings tear on an edge
    xp: 2, depth: [1, 12], freq: 6, dodge: 0.2, def: 0, sleepChance: 0.3, flying: 1.5, erratic: true,
  },
  slime: {
    name: 'green ooze', hp: 16, dmg: [2, 5], speed: 1.5, radius: 0.45, reach: 1.3, windup: 0.6, cooldown: 1.3,
    dmgType: 'bash', resist: { slash: 1.25, stab: 0.75, bash: 0.5, fire: 1.25, poison: 0 }, // slams; blades cut it,
    // blows ripple through, fire boils it, and it's poison itself
    xp: 3, depth: [4, 14], freq: 6, dodge: 0, def: 1, sleepChance: 0.6, poisonHit: 0.35, traits: ['bloodless', 'fluid'],
  },
  goblin: {
    name: 'goblin', hp: 13, dmg: [2, 6], speed: 3.0, radius: 0.32, reach: 1.5, windup: 0.45, cooldown: 1.0,
    dmgType: 'slash', // a short blade
    xp: 4, depth: [4, 17], freq: 9, dodge: 0.1, def: 1, sleepChance: 0.5,
  },
  archer: {
    name: 'goblin archer', hp: 10, dmg: [2, 5], speed: 2.9, radius: 0.32, reach: 1.4, windup: 0.7, cooldown: 2.2,
    dmgType: 'bash', // clubs you with its bow, if ever it doesn't shoot
    xp: 5, depth: [6, 20], freq: 5, dodge: 0.1, def: 0, sleepChance: 0.5,
    ranged: { speed: 13, keepAway: 5, maxRange: 13, color: 0xc0a070, size: 0.06, kind: 'arrow', dmgType: 'stab' },
  },
  skeleton: {
    name: 'skeleton', hp: 20, dmg: [3, 8], speed: 2.6, radius: 0.33, reach: 1.6, windup: 0.5, cooldown: 1.1,
    dmgType: 'slash', resist: { slash: 0.75, stab: 0.5, bash: 1.5, poison: 0, holy: 1.5 }, // a sword; nothing to
    // stab, bones that shatter, no blood to poison, and undead
    xp: 6, depth: [9, 22], freq: 8, dodge: 0.05, def: 2, sleepChance: 0.7, traits: ['bloodless'],
  },
  orc: {
    name: 'orc', hp: 28, dmg: [4, 11], speed: 2.8, radius: 0.42, reach: 1.8, windup: 0.6, cooldown: 1.2,
    dmgType: 'slash', resist: { stab: 1.25 }, // an axe; a broad bare chest for a point to find
    xp: 9, depth: [12, 25], freq: 8, dodge: 0.05, def: 2, sleepChance: 0.5,
  },
  wraith: {
    name: 'wraith', hp: 22, dmg: [4, 9], speed: 3.2, radius: 0.35, reach: 1.6, windup: 0.5, cooldown: 1.1,
    dmgType: 'slash', resist: { stab: 0.5, bash: 0.75, ice: 0.5, poison: 0, holy: 2 }, // claws; a point finds only
    // robe, a blow little to hit; the grave's own cold, no blood, and a restless spirit that holy light unmakes
    xp: 11, depth: [14, 25], freq: 5, dodge: 0.25, def: 0, sleepChance: 0.2, flying: 0.4, traits: ['bloodless'],
    ranged: { speed: 7, keepAway: 0, maxRange: 11, color: 0x8060ff, size: 0.18, kind: 'bolt', chance: 0.5,
              dmgType: 'magic' },
  },
  imp: {
    name: 'fire imp', hp: 17, dmg: [3, 7], speed: 4.0, radius: 0.3, reach: 1.4, windup: 0.4, cooldown: 1.6,
    dmgType: 'slash', resist: { stab: 1.25, fire: 0, ice: 1.5, holy: 1.5 }, // claws; a slight thing, easily run
    // through, born of fire, and a devil
    xp: 10, depth: [17, 25], freq: 5, dodge: 0.2, def: 1, sleepChance: 0.3,
    ranged: { speed: 9, keepAway: 4, maxRange: 12, color: 0xff6010, size: 0.2, kind: 'fire', dmgType: 'fire' },
  },
  troll: {
    name: 'troll', hp: 48, dmg: [6, 14], speed: 2.6, radius: 0.5, reach: 2.0, windup: 0.7, cooldown: 1.4,
    dmgType: 'bash', resist: { stab: 1.25, bash: 0.75, fire: 1.5 }, // a club; its bulk soaks up blows, but a point
    // goes deep, and like all trolls it dreads fire
    xp: 16, depth: [17, 25], freq: 5, dodge: 0, def: 3, sleepChance: 0.6, regen: 1.2,
  },
  golem: {
    name: 'stone golem', hp: 75, dmg: [9, 20], speed: 1.7, radius: 0.55, reach: 2.1, windup: 0.9, cooldown: 1.6,
    dmgType: 'bash', resist: { slash: 0.5, stab: 0.5, bash: 1.5, fire: 0.5, lightning: 0.5, poison: 0, magic: 1.25 },
    // stone fists; edges and points glance off it, stone shrugs off fire and lightning, but magic unravels its rune
    xp: 22, depth: [20, 25], freq: 3, dodge: 0, def: 6, sleepChance: 0.8, traits: ['bloodless'],
  },
  // A chest that isn't one: until something wakes it, it's a chest on the floor like any other (see Level.addChest).
  // Only chests become mimics, from its first floor on, and it grows faster than most, so a deep one is still a threat.
  mimic: {
    name: 'mimic', hp: 18, dmg: [3, 7], speed: 2.5, radius: 0.42, reach: 1.5, windup: 0.5, cooldown: 1.2,
    dmgType: 'stab', resist: { stab: 0.75, fire: 1.5 }, // bites; a point sticks in its wooden hide, and it burns like kindling
    xp: 8, depth: [3, 25], freq: 0, dodge: 0, def: 2, sleepChance: 0, grow: [0.25, 0.12],
  },
  // The Sewers' boss, in its arena on their last floor (see dungeon/arenas.js): a vast ooze, tainted dark purple, too
  // big for any doorway, so it never leaves its lair. Its blows and blades go as a green ooze's do (it's an ooze too,
  // and frozen by cold alone), and it's quicker than one, for all its size. It slams what's in reach, swells up to blast
  // everything round it back (`slam`), and spits globs of its taint that leave a malediction (`spit`; see status.js),
  // which only water washes off. Past half its health, its taint boils too hot to freeze: cold only chills it, and it
  // spits three globs at a time. When it dies it spills what it had swallowed, and the key to the way on.
  maledicted_ooze: {
    name: 'Maledicted Ooze', hp: 120, dmg: [5, 10], speed: 2.1, radius: 1.1, reach: 2.2, windup: 0.8, cooldown: 1.4,
    dmgType: 'bash', resist: { slash: 1.25, stab: 0.75, bash: 0.5, fire: 1.25, poison: 0 },
    xp: 45, depth: [99, 99], freq: 0, dodge: 0, def: 2, sleepChance: 1, boss: true, traits: ['bloodless', 'fluid', 'maledicted'],
    wake: 'The Maledicted Ooze heaves itself up out of its filth, every eye in it turning to you.',
    death: 'The Maledicted Ooze shudders, bursts, and spills across the floor.',
    keyDrop: 'Something glints in what spills out of it: a key.',
    ai: 'ooze',
    moves: {
      // Swelling up (`windup` seconds, a ring on the floor showing how far it will reach), then a blast all round it:
      // `dmg` to whatever's within `radius` metres that it can see, thrown `push` metres back. Every `every` seconds at
      // most, when you're near.
      slam: { windup: 1.5, radius: 4.5, dmg: [6, 11], push: 3.5, every: [6, 9] },
      // A glob of its taint, lobbed `speed` metres a second: `dmg`, and a malediction. Every `every` seconds at most.
      spit: { windup: 0.65, speed: 10, dmg: [3, 6], dmgType: 'magic', every: [2.6, 4], range: 18 },
    },
    enrage: { at: 0.5, volley: 3, spread: 0.24, say: 'The Maledicted Ooze boils up, steaming. No frost will set in it now!' },
  },
  // The Catacombs' boss, keeping his cell block on their last floor (see dungeon/arenas.js): a huge jailer, long dead and
  // half rotted to the bone, a chain wound round his left arm and a mace in his right. Undead, as a skeleton is: a mace
  // is the answer to him. He beats you with the mace in reach, and throws his chain (`chain`) to catch you and reel you
  // in, shackled (see status.js), wherever he can see you, backing off to make room to throw it now and then (`space`).
  // Hurt (`hide`), he throws a flask of darkness at you (`flask`) and slips away to hide in a cell, to charge out at you
  // as you pass its gate (`ambush`). Past half his health he charges in the open too (`charge`): straight at you,
  // knocking you flying, or into a wall, where he's stunned. A lantern at his belt lights his way round the cells. When
  // he dies he leaves his keys, the boss key among them, and what he took from his prisoners.
  jailer: {
    name: 'Forgotten Jailer', hp: 190, dmg: [8, 15], speed: 2.4, radius: 0.7, reach: 2.3, windup: 0.7, cooldown: 1.3,
    dmgType: 'bash', resist: { slash: 0.85, stab: 0.6, bash: 1.3, poison: 0, holy: 1.5 }, // a mace; bones a point slips
    // between and a blow shatters, no blood to poison, and undead
    xp: 70, depth: [99, 99], freq: 0, dodge: 0, def: 4, sleepChance: 1, boss: true, traits: ['bloodless'],
    wake: 'The Forgotten Jailer lifts his head. Keys rattle at his belt. "Back... in your cell."',
    death: 'The Forgotten Jailer crashes down, his chain rattling slack.',
    keyDrop: 'His keys scatter across the floor, and one of them glows a sickly green.',
    ai: 'jailer',
    moves: {
      // His chain, whirled `turns` times over his head (`windup` seconds) and flung straight at you, `speed` metres a
      // second, as far as `range`: caught, you take `dmg` and are reeled in to him, and shackled for `shackle` seconds. A
      // raised shield catches it. Every `every` seconds at most, while he can see you.
      chain: { windup: 1, turns: 1.5, speed: 22, range: 11, dmg: [2, 4], shackle: 3.5, every: [5, 8] },
      // Past half his health: head down (`windup`), then a charge straight at where you were, `speed` metres a second, as
      // far as `range`: `dmg` and thrown `push` metres if he hits you; into a wall, he's stunned for `stun` seconds.
      charge: { windup: 0.8, speed: 10, range: 14, dmg: [10, 17], push: 3, stun: 1.8, every: [6, 9] },
      // His charge out of hiding at you passing his cell's gate: poised for it, he's off sooner, at where you'll be, and
      // once he's out through the gate he wheels round at where you'll be by then, as much as `turn` radians, and on.
      ambush: { windup: 0.35, speed: 10, range: 14, turn: 1.4, dmg: [10, 17], push: 3, stun: 1.8 },
      // A flask of darkness, lobbed at you `speed` metres a second: it bursts, and blinds you `blind` seconds if you're in
      // `splash` metres of it.
      flask: { windup: 0.6, speed: 11, blind: 8, splash: 2.6 },
    },
    // Making room to throw his chain: with it ready and you too close to throw it at, now and then (`chance`, at most
    // every `every` seconds) he backs away from you, quicker than he comes on (`speed` times), for `secs` seconds at
    // most or till you're `far` metres off, and throws it.
    space: { chance: 0.45, every: 2, speed: 1.15, secs: 1.1, far: 5 },
    // Hurt, down to each share of his health in `at`, he throws a flask of darkness at you, if he can see you, and
    // while you're blind, he goes to hide in one of his cells with a gate onto the aisle (see `hides` in arenas.js),
    // watching the gate to charge out at you if you pass it. The first time, he watches only the gate, so you can steal
    // up on him through a hole in the wall and take him unawares; the second, every way in (`watch`). He waits `wait`
    // seconds at most, then comes looking for you.
    hide: {
      at: [0.5, 0.25], watch: ['gate', 'all'], wait: 40, speed: 1.2,
      say: ['The Forgotten Jailer bellows, and snatches a black flask from his belt!', 'The Forgotten Jailer staggers, and snatches another flask from his belt!'],
    },
    enrage: { at: 0.5, speed: 1.15 },
  },
  warden: {
    name: 'Warden of Yendor', hp: 230, dmg: [10, 22], speed: 2.9, radius: 0.6, reach: 2.4, windup: 0.75, cooldown: 1.3,
    dmgType: 'slash', resist: { slash: 0.7, stab: 0.8, bash: 1.25, fire: 0, holy: 1.25 }, // a halberd; clad in
    // plate, fire can't touch it, and the dead answer its call
    xp: 120, depth: [99, 99], freq: 0, dodge: 0.05, def: 5, sleepChance: 1, boss: true,
    ranged: { speed: 8, keepAway: 0, maxRange: 16, color: 0xffc040, size: 0.22, kind: 'bolt', chance: 0.35, volley: 3,
              dmgType: 'magic' },
    wake: 'The Warden of Yendor awakens. "You shall not take it."',
    death: 'The Warden of Yendor crashes to the floor and is still.',
    summons: { types: ['wraith', 'skeleton', 'skeleton'], say: 'The Warden of Yendor raises its halberd — the dead answer!' },
  },
};

export function spawnTable(depth) {
  const table = {};
  for (const [k, m] of Object.entries(MONSTERS)) {
    if (m.freq > 0 && depth >= m.depth[0] && depth <= m.depth[1]) {
      // Monsters are rarer at the edges of their depth range.
      const mid = (m.depth[0] + m.depth[1]) / 2;
      const span = Math.max(1, (m.depth[1] - m.depth[0]) / 2);
      table[k] = m.freq * (1.2 - 0.6 * Math.min(1, Math.abs(depth - mid) / span));
    }
  }
  return table;
}
