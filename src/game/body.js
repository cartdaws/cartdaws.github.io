import * as THREE from 'three';
import { clamp, damp, angleDiff } from '../core/util.js';
import { makeGel } from '../world/materials.js';
import { makeSkin, skinParams, restyle } from '../creature/skin.js';
import { Shape, HOVER, BASE_DROP } from '../creature/shape.js';
import { defaults } from '../creature/definition.js';
import { HeadParts } from '../creature/parts.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3();

// The player's body: one continuous gel mass (art/build_creature.py shape keys, driven by the creature definition) that hovers above the
// floor. It has no legs and no trailing appendages; the arms are the first-person arms, joined to the body by a soft upper-arm segment.
// Seen when looking down, in the creator and anywhere the body is shown; it leans with acceleration and settles with a slow breathing motion.
export class AlienBody {
  constructor(scene, world, player, geos, asset, def = defaults()) {
    this.world = world; this.player = player; this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;
    this.yaw = 0;
    this.vel = new THREE.Vector3(); this.acc = new THREE.Vector3();
    this.pitch = 0; this.roll = 0;
    this.land = 0;                       // landing squash, 0..1, decays
    this.def = def;
    this.shape = new Shape(asset);
    this.parts = new HeadParts(this, asset.parts);

    this.bellMat = makeSkin(skinParams(def, 'body'));
    this.bell = new THREE.Mesh(asset.geometry, this.bellMat);
    this.bell.morphTargetDictionary = { ...asset.dict };
    this.bell.morphTargetInfluences = new Array(Object.keys(asset.dict).length).fill(0);
    this.bell.frustumCulled = false;
    this.bell.renderOrder = 2;
    this.group.add(this.bell);
    this.coreMat = makeGel({ color: 0x0f6a60, rim: 0xc6fff6, alpha: 0.55 });
    this.core = new THREE.Mesh(geos.BodyCore, this.coreMat);
    this.group.add(this.core);

    // soft upper arms from the body surface to the first-person arms' elbows (updated by updateArms)
    this.armMat = makeSkin(skinParams(def, 'body'));
    this.arms = [1, -1].map(() => makeArmTube(this.armMat, this.group));
    this.armsVisible = true;
    this.elbowOffset = new THREE.Vector3(0, 0, 1.28);

    // floor glow: where the hovering body "presses" on the ground
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0x78ffe1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.glow.renderOrder = 1;
    scene.add(this.glow);
    this.setCreature(def);
  }

  // Apply a creature definition: shape-key influences, proportions, materials. Cheap enough to call on every slider tick.
  setCreature(def) {
    this.def = def;
    const r = this.shape.resolve(def);
    const keys = this.bell.morphTargetDictionary;
    for (const [n, w] of Object.entries(r.infl)) this.bell.morphTargetInfluences[keys[n]] = w;
    this.bell.scale.copy(r.scale);
    this.bell.position.y = BASE_DROP;
    this.notes = r.notes;
    restyle(this.bellMat, def, 'body'); restyle(this.armMat, def, 'body');
    this.parts.apply(def, this.armMat);
    const gl = new THREE.Color(def.skin.glow);
    this.coreMat.uniforms.uColor.value.set(def.skin.primary).lerp(gl, 0.45);
    this.coreMat.uniforms.uRim.value.set(def.skin.marking);
    this.core.visible = def.skin.core;
    this.core.position.set(0, BASE_DROP + 0.23 * r.scale.y, 0);
    this.core.scale.setScalar(Math.max(0.6, Math.min(r.scale.x, r.scale.z)));
    this.glow.material.color.set(def.skin.glow);
    this.coreBase = this.core.scale.x;
    this.group.updateMatrixWorld(true);
    return r;
  }

  dispose(scene) { scene.remove(this.group); scene.remove(this.glow); }
  setVisible(v) { this.group.visible = v; this.glow.visible = v; }
  reset() { this.yaw = this.player.yaw; this.vel.set(0, 0, 0); this.acc.set(0, 0, 0); this.land = 0; }
  // the first-person arms are drawn by the view model; the body only adds the connecting upper arms when they are shown
  setArmsVisible(v) { this.armsVisible = v; }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const p = this.player, t = (this.time += dt);
    const v = new THREE.Vector3(p.vx, 0, p.vz);
    this.acc.lerp(v.clone().sub(this.vel).divideScalar(Math.max(dt, 1e-3)), 1 - Math.exp(-10 * dt));
    this.vel.lerp(v, 1 - Math.exp(-14 * dt));
    this.yaw += angleDiff(this.yaw, p.yaw) * Math.min(1, 6 * dt);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const accF = -(this.acc.x * sy + this.acc.z * cy), accR = this.acc.x * cy - this.acc.z * sy;
    this.pitch = damp(this.pitch, clamp(accF * 0.01, -0.2, 0.2), 7, dt);
    this.roll = damp(this.roll, clamp(-accR * 0.01, -0.2, 0.2), 7, dt);
    const speed = this.vel.length();
    // landing: the mass flattens and springs back; picked up from the player's vertical state
    if (p.grounded && !this._wasGrounded && this._vy < -5) this.land = clamp(-this._vy / 14, 0.25, 1);
    this._wasGrounded = p.grounded; this._vy = p.vy;
    this.land = Math.max(0, this.land - dt * 3.2);
    const hover = HOVER + Math.sin(t * 1.6) * 0.02 + Math.min(1, speed / 7) * Math.sin(t * 5) * 0.01;
    this.group.position.set(p.pos.x, p.pos.y + hover, p.pos.z);
    this.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    const br = 1 + Math.sin(t * 1.8) * 0.025;
    const sq = this.land * Math.sin(this.land * 9) * 0.09 + this.land * 0.05;
    const S = this.shape.scale;
    this.bell.scale.set(S.x * br * (1 + sq), S.y / br * (1 - sq * 1.4), S.z * br * (1 + sq));
    this.core.scale.setScalar(this.coreBase * (1 + Math.sin(t * 2.4) * 0.12));
    this.core.rotation.y = t * 0.2;
    this.glow.position.set(p.pos.x, p.pos.y + 0.03, p.pos.z);
    this.glow.material.opacity = 0.7 + Math.sin(t * 1.6) * 0.15;
    this.parts.tick(dt);
    this.group.updateMatrixWorld(true);
  }

  // Joins each body shoulder to the end of the matching first-person arm. Call after the view model has been posed and synced to its frame.
  updateArms(vm) {
    const show = this.armsVisible && this.group.visible;
    for (let i = 0; i < 2; i++) {
      const tube = this.arms[i], arm = i === 0 ? vm.right : vm.left, sock = i === 0 ? this.shape.sockets.R : this.shape.sockets.L;
      tube.mesh.visible = show && arm.root.visible;
      if (!tube.mesh.visible) continue;
      arm.root.updateWorldMatrix(true, false);
      const E = _a.copy(arm.elbowLocal).applyMatrix4(arm.root.matrixWorld);                        // forearm end, world
      const S = _b.copy(sock.p).addScaledVector(sock.n, -0.035).applyMatrix4(this.group.matrixWorld);   // just inside the surface
      const out = _n.copy(sock.n).transformDirection(this.group.matrixWorld);
      tube.update(S, E, out, arm.endRadius);
    }
  }
}

const RINGS = 16, RAD = 14;
function makeArmTube(mat, parent) {
  const geo = new THREE.BufferGeometry();
  const n = (RINGS + 1) * RAD;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const uv = new Float32Array(n * 2);
  const idx = [];
  for (let i = 0; i <= RINGS; i++) for (let k = 0; k < RAD; k++) {
    uv[(i * RAD + k) * 2] = k / RAD; uv[(i * RAD + k) * 2 + 1] = i / RINGS;
    if (i < RINGS) { const k2 = (k + 1) % RAD; idx.push(i * RAD + k, i * RAD + k2, (i + 1) * RAD + k2, i * RAD + k, (i + 1) * RAD + k2, (i + 1) * RAD + k); }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false;     // vertices are written in world space
  // the tube lives in the scene root, not under the (rotating) body group
  (parent.parent || parent).add(mesh);
  const P = new THREE.Vector3(), T = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3(), C = new THREE.Vector3(), W = new THREE.Vector3(), Pv = new THREE.Vector3();
  return {
    mesh,
    update(S, E, out, rE) {
      const mid = C.copy(S).add(E).multiplyScalar(0.5).addScaledVector(out, 0.09);
      mid.y -= 0.05;
      const pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
      Pv.set(0, 0, 0);
      for (let i = 0; i <= RINGS; i++) {
        const s = i / RINGS, u = 1 - s;
        P.set(0, 0, 0).addScaledVector(S, u * u).addScaledVector(mid, 2 * u * s).addScaledVector(E, s * s);
        T.set(0, 0, 0).addScaledVector(S, -2 * u).addScaledVector(mid, 2 * u - 2 * s).addScaledVector(E, 2 * s).normalize();
        U.crossVectors(T, Math.abs(T.y) > 0.9 ? W.set(1, 0, 0) : W.set(0, 1, 0)).normalize();
        V.crossVectors(T, U).normalize();
        const r = rE * (1 + 0.55 * Math.pow(1 - s, 2.2)) * (s > 0.92 ? 1 - (s - 0.92) * 0.8 : 1);
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
