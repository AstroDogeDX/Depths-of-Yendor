import { render, seeded } from './synth.js';
import { N, chord, above, below, scale } from './notes.js';

// The shop's music, playing while you're in the shop (see music.js): a refuge, gentle and welcoming, but foreign to
// the world above, a little mysterious. It's in D Hijaz, its second and third a step and a half apart, all plucked
// strings: a warm oud low, ornamented with grace notes; a kanun, its paired strings shimmering, high; a tanpura's
// buzzing drone beneath; and, in its middle, a goblet drum's soft maqsum and a tinkle of finger cymbals. In 4/4,
// unhurried, looping, in a small room:
//   I    bars 0-1    Stepping in: the tanpura's drone, the kanun's shimmer, the finger cymbals.
//   II   bars 2-9    The tune, on the oud, the kanun shimmering over it.
//   III  bars 10-17  Again, the kanun with it, an octave up, its long notes trembling, and the drum beneath.
//   IV   bars 18-25  The kanun calls, high; the oud answers, low.
//   V    bars 26-27  The drum falls quiet, and the oud comes home.

export const BPM = 76;
const BEAT = 60 / BPM, BAR = 4 * BEAT;
export const BARS = 28;
export const LOOP = BARS * BAR;

const CHANNELS = {
  oud: { gain: 1.17, pan: -0.15, send: 0.3 },
  kanun: { gain: 5, pan: 0.3, send: 0.35 },
  tanpura: { gain: 0.68, pan: 0, send: 0.3 },
  doum: { gain: 0.29, pan: -0.1, send: 0.15 },
  tak: { gain: 0.67, pan: 0.1, send: 0.15 },
  zill: { gain: 0.48, pan: 0.35, send: 0.5 },
};
const ROOM = { room: 0.78, damp: 0.45 }; // (a smaller, warmer room than the title's hall)

const HIJAZ = scale('D', 'Eb', 'F#', 'G', 'A', 'Bb', 'C');

// The tune, a bar to a line: [note, beats]. Written an octave above where the oud plays it.
const TUNE = [
  [['D4', 1], ['Eb4', 0.5], ['F#4', 0.5], ['G4', 1.5], ['A4', 0.5]],
  [['Bb4', 1], ['A4', 0.5], ['G4', 0.5], ['F#4', 2]],
  [['G4', 0.5], ['F#4', 0.5], ['Eb4', 1], ['F#4', 0.5], ['G4', 0.5], ['A4', 1]],
  [['G4', 0.5], ['F#4', 0.5], ['Eb4', 0.5], ['F#4', 0.5], ['D4', 2]],
  [['A4', 1], ['Bb4', 0.5], ['C5', 0.5], ['Bb4', 1], ['A4', 1]],
  [['G4', 1.5], ['A4', 0.5], ['Bb4', 0.5], ['A4', 0.5], ['G4', 1]],
  [['F#4', 0.5], ['G4', 0.5], ['A4', 1], ['G4', 0.5], ['F#4', 0.5], ['Eb4', 1]],
  [['F#4', 0.5], ['Eb4', 0.5], ['D4', 3]],
];
// The kanun's shimmer through the tune: the chord it breaks in each bar's second half.
const SHIMMER = ['D', 'D', 'D', 'D', 'Gm', 'Gm', 'D', 'D'];

// The calls (the kanun's, written an octave below where it plays them) and the oud's answers.
const CALL = [
  [['D5', 1], ['C5', 0.5], ['Bb4', 0.5], ['A4', 1], ['G4', 1]],
  [['A4', 0.5], ['Bb4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F#4', 2]],
];
const ANSWER = [
  [['D4', 0.5], ['Eb4', 0.5], ['F#4', 1], ['Eb4', 0.5], ['D4', 0.5], ['C4', 1]],
  [['D4', 3], [null, 1]],
];
const CALL_AGAIN = [
  [['G4', 1], ['F#4', 0.5], ['Eb4', 0.5], ['D4', 1], ['C4', 1]],
  [['Bb3', 0.5], ['C4', 0.5], ['Bb3', 0.5], ['A3', 0.5], ['G3', 2]],
];
const HOME = [[['A3', 1], ['G3', 0.5], ['F#3', 0.5], ['Eb3', 1], ['F#3', 1]], [['D3', 4]]];

// The goblet drum's maqsum, softly: [stroke, beat, velocity].
const MAQSUM = [['doum', 0, 0.55], ['tak', 0.5, 0.35], ['tak', 1.5, 0.3], ['doum', 2, 0.5], ['tak', 3, 0.35], ['tak', 3.5, 0.15]];

const HUMAN = new Set(['oud', 'kanun', 'tanpura', 'doum', 'tak']);

/** The score: every note of the piece, as render (synth.js) takes them. */
export function score() {
  const notes = [], rand = seeded(11);
  const play = (inst, bar, beat, midi, beats, vel, extra = {}) => {
    const human = HUMAN.has(inst);
    notes.push({
      inst, midi, dur: beats * BEAT, ...extra,
      t: Math.max(0, (bar * 4 + beat) * BEAT + (human ? (rand() - 0.5) * 0.014 : 0)),
      vel: vel * (human ? 0.92 + rand() * 0.16 : 1),
    });
  };
  /**
   * A tune: `bars` of [note, beats] from `bar` on, raised `up` semitones. With `grace`, a longer note has the note
   * above it flicked in just before it (the oud's ornament); with `tremolo`, a long one's plucked again and again (the
   * kanun's).
   */
  const line = (inst, bar, bars, vel, { up = 0, grace = false, tremolo = false } = {}) => bars.forEach((notesInBar, b) => {
    let beat = 0;
    for (const [name, beats] of notesInBar) {
      if (name) {
        const m = N(name) + up;
        if (grace && beats >= 1.5) play(inst, bar + b, beat - 0.12, below(m, HIJAZ, -1), 0.12, vel * 0.7);
        if (tremolo && beats >= 2) for (let k = 0; k < beats * 4; k++) play(inst, bar + b, beat + k / 4, m, 0.25, vel * (k ? 0.45 : 1));
        else play(inst, bar + b, beat, m, beats, vel);
      }
      beat += beats;
    }
  });
  /** The kanun's shimmer: a chord broken upward, high and soft, from `beat`. */
  const shimmer = (bar, beat, name, vel) => {
    const c = chord(name), r = above(c.root, 74);
    [r, r + c.third, r + c.fifth, r + 12].forEach((m, k) => play('kanun', bar, beat + k * 0.25, m, 1, vel * (1 - k * 0.1)));
  };
  /** The oud low under the kanun's calls: the tonic and its fifth, once a bar each. */
  const pulse = (bar, bars) => {
    for (let b = 0; b < bars; b++) {
      play('oud', bar + b, 0, N('D2'), 2, 0.5);
      play('oud', bar + b, 2, N('A2'), 2, 0.4);
    }
  };
  const drum = (bar, bars) => {
    for (let b = 0; b < bars; b++) for (const [inst, beat, vel] of MAQSUM) play(inst, bar + b, beat, 0, 0.5, vel);
  };
  const cymbals = (bar) => play('zill', bar, 0, N('D7'), 1, 0.25);

  // The tanpura, all through: Pa, Sa, Sa, and low Sa, a beat apart, over and over.
  for (let b = 0; b < BARS; b++) [N('A2'), N('D3'), N('D3'), N('D2')].forEach((m, k) => play('tanpura', b, k, m, 4, k === 3 ? 0.55 : 0.5));

  // I. Stepping in
  cymbals(0);
  shimmer(0, 0, 'D', 0.3);
  shimmer(1, 0, 'D', 0.25);
  shimmer(1, 2, 'Gm', 0.2);

  // II. The tune
  line('oud', 2, TUNE, 0.8, { up: -12, grace: true });
  SHIMMER.forEach((name, b) => shimmer(2 + b, 2, name, 0.22));

  // III. Again, the kanun with it
  cymbals(10);
  line('oud', 10, TUNE, 0.8, { up: -12, grace: true });
  line('kanun', 10, TUNE, 0.35, { up: 12, tremolo: true });
  drum(10, 8);

  // IV. Call and answer
  cymbals(18);
  line('kanun', 18, CALL, 0.4, { up: 12, tremolo: true });
  pulse(18, 2);
  line('oud', 20, ANSWER, 0.8, { up: -12, grace: true });
  shimmer(21, 2, 'D', 0.2);
  cymbals(22);
  line('kanun', 22, CALL_AGAIN, 0.4, { up: 12, tremolo: true });
  pulse(22, 2);
  line('oud', 24, TUNE.slice(6), 0.8, { up: -12, grace: true });
  drum(18, 8);

  // V. Home
  line('oud', 26, HOME, 0.75, { grace: true });
  shimmer(27, 2, 'D', 0.22);

  return notes;
}

/** Renders the shop's music: { L, R (its two sides, a loop's worth), sampleRate, loop (seconds), levels }. */
export const renderShop = () => render(score(), CHANNELS, { loop: LOOP, tail: 6, seed: 2, hall: ROOM });
