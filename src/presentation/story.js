import * as THREE from 'three';
import { lerp, smooth, seg, easeOut } from '../core/util.js';
import { PLAYER_START, PISTOL_POS, CELL } from '../world/level.js';
import { MemoryScene } from '../world/screens.js';
import { poseHuman, seatHuman } from '../world/humans.js';
import { makeHandGel } from './hand.js';

// ------------------------------------------------------------------------------------------------------------------
// THE OPENING (about 62 s). Every visual state is derived from the clock `t`, so skipping lands on the same playable state.
//
//  1 WAKE         0.0  restrained in the containment cell, hands in the clamps; the display names the specimen
//                 4.2  the researcher at his console; the scanner rolls into position; its probe comes for the face
//  2 HOME         13.3 origin-world diagram -> zoom into the planet -> its people -> the ship and beam (the taking) -> back in the cell
//  3 FAILURE      19.8 scanner to full power; internal structures react; readings escalate; a service line burns out;
//                 the seal loses power; the researcher's emergency shutdown fails; the alien notices the seam and forces the door
//  4 SECURITY     30.4 breach announced; an officer opens the bulkhead and aims in; the bulkhead slams on his hand; the pistol is knocked loose
//  5 ABSORB       35.0 the alien steps out, reaches the pistol, envelops it, it breaks up beneath the skin, the parts realign, the Shardcaster forms
//  6 ROUTE        46.4 automated security announced; the route display shows the way to the hangar; goal text; control returns
// ------------------------------------------------------------------------------------------------------------------
const EYE = 1.55;
const CX = CELL.x, CZ = CELL.z;
const P1 = new THREE.Vector3(0.7, 0.5, 4.3); // crouched over the pistol
const pdx = PISTOL_POS.x - P1.x, pdz = PISTOL_POS.z - P1.z, pdy = 0.07 - P1.y;
const YAW_P = Math.atan2(-pdx, -pdz), PITCH_P = Math.atan2(pdy, Math.hypot(pdx, pdz));
const ROUTE_YAW = Math.atan2(PLAYER_START.x + 3.5, PLAYER_START.z - 0.06);

const T = {
  end: 62.5,
  researcher: 4.2, scanIn: 6.2, probe: 8.6, probeOut: 11.2, orbit: 11.0,
  memIn: 13.3, memOut: 25.8,
  power: 26.8, react: 28.6, spark: 30.2, sealDown: 30.8, standUp: 31.0, shutdown: 32.6, runOff: 34.2,
  seam: 33.4, push: 35.2, shatter: 36.0, swing: 36.0,
  breachAI: 37.4, bulkheadOpen: 38.0, aim: 39.2, bulkheadShut: 40.2, strike: 40.6, retreat: 41.2,
  walk: 42.0, reach: 45.0, contact: 46.2, envelop: 46.4, breakApart: 47.6, realign: 50.2, form: 51.8, settle: 53.4,
  aiRoute: 53.4, lookRoute: 54.6, goal: 58.2,
};
const KEYS = [
  [0.0, CX, EYE, CZ, 0.0, -0.46],
  [2.0, CX, EYE, CZ, 0.0, -0.42],
  [3.2, CX, EYE, CZ, 0.0, 0.32],
  [4.2, CX, EYE, CZ, 0.0, 0.32],
  [5.0, CX, EYE, CZ, -1.38, 0.03],
  [6.0, CX, EYE, CZ, -1.38, 0.03],
  [7.2, CX, EYE, CZ, -0.12, 0.58],
  [8.6, CX, EYE, CZ, -0.06, 0.4],
  [9.4, CX, EYE, CZ, 0.0, 0.3],
  [11.0, CX, EYE, CZ, 0.0, 0.32],
  [26.0, CX, EYE, CZ, 0.0, 0.32],
  [27.8, CX, EYE, CZ, 0.0, -0.3],
  [29.8, CX, EYE, CZ, 0.0, -0.34],
  [30.8, CX, EYE, CZ, 0.45, 0.72],
  [31.8, CX, EYE, CZ, 0.4, 0.5],
  [32.8, CX, EYE, CZ, -1.38, 0.03],
  [33.4, CX, EYE, CZ, -1.38, 0.03],
  [34.4, CX, EYE, CZ, -0.42, 0.26],
  [35.2, CX, EYE, CZ, -0.4, 0.27],
  [36.2, CX, EYE, CZ - 0.3, -0.18, 0.2],
  [37.6, CX, EYE, CZ - 1.4, 0.0, 0.04],
  [41.0, CX, EYE, CZ - 1.4, 0.0, 0.0],
  [42.2, CX, EYE, CZ - 1.5, -0.12, -0.14],
  [43.6, 0.15, 1.5, 6.4, -0.1, -0.3],
  [45.0, P1.x, P1.y, P1.z, YAW_P, PITCH_P],
  [52.6, P1.x, P1.y, P1.z, YAW_P, PITCH_P],
  [53.6, PLAYER_START.x, EYE, PLAYER_START.z, 0.0, 0.0],
  [54.8, PLAYER_START.x, EYE, PLAYER_START.z, 0.0, 0.02],
  [55.8, PLAYER_START.x, EYE, PLAYER_START.z, ROUTE_YAW, 0.04],
  [58.0, PLAYER_START.x, EYE, PLAYER_START.z, ROUTE_YAW, 0.04],
  [60.0, PLAYER_START.x, EYE, PLAYER_START.z, 0.0, 0.0],
  [T.end, PLAYER_START.x, EYE, PLAYER_START.z, 0.0, 0.0],
];
const ease = (t, a, b) => smooth(seg(t, a, b));
const stage = (t, a, b, c, d) => ease(t, a, b) * (1 - ease(t, c, d)); // rises a->b, falls c->d
const _wq = new THREE.Quaternion(), _rq = new THREE.Quaternion();

export class Opening {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.t = 0;
    this.pose = { x: CX, y: EYE, z: CZ, yaw: 0, pitch: 0 };
    this.memory = new MemoryScene(document.getElementById('memory'));
    this.memoryShown = false;
    this.granted = false;
    this.f = {};
    this.samplePose(0);
  }

  // Every prop back to the pre-breach state (menu backdrop, replays, and the start of the sequence).
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
    c.officer.visible = false; c.officer.position.set(0, 0, -4.5); c.officer.rotation.set(0, Math.PI, 0);
    L.pistol.visible = false; L.pistolLight.intensity = 0;
    if (L.pistol.parent !== g.scene) g.scene.attach(L.pistol);
    L.pistol.scale.setScalar(1.25);
    L.pistol.position.copy(PISTOL_POS); L.pistol.position.y = 0.07; L.pistol.rotation.set(0, 0.7, 1.45);
    L.surge = 0; L.emergencyOn = false; L.alarm = false; c.sealPower = 1;
    c.evacGlow.opacity = 0;
    L.doors.containment.close(true);
    this.memoryEl(false);
  }

  memoryEl(show) {
    const el = this.memory.canvas;
    el.classList.remove('hidden');
    el.classList.toggle('show', show);
    this.memoryShown = show;
  }

  start() {
    const g = this.g, vm = g.viewmodel;
    this.active = true;
    this.t = 0;
    this.f = {};
    this.blob = null;
    this.beat = 0; this.stride = 0; this.lastStep = -1; this.lastDraw = -1; this.lastDraw2 = -1;
    this.pistolView = null;
    this.parts = null;
    if (this.blob) { vm.root.remove(this.blob); this.blob = null; }
    this.dropT = -1;
    this.granted = false;
    this.resetProps();
    for (const fr of vm.right.frags) fr.k = 0;
    vm.bulge = 0;
    vm.setPistol(null);
    vm.form = 0; vm.crystal = 0; vm.frag = 0; vm.curl = 0.2; vm.cineW = 1; vm.reachW = 0; vm.restrain = 1; vm.restrainSlack = 0; vm.charge = 0; vm.leftHidden = false; vm.xray = 0;
    vm.recoil = vm.recoilVel = vm.pulse = 0;
    g.player.reset(PLAYER_START.x, PLAYER_START.z, 0);
    g.weaponAcquired = false;
    this.samplePose(0);
    g.ui.clearTransient();
    g.ui.showHud(false);
    g.ui.fade(1);
    g.ui.showSkip(true);
    g.audio.stopSiren();
  }

  samplePose(t) {
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const k = smooth(seg(t, a[0], b[0]));
    const p = this.pose;
    p.x = lerp(a[1], b[1], k); p.y = lerp(a[2], b[2], k); p.z = lerp(a[3], b[3], k);
    p.yaw = lerp(a[4], b[4], k); p.pitch = lerp(a[5], b[5], k);
    // captive: slow breathing. The probe makes the head recoil. The stalking walk has a gentle sway.
    if (t < T.sealDown + 4) { p.pitch += Math.sin(t * 1.3) * 0.006; p.yaw += Math.sin(t * 0.9) * 0.004; }
    const rec = stage(t, 9.2, 9.7, 10.2, 11.4);
    p.z += rec * 0.24; p.pitch += rec * 0.12; p.yaw += Math.sin(t * 30) * 0.004 * rec;
    const walk = stage(t, T.walk, T.walk + 0.4, T.reach - 0.4, T.reach);
    p.y += Math.sin(t * 5.4) * 0.014 * walk;
    p.yaw += Math.sin(t * 2.7) * 0.012 * walk;
  }

  say(text, speaker, dur, thought = false) {
    this.g.ui.subtitle(text, speaker, dur, thought);
    if (speaker) this.g.audio.play('pa', { vol: speaker === 'SHIP AI' ? 0.7 : 0.5 });
  }

  // ----------------------------------------------------------------------------------------------- per-frame
  update(dt) {
    if (!this.active) return;
    const g = this.g, vm = g.viewmodel, L = g.level, c = L.cut, ui = g.ui, a = g.audio, f = this.f;
    this.t += dt;
    this.dtLast = dt;
    const t = this.t;
    this.samplePose(t);
    ui.fade(1 - seg(t, 0, 1.4));
    const once = (key, at, fn) => { if (t >= at && !f[key]) { f[key] = true; fn(); } };

    // ---- 1 WAKE ----
    if (t < T.sealDown && t > 1.0 && t >= (this.beat + 1) * 1.15) { this.beat++; a.play('vitals', { vol: 0.45 }); }
    once('l1', T.researcher - 1.9, () => this.say('Specimen nine is conscious. Starting trial twenty-seven.', 'RESEARCHER', 3.5));
    once('l2', T.researcher + 1.0, () => this.say('Can it assimilate foreign hardware? Bring the probe in.', 'RESEARCHER', 3.2));
    once('servo', T.scanIn, () => a.play('servo', { vol: 0.7 }));
    once('scan', T.probe, () => a.play('scan', { vol: 0.8 }));
    once('l3', 9.9, () => this.say('Look at that. It is reading the machine.', 'RESEARCHER', 2.8));
    once('orbit', T.orbit, () => c.display.set('orbit'));
    if (c.display.mode === 'orbit' && Math.floor(t * 8) !== this.lastDraw) { this.lastDraw = Math.floor(t * 8); c.display.draw(t); }
    // hands strain against the clamps, harder when the probe comes close
    const strain = 0.2 + 0.16 * Math.sin(t * 1.7) + 0.5 * stage(t, 9.0, 9.6, 10.6, 11.6);
    if (t < T.reach) vm.curl = Math.min(1, strain);

    // ---- 2 HOME ----
    once('memIn', T.memIn, () => { a.play('memory', { vol: 0.9 }); ui.flash('#cfe9f2', 0.7); this.memoryEl(true); });
    // the memory: the world on the display, its people, the ship, the beam
    once('m1', T.memIn + 2.0, () => this.say('Home.', '', 2.4, true));
    once('m2', T.memIn + 3.7, () => this.say('My people.', '', 2.0, true));
    once('m3', T.memIn + 5.3, () => { a.play('groan', { vol: 0.8 }); this.say('Then the sky opened. They came in a ship.', '', 3.0, true); });
    once('m4', T.memIn + 8.3, () => { a.play('surge', { vol: 0.7 }); });
    once('m5', T.memIn + 8.9, () => this.say('They took me from my world.', '', 3.0, true));
    if (this.memoryShown) this.memory.draw(t - T.memIn);
    once('memOut', T.memOut, () => { a.play('memoryOut', { vol: 0.9 }); ui.flash('#cfe9f2', 0.5); this.memoryEl(false); c.display.set('record'); });
    once('think2', T.memOut + 0.8, () => this.say('I have to get home.', '', 2.8, true));

    // ---- 3 FAILURE ----
    once('power', T.power, () => { this.say('Scanner to full power.', 'RESEARCHER', 2.0); a.play('servo', { vol: 0.5 }); });
    once('warn', T.power + 0.6, () => { c.display.set('warning'); a.play('alert', { vol: 0.5 }); });
    if (t >= T.power && t < T.sealDown) {
      const surge = ease(t, T.power + 0.4, T.spark);
      L.surge = surge * 0.9;
      c.display.power = lerp(0.5, 0.99, ease(t, T.power, T.spark));
      c.display.fieldLevel = lerp(0.62, 0.22, ease(t, T.power + 0.6, T.spark));
      vm.charge = surge;
    }
    once('surgeSound', T.react, () => a.play('surge', { vol: 0.8 }));
    if (t >= T.power && t < T.seam && c.display.mode === 'warning' && Math.floor(t * 10) !== this.lastDraw2) { this.lastDraw2 = Math.floor(t * 10); c.display.time = t; c.display.draw(t); }
    once('spark', T.spark, () => {
      a.play('spark', { vol: 1 }); g.addShake(0.2);
      const p = new THREE.Vector3(CX - 0.7, 3.28, CZ - 0.9);
      for (let i = 0; i < 46; i++) g.effects.glowP.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 3, Math.random() * 2.5 - 2.2, (Math.random() - 0.5) * 3, 0.5 + Math.random() * 0.6, 0.04 + Math.random() * 0.04, 1, 0.8, 0.4, 9, 0.8);
      g.effects.flashLight(p, 0xffc070, 120, 0.4);
    });
    once('sealDown', T.sealDown, () => {
      a.play('powerdown', { vol: 1 }); a.play('alert', { vol: 0.7 });
      L.emergencyOn = true;
      this.say('The seal is losing power! Cut the trial!', 'RESEARCHER', 2.8);
    });
    if (t >= T.sealDown) {
      c.sealPower = 1 - ease(t, T.sealDown, T.sealDown + 1.4);
      L.surge = 0;
      vm.charge = lerp(1, 0.25, ease(t, T.sealDown, T.sealDown + 1.5));
      c.display.fieldLevel = lerp(0.22, 0.03, ease(t, T.sealDown, T.sealDown + 2));
      c.display.power = lerp(0.99, 0.2, ease(t, T.shutdown, T.shutdown + 1.5));
      if (t < T.seam && Math.floor(t * 10) !== this.lastDraw2) { this.lastDraw2 = Math.floor(t * 10); c.display.time = t; c.display.draw(t); }
    }
    vm.restrainSlack = ease(t, T.sealDown, T.sealDown + 1.2);
    once('shutdownFail', T.shutdown + 0.4, () => this.say('Shutdown is not responding!', 'RESEARCHER', 2.4));
    once('seam', T.seam, () => { a.play('crack', { vol: 0.8 }); c.display.set('breach'); });
    once('seam2', T.seam + 0.9, () => a.play('crack', { vol: 0.9 }));
    once('groan', T.push - 0.3, () => a.play('groan', { vol: 0.9 }));
    c.crack.material.opacity = t < T.shatter ? ease(t, T.seam, T.shatter) * (0.8 + 0.2 * Math.sin(t * 40)) : 0;
    // the alien pushes the damaged door: wrists slip the loosened clamps, the right hand presses the latch edge
    vm.restrain = t < T.push ? 1 : 1 - ease(t, T.push, T.push + 0.9);
    if (t < T.reach) { vm.reachTarget.set(0.18, 0.18, -0.72); vm.reachW = stage(t, T.push, T.push + 0.8, T.shatter + 0.9, T.shatter + 1.6); }
    once('shatter', T.shatter, () => {
      if (c.doorGlass) c.doorGlass.visible = false;
      c.crack.visible = false; c.spill.visible = true;
      a.play('shatter', { vol: 1 }); g.addShake(0.3);
      const p = new THREE.Vector3(CX - 0.05, 1.7, CZ - 1.1);
      for (let i = 0; i < 80; i++) g.effects.glowP.emit(p.x + (Math.random() - 0.5) * 1.0, p.y + (Math.random() - 0.5) * 2.4, p.z, (Math.random() - 0.5) * 5, Math.random() * 3 - 0.5, -1.5 - Math.random() * 5, 0.7 + Math.random() * 0.9, 0.05 + Math.random() * 0.06, 0.75, 0.92, 1, 9, 0.6);
      g.effects.flashLight(p, 0xbfe8ff, 200, 0.35);
    });
    const open = ease(t, T.swing, T.swing + 1.1);
    c.setDoorOpen(t < T.swing ? 0 : 1.75 * open + 0.05 * Math.sin(open * Math.PI) * (1 - open));
    once('siren', T.shatter + 0.6, () => a.startSiren());
    this.scanner(t);

    // ---- 4 SECURITY ----
    once('ai1', T.breachAI, () => this.say('Containment breach, Specimen Bay Three. Security response engaged.', 'SHIP AI', 3.8));
    once('door1', T.bulkheadOpen, () => { L.doors.containment.open(); a.play('door', { vol: 0.9 }); });
    once('l5', T.aim + 0.5, () => this.say('It is out! Seal the bulkhead!', 'SECURITY', 2.3));
    once('door2', T.bulkheadShut, () => { L.doors.containment.close(); a.play('door', { vol: 1 }); });
    this.people(t);

    // ---- 5 ABSORB AND ADAPT ----
    if (t >= T.reach && !f.reach) {
      f.reach = true;
      const cam = g.camera;
      cam.updateMatrixWorld(true);
      L.pistol.updateMatrixWorld(true);
      this.pistolLocal = cam.worldToLocal(L.pistol.getWorldPosition(new THREE.Vector3()));
      this.pistolQuat = cam.quaternion.clone().invert().multiply(L.pistol.getWorldQuaternion(new THREE.Quaternion()));
      vm.leftHidden = true;
    }
    if (f.reach) {
      vm.reachTarget.copy(this.pistolLocal);
      vm.reachW = ease(t, T.reach, T.contact) * (1 - ease(t, T.settle + 0.3, T.settle + 1.6));
      vm.curl = t < T.envelop ? lerp(0.15, 0.25, ease(t, T.reach, T.contact)) : lerp(0.25, 1, ease(t, T.envelop, T.envelop + 1.0)) * (1 - ease(t, T.form - 0.2, T.form + 0.9));
    }
    // CONTACT: fingertips touch the grip. ENVELOP: a skin of gel creeps over the whole pistol and draws it into the palm.
    once('touch', T.contact, () => {
      L.pistol.visible = false; L.pistolLight.intensity = 0;
      this.pistolView = this.makeViewPistol();
      this.pistolView.position.copy(this.pistolLocal); this.pistolView.quaternion.copy(this.pistolQuat);
      vm.setPistol(this.pistolView);
      this.blob = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), this.blobGel || (this.blobGel = makeHandGel({ color: 0x118078, rim: 0xb8fff4, alpha: 0.62 })));
      this.blob.renderOrder = 6; this.blob.frustumCulled = false;
      vm.root.add(this.blob);
      for (const fr of vm.right.frags) fr.k = 0;
      a.play('gel', { vol: 0.9 }); vm.pulseGlow(0.45);
    });
    if (this.pistolView && !this.parts) {
      const k = ease(t, T.envelop, T.envelop + 1.2);
      const target = vm.root.worldToLocal(new THREE.Vector3(0, 0, -0.05).applyMatrix4(vm.right.root.matrixWorld));
      this.pistolView.position.lerpVectors(this.pistolLocal, target, k);
      this.pistolView.scale.setScalar(1.25 * lerp(1, 0.8, k));
      const qt = vm.right.root.getWorldQuaternion(_wq).premultiply(_rq.copy(vm.root.getWorldQuaternion(new THREE.Quaternion())).invert());
      this.pistolView.quaternion.slerp(qt, k * 0.6);
      // the gel creeps from the fingertips over the pistol, then follows it inward
      const grow = ease(t, T.contact, T.envelop + 0.5);
      const wob = 1 + 0.05 * Math.sin(t * 9);
      this.blob.quaternion.copy(this.pistolView.quaternion);
      this.blob.position.copy(this.pistolView.position).add(new THREE.Vector3(0, 0, -0.06).applyQuaternion(this.pistolView.quaternion));
      this.blob.scale.set(0.085 * wob, 0.08, 0.17).multiplyScalar((0.3 + 0.7 * grow) * lerp(1, 0.8, k));
      vm.curl = Math.max(vm.curl, 0.5 * grow);
      if (!f.gulp && k > 0.55) { f.gulp = true; a.play('swallow', { vol: 0.9 }); vm.pulseGlow(0.6); }
    }
    // BREAK APART: the pistol's pieces separate under the skin and travel up the forearm one by one, each causing a bulge
    once('break', T.breakApart, () => {
      a.play('absorb', { vol: 0.8 });
      if (this.blob) { vm.root.remove(this.blob); this.blob.geometry.dispose(); this.blob = null; }
      this.parts = this.pistolView.userData.parts.map((p, i) => { vm.right.tip.attach(p); return { p, p0: p.position.clone(), q0: p.quaternion.clone(), s0: p.scale.clone(), i, t0: T.breakApart + i * 0.34, dur: 1.5, swallowed: false }; });
      vm.frag = 1;
    });
    if (this.parts) {
      let bulge = 0;
      for (const d of this.parts) {
        const u = seg(t, d.t0, d.t0 + d.dur);
        const fr = vm.right.frags[d.i];
        if (u <= 0) continue;
        if (u < 1) {
          // 0..0.35: slide into the wrist (a steady pull), 0.35..1: travel along the forearm on a gentle spiral
          const w = ease(u, 0, 0.35), run = ease(u, 0.3, 1.0);
          const pt = new THREE.Vector3().lerpVectors(d.p0, new THREE.Vector3(0, 0, -0.01), w);
          const targ = fr.sp.clone();
          const ang = run * 5.5 + d.i;
          pt.lerp(new THREE.Vector3(Math.cos(ang) * 0.02, Math.sin(ang) * 0.02, targ.z), run);
          d.p.position.copy(pt);
          d.p.quaternion.slerpQuaternions(d.q0, fr.sq, run);
          d.p.scale.copy(d.s0).multiplyScalar(lerp(1, 0.55, w) * (1 - 0.35 * run));
          bulge = Math.max(bulge, Math.sin(run * Math.PI) * 0.9);
          if (!d.swallowed && u > 0.28) { d.swallowed = true; a.play('swallow', { vol: 0.5 }); vm.pulseGlow(0.35); }
        } else if (d.p.visible) { d.p.visible = false; fr.k = 1; vm.pulseGlow(0.2); }   // the piece becomes an internal fragment
      }
      vm.bulge = bulge;
      // the remaining fragments condense in as the realignment approaches
      vm.right.frags.forEach((fr, i) => { if (i >= 5) fr.k = ease(t, T.breakApart + 1.2 + (i - 5) * 0.2, T.breakApart + 2.2 + (i - 5) * 0.2); });
    }
    vm.xray = stage(t, T.envelop + 0.2, T.envelop + 1.0, T.form, T.form + 1.4);   // skin thins so the pistol breaking apart is readable
    once('realign', T.realign, () => a.play('crystal', { vol: 0.9 }));
    if (t >= T.breakApart) vm.crystal = ease(t, T.realign, T.form);
    if (t >= T.realign) vm.bulge = Math.max(0, vm.bulge - 0.05);
    once('learn', T.realign + 0.5, () => this.say('It learns. It becomes.', '', 2.6, true));
    once('formSound', T.form, () => a.play('gel', { vol: 0.8 }));
    if (t >= T.form) {
      const fk = ease(t, T.form, T.settle);
      vm.form = fk + 0.06 * Math.sin(fk * Math.PI);
      if (t < T.settle) vm.pulse = Math.max(vm.pulse, 0.25);
      vm.charge = 0;
    }
    if (t >= T.settle) vm.leftHidden = false;

    // ---- 6 ROUTE ----
    once('ai2', T.aiRoute, () => this.say('Automated security deployed on all research decks. Hangar access restricted.', 'SHIP AI', 4.2));
    c.evacGlow.opacity = stage(t, T.lookRoute, T.lookRoute + 0.4, T.goal, T.goal + 1.0) * (0.55 + 0.45 * Math.sin(t * 6));
    once('thought3', T.lookRoute + 2.2, () => this.say('The hangar. A ship. Home.', '', 2.8, true));
    once('goal', T.goal, () => { ui.banner('Reach the hangar.\nFind a way home.', 'green goal', 4.0); a.play('unlock', { vol: 0.7 }); });
    if (t >= T.end) this.finish();
  }

  // Scanner choreography: rail -> carriage -> link -> head -> probe, each a real pivot from the Blender model.
  scanner(t) {
    const s = this.g.level.cut.scanner;
    s.carriage.position.z = lerp(-1.9, 1.5, ease(t, T.scanIn, T.scanIn + 2.2));          // world z 5.8 -> 9.2, over the cell
    const reach = stage(t, T.probe, T.probe + 1.0, T.probeOut, T.probeOut + 1.2);
    let alpha = 0.5 * reach, beta = -0.7 * reach, probe = 0.12 + 0.68 * reach;
    if (t >= T.power && t < T.sealDown) alpha += 0.012 * Math.sin(t * 40) * ease(t, T.power, T.spark);   // vibrates under load
    if (t >= T.sealDown) {                                                                // power gone: the arm sags and sways, probe slack
      const k = ease(t, T.sealDown, T.sealDown + 1.6);
      alpha = lerp(alpha, 0.2 + 0.05 * Math.sin(t * 1.3), k); beta = lerp(beta, -0.5, k); probe = lerp(probe, 0.3, k);
    }
    s.link.rotation.x = alpha;
    s.head.rotation.x = beta;
    s.probe.scale.y = Math.max(0.05, probe);
  }

  // The researcher and the officer. Stride phase follows distance travelled, so feet do not slide.
  people(t) {
    const g = this.g, c = g.level.cut, a = g.audio, f = this.f, R = c.researcher, O = c.officer, L = g.level;
    // researcher: seated and typing -> stands -> hits the shutdown switch -> backs off -> runs from the monitoring room
    if (t < T.standUp) {
      seatHuman(R, t, 0.1 + 0.05 * Math.sin(t * 0.7));
      if (t > T.sealDown - 0.5) R.userData.armR.rotation.x = -0.9;
    } else if (t < T.runOff) {
      const k = ease(t, T.standUp, T.standUp + 0.8);
      R.visible = true; R.position.set(7.45 + 0.1 * k, 0, 8.2); R.rotation.set(0, -Math.PI / 2, 0);
      poseHuman(R, 0, 0, lerp(0.1, 0.0, k), 0);
      R.userData.legL.rotation.x = -1.5 * (1 - k); R.userData.legR.rotation.x = -1.5 * (1 - k);
      R.position.y = -0.26 * (1 - k);
      const hit = stage(t, T.shutdown, T.shutdown + 0.25, T.shutdown + 0.5, T.shutdown + 0.9);
      R.userData.armR.rotation.x = -0.4 - 1.1 * hit; R.userData.armL.rotation.x = -0.2;
      if (t > T.shutdown + 0.9) { R.rotation.y = -Math.PI / 2 + 0.5 * ease(t, T.shutdown + 0.9, T.runOff); R.userData.armL.rotation.x = -0.5; R.userData.armR.rotation.x = -0.5; }
      if (!f.hit && t >= T.shutdown + 0.2) { f.hit = true; a.play('clatter', { vol: 0.5 }); }
    } else if (t < T.runOff + 3.4) {
      const pts = [[7.55, 8.2], [7.4, 5.5], [14.3, 5.0], [14.8, 3.0]];
      const lens = [Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]), Math.hypot(pts[3][0] - pts[2][0], pts[3][1] - pts[2][1])];
      const total = lens[0] + lens[1] + lens[2];
      const at = (d) => { d = Math.min(total, d); let i = 0; while (i < 2 && d > lens[i]) { d -= lens[i]; i++; } const u = d / lens[i]; return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)]; };
      const d = ((t - T.runOff) / 3.4) * total;
      const p = at(d), q = at(d + 0.3);
      R.position.set(p[0], 0, p[1]);
      R.rotation.y = Math.atan2(-(q[0] - p[0]), -(q[1] - p[1]));
      poseHuman(R, d / 0.95 * Math.PI, 1, 0.16, 0);
    } else R.visible = false;

    // officer
    if (t >= T.bulkheadOpen && t < T.retreat + 1.6) {
      O.visible = true;
      O.rotation.y = Math.PI;
      if (!f.pistolOn) { f.pistolOn = true; L.pistol.visible = true; O.userData.hand.add(L.pistol); L.pistol.position.set(0, 0, -0.02); L.pistol.rotation.set(-1.45, 0, 0); L.pistol.scale.setScalar(1.25); }
      if (t < T.aim) { // runs up the corridor to the doorway
        const k = seg(t, T.bulkheadOpen + 0.3, T.aim);
        const z = lerp(-4.6, -0.95, smooth(k));
        this.stride += Math.abs(z - O.position.z) / 0.85;
        O.position.set(0, 0, z);
        poseHuman(O, this.stride * Math.PI, k < 1 ? 1 : 0, 0.1, 0);
        O.userData.armR.rotation.x = -0.5 - 1.0 * k;
        if (k > 0 && k < 1 && Math.floor(this.stride) !== this.lastStep) { this.lastStep = Math.floor(this.stride); a.play('step', { vol: 0.4 }); }
      } else if (t < T.strike) { // aims through the doorway, pistol out in both hands
        O.position.set(0, 0, -0.95);
        poseHuman(O, 0, 0, 0.05, 0);
        O.userData.armR.rotation.x = -1.57; O.userData.armL.rotation.x = -1.35; O.userData.armL.rotation.z = 0.25;
      } else if (t < T.retreat) { // the bulkhead hits his hand: arm snaps back, weapon gone
        const k = ease(t, T.strike, T.retreat);
        O.position.set(0, 0, -0.95 - 0.35 * k);
        poseHuman(O, 0, 0, -0.1 * k, 0);
        O.userData.armR.rotation.x = lerp(-1.57, -0.3, k); O.userData.armL.rotation.x = -0.6;
      } else { // runs back down the corridor
        const k = (t - T.retreat) / 1.6;
        const z = -1.3 - 7 * k * k;
        this.stride += Math.abs(z - O.position.z) / 0.85;
        O.position.set(0, 0, z);
        O.rotation.y = 0;
        poseHuman(O, this.stride * Math.PI, 1, 0.15, 0);
        if (Math.floor(this.stride) !== this.lastStep) { this.lastStep = Math.floor(this.stride); a.play('step', { vol: 0.3 }); }
      }
    } else if (t >= T.retreat + 1.6) O.visible = false;

    // the strike: the bulkhead leaf meets the extended hand; the pistol is knocked into the room, bounces, and slides to rest
    if (t >= T.strike && !f.struck) {
      f.struck = true;
      L.pistol.updateMatrixWorld(true);
      this.pFrom = L.pistol.getWorldPosition(new THREE.Vector3());
      g.scene.attach(L.pistol);
      this.dropT = 0;
      a.play('clatter', { vol: 0.8 }); g.addShake(0.12);
      g.effects.hitSparks(this.pFrom, [1, 0.8, 0.4], 12);
    }
    if (this.dropT >= 0) {
      this.dropT += this.dtLast || 1 / 60;
      const land = new THREE.Vector3(PISTOL_POS.x - 0.2, 0.07, PISTOL_POS.z - 0.35);
      const k = Math.min(1, this.dropT / 1.0);
      L.pistol.position.lerpVectors(this.pFrom, land, 1 - Math.pow(1 - k, 1.6));
      L.pistol.position.y = lerp(this.pFrom.y, 0.07, k * k) + Math.sin(k * Math.PI) * 0.8;
      L.pistol.rotation.set(-1.45 + k * 9, 0.7 * k, 1.45 * k);
      if (!f.bounce && k >= 1) { f.bounce = true; a.play('land', { vol: 0.6 }); a.play('clatter', { vol: 0.4 }); }
      if (k >= 1) { // short slide to the final resting place
        const s = Math.min(1, (this.dropT - 1.0) / 0.45);
        L.pistol.position.set(lerp(land.x, PISTOL_POS.x, easeOut(s)), 0.07, lerp(land.z, PISTOL_POS.z, easeOut(s)));
        L.pistol.rotation.set(0, 0.7, 1.45);
        if (s >= 1) { this.dropT = -1; L.pistolLight.intensity = 5; }
      }
    }
  }

  makeViewPistol() {
    const L = this.g.level;
    const grp = new THREE.Group();
    const parts = [];
    for (const p of L.pistol.userData.parts) {
      const m = new THREE.Mesh(p.geometry, p.material);
      m.position.copy(p.position);
      grp.add(m);
      parts.push(m);
    }
    grp.scale.setScalar(1.25);
    grp.userData.parts = parts;
    return grp;
  }

  skip() { if (this.active) this.finish(true); }

  // Single path to the playable state, used by natural completion and by skipping.
  finish(skipped = false) {
    const g = this.g, vm = g.viewmodel, L = g.level, c = L.cut;
    this.active = false;
    if (this.parts) for (const d of this.parts) d.p.removeFromParent();
    if (this.blob) { vm.root.remove(this.blob); this.blob = null; }
    for (const fr of vm.right.frags) fr.k = 1;
    vm.bulge = 0;
    vm.setPistol(null);
    vm.form = 1; vm.crystal = 1; vm.frag = 1; vm.curl = 0; vm.cineW = 0; vm.reachW = 0; vm.restrain = 0; vm.restrainSlack = 1; vm.charge = 0; vm.leftHidden = false; vm.xray = 0;
    vm.recoil = vm.recoilVel = 0;
    // the breach has happened and stays that way: door forced, glass gone, seal dead, scanner slack, nobody left in view
    c.setDoorOpen(1.75);
    if (c.doorGlass) c.doorGlass.visible = false;
    c.crack.visible = false; c.crack.material.opacity = 0;
    c.spill.visible = true;
    c.display.power = 0.2; c.display.fieldLevel = 0.03; c.display.set('breach');
    c.sealPower = 0;
    const s = c.scanner;
    s.carriage.position.z = 1.5; s.link.rotation.set(0.2, 0, 0); s.head.rotation.set(-0.5, 0, 0); s.probe.scale.set(1, 0.3, 1);
    c.researcher.visible = false; c.officer.visible = false;
    if (L.pistol.parent !== g.scene) g.scene.attach(L.pistol);
    L.pistol.visible = false; L.pistolLight.intensity = 0; L.pistol.scale.setScalar(1.25);
    c.evacGlow.opacity = 0;
    L.surge = 0; L.emergencyOn = false; L.alarm = false;
    L.doors.containment.open(skipped);
    if (!skipped) g.audio.play('unlock', { vol: 0.8 });
    g.audio.stopSiren();
    this.memoryEl(false);
    g.ui.clearSubtitle();
    g.ui.fade(0);
    g.player.reset(PLAYER_START.x, PLAYER_START.z, 0);
    if (!this.granted) { this.granted = true; g.weaponAcquired = true; } // the Shardcaster is granted exactly once per run
    g.cinePose = null;
    g.ui.showSkip(false);
    g.input.pressed.clear();
    g.weapon.reset();
    g.beginPlay();
  }
}
