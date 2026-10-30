import * as THREE from 'three';
import { lerp } from '../core/util.js';
import { TentacleMesh, bezier, SpringChain } from './tentacle.js';
import { makeHandGel } from './hand.js';

const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3(), _T = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3(), _lat = new THREE.Vector3();

// Feeding tendrils: several thin gel tendrils shoot out of the palm to a target, wrap around it, and haul it in.
// They live in camera space (children of the viewmodel root), so callers pass camera-local points.
export class TendrilBundle {
  constructor(parent, count = 6) {
    this.gel = makeHandGel({ color: 0x118078, rim: 0xc6fff6, alpha: 0.72 });
    this.origin = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.extend = 0; // 0 retracted .. 1 reaching the target
    this.wrap = 0; // 0 loosely reaching .. 1 wrapped tight around the target
    this.time = 0;
    this.items = [];
    for (let i = 0; i < count; i++) {
      const mesh = new TentacleMesh({ rings: 22, radial: 8, radius: (t) => lerp(0.03, 0.009, Math.pow(t, 0.7)) * (1 + 0.22 * Math.sin(t * 15)), material: this.gel });
      mesh.mesh.renderOrder = 8; mesh.mesh.frustumCulled = false; mesh.mesh.visible = false;
      parent.add(mesh.mesh);
      this.items.push({ mesh, chain: new SpringChain(11, 300, 70, 0.8), ideal: Array.from({ length: 11 }, () => new THREE.Vector3()), a: (i / count) * Math.PI * 2 + (i % 2) * 0.4, ph: i * 1.7 });
    }
    // the spat glob
    this.glob = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.gel);
    this.glob.renderOrder = 9; this.glob.visible = false; this.glob.frustumCulled = false;
    parent.add(this.glob);
    this.shot = null;
  }

  // Spit a glob from `from` to `to` (camera-local), arcing slightly; onHit fires on arrival.
  spit(from, to, dur, onHit) {
    this.shot = { from: from.clone(), to: to.clone(), t: 0, dur, onHit };
    this.glob.visible = true;
  }

  update(dt) {
    this.time += dt;
    if (this.shot) {
      const s = this.shot;
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      this.glob.position.lerpVectors(s.from, s.to, k);
      this.glob.position.y += Math.sin(k * Math.PI) * 0.05;
      this.glob.scale.set(0.028, 0.02, 0.05).multiplyScalar(0.6 + 0.4 * Math.sin(k * Math.PI) + 0.4 * (1 - k));
      this.glob.lookAt(s.to);
      if (k >= 1) { this.glob.visible = false; const f = s.onHit; this.shot = null; if (f) f(); }
    }
    const show = this.extend > 0.004;
    const n = this.items.length;
    if (!show) { for (const it of this.items) { it.mesh.mesh.visible = false; it.chain.ready = false; } return; }
    _d.subVectors(this.target, this.origin);
    const L = Math.max(0.05, _d.length());
    _d.divideScalar(L);
    _u.crossVectors(_d, Math.abs(_d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
    _v.crossVectors(_d, _u);
    for (let i = 0; i < n; i++) {
      const it = this.items[i];
      const ang = it.a + this.time * 0.9 * (1 - this.wrap);
      _lat.copy(_u).multiplyScalar(Math.cos(ang)).addScaledVector(_v, Math.sin(ang));
      const spread = n > 1 ? lerp(0.07 + 0.06 * L, 0.032, this.wrap) : 0;                   // opens wide when reaching, closes around the target
      _T.copy(this.target).addScaledVector(_lat, spread).addScaledVector(_d, (i / n - 0.5) * 0.07 * this.wrap);
      _c1.copy(this.origin).addScaledVector(_d, L * 0.3).addScaledVector(_lat, (0.1 + 0.1 * L) * (1 - 0.6 * this.wrap));
      _c2.copy(_T).addScaledVector(_d, -L * 0.3).addScaledVector(_lat, 0.08 * (1 - this.wrap));
      for (let k = 0; k < 11; k++) {
        const s = (k / 10) * this.extend;
        bezier(this.origin, _c1, _c2, _T, s, it.ideal[k]);
        const w = (k / 10) * (1 - this.wrap * 0.7);
        it.ideal[k].addScaledVector(_u, Math.sin(this.time * 6 - k * 0.8 + it.ph) * 0.012 * w).addScaledVector(_v, Math.cos(this.time * 5 - k * 0.7 + it.ph) * 0.012 * w);
      }
      it.chain.step(it.ideal, dt);
      it.mesh.update(it.chain.p);
      it.mesh.mesh.visible = true;
    }
  }

  hide() { this.extend = 0; this.wrap = 0; this.glob.visible = false; this.shot = null; for (const it of this.items) { it.mesh.mesh.visible = false; it.chain.ready = false; } }
}
