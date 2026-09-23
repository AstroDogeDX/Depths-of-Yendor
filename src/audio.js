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
  swing() { this.noise({ dur: 0.18, vol: 0.22, freq: 700, freq2: 2600, q: 0.9 }); }
  whiff() { this.noise({ dur: 0.14, vol: 0.1, freq: 2000, freq2: 800, q: 0.7 }); }
  hit() {
    this.tone({ f: 150, f2: 55, dur: 0.14, type: 'square', vol: 0.22 });
    this.noise({ dur: 0.09, vol: 0.3, freq: 500, q: 0.5 });
  }
  block() { this.tone({ f: 1000, f2: 750, dur: 0.09, type: 'triangle', vol: 0.15 }); }
  hurt() {
    this.tone({ f: 200, f2: 90, dur: 0.22, type: 'sawtooth', vol: 0.2 });
    this.noise({ dur: 0.1, vol: 0.2, freq: 300, q: 0.5 });
  }
  kill() { this.tone({ f: 320, f2: 70, dur: 0.4, type: 'square', vol: 0.12 }); }
  pickup() {
    this.tone({ f: 660, dur: 0.08, type: 'triangle', vol: 0.14 });
    this.tone({ f: 990, dur: 0.12, type: 'triangle', vol: 0.14, delay: 0.07 });
  }
  door(open) {
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
  levelUp() { [523, 659, 784, 1046].forEach((f, i) => this.tone({ f, dur: 0.18, type: 'triangle', vol: 0.14, delay: i * 0.1 })); }
  trap() { this.tone({ f: 90, f2: 420, dur: 0.22, type: 'square', vol: 0.2 }); }
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
    if (!this.drone || !this.ctx) return;
    const { out, oscs } = this.drone;
    const t = this.ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    oscs.forEach((o) => o.stop(t + 1.1));
    this.drone = null;
  }
}
