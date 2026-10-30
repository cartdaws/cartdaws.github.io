import * as THREE from 'three';
import { clamp, lerp, smooth } from '../core/util.js';

const RANGE = 4.4;          // metres from the eye
const CONE = 0.9;           // cosine of the aiming cone
const HOLD = 0.6;           // seconds of contact before the body is drawn in
const DRAW = 0.5;           // seconds the body takes to be drawn into the arm
const HEAL = { bug: 14, drone: 24 };

const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _m = new THREE.Vector3();

// Absorb weakened enemies: hold E (or the ABSORB button) while looking at one that is nearly dead.
// The body is pulled into the weapon arm, the player recovers health, and the kill counts for the encounter.
export class Absorber {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.progress = 0;
    this.drawing = null; // { e, t, from }
    this.hinted = false;
  }

  reset() {
    this.target = null; this.progress = 0; this.drawing = null;
    this.game.viewmodel.reachW = 0;
    this.game.ui.setPrompt('');
    if (this.game.touchUI) this.game.touchUI.setAbsorb(false);
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

  update(dt) {
    const g = this.game, vm = g.viewmodel, input = g.input, ui = g.ui;
    if (this.drawing) {
      const D = this.drawing;
      D.t += dt;
      const k = smooth(D.t / DRAW);
      const mouth = vm.right.muzzle.getWorldPosition(_m);
      D.e.pos.set(lerp(D.from.x, mouth.x, k), lerp(D.from.y, mouth.y - 0.4, k), lerp(D.from.z, mouth.z, k));
      D.e.group.scale.setScalar(lerp(1, 0.05, k));
      D.e.group.rotation.y += dt * 9 * k;
      if (Math.random() < 0.9) g.effects.glowP.emit(D.e.pos.x, D.e.pos.y + 0.4, D.e.pos.z, (Math.random() - 0.5) * 1.5, (Math.random() - 0.2) * 1.5, (Math.random() - 0.5) * 1.5, 0.35, 0.05, 0.4, 1, 0.9);
      vm.pulseGlow(0.5);
      if (D.t >= DRAW) this.finish(D.e);
      return;
    }

    const target = this.pick();
    const wants = input.down('KeyE') || input.touchAbsorb;
    if (target !== this.target) { this.target = target; this.progress = 0; }
    if (g.touchUI) g.touchUI.setAbsorb(!!target);

    if (!target) {
      this.progress = 0;
      vm.reachW = Math.max(0, vm.reachW - dt * 5);
      ui.setPrompt('');
      return;
    }
    if (!this.hinted) { this.hinted = true; ui.hint(g.touchMode ? 'TAP ABSORB ON WEAKENED ENEMIES' : 'HOLD E TO ABSORB WEAKENED ENEMIES', 4); }
    ui.setPrompt(g.touchMode ? 'ABSORB' : 'HOLD E — ABSORB');
    if (wants) {
      this.progress = clamp(this.progress + dt / HOLD, 0, 1);
      g.camera.updateMatrixWorld();
      vm.reachTarget.copy(g.camera.worldToLocal(target.hitSpheres[0].c.clone()));
      vm.reachW = smooth(this.progress);
      vm.pulseGlow(0.25 + 0.35 * this.progress);
      const c = target.hitSpheres[0].c;
      if (Math.random() < 0.6) g.effects.glowP.emit(c.x + (Math.random() - 0.5) * 0.5, c.y + (Math.random() - 0.5) * 0.4, c.z + (Math.random() - 0.5) * 0.5, 0, 0.6, 0, 0.3, 0.04, 0.4, 1, 0.9);
      if (this.progress >= 1) this.begin(target);
    } else {
      this.progress = Math.max(0, this.progress - dt * 2.5);
      vm.reachW = Math.max(0, vm.reachW - dt * 5);
    }
  }

  begin(e) {
    const g = this.game;
    e.absorbing = true;
    e.flashT = 0;
    this.drawing = { e, t: 0, from: e.pos.clone() };
    g.audio.play('absorb', { vol: 0.6 });
    g.audio.play('swallow', { vol: 0.8 });
    g.ui.setPrompt('');
  }

  finish(e) {
    const g = this.game, p = g.player;
    this.drawing = null; this.target = null; this.progress = 0;
    g.viewmodel.reachW = 0;
    e.group.scale.setScalar(1);
    e.die(true); // counts for the encounter, no explosion
    p.health = Math.min(p.maxHealth, p.health + (HEAL[e.kind] || 14));
    g.ui.hitMarker(true);
    g.audio.play('crystal', { vol: 0.5 });
    g.viewmodel.pulseGlow(0.8);
    g.addShake(0.05);
  }
}
