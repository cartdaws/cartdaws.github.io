import * as THREE from 'three';
import { lerp, smooth, seg } from '../core/util.js';

export const ABSORB_RANGE = 3.4;   // metres from the eye to the enemy's centre
const CONE = 0.8;                  // cosine of the aiming cone (about 37 degrees): no pixel-perfect aim needed
export const ABSORB_HEAL = 25;     // health restored by every successful absorption, bugs and drones alike
const DURATION = 1.05;             // seconds from commit to the arm settling
const FAILSAFE = DURATION + 1.5;   // a committed absorption always resolves by now

const ease = (t, a, b) => smooth(seg(t, a, b));
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _w = new THREE.Vector3(), _l = new THREE.Vector3(), _p = new THREE.Vector3();
const _out = {};

// Absorbing a disabled enemy is the alien's way of surviving. One press (right click, or the ABSORB button) commits;
// the supporting hand reaches, an elastic stalk connects, the prey is pulled in, enveloped, dissolved under the skin and
// a pulse runs up the forearm. Every absorbed enemy restores ABSORB_HEAL health and permanently adds 1 maximum health.
export class Absorber {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.seq = null;
    this.hinted = false;
  }

  // True only while a committed absorption is actually running in an unpaused game.
  get protecting() { return !!this.seq && !this.game.paused && this.game.state === 'playing'; }
  get busy() { return !!this.seq; }

  // Abort anything in flight (restart, death, retry): the enemy is restored, the arm released, protection gone.
  reset() {
    const S = this.seq;
    if (S) this.restore(S);
    this.seq = null; this.target = null;
    const g = this.game;
    g.viewmodel.absorbFX.clear();
    g.ui.setPrompt('');
    for (const e of g.enemies) e.ringBoost = false;
    if (g.touchUI) g.touchUI.setAbsorb(false);
  }

  restore(S) {
    const e = S.e;
    e.absorbing = false;
    e.group.scale.setScalar(1);
    for (const [m, o] of S.mats) { m.opacity = o.op; m.transparent = o.tr; m.needsUpdate = true; if (m.emissive && o.em) { m.emissive.copy(o.em); m.emissiveIntensity = o.ei; } }
  }

  // Eligible: disabled, within reach, roughly in front, and not behind cover.
  eligible(e) {
    const g = this.game;
    if (!e.alive || !e.weak || e.absorbing || e.rewarded) return -1;
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
    const g = this.game;
    e.absorbing = true;
    e.ringBoost = false;
    if (e.absRing) e.absRing.visible = false;
    e.flashT = 0;
    const mats = new Map();
    e.group.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      for (const m of [].concat(o.material)) if (!mats.has(m)) mats.set(m, { op: m.opacity, tr: m.transparent, em: m.emissive ? m.emissive.clone() : null, ei: m.emissiveIntensity });
    });
    for (const m of mats.keys()) { m.transparent = true; m.needsUpdate = true; }
    const c = e.hitSpheres[0].c;
    this.seq = { e, t: 0, mats, startW: c.clone(), cOff: c.y - e.pos.y, size: Math.max(0.25, e.hitSpheres[0].r || 0.35), f: {} };
    g.viewmodel.absorbFX.size = this.seq.size;
    this.target = null;
    g.ui.setPrompt('');
    g.audio.play('servo', { vol: 0.25 });
  }

  update(dt) {
    const g = this.game, ui = g.ui;
    if (this.seq) { this.run(dt); return; }
    const fx = g.viewmodel.absorbFX;
    if (fx.arm.rw > 0 || fx.blob.visible) fx.clear();

    const target = this.pick();
    this.target = target;
    for (const e of g.enemies) e.ringBoost = e === target;
    if (g.touchUI) g.touchUI.setAbsorb(!!target);
    if (!target) { ui.setPrompt(''); return; }
    if (!this.hinted) { this.hinted = true; ui.hint(g.touchMode ? 'TAP ABSORB ON DISABLED ENEMIES' : 'RIGHT CLICK TO ABSORB DISABLED ENEMIES', 3.5); }
    ui.setPrompt(g.touchMode ? 'ABSORB' : 'RIGHT CLICK — ABSORB');
  }

  run(dt) {
    const g = this.game, vm = g.viewmodel, S = this.seq, e = S.e, fx = vm.absorbFX;
    S.t += dt;
    const u = Math.min(1, S.t / DURATION), t = S.t;
    g.camera.updateMatrixWorld();
    _l.copy(S.startW); g.camera.worldToLocal(_l);                 // where the prey stood, as seen from the camera now
    fx.update(u, _l, _out);

    // place the prey where the effect says it is
    _w.copy(_out.pos); g.camera.localToWorld(_w);
    const sc = Math.max(0.02, _out.scale);
    e.group.scale.setScalar(sc);
    e.pos.set(_w.x, _w.y - S.cOff * sc, _w.z);
    e.group.rotation.y += dt * 5 * ease(u, 0.3, 0.6);

    // the machine is drained: material goes translucent and takes on the gel's colour, stored energy streams to the palm
    const dis = _out.dissolve;
    for (const [m, o] of S.mats) {
      m.opacity = o.op * lerp(1, 0.2, dis);
      if (m.emissive) { m.emissive.setRGB(lerp(o.em.r, 0.15, dis), lerp(o.em.g, 0.95, dis), lerp(o.em.b, 0.8, dis)); m.emissiveIntensity = lerp(o.ei, 1.2, dis); }
    }
    if (_out.energy > 0.02 && Math.random() < 0.8) {
      vm.palmLocalOf(fx.arm, _p); g.camera.localToWorld(_p);
      const sp = _w;
      g.effects.glowP.emit(sp.x + (Math.random() - 0.5) * 0.15, sp.y + (Math.random() - 0.5) * 0.15, sp.z + (Math.random() - 0.5) * 0.15,
        (_p.x - sp.x) * 3.5, (_p.y - sp.y) * 3.5, (_p.z - sp.z) * 3.5, 0.28, 0.035, 1, 0.75, 0.35, 0, 0);
    }
    const f = S.f;
    if (u > 0.3 && !f.a) { f.a = true; g.audio.play('gel', { vol: 0.5 }); }
    if (u > 0.58 && !f.b) { f.b = true; g.audio.play('swallow', { vol: 0.7 }); if (e.kind === 'bug' || e.kind === 'drone') g.audio.play('spark', { vol: 0.15 }); }
    if (u > 0.88 && !f.c) { f.c = true; g.audio.play('crystal', { vol: 0.3 }); vm.pulseGlow(0.6); }
    if (u >= 1 || t > FAILSAFE) this.finish();
  }

  // Resolve exactly once: reward, heal, remove the enemy, release the arm.
  finish() {
    const g = this.game, S = this.seq;
    if (!S) return;
    this.seq = null; this.target = null;
    const e = S.e;
    g.viewmodel.absorbFX.clear();
    e.group.scale.setScalar(1);
    e.absorbing = false;
    if (e.alive && !e.rewarded) {
      e.rewarded = true;
      g.grantMaxHp();
      const p = g.player;
      p.health = Math.min(p.maxHealth, p.health + ABSORB_HEAL);
      g.ui.hitMarker(true);
      g.viewmodel.pulseGlow(0.8);
      g.audio.play('heal', { vol: 0.4 });
    }
    e.die(true);
    g.ui.setPrompt('');
  }
}
