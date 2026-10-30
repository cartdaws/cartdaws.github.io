import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { lerp, smooth } from '../core/util.js';
import { SpringChain, bezier } from './tentacle.js';
import { makeHandGel } from './hand.js';

// Absorption tentacles (art/build_tentacle.py -> public/models/tentacle.glb): one skinned gel mesh on a 12-bone chain each.
// Every tentacle has a fixed root on the forearm (a socket, defined in the arm's own space) and a collar that blends it into the skin.
// All maths runs in the view model's space (the camera's frame), so looking around cannot break the attachment: the root is recomputed
// from the arm's pose every frame and the target is converted into the same space.
export async function loadTentacle() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/tentacle.glb');
  return gltf.scene;
}

const N = 12;                    // bones
const REST_LEN = 0.07;            // stub length when idle
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
const _R = new THREE.Vector3(), _n = new THREE.Vector3(), _f = new THREE.Vector3(), _H0 = new THREE.Vector3(), _E = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _T = new THREE.Quaternion(), _pq = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, -1);

// Per-frame instructions for one tentacle. The choreography (absorb.js, story.js) fills these in.
export function makeGoal() {
  return { extend: 0, wrap: 0, C: new THREE.Vector3(), rho: 0.15, phi0: 0, bow: 1, pulse: 0 };
}

class Tentacle {
  constructor(set, arm, scene, gel, socketPos, socketDir, phase, opts = {}) {
    this.set = set; this.arm = arm; this.phase = phase;
    this.coil = !!opts.coil; this.collarScale = opts.collarScale || 1;
    const meshName = opts.mesh || 'Tentacle', other = meshName === 'Tentacle' ? 'Proboscis' : 'Tentacle';
    this.socketPos = socketPos.clone(); this.socketDir = socketDir.clone().normalize();
    const inst = cloneSkinned(scene);
    const dropMesh = inst.getObjectByName(other);
    const dropRig = dropMesh && dropMesh.parent;
    if (dropMesh) dropMesh.removeFromParent();
    if (dropRig && dropRig !== inst) dropRig.removeFromParent();
    this.holder = new THREE.Group();
    this.holder.add(inst);
    this.mesh = inst.getObjectByName(meshName);
    this.mesh.material = gel;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.bones = this.mesh.skeleton.bones.slice().sort((x, y) => x.name.localeCompare(y.name));
    this.collar = inst.getObjectByName('Collar');
    this.collar.material = gel;
    this.collar.renderOrder = 5;
    this.collar.frustumCulled = false;
    this.collar.removeFromParent();
    this.holder.add(this.collar);
    // rest data in the holder's own frame (before it is attached anywhere)
    inst.updateMatrixWorld(true);
    this.armature = this.bones[0].parent;
    this.armPos = new THREE.Vector3(); this.armQuat = new THREE.Quaternion();
    this.armature.getWorldPosition(this.armPos); this.armature.getWorldQuaternion(this.armQuat);
    this.restPos = this.bones.map((b) => b.getWorldPosition(new THREE.Vector3()));
    this.restQuat = this.bones.map((b) => b.getWorldQuaternion(new THREE.Quaternion()));
    this.restDir = _a.subVectors(this.restPos[N - 1], this.restPos[0]).normalize().clone();
    this.chain = new SpringChain(N, 420, 150, 0.82);
    this.ideal = Array.from({ length: N }, () => new THREE.Vector3());
    this.root = new THREE.Vector3(); this.normal = new THREE.Vector3();
    this.goal = makeGoal();
    this.collarPulse = 0;
    this.visible = true;
  }

  // Root and outward direction of the socket in view model space, from the arm's current pose.
  updateSocket() {
    const arm = this.arm;
    arm.root.updateMatrix();
    this.root.copy(this.socketPos).applyMatrix4(arm.root.matrix);
    this.normal.copy(this.socketDir).transformDirection(arm.root.matrix);
    this._fwd = _f.copy(FWD).transformDirection(arm.root.matrix).clone();
  }

  // Tentacle length along the chain from root to tip (0..1 -> point), used for the bead of luminous material.
  pointAt(s, out) {
    const f = s * (N - 1), i = Math.min(N - 2, Math.floor(f));
    return out.lerpVectors(this.chain.p[i], this.chain.p[i + 1], f - i);
  }

  update(dt, time) {
    this.updateSocket();
    const R = this.root, n = this.normal, g = this.goal, ideal = this.ideal;
    const e = smooth(Math.min(1, g.extend));
    if (e < 0.002) {
      // resting stub: leaves the forearm along its normal and curls forward, with a slow restrained sway
      const f = this._fwd;
      _a.copy(R);
      if (this.coil) {
        // a tight spiral lying on the forearm, like a resting proboscis
        _e1.crossVectors(n, f).normalize(); _e2.crossVectors(n, _e1).normalize();
        for (let j = 0; j < N; j++) {
          const u = j / (N - 1), a = j * 1.15 + this.phase, r = 0.016 * (1 - 0.4 * u);
          ideal[j].copy(R).addScaledVector(n, 0.012 + r * (0.6 + 0.4 * Math.sin(a)) + 0.006 * Math.sin(time * 1.6 + this.phase)).addScaledVector(f, u * 0.028 + Math.cos(a) * r * 0.7).addScaledVector(_e1, Math.sin(a) * r * 0.9);
        }
      } else for (let j = 0; j < N; j++) {
        const u = j / (N - 1);
        _d.copy(n).multiplyScalar(1 - u * 0.9).addScaledVector(f, u * 0.9).normalize();
        if (j) _a.addScaledVector(_d, REST_LEN / (N - 1));
        ideal[j].copy(_a);
        _b.crossVectors(_d, UP).normalize();
        ideal[j].addScaledVector(_b, Math.sin(time * 1.3 + this.phase + j * 0.5) * 0.007 * u);
        ideal[j].addScaledVector(UP, Math.cos(time * 1.1 + this.phase + j * 0.4) * 0.006 * u);
      }
    } else {
      // approach point on the target's surface, or the start of the coil when wrapping
      const C = g.C, rho = g.rho, wrap = smooth(g.wrap);
      _d.subVectors(C, R);
      const dist = _d.length();
      _d.divideScalar(dist || 1);                                       // axis from root to target
      _e1.crossVectors(_d, UP); if (_e1.lengthSq() < 1e-4) _e1.set(1, 0, 0); _e1.normalize();
      _e2.crossVectors(_d, _e1).normalize();
      _H0.copy(C).addScaledVector(_d, -rho * 0.75).addScaledVector(_e1, Math.cos(g.phi0) * rho).addScaledVector(_e2, Math.sin(g.phi0) * rho);
      _E.copy(C).addScaledVector(_d, -Math.max(0.02, rho * 0.9));       // touch the near side
      _E.lerp(_H0, wrap);
      // the tip travels from the rest curl to the target as extend goes 0 -> 1
      _a.copy(R).addScaledVector(n, 0.1).addScaledVector(this._fwd, 0.1);
      _E.lerpVectors(_a, _E, e);
      const K = 6, M = N - K;                                            // joints 0..M follow the arc, the last K coil
      _c1.copy(R).addScaledVector(n, 0.1 + 0.16 * e);
      _c.subVectors(_E, R).normalize();
      _b.crossVectors(_c, UP).normalize();
      const bow = Math.sin(Math.PI * Math.min(1, g.extend)) * 0.1 * g.bow * (1 - wrap * 0.6);
      _c1.addScaledVector(_b, bow);
      _c2.copy(_E).addScaledVector(_c, -(0.12 + 0.16 * e)).addScaledVector(_b, bow * 0.7);
      for (let j = 0; j <= M; j++) bezier(R, _c1, _c2, _E, j / M, ideal[j]);
      if (this.coil) {                       // unrolling: a helical offset that dies out as the tongue straightens
        const k = Math.pow(1 - e, 1.4) * 0.045 + 0.006 * Math.sin(time * 9 + this.phase);
        for (let j = 1; j <= M; j++) { const a = j * 0.95 + this.phase + time * 2.4 * (1 - e), w = k * Math.sin(Math.PI * j / M); ideal[j].addScaledVector(_e1, Math.cos(a) * w).addScaledVector(_e2, Math.sin(a) * w); }
      }
      for (let j = M + 1; j < N; j++) {
        const v = (j - M) / K;
        // straight continuation, blended toward the coil that follows the target's own silhouette
        _a.copy(_E).addScaledVector(_c, 0.035 * (j - M));
        const phi = g.phi0 + v * 2.7 * Math.PI, ax = (v - 0.75) * rho * 1.1;
        const rr = rho * (1.04 + 0.05 * Math.sin(v * 9));
        _b.copy(C).addScaledVector(_d, ax).addScaledVector(_e1, Math.cos(phi) * rr).addScaledVector(_e2, Math.sin(phi) * rr);
        ideal[j].lerpVectors(_a, _b, wrap);
      }
    }
    // idle/follow-through
    this.chain.step(ideal, dt);
    const p = this.chain.p;
    p[0].copy(R);
    for (let j = 2; j < N; j++) {          // the root and first joint stay exactly on the forearm; the rest never enter the camera
      // never in front of the camera or inside it
      if (p[j].z > -0.12) p[j].z = -0.12;
      if (p[j].lengthSq() < 0.04) p[j].setLength(0.2);
    }
    this.applyBones();
    // collar: sits on the skin at the socket, pointing outward, swelling with the pulse
    this.collar.position.copy(R).addScaledVector(n, -0.012);
    this.collar.quaternion.setFromUnitVectors(FWD, n);
    this.collarPulse = Math.max(0, this.collarPulse - dt * 4);
    this.collar.scale.setScalar(this.collarScale * (1 + this.collarPulse * 0.5));
    this.holder.visible = this.mesh.visible = this.collar.visible = this.visible && this.arm.root.visible;
  }

  // Drive the skeleton from the chain: parallel-transported frames, so the surface never twists or flips.
  applyBones() {
    const p = this.chain.p;
    if (!this.wQuat) this.wQuat = this.bones.map(() => new THREE.Quaternion());
    let prev = _b.subVectors(p[1], p[0]).normalize();
    _T.setFromUnitVectors(this.restDir, prev);
    for (let i = 0; i < N; i++) {
      if (i > 0) {
        const d = i < N - 1 ? _c.subVectors(p[i + 1], p[i]).normalize() : _c.copy(prev);
        _q.setFromUnitVectors(prev, d);
        _T.premultiply(_q);
        prev.copy(d);
      }
      const Q = this.wQuat[i].copy(_T).multiply(this.restQuat[i]);
      const pPos = i ? p[i - 1] : this.armPos, pQuat = i ? this.wQuat[i - 1] : this.armQuat;
      _pq.copy(pQuat).invert();
      const bone = this.bones[i];
      bone.position.subVectors(p[i], pPos).applyQuaternion(_pq);
      bone.quaternion.copy(_pq).multiply(Q);
      bone.scale.set(1, 1, 1);
    }
  }
}

// The set of tentacles on both forearms. Sockets are defined in each arm's own space (model forward is -Z, the forearm trails along +Z).
export class TentacleSet {
  constructor(vm, scene) {
    this.vm = vm;
    this.time = 0;
    this.gel = makeHandGel({ color: 0x147a6c, rim: 0xd2fff0, alpha: 0.86 });
    const mk = (arm, pos, dir, phase, opts) => {
      const t = new Tentacle(this, arm, scene, this.gel, new THREE.Vector3(...pos), new THREE.Vector3(...dir), phase, opts);
      vm.root.add(t.holder);
      return t;
    };
    // left forearm: one on top (reaches), one on the outer side (braces)
    this.P = [];
    for (let k = 0; k < 6; k++) {                       // six feeding tongues in a ring around the left forearm, near the wrist
      const a = -0.25 + k * 0.62, z = 0.2 + (k % 3) * 0.1, r = 0.064;
      this.P.push(mk(vm.left, [Math.cos(a) * r, Math.sin(a) * r, z], [Math.cos(a), Math.sin(a), -0.25], k * 1.3, { mesh: 'Proboscis', coil: true, collarScale: 0.55 }));
    }
    // right forearm: one on top (used when the weapon hand takes the pistol)
    this.RA = mk(vm.right, [0, 0.06, 0.34], [0, 0.95, -0.3], 4.2);
    this.all = [...this.P, this.RA];
  }

  update(dt) {
    this.time += dt;
    for (const t of this.all) t.update(dt, this.time);
  }

  // Everything back to its resting stub.
  reset() {
    for (const t of this.all) { const g = t.goal; g.extend = 0; g.wrap = 0; g.pulse = 0; t.chain.ready = false; t.collarPulse = 0; }
  }
}
