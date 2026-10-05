// Tiny WebAudio synth: every sound is generated, no asset files.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.drone = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  tone({ f, f2 = null, dur = 0.15, type = 'square', vol = 0.15, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.2, freq = 1000, freq2 = null, q = 1, type = 'bandpass', delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(freq, t);
    if (freq2) flt.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  step(mode = 'walk') {
    const vol = mode === 'sprint' ? 0.11 : mode === 'sneak' ? 0.012 : 0.05;
    const freq = (mode === 'sprint' ? 140 : 180) + Math.random() * 60;
    this.noise({ dur: mode === 'sprint' ? 0.09 : 0.07, vol, freq, q: 0.8, type: 'lowpass' });
  }
  /** A step wading through a pool: a slosh of water rather than a footfall. */
  wade(mode = 'walk') {
    const vol = mode === 'sprint' ? 0.14 : mode === 'sneak' ? 0.02 : 0.08;
    const f = 650 + Math.random() * 250;
    this.noise({ dur: mode === 'sprint' ? 0.2 : 0.16, vol, freq: f, freq2: f * 0.45, q: 1.1 });
    this.tone({ f: 190 + Math.random() * 40, f2: 95, dur: 0.1, type: 'sine', vol: vol * 0.5 });
  }
  /** Something stepping down into a pool, `vol` 0..1 as near as it is. */
  splash(vol = 1) {
    this.noise({ dur: 0.38, vol: 0.2 * vol, freq: 1400, freq2: 320, q: 0.8 });
    this.tone({ f: 150, f2: 60, dur: 0.22, type: 'sine', vol: 0.12 * vol });
  }
  swing() { this.noise({ dur: 0.18, vol: 0.22, freq: 700, freq2: 2600, q: 0.9 }); }
  whiff() { this.noise({ dur: 0.14, vol: 0.1, freq: 2000, freq2: 800, q: 0.7 }); }
  /** A melee blow landing: 'weak' (on a weakness) crunches, 'resist' (resisted) lands dull with a clank. */
  hit(effect) {
    if (effect === 'weak') {
      this.tone({ f: 130, f2: 40, dur: 0.2, type: 'square', vol: 0.28 });
      this.noise({ dur: 0.14, vol: 0.4, freq: 380, q: 0.5 });
      this.noise({ dur: 0.05, vol: 0.18, freq: 2600, q: 1.2 });
    } else if (effect === 'resist') {
      this.tone({ f: 110, f2: 70, dur: 0.1, type: 'triangle', vol: 0.18 });
      this.tone({ f: 620, f2: 560, dur: 0.12, type: 'triangle', vol: 0.07 });
      this.noise({ dur: 0.06, vol: 0.14, freq: 300, q: 0.5, type: 'lowpass' });
    } else {
      this.tone({ f: 150, f2: 55, dur: 0.14, type: 'square', vol: 0.22 });
      this.noise({ dur: 0.09, vol: 0.3, freq: 500, q: 0.5 });
    }
  }
  block() { this.tone({ f: 1000, f2: 750, dur: 0.09, type: 'triangle', vol: 0.15 }); }
  guardBreak() {
    this.noise({ dur: 0.3, vol: 0.28, freq: 500, freq2: 120, type: 'lowpass', q: 1 });
    this.tone({ f: 240, f2: 80, dur: 0.25, type: 'square', vol: 0.1 });
  }
  hurt() {
    this.tone({ f: 200, f2: 90, dur: 0.22, type: 'sawtooth', vol: 0.2 });
    this.noise({ dur: 0.1, vol: 0.2, freq: 300, q: 0.5 });
  }
  kill() { this.tone({ f: 320, f2: 70, dur: 0.4, type: 'square', vol: 0.12 }); }
  /** Coins clinking in a purse: `shakes` jingles a beat apart, at `vol` (the shopkeeper's are quiet). */
  coins(vol = 1, shakes = 1) {
    for (let i = 0; i < shakes * 3; i++) {
      const delay = Math.floor(i / 3) * 0.24 + (i % 3) * 0.035 + Math.random() * 0.02;
      this.tone({ f: 2400 + Math.random() * 1800, dur: 0.06, type: 'triangle', vol: 0.07 * vol, delay });
      this.noise({ dur: 0.035, vol: 0.06 * vol, freq: 6500, type: 'highpass', q: 0.7, delay });
    }
  }
  /** A drop of water landing, `vol` 0..1 by how near it is. */
  drip(vol = 1) {
    const f = 1100 + Math.random() * 900;
    this.tone({ f, f2: f * 0.5, dur: 0.06, type: 'sine', vol: 0.06 * vol });
  }
  pickup() {
    this.tone({ f: 660, dur: 0.08, type: 'triangle', vol: 0.14 });
    this.tone({ f: 990, dur: 0.12, type: 'triangle', vol: 0.14, delay: 0.07 });
  }
  /** A door opening or shutting: a swinging one creaks and thuds; one of halves sliding apart ('slide') grinds, humming. */
  door(open, kind = 'swing') {
    if (kind === 'slide') {
      this.noise({ dur: 0.45, vol: 0.2, freq: open ? 220 : 320, freq2: open ? 90 : 120, type: 'lowpass', q: 1.2 });
      this.tone({ f: open ? 70 : 110, f2: open ? 115 : 65, dur: 0.6, type: 'sine', vol: 0.12 });
      this.tone({ f: open ? 104 : 164, f2: open ? 172 : 97, dur: 0.6, type: 'sine', vol: 0.06 });
      if (!open) this.noise({ dur: 0.18, vol: 0.22, freq: 140, type: 'lowpass', q: 0.8, delay: 0.38 });
      return;
    }
    if (open) {
      this.tone({ f: 140, f2: 90, dur: 0.45, type: 'sawtooth', vol: 0.05 });
      this.noise({ dur: 0.35, vol: 0.12, freq: 700, freq2: 300, q: 3 });
    } else {
      this.noise({ dur: 0.2, vol: 0.28, freq: 160, type: 'lowpass', q: 0.8 });
    }
  }
  locked() {
    this.noise({ dur: 0.08, vol: 0.2, freq: 1800, q: 4 });
    this.noise({ dur: 0.08, vol: 0.2, freq: 1500, q: 4, delay: 0.11 });
  }
  unlock() {
    this.tone({ f: 900, f2: 1400, dur: 0.06, type: 'square', vol: 0.08 });
    this.noise({ dur: 0.12, vol: 0.2, freq: 2400, q: 3, delay: 0.08 });
  }
  /** A chest's lid creaking up on its hinges, and falling back against them. */
  chestOpen() {
    this.tone({ f: 190, f2: 120, dur: 0.38, type: 'sawtooth', vol: 0.045 });
    this.noise({ dur: 0.3, vol: 0.1, freq: 900, freq2: 420, q: 4 });
    this.noise({ dur: 0.12, vol: 0.2, freq: 220, type: 'lowpass', q: 0.8, delay: 0.42 });
  }
  /** A chest smashed: a crunch of wood, and splinters snapping. */
  chestBreak() {
    this.noise({ dur: 0.22, vol: 0.34, freq: 380, type: 'lowpass', q: 0.7 });
    this.tone({ f: 120, f2: 50, dur: 0.16, type: 'square', vol: 0.16 });
    for (let i = 0; i < 3; i++) this.noise({ dur: 0.04, vol: 0.14, freq: 1800 + Math.random() * 1400, q: 3, delay: 0.04 + i * 0.05 + Math.random() * 0.03 });
  }
  /** A mimic giving itself away: a wet snarl, and its jaws snapping. */
  mimic() {
    this.tone({ f: 95, f2: 60, dur: 0.55, type: 'sawtooth', vol: 0.16 });
    this.tone({ f: 142, f2: 88, dur: 0.5, type: 'sawtooth', vol: 0.08 });
    this.noise({ dur: 0.5, vol: 0.16, freq: 600, freq2: 260, q: 2 });
    this.noise({ dur: 0.06, vol: 0.24, freq: 1500, q: 1.5, delay: 0.45 });
  }
  /** A mimic licking its lips, `vol` 0..1 by how near it is: a faint, wet smack. */
  lick(vol = 1) {
    this.noise({ dur: 0.18, vol: 0.05 * vol, freq: 700, freq2: 1600, q: 5 });
    this.noise({ dur: 0.05, vol: 0.05 * vol, freq: 2400, q: 2, delay: 0.5 });
  }
  equip() { this.noise({ dur: 0.12, vol: 0.18, freq: 1500, q: 2 }); }
  stairs() { this.noise({ dur: 0.9, vol: 0.3, freq: 300, freq2: 60, type: 'lowpass', q: 0.7 }); }
  drink() { for (let i = 0; i < 4; i++) this.tone({ f: 380 + i * 90, f2: 260, dur: 0.07, type: 'sine', vol: 0.12, delay: i * 0.08 }); }
  read() { this.noise({ dur: 0.35, vol: 0.14, freq: 3500, type: 'highpass', q: 0.5 }); }
  zap() { this.tone({ f: 1400, f2: 180, dur: 0.28, type: 'sawtooth', vol: 0.11 }); }
  shatter() {
    this.noise({ dur: 0.25, vol: 0.2, freq: 4000, type: 'highpass', q: 0.8 });
    this.tone({ f: 2400, f2: 1800, dur: 0.12, type: 'triangle', vol: 0.06 });
  }
  alert(pitch = 1) { this.tone({ f: 170 * pitch, f2: 260 * pitch, dur: 0.28, type: 'sawtooth', vol: 0.1 }); }
  shoot(kind) {
    if (kind === 'arrow') this.noise({ dur: 0.16, vol: 0.14, freq: 2600, freq2: 1100, q: 1.5 });
    else this.tone({ f: 520, f2: 140, dur: 0.35, type: 'sine', vol: 0.14 });
  }
  // Your bow (see bow.js): the string creaking back, loosed with a twang and the hiss of the arrow, eased off, and an
  // arrow clattering off a wall.
  drawBow() {
    this.tone({ f: 70, f2: 95, dur: 0.5, type: 'sawtooth', vol: 0.025 });
    this.noise({ dur: 0.45, vol: 0.04, freq: 500, freq2: 900, q: 6 });
  }
  loose() {
    this.tone({ f: 190, f2: 120, dur: 0.18, type: 'triangle', vol: 0.18 });
    this.tone({ f: 380, f2: 240, dur: 0.1, type: 'triangle', vol: 0.06 });
    this.noise({ dur: 0.22, vol: 0.12, freq: 3200, freq2: 1200, q: 1.2, delay: 0.02 });
  }
  ease() { this.noise({ dur: 0.18, vol: 0.05, freq: 700, freq2: 400, q: 4 }); }
  thunk() {
    this.noise({ dur: 0.07, vol: 0.18, freq: 1400, q: 2 });
    this.tone({ f: 260, f2: 160, dur: 0.08, type: 'triangle', vol: 0.08 });
  }
  // A thrown weapon (see thrown.js): your arm drawn back, the throw's rush of air, and one striking a wall or breaking,
  // by what it's made of ('stone', 'wood' or 'steel').
  windUp() { this.noise({ dur: 0.22, vol: 0.05, freq: 450, freq2: 950, q: 1.4 }); }
  hurl() { this.noise({ dur: 0.2, vol: 0.2, freq: 900, freq2: 3200, q: 1.1 }); }
  clatter(stuff) {
    if (stuff === 'stone') {
      // A clack, and a smaller one as it bounces.
      for (const [delay, vol] of [[0, 1], [0.11, 0.45]]) {
        this.tone({ f: 620, f2: 380, dur: 0.05, type: 'triangle', vol: 0.12 * vol, delay });
        this.noise({ dur: 0.06, vol: 0.2 * vol, freq: 2200, q: 1.5, delay });
      }
    } else if (stuff === 'steel') {
      this.tone({ f: 2900, f2: 2650, dur: 0.22, type: 'triangle', vol: 0.06 });
      this.tone({ f: 4300, dur: 0.12, type: 'sine', vol: 0.03 });
      this.noise({ dur: 0.05, vol: 0.14, freq: 4000, q: 2 });
    } else this.thunk();
  }
  crack(stuff) {
    if (stuff === 'stone') this.noise({ dur: 0.16, vol: 0.18, freq: 900, freq2: 400, q: 0.8 });
    else if (stuff === 'steel') {
      this.tone({ f: 3400, f2: 2200, dur: 0.08, type: 'triangle', vol: 0.06 });
      this.noise({ dur: 0.06, vol: 0.12, freq: 5000, type: 'highpass', q: 0.8 });
    } else this.noise({ dur: 0.05, vol: 0.12, freq: 2400, q: 3 });
  }
  levelUp() { [523, 659, 784, 1046].forEach((f, i) => this.tone({ f, dur: 0.18, type: 'triangle', vol: 0.14, delay: i * 0.1 })); }
  trap() { this.tone({ f: 90, f2: 420, dur: 0.22, type: 'square', vol: 0.2 }); }
  /** A hidden trap found: a soft, bright chime rising, and a shimmer. */
  trapFound() {
    [1175, 1568, 2349].forEach((f, i) => this.tone({ f, dur: 0.16 + i * 0.05, type: 'triangle', vol: 0.07, delay: i * 0.07 }));
    this.noise({ dur: 0.35, vol: 0.03, freq: 7000, type: 'highpass', q: 0.6, delay: 0.1 });
  }
  // Traps going off, after the click of the plate (trap()): spikes shearing up, gas hissing out, an alarm bell.
  spikes() {
    this.noise({ dur: 0.2, vol: 0.28, freq: 3200, freq2: 1400, q: 2.5 });
    this.tone({ f: 1900, f2: 900, dur: 0.14, type: 'triangle', vol: 0.1 });
  }
  hiss() {
    this.tone({ f: 160, f2: 60, dur: 0.12, type: 'square', vol: 0.12 });
    this.noise({ dur: 1.6, vol: 0.16, freq: 5000, freq2: 2500, type: 'highpass', q: 0.6 });
  }
  bell(rings = 5) {
    for (let i = 0; i < rings; i++) {
      const v = 1 - i / (rings + 1), d = i * 0.3;
      this.tone({ f: 1180, dur: 1.1, type: 'sine', vol: 0.13 * v, delay: d });
      this.tone({ f: 1180 * 2.76, dur: 0.6, type: 'sine', vol: 0.05 * v, delay: d });
      this.tone({ f: 1180 * 5.4, dur: 0.3, type: 'sine', vol: 0.025 * v, delay: d });
    }
  }
  teleport() { this.tone({ f: 200, f2: 1700, dur: 0.45, type: 'sine', vol: 0.14 }); }
  curse() { this.tone({ f: 300, f2: 100, dur: 0.6, type: 'sawtooth', vol: 0.12 }); }
  horn() {
    this.tone({ f: 110, dur: 1.0, type: 'sawtooth', vol: 0.22 });
    this.tone({ f: 165, dur: 1.0, type: 'sawtooth', vol: 0.16 });
  }
  death() { this.tone({ f: 220, f2: 35, dur: 1.8, type: 'sawtooth', vol: 0.22 }); }
  victory() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ f, dur: 0.3, type: 'triangle', vol: 0.14, delay: i * 0.14 })); }

  /** Low ambient drone, re-tuned per theme. */
  setDrone(freq) {
    if (!this.ctx) return;
    this.stopDrone();
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.05, t + 2);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 260;
    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoG.gain.value = 120;
    lfo.connect(lfoG).connect(flt.frequency);
    const oscs = [freq, freq * 1.498, freq * 0.502].map((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      o.detune.value = (i - 1) * 7;
      o.connect(flt);
      o.start();
      return o;
    });
    flt.connect(out).connect(this.master);
    lfo.start();
    this.drone = { out, oscs: [...oscs, lfo] };
  }

  stopDrone() {
    this.water(0);
    this.outdoors(0);
    this.wind(0);
    this.rift(0);
    this.lava(0);
    if (!this.drone || !this.ctx) return;
    const { out, oscs } = this.drone;
    const t = this.ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    oscs.forEach((o) => o.stop(t + 1.1));
    this.drone = null;
  }

  /** Running water, as loud as `level` (0..1): the sewers' channels, louder as you near them. */
  water(level) {
    if (!this.ctx) return;
    if (!this.waterOut) {
      if (level <= 0) return;
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const low = c.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 1400;
      const band = c.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 650;
      band.Q.value = 1.3;
      // Two slow wobbles in the band make it gurgle rather than hiss.
      for (const [rate, depth] of [[2.3, 240], [0.41, 160]]) {
        const lfo = c.createOscillator(), amount = c.createGain();
        lfo.frequency.value = rate;
        amount.gain.value = depth;
        lfo.connect(amount).connect(band.frequency);
        lfo.start();
      }
      this.waterOut = c.createGain();
      this.waterOut.gain.value = 0;
      src.connect(low).connect(band).connect(this.waterOut).connect(this.master);
      src.start();
    }
    this.waterOut.gain.setTargetAtTime(level * 0.14, this.ctx.currentTime, 0.4);
  }

  /**
   * The world above, heard down the way up from the first floor, as loud as `level` (0..1): a soft breeze, and now and
   * then a bird singing up there. Called a few times a second (see Level.update).
   */
  outdoors(level) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.airOut) {
      if (level <= 0) return;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const high = c.createBiquadFilter(), low = c.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = 500;
      low.type = 'lowpass';
      low.frequency.value = 2400;
      this.airOut = c.createGain();
      this.airOut.gain.value = 0;
      src.connect(high).connect(low).connect(this.airOut).connect(this.master);
      src.start();
    }
    this.airOut.gain.setTargetAtTime(level * 0.035, c.currentTime, 0.8);
    if (level > 0.1 && Math.random() < 0.07 * level) {
      const f = 2600 + Math.random() * 1400, notes = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < notes; i++) {
        const up = Math.random() < 0.5;
        this.tone({ f: f * (up ? 0.85 : 1.15), f2: f * (up ? 1.2 : 0.8), dur: 0.07, type: 'sine', vol: 0.03 * level, delay: i * (0.09 + Math.random() * 0.05) });
      }
    }
  }

  /** Wind moaning up out of a chasm, as loud as `level` (0..1). */
  wind(level) {
    if (!this.ctx) return;
    if (!this.windOut) {
      if (level <= 0) return;
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      // A narrow band swept slowly up and down whistles and moans; a slower swell makes it gust.
      const band = c.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 320;
      band.Q.value = 5;
      const sweep = c.createOscillator(), sweepAmount = c.createGain();
      sweep.frequency.value = 0.09;
      sweepAmount.gain.value = 140;
      sweep.connect(sweepAmount).connect(band.frequency);
      sweep.start();
      const gust = c.createGain(), swell = c.createOscillator(), swellAmount = c.createGain();
      gust.gain.value = 0.7;
      swell.frequency.value = 0.21;
      swellAmount.gain.value = 0.3;
      swell.connect(swellAmount).connect(gust.gain);
      swell.start();
      this.windOut = c.createGain();
      this.windOut.gain.value = 0;
      src.connect(band).connect(gust).connect(this.windOut).connect(this.master);
      src.start();
    }
    this.windOut.gain.setTargetAtTime(level * 0.5, this.ctx.currentTime, 0.6);
  }

  /** The voice of a rift, as loud as `level` (0..1): a low, uneasy hum from far below, whispers over it. */
  rift(level) {
    if (!this.ctx) return;
    if (!this.riftOut) {
      if (level <= 0) return;
      const c = this.ctx;
      this.riftOut = c.createGain();
      this.riftOut.gain.value = 0;
      this.riftOut.connect(this.master);
      // Three low tones, two a hair apart so they beat slowly, through a dark filter.
      const low = c.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 220;
      const hum = c.createGain();
      hum.gain.value = 0.045;
      for (const f of [46, 46.7, 69.2]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.connect(low);
        o.start();
      }
      low.connect(hum).connect(this.riftOut);
      // Whispers: noise in a narrow band that wanders up and down, swelling and falling away.
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const band = c.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1100;
      band.Q.value = 9;
      const wander = c.createOscillator(), wanderAmount = c.createGain();
      wander.frequency.value = 0.13;
      wanderAmount.gain.value = 500;
      wander.connect(wanderAmount).connect(band.frequency);
      wander.start();
      const breath = c.createGain(), swell = c.createOscillator(), swellAmount = c.createGain();
      breath.gain.value = 0.8;
      swell.frequency.value = 0.37;
      swellAmount.gain.value = 0.5;
      swell.connect(swellAmount).connect(breath.gain);
      swell.start();
      src.connect(band).connect(breath).connect(this.riftOut);
      src.start();
    }
    this.riftOut.gain.setTargetAtTime(level * 0.35, this.ctx.currentTime, 0.6);
  }

  /** Lava, as loud as `level` (0..1): a deep rumble, and thick bubbling over it. */
  lava(level) {
    if (!this.ctx) return;
    if (!this.lavaOut) {
      if (level <= 0) return;
      const c = this.ctx;
      this.lavaOut = c.createGain();
      this.lavaOut.gain.value = 0;
      this.lavaOut.connect(this.master);
      const noise = () => {
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        src.start();
        return src;
      };
      // The rumble: noise through a low filter.
      const low = c.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 140;
      const rumble = c.createGain();
      rumble.gain.value = 1.1;
      noise().connect(low).connect(rumble).connect(this.lavaOut);
      // Bubbling: a band of noise wobbled quickly and slowly, so it gloops rather than hisses.
      const band = c.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 300;
      band.Q.value = 4;
      for (const [rate, depth] of [[4.3, 120], [0.7, 90]]) {
        const lfo = c.createOscillator(), amount = c.createGain();
        lfo.frequency.value = rate;
        amount.gain.value = depth;
        lfo.connect(amount).connect(band.frequency);
        lfo.start();
      }
      const bubbles = c.createGain();
      bubbles.gain.value = 0.9;
      noise().connect(band).connect(bubbles).connect(this.lavaOut);
    }
    this.lavaOut.gain.setTargetAtTime(level * 0.3, this.ctx.currentTime, 0.5);
  }
}
