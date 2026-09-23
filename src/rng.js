// Small seeded PRNG (mulberry32) so a seed reproduces the same dungeon.

export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export class RNG {
  constructor(seed) {
    this.state = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 1;
  }

  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [a, b] inclusive. */
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  range(a, b) {
    return a + this.next() * (b - a);
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Pick a key from { key: weight } */
  weighted(table) {
    let total = 0;
    for (const k in table) total += table[k];
    let r = this.next() * total;
    for (const k in table) {
      r -= table[k];
      if (r <= 0) return k;
    }
    return Object.keys(table)[0];
  }
}

// Gameplay randomness (combat rolls etc.) — not seeded, so replays of a seed differ in fights.
export const rand = {
  next: () => Math.random(),
  int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
  range: (a, b) => a + Math.random() * (b - a),
  chance: (p) => Math.random() < p,
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  weighted: (table) => RNG.prototype.weighted.call({ next: Math.random }, table),
};
