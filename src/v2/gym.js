import * as THREE from 'three';
import { M, boxGeo, kitMaterial } from '../world/materials.js';
import { FaceGuard } from '../world/coplanar.js';
import { Shellback } from './shellback.js';
import { BARE, MUTATIONS, SLOTS, MAX_TIER, STACK_BONUS } from './mutations.js';

// THE EVOLUTION LAB. One room where everything about evolving can be tried and compared. No story, no chapter.
//   north wall      eight specimens, each lying ready to absorb; each comes back after you take it
//   east            machines standing inert, to measure what each mutation does to them and to see current jump between them
//   west            two ledges and a dash lane, to feel how each raised arm changes the way you move
//   south           three pads: wake a squad for a real fight, grow every limb to reach the eight-limb choice, or start again in a new body
const X0 = -15, X1 = 15, Z0 = 72, Z1 = 100, H = 5.5, CZ = 86;
const BOUNDS = { minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 };
const SPAWN = { x: 0, z: 92 };
const SPECIMENS = [{ who: 'shellback', x: -13, z: 76, label: 'SHELLBACK', sub: 'CHITIN HUSK' }, { who: 'bug', x: -9.3, z: 76, label: 'ROBOT BUG', sub: 'BLAST BLADDER' }, { who: 'trooper', x: -5.6, z: 76, label: 'TROOPER', sub: 'SHARD SIPHON' }, { who: 'scout', x: -1.9, z: 76, label: 'SCOUT', sub: 'TENDON HOOK' }, { who: 'heavy', x: 1.9, z: 76, label: 'HEAVY', sub: 'ARC NERVES' }, { who: 'drone', x: 5.6, z: 76, label: 'SENTRY', sub: 'RAIL SPIKE' }, { who: 'armored', x: 9.3, z: 76, label: 'ARMORED SENTRY', sub: 'SEEKER' }, { who: 'brute', x: 13, z: 76, label: 'BRUTE BUG', sub: 'SEISMIC FIST' }];
const DUMMIES = [{ v: 'trooper', x: 8.5, z: 83 }, { v: 'scout', x: 12.5, z: 86 }, { v: 'trooper', x: 8.5, z: 89 }, { v: 'heavy', x: 12.5, z: 92 }];
const PADS = [{ id: 'squad', x: -6, z: 97, label: 'WAKE A SQUAD', prompt: 'E  ·  WAKE A SQUAD' }, { id: 'fill', x: 0, z: 97, label: 'TRY THE 8-LIMB CHOICE', prompt: 'E  ·  FILL EMPTY LIMBS WITH STAND-INS' }, { id: 'reset', x: 6, z: 97, label: 'A NEW BODY', prompt: 'E  ·  A NEW BODY' }];
const jumpOf = (k) => { const v = 9.9 * k; return (v * v) / 54; };

function sign(text, sub, w = 3.2) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#0a0d0f'; x.fillRect(0, 0, 512, 128); x.fillStyle = '#d8d2c8'; x.font = '600 42px Arial'; x.textAlign = 'center'; x.fillText(text, 256, sub ? 58 : 78);
  if (sub) { x.fillStyle = '#c88f98'; x.font = '26px Arial'; x.fillText(sub, 256, 100); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: 0xffffff }); mat.userData.noSnap = true;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), mat);
}

export class Gym {
  constructor(game) { this.g = game; this.active = false; this.built = false; this.timers = []; this.squad = []; this.stats = {}; this.window = null; this.nearPad = null; }

  build() {
    if (this.built) return; this.built = true;
    const g = this.g, W = g.world, G = this.group = new THREE.Group(); g.scene.add(G);
    const dark = kitMaterial('PaintDark');
    const guard = new FaceGuard();
    const blk = (x0, x1, y0, y1, z0, z1, mat, solid = true, opt = {}) => { const [a0, a1, b0, b1, c0, c1] = guard.fit([x0, x1, y0, y1, z0, z1]), m = new THREE.Mesh(boxGeo(a1 - a0, b1 - b0, c1 - c0, 2, x0 * 3.1 + z0 * 1.7), mat); m.position.set((a0 + a1) / 2, (b0 + b1) / 2, (c0 + c1) / 2); G.add(m); if (solid) W.add(x0, y0, z0, x1, y1, z1, { tag: opt.tag || 'gym' }); return m; };
    blk(X0 - 0.5, X1 + 0.5, -0.2, 0, Z0 - 0.5, Z1 + 0.5, M.floor, false);
    blk(X0 - 0.5, X1 + 0.5, H, H + 0.4, Z0 - 0.5, Z1 + 0.5, M.wall);
    blk(X0 - 0.5, X1 + 0.5, 0, H, Z0 - 0.5, Z0, M.wall); blk(X0 - 0.5, X1 + 0.5, 0, H, Z1, Z1 + 0.5, M.wall);
    blk(X0 - 0.5, X0, 0, H, Z0, Z1, M.wall); blk(X1, X1 + 0.5, 0, H, Z0, Z1, M.wall);
    for (const x of [-9, 0, 9]) blk(x - 1.3, x + 1.3, H - 0.06, H, CZ - 7.5, CZ - 6.9, M.white, false);
    for (const x of [-9, 0, 9]) blk(x - 1.3, x + 1.3, H - 0.06, H, CZ + 6.9, CZ + 7.5, M.white, false);
    const light = (x, z, i) => { const l = new THREE.PointLight(0xc4d8ee, i, 30, 1.6); l.position.set(x, H - 0.6, z); G.add(l); };
    for (const x of [-9, 0, 9]) { light(x, CZ - 7.2, 125); light(x, CZ + 7.2, 125); }
    for (const z of [Z0 + 0.1, Z1 - 0.14]) for (const x of [-13, -9.3, -5.6, -1.9, 1.9, 5.6, 9.3, 13]) blk(x - 0.18, x + 0.18, 0, H, z - 0.03, z + 0.03, dark, false);
    // floor markings are lit paint, not lamps: the ceiling's white glow is for the ceiling
    const paint = new THREE.MeshStandardMaterial({ color: 0x1a2024, emissive: 0x8fb4c8, emissiveIntensity: 0.4, roughness: 0.8 }); paint.userData.noSnap = true;
    const mark = (x, z, s, mat) => blk(x - s, x + s, 0.002, 0.012, z - s, z + s, mat, false);
    // the ship's own features, so the lab is part of the same deck
    { const K = g.kit, put = (n, x, z, rot) => K.solid(G, W, n, x, z, rot);
      put('cryo_pod', 13.4, 95.2, -Math.PI / 2); put('cryo_pod', 13.4, 98.0, -Math.PI / 2);
      put('fuel_tank', -12.2, 98.3, 0); put('assembly_arm', 10.0, 97.0, Math.PI);
      put('pipe_bank', -9.2, Z1 - 0.32, Math.PI); put('pipe_bank', 9.2, Z1 - 0.32, Math.PI);
      for (const [x, z, r] of [[-7, 82, 0], [0, 88, Math.PI / 2], [7, 94, 0], [-4, 96, Math.PI / 2]]) K.place(G, 'cable_swag', { x, y: H - 0.02, z, rotY: r }); }
    // specimens
    for (const s of SPECIMENS) {
      mark(s.x, s.z, 1.7, dark); const t = sign(s.label, 'BECOMES ' + s.sub); t.position.set(s.x, 3.1, Z0 + 0.06); G.add(t);
    }
    // the inert machines
    { const t = sign('FIRING RANGE', 'THEY STAND THERE. THEY COME BACK.', 4); t.position.set(X1 - 0.06, 3.1, 87.5); t.rotation.y = -Math.PI / 2; G.add(t); }
    for (const d of DUMMIES) mark(d.x, d.z, 0.7, dark);
    // the movement course
    const LOW = 1.2, HIGH = 2.25;
    blk(-14.5, -11, 0, LOW, 79, 83, kitMaterial('PaintStructural')); blk(-14.5, -11, 0, HIGH, 84, 88, kitMaterial('PaintStructural'));
    { const a = sign('1.2 M', 'ANY BODY'); a.position.set(-10.97, 2.0, 81); a.rotation.y = Math.PI / 2; G.add(a); const b = sign('2.25 M', 'NOT WITH THE HUSK RAISED'); b.position.set(-10.97, 3.0, 86); b.rotation.y = Math.PI / 2; G.add(b); }
    // dash lane: floor stripes one metre apart
    for (let i = 0; i <= 8; i++) blk(-10 + i * 0, -7, 0.002, 0.012, 89 + i, 89 + i + 0.08, i % 4 ? dark : paint, false);
    { const c = sign('DASH LANE', 'A STRIPE EVERY METRE'); c.position.set(X0 + 0.06, 2.4, 93); c.rotation.y = Math.PI / 2; G.add(c); }
    // pads
    for (const p of PADS) { mark(p.x, p.z, 1.1, paint).scale.y = 0.4; const t = sign(p.label, ''); t.position.set(p.x, 2.6, Z1 - 0.06); t.rotation.y = Math.PI; G.add(t); }
    // something to take cover behind in a fight
    for (const [x, z] of [[-6.5, 85], [-3.2, 80], [4.2, 80.5], [5.6, 90]]) { blk(x - 0.6, x + 0.6, 0, 3.2, z - 0.6, z + 0.6, kitMaterial('PaintStructural')); blk(x - 0.64, x + 0.64, 0, 0.3, z - 0.64, z + 0.64, dark, false); }
    g.kit.solid(G, W, 'crate_A', -3, 84, 0, 0, 'gym'); g.kit.solid(G, W, 'crate_B', 3.4, 86, 0, 0, 'gym'); g.kit.solid(G, W, 'barrier_22', 0, 81, 0, 0, 'gym');
    this.buildHud();
  }

  buildHud() {
    const el = this.el = document.createElement('div'); el.id = 'v2-gym'; el.className = 'hidden';
    el.innerHTML = '<h4>EVOLUTION LAB</h4><table><thead><tr><th></th><th>STAGE</th><th>ABSORBED</th><th>SPEED</th><th>JUMP</th><th>HIT TAKEN</th><th>BEST DPS</th></tr></thead><tbody></tbody></table><div class="card"></div><div class="keys">Q HOLD: WHEEL &nbsp;·&nbsp; 1-8: RAISE A LIMB &nbsp;·&nbsp; RIGHT CLICK: ABSORB &nbsp;·&nbsp; HOLD V: SEE YOURSELF</div>';
    document.body.appendChild(el); this.body = el.querySelector('tbody'); this.card = el.querySelector('.card');
    const st = document.createElement('style');
    st.textContent = '#v2-gym{position:fixed;left:24px;top:64px;z-index:5;width:430px;pointer-events:none;color:#d8d2c8;background:rgba(8,10,12,.42);border:1px solid rgba(214,208,200,.14);padding:10px 12px;font-size:10px;letter-spacing:.06em;line-height:1.4;text-shadow:0 1px 3px #000}#v2-gym.hidden{display:none}#v2-gym h4{margin:0 0 6px;font-size:11px;letter-spacing:.24em;font-weight:600;color:#e0a0a8}#v2-gym table{width:100%;border-collapse:collapse}#v2-gym th{font-weight:400;font-size:8.5px;letter-spacing:.08em;color:#a8a29a;text-align:right;padding:0 0 3px 6px}#v2-gym td{text-align:right;padding:2px 0 2px 6px}#v2-gym td:first-child{text-align:left;padding-left:0;white-space:nowrap}#v2-gym tr.up td{color:#fff;font-weight:600}#v2-gym tr.none td{opacity:.42}#v2-gym .card{margin-top:7px;border-top:1px solid rgba(214,208,200,.14);padding-top:6px}#v2-gym .card b{letter-spacing:.14em;font-weight:600}#v2-gym .card em{display:block;font-style:normal;margin-top:2px}#v2-gym .card em.p{color:#b6c8a8}#v2-gym .card em.m{color:#d4a0a0}#v2-gym .keys{margin-top:7px;font-size:8.5px;color:#a8a29a}body.v2-inspect #v2-gym{opacity:.25}';
    document.head.appendChild(st);
  }

  // Into the room. keep: coming back from a death keeps what you had, because this is a place for trying things.
  enter(keep) {
    const g = this.g, p = g.player;
    g.audio.init(); g.ui.hideMenus();
    g.opening.active = false; g.state = 'playing'; g.cinePose = null; g.paused = false;
    document.body.classList.remove('intro');
    g.clearCritters(); g.newRun(); g.resetEncounter(); g.clearEnemies(); g.absorber.reset();
    for (const b of g.barrels) b.dispose(); g.barrels = [];
    this.build(); this.group.visible = true; this.active = true;
    g.lightList = null; g.lightT = 0; g.level.emergencyOn = false;
    g.arena = BOUNDS; g.nav = g.makeNav(BOUNDS); g.waypoints = g.buildWaypoints(BOUNDS);
    if (!keep) { g.evolution.resetRun(); this.stats = {}; }
    p.maxHealth = 100; p.reset(SPAWN.x, SPAWN.z, 0); p.pitch = -0.08; p.health = 100; g.evolution.energy = 100;
    this.timers.length = 0; this.squad = []; this.specimens = {}; this.dummies = [];
    for (const s of SPECIMENS) this.spawnSpecimen(s);
    for (const d of DUMMIES) this.spawnDummy(d);
    this.el.classList.remove('hidden');
    g.ui.showHud(true); g.ui.setObjective(''); g.ui.setGoal(''); g.ui.fade(0); g.ui.setHealth(p.health, p.maxHealth);
    g.lockRetries = 0; g.input.lock();
  }

  leave() {
    if (!this.built) return; this.active = false; this.group.visible = false; this.el.classList.add('hidden');
    if (this.g.storyAct === 'lab') this.g.storyAct = null;
  }

  spawnSpecimen(s) {
    const g = this.g;
    if (s.who === 'shellback') { const c = new Shellback(g, s.x, s.z); c.home = [s.x, s.z]; g.critters.push(c); this.specimens[s.who] = c; return; }
    const KIND = { drone: ['drone', 'std'], armored: ['drone', 'armored'], brute: ['bug', 'brute'], bug: ['bug', 'std'] }[s.who] || ['android', s.who];
    const e = g.makeEnemy({ type: KIND[0], variant: KIND[1], x: s.x, z: s.z }); e.noReboot = true; e.yaw = e.group.rotation.y = Math.PI; g.enemies.push(e); e.activate(); e.takeDamage(e.hp * 0.85, null); this.specimens[s.who] = e;
  }
  spawnDummy(d) { const g = this.g, e = g.makeEnemy({ type: 'android', variant: d.v, x: d.x, z: d.z }); e.warning = true; e.yaw = e.group.rotation.y = -Math.PI / 2; e.inert = true; g.enemies.push(e); this.dummies.push({ d, e }); }

  onHit(id, dmg) {
    if (!this.active) return;
    const t = this.g.time;
    if (!this.window || this.window.id !== id || t - this.window.last > 2.2) this.window = { id, t0: t, last: t, sum: 0 };
    const w = this.window; w.sum += dmg; w.last = t;
    const dur = Math.max(0.8, t - w.t0);
    if (t - w.t0 >= 0.8) { const dps = w.sum / dur; const s = this.stats[id] || (this.stats[id] = { dps: 0 }); s.dps = Math.max(s.dps, dps); }
    this.dirty = true;
  }

  // The test room can show the eight-limb choice before there are nine real mutations: stand-ins hold the empty limbs, and do nothing.
  fill() {
    const E = this.g.evolution;
    while (E.equipped.length < SLOTS) { const k = E.equipped.length + 1; E.equipped.push({ m: { id: 'standin' + k, name: 'STAND-IN ' + k, kind: 'test', sources: [], nodes: [], infect: 0, note: '', role: 'FOR TESTING', plus: 'HOLDS THIS LIMB', minus: 'DOES NOTHING', style: BARE.style, attack: BARE.attack, mods: () => ({}), move: () => ({}), hud: '#55504c', limbK: 0, massK: 0 }, tier: 1, n: 1, grow: 1 }); }
    E.recompute(); E.wheel.render(); E.applyLook(false);
    E.toast('EIGHT LIMBS', 'NO LIMB LEFT', 'Now absorb something you do not carry. You will be asked.', 3);
    this.g.audio.play('gel', { vol: 0.6 });
  }

  wake() {
    if (this.squad.some((e) => e.alive)) { this.g.evolution.toast('', 'THEY ARE ALREADY AWAKE', '', 1.2); return; }
    const g = this.g;
    this.squad = [['trooper', -5, 78], ['trooper', 5, 78], ['scout', 0, 74.5], ['heavy', 1, 80]].map(([v, x, z]) => { const e = g.makeEnemy({ type: 'android', variant: v, x, z }); e.warn(); g.enemies.push(e); return e; });
    this.timers.push({ t: 0.8, fn: () => { for (const e of this.squad) if (e.alive) e.activate(); } });
    g.audio.play('bootup', { vol: 0.8 }); g.evolution.toast('LIVE FIRE', 'A SQUAD', 'Nothing here is holding back. Dying only brings you back to the room.', 2);
  }

  update(dt) {
    if (!this.active) return;
    const g = this.g, P = g.player, E = g.evolution, input = g.input;
    for (let i = this.timers.length - 1; i >= 0; i--) { const q = this.timers[i]; q.t -= dt; if (q.t <= 0) { this.timers.splice(i, 1); q.fn(); } }
    // specimens and range targets come back
    for (const s of SPECIMENS) { const e = this.specimens[s.who]; if (e && !e.alive) { this.specimens[s.who] = null; this.timers.push({ t: 2.2, fn: () => { if (this.active) this.spawnSpecimen(s); } }); } }
    for (const D of this.dummies) if (!D.e.alive && !D.wait) { D.wait = true; this.timers.push({ t: 1.6, fn: () => { if (!this.active) return; const i = this.dummies.indexOf(D); this.dummies.splice(i, 1); this.spawnDummy(D.d); } }); }
    // out of a fight the room looks after you
    if (!this.squad.some((e) => e.alive) && P.health < P.maxHealth && !P.dead) { P.health = Math.min(P.maxHealth, P.health + 30 * dt); g.ui.setHealth(P.health, P.maxHealth); }
    // pads
    let near = null; for (const p of PADS) if (Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < 1.6) near = p;
    if (near !== this.nearPad) { this.nearPad = near; if (near) { g.storyAct = 'lab'; g.ui.setPrompt(near.prompt); } else { if (g.storyAct === 'lab') g.storyAct = null; g.ui.setPrompt(''); } }
    if (near && input.was('KeyE') && !E.wheel.open) {
      if (near.id === 'squad') this.wake(); else if (near.id === 'fill') this.fill();
      else { for (const q of this.squad) if (q.alive) q.die(true); this.squad = []; this.stats = {}; E.resetRun(); P.health = P.maxHealth; g.ui.setHealth(P.health, P.maxHealth); g.absorber.reset(); E.toast('A NEW BODY', 'NOTHING GROWN', '', 1.6); g.audio.play('gel', { vol: 0.5 }); }
    }
    this.hudT = (this.hudT || 0) - dt; if (this.hudT <= 0) { this.hudT = 0.2; this.renderHud(); }
  }

  renderHud() {
    const E = this.g.evolution, rows = [];
    for (const m of Object.values(MUTATIONS)) {
      const q = E.equipped.find((x) => x.m.id === m.id), t = q ? q.tier : 0, T = t || 1, mv = m.move(T), mo = m.mods(T), raised = E.active.id === m.id;
      rows.push(`<tr class="${raised ? 'up' : ''}${t ? '' : ' none'}"><td>${m.name}</td><td>${t || '-'}</td><td>${q ? q.n : '-'}</td><td>${(7.2 * (mv.speed ?? 1)).toFixed(1)}</td><td>${jumpOf(mv.jump ?? 1).toFixed(2)}</td><td>${Math.round((mo.dmgTaken ?? 1) * 100)}%</td><td>${this.stats[m.id] ? Math.round(this.stats[m.id].dps) : '-'}</td></tr>`);
    }
    this.body.innerHTML = rows.join('');
    const a = E.active; const dash = a.move ? (a.move(E.current?.tier || 1).dash ?? 1) * 18 : 18, extra = E.current && E.current.n > MAX_TIER ? `  ·  ×${E.current.n}: +${Math.round((E.powerK(E.current) - 1) * 100)}%` : '';
    this.card.innerHTML = `<b>${a.name}</b>  ·  ${a.role}${extra}<em class="p">+ ${a.plus}</em><em class="m">− ${a.minus}</em><em>DASH ${dash.toFixed(0)} M/S</em>`;
  }
}
