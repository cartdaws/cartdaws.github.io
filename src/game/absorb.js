import * as THREE from 'three';
import { lerp, smooth, seg } from '../core/util.js';

export const ABSORB_RANGE = 3.4;   // metres from the eye to the enemy's centre
const CONE = 0.8;                  // cosine of the aiming cone (about 37 degrees): no pixel-perfect aim needed
export const ABSORB_HEAL = 25;     // health restored by every successful absorption, bugs and drones alike
const FAILSAFE = 4.5;              // a committed absorption always resolves by now

const ease = (t, a, b) => smooth(seg(t, a, b));
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _w = new THREE.Vector3(), _l = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const TOXIC = new THREE.Color(0.42, 0.6, 0.12);          // corroded, sickly yellow-green
const SLIME = new THREE.Color(0.25, 1.0, 0.45);

// Feeding sequence. Six proboscis tongues unroll from the left forearm, press their sponge-like tips onto the robot and
// secrete digestive fluid. Each component corrodes, sags and melts into a glowing puddle, which the tongues drink: beads of
// luminous liquid are pumped up every tongue into the forearm. The core goes last. Times are seconds from the click.
const MELT = [[0.55, 1.0], [0.65, 1.1], [1.0, 1.55], [1.35, 1.95]];       // per component: start and end of the meltdown
// Which components each tongue works on, in order, for each supported tentacle count. With six tongues this is the original assignment;
// fewer tongues double up (a tongue retracts from one component, then reaches the next). The timeline of the meltdown never changes.
const COMP_MAP = { 3: [[0], [1], [2, 3]], 4: [[0], [1], [2], [3]], 5: [[0], [1], [2], [3], [2]], 6: [[0], [1], [2], [3], [2], [3]] };
const TONGUE_T0 = [0.0, 0.05, 0.1, 0.15, 0.2, 0.25];                       // staggered start of the reach
const REACH = 0.4;

export class Absorber {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.seq = null;
    this.hinted = false;
    this.beads = [];
    this.puddleMat = new THREE.MeshStandardMaterial({ color: 0x35b86a, emissive: 0x1d8a45, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.78, depthWrite: false });
    this.puddleGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
  }

  // True only while a committed absorption is actually running in an unpaused game.
  get protecting() { return !!this.seq && !this.game.paused && this.game.state === 'playing'; }
  get busy() { return !!this.seq; }

  bead(i) {
    if (!this.beads[i]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xc8ff9a, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.renderOrder = 9; m.frustumCulled = false; m.visible = false;
      this.game.viewmodel.root.add(m);
      this.beads[i] = m;
    }
    return this.beads[i];
  }

  // Abort anything in flight (restart, death, retry): the robot is put back together, tongues recoiled, protection gone.
  reset() {
    const S = this.seq;
    if (S) this.restore(S);
    this.seq = null; this.target = null;
    const g = this.game;
    this.clearFx();
    g.ui.setPrompt('');
    for (const e of g.enemies) e.ringBoost = false;
    if (g.touchUI) g.touchUI.setAbsorb(false);
  }

  clearFx() {
    const vm = this.game.viewmodel;
    vm.tentacles.reset();
    vm.left.rw = 0; vm.left.fxSpread = 0; vm.left.fxCurl = 0; vm.left.fxBulge = 0;
    for (const b of this.beads) if (b) b.visible = false;
  }

  restore(S) {
    S.e.absorbing = false;
    for (const c of S.comps) {
      c.nodes.forEach((n, i) => { const o = c.orig[i]; n.position.copy(o.pos); n.quaternion.copy(o.quat); n.scale.copy(o.scale); n.visible = true; });
      for (const r of c.meshes) r.mesh.material = r.mat;
      if (c.puddle) c.puddle.removeFromParent();
    }
  }

  // Eligible: disabled, within reach, roughly in front, and not behind cover.
  eligible(e) {
    const g = this.game;
    if (!e.alive || !e.weak || e.absorbing || e.rewarded || !e.parts) return -1;
    const cp = g.eyeCam.position, c = e.hitSpheres[0].c;
    _t.subVectors(c, cp);
    const dist = _t.length();
    if (dist > ABSORB_RANGE || dist < 0.3) return -1;
    g.eyeCam.getWorldDirection(_d);
    const dot = _t.divideScalar(dist).dot(_d);
    if (dot < CONE) return -1;
    if (g.world.blocked(cp.x, cp.y, cp.z, c.x, c.y, c.z, (b) => b.tag !== 'barrel')) return -1;
    return dot;
  }

  pick() {
    let best = null, bestDot = -1;
    for (const e of this.game.enemies) { const d = this.eligible(e); if (d > bestDot) { best = e; bestDot = d; } }
    return best;
  }

  // Right click / ABSORB button. Ignored unless a valid target exists and nothing else is in progress.
  request() {
    const g = this.game;
    if (this.seq || g.state !== 'playing' || g.paused || g.player.dead) return;
    const e = this.pick();
    if (e) this.begin(e);
  }

  begin(e) {
    const g = this.game, scene = g.scene;
    e.absorbing = true;
    e.ringBoost = false;
    if (e.absRing) e.absRing.visible = false;
    e.flashT = 0;
    e.group.updateMatrixWorld(true);
    const box = new THREE.Box3(), tmp = new THREE.Box3();
    const comps = e.parts.map((p, i) => {
      const nodes = p.nodes.filter(Boolean);
      box.makeEmpty();
      for (const n of nodes) box.union(tmp.setFromObject(n));
      const center = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const meshes = [];
      for (const n of nodes) n.traverse((o) => {
        if (!o.isMesh) return;
        const orig = o.material;
        const mats = [].concat(orig).map((m) => { const cm = m.clone(); cm.transparent = true; cm.userData.c0 = cm.color.clone(); cm.userData.e0 = cm.emissive ? cm.emissive.clone() : new THREE.Color(); cm.userData.i0 = cm.emissiveIntensity; return cm; });
        meshes.push({ mesh: o, mat: orig, clones: mats });
        o.material = Array.isArray(orig) ? mats : mats[0];
      });
      const puddle = new THREE.Mesh(this.puddleGeo, this.puddleMat.clone());
      puddle.position.set(center.x, 0.025, center.z);
      puddle.scale.setScalar(0.001);
      puddle.renderOrder = 3;
      scene.add(puddle);
      return {
        id: p.id, core: !!p.core, nodes, center, rho: THREE.MathUtils.clamp(Math.max(sz.x, sz.z) * 0.5, 0.08, 0.4),
        orig: nodes.map((n) => ({ pos: n.position.clone(), quat: n.quaternion.clone(), scale: n.scale.clone() })),
        meshes, puddle, melt: MELT[Math.min(i, MELT.length - 1)], sag: Math.max(0.05, center.y - 0.05), f: {}, done: false,
      };
    });
    this.seq = { e, t: 0, comps, tongue: Array.from({ length: Math.min(6, Math.max(3, g.viewmodel.tentacles.count)) }, (_, k) => ({ k, drips: 0, pumped: 0 })), f: {} };
    this.target = null;
    g.ui.setPrompt('');
    g.audio.play('servo', { vol: 0.25 });
  }

  update(dt) {
    const g = this.game, ui = g.ui;
    if (this.seq) { this.run(dt); return; }
    const vm = g.viewmodel;
    if (vm.left.rw > 0 || vm.left.fxBulge > 0) { vm.left.rw = Math.max(0, vm.left.rw - dt * 4); vm.left.fxBulge = 0; vm.left.fxSpread = 0; }
    const target = this.pick();
    this.target = target;
    for (const e of g.enemies) e.ringBoost = e === target;
    if (g.touchUI) g.touchUI.setAbsorb(!!target);
    if (!target) { if (!g.opening.routePrompt) ui.setPrompt(''); return; }
    if (!this.hinted) { this.hinted = true; ui.hint(g.touchMode ? 'TAP ABSORB ON DISABLED ROBOTS' : 'RIGHT CLICK TO ABSORB DISABLED ROBOTS', 3.5); }
    ui.setPrompt(g.touchMode ? 'ABSORB' : 'RIGHT CLICK — ABSORB');
  }

  run(dt) {
    const g = this.game, vm = g.viewmodel, S = this.seq, e = S.e, cam = g.eyeCam, left = vm.left;
    S.t += dt;
    const t = S.t, tents = vm.tentacles.P;
    cam.updateMatrixWorld();

    // ---- components: corrode, sag, melt into a puddle, and are drunk ----
    for (const c of S.comps) {
      const [m0, m1] = c.melt;
      const etch = ease(t, m0 - 0.25, m0 + 0.1), melt = ease(t, m0, m1), drink = ease(t, m1 - 0.15, m1 + 0.3);
      c.cur = melt;
      c.nodes.forEach((n, i) => {
        const o = c.orig[i];
        n.scale.set(o.scale.x * (1 + 0.28 * melt), o.scale.y * (1 - 0.88 * melt), o.scale.z * (1 + 0.28 * melt));
        n.position.set(o.pos.x + Math.sin(t * 40 + i) * 0.004 * etch * (1 - melt), o.pos.y - c.sag * melt * melt, o.pos.z);
        if (melt >= 1) n.visible = false;
      });
      for (const r of c.meshes) for (const m of r.clones) {
        m.color.copy(m.userData.c0).lerp(TOXIC, 0.55 * etch + 0.45 * melt);
        m.opacity = 1 - 0.75 * melt;
        if (m.emissive) { m.emissive.copy(m.userData.e0).lerp(SLIME, 0.8 * etch); m.emissiveIntensity = m.userData.i0 + 1.2 * etch + 0.8 * Math.sin(t * 22 + c.rho * 9) * melt * (1 - drink); }
      }
      const pud = c.puddle;
      pud.scale.setScalar(Math.max(0.001, c.rho * 1.5 * ease(melt, 0.1, 1) * (1 - drink) * (1 + 0.05 * Math.sin(t * 9))));
      pud.material.opacity = 0.78 * (1 - drink * 0.6);
      pud.visible = melt > 0.02 && drink < 1;
      if (t > m0 - 0.1 && !c.f.hiss) { c.f.hiss = true; g.audio.play('hiss', { vol: 0.5 }); }
      if (t > m0 + 0.1 && !c.f.pop) { c.f.pop = true; g.audio.play('clatter', { vol: 0.25 }); }
      if (t > m1 && !c.done) { c.done = true; g.audio.play('slurp', { vol: c.core ? 0.55 : 0.35 }); if (c.core) { g.audio.play('heal', { vol: 0.5 }); g.audio.play('crystal', { vol: 0.3 }); S.coreAt = t; } }
      // acid bubbling and steam while the component is dissolving
      if (melt > 0 && melt < 1 && Math.random() < dt * 40) {
        const q = c.center;
        g.effects.glowP.emit(q.x + (Math.random() - 0.5) * c.rho, q.y * (1 - melt) + 0.05, q.z + (Math.random() - 0.5) * c.rho, (Math.random() - 0.5) * 0.4, 0.7 + Math.random(), (Math.random() - 0.5) * 0.4, 0.5, 0.05, 0.55, 1, 0.35, -2, 0.6);
        if (Math.random() < 0.35) g.effects.smokeP.emit(q.x + (Math.random() - 0.5) * c.rho, 0.15, q.z + (Math.random() - 0.5) * c.rho, 0, 0.6, 0, 1.0, 0.25, 0.7, 0.95, 0.6, -0.3, 1, 1.5);
      }
    }

    // ---- tongues: unroll, press their tips on the robot, drink, recoil ----
    let beadN = 0, pumping = 0;
    S.tongue.forEach((tg, k) => {
      const tent = tents[k], gl = tent.goal;
      const list = COMP_MAP[S.tongue.length][k];
      let c = S.comps[list[0]], t0 = TONGUE_T0[k], tEnd = c.melt[1] + 0.12, bestE = -1, prevEnd = 0, ext = 0;
      list.forEach((ci, qi) => {
        const cc = S.comps[ci], a0 = qi ? prevEnd + 0.1 : TONGUE_T0[k], a1 = cc.melt[1] + 0.12;
        const e = ease(t, a0, a0 + REACH) * (1 - ease(t, a1, a1 + 0.32));
        if (e > bestE) { bestE = e; c = cc; t0 = a0; tEnd = a1; }
        ext = Math.max(ext, e); prevEnd = a1 + 0.32;
      });
      const reach = ease(t, t0, t0 + REACH), retract = ease(t, tEnd, tEnd + 0.32);
      gl.extend = ext;
      gl.wrap = 0; gl.rho = 0.04; gl.phi0 = 0; gl.bow = 1.6 + (k % 2) * 0.8;
      // where the pad presses: a point on the near side of the component, a different spot for each tongue
      const ang = k * 2.4 + 0.7, rr = c.rho * 0.8;
      _w.set(c.center.x + Math.cos(ang) * rr * 0.7, Math.max(0.06, c.center.y * (1 - c.cur * 0.85)) + Math.sin(ang * 1.7) * c.rho * 0.35, c.center.z + Math.sin(ang) * rr * 0.7);
      _w.lerp(cam.position, 0.12);                                    // the near side, not the middle
      _l.copy(_w).applyMatrix4(cam.matrixWorldInverse);
      const probing = ease(t, t0 + REACH * 0.7, t0 + REACH) * (1 - retract);
      _l.x += Math.sin(t * 9 + k * 2) * 0.012 * probing; _l.y += Math.cos(t * 8 + k) * 0.012 * probing;
      gl.C.copy(_l);
      tg.world = _w.clone();
      // drips and glistening where the pad touches
      if (probing > 0.6 && t < c.melt[1] && Math.random() < dt * 14) g.effects.glowP.emit(_w.x, _w.y, _w.z, (Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3, 0.7, 0.04, 0.5, 1, 0.3, 9, 0.2);
      // liquid is drawn up the tongue in pulses, from when the component starts to melt until it is gone
      const draining = t > c.melt[0] + 0.05 && t < tEnd - 0.02 && gl.extend > 0.9;
      for (let b = 0; b < 4; b++) {
        const bead = this.bead(k * 4 + b);
        if (!draining) { bead.visible = false; continue; }
        const s = 1 - ((t * 2.6 + b * 0.25 + k * 0.17) % 1);
        tent.pointAt(Math.max(0.02, Math.min(0.98, s)), bead.position);
        bead.scale.setScalar(0.006 + 0.007 * Math.sin(Math.PI * (1 - s)) + (c.core ? 0.003 : 0));
        bead.visible = true;
        if (s < 0.12 && !tg['p' + b]) { tg['p' + b] = true; tent.collarPulse = 0.7; left.fxBulge = Math.min(1, left.fxBulge + 0.35); vm.pulseGlow(0.25); if (Math.random() < 0.4) g.audio.play('slurp', { vol: 0.18 }); }
        if (s > 0.5) tg['p' + b] = false;
      }
      if (draining) pumping++;
    });

    // ---- the arm only points; the tongues do the reaching ----
    const first = S.comps[0];
    _l.copy(first.center).applyMatrix4(cam.matrixWorldInverse);
    left.rt.copy(_l);
    left.rw = THREE.MathUtils.damp(left.rw, 0.42 * ease(t, 0, 0.3) * (1 - ease(t, 2.0, 2.3)), 10, dt);
    left.fxSpread = 0.55 * ease(t, 0, 0.3);
    left.fxBulge = Math.max(0, left.fxBulge - dt * 1.6);

    if (t > 2.35 || (S.coreAt !== undefined && t > S.coreAt + 0.42) || t > FAILSAFE) this.finish();
  }

  // Resolve exactly once: reward, heal, remove the robot, release the arm.
  finish() {
    const g = this.game, S = this.seq;
    if (!S) return;
    this.seq = null; this.target = null;
    const e = S.e;
    for (const c of S.comps) if (c.puddle) c.puddle.removeFromParent();
    this.clearFx();
    e.absorbing = false;
    if (g.creator && g.creator.active) { e.rewarded = true; e.die(true); g.ui.setPrompt(''); return; }   // the creator's preview robot: no reward, no healing
    if (e.alive && !e.rewarded) {
      e.rewarded = true;
      g.grantMaxHp();
      const p = g.player;
      p.health = Math.min(p.maxHealth, p.health + ABSORB_HEAL);
      g.ui.hitMarker(true);
      g.viewmodel.pulseGlow(0.8);
    }
    e.die(true);
    g.ui.setPrompt('');
  }
}
