// Monster catalog. Speeds in m/s, ranges in metres, times in seconds.
// depth: [first floor it appears, last floor it appears]. freq: spawn weight.
// dmgType: the kind of damage its melee blows deal (slash, stab or bash; generic if not given). resist: damage
// multipliers by type, e.g. { slash: 0.5, bash: 1.5 }. See damage.js.

export const MONSTERS = {
  rat: {
    name: 'giant rat', hp: 7, dmg: [1, 3], speed: 3.4, radius: 0.3, reach: 1.3, windup: 0.35, cooldown: 0.9,
    xp: 1, depth: [1, 9], freq: 10, dodge: 0.05, def: 0, sleepChance: 0.5,
  },
  bat: {
    name: 'cave bat', hp: 6, dmg: [1, 4], speed: 4.4, radius: 0.28, reach: 1.3, windup: 0.25, cooldown: 1.0,
    xp: 2, depth: [1, 12], freq: 6, dodge: 0.2, def: 0, sleepChance: 0.3, flying: 1.5, erratic: true,
  },
  slime: {
    name: 'green ooze', hp: 16, dmg: [2, 5], speed: 1.5, radius: 0.45, reach: 1.3, windup: 0.6, cooldown: 1.3,
    xp: 3, depth: [4, 14], freq: 6, dodge: 0, def: 1, sleepChance: 0.6, poisonHit: 0.35,
  },
  goblin: {
    name: 'goblin', hp: 13, dmg: [2, 6], speed: 3.0, radius: 0.32, reach: 1.5, windup: 0.45, cooldown: 1.0,
    xp: 4, depth: [4, 17], freq: 9, dodge: 0.1, def: 1, sleepChance: 0.5,
  },
  archer: {
    name: 'goblin archer', hp: 10, dmg: [2, 5], speed: 2.9, radius: 0.32, reach: 1.4, windup: 0.7, cooldown: 2.2,
    xp: 5, depth: [6, 20], freq: 5, dodge: 0.1, def: 0, sleepChance: 0.5,
    ranged: { speed: 13, keepAway: 5, maxRange: 13, color: 0xc0a070, size: 0.06, kind: 'arrow' },
  },
  skeleton: {
    name: 'skeleton', hp: 20, dmg: [3, 8], speed: 2.6, radius: 0.33, reach: 1.6, windup: 0.5, cooldown: 1.1,
    xp: 6, depth: [9, 22], freq: 8, dodge: 0.05, def: 2, sleepChance: 0.7,
  },
  orc: {
    name: 'orc', hp: 28, dmg: [4, 11], speed: 2.8, radius: 0.42, reach: 1.8, windup: 0.6, cooldown: 1.2,
    xp: 9, depth: [12, 25], freq: 8, dodge: 0.05, def: 2, sleepChance: 0.5,
  },
  wraith: {
    name: 'wraith', hp: 22, dmg: [4, 9], speed: 3.2, radius: 0.35, reach: 1.6, windup: 0.5, cooldown: 1.1,
    xp: 11, depth: [14, 25], freq: 5, dodge: 0.25, def: 0, sleepChance: 0.2, flying: 0.4,
    ranged: { speed: 7, keepAway: 0, maxRange: 11, color: 0x8060ff, size: 0.18, kind: 'bolt', chance: 0.5 },
  },
  imp: {
    name: 'fire imp', hp: 17, dmg: [3, 7], speed: 4.0, radius: 0.3, reach: 1.4, windup: 0.4, cooldown: 1.6,
    xp: 10, depth: [17, 25], freq: 5, dodge: 0.2, def: 1, sleepChance: 0.3, fireImmune: true,
    ranged: { speed: 9, keepAway: 4, maxRange: 12, color: 0xff6010, size: 0.2, kind: 'fire' },
  },
  troll: {
    name: 'troll', hp: 48, dmg: [6, 14], speed: 2.6, radius: 0.5, reach: 2.0, windup: 0.7, cooldown: 1.4,
    xp: 16, depth: [17, 25], freq: 5, dodge: 0, def: 3, sleepChance: 0.6, regen: 1.2,
  },
  golem: {
    name: 'stone golem', hp: 75, dmg: [9, 20], speed: 1.7, radius: 0.55, reach: 2.1, windup: 0.9, cooldown: 1.6,
    xp: 22, depth: [20, 25], freq: 3, dodge: 0, def: 6, sleepChance: 0.8,
  },
  warden: {
    name: 'Warden of Yendor', hp: 230, dmg: [10, 22], speed: 2.9, radius: 0.6, reach: 2.4, windup: 0.75, cooldown: 1.3,
    xp: 120, depth: [99, 99], freq: 0, dodge: 0.05, def: 5, sleepChance: 1, boss: true, fireImmune: true,
    ranged: { speed: 8, keepAway: 0, maxRange: 16, color: 0xffc040, size: 0.22, kind: 'bolt', chance: 0.35, volley: 3 },
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
