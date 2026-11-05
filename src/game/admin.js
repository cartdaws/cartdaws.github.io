const CODE = '4310';
const KEY = 'intruder-admin';

const CSS = `
#admin { position: fixed; right: 14px; top: 14px; bottom: 14px; width: 270px; z-index: 30; overflow-y: auto; padding: 14px 16px 18px;
  background: rgba(4, 10, 12, 0.88); border: 1px solid rgba(120, 240, 255, 0.35); color: #cfeef0; font: 12px/1.35 'Segoe UI', system-ui, sans-serif;
  letter-spacing: 0.08em; backdrop-filter: blur(3px); }
#admin.hidden { display: none; }
#admin h3 { margin: 0 0 10px; font-size: 13px; letter-spacing: 0.34em; color: #8ff5e6; font-weight: 600; }
#admin h4 { margin: 14px 0 6px; font-size: 10px; letter-spacing: 0.3em; color: #6fa9b0; font-weight: 600; border-top: 1px solid rgba(120,240,255,0.15); padding-top: 8px; }
#admin label { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 5px 0; cursor: pointer; }
#admin label i { opacity: 0.5; font-style: normal; font-size: 10px; }
#admin .sl { display: block; margin: 7px 0; }
#admin .sl span { display: flex; justify-content: space-between; }
#admin .sl input { width: 100%; margin-top: 3px; }
#admin button, #admin select { width: 100%; margin: 3px 0; padding: 7px 8px; font: inherit; letter-spacing: 0.14em; color: #bffcff; background: rgba(20, 80, 92, 0.3); border: 1px solid rgba(120, 240, 255, 0.4); cursor: pointer; }
#admin button:hover { background: rgba(40, 160, 180, 0.4); }
#admin .row { display: flex; gap: 6px; } #admin .row > * { flex: 1; }
#admin .msg { min-height: 14px; margin-top: 8px; color: #ffd27a; font-size: 11px; }
.code-in { position: absolute; left: 18px; bottom: 16px; width: 74px; padding: 4px 6px; font: 11px 'Segoe UI', system-ui, sans-serif; letter-spacing: 0.3em; color: #8fc4d0;
  background: rgba(10, 30, 36, 0.5); border: 1px solid rgba(143, 196, 208, 0.45); opacity: 0.75; text-align: center; outline: none; }
body.touch .code-in { width: 96px; padding: 8px 6px; font-size: 13px; }
.build-tag { position: absolute; right: 18px; top: 12px; font: 10px 'Segoe UI', system-ui, sans-serif; letter-spacing: 0.2em; color: #8fc4d0; opacity: 0.7; }
.code-in:focus { opacity: 0.9; }
`;

// Developer / cheat options, unlocked by typing the code in any menu. Open the pause menu (Esc or `) to change settings while playing;
// the hotkeys work in-game. Everything is applied live and never saved with the game state (only the unlock is remembered).
export class Admin {
  constructor(game) {
    this.game = game;
    this.unlocked = false;
    try { this.unlocked = localStorage.getItem(KEY) === '1'; } catch (e) { /* optional */ }
    // live settings read by the rest of the game
    this.god = false; this.noclip = false; this.infDash = false; this.rapid = false; this.oneHit = false;
    this.speed = 1; this.jump = 1; this.grav = 1; this.timeScale = 1; this.fov = 0; // fov 0 = default
    this.spawnType = 'android:trooper';
    this.msgT = 0;
    this.build();
    this.bindKeys();
  }

  build() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    // code entry: a faint field in the corner of the start and pause menus
    for (const id of ['menu-start', 'menu-pause']) {
      const host = document.getElementById(id);
      if (!host) continue;
      const inp = document.createElement('input');
      inp.className = 'code-in'; inp.type = 'password'; inp.inputMode = 'numeric'; inp.placeholder = 'CODE'; inp.maxLength = 8; inp.autocomplete = 'off';
      inp.addEventListener('input', () => { if (inp.value === CODE) { inp.value = ''; this.setUnlocked(true); } });
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      host.appendChild(inp);
    }
    const el = this.el = document.createElement('aside');
    el.id = 'admin';
    el.className = 'hidden';
    el.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.appendChild(el);
    const add = (html) => { const d = document.createElement('div'); d.innerHTML = html; el.appendChild(d); return d; };
    add('<h3>ADMIN</h3>');
    this.checks = {};
    const toggle = (label, key, hot) => {
      const l = document.createElement('label');
      l.innerHTML = `<span>${label}</span><span><i>${hot || ''}</i> <input type="checkbox"></span>`;
      const cb = l.querySelector('input');
      cb.addEventListener('change', () => { this[key] = cb.checked; if (key === 'timeScale') this.timeScale = cb.checked ? 0.3 : 1; });
      el.appendChild(l);
      this.checks[key] = cb;
    };
    const slider = (label, key, min, max, step, fmt = (v) => v.toFixed(2)) => {
      const l = document.createElement('label');
      l.className = 'sl';
      l.innerHTML = `<span>${label}<b></b></span><input type="range" min="${min}" max="${max}" step="${step}">`;
      const r = l.querySelector('input'), b = l.querySelector('b');
      const set = () => { b.textContent = ' ' + fmt(this[key] || (key === 'fov' ? 0 : 1)); };
      r.value = this[key] || (key === 'fov' ? 78 : 1);
      r.addEventListener('input', () => { this[key] = +r.value; set(); });
      set();
      el.appendChild(l);
      this.sliders = this.sliders || {};
      this.sliders[key] = { r, set };
    };
    const button = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => { fn(); }); el.appendChild(b); return b; };
    const head = (t) => add(`<h4>${t}</h4>`);

    head('PLAYER');
    toggle('GOD MODE', 'god', 'G');
    toggle('NOCLIP / FLY (SPACE UP, C DOWN)', 'noclip', 'N');
    toggle('UNLIMITED DASH', 'infDash');
    toggle('RAPID FIRE', 'rapid');
    toggle('ONE-HIT KILL', 'oneHit');
    toggle('SLOW MOTION', 'timeScale', 'T');
    slider('MOVE SPEED', 'speed', 0.3, 4, 0.05, (v) => '×' + v.toFixed(2));
    slider('JUMP', 'jump', 0.4, 3, 0.05, (v) => '×' + v.toFixed(2));
    slider('GRAVITY', 'grav', 0.1, 2.5, 0.05, (v) => '×' + v.toFixed(2));
    slider('FOV', 'fov', 55, 120, 1, (v) => (v ? Math.round(v) + '°' : 'DEFAULT'));
    button('HEAL FULL  (H)', () => this.heal());
    button('+10 MAX HP', () => { const p = this.game.player; p.maxHealth += 10; p.health = p.maxHealth; this.game.ui.setHealth(p.health, p.maxHealth); this.say('MAX HP ' + p.maxHealth); });

    head('ENEMIES');
    const sel = document.createElement('select');
    for (const [v, n] of [['android:trooper', 'ANDROID TROOPER'], ['android:scout', 'ANDROID SCOUT'], ['android:heavy', 'ANDROID HEAVY'], ['drone:std', 'SENTRY DRONE'], ['drone:armored', 'ARMORED DRONE'], ['bug:std', 'OLD BUG']]) sel.add(new Option(n, v));
    sel.addEventListener('change', () => { this.spawnType = sel.value; });
    el.appendChild(sel);
    button('SPAWN IN FRONT', () => this.spawn());
    const row = document.createElement('div'); row.className = 'row'; el.appendChild(row);
    const b1 = document.createElement('button'); b1.textContent = 'SHUT DOWN (K)'; b1.onclick = () => this.shutDownAll();
    const b2 = document.createElement('button'); b2.textContent = 'KILL (L)'; b2.onclick = () => this.killAll();
    row.append(b1, b2);

    head('WORLD');
    button('NEXT ROOM  (J)', () => this.nextRoom());
    button('GIVE KEYCARD + OPEN LOCKS', () => this.giveKey());
    button('NEW RUN (NEW LAYOUT)', () => { this.game.restart(true); this.say('NEW RUN'); });
    button('LOCK ADMIN', () => this.setUnlocked(false));
    this.msg = add('<div class="msg"></div>').firstChild;
    add('<div style="opacity:.45;margin-top:10px;font-size:10px">HOTKEYS IN GAME: G god · N noclip · H heal · K shut down · L kill · J next room · T slow-mo · ` open this panel</div>');
  }

  say(t) { this.msg.textContent = t; clearTimeout(this._mt); this._mt = setTimeout(() => { this.msg.textContent = ''; }, 2500); }

  setUnlocked(v) {
    this.unlocked = v;
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* optional */ }
    if (!v) { this.god = this.noclip = this.infDash = this.rapid = this.oneHit = false; this.speed = this.jump = this.grav = this.timeScale = 1; this.fov = 0; for (const c of Object.values(this.checks)) c.checked = false; for (const s of Object.values(this.sliders || {})) { s.r.value = s.r.min <= 1 && 1 <= s.r.max ? 1 : 78; s.set(); } }
    this.sync();
    if (v) this.say('ADMIN UNLOCKED');
  }

  // shown whenever a menu is up (pause, start, dead...) and the code has been entered
  sync() {
    const menuUp = [...document.querySelectorAll('.menu')].some((m) => !m.classList.contains('hidden'));
    this.el.classList.toggle('hidden', !(this.unlocked && menuUp));
  }

  bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (!this.unlocked || e.repeat) return;
      const g = this.game;
      if (e.code === 'Backquote') { if (g.input.locked) g.input.unlock(); e.preventDefault(); return; }
      if (g.state !== 'playing' || g.paused) return;
      const flip = (key) => { this[key] = !this[key]; if (this.checks[key]) this.checks[key].checked = this[key]; this.say(`${key.toUpperCase()} ${this[key] ? 'ON' : 'OFF'}`); };
      switch (e.code) {
        case 'KeyG': flip('god'); break;
        case 'KeyN': flip('noclip'); break;
        case 'KeyH': this.heal(); break;
        case 'KeyK': this.shutDownAll(); break;
        case 'KeyL': this.killAll(); break;
        case 'KeyJ': this.nextRoom(); break;
        case 'KeyT': { this.timeScale = this.timeScale === 1 ? 0.3 : 1; if (this.checks.timeScale) this.checks.timeScale.checked = this.timeScale !== 1; break; }
        default:
      }
    });
  }

  heal() { const p = this.game.player; p.health = p.maxHealth; this.game.ui.setHealth(p.health, p.maxHealth); this.say('HEALED'); }

  // a clear spot a few metres in front of the player, inside whatever room they are in
  roomAtPlayer() {
    const g = this.game, p = g.player.pos;
    return (g.run?.all || []).find((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1) || null;
  }

  spawn() {
    const g = this.game, pl = g.player;
    const room = this.roomAtPlayer();
    if (!room) { this.say('ENTER A ROOM FIRST'); return; }
    const [type, variant] = this.spawnType.split(':');
    const dx = -Math.sin(pl.yaw), dz = -Math.cos(pl.yaw);
    const hit = g.world.raycast(pl.pos.x, 0.9, pl.pos.z, dx, 0, dz, 7, (b) => b.tag !== 'door' || b.enabled);
    const d = Math.max(1.5, Math.min(6, hit ? hit.t - 1 : 6));
    const e = g.makeEnemy({ type, variant, x: pl.pos.x + dx * d, z: pl.pos.z + dz * d });
    g.arena = room.bounds;
    g.nav = room.nav || (room.nav = g.makeNav(room.bounds));
    g.waypoints = room.waypoints || (room.waypoints = g.buildWaypoints(room.bounds));
    g.enemies.push(e);
    e.activate();
    this.say(`SPAWNED ${this.spawnType.toUpperCase()}`);
  }

  shutDownAll() {
    const g = this.game;
    let n = 0;
    for (const e of g.enemies) {
      if (!e.alive || e.disabled || e.absorbing) continue;
      if (!e.active) e.activate();
      g.damageEnemy(e, e.hp - e.maxHp * 0.15, e.hitSpheres[0].c);
      n++;
    }
    this.say(`${n} SHUT DOWN`);
  }

  killAll() {
    let n = 0;
    for (const e of this.game.enemies) if (e.alive && !e.absorbing) { e.die(false); n++; }
    this.say(`${n} DESTROYED`);
  }

  // jump the player to just inside the next room so the normal encounter flow takes over
  nextRoom() {
    const g = this.game, enc = g.encounter, r = enc.room;
    if (!r || enc.won) return;
    const ip = r.inPoint;
    const cx = r.cx - ip.x, cz = r.cz - ip.z, l = Math.hypot(cx, cz) || 1;
    r.doors.in.open(true);
    g.player.pos.set(ip.x + (cx / l) * 3.2, 0, ip.z + (cz / l) * 3.2);
    g.player.vx = g.player.vz = 0;
    g.player.yaw = Math.atan2(-cx, -cz);
    this.say('NEXT ROOM');
  }

  giveKey() {
    const g = this.game;
    g.encounter.gotKey();
    const lr = g.run && g.run.lockRoom;
    if (lr) { lr.doors.out.unlock(); if (lr.kind === 'quiet' || lr.cleared) lr.doors.out.open(); }
  }
}
