import * as THREE from 'three';
import { clamp, lerp } from '../core/util.js';

// THE ARSENAL. The survivor's arm reshapes into the forms it has learned. The Shardcaster is always there; the rest are learned by absorbing a
// kind of machine, or found in the world. Switching: keys 1-5, Q for the next one, or the slot bar on screen. Everything here is drawn from
// the particles, lights and projectile pool the game already has, so it needs no new assets.
//
//   1 SHARDCASTER  crystalline bolts (the weapon in shardcaster.js)
//   2 ARC          short chain lightning that jumps between machines          learned by absorbing a security android
//   3 BARB         close-range spray of spines                                learned by absorbing a bug
//   4 LASH         melee sweep of a gel tentacle; pulls small machines in      found: a specimen cache in the containment bay
//   5 GEL BOMB     lobbed sticky charge that slows what it catches            learned by absorbing a sentry drone
export const FORMS = [
  { id: 'shardcaster', name: 'SHARDCASTER', key: 'Digit1', how: 'always' },
  { id: 'arc', name: 'ARC', key: 'Digit2', how: 'absorb an android', kind: 'android' },
  { id: 'barb', name: 'BARB', key: 'Digit3', how: 'absorb a bug', kind: 'bug' },
  { id: 'lash', name: 'LASH', key: 'Digit4', how: 'find the specimen cache' },
  { id: 'gel', name: 'GEL BOMB', key: 'Digit5', how: 'absorb a drone', kind: 'drone' },
];
const KEY = 'intruder-arsenal-v2';
const CACHE_AT = new THREE.Vector3(-3.2, 0, -9.5);          // the specimen cache beyond the first barrier of the containment bay

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _o = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();

export class Arsenal {
  constructor(game) {
    this.g = game;
    this.unlocked = new Set(['shardcaster']);
    try { for (const id of JSON.parse(localStorage.getItem(KEY) || '[]')) this.unlocked.add(id); } catch (e) { /* none */ }
    this.index = 0;
    this.cool = 0;
    this.group = new THREE.Group(); game.scene.add(this.group);
    this.arcs = []; this.lashes = []; this.bombs = []; this.puddles = [];
    this.hold = 0;

    // the specimen cache: a sealed gel container pulsing softly
    this.cache = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0x2c3a40, roughness: 0.5, metalness: 0.6 }));
    shell.position.y = 0.45; this.cache.add(shell);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0x9ff5ea, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.y = 1.1; this.cache.add(core); this.cacheCore = core;
    this.cacheLight = new THREE.PointLight(0x7ff0e0, 0, 8, 2); this.cacheLight.position.set(0, 1.2, 0); this.cacheLight.userData.keepOn = true; this.cache.add(this.cacheLight);
    this.cache.position.copy(CACHE_AT); game.scene.add(this.cache);

    // slot bar
    const bar = document.createElement('div'); bar.id = 'arsenal-bar';
    document.body.appendChild(bar); this.bar = bar;
    const st = document.createElement('style');
    st.textContent = '#arsenal-bar{position:fixed;right:34px;bottom:96px;z-index:5;display:none;flex-direction:column;gap:3px;align-items:flex-end;font-size:11px;letter-spacing:.2em;pointer-events:none;color:rgba(168,235,226,.8)}'
      + 'body.has-hud #arsenal-bar{display:flex}#arsenal-bar span{display:flex;gap:8px;align-items:center;padding:2px 8px;border:1px solid transparent;opacity:.45}#arsenal-bar span.on{opacity:1;border-color:rgba(168,235,226,.4);background:rgba(6,16,20,.3)}#arsenal-bar span.lock{opacity:.18}#arsenal-bar kbd{font:inherit;padding:0 5px;border:1px solid rgba(168,235,226,.35)}'
      + 'body.intro #arsenal-bar,body.in-flight #arsenal-bar{display:none!important}';
    document.head.appendChild(st);
    this.render();
  }

  get active() { return FORMS[this.index]; }
  save() { try { localStorage.setItem(KEY, JSON.stringify([...this.unlocked])); } catch (e) { /* session only */ } }

  render() {
    this.bar.innerHTML = FORMS.map((f, i) => `<span class="${i === this.index ? 'on' : ''} ${this.unlocked.has(f.id) ? '' : 'lock'}"><kbd>${i + 1}</kbd>${this.unlocked.has(f.id) ? f.name : '- - -'}</span>`).join('');
    const el = document.getElementById('weaponName'); if (el) el.textContent = this.active.name;
    document.body.classList.toggle('has-hud', !this.g.ui.hud.classList.contains('hidden'));
  }

  select(i) {
    if (i === this.index || !FORMS[i] || !this.unlocked.has(FORMS[i].id)) return;
    this.index = i; this.cool = Math.max(this.cool, 0.18); this.g.weapon.reset();
    this.g.viewmodel.pulseGlow(0.6); this.g.audio.play('gel', { vol: 0.35 }); this.g.viewmodel.setStyle(this.active.id);
    this.render();
  }
  cycle() { for (let k = 1; k <= FORMS.length; k++) { const i = (this.index + k) % FORMS.length; if (this.unlocked.has(FORMS[i].id)) { this.select(i); return; } } }
  unlockAll() { for (const f of FORMS) this.unlocked.add(f.id); this.save(); this.render(); }

  unlock(id) {
    if (this.unlocked.has(id)) return false;
    this.unlocked.add(id); this.save();
    const f = FORMS.find((x) => x.id === id), g = this.g;
    g.ui.rewardNote('NEW FORM: ' + f.name);
    g.ui.hint(`${f.name} LEARNED  ·  PRESS ${FORMS.indexOf(f) + 1} OR Q`, 4);
    g.audio.play('crystal', { vol: 0.6 }); g.viewmodel.pulseGlow(1);
    this.index = FORMS.indexOf(f); this.g.viewmodel.setStyle(f.id); this.render();
    return true;
  }

  // Absorbing a machine can teach its form.
  onAbsorbed(e) {
    const f = FORMS.find((x) => x.kind && (e.kind === x.kind || (x.kind === 'android' && (e.kind === 'android' || e.constructor.name === 'SecurityAndroid'))));
    if (f) this.unlock(f.id);
  }

  reset() { this.cool = 0; this.hold = 0; for (const b of this.bombs) this.group.remove(b.mesh); this.bombs.length = 0; for (const p of this.puddles) this.group.remove(p.mesh); this.puddles.length = 0; }

  // Called each simulation step. Returns true when this form handled the trigger (so the Shardcaster stays idle).
  step(dt, trigger, enabled, latched) {
    const g = this.g, inp = g.input;
    document.body.classList.toggle('has-hud', !g.ui.hud.classList.contains('hidden'));
    const live = g.state === 'playing' && !g.opening.active && !g.player.dead;
    if (live) {
      for (let i = 0; i < FORMS.length; i++) if (inp.was(FORMS[i].key)) this.select(i);
      if (inp.was('KeyQ')) this.cycle();
    }
    this.cool = Math.max(0, this.cool - dt);
    this.updateFx(dt);
    this.updateCache(dt);
    if (this.active.id === 'shardcaster' || !live) return false;
    if (enabled && (trigger || latched) && this.cool <= 0) this[this.active.id]();
    return true;
  }

  // ---------------------------------------------------------------- shared helpers
  aim() {
    const g = this.g, cam = g.camera;
    cam.updateMatrixWorld(); g.viewmodel.syncToCamera(cam); g.viewmodel.muzzleWorld(_m);
    cam.getWorldDirection(_d);
    return { origin: cam.position, dir: _d, muzzle: _m };
  }
  targets() { return this.g.enemies.filter((e) => e.alive && !e.absorbing && e.hitSpheres && e.hitSpheres[0]); }
  fireFeel(kick = 1) { const g = this.g; g.viewmodel.fireKick(); g.viewmodel.recoilVel += 4 * kick; g.addShake(0.05 * kick); g.kick = Math.min(0.05, (g.kick || 0) + 0.012 * kick); }

  // ---------------------------------------------------------------- 2 ARC: chain lightning
  arc() {
    const g = this.g, { origin, dir, muzzle } = this.aim();
    this.cool = 0.34;
    // the first machine: nearest to the crosshair within range and a cone, with a clear line
    let first = null, best = 0.9;
    for (const e of this.targets()) {
      const c = e.hitSpheres[0].c; _a.subVectors(c, origin); const dist = _a.length(); if (dist > 17 || dist < 0.4) continue;
      const dot = _a.divideScalar(dist).dot(dir); if (dot < best) continue;
      if (g.world.blocked(origin.x, origin.y, origin.z, c.x, c.y, c.z, (b) => b.tag !== 'barrel')) continue;
      first = e; best = dot;
    }
    const pts = [muzzle.clone()];
    if (!first) {
      // nothing in the cone: the arc discharges into the air or the wall in front
      const hit = g.pickAim(origin, dir, 9); pts.push(hit.clone());
    } else {
      const chain = [first]; let cur = first; const dmg = [16, 11, 8, 6];
      for (let k = 1; k < 4; k++) {
        let next = null, nd = 7;
        for (const e of this.targets()) { if (chain.includes(e)) continue; const d = e.hitSpheres[0].c.distanceTo(cur.hitSpheres[0].c); if (d < nd) { nd = d; next = e; } }
        if (!next) break; chain.push(next); cur = next;
      }
      chain.forEach((e, i) => { const c = e.hitSpheres[0].c.clone(); pts.push(c); g.onPlayerHit(e, dmg[i], c); });
    }
    this.bolt(pts);
    this.fireFeel(0.8);
    g.effects.flashLight(muzzle, 0x8fe8ff, 30, 0.08);
    g.audio.play('spark', { vol: 0.8 }); g.audio.play('shot', { vol: 0.3 });
  }

  // A jagged lightning path through the points, drawn as glowing line segments plus crackling particles; fades in a fraction of a second.
  bolt(pts) {
    const g = this.g, verts = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1], n = Math.max(4, Math.ceil(A.distanceTo(B) / 0.6));
      let prev = A.clone();
      for (let s = 1; s <= n; s++) {
        const p = _a.lerpVectors(A, B, s / n).clone();
        if (s < n) p.add(_b.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
        verts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        for (let q = 0; q < 3; q++) g.effects.glowP.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.2, 0.2, 0.55, 0.9, 1, 0, 0.8);
        prev = p;
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xcff6ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    line.frustumCulled = false; this.group.add(line); this.arcs.push({ line, t: 0 });
  }

  // ---------------------------------------------------------------- 3 BARB: spine shotgun
  barb() {
    const g = this.g, { origin, dir, muzzle } = this.aim();
    this.cool = 0.85;
    const aim = g.pickAim(origin, dir, 60);
    _o.copy(aim).sub(muzzle); if (_o.lengthSq() < 0.04) _o.copy(dir); _o.normalize();
    _r.crossVectors(_o, g.camera.up).normalize(); _u.crossVectors(_r, _o).normalize();
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.283, s = (i === 0 ? 0 : 0.03 + Math.random() * 0.05);
      const d = _c.copy(_o).addScaledVector(_r, Math.cos(a) * s).addScaledVector(_u, Math.sin(a) * s).normalize();
      g.projectiles.spawnPlayer(muzzle.clone(), d.clone(), 70 + Math.random() * 12, 9);
      g.projectiles.list[g.projectiles.list.length - 1].life = 0.34;       // a short-range weapon
    }
    this.fireFeel(1.8);
    g.viewmodel.bulge = Math.max(g.viewmodel.bulge, 0.9);
    g.effects.muzzle(muzzle); g.effects.flashLight(muzzle, 0x9fffd0, 40, 0.08);
    for (let i = 0; i < 12; i++) { const sp = 3 + Math.random() * 5; g.effects.glowP.emit(muzzle.x, muzzle.y, muzzle.z, _o.x * sp + (Math.random() - 0.5) * 2, _o.y * sp + (Math.random() - 0.5) * 2, _o.z * sp + (Math.random() - 0.5) * 2, 0.22, 0.05, 0.4, 1, 0.6, 6, 0.8); }
    g.audio.play('shot', { vol: 1 }); g.audio.play('impact', { vol: 0.5 });
  }

  // ---------------------------------------------------------------- 4 LASH: melee sweep
  lash() {
    const g = this.g, cam = g.camera, { origin, dir } = this.aim();
    this.cool = 0.6;
    const pull = [], hit = [];
    for (const e of this.targets()) {
      const c = e.hitSpheres[0].c; _a.subVectors(c, origin); const dist = _a.length();
      if (dist > 3.9 || dist < 0.05) continue;
      if (_a.divideScalar(dist).dot(dir) < 0.42) continue;
      hit.push(e);
    }
    // the sweep: a tentacle of light drawn across the view from right to left
    _r.crossVectors(dir, cam.up).normalize();
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const k = i / 8, ang = lerp(0.9, -0.9, k), reach = 2.3 + Math.sin(k * 3.14) * 1.3;
      pts.push(origin.clone().addScaledVector(dir, Math.cos(ang) * reach).addScaledVector(_r, Math.sin(ang) * reach).addScaledVector(cam.up, -0.45 + Math.sin(k * 3.14) * 0.25));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.07, 7, false), new THREE.MeshBasicMaterial({ color: 0x7ff0d8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    mesh.frustumCulled = false; this.group.add(mesh); this.lashes.push({ mesh, t: 0 });
    for (const e of hit) {
      const c = e.hitSpheres[0].c.clone();
      g.onPlayerHit(e, 26, c);
      const small = (e.kind === 'bug') || (e.baseScale && e.baseScale < 0.95);
      if (small && e.alive) { _b.set(origin.x - e.pos.x, 0, origin.z - e.pos.z).normalize(); e.pos.x += _b.x * 1.6; e.pos.z += _b.z * 1.6; }   // reeled in
      else if (e.alive) { _b.set(e.pos.x - origin.x, 0, e.pos.z - origin.z).normalize(); e.pos.x += _b.x * 0.7; e.pos.z += _b.z * 0.7; }               // staggered back
    }
    this.fireFeel(1.4);
    g.audio.play('swallow', { vol: 0.6 }); g.audio.play('hit', { vol: 0.5 });
  }

  // ---------------------------------------------------------------- 5 GEL BOMB
  gel() {
    const g = this.g, { origin, dir, muzzle } = this.aim();
    this.cool = 1.15;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshStandardMaterial({ color: 0x35b86a, emissive: 0x1d8a45, emissiveIntensity: 1.1, roughness: 0.15, transparent: true, opacity: 0.9 }));
    mesh.position.copy(muzzle); this.group.add(mesh);
    const vel = dir.clone().multiplyScalar(15).add(new THREE.Vector3(0, 3.2, 0));
    this.bombs.push({ mesh, vel, t: 0, fuse: 1.5 });
    this.fireFeel(1.0);
    g.effects.flashLight(muzzle, 0x6fffa0, 18, 0.08);
    g.audio.play('gel', { vol: 0.8 }); g.audio.play('shot', { vol: 0.35 });
  }

  explodeBomb(b) {
    const g = this.g, p = b.mesh.position;
    this.group.remove(b.mesh);
    for (const e of this.targets()) {
      const d = e.hitSpheres[0].c.distanceTo(p); if (d > 4.2) continue;
      const k = 1 - d / 4.2; g.onPlayerHit(e, 12 + 24 * k, e.hitSpheres[0].c.clone()); e.slowT = 3.2;
    }
    g.effects.goo(p, _a.set(0, 1, 0)); g.effects.ring(p, _a.set(0, 1, 0), 0x6dff9a, 4.2, 0.45); g.effects.flashLight(p.clone().setY(p.y + 0.6), 0x6dff9a, 70, 0.4);
    for (let i = 0; i < 40; i++) { const sp = 2 + Math.random() * 6; g.effects.glowP.emit(p.x, p.y + 0.2, p.z, (Math.random() - 0.5) * sp, Math.random() * sp * 0.8, (Math.random() - 0.5) * sp, 0.5, 0.09, 0.3, 1, 0.5, 8, 0.8); }
    const pm = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3ff08a, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    pm.position.set(p.x, 0.04, p.z); pm.scale.setScalar(3.4); this.group.add(pm); this.puddles.push({ mesh: pm, t: 0, life: 4, x: p.x, z: p.z });
    g.addShake(0.25); g.audio.play('explosion', { vol: 0.55 }); g.audio.play('gel', { vol: 0.7 });
  }

  // ---------------------------------------------------------------- per-frame visuals and projectiles
  updateFx(dt) {
    const g = this.g;
    for (let i = this.arcs.length - 1; i >= 0; i--) { const a = this.arcs[i]; a.t += dt; a.line.material.opacity = Math.max(0, 1 - a.t * 9); if (a.t > 0.12) { a.line.removeFromParent(); a.line.geometry.dispose(); a.line.material.dispose(); this.arcs.splice(i, 1); } }
    for (let i = this.lashes.length - 1; i >= 0; i--) { const l = this.lashes[i]; l.t += dt; l.mesh.material.opacity = Math.max(0, 0.9 - l.t * 5); l.mesh.scale.setScalar(1 + l.t * 0.6); if (l.t > 0.2) { l.mesh.removeFromParent(); l.mesh.geometry.dispose(); l.mesh.material.dispose(); this.lashes.splice(i, 1); } }
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]; b.t += dt; b.vel.y -= 18 * dt;
      const p = b.mesh.position, step = b.vel.length() * dt;
      if (step > 0) {
        _a.copy(b.vel).normalize();
        const wh = g.world.raycast(p.x, p.y, p.z, _a.x, _a.y, _a.z, step + 0.16);
        if (wh) { _b.set(wh.nx, wh.ny, wh.nz); b.vel.reflect(_b).multiplyScalar(0.35); p.addScaledVector(_b, 0.05); }
        else p.addScaledVector(b.vel, dt);
        if (p.y < 0.16) { p.y = 0.16; b.vel.y = Math.abs(b.vel.y) * 0.3; b.vel.x *= 0.7; b.vel.z *= 0.7; }
      }
      b.mesh.scale.setScalar(1 + 0.12 * Math.sin(b.t * 24));
      if (b.t >= b.fuse) { this.explodeBomb(b); this.bombs.splice(i, 1); }
    }
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i]; p.t += dt; p.mesh.material.opacity = 0.45 * (1 - p.t / p.life) * (0.8 + 0.2 * Math.sin(p.t * 6));
      for (const e of this.targets()) if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 3.4) e.slowT = Math.max(e.slowT || 0, 0.5);
      if (p.t >= p.life) { p.mesh.removeFromParent(); this.puddles.splice(i, 1); }
    }
    for (const e of g.enemies) if (e.slowT > 0) { e.slowT -= dt; if (Math.random() < 0.12) g.effects.glowP.emit(e.pos.x + (Math.random() - 0.5), e.pos.y + 0.6 + Math.random(), e.pos.z + (Math.random() - 0.5), 0, 0.3, 0, 0.5, 0.07, 0.3, 1, 0.5, -1, 1); }
  }

  // The specimen cache: hold to take its gift.
  updateCache(dt) {
    const g = this.g, got = this.unlocked.has('lash');
    this.cache.visible = !got && g.state === 'playing';
    this.cacheLight.intensity = got ? 0 : 2.4 + Math.sin(g.time * 3) * 0.6;
    this.cacheCore.position.y = 1.1 + Math.sin(g.time * 2) * 0.06;
    if (got || g.state !== 'playing' || g.opening.active) { this.hold = 0; return; }
    const d = Math.hypot(g.player.pos.x - this.cache.position.x, g.player.pos.z - this.cache.position.z);
    if (d < 2.6 && !g.absorber.busy) {
      g.ui.setPrompt(g.touchMode ? 'HOLD ABSORB TO TAKE THE ARM-LASH' : 'HOLD RIGHT CLICK  ·  TAKE THE ARM-LASH');
      this.hold = clamp(this.hold + (g.input.interactDown() ? dt / 0.9 : -dt * 1.5), 0, 1); g.ui.setHold(this.hold);
      if (this.hold >= 1) { this.hold = 0; g.ui.setHold(null); g.ui.setPrompt(''); g.effects.hitSparks(this.cache.position.clone().setY(1.1), [0.4, 1, 0.9], 24); this.unlock('lash'); }
    } else if (this.hold > 0) { this.hold = 0; g.ui.setHold(null); }
  }
}
