import { SLOTS } from './mutations.js';

// The wheel: a plan of your own body seen from above. Eight sectors, one for each limb in its real place round you, whether or not anything has grown there yet.
// Hold Q to open it (the world slows), steer with the mouse, let go to raise that limb. Centre keeps what you have.
const sectorDeg = (k) => -90 + 22.5 + k * 360 / SLOTS;     // the limbs sit either side of straight ahead, so no sector is dead centre at the top
export class MutationWheel {
  constructor(evo) {
    this.evo = evo; this.open = false; this.cx = 0; this.cy = 0; this.hi = -1;
    const root = this.root = document.createElement('div'); root.id = 'v2-wheel'; root.className = 'hidden';
    root.innerHTML = '<div class="v2w-offer"><em></em><b></b><small></small></div><div class="v2w-ring"></div><div class="v2w-mid"><b></b><small></small></div><div class="v2w-keys">MOUSE AND LEFT CLICK, OR 1 TO 8: GIVE UP THAT LIMB &nbsp;·&nbsp; Q OR E: KEEP YOUR BODY</div>';
    document.body.appendChild(root);
    this.ring = root.querySelector('.v2w-ring'); this.title = root.querySelector('.v2w-mid b'); this.note = root.querySelector('.v2w-mid small'); this.offerEl = root.querySelector('.v2w-offer'); this.offering = null;
    root.querySelector('.v2w-mid').addEventListener('pointerup', () => { if (this.offering) this.resolve(-1); });
    this.items = [];
    for (let k = 0; k < SLOTS; k++) {
      const a = sectorDeg(k) * Math.PI / 180, el = document.createElement('div');
      el.className = 'v2w-item'; el.style.left = `calc(50% + ${Math.cos(a) * 172}px)`; el.style.top = `calc(50% + ${Math.sin(a) * 172}px)`;
      el.addEventListener('pointerenter', () => { if (this.open) this.setHi(k); });
      el.addEventListener('pointerup', () => { if (this.open) { this.setHi(k); this.close(); } });
      this.ring.appendChild(el); this.items.push(el);
    }
    const st = document.createElement('style');
    st.textContent = `#v2-wheel{position:fixed;inset:0;z-index:7;pointer-events:none;background:radial-gradient(circle,rgba(4,6,8,.55),rgba(4,6,8,.15) 60%)}#v2-wheel.hidden{display:none}.v2w-offer,.v2w-keys{display:none}#v2-wheel.offer .v2w-offer{display:block;position:absolute;left:50%;top:max(8px,calc(50% - 316px));transform:translateX(-50%);width:min(92vw,560px);text-align:center;color:#f0e8e0;text-shadow:0 1px 8px #000}#v2-wheel.offer .v2w-keys{display:block;position:absolute;left:50%;top:calc(50% + 225px);transform:translateX(-50%);width:min(92vw,640px);text-align:center;font-size:10px;letter-spacing:.14em;color:#c8c0b8;text-shadow:0 1px 6px #000}#v2-wheel.offer .v2w-mid{pointer-events:auto;cursor:pointer}.v2w-offer em{display:block;font-style:normal;font-size:10px;letter-spacing:.3em;color:#e0a0a8;margin-bottom:6px}.v2w-offer b{display:block;font-size:20px;letter-spacing:.18em;font-weight:600}.v2w-offer small{display:block;margin-top:6px;font-size:11px;letter-spacing:.08em;line-height:1.45;color:#d4ccc4}
      .v2w-ring{position:absolute;inset:0}.v2w-item{position:absolute;width:112px;height:62px;margin:-31px 0 0 -56px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center;font-size:10px;letter-spacing:.1em;color:#d6d0c8;background:rgba(10,12,14,.72);border:1px solid rgba(214,208,200,.22);border-radius:4px;pointer-events:auto}
      .v2w-item.empty{color:rgba(214,208,200,.28);border-style:dashed;background:rgba(10,12,14,.35)}.v2w-item.cur{border-color:rgba(214,208,200,.7)}.v2w-item.hi{background:rgba(120,80,88,.72);border-color:#fff;color:#fff}
      .v2w-item u{text-decoration:none;font-size:8px;letter-spacing:.08em;color:#b8b2aa}.v2w-item i{font-style:normal;letter-spacing:.2em;color:#e0a0a8;font-size:9px}.v2w-mid{position:absolute;left:50%;top:50%;width:216px;transform:translate(-50%,-50%);text-align:center;color:#e8e2da}.v2w-mid b{display:block;font-size:14px;letter-spacing:.14em}.v2w-mid small{display:block;margin-top:6px;font-size:9.5px;line-height:1.5;letter-spacing:.05em;color:#b8b2aa}.v2w-mid small em{display:block;font-style:normal;margin-top:3px}.v2w-mid small em.p{color:#b6c8a8}.v2w-mid small em.m{color:#d4a0a0}
      #v2-energy{margin-top:8px}#v2-energy .bar{height:4px;background:rgba(255,255,255,.12)}#v2-energy i{display:block;height:100%;width:100%;background:#d8a0a8;transition:background .1s}#v2-energy.dry i{background:#ff4a30}
      #v2-toast{position:fixed;left:50%;top:21%;transform:translateX(-50%);z-index:6;text-align:center;pointer-events:none;opacity:0;transition:opacity .25s;color:#f0e8e0;text-shadow:0 1px 8px #000;width:min(92vw,620px)}#v2-toast.on{opacity:1}#v2-toast b{display:block;font-size:22px;letter-spacing:.2em;font-weight:600}#v2-toast small{display:block;margin-top:8px;font-size:12px;letter-spacing:.1em;line-height:1.5;color:#d4ccc4}#v2-toast em{display:block;font-style:normal;font-size:10px;letter-spacing:.3em;color:#e0a0a8;margin-bottom:6px}`;
    document.head.appendChild(st);
  }

  render() {
    const e = this.evo;
    this.items.forEach((el, k) => {
      const q = e.equipped[k];
      el.classList.toggle('empty', !q); el.classList.toggle('cur', e.selected === k);
      el.innerHTML = q ? `<span>${q.m.name}</span><i>${'▲'.repeat(q.tier)}${q.n > q.tier ? ` ×${q.n}` : ''}</i>${q.m.moveNote ? `<u>${q.m.moveNote(q.tier)}</u>` : ''}` : `<span>${k + 1}</span>`;
    });
  }

  show() { this.open = true; this.cx = this.cy = 0; this.render(); this.setHi(this.evo.selected >= 0 ? this.evo.selected : -1); this.root.classList.remove('hidden'); }

  // Something new, and every limb is taken: nothing changes unless you say so.
  offer(m, onDone) {
    this.offering = { m, onDone }; this.open = true; this.cx = this.cy = 0; this.render();
    const [a, b, c] = this.offerEl.children; a.textContent = 'NO LIMB LEFT TO GROW IT ON'; b.textContent = m.name; c.textContent = m.note;
    this.root.classList.add('offer'); this.root.classList.remove('hidden'); this.setHi(-1);
  }
  resolve(k) {
    const o = this.offering; if (!o) return;
    this.offering = null; this.open = false; this.root.classList.add('hidden'); this.root.classList.remove('offer');
    o.onDone(k >= 0 && this.evo.equipped[k] ? k : -1);
  }

  feed(dx, dy) {
    if (!this.open) return;
    this.cx += dx * 0.012; this.cy += dy * 0.012;
    const l = Math.hypot(this.cx, this.cy);
    if (l > 1.4) { this.cx *= 1.4 / l; this.cy *= 1.4 / l; }
    if (l < 0.35) { if (this.offering && this.hi !== -1) this.setHi(-1); return; }
    const a = Math.atan2(this.cy, this.cx) * 180 / Math.PI;
    this.setHi(Math.round((((a - sectorDeg(0)) / (360 / SLOTS)) % SLOTS + SLOTS) % SLOTS) % SLOTS);
  }

  setHi(k) {
    this.hi = k;
    this.items.forEach((el, i) => el.classList.toggle('hi', i === k));
    const q = this.evo.equipped[k];
    if (this.offering) {
      this.title.textContent = q ? 'LOSE ' + q.m.name : 'KEEP YOUR BODY';
      this.note.textContent = q ? this.offering.m.name + ' takes its limb, and starts again from nothing.' : 'What you took still feeds you. ' + this.offering.m.name + ' will not grow, but your body knows it now.';
      return;
    }
    this.title.textContent = q ? q.m.name : k < 0 ? 'BARE ARMS' : 'NOTHING GROWN HERE';
    if (q) { this.note.innerHTML = `${q.m.role}<em class="p">+ ${q.m.plus}</em><em class="m">− ${q.m.minus}</em>`; return; }
    this.note.textContent = k < 0 ? 'Your own arms. They cost you nothing.' : 'Absorb something to grow onto this limb.';
  }

  close() {
    if (!this.open) return;
    if (this.offering) { this.resolve(this.hi); return; }
    this.open = false; this.root.classList.add('hidden');
    if (this.evo.equipped[this.hi]) this.evo.select(this.hi);
  }
  cancel() { this.offering = null; this.open = false; this.root.classList.add('hidden'); this.root.classList.remove('offer'); }
}
