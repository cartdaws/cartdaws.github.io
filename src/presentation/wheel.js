import { WEAPONS } from '../game/weapons.js';

// The weapon wheel: hold the weapon button (Q, or the on-screen ARMS button) to open it, steer with the mouse or thumb, release to choose.
// Nine wedges, one per weapon, clockwise from the top. Weapons not yet absorbed are shown dimmed and cannot be chosen.
export class WeaponWheel {
  constructor(loadout) {
    this.loadout = loadout;
    this.open = false;
    this.cx = 0; this.cy = 0;
    this.hi = -1;
    const root = this.root = document.getElementById('wheel');
    root.innerHTML = '<div class="w-ring"></div><div class="w-center"><b></b><small></small></div>';
    this.ring = root.querySelector('.w-ring');
    this.title = root.querySelector('.w-center b'); this.note = root.querySelector('.w-center small');
    this.items = WEAPONS.map((w, i) => {
      const a = (-90 + i * 40) * Math.PI / 180;
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'w-item'; el.dataset.i = i;
      el.style.left = `calc(50% + ${Math.cos(a) * 118}px)`; el.style.top = `calc(50% + ${Math.sin(a) * 118}px)`;
      el.innerHTML = `<i>${i + 1}</i><span></span>`;
      el.addEventListener('pointerenter', () => { if (this.open) this.setHi(i); });
      this.ring.appendChild(el);
      return el;
    });
    this.refresh();
  }

  refresh() {
    const L = this.loadout;
    this.items.forEach((el, i) => {
      const w = WEAPONS[i], have = L.has(i);
      el.classList.toggle('locked', !have); el.classList.toggle('current', L.selected === i);
      el.querySelector('span').textContent = have ? w.name : 'LOCKED';
      el.title = `Arm ${w.limb + 1}`;
    });
  }

  show() { this.open = true; this.cx = this.cy = 0; this.refresh(); this.setHi(this.loadout.selected); this.root.classList.remove('hidden'); }

  // mouse / thumb movement steers the highlight around the ring
  feed(dx, dy) {
    if (!this.open) return;
    this.cx += dx * 0.012; this.cy += dy * 0.012;
    const l = Math.hypot(this.cx, this.cy);
    if (l > 1.4) { this.cx *= 1.4 / l; this.cy *= 1.4 / l; }
    if (l < 0.35) return;                                           // a dead centre keeps the current choice
    const a = Math.atan2(this.cy, this.cx) * 180 / Math.PI;
    this.setHi(Math.round((((a + 90) / 40) % 9 + 9) % 9) % 9);
  }

  setHi(i) {
    this.hi = i;
    this.items.forEach((el, k) => el.classList.toggle('hi', k === i));
    const w = WEAPONS[i], have = this.loadout.has(i);
    this.title.textContent = have ? w.name : 'LOCKED';
    this.note.textContent = have ? `Arm ${w.limb + 1} · ${w.note}` : `Arm ${w.limb + 1} · ${w.note}`;
  }

  // release: choose the highlighted weapon if it is unlocked
  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.add('hidden');
    if (this.hi >= 0) this.loadout.select(this.hi);
  }
}
