import * as THREE from 'three';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { clamp, damp, lerp, smooth } from '../core/util.js';
import { CollisionWorld } from '../world/collision.js';
import { NavGrid } from '../world/nav.js';
import { buildLevel, ARENA } from '../world/level.js';
import { generateRun, disposeRun, workshopRoom } from '../world/procgen.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { Shardcaster } from './shardcaster.js';
import { Projectiles, raySphere } from './projectiles.js';
import { RobotBug } from './enemies/robotBug.js';
import { SentryDrone } from './enemies/sentryDrone.js';
import { SecurityAndroid } from './enemies/android.js';
import { Barrel } from './barrels.js';
import { Encounter, EncounterState } from './encounter.js';
import { ViewModel } from '../presentation/viewmodel.js';
import { Intro } from '../presentation/intro.js';
import { Flight } from './flight.js';
import { Arsenal } from './arsenal.js';
import { alienReady } from './alien.js';
import { UI } from '../presentation/ui.js';
import { TouchControls, isTouchDevice, enterImmersive } from '../core/touch.js';
import { PostFX } from '../presentation/post.js';
import { AlienBody } from './body.js';
import { Absorber } from './absorb.js';
import { Pickups } from './pickups.js';
import { progress } from './progress.js';
import { Admin } from './admin.js';

const STEP = 1 / 60;
const BASE_FOV = 78;

export class Game {
  constructor(canvas, armGeos, kit, handAsset, homeAsset, creatureAsset) {
    this.homeAsset = homeAsset;
    this.elderKit = { geos: armGeos, hand: handAsset };
    this.canvas = canvas;
    this.kit = kit;
    this.arena = ARENA;
    const debug = location.search.includes('debug');

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04070a);
    this.scene.fog = new THREE.FogExp2(0x050709, 0.016);
    this.scene.add(new THREE.HemisphereLight(0x7f95a4, 0x14181b, 0.42));

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 500);
    this.camera.rotation.order = 'YXZ';

    this.world = new CollisionWorld();
    this.level = buildLevel(this.scene, this.world, this.kit);
    this.nav = null;
    this.waypoints = [];
    this.run = null;
    this.effects = new Effects(this.scene);
    this.audio = new Audio();
    this.ui = new UI();
    this.input = new Input(canvas);
    this.input.fake = location.search.includes('nolock');
    this.touchMode = isTouchDevice();
    if (this.touchMode) {
      this.input.touch = true;
      this.touchUI = new TouchControls(this.input, {
        onPause: () => { if (this.state === 'playing' || this.state === 'opening' || this.state === 'flight') this.input.unlock(); },
        onSkip: () => { if (this.opening.active && !this.paused) this.opening.skip(); },
      });
    }
    this.admin = new Admin(this);
    this.player = new Player(this);
    this.viewmodel = new ViewModel(handAsset);
    this.body = new AlienBody(this.scene, this.world, this.player, armGeos, { tint: 'player' });
    if (alienReady()) this.body.attachAlien({ tint: 'player', firstPerson: true });
    this.weapon = new Shardcaster(this);
    this.arsenal = new Arsenal(this);
    this.absorber = new Absorber(this);
    this.projectiles = new Projectiles(this);
    this.encounter = new Encounter(this);
    this.pickups = new Pickups(this);
    this.flight = new Flight(this);
    this.opening = new Intro(this);
    this.opening.resetProps();

    this.enemies = [];
    this.barrels = [];
    this.deathT = 0; this.deathMenu = false; this.deathRoll = 0; this.deathFx = { land: false };
    this.deathPuddle = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x1ab88c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.deathPuddle.rotation.x = -Math.PI / 2;
    this.deathPuddle.visible = false;
    this.deathPuddle.material.userData.noSnap = true;
    this.scene.add(this.deathPuddle);
    this.state = 'menu'; // menu | opening | playing | dead | complete
    this.paused = false;
    this.weaponAcquired = false;
    this.cinePose = null;
    this.trauma = 0;
    this.hitFlash = 0; this.flinch = 0; this.flinchRoll = 0; this.hbTimer = 0; this.hbPulse = 0;
    this.shakeT = 0;
    this.deadTimer = 0;
    this.lockRetries = 0;
    this.time = 0;
    this.lookX = 0; this.lookY = 0;
    this.fov = BASE_FOV;
    this.sens = 1;

    const gl = this.renderer.getContext();
    const uniformBudget = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
    this.maxLights = uniformBudget >= 1024 ? 12 : uniformBudget >= 512 ? 8 : 5;
    this.renderer.debug.onShaderError = (g, program, vs, fs) => {
      const d = document.createElement('pre');
      d.style.cssText = 'position:fixed;inset:0;z-index:99;margin:0;padding:12px;background:#200;color:#fcc;font:11px monospace;overflow:auto;white-space:pre-wrap';
      d.textContent = ['Shader error (please report):', g.getProgramInfoLog(program) || '', (g.getShaderInfoLog(fs) || '').slice(0, 800)].join('\n');
      document.body.appendChild(d);
    };
    this.post = new PostFX(this.renderer, this.scene, this.viewmodel.scene, this.camera);
    this.gfx = this.touchMode ? 'retro' : 'realistic'; // retro is far cheaper to draw, a better default on phones
    try { this.gfx = JSON.parse(localStorage.getItem('intruder-settings') || '{}').gfx || this.gfx; } catch (e) { /* default */ }
    this.post.setMode(this.gfx, this.scene);
    this.refreshGfxButtons();
    this.newRun();
    this.bind();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Menu backdrop: the lander adrift above the lost homeworld.
    this.opening.samplePose(0);
    this.cinePose = this.opening.pose;
    this.flight.showMenu();
    this.ui.fade(0);
    this.level.emergencyOn = true;
    this.viewmodel.cineW = 1;
    this.viewmodel.restrain = 1;

    if (debug) { window.__g = this; window.__THREE = THREE; }
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------- setup ----------
  makeNav(bounds) { return new NavGrid(this.world, bounds); }

  // Hover points for the drones, laid out over a room and filtered against anything tall.
  buildWaypoints(bounds) {
    const pts = [];
    const nx = Math.max(2, Math.floor((bounds.maxX - bounds.minX - 4) / 4)), nz = Math.max(2, Math.floor((bounds.maxZ - bounds.minZ - 4) / 3.5));
    const sx = (bounds.maxX - bounds.minX - 4) / nx, sz = (bounds.maxZ - bounds.minZ - 4) / nz;
    const near = this.world.boxes.filter((b) => b.tag !== 'door' && b.minY <= 4 && b.maxY >= 1.6 && b.maxX > bounds.minX - 2 && b.minX < bounds.maxX + 2 && b.maxZ > bounds.minZ - 2 && b.minZ < bounds.maxZ + 2);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const x = bounds.minX + 2 + i * sx, z = bounds.minZ + 2 + j * sz;
      let ok = true;
      for (const b of near) {
        if (x > b.minX - 0.9 && x < b.maxX + 0.9 && z > b.minZ - 0.9 && z < b.maxZ + 0.9) { ok = false; break; }
      }
      if (ok) pts.push({ x, z });
    }
    return pts;
  }

  // ---------- run / rooms ----------
  // Build a brand-new facility and point the encounter at it.
  newRun() {
    if (this.run) disposeRun(this, this.run);
    this.clearEnemies();
    for (const b of this.barrels) b.dispose();
    this.barrels = [];
    this.pickups.clear();
    this.run = generateRun(this);
    const rooms = [workshopRoom(this.level), ...this.run.rooms];
    this.run.all = rooms;
    this.level.extraDoors = this.run.doors;
    this.level.alarmLights = this.level.baseAlarm.concat(this.run.alarmLights);
    this.level.flicker = this.level.baseFlicker.concat(this.run.flicker);
    this.lightList = null;
    for (const r of rooms) for (const p of r.pickups) this.pickups.add(p.type, p.x, p.z, r, p.reveal);
    this.arena = ARENA;
    this.nav = this.makeNav(ARENA);
    this.waypoints = this.buildWaypoints(ARENA);
    this.level.doors.entrance.open(true);
    this.level.doors.exit.close(true);
    this.encounter.start(rooms);
  }

  makeEnemy(s) {
    if (s.type === 'android') return new SecurityAndroid(this, s.x, s.z, s.variant);
    if (s.type === 'bug') return new RobotBug(this, s.x, s.z, s.variant);
    return new SentryDrone(this, s.x, s.z, s.variant);
  }

  clearEnemies() {
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
  }

  // Put a room's first wave and its drums in place, dormant until the lockdown starts.
  spawnRoom(room) {
    this.clearEnemies();
    this.barrels = this.barrels.filter((b) => { if (b.room === room) { b.dispose(); return false; } return true; });
    room.waveIdx = 0;
    if (room.kind === 'quiet' || room.kind === 'lift') return;
    for (const s of room.waves[0] || []) this.enemies.push(this.makeEnemy(s));
    for (const s of room.barrels) { const b = new Barrel(this, s.x, s.z); b.room = room; this.barrels.push(b); }
  }

  spawnWave(room, idx) {
    const list = [];
    for (const s of room.waves[idx] || []) { const e = this.makeEnemy(s); this.enemies.push(e); list.push(e); }
    return list;
  }

  bind() {
    const ui = this.ui, input = this.input;
    $('btn-play').onclick = () => this.play();
    const tag = document.createElement('div');
    tag.className = 'build-tag';
    tag.textContent = `BUILD ${typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'DEV'} UTC`;
    $('menu-start').appendChild(tag);
    // start menu: CONTINUE skips the introduction once it has been seen; NEW GAME plays it again
    const bnew = $('btn-new');
    if (progress.introDone) { bnew.classList.remove('hidden'); $('btn-play').querySelector('span').textContent = 'CONTINUE'; }
    $('st-hp').textContent = `VITALITY ${this.player.maxHealth}` + (progress.maxHpBonus ? `  (+${progress.maxHpBonus} ABSORBED)` : '');
    $('st-cp').textContent = progress.introDone ? 'CHECKPOINT: SHARDCASTER ACQUIRED' : 'NEW SPECIMEN';
    bnew.onclick = () => { progress.setIntroDone(false); this.play(); };
    const panels = { 'btn-opts': $('panel-opts'), 'btn-help': $('panel-help') };
    for (const [btn, panel] of Object.entries(panels)) {
      $(btn).onclick = () => {
        const open = panel.classList.contains('hidden');
        for (const p of Object.values(panels)) p.classList.add('hidden');
        panel.classList.toggle('hidden', !open);
      };
    }
    for (const el of document.querySelectorAll('#menu-start .close')) el.onclick = () => { for (const p of Object.values(panels)) p.classList.add('hidden'); };
    $('btn-resume').onclick = () => this.resume();
    $('btn-restart').onclick = () => this.restart();
    $('btn-retry').onclick = () => this.restart();
    $('btn-replay').onclick = () => this.restart(true);
    $('btn-intro').onclick = () => this.replayFromStart();
    for (const id of ['btn-gfx', 'btn-gfx2']) $(id).onclick = () => this.toggleGfx();
    for (const id of ['set-volume', 'set-volume-2']) $(id).oninput = (e) => { this.audio.setVolume(+e.target.value); $('set-volume').value = $('set-volume-2').value = e.target.value; this.saveSettings(); };
    for (const id of ['set-sens', 'set-sens-2']) $(id).oninput = (e) => { this.sens = +e.target.value; $('set-sens').value = $('set-sens-2').value = e.target.value; this.saveSettings(); };
    try {
      const s = JSON.parse(localStorage.getItem('intruder-settings') || '{}');
      if (s.volume != null) { this.audio.volume = s.volume; $('set-volume').value = $('set-volume-2').value = s.volume; }
      if (s.sens != null) { this.sens = s.sens; $('set-sens').value = $('set-sens-2').value = s.sens; }
    } catch (e) { /* settings are optional */ }

    input.onLockChange = (locked) => {
      if (locked) {
        this.lockRetries = 0;
        if (this.paused) this.unpause();
      } else if (this.state === 'opening' || this.state === 'playing' || this.state === 'flight') this.pause();
    };
    input.onLockError = () => {
      if (this.state === 'menu' || this.state === 'dead' || this.state === 'complete') return;
      if (this.lockRetries++ < 6) setTimeout(() => { if (!input.locked && this.state !== 'menu') input.lock(); }, 350);
      else if (!this.paused) this.pause();
    };
    input.onKeyDown = (code) => {
      if (this.opening.active && this.opening.canSkip() && !this.paused && code === 'Enter') this.opening.skip();
    };
    input.onMouseDown = (btn) => { if (btn === 0 && this.canFire()) this.weapon.latch(); else if (btn === 2 && this.opening.active) this.opening.press(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden && (this.state === 'playing' || this.state === 'opening' || this.state === 'flight') && !this.paused) this.pause(); });
  }

  toggleGfx() {
    this.gfx = this.gfx === 'realistic' ? 'retro' : 'realistic';
    this.post.setMode(this.gfx, this.scene);
    this.resize();
    this.refreshGfxButtons();
    this.saveSettings();
  }

  refreshGfxButtons() {
    for (const id of ['btn-gfx', 'btn-gfx2']) document.getElementById(id).textContent = `GRAPHICS: ${this.gfx === 'retro' ? 'RETRO' : 'REALISTIC'}`;
  }

  saveSettings() {
    try { localStorage.setItem('intruder-settings', JSON.stringify({ volume: this.audio.volume, sens: this.sens, gfx: this.gfx })); } catch (e) { /* ignore */ }
  }

  // ---------- flow ----------
  play() {
    if (progress.introDone) { this.continueGame(); return; }
    this.audio.init();
    if (this.touchMode) enterImmersive();
    this.ui.hideMenus();
    this.ui.fade(1);
    this.state = 'playing';
    this.cinePose = null;
    this.opening.begin(progress.introDone ? 'ready' : 'home');
    this.input.lock();
  }

  // Seen the introduction already: straight into the facility with the weapon.
  continueGame() {
    this.audio.init();
    if (this.touchMode) enterImmersive();
    this.ui.hideMenus();
    this.state = 'playing';
    this.cinePose = null;
    this.restart();
  }

  beginPlay() {
    this.state = 'playing';
    this.cinePose = null;
    this.level.emergencyOn = false;
    this.ui.showHud(true);
    this.ui.clearTransient();
    this.ui.setObjective('REACH THE HANGAR');
    if (this.touchMode) {
      this.ui.hintOnce('controls', 'LEFT THUMB MOVE · RIGHT THUMB LOOK', 3.5);
    } else {
      this.ui.hintOnce('controls', 'WASD MOVE · SPACE JUMP · SHIFT DASH · CLICK FIRE', 4);
    }
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.input.clear();
    this.audio.suspend();
    this.ui.showMenu('pause');
  }

  resume() {
    if (this.touchMode) enterImmersive();
    this.ui.showMenu('pause');
    this.lockRetries = 0;
    this.input.lock(); // unpause happens when the lock is actually granted
  }

  unpause() {
    this.paused = false;
    this.ui.hideMenus();
    this.audio.resume();
    this.last = performance.now();
    this.input.clear();
    this.input.fireGuardUntil = performance.now() + 250;
  }

  restart(freshRun = false) {
    this.audio.init();
    // restarting during the opening replays the opening (or the flight); it never jumps ahead of the story
    if (this.state === 'flight') { this.flight.stop(); this.paused = false; this.ui.hideMenus(); this.state = 'flight'; this.flight.start(); this.input.lock(); return; }
    if (this.opening.active) { this.replayFromStart(); return; }
    if (freshRun) this.newRun();
    this.resetEncounter();
    this.paused = false;
    this.ui.hideMenus();
    this.lockRetries = 0;
    this.input.lock();
  }

  // The flight is over: the lander is drawn into the vessel's bay and the survivor steps out into the containment bay.
  arriveAtVessel() {
    this.flight.stop();
    this.state = 'playing';
    this.cinePose = null;
    this.opening.arrive();
    this.input.lock();
  }

  // Full replay: encounter, doors and props back to the beginning, then the opening plays again.
  replayFromStart() {
    this.audio.init();
    this.newRun();
    this.resetEncounter();
    this.ui.hideMenus();
    this.paused = false;
    this.cinePose = null;
    this.state = 'playing';
    this.opening.begin('home');
    this.lockRetries = 0;
    this.input.lock();
  }

  resetEncounter() {
    this.ending = null; this.opening.moveLocked = false;
    this.projectiles.clear();
    this.effects.clear();
    this.encounter.restartRoom(); // resets the room being fought and places the player at its checkpoint
    this.weapon.reset();
    this.arsenal.reset();
    this.absorber.reset();
    this.viewmodel.recoil = this.viewmodel.recoilVel = this.viewmodel.pulse = 0;
    this.weaponAcquired = true;
    this.body.reset();
    this.nav.forceRefresh();
    this.trauma = 0;
    this.hitFlash = this.flinch = this.hbPulse = this.hbTimer = 0;
    this.deadTimer = 0;
    this.deathT = 0; this.deathMenu = false; this.deathPuddle.visible = false; this.body.deathK = 0;
    this.state = 'playing';
    this.cinePose = null;
    this.opening.onRetry();
    this.ui.clearTransient();
    this.ui.setHealth(this.player.health, this.player.maxHealth);
    this.ui.showHud(true);
    this.ui.fade(0);
    this.audio.resume();
  }

  die() {
    if (this.player.dead) return;
    this.player.dead = true;
    this.state = 'dead';
    this.deathT = 0;
    this.deathMenu = false;
    this.deathRoll = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.4);
    this.deathFx = { land: false };
    this.deathPuddle.visible = false;
    this.absorber.reset();
    this.audio.play('death');
    this.audio.stopSiren();
    this.input.clear();
    this.hitFlash = 1;
    this.addShake(0.5);
    this.ui.clearTransient();
    this.ui.showHud(false);
    // the body bursts gel as it is struck down
    const p = this.player.pos, fx = this.effects;
    for (let i = 0; i < 34; i++) fx.glowP.emit(p.x, p.y + 1.3, p.z, (Math.random() - 0.5) * 6, 1 + Math.random() * 4, (Math.random() - 0.5) * 6, 0.5 + Math.random() * 0.7, 0.05 + Math.random() * 0.07, 0.1, 0.85, 0.7, 12, 0.4);
  }

  // Runs while dead: the landing, the spreading pool, the fade to black, the body going limp.
  updateDeath() {
    const t = this.deathT, p = this.player.pos;
    this.body.deathK = smooth(clamp(t / 0.9, 0, 1));
    if (!this.deathFx.land && t >= 0.95) {
      this.deathFx.land = true;
      this.addShake(0.35);
      this.audio.play('land', { vol: 1 });
      for (let i = 0; i < 30; i++) this.effects.glowP.emit(p.x, 0.05, p.z, (Math.random() - 0.5) * 5, 0.5 + Math.random() * 3, (Math.random() - 0.5) * 5, 0.4 + Math.random() * 0.6, 0.04 + Math.random() * 0.06, 0.1, 0.85, 0.7, 10, 0.5);
      this.deathPuddle.position.set(p.x, 0.025, p.z);
      this.deathPuddle.visible = true;
    }
    if (this.deathPuddle.visible) {
      this.deathPuddle.scale.setScalar(Math.max(0.01, 1.5 * smooth((t - 0.95) / 1.6)));
      this.deathPuddle.material.opacity = 0.5 * (1 - smooth((t - 2.2) / 0.6));
    }
    this.ui.fade(0.94 * smooth((t - 1.6) / 1.0));
    if (t >= 2.7 && !this.deathMenu) { this.deathMenu = true; this.ui.showMenu('dead'); this.input.unlock(); }
  }

  // Camera of a falling body: crashes to the floor, rolls, and looks up at the ceiling as the view closes in.
  deathCamera(c) {
    const t = this.deathT, k = clamp((t - 0.1) / 0.85, 0, 1), fall = k * k, roll = smooth(clamp((t - 0.1) / 0.9, 0, 1));
    c.position.y = lerp(this.player.eye, 0.3, fall);
    c.rotation.x = lerp(this.player.pitch, 0.5, smooth(clamp((t - 0.1) / 1.0, 0, 1)));
    c.rotation.z = this.deathRoll * roll + Math.sin(t * 1.7) * 0.02 * roll;
    c.rotation.y += this.deathRoll * 0.18 * roll;
  }

  // The end of the opening chapter: the hangar lift engages, the elder's signal is traced to a departing flagship, then the screen fades to the chapter card.
  complete() {
    if (this.ending) return;
    this.ending = { t: 0 }; this.opening.moveLocked = true;
    this.audio.play('unlock', { vol: 0.9 });
    this.ui.setObjective('');
    this.ui.subtitle('Hangar lift engaged. Tracing the elder’s signal.', 'SHIP AI', 3.2);
  }
  updateEnding(dt) {
    const E = this.ending; E.t += dt;
    if (E.t > 3.4 && !E.a) { E.a = 1; this.ui.subtitle('Signal found. Source: the flagship MERIDIAN. It is leaving the system.', 'SHIP AI', 4.2); this.audio.play('alert', { vol: 0.5 }); this.addShake(0.2); }
    if (E.t > 8.0 && !E.b) { E.b = 1; this.ui.subtitle('Then that is where I am going.', '', 3.0, true); }
    if (E.t > 6.5) this.ui.fade(smooth(clamp((E.t - 6.5) / 2.5, 0, 1)));
    if (E.t > 9.6) { this.ending = null; this.opening.moveLocked = false; this.ui.fade(0); this.finishChapter(); }
  }
  finishChapter() {
    this.state = 'complete';
    this.input.clear();
    this.ui.clearTransient();
    this.ui.showMenu('complete');
    this.input.unlock();
  }

  canFire() {
    return this.state === 'playing' && !this.paused && this.input.locked && !this.player.dead && this.weaponAcquired;
  }

  // ---------- gameplay hooks ----------
  addShake(a) { this.trauma = Math.min(1, this.trauma + a); }

  sfxAt(name, pos, vol = 1) {
    const cp = this.camera.position;
    const d = Math.hypot(pos.x - cp.x, pos.y - cp.y, pos.z - cp.z);
    const v = vol * Math.pow(clamp(1 - d / 45, 0, 1), 1.3);
    if (v < 0.02) return;
    const dx = pos.x - cp.x, dz = pos.z - cp.z, l = Math.hypot(dx, dz) || 1;
    const pan = (dx * Math.cos(this.player.yaw) - dz * Math.sin(this.player.yaw)) / l;
    this.audio.play(name, { vol: v, pan: pan * 0.8 });
  }

  pickAim(origin, dir, maxT) {
    let best = maxT;
    const wh = this.world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxT);
    if (wh) best = wh.t;
    const it = this.opening.target;                    // the maintenance lock: the crosshair sees it like any target
    if (it && it.alive) { const t = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, it.c.x, it.c.y, it.c.z, it.r, best); if (t >= 0 && t < best) best = t; }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      for (const s of e.hitSpheres) {
        const t = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, s.c.x, s.c.y, s.c.z, s.r, best);
        if (t >= 0 && t < best) best = t;
      }
    }
    for (const b of this.barrels) {
      if (b.state === 'destroyed') continue;
      const s = b.hitSpheres[0];
      const t = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, s.c.x, s.c.y, s.c.z, s.r, best);
      if (t >= 0 && t < best) best = t;
    }
    return origin.clone().addScaledVector(dir, best);
  }

  damageEnemy(e, dmg, point) {
    const killed = e.takeDamage(this.admin && this.admin.oneHit ? dmg * 100 : dmg, point);
    this.ui.hitMarker(killed);
    this.audio.play(killed ? 'kill' : 'hit', { vol: 1 });
    if (killed) {
      // a kill lands hard: a few frames of hit-stop, a jolt and a flash
      this.hitStop = 0.06;
      this.addShake(0.16);
      this.effects.flashLight(point || e.centerPoint(), 0xffa040, 45, 0.18);
    }
    return killed;
  }

  onPlayerHit(enemy, dmg, point) {
    this.effects.hitSparks(point, [1, 0.8, 0.3], 14);
    this.effects.glowP.emit(point.x, point.y, point.z, 0, 0, 0, 0.12, 0.45, 0.7, 1, 1);
    this.effects.flashLight(point, 0x9ff6ff, 14, 0.06);
    const p = this.player.pos;
    if (!enemy.disabled && !enemy.absorbing) enemy.hitReact?.(point.x - p.x, point.z - p.z, dmg);
    this.damageEnemy(enemy, dmg, point);
  }

  onPlayerHitBarrel(barrel, dmg, point) {
    this.effects.hitSparks(point, [1, 0.6, 0.2], 10);
    this.audio.play('hit');
    this.ui.hitMarker(false);
    barrel.takeDamage(dmg);
  }

  onEnemyDied() { /* the encounter polls living enemies each step */ }

  damagePlayer(amount, from) {
    const p = this.player;
    if (p.dead || this.state !== 'playing') return;
    if (this.admin && this.admin.god) return;
    p.health = Math.max(0, p.health - amount);
    this.ui.damageFlash(clamp(amount / 12, 0.7, 1));
    if (from) {
      const dx = from.x - p.pos.x, dz = from.z - p.pos.z;
      if (Math.hypot(dx, dz) > 0.05) {
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
        this.ui.damageDir(Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz));
      }
    }
    this.hitFlash = clamp(amount / 14, 0.5, 1);
    this.flinch = clamp(amount / 40, 0.12, 0.35);
    this.flinchRoll = (Math.random() < 0.5 ? -1 : 1) * 0.5;
    this.viewmodel.recoilVel += 6;
    this.addShake(0.4);
    this.audio.play('hurt');
    if (p.health <= 0) this.die();
  }

  // ---------- frame ----------
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.post.resize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.effects.setScale(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const raw = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    let ts = this.admin.timeScale;
    if (this.hitStop > 0) { this.hitStop -= raw; ts *= 0.12; }
    if (this.state === 'dead' && !this.paused) {
      // a hit-stop, then the world slowly catches up while the body falls
      this.deathT += raw;
      ts *= this.deathT < 0.14 ? 0.05 : clamp(0.2 + (this.deathT - 0.14) * 0.45, 0.2, 0.75);
    }
    const dt = raw * ts;
    this.time += dt;
    this.adminT = (this.adminT || 0) - raw;
    if (this.adminT <= 0) { this.adminT = 0.2; this.admin.sync(); }
    if (!this.paused) this.frame(dt);
    this.render(dt);
  }

  frame(dt) {
    const { input, player } = this;
    const [lx, ly] = input.takeLook();
    this.lookX = lx; this.lookY = ly;
    if (this.flight.menuActive) { if (this.state === 'menu') this.flight.updateMenu(dt); else this.flight.hideMenu(); }
    if (this.state === 'flight') {
      // the screen shake and hit flash must keep fading in flight too (this branch returns before the normal decay below)
      this.trauma = Math.max(0, this.trauma - dt * 1.7); this.hitFlash = Math.max(0, this.hitFlash - dt * 2.2);
      this.flight.update(dt, input, this.lookX, this.lookY);
      this.effects.update(dt);
      this.ui.update(dt);
      input.endFrame();
      return;
    }
    const live = this.state === 'playing' && !player.dead;
    if (live && input.locked) {
      player.look(lx, ly, this.sens);
      player.latch(input);
    }

    this.opening.update(dt);
    this.enemyFreeze = Math.max(0, (this.enemyFreeze || 0) - dt);
    if (this.state === 'menu') { const q = this.opening.pose; q.yaw = 0.22 * Math.sin(this.time * 0.16); q.pitch = 0.02 * Math.sin(this.time * 0.23); q.x = Math.sin(this.time * 0.11) * 0.06; }

    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.simulate(h);

    if (this.state === 'dead') this.updateDeath();
    if (this.ending) this.updateEnding(dt);
    if (this.state === 'playing' && this.encounter.won && !this.ending) this.complete();

    this.level.update(this.time);
    this.effects.update(dt);
    this.body.setVisible(!this.cinePose && !this.opening.hideBody);
    this.body.update(dt);
    this.ui.update(dt);
    if (this.touchUI) this.touchUI.setVisible(this.paused ? false : this.state === 'playing', this.opening.active ? this.opening.buttons() : null);
    if (this.state === 'playing' || this.state === 'dead') {
      this.ui.setHealth(player.health, player.maxHealth);
      this.ui.setDash(player.dashReady);
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.2);
    this.flinch = Math.max(0, this.flinch - dt * 1.6);
    this.hbPulse = Math.max(0, this.hbPulse - dt * 2.5);
    this.updateLowHealth(dt);
    input.endFrame();
  }

  // Persistent low-health feedback: heartbeat, red edge pulse, desaturation (via post), blinking HUD.
  lowHealthSeverity() {
    const p = this.player;
    if (this.state !== 'playing' && this.state !== 'dead') return 0;
    return p.health <= 0 ? 1 : clamp((40 - p.health) / 40, 0, 1);
  }

  updateLowHealth(dt) {
    const sev = this.lowHealthSeverity();
    if (sev > 0 && !this.player.dead) {
      this.hbTimer -= dt;
      if (this.hbTimer <= 0) {
        this.audio.play('heartbeat', { vol: 0.5 + sev * 0.5 });
        this.hbPulse = 1;
        this.hbTimer = 1.15 - sev * 0.6;
      }
    }
    this.ui.setLowHealth(sev, this.hbPulse);
  }

  simulate(dt) {
    const { player, input } = this;
    const playing = this.state === 'playing';
    const controllable = playing && !player.dead && input.locked && !this.opening.moveLocked;
    if (this.state !== 'opening' && this.state !== 'menu') {
      player.step(dt, input, controllable);
      if (player.justDashed) { this.audio.play('dash'); this.addShake(0.06); }
    }
    this.poseCamera();
    {
      const fire = this.canFire();
      if (this.arsenal.step(dt, input.mouse(0), fire, this.weapon.pressLatch)) this.weapon.pressLatch = false;
      else this.weapon.step(dt, input.mouse(0), fire);
    }
    this.level.updateDoors(dt);
    this.projectiles.update(dt);
    for (const e of this.enemies) { if (e.absorbing || this.enemyFreeze > 0) { e.updateFlash?.(dt); continue; } e.update(e.slowT > 0 ? dt * 0.4 : dt); }
    if (playing && !player.dead && !this.opening.active) this.absorber.update(dt);
    if (playing) this.pickups.update(dt);
    for (const b of this.barrels) b.update(dt);
    if (playing) {
      if (this.nav) this.nav.setTarget(player.pos.x, player.pos.z);
      this.encounter.update(dt);
    }
  }

  // Base camera pose (no shake) from the player or the opening.
  poseCamera() {
    const c = this.camera, p = this.player;
    if (this.cinePose) {
      const cp = this.cinePose;
      c.position.set(cp.x, cp.y, cp.z);
      c.rotation.set(cp.pitch, cp.yaw, 0);
    } else {
      c.position.set(p.pos.x, p.eye, p.pos.z);
      c.rotation.set(p.pitch, p.yaw, 0);
    }
    c.updateMatrixWorld();
  }

  // GPUs only allow so many light uniforms per shader. Keep a constant number of point lights switched on: the nearest ones that are actually lit.
  // (A constant count means swapping lights never forces a shader recompile.)
  cullLights() {
    const MAX = this.maxLights;
    if (!this.lightList) { this.lightList = []; this.scene.traverse((o) => { if (o.isPointLight) this.lightList.push(o); }); }
    const p = this.camera.position;
    const score = (l) => (l.userData.keepOn ? -1e9 : (l.intensity > 0.5 ? l.position.distanceToSquared(p) : 1e9 + l.position.distanceToSquared(p)));
    const sorted = this.lightList.slice().sort((a, b) => score(a) - score(b));
    for (let i = 0; i < sorted.length; i++) sorted[i].visible = i < MAX;
  }

  render(dt) {
    const r = this.renderer, c = this.camera, p = this.player;
    if (!this.paused) {
      if (this.state === 'flight' || (this.state === 'menu' && this.flight.menuActive)) this.flight.pose(c); else this.poseCamera();
      // Restrained trauma-based shake applied only to the rendered view.
      const s = this.trauma * this.trauma;
      if (s > 0.0005) {
        this.shakeT += dt * 38;
        c.rotation.x += Math.sin(this.shakeT * 1.3) * 0.014 * s;
        c.rotation.y += Math.sin(this.shakeT * 1.7 + 2) * 0.014 * s;
        c.rotation.z += Math.sin(this.shakeT * 1.1 + 4) * 0.01 * s;
      }
      if (this.flinch > 0 && !this.cinePose) { c.rotation.x -= this.flinch * 0.14; c.rotation.z += this.flinchRoll * this.flinch * 0.2; }
      this.kick = damp(this.kick || 0, 0, 16, dt);
      c.rotation.x += this.kick;
      if (this.state === 'dead') this.deathCamera(c);
      const sev = this.lowHealthSeverity();
      this.post.grade.uniforms.uHurt.value = sev;
      this.post.grade.uniforms.uPulse.value = this.hbPulse;
      this.post.grade.uniforms.uHit.value = this.hitFlash;
      const dashing = p.dashing && !this.cinePose;
      const baseFov = this.admin.fov || BASE_FOV;
      this.fov = damp(this.fov, baseFov + (dashing ? 5 : 0) + (this.absorbFov || 0) - (this.state === 'dead' ? 18 * smooth(clamp(this.deathT / 1.5, 0, 1)) : 0), 14, dt);
      if (Math.abs(c.fov - this.fov) > 0.01) { c.fov = this.fov; c.updateProjectionMatrix(); this.effects.setScale(r.domElement.height, c.fov); }
      c.updateMatrixWorld();
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      if (this.state !== 'flight') this.viewmodel.update(dt, {
        lookX: this.lookX, lookY: this.lookY,
        velX: p.vx * cos - p.vz * sin, velZ: -(p.vx * -sin + p.vz * -cos),
        dashing, air: !this.cinePose && !p.grounded, yaw: this.cinePose ? this.cinePose.yaw : p.yaw, pitch: this.cinePose ? this.cinePose.pitch : p.pitch,
      });
      if (this.state !== 'flight') this.viewmodel.syncToCamera(c);
      if (this.state === 'dead') {
        // the arms go limp and drop with the body
        const k = smooth(clamp(this.deathT / 0.7, 0, 1)), r = this.viewmodel.root;
        r.translateY(-0.7 * k); r.rotateX(-0.8 * k);
        r.updateMatrixWorld(true);
      }
    }
    this.cullLights();
    this.post.render(dt, this.time);
  }
}

function $(id) { return document.getElementById(id); }
