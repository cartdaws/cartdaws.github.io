import * as THREE from 'three';
import { lerp, smooth, rand, clamp } from '../core/util.js';
import { SpineArm } from './limbs.js';

// ABSORBING, with what you actually have: your two arms. They lash out and coil round it, one high and one low, suckers inward, and it is taken in through the suckers.
// A MACHINE comes apart. It is hauled up off the floor and stripped piece by piece, each real part of it wrenched off and dragged into the coils, each one a hard lump of metal running up the arm. Fast, violent, sparks. Its power drains away.
// A LIVING THING goes soft. It is too heavy and too wet to lift: the arms squeeze it where it lies, the shell cracks, what is inside is drawn out in long slow swallows, and the empty shell is left behind.
// About a second from start to finish, and you keep moving the whole time. The change it causes then happens on your body while you carry on fighting.
const LATCH = 0.16;          // the arms arrive
const HAUL = 0.42;           // how long it takes to drag it to you
const FEED0 = 0.3, FEED1 = 0.92;
const RELEASE = 0.88;        // the arms let go
const TOTAL = 1.08;
const JOIN = 0.56;           // how far along the arm the coil begins
const BLUE = [0.04, 0.38, 1], EMBER = [0.07, 0.014, 0.004];
const TINT_METAL = new THREE.Vector3(0.11, 0.125, 0.14), TINT_FLESH = new THREE.Vector3(0.14, 0.025, 0.03);
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Vector3(), _T = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _a = new THREE.Vector3(), _c = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();

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
  const organic = !!e.organic;
  A.drawing = {
    e, t: 0, from, off: mid.clone().sub(from), axis, half, r: s0.r, width: Math.min(0.42, s0.r * 0.72), cur: new THREE.Vector3(), rx0: e.group.rotation.x, rz0: e.group.rotation.z,
    latched: false, gulp: false, organic, lastBeat: -1, pieces: [], tear: [], tearI: 0, nextDrip: 0,
    arms: [{ arm: vm.right, sp: A.grab[0], sg: 1, h0: organic ? 0.75 : 0.95, h1: organic ? 0.2 : 0.1, pS: -1 }, { arm: vm.left, sp: A.grab[1], sg: -1, h0: organic ? -0.2 : -0.95, h1: organic ? 0.55 : -0.1, pS: -1 }],
  };
  const D = A.drawing;
  for (const a of D.arms) { a.sp.carry(a.arm.showing); a.sp.setVisible(true); hideReal(a.arm, true); a.sp.U.uTint.value.copy(organic ? TINT_FLESH : TINT_METAL); a.sp.U.uGain.value = 0; }
  if (!organic) {
    // every part of the machine, the outermost first, on its own moment
    const list = []; e.group.updateWorldMatrix(true, true);
    e.group.traverse((o) => { if (o.isMesh) { o.getWorldPosition(_w); list.push({ o, d: _w.distanceTo(mid) + rand(0, 0.18) }); } });
    list.sort((p, q) => q.d - p.d);
    list.forEach((it, i) => { it.at = 0.2 + 0.66 * Math.pow(i / Math.max(1, list.length - 1), 0.85); });
    D.tear = list;
  }
  g.audio.play('dash', { vol: 0.7 }); g.audio.play(organic ? 'swallow' : 'gel', { vol: organic ? 0.5 : 0.35 });
  g.ui.setPrompt(''); g.ui.setHold(null);
}

function clearPieces(g, D) { for (const p of D.pieces) g.scene.remove(p.o); D.pieces.length = 0; }

export function endV2(A) {
  const D = A.drawing; if (!D || !D.arms) return;
  clearPieces(A.game, D);
  for (const a of D.arms) { a.sp.setVisible(false); a.sp.U.uGain.value = 0; hideReal(a.arm, false); }
}

// The emptied shell stays where it was, and sinks away after a while.
export function tickV2(A, dt) {
  if (!A.residue) return;
  for (let i = A.residue.length - 1; i >= 0; i--) {
    const r = A.residue[i]; r.t += dt;
    if (r.t > 7) r.o.position.y -= dt * 0.25;
    if (r.t > 9) { A.game.scene.remove(r.o); A.residue.splice(i, 1); }
  }
}
export function clearResidue(A) { if (A.residue) { for (const r of A.residue) A.game.scene.remove(r.o); A.residue.length = 0; } }

export function runV2(A, dt) {
  const g = A.game, fx = g.effects, D = A.drawing, e = D.e, cam = g.camera;
  D.t += dt; const t = D.t, organic = D.organic;
  cam.updateMatrixWorld();

  // ---- the body itself
  const m = smooth((t - LATCH * 0.7) / (organic ? 0.7 : HAUL)), out = smooth((t - 0.34) / (FEED1 - 0.34)), latched = t > LATCH;
  const melt = organic ? smooth((t - 0.22) / 0.72) : 0, sc = organic ? 1 : 1 - 0.75 * out;
  cam.getWorldDirection(_n);
  if (organic) { _q.set(_n.x, 0, _n.z).normalize(); _q.multiplyScalar(1.9).add(cam.position); _q.y = D.from.y + D.off.y; }      // too heavy to lift: it is dragged along the floor
  else { _q.copy(cam.position).addScaledVector(_n, 1.6); _q.y = Math.max(0.55, cam.position.y - 0.52); }
  const crumple = Math.sin(t * 26) * (organic ? 0.03 : 0.1) * (1 - out) * m, base = e.baseScale, ox = D.off.x * sc, oy = D.off.y * sc, oz = D.off.z * sc;
  e.pos.set(lerp(D.from.x, _q.x - ox, m * (organic ? 0.45 : 1)), Math.max(0, lerp(D.from.y, _q.y - oy, m)), lerp(D.from.z, _q.z - oz, m * (organic ? 0.45 : 1)));
  e.group.scale.set(Math.max(0.001, base * sc * (1 + crumple)), Math.max(0.001, base * (organic ? 1 : 1 - 0.7 * out) * (1 - crumple)), Math.max(0.001, base * sc * (1 + crumple)));
  e.group.rotation.x = D.rx0; e.group.rotation.z = D.rz0 + (latched && !organic ? Math.sin(t * 31) * 0.06 * (1 - out) : 0);
  _T.set(e.pos.x + ox, e.pos.y + oy, e.pos.z + oz); D.cur.copy(_T);
  if (organic) {
    if (e.uMelt) e.uMelt.value = melt;
    for (const { mat } of e.flashMats) { mat.emissive.setRGB(0.03 * melt, 0.002 * melt, 0.002 * melt); mat.emissiveIntensity = 1; }
  } else {
    // the power that was left in it drains away while it is held, and the metal heats where it is being torn
    const drain = smooth((t - 0.12) / 0.45), fl = 0.86 + 0.14 * Math.sin(t * 38);
    for (const { mat } of e.flashMats) { mat.emissive.setRGB(lerp(BLUE[0], EMBER[0], drain) * fl, lerp(BLUE[1], EMBER[1], drain) * fl, lerp(BLUE[2], EMBER[2], drain) * fl); mat.emissiveIntensity = lerp(0.6, 0.55, drain); }
  }

  // ---- the arms
  const flat = organic ? 1 - 0.5 * melt : 1, turn = lerp(0.25, organic ? 1.05 : 1.25, smooth((t - LATCH * 0.55) / 0.2)), width = (organic ? D.width * (1 + 0.2 * melt) : D.width * Math.max(0.3, sc)) + 0.09;
  _e1.set(1, 0, 0); if (Math.abs(D.axis.x) > 0.8) _e1.set(0, 0, 1); _e1.addScaledVector(D.axis, -_e1.dot(D.axis)).normalize(); _e2.crossVectors(D.axis, _e1);
  _u.setFromMatrixColumn(cam.matrixWorld, 1); _r.setFromMatrixColumn(cam.matrixWorld, 0);
  for (const a of D.arms) {
    const sp = a.sp, S = sp.S, seg = sp.seg, arm = a.arm;
    arm.root.updateWorldMatrix(true, false);
    arm.root.localToWorld(arm.pointLocal(0, _a));
    _p.subVectors(_a, _T); const th0 = Math.atan2(_p.dot(_e2), _p.dot(_e1)) - a.sg * 0.5, half = D.half * (organic ? flat : Math.max(0.3, sc));
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
    // ---- what it took travels up the arm under the skin, from the coil to the shoulder
    if (organic && t >= FEED0 && t < FEED1 && a.pS < 0) { a.pS = JOIN + 0.2; }
    if (a.pS >= 0) { a.pS -= dt * (organic ? 1.25 : 2.4); sp.U.uPump.value = a.pS; sp.U.uGain.value = (organic ? 0.95 : 0.6) * Math.min(1, a.pS * 5); if (a.pS < 0) sp.U.uGain.value = 0; } else sp.U.uGain.value = 0;
  }

  if (latched && !D.latched) {
    D.latched = true;
    g.addShake(organic ? 0.08 : 0.16); g.kick = Math.min(0.05, (g.kick || 0) + (organic ? 0.012 : 0.025));
    if (organic) { g.audio.play('crack', { vol: 0.7 }); g.audio.play('gel', { vol: 0.7 }); }
    else { g.audio.play('hit', { vol: 0.75 }); g.audio.play('clatter', { vol: 0.5 }); fx.hitSparks(D.cur, [1, 0.6, 0.25], 16); }
  }

  // ---- A MACHINE: part after part wrenched off and dragged in
  while (D.tearI < D.tear.length && t >= D.tear[D.tearI].at) {
    const it = D.tear[D.tearI++], o = it.o;
    g.scene.attach(o);
    const arm = o.position.distanceToSquared(D.arms[0].sp.S[Math.round(D.arms[0].sp.seg * 0.75)]) < o.position.distanceToSquared(D.arms[1].sp.S[Math.round(D.arms[1].sp.seg * 0.75)]) ? D.arms[0] : D.arms[1];
    D.pieces.push({ o, t: 0, dur: rand(0.13, 0.22), from: o.position.clone(), s0: o.scale.clone(), arm, idx: Math.round(arm.sp.seg * rand(0.62, 0.9)), spin: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)) });
    if (D.tearI % 5 === 0) { fx.hitSparks(o.position, [1, 0.62, 0.28], 5); g.addShake(0.02); }
    if (D.tearI % 9 === 0) g.audio.play('clatter', { vol: 0.32 });
    if (D.tearI % 14 === 0) g.audio.play('spark', { vol: 0.3 });
  }
  for (let i = D.pieces.length - 1; i >= 0; i--) {
    const p = D.pieces[i]; p.t += dt / p.dur;
    const k = Math.min(1, p.t), ek = k * k;
    p.o.position.lerpVectors(p.from, p.arm.sp.S[p.idx], ek);
    p.o.scale.copy(p.s0).multiplyScalar(1 - 0.82 * ek);
    p.o.rotation.x += p.spin.x * dt; p.o.rotation.y += p.spin.y * dt; p.o.rotation.z += p.spin.z * dt;
    if (k >= 1) {
      g.scene.remove(p.o); D.pieces.splice(i, 1);
      if (p.arm.pS < 0) { p.arm.pS = JOIN + 0.1; g.audio.play('swallow', { vol: 0.24 }); }     // each lump starts its way up the arm
    }
  }

  // ---- A LIVING THING: it runs out. Long swallows, and what will not be held drips from the coils
  if (organic && t >= FEED0 && t < FEED1) {
    const beat = Math.floor((t - FEED0) * 2.2);
    if (beat !== D.lastBeat) { D.lastBeat = beat; g.audio.play('swallow', { vol: 0.55 }); g.addShake(0.022); }
    if (t >= D.nextDrip) {
      D.nextDrip = t + 0.018;
      const an = rand(0, 6.28), rr = width * rand(0.7, 1.05);
      fx.glowP.emit(D.cur.x + Math.cos(an) * rr, Math.max(0.05, D.cur.y + rand(-0.1, 0.15)), D.cur.z + Math.sin(an) * rr, rand(-0.3, 0.3), rand(-0.6, 0.2), rand(-0.3, 0.3), rand(0.3, 0.55), rand(0.012, 0.03), 0.17, 0.025, 0.025, 7, 0.2);
    }
  }
  g.absorbFov = -2.5 * m * (1 - smooth((t - RELEASE) / (TOTAL - RELEASE)));

  if (!D.gulp && t >= RELEASE) { D.gulp = true; g.addShake(0.08); g.audio.play('swallow', { vol: 0.6 }); }
  if (t >= TOTAL) {
    if (organic && e.shell) {
      const husk = new THREE.Mesh(e.shell.geometry, e.shell.material); e.shell.getWorldPosition(husk.position); e.shell.getWorldQuaternion(husk.quaternion); e.shell.getWorldScale(husk.scale);
      husk.castShadow = true; g.scene.add(husk); (A.residue || (A.residue = [])).push({ o: husk, t: 0 });
    }
    endV2(A); A.finish(e);
  }
}
