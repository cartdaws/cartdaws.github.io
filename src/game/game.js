import * as THREE from 'three';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { clamp, damp } from '../core/util.js';
import { CollisionWorld } from '../world/collision.js';
import { NavGrid } from '../world/nav.js';
import { buildLevel, ARENA, PLAYER_START, REPLAY_START } from '../world/level.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { Shardcaster } from './shardcaster.js';
import { Projectiles, raySphere } from './projectiles.js';
import { RobotBug } from './enemies/robotBug.js';
import { SentryDrone } from './enemies/sentryDrone.js';
import { Barrel } from './barrels.js';
import { Encounter, EncounterState } from './encounter.js';
import { ViewModel } from '../presentation/viewmodel.js';
import { Opening } from '../presentation/story.js';
import { UI } from '../presentation/ui.js';
import { TouchControls, isTouchDevice, enterImmersive } from '../core/touch.js';
import { PostFX } from '../presentation/post.js';
import { AlienBody } from './body.js';
import { Absorber } from './absorb.js';

const STEP = 1 / 60;
const BASE_FOV = 78;

export class Game {
  constructor(canvas, armGeos, kit, handAsset) {
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
    this.nav = new NavGrid(this.world, ARENA);
    this.waypoints = this.buildWaypoints();
    this.effects = new Effects(this.scene);
    this.audio = new Audio();
    this.ui = new UI();
    this.input = new Input(canvas);
    this.input.fake = location.search.includes('nolock');
    this.touchMode = isTouchDevice();
    if (this.touchMode) {
      this.input.touch = true;
      this.touchUI = new TouchControls(this.input, {
        onPause: () => { if (this.state === 'playing' || this.state === 'opening') this.input.unlock(); },
        onSkip: () => { if (this.state === 'opening' && !this.paused) this.opening.skip(); },
      });
    }
    this.player = new Player(this);
    this.viewmodel = new ViewModel(handAsset);
    this.body = new AlienBody(this.scene, this.world, this.player, armGeos);
    this.weapon = new Shardcaster(this);
    this.absorber = new Absorber(this);
    this.projectiles = new Projectiles(this);
    this.encounter = new Encounter(this);
    this.opening = new Opening(this);
    this.opening.resetProps();

    this.enemies = [];
    this.barrels = [];
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
    this.spawnEncounter();
    this.bind();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Menu backdrop: the containment chamber from the opening camera.
    this.opening.samplePose(0);
    this.cinePose = this.opening.pose;
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
  buildWaypoints() {
    const pts = [];
    for (let x = -12; x <= 12; x += 4) for (let z = -13; z >= -34; z -= 3.5) {
      let ok = true;
      for (const b of this.world.boxes) {
        if (b.tag === 'door' || b.minY > 4 || b.maxY < 1.6) continue;
        if (x > b.minX - 0.9 && x < b.maxX + 0.9 && z > b.minZ - 0.9 && z < b.maxZ + 0.9) { ok = false; break; }
      }
      if (ok) pts.push({ x, z });
    }
    return pts;
  }

  spawnEncounter() {
    for (const e of this.enemies) e.dispose();
    for (const b of this.barrels) b.dispose();
    this.enemies = [];
    this.barrels = [];
    for (const s of this.level.enemySpawns) {
      this.enemies.push(s.type === 'bug' ? new RobotBug(this, s.x, s.z) : new SentryDrone(this, s.x, s.z));
    }
    for (const s of this.level.barrelSpawns) this.barrels.push(new Barrel(this, s.x, s.z));
  }

  bind() {
    const ui = this.ui, input = this.input;
    $('btn-play').onclick = () => this.play();
    $('btn-resume').onclick = () => this.resume();
    $('btn-restart').onclick = () => this.restart();
    $('btn-retry').onclick = () => this.restart();
    $('btn-replay').onclick = () => this.restart();
    $('btn-intro').onclick = () => this.replayFromStart();
    for (const id of ['btn-gfx', 'btn-gfx2']) $(id).onclick = () => this.toggleGfx();
    $('set-volume').oninput = (e) => { this.audio.setVolume(+e.target.value); this.saveSettings(); };
    $('set-sens').oninput = (e) => { this.sens = +e.target.value; this.saveSettings(); };
    try {
      const s = JSON.parse(localStorage.getItem('intruder-settings') || '{}');
      if (s.volume != null) { this.audio.volume = s.volume; $('set-volume').value = s.volume; }
      if (s.sens != null) { this.sens = s.sens; $('set-sens').value = s.sens; }
    } catch (e) { /* settings are optional */ }

    input.onLockChange = (locked) => {
      if (locked) {
        this.lockRetries = 0;
        if (this.paused) this.unpause();
      } else if (this.state === 'opening' || this.state === 'playing') this.pause();
    };
    input.onLockError = () => {
      if (this.state === 'menu' || this.state === 'dead' || this.state === 'complete') return;
      if (this.lockRetries++ < 6) setTimeout(() => { if (!input.locked && this.state !== 'menu') input.lock(); }, 350);
      else if (!this.paused) this.pause();
    };
    input.onKeyDown = (code) => {
      if (this.state === 'opening' && !this.paused && (code === 'Space' || code === 'Enter')) this.opening.skip();
    };
    input.onMouseDown = (btn) => { if (btn === 0 && this.canFire()) this.weapon.latch(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden && (this.state === 'playing' || this.state === 'opening') && !this.paused) this.pause(); });
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
    this.audio.init();
    if (this.touchMode) enterImmersive();
    this.ui.hideMenus();
    this.ui.fade(1);
    this.state = 'opening';
    this.cinePose = this.opening.pose;
    this.opening.start();
    this.input.lock();
  }

  beginPlay() {
    this.state = 'playing';
    this.cinePose = null;
    this.level.emergencyOn = false;
    this.ui.showHud(true);
    this.ui.clearTransient();
    this.ui.setObjective('REACH THE HANGAR');
    if (this.touchMode) {
      this.ui.hint('LEFT THUMB — MOVE     RIGHT THUMB — LOOK', 3.5);
      this.ui.hint('FIRE · JUMP · DASH BUTTONS', 3.5);
    } else {
      this.ui.hint('WASD — MOVE', 3);
      this.ui.hint('SPACE — JUMP     SHIFT — DASH', 3.5);
      this.ui.hint('LEFT CLICK — FIRE  (HOLD TO KEEP FIRING)', 4);
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

  restart() {
    this.audio.init();
    if (this.state === 'opening') this.opening.finish(true);
    this.resetEncounter();
    this.paused = false;
    this.ui.hideMenus();
    this.lockRetries = 0;
    this.input.lock();
  }

  // Full replay: encounter, doors and props back to the beginning, then the opening plays again.
  replayFromStart() {
    this.audio.init();
    this.resetEncounter();
    this.ui.hideMenus();
    this.paused = false;
    this.cinePose = this.opening.pose;
    this.state = 'opening';
    this.opening.start();
    this.lockRetries = 0;
    this.input.lock();
  }

  resetEncounter() {
    this.projectiles.clear();
    this.effects.clear();
    this.spawnEncounter();
    this.player.reset(REPLAY_START.x, REPLAY_START.z, 0);
    this.weapon.reset();
    this.absorber.reset();
    this.viewmodel.recoil = this.viewmodel.recoilVel = this.viewmodel.pulse = 0;
    this.weaponAcquired = true;
    this.body.reset();
    this.encounter.reset();
    this.nav.forceRefresh();
    this.trauma = 0;
    this.hitFlash = this.flinch = this.hbPulse = this.hbTimer = 0;
    this.deadTimer = 0;
    this.state = 'playing';
    this.cinePose = null;
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
    this.deadTimer = 1.1;
    this.audio.play('death');
    this.audio.stopSiren();
    this.input.clear();
  }

  complete() {
    this.state = 'complete';
    this.input.clear();
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
    const killed = e.takeDamage(dmg, point);
    this.ui.hitMarker(killed);
    this.audio.play(killed ? 'kill' : 'hit', { vol: 1 });
    return killed;
  }

  onPlayerHit(enemy, dmg, point) {
    this.effects.hitSparks(point, enemy.kind === 'drone' ? [1, 0.7, 0.3] : [1, 0.8, 0.3], 9);
    this.effects.glowP.emit(point.x, point.y, point.z, 0, 0, 0, 0.1, 0.3, 0.7, 1, 1);
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
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    if (!this.paused) this.frame(dt);
    this.render(dt);
  }

  frame(dt) {
    const { input, player } = this;
    const [lx, ly] = input.takeLook();
    this.lookX = lx; this.lookY = ly;
    const live = this.state === 'playing' && !player.dead;
    if (live && input.locked) {
      player.look(lx, ly, this.sens);
      player.latch(input);
    }

    this.opening.update(dt);

    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.simulate(h);

    if (this.state === 'dead') {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0 && this.deadTimer > -1) {
        this.deadTimer = -2;
        this.ui.showMenu('dead');
        this.input.unlock();
      }
    }
    if (this.state === 'playing' && this.encounter.state === EncounterState.CLEARED && player.pos.z < -40.5) this.complete();

    this.level.update(this.time);
    this.effects.update(dt);
    this.body.setVisible(!this.cinePose);
    this.body.update(dt);
    this.ui.update(dt);
    if (this.touchUI) this.touchUI.setVisible((this.state === 'playing' || this.state === 'opening') && !this.paused);
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
    const controllable = playing && !player.dead && input.locked;
    if (this.state !== 'opening' && this.state !== 'menu') {
      player.step(dt, input, controllable);
      if (player.justDashed) { this.audio.play('dash'); this.addShake(0.06); }
    }
    this.poseCamera();
    this.weapon.step(dt, input.mouse(0), this.canFire());
    this.level.updateDoors(dt);
    this.projectiles.update(dt);
    for (const e of this.enemies) { if (e.absorbing) { e.updateFlash?.(dt); continue; } e.update(dt); }
    if (playing && !player.dead) this.absorber.update(dt);
    for (const b of this.barrels) b.update(dt);
    if (playing) {
      this.nav.setTarget(player.pos.x, player.pos.z);
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
      this.poseCamera();
      // Restrained trauma-based shake applied only to the rendered view.
      const s = this.trauma * this.trauma;
      if (s > 0.0005) {
        this.shakeT += dt * 38;
        c.rotation.x += Math.sin(this.shakeT * 1.3) * 0.014 * s;
        c.rotation.y += Math.sin(this.shakeT * 1.7 + 2) * 0.014 * s;
        c.rotation.z += Math.sin(this.shakeT * 1.1 + 4) * 0.01 * s;
      }
      if (this.flinch > 0 && !this.cinePose) { c.rotation.x -= this.flinch * 0.14; c.rotation.z += this.flinchRoll * this.flinch * 0.2; }
      const sev = this.lowHealthSeverity();
      this.post.grade.uniforms.uHurt.value = sev;
      this.post.grade.uniforms.uPulse.value = this.hbPulse;
      this.post.grade.uniforms.uHit.value = this.hitFlash;
      const dashing = p.dashing && !this.cinePose;
      this.fov = damp(this.fov, BASE_FOV + (dashing ? 5 : 0), 14, dt);
      if (Math.abs(c.fov - this.fov) > 0.01) { c.fov = this.fov; c.updateProjectionMatrix(); this.effects.setScale(r.domElement.height, c.fov); }
      c.updateMatrixWorld();
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      this.viewmodel.update(dt, {
        lookX: this.lookX, lookY: this.lookY,
        velX: p.vx * cos - p.vz * sin, velZ: -(p.vx * -sin + p.vz * -cos),
        dashing, yaw: this.cinePose ? this.cinePose.yaw : p.yaw, pitch: this.cinePose ? this.cinePose.pitch : p.pitch,
      });
      this.viewmodel.syncToCamera(c);
    }
    this.cullLights();
    this.post.render(dt, this.time);
  }
}

function $(id) { return document.getElementById(id); }
