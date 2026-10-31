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

    this.coreMat = makeGel({ color: 0x0f6a60, rim: 0xc6fff6, alpha: 0.55 });
    this.core = new THREE.Mesh(geos.BodyCore, this.coreMat);
    this.group.add(this.core);

    this.armMat = makeSkin(skinParams(def, 'body'));
    this.arms = [1, -1].map(() => makeTube(this.armMat, scene, (s, r) => r * (1 + 0.3 * Math.pow(1 - s, 2.2)) * (s > 0.92 ? 1 - (s - 0.92) * 0.8 : 1)));
    this.legs = [1, -1].map(() => makeTube(this.armMat, scene, (s, r) => r * (1 - 0.55 * Math.pow(s, 0.8)) * (s > 0.94 ? 1 - (s - 0.94) * 2 : 1)));
    this.feet = [1, -1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), this.armMat); m.scale.set(0.05, 0.032, 0.095); m.renderOrder = 2; m.frustumCulled = false; this.group.add(m); return m; });
    this.footPos = [new THREE.Vector3(), new THREE.Vector3()];
    // eight limbs grow from the upper back, always present: they sway on their own and trail behind the player's motion
    this.back = Array.from({ length: 8 }, () => makeTube(this.armMat, scene, (s, r) => r * (1 - 0.8 * Math.pow(s, 1.15)) * (s > 0.94 ? 1 - (s - 0.94) * 12 : 1)));
    this.backLag = new THREE.Vector3();
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
    const gl = new THREE.Color(def.skin.glow);
    this.coreMat.uniforms.uColor.value.set(def.skin.primary).lerp(gl, 0.45);
    this.coreMat.uniforms.uRim.value.set(def.skin.marking);
    this.core.visible = def.skin.core;
    this.core.position.set(0, 1.12 * S.y, 0.0);
    this.coreBase = 0.8 * Math.min(S.x, S.z);
    this.core.scale.setScalar(this.coreBase);
    this.glow.material.color.set(def.skin.glow);
    this.group.updateMatrixWorld(true);
    return r;
  }

  dispose(scene) { scene.remove(this.group); scene.remove(this.glow); }
  setVisible(v) { this.group.visible = v; this.glow.visible = v; }
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
    this.stepBack(dt, t, sy, cy, S);
  }

  // The eight back limbs: roots sampled from the deformed upper back, a fan of curves that wave slowly, lag behind the motion, and are kept
  // behind the camera plane so they can never enter the player's view or the line of aim.
  stepBack(dt, t, sy, cy, S) {
    const show = this.group.visible, mw = this.group.matrixWorld;
    const right = this.vel.x * cy - this.vel.z * sy, fwd = -(this.vel.x * sy + this.vel.z * cy);
    this.backLag.x = damp(this.backLag.x, clamp(-right * 0.03, -0.18, 0.18), 5, dt);
    this.backLag.z = damp(this.backLag.z, clamp(fwd * 0.035, -0.12, 0.2), 5, dt);
    const root = _a, nrm = _n, ctrl = _b, tip = _c, dir = _d;
    for (let k = 0; k < 8; k++) {
      const tube = this.back[k];
      tube.mesh.visible = show;
      if (!show) continue;
      const u = (k - 3.5) / 3.5;                                   // -1 .. 1 across the back
      const upper = k % 2 === 0;
      this.shape.surface(upper ? 0.74 : 0.6, -Math.PI / 2 + u * 1.05, root, nrm);
      root.addScaledVector(nrm, -0.03);
      const len = (upper ? 0.74 : 0.62) * (0.8 + 0.2 * S.y);
      const ph = t * 1.15 + k * 0.83;
      dir.set(u * 0.85 + Math.sin(ph) * 0.12, (upper ? 0.5 : -0.12) + Math.cos(ph * 0.8) * 0.1, 0.9).normalize();
      const L = this.backLag;
      ctrl.copy(root).addScaledVector(dir, len * 0.5); ctrl.x += L.x * 0.4; ctrl.z += L.z * 0.4;
      tip.copy(root).addScaledVector(dir, len);
      tip.y += upper ? 0.16 + Math.sin(ph * 1.3) * 0.06 : -0.3 + Math.sin(ph * 1.3) * 0.05;     // the upper ones arch up, the lower ones droop
      tip.x += L.x + Math.sin(ph) * 0.05; tip.z += L.z;
      tip.y = Math.max(0.06, tip.y);
      // never in front of the shoulders' plane: nothing can reach the camera, whatever the lean
      ctrl.z = Math.max(ctrl.z, 0.03); tip.z = Math.max(tip.z, 0.06);
      ctrl.multiplyScalar(2).addScaledVector(root, -0.5).addScaledVector(tip, -0.5);
      ctrl.z = Math.max(ctrl.z, 0.03);
      const wr = root.clone().applyMatrix4(mw), wc = ctrl.clone().applyMatrix4(mw), wt = tip.clone().applyMatrix4(mw);
      tube.updateCurve(wr, wc, wt, 0.05 * Math.min(S.x, S.z) + 0.004);
    }
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
  updateArms(vm) {
    const show = this.armsVisible && this.group.visible;
    for (let i = 0; i < 2; i++) {
      const tube = this.arms[i], arm = i === 0 ? vm.right : vm.left, sock = i === 0 ? this.shape.sockets.R : this.shape.sockets.L;
      tube.mesh.visible = show && arm.root.visible;
      if (!tube.mesh.visible) continue;
      arm.root.updateWorldMatrix(true, false);
      const E = _a.copy(arm.elbowLocal).applyMatrix4(arm.root.matrixWorld);
      const S = _b.copy(sock.p).addScaledVector(sock.n, -0.04).applyMatrix4(this.group.matrixWorld);
      const out = _n.copy(sock.n).transformDirection(this.group.matrixWorld);
      const mid = _c.copy(S).add(E).multiplyScalar(0.5).addScaledVector(out, 0.07); mid.y -= 0.05;
      tube.updateCurve(S, mid.multiplyScalar(2).addScaledVector(S, -0.5).addScaledVector(E, -0.5), E, arm.endRadius);
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
    updateCurve(S, C, E, rad) {
      const pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
      for (let i = 0; i <= RINGS; i++) {
        const s = i / RINGS, u = 1 - s;
        P.set(0, 0, 0).addScaledVector(S, u * u).addScaledVector(C, 2 * u * s).addScaledVector(E, s * s);
        T.set(0, 0, 0).addScaledVector(S, -2 * u).addScaledVector(C, 2 * u - 2 * s).addScaledVector(E, 2 * s).normalize();
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
