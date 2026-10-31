import { WEAPONS } from '../game/weapons.js';

// The weapon wheel: hold the weapon button (Q, or the on-screen ARMS button) to open it, steer with the mouse or thumb, release to choose.
// Only forms that are learned AND working appear; they are spread evenly round the ring, clockwise from the top. Releasing with the pointer
// near the centre, or cancelling (Esc / pause), leaves the current weapon unchanged.
export class WeaponWheel {
  constructor(loadout) {
    this.loadout = loadout;
    this.open = false;
    this.cx = 0; this.cy = 0;
    this.hi = -1;
    this.list = [];
    const root = this.root = document.getElementById('wheel');
    root.innerHTML = '<div class="w-ring"></div><div class="w-center"><b></b><small></small></div>';
    this.ring = root.querySelector('.w-ring');
    this.title = root.querySelector('.w-center b'); this.note = root.querySelector('.w-center small');
  }

  build() {
    this.list = this.loadout.selectable();
    for (const el of [...this.ring.querySelectorAll('.w-item')]) el.remove();
    const n = Math.max(1, this.list.length), step = 360 / n;
    this.items = this.list.map((wi, k) => {
      const a = (-90 + k * step) * Math.PI / 180, r = n === 1 ? 0 : 118;
      const w = WEAPONS[wi];
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'w-item';
      el.style.left = `calc(50% + ${Math.cos(a) * r}px)`; el.style.top = `calc(50% + ${Math.sin(a) * (n === 1 ? -110 : r)}px)`;
      el.innerHTML = `<i>${k + 1}</i><span>${w.name}</span>`;
      el.classList.toggle('current', this.loadout.selected === wi);
      el.addEventListener('pointerenter', () => { if (this.open) this.setHi(k); });
      el.addEventListener('pointerdown', (e) => { if (this.open) { this.setHi(k); e.stopPropagation(); } });
      this.ring.appendChild(el);
      return el;
    });
  }

  show() {
    this.open = true; this.cx = this.cy = 0;
    this.build();
    this.setHi(Math.max(0, this.list.indexOf(this.loadout.selected)));
    this.root.classList.remove('hidden');
  }

  // mouse / thumb movement steers the highlight around the ring
  feed(dx, dy) {
    if (!this.open) return;
    this.cx += dx * 0.012; this.cy += dy * 0.012;
    const l = Math.hypot(this.cx, this.cy);
    if (l > 1.4) { this.cx *= 1.4 / l; this.cy *= 1.4 / l; }
    if (l < 0.35 || this.list.length < 2) return;                   // a dead centre keeps the current choice
    const n = this.list.length, a = Math.atan2(this.cy, this.cx) * 180 / Math.PI;
    this.setHi(Math.round((((a + 90) / (360 / n)) % n + n) % n) % n);
  }

  setHi(k) {
    this.hi = k;
    (this.items || []).forEach((el, i) => el.classList.toggle('hi', i === k));
    const w = WEAPONS[this.list[k]];
    if (w) { this.title.textContent = w.name; this.note.textContent = `Arm ${this.loadout.carrier[this.list[k]] + 1}${w.note ? ' · ' + w.note : ''}`; }
  }

  // release: choose the highlighted weapon
  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.add('hidden');
    if (this.hi >= 0 && this.list[this.hi] !== undefined) this.loadout.select(this.list[this.hi]);
  }

  // cancel: close without changing anything
  cancel() { this.open = false; this.root.classList.add('hidden'); }
}
