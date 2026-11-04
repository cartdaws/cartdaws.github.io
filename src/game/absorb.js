import * as THREE from 'three';
import { clamp, lerp, smooth } from '../core/util.js';
import { progress } from './progress.js';

const RANGE = 4.4;          // metres from the eye
const CONE = 0.9;           // cosine of the aiming cone
const REACH = 0.3;          // seconds the arm reaches out before the body moves
const DRAW = 0.85;          // total seconds from the tap until the body is gone
const HEAL = { bug: 14, drone: 24 };

const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _m = new THREE.Vector3();

// Absorb shut-down enemies: tap right click (or E, or the ABSORB button) while looking at a powered-down one.
// The body is pulled into the weapon arm, the player recovers health and grows permanently sturdier, and the kill counts for the room.
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
    this.game.ui.setHold(null);
    if (this.game.touchUI) this.game.touchUI.setAbsorb(false);
  }

  pick() {
    const g = this.game;
    g.camera.getWorldDirection(_d);
    const cp = g.camera.position;
    let best = null, bestDot = CONE;
    for (const e of g.enemies) {
      if (!e.absorbable) continue;
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
    const tap = input.clicked(2) || input.was('KeyE') || input.absorbTap;
    input.absorbTap = false;
    if (this.drawing) {
      const D = this.drawing;
      D.t += dt;
      g.camera.updateMatrixWorld();
      vm.reachTarget.copy(g.camera.worldToLocal(D.e.hitSpheres[0].c.clone()));
      vm.reachW = smooth(D.t / REACH);
      const k = smooth((D.t - REACH) / (DRAW - REACH));
      if (D.t >= REACH) {
        const mouth = vm.right.muzzle.getWorldPosition(_m);
        D.e.pos.set(lerp(D.from.x, mouth.x, k), lerp(D.from.y, mouth.y - 0.4, k), lerp(D.from.z, mouth.z, k));
        D.e.group.scale.setScalar(lerp(D.e.baseScale, 0.05, k));
        D.e.group.rotation.y += dt * 9 * k;
      }
      if (Math.random() < 0.9) g.effects.glowP.emit(D.e.pos.x, D.e.pos.y + 0.4, D.e.pos.z, (Math.random() - 0.5) * 1.5, (Math.random() - 0.2) * 1.5, (Math.random() - 0.5) * 1.5, 0.35, 0.05, 0.4, 1, 0.9);
      vm.pulseGlow(0.3 + 0.4 * k);
      if (D.t >= DRAW) this.finish(D.e);
      return;
    }

    const target = this.pick();
    if (target !== this.target) this.target = target;
    if (g.touchUI) g.touchUI.setAbsorb(!!target);

    if (!target) {
      vm.reachW = Math.max(0, vm.reachW - dt * 5);
      ui.setPrompt('');
      return;
    }
    if (!this.hinted) { this.hinted = true; ui.hint(g.touchMode ? 'TAP ABSORB ON DISABLED ROBOTS' : 'RIGHT CLICK TO ABSORB DISABLED ROBOTS', 4); }
    ui.setPrompt(g.touchMode ? 'ABSORB' : 'RIGHT CLICK — ABSORB');
    vm.reachW = Math.max(0, vm.reachW - dt * 5);
    const c = target.hitSpheres[0].c;
    if (Math.random() < 0.5) g.effects.glowP.emit(c.x + (Math.random() - 0.5) * 0.5, c.y + (Math.random() - 0.5) * 0.4, c.z + (Math.random() - 0.5) * 0.5, 0, 0.6, 0, 0.3, 0.04, 0.4, 1, 0.9);
    if (tap) this.begin(target);
  }

  begin(e) {
    const g = this.game;
    e.absorbing = true;
    e.flashT = 0;
    this.drawing = { e, t: 0, from: e.pos.clone() };
    g.audio.play('absorb', { vol: 0.6 });
    g.audio.play('swallow', { vol: 0.8 });
    g.ui.setPrompt('');
    g.ui.setHold(null);
  }

  finish(e) {
    const g = this.game, p = g.player;
    this.drawing = null; this.target = null; this.progress = 0;
    g.viewmodel.reachW = 0;
    e.group.scale.setScalar(e.baseScale);
    e.die(true); // counts for the encounter, no explosion
    // every absorbed machine makes the body permanently sturdier
    progress.addMaxHp();
    p.maxHealth += 1;
    p.health = Math.min(p.maxHealth, p.health + (e.heal ?? HEAL[e.kind] ?? 14) + 1);
    g.ui.setHealth(p.health, p.maxHealth);
    g.ui.rewardNote('MAX HP +1');
    g.ui.hitMarker(true);
    g.audio.play('crystal', { vol: 0.5 });
    g.viewmodel.pulseGlow(0.8);
    g.addShake(0.05);
  }
}
