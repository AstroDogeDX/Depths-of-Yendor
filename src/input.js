// Keys the game uses. In fullscreen, Keyboard Lock claims these so Ctrl+W (sneak forward!), Ctrl+T and
// Ctrl+N reach the game instead of the browser. Escape is left alone so it still exits.
export const GAME_KEYS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyT', 'KeyF', 'KeyC', 'KeyN', 'KeyI', 'KeyM', 'KeyP',
  'Tab', 'Space', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
];

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.locked = false;
    this.onLockChange = null;
    this.captureCtrl = false; // set by the game while a run is being played
    this.ctrlSeenAt = -Infinity;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }
      if (e.target instanceof HTMLInputElement) return;
      if (e.ctrlKey) this.ctrlSeenAt = performance.now();
      // Ctrl is the sneak key, so swallow Ctrl-shortcuts (save, bookmark, find, print...) while playing.
      // The browser still reserves Ctrl+W/T/N; see Game.enterFullscreen and the beforeunload guard.
      if (this.captureCtrl && (e.ctrlKey || e.metaKey)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Control') this.ctrlSeenAt = performance.now();
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
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
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.onLockError?.());
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  get attack() { return this.mouseDown || this.keys.has('Space'); }
  get attackPressed() { return this.pressed.has('Mouse0') || this.pressed.has('Space'); }
  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  get sneak() { return this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.keys.has('KeyC'); }
  /** Ctrl is down, or was a moment ago: a close/reload now is probably Ctrl+W/R mid-sneak. */
  ctrlRecently() {
    return this.keys.has('ControlLeft') || this.keys.has('ControlRight') || performance.now() - this.ctrlSeenAt < 800;
  }

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
