import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The valley is alive before it burns: glowing drifters pulsing through the air, small things scuttling away from your feet, and wind in everything
// that grows. When the attack starts they panic. In the ruins they are gone, which is the point.
const WIND = { value: 0 }, GUST = { value: 1 };

// Bend whatever grows, more toward its top. Works on instanced flora: each plant gets its own phase from where it stands.
export function addWind(mat, amount) {
  mat.onBeforeCompile = function (shader) {
    THREE.Material.prototype.onBeforeCompile.call(this, shader);       // keeps the retro vertex snapping hook
    shader.uniforms.uWind = WIND; shader.uniforms.uGust = GUST;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind, uGust;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float wp = instanceMatrix[3][0] * 0.31 + instanceMatrix[3][2] * 0.23;
          float wh = max(0.0, transformed.y); wh = wh * wh * ${amount.toFixed(4)} * uGust;
          transformed.x += (sin(uWind * 1.1 + wp) + 0.4 * sin(uWind * 2.7 + wp * 1.7)) * wh;
          transformed.z += sin(uWind * 0.8 + wp * 1.3) * wh * 0.7;
        #endif`);
  };
  mat.customProgramCacheKey = () => 'wind-' + amount;
  mat.needsUpdate = true;
}

export class HomeLife {
  constructor(group) {
    const small = document.body.classList.contains('touch');
    this.t = 0; this.panic = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    this._ = { m4, q, v, sc };

    // ---- drifters: a soft bell trailing long threads, swimming through the air in slow pushes
    const bell = new THREE.SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55); bell.scale(1, 0.8, 1);
    const parts = [bell];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, thread = new THREE.CylinderGeometry(0.035, 0.008, 2.4, 4, 3);
      thread.translate(Math.cos(a) * 0.55, -1.15, Math.sin(a) * 0.55);
      parts.push(thread);
    }
    const noUv = parts.map((g) => { const c = g.toNonIndexed(); c.deleteAttribute('uv'); return c; });
    this.driftMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
    this.driftMat.userData.noSnap = true;
    const ND = small ? 9 : 16;
    this.drifters = new THREE.InstancedMesh(mergeGeometries(noUv), this.driftMat, ND);
    this.drifters.frustumCulled = false; this.drifters.renderOrder = 2;
    this.drift = [];
    for (let i = 0; i < ND; i++) {
      const a = Math.random() * 6.283, d = 9 + Math.random() * 42;
      this.drift.push({ x: Math.cos(a) * d, z: Math.sin(a) * d - 6, y: 5 + Math.random() * 17, s: 0.55 + Math.random() * 1.05, ph: Math.random() * 6.28, rate: 0.55 + Math.random() * 0.45, hx: (Math.random() - 0.5) * 0.5, hz: (Math.random() - 0.5) * 0.5 });
      this.drifters.setColorAt(i, col.set(Math.random() < 0.6 ? 0x6ff5dc : 0xc99aff));
    }
    group.add(this.drifters);

    // ---- skitterers: small dark things with bright eyes, about in the undergrowth
    const body = new THREE.SphereGeometry(0.17, 8, 6); body.scale(1, 0.5, 1.35); body.translate(0, 0.13, 0);
    const legs = [body];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const l = new THREE.CylinderGeometry(0.012, 0.006, 0.24, 4); l.rotateZ(s * 1.0); l.translate(s * 0.15, 0.08, -0.12 + i * 0.12); legs.push(l); }
    const bodyGeo = mergeGeometries(legs.map((g) => { const c = g.toNonIndexed(); c.deleteAttribute('uv'); return c; }));
    const NC = small ? 7 : 12;
    this.crawlers = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x0c1a22, roughness: 0.55, metalness: 0.1 }), NC);
    this.eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.024, 6, 5), new THREE.MeshBasicMaterial({ color: 0x9ffff0 }), NC * 2);
    this.crawlers.frustumCulled = this.eyes.frustumCulled = false;
    this.crawl = [];
    for (let i = 0; i < NC; i++) { const a = Math.random() * 6.283, d = 3 + Math.random() * 20; this.crawl.push({ x: Math.cos(a) * d, z: Math.sin(a) * d - 4, yaw: Math.random() * 6.28, sp: 0, wait: Math.random() * 3, hop: Math.random() * 6 }); }
    group.add(this.crawlers, this.eyes);
    this.ruined = false;
  }

  setRuined(r) { this.ruined = !!r; this.drifters.visible = this.crawlers.visible = this.eyes.visible = !r; if (!r) this.panic = 0; }

  // camX/camZ: the player, in the homeworld's own coordinates
  update(dt, camX, camZ, colliders) {
    this.t += dt; WIND.value += dt * (1 + this.panic * 1.6); GUST.value = 1 + 0.35 * Math.sin(this.t * 0.23) + this.panic * 1.1;
    if (this.ruined) return;
    const { m4, q, v, sc } = this._, t = this.t, P = this.panic;
    for (let i = 0; i < this.drift.length; i++) {
      const d = this.drift[i], w = t * d.rate * 2.1 + d.ph, push = Math.max(0, Math.sin(w));
      // each stroke carries it up and along; between strokes it sinks back a little
      d.y += (push * 0.55 - 0.2 + P * 7) * dt;
      d.x += (d.hx * (0.4 + push) + (d.x / (Math.hypot(d.x, d.z) || 1)) * P * 5) * dt; d.z += (d.hz * (0.4 + push) + (d.z / (Math.hypot(d.x, d.z) || 1)) * P * 5) * dt;
      if (d.y < 4) d.y = 4; if (d.y > 26 && !P) d.y = 26;
      const squeeze = Math.sin(w);
      q.setFromAxisAngle(v.set(Math.sin(d.ph), 0, Math.cos(d.ph)), Math.sin(t * 0.3 + d.ph) * 0.14);
      m4.compose(v.set(d.x, d.y, d.z), q, sc.set(d.s * (1 - 0.2 * squeeze), d.s * (1 + 0.24 * squeeze), d.s * (1 - 0.2 * squeeze)));
      this.drifters.setMatrixAt(i, m4);
    }
    this.drifters.instanceMatrix.needsUpdate = true;
    this.driftMat.opacity = (0.5 + 0.12 * Math.sin(t * 1.3)) * Math.max(0.15, 1 - P);

    for (let i = 0; i < this.crawl.length; i++) {
      const c = this.crawl[i], dx = c.x - camX, dz = c.z - camZ, d = Math.hypot(dx, dz) || 1;
      c.wait -= dt;
      if (P > 0.02 || d < 3.4) {                        // scatter
        c.yaw = Math.atan2(dx, dz) + Math.sin(t * 5 + i) * 0.45; c.sp = 3.6 + P * 3; c.wait = 0.5;
      } else if (c.wait <= 0) {
        if (c.sp > 0) { c.sp = 0; c.wait = 0.7 + Math.random() * 3; } else { c.sp = 0.9 + Math.random() * 1.2; c.yaw += (Math.random() - 0.5) * 2.6; c.wait = 0.5 + Math.random() * 1.6; }
      }
      c.x += Math.sin(c.yaw) * c.sp * dt; c.z += Math.cos(c.yaw) * c.sp * dt;
      if (colliders) for (const k of colliders) { const ax = c.x - k.x, az = c.z - k.z, r = k.r + 0.2, a2 = ax * ax + az * az; if (a2 < r * r) { const a = Math.sqrt(a2) || 1; c.x = k.x + (ax / a) * r; c.z = k.z + (az / a) * r; c.yaw += 0.6; } }
      c.hop += dt * (4 + c.sp * 7);
      const bob = c.sp > 0 ? Math.abs(Math.sin(c.hop)) * 0.03 : 0, rot = c.yaw;
      q.setFromAxisAngle(v.set(0, 1, 0), rot);
      m4.compose(v.set(c.x, bob, c.z), q, sc.set(1, 1, 1)); this.crawlers.setMatrixAt(i, m4);
      const fx = Math.sin(rot), fz = Math.cos(rot), ex = fz * 0.06, ez = -fx * 0.06;
      for (const [k, s] of [[0, 1], [1, -1]]) { m4.compose(v.set(c.x + fx * 0.2 + ex * s, 0.17 + bob, c.z + fz * 0.2 + ez * s), q, sc.set(1, 1, 1)); this.eyes.setMatrixAt(i * 2 + k, m4); }
    }
    this.crawlers.instanceMatrix.needsUpdate = true; this.eyes.instanceMatrix.needsUpdate = true;
  }
}
