import * as THREE from 'three';

// One continuous gel limb from the shoulder to the wrist. The hand mesh supplies the palm and fingers; this tube replaces the rigid forearm and the
// separate upper arm, so there is no seam, no joint ball and no stick: the same soft skin flows from the body through a gentle bend to the hand.
// It lives in the view model's space, so it is drawn with the hands (never clipped by the world) and in the creator it follows them exactly.
//
// Shape: from the wrist the limb runs straight back along the forearm axis for STRAIGHT metres (the tentacle sockets and cuffs sit on this stretch),
// then curves smoothly into the shoulder on a cubic whose first tangent continues the forearm, so nothing kinks. A slow travelling wobble and a
// faint breathing swell make it read as jelly rather than rod.
const RN = 30, RAD = 16, NS = 10;       // rings along the limb, segments round it, rings on the straight stretch
export const STRAIGHT = 0.64;
const START = 0.10;                     // the tube picks up exactly where the hand mesh stops (its clip plane), at the same radius

const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class FlowLimb {
  constructor(mat, parent, seed = 0) {
    this.seed = seed;
    const geo = this.geo = new THREE.BufferGeometry();
    const n = RN * RAD;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < RN; i++) for (let k = 0; k < RAD; k++) {
      uv[(i * RAD + k) * 2] = k / RAD; uv[(i * RAD + k) * 2 + 1] = i / (RN - 1);
      if (i < RN - 1) { const k2 = (k + 1) % RAD; idx.push(i * RAD + k, i * RAD + k2, (i + 1) * RAD + k2, i * RAD + k, (i + 1) * RAD + k2, (i + 1) * RAD + k); }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    parent.add(this.mesh);
    this.W = new THREE.Vector3(); this.axis = new THREE.Vector3(); this.P1 = new THREE.Vector3(); this.S = new THREE.Vector3();
    this.c1 = new THREE.Vector3(); this.c2 = new THREE.Vector3();
    this.rw = 0.054; this.bez = Array.from({ length: 9 }, () => new THREE.Vector3());
    this.lag = new THREE.Vector3(); this.has = false;
  }

  // wrist W, unit axis pointing from the wrist back along the forearm, shoulder S and its outward normal
  solve(W, axis, S, out, dt) {
    this.W.copy(W); this.axis.copy(axis); this.S.copy(S);
    // the straight stretch shortens when the shoulder is close (a lowered arm), so the limb never doubles back on itself
    this.L = Math.min(STRAIGHT, Math.max(0.2, W.distanceTo(S) * 0.78));
    this.P1.copy(W).addScaledVector(axis, START + this.L);
    const away = _w.subVectors(S, this.P1).length();
    // the bend: continue the forearm's direction, then arrive at the shoulder from outside the body
    this.c1.copy(this.P1).addScaledVector(axis, 0.1 + 0.25 * Math.min(1, away));
    this.c2.copy(S).addScaledVector(out, 0.1 + 0.22 * Math.min(1, away));
    // jelly: the bend lags the arm a little and settles with a soft spring (never accumulates: it relaxes to the target)
    const target = _t.copy(this.c1).add(this.c2).multiplyScalar(0.5);
    if (!this.has) { this.lag.copy(target); this.has = true; }
    this.lag.lerp(target, 1 - Math.exp(-9 * Math.min(dt || 0.016, 0.05)));
    const d = _u.subVectors(this.lag, target);
    this.c1.add(d.multiplyScalar(0.6)); this.c2.add(d);
    this.sample();
  }

  bezierAt(u, out) {
    const a = 1 - u;
    return out.set(0, 0, 0).addScaledVector(this.P1, a * a * a).addScaledVector(this.c1, 3 * a * a * u).addScaledVector(this.c2, 3 * a * u * u).addScaledVector(this.S, u * u * u);
  }

  sample() { for (let i = 0; i < this.bez.length; i++) this.bezierAt((i + 1) / this.bez.length, this.bez[i]); }

  // write the tube. t = time (for the wobble), width = scale of the limb's thickness
  write(t, width = 1) {
    const pos = this.geo.attributes.position.array, nor = this.geo.attributes.normal.array;
    const NB = RN - NS;                       // rings on the curved part
    let prevU = null;
    for (let i = 0; i < RN; i++) {
      let a;                                    // 0 at the wrist, 1 at the shoulder
      if (i < NS) { const s = i / (NS - 1); _p.copy(this.W).addScaledVector(this.axis, START + this.L * s); a = 0.4 * s; }
      else { const u = (i - NS + 1) / NB; this.bezierAt(u, _p); a = 0.4 + 0.6 * u; }
      // travelling wobble along the curved part, fading to nothing at both ends
      if (i >= NS) { const u = (i - NS + 1) / NB, f = Math.sin(Math.PI * u) * 0.011; _p.x += Math.sin(t * 1.7 + this.seed + u * 6) * f; _p.y += Math.cos(t * 1.3 + this.seed * 1.7 + u * 5) * f; }
      // tangent by neighbours
      this.pointAt(Math.max(0, i - 1), _u); this.pointAt(Math.min(RN - 1, i + 1), _v);
      _t.subVectors(_v, _u).normalize();
      if (!prevU) { _u.crossVectors(_t, Math.abs(_t.y) > 0.9 ? _w.set(1, 0, 0) : _w.set(0, 1, 0)).normalize(); } else { _u.copy(prevU).addScaledVector(_t, -prevU.dot(_t)).normalize(); }
      prevU = this._pu = (this._pu || new THREE.Vector3()).copy(_u);
      _v.crossVectors(_t, _u).normalize();
      // jelly thickness: a soft taper from the wrist to a fuller upper arm, a faint swell at the bend, a slow breathing pulse, a rounded end inside the body
      const swell = 1 + 0.42 * a + 0.14 * Math.exp(-(((a - 0.62) / 0.14) ** 2)) + 0.025 * Math.sin(t * 1.4 + this.seed + a * 9);
      const end = i > RN - 3 ? 1 - (i - (RN - 3)) * 0.22 : 1;
      const ramp = i === 0 ? 0.9 : i === 1 ? 0.98 : 1;                 // starts just inside the hand's skin, emerges at full width where the hand mesh stops
      const r = this.rw * width * swell * end * ramp;
      for (let k = 0; k < RAD; k++) {
        const ang = k / RAD * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang), j = (i * RAD + k) * 3;
        pos[j] = _p.x + (_u.x * ca + _v.x * sa) * r; pos[j + 1] = _p.y + (_u.y * ca + _v.y * sa) * r; pos[j + 2] = _p.z + (_u.z * ca + _v.z * sa) * r;
        nor[j] = _u.x * ca + _v.x * sa; nor[j + 1] = _u.y * ca + _v.y * sa; nor[j + 2] = _u.z * ca + _v.z * sa;
      }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true;
  }

  // the centre line (without the wobble), used for neighbours' tangents
  pointAt(i, out) {
    if (i < NS) return out.copy(this.W).addScaledVector(this.axis, START + this.L * (i / (NS - 1)));
    return this.bezierAt((i - NS + 1) / (RN - NS), out);
  }
}
