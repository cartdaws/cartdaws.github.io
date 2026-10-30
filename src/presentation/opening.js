import * as THREE from 'three';
import { lerp, smooth, seg, easeOut } from '../core/util.js';
import { makePistol, PISTOL_POS, PLAYER_START } from '../world/level.js';

// Camera keyframes: [time, x, y, z, yaw, pitch]
const EYE = 1.6;
const P1 = new THREE.Vector3(0.95, 1.05, 6.45);
const pdx = PISTOL_POS.x - P1.x, pdz = PISTOL_POS.z - P1.z, pdy = 0.07 - P1.y;
const YAW_P = Math.atan2(-pdx, -pdz);
const PITCH_P = Math.atan2(pdy, Math.hypot(pdx, pdz));
const KEYS = [
  [0.0, PLAYER_START.x, EYE, PLAYER_START.z, -1.15, 0.03],
  [1.4, PLAYER_START.x, EYE, PLAYER_START.z, -1.0, 0.05],
  [3.0, PLAYER_START.x, EYE, PLAYER_START.z, 0.0, 0.0],
  [3.5, PLAYER_START.x, EYE, PLAYER_START.z, 0.0, 0.0],
  [4.7, P1.x, P1.y, P1.z, YAW_P, PITCH_P],
  [9.2, P1.x, P1.y, P1.z, YAW_P, PITCH_P],
  [10.2, PLAYER_START.x, EYE, PLAYER_START.z, 0, 0],
];
const T = { door: 1.0, reach: 4.7, grab: 5.7, dissolve: 6.5, form: 7.9, settle: 9.2, end: 10.2 };

// The skippable in-engine opening. All visual state is derived from time, so skipping lands in the same final state.
export class Opening {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.t = 0;
    this.pose = { x: 0, y: EYE, z: 0, yaw: 0, pitch: 0 };
  }

  start() {
    const g = this.g;
    this.active = true;
    this.t = 0;
    this.flags = {};
    this.parts = null;
    this.pistolView = makePistol(1.25);
    this.pistolView.visible = false;
    g.viewmodel.setPistol(this.pistolView);
    g.level.pistol.visible = true;
    g.level.doors.containment.open(true);
    g.level.emergencyOn = true;
    const vm = g.viewmodel;
    vm.form = 0; vm.crystal = 0; vm.frag = 0; vm.curl = 0.1; vm.cineW = 1;
    vm.reachW = 0;
    g.player.reset(PLAYER_START.x, PLAYER_START.z, 0);
    g.weaponAcquired = false;
    this.samplePose(0);
    g.ui.fade(1);
    g.ui.showSkip(true);
  }

  samplePose(t) {
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const k = smooth(seg(t, a[0], b[0]));
    const p = this.pose;
    p.x = lerp(a[1], b[1], k); p.y = lerp(a[2], b[2], k); p.z = lerp(a[3], b[3], k);
    p.yaw = lerp(a[4], b[4], k); p.pitch = lerp(a[5], b[5], k);
  }

  update(dt) {
    if (!this.active) return;
    const g = this.g, vm = g.viewmodel, f = this.flags;
    this.t += dt;
    const t = this.t;
    this.samplePose(t);
    g.ui.fade(1 - seg(t, 0, 1.0));

    if (t >= T.door && !f.door) {
      f.door = true;
      g.level.doors.containment.close();
      g.audio.play('door', { vol: 0.8 });
    }

    if (t >= T.reach && !f.reach) {
      f.reach = true;
      const cam = g.camera;
      cam.updateMatrixWorld(true);
      this.pistolLocal = cam.worldToLocal(g.level.pistol.getWorldPosition(new THREE.Vector3()));
      this.pistolQuat = cam.quaternion.clone().invert().multiply(g.level.pistol.quaternion);
      vm.reachTarget.copy(this.pistolLocal);
    }
    if (f.reach) {
      vm.reachW = easeOut(seg(t, T.reach, T.grab)) * (1 - smooth(seg(t, T.settle, T.end)));
      vm.curl = lerp(0.1, 1, smooth(seg(t, T.grab - 0.3, T.dissolve)));
    }

    if (t >= T.grab && !f.grab) {
      f.grab = true;
      g.level.pistol.visible = false;
      g.level.pistolLight.intensity = 0;
      this.pistolView.position.copy(this.pistolLocal);
      this.pistolView.quaternion.copy(this.pistolQuat);
      this.pistolView.visible = true;
      g.audio.play('gel', { vol: 0.9 });
      vm.pulseGlow(0.5);
    }

    if (t >= T.dissolve && !f.dissolve) {
      f.dissolve = true;
      g.audio.play('absorb', { vol: 0.9 });
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

    if (t >= T.form && !f.form) {
      f.form = true;
      g.audio.play('crystal', { vol: 0.9 });
    }
    if (f.form) {
      const k = smooth(seg(t, T.form, T.settle));
      vm.crystal = k;
      vm.form = smooth(seg(t, T.form + 0.3, T.settle));
      vm.curl = lerp(1, 0, smooth(seg(t, T.form, T.form + 0.9)));
      if (t > T.form && t < T.settle) vm.pulse = Math.max(vm.pulse, 0.35);
    }

    if (t >= T.settle) vm.cineW = 1 - smooth(seg(t, T.settle, T.end));
    if (t >= T.end) this.finish();
  }

  skip() { if (this.active) this.finish(true); }

  // Single path to the final playable state, used by both natural completion and skipping.
  finish(skipped = false) {
    const g = this.g, vm = g.viewmodel;
    this.active = false;
    if (this.parts) for (const d of this.parts) d.p.removeFromParent();
    vm.setPistol(null);
    vm.form = 1; vm.crystal = 1; vm.frag = 1; vm.curl = 0; vm.cineW = 0; vm.reachW = 0;
    vm.recoil = vm.recoilVel = 0;
    g.level.pistol.visible = false;
    g.level.pistolLight.intensity = 0;
    g.level.emergencyOn = false;
    g.level.doors.containment.open(skipped);
    if (!skipped) g.audio.play('unlock', { vol: 0.8 });
    g.player.reset(PLAYER_START.x, PLAYER_START.z, 0);
    g.weaponAcquired = true;
    g.cinePose = null;
    g.ui.fade(0);
    g.ui.showSkip(false);
    g.input.pressed.clear();
    g.beginPlay();
  }
}
