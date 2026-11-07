// PS4 (DualShock 4) and any other standard gamepad. It feeds the same Input the keyboard, mouse and touch controls feed, so gameplay code does not know the difference.
//
//   LEFT STICK    move                       R2   fire                    CROSS (X)     jump
//   RIGHT STICK   look                       L2   absorb / interact       CIRCLE        dash
//   L1            next arm; hold for the     R1   previous arm            SQUARE        interact
//                 arm wheel (right stick                                  TRIANGLE      hold: see yourself
//                 to choose, R2 to confirm)  D-PAD UP   bare arms         OPTIONS       pause
//   In menus      D-PAD or LEFT STICK move, CROSS selects, CIRCLE goes back, left and right change a slider
//
// Chrome and Edge report a DualShock 4 in the standard layout. Some browsers report its raw layout (square first, D-pad as one axis); that is converted here.
const DEAD = 0.16;
const LOOK_SPEED = 1100;                      // pixels per second at full deflection, before the sensitivity setting
const RAW_TO_STD = [2, 0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17];   // raw DualShock 4 button index -> standard index

const shape = (v) => { const a = Math.abs(v); if (a < DEAD) return 0; const t = (a - DEAD) / (1 - DEAD); return Math.sign(v) * Math.pow(t, 1.6); };

// button -> what it stands for
const KEYS = { 0: 'Space', 1: 'ShiftLeft', 2: 'KeyE', 3: 'KeyV', 4: 'KeyQ', 5: 'PadPrev', 12: 'Digit0' };

export class PadInput {
  constructor(input) {
    this.input = input; this.prev = new Array(18).fill(false); this.held = new Set(); this.rep = { u: 0, d: 0, l: 0, r: 0 }; this.gp = null;
    window.addEventListener('gamepaddisconnected', () => { if (input.padActive && input.locked) input.unlock(); this.release(); });
  }

  // the first connected pad, as { b: pressed[18], v: value[18], lx, ly, rx, ry }
  read() {
    const list = (navigator.getGamepads && navigator.getGamepads()) || []; let gp = null;
    for (const g of list) if (g && g.connected) { gp = g; break; }
    this.gp = gp; if (!gp) return null;
    const standard = gp.mapping === 'standard', b = new Array(18).fill(false), v = new Array(18).fill(0);
    const set = (i, down, val) => { b[i] = b[i] || down; v[i] = Math.max(v[i], val); };
    gp.buttons.forEach((btn, i) => { const k = standard ? i : (RAW_TO_STD[i] ?? -1); if (k >= 0) set(k, btn.pressed || btn.value > 0.5, btn.value); });
    let lx = gp.axes[0] || 0, ly = gp.axes[1] || 0, rx = gp.axes[standard ? 2 : 2] || 0, ry = gp.axes[standard ? 3 : 5] || 0;
    if (!standard) {
      // the raw layout carries the triggers as axes too, and the D-pad as one hat axis: -1 up, then clockwise in steps of 2/7, a value past 1.2 for neutral
      const hat = gp.axes[9]; if (hat !== undefined && hat < 1.2) {
        const dirs = [[12], [12, 15], [15], [13, 15], [13], [13, 14], [14], [12, 14]], i = Math.round((hat + 1) * 3.5); for (const k of dirs[Math.max(0, Math.min(7, i))]) set(k, true, 1);
      }
    }
    return { b, v, lx, ly, rx, ry };
  }

  release() { for (const c of this.held) this.input.keys.delete(c); this.held.clear(); this.input.buttons.delete(0); this.input.buttons.delete(2); }

  poll(dt) {
    const input = this.input, s = this.read();
    if (!s) return;
    const any = s.b.some(Boolean) || Math.hypot(s.lx, s.ly) > 0.4 || Math.hypot(s.rx, s.ry) > 0.4;
    if (any && !input.padActive) { input.padActive = true; document.body.classList.add('pad'); }
    if (!input.padActive) { this.prev = s.b.slice(); return; }
    const edge = (i) => s.b[i] && !this.prev[i];
    const lx = shape(s.lx), ly = shape(s.ly), rx = shape(s.rx), ry = shape(s.ry);

    if (!input.locked) { this.menu(s, lx, ly, dt, edge); this.prev = s.b.slice(); input.axisX = input.axisY = 0; this.release(); return; }

    // ---- in play: sticks
    input.axisX = lx; input.axisY = -ly;
    input.dx += rx * LOOK_SPEED * dt; input.dy += ry * LOOK_SPEED * dt;
    // ---- buttons held as keys; a fresh press also counts as a press this frame
    for (const [i, code] of Object.entries(KEYS)) {
      const idx = +i;
      if (s.b[idx]) { input.keys.add(code); this.held.add(code); if (edge(idx)) { input.pressed.add(code); if (idx === 0) input.onKeyDown('Enter'); } }
      else if (this.held.has(code)) { input.keys.delete(code); this.held.delete(code); }
    }
    // ---- triggers are the mouse buttons: R2 fires, L2 absorbs
    for (const [i, btn] of [[7, 0], [6, 2]]) {
      const down = s.v[i] > 0.35, was = input.buttons.has(btn);
      if (down && !was && performance.now() >= input.fireGuardUntil) { input.buttons.add(btn); input.clicks.add(btn); input.onMouseDown(btn); }
      else if (!down && was) input.buttons.delete(btn);
    }
    if (edge(9)) input.unlock();             // OPTIONS pauses
    this.prev = s.b.slice();
  }

  // ---------------------------------------------------------------- menus: the D-pad or left stick walk the buttons, and the sliders
  menu(s, lx, ly, dt, edge) {
    const dir = (key, down, first = 0.3, again = 0.11) => { if (!down) { this.rep[key] = 0; return false; } if (this.rep[key] === 0) { this.rep[key] = first; return true; } this.rep[key] -= dt; if (this.rep[key] <= 0) { this.rep[key] = again; return true; } return false; };
    const up = dir('u', s.b[12] || ly < -0.5), down = dir('d', s.b[13] || ly > 0.5), left = dir('l', s.b[14] || lx < -0.5), right = dir('r', s.b[15] || lx > 0.5);
    const vis = (el) => el.getClientRects().length > 0 && !el.closest('.hidden');      // not offsetParent: it is null for every fixed-position menu
    const panel = [...document.querySelectorAll('.panel')].find(vis), menu = [...document.querySelectorAll('.menu')].find(vis);
    const root = panel || menu; if (!root) return;
    const items = [...root.querySelectorAll('button, input[type=range]')].filter((el) => vis(el) && !el.disabled);
    if (!items.length) return;
    let i = items.indexOf(document.activeElement);
    if (i < 0) { if (up || down || left || right || edge(0)) items[0].focus(); return; }      // the first touch only shows where you are
    const cur = items[i];
    if (up) items[(i + items.length - 1) % items.length].focus();
    else if (down) items[(i + 1) % items.length].focus();
    else if ((left || right) && cur.type === 'range') {
      const step = (+cur.step || 1) * 4 * (right ? 1 : -1); cur.value = Math.max(+cur.min, Math.min(+cur.max, +cur.value + step)); cur.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (edge(0) && cur.tagName === 'BUTTON') cur.click();
    if (edge(1)) { const back = root.querySelector('.close'); if (back && vis(back)) back.click(); }
    if (edge(9)) { const go = document.getElementById('btn-resume'); if (go && vis(go)) go.click(); }      // OPTIONS again resumes
  }

  rumble(strong, weak, ms) {
    const gp = this.gp; if (!gp || !this.input.padActive) return;
    const a = gp.vibrationActuator; if (!a || !a.playEffect) return;
    try { a.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: strong }); } catch (e) { /* not supported */ }
  }
}
