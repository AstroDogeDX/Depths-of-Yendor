// The game's music: the title theme (title.js) on the title screen, and the shop's (shop.js) while you're in the shop;
// on the floors themselves, only their ambience (see Sfx.setDrone). Each piece is rendered as the game starts, in a
// worker, and plays once it's ready and sound is allowed (browsers hold all sound back till the first click or key:
// see Sfx.init), looping. One fades out as another fades in (and one wanted back before it has faded away rises again
// from where it is). The title theme starts from its beginning each time; the shop's picks up where it left off, so
// stepping in and out doesn't start it over. The Music toggle (on the title screen and the pause panel) turns it all
// off, and is kept in localStorage.

// Each piece: how loud it plays, and whether it picks up where it left off.
const PIECES = { title: { volume: 0.225, resume: false }, shop: { volume: 0.175, resume: true } };
const FADE_IN = 1; // seconds, in a straight rise from silence, heard at once (an exponential one is unheard for most of it)
const FADE_OUT = 1.5;

export class Music {
  /** `sfx`: the game's Sfx, whose AudioContext it plays on. */
  constructor(sfx) {
    this.sfx = sfx;
    this.pieces = {}; // name -> { samples (till they're made into a buffer), buffer, offset (where it left off) }
    this.wanted = null;
    this.playing = null; // { name, source, gain, began }
    this.fading = null; // the piece last stopped, till it has faded out: as playing, and the timer that stops it
    try {
      this.on = localStorage.getItem('doy.music') !== 'off';
    } catch {
      this.on = true;
    }
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      this.pieces[e.data.name] = { samples: e.data, buffer: null, offset: 0 };
      if (Object.keys(this.pieces).length === Object.keys(PIECES).length) worker.terminate();
      this.update();
    };
    worker.onerror = (e) => {
      console.warn('The music could not be rendered:', e.message);
      worker.terminate();
    };
  }

  /** The piece that should be playing ('title' or 'shop'), or none. */
  play(name) {
    if (name === this.wanted) return;
    this.wanted = name;
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

  /** Starts or stops pieces to match what's wanted, once there's sound and the piece is rendered. */
  update() {
    const ctx = this.sfx.ctx;
    if (!ctx) return;
    const want = this.on ? this.wanted : null;
    if (this.playing && this.playing.name !== want) this.stop(ctx);
    if (want && !this.playing) {
      const piece = this.pieces[want];
      if (!piece) return; // (not rendered yet: it starts when it is)
      if (piece.samples) {
        const { L, R, sampleRate } = piece.samples;
        piece.buffer = ctx.createBuffer(2, L.length, sampleRate);
        piece.buffer.copyToChannel(L, 0);
        piece.buffer.copyToChannel(R, 1);
        piece.samples = null;
      }
      this.start(ctx, want, piece);
    }
  }

  start(ctx, name, piece) {
    const t = ctx.currentTime, volume = PIECES[name].volume, fading = this.fading;
    if (fading?.name === name) {
      // Wanted back before it has faded away (you stepped out of the shop and straight back in): it rises again from
      // where it is, rather than starting over itself.
      clearTimeout(fading.timer);
      const level = Math.min(fading.gain.gain.value, volume);
      fading.gain.gain.cancelScheduledValues(t);
      fading.gain.gain.setValueAtTime(level, t);
      fading.gain.gain.linearRampToValueAtTime(volume, t + FADE_IN * (1 - level / volume));
      this.playing = fading;
      this.fading = null;
      return;
    }
    const gain = ctx.createGain(), source = ctx.createBufferSource();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + FADE_IN);
    source.buffer = piece.buffer;
    source.loop = true; // (its end rings on into its start: see render in synth.js)
    source.connect(gain).connect(ctx.destination);
    source.start(t, piece.offset);
    this.playing = { name, source, gain, began: t - piece.offset };
  }

  stop(ctx) {
    const t = ctx.currentTime, playing = this.playing, { name, source, gain, began } = playing, piece = this.pieces[name];
    piece.offset = PIECES[name].resume ? (t - began) % piece.buffer.duration : 0;
    const level = Math.max(0.0001, gain.gain.value); // (read before the fade in is cancelled)
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + FADE_OUT);
    playing.timer = setTimeout(() => {
      source.stop();
      if (this.fading === playing) this.fading = null;
    }, (FADE_OUT + 0.05) * 1000);
    this.fading = playing;
    this.playing = null;
  }
}
