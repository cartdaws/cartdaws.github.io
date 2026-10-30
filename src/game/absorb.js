import * as THREE from 'three';
import { lerp, smooth, seg, damp } from '../core/util.js';
import { makeHandGel } from '../presentation/hand.js';

export const ABSORB_RANGE = 3.4;   // metres from the eye to the enemy's centre
const CONE = 0.8;                  // cosine of the aiming cone (about 37 degrees): no pixel-perfect aim needed
export const ABSORB_HEAL = 25;     // health restored by every successful absorption, bugs and drones alike
const FAILSAFE = 4.5;              // a committed absorption always resolves by now

const ease = (t, a, b) => smooth(seg(t, a, b));
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _w = new THREE.Vector3(), _l = new THREE.Vector3(), _p = new THREE.Vector3();

// One piece-by-piece assimilation. Times (seconds) are relative to the moment each component's tentacle starts reaching.
const REACH = 0.22, GRIP = 0.34, PULL_END = 0.70, DISS_A = 0.46, DISS_B = 0.64, BEAD_A = 0.66, BEAD_B = 0.94;
// Two tentacles share the work: the top one takes components 0 and 2, the outer one takes 1 and the core.
const PLAN = [{ comp: 0, tent: 'LA', t0: 0.0 }, { comp: 1, tent: 'LB', t0: 0.12 }, { comp: 2, tent: 'LA', t0: 0.72 }, { comp: 3, tent: 'LB', t0: 0.84 }];
const HOLD = { LA: new THREE.Vector3(-0.46, -0.32, -1.0), LB: new THREE.Vector3(-0.22, -0.4, -1.05) };
const HOLD_SCALE = 0.4;

// Absorbing a disabled robot is how the alien survives. One press (right click, or the ABSORB button) commits. Two tentacles, rooted on
// the left forearm, reach out, coil around the robot's actual components and pull them off one after another. Each piece is enveloped in
// gel, dissolves into luminous material and is carried down the tentacle into the body. The last piece is the core. Every absorbed
// robot restores ABSORB_HEAL health and permanently adds 1 maximum health, awarded once when the consumption completes.
export class Absorber {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.seq = null;
    this.hinted = false;
    this.gel = makeHandGel({ color: 0x118078, rim: 0xc6fff6, alpha: 0.5 });
    this.beadMat = new THREE.MeshBasicMaterial({ color: 0xaffff0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.blobs = [];
  }

  // True only while a committed absorption is actually running in an unpaused game.
  get protecting() { return !!this.seq && !this.game.paused && this.game.state === 'playing'; }
  get busy() { return !!this.seq; }

  getBlob(i) {
    if (!this.blobs[i]) {
      const g = this.game.viewmodel.root;
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), this.gel);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), this.beadMat.clone());
      shell.renderOrder = 7; glow.renderOrder = 8; shell.frustumCulled = glow.frustumCulled = false;
      shell.add(glow);
      shell.visible = false;
      g.add(shell);
      this.blobs[i] = { shell, glow };
    }
    return this.blobs[i];
  }

  // Abort anything in flight (restart, death, retry): the robot is put back together, tentacles released, protection gone.
  reset() {
    const S = this.seq;
    if (S) this.restore(S);
    this.seq = null; this.target = null;
    const g = this.game, vm = g.viewmodel;
    this.clearFx();
    g.ui.setPrompt('');
    for (const e of g.enemies) e.ringBoost = false;
    if (g.touchUI) g.touchUI.setAbsorb(false);
  }

  clearFx() {
    const vm = this.game.viewmodel;
    vm.tentacles.reset();
    vm.left.rw = 0; vm.left.fxSpread = 0; vm.left.fxCurl = 0; vm.left.fxBulge = 0;
    for (const b of this.blobs) if (b) b.shell.visible = false;
  }

  restore(S) {
    S.e.absorbing = false;
    for (const c of S.comps) {
      c.nodes.forEach((n, i) => {
        const o = c.orig[i];
        if (n.parent !== o.parent) { o.parent.add(n); }
        n.position.copy(o.pos); n.quaternion.copy(o.quat); n.scale.copy(o.scale);
        n.visible = true;
      });
      if (c.piece) c.piece.removeFromParent();
    }
  }

  // Eligible: disabled, within reach, roughly in front, and not behind cover.
  eligible(e) {
    const g = this.game;
    if (!e.alive || !e.weak || e.absorbing || e.rewarded || !e.parts) return -1;
    const cp = g.camera.position, c = e.hitSpheres[0].c;
    _t.subVectors(c, cp);
    const dist = _t.length();
    if (dist > ABSORB_RANGE || dist < 0.3) return -1;
    g.camera.getWorldDirection(_d);
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
    const comps = e.parts.map((p) => {
      const nodes = p.nodes.filter(Boolean);
      box.makeEmpty();
      for (const n of nodes) box.union(tmp.setFromObject(n));
      const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      return {
        id: p.id, core: !!p.core, nodes, center0: c, rho: THREE.MathUtils.clamp(Math.max(sz.x, sz.y, sz.z) * 0.42, 0.06, 0.34),
        orig: nodes.map((n) => ({ parent: n.parent, pos: n.position.clone(), quat: n.quaternion.clone(), scale: n.scale.clone() })),
        piece: null, released: false, f: {}, size0: sz.length(),
      };
    });
    this.seq = { e, t: 0, comps, f: {}, done: 0 };
    this.target = null;
    g.ui.setPrompt('');
    g.audio.play('servo', { vol: 0.25 });
  }

  // component centre in view model space for the current frame
  local(world, out) { return out.copy(world).applyMatrix4(this.game.camera.matrixWorldInverse); }

  update(dt) {
    const g = this.game, ui = g.ui;
    if (this.seq) { this.run(dt); return; }
    const vm = g.viewmodel;
    if (vm.left.rw > 0 || vm.left.fxBulge > 0) { vm.left.rw = Math.max(0, vm.left.rw - dt * 4); vm.left.fxBulge = 0; vm.left.fxSpread = 0; }
    const target = this.pick();
    this.target = target;
    for (const e of g.enemies) e.ringBoost = e === target;
    if (g.touchUI) g.touchUI.setAbsorb(!!target);
    if (!target) { ui.setPrompt(''); return; }
    if (!this.hinted) { this.hinted = true; ui.hint(g.touchMode ? 'TAP ABSORB ON DISABLED ROBOTS' : 'RIGHT CLICK TO ABSORB DISABLED ROBOTS', 3.5); }
    ui.setPrompt(g.touchMode ? 'ABSORB' : 'RIGHT CLICK — ABSORB');
  }

  run(dt) {
    const g = this.game, vm = g.viewmodel, S = this.seq, e = S.e, cam = g.camera;
    S.t += dt;
    const t = S.t;
    cam.updateMatrixWorld();
    const tents = vm.tentacles;
    const left = vm.left;
    // which component does each tentacle work on right now
    const want = { LA: null, LB: null };
    PLAN.forEach((p, k) => { const tau = t - p.t0; if (tau >= 0 && tau < PULL_END + 0.12) want[p.tent] = { p, k, tau }; });
    let armW = 0, armT = null;

    PLAN.forEach((p, k) => {
      const c = S.comps[p.comp];
      if (!c || !c.nodes.length) return;
      const tau = t - p.t0;
      if (tau < 0) return;
      const tent = tents[p.tent], gl = tent.goal;
      const hold = HOLD[p.tent];
      this.local(c.center0, _l);                                      // where the component stands, seen from the camera now
      const pull = ease(tau, GRIP, PULL_END);
      // piece position in view model space
      _p.copy(_l).lerp(hold, pull);
      _p.y += Math.sin(pull * Math.PI) * 0.05;
      const strain = tau > REACH && tau < GRIP ? Math.sin(tau * 90) * 0.006 * ease(tau, REACH, GRIP) : 0;
      _p.x += strain;
      // the tentacle works this component until it hands over to the next
      if (want[p.tent] && want[p.tent].k === k) {
        const ext = ease(tau, 0, REACH) * (1 - ease(tau, PULL_END, PULL_END + 0.12) * (S.comps.length && this.hasNext(k) ? 0.5 : 1));
        gl.C.x = damp(gl.C.x, _p.x, 20, dt); gl.C.y = damp(gl.C.y, _p.y, 20, dt); gl.C.z = damp(gl.C.z, _p.z, 20, dt);
        if (tau < 0.02) gl.C.copy(_p);
        gl.rho = lerp(gl.rho, c.rho * lerp(1, HOLD_SCALE, pull), Math.min(1, dt * 14));
        gl.phi0 = p.tent === 'LA' ? 0.4 : 3.5;
        gl.extend = Math.max(gl.extend * 0.0 + ext, 0);
        gl.wrap = ease(tau, REACH * 0.6, GRIP) * (1 - ease(tau, PULL_END - 0.06, PULL_END + 0.1));
        armW = Math.max(armW, 0.5 * ease(tau, 0, REACH));
        armT = gl.C;
      }
      // release: fastenings let go under tension, a few restrained sparks
      if (tau >= GRIP - 0.02 && !c.released) this.release(c, p);
      if (c.piece && c.piece.visible) {
        cam.localToWorld(_w.copy(_p));
        c.piece.position.copy(_w);
        c.piece.rotation.y += dt * 3 * pull; c.piece.rotation.x += dt * 1.6 * pull;
        c.piece.scale.setScalar(lerp(1, HOLD_SCALE, pull));
        // dissolve beneath the gel
        const dis = ease(tau, DISS_A, DISS_B);
        for (const m of c.mats) { m.opacity = 1 - dis; if (m.emissive) m.emissive.setRGB(lerp(m.userData.e0.r, 0.2, dis), lerp(m.userData.e0.g, 1, dis), lerp(m.userData.e0.b, 0.85, dis)); if (dis > 0) m.emissiveIntensity = lerp(m.userData.i0, 1.4, dis); }
        if (dis >= 1) c.piece.visible = false;
      }
      // envelope of gel, then the luminous bead carried down the tentacle
      const blob = this.getBlob(k);
      const env = ease(tau, GRIP, GRIP + 0.16), toBead = ease(tau, DISS_B - 0.06, BEAD_A + 0.04);
      const bead = ease(tau, BEAD_A, BEAD_B);
      const rBead = c.core ? 0.055 : 0.035;
      if (tau >= GRIP && bead < 1) {
        blob.shell.visible = true;
        const r = lerp(lerp(0.2 * c.rho, c.rho * 1.15 * lerp(1, HOLD_SCALE, pull), env), rBead, toBead);
        if (bead <= 0) blob.shell.position.copy(_p);
        else tent.pointAt(1 - bead, blob.shell.position);
        blob.shell.scale.setScalar(Math.max(0.01, r));
        blob.glow.scale.setScalar(lerp(0.2, 0.85, ease(tau, DISS_A, DISS_B)));
        blob.glow.material.opacity = ease(tau, DISS_A, DISS_B) * (c.core ? 1 : 0.8);
      }
      if (tau >= BEAD_B && !c.f.arrived) {
        c.f.arrived = true; blob.shell.visible = false; S.done++;
        tent.collarPulse = 1; vm.pulseGlow(c.core ? 0.9 : 0.5); left.fxBulge = c.core ? 1 : 0.7;
        g.audio.play(c.core ? 'heal' : 'swallow', { vol: c.core ? 0.5 : 0.35 });
        if (c.core) { S.coreAt = t; g.audio.play('crystal', { vol: 0.35 }); }
      }
    });

    // the tentacle with no current component eases back to its resting stub
    for (const key of ['LA', 'LB']) {
      if (!want[key]) { const gl = tents[key].goal; gl.extend = Math.max(0, gl.extend - dt * 3.2); gl.wrap = Math.max(0, gl.wrap - dt * 4); }
    }
    left.rw = damp(left.rw, armW, 10, dt);
    if (armT) left.rt.copy(armT);
    left.fxSpread = armW > 0.1 ? 0.5 : 0;
    left.fxBulge = Math.max(0, left.fxBulge - dt * 2.5);
    if (S.coreAt !== undefined && t > S.coreAt + 0.15) this.finish();
    else if (t > FAILSAFE) this.finish();
  }

  hasNext(k) { return PLAN.some((p, i) => i > k && p.tent === PLAN[k].tent); }

  // The component's fastenings release: it leaves the robot as one separate piece.
  release(c, p) {
    const g = this.game;
    c.released = true;
    const piece = new THREE.Group();
    piece.position.copy(c.center0);
    g.scene.add(piece);
    piece.updateMatrixWorld(true);
    for (const n of c.nodes) piece.attach(n);
    c.piece = piece;
    c.mats = [];
    piece.traverse((o) => {
      if (!o.isMesh) return;
      const mats = [].concat(o.material).map((m) => {
        const cm = m.clone();
        cm.transparent = true; cm.userData.e0 = cm.emissive ? cm.emissive.clone() : new THREE.Color(); cm.userData.i0 = cm.emissiveIntensity;
        c.mats.push(cm);
        return cm;
      });
      o.material = Array.isArray(o.material) ? mats : mats[0];
    });
    const q = c.center0;
    for (let i = 0; i < 12; i++) g.effects.glowP.emit(q.x + (Math.random() - 0.5) * 0.2, q.y + (Math.random() - 0.5) * 0.2, q.z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 2.5, Math.random() * 2, (Math.random() - 0.5) * 2.5, 0.35, 0.035, 1, 0.75, 0.3, 6, 1);
    g.audio.play('clatter', { vol: 0.3 });
    g.audio.play('spark', { vol: 0.12 });
  }

  // Resolve exactly once: reward, heal, remove the robot, release the arm.
  finish() {
    const g = this.game, S = this.seq;
    if (!S) return;
    this.seq = null; this.target = null;
    const e = S.e;
    for (const c of S.comps) if (c.piece) c.piece.removeFromParent();
    this.clearFx();
    e.absorbing = false;
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
