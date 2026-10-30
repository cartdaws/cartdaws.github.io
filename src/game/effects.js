import * as THREE from 'three';
import { rand } from '../core/util.js';

class Particles {
  constructor(scene, max, additive, alpha = 1) {
    this.max = max;
    this.next = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.uniforms = { uScale: { value: 600 }, uAlpha: { value: alpha } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale;
        void main(){
          vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(size * uScale / max(-mv.z, 0.1), 160.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec4 vC; uniform float uAlpha;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.2, d) * vC.a * uAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(pow(vC.rgb, vec3(2.2)), a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, size, r, g, b, grav = 0, drag = 0, grow = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life;
    this.size0[i] = size; this.grow[i] = grow;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = 1;
    this.grav[i] = grav; this.drag[i] = drag;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.grav[i] > 0) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      this.col[i * 4 + 3] = k;
      this.size[i] = this.size0[i] * (1 + this.grow[i] * (1 - k)) * (0.4 + 0.6 * k);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.glowP = new Particles(scene, 1800, true);
    this.smokeP = new Particles(scene, 500, false, 0.5);

    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 18, 2);
      l.userData.keepOn = true;
      scene.add(l);
      this.lights.push({ light: l, t: 0, dur: 1, peak: 0 });
    }
    this.lightIdx = 0;

    this.ringGeo = new THREE.RingGeometry(0.7, 1, 40);
    this.rings = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false;
      scene.add(m);
      this.rings.push({ mesh: m, t: 0, dur: 1, size: 1 });
    }
    this.ringIdx = 0;

    this.balls = [];
    const ballGeo = new THREE.SphereGeometry(1, 20, 14);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.visible = false;
      scene.add(m);
      this.balls.push({ mesh: m, t: 0, dur: 1, size: 1 });
    }
    this.ballIdx = 0;

    this.scorchGeo = new THREE.CircleGeometry(1, 24);
    this.scorches = [];
    this.marks = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(this.scorchGeo, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.visible = false;
      scene.add(m);
      this.scorches.push(m);
    }
    this.scorchIdx = 0;
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(this.scorchGeo, new THREE.MeshBasicMaterial({ color: 0x7ff0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 }));
      m.visible = false;
      scene.add(m);
      this.marks.push({ mesh: m, t: 0 });
    }
    this.markIdx = 0;
  }

  setScale(h, fov) {
    const s = h / (2 * Math.tan((fov * Math.PI) / 360));
    this.glowP.uniforms.uScale.value = s;
    this.smokeP.uniforms.uScale.value = s;
  }

  clear() {
    this.glowP.clear(); this.smokeP.clear();
    for (const l of this.lights) { l.light.intensity = 0; l.t = l.dur; }
    for (const r of this.rings) { r.mesh.visible = false; r.t = r.dur; }
    for (const b of this.balls) { b.mesh.visible = false; b.t = b.dur; }
    for (const s of this.scorches) s.visible = false;
    for (const m of this.marks) { m.mesh.visible = false; m.t = 0; }
  }

  flashLight(pos, color, peak, dur) {
    const l = this.lights[this.lightIdx];
    this.lightIdx = (this.lightIdx + 1) % this.lights.length;
    l.light.position.copy(pos);
    l.light.color.set(color);
    l.peak = peak; l.dur = dur; l.t = 0;
    l.light.intensity = peak;
  }

  ring(pos, normal, color, size, dur) {
    const r = this.rings[this.ringIdx];
    this.ringIdx = (this.ringIdx + 1) % this.rings.length;
    r.mesh.position.copy(pos).addScaledVector(normal, 0.03);
    r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    r.mesh.material.color.set(color);
    r.mesh.visible = true;
    r.t = 0; r.dur = dur; r.size = size;
  }

  fireball(pos, size, dur, color = 0xff8a2a) {
    const b = this.balls[this.ballIdx];
    this.ballIdx = (this.ballIdx + 1) % this.balls.length;
    b.mesh.position.copy(pos);
    b.mesh.material.color.set(color);
    b.mesh.visible = true;
    b.t = 0; b.dur = dur; b.size = size;
  }

  scorch(pos, radius) {
    const m = this.scorches[this.scorchIdx];
    this.scorchIdx = (this.scorchIdx + 1) % this.scorches.length;
    m.position.set(pos.x, 0.02, pos.z);
    m.rotation.set(-Math.PI / 2, 0, 0);
    m.scale.setScalar(radius);
    m.visible = true;
  }

  // Crystal-shard impact: spray, ring, and a short-lived glow mark on the surface.
  impact(pos, normal, color = [0.5, 0.95, 1]) {
    for (let i = 0; i < 12; i++) {
      const sp = rand(2, 7);
      this.glowP.emit(pos.x, pos.y, pos.z,
        normal.x * sp + rand(-2.5, 2.5), normal.y * sp + rand(-1, 3), normal.z * sp + rand(-2.5, 2.5),
        rand(0.25, 0.55), rand(0.03, 0.06), color[0], color[1], color[2], 9, 1.2);
    }
    this.glowP.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0.12, 0.35, 1, 1, 1);
    this.ring(pos, normal, 0x7ff0ff, 0.28, 0.22);
    const m = this.marks[this.markIdx];
    this.markIdx = (this.markIdx + 1) % this.marks.length;
    m.mesh.position.copy(pos).addScaledVector(normal, 0.015);
    m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    m.mesh.scale.setScalar(0.09);
    m.mesh.visible = true;
    m.t = 1.2;
  }

  hitSparks(pos, color, n = 10) {
    for (let i = 0; i < n; i++) {
      this.glowP.emit(pos.x, pos.y, pos.z, rand(-4, 4), rand(0, 5), rand(-4, 4), rand(0.2, 0.5), rand(0.03, 0.06), color[0], color[1], color[2], 9, 1);
    }
  }

  muzzle(pos) {
    this.flashLight(pos, 0x7ff0ff, 18, 0.07);
  }

  enemyDeath(pos, big) {
    const n = big ? 40 : 24;
    for (let i = 0; i < n; i++) {
      this.glowP.emit(pos.x, pos.y, pos.z, rand(-6, 6), rand(1, 8), rand(-6, 6), rand(0.4, 0.9), rand(0.04, 0.09), 1, rand(0.5, 0.8), 0.2, 12, 0.8);
    }
    for (let i = 0; i < 8; i++) {
      this.smokeP.emit(pos.x, pos.y, pos.z, rand(-1, 1), rand(0.5, 2), rand(-1, 1), rand(0.7, 1.3), rand(0.4, 0.7), 0.12, 0.12, 0.13, -0.3, 1, 1.2);
    }
    this.fireball(pos, big ? 1.1 : 0.7, 0.28, 0xffb24a);
    this.flashLight(pos, 0xffa040, 40, 0.2);
  }

  explosion(pos, radius) {
    this.fireball(pos, radius * 0.55, 0.5, 0xff7a1e);
    this.fireball(pos, radius * 0.3, 0.3, 0xfff2c0);
    const flat = new THREE.Vector3(0, 1, 0);
    this.ring(new THREE.Vector3(pos.x, 0.05, pos.z), flat, 0xffa050, radius, 0.55);
    this.flashLight(pos, 0xff9a40, 400, 0.5);
    for (let i = 0; i < 70; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(3, 13), up = rand(2, 11);
      this.glowP.emit(pos.x, pos.y, pos.z, Math.cos(a) * sp, up, Math.sin(a) * sp, rand(0.5, 1.3), rand(0.05, 0.13), 1, rand(0.4, 0.8), 0.15, 14, 0.5);
    }
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(0.5, 4);
      this.smokeP.emit(pos.x, pos.y - 0.2, pos.z, Math.cos(a) * sp, rand(1, 4), Math.sin(a) * sp, rand(1.4, 2.6), rand(0.7, 1.3), 0.1, 0.1, 0.11, -0.4, 0.8, 2.2);
    }
    this.scorch(pos, radius * 0.38);
  }

  update(dt) {
    this.glowP.update(dt);
    this.smokeP.update(dt);
    for (const l of this.lights) {
      if (l.t < l.dur) { l.t += dt; const k = Math.max(0, 1 - l.t / l.dur); l.light.intensity = l.peak * k * k; }
      else l.light.intensity = 0;
    }
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(Math.max(0.01, r.size * (0.25 + 0.75 * (1 - Math.pow(1 - k, 2)))));
      r.mesh.material.opacity = 1 - k;
    }
    for (const b of this.balls) {
      if (!b.mesh.visible) continue;
      b.t += dt;
      const k = b.t / b.dur;
      if (k >= 1) { b.mesh.visible = false; continue; }
      b.mesh.scale.setScalar(b.size * (0.3 + 0.7 * (1 - Math.pow(1 - k, 3))));
      b.mesh.material.opacity = (1 - k) * 0.9;
    }
    for (const m of this.marks) {
      if (!m.mesh.visible) continue;
      m.t -= dt;
      if (m.t <= 0) { m.mesh.visible = false; continue; }
      m.mesh.material.opacity = Math.min(1, m.t * 1.2) * 0.8;
    }
  }
}
