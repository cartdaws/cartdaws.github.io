// On-screen controls for phones and tablets: move stick (left), look drag (right), fire / jump / dash / pause buttons.
// They feed the same Input object the keyboard and mouse use, so gameplay code is identical.
export const isTouchDevice = () => /[?&]touch\b/.test(location.search) || window.matchMedia('(pointer: coarse)').matches;

export class TouchControls {
  constructor(input, { onPause, onSkip, onWeapons }) {
    this.input = input;
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div id="t-stick"><i id="t-base"></i><i id="t-knob"></i></div>
      <div id="t-look"></div>
      <button id="t-fire">FIRE</button>
      <button id="t-jump">JUMP</button>
      <button id="t-dash">DASH</button>
      <button id="t-absorb">ABSORB</button>
      <button id="t-weapons">ARMS</button>
      <button id="t-pause">II</button>`;
    document.body.appendChild(root);
    this.root = root;
    const $ = (id) => root.querySelector('#' + id);
    document.body.classList.add('touch');
    input.touch = true;

    // --- move stick: floating, appears where the thumb lands
    const stick = $('t-stick'), base = $('t-base'), knob = $('t-knob');
    let sid = null, ox = 0, oy = 0;
    const R = 62;
    stick.addEventListener('pointerdown', (e) => {
      if (sid !== null) return;
      sid = e.pointerId; stick.setPointerCapture(sid);
      ox = e.clientX; oy = e.clientY;
      base.style.cssText = `display:block;left:${ox}px;top:${oy}px`;
      knob.style.cssText = `display:block;left:${ox}px;top:${oy}px`;
      e.preventDefault();
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== sid) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      knob.style.left = ox + dx + 'px'; knob.style.top = oy + dy + 'px';
      const ax = dx / R, ay = -dy / R;
      const dz = (v) => (Math.abs(v) < 0.14 ? 0 : v);
      input.axisX = dz(ax); input.axisY = dz(ay);
    });
    const endStick = (e) => {
      if (e.pointerId !== sid) return;
      sid = null; input.axisX = input.axisY = 0;
      base.style.display = knob.style.display = 'none';
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    // --- look: drag anywhere on the right side
    const look = $('t-look');
    let lid = null, lx = 0, ly = 0;
    look.addEventListener('pointerdown', (e) => { if (lid !== null) return; lid = e.pointerId; look.setPointerCapture(lid); lx = e.clientX; ly = e.clientY; e.preventDefault(); });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lid) return;
      input.dx += (e.clientX - lx) * 1.7; input.dy += (e.clientY - ly) * 1.7;
      lx = e.clientX; ly = e.clientY;
    });
    const endLook = (e) => { if (e.pointerId === lid) lid = null; };
    look.addEventListener('pointerup', endLook);
    look.addEventListener('pointercancel', endLook);

    // --- buttons
    const hold = (el, down, up) => {
      el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); el.classList.add('on'); down(); e.preventDefault(); e.stopPropagation(); });
      const end = (e) => { el.classList.remove('on'); up && up(); e.stopPropagation(); };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    };
    hold($('t-fire'), () => { if (performance.now() >= input.fireGuardUntil && input.locked) { input.buttons.add(0); input.onMouseDown(0); } }, () => input.buttons.delete(0));
    hold($('t-jump'), () => input.pressed.add('Space'));
    hold($('t-dash'), () => input.pressed.add('ShiftLeft'));
    hold($('t-pause'), () => onPause());
    {
      const wb = $('t-weapons'); let wid = null, wx = 0, wy = 0;
      wb.addEventListener('pointerdown', (e) => { wid = e.pointerId; wb.setPointerCapture(wid); wx = e.clientX; wy = e.clientY; wb.classList.add('on'); onWeapons && onWeapons(true); e.preventDefault(); e.stopPropagation(); });
      wb.addEventListener('pointermove', (e) => { if (e.pointerId !== wid) return; input.dx += (e.clientX - wx) * 1.7; input.dy += (e.clientY - wy) * 1.7; wx = e.clientX; wy = e.clientY; });
      const end = (e) => { if (e.pointerId !== wid) return; wid = null; wb.classList.remove('on'); onWeapons && onWeapons(false); e.stopPropagation(); };
      wb.addEventListener('pointerup', end); wb.addEventListener('pointercancel', end);
    }
    this.absorbBtn = $('t-absorb');
    hold(this.absorbBtn, () => { input.touchInteract = true; input.onMouseDown(2); }, () => { input.touchInteract = false; });

    // stop the browser's own gestures (scroll, zoom, long-press menus) while playing
    for (const ev of ['touchmove', 'gesturestart']) document.addEventListener(ev, (e) => { if (root.classList.contains('show')) e.preventDefault(); }, { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.getElementById('skip').addEventListener('pointerdown', (e) => { e.preventDefault(); onSkip(); });
  }

  setAbsorb(v, label = 'ABSORB') { this.absorbBtn.classList.toggle('ready', !!v); if (this.absorbBtn.textContent !== label) this.absorbBtn.textContent = label; }

  // mode: 'play' (all controls), 'cine' (pause only, during the cinematic) or false
  // flags (opening only): which action buttons exist right now, so the screen never offers a control the player cannot use yet
  setVisible(mode, flags = null) {
    this.root.classList.toggle('show', !!mode);
    this.root.classList.toggle('cine', mode === 'cine');
    const f = flags || { fire: true, jump: true, dash: true };
    this.root.classList.toggle('no-fire', !f.fire); this.root.classList.toggle('no-jump', !f.jump); this.root.classList.toggle('no-dash', !f.dash);
  }
}

// Fullscreen + landscape where the browser allows it (Android Chrome yes; iOS Safari ignores both).
export function enterImmersive() {
  const el = document.documentElement;
  try { (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {}); } catch (e) { /* optional */ }
  try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch (e) { /* optional */ }
}
