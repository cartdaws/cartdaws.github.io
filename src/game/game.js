import { resetMemories } from './memories.js';
import { ShipLife } from '../world/shipLife.js';
import { Surface } from '../world/surface.js';
import { Campaign } from './campaign.js';
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
    // real shadows from the one light that matters, wherever there is a sky. Desktop only: phones keep their frame rate.
    this.canShadow = !document.body.classList.contains('touch') && !/Android|iPhone|iPad/i.test(navigator.userAgent);
    if (this.canShadow) { this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap; }
    this.campaign = new Campaign(this);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04070a);
    this.scene.fog = new THREE.FogExp2(0x050709, 0.016);
    this.baseHemi = new THREE.HemisphereLight(0x7f95a4, 0x14181b, 0.42); this.scene.add(this.baseHemi);       // the ship's own interior fill; anywhere with a sky has its own light

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
    // phones reclaim graphics memory when they run short; say so and offer a reload instead of leaving a frozen black screen (progress is saved)
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); window.__intruderFail && window.__intruderFail('The phone ran out of graphics memory.', true); });
    this.input = new Input(canvas);
    this.input.fake = location.search.includes('nolock');
    this.touchMode = isTouchDevice();
    if (this.touchMode) {
      this.input.touch = true;
      this.touchUI = new TouchControls(this.input, {
        onPause: () => { if (this.state === 'playing' || this.state === 'opening' || this.state === 'flight') this.input.unlock(); },
        onSkip: () => { if (this.opening.active && !this.paused) this.opening.skip(); },
        onArms: () => { if (this.state === 'playing' && !this.opening.active && !this.paused) this.arsenal.cycle(); },
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
    this.deathPuddle = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 8, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })(), color: 0x0d6a58, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }));
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

    this.surface = new Surface(this);
    this.campaign.refresh();
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
    (this.shipLife || (this.shipLife = new ShipLife(this))).build(rooms);
    this.campaign.dressRun(this.run, rooms);
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
    $('st-cp').textContent = progress.introDone ? 'CHECKPOINT: ABOARD THE HALCYON' : 'THE VALLEY';
    bnew.onclick = () => { progress.setIntroDone(false); resetMemories(); this.campaign.reset(); this.arsenal.resetAll?.(); progress.resetBonus(); this.player.maxHealth = 100; this.player.health = 100; this.play(); };
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
    $('btn-flyon').onclick = () => this.takeTheShip();
    { const fo = $('btn-space'); if (fo) { if (progress.chapterDone) fo.classList.remove('hidden'); fo.onclick = () => this.takeTheShip(); } }
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

  // Keep a phone's screen awake while playing, and bring the sound back if the system interrupted it.
  keepAwake() {
    if (!this.touchMode) return;
    const ask = () => { try { navigator.wakeLock?.request?.('screen').catch?.(() => {}); } catch (e) { /* optional */ } };
    ask();
    if (!this.awakeHooked) {
      this.awakeHooked = true;
      document.addEventListener('visibilitychange', () => { if (!document.hidden) ask(); });
      document.addEventListener('pointerup', () => { const c = this.audio.ctx; if (c && c.state !== 'running' && !this.paused) c.resume?.().catch?.(() => {}); }, { passive: true });
    }
  }

  // ---------- flow ----------
  play() {
    this.keepAwake();
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
    if (['valley', 'chase', 'trial'].includes(this.campaign.beat)) this.campaign.setBeat('deck');
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
    this.ui.setObjective(this.encounter.baseObjective());
    if (this.touchMode) {
      this.ui.hintOnce('controls', 'LEFT THUMB MOVE · RIGHT THUMB LOOK', 3.5);
    } else {
      this.ui.hintOnce('controls', 'WASD MOVE · SPACE JUMP · SHIFT DASH · CLICK FIRE', 4);
    }
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    { const j = document.getElementById('journal'); if (j) { j.innerHTML = ''; for (const [k, v] of this.campaign.journal()) { const d = document.createElement('div'), b = document.createElement('b'), s = document.createElement('span'); b.textContent = k; s.textContent = v; d.append(b, s); j.appendChild(d); } } }
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
    if (this.surface.active) { this.surface.respawn(); return; }
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
    this.surface.leave(false); this.flight.free = false; this.flight.stop(); this.campaign.reset(); resetMemories(); this.arsenal.resetAll?.(); progress.resetBonus(); this.player.maxHealth = 100; this.player.health = 100;
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
    this.audio.scene('ship'); this.audio.combatMusic(false);
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
    this.deathT = 0; this.deathMenu = false; this.deathPuddle.visible = false; this.body.deathK = 0; this.viewmodel.limp = 0;
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
    this.audio.play('death'); this.audio.combatMusic(false);
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
    this.viewmodel.limp = this.body.deathK;
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
    this.ui.subtitle('Deck nine. Almost there.', '', 2.8, true);
    this.audio.scene('ending'); this.audio.combatMusic(false);
  }
  updateEnding(dt) {
    const E = this.ending; E.t += dt;
    if (E.t > 3.2 && !E.a) { E.a = 1; this.ui.subtitle('Meridian undocked. All eight aboard. Joining the fleet: forty-one thousand of us, bound for Earth.', 'MEMORY', 5.0); this.audio.play('alert', { vol: 0.5 }); this.addShake(0.2); }
    if (E.t > 8.4 && !E.c) { E.c = 1; this.ui.subtitle('You are too late, Specimen Nine. Nothing is left aboard for you.', 'HALCYON', 3.2); this.audio.play('pa', { vol: 0.6 }); }
    this.addShake(0.02 * dt * 60 * 0.15);      // the lift grinding down through the decks
    if (E.t > 0.4 && !E.r) { E.r = 1; this.audio.play('servo', { vol: 0.7 }); this.audio.play('surge', { vol: 0.35 }); }
    if (E.t > 10.2) this.ui.fade(smooth(clamp((E.t - 10.2) / 1.6, 0, 1)));
    if (E.t > 11.9) { this.ending = null; this.flight.playEnding(() => { this.opening.moveLocked = false; this.finishChapter(); }); }
  }
  // After the chapter: space is yours. Every world on the road to Earth is open.
  takeTheShip() {
    this.audio.init(); if (this.touchMode) enterImmersive();
    this.ui.hideMenus(); this.opening.endRoute(); this.opening.active = false; this.weaponAcquired = true; this.encounter.won = false; this.ending = null; this.cinePose = null; this.paused = false;
    if (['valley', 'chase', 'trial', 'deck', 'chart'].includes(this.campaign.beat)) { const w = this.campaign.s.worlds; this.campaign.setBeat(!w.ash ? 'home' : this.campaign.missing().length ? 'road' : 'crossing'); }
    this.flight.free = true; this.state = 'flight'; this.flight.start(); this.lockRetries = 0; this.input.lock();
  }

  // The cards at the ends of things say what you did as well as what comes next.
  showCard(title, text, tag) {
    const c = this.campaign.s, set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    set('card-title', title); set('card-text', text); set('card-tag', tag);
    set('card-stats', `${c.total} machine${c.total === 1 ? "" : "s"} kept  ·  ${this.arsenal.unlocked.size} of 5 forms  ·  ${c.voices.length} of 7 voices  ·  ${Object.keys(c.worlds).length} of 5 worlds answered`);
  }

  finishCrossing() {
    this.campaign.s.crossed = true; this.campaign.setBeat('crossed');
    this.showCard('THE CROSSING', 'Fuel from their own mine. Plating from the people they tax. Coolant from the ice they dig. The heading from those who heard us singing. Everyone on this road gave you something, and Earth has no idea you are coming.', 'CHAPTER ONE COMPLETE  ·  CHAPTER TWO IS NOT BUILT YET');
    this.state = 'complete'; this.input.clear(); this.ui.clearTransient(); this.ui.showMenu('complete'); this.input.unlock();
  }

  finishChapter() {
    progress.setChapterDone();
    this.showCard('A HANGAR FULL OF SHIPS', 'The Meridian is gone with the elder. The chart showed you the way home, a few hours out. If anyone got away, they would have gone to the wall of hands. Go and see.', 'THE HALCYON IS BEHIND YOU  ·  THE ROAD IS OPEN');
    this.state = 'complete';
    this.input.clear();
    this.ui.clearTransient();
    this.ui.showMenu('complete');
    this.input.unlock();
  }

  canFire() {
    return this.state === 'playing' && !this.paused && this.input.locked && !this.player.dead && this.weaponAcquired;
  }

  // the one light with a shadow: it follows the player, snapped to its own texels so edges never crawl
  setupSun(l, size = 58, res = 2048) {
    if (!this.canShadow) return;
    l.shadow.mapSize.set(res, res); const c = l.shadow.camera; c.left = c.bottom = -size; c.right = c.top = size; c.near = 1; c.far = 560; c.updateProjectionMatrix();
    l.shadow.bias = -0.0005; l.shadow.normalBias = 0.05; l.userData.shadowSize = size; l.userData.shadowRes = res; l.userData.keepOn = true;
  }
  aimSun(l, at, dir) {
    if (!this.canShadow) return;
    l.castShadow = this.gfx === 'realistic';
    const step = (l.userData.shadowSize * 2) / l.userData.shadowRes * 4, x = Math.round(at.x / step) * step, y = Math.round(at.y / step) * step, z = Math.round(at.z / step) * step;
    l.target.position.set(x, y, z); l.position.set(x + dir.x * 260, y + dir.y * 260, z + dir.z * 260);
    if (l.parent && l.parent !== this.scene) { l.parent.worldToLocal(l.position); l.parent.worldToLocal(l.target.position); }
    l.target.updateMatrixWorld(); l.updateMatrixWorld();
  }

  progressAdd(n) { for (let i = 0; i < n; i++) progress.addMaxHp(); this.player.maxHealth += n; }

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
    this.viewmodel.fling = Math.max(this.viewmodel.fling || 0, clamp(amount / 22, 0.22, 0.6));         // the arms come up when something hits you
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
    this.audio.tickScene(dt);
    const [lx, ly] = input.takeLook();
    this.lookX = lx; this.lookY = ly;
    if (this.flight.menuActive) { if (this.state === 'menu') this.flight.updateMenu(dt); else this.flight.hideMenu(); }
    if (this.state === 'flight') {
      // the screen shake and hit flash must keep fading in flight too (this branch returns before the normal decay below)
      this.trauma = Math.max(0, this.trauma - dt * 1.7); this.hitFlash = Math.max(0, this.hitFlash - dt * 2.2);
      this.flight.update(dt, input, this.lookX, this.lookY);
      if (this.touchUI) this.touchUI.setVisible(this.paused ? false : 'flight', null);
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
    if (this.surface.active) this.surface.update(dt);
    this.campaign.update(dt); this.campaign.updateChartLines(dt);
    this.baseHemi.visible = !(this.surface.active || this.flight.active || (this.opening.home && this.opening.home.shown));
    if (this.state === 'playing' && !this.surface.active && !(this.opening.active && this.opening.phase !== 'gas')) { this.shipLife.group.visible = true; this.shipLife.update(dt); } else if (this.shipLife) this.shipLife.group.visible = false;
    this.effects.update(dt);
    this.body.setVisible(!this.cinePose && !this.opening.hideBody && this.state !== 'dead');     // the camera ends up on the floor: your own body would fill the view
    this.body.update(dt);
    this.ui.update(dt);
    if (this.touchUI) this.touchUI.setVisible(this.paused ? false : this.state === 'flight' ? 'flight' : this.state === 'playing', this.opening.active ? this.opening.buttons() : null);
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
      if (!this.surface.active) this.encounter.update(dt);
    }
  }

  // Base camera pose (no shake) from the player or the opening.
  // The nearest machine awake and close, as a direction from the eye: the arms know it is there.
  nearestThreat(c) {
    if (this.state !== 'playing' || this.cinePose) return null;
    let best = null, bd = 196;
    for (const e of this.enemies) {
      if (!e.alive || !e.active || e.disabled) continue;
      const dx = e.pos.x - c.position.x, dz = e.pos.z - c.position.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return null;
    return (this._threat || (this._threat = new THREE.Vector3())).copy(best.hitSpheres[0].c).sub(c.position).normalize().applyQuaternion(this._tq = (this._tq || new THREE.Quaternion()).copy(c.quaternion).invert());
  }

  poseCamera() {
    const c = this.camera, p = this.player;
    if (this.cinePose) {
      const cp = this.cinePose;
      c.position.set(cp.x, cp.y, cp.z);
      if (cp.q) c.quaternion.copy(cp.q); else c.rotation.set(cp.pitch, cp.yaw, 0);       // a pose can ride a moving ship exactly, roll included
    } else {
      c.position.set(p.pos.x, p.eye, p.pos.z);
      c.rotation.set(p.pitch, p.yaw, 0);
    }
    c.updateMatrixWorld();
  }

  // Static map chunks beyond the view are not drawn at all. Far past what the fog shows, and it also hides the whole facility while you are on the
  // homeworld or in space. A mesh cannot be seen at a distance the fog has already swallowed, so this changes nothing on screen.
  cullChunks() {
    this.chunkT = (this.chunkT || 0) - 1;
    if (this.chunkT > 0) return;
    this.chunkT = 10;
    const p = this.camera.position, view = this.gfx === 'retro' ? 62 : this.touchMode ? 95 : 170;
    const list = [this.level.merged, this.run && this.run.merged];
    for (const L of list) {
      if (!L) continue;
      for (const m of L) { const s = m.geometry.boundingSphere; m.visible = s.center.distanceTo(p) - s.radius < view; }
    }
    // machines in a room you have not reached yet are behind closed doors: no need to draw their many parts until you are close
    const near = this.encounter.state === 'waiting' ? Math.min(view, 30) : view;
    for (const e of this.enemies) if (e.alive && e.group) e.group.visible = e.group.position.distanceTo(p) < near;
  }

  // GPUs only allow so many light uniforms per shader. Keep a constant number of point lights switched on: the nearest ones that are actually lit.
  // (A constant count means swapping lights never forces a shader recompile.)
  cullLights() {
    const MAX = this.maxLights;
    // lights come and go (a new run, the wreck, the boarding), so the list is refreshed regularly rather than built once
    this.lightT = (this.lightT || 0) - 1;
    if (!this.lightList || this.lightT <= 0) { this.lightT = 90; this.lightList = []; this.scene.traverse((o) => { if (o.isPointLight) this.lightList.push(o); }); }
    const p = this.camera.position;
    // a light inside a hidden group (the homeworld while on the ship, say) costs nothing and must not use up the budget
    const live = (l) => { for (let q = l.parent; q; q = q.parent) if (!q.visible) return false; return true; };
    const dist = (l) => { const e = l.matrixWorld.elements, x = e[12] - p.x, y = e[13] - p.y, z = e[14] - p.z; return x * x + y * y + z * z; };
    const rows = this.lightList.map((l) => ({ l, live: live(l), s: l.userData.keepOn ? -1e9 : (l.intensity > 0.5 ? dist(l) : 1e9 + dist(l)) }));
    rows.sort((a, b) => (a.live === b.live ? a.s - b.s : a.live ? -1 : 1));
    for (let i = 0; i < rows.length; i++) rows[i].l.visible = i < MAX;
  }

  render(dt) {
    const r = this.renderer, c = this.camera, p = this.player;
    if (!this.paused) {
      if (this.state === 'flight' || (this.state === 'menu' && this.flight.menuActive)) this.flight.pose(c); else this.poseCamera();
      if (!this.cinePose && this.state === 'playing') {
        const vm = this.viewmodel, mk = vm.moveK || 0, st = vm.stride || 0, tt = this.time;
        c.position.y += (0.5 - 0.5 * Math.cos(st * 2)) * -0.026 * mk + Math.sin(tt * 1.15) * 0.005 * (1 - Math.min(1, mk));
        c.position.x += Math.cos(p.yaw) * Math.sin(st) * 0.012 * mk; c.position.z += -Math.sin(p.yaw) * Math.sin(st) * 0.012 * mk;
        c.rotation.z += Math.sin(st) * 0.0045 * mk + Math.sin(tt * 0.61) * 0.0016;
        c.rotation.x += Math.sin(tt * 1.15 + 1) * 0.0018 * (1 - Math.min(1, mk));
      }
      // Restrained trauma-based shake applied only to the rendered view.
      const s = this.trauma * this.trauma;
      if (s > 0.0005) {
        this.shakeT += dt * 38;
        const amp = 1 + (this.shakeAmp || 0);       // cutscenes can hit a lot harder than a fight
        c.rotation.x += Math.sin(this.shakeT * 1.3) * 0.014 * s * amp;
        c.rotation.y += Math.sin(this.shakeT * 1.7 + 2) * 0.014 * s * amp;
        c.rotation.z += Math.sin(this.shakeT * 1.1 + 4) * 0.01 * s * amp;
        if (amp > 1) { c.position.x += Math.sin(this.shakeT * 2.1) * 0.035 * s * amp; c.position.y += Math.sin(this.shakeT * 2.7 + 1) * 0.035 * s * amp; }
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
        threat: this.nearestThreat(c), hurt: this.lowHealthSeverity(),
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
    this.cullChunks();
    this.cullLights();
    this.post.render(dt, this.time);
  }
}

function $(id) { return document.getElementById(id); }
