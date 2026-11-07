import * as THREE from 'three';
import { SpineArm } from './limbs.js';
import { smooth, rand } from '../core/util.js';

// What the two newer mutations do when you pull the trigger.
//   TENDON HOOK: the real arm shoots out along its cable and takes hold. A light machine is ripped off its feet toward you. Anything too heavy to move, and any surface, pulls you to it instead.
//   BLAST BLADDER: a cone of pressure. RAIL SPIKE: one needle through everything in a line. SEEKER: homing missiles. SEISMIC FIST: a wave along the floor.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Vector3();
const FLY = 0.13, BACKT = 0.16;
const smoothK = (a, b, x) => smooth((x - a) / (b - a));

export class Abilities {
  constructor(game) {
    this.g = game; this.h = null; this.missiles = []; this.waves = []; this.fades = []; this.later = []; this.group = new THREE.Group(); game.scene.add(this.group);
    this.misGeo = new THREE.CapsuleGeometry(0.06, 0.26, 4, 8).rotateX(Math.PI / 2);
    this.misMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, emissive: 0xff4a30, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.6 });
    this.ringGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
  }
  get busy() { return !!this.h; }

  reset() {
    if (this.h) this.endHook();
    for (const b of this.missiles) this.group.remove(b.m); this.missiles.length = 0;
    for (const f of this.fades) { this.group.remove(f.m); f.m.material.dispose(); } this.fades.length = 0;
    this.waves.length = 0; this.later.length = 0;
    const P = this.g.player; if (P) P.pull = null;
  }

  // ---------------------------------------------------------------- the hook
  hook(a, ti, kc) {
    const g = this.g, cam = g.camera; cam.updateMatrixWorld(); cam.getWorldDirection(_d); const o = cam.position, range = a.range[ti];
    let target = null, best = 0.965, bd = 1e9;
    for (const e of g.enemies) {
      if (!e.alive || e.absorbing || !e.hitSpheres?.[0]) continue;
      const c = e.hitSpheres[0].c; _a.subVectors(c, o); const dist = _a.length(); if (dist > range || dist < 1) continue;
      const dot = _a.divideScalar(dist).dot(_d); if (dot < best) continue;
      if (g.world.blocked(o.x, o.y, o.z, c.x, c.y, c.z, (b) => b.tag !== 'barrel')) continue;
      target = e; best = dot; bd = dist;
    }
    const point = new THREE.Vector3(); let mode = 'miss';
    if (target) { mode = target.variant === 'heavy' ? 'toEnemy' : 'yank'; point.copy(target.hitSpheres[0].c); }
    else {
      const hit = g.world.raycast(o.x, o.y, o.z, _d.x, _d.y, _d.z, range);
      if (hit) { mode = 'toWall'; point.copy(o).addScaledVector(_d, hit.t); }
      else point.copy(o).addScaledVector(_d, Math.min(range, 7));
    }
    if (!this.sp) this.sp = new SpineArm(g.scene, g.viewmodel.skinShared);
    const arm = g.viewmodel.right; this.sp.carry(arm.showing); this.sp.setVisible(true); this.hide(arm, true);
    this.h = { mode, target, point, t: 0, arm, dmg: a.dmg[ti] * kc, stun: a.stun[ti], latched: false, end: mode === 'miss' ? FLY + 0.04 : 0.8, from: target ? target.pos.clone() : null, pulling: false, done: false, backT: 0 };
    g.audio.play('dash', { vol: 0.8 }); g.addShake(0.05);
    return mode;
  }
  hide(arm, h) {
    arm.skin.visible = arm.suck.visible = !h; arm.grabHidden = h;
    for (const [id, G] of Object.entries(arm.growths)) for (const me of G.meshes) me.visible = !h && !!arm.showing && arm.showing.m.id === id;
  }
  endHook() { const H = this.h; if (!H) return; this.sp.setVisible(false); this.hide(H.arm, false); this.g.player.pull = null; this.h = null; }

  latch(H) {
    const g = this.g; H.latched = true; g.addShake(0.12);
    if (H.mode === 'miss') return;
    g.audio.play(H.target ? 'hit' : 'clatter', { vol: 0.7 });
    g.effects.hitSparks(H.point, [1, 0.62, 0.3], 10);
    if (H.target && H.target.alive) { g.onPlayerHit(H.target, H.dmg, H.point.clone()); if (H.target.alive) H.target.stagger?.(H.stun); }
    if (H.mode === 'yank' && !(H.target && H.target.alive)) { H.done = true; H.backT = 0; return; }
    if (H.mode === 'toWall' || H.mode === 'toEnemy') H.pulling = true;
    if (H.mode === 'yank') H.from = H.target.pos.clone();
    H.latchT = H.t;
  }

  updateHook(dt) {
    const H = this.h, g = this.g, P = g.player, cam = g.camera; H.t += dt;
    if (!H.latched && H.t >= FLY) this.latch(H);
    if (H.target && H.mode !== 'yank' && H.target.alive) H.point.copy(H.target.hitSpheres[0].c);
    if (H.latched && !H.done) {
      const since = H.t - H.latchT;
      if (H.mode === 'yank') {
        const e = H.target;
        if (!e || !e.alive) H.done = true;
        else {
          // ripped off its feet, across the room, to just in front of you
          const k = smooth(since / 0.24); cam.getWorldDirection(_d); _a.set(P.pos.x + _d.x * 1.7, 0, P.pos.z + _d.z * 1.7);
          e.pos.x = H.from.x + (_a.x - H.from.x) * k; e.pos.z = H.from.z + (_a.z - H.from.z) * k; e.vx = e.vz = 0;
          H.point.copy(e.hitSpheres[0].c).lerp(_a.setY(1), 0); e.syncSpheres?.(); H.point.copy(e.hitSpheres[0].c);
          if (since >= 0.24) { H.done = true; g.world.resolveCircle(e.pos, e.radius, 1.8, 0.3); }
        }
      } else if (H.pulling) {
        const dx = H.point.x - P.pos.x, dy = H.point.y - (P.pos.y + 1.0), dz = H.point.z - P.pos.z, dist = Math.hypot(dx, dy, dz);
        if (dist < (H.mode === 'toEnemy' ? 2.2 : 1.15) || since > 0.8) {
          H.done = true; P.pull = null; P.vy = Math.max(P.vy, 4.2);
          // hooked onto something with a top you can reach: the arm hauls you up and over it
          if (H.mode === 'toWall') {
            const hd = Math.hypot(dx, dz) || 1, ix = dx / hd, iz = dz / hd;
            const top = g.world.groundHeight(H.point.x + ix * 0.55, H.point.z + iz * 0.55, P.pos.y + 3.2, 0.1, 0.1);
            if (top > P.pos.y + 0.2 && top < P.pos.y + 3.2) { P.vy = Math.sqrt(2 * 27 * (top - P.pos.y + 0.35)); P.vault = { x: ix * 3.6, z: iz * 3.6, t: 0.5 }; }
          }
          if (H.mode === 'toEnemy' && H.target?.alive) { g.addShake(0.2); g.audio.play('hit', { vol: 0.7 }); }
        } else { P.pull = { x: dx / dist, y: dy / dist, z: dz / dist, speed: 24 }; }
      } else H.done = true;
    }
    if (H.mode === 'miss' && H.t >= FLY + 0.02) H.done = true;
    if (H.done) { H.backT += dt; if (H.backT >= BACKT) { this.endHook(); return; } }
    // ---- the arm itself: out along the line, to the point
    const sp = this.sp, arm = H.arm, S = sp.S, n = sp.seg; arm.root.updateWorldMatrix(true, false);
    arm.root.localToWorld(arm.pointLocal(0, _a)); cam.getWorldDirection(_d); _r.setFromMatrixColumn(cam.matrixWorld, 0); _u.setFromMatrixColumn(cam.matrixWorld, 1);
    const out = smooth(H.t / FLY) * (1 - smooth(H.backT / BACKT));
    _c.lerpVectors(_a, H.point, 0.45).addScaledVector(_r, 0.12).addScaledVector(_u, 0.1 * (1 - smoothK(0.1, 0.4, H.t)));
    for (let i = 0; i <= n; i++) {
      const s = i / n, w = Math.pow(s, 1.5), iw = 1 - w;
      _q.set(iw * iw * _a.x + 2 * iw * w * _c.x + w * w * H.point.x, iw * iw * _a.y + 2 * iw * w * _c.y + w * w * H.point.y, iw * iw * _a.z + 2 * iw * w * _c.z + w * w * H.point.z);
      arm.root.localToWorld(arm.pointLocal(s, _b)); S[i].lerpVectors(_b, _q, smooth((out - s * 0.2) / 0.8));
      sp.want[i].copy(cam.position).sub(S[i]).normalize(); sp.wantK[i] = 1;
    }
    sp.relax(); sp.write(); sp.tick();
    sp.U.uK.value = (0.95 * arm.U.uThick.value) * (1 - 0.36 * out);
  }

  // ---------------------------------------------------------------- the four newest arms
  // Where the arm is, where you are looking, and what is in the way: shared by all four.
  aimLine() {
    const g = this.g, cam = g.camera; cam.updateMatrixWorld(); g.viewmodel.syncToCamera(cam); g.viewmodel.muzzleWorld(_a); cam.getWorldDirection(_d);
    return { o: cam.position, d: _d, m: _a.clone() };
  }
  see(e, o) { const c = e.hitSpheres[0].c; return !this.g.world.blocked(o.x, o.y, o.z, c.x, c.y, c.z, (b) => b.tag !== 'barrel'); }
  push(e, dx, dz, k) { const l = Math.hypot(dx, dz) || 1; const m = e.variant === 'heavy' ? 0.3 : 1; e.pos.x += (dx / l) * k * m; e.pos.z += (dz / l) * k * m; this.g.world.resolveCircle?.(e.pos, e.radius, 1.8, 0.3); e.syncSpheres?.(); }

  // BLAST BLADDER: one cone, everything in it. The nearer it is, the harder it goes.
  blast(a, ti, kc) {
    const g = this.g, { o, d, m } = this.aimLine(), range = a.range[ti]; let hits = 0;
    for (const e of g.enemies) {
      if (!e.alive || e.absorbing || !e.hitSpheres?.[0]) continue;
      const c = e.hitSpheres[0].c; _b.subVectors(c, o); const dist = _b.length(); if (dist > range || dist < 0.05) continue;
      if (_b.divideScalar(dist).dot(d) < a.cone || !this.see(e, o)) continue;
      const fall = 1 - 0.5 * (dist / range);
      g.onPlayerHit(e, a.dmg[ti] * kc * fall, c.clone()); hits++;
      if (e.alive) { e.stagger?.(a.stun[ti] * fall); this.push(e, _b.x, _b.z, a.knock[ti] * fall); }
    }
    // the sound of it going, and the look: a pale shock ring, driven air, a flare at the nozzle
    for (let i = 0; i < 46; i++) { const sp = 6 + Math.random() * 10, sx = (Math.random() - 0.5) * 0.9, sy = (Math.random() - 0.5) * 0.6; g.effects.glowP.emit(m.x, m.y, m.z, (d.x + sx) * sp, (d.y + sy) * sp, (d.z + sx * 0.5) * sp, rand(0.18, 0.4), rand(0.04, 0.1), 0.9, 0.86, 0.8, 6, 0.4); }
    this.shock(m, d, 0.9, 0xf0e4d8);
    g.effects.flashLight(m, 0xf4e6d8, 22, 0.06);
    g.viewmodel.fireKick(); g.viewmodel.recoilVel += 7; g.viewmodel.bulge = 1; g.addShake(0.2);
    const P = g.player; P.pos.x -= d.x * 0.5; P.pos.z -= d.z * 0.5;
    g.audio.play('gel', { vol: 0.7 }); g.audio.play('impact', { vol: 0.55 }); g.audio.play('dash', { vol: 0.5 });
    if (hits) { g.hitStop = 0.04; }
  }

  // RAIL SPIKE: a line to the first wall; every machine on it is hit, all the way through.
  rail(a, ti, kc) {
    const g = this.g, { o, d, m } = this.aimLine(); let reach = a.range;
    const hit = g.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, a.range); if (hit) reach = hit.t;
    const list = [];
    for (const e of g.enemies) {
      if (!e.alive || e.absorbing || !e.hitSpheres?.[0]) continue;
      const s = e.hitSpheres[0], c = s.c; _b.subVectors(c, o); const t = _b.dot(d); if (t < 0 || t > reach) continue;
      _q.copy(o).addScaledVector(d, t); if (_q.distanceTo(c) > s.r + a.width) continue;
      list.push([t, e]);
    }
    list.sort((p, q) => p[0] - q[0]);
    for (const [, e] of list) { if (e.alive) { g.onPlayerHit(e, a.dmg[ti] * kc, e.hitSpheres[0].c.clone()); e.stagger?.(0.25); } }
    const end = o.clone().addScaledVector(d, reach);
    this.beam(m, end);
    g.effects.hitSparks(end, [1, 0.7, 0.35], 14); g.effects.flashLight(m, 0xffb060, 36, 0.09);
    g.viewmodel.fireKick(); g.viewmodel.recoilVel += 9; g.addShake(0.22);
    g.audio.play('shot', { vol: 0.9 }); g.audio.play('spark', { vol: 0.5 }); g.audio.play('impact', { vol: 0.4 });
    if (list.length) g.hitStop = 0.05;
  }
  beam(from, to) {
    const len = from.distanceTo(to), geo = new THREE.CylinderGeometry(0.07, 0.07, 1, 8, 1, true).rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }); mat.userData.noSnap = true;
    const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(from).lerp(to, 0.5); mesh.lookAt(to); mesh.scale.set(1, 1, len); mesh.frustumCulled = false; this.group.add(mesh);
    this.fades.push({ m: mesh, t: 0, life: 0.28, grow: 0 });
  }

  // SEEKER: missiles that leave slowly, turn toward the machine you were looking at, and go off where they arrive.
  seek(a, ti, kc) {
    const g = this.g, { o, d, m } = this.aimLine(); let lock = null, best = 0.7;
    for (const e of g.enemies) {
      if (!e.alive || e.absorbing || !e.hitSpheres?.[0]) continue;
      const c = e.hitSpheres[0].c; _b.subVectors(c, o); const dist = _b.length(); if (dist > 40 || dist < 1) continue;
      const dot = _b.divideScalar(dist).dot(d); if (dot > best) { best = dot; lock = e; }
    }
    const n = a.count[ti];
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * 0.22; _r.setFromMatrixColumn(g.camera.matrixWorld, 0);
      const vel = d.clone().addScaledVector(_r, spread).addScaledVector(_u.set(0, 1, 0), 0.25).normalize().multiplyScalar(a.speed * 0.8);
      const mesh = new THREE.Mesh(this.misGeo, this.misMat); mesh.position.copy(m); this.group.add(mesh);
      this.missiles.push({ m: mesh, vel, t: 0, target: lock, dmg: a.dmg[ti] * kc, radius: a.radius[ti], life: a.life, speed: a.speed, turn: a.turn, delay: 0.18 + i * 0.07 });
    }
    g.viewmodel.fireKick(); g.viewmodel.recoilVel += 3; g.addShake(0.08);
    g.effects.flashLight(m, 0xff7050, 16, 0.06);
    g.audio.play('dash', { vol: 0.7 }); g.audio.play('shot', { vol: 0.35 });
    for (let i = 0; i < 8; i++) g.effects.glowP.emit(m.x, m.y, m.z, d.x * 2 + rand(-1, 1), d.y * 2 + rand(0, 1), d.z * 2 + rand(-1, 1), 0.4, 0.03, 1, 0.5, 0.3, 6, 0.4);
  }
  explode(b) {
    const g = this.g, p = b.m.position; this.group.remove(b.m);
    for (const e of g.enemies) {
      if (!e.alive || e.absorbing || !e.hitSpheres?.[0]) continue;
      const c = e.hitSpheres[0].c, dist = c.distanceTo(p); if (dist > b.radius + e.hitSpheres[0].r) continue;
      g.onPlayerHit(e, b.dmg * (1 - 0.5 * Math.min(1, dist / b.radius)), c.clone()); if (e.alive) { e.stagger?.(0.4); this.push(e, c.x - p.x, c.z - p.z, 1.2); }
    }
    const P = g.player; if (Math.hypot(P.pos.x - p.x, (P.pos.y + 1) - p.y, P.pos.z - p.z) < b.radius * 0.7) g.damagePlayer(6, null);
    g.effects.hitSparks(p, [1, 0.55, 0.3], 22); g.effects.flashLight(p, 0xff8050, 40, 0.12);
    for (let i = 0; i < 30; i++) { const sp = 2 + Math.random() * 6; g.effects.glowP.emit(p.x, p.y, p.z, (Math.random() - 0.5) * sp, Math.random() * sp * 0.8, (Math.random() - 0.5) * sp, rand(0.3, 0.6), rand(0.04, 0.09), 1, 0.5, 0.2, 9, 0.5); }
    this.ring(p.x, Math.max(0.05, p.y - 0.05), p.z, b.radius, 0xff9060, 0.35);
    g.audio.play('impact', { vol: 0.9 }); g.audio.play('crack', { vol: 0.4 }); g.addShake(0.16);
  }

  // SEISMIC FIST: the arm comes down, and a wave leaves along the floor.
  slam(a, ti, kc) {
    const g = this.g, vm = g.viewmodel; vm.strike(a.dur, true); g.audio.play('dash', { vol: 0.6 });
    const cam = g.camera; cam.getWorldDirection(_d); const l = Math.hypot(_d.x, _d.z) || 1;
    this.later.push({ t: a.hitAt, fn: () => {
      const P = g.player; this.waves.push({ x: P.pos.x, z: P.pos.z, dx: _d.x / l, dz: _d.z / l, r: 0.6, max: a.range[ti], dmg: a.dmg[ti] * kc, stagger: a.stagger[ti], width: a.width, hit: new Set(), speed: 22 });
      g.addShake(0.35); g.hitStop = 0.05; g.audio.play('impact', { vol: 1 }); g.audio.play('crack', { vol: 0.6 });
      for (let i = 0; i < 24; i++) { const an = Math.random() * 6.28; g.effects.glowP.emit(P.pos.x + Math.cos(an) * 0.6, 0.1, P.pos.z + Math.sin(an) * 0.6, Math.cos(an) * 3, rand(1, 3), Math.sin(an) * 3, rand(0.3, 0.6), rand(0.05, 0.1), 0.7, 0.55, 0.4, 9, 0.5); }
    } });
  }

  // a flat ring on the floor, or an expanding shell, that fades
  ring(x, y, z, r, color, life) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }); mat.userData.noSnap = true;
    const m = new THREE.Mesh(this.ringGeo, mat); m.position.set(x, y + 0.04, z); m.scale.setScalar(0.3); this.group.add(m);
    this.fades.push({ m, t: 0, life, grow: r });
  }
  shock(at, dir, r, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }); mat.userData.noSnap = true;
    const m = new THREE.Mesh(this.ringGeo, mat); m.position.copy(at).addScaledVector(dir, 0.4); m.lookAt(at.clone().add(dir)); m.rotateX(Math.PI / 2); m.scale.setScalar(0.3); m.frustumCulled = false; this.group.add(m);
    this.fades.push({ m, t: 0, life: 0.22, grow: r * 3.2 });
  }
  updateWeapons(dt) {
    const g = this.g;
    for (let i = this.later.length - 1; i >= 0; i--) { const L = this.later[i]; L.t -= dt; if (L.t <= 0) { L.fn(); this.later.splice(i, 1); } }
    for (let i = this.fades.length - 1; i >= 0; i--) {
      const f = this.fades[i]; f.t += dt; const k = Math.min(1, f.t / f.life);
      if (f.grow) f.m.scale.setScalar(0.3 + f.grow * (1 - (1 - k) * (1 - k))); f.m.material.opacity = (f.grow ? 0.6 : 1) * (1 - k);
      if (k >= 1) { this.group.remove(f.m); f.m.material.dispose(); if (!f.grow) f.m.geometry.dispose(); this.fades.splice(i, 1); }
    }
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const b = this.missiles[i]; b.t += dt; const p = b.m.position;
      if (b.t > b.delay) {
        if (b.target && (!b.target.alive || b.target.absorbing)) b.target = null;
        if (!b.target) { let bd = 18; for (const e of g.enemies) { if (!e.alive || e.absorbing || !e.hitSpheres?.[0]) continue; const dd = e.hitSpheres[0].c.distanceTo(p); if (dd < bd) { bd = dd; b.target = e; } } }
        if (b.target) { _b.subVectors(b.target.hitSpheres[0].c, p).normalize(); b.vel.lerp(_b.multiplyScalar(b.speed), Math.min(1, b.turn * dt)); }
        const sp = b.vel.length(); if (sp < b.speed) b.vel.multiplyScalar(Math.min(b.speed / sp, 1 + dt * 4));
      }
      _a.copy(b.vel).normalize(); const step = b.vel.length() * dt, hit = g.world.raycast(p.x, p.y, p.z, _a.x, _a.y, _a.z, step + 0.1);
      let boom = !!hit || p.y < 0.1 || b.t > b.life;
      if (!boom) for (const e of g.enemies) if (e.alive && !e.absorbing && e.hitSpheres?.[0] && e.hitSpheres[0].c.distanceTo(p) < e.hitSpheres[0].r + 0.15) { boom = true; break; }
      if (boom) { this.explode(b); this.missiles.splice(i, 1); continue; }
      p.addScaledVector(b.vel, dt); b.m.lookAt(_c.copy(p).add(b.vel));
      if (Math.random() < dt * 60) g.effects.glowP.emit(p.x, p.y, p.z, rand(-0.2, 0.2), rand(-0.1, 0.3), rand(-0.2, 0.2), 0.35, 0.03, 1, 0.5, 0.25, 6, 0.3);
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; const prev = w.r; w.r += w.speed * dt; const px = w.x + w.dx * w.r, pz = w.z + w.dz * w.r;
      for (const e of g.enemies) {
        if (!e.alive || e.absorbing || w.hit.has(e) || e.flying || (e.pos.y || 0) > 1.2) continue;
        const rx = e.pos.x - w.x, rz = e.pos.z - w.z, along = rx * w.dx + rz * w.dz, side = Math.abs(rx * -w.dz + rz * w.dx);
        if (along < prev - 0.5 || along > w.r + 0.5 || side > w.width + along * 0.22 + e.radius) continue;
        w.hit.add(e); g.onPlayerHit(e, w.dmg, e.hitSpheres[0].c.clone()); if (e.alive) { e.stagger?.(w.stagger); this.push(e, w.dx, w.dz, 1.1); }
        g.effects.hitSparks(e.hitSpheres[0].c, [1, 0.7, 0.4], 12); g.audio.play('hit', { vol: 0.8 });
      }
      if (Math.random() < 0.9) for (let k = -2; k <= 2; k++) g.effects.glowP.emit(px - w.dz * k * (0.5 + w.r * 0.08), 0.08, pz + w.dx * k * (0.5 + w.r * 0.08), rand(-0.3, 0.3), rand(0.6, 1.6), rand(-0.3, 0.3), rand(0.25, 0.5), rand(0.05, 0.1), 0.75, 0.6, 0.42, 9, 0.5);
      if (w.r >= w.max) this.waves.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- every step
  update(dt) {
    const g = this.g;
    if (this.h) this.updateHook(dt);
    this.updateWeapons(dt);
  }
}
