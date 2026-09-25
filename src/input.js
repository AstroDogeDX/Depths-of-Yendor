// Keys the game uses. In fullscreen, Keyboard Lock (Chrome, Edge) claims these, so browser shortcuts made with
// them (a slip onto Ctrl+W closing the tab) don't fire mid-run. That includes Escape: a tap reaches the game, which
// pauses, and the browser leaves fullscreen only when it's held (and says so itself).
export const GAME_KEYS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyT', 'KeyF', 'KeyC', 'KeyN', 'KeyI', 'KeyM', 'KeyP',
  'Tab', 'Space', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Escape',
];

// Mouse look reads pointer lock's movementX/Y, which browsers sometimes get badly wrong for a single event: Chrome
// (on Windows especially) now and then folds its hidden cursor's warp back to the middle of the window into one
// event, and the first events after the lock is taken can carry the cursor's jump to the middle. Taken as read,
// either whips the camera round. So motion is ignored for a moment after locking, and an event is dropped as a
// spike when it's both big (SPIKE_MIN) and far bigger (SPIKE_RATIO) than anything in the motion just before it
// (SPIKE_WINDOW). A real flick builds up over a few frames, so it gets through. If one does start with a single
// huge frame, only that frame is lost: the next is let through if it carries on the same way at much the same
// size, which a real flick does and a glitch (often a pair of opposite jumps) doesn't.
const SPIKE_MIN = 200; // px in one event
const SPIKE_RATIO = 4;
const SPIKE_WINDOW = 120; // ms
const LOCK_SETTLE = 60; // ms after the lock is taken

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.motion = []; // recent mouse events: { t, dx, dy, size, spike } (see SPIKE_WINDOW)
    this.settleUntil = 0; // ignore mouse motion until then (see LOCK_SETTLE)
    this.spikes = 0; // how many spikes have been dropped, for checking from the console
    this.mouseDown = false;
    this.locked = false;
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }
      if (e.target instanceof HTMLInputElement) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const now = performance.now();
      if (now < this.settleUntil) return;
      if (this.isSpike(e.movementX, e.movementY, now)) {
        this.spikes++;
        console.debug(`Dropped a mouse spike: ${e.movementX}, ${e.movementY}`);
        return;
      }
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouseDown = true; this.pressed.add('Mouse0'); }
      if (e.button === 2) this.pressed.add('Mouse2');
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.mouseDown = false;
      if (this.locked) {
        this.settleUntil = performance.now() + LOCK_SETTLE;
        this.motion.length = 0;
      }
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.onLockError?.());
  }

  /** Whether a mouse event's motion is a spike to drop (see SPIKE_MIN). Remembers it either way. */
  isSpike(dx, dy, now) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    while (this.motion.length && now - this.motion[0].t > SPIKE_WINDOW) this.motion.shift();
    let recent = 0;
    for (const m of this.motion) if (!m.spike) recent = Math.max(recent, m.size);
    let spike = size > SPIKE_MIN && size > recent * SPIKE_RATIO;
    const last = this.motion.at(-1);
    if (spike && last?.spike && dx * last.dx + dy * last.dy > 0 && size < last.size * 2 && size > last.size / 2) spike = false;
    this.motion.push({ t: now, dx, dy, size, spike });
    return spike;
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  get attack() { return this.mouseDown || this.keys.has('Space'); }
  get attackPressed() { return this.pressed.has('Mouse0') || this.pressed.has('Space'); }
  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }

  lock() {
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    } catch { /* pointer lock unavailable; keyboard turning still works */ }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
