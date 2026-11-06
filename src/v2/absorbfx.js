import * as THREE from 'three';
import { lerp, smooth, rand, clamp } from '../core/util.js';
import { SpineArm } from './limbs.js';

// ABSORBING, with what you actually have: your two arms. They lash out and coil round it, one high and one low, suckers inward, and haul it to you. It crumples inside the coils, and what is left of it goes up the arms in swallows you can see.
// About a second from start to finish, and you keep moving the whole time. The change it causes then happens on your body while you carry on fighting.
const LATCH = 0.16;          // the arms arrive
const HAUL = 0.42;           // how long it takes to drag it to you
const FEED0 = 0.3, FEED1 = 0.92;
const RELEASE = 0.88;        // the arms let go
const TOTAL = 1.08;
const JOIN = 0.56;           // how far along the arm the coil begins
const BLUE = [0.04, 0.38, 1], EMBER = [0.07, 0.014, 0.004];
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Vector3(), _T = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _a = new THREE.Vector3(), _c = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();

// the real arms step aside while their copies, which can take any shape, do the holding
function hideReal(arm, hide) {
  arm.skin.visible = arm.suck.visible = !hide;
  arm.grabHidden = hide;
  for (const [id, G] of Object.entries(arm.growths)) for (const me of G.meshes) me.visible = !hide && !!arm.showing && arm.showing.m.id === id;
}

export function beginV2(A, e) {
  const g = A.game, vm = g.viewmodel, s0 = e.hitSpheres[0], s1 = e.hitSpheres[1];
  if (!A.grab) A.grab = [new SpineArm(g.scene, vm.skinShared), new SpineArm(g.scene, vm.skinShared)];
  const from = e.pos.clone(), mid = s1 ? s0.c.clone().add(s1.c).multiplyScalar(0.5) : s0.c.clone(), axis = s1 ? s0.c.clone().sub(s1.c) : new THREE.Vector3(0, 1, 0);
  const half = s1 ? axis.length() * 0.62 : s0.r * 0.6; axis.normalize();
  e.absorbing = true; e.flashT = 0;
  A.drawing = {
    e, t: 0, from, off: mid.sub(from), axis, half, r: s0.r, width: Math.min(0.42, s0.r * 0.72), cur: new THREE.Vector3(), rx0: e.group.rotation.x, rz0: e.group.rotation.z,
    latched: false, gulp: false, organic: !!e.organic, lastBeat: -1,
    arms: [{ arm: vm.right, sp: A.grab[0], sg: 1, h0: 0.95, h1: 0.1 }, { arm: vm.left, sp: A.grab[1], sg: -1, h0: -0.95, h1: -0.1 }],
  };
  for (const a of A.drawing.arms) { a.sp.carry(a.arm.showing); a.sp.setVisible(true); hideReal(a.arm, true); }
  g.audio.play('dash', { vol: 0.7 }); g.audio.play('gel', { vol: 0.35 });
  g.ui.setPrompt(''); g.ui.setHold(null);
}

export function endV2(A) {
  const D = A.drawing; if (!D || !D.arms) return;
  for (const a of D.arms) { a.sp.setVisible(false); hideReal(a.arm, false); }
}

export function runV2(A, dt) {
  const g = A.game, vm = g.viewmodel, fx = g.effects, D = A.drawing, e = D.e, cam = g.camera;
  D.t += dt; const t = D.t;
  cam.updateMatrixWorld();

  // ---- it is dragged to you, crumpling in the arms' grip
  const m = smooth((t - LATCH * 0.7) / HAUL), out = smooth((t - 0.34) / (FEED1 - 0.34)), latched = t > LATCH, sc = 1 - 0.9 * out;
  cam.getWorldDirection(_n);
  _q.copy(cam.position).addScaledVector(_n, 1.6); _q.y = Math.max(0.55, cam.position.y - 0.52);
  const crumple = Math.sin(t * 26) * 0.1 * (1 - out) * m, base = e.baseScale, ox = D.off.x * sc, oy = D.off.y * sc, oz = D.off.z * sc;
  e.pos.set(lerp(D.from.x, _q.x - ox, m), Math.max(0, lerp(D.from.y, _q.y - oy, m)), lerp(D.from.z, _q.z - oz, m));
  e.group.scale.set(Math.max(0.001, base * sc * (1 + crumple)), Math.max(0.001, base * (1 - 0.86 * out) * (1 - crumple)), Math.max(0.001, base * sc * (1 + crumple)));
  e.group.rotation.x = D.rx0; e.group.rotation.z = D.rz0 + (latched ? Math.sin(t * 31) * 0.06 * (1 - out) : 0);
  _T.set(e.pos.x + ox, e.pos.y + oy, e.pos.z + oz); D.cur.copy(_T);
  // the power that was left in it drains away while it is held, and the metal heats as it is crushed
  const drain = smooth((t - 0.12) / 0.45), fl = 0.86 + 0.14 * Math.sin(t * 38);
  for (const { mat } of e.flashMats) { if (D.organic) { mat.emissive.setRGB(0.05 * drain, 0.004 * drain, 0.004 * drain); mat.emissiveIntensity = 1; mat.color && !mat.userData.bruised && (mat.userData.bruised = true); } else { mat.emissive.setRGB(lerp(BLUE[0], EMBER[0], drain) * fl, lerp(BLUE[1], EMBER[1], drain) * fl, lerp(BLUE[2], EMBER[2], drain) * fl); mat.emissiveIntensity = lerp(0.6, 0.55, drain); } }

  // ---- the arms
  const turn = lerp(0.25, 1.25, smooth((t - LATCH * 0.55) / 0.2)), width = D.width * sc + 0.09;
  _e1.set(1, 0, 0); if (Math.abs(D.axis.x) > 0.8) _e1.set(0, 0, 1); _e1.addScaledVector(D.axis, -_e1.dot(D.axis)).normalize(); _e2.crossVectors(D.axis, _e1);
  _u.setFromMatrixColumn(cam.matrixWorld, 1); _r.setFromMatrixColumn(cam.matrixWorld, 0);
  for (const a of D.arms) {
    const sp = a.sp, S = sp.S, seg = sp.seg, arm = a.arm;
    arm.root.updateWorldMatrix(true, false);
    arm.root.localToWorld(arm.pointLocal(0, _a));
    _p.subVectors(_a, _T); const th0 = Math.atan2(_p.dot(_e2), _p.dot(_e1)) - a.sg * 0.5, half = D.half * sc;
    _c.lerpVectors(_a, _T, 0.5).addScaledVector(_r, a.sg * 0.26).addScaledVector(_u, 0.18);
    for (let i = 0; i <= seg; i++) {
      const s = i / seg, g0 = sp.G[i];
      if (s < JOIN) {
        // out from the shoulder toward where the coil begins
        const w = Math.pow(s / JOIN, 1.7), th = th0, h = half * a.h0;      // most of the stretch goes in the far end of the reach, where it is small: near your eye the suckers keep their shape
        _p.copy(_T).addScaledVector(_e1, Math.cos(th) * width).addScaledVector(_e2, Math.sin(th) * width).addScaledVector(D.axis, h);
        const iw = 1 - w; g0.set(iw * iw * _a.x + 2 * iw * w * _c.x + w * w * _p.x, iw * iw * _a.y + 2 * iw * w * _c.y + w * w * _p.y, iw * iw * _a.z + 2 * iw * w * _c.z + w * w * _p.z);
        sp.want[i].copy(cam.position).sub(g0).normalize(); sp.wantK[i] = 1;     // the pale underside toward you, as it is on the arm it replaces
      } else {
        const u = (s - JOIN) / (1 - JOIN), th = th0 + a.sg * turn * Math.PI * 2 * u, h = half * (a.h0 + (a.h1 - a.h0) * u), rc = width * (1 - 0.12 * u);
        g0.copy(_T).addScaledVector(_e1, Math.cos(th) * rc).addScaledVector(_e2, Math.sin(th) * rc).addScaledVector(D.axis, h);
        // the suckers face in
        sp.want[i].copy(_T).addScaledVector(D.axis, h).sub(g0).normalize(); sp.wantK[i] = Math.min(1, u * 5);
      }
      // the shoulder leads and the tip follows; on the way home, the tip lets go first
      const kin = smooth((t - s * 0.05) / LATCH), kout = smooth((t - RELEASE - (1 - s) * 0.05) / (TOTAL - RELEASE - 0.05)), k = kin * (1 - kout);
      arm.root.localToWorld(arm.pointLocal(s, _p)); S[i].lerpVectors(_p, g0, k);
    }
    sp.relax(); sp.write(); sp.tick();
    // thick as the real arm at the moment they swap, then drawn out thinner as it stretches to reach
    { const real = 0.95 * arm.U.uThick.value, kk = smooth(t / (LATCH * 0.8)) * (1 - smooth((t - RELEASE) / (TOTAL - RELEASE))); sp.U.uK.value = lerp(real, 0.74, kk); }
    // ---- swallows run up the arm, one after another, from the tip to the shoulder
    if (t >= FEED0 && t < FEED1) { const f = ((t - FEED0) * 3.4 + (a.sg > 0 ? 0 : 0.5)) % 1; sp.U.uPump.value = 1 - f; sp.U.uGain.value = 0.62 * Math.min(1, (t - FEED0) * 6) * Math.min(1, (FEED1 - t) * 8); } else sp.U.uGain.value = 0;
  }

  if (latched && !D.latched) {
    D.latched = true;
    g.audio.play('hit', { vol: 0.75 }); g.audio.play('clatter', { vol: 0.5 }); g.addShake(0.16); g.kick = Math.min(0.05, (g.kick || 0) + 0.025);
    fx.hitSparks(D.cur, D.organic ? [0.5, 0.1, 0.08] : [1, 0.6, 0.25], D.organic ? 10 : 16);
  }
  if (t >= FEED0 && t < FEED1) {
    const beat = Math.floor((t - FEED0) * 3.4);
    if (beat !== D.lastBeat) { D.lastBeat = beat; g.audio.play('swallow', { vol: 0.42 }); g.addShake(0.018); }
    // what it is made of comes away where the arms hold it
    for (let i = 0; i < 2; i++) { const dark = D.organic; fx.glowP.emit(D.cur.x + rand(-1, 1) * width, D.cur.y + rand(-1, 1) * width, D.cur.z + rand(-1, 1) * width, rand(-0.7, 0.7), rand(-1.2, 0.8), rand(-0.7, 0.7), rand(0.2, 0.42), rand(0.012, 0.03), dark ? 0.32 : 0.8, dark ? 0.05 : 0.36, dark ? 0.04 : 0.1, 2, 0.5); }
  }

  g.absorbFov = -2.5 * m * (1 - smooth((t - RELEASE) / (TOTAL - RELEASE)));

  if (!D.gulp && t >= RELEASE) { D.gulp = true; g.addShake(0.08); g.audio.play('swallow', { vol: 0.6 }); }
  if (t >= TOTAL) { endV2(A); A.finish(e); }
}
