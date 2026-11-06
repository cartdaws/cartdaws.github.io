import * as THREE from 'three';
import { v2node } from './assets.js';
import { Z0, L0 } from '../presentation/arm.js';
import { TIER_GROW } from './mutations.js';

// The walking limbs bend on the CPU, so what grows on them is carried along the same way: the same Blender mesh as on the arms, re-placed along the limb's spine each frame. Only runs while you are looking down.
const armR = (s) => 0.112 + (0.05 - 0.112) * Math.pow(Math.max(0, s), 1.2);
const legR = (s) => 0.17 + (0.06 - 0.17) * Math.pow(Math.max(0, s), 0.85);
const cache = new Map();

function prepare(name) {
  if (cache.has(name)) return cache.get(name);
  const src = v2node(name), g = src.geometry, P = g.attributes.position, Nn = g.attributes.normal, n = P.count;
  const s = new Float32Array(n), xy = new Float32Array(n * 2), nrm = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const sv = Math.min(1, Math.max(0, (Z0 - P.getZ(i)) / L0)), k = legR(sv) / armR(sv); s[i] = sv; xy[i * 2] = P.getX(i) * k; xy[i * 2 + 1] = P.getY(i) * k; nrm[i * 3] = Nn.getX(i); nrm[i * 3 + 1] = Nn.getY(i); nrm[i * 3 + 2] = Nn.getZ(i); }
  const out = { src, s, xy, nrm, n }; cache.set(name, out); return out;
}

export class LimbGrowth {
  constructor(scene, leg) { this.scene = scene; this.leg = leg; this.items = []; this.q = null; leg.mesh.frames = new Float32Array((leg.mesh.rings + 1) * 12); }
  set(q) {
    if (q === this.q && q && this.tier === q.tier) return;
    for (const it of this.items) it.mesh.visible = false;
    this.items = []; this.q = q; this.tier = q ? q.tier : 0;
    if (!q) return;
    for (const name of q.m.nodes) {
      const D = prepare(name);
      const key = '_g_' + name; let it = this[key];
      if (!it) {
        const geo = new THREE.BufferGeometry(); geo.setIndex(D.src.geometry.index); for (const a of ['uv', 'color']) if (D.src.geometry.attributes[a]) geo.setAttribute(a, D.src.geometry.attributes[a]);
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(D.n * 3), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(D.n * 3), 3));
        const m = D.src.material.clone(); m.side = THREE.DoubleSide;
        const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.castShadow = false; this.scene.add(mesh);
        it = this[key] = { D, mesh };
      }
      it.mesh.visible = true; this.items.push(it);
    }
    this.front = 1.03 - TIER_GROW[q.tier - 1] * 1.03;
  }
  update(looking) {
    if (!this.items.length) return;
    for (const it of this.items) it.mesh.visible = looking && this.leg.mesh.mesh.visible;
    if (!looking) return;
    const F = this.leg.mesh.frames, R = this.leg.mesh.rings;
    for (const it of this.items) {
      const { D } = it, Pa = it.mesh.geometry.attributes.position, Na = it.mesh.geometry.attributes.normal, p = Pa.array, nn = Na.array;
      for (let i = 0; i < D.n; i++) {
        const sv = D.s[i], f = sv * R, a = Math.min(R, Math.floor(f)) * 12, gk = sv < this.front ? 0 : 1;
        const x = D.xy[i * 2] * gk, y = D.xy[i * 2 + 1] * gk;
        p[i * 3] = F[a] + F[a + 3] * y + F[a + 6] * x; p[i * 3 + 1] = F[a + 1] + F[a + 4] * y + F[a + 7] * x; p[i * 3 + 2] = F[a + 2] + F[a + 5] * y + F[a + 8] * x;
        const nx = D.nrm[i * 3], ny = D.nrm[i * 3 + 1], nz = D.nrm[i * 3 + 2];
        nn[i * 3] = F[a + 3] * ny + F[a + 6] * nx - F[a + 9] * nz; nn[i * 3 + 1] = F[a + 4] * ny + F[a + 7] * nx - F[a + 10] * nz; nn[i * 3 + 2] = F[a + 5] * ny + F[a + 8] * nx - F[a + 11] * nz;
      }
      Pa.needsUpdate = true; Na.needsUpdate = true;
    }
  }
}
