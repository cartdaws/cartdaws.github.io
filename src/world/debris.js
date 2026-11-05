import * as THREE from 'three';

// Real chunks of stuff thrown by blasts: rock and torn metal that tumble, bounce and settle. A fixed pool drawn as instances, so a big explosion costs nothing extra.
const G = 17;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export class Debris {
  constructor(scene) {
    const small = document.body.classList.contains('touch');
    const N = small ? 44 : 90;
    const rock = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x1a2428, roughness: 0.95, flatShading: true, emissive: 0x050806 }), N);
    const metal = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.22, 0.85), new THREE.MeshStandardMaterial({ color: 0x69747c, roughness: 0.5, metalness: 0.65, emissive: 0x1a0d05 }), N);
    rock.frustumCulled = metal.frustumCulled = false;
    scene.add(rock, metal);
    this.meshes = { rock, metal };
    this.items = { rock: [], metal: [] };
    this.N = N;
    for (const kind of ['rock', 'metal']) for (let i = 0; i < N; i++) { this.items[kind].push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, size: 0, life: 0, hot: false }); this.meshes[kind].setMatrixAt(i, _m.makeScale(0, 0, 0)); }
    this.next = { rock: 0, metal: 0 };
    this.visible = false; this.setVisible(false);
  }

  setVisible(v) { this.visible = v; this.meshes.rock.visible = this.meshes.metal.visible = v; }

  // n pieces leaving a point. power sets how far they go, lift how much of that is upward.
  burst(x, y, z, n, power = 8, kind = 'rock', size = 0.14, hot = false, lift = 1) {
    this.setVisible(true);
    for (let i = 0; i < n; i++) {
      const list = this.items[kind], o = list[this.next[kind]]; this.next[kind] = (this.next[kind] + 1) % this.N;
      const a = Math.random() * 6.283, sp = power * (0.3 + Math.random() * 0.8);
      o.on = true; o.x = x + (Math.random() - 0.5) * 0.5; o.y = y + Math.random() * 0.4; o.z = z + (Math.random() - 0.5) * 0.5;
      o.vx = Math.cos(a) * sp; o.vz = Math.sin(a) * sp; o.vy = power * lift * (0.5 + Math.random() * 0.9);
      o.rx = Math.random() * 6; o.ry = Math.random() * 6; o.rz = Math.random() * 6;
      o.sx = (Math.random() - 0.5) * 16; o.sy = (Math.random() - 0.5) * 16; o.sz = (Math.random() - 0.5) * 16;
      o.size = size * (0.45 + Math.random() * 1.3); o.life = 2.6 + Math.random() * 2.4; o.hot = hot;
    }
  }

  update(dt, fx) {
    if (!this.visible) return;
    for (const kind of ['rock', 'metal']) {
      const list = this.items[kind], mesh = this.meshes[kind];
      let any = false;
      for (let i = 0; i < this.N; i++) {
        const o = list[i]; if (!o.on) continue;
        any = true; o.life -= dt;
        if (o.life <= 0) { o.on = false; mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
        o.vy -= G * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
        if (o.y < o.size * 0.5) {
          o.y = o.size * 0.5;
          if (o.vy < -2) { o.vy *= -0.34; o.vx *= 0.6; o.vz *= 0.6; o.sx *= 0.5; o.sy *= 0.5; o.sz *= 0.5; if (fx && fx.smokeP && Math.random() < 0.5) fx.smokeP.emit(o.x, 0.1, o.z, 0, 0.5, 0, 0.8, 0.35, 0.22, 0.2, 0.2, 0, 1, 1); }
          else { o.vy = 0; o.vx *= 0.8; o.vz *= 0.8; o.sx *= 0.8; o.sy *= 0.8; o.sz *= 0.8; }
        }
        o.rx += o.sx * dt; o.ry += o.sy * dt; o.rz += o.sz * dt;
        if (o.hot && fx && o.y > 0.3 && Math.random() < dt * 22) fx.glowP.emit(o.x, o.y, o.z, 0, 0.3, 0, 0.3, 0.05, 1, 0.5, 0.15, 0, 0.5);
        const fade = Math.min(1, o.life / 0.5);
        _q.setFromEuler(_e.set(o.rx, o.ry, o.rz));
        mesh.setMatrixAt(i, _m.compose(_p.set(o.x, o.y, o.z), _q, _s.setScalar(o.size * fade)));
      }
      if (any) mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
