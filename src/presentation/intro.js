import * as THREE from 'three';
import { lerp, smooth, seg, clamp, damp, easeOut } from '../core/util.js';
import { PLAYER_START, PISTOL_POS, CELL } from '../world/level.js';
import { poseHuman, seatHuman } from '../world/humans.js';
import { HomeWorld, HOME, HOME_START } from '../world/home.js';
import { save } from '../core/save.js';
import { progress } from '../game/progress.js';
import { makeHandGel } from './hand.js';

// ---------------------------------------------------------------------------------------------------------------------
// THE PLAYABLE OPENING. The player keeps control of looking (and, where it makes sense, walking); short scripted actions
// happen only where a physical animation needs them.
//
//   home      a small playable memory: look, look down at your own body, walk, approach the one who waits, reach out
//   capture   a shadow, a searchlight, a human capture collar. Unavoidable. Cuffs close on the wrists.
//   cell      awake in the research chamber: look around, test the restraint, press a hand to the glass, the trial begins
//   seam      the experiment overloads; a seam in the cell door has failed; hold to force it apart
//   escape    the breach: a security officer drops his pistol while retreating
//   pistol    absorb the pistol with a tentacle; it becomes the Shardcaster (checkpoint saved)
//   route     (not scripted) shoot the lock, jump the barrier, dash, then the existing first room and its absorb lesson
// ---------------------------------------------------------------------------------------------------------------------
const EYE = 1.55;
const CX = CELL.x, CZ = CELL.z;
const SEAM = new THREE.Vector3(CX, 1.85, CZ - 0.98);        // the cracking panel of the cell door
const GLASS = new THREE.Vector3(CX + 0.12, 1.4, CZ - 0.98);
const LOCK_POS = new THREE.Vector3(2.5, 1.25, -0.1);          // the jammed maintenance lock beside the bulkhead
const BARRIER_Z = -5.0;
const ease = (t, a, b) => smooth(seg(t, a, b));
const stage = (t, a, b, c, d) => ease(t, a, b) * (1 - ease(t, c, d));
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _l = new THREE.Vector3(), _q = new THREE.Quaternion(), _wq = new THREE.Quaternion();

export class Intro {
  constructor(game) {
    this.g = game;
    this.active = false;       // scripted phases (home .. pistol)
    this.route = false;        // after the Shardcaster: lock, barrier and the first absorb lesson
    this.phase = 'off';
    this.t = 0;                // time in the current phase
    this.moveLocked = false;
    this.hideBody = false;
    this.pressed = false;
    this.target = null;        // the maintenance lock (hit by Shardcaster bolts)
    this.pose = { x: CX, y: EYE, z: CZ, yaw: 0, pitch: 0 };   // menu backdrop: the chamber
    this.f = {};
    this.h = 0;                // hold progress
    this.granted = false;
    this.tentReset();
    this.home = new HomeWorld(game.scene, game.homeAsset, save.creature);
    this.buildCuffs();
    this.buildLock();
    this.buildBarrier();
    this.pistolMarker = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8ff5e6, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.pistolMarker.visible = false; game.scene.add(this.pistolMarker);
    this.seamMarker = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 32), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.seamMarker.position.set(SEAM.x, SEAM.y, SEAM.z - 0.02); this.seamMarker.visible = false; game.scene.add(this.seamMarker);
    this.glassPrint = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), new THREE.MeshBasicMaterial({ color: 0x9ffff0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glassPrint.position.set(GLASS.x, GLASS.y, GLASS.z + 0.01); this.glassPrint.rotation.y = Math.PI; game.scene.add(this.glassPrint);
  }

  samplePose() { /* the menu backdrop is a fixed pose */ }
  canSkip() { return this.active; }
  buttons() { return { fire: !!this.g.weaponAcquired && !this.active, jump: this.route, dash: this.route }; }
  press() { this.pressed = true; }
  tr(desktop, touch) { return this.g.touchMode ? touch : desktop; }

  // ---------------------------------------------------------------------------------------------- props
  buildCuffs() {
    const vm = this.g.viewmodel;
    this.cuffs = [];
    for (const arm of [vm.left, vm.right]) {
      const band = new THREE.Group();
      const a = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.02, 10, 24), new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: 0.45, metalness: 0.6, emissive: 0x2a1c00 }));
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.076, 0.012, 8, 24), new THREE.MeshStandardMaterial({ color: 0x20262b, roughness: 0.4, metalness: 0.8 })); b.position.z = 0.05;
      band.add(a, b); band.position.set(0, 0, 0.2); band.renderOrder = 6; band.visible = false;
      arm.root.add(band); this.cuffs.push(band);
    }
  }

  buildLock() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.4, metalness: 0.8 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.1, 10), dark); post.position.y = 0.55; g.add(post);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.3), dark); head.position.y = 1.25; g.add(head);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.32), new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: 0.5 })); stripe.position.y = 1.07; g.add(stripe);
    this.lockLens = new THREE.MeshBasicMaterial({ color: 0xff3a22 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), this.lockLens); lens.position.set(0, 1.27, 0.16); g.add(lens);
    this.lockHalo = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 32), new THREE.MeshBasicMaterial({ color: 0xff8a50, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.lockHalo.position.set(0, 1.27, 0.2); g.add(this.lockHalo);
    g.position.set(LOCK_POS.x, 0, LOCK_POS.z); g.rotation.y = -0.5; g.visible = false;
    this.g.scene.add(g);
    this.lockGroup = g;
    this.lockLight = new THREE.PointLight(0xff3a22, 0, 4, 2); this.lockLight.position.set(0, 1.3, 0.4); g.add(this.lockLight);
  }

  buildBarrier() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 32;
    const x = c.getContext('2d'); x.fillStyle = '#1b1d20'; x.fillRect(0, 0, 128, 32); x.fillStyle = '#d9a21b';
    for (let i = -32; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 32); x.lineTo(i + 16, 32); x.lineTo(i + 48, 0); x.lineTo(i + 32, 0); x.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(5, 1);
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.45, 0.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.4 })));
    const arc = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.03, 0.12), new THREE.MeshBasicMaterial({ color: 0x8ff5e6 })); arc.position.y = 0.25; grp.add(arc);
    grp.position.set(0, 0.225, BARRIER_Z); grp.visible = false;
    this.g.scene.add(grp);
    this.barrier = grp;
    this.barrierBox = null;
  }

  // the homeworld is painted in the creature's palette: rebuilt whenever the confirmed design changes
  rebuildHome() {
    const was = this.home; if (was.shown) was.show(false);
    was.dispose(); this.home = new HomeWorld(this.g.scene, this.g.homeAsset, save.creature);
  }

  // everything back to the pre-breach state
  resetProps() {
    const g = this.g, L = g.level, c = L.cut;
    c.setDoorOpen(0);
    c.cellDoor.visible = true;
    if (c.doorGlass) c.doorGlass.visible = true;
    c.crack.visible = true; c.crack.material.opacity = 0;
    c.spill.visible = false;
    c.display.power = 0.5; c.display.fieldLevel = 0.62;
    c.display.set('record');
    const s = c.scanner;
    s.carriage.position.z = -1.9; s.link.rotation.set(0, 0, 0); s.head.rotation.set(0, 0, 0); s.probe.scale.set(1, 0.12, 1);
    c.researcher.visible = true; c.researcher.position.set(7.45, 0, 8.2); c.researcher.rotation.set(0, -Math.PI / 2, 0);
    seatHuman(c.researcher, 0);
    c.officer.visible = false; c.officer.position.set(0, 0, -4.5); c.officer.rotation.set(0, Math.PI, 0); c.officer.scale.set(1, 1, 1);
    if (L.pistol.parent !== g.scene) g.scene.attach(L.pistol);
    L.pistol.visible = false; L.pistolLight.intensity = 0;
    L.pistol.scale.setScalar(1.25);
    L.pistol.position.copy(PISTOL_POS); L.pistol.position.y = 0.07; L.pistol.rotation.set(0, 0.7, 1.45);
    L.surge = 0; L.emergencyOn = false; L.alarm = false; c.sealPower = 1;
    c.evacGlow.opacity = 0;
    L.doors.containment.close(true);
    this.glassPrint.material.opacity = 0;
    this.seamMarker.visible = false; this.pistolMarker.visible = false;
    this.cellBox(true);
  }

  cellBox(on) { const b = this.g.world.boxes.find((x) => x.tag === 'cell'); if (b) b.enabled = on; }

  // ---------------------------------------------------------------------------------------------- flow
  begin(mode) {
    const g = this.g, vm = g.viewmodel, ui = g.ui;
    this.f = {}; this.h = 0; this.t = 0; this.pressed = false; this.target = null;
    this.dropT = -1; this.stride = 0; this.lastStep = -1; this.blob = null; this.parts = null; this.pistolView = null;
    this.granted = false;
    this.endRoute();
    this.resetProps();
    g.absorber.reset(); g.weapon.reset();
    vm.setPistol(null); this.tentReset();
    vm.form = 0; vm.crystal = 0; vm.frag = 0; vm.curl = 0.2; vm.reachW = 0; vm.restrain = 0; vm.restrainSlack = 0; vm.charge = 0; vm.leftHidden = false; vm.xray = 0; vm.tremor = 0;
    for (const fr of vm.right.frags) fr.k = 0;
    vm.recoil = vm.recoilVel = vm.pulse = 0;
    g.weaponAcquired = false;
    ui.clearTransient();
    ui.showHud(true);
    document.body.classList.add('intro');
    g.audio.stopSiren();
    g.projectiles.clear();
    if (mode === 'ready') { this.finish(true); return; }
    this.active = true;
    ui.showSkip(true);
    this.enter('home');
  }

  enter(phase) {
    const g = this.g, p = g.player, vm = g.viewmodel, ui = g.ui;
    this.phase = phase; this.t = 0; this.step = 0; this.stepT = 0; this.h = 0; this.f = {};
    ui.setHold(null);
    if (phase === 'home') {
      this.home.show(true);
      this.hideBody = false; this.moveLocked = true; this.lookAcc = 0; this.walkAcc = 0;
      p.reset(HOME.x + HOME_START.x, HOME.z + HOME_START.z, HOME_START.yaw);
      this.home.eState.yaw = 0; this.home.eState.reach = 0; this.home.eState.fear = 0; this.home.eState.alert = 0;
      this.home.elder.position.set(1.2, 0, -9.5);
      this.lastYaw = p.yaw; this.lastPitch = p.pitch;
      this.setObjective('');
      ui.fade(1);
    } else if (phase === 'capture') {
      this.moveLocked = false;
    } else if (phase === 'cell') {
      this.home.show(false);
      this.resetProps();
      this.cellBox(false);
      this.hideBody = true; this.moveLocked = true;
      p.reset(CX, CZ, 0);
      p.pitch = 0.0;
      vm.restrain = 1; vm.restrainSlack = 0; vm.reachW = 0; vm.tremor = 0;
      g.level.emergencyOn = true;
      this.baseYaw = 0; this.lookAcc = 0;
      ui.fade(1);
    } else if (phase === 'escape') {
      this.moveLocked = true;
    }
  }

  setObjective(t) { if (this.f._obj !== t) { this.f._obj = t; this.g.ui.setObjective(t); } }
  say(text, speaker, dur, thought = false) { this.g.ui.subtitle(text, speaker, dur, thought); if (speaker) this.g.audio.play('pa', { vol: speaker === 'SHIP AI' ? 0.7 : 0.5 }); }
  prompt(t) { this.g.ui.setPrompt(t); }
  once(key, fn) { if (!this.f[key]) { this.f[key] = true; fn(); } }

  // Hold-to-act with forgiving progress: letting go drains slowly instead of resetting. Returns true when complete.
  hold(dt, ok, dur) {
    const down = ok && this.g.input.interactDown();
    this.h = clamp(this.h + (down ? dt / dur : -dt * 1.2), 0, 1);
    this.g.ui.setHold(this.h);
    return this.h >= 1;
  }

  update(dt) {
    const g = this.g;
    if (this.route) this.updateRoute(dt);
    this.updateCuffs();
    if (!this.active) { this.pressed = false; return; }
    this.t += dt; this.stepT += dt;
    const p = g.player;
    const pressed = this.pressed; this.pressed = false;
    g.camera.updateMatrixWorld();
    switch (this.phase) {
      case 'home': this.updateHome(dt, pressed); break;
      case 'capture': this.updateCapture(dt); break;
      case 'cell': this.updateCell(dt, pressed); break;
      case 'escape': this.updateEscape(dt, pressed); break;
      case 'pistol': this.updatePistol(dt, pressed); break;
      default:
    }
    if (g.touchUI) g.touchUI.setAbsorb(!!this.actLabel, this.actLabel || 'ABSORB');
    this.actLabel = null;
  }

  updateCuffs() {
    const vm = this.g.viewmodel;
    const on = vm.restrain > 0.3;
    // the clamps close around the creature's own forearms, whatever their thickness
    this.cuffs.forEach((c, i) => { const arm = i === 0 ? vm.left : vm.right, k = 1 + 0.35 * ((arm.keys||{}).ArmThick || 0) * 0.95 - 0.3 * 0.1 * ((arm.keys||{}).UpperRatio || 0); c.visible = on; c.scale.set(k, k, 1); });
  }

  // ---------------------------------------------------------------------------------------------- 1. HOME
  updateHome(dt, pressed) {
    const g = this.g, p = g.player, vm = g.viewmodel, ui = g.ui, H = this.home, E = H.eState, t = this.t;
    ui.fade(1 - seg(t, 0, 1.6));
    H.update(dt, g.time, g.camera.position);
    // keep the memory small: an invisible boundary and personal space around the one who waits
    const cx = HOME.x, cz = HOME.z - 2;
    const dx = p.pos.x - cx, dz = p.pos.z - cz, dd = Math.hypot(dx, dz);
    if (dd > 17) { p.pos.x = cx + dx / dd * 17; p.pos.z = cz + dz / dd * 17; }
    const ex = HOME.x + H.elder.position.x, ez = HOME.z + H.elder.position.z;
    const de = Math.hypot(p.pos.x - ex, p.pos.z - ez);
    if (de < 1.15 && this.step < 7) { p.pos.x = ex + (p.pos.x - ex) / de * 1.15; p.pos.z = ez + (p.pos.z - ez) / de * 1.15; }
    this.lookAcc += Math.abs(Math.atan2(Math.sin(p.yaw - this.lastYaw), Math.cos(p.yaw - this.lastYaw))) + Math.abs(p.pitch - this.lastPitch);
    this.lastYaw = p.yaw; this.lastPitch = p.pitch;
    const dist = H.updateElder(dt, g.time, p.pos);
    H.palmWorld(_w);
    const touchHome = this.tr('', '');
    switch (this.step) {
      case 0:                        // look around
        this.moveLocked = true;
        this.prompt(this.tr('MOVE THE MOUSE TO LOOK AROUND', 'DRAG THE RIGHT SIDE TO LOOK AROUND'));
        if (t > 1.2 && (this.lookAcc > 1.6 || this.stepT > 12)) { this.step = 1; this.stepT = 0; this.prompt(''); }
        break;
      case 1:                        // look down at your own body
        this.prompt(this.tr('LOOK DOWN AT YOURSELF', 'DRAG DOWN TO LOOK AT YOURSELF'));
        if ((p.pitch < -0.85 && this.stepT > 0.4) || this.stepT > 14) {
          this.step = 2; this.stepT = 0; this.prompt('');
          this.say('My body.', '', 2.0, true);
        }
        break;
      case 2:                        // walk
        this.moveLocked = false;
        this.prompt(this.tr('W A S D  TO WALK', 'LEFT THUMB TO WALK'));
        if (!this.f.w0) { this.f.w0 = p.pos.clone(); }
        if (p.pos.distanceTo(this.f.w0) > 3.5) { this.step = 3; this.stepT = 0; this.prompt(''); this.setObjective('GO TO THE ONE WHO WAITS'); }
        break;
      case 3:                        // approach
        E.alert = 1;
        if (dist < 3.4) { this.step = 4; this.stepT = 0; }
        break;
      case 4: {                      // the elder offers a hand; hold to reach out
        E.reach = damp(E.reach, dist < 5 ? 1 : 0, 2.5, dt);
        const near = dist < 4.2 && E.reach > 0.85;
        if (near) { this.actLabel = 'REACH'; this.prompt(this.tr('HOLD RIGHT CLICK TO REACH OUT', 'HOLD THE BUTTON TO REACH OUT')); }
        else this.prompt(dist > 4.2 ? '' : '');
        const done = this.hold(dt, near, 0.9);
        // the hand lifts toward the offered palm as you hold
        this.reachAt(_w, 0.45 * this.h);
        if (done) {
          this.step = 5; this.stepT = 0; this.prompt(''); ui.setHold(null);
          g.audio.play('gel', { vol: 0.7 }); g.audio.play('crystal', { vol: 0.3 }); vm.pulseGlow(0.5); E.pulse = 1;
          this.say('Home.', '', 2.4, true);
        }
        break;
      }
      case 5:                        // contact: palms meet, the elder steps in to close the gap
        this.reachAt(_w, 0.45);
        { const want = Math.max(0, de - 1.0); if (this.f.step0 === undefined) this.f.step0 = H.elder.position.clone(); const k = Math.min(1, this.stepT / 0.9); _v.set(p.pos.x - ex, 0, p.pos.z - ez).normalize(); H.elder.position.set(this.f.step0.x + _v.x * want * 0.6 * k, 0, this.f.step0.z + _v.z * want * 0.6 * k); }
        if (this.stepT > 2.0) { this.step = 6; this.stepT = 0; this.moveLocked = false; this.f.capT = 0; g.audio.play('groan', { vol: 0.7 }); vm.reachW = 0; }
        break;
      case 6: {                      // the shadow, the searchlight, the collar
        const ct = this.f.capT += dt;
        const sx = lerp(-230, 90, ct / 7.0);
        H.ship.position.set(p.pos.x - HOME.x + sx, 48, p.pos.z - HOME.z - 2);
        H.shadow.visible = true; H.shadow.position.set(H.ship.position.x, 0.06, H.ship.position.z);
        H.shadow.material.opacity = 0.9 * ease(ct, 0.3, 1.5);
        H.hemi.intensity = lerp(1.15, 0.5, ease(ct, 1.2, 4)); H.sun.intensity = lerp(0.9, 0.25, ease(ct, 1.2, 4));
        this.home.fog.color.lerpColors(new THREE.Color(0x1d3a56), new THREE.Color(0x3a1a22), ease(ct, 1.5, 4));
        E.fear = ease(ct, 0.9, 1.8); E.reach = Math.max(0, E.reach - dt * 1.2);
        if (ct > 1.4) { const back = 1.6 * dt * ease(ct, 1.4, 2.4); _v.set(ex - p.pos.x, 0, ez - p.pos.z).normalize(); H.elder.position.x += _v.x * back; H.elder.position.z += _v.z * back; }
        // searchlight
        const shipW = _w.set(H.ship.position.x + HOME.x, 46, H.ship.position.z + HOME.z);
        if (ct > 1.8) {
          H.spot.visible = true; H.spot.intensity = 700 * ease(ct, 1.8, 2.6);
          H.spot.position.copy(shipW);
          this.f.aim = this.f.aim || p.pos.clone().add(_v.set(8, 0, 0));
          this.f.aim.lerp(_l.set(p.pos.x, 0, p.pos.z), 1 - Math.exp(-(1.2 + ct * 0.4) * dt));
          H.spot.target.position.copy(this.f.aim);
          H.cone.visible = true; H.cone.material.opacity = 0.05 * ease(ct, 1.8, 2.8);
          H.cone.position.copy(shipW);
          const dir = _v.subVectors(this.f.aim, shipW); const len = dir.length();
          H.cone.scale.set(1, len, 1); H.cone.quaternion.setFromUnitVectors(_l.set(0, -1, 0), dir.normalize());
        }
        this.once('s1', () => g.audio.play('groan', { vol: 0.8 }));
        if (ct > 1.8) this.once('s2', () => { g.audio.play('alert', { vol: 0.5 }); this.say('No...', '', 1.8, true); });
        // the collar: the searchlight finds you and the device comes down. You can still look, but not run.
        if (ct > 3.6) {
          this.moveLocked = true;
          H.collar.visible = true;
          const k = ease(ct, 3.6, 4.7);
          H.collar.position.set(p.pos.x - HOME.x, lerp(5.5, 1.1, k), p.pos.z - HOME.z);
          H.clamps.forEach((c) => { c.pivot.rotation.x = (1 - ease(ct, 4.4, 5.0)) * 0.9; });
          this.once('c1', () => g.audio.play('lockdown', { vol: 0.5 }));
          vm.restrain = ease(ct, 4.6, 5.2); vm.restrainSlack = 0;
        }
        if (ct > 4.6 && !this.f.clamp) { this.f.clamp = true; g.audio.play('door', { vol: 0.9 }); g.audio.play('clatter', { vol: 0.5 }); }
        // the hum carries across the cut: fade out, then in the chamber
        if (ct > 5.6) ui.fade(ease(ct, 5.6, 6.5));
        if (ct > 6.6) this.enter('cell');
        break;
      }
      default:
    }
    p.pitch = clamp(p.pitch, -1.5, 1.2);
  }

  // The right hand reaches toward a world point, only as far as an arm can.
  reachAt(worldPoint, w) {
    const vm = this.g.viewmodel;
    vm.reachTarget.copy(this.g.camera.worldToLocal(_l.copy(worldPoint)));
    vm.reachW = w;
  }

  // ---------------------------------------------------------------------------------------------- 2. CELL
  updateCell(dt, pressed) {
    const g = this.g, p = g.player, vm = g.viewmodel, ui = g.ui, L = g.level, c = L.cut, t = this.t;
    this.keepSeated(dt);
    ui.fade(1 - seg(t, 0, 1.4));
    // look freely, inside what the restraint allows
    p.yaw = clamp(p.yaw, -1.35, 1.35); p.pitch = clamp(p.pitch, -0.75, 0.9);
    p.pos.set(CX, 0, CZ);
    this.lookAcc = (this.lookAcc || 0) + Math.abs(p.yaw - (this.lastYaw ?? 0)); this.lastYaw = p.yaw;
    const input = g.input;
    const wantsMove = input.down('KeyW') || input.down('KeyA') || input.down('KeyS') || input.down('KeyD') || input.down('ArrowUp') || Math.abs(input.axisX) > 0.3 || Math.abs(input.axisY) > 0.3;
    if (c.display.mode === 'orbit' && Math.floor(g.time * 8) !== this.f.dr) { this.f.dr = Math.floor(g.time * 8); c.display.draw(g.time); }
    const strain = this.f.strainT ? clamp(this.f.strainT, 0, 1) : 0;
    if (this.f.strainT > 0) { this.f.strainT -= dt * 0.9; vm.tremor = Math.max(vm.tremor, 0.7 * this.f.strainT); }
    switch (this.step) {
      case 0:
        this.once('l1', () => this.say('Specimen nine is conscious. Starting trial twenty-seven.', 'RESEARCHER', 3.6));
        this.once('thought', () => this.say('Where... am I?', '', 2.6, true));
        if (t > 3.4) { this.step = 1; this.stepT = 0; this.setObjective('LOOK AROUND'); }
        break;
      case 1:
        this.prompt(this.tr('MOVE THE MOUSE TO LOOK AROUND', 'DRAG THE RIGHT SIDE TO LOOK AROUND'));
        if (this.lookAcc > 1.0 || this.stepT > 9) { this.step = 2; this.stepT = 0; this.prompt(''); this.setObjective('TRY TO MOVE'); }
        break;
      case 2:
        this.prompt(this.tr('TRY TO WALK  (W A S D)', 'TRY TO WALK  (LEFT THUMB)'));
        if (wantsMove || this.stepT > 10) {
          this.step = 3; this.stepT = 0; this.prompt('');
          this.f.strainT = 1; g.audio.play('clatter', { vol: 0.6 }); g.addShake(0.05); vm.pulseGlow(0.3);
          this.say('I cannot move.', '', 2.4, true);
        }
        break;
      case 3: {                      // press a hand against the glass
        if (this.stepT < 2.2) break;
        this.setObjective('PRESS YOUR HAND TO THE GLASS');
        this.actLabel = 'PRESS';
        this.prompt(this.tr('HOLD RIGHT CLICK: PRESS YOUR HAND TO THE GLASS', 'HOLD THE BUTTON: PRESS YOUR HAND TO THE GLASS'));
        const done = this.hold(dt, true, 0.8);
        this.reachAt(GLASS, 0.75 * this.h);
        if (done) {
          this.step = 4; this.stepT = 0; this.prompt(''); ui.setHold(null); vm.reachW = 0.75;
          g.audio.play('gel', { vol: 0.8 }); vm.pulseGlow(0.5);
          this.f.print = 0; this.f.scT = 0;
          this.say('It is responding. Bring the probe in.', 'RESEARCHER', 3.2);
          c.display.set('orbit');
        }
        break;
      }
      case 4: {                      // the trial: handprint on the glass, scanner closes on you
        this.f.print += dt;
        this.glassPrint.material.opacity = 0.75 * Math.max(0, 1 - this.f.print / 5);
        this.reachAt(GLASS, 0.75 * (1 - ease(this.stepT, 1.2, 2.0)));
        const sc = this.f.scT += dt;
        this.scanner(sc, 0);
        this.once('servo', () => g.audio.play('servo', { vol: 0.6 }));
        if (sc > 2.4) this.once('scan', () => g.audio.play('scan', { vol: 0.7 }));
        if (sc > 3.2) this.once('l3', () => this.say('Look at that. It is reading the machine.', 'RESEARCHER', 2.8));
        this.setObjective('');
        if (sc > 5.8) { this.step = 5; this.stepT = 0; this.f.ou = 0; }
        break;
      }
      case 5: {                      // the experiment overloads, the seal fails, a seam opens
        const ou = this.f.ou += dt;
        this.scanner(this.f.scT + ou, ou);
        this.overload(ou, dt);
        if (ou > 4.4) { this.step = 6; this.stepT = 0; this.h = 0; this.f.sm = 0; this.seamMarker.visible = true; }
        break;
      }
      case 6: {                      // hold to force the seam apart
        const ou = this.f.ou += dt;
        this.scanner(this.f.scT + ou, ou); this.overload(ou, dt);
        this.setObjective('BREAK FREE');
        _v.copy(SEAM).sub(g.camera.position).normalize(); g.camera.getWorldDirection(_w);
        const facing = _v.dot(_w) > 0.55;
        this.seamMarker.material.opacity = 0.5 + 0.4 * Math.sin(g.time * 6);
        this.seamMarker.scale.setScalar(1 + this.h * 0.4);
        this.seamMarker.lookAt(g.camera.position);
        this.actLabel = facing ? 'FORCE' : null;
        this.prompt(facing ? this.tr('HOLD RIGHT CLICK: FORCE THE SEAM APART', 'HOLD THE BUTTON: FORCE THE SEAM APART') : 'LOOK AT THE CRACKED DOOR');
        const done = this.hold(dt, facing, 1.7);
        // bracing: the wrists strain at the cuffs, the seam widens, sparks leap from the weakened joint
        vm.restrainSlack = 0.5 * this.h; vm.tremor = Math.max(vm.tremor, this.h * 0.9);
        if (facing) this.reachAt(SEAM, 0.55 * this.h); else vm.reachW = damp(vm.reachW, 0, 8, dt);
        c.crack.material.opacity = 0.65 + 0.35 * this.h;
        if (this.h > 0.05 && Math.random() < dt * 14) g.effects.glowP.emit(SEAM.x + (Math.random() - 0.5) * 0.5, SEAM.y + (Math.random() - 0.5) * 1.4, SEAM.z, (Math.random() - 0.5) * 2, Math.random() * 1.5, -0.5 - Math.random() * 2, 0.4, 0.04, 1, 0.75, 0.35, 8, 0.4);
        if (this.h > 0.1) this.once('strain1', () => g.audio.play('groan', { vol: 0.6 }));
        if (done) this.breakFree();
        break;
      }
      default:
    }
  }

  // The researcher keeps working at the console (typing), the display shows the specimen record.
  keepSeated(dt) {
    const R = this.g.level.cut.researcher;
    if (this.f.ru === undefined) seatHuman(R, this.g.time, 0.1 + 0.05 * Math.sin(this.g.time * 0.7));
  }

  scanner(sc, ou) {
    const s = this.g.level.cut.scanner;
    s.carriage.position.z = lerp(-1.9, 1.5, ease(sc, 0, 2.2));
    const reach = stage(sc, 2.4, 3.4, 4.4, 5.6);
    let alpha = 0.5 * reach, beta = -0.7 * reach, probe = 0.12 + 0.68 * reach;
    if (ou > 0 && ou < 2.6) alpha += 0.012 * Math.sin(ou * 40) * ease(ou, 0, 2);
    if (ou > 2.6) { const k = ease(ou, 2.6, 4.2); alpha = lerp(alpha, 0.2 + 0.05 * Math.sin(ou * 1.3), k); beta = lerp(beta, -0.5, k); probe = lerp(probe, 0.3, k); }
    s.link.rotation.x = alpha; s.head.rotation.x = beta; s.probe.scale.y = Math.max(0.05, probe);
  }

  overload(ou, dt) {
    const g = this.g, c = g.level.cut, L = g.level, vm = g.viewmodel, R = c.researcher, a = g.audio;
    this.once('pw', () => { this.say('Scanner to full power.', 'RESEARCHER', 2.0); a.play('servo', { vol: 0.5 }); c.display.set('warning'); a.play('alert', { vol: 0.5 }); });
    if (ou < 2.6) {
      const surge = ease(ou, 0.3, 2.4);
      L.surge = surge * 0.9; c.display.power = lerp(0.5, 0.99, surge); c.display.fieldLevel = lerp(0.62, 0.22, ease(ou, 0.6, 2.4)); vm.charge = surge * 0.8;
      this.once('sg', () => { if (ou > 1.2) a.play('surge', { vol: 0.8 }); });
      if (ou > 1.2) this.once('sg2', () => a.play('surge', { vol: 0.8 }));
    }
    if (ou > 2.2) this.once('sp', () => {
      a.play('spark', { vol: 1 }); g.addShake(0.15);
      const p = new THREE.Vector3(CX - 0.7, 3.28, CZ - 0.9);
      for (let i = 0; i < 46; i++) g.effects.glowP.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 3, Math.random() * 2.5 - 2.2, (Math.random() - 0.5) * 3, 0.5 + Math.random() * 0.6, 0.04 + Math.random() * 0.04, 1, 0.8, 0.4, 9, 0.8);
      g.effects.flashLight(p, 0xffc070, 120, 0.4);
    });
    if (ou > 2.6) {
      this.once('sd', () => { a.play('powerdown', { vol: 1 }); a.play('alert', { vol: 0.7 }); L.emergencyOn = true; this.say('The seal is losing power! Cut the trial!', 'RESEARCHER', 2.8); });
      c.sealPower = 1 - ease(ou, 2.6, 4.0); L.surge = 0; vm.charge = lerp(0.8, 0.25, ease(ou, 2.6, 4.2));
      c.display.fieldLevel = lerp(0.22, 0.03, ease(ou, 2.6, 4.6));
      if (Math.floor(g.time * 10) !== this.f.wd) { this.f.wd = Math.floor(g.time * 10); c.display.time = g.time; c.display.draw(g.time); }
    }
    if (ou > 3.6) { this.once('sf', () => this.say('Shutdown is not responding!', 'RESEARCHER', 2.4)); }
    // the seam: a crack crawls across the door panel
    if (ou > 3.4) { this.once('cr', () => { a.play('crack', { vol: 0.8 }); c.display.set('breach'); }); c.crack.material.opacity = Math.max(c.crack.material.opacity, 0.65 * ease(ou, 3.4, 4.4) * (0.85 + 0.15 * Math.sin(ou * 40))); }
    // the researcher stands, slaps the shutdown, runs for the monitoring room's door
    if (ou < 2.4) seatHuman(R, g.time, 0.1);
    else if (ou < 5.2) {
      const k = ease(ou, 2.4, 3.2);
      R.position.set(7.45 + 0.1 * k, -0.2 * (1 - k), 8.2); R.rotation.set(0, -Math.PI / 2, 0);
      poseHuman(R, 0, 0, lerp(0.1, 0.0, k), 0);
      R.userData.legL.rotation.x = -1.5 * (1 - k); R.userData.legR.rotation.x = -1.5 * (1 - k);
      const hit = stage(ou, 3.6, 3.85, 4.1, 4.5);
      R.userData.armR.rotation.x = -0.4 - 1.1 * hit; R.userData.armL.rotation.x = -0.2;
      if (ou > 3.7) this.once('hit', () => a.play('clatter', { vol: 0.5 }));
    } else {
      const pts = [[7.55, 8.2], [7.4, 5.5], [14.3, 5.0], [14.8, 3.0]];
      const lens = [0, 1, 2].map((i) => Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])), total = lens[0] + lens[1] + lens[2];
      const at = (d) => { d = Math.min(total, d); let i = 0; while (i < 2 && d > lens[i]) { d -= lens[i]; i++; } const u = d / lens[i]; return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)]; };
      const d = Math.max(0, (ou - 5.2) / 3.4) * total, p0 = at(d), q0 = at(d + 0.3);
      R.visible = d < total - 0.1;
      R.position.set(p0[0], 0, p0[1]); R.rotation.y = Math.atan2(-(q0[0] - p0[0]), -(q0[1] - p0[1]));
      poseHuman(R, d / 0.95 * Math.PI, 1, 0.16, 0);
    }
  }

  breakFree() {
    const g = this.g, c = g.level.cut, vm = g.viewmodel, a = g.audio;
    this.prompt(''); g.ui.setHold(null); this.seamMarker.visible = false;
    c.crack.visible = false; c.crack.material.opacity = 0;
    if (c.doorGlass) c.doorGlass.visible = false;
    c.spill.visible = true;
    a.play('shatter', { vol: 1 }); a.play('crack', { vol: 0.8 }); g.addShake(0.12);
    const p = new THREE.Vector3(CX - 0.05, 1.7, CZ - 1.1);
    for (let i = 0; i < 36; i++) g.effects.glowP.emit(p.x + (Math.random() - 0.5), p.y + (Math.random() - 0.5) * 2.4, p.z, (Math.random() - 0.5) * 5, Math.random() * 3 - 0.5, -1.5 - Math.random() * 5, 0.6 + Math.random() * 0.6, 0.02 + Math.random() * 0.025, 0.75, 0.92, 1, 9, 0.6);
    g.effects.flashLight(p, 0xbfe8ff, 35, 0.25);
    a.startSiren();
    vm.reachW = 0; vm.charge = 0;
    c.display.power = 0.2; c.display.fieldLevel = 0.03; c.display.set('breach');
    this.phase = 'escape'; this.t = 0; this.step = 0; this.stepT = 0; Object.assign(this.f, { os: 0, walk: 0, door: 0, ru: 1 });
    this.moveLocked = true;   // a short, scripted step out of the cell: its volume is only opened for this
    this.setObjective('GET OUT OF THE CHAMBER');
    this.say('Containment breach, Specimen Bay Three. Security response engaged.', 'SHIP AI', 3.8);
  }

  // ---------------------------------------------------------------------------------------------- 3. ESCAPE
  updateEscape(dt, pressed) {
    const g = this.g, p = g.player, vm = g.viewmodel, c = g.level.cut, L = g.level, a = g.audio, f = this.f;
    f.os += dt;
    const os = f.os;
    // the cuffs open, the door swings out and the way is clear
    vm.restrain = Math.max(0, 1 - os / 0.6); vm.restrainSlack = 1; vm.tremor = Math.max(0, 0.9 - os * 0.25);
    if (f.door < 1) f.door = Math.min(1, f.door + dt / 1.1);
    c.setDoorOpen(1.75 * smooth(f.door) + 0.05 * Math.sin(smooth(f.door) * Math.PI) * (1 - smooth(f.door)));
    f.ou += dt; this.scanner(f.scT + f.ou, f.ou); if (f.ou < 9.5) this.overload(f.ou, dt);
    // a short walk out of the cell volume, with control of the camera throughout
    if (os < 1.5) {
      this.moveLocked = true;
      const k = ease(os, 0.4, 1.5);
      p.pos.set(lerp(CX, CX + 0.15, k), 0, lerp(CZ, CZ - 2.35, k));
      p.pitch = damp(p.pitch, 0, 3, dt);
    } else if (!f.free) {
      f.free = true; this.cellBox(true);
    }
    this.officer(os, dt);
    if (os >= 1.5) this.moveLocked = !f.landed;      // held in place (the camera stays free) until the officer's pistol comes to rest
    // the dropped pistol appears once it comes to rest
    if (f.landed && this.phase === 'escape') { this.phase = 'pistol'; this.t = 0; this.step = 0; this.stepT = 0; this.h = 0; this.f.os = os; this.f.landed = true; this.setObjective('ABSORB THE DROPPED PISTOL'); }
    this.finishEscapeLines(os);
  }

  finishEscapeLines(os) {
    const g = this.g;
    if (os > 1.0) this.once('aiOpen', () => { g.level.doors.containment.open(); g.audio.play('door', { vol: 0.9 }); });
    if (os > 3.0) this.once('l5', () => this.say('It is out! Seal the bulkhead!', 'SECURITY', 2.3));
    if (os > 3.5) this.once('shut', () => { this.f.shutCmd = true; g.level.doors.containment.close(); g.audio.play('door', { vol: 1 }); });
  }

  officer(os, dt) {
    const g = this.g, c = g.level.cut, O = c.officer, L = g.level, a = g.audio, f = this.f;
    const door = L.doors.containment, T = { open: 1.0, aim: 2.8 };
    const DOOR_Z = door.mesh.position.z;                               // he stands in the doorway the door is about to close on
    if (os >= T.open && !f.crushedAt) {
      O.visible = true; O.rotation.y = Math.PI;
      if (!f.pistolOn) { f.pistolOn = true; L.pistol.visible = true; O.userData.hand.add(L.pistol); L.pistol.position.set(0, 0, -0.02); L.pistol.rotation.set(-1.45, 0, 0); L.pistol.scale.setScalar(1.25); }
      if (os < T.aim) {
        const k = seg(os, T.open + 0.3, T.aim), z = lerp(-4.6, DOOR_Z, smooth(k));
        this.stride += Math.abs(z - O.position.z) / 0.85;
        O.position.set(0, 0, z);
        poseHuman(O, this.stride * Math.PI, k < 1 ? 1 : 0, 0.1, 0);
        O.userData.armR.rotation.x = -0.5 - 1.0 * k;
        if (k > 0 && k < 1 && Math.floor(this.stride) !== this.lastStep) { this.lastStep = Math.floor(this.stride); a.play('step', { vol: 0.4 }); }
      } else if (!f.struck) {
        O.position.set(0, 0, DOOR_Z); poseHuman(O, 0, 0, 0.05, 0);
        O.userData.armR.rotation.x = -1.57; O.userData.armL.rotation.x = -1.35; O.userData.armL.rotation.z = 0.25;
      }
      // the guillotine door comes down on him: his height is pinned to the door's lower edge
      const bottom = (1 - door.closeness) * door.h;
      if (f.shutCmd && door.target === 1 && bottom < 1.85) {
        const sq = Math.max(0.05, bottom / 1.85);
        if (!f.struck) {
          f.struck = true; L.pistol.updateMatrixWorld(true);
          this.pFrom = L.pistol.getWorldPosition(new THREE.Vector3());
          g.scene.attach(L.pistol); this.dropT = 0;            // thrown clear as he goes down
          a.play('clatter', { vol: 0.9 }); a.play('land', { vol: 0.9 }); g.addShake(0.14); g.effects.hitSparks(this.pFrom, [1, 0.8, 0.4], 14);
          O.userData.armR.rotation.x = -2.6; O.userData.armL.rotation.x = -2.2;
        }
        O.scale.set(1 + (1 - sq) * 0.45, sq, 1 + (1 - sq) * 0.3);
        if (door.closeness >= 1 && !f.crushedAt) { f.crushedAt = os; a.play('crack', { vol: 0.6 }); g.addShake(0.1); }
      }
    }
    if (f.crushedAt && os > f.crushedAt + 0.9) { O.visible = false; O.scale.set(1, 1, 1); }
    if (this.dropT >= 0) {
      this.dropT += dt;
      const land = new THREE.Vector3(PISTOL_POS.x - 0.2, 0.07, PISTOL_POS.z - 0.35);
      const k = Math.min(1, this.dropT / 1.0);
      L.pistol.position.lerpVectors(this.pFrom, land, 1 - Math.pow(1 - k, 1.6));
      L.pistol.position.y = lerp(this.pFrom.y, 0.07, k * k) + Math.sin(k * Math.PI) * 0.8;
      L.pistol.rotation.set(-1.45 + k * 9, 0.7 * k, 1.45 * k);
      if (!f.bounce && k >= 1) { f.bounce = true; a.play('land', { vol: 0.6 }); a.play('clatter', { vol: 0.4 }); }
      if (k >= 1) {
        const s = Math.min(1, (this.dropT - 1.0) / 0.45);
        L.pistol.position.set(lerp(land.x, PISTOL_POS.x, easeOut(s)), 0.07, lerp(land.z, PISTOL_POS.z, easeOut(s)));
        L.pistol.rotation.set(0, 0.7, 1.45);
        if (s >= 1) { this.dropT = -1; L.pistolLight.intensity = 5; f.landed = true; }
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- 4. THE PISTOL
  updatePistol(dt, pressed) {
    const g = this.g, p = g.player, vm = g.viewmodel, L = g.level, a = g.audio, f = this.f;
    f.os += dt;
    this.officer(f.os, dt);
    this.moveLocked = this.step >= 1;
    vm.restrain = 0;
    if (f.ou < 9.5) { f.ou += dt; this.scanner(f.scT + f.ou, f.ou); this.overload(f.ou, dt); }
    if (this.step === 0) {
      vm.tremor = 0.9;
      // free to move: walk to the pistol and absorb it with one press
      this.pistolMarker.visible = true;
      this.pistolMarker.position.set(PISTOL_POS.x, 0.04, PISTOL_POS.z);
      const s = 1 + 0.12 * Math.sin(g.time * 5); this.pistolMarker.scale.set(s, 1, s);
      _v.set(PISTOL_POS.x - p.pos.x, 0, PISTOL_POS.z - p.pos.z); const dist = _v.length();
      g.camera.getWorldDirection(_w);
      const toward = _v.clone().normalize().dot(_w.set(_w.x, 0, _w.z).normalize());
      if (dist < 2.8) {
        this.actLabel = 'ABSORB';
        this.prompt(this.tr('RIGHT CLICK TO ABSORB THE PISTOL', 'TAP ABSORB'));
        if (pressed || g.input.interactDown()) { this.step = 1; this.stepT = 0; this.prompt(''); this.pistolMarker.visible = false; this.f.pa = 0; this.f.reachedPistol = false; a.play('servo', { vol: 0.3 }); }
      } else this.prompt('');
      return;
    }
    // a gentle assist: the camera eases toward the weapon, only as far as needed, and never fully down
    if (this.f.pa < 2.6) {
      let d = Math.atan2(-(PISTOL_POS.x - p.pos.x), -(PISTOL_POS.z - p.pos.z)) - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > 0.45) p.yaw += (d - Math.sign(d) * 0.45) * Math.min(1, dt * 2.2);
      if (p.pitch > -0.3) p.pitch += (-0.3 - p.pitch) * Math.min(1, dt * 1.6);
    }
    // ---- absorb: the same biological process as an enemy: a tentacle reaches, wraps, pulls the weapon in; it is assimilated
    const pa = this.f.pa += dt;
    const T = { reach: 0.0, contact: 0.8, envelop: 0.9, pull: 1.9, breakApart: 2.0, realign: 3.4, form: 4.2, settle: 5.0 };
    g.camera.updateMatrixWorld();
    if (!this.f.pLoc) { this.f.pLoc = true; this.pistolLocal = new THREE.Vector3(); }
    if (pa < T.contact || !this.pistolView) {
      L.pistol.updateMatrixWorld(true);
      this.pistolLocal.copy(L.pistol.getWorldPosition(_w)); g.camera.worldToLocal(this.pistolLocal);
      this.pistolQuat = g.camera.quaternion.clone().invert().multiply(L.pistol.getWorldQuaternion(new THREE.Quaternion()));
    }
    vm.leftHidden = true;
    const gl = this.tentGoal, gone = ease(pa, T.breakApart - 0.3, T.breakApart + 0.5);
    gl.C.copy(this.pistolView ? this.pistolView.position : this.pistolLocal);
    gl.rho = 0.1; gl.phi0 = 0.6;
    gl.extend = ease(pa, T.reach, T.contact) * (1 - gone);
    gl.wrap = ease(pa, T.contact - 0.1, T.contact + 0.7) * (1 - gone);
    vm.reachTarget.copy(this.pistolView ? this.pistolView.position : this.pistolLocal);
    vm.reachW = 0.5 * ease(pa, 0, T.contact) * (1 - ease(pa, T.envelop, T.pull)) + 0.6 * ease(pa, T.pull - 0.3, T.pull + 0.4) * (1 - ease(pa, T.settle - 0.3, T.settle + 0.8));
    vm.curl = pa < T.envelop ? lerp(0.15, 0.25, ease(pa, 0, T.contact)) : lerp(0.25, 1, ease(pa, T.envelop, T.envelop + 0.8)) * (1 - ease(pa, T.form - 0.2, T.form + 0.9));
    if (pa >= T.contact) this.once('touch', () => {
      L.pistol.visible = false; L.pistolLight.intensity = 0;
      this.pistolView = this.makeViewPistol();
      this.pistolView.position.copy(this.pistolLocal); this.pistolView.quaternion.copy(this.pistolQuat);
      vm.setPistol(this.pistolView);
      this.blob = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), this.blobGel || (this.blobGel = this.makeBlobGel()));
      this.blob.renderOrder = 6; this.blob.frustumCulled = false; vm.root.add(this.blob);
      for (const fr of vm.right.frags) fr.k = 0;
      a.play('gel', { vol: 0.9 }); vm.pulseGlow(0.45);
    });
    if (this.pistolView && !this.parts) {
      const k = ease(pa, T.envelop, T.pull);
      const target = vm.root.worldToLocal(_l.set(0, 0, -0.05).applyMatrix4(vm.right.root.matrixWorld).clone());
      this.pistolView.position.lerpVectors(this.pistolLocal, target, k);
      this.pistolView.scale.setScalar(1.25 * lerp(1, 0.8, k));
      const qt = vm.right.root.getWorldQuaternion(_wq).premultiply(_q.copy(vm.root.getWorldQuaternion(new THREE.Quaternion())).invert());
      this.pistolView.quaternion.slerp(qt, k * 0.6);
      const grow = ease(pa, T.contact, T.envelop + 0.5), wob = 1 + 0.05 * Math.sin(pa * 9);
      this.blob.quaternion.copy(this.pistolView.quaternion);
      this.blob.position.copy(this.pistolView.position).add(_l.set(0, 0, -0.06).applyQuaternion(this.pistolView.quaternion));
      this.blob.scale.set(0.085 * wob, 0.08, 0.17).multiplyScalar((0.3 + 0.7 * grow) * lerp(1, 0.8, k));
      if (!this.f.gulp && k > 0.55) { this.f.gulp = true; a.play('swallow', { vol: 0.9 }); vm.pulseGlow(0.6); }
    }
    vm.xray = stage(pa, T.envelop + 0.2, T.envelop + 1.0, T.form, T.form + 1.4);
    if (pa >= T.breakApart && !this.parts && this.pistolView) {
      a.play('absorb', { vol: 0.8 });
      if (this.blob) { vm.root.remove(this.blob); this.blob.geometry.dispose(); this.blob = null; }
      this.parts = this.pistolView.userData.parts.map((pp, i) => { vm.right.tip.attach(pp); return { p: pp, p0: pp.position.clone(), q0: pp.quaternion.clone(), s0: pp.scale.clone(), i, t0: T.breakApart + i * 0.28, dur: 1.2 }; });
      vm.frag = 1;
    }
    if (this.parts) {
      let bulge = 0;
      for (const d of this.parts) {
        const u = seg(pa, d.t0, d.t0 + d.dur), fr = vm.right.frags[d.i];
        if (u <= 0) continue;
        if (u < 1) {
          const w = ease(u, 0, 0.35), run = ease(u, 0.3, 1.0);
          const pt = new THREE.Vector3().lerpVectors(d.p0, new THREE.Vector3(0, 0, -0.01), w);
          const ang = run * 5.5 + d.i;
          pt.lerp(new THREE.Vector3(Math.cos(ang) * 0.02, Math.sin(ang) * 0.02, fr.sp.z), run);
          d.p.position.copy(pt); d.p.quaternion.slerpQuaternions(d.q0, fr.sq, run);
          d.p.scale.copy(d.s0).multiplyScalar(lerp(1, 0.55, w) * (1 - 0.35 * run));
          bulge = Math.max(bulge, Math.sin(run * Math.PI) * 0.9);
        } else if (d.p.visible) { d.p.visible = false; fr.k = 1; vm.pulseGlow(0.2); }
      }
      vm.bulge = bulge;
      vm.right.frags.forEach((fr, i) => { if (i >= 5) fr.k = ease(pa, T.breakApart + 1.0 + (i - 5) * 0.2, T.breakApart + 2.0 + (i - 5) * 0.2); });
    }
    if (pa >= T.realign) this.once('realign', () => a.play('crystal', { vol: 0.9 }));
    if (pa >= T.breakApart) vm.crystal = ease(pa, T.realign, T.form);
    if (pa >= T.realign + 0.5) this.once('learn', () => this.say('It learns. It becomes.', '', 2.6, true));
    if (pa >= T.form) {
      this.once('fs', () => a.play('gel', { vol: 0.8 }));
      const fk = ease(pa, T.form, T.settle);
      vm.form = fk + 0.06 * Math.sin(fk * Math.PI);
      if (pa < T.settle) vm.pulse = Math.max(vm.pulse, 0.2);
      vm.charge = 0;
    }
    // an unsteady hand that steadies as the energy settles
    vm.tremor = 0.9 * (1 - ease(pa, T.envelop + 0.8, T.form + 0.8));
    if (pa >= T.settle + 0.6) this.completePistol();
  }

  makeBlobGel() { return this.gel || (this.gel = makeHandGel({ color: 0x118078, rim: 0xb8fff4, alpha: 0.62 })); }
  tentReset() { const vm = this.g.viewmodel; vm.tremor = 0; this.tentGoal = { C: new THREE.Vector3(), rho: 0, phi0: 0, extend: 0, wrap: 0 }; }

  makeViewPistol() {
    const L = this.g.level, grp = new THREE.Group(), parts = [];
    for (const p of L.pistol.userData.parts) { const m = new THREE.Mesh(p.geometry, p.material); m.position.copy(p.position); grp.add(m); parts.push(m); }
    grp.scale.setScalar(1.25); grp.userData.parts = parts;
    return grp;
  }

  // The Shardcaster exists. Checkpoint, HUD, and the walk to the first room begins.
  completePistol() {
    const g = this.g, vm = g.viewmodel;
    if (this.parts) for (const d of this.parts) d.p.removeFromParent();
    if (this.blob) { vm.root.remove(this.blob); this.blob = null; }
    vm.setPistol(null); this.tentReset();
    this.parts = null; this.pistolView = null;
    this.setReadyArm();
    g.ui.clearSubtitle(); g.ui.setHold(null);
    this.enterRoute(false);
  }

  setReadyArm() {
    const vm = this.g.viewmodel;
    vm.form = 1; vm.crystal = 1; vm.frag = 1; vm.curl = 0; vm.reachW = 0; vm.restrain = 0; vm.restrainSlack = 1; vm.charge = 0; vm.leftHidden = false; vm.xray = 0; vm.tremor = 0; vm.bulge = 0;
    for (const fr of vm.right.frags) fr.k = 1;
    vm.recoil = vm.recoilVel = 0;
  }

  // ---------------------------------------------------------------------------------------------- 5. ROUTE
  // The state shared by "finished the pistol" and "skipped": cell broken, pistol assimilated, bulkhead jammed shut.
  enterRoute(skipped) {
    const g = this.g, L = g.level, c = L.cut;
    this.active = false; this.route = true; this.phase = 'route';
    this.moveLocked = false; this.hideBody = false;
    document.body.classList.remove('intro');
    g.ui.showSkip(false); g.ui.setHold(null); g.ui.fade(0);
    this.home.show(false);
    // the breach has happened and stays that way
    c.setDoorOpen(1.75);
    if (c.doorGlass) c.doorGlass.visible = false;
    c.crack.visible = false; c.crack.material.opacity = 0; c.spill.visible = true;
    c.display.power = 0.2; c.display.fieldLevel = 0.03; c.display.set('breach');
    c.sealPower = 0;
    const s = c.scanner; s.carriage.position.z = 1.5; s.link.rotation.set(0.2, 0, 0); s.head.rotation.set(-0.5, 0, 0); s.probe.scale.set(1, 0.3, 1);
    c.researcher.visible = false; c.officer.visible = false; c.officer.scale.set(1, 1, 1);
    if (L.pistol.parent !== g.scene) g.scene.attach(L.pistol);
    L.pistol.visible = false; L.pistolLight.intensity = 0; L.pistol.scale.setScalar(1.25);
    this.pistolMarker.visible = false; this.seamMarker.visible = false; this.glassPrint.material.opacity = 0;
    L.surge = 0; L.emergencyOn = true; L.alarm = false;
    g.audio.startSiren();
    this.cellBox(true);
    L.doors.containment.close(true);
    // the shot-lock and the low barrier
    this.target = { c: new THREE.Vector3(LOCK_POS.x, 1.27, LOCK_POS.z + 0.0), r: 0.34, alive: true, hp: 3 };
    this.lockGroup.visible = true; this.lockLens.color.set(0xff3a22); this.lockLight.intensity = 2.2;
    this.barrier.visible = true;
    if (!this.barrierBox) this.barrierBox = g.world.add(-1.7, 0, BARRIER_Z - 0.25, 1.7, 0.45, BARRIER_Z + 0.25, { tag: 'barrier' });
    this.barrierBox.enabled = true;
    const keep = !skipped && g.player;                   // finishing the intro leaves you exactly where you stood
    g.player.reset(keep ? g.player.pos.x : PLAYER_START.x, keep ? g.player.pos.z : PLAYER_START.z, keep ? g.player.yaw : 0);
    g.weaponAcquired = true; this.granted = true;
    g.weapon.reset();
    save.setIntroDone(true); progress.setIntroDone(true);                           // the checkpoint: the Shardcaster exists
    g.ui.setObjective('SHOOT THE JAMMED LOCK'); this.f = { _obj: 'SHOOT THE JAMMED LOCK' };
    g.ui.showHud(true);
    document.body.classList.remove('intro-cross');
    g.input.pressed.clear(); g.input.fireGuardUntil = performance.now() + 300;
    if (!skipped) this.say('Automated security deployed on all research decks.', 'SHIP AI', 3.4);
  }

  updateRoute(dt) {
    const g = this.g, p = g.player, ui = g.ui, t = g.time, f = this.f;
    if (this.target && this.target.alive) {
      this.lockHalo.scale.setScalar(1 + 0.1 * Math.sin(t * 6)); this.lockHalo.material.opacity = 0.5 + 0.4 * Math.sin(t * 6);
      this.lockLens.color.setRGB(1, 0.2 + 0.15 * Math.sin(t * 10), 0.1);
      this.lockHalo.lookAt(g.camera.position);
      const d = Math.hypot(p.pos.x - LOCK_POS.x, p.pos.z - LOCK_POS.z);
      if (d < 11 && !f.shotHint && ui.subT <= 0) { f.shotHint = true; ui.hint(this.tr('LEFT CLICK: FIRE AT THE LOCK', 'TAP FIRE: SHOOT THE LOCK'), 4); }
    }
    // jump hint at the barrier
    if (this.barrier.visible && this.barrierBox && this.barrierBox.enabled) {
      if (p.pos.z < BARRIER_Z + 3.2 && p.pos.z > BARRIER_Z + 0.4 && Math.abs(p.pos.x) < 2.2) {
        if (!g.enemies.some((e) => e.alive && e.active)) { ui.setPrompt(this.tr('SPACE: JUMP', 'TAP JUMP')); f.jumpPrompt = true; this.routePrompt = true; }
      } else if (f.jumpPrompt) { f.jumpPrompt = false; this.routePrompt = false; ui.setPrompt(''); }
      if (p.pos.z < BARRIER_Z - 0.6 && !f.dashHint) { f.dashHint = true; ui.hint(this.tr('SHIFT: DASH (OPTIONAL)', 'TAP DASH (OPTIONAL)'), 4); }
    }
    // the first disabled robot: hold the others still, mark it, say what to do
    if (!f.tutDone && g.encounter.state === 'combat') {
      const weak = g.enemies.find((e) => e.alive && e.absorbable && !e.absorbing);
      if (weak && !f.tutWeak) {
        f.tutWeak = weak; weak.tutMark = true; g.enemyFreeze = 4.5; f.tutT = 0;
        g.ui.clearHints();
        g.ui.hint(this.tr('DISABLED. GET CLOSE, THEN RIGHT CLICK TO ABSORB IT', 'DISABLED. GET CLOSE, THEN TAP ABSORB'), 5);
      }
      if (f.tutWeak && f.tutWeak.alive) {
        f.tutT += dt; g.enemyFreeze = Math.max(g.enemyFreeze, f.tutT < 6 ? 0.5 : 0);
        if (f.tutT > 9 && f.tutT - dt <= 9) g.ui.hint(this.tr('RIGHT CLICK WHEN CLOSE TO ABSORB', 'TAP ABSORB WHEN CLOSE'), 4);
      }
    }
  }

  // the Shardcaster reaches the maintenance lock
  hitTarget(hp) {
    const g = this.g, T = this.target;
    if (!T || !T.alive) return;
    T.hp--;
    g.effects.hitSparks(hp, [1, 0.6, 0.2], 14); g.audio.play('hit'); g.ui.hitMarker(false);
    this.lockLight.intensity = 6; this.lockLens.color.set(0xffffff);
    if (T.hp <= 0) {
      T.alive = false; this.target = null;
      this.lockLens.color.set(0x111111); this.lockHalo.visible = false; this.lockLight.intensity = 0;
      g.audio.play('spark', { vol: 0.9 }); g.audio.play('door', { vol: 0.9 });
      g.ui.hitMarker(true);
      g.level.doors.containment.open();
      g.ui.setObjective('ESCAPE THROUGH THE ROBOTICS DECK');
      this.f._obj = 'ESCAPE THROUGH THE ROBOTICS DECK';
      g.ui.hint(this.tr('THE BULKHEAD IS OPEN: GO', 'THE BULKHEAD IS OPEN: GO'), 4);
    }
  }

  onAbsorbed() {                      // an enemy was consumed: the lesson is over, the room plays normally
    if (this.f) { this.f.tutDone = true; if (this.f.tutWeak) this.f.tutWeak.tutMark = false; }
    this.g.enemyFreeze = 0;
  }

  // retries and restarts: the intro is never replayed, and nothing from it blocks the way
  onRetry() {
    const g = this.g;
    this.active = false;
    this.endRoute();
    this.home.show(false);
    document.body.classList.remove('intro');
    g.ui.showSkip(false);
    g.level.cut.setDoorOpen(1.75);
    g.level.doors.containment.open(true);
    this.cellBox(true);
    g.weaponAcquired = true;
    this.setReadyArm();
    this.phase = 'done'; this.f = { tutDone: false };
  }

  endRoute() {
    this.route = false; this.routePrompt = false; this.target = null;
    this.lockGroup.visible = false; this.barrier.visible = false;
    if (this.barrierBox) this.barrierBox.enabled = false;
    this.g.enemyFreeze = 0;
  }

  // ---------------------------------------------------------------------------------------------- skip / finish
  skip() { if (this.active) this.finish(true); }

  finish(skipped = true) {
    const g = this.g, vm = g.viewmodel;
    if (this.parts) for (const d of this.parts) d.p.removeFromParent();
    if (this.blob) { vm.root.remove(this.blob); this.blob = null; }
    vm.setPistol(null); this.tentReset();
    this.parts = null; this.pistolView = null; this.dropT = -1;
    this.home.show(false);
    this.setReadyArm();
    g.ui.clearSubtitle(); g.ui.clearTransient();
    g.absorber.reset();
    this.enterRoute(true);
  }
}
