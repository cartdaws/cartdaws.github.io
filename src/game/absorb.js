import * as THREE from 'three';
import { clamp, lerp, smooth, seg } from '../core/util.js';

const RANGE = 4.6;          // metres from the eye
const CONE = 0.88;          // cosine of the aiming cone
const HEAL = { bug: 14, drone: 24 };
// Timeline of one absorption (seconds): spit -> deconstruct -> draw in. One press starts it.
const SPIT = 0.3, DISSOLVE_END = 1.25, END = 1.95;

const ease = (t, a, b) => smooth(seg(t, a, b));
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _m = new THREE.Vector3(), _c = new THREE.Vector3(), _mouth = new THREE.Vector3();

// Absorb a weakened enemy with one press (right click / E / ABSORB button).
// Like a fly feeding: a glob of gel is spat onto the body, it deconstructs into a puddle, tendrils reach out and wrap it,
// and the liquefied mass is drawn up into the arm. The player heals and the kill counts for the encounter.
export class Absorber {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.seq = null;
    this.hinted = false;
  }

  reset() {
    this.target = null; this.seq = null;
    const g = this.game;
    g.viewmodel.reachW = 0; g.viewmodel.bulge = 0; g.viewmodel.tendrils.hide();
    g.ui.setPrompt('');
    if (g.touchUI) g.touchUI.setAbsorb(false);
  }

  pick() {
    const g = this.game;
    g.camera.getWorldDirection(_d);
    const cp = g.camera.position;
    let best = null, bestDot = CONE;
    for (const e of g.enemies) {
      if (!e.alive || !e.weak || e.absorbing) continue;
      const c = e.hitSpheres[0].c;
      _t.subVectors(c, cp);
      const dist = _t.length();
      if (dist > RANGE || dist < 0.3) continue;
      const dot = _t.divideScalar(dist).dot(_d);
      if (dot < bestDot) continue;
      if (g.world.blocked(cp.x, cp.y, cp.z, c.x, c.y, c.z, (b) => b.tag !== 'barrel')) continue;
      best = e; bestDot = dot;
    }
    return best;
  }

  // called on right click / E / the ABSORB button
  request() {
    const g = this.game;
    if (this.seq || g.state !== 'playing' || g.paused || g.player.dead) return;
    const e = this.pick();
    if (e) this.begin(e);
  }

  begin(e) {
    const g = this.game, vm = g.viewmodel;
    e.absorbing = true;
    e.flashT = 0;
    const mats = new Map();
    e.group.traverse((o) => { if (o.isMesh && o.material && !mats.has(o.material)) mats.set(o.material, { op: o.material.opacity, em: o.material.emissive ? o.material.emissive.clone() : null, ei: o.material.emissiveIntensity, col: o.material.color ? o.material.color.clone() : null }); });
    for (const m of mats.keys()) { m.transparent = true; m.needsUpdate = true; }
    this.seq = { e, t: 0, mats, y0: e.pos.y, spat: false, steamT: 0 };
    this.target = null;
    g.ui.setPrompt('');
    g.audio.play('absorb', { vol: 0.5 });
    vm.pulseGlow(0.5);
  }

  localOf(world, out) { this.game.camera.updateMatrixWorld(); return out.copy(world).applyMatrix4(this.game.camera.matrixWorldInverse); }

  update(dt) {
    const g = this.game, vm = g.viewmodel, ui = g.ui;
    const tb = vm.tendrils;
    if (this.seq) { this.run(dt); return; }
    // tendrils left over from a finished sequence retract
    if (tb.extend > 0) { tb.extend = Math.max(0, tb.extend - dt * 3.2); tb.wrap = Math.max(0, tb.wrap - dt * 3); }
    vm.reachW = Math.max(0, vm.reachW - dt * 4);
    vm.bulge = Math.max(0, vm.bulge - dt * 2);

    const target = this.pick();
    this.target = target;
    if (g.touchUI) g.touchUI.setAbsorb(!!target);
    if (!target) { ui.setPrompt(''); return; }
    if (!this.hinted) { this.hinted = true; ui.hint(g.touchMode ? 'TAP ABSORB ON WEAKENED ENEMIES' : 'RIGHT CLICK TO ABSORB WEAKENED ENEMIES', 4); }
    ui.setPrompt(g.touchMode ? 'ABSORB' : 'RIGHT CLICK — ABSORB');
  }

  run(dt) {
    const g = this.game, vm = g.viewmodel, S = this.seq, e = S.e, tb = vm.tendrils;
    S.t += dt;
    const t = S.t;
    g.camera.updateMatrixWorld();
    const body = _c.set(e.pos.x, S.y0 + (e.kind === 'drone' ? 0 : 0.28), e.pos.z);        // centre of the body in world space
    const k = ease(t, SPIT, DISSOLVE_END);                                                   // deconstruction 0..1
    const suck = ease(t, DISSOLVE_END, END);                                                 // drawn in 0..1
    const palm = vm.palmLocal(tb.origin);
    this.localOf(body, tb.target);

    // arm reaches for the prey
    vm.reachTarget.copy(tb.target);
    vm.reachW = smooth(Math.min(1, t / 0.25)) * (1 - ease(t, END - 0.2, END + 0.2));
    // 1. SPIT: a glob of gel leaves the palm and lands on the body
    if (!S.spat && t >= 0.02) {
      S.spat = true;
      g.audio.play('swallow', { vol: 0.7 });
      tb.spit(palm.clone(), tb.target.clone(), SPIT - 0.04, () => {
        g.audio.play('gel', { vol: 0.8 });
        for (let i = 0; i < 18; i++) g.effects.glowP.emit(body.x, body.y + 0.1, body.z, (Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3, 0.5, 0.05, 0.4, 1, 0.5, 6, 1);
      });
    }
    // 2. tendrils sprout, reach and wrap while the body deconstructs
    tb.extend = ease(t, 0.12, 0.75) * (1 - ease(t, END - 0.15, END + 0.35));
    tb.wrap = ease(t, 0.55, 1.25) * (1 - ease(t, END - 0.15, END + 0.2));
    // the acid works: the body slumps into a puddle, goes translucent and green, and steams
    const sx = 1 + 0.4 * k, sy = Math.max(0.12, 1 - 0.88 * k);
    const fade = 1 - suck;
    e.group.scale.set(sx * fade + 0.001, sy * fade + 0.001, sx * fade + 0.001);
    if (e.kind === 'drone') e.pos.y = lerp(S.y0, 0.3, k * k);
    e.group.rotation.z = Math.sin(t * 40) * 0.05 * k * (1 - suck);
    for (const [m, o] of S.mats) {
      m.opacity = o.op * (1 - 0.7 * k) * (suck > 0 ? 1 - 0.5 * suck : 1);
      if (m.emissive) { m.emissive.setRGB(lerp(o.em.r, 0.2, k), lerp(o.em.g, 1, k), lerp(o.em.b, 0.45, k)); m.emissiveIntensity = lerp(o.ei, 1.4, k); }
      if (m.color && o.col) m.color.setRGB(lerp(o.col.r, 0.25, k * 0.7), lerp(o.col.g, 0.6, k * 0.7), lerp(o.col.b, 0.3, k * 0.7));
    }
    if (t > SPIT && t < DISSOLVE_END + 0.2) {                                                 // bubbling and steam
      S.steamT += dt;
      if (S.steamT > 0.03) {
        S.steamT = 0;
        g.effects.glowP.emit(body.x + (Math.random() - 0.5) * 0.6, S.y0 * 0.3 + 0.1, body.z + (Math.random() - 0.5) * 0.6, 0, 0.9 + Math.random() * 0.8, 0, 0.5, 0.04, 0.4, 1, 0.45, -1, 0.5);
        g.effects.smokeP.emit(body.x + (Math.random() - 0.5) * 0.5, 0.3, body.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, 0.8, (Math.random() - 0.5) * 0.3, 0.9, 0.3, 0.6, 0.9, 0.7, -0.3, 1, 1.5);
      }
    }
    // 3. the liquid is drawn up the tendrils and into the arm
    if (t > DISSOLVE_END - 0.1) {
      const mouth = vm.right.muzzle.getWorldPosition(_mouth);
      const start = mouth.clone().sub(body).multiplyScalar(0);
      for (let i = 0; i < 3; i++) {
        const sp = new THREE.Vector3(body.x + (Math.random() - 0.5) * 0.35, body.y + (Math.random() - 0.5) * 0.2, body.z + (Math.random() - 0.5) * 0.35);
        const v = _m.copy(mouth).sub(sp).multiplyScalar(1 / 0.32);
        g.effects.glowP.emit(sp.x, sp.y, sp.z, v.x, v.y, v.z, 0.3, 0.05, 0.5, 1, 0.8, 0, 0);
      }
      vm.bulge = Math.sin(suck * Math.PI) * 0.8 + 0.2 * suck;
      vm.pulseGlow(0.3 + 0.4 * suck);
    }
    if (t >= END) this.finish(e);
  }

  finish(e) {
    const g = this.game, p = g.player;
    this.seq = null; this.target = null;
    e.group.scale.setScalar(1);
    e.group.rotation.z = 0;
    e.die(true); // counts for the encounter, no explosion
    p.health = Math.min(p.maxHealth, p.health + (HEAL[e.kind] || 14));
    g.ui.hitMarker(true);
    g.audio.play('crystal', { vol: 0.5 });
    g.viewmodel.pulseGlow(0.9);
    g.addShake(0.05);
  }
}
