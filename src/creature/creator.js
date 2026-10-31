import * as THREE from 'three';
import { PRESETS, defaults, sanitize, randomCreature, applyStyle, validateImport, exportText, CONTROLS } from './definition.js';
import { save } from '../core/save.js';
import { RobotBug } from '../game/enemies/robotBug.js';
import { clamp, damp } from '../core/util.js';

const STAGE = new THREE.Vector3(0, 0, 900);                 // beyond the camera's far plane from the level (and the home), so none of it is ever in the preview
const clone = (o) => JSON.parse(JSON.stringify(o));
const UNDO_MAX = 60;
const mixHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

const BLURB = { Warden: 'Balanced and steady', Wraith: 'Tall, ghostly, long reach', Brute: 'Broad and heavy', Mantis: 'Lean hunter, pincers', Siren: 'Glowing, finned', Ember: 'Warm and bold' };
const HANDS = [['claw', 'Claws'], ['tri', 'Three-finger'], ['pincer', 'Pincers'], ['paw', 'Broad paws']];
const EXTRAS = [['none', 'None'], ['feelers', 'Feelers'], ['fins', 'Fins'], ['both', 'Both']];
const opt = (id) => CONTROLS.head.concat(CONTROLS.skin).find((c) => c.path === id).options;

// The few controls a player actually needs. Each reads from and writes to the full definition (hidden values keep their defaults).
const SIMPLE = [
  { h: 'Body' },
  { kind: 'num', label: 'Height', min: 0.75, max: 1.0, step: 0.01, get: (d) => d.body.height, set: (d, v) => { d.body.height = v; } },
  { kind: 'num', label: 'Bulk', min: 0.85, max: 1.3, step: 0.01, get: (d) => d.body.width, set: (d, v) => { d.body.width = v; d.body.depth = v; } },
  { kind: 'num', label: 'Shoulders', min: -0.4, max: 0.8, step: 0.01, get: (d) => d.body.shoulderWidth, set: (d, v) => { d.body.shoulderWidth = v; } },
  { h: 'Parts' },
  { kind: 'opt', label: 'Hands', options: HANDS,
    get: (d) => (d.arms.hand === 'broad' ? 'paw' : d.arms.digits === 2 ? 'pincer' : d.arms.digits === 3 ? 'tri' : 'claw'),
    set: (d, v) => { Object.assign(d.arms, { claw: { hand: 'slender', digits: 4 }, tri: { hand: 'slender', digits: 3 }, pincer: { hand: 'slender', digits: 2 }, paw: { hand: 'broad', digits: 3 } }[v]); } },
  { kind: 'num', label: 'Tentacles', min: 3, max: 6, step: 1, get: (d) => d.tentacles.count, set: (d, v) => { d.tentacles.count = v; } },
  { kind: 'opt', label: 'Eyes', options: opt('head.eyes'), get: (d) => d.head.eyes, set: (d, v) => { d.head.eyes = v; } },
  { kind: 'opt', label: 'Crest', options: opt('head.crest'), get: (d) => d.head.crest, set: (d, v) => { d.head.crest = v; } },
  { kind: 'opt', label: 'Extras', options: EXTRAS, get: (d) => (d.head.feelers && d.head.fins ? 'both' : d.head.feelers ? 'feelers' : d.head.fins ? 'fins' : 'none'),
    set: (d, v) => { d.head.feelers = v === 'feelers' || v === 'both' ? 2 : 0; d.head.fins = v === 'fins' || v === 'both' ? 1 : 0; } },
  { h: 'Look' },
  { kind: 'opt', label: 'Style', options: opt('skin.style'), get: (d) => d.skin.style, set: (d, v) => { Object.assign(d, applyStyle(d, v)); } },
  { kind: 'col', label: 'Skin colour', get: (d) => d.skin.primary, set: (d, v) => { d.skin.primary = v; d.tentacles.color = mixHex(v, '#2fb89a', 0.35); } },
  { kind: 'col', label: 'Accent colour', get: (d) => d.skin.secondary, set: (d, v) => { d.skin.secondary = v; d.skin.marking = mixHex(v, '#ffffff', 0.55); } },
  { kind: 'col', label: 'Glow colour', get: (d) => d.skin.glow, set: (d, v) => { d.skin.glow = v; d.tentacles.glow = mixHex(v, '#ffffff', 0.6); } },
  { kind: 'opt', label: 'Pattern', options: opt('skin.pattern'), get: (d) => d.skin.pattern, set: (d, v) => { d.skin.pattern = v; } },
  { kind: 'num', label: 'Glow', min: 0, max: 1, step: 0.01, get: (d) => d.skin.glowIntensity, set: (d, v) => { d.skin.glowIntensity = v; } },
];

// The creature creator. It does not own a separate demo: the preview IS the game's own AlienBody, ViewModel (arms, hands, Shardcaster, tentacles),
// Absorber and a real disabled robot, placed on a stage far from the level. Nothing here changes movement, collision, health or rewards.
export class Creator {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.cur = clone(save.creature);
    this.saved = clone(save.creature);
    this.undo = []; this.redo = [];
    this.view = 'body';                  // body | fp
    this.light = 'neutral';              // neutral | ship
    this.orbit = { az: Math.PI * 0.86, el: 0.1, dist: 2.7 };
    this.target = new THREE.Vector3(STAGE.x, 0.95, STAGE.z - 0.1);
    this.anim = { mode: 'idle', t: 0 };
    this.formTarget = 1;
    this.panelOpen = true;
    this.presetName = null;
    this.buildStage();
    this.buildUI();
    this.bindStage();
  }

  // ------------------------------------------------------------------ stage
  buildStage() {
    const g = this.g, s = this.stage = new THREE.Group();
    s.position.copy(STAGE); s.visible = false; g.scene.add(s);
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(60, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xaab4be, roughness: 0.9, metalness: 0.05 }));
    s.add(this.floor);
    this.grid = new THREE.GridHelper(60, 30, 0x8d97a2, 0x8d97a2); this.grid.position.y = 0.004; this.grid.material.transparent = true; this.grid.material.opacity = 0.5; s.add(this.grid);
    const bc = document.createElement('canvas'); bc.width = 4; bc.height = 256;
    this.bgCtx = bc.getContext('2d'); this.bgTex = new THREE.CanvasTexture(bc); this.bgTex.colorSpace = THREE.SRGBColorSpace;
    this.bgTex.generateMipmaps = false; this.bgTex.minFilter = this.bgTex.magFilter = THREE.LinearFilter;
    this.key = new THREE.DirectionalLight(0xffffff, 2.2); this.key.position.set(-3, 5, -4); s.add(this.key); s.add(this.key.target); this.key.target.position.set(0, 0.8, 0);
    this.fill = new THREE.HemisphereLight(0xdfe8f2, 0x39414a, 1.1); s.add(this.fill);
    this.rim = new THREE.PointLight(0xff3a28, 0, 14, 2); this.rim.position.set(2.5, 2.4, 2.2); this.rim.userData.keepOn = true; s.add(this.rim);
    this.setLighting('neutral');
    this.eyeCam = new THREE.PerspectiveCamera(78, 1, 0.05, 500); this.eyeCam.rotation.order = 'YXZ';
  }

  setLighting(mode) {
    this.light = mode;
    const ship = mode === 'ship', c = this.bgCtx;
    const gr = c.createLinearGradient(0, 0, 0, 256);
    if (ship) { gr.addColorStop(0, '#05080b'); gr.addColorStop(0.5, '#0a1015'); gr.addColorStop(1, '#030507'); } else { gr.addColorStop(0, '#6f7f8f'); gr.addColorStop(0.5, '#8d9aa6'); gr.addColorStop(1, '#4b545d'); }
    c.fillStyle = gr; c.fillRect(0, 0, 4, 256); this.bgTex.needsUpdate = true;
    this.key.intensity = ship ? 0.5 : 2.2; this.key.color.set(ship ? 0x9fc6d6 : 0xffffff);
    this.fill.intensity = ship ? 0.35 : 1.1; this.fill.color.set(ship ? 0x6a8190 : 0xdfe8f2);
    this.rim.intensity = ship ? 26 : 0;
    this.floor.material.color.set(ship ? 0x6a7077 : 0xaab4be);
    const g = this.g;
    if (g.scene.fog) g.scene.fog.density = ship ? (g.gfx === 'retro' ? 0.03 : 0.016) : 0.0;
  }

  // ------------------------------------------------------------------ open / close
  async open() {
    const g = this.g, vm = g.viewmodel;
    await g.viewmodel.asset.ensure('s3');                // the other modelled hands load now (they are not needed by the default creature)
    this.active = true;
    g.audio.init();
    g.loadout.preview = false;
    this.prev = { state: g.state, cine: g.cinePose, vm: { cineW: vm.cineW, restrain: vm.restrain, restrainSlack: vm.restrainSlack, form: vm.form, curl: vm.curl, frag: vm.frag, crystal: vm.crystal, leftHidden: vm.leftHidden, reachW: vm.reachW, tremor: vm.tremor, xray: vm.xray, charge: vm.charge },
      pl: { x: g.player.pos.x, z: g.player.pos.z, yaw: g.player.yaw, pitch: g.player.pitch }, fogDensity: g.scene.fog.density, emerg: g.level.emergencyOn, weapon: g.weaponAcquired, bg: g.scene.background };
    g.state = 'creator'; g.cinePose = null; g.paused = false; g.eyeCam = this.eyeCam;
    this.saved = clone(save.creature); this.cur = clone(this.saved); this.undo = []; this.redo = []; this.presetName = null;
    Object.assign(vm, { cineW: 0, restrain: 0, restrainSlack: 1, form: 1, curl: 0, frag: 0, crystal: 1, leftHidden: false, reachW: 0, tremor: 0, xray: 0, charge: 0 });
    g.level.emergencyOn = false;
    this.cuffState = g.opening.cuffs.map((c) => c.visible); g.opening.cuffs.forEach((c) => { c.visible = false; });
    g.player.reset(STAGE.x, STAGE.z, 0); g.player.pitch = 0; g.player.pos.y = 0;
    g.body.reset(); g.body.setVisible(true);
    this.formTarget = 1; this.anim = { mode: 'idle', t: 0 };
    this.stage.visible = true;
    g.scene.background = this.bgTex;
    this.setLighting(this.light);
    this.setView(this.view);
    this.root.classList.remove('hidden');
    this.apply();
    this.refreshAll();
    g.resize();
  }

  close(commit) {
    const g = this.g, vm = g.viewmodel, pv = this.prev;
    if (commit) save.setCreature(this.cur);
    this.cancelPreview();
    g.loadout.preview = false;
    this.setMount(false);
    g.body.setHeadVisible(false);
    g.camera.clearViewOffset();
    this.root.classList.add('hidden');
    this.stage.visible = false;
    this.active = false;
    const def = save.creature;
    g.body.setCreature(def); vm.setCreature(def);
    Object.assign(vm, pv.vm);
    g.opening.cuffs.forEach((c, i) => { c.visible = this.cuffState[i]; });
    g.level.emergencyOn = pv.emerg;
    g.scene.background = pv.bg; g.scene.fog.density = pv.fogDensity;
    g.player.reset(pv.pl.x, pv.pl.z, pv.pl.yaw); g.player.pitch = pv.pl.pitch;
    g.body.reset(); g.eyeCam = g.camera;
    g.state = pv.state; g.cinePose = pv.cine;
    g.input.clear();
    g.ui.showMenu('start');
    g.refreshCreatureStatus && g.refreshCreatureStatus();
    g.resize();
  }

  cancelPreview() {
    const g = this.g;
    g.absorber.reset();
    if (this.robot) { this.robot.group.visible = false; this.robot = null; }
    g.effects.clear();
  }

  // ------------------------------------------------------------------ applying the definition
  apply() {
    const g = this.g, def = this.cur;
    const r = g.body.setCreature(def);
    g.viewmodel.setCreature(def);
    this.notes = r.notes;
    this.refreshNotes();
  }

  checkpoint() { if (!this.pending) this.pending = clone(this.cur); }

  endEdit() {
    if (!this.pending) return;
    const before = this.pending; this.pending = null;
    if (JSON.stringify(before) === JSON.stringify(this.cur)) return;
    this.undo.push(before); if (this.undo.length > UNDO_MAX) this.undo.shift();
    this.redo.length = 0; this.refreshHistory();
  }

  // run an edit on the definition: re-validate, apply live, keep the controls in step
  edit(fn) {
    this.checkpoint();
    fn(this.cur);
    this.cur = sanitize(this.cur);
    this.presetName = null;
    this.apply();
    this.refreshValues();
  }

  doUndo() { if (!this.undo.length) return; this.redo.push(clone(this.cur)); this.cur = this.undo.pop(); this.presetName = null; this.apply(); this.refreshAll(); }
  doRedo() { if (!this.redo.length) return; this.undo.push(clone(this.cur)); this.cur = this.redo.pop(); this.presetName = null; this.apply(); this.refreshAll(); }
  replaceAll(def, preset = null) { this.checkpoint(); this.cur = sanitize(def); this.presetName = preset; this.endEdit(); this.apply(); this.refreshAll(); }

  // ------------------------------------------------------------------ views, camera
  setView(v) {
    this.view = v;
    const g = this.g;
    this.setMount(v === 'body');
    g.body.setArmsVisible(true);
    g.body.setHeadVisible(v === 'body');           // in first person the camera is inside the head
    if (v === 'fp') g.player.pitch = this.fpLook || 0;
    this.refreshBar();
  }

  setMount(world) {
    const vm = this.g.viewmodel, g = this.g;
    this.mounted = world;
    if (world) g.scene.add(vm.root); else vm.scene.add(vm.root);
    vm.root.children.forEach((c) => { if (c.isLight) c.visible = !world; });
  }

  snap(name) {
    const az = { front: Math.PI, side: Math.PI * 0.5, back: 0 }[name];
    this.snapTo = { az, el: 0.08 };
    if (this.view !== 'body') this.setView('body');
  }

  bindStage() {
    const el = this.stageEl, pts = new Map();
    let last = 0;
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = this.pinchDist(pts); this.snapTo = null; });
    el.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pts.size >= 2) { const d = this.pinchDist(pts); if (last) this.orbit.dist = clamp(this.orbit.dist * last / d, 1.4, 7); last = d; return; }
      if (this.view === 'body') { this.orbit.az -= dx * 0.008; this.orbit.el = clamp(this.orbit.el + dy * 0.006, -0.1, 1.2); }
      else { this.fpLook = clamp((this.fpLook || 0) - dy * 0.004, -1.3, 0.6); this.g.player.pitch = this.fpLook; }
    });
    const up = (e) => { pts.delete(e.pointerId); last = 0; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.orbit.dist = clamp(this.orbit.dist * (1 + Math.sign(e.deltaY) * 0.08), 1.4, 7); }, { passive: false });
  }
  pinchDist(pts) { if (pts.size < 2) return 0; const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; }

  // ------------------------------------------------------------------ preview animations (the game's own rig)
  play(mode) {
    const g = this.g, p = g.player, vm = g.viewmodel;
    g.audio.init();
    this.anim = { mode, t: 0 };
    if (mode === 'transform') { this.formTarget = vm.form > 0.5 ? 0 : 1; vm.pulseGlow(0.8); }
    if (mode === 'fire') { this.formTarget = 1; this.shots = 0; }
    if (mode === 'dash') { p.dashing = true; p.dashDir.set(0, -1); p.dashT = 0.17; }
    if (mode === 'land') { p.vy = 7.6; p.grounded = false; }
    if (mode === 'absorb') this.startAbsorb();
    this.refreshBar();
  }

  startAbsorb() {
    const g = this.g;
    this.cancelPreview();
    const bot = new RobotBug(g, STAGE.x, STAGE.z - 1.7);
    bot.group.rotation.y = bot.yaw = 0; bot.active = true; bot.hp = 1;   // a disabled robot: nothing here fights back
    bot.group.visible = true; this.robot = bot;
    g.player.yaw = 0;
    g.absorber.begin(bot);
    if (this.view === 'body') this.snapTo = { az: Math.PI * 0.62, el: 0.2 };
  }

  step(dt) {
    const g = this.g, p = g.player, vm = g.viewmodel, a = this.anim;
    a.t += dt;
    // movement previews drive only the velocity the body and arms already react to; the preview never leaves the stage
    let tvx = 0, tvz = 0;
    if (a.mode === 'move') { const ph = a.t * 1.2; tvz = -7.2 * Math.cos(ph); tvx = 7.2 * Math.sin(ph * 1.3) * 0.7; if (a.t > 6) a.mode = 'idle'; }
    if (a.mode === 'dash') {
      if (p.dashing) { p.dashT -= dt; tvz = -18; if (p.dashT <= 0) p.dashing = false; }
      if (a.t > 1.1) a.mode = 'idle';
    }
    if (a.mode === 'move' || p.dashing || a.mode === 'dash') { p.vx = damp(p.vx, tvx, p.dashing ? 40 : 14, dt); p.vz = damp(p.vz, tvz, p.dashing ? 40 : 14, dt); }
    else { p.vx = damp(p.vx, 0, 13, dt); p.vz = damp(p.vz, 0, 13, dt); }
    this.grid.position.z = (this.grid.position.z - p.vz * dt) % 2; this.grid.position.x = (this.grid.position.x - p.vx * dt) % 2;
    // jump / landing: the same gravity and jump speed as the game
    if (!p.grounded || p.vy > 0) {
      p.vy -= 24 * dt; p.pos.y += p.vy * dt;
      if (p.pos.y <= 0 && p.vy <= 0) { p.pos.y = 0; if (p.vy < -6) g.audio.play('land', { vol: clamp(-p.vy / 14, 0.3, 1) }); p.grounded = true; p.vy = 0; if (a.mode === 'land') a.mode = 'idle'; }
    }
    // Shardcaster: grow / recover through the same form value the intro uses; shots go through the same recoil spring
    vm.form = damp(vm.form, this.formTarget, 5, dt);
    if (Math.abs(vm.form - this.formTarget) < 0.002) vm.form = this.formTarget;
    if (a.mode === 'fire') {
      const interval = g.weapon.interval;
      if (vm.form > 0.9 && a.t > (this.shots || 0) * interval + 0.15 && this.shots < 8) {
        this.shots++; vm.fireKick(); vm.muzzleWorld(this._m = this._m || new THREE.Vector3()); g.effects.muzzle(this._m); g.audio.play('shot', { vol: 0.5 });
      }
      if (this.shots >= 8 && a.t > 8 * interval + 0.9) a.mode = 'idle';
    }
    if (a.mode === 'transform' && Math.abs(vm.form - this.formTarget) < 0.01 && a.t > 0.5) a.mode = 'idle';
    if (a.mode === 'absorb' && !g.absorber.busy) { a.mode = 'idle'; this.cancelPreview(); }
    if (g.absorber.busy) g.absorber.update(dt);
    if (this.robot && g.absorber.busy) this.robot.updateFlash && this.robot.updateFlash(dt);
    g.body.update(dt);
    g.effects.update(dt);
    if (this.animBtns) for (const b of this.animBtns) b.el.classList.toggle('on', b.mode === a.mode && a.mode !== 'idle');
  }

  render(dt) {
    const g = this.g, p = g.player, vm = g.viewmodel, eye = this.eyeCam, c = g.camera;
    const w = window.innerWidth, h = window.innerHeight;
    eye.aspect = w / h; eye.position.set(p.pos.x, p.eye, p.pos.z); eye.rotation.set(p.pitch, p.yaw, 0); eye.updateMatrixWorld(); eye.updateProjectionMatrix();
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    vm.extrasHidden = false;
    vm.update(dt, { lookX: 0, lookY: 0, velX: p.vx * cos - p.vz * sin, velZ: -(p.vx * -sin + p.vz * -cos), dashing: p.dashing, yaw: p.yaw, pitch: p.pitch });
    const panel = this.panelOpen ? Math.min(this.panelEl.offsetWidth, w * 0.5) : 0;
    c.fov = 78; c.aspect = w / h;
    if (this.view === 'fp') {
      c.position.copy(eye.position); c.quaternion.copy(eye.quaternion);
      c.updateMatrixWorld(); c.updateProjectionMatrix();
      vm.syncToCamera(c);
    } else {
      if (this.snapTo) { this.orbit.az += Math.atan2(Math.sin(this.snapTo.az - this.orbit.az), Math.cos(this.snapTo.az - this.orbit.az)) * Math.min(1, dt * 9); this.orbit.el += (this.snapTo.el - this.orbit.el) * Math.min(1, dt * 9); }
      const o = this.orbit, t = this.target;
      c.position.set(t.x + Math.sin(o.az) * Math.cos(o.el) * o.dist, t.y + Math.sin(o.el) * o.dist, t.z + Math.cos(o.az) * Math.cos(o.el) * o.dist);
      c.lookAt(t); c.updateMatrixWorld(); c.updateProjectionMatrix();
      vm.root.position.set(p.pos.x, p.eye, p.pos.z);
      vm.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
      vm.root.updateMatrixWorld(true);
    }
    if (panel > 0) c.setViewOffset(w, h, panel / 2, 0, w, h); else c.clearViewOffset();
    g.body.updateArms(vm);
    g.post.render(dt, g.time);
  }

  // ------------------------------------------------------------------ UI
  buildUI() {
    const root = this.root = document.getElementById('creator');
    root.innerHTML = '';
    const mk = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; (parent || root).appendChild(e); return e; };
    this.stageEl = mk('div', 'cr-stage', root);
    const top = mk('div', 'cr-top', root);
    mk('div', 'cr-title', top, 'CREATURE');
    const hist = mk('div', 'cr-group', top);
    this.btnUndo = this.btn(hist, 'Undo', () => this.doUndo()); this.btnRedo = this.btn(hist, 'Redo', () => this.doRedo());
    const pg = mk('div', 'cr-group', top);
    this.btn(pg, 'Surprise me', () => this.randomise());
    const io = mk('div', 'cr-group', top);
    this.btn(io, 'Export', () => this.doExport()); this.btn(io, 'Import', () => this.fileEl.click());
    this.fileEl = mk('input', 'hidden', top); this.fileEl.type = 'file'; this.fileEl.accept = '.json,application/json';
    this.fileEl.onchange = () => this.doImport();
    const views = mk('div', 'cr-views', root);
    this.viewBtns = {};
    for (const [id, label] of [['front', 'Front'], ['side', 'Side'], ['back', 'Back']]) this.btn(views, label, () => this.snap(id));
    this.viewBtns.body = this.btn(views, 'Full body', () => this.setView('body'));
    this.viewBtns.fp = this.btn(views, 'First person', () => this.setView('fp'));
    this.btnArms = this.btn(views, 'Preview fully evolved', () => { const L = this.g.loadout; L.preview = !L.preview; this.btnArms.classList.toggle('on', L.preview); });
    this.btnLight = this.btn(views, 'Neutral light', () => { this.setLighting(this.light === 'neutral' ? 'ship' : 'neutral'); this.refreshBar(); });
    this.btnPanel = this.btn(views, 'Hide controls', () => { this.panelOpen = !this.panelOpen; this.panelEl.classList.toggle('collapsed', !this.panelOpen); this.refreshBar(); });
    const bar = mk('div', 'cr-bar', root);
    this.animBtns = [];
    for (const [id, label] of [['idle', 'Idle'], ['move', 'Walk'], ['dash', 'Dash'], ['land', 'Jump'], ['transform', 'Weapon'], ['fire', 'Fire'], ['absorb', 'Absorb']]) {
      const b = this.btn(bar, label, () => this.play(id)); this.animBtns.push({ mode: id, el: b });
    }
    this.noteEl = mk('div', 'cr-note', root);
    const panel = this.panelEl = mk('div', 'cr-panel', root);
    mk('div', 'cr-sec', panel, 'Choose a body');
    this.cardsEl = mk('div', 'cr-cards', panel);
    this.cards = PRESETS.map((p) => {
      const b = mk('button', 'cr-card', this.cardsEl); b.type = 'button';
      b.title = BLURB[p.name] || ''; b.innerHTML = `<i style="background:linear-gradient(135deg,${p.skin.primary},${p.skin.secondary} 70%,${p.skin.glow})"></i><b>${p.name}</b><small>${BLURB[p.name] || ''}</small>`;
      b.onclick = () => this.replaceAll(p, p.name);
      return { p, b };
    });
    mk('div', 'cr-sec', panel, 'Adjust');
    this.listEl = mk('div', 'cr-list', panel);
    this.rows = SIMPLE.map((d) => this.makeRow(d));
    const foot = mk('div', 'cr-foot', panel);
    this.btn(foot, 'Reset', () => this.replaceAll(PRESETS[0], PRESETS[0].name));
    const act = mk('div', 'cr-actions', panel);
    this.btn(act, 'Cancel', () => this.close(false)).classList.add('cancel');
    this.btn(act, 'Apply & save', () => this.close(true)).classList.add('apply');
    this.toastEl = mk('div', 'cr-toast', root);
  }

  btn(parent, label, fn) { const b = document.createElement('button'); b.textContent = label; b.type = 'button'; b.onclick = fn; parent.appendChild(b); return b; }

  makeRow(d) {
    if (d.h) { const h = document.createElement('div'); h.className = 'cr-h'; h.textContent = d.h; this.listEl.appendChild(h); return { d }; }
    const row = document.createElement('div'); row.className = 'cr-row';
    const head = document.createElement('div'); head.className = 'cr-rh';
    const lab = document.createElement('label'); lab.textContent = d.label; head.appendChild(lab);
    const val = document.createElement('span'); val.className = 'cr-val'; head.appendChild(val);
    row.appendChild(head);
    let input;
    if (d.kind === 'num') {
      input = document.createElement('input'); input.type = 'range'; input.min = d.min; input.max = d.max; input.step = d.step;
      input.oninput = () => this.edit((c) => d.set(c, +input.value));
      input.onchange = () => this.endEdit();
      input.addEventListener('pointerup', () => this.endEdit());
    } else if (d.kind === 'opt') {
      input = document.createElement('div'); input.className = 'cr-seg';
      for (const [k, name] of d.options) { const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.dataset.k = k; b.onclick = () => { this.edit((c) => d.set(c, d.options.find(([kk]) => String(kk) === String(k))[0])); this.endEdit(); }; input.appendChild(b); }
    } else {
      input = document.createElement('input'); input.type = 'color';
      input.oninput = () => this.edit((c) => d.set(c, input.value));
      input.onchange = () => this.endEdit();
    }
    row.appendChild(input);
    this.listEl.appendChild(row);
    return { d, row, input, val };
  }

  refreshValues() {
    for (const r of this.rows) {
      if (!r.input) continue;
      const { d, input, val } = r, v = d.get(this.cur);
      if (d.kind === 'num') { input.value = v; val.textContent = d.step >= 1 ? String(v) : (+v).toFixed(2); }
      else if (d.kind === 'opt') { for (const b of input.children) b.classList.toggle('on', String(b.dataset.k) === String(v)); }
      else { input.value = v; val.textContent = ''; }
    }
    for (const c of this.cards) c.b.classList.toggle('on', this.presetName === c.p.name);
  }

  refreshNotes() { this.noteEl.textContent = (this.notes || []).join(' '); this.noteEl.style.display = this.notes && this.notes.length ? 'block' : 'none'; }
  refreshHistory() { this.btnUndo.disabled = !this.undo.length; this.btnRedo.disabled = !this.redo.length; }
  refreshBar() {
    this.viewBtns.body.classList.toggle('on', this.view === 'body'); this.viewBtns.fp.classList.toggle('on', this.view === 'fp');
    this.btnLight.textContent = this.light === 'neutral' ? 'Neutral light' : 'Ship light';
    this.btnPanel.textContent = this.panelOpen ? 'Hide controls' : 'Show controls';
  }
  refreshAll() { this.refreshValues(); this.refreshHistory(); this.refreshBar(); }

  // a valid random creature: a random starting body, then random values for the same few controls the player sees
  randomise() {
    const base = PRESETS[Math.floor(Math.random() * PRESETS.length)];
    const d = randomCreature(Math.random, base);
    const R = (a, b) => a + Math.random() * (b - a);
    const out = clone(base);
    for (const r of SIMPLE) {
      if (r.kind === 'num') r.set(out, r.step >= 1 ? Math.round(R(r.min, r.max)) : R(r.min, r.max));
      else if (r.kind === 'opt' && r.label !== 'Style') r.set(out, r.options[Math.floor(Math.random() * r.options.length)][0]);
    }
    out.skin.primary = d.skin.primary; out.skin.secondary = d.skin.secondary; out.skin.marking = d.skin.marking; out.skin.glow = d.skin.glow;
    out.tentacles.color = d.tentacles.color; out.tentacles.glow = d.tentacles.glow; out.head.eyeColor = d.head.eyeColor;
    this.replaceAll(applyStyle(out, ['smooth', 'ridged', 'luminous', 'dark', 'translucent'][Math.floor(Math.random() * 5)]), null);
  }

  toast(msg, bad) { const t = this.toastEl; t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 4200); }

  doExport() {
    const blob = new Blob([exportText(this.cur)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (this.cur.name || 'creature').replace(/\W+/g, '-').toLowerCase() + '.intruder.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.toast('Preset exported.');
  }

  doImport() {
    const f = this.fileEl.files[0]; this.fileEl.value = '';
    if (!f) return;
    if (f.size > 20000) { this.toast('That file is too large to be a creature preset.', true); return; }
    f.text().then((txt) => {
      const r = validateImport(txt);
      if (r.error) this.toast(r.error, true); else { this.replaceAll(r.creature); this.toast('Preset imported.'); }
    }).catch(() => this.toast('The file could not be read.', true));
  }
}
