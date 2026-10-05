// The title theme (theme.js), looping on the title screen. It's rendered as the game starts, in a worker, and plays
// once it's ready and sound is allowed (browsers hold all sound back till the first click or key: see Sfx.init),
// fading in, and fading out as a run starts. The Music toggle on the title screen turns it off (kept in localStorage).

const VOLUME = 0.45;
const FADE_IN = 2.5; // seconds
const FADE_OUT = 1.5;

export class Music {
  /** `sfx`: the game's Sfx, whose AudioContext it plays on. */
  constructor(sfx) {
    this.sfx = sfx;
    this.theme = null; // the rendered theme's samples, till they're made into `buffer`
    this.buffer = null;
    this.source = null;
    this.gain = null;
    this.wanted = false;
    try {
      this.on = localStorage.getItem('doy.music') !== 'off';
    } catch {
      this.on = true;
    }
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      this.theme = e.data;
      worker.terminate();
      this.update();
    };
    worker.onerror = (e) => {
      console.warn('The title theme could not be rendered:', e.message);
      worker.terminate();
    };
  }

  /** Whether the title theme should play: while the title screen shows. */
  setTitle(on) {
    this.wanted = on;
    this.update();
  }

  /** The Music toggle. */
  setOn(on) {
    this.on = on;
    try {
      localStorage.setItem('doy.music', on ? 'on' : 'off');
    } catch { /* storage unavailable; the choice just won't persist */ }
    this.update();
  }

  /** Starts or stops the theme to match what's wanted, once there's sound and it's rendered. */
  update() {
    const ctx = this.sfx.ctx;
    if (!ctx) return;
    if (this.theme) {
      const { L, R, sampleRate } = this.theme;
      this.buffer = ctx.createBuffer(2, L.length, sampleRate);
      this.buffer.copyToChannel(L, 0);
      this.buffer.copyToChannel(R, 1);
      this.theme = null;
    }
    const play = this.wanted && this.on && !!this.buffer;
    if (play && !this.source) this.start(ctx);
    else if (!play && this.source) this.stop(ctx);
  }

  start(ctx) {
    const t = ctx.currentTime;
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0.0001, t);
    this.gain.gain.exponentialRampToValueAtTime(VOLUME, t + FADE_IN);
    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true; // (its end rings on into its start: see render in synth.js)
    this.source.connect(this.gain).connect(ctx.destination);
    this.source.start(t);
  }

  stop(ctx) {
    const t = ctx.currentTime, { source, gain } = this;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + FADE_OUT);
    source.stop(t + FADE_OUT + 0.05);
    this.source = this.gain = null;
  }
}
