import * as THREE from 'three';
import { clamp, damp } from '../core/util.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// SHIP COMBAT for the free-flight arena.
//   Left mouse: twin pulse cannons (always available).
//   Right mouse: homing barbs, three at a time at whatever is in front of the nose (salvaged from the first interceptor you destroy).
// Human interceptors come out of the research vessel's defence screen in two waves and hunt the lander. They strafe, they shoot, they die.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion();
const BARB_KEY = 'intruder-ship-barbs';

function glow(color, size) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(size); return s;
}

// The authored interceptor (art/build_ships.py -> public/models/interceptor.glb), nose along -Z; the stand-in below is used if it is missing.
let INTERCEPTOR = null;
export async function loadInterceptor() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/interceptor.glb');
  INTERCEPTOR = gltf.scene; INTERCEPTOR.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
}
function interceptorFromAsset() {
  const g = new THREE.Group(); g.add(INTERCEPTOR.clone(true));
  const e1 = glow(0xff6a3a, 6); e1.position.set(0, 0.02, 3.1); g.add(e1); g.userData.glow = e1;
  for (const sx of [-1, 1]) { const n = glow(sx < 0 ? 0xff3a2a : 0x3affa0, 3); n.position.set(sx * 3.2, 0, 2.0); g.add(n); }
  return g;
}
function makeInterceptor() {
  if (INTERCEPTOR) return interceptorFromAsset();
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xc4ccd0, roughness: 0.5, metalness: 0.5, emissive: 0x2a343a });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a424a, roughness: 0.7, metalness: 0.4, emissive: 0x14181c });
  const red = new THREE.MeshStandardMaterial({ color: 0xc93a2a, roughness: 0.5, metalness: 0.3, emissive: 0x401008 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4.4, 6).rotateX(-Math.PI / 2), hull); g.add(body);
  const eng = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 1.6), dark); eng.position.z = 1.8; g.add(eng);
  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 1.5), hull); wing.position.set(sx * 1.9, 0, 0.8); wing.rotation.z = sx * -0.12; g.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.0, 1.0), red); tip.position.set(sx * 3.1, 0.2, 1.0); g.add(tip);
  }
  const e1 = glow(0xff6a3a, 6); e1.position.set(0, 0, 2.7); g.add(e1);
  g.userData.glow = e1;
  for (const sx of [-1, 1]) { const n = glow(0xff3a2a, 3); n.position.set(sx * 3.2, 0.3, 1.0); g.add(n); }
  return g;
}

export class FlightCombat {
  constructor(flight) {
    this.f = flight; this.g = flight.g;
    this.group = new THREE.Group(); flight.group.add(this.group);
    this.shots = []; this.enemyShots = []; this.enemies = []; this.missiles = []; this.fx = [];
    this.cool = 0; this.barbCool = 0; this.kills = 0; this.wave = 0; this.alertT = 0;
    this.barbs = false; try { this.barbs = localStorage.getItem(BARB_KEY) === '1'; } catch (e) { /* none */ }
    this.shotGeo = new THREE.CylinderGeometry(0.22, 0.22, 11, 8).rotateX(Math.PI / 2);
    this.shotMat = new THREE.MeshBasicMaterial({ color: 0x9fffe8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.95, fog: false });
    this.hostMat = new THREE.MeshBasicMaterial({ color: 0xff5a3a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.95, fog: false });
    this.barbGeo = new THREE.ConeGeometry(0.25, 2.2, 6).rotateX(-Math.PI / 2);
    this.barbMat = new THREE.MeshBasicMaterial({ color: 0xb8ff9a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    // lock markers
    const mk = document.createElement('div'); mk.id = 'fh-marks'; document.body.appendChild(mk); this.marks = mk; this.markEls = [];
    const st = document.createElement('style');
    st.textContent = '#fh-marks{position:fixed;inset:0;pointer-events:none;z-index:6}#fh-marks i{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border:1px solid rgba(255,140,110,.55);transform:rotate(45deg);display:none}#fh-marks i.lock{border-color:rgba(255,210,150,.9);width:44px;height:44px;margin:-22px 0 0 -22px}#fh-marks b{position:absolute;display:none;font-size:10px;letter-spacing:.2em;color:rgba(255,160,130,.75);margin:22px 0 0 -14px}'
      + '.fh-w{position:absolute;left:50%;bottom:86px;transform:translateX(-50%);font-size:10px;letter-spacing:.25em;opacity:.7;text-align:center;line-height:1.7}.fh-w em{font-style:normal;opacity:.5}.fh-w .ok{color:#b8ff9a}.fh-alert{position:absolute;left:50%;top:70px;transform:translateX(-50%);font-size:12px;letter-spacing:.35em;color:rgba(255,150,120,.85);opacity:0;transition:opacity .3s}.fh-alert.on{opacity:1}';
    document.head.appendChild(st);
    const wd = document.createElement('div'); wd.className = 'fh-w'; wd.id = 'fh-w'; flight.hud.appendChild(wd);
    const al = document.createElement('div'); al.className = 'fh-alert'; al.id = 'fh-alert'; flight.hud.appendChild(al);
  }

  reset() {
    for (const o of [...this.shots, ...this.enemyShots, ...this.missiles]) this.group.remove(o.mesh);
    for (const e of this.enemies) this.group.remove(e.mesh);
    for (const x of this.fx) this.group.remove(x.s);
    this.shots.length = this.enemyShots.length = this.enemies.length = this.missiles.length = this.fx.length = 0;
    this.cool = this.barbCool = 0; this.kills = 0; this.wave = 0; this.alertT = 0;
    this.render();
  }

  // ---------------------------------------------------------------- waves
  spawnWave(n) {
    const f = this.f;
    for (let i = 0; i < n; i++) {
      const m = makeInterceptor();
      // they launch from the research vessel's side of the player and curve in
      _a.set(0, 0, -1).applyQuaternion(f.quat);
      m.position.copy(f.pos).addScaledVector(_a, 900 + i * 120).add(_b.set((Math.random() - 0.5) * 500, (Math.random() - 0.5) * 220, 0));
      m.quaternion.copy(f.quat);
      this.group.add(m);
      this.enemies.push({ mesh: m, hp: 40, vel: _c.copy(_a).multiplyScalar(-90).clone(), cool: 1 + Math.random() * 2, strafe: Math.random() * 6, side: Math.random() < 0.5 ? -1 : 1, t: 0 });
    }
    this.alertT = 3.2;
    this.f.g.audio.play('alert', { vol: 0.5 });
    this.f.g.ui.subtitle(n > 2 ? 'Security wing launched. Multiple interceptors.' : 'Interceptors on your tail.', 'SHIP AI', 3.2);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, input, live) {
    const f = this.f, g = f.g;
    this.cool = Math.max(0, this.cool - dt); this.barbCool = Math.max(0, this.barbCool - dt);
    const dist = f.distance();
    if (this.wave === 0 && dist < 4300) { this.wave = 1; this.spawnWave(2); }
    if (this.wave === 1 && dist < 2300 && this.enemies.length === 0) { this.wave = 2; this.spawnWave(3); }
    _f.set(0, 0, -1).applyQuaternion(f.quat);

    // ---- player fire
    if (live && !f.docking) {
      if (input.mouse(0) && this.cool <= 0) { this.fireCannons(); this.cool = 0.12; }
      const barbTap = input.clicked(2) || input.absorbTap; input.absorbTap = false;
      if (this.barbs && barbTap && this.barbCool <= 0) { this.fireBarbs(); this.barbCool = 3.5; }
    }

    // ---- shots
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]; s.life -= dt; s.mesh.position.addScaledVector(s.vel, dt);
      if (Math.random() < 0.75) this.burst(s.mesh.position, 0x9fffe8, 1, 0, 2.2, 0.2, -0.5);   // a fading trail behind every bolt
      let dead = s.life <= 0;
      for (const e of this.enemies) if (!dead && e.mesh.position.distanceToSquared(s.mesh.position) < 14) { this.hit(e, 9, s.mesh.position); dead = true; }
      if (dead) { this.group.remove(s.mesh); this.shots.splice(i, 1); }
    }
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const s = this.enemyShots[i]; s.life -= dt; s.mesh.position.addScaledVector(s.vel, dt);
      let dead = s.life <= 0;
      if (!dead && !f.docking && s.mesh.position.distanceToSquared(f.pos) < 11) { f.damage(7); dead = true; this.burst(s.mesh.position, 0xff6a3a, 9); }
      if (dead) { this.group.remove(s.mesh); this.enemyShots.splice(i, 1); }
    }
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]; m.life -= dt;
      const tgt = m.target && this.enemies.includes(m.target) ? m.target : null;
      if (tgt) { _a.subVectors(tgt.mesh.position, m.mesh.position).normalize(); m.dir.lerp(_a, 1 - Math.exp(-3.2 * dt)).normalize(); }
      m.speed = Math.min(520, m.speed + 380 * dt);
      m.mesh.position.addScaledVector(m.dir, m.speed * dt); m.mesh.lookAt(_b.copy(m.mesh.position).add(m.dir));
      if (Math.random() < 0.6) this.burst(m.mesh.position, 0xb8ff9a, 1, 0.3, 1.4, 0.3, 1);
      let dead = m.life <= 0;
      for (const e of this.enemies) if (!dead && e.mesh.position.distanceToSquared(m.mesh.position) < 40) { this.hit(e, 34, m.mesh.position); this.burst(m.mesh.position, 0xb8ff9a, 22, 0.8); dead = true; }
      if (dead) { this.group.remove(m.mesh); this.missiles.splice(i, 1); }
    }

    // ---- interceptors: close in, then strafe across the player's nose and fire
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]; e.t += dt; e.cool -= dt; e.strafe += dt;
      _a.subVectors(f.pos, e.mesh.position); const d = _a.length(); _a.divideScalar(d || 1);
      const want = _b.copy(f.pos).addScaledVector(_c.set(Math.sin(e.strafe * 0.7) * e.side, Math.cos(e.strafe * 0.5) * 0.6, 0).multiplyScalar(110).applyQuaternion(f.quat), 1);
      want.sub(e.mesh.position).normalize();
      const speed = d > 260 ? 230 : (d < 90 ? 150 : 190);
      e.vel.lerp(want.multiplyScalar(speed), 1 - Math.exp(-1.4 * dt));
      e.mesh.position.addScaledVector(e.vel, dt);
      _q.setFromUnitVectors(_c.set(0, 0, -1), _b.copy(e.vel).normalize()); e.mesh.quaternion.slerp(_q, 1 - Math.exp(-4 * dt));
      // fire when roughly facing the player and in range
      _b.set(0, 0, -1).applyQuaternion(e.mesh.quaternion);
      if (e.cool <= 0 && d < 520 && _b.dot(_a) > 0.75 && !f.docking) {
        e.cool = 1.4 + Math.random() * 1.2;
        for (const sx of [-1, 1]) {
          const mesh = new THREE.Mesh(this.shotGeo, this.hostMat); mesh.add(glow(0xff5a3a, 6)); mesh.position.copy(e.mesh.position).add(_c.set(sx * 1.9, 0, -1).applyQuaternion(e.mesh.quaternion));
          mesh.lookAt(_c.copy(mesh.position).add(_a)); this.group.add(mesh);
          const lead = _c.copy(f.pos).addScaledVector(_f, d / 330 * f.speed * 0.5).sub(mesh.position).normalize();
          mesh.lookAt(_b.copy(mesh.position).add(lead));
          this.enemyShots.push({ mesh, vel: lead.clone().multiplyScalar(330), life: 2.2 });
        }
        g.audio.play('shot', { vol: clamp(1 - d / 700, 0.15, 0.5) });
      }
      // collision with the player's ship
      if (d < 7 && !f.docking) { f.damage(14); this.explode(e); this.enemies.splice(i, 1); }
    }

    // ---- fx
    for (let i = this.fx.length - 1; i >= 0; i--) { const x = this.fx[i]; x.t += dt; const k = x.t / x.life; x.s.scale.setScalar(x.size * (1 + k * x.grow)); x.s.material.opacity = Math.max(0, 1 - k); if (x.vel) x.s.position.addScaledVector(x.vel, dt); if (k >= 1) { this.group.remove(x.s); x.s.material.dispose(); this.fx.splice(i, 1); } }

    this.alertT = Math.max(0, this.alertT - dt);
    this.markers();
  }

  fireCannons() {
    const f = this.f, g = f.g;
    _f.set(0, 0, -1).applyQuaternion(f.quat);
    for (const sx of [-1, 1]) {
      const mesh = new THREE.Mesh(this.shotGeo, this.shotMat);
      mesh.position.copy(f.pos).add(_a.set(sx * 3.1, -0.1, -2.2).applyQuaternion(f.quat));
      mesh.quaternion.copy(f.quat); this.group.add(mesh);
      { const gs = glow(0x7fffe0, 6.5); mesh.add(gs); }
      this.burst(mesh.position, 0xc8fff4, 1, 0, 7, 0.08, 0.7);                   // muzzle flash at each gun
      this.shots.push({ mesh, vel: _f.clone().multiplyScalar(720 + f.speed), life: 1.5 });
    }
    g.audio.play('shot', { vol: 0.28 }); f.shake = Math.max(f.shake, 0.06);
  }

  fireBarbs() {
    const f = this.f, g = f.g;
    // the three machines nearest the nose
    _f.set(0, 0, -1).applyQuaternion(f.quat);
    const cand = this.enemies.map((e) => ({ e, dot: _a.subVectors(e.mesh.position, f.pos).normalize().dot(_f) })).filter((x) => x.dot > 0.5).sort((a, b) => b.dot - a.dot);
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(this.barbGeo, this.barbMat); mesh.position.copy(f.pos).add(_a.set((i - 1) * 2.6, -0.5, -1).applyQuaternion(f.quat)); this.group.add(mesh);
      const dir = _f.clone().add(_b.set((i - 1) * 0.25, 0.1, 0).applyQuaternion(f.quat)).normalize();
      this.missiles.push({ mesh, dir, speed: f.speed + 80, life: 4.5, target: cand.length ? cand[i % cand.length].e : null });
    }
    g.audio.play('swallow', { vol: 0.6 }); g.audio.play('shot', { vol: 0.4 }); f.shake = Math.max(f.shake, 0.2);
  }

  hit(e, dmg, at) {
    e.hp -= dmg; this.burst(at, 0xffd9a0, 6, 0.4, 3.2, 0.3, 1.4); this.burst(at, 0xffe8c0, 1, 0, 9, 0.12, 1.2); this.f.hitMark = 0.18; this.f.g.audio.play('hit', { vol: 0.3 });
    if (e.hp <= 0) { this.explode(e); const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1); this.kills++; this.onKill(); }
  }

  onKill() {
    const g = this.f.g;
    if (!this.barbs) {
      this.barbs = true; try { localStorage.setItem(BARB_KEY, '1'); } catch (e) { /* none */ }
      g.ui.rewardNote('SALVAGED: HOMING BARBS'); g.ui.hint('RIGHT CLICK: FIRE HOMING BARBS  ·  3 AT A TIME', 5); g.audio.play('crystal', { vol: 0.6 });
    }
    this.render();
  }

  explode(e) {
    const p = e.mesh.position;
    this.group.remove(e.mesh);
    this.burst(p, 0xffb060, 1, 0, 70, 0.7, 5);
    this.burst(p, 0xff6a3a, 1, 0, 45, 0.9, 4);
    for (let i = 0; i < 14; i++) this.burst(p, 0xffd9a0, 1, 60, 6 + Math.random() * 6, 0.8 + Math.random() * 0.6, 3);
    this.f.g.audio.play('explosion', { vol: clamp(1 - p.distanceTo(this.f.pos) / 900, 0.25, 0.9) });
    this.f.shake = Math.max(this.f.shake, clamp(1 - p.distanceTo(this.f.pos) / 400, 0, 0.7));
  }

  // a short-lived additive glow
  burst(pos, color, n = 1, spread = 0, size = 4, life = 0.4, grow = 2) {
    for (let i = 0; i < n; i++) {
      const s = glow(color, size); s.position.copy(pos);
      this.group.add(s);
      this.fx.push({ s, t: 0, life, size, grow, vel: spread ? new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread) : null });
    }
  }

  // lock markers over interceptors, projected into the screen
  markers() {
    const f = this.f, c = f.g.camera, W = window.innerWidth, H = window.innerHeight;
    while (this.markEls.length < this.enemies.length) { const i = document.createElement('i'), b = document.createElement('b'); this.marks.append(i, b); this.markEls.push({ i, b }); }
    _f.set(0, 0, -1).applyQuaternion(f.quat);
    let best = -1, bd = 0.5;
    this.enemies.forEach((e, k) => { const d = _a.subVectors(e.mesh.position, f.pos).normalize().dot(_f); if (d > bd) { bd = d; best = k; } });
    this.markEls.forEach((m, k) => {
      const e = this.enemies[k];
      if (!e) { m.i.style.display = m.b.style.display = 'none'; return; }
      _a.copy(e.mesh.position).add(f.group.position).project(c);
      if (_a.z > 1) { m.i.style.display = m.b.style.display = 'none'; return; }
      const x = (_a.x * 0.5 + 0.5) * W, y = (-_a.y * 0.5 + 0.5) * H;
      const onScr = Math.abs(_a.x) < 0.98 && Math.abs(_a.y) < 0.95;
      m.i.style.display = onScr ? 'block' : 'none'; m.b.style.display = onScr ? 'block' : 'none';
      m.i.style.left = m.b.style.left = x + 'px'; m.i.style.top = m.b.style.top = y + 'px';
      m.i.className = k === best ? 'lock' : ''; m.b.textContent = Math.round(e.mesh.position.distanceTo(f.pos)) + 'M';
    });
  }

  render() {
    const w = document.getElementById('fh-w');
    if (w) w.innerHTML = `<span class="ok">PULSE CANNONS</span> <em>·</em> ${this.barbs ? '<span class="ok">HOMING BARBS</span>' : '<em>HOMING BARBS · DESTROY AN INTERCEPTOR</em>'} <em>·</em> KILLS ${this.kills}`;
  }
}
