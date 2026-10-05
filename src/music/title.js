import { render, seeded } from './synth.js';
import { N, chord, above, below, scale } from './notes.js';

// The title theme: a minute and forty seconds, in 3/4, looping: mysterious, a little spooky, but beckoning. Its
// leitmotif, a fifth leaping up, a fall and a climb to the bright sixth of D Dorian, then home, tells of the descent:
//   I    bars 0-7    A bell tolls far below, and voices whisper. A harp over a drone, and from afar, a recorder's first
//                    phrase of the leitmotif: the way down.
//   II   bars 8-15   The leitmotif in full on the recorder, with harp, lute, bass and a tabor: adventure.
//   III  bars 16-23  Again, higher: a fiddle takes it up an octave, the recorder under it, the tabor in full.
//   IV   bars 24-39  Foreboding. The dance stops, the drone sinks, a bell tolls, voices moan, and the leitmotif returns
//                    from the depths on a serpent, its fifth turned to a tritone, over a heartbeat; then it sinks
//                    away, the heartbeat slowing.
//   V    bars 40-47  Echoes: the leitmotif, its bright sixth darkened, plucked high and slow like a music box, over
//                    the dark and the whispering voices.
//   VI   bars 48-55  The harp takes up its arpeggios again, the drone returns, and the recorder remembers the leitmotif,
//                    falling to the dominant that leads back down to the start.
// The instruments are synthesized (see synth.js), and it's rendered once, in a worker as the game starts (see
// music.js): tools/music.mjs renders it to a .wav file, to listen to as it's worked on.

export const BPM = 100;
const BEAT = 60 / BPM, BAR = 3 * BEAT;
export const BARS = 56;
export const LOOP = BARS * BAR;

// How each instrument sits in the mix: its level, where it stands (-1 left to 1 right), and how much of it the hall
// gets (see render in synth.js).
const CHANNELS = {
  harp: { gain: 1, pan: -0.3, send: 0.35 },
  lute: { gain: 0.8, pan: 0.35, send: 0.2 },
  recorder: { gain: 0.42, pan: 0.1, send: 0.45 },
  fiddle: { gain: 0.32, pan: -0.15, send: 0.35 },
  bass: { gain: 0.28, pan: 0, send: 0.15 },
  serpent: { gain: 0.32, pan: 0, send: 0.35 },
  choir: { gain: 0.5, pan: 0, send: 0.55 },
  drone: { gain: 0.22, pan: 0, send: 0.3 },
  bell: { gain: 0.42, pan: 0.25, send: 0.6 },
  thump: { gain: 0.42, pan: -0.1, send: 0.12 },
  slap: { gain: 0.35, pan: -0.1, send: 0.12 },
  tek: { gain: 0.4, pan: 0.15, send: 0.1 },
  heart: { gain: 0.45, pan: 0, send: 0.1 },
};

const DORIAN = scale('D', 'E', 'F', 'G', 'A', 'B', 'C');

// The leitmotif, a bar to a line: [note, beats].
const THEME = [
  [['D4', 1], ['A4', 2]],
  [['G4', 0.5], ['F4', 0.5], ['E4', 1], ['F4', 1]],
  [['G4', 1], ['A4', 1], ['C5', 1]],
  [['B4', 3]],
  [['D4', 1], ['A4', 2]],
  [['G4', 0.5], ['F4', 0.5], ['E4', 1], ['D4', 1]],
  [['C4', 1], ['D4', 1], ['E4', 1]],
  [['D4', 3]],
];
const THEME_CHORDS = ['Dm', 'C', 'F', 'G', 'Dm', 'C', 'Am', 'Dm'];

// Darkened: its bright sixth flattened, for the echoes.
const SHADOW = THEME.map((bar, b) => (b === 3 ? [['Bb4', 3]] : bar));
const SHADOW_CHORDS = ['Dm', 'Bb', 'F', 'Gm', 'Dm', 'Bb', 'Am', 'A'];

// Corrupted: low, in the Phrygian, its fifth turned to a tritone.
const DARK = [
  [['D3', 1], ['Ab3', 2]],
  [['G3', 0.5], ['F3', 0.5], ['Eb3', 1], ['F3', 1]],
  [['G3', 1], ['Ab3', 1], ['C4', 1]],
  [['Bb3', 3]],
  [['D3', 1], ['Ab3', 2]],
  [['G3', 0.5], ['F3', 0.5], ['Eb3', 1], ['D3', 1]],
  [['C3', 1], ['D3', 1], ['Eb3', 1]],
  [['D3', 3]],
];
const DARK_CHORDS = ['Dm', 'Eb', 'Fm', 'Bbm', 'Dm', 'Eb', 'Cm', 'Dm'];

/**
 * Triumphant: the leitmotif in the major, rising at its end to the octave, its chords under it. Not in the title
 * theme (its story is the descent): kept for a theme for the run's end, to come.
 */
export const TRIUMPHANT = {
  bars: [
    [['D4', 1], ['A4', 2]],
    [['G4', 0.5], ['F#4', 0.5], ['E4', 1], ['F#4', 1]],
    [['G4', 1], ['A4', 1], ['D5', 1]],
    [['C#5', 3]],
    [['D4', 1], ['A4', 2]],
    [['B4', 0.5], ['A4', 0.5], ['G4', 1], ['F#4', 1]],
    [['G4', 1], ['A4', 1], ['C#5', 1]],
    [['D5', 3]],
  ],
  chords: ['D', 'A', 'G', 'A', 'D', 'G', 'A', 'D'],
};

// The tabor's patterns: a bar's [drum, beat, velocity].
const PATTERNS = {
  light: [['thump', 0, 0.7], ['tek', 1, 0.3], ['slap', 2, 0.4], ['tek', 2.5, 0.25]],
  full: [['thump', 0, 0.8], ['tek', 0.5, 0.3], ['slap', 1, 0.45], ['tek', 1.5, 0.3], ['slap', 2, 0.5], ['tek', 2.5, 0.35]],
  fill: [0, 0.5, 1, 1.5, 2, 2.5].map((beat, k) => ['slap', beat, 0.4 + k * 0.06]),
};

// Struck and plucked notes land a few milliseconds off the beat, a little harder or softer, as a player's would.
const HUMAN = new Set(['harp', 'lute', 'thump', 'slap', 'tek']);

/** The score: every note of the piece, as render (synth.js) takes them. */
export function score() {
  const notes = [], rand = seeded(7);
  const play = (inst, bar, beat, midi, beats, vel, extra = {}) => {
    const human = HUMAN.has(inst);
    notes.push({
      inst, midi, dur: beats * BEAT, ...extra,
      t: Math.max(0, (bar * 3 + beat) * BEAT + (human ? (rand() - 0.5) * 0.012 : 0)),
      vel: vel * (human ? 0.94 + rand() * 0.12 : 1),
    });
  };
  /** A melody: `bars` of [note, beats] from `bar` on, each note raised `up` semitones, or moved by `map` (a harmony). */
  const line = (inst, bar, bars, vel, { up = 0, map = (m) => m } = {}) => bars.forEach((notesInBar, b) => {
    let beat = 0;
    for (const [name, beats] of notesInBar) {
      if (name) play(inst, bar + b, beat, map(N(name)) + up, beats, vel);
      beat += beats;
    }
  });
  /** The harp's arpeggio through each bar's chord, in eighths: root, fifth, octave, tenth, twelfth, tenth. */
  const arpeggio = (bar, chords, vel) => chords.forEach((name, b) => {
    const c = chord(name), r = above(c.root, 38);
    [r, r + c.fifth, r + 12, r + 12 + c.third, r + 12 + c.fifth, r + 12 + c.third]
      .forEach((m, k) => play('harp', bar + b, k * 0.5, m, 0.5, vel * (k === 0 ? 1 : 0.8)));
  });
  /** The harp's chords rolled, low, one to a bar. */
  const rolled = (bar, chords, vel) => chords.forEach((name, b) => {
    const c = chord(name), r = above(c.root, 38);
    [r, r + c.fifth, r + 12, r + 12 + c.third].forEach((m, k) => play('harp', bar + b, k * 0.12, m, 3, vel));
  });
  /** The lute strummed on every beat, hardest on the first, its strings a moment apart, low to high. */
  const strum = (bar, chords, vel) => chords.forEach((name, b) => {
    const c = chord(name), r = above(c.root, 50);
    for (let beat = 0; beat < 3; beat++) {
      [r, r + c.third, r + c.fifth, r + 12].forEach((m, k) => play('lute', bar + b, beat + k * 0.04, m, 0.95, vel * (beat ? 0.6 : 1)));
    }
  });
  /** The bass on each bar's root, at or above `floor`. */
  const roots = (bar, chords, vel, floor = 33) => chords.forEach((name, b) => play('bass', bar + b, 0, above(chord(name).root, floor), 3, vel));
  /** Voices holding each bar's chord, in `vowel`, its root at or above `floor`. */
  const voices = (bar, chords, vel, vowel, floor = 50) => chords.forEach((name, b) => {
    const c = chord(name), r = above(c.root, floor);
    [r, r + c.third, r + c.fifth].forEach((m) => play('choir', bar + b, 0, m, 3.3, vel, { vowel }));
  });
  /** The tabor's `pattern`, through `bars` bars from `bar`. */
  const drums = (bar, bars, pattern) => {
    for (let b = 0; b < bars; b++) for (const [inst, beat, vel] of PATTERNS[pattern]) play(inst, bar + b, beat, 0, 0.5, vel);
  };

  // I. The way down
  play('bell', 0, 0, N('D3'), 6, 0.3); // (far below)
  voices(0, ['Dm', 'C', 'Dm', 'C'], 0.22, 'oo');
  play('drone', 0, 0, [N('D2'), N('A2')], 24 * 3, 0.7, { cut: 650 });
  arpeggio(0, ['Dm', 'C', 'Dm', 'C'], 0.45);
  arpeggio(4, ['Dm', 'C', 'F', 'G'], 0.55);
  line('recorder', 4, THEME.slice(0, 4), 0.5);

  // II. The leitmotif
  line('recorder', 8, THEME, 0.75);
  arpeggio(8, THEME_CHORDS, 0.55);
  strum(8, THEME_CHORDS, 0.35);
  roots(8, THEME_CHORDS, 0.6);
  drums(8, 8, 'light');

  // III. Again, higher
  line('fiddle', 16, THEME, 0.65, { up: 12 });
  line('recorder', 16, THEME, 0.45, { map: (m) => below(m, DORIAN) });
  arpeggio(16, THEME_CHORDS, 0.6);
  strum(16, THEME_CHORDS, 0.4);
  roots(16, THEME_CHORDS, 0.7);
  drums(16, 7, 'full');
  drums(23, 1, 'fill');

  // IV. Foreboding
  play('drone', 24, 0, [N('D1'), N('D2')], 24 * 3, 0.7, { cut: 260 }); // (on under the echoes)
  for (const [b, v] of [[24, 0.55], [26, 0.55], [28, 0.55], [30, 0.55], [32, 0.55], [34, 0.55], [36, 0.45], [38, 0.4]]) play('bell', b, 0, N('D3'), 6, v);
  rolled(24, ['Dm', 'Eb', 'Dm', 'Eb'], 0.5);
  voices(24, ['Dm', 'Eb', 'Dm', 'Eb'], 0.45, 'oo');
  line('serpent', 28, DARK, 0.75);
  voices(28, DARK_CHORDS, 0.5, 'oo');
  roots(28, DARK_CHORDS, 0.35, 26);
  for (let b = 28; b < 36; b++) {
    play('heart', b, 0, 0, 1, 0.8);
    play('heart', b, 1.5, 0, 1, 0.7);
  }
  // ...sinking away: the serpent's last, the heartbeat slowing.
  const sinking = ['Bbm', 'Eb', 'Dm', 'A'];
  line('serpent', 36, [[['D3', 1], ['Ab3', 2]], [['G3', 0.5], ['F3', 0.5], ['Eb3', 2]], [['D3', 3]]], 0.55);
  rolled(36, sinking, 0.45);
  voices(36, sinking, 0.45, 'oo');
  roots(36, sinking, 0.3, 26);
  for (const [b, v] of [[36, 0.65], [37, 0.5], [38, 0.35]]) play('heart', b, 0, 0, 1, v);

  // V. Echoes: the music box
  line('harp', 40, SHADOW, 0.55, { up: 12 });
  rolled(40, SHADOW_CHORDS, 0.3);
  voices(40, SHADOW_CHORDS, 0.3, 'oo');
  for (const b of [40, 44]) play('bell', b, 0, N('D3'), 6, 0.3);

  // VI. Back to the start
  play('drone', 47, 0, [N('D2'), N('A2')], 9 * 3, 0.6, { cut: 600 }); // (dying away into the intro's, round the loop)
  arpeggio(48, ['Dm', 'Dm', 'Dm', 'Dm', 'C', 'Bb', 'A', 'A'], 0.45);
  line('recorder', 50, [THEME[0], THEME[1], [['E4', 3]], [['D4', 3]], [['C#4', 3]], [['E4', 1.5], [null, 1.5]]], 0.45);
  roots(52, ['C', 'Bb', 'A', 'A'], 0.45);

  return notes;
}

/** Renders the title theme: { L, R (its two sides, a loop's worth), sampleRate, loop (seconds), levels }. */
export const renderTitle = () => render(score(), CHANNELS, { loop: LOOP, tail: 6, seed: 1 });
