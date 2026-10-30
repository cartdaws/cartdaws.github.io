const GAME_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.buttons = new Set();
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.fake = false; // test-only: pretend pointer lock is held
    this.touch = false; // touch device: there is no pointer lock, "locked" simply means the game has control
    this.axisX = 0; this.axisY = 0; // analog move stick
    this.touchAbsorb = false;
    this.fireGuardUntil = 0;
    this.onLockChange = () => {};
    this.onLockError = () => {};
    this.onKeyDown = () => {};
    this.onMouseDown = () => {};

    document.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.onKeyDown(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (Math.abs(e.movementX) > 500 || Math.abs(e.movementY) > 500) return; // pointer-lock spikes
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked || performance.now() < this.fireGuardUntil) return;
      this.buttons.add(e.button);
      this.onMouseDown(e.button);
    });
    document.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => this.setLocked(document.pointerLockElement === this.canvas));
    document.addEventListener('pointerlockerror', () => this.onLockError());
  }

  setLocked(v) {
    if (this.locked === v) return;
    this.locked = v;
    if (!v) this.clear();
    this.onLockChange(v);
  }

  lock() {
    // Swallow the click that resumes play so it cannot fire a shot.
    this.fireGuardUntil = performance.now() + 250;
    if (this.fake || this.touch) { this.setLocked(true); return; }
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => this.onLockError());
    } catch (e) { this.onLockError(); }
  }

  unlock() {
    if (this.fake || this.touch) { this.setLocked(false); return; }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  clear() { this.axisX = this.axisY = 0; this.keys.clear(); this.pressed.clear(); this.buttons.clear(); this.dx = 0; this.dy = 0; }
  down(code) { return this.keys.has(code); }
  was(code) { return this.pressed.has(code); }
  mouse(btn) { return this.buttons.has(btn); }
  takeLook() { const r = [this.dx, this.dy]; this.dx = 0; this.dy = 0; return r; }
  endFrame() { this.pressed.clear(); }
}
