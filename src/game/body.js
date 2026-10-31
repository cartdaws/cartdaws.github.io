import * as THREE from 'three';
import { clamp, damp, angleDiff } from '../core/util.js';
import { makeGel } from '../world/materials.js';
import { makeSkin, skinParams, restyle } from '../creature/skin.js';
import { Shape } from '../creature/shape.js';
import { defaults } from '../creature/definition.js';
import { HeadParts } from '../creature/parts.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _k = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// The player's body: a humanoid gel creature standing on the floor. One continuous torso (art/build_creature.py shape keys, driven by the creature
// definition), a separate head (hidden in first person, where the camera is inside it), two legs that step procedurally as the player moves,
// and soft upper arms joining each shoulder to the first-person arms. Seen when looking down, in the creator and in cut-scenes.
export class AlienBody {
  constructor(scene, world, player, geos, asset, def = defaults()) {
    this.world = world; this.player = player; this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0; this.yaw = 0;
    this.vel = new THREE.Vector3(); this.acc = new THREE.Vector3();
    this.pitch = 0; this.roll = 0; this.land = 0; this.walk = 0;
    this.def = def;
    this.shape = new Shape(asset);

    this.bellMat = makeSkin(skinParams(def, 'body'));
    this.bell = new THREE.Mesh(asset.geometry, this.bellMat);
    this.bell.morphTargetDictionary = { ...asset.dict };
    this.bell.morphTargetInfluences = new Array(Object.keys(asset.dict).length).fill(0);
    this.bell.frustumCulled = false; this.bell.renderOrder = 2;
    this.group.add(this.bell);

    // the head: seated on the neck, never drawn from inside
    this.headGroup = new THREE.Group(); this.group.add(this.headGroup);
    this.head = new THREE.Mesh(asset.head.geometry, this.bellMat);
    this.head.morphTargetDictionary = { ...asset.head.dict };
    this.head.morphTargetInfluences = new Array(Object.keys(asset.head.dict).length).fill(0);
    this.head.frustumCulled = false; this.head.renderOrder = 2;
    this.headGroup.add(this.head);
    this.headGroup.visible = false;
    this.parts = new HeadParts(this, asset.parts);

    // the creature's own soft light: it tints the floor and walls near the player in the creature's glow colour
    this.glowLight = new THREE.PointLight(0xffffff, 0.8, 4.5, 2);
    this.glowLight.position.set(0, 1.1, -0.05); this.glowLight.userData.keepOn = true;
    this.group.add(this.glowLight);
    this.coreMat = makeGel({ color: 0x0f6a60, rim: 0xc6fff6, alpha: 0.55 });
    this.core = new THREE.Mesh(geos.BodyCore, this.coreMat);
    this.group.add(this.core);

    this.armMat = makeSkin(skinParams(def, 'body'));
    this.arms = Array.from({ length: 8 }, () => makeTube(this.armMat, scene, (s, r) => r * (1.1 - 0.25 * s) * (1 + 0.1 * (Math.pow(Math.abs(Math.sin(s * Math.PI * 9)), 0.5) - 0.64))));
    // ball joints: one at each shoulder socket and one at each elbow, where the forearm begins
    const ball = () => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), this.armMat); m.frustumCulled = false; m.renderOrder = 2; scene.add(m); return m; };
    this.shoulders = Array.from({ length: 8 }, ball); this.elbows = Array.from({ length: 8 }, ball);
    this.legs = [1, -1].map(() => makeTube(this.armMat, scene, (s, r) => r * (1 - 0.55 * Math.pow(s, 0.8)) * (s > 0.94 ? 1 - (s - 0.94) * 2 : 1)));
    this.feet = [1, -1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), this.armMat); m.scale.set(0.05, 0.032, 0.095); m.renderOrder = 2; m.frustumCulled = false; this.group.add(m); return m; });
    this.footPos = [new THREE.Vector3(), new THREE.Vector3()];
    this.armsVisible = true;

    // soft contact glow on the floor
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.4)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0x78ffe1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.glow.renderOrder = 1;
    scene.add(this.glow);
    this.setCreature(def);
  }

  // Apply a creature definition: shape-key influences, proportions, materials. Cheap enough to call on every slider tick.
  setCreature(def) {
    this.def = def;
    const r = this.shape.resolve(def), S = r.scale;
    const keys = this.bell.morphTargetDictionary;
    for (const [n, w] of Object.entries(r.infl)) this.bell.morphTargetInfluences[keys[n]] = w;
    this.bell.scale.copy(S);
    this.notes = r.notes;
    restyle(this.bellMat, def, 'body'); restyle(this.armMat, def, 'body');
    const H = def.head, hs = H.size * (0.92 + 0.08 * S.y);
    this.headGroup.position.copy(this.shape.neck).add(_a.set(0, -0.012, 0));
    this.headGroup.scale.set(hs * (1 + 0.25 * H.width) * (0.9 + 0.1 * S.x), hs, hs * (1 + 0.2 * H.length) * (0.9 + 0.1 * S.z));
    this.parts.apply(def, this.armMat);
    // shoulder sockets for the eight arms: the two starting arms at the shoulders, the extra pairs lower and further back
    const P = this.limbSockets = [this.shape.sockets.R, this.shape.sockets.L];
    for (let i = 2; i < 8; i++) {
      const pair = (i - 2) >> 1, right = i % 2 === 1, a = -0.55 - 0.4 * pair;
      const p = new THREE.Vector3(), n = new THREE.Vector3();
      this.shape.surface(0.58 - 0.1 * pair, right ? a : Math.PI - a, p, n);
      P.push({ p, n });
    }
    const gl = new THREE.Color(def.skin.glow);
    this.coreMat.uniforms.uColor.value.set(def.skin.primary).lerp(gl, 0.45);
    this.coreMat.uniforms.uRim.value.set(def.skin.marking);
    this.core.visible = def.skin.core;
    this.core.position.set(0, 1.12 * S.y, 0.0);
    this.coreBase = 0.8 * Math.min(S.x, S.z);
    this.core.scale.setScalar(this.coreBase);
    this.glow.material.color.set(def.skin.glow);
    this.glowLight.color.set(def.skin.glow); this.glowLight.intensity = 0.25 + 1.4 * def.skin.glowIntensity;
    this.group.updateMatrixWorld(true);
    return r;
  }

  dispose(scene) { scene.remove(this.group); scene.remove(this.glow); }
  setVisible(v) { this.group.visible = v; this.glow.visible = v; if (!v) for (let i = 0; i < 8; i++) this.shoulders[i].visible = this.elbows[i].visible = false; }
  setHeadVisible(v) { this.headGroup.visible = v; }
  reset() { this.yaw = this.player.yaw; this.vel.set(0, 0, 0); this.acc.set(0, 0, 0); this.land = 0; this.walk = 0; }
  setArmsVisible(v) { this.armsVisible = v; }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const p = this.player, t = (this.time += dt);
    const v = _k.set(p.vx, 0, p.vz);
    this.acc.lerp(_c.copy(v).sub(this.vel).divideScalar(Math.max(dt, 1e-3)), 1 - Math.exp(-10 * dt));
    this.vel.lerp(v, 1 - Math.exp(-14 * dt));
    this.yaw += angleDiff(this.yaw, p.yaw) * Math.min(1, 6 * dt);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const accF = -(this.acc.x * sy + this.acc.z * cy), accR = this.acc.x * cy - this.acc.z * sy;
    this.pitch = damp(this.pitch, clamp(accF * 0.008, -0.16, 0.16), 7, dt);
    this.roll = damp(this.roll, clamp(-accR * 0.008, -0.16, 0.16), 7, dt);
    const speed = this.vel.length();
    if (p.grounded && !this._wasGrounded && this._vy < -5) this.land = clamp(-this._vy / 14, 0.25, 1);
    this._wasGrounded = p.grounded; this._vy = p.vy;
    this.land = Math.max(0, this.land - dt * 3.2);
    this.group.position.set(p.pos.x, p.pos.y, p.pos.z);
    this.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    const br = 1 + Math.sin(t * 1.8) * 0.01;
    const sq = this.land * Math.sin(this.land * 9) * 0.07 + this.land * 0.04;
    const S = this.shape.scale;
    this.bell.scale.set(S.x * br * (1 + sq), S.y / br * (1 - sq * 1.2), S.z * br * (1 + sq));
    this.headGroup.position.y = this.shape.neck.y * (1 - sq * 1.2) - 0.012;
    this.core.scale.setScalar(this.coreBase * (1 + Math.sin(t * 2.4) * 0.1));
    this.core.rotation.y = t * 0.2;
    this.glow.position.set(p.pos.x, p.pos.y + 0.03, p.pos.z);
    this.glow.material.opacity = 0.55 + Math.sin(t * 1.6) * 0.1;
    this.parts.tick(dt);
    this.group.updateMatrixWorld(true);
    this.stepLegs(dt, speed, sy, cy, S);
  }

  // Two-bone legs that walk with the player: feet swing along the direction of travel, lift mid-stride, and plant when standing.
  stepLegs(dt, speed, sy, cy, S) {
    const p = this.player, show = this.group.visible;
    const right = this.vel.x * cy - this.vel.z * sy, fwd = -(this.vel.x * sy + this.vel.z * cy);
    this.walk += speed * dt * 1.7;
    const mv = sstep(0.3, 2.2, speed), air = p.grounded ? 0 : 1;
    const hipY = 0.83 * S.y, L = hipY * 0.5 + 0.015;
    const stride = Math.min(0.34, 0.05 + speed * 0.04) * mv;
    const dir = speed > 0.05 ? _d.set(right / speed, 0, -fwd / speed) : _d.set(0, 0, -1);
    const mw = this.group.matrixWorld;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1, ph = this.walk + i * Math.PI;
      const hip = _a.set(side * 0.095 * S.x, hipY, 0.0);
      const lift = Math.max(0, Math.cos(ph)) * 0.14 * mv + air * 0.14;
      const foot = this.footPos[i].set(side * 0.1 * S.x + dir.x * Math.sin(ph) * stride, 0.032 + lift, dir.z * Math.sin(ph) * stride - 0.02 * (1 - mv));
      const mid = _b.copy(hip).add(foot).multiplyScalar(0.5);
      const axis = _n.copy(foot).sub(hip); const dist = Math.min(axis.length(), 2 * L - 0.01); axis.normalize();
      const pole = _c.set(side * 0.22, 0, -1); pole.addScaledVector(axis, -pole.dot(axis)).normalize();
      const knee = mid.addScaledVector(pole, Math.sqrt(Math.max(0.0004, L * L - (dist / 2) * (dist / 2))));
      this.feet[i].position.copy(foot); this.feet[i].visible = show;
      this.feet[i].rotation.set(0, Math.atan2(dir.x, -dir.z) * mv * 0.5, 0);
      const tube = this.legs[i];
      tube.mesh.visible = show;
      if (!show) continue;
      // the quadratic curve passes through the knee: control = 2 knee - (hip + foot) / 2
      const ctrl = _k.copy(knee).multiplyScalar(2).addScaledVector(hip, -0.5).addScaledVector(foot, -0.5).applyMatrix4(mw);
      const H = hip.clone().applyMatrix4(mw), F = foot.clone(); F.y += 0.012; F.applyMatrix4(mw);
      tube.updateCurve(H, ctrl, F, 0.074 * Math.min(S.x, S.z) + 0.004);
    }
  }

  // Joins each body shoulder to the end of the matching first-person arm. Call after the view model has been posed and synced to its frame.
  updateArms(vm, cam) {
    const show = this.armsVisible && this.group.visible, t = this.time;
    const act = [];
    for (let i = 0; i < 8; i++) {
      const arm = vm.limbs[i], sock = this.limbSockets[i];
      const vis = show && arm.root.visible && arm.present > 0.3;
      this.arms[i].mesh.visible = this.shoulders[i].visible = this.elbows[i].visible = vis;
      if (!vis) continue;
      arm.root.updateWorldMatrix(true, false);
      const E = new THREE.Vector3().copy(arm.elbowLocal).applyMatrix4(arm.root.matrixWorld);
      const S = new THREE.Vector3().copy(sock.p).addScaledVector(sock.n, -0.04).applyMatrix4(this.group.matrixWorld);
      const out = new THREE.Vector3().copy(sock.n).transformDirection(this.group.matrixWorld);
      // a long, sinuous S: out from the shoulder, a slow swell sideways, then in toward the elbow
      const d = E.clone().sub(S), len = d.length(), side = new THREE.Vector3(0, 1, 0).cross(d).normalize(), sg = i % 2 ? 1 : -1, sway = Math.sin(t * 1.1 + i * 1.7) * 0.025;
      const c1 = S.clone().addScaledVector(out, 0.2).addScaledVector(d, 0.22).addScaledVector(side, sg * (0.08 + sway) * (0.6 + len)); c1.y += 0.08;
      const c2 = S.clone().addScaledVector(d, 0.74).addScaledVector(side, -sg * (0.09 - sway) * (0.6 + len)); c2.y -= 0.05;
      const scl = Math.abs(arm.baseScale.y) / 0.95;                      // the smaller extra arms get slimmer joins
      act.push({ i, arm, S, E, c1, c2, out, r: arm.endRadius * scl * Math.max(0.3, arm.present) });
    }
    // separation: sample every upper arm and push the two bends of any pair that would touch apart (a few relaxation passes)
    const pt = (k, s) => { const u = 1 - s; return new THREE.Vector3().addScaledVector(k.S, u * u * u).addScaledVector(k.c1, 3 * u * u * s).addScaledVector(k.c2, 3 * u * s * s).addScaledVector(k.E, s * s * s); };
    for (let pass = 0; pass < 8; pass++) {
      for (const k of act) { k.pts = []; for (let n = 2; n <= 10; n++) k.pts.push(pt(k, n / 10)); }       // each arm sampled once per pass
      for (let a = 0; a < act.length; a++) for (let b = a + 1; b < act.length; b++) {
        const A = act[a], B = act[b], need = (A.r + B.r) * 1.2 + 0.01;
        let best = 9, pa = null, pb = null;
        for (const p of A.pts) for (const q of B.pts) { const dd = p.distanceTo(q); if (dd < best) { best = dd; pa = p; pb = q; } }
        if (best < need) {
          const push = new THREE.Vector3().subVectors(pa, pb); if (push.lengthSq() < 1e-8) push.set(A.i % 2 ? 1 : -1, 0.2, 0);
          push.normalize().multiplyScalar((need - best) * 0.9);
          A.c1.add(push); A.c2.add(push); B.c1.sub(push); B.c2.sub(push);
        }
      }
    }
    for (const k of act) {
      const { i, arm, S, E, c1, c2, out, r } = k;
      this.arms[i].updateCurve(S, c1, E, r, c2);
      // the joints fade out as the camera gets close to them (they would fill the view from inside)
      const fade = (p) => cam ? Math.min(1, Math.max(0, (cam.position.distanceTo(p) - 0.35) / 0.5)) : 1;
      this.shoulders[i].position.copy(S).addScaledVector(out, 0.03); this.shoulders[i].scale.setScalar(r * 1.4 * fade(this.shoulders[i].position));
      this.elbows[i].position.copy(E); this.elbows[i].scale.setScalar(r * 1.1 * fade(E));
    }
  }
}

const RINGS = 16, RAD = 14;
// a tube along a quadratic curve, written in world space each frame; prof(s, radius) gives the radius along it
function makeTube(mat, scene, prof) {
  const geo = new THREE.BufferGeometry();
  const n = (RINGS + 1) * RAD;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const uv = new Float32Array(n * 2), idx = [];
  for (let i = 0; i <= RINGS; i++) for (let k = 0; k < RAD; k++) {
    uv[(i * RAD + k) * 2] = k / RAD; uv[(i * RAD + k) * 2 + 1] = i / RINGS;
    if (i < RINGS) { const k2 = (k + 1) % RAD; idx.push(i * RAD + k, i * RAD + k2, (i + 1) * RAD + k2, i * RAD + k, (i + 1) * RAD + k2, (i + 1) * RAD + k); }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false;
  scene.add(mesh);
  const P = new THREE.Vector3(), T = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3(), W = new THREE.Vector3();
  return {
    mesh,
    updateCurve(S, C, E, rad, C2) {
      const pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
      for (let i = 0; i <= RINGS; i++) {
        const s = i / RINGS, u = 1 - s;
        if (C2) {                                                    // cubic: an S-shaped limb
          P.set(0, 0, 0).addScaledVector(S, u * u * u).addScaledVector(C, 3 * u * u * s).addScaledVector(C2, 3 * u * s * s).addScaledVector(E, s * s * s);
          T.set(0, 0, 0).addScaledVector(S, -3 * u * u).addScaledVector(C, 3 * u * u - 6 * u * s).addScaledVector(C2, 6 * u * s - 3 * s * s).addScaledVector(E, 3 * s * s).normalize();
        } else {
          P.set(0, 0, 0).addScaledVector(S, u * u).addScaledVector(C, 2 * u * s).addScaledVector(E, s * s);
          T.set(0, 0, 0).addScaledVector(S, -2 * u).addScaledVector(C, 2 * u - 2 * s).addScaledVector(E, 2 * s).normalize();
        }
        U.crossVectors(T, Math.abs(T.y) > 0.9 ? W.set(1, 0, 0) : W.set(0, 1, 0)).normalize();
        V.crossVectors(T, U).normalize();
        const r = prof(s, rad);
        for (let k = 0; k < RAD; k++) {
          const a = k / RAD * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), j = (i * RAD + k) * 3;
          pos[j] = P.x + (U.x * ca + V.x * sa) * r; pos[j + 1] = P.y + (U.y * ca + V.y * sa) * r; pos[j + 2] = P.z + (U.z * ca + V.z * sa) * r;
          nor[j] = U.x * ca + V.x * sa; nor[j + 1] = U.y * ca + V.y * sa; nor[j + 2] = U.z * ca + V.z * sa;
        }
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
      mesh.matrixWorld.identity();
    },
  };
}
