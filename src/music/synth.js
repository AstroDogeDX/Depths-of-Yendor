// A small synthesizer for the game's music, in plain JavaScript (no Web Audio, no DOM), so a piece renders the same in
// a worker in the game (music/worker.js) and in Node (tools/music.mjs). A piece is a list of notes, each played on one
// of INSTRUMENTS into a stereo mix, with a hall's reverb over it (see render). Everything random comes from one seed,
// so a piece renders the same every time.

export const SR = 24000; // samples a second: plenty for these instruments, and half a CD's memory

/** A seeded random number generator (mulberry32): () => a number from 0 up to 1. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// PolyBLEP: smooths a saw's or square's jumps, so their high notes don't alias into a whine.
function blep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}
const saw = (p, dt) => 2 * p - 1 - blep(p, dt);
const square = (p, dt) => (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt);

/** A biquad filter (the RBJ cookbook's): lowpass, highpass, bandpass (peaking at 1) or peaking. set() it again to sweep it. */
class Biquad {
  constructor(type, f, q = 0.707, db = 0) {
    this.type = type;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(f, q, db);
  }

  set(f, q = this.q, db = this.db) {
    this.q = q;
    this.db = db;
    const w = (TAU * Math.min(f, SR * 0.45)) / SR, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (this.type === 'lowpass') [b0, b1, b2, a0, a1, a2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
    else if (this.type === 'highpass') [b0, b1, b2, a0, a1, a2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
    else if (this.type === 'bandpass') [b0, b1, b2, a0, a1, a2] = [alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha];
    else {
      const A = 10 ** (db / 40);
      [b0, b1, b2, a0, a1, a2] = [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A];
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/**
 * An envelope's level `t` seconds into a note held for `hold` seconds: up over `a`, down over `d` to `s`, and once
 * it's let go, from wherever it had got to, down to nothing over `r`.
 */
function adsr(t, a, d, s, r, hold) {
  const u = t < hold ? t : hold;
  const level = u < a ? u / a : u < a + d ? 1 - ((1 - s) * (u - a)) / d : s;
  if (t < hold) return level;
  const k = (t - hold) / r;
  return k >= 1 ? 0 : level * (1 - k) * (1 - k);
}

/** A vibrato's pitch factor `t` seconds into a note: `depth` either side, `rate` a second, fading in after `delay`. */
const vibrato = (t, rate, depth, delay) => 1 + depth * Math.sin(TAU * rate * t) * clamp01((t - delay) / 0.35);

// --- The instruments ---
// Each plays one note: (note, rand) => its samples, mono, from when it starts. A note is { midi (a list of them, for
// the drone), dur (seconds held), vel (0 to 1) }, and anything an instrument asks for of its own (a vowel to sing...).

/**
 * A plucked string (Karplus-Strong): a burst of noise, `bright` as it's struck, ringing round a loop a period long,
 * losing `damp` of itself each time round, till it's rung out (`ring` seconds), or let go of (`mute` seconds after the
 * note's held, if it's damped). It's read back a hair faster or slower, to bring it exactly into tune.
 */
function pluck(note, rand, { damp, bright, ring, mute = null, body = null }) {
  // (Averaging each sample with the next, the loop rings a half sample short of its length: tuned for that.)
  const f = hz(note.midi), len = Math.max(2, Math.round(SR / f + 0.5)), rate = (f * (len - 0.5)) / SR;
  const secs = mute === null ? ring : Math.min(ring, note.dur + mute), n = Math.ceil(secs * SR);
  const line = new Float32Array(len), raw = new Float32Array(Math.ceil(n * rate) + 2);
  let lp = 0, mean = 0;
  for (let i = 0; i < len; i++) {
    lp += (rand() * 2 - 1 - lp) * bright;
    line[i] = lp;
    mean += lp / len;
  }
  for (let i = 0; i < len; i++) line[i] -= mean;
  for (let i = 0, j = 0; i < raw.length; i++) {
    const k = j + 1 === len ? 0 : j + 1;
    raw[i] = line[j];
    line[j] = damp * 0.5 * (line[j] + line[k]);
    j = k;
  }
  const out = new Float32Array(n), filters = (body ?? []).map(([type, fc, q, db]) => new Biquad(type, fc, q, db));
  for (let i = 0; i < n; i++) {
    const x = i * rate, i0 = Math.floor(x), fr = x - i0, t = i / SR;
    let v = raw[i0] * (1 - fr) + raw[i0 + 1] * fr;
    for (const flt of filters) v = flt.run(v);
    if (mute !== null && t > note.dur) v *= clamp01(1 - (t - note.dur) / mute);
    out[i] = v * note.vel * clamp01((n - i) / (SR * 0.05)); // (faded out at its very end)
  }
  return out;
}

/** A harp: rings long. */
const harp = (note, rand) => pluck(note, rand, { damp: 0.997, bright: 0.5, ring: 2.8, body: [['lowpass', 5200, 0.7]] });

/** A lute: brighter, woodier, damped as the next chord's strummed. */
const lute = (note, rand) => pluck(note, rand, {
  damp: 0.993, bright: 0.8, ring: 1.4, mute: 0.12, body: [['peaking', 420, 1.2, 5], ['lowpass', 3600, 0.7]],
});

/** A recorder: a pure, breathy tone, a hair flat as it speaks, with a gentle vibrato once it's sounding. */
function recorder(note, rand) {
  const f = hz(note.midi), hold = note.dur, rel = 0.09, n = Math.ceil((hold + rel) * SR), out = new Float32Array(n);
  const breath = new Biquad('bandpass', f * 2.5, 1.2), lp = new Biquad('lowpass', 4200, 0.7);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (f * vibrato(t, 5.1, 0.006, 0.25) * (1 - 0.012 * Math.exp(-t / 0.02))) / SR;
    ph -= Math.floor(ph);
    const tone = Math.sin(TAU * ph) + 0.1 * Math.sin(2 * TAU * ph) + 0.06 * Math.sin(3 * TAU * ph);
    const air = breath.run(rand() * 2 - 1) * (0.05 + 0.4 * Math.exp(-t / 0.03));
    out[i] = lp.run((tone * 0.8 + air) * adsr(t, 0.035, 0.12, 0.85, rel, hold)) * note.vel;
  }
  return out;
}

/** A fiddle: two bowed saws, a body of resonances over them, a rasp of the bow, and a singing vibrato. */
function fiddle(note, rand) {
  const f = hz(note.midi), hold = note.dur, rel = 0.16, n = Math.ceil((hold + rel) * SR), out = new Float32Array(n);
  const lp = new Biquad('lowpass', 3400, 0.7), b1 = new Biquad('peaking', 1100, 1.4, 5), b2 = new Biquad('peaking', 2700, 2, 3);
  const hp = new Biquad('highpass', 180, 0.7);
  let p1 = 0, p2 = rand();
  for (let i = 0; i < n; i++) {
    const t = i / SR, v = vibrato(t, 5.7, 0.0045, 0.15), f1 = f * v, f2 = f * v * 1.003;
    p1 += f1 / SR;
    p1 -= Math.floor(p1);
    p2 += f2 / SR;
    p2 -= Math.floor(p2);
    const s = saw(p1, f1 / SR) + saw(p2, f2 / SR);
    const x = (s * 0.45 + (rand() * 2 - 1) * 0.04) * adsr(t, 0.09, 0.2, 0.8, rel, hold);
    out[i] = hp.run(b2.run(b1.run(lp.run(x)))) * note.vel;
  }
  return out;
}

/** Low bowed strings, for the bass: a saw whose bite fades as the note settles. */
function bass(note) {
  const f = hz(note.midi), hold = note.dur, rel = 0.25, n = Math.ceil((hold + rel) * SR), out = new Float32Array(n);
  const lp = new Biquad('lowpass', 900, 1.4);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((i & 63) === 0) lp.set(520 + 600 * Math.exp(-t / 0.15));
    ph += f / SR;
    ph -= Math.floor(ph);
    out[i] = lp.run(saw(ph, f / SR) * adsr(t, 0.04, 0.3, 0.75, rel, hold)) * note.vel;
  }
  return out;
}

/**
 * Brass: a saw and a square, opening up brassily as the note swells (to `bright` Hz), with a vibrato as it's held. A
 * serpent's is darker, slower to speak, and growls.
 */
function brass(note, rand, { bright, attack, growl }) {
  const f = hz(note.midi), hold = note.dur, rel = 0.22, n = Math.ceil((hold + rel) * SR), out = new Float32Array(n);
  const lp = new Biquad('lowpass', 400, 1.1);
  let p1 = 0, p2 = rand();
  for (let i = 0; i < n; i++) {
    const t = i / SR, v = vibrato(t, 4.8, 0.0035, 0.35), f1 = f * v, f2 = f * v * 0.996;
    if ((i & 31) === 0) lp.set(300 + bright * (1 - Math.exp(-t / (attack * 0.6))) * (0.75 + 0.25 * Math.exp(-t / 0.4)));
    p1 += f1 / SR;
    p1 -= Math.floor(p1);
    p2 += f2 / SR;
    p2 -= Math.floor(p2);
    const s = 0.7 * saw(p1, f1 / SR) + 0.3 * square(p2, f2 / SR);
    const g = adsr(t, attack, 0.25, 0.8, rel, hold) * (growl ? 1 - 0.08 * (0.5 + 0.5 * Math.sin(TAU * 7.5 * t)) : 1);
    out[i] = lp.run(s * g) * note.vel;
  }
  return out;
}
const horn = (note, rand) => brass(note, rand, { bright: 2000, attack: 0.06, growl: false });
const serpent = (note, rand) => brass(note, rand, { bright: 650, attack: 0.1, growl: true });

// A choir's vowels: formants, as [frequency, Q, gain].
const VOWELS = {
  oo: [[300, 5, 1], [870, 7, 0.45], [2240, 9, 0.12]],
  ah: [[730, 4, 1], [1090, 5, 0.6], [2440, 8, 0.2]],
};

/** Voices: three saws a little out of tune with each other, each with its own vibrato, sung through a vowel (`vowel`). */
function choir(note, rand) {
  const f = hz(note.midi), hold = note.dur, rel = 1.3, n = Math.ceil((hold + rel) * SR), out = new Float32Array(n);
  const formants = VOWELS[note.vowel ?? 'ah'].map(([fc, q, g]) => ({ flt: new Biquad('bandpass', fc, q), g }));
  const warm = new Biquad('lowpass', 1200, 0.7);
  const voices = [[-0.006, 4.6], [0, 5.0], [0.006, 5.4]].map(([det, rate]) => ({ det, rate, ph: rand(), off: rand() * 3 }));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (const vo of voices) {
      const fv = f * (1 + vo.det) * vibrato(t + vo.off, vo.rate, 0.003, 0);
      vo.ph += fv / SR;
      vo.ph -= Math.floor(vo.ph);
      s += saw(vo.ph, fv / SR);
    }
    let y = warm.run(s) * 0.1;
    for (const fm of formants) y += fm.flt.run(s) * fm.g;
    out[i] = y * 0.5 * adsr(t, 0.7, 0.3, 0.9, rel, hold) * note.vel;
  }
  return out;
}

/** A drone, on every pitch in `midi`: two saws to each, a little apart, under a slowly breathing filter (`cut` Hz). */
function drone(note, rand) {
  const hold = note.dur, rel = 2.5, n = Math.ceil((hold + rel) * SR), out = new Float32Array(n), cut = note.cut ?? 600;
  const lp = new Biquad('lowpass', cut, 0.8), lfo = rand() * TAU;
  const oscs = note.midi.flatMap((m) => [0.9975, 1.0025].map((k) => ({ f: hz(m) * k, ph: rand() })));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((i & 63) === 0) lp.set(cut * (1 + 0.25 * Math.sin(TAU * 0.07 * t + lfo)));
    let s = 0;
    for (const o of oscs) {
      o.ph += o.f / SR;
      o.ph -= Math.floor(o.ph);
      s += saw(o.ph, o.f / SR);
    }
    out[i] = lp.run(s / oscs.length) * adsr(t, 2.2, 0, 1, rel, hold) * note.vel;
  }
  return out;
}

// A bell's partials (as a church bell's: hum, prime, tierce, quint, nominal...): [ratio, level, seconds to die away].
const BELL = [[0.5, 0.45, 6], [1, 1, 4.5], [1.19, 0.55, 3.2], [1.5, 0.3, 2.8], [2, 0.5, 2.4], [2.74, 0.3, 1.6], [3, 0.2, 1.3],
  [4.07, 0.14, 0.9], [5.43, 0.08, 0.6]];

/** A tolling bell: its partials, each dying away at its own pace, and the clang of the strike. */
function bell(note, rand) {
  const f = hz(note.midi), n = Math.ceil(7 * SR), out = new Float32Array(n), clang = new Biquad('bandpass', 3000, 1.5);
  const parts = BELL.map(([r, g, decay]) => ({ w: (TAU * f * r) / SR, g, k: Math.exp(-1 / (decay * SR * 0.36)), ph: rand() * TAU }));
  for (const p of parts) {
    // (A sine by its recurrence: cheaper than Math.sin every sample.)
    let a = p.g, s1 = Math.sin(p.ph), s2 = Math.sin(p.ph - p.w);
    const c = 2 * Math.cos(p.w);
    for (let i = 0; i < n; i++) {
      const s0 = c * s1 - s2;
      s2 = s1;
      s1 = s0;
      out[i] += s0 * a;
      a *= p.k;
    }
  }
  for (let i = 0; i < n; i++) out[i] = (out[i] * 0.4 + clang.run(rand() * 2 - 1) * 0.3 * Math.exp(-i / (SR * 0.015))) * note.vel;
  return out;
}

/** A sound `secs` long, sample by sample: (t, i) => its value, times the note's velocity. */
function hit(note, secs, fn) {
  const n = Math.ceil(secs * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i) * note.vel;
  return out;
}

/** A frame drum's low beat: its skin's thump, dropping in pitch, and the slap of the hand on it. */
function thump(note, rand) {
  const skin = new Biquad('lowpass', 500, 0.7);
  let ph = 0;
  return hit(note, 0.6, (t) => {
    ph += (55 + 85 * Math.exp(-t / 0.03)) / SR;
    return Math.sin(TAU * ph) * Math.exp(-t / 0.16) + skin.run(rand() * 2 - 1) * 0.3 * Math.exp(-t / 0.02);
  });
}

/** A frame drum struck nearer its rim. */
function slap(note, rand) {
  const flt = new Biquad('bandpass', 1100, 0.9);
  let ph = 0;
  return hit(note, 0.3, (t) => {
    ph += (190 + 70 * Math.exp(-t / 0.02)) / SR;
    return flt.run(rand() * 2 - 1) * 1.6 * Math.exp(-t / 0.045) + 0.4 * Math.sin(TAU * ph) * Math.exp(-t / 0.05);
  });
}

/** A fingertip's tick on the drum's rim. */
function tek(note, rand) {
  const flt = new Biquad('highpass', 4500, 0.7);
  return hit(note, 0.15, (t) => flt.run(rand() * 2 - 1) * Math.exp(-t / 0.012));
}

/** A heartbeat, felt more than heard: lub-dub. */
function heart(note) {
  let ph = 0;
  return hit(note, 0.7, (t) => {
    const u = t < 0.22 ? t : t - 0.22, k = t < 0.22 ? 1 : 0.7;
    ph += (40 + 22 * Math.exp(-u / 0.03)) / SR;
    return Math.sin(TAU * ph) * k * Math.exp(-u / 0.12);
  });
}

/** A kettledrum: its few partials sagging a hair in pitch, and its head's thud. A `short` stroke dies quickly (a roll). */
function timpani(note, rand) {
  const f = hz(note.midi), k = note.short ? 0.35 : 1, flt = new Biquad('lowpass', 900, 0.7);
  const parts = [[1, 1, 0.9], [1.5, 0.4, 0.55], [1.98, 0.22, 0.45], [2.44, 0.12, 0.3]].map(([r, g, d]) => ({ r, g, d: d * k, ph: 0 }));
  return hit(note, 2.2 * k + 0.1, (t) => {
    const glide = 1 + 0.02 * Math.exp(-t / 0.05);
    let s = 0;
    for (const p of parts) {
      p.ph += (f * p.r * glide) / SR;
      s += Math.sin(TAU * p.ph) * p.g * Math.exp(-t / p.d);
    }
    return s * 0.6 + flt.run(rand() * 2 - 1) * 0.35 * Math.exp(-t / 0.025);
  });
}

/** A cymbal: struck, or rolled up over `swell` seconds to strike its peak then. */
function cymbal(note, rand) {
  const hp = new Biquad('highpass', 5000, 0.7), sizzle = new Biquad('bandpass', 9000, 1.5), swell = note.swell ?? 0;
  return hit(note, swell + 3, (t) => {
    const s = hp.run(rand() * 2 - 1) + sizzle.run(rand() * 2 - 1) * 0.5;
    const g = t < swell ? (t / swell) ** 2 : Math.exp(-(t - swell) / 1.2) * (swell ? 1 : clamp01(t / 0.004));
    return s * g;
  });
}

export const INSTRUMENTS = { harp, lute, recorder, fiddle, bass, horn, serpent, choir, drone, bell, thump, slap, tek, heart, timpani, cymbal };

// --- The hall ---

/**
 * A hall's reverb (Freeverb: eight damped combs and four allpasses to each side, the right a little longer), on `input`
 * (mono), `room` its size (how long it rings), `damp` how much its echoes dull. Returns its two sides.
 */
function reverb(input, { room = 0.86, damp = 0.3, spread = 23 } = {}) {
  const n = input.length, scale = SR / 44100, out = [new Float32Array(n), new Float32Array(n)];
  [0, spread].forEach((extra, side) => {
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((l) => ({ buf: new Float32Array(Math.round((l + extra) * scale)), i: 0, store: 0 }));
    const alls = [556, 441, 341, 225].map((l) => ({ buf: new Float32Array(Math.round((l + extra) * scale)), i: 0 }));
    const o = out[side];
    for (let s = 0; s < n; s++) {
      const x = input[s] * 0.015;
      let y = 0;
      for (const c of combs) {
        const v = c.buf[c.i];
        c.store = v * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * room;
        if (++c.i === c.buf.length) c.i = 0;
        y += v;
      }
      for (const a of alls) {
        const b = a.buf[a.i];
        a.buf[a.i] = y + b * 0.5;
        y = b - y;
        if (++a.i === a.buf.length) a.i = 0;
      }
      o[s] = y * 3;
    }
  });
  return out;
}

// --- Putting it together ---

/**
 * Renders a piece: `notes` ({ inst, t (seconds), and what its instrument plays: see INSTRUMENTS }), each instrument
 * mixed in by `channels` ({ gain, pan (-1 left to 1 right), send (how much of it the hall's reverb gets) }), `loop`
 * seconds long. What rings on past the loop's end (for up to `tail` seconds) is laid over its start, so it loops
 * seamlessly, its echoes and all. It's brought up so its loudest moments peak near full, gently limited above that.
 * Returns { L, R, sampleRate, loop, levels } (`levels`: each instrument's loudness, while it plays, in decibels).
 */
export function render(notes, channels, { loop, tail = 6, seed = 1 }) {
  const rand = seeded(seed), loopN = Math.round(loop * SR), n = loopN + Math.round(tail * SR);
  const L = new Float32Array(n), R = new Float32Array(n), send = new Float32Array(n);
  const energy = {};
  for (const note of notes) {
    const buf = INSTRUMENTS[note.inst](note, rand), ch = channels[note.inst];
    const pan = Math.max(-1, Math.min(1, ch.pan + (note.pan ?? 0))), a = ((pan + 1) * Math.PI) / 4;
    const gl = ch.gain * Math.cos(a), gr = ch.gain * Math.sin(a), gs = ch.gain * ch.send;
    const start = Math.round(note.t * SR), e = (energy[note.inst] ??= { sum: 0, count: 0 });
    for (let i = 0, j = start; i < buf.length && j < n; i++, j++) {
      const v = buf[i];
      L[j] += v * gl;
      R[j] += v * gr;
      send[j] += v * gs;
      e.sum += v * v * ch.gain * ch.gain;
    }
    e.count += buf.length;
  }
  const [wl, wr] = reverb(send);
  for (let i = 0; i < n; i++) {
    L[i] += wl[i];
    R[i] += wr[i];
  }
  // Round the loop: what rings past its end, over its start.
  for (let i = loopN; i < n; i++) {
    L[i - loopN] += L[i];
    R[i - loopN] += R[i];
  }
  const outL = L.subarray(0, loopN), outR = R.subarray(0, loopN);
  // Brought up so all but its loudest thousandth peaks at 0.8, and those few gently limited.
  const bins = new Uint32Array(1001);
  let peak = 0;
  for (const ch of [outL, outR]) for (let i = 0; i < loopN; i++) peak = Math.max(peak, Math.abs(ch[i]));
  for (const ch of [outL, outR]) for (let i = 0; i < loopN; i++) bins[Math.floor((Math.abs(ch[i]) / peak) * 1000)]++;
  let count = 0, top = 1000;
  while (top > 0 && count < loopN * 2 * 0.001) count += bins[top--];
  const gain = 0.8 / ((top / 1000) * peak);
  for (const ch of [outL, outR]) {
    for (let i = 0; i < loopN; i++) {
      const x = ch[i] * gain, ax = Math.abs(x);
      ch[i] = ax < 0.8 ? x : Math.sign(x) * (0.8 + 0.19 * Math.tanh((ax - 0.8) / 0.19));
    }
  }
  const levels = Object.fromEntries(Object.entries(energy).map(([k, e]) => [k, Math.round(10 * Math.log10(Math.max(1e-12, e.sum / e.count)) * 10) / 10]));
  return { L: outL.slice(), R: outR.slice(), sampleRate: SR, loop, levels };
}
