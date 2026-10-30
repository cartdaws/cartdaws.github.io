import * as THREE from 'three';
import { lerp, smooth, seg, easeOut } from '../core/util.js';
import { PLAYER_START, PISTOL_POS, CELL } from '../world/level.js';
import { MemoryScene } from '../world/screens.js';
import { poseHuman } from '../world/humans.js';

const EYE = 1.55;
const CELL_EYE = { x: CELL.x, y: EYE, z: CELL.z };
// look-down camera near the dropped pistol
const P1 = new THREE.Vector3(0.62, 1.05, 5.75);
const pdx = PISTOL_POS.x - P1.x, pdz = PISTOL_POS.z - P1.z, pdy = 0.07 - P1.y;
const YAW_P = Math.atan2(-pdx, -pdz);
const PITCH_P = Math.atan2(pdy, Math.hypot(pdx, pdz));
const MAP_POS = { x: -1.3, z: 2.7 }; // a few steps toward the service-route display beside the door
const MAP_YAW = Math.atan2(3.5 - 1.3, MAP_POS.z - 0.06);

// Story beats (seconds). The weapon sequence (reach/grab/dissolve/form) is the original absorption animation, now part of the escape.
const T = {
  display: 8.4, orbit: 8.4, recordAgain: 13.9, memoryIn: 10.5, memoryOut: 14.0,
  alert: 14.6, surge: 15.2, crack0: 16.5, snap: 18.2, shatter: 18.6, siren: 19.0, doorOpen: 19.4, drop: 21.0, doorShut: 22.4,
  down: 24.0, reach: 25.4, grab: 26.5, dissolve: 27.3, form: 28.8, settle: 30.6, map: 32.6, goal: 36.0, end: 38.2,
};
const KEYS = [
  [0.0, CELL_EYE.x, EYE, CELL_EYE.z, 0.0, 0.04],
  [4.0, CELL_EYE.x, EYE, CELL_EYE.z, 0.0, 0.14],
  [6.6, CELL_EYE.x, EYE, CELL_EYE.z, -0.98, 0.02],
  [8.8, CELL_EYE.x, EYE, CELL_EYE.z, 0.0, 0.13],
  [14.2, CELL_EYE.x, EYE, CELL_EYE.z, -0.05, 0.1],
  [15.4, CELL_EYE.x, EYE, CELL_EYE.z, -0.92, 0.02],
  [17.7, CELL_EYE.x, EYE, CELL_EYE.z - 0.1, -0.06, 0.0],
  [18.9, CELL_EYE.x, EYE, CELL_EYE.z - 0.75, 0.0, 0.0],
  [20.4, CELL_EYE.x, EYE, 7.0, 0.0, 0.0],
  [23.6, CELL_EYE.x, EYE, PLAYER_START.z + 0.4, 0.0, -0.03],
  [T.reach, P1.x, P1.y, P1.z, YAW_P, PITCH_P],
  [T.settle, P1.x, P1.y, P1.z, YAW_P, PITCH_P],
  [T.settle + 1.4, PLAYER_START.x, EYE, PLAYER_START.z, 0.0, 0.0],
  [T.map, MAP_POS.x, EYE, MAP_POS.z, MAP_YAW, 0.0],
  [T.goal, MAP_POS.x, EYE, MAP_POS.z, MAP_YAW, 0.0],
  [T.end, PLAYER_START.x, EYE, PLAYER_START.z, 0.0, 0.0],
];

// The skippable opening. All visual state derives from time, and finish() is the single path to the playable state.
export class Opening {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.t = 0;
    this.pose = { x: CELL_EYE.x, y: EYE, z: CELL_EYE.z, yaw: 0, pitch: 0 };
    this.memory = new MemoryScene(document.getElementById('memory'));
    this.memoryShown = false;
    this.granted = false;
    this.samplePose(0);
  }

  // Put every prop in the pre-breach state (also used for the menu backdrop and for replays).
  resetProps() {
    const g = this.g, L = g.level, c = L.cut;
    for (const m of c.cellFront) m.visible = true;
    c.crack.visible = true; c.crack.material.opacity = 0;
    c.spill.visible = false;
    c.display.fieldLevel = 0.62;
    c.display.set('record');
    c.scannerArm.rotation.set(0, 0, 0);
    c.researcher.visible = true;
    c.researcher.position.set(7.3, 0, 5.6); c.researcher.rotation.set(0, Math.PI / 2, 0);
    poseHuman(c.researcher, 0, 0);
    c.officer.visible = false;
    c.officer.position.set(0, 0, -1.6); c.officer.rotation.set(0, Math.PI, 0);
    L.pistol.visible = false; L.pistolLight.intensity = 0;
    L.pistol.position.copy(PISTOL_POS); L.pistol.position.y = 0.07; L.pistol.rotation.set(0, 0.7, 1.45);
    if (L.pistol.parent !== g.scene) g.scene.attach(L.pistol);
    L.surge = 0; L.emergencyOn = false; L.alarm = false;
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
    this.beat = 0;
    this.pistolView = null;
    this.parts = null;
    this.dropT = -1;
    this.granted = false;
    this.resetProps();
    this.pistolHome = null;
    vm.setPistol(null);
    const L = g.level;
    vm.form = 0; vm.crystal = 0; vm.frag = 0; vm.curl = 0.1; vm.cineW = 1; vm.reachW = 0; vm.restrain = 1; vm.leftHidden = false;
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
    // restrained, breathing view while captive
    if (t < T.snap) { p.pitch += Math.sin(t * 1.3) * 0.006; p.yaw += Math.sin(t * 0.9) * 0.004; }
  }

  say(text, speaker, dur, thought = false) { this.g.ui.subtitle(text, speaker, dur, thought); }

  update(dt) {
    if (!this.active) return;
    const g = this.g, vm = g.viewmodel, L = g.level, c = L.cut, ui = g.ui, a = g.audio, f = this.f;
    this.t += dt;
    this.dtLast = dt;
    const t = this.t;
    this.samplePose(t);
    ui.fade(1 - seg(t, 0, 1.2));
    const once = (key, at, fn) => { if (t >= at && !f[key]) { f[key] = true; fn(); } };

    // --- 1 CAPTIVITY: vitals ticks, researcher's instruction, the record on the display ---
    if (t < T.alert && t > 1.0 && t >= (this.beat + 1) * 1.15) { this.beat++; a.play('vitals', { vol: 0.5 }); }
    once('s1', 2.2, () => this.say('Specimen nine is stable. Begin trial twenty-seven.', 'RESEARCHER', 3.6));
    once('s2', 5.4, () => this.say('Absorption response, full power.', 'RESEARCHER', 2.6));

    // --- 2 HOME: the origin diagram, then the memory of the same sky ---
    once('orbit', T.orbit, () => c.display.set('orbit'));
    if (c.display.mode === 'orbit' && Math.floor(t * 8) !== this.lastOrb) { this.lastOrb = Math.floor(t * 8); c.display.draw(t); }
    once('think', 9.4, () => this.say('…home.', '', 2.6, true));
    once('memIn', T.memoryIn, () => this.memoryEl(true));
    if (this.memoryShown) this.memory.draw(t - T.memoryIn);
    once('memOut', T.memoryOut, () => { this.memoryEl(false); c.display.set('record'); });

    // --- 3 CONTAINMENT FAILURE ---
    once('alert', T.alert, () => { a.play('alert', { vol: 0.8 }); c.display.set('warning'); L.emergencyOn = true; this.say('Field integrity dropping! Cut the trial!', 'RESEARCHER', 2.8); });
    once('alert2', T.alert + 0.9, () => a.play('alert', { vol: 0.8 }));
    once('surge', T.surge, () => { a.play('surge', { vol: 0.8 }); });
    if (t >= T.surge) {
      L.surge = t < T.shatter ? seg(t, T.surge, T.snap) : (t < T.siren + 0.8 ? 0.5 : 0);
      c.display.fieldLevel = lerp(0.62, 0.04, seg(t, T.alert, T.snap));
      if (t < T.shatter) { c.display.time = t; if (Math.floor(t * 12) % 2 === 0) c.display.draw(t); }
      c.scannerArm.rotation.y = Math.sin(t * 17) * 0.025 * L.surge;
      if (t > 16.4 && t < T.shatter) g.addShake(dt * 0.35);
    }
    once('c1', T.crack0, () => a.play('crack', { vol: 0.8 }));
    once('c2', T.crack0 + 0.7, () => a.play('crack', { vol: 0.9 }));
    once('c3', T.crack0 + 1.3, () => a.play('crack', { vol: 1 }));
    once('ai1', 16.0, () => { a.play('announce', { vol: 0.8 }); this.say('Containment breach in Specimen Bay Three.', 'SHIP AI', 3.2); });
    c.crack.material.opacity = smooth(seg(t, T.crack0, T.shatter)) * (0.75 + 0.25 * Math.sin(t * 40));
    // researcher: watches, steps back from the glass, then runs from the monitoring room
    const R = c.researcher;
    if (t < 14.8) { poseHuman(R, 0, 0, 0, 0); R.userData.armR.rotation.x = -0.9 + Math.sin(t * 3) * 0.12; }
    else if (t < 16.2) { R.position.x = 7.3 + 1.1 * smooth(seg(t, 14.8, 16.2)); poseHuman(R, t * 8, 0.3, -0.12, 0.35); }
    else if (t < 18.5) {
      const k = seg(t, 16.2, 18.2);
      R.position.set(lerp(8.4, 14.8, k), 0, lerp(5.6, 2.0, k)); R.rotation.y = -Math.PI / 2 - 0.4;
      poseHuman(R, t * 15, 1, 0.18, 0);
    } else R.visible = false;
    // restraints hold, strain, then give way
    vm.restrain = t < T.snap ? 1 - 0.1 * Math.sin(t * 19) * seg(t, 16.2, T.snap) : smooth(1 - seg(t, T.snap, T.snap + 0.45));
    once('shatter', T.shatter, () => {
      for (const m of c.cellFront) m.visible = false;
      c.crack.visible = false; c.spill.visible = true;
      a.play('shatter', { vol: 1 });
      g.addShake(0.45);
      const p = new THREE.Vector3(CELL.x, 1.6, CELL.z - 1.0);
      for (let i = 0; i < 90; i++) {
        g.effects.glowP.emit(p.x + (Math.random() - 0.5) * 1.0, p.y + (Math.random() - 0.5) * 2.4, p.z, (Math.random() - 0.5) * 6, Math.random() * 3 - 0.5, -2 - Math.random() * 6, 0.7 + Math.random() * 0.9, 0.05 + Math.random() * 0.06, 0.75, 0.92, 1, 9, 0.6);
      }
      g.effects.flashLight(p, 0xbfe8ff, 260, 0.35);
    });
    once('siren', T.siren, () => a.startSiren());
    once('officerIn', T.doorOpen, () => { L.doors.containment.open(); a.play('door', { vol: 0.9 }); c.officer.visible = true; L.pistol.visible = true; c.officer.userData.hand.add(L.pistol); L.pistol.position.set(0, 0, -0.02); L.pistol.rotation.set(-1.25, 0, 0); L.pistolLight.intensity = 0; });
    once('ai2', 19.8, () => this.say('Hostile loose in the containment bay!', 'SECURITY', 2.6));
    this.officer(t);
    once('shut', T.doorShut, () => { L.doors.containment.close(); a.play('door', { vol: 0.9 }); });
    once('ai3', 23.0, () => { c.display.set('breach'); });

    // --- 4 FIRST WEAPON: reach, envelop, dissolve, reconstruct ---
    if (t >= T.reach && !f.reach) {
      f.reach = true;
      const cam = g.camera;
      cam.updateMatrixWorld(true);
      L.pistol.updateMatrixWorld(true);
      this.pistolLocal = cam.worldToLocal(L.pistol.getWorldPosition(new THREE.Vector3()));
      this.pistolQuat = cam.quaternion.clone().invert().multiply(L.pistol.getWorldQuaternion(new THREE.Quaternion()));
      vm.reachTarget.copy(this.pistolLocal);
      vm.leftHidden = true;
    }
    if (f.reach) {
      vm.reachW = easeOut(seg(t, T.reach, T.grab)) * (1 - smooth(seg(t, T.settle + 0.3, T.settle + 1.4)));
      vm.curl = lerp(0.1, 1, smooth(seg(t, T.grab - 0.3, T.dissolve)));
    }
    if (t >= T.grab && !f.grab) {
      f.grab = true;
      L.pistol.visible = false;
      L.pistolLight.intensity = 0;
      this.pistolView = this.makeViewPistol();
      this.pistolView.position.copy(this.pistolLocal);
      this.pistolView.quaternion.copy(this.pistolQuat);
      vm.setPistol(this.pistolView);
      a.play('gel', { vol: 0.9 });
      vm.pulseGlow(0.5);
    }
    if (t >= T.dissolve && !f.dissolve) {
      f.dissolve = true;
      a.play('absorb', { vol: 0.9 });
      this.parts = this.pistolView.userData.parts.map((p, i) => {
        vm.right.tip.attach(p);
        return { p, p0: p.position.clone(), q0: p.quaternion.clone(), s0: p.scale.clone(), i };
      });
    }
    if (f.dissolve && !f.dissolved) {
      const k = smooth(seg(t, T.dissolve, T.form - 0.1));
      vm.frag = k;
      vm.pulse = Math.max(vm.pulse, 0.5 * Math.sin(k * Math.PI));
      for (const d of this.parts) {
        const fr = vm.right.frags[d.i];
        const kk = smooth(seg(k, d.i * 0.05, 0.6 + d.i * 0.05));
        d.p.position.lerpVectors(d.p0, fr.sp, kk);
        d.p.quaternion.slerpQuaternions(d.q0, fr.sq, kk);
        d.p.scale.copy(d.s0).multiplyScalar(1 - kk);
      }
      if (k >= 1) { f.dissolved = true; for (const d of this.parts) d.p.visible = false; }
    }
    once('form', T.form, () => a.play('crystal', { vol: 0.9 }));
    if (f.form) {
      const k = smooth(seg(t, T.form, T.settle));
      vm.crystal = k;
      vm.form = smooth(seg(t, T.form + 0.3, T.settle));
      vm.curl = lerp(1, 0, smooth(seg(t, T.form, T.form + 0.9)));
      if (t > T.form && t < T.settle) vm.pulse = Math.max(vm.pulse, 0.35);
    }
    once('learn', T.form + 0.4, () => this.say('It learns. It becomes.', '', 2.6, true));
    if (t >= T.settle) vm.leftHidden = false;

    // --- 5 LOCKDOWN AND GOAL ---
    once('ai4', T.settle + 1.0, () => { a.play('announce', { vol: 0.8 }); this.say('Specimen escaped. Automated security deployed. Lock down the research decks.', 'SHIP AI', 4.4); });
    once('goalLine', T.map + 0.6, () => this.say('The hangar. A ship. Home.', '', 3, true));
    once('goal', T.goal, () => ui.banner('ESCAPE THE RESEARCH DECKS\nREACH THE HANGAR', 'green goal', 4));
    if (t >= T.end) this.finish();
  }

  // the officer's choreography: bursts in, freezes, loses his sidearm, backs out
  officer(t) {
    const g = this.g, c = g.level.cut, O = c.officer, pistol = g.level.pistol, a = g.audio;
    if (!O.visible) return;
    const f = this.f;
    if (t < 20.6) { // run in
      const k = seg(t, T.doorOpen + 0.2, 20.6);
      O.position.z = lerp(-1.6, 3.0, k); O.rotation.y = Math.PI;
      const phase = t * 15;
      poseHuman(O, phase, 1, 0.12, 0);
      O.userData.armR.rotation.x = -1.25;
      if (Math.floor(phase / Math.PI) !== this.stride) { this.stride = Math.floor(phase / Math.PI); if (k > 0 && k < 1) a.play('step', { vol: 0.5 }); }
    } else if (t < T.drop) { // freeze, arms thrown up
      poseHuman(O, 0, 0, -0.18, seg(t, 20.6, T.drop - 0.1));
    } else if (t < T.drop + 1.6) { // back away, hands up
      const k = seg(t, T.drop + 0.1, T.drop + 1.6);
      O.position.z = lerp(3.0, -1.2, smooth(k)); O.rotation.y = Math.PI;
      poseHuman(O, t * 13, 0.9, -0.16, 0.7);
      if (Math.floor(t * 4.3) % 2 === 0 && Math.random() < 0.15) a.play('step', { vol: 0.4 });
    } else O.visible = false;
    // the pistol leaves his hand
    if (t >= T.drop && !f.dropped) {
      f.dropped = true;
      g.scene.attach(pistol);
      this.pFrom = pistol.position.clone();
      this.dropT = 0;
    }
    if (this.dropT >= 0) {
      this.dropT += this.dtLast || 1 / 60;
      const k = Math.min(1, this.dropT / 0.6);
      const land = new THREE.Vector3(PISTOL_POS.x, 0.07, PISTOL_POS.z);
      pistol.position.lerpVectors(this.pFrom, land, k);
      pistol.position.y += Math.sin(k * Math.PI) * 0.7;
      pistol.rotation.set(-1.25 + k * 6.5, 0.7 * k, 1.45 * k);
      if (k >= 1) {
        this.dropT = -1;
        pistol.rotation.set(0, 0.7, 1.45);
        a.play('land', { vol: 0.5 });
        g.level.pistolLight.intensity = 6;
      }
    }
  }

  makeViewPistol() {
    // same construction as the world pistol, scaled for the first-person pass
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
    vm.setPistol(null);
    vm.form = 1; vm.crystal = 1; vm.frag = 1; vm.curl = 0; vm.cineW = 0; vm.reachW = 0; vm.restrain = 0; vm.leftHidden = false;
    vm.recoil = vm.recoilVel = 0;
    // the breach is over: the cell stays broken, the door unlocks, alarms stop, nobody is left in view
    for (const m of c.cellFront) m.visible = false;
    c.crack.visible = false; c.crack.material.opacity = 0;
    c.spill.visible = true;
    c.display.set('breach');
    c.scannerArm.rotation.set(0, 0.22, 0);
    c.researcher.visible = false; c.officer.visible = false;
    if (L.pistol.parent !== g.scene) g.scene.attach(L.pistol);
    L.pistol.visible = false; L.pistolLight.intensity = 0;
    L.surge = 0; L.emergencyOn = false; L.alarm = false;
    L.doors.containment.open(skipped);
    if (!skipped) g.audio.play('unlock', { vol: 0.8 });
    g.audio.stopSiren();
    this.memoryEl(false);
    g.ui.clearSubtitle();
    g.player.reset(PLAYER_START.x, PLAYER_START.z, 0);
    if (!this.granted) { this.granted = true; g.weaponAcquired = true; } // Shardcaster is granted exactly once per run
    g.cinePose = null;
    g.ui.fade(0);
    g.ui.showSkip(false);
    g.input.pressed.clear();
    g.weapon.reset();
    g.beginPlay();
  }
}
