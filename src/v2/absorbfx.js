import * as THREE from 'three';
import { lerp, smooth, rand, clamp } from '../core/util.js';

// ABSORBING, with what you actually have: your two arms. They lash out and clamp on, haul it in, crush it, and it goes up the arms through the suckers in swallows you can see.
// About a second from start to finish, and you keep moving the whole time. The growth it causes happens on your body while you carry on fighting.
const LATCH = 0.15;          // the arms arrive
const HAUL = 0.42;           // how long it takes to drag it to you
const FEED0 = 0.3, FEED1 = 0.92;
const RELEASE = 0.9;         // the arms let go
const TOTAL = 1.08;
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Vector3(), _r = new THREE.Vector3();

export function beginV2(A, e) {
  const g = A.game, c = e.hitSpheres[0].c;
  e.absorbing = true; e.flashT = 0;
  A.drawing = { e, t: 0, from: e.pos.clone(), center: c.clone(), r: e.hitSpheres[0].r, cur: c.clone(), v2: true, latched: false, nextShard: FEED0, gulp: false, organic: !!e.organic };
  A.shardMat.color.set(e.organic ? 0x3a1c20 : 0x32383e); A.shardMat.emissive.set(e.organic ? 0x1a0606 : 0x1a1008); A.shardMat.emissiveIntensity = 0.7;
  g.audio.play('dash', { vol: 0.7 }); g.audio.play('gel', { vol: 0.35 });
  g.ui.setPrompt(''); g.ui.setHold(null);
}

export function runV2(A, dt) {
  const g = A.game, vm = g.viewmodel, fx = g.effects, D = A.drawing, e = D.e, cam = g.camera;
  D.t += dt; const t = D.t;
  cam.updateMatrixWorld();

  // ---- it is dragged toward you and crushed as it comes
  const m = smooth((t - LATCH * 0.6) / HAUL), out = smooth((t - 0.34) / (FEED1 - 0.34)), latched = t > LATCH;
  cam.getWorldDirection(_n);
  _q.copy(cam.position).addScaledVector(_n, 1.3); _q.y = Math.max(0.5, cam.position.y - 0.42);
  const cy = lerp(D.center.y, _q.y, m), dx = (_q.x - D.center.x) * m, dz = (_q.z - D.center.z) * m;
  const shudder = latched ? 0.03 * (1 - out) : 0, crumple = Math.sin(t * 26) * 0.09 * (1 - out) * m, base = e.baseScale;
  e.group.scale.set(Math.max(0.001, base * (1 - 0.94 * out) * (1 + crumple)), Math.max(0.001, base * (1 - 0.9 * out) * (1 - crumple)), Math.max(0.001, base * (1 - 0.94 * out) * (1 + crumple)));
  e.pos.set(D.from.x + dx + rand(-1, 1) * shudder, Math.max(0, D.from.y + (cy - D.center.y)), D.from.z + dz + rand(-1, 1) * shudder);
  D.cur.set(D.center.x + dx, cy, D.center.z + dz);
  e.group.rotation.z = Math.sin(t * 7) * 0.3 * m; e.group.rotation.x = -0.45 * m;
  for (const { mat } of e.flashMats) { const h = clamp(m * 0.8, 0, 1) * (0.7 + 0.3 * Math.sin(t * 40)); mat.emissive.setRGB(0.5 * h, 0.14 * h, 0.03 * h); mat.emissiveIntensity = 0.3 + 0.5 * h; }

  // ---- the arms
  const reachIn = smooth(t / LATCH), reachOut = 1 - smooth((t - RELEASE) / 0.17), w = 0.45 * reachIn * reachOut;
  _r.copy(cam.worldToLocal(_p.copy(D.cur)));
  vm.reachTarget.copy(_r); vm.reachTarget.x += 0.07; vm.reachW = w; vm.reachHeld = true;
  vm.reachTargetL.copy(_r); vm.reachTargetL.x -= 0.07; vm.reachWL = w;
  vm.gripK = smooth((t - LATCH * 0.8) / 0.12) * reachOut;

  if (latched && !D.latched) {
    D.latched = true;
    g.audio.play('hit', { vol: 0.75 }); g.audio.play('clatter', { vol: 0.5 }); g.addShake(0.16); g.kick = Math.min(0.05, (g.kick || 0) + 0.025);
    fx.hitSparks(D.cur, D.organic ? [0.5, 0.1, 0.08] : [1, 0.6, 0.25], D.organic ? 10 : 16);
  }

  // ---- swallows run up both arms, one after another, from the tip to the shoulder
  if (t >= FEED0 && t < FEED1) {
    const f = ((t - FEED0) * 3.4) % 1;
    vm.feedS = 1 - f; vm.feedG = 1.5 * Math.sin(Math.min(1, (t - FEED0) * 5) * 1.57);
    const beat = Math.floor((t - FEED0) * 3.4);
    if (beat !== D.lastBeat) { D.lastBeat = beat; g.audio.play('swallow', { vol: 0.42 }); g.addShake(0.018); vm.bulge = Math.max(vm.bulge, 0.3); }
    // what it is made of comes away where the arms hold it
    for (let i = 0; i < 2; i++) { const dark = D.organic; fx.glowP.emit(D.cur.x + rand(-1, 1) * D.r * 0.45, D.cur.y + rand(-1, 1) * D.r * 0.4, D.cur.z + rand(-1, 1) * D.r * 0.45, rand(-0.7, 0.7), rand(-1.2, 0.8), rand(-0.7, 0.7), rand(0.2, 0.42), rand(0.015, 0.035), dark ? 0.35 : 0.9, dark ? 0.06 : 0.5, dark ? 0.05 : 0.18, 2, 0.5); }
  } else vm.feedG = 0;

  // pieces of it, dragged up the arm along the skin
  if (t >= D.nextShard && t < FEED1 - 0.05) {
    D.nextShard = t + rand(0.05, 0.1);
    const sh = A.shards.find((q) => q.t < 0);
    if (sh) { sh.t = 0; sh.tg = Math.random() < 0.5 ? 0 : 1; sh.size = rand(0.012, 0.03); sh.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9)); sh.m.visible = true; }
  }
  for (const sh of A.shards) {
    if (sh.t < 0) continue;
    sh.t += dt / 0.34;
    if (sh.t >= 1) { sh.t = -1; sh.m.visible = false; continue; }
    const arm = sh.tg ? vm.left : vm.right;
    arm.root.updateWorldMatrix(true, false);
    arm.root.localToWorld(arm.pointLocal(0.98 - 0.72 * sh.t, sh.m.position));
    sh.m.position.y += 0.015 + 0.08 * (1 - sh.t) * 0;
    sh.m.scale.setScalar(sh.size * (1 - 0.6 * sh.t)); sh.m.rotation.x += sh.spin.x * dt; sh.m.rotation.y += sh.spin.y * dt;
  }
  g.absorbFov = -2.5 * m * reachOut;

  if (!D.gulp && t >= RELEASE) { D.gulp = true; vm.pulseGlow(0.8); g.addShake(0.08); g.audio.play('crystal', { vol: 0.35 }); }
  if (t >= TOTAL) A.finish(e);
}
