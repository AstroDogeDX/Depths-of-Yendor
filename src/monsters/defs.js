// Monster catalog. Speeds in m/s, ranges in metres, times in seconds.
// depth: [first floor it appears, last floor it appears]. freq: spawn weight.
// dmgType: the kind of damage its melee blows deal (slash, stab or bash; generic if not given). resist: multipliers
// on the damage each type does to it, physical or magical, e.g. { slash: 0.5, fire: 0 }. See damage.js. A ranged
// attack's shots deal its own dmgType (arrows stab, bolts are magic, the imp's fire is fire).
// traits: `bloodless` (can't bleed), `fluid` (always as good as wet, so cold freezes it solid). See status.js.

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
  warden: {
    name: 'Warden of Yendor', hp: 230, dmg: [10, 22], speed: 2.9, radius: 0.6, reach: 2.4, windup: 0.75, cooldown: 1.3,
    dmgType: 'slash', resist: { slash: 0.7, stab: 0.8, bash: 1.25, fire: 0, holy: 1.25 }, // a halberd; clad in
    // plate, fire can't touch it, and the dead answer its call
    xp: 120, depth: [99, 99], freq: 0, dodge: 0.05, def: 5, sleepChance: 1, boss: true,
    ranged: { speed: 8, keepAway: 0, maxRange: 16, color: 0xffc040, size: 0.22, kind: 'bolt', chance: 0.35, volley: 3,
              dmgType: 'magic' },
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
