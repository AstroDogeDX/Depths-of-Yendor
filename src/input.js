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
