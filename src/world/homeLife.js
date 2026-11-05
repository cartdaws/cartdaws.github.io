import * as THREE from 'three';

// The valley is alive before it burns. Plants and animals modelled in art/build_valley_life.py: weeping frond trees, fungal stacks, tentacle grass, glowing pods,
// drifters swimming through the air, skitterers underfoot, and tall striders grazing far off. Wind moves everything that grows. The attack panics them; in the ruins
// the animals are gone and the plants are burnt, which is the point.
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

// How wide a model really is at the height of a walking body, measured from its vertices. Ignores low roots you step over and anything above your head.
export function bodyRadius(geo, lo = 0.35, hi = 1.9) {
  const p = geo.attributes.position; let r2 = 0;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < lo || y > hi) continue; const x = p.getX(i), z = p.getZ(i), d = x * x + z * z; if (d > r2) r2 = d; }
  return Math.sqrt(r2);
}

export class HomeLife {
  // nodes: the meshes of valley_life.glb by name. taken(x, z, r): whether something already stands there. colliders: where solid things get registered.
  constructor(group, nodes, taken, colliders, burnable = [], opts = {}) {
    this.ground = opts.ground || null;
    const small = opts.small ?? document.body.classList.contains('touch');
    const TINT = opts.flora, RAD = opts.radius || 52, burnt = !!opts.burnt;
    this.t = 0; this.panic = 0; this.ruined = false; this.group = group; this.glows = []; this.burn = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    this._ = { m4, q, v, sc };
    for (const m of burnable) this.addBurnable(m);
    if (!nodes) return;
    const R = Math.random, ok = (n) => nodes[n] && nodes[n].geometry;
    const std = (n, wind, tint) => { const m = nodes[n].material.clone(); if (tint !== undefined) m.color.set(tint); if (tint !== undefined && m.emissive) m.emissive.setScalar(0); if (wind) addWind(m, wind); if (!TINT) this.addBurnable(m); return m; };
    const glow = (color, wind) => { const m = new THREE.MeshBasicMaterial({ color, fog: true }); if (wind) addWind(m, wind); return m; };
    // ---- planting: a thing is several meshes sharing one set of positions
    const plant = (parts, want, rMin, rMax, keep, scale, tilt, solid) => {
      if (!parts.every((p) => ok(p[0]))) return;
      const spots = [];
      for (let i = 0; i < want * 12 && spots.length < want; i++) {
        const a = R() * 6.283, d = rMin + R() * (rMax - rMin), x = Math.cos(a) * d, z = Math.sin(a) * d - 5, s = scale[0] + R() * (scale[1] - scale[0]);
        if (taken(x, z, keep * s) || spots.some((o) => Math.hypot(o.x - x, o.z - z) < keep * (o.s + s))) continue;
        spots.push({ x, z, s, yaw: R() * 6.283, tx: (R() - 0.5) * tilt, tz: (R() - 0.5) * tilt });
      }
      for (const [name, material] of parts) {
        const mesh = new THREE.InstancedMesh(nodes[name].geometry, material, spots.length); mesh.frustumCulled = false;
        spots.forEach((o, i) => { q.setFromEuler(new THREE.Euler(o.tx, o.yaw, o.tz)); v.set(o.x, 0, o.z); sc.set(o.s, o.s, o.s); if (this.ground) v.y = this.ground(o.x, o.z) - 0.04; mesh.setMatrixAt(i, m4.compose(v, q, sc)); });
        group.add(mesh);
        if (material.isMeshBasicMaterial) this.glows.push(mesh);
      }
      if (solid) { const r0 = bodyRadius(nodes[solid].geometry); for (const o of spots) colliders.push({ x: o.x, z: o.z, r: r0 * o.s }); }
    };
    if (TINT !== null) {
    const T = TINT || {}, gl = (c, d) => (burnt ? null : glow(TINT ? T.glow : c, d));
    const fr = [['FrondTrunk', std('FrondTrunk', 0.0016, T.frond)]]; if (!burnt) fr.push(['FrondLeaf', std('FrondLeaf', 0.0052, T.leaf)], ['FrondGlow', gl(0x4fb8a4, 0.0052)]);
    plant(fr, small ? 8 : 20, 9, RAD, 3.2, [0.85, 1.7], 0.1, 'FrondTrunk');
    if (!burnt) {
      plant([['CapStem', std('CapStem', 0.02, T.cap)], ['CapHead', std('CapHead', 0.02, T.cap)], ['CapGills', gl(0x8a5ac8, 0.02)]], small ? 11 : 28, 5, RAD * 0.8, 1.2, [0.65, 1.5], 0.16, 'CapHead');
      plant([['CurlBlade', std('CurlBlade', 0.13, T.curl)], ['CurlTip', gl(0x4fb8a4, 0.13)]], small ? 16 : 56, 3, RAD * 0.72, 0.8, [0.8, 1.7], 0.14);
      if (ok('Pod')) plant([['Pod', glow(new THREE.Color(TINT ? T.glow : 0x2c8ca4).multiplyScalar(0.42))]], small ? 6 : 14, 4, RAD * 0.65, 0.9, [0.7, 1.5], 0.04);
    } }

    if (opts.drifters === false) return this.fauna(nodes, opts, small, group);
    // ---- drifters: swimming through the air in slow pushes
    this.driftMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
    this.driftMat.userData.noSnap = true;
    const ND = small ? 9 : 16;
    this.drifters = new THREE.InstancedMesh(nodes.Drifter.geometry, this.driftMat, ND);
    this.drifters.frustumCulled = false; this.drifters.renderOrder = 2;
    this.drift = [];
    for (let i = 0; i < ND; i++) {
      const a = R() * 6.283, d = 9 + R() * 42;
      this.drift.push({ x: Math.cos(a) * d, z: Math.sin(a) * d - 6, y: 5 + R() * 17, s: 0.55 + R() * 1.05, ph: R() * 6.28, rate: 0.55 + R() * 0.45, hx: (R() - 0.5) * 0.5, hz: (R() - 0.5) * 0.5 });
      this.drifters.setColorAt(i, col.set(R() < 0.6 ? 0x6ff5dc : 0xc99aff));
    }
    group.add(this.drifters);

    this.fauna(nodes, opts, small, group);
  }

  fauna(nodes, opts, small, group) {
    const R = Math.random;
    if (opts.crawlers === false) { this.crawl = []; this.striders = []; return; }
    // ---- skitterers: small dark things with bright eyes, about in the undergrowth
    const NC = small ? 8 : 14;
    this.crawlers = new THREE.InstancedMesh(nodes.Skitter.geometry, new THREE.MeshStandardMaterial({ color: 0x142a36, roughness: 0.5, metalness: 0.1, emissive: 0x04100f }), NC);
    this.eyes = new THREE.InstancedMesh(nodes.SkitterEyes.geometry, new THREE.MeshBasicMaterial({ color: 0x9ffff0 }), NC);
    this.crawlers.frustumCulled = this.eyes.frustumCulled = false;
    this.crawl = [];
    for (let i = 0; i < NC; i++) { const a = R() * 6.283, d = 3 + R() * 20; this.crawl.push({ x: Math.cos(a) * d, z: Math.sin(a) * d - 4, yaw: R() * 6.28, sp: 0, wait: R() * 3, hop: R() * 6 }); }
    group.add(this.crawlers, this.eyes);

    // ---- striders: tall and slow, grazing around the rim of the valley
    this.striders = [];
    const skin = nodes.StriderBody.material.clone(), glowS = new THREE.MeshBasicMaterial({ color: 0xffc890, fog: true });
    if (opts.skin !== undefined) skin.color.set(opts.skin);
    for (let i = 0; i < (opts.striders ?? (small ? 2 : 3)); i++) {
      const root = new THREE.Group();
      const body = new THREE.Mesh(nodes.StriderBody.geometry, skin), gl = new THREE.Mesh(nodes.StriderGlow.geometry, glowS);
      const hang = new THREE.Group(); hang.add(body, gl); hang.position.y = 6.15; root.add(hang);
      const legs = [];
      for (const [sx, lz] of [[1, -1.05], [1, 0], [1, 1.05], [-1, -1.05], [-1, 0], [-1, 1.05]]) {
        const pivot = new THREE.Group(); pivot.position.set(sx * 0.75, 6.2, lz); pivot.rotation.y = sx > 0 ? 0 : Math.PI;
        const leg = new THREE.Mesh(nodes.StriderLeg.geometry, skin); pivot.add(leg); root.add(pivot);
        legs.push({ pivot, sx, base: pivot.rotation.y, ph: (legs.length % 2) * Math.PI + (sx > 0 ? 0 : Math.PI) });
      }
      root.scale.setScalar(1.15 + R() * 0.5); group.add(root);
      this.striders.push({ root, hang, legs, a: R() * 6.283, rad: 44 + R() * 16, sp: 0.016 + R() * 0.012, walk: R() * 6, dir: R() < 0.5 ? 1 : -1 });
    }
  }

  addBurnable(m) { this.burn.push({ m, color: m.color.clone(), emissive: m.emissive ? m.emissive.clone() : null }); }

  setRuined(r) {
    this.ruined = !!r; if (!r) this.panic = 0;
    for (const x of [this.drifters, this.crawlers, this.eyes]) if (x) x.visible = !r;
    if (this.striders) for (const s of this.striders) s.root.visible = !r;
    for (const g of this.glows) g.visible = !r;
    // everything that grew is burnt
    for (const b of this.burn) { if (r) { b.m.color.copy(b.color).multiplyScalar(0.2); if (b.emissive) b.m.emissive.copy(b.emissive).multiplyScalar(0.08); } else { b.m.color.copy(b.color); if (b.emissive) b.m.emissive.copy(b.emissive); } }
  }

  // camX/camZ: the player, in the homeworld's own coordinates
  update(dt, camX, camZ, colliders) {
    this.t += dt; WIND.value += dt * (1 + this.panic * 1.6); GUST.value = 1 + 0.35 * Math.sin(this.t * 0.23) + this.panic * 1.1;
    if (this.ruined) return;
    const { m4, q, v, sc } = this._, t = this.t, P = this.panic;
    if (this.drift) { for (let i = 0; i < this.drift.length; i++) {
      const d = this.drift[i], w = t * d.rate * 2.1 + d.ph, push = Math.max(0, Math.sin(w));
      // each stroke carries it up and along; between strokes it sinks back a little
      d.y += (push * 0.55 - 0.2 + P * 7) * dt;
      const out = Math.hypot(d.x, d.z) || 1;
      d.x += (d.hx * (0.4 + push) + (d.x / out) * P * 5) * dt; d.z += (d.hz * (0.4 + push) + (d.z / out) * P * 5) * dt;
      if (d.y < 4) d.y = 4; if (d.y > 26 && !P) d.y = 26;
      const squeeze = Math.sin(w);
      q.setFromAxisAngle(v.set(Math.sin(d.ph), 0, Math.cos(d.ph)), Math.sin(t * 0.3 + d.ph) * 0.14);
      m4.compose(v.set(d.x, d.y, d.z), q, sc.set(d.s * (1 - 0.2 * squeeze), d.s * (1 + 0.24 * squeeze), d.s * (1 - 0.2 * squeeze)));
      this.drifters.setMatrixAt(i, m4);
    }
    this.drifters.instanceMatrix.needsUpdate = true;
    this.driftMat.opacity = (0.5 + 0.12 * Math.sin(t * 1.3)) * Math.max(0.15, 1 - P); }

    for (let i = 0; i < this.crawl.length; i++) {
      if (!this.crawlers) break;
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
      const bob = c.sp > 0 ? Math.abs(Math.sin(c.hop)) * 0.035 : 0;
      q.setFromAxisAngle(v.set(0, 1, 0), c.yaw + Math.PI);          // the model faces -z
      m4.compose(v.set(c.x, bob + (this.ground ? this.ground(c.x, c.z) : 0), c.z), q, sc.set(1, 1, 1)); this.crawlers.setMatrixAt(i, m4); this.eyes.setMatrixAt(i, m4);
    }
    if (this.crawlers) { this.crawlers.instanceMatrix.needsUpdate = true; this.eyes.instanceMatrix.needsUpdate = true; }

    for (const s of this.striders) {
      s.a += s.sp * s.dir * dt * (1 + P * 9); if (P > 0.02) s.rad += dt * P * 9;
      const x = Math.cos(s.a) * s.rad, z = Math.sin(s.a) * s.rad - 8;
      s.root.position.set(x, this.ground ? this.ground(x, z) - 0.2 : 0, z); s.root.rotation.y = -s.a + (s.dir > 0 ? Math.PI : 0);
      s.walk += dt * (0.75 + P * 5);
      s.hang.position.y = 6.15 + Math.sin(s.walk * 2) * 0.07; s.hang.rotation.x = Math.sin(s.walk) * 0.025;
      for (const l of s.legs) { const w = s.walk + l.ph, lift = Math.max(0, Math.sin(w)); l.pivot.rotation.y = l.base + Math.cos(w) * 0.26; l.pivot.rotation.z = lift * 0.13; }
    }
  }
}
