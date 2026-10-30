import * as THREE from 'three';
import { lerp, smooth, seg } from '../core/util.js';
import { makeHandGel } from './hand.js';

const ease = (t, a, b) => smooth(seg(t, a, b));
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// Camera-local resting point for the supporting (left) hand while it holds prey: low and to the side, clear of the crosshair.
export const HOLD_LOCAL = new THREE.Vector3(-0.3, -0.25, -0.8);

// One coherent feeding action, driven by u in 0..1 (the caller owns the clock):
//   reach -> an elastic stalk connects -> the hand spreads and pulls the prey in -> gel envelops it ->
//   it compresses and dissolves under the skin -> a pulse runs up the forearm -> the arm settles.
export class AbsorbFX {
  constructor(vm) {
    this.vm = vm;
    this.arm = vm.left;
    this.gel = makeHandGel({ color: 0x118078, rim: 0xc6fff6, alpha: 0.5 });
    this.blob = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), this.gel);
    this.blob.renderOrder = 7; this.blob.frustumCulled = false; this.blob.visible = false;
    vm.root.add(this.blob);
    this.pos = new THREE.Vector3(); // current prey position, camera space
    this.size = 0.3;                // prey radius in metres at rest
  }

  // Release every pose override: the arm goes back to its ready pose.
  clear() {
    const vm = this.vm, arm = this.arm;
    arm.rw = 0; arm.fxSpread = 0; arm.fxCurl = 0; arm.fxBulge = 0;
    vm.tendrils.hide();
    this.blob.visible = false;
  }

  // start: prey centre in camera space when the action began; returns the prey pose for this frame
  // out = { pos (camera space), scale (1 -> small), dissolve 0..1, energy 0..1 }
  update(u, start, out) {
    const vm = this.vm, arm = this.arm, tb = vm.tendrils;
    const reach = ease(u, 0.0, 0.2) * (1 - ease(u, 0.82, 1.0));
    const pull = ease(u, 0.3, 0.58);
    const env = ease(u, 0.5, 0.7);
    const diss = ease(u, 0.62, 0.86);
    const into = ease(u, 0.8, 0.97);

    // the prey drifts in toward the hand; it only starts moving once the stalk has connected
    const tgt = _a.copy(start).lerp(HOLD_LOCAL, pull);
    tgt.y += Math.sin(pull * Math.PI) * 0.04;           // slight lift on the way: weight
    this.pos.copy(tgt);
    out.pos = this.pos;
    out.scale = lerp(1, 0.3, pull) * lerp(1, 0.3, diss);
    out.dissolve = diss;
    out.energy = ease(u, 0.55, 0.8) * (1 - into);

    // arm: reaches at the prey while it is far, then draws back with it
    arm.rw = reach;
    arm.rt.copy(this.pos);
    arm.fxSpread = ease(u, 0.08, 0.3) * (1 - ease(u, 0.56, 0.72)) * 0.9;
    arm.fxCurl = ease(u, 0.52, 0.72) * (1 - ease(u, 0.84, 0.98)) * 0.85;

    // elastic stalk: shoots out, overshoots, then slackens as the prey arrives, and retracts as it is enveloped
    vm.palmLocalOf(arm, tb.origin);
    tb.target.copy(this.pos);
    tb.extend = ease(u, 0.1, 0.32) * (1 - ease(u, 0.58, 0.72));
    tb.wrap = ease(u, 0.28, 0.46) * (1 - ease(u, 0.58, 0.7));

    // gel skin envelops the prey, compresses with it, then is drawn into the wrist
    const b = this.blob;
    b.visible = env > 0.01 && into < 0.995;
    if (b.visible) {
      const r = this.size * out.scale * 0.95 * (0.35 + 0.65 * env) * lerp(1, 0.55, diss) * (1 - into) + 0.012;
      b.position.copy(this.pos);
      vm.palmLocalOf(arm, _b);
      b.position.lerp(_b, into);
      b.scale.set(r * 1.1, r * (1 - 0.15 * Math.sin(u * 40) * diss), r);
    }

    // pulse travels up the forearm
    arm.fxBulge = Math.sin(into * Math.PI) * 0.9 * (1 - ease(u, 0.97, 1));
    if (into > 0 && into < 1) vm.pulseGlow(0.3 + 0.35 * Math.sin(into * Math.PI));
    return out;
  }
}
