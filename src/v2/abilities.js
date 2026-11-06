import * as THREE from 'three';
import { SpineArm } from './limbs.js';
import { smooth, rand } from '../core/util.js';

// What the two newer mutations do when you pull the trigger.
//   TENDON HOOK: the real arm shoots out along its cable and takes hold. A light machine is ripped off its feet toward you. Anything too heavy to move, and any surface, pulls you to it instead.
//   ACID GLAND: the arm spits a glob on a slow arc. Where it lands it leaves a pool that eats machines, slows them and leaves them taking more from everything. It does not care whose feet are in it.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Vector3();
const FLY = 0.13, BACKT = 0.16;
const smoothK = (a, b, x) => smooth((x - a) / (b - a));

export class Abilities {
  constructor(game) {
    this.g = game; this.h = null; this.globs = []; this.pools = []; this.group = new THREE.Group(); game.scene.add(this.group);
    this.globGeo = new THREE.SphereGeometry(0.14, 14, 10);
    this.globMat = new THREE.MeshStandardMaterial({ color: 0x20220c, emissive: 0x8a9c22, emissiveIntensity: 1.1, roughness: 0.14 });
    this.poolGeo = new THREE.CircleGeometry(1, 30).rotateX(-Math.PI / 2);
  }
  get busy() { return !!this.h; }

  reset() {
    if (this.h) this.endHook();
    for (const b of this.globs) this.group.remove(b.m); this.globs.length = 0;
    for (const p of this.pools) { this.group.remove(p.m); p.m.material.dispose(); } this.pools.length = 0;
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

  // ---------------------------------------------------------------- the acid
  acid(a, ti, kc) {
    const g = this.g, cam = g.camera; cam.updateMatrixWorld(); g.viewmodel.syncToCamera(cam); g.viewmodel.muzzleWorld(_a); cam.getWorldDirection(_d);
    const m = new THREE.Mesh(this.globGeo, this.globMat); m.position.copy(_a); this.group.add(m);
    const at = g.pickAim(cam.position, _d, a.range), T = Math.max(0.28, Math.min(1.1, at.distanceTo(_a) / a.speed));
    const vel = new THREE.Vector3((at.x - _a.x) / T, (at.y - _a.y) / T + 8 * T, (at.z - _a.z) / T);
    this.globs.push({ m, vel, t: 0, dmg: a.dmg[ti] * kc, dot: a.dot[ti] * kc, radius: a.radius[ti], life: a.life });
    g.viewmodel.fireKick(); g.viewmodel.recoilVel += 4; g.addShake(0.05); g.viewmodel.bulge = Math.max(g.viewmodel.bulge, 0.8);
    g.audio.play('gel', { vol: 0.9 }); g.audio.play('swallow', { vol: 0.4 });
    for (let i = 0; i < 6; i++) g.effects.glowP.emit(_a.x, _a.y, _a.z, _d.x * 3 + rand(-1, 1), _d.y * 3 + rand(-0.4, 1), _d.z * 3 + rand(-1, 1), 0.3, 0.02, 0.4, 0.46, 0.08, 8, 0.6);
  }
  burst(b) {
    const g = this.g, p = b.m.position; this.group.remove(b.m);
    for (const e of g.enemies) {
      if (!e.alive || e.absorbing || !e.hitSpheres?.[0]) continue;
      const d = e.hitSpheres[0].c.distanceTo(p); if (d > 1.5) continue;
      g.onPlayerHit(e, b.dmg, e.hitSpheres[0].c.clone()); e.corrodeT = Math.max(e.corrodeT || 0, 2);
    }
    const mat = new THREE.MeshBasicMaterial({ color: 0x8a9c22, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }); mat.userData.noSnap = true;
    const pm = new THREE.Mesh(this.poolGeo, mat); pm.position.set(p.x, 0.035, p.z); pm.scale.setScalar(0.3); this.group.add(pm);
    this.pools.push({ m: pm, x: p.x, z: p.z, r: b.radius, t: 0, life: b.life, dot: b.dot, tick: 0, selfTick: 0 });
    for (let i = 0; i < 26; i++) { const sp = 1 + Math.random() * 4; g.effects.glowP.emit(p.x, p.y + 0.1, p.z, (Math.random() - 0.5) * sp, Math.random() * sp * 0.8, (Math.random() - 0.5) * sp, rand(0.35, 0.7), rand(0.02, 0.05), 0.42, 0.48, 0.08, 9, 0.5); }
    g.audio.play('gel', { vol: 0.9 }); g.audio.play('impact', { vol: 0.35 }); g.addShake(0.08);
  }

  // ---------------------------------------------------------------- every step
  update(dt) {
    const g = this.g;
    if (this.h) this.updateHook(dt);
    for (const e of g.enemies) if (e.corrodeT > 0) { e.corrodeT -= dt; if (Math.random() < dt * 9 && e.hitSpheres?.[0]) { const c = e.hitSpheres[0].c; g.effects.glowP.emit(c.x + rand(-0.3, 0.3), c.y + rand(-0.5, 0.2), c.z + rand(-0.3, 0.3), rand(-0.2, 0.2), rand(0.1, 0.5), rand(-0.2, 0.2), 0.5, 0.03, 0.3, 0.36, 0.06, 1, 1); } }
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const b = this.globs[i]; b.t += dt; b.vel.y -= 16 * dt; const p = b.m.position, step = b.vel.length() * dt;
      _a.copy(b.vel).normalize(); const hit = g.world.raycast(p.x, p.y, p.z, _a.x, _a.y, _a.z, step + 0.1);
      let boom = !!hit || p.y < 0.12 || b.t > 3;
      if (!boom) for (const e of g.enemies) if (e.alive && !e.absorbing && e.hitSpheres?.[0] && e.hitSpheres[0].c.distanceTo(p) < e.hitSpheres[0].r + 0.12) { boom = true; break; }
      if (boom) { this.burst(b); this.globs.splice(i, 1); continue; }
      p.addScaledVector(b.vel, dt); b.m.scale.setScalar(1 + 0.12 * Math.sin(b.t * 22));
    }
    const P = g.player;
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const q = this.pools[i]; q.t += dt; const grow = Math.min(1, q.t / 0.25), fade = 1 - smoothK(q.life - 0.8, q.life, q.t);
      q.m.scale.setScalar(q.r * grow); q.m.material.opacity = 0.42 * fade * (0.85 + 0.15 * Math.sin(q.t * 5));
      q.tick -= dt; const tick = q.tick <= 0; if (tick) q.tick = 0.25;
      for (const e of g.enemies) {
        if (!e.alive || e.absorbing || e.disabled || Math.hypot(e.pos.x - q.x, e.pos.z - q.z) > q.r) continue;
        e.slowT = Math.max(e.slowT || 0, 0.4); e.corrodeT = Math.max(e.corrodeT || 0, 1.2);
        if (tick && e.hitSpheres?.[0]) { const d = q.dot * 0.25; g.evolution.noteHit('acid', d); e.takeDamage(d, e.hitSpheres[0].c.clone()); }
      }
      // it does not care whose feet are in it
      if (P.grounded && Math.hypot(P.pos.x - q.x, P.pos.z - q.z) < q.r) { q.selfTick -= dt; if (q.selfTick <= 0) { q.selfTick = 0.5; g.damagePlayer(4, null); } }
      if (Math.random() < dt * 14) { const an = rand(0, 6.28), rr = q.r * Math.sqrt(Math.random()); g.effects.glowP.emit(q.x + Math.cos(an) * rr, 0.06, q.z + Math.sin(an) * rr, 0, rand(0.2, 0.7), 0, rand(0.3, 0.6), rand(0.015, 0.035), 0.3, 0.36, 0.05, 0, 1); }
      if (q.t >= q.life) { this.group.remove(q.m); q.m.material.dispose(); this.pools.splice(i, 1); }
    }
  }
}
