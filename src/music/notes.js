// Notes, chords and scales, for writing the pieces' scores (title.js, shop.js) by name.

const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

/** A note's MIDI number, by its name ('D4', 'F#3', 'Bb2'). */
export const N = (name) => {
  const [, pc, oct] = /^([A-G][#b]?)(-?\d)$/.exec(name);
  return 12 * (+oct + 1) + PC[pc];
};

/** A chord, by its name ('Dm', 'Eb', 'A'): its root (a pitch class) and its third and fifth, in semitones above it. */
export const chord = (name) => {
  const [, root, kind] = /^([A-G][#b]?)(m?)$/.exec(name);
  return { root: PC[root], third: kind ? 3 : 4, fifth: 7 };
};

/** The lowest note of pitch class `pc` at or above `floor`. */
export const above = (pc, floor) => floor + ((((pc - floor) % 12) + 12) % 12);

/** The note `steps` steps of `scale` (pitch classes) below `m` (or above, for a negative `steps`): a third below, by default. */
export const below = (m, scale, steps = 2) => {
  const dir = steps < 0 ? 1 : -1;
  let k = m;
  for (let s = 0; s < Math.abs(steps);) if (scale.includes((((k += dir) % 12) + 12) % 12)) s++;
  return k;
};

/** The pitch classes of a scale: by its notes' names. */
export const scale = (...names) => names.map((n) => PC[n]);
