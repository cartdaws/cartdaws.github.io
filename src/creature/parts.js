import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Sensory modules (art/build_creature_parts.py -> creature_parts.glb): eyes, feelers, crests, fins. They are seated on the head mesh, in the
// head's own space (origin at the top of the neck, +Y up, forward is -Z), so they follow the head's size and shape. The head is only drawn when
// the camera is outside the body (the creator, cut-scenes); in first person the camera is inside it.
export async function loadParts() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/creature_parts.glb');
  const a = {};
  gltf.scene.traverse((o) => { if (o.isMesh) a[o.name] = o; });
  for (const n of ['Eye', 'Pupil', 'Feeler', 'CrestRidge', 'CrestFan', 'Fin']) if (!a[n]) throw new Error('creature_parts.glb is missing ' + n);
  return a;
}

const UP = new THREE.Vector3(0, 1, 0), BACK = new THREE.Vector3(0, 0, -1);
const _n = new THREE.Vector3(), _d = new THREE.Vector3();
// the skull ellipsoid of the Blender head (art/build_creature.py)
const C = new THREE.Vector3(0, 0.108, -0.015), RX = 0.076, RY = 0.088, RZ = 0.108;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// [height above the neck, azimuth from straight ahead, relative size]
const EYES = {
  pair: [[0.118, 0.5, 1], [0.118, -0.5, 1]],
  trio: [[0.115, 0.64, 0.85], [0.115, -0.64, 0.85], [0.158, 0, 0.8]],
  cyclops: [[0.122, 0, 1.55]],
  cluster: [[0.155, 0.3, 0.75], [0.155, -0.3, 0.75], [0.118, 0.78, 0.7], [0.118, -0.78, 0.7], [0.095, 0, 0.8]],
};
const FEELERS = { 1: [0], 2: [0.9, -0.9], 3: [1.3, 0, -1.3], 4: [1.5, 0.5, -0.5, -1.5] };

// a point on the head surface at a height and azimuth, with its outward normal (head space)
function onHead(y, a, out, nrm) {
  const e = Math.sqrt(Math.max(0, 1 - ((y - C.y) / RZ) ** 2)) * (0.58 + 0.42 * sstep(0, 0.13, y));
  out.set(Math.sin(a) * RX * e, y, C.z - Math.cos(a) * RY * e);
  nrm.set((out.x - C.x) / (RX * RX), (out.y - C.y) / (RZ * RZ) * 0.6, (out.z - C.z) / (RY * RY)).normalize();
  return out;
}

export class HeadParts {
  constructor(body, asset) {
    this.body = body; this.asset = asset;
    this.group = new THREE.Group(); body.headGroup.add(this.group);
    this.items = [];
    this.irisMat = new THREE.MeshBasicMaterial({ color: 0xbaff5a });
    this.pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.t = 0;
  }

  clear() { for (const it of this.items) it.obj.removeFromParent(); this.items = []; }

  add(obj, scale, extra = {}) {
    const sign = obj.scale.x < 0 ? -1 : 1;
    obj.scale.set(sign * scale, scale, scale);
    this.group.add(obj);
    this.items.push({ obj, ...extra });
  }

  apply(def, skinMat) {
    this.clear();
    const H = def.head, A = this.asset, p = new THREE.Vector3();
    this.irisMat.color.set(H.eyeColor);
    for (const [y, a, k] of EYES[H.eyes] || []) {
      onHead(y, a, p, _n);
      const g = new THREE.Group();
      const eye = A.Eye.clone(); eye.material = this.irisMat; const pu = A.Pupil.clone(); pu.material = this.pupilMat;
      g.add(eye, pu);
      g.position.copy(p).addScaledVector(_n, -0.003);
      g.quaternion.setFromUnitVectors(BACK, _n);
      this.add(g, 0.62 * H.eyeSize * k, { eye: true });
    }
    (FEELERS[H.feelers] || []).forEach((a, i) => {
      onHead(0.185, a, p, _n);
      const m = A.Feeler.clone(); m.material = skinMat; m.morphTargetInfluences = [0, 0];
      m.position.copy(p).addScaledVector(_n, -0.012);
      _d.copy(UP).addScaledVector(_n, 0.5).normalize();
      m.quaternion.setFromUnitVectors(UP, _d);
      this.add(m, 0.5, { feeler: true, phase: i * 1.7 });
    });
    if (H.crest !== 'none') {
      const m = (H.crest === 'ridge' ? A.CrestRidge : A.CrestFan).clone(); m.material = skinMat;
      m.position.set(0, 0.2, C.z + 0.005);
      if (H.crest === 'fan') { m.position.z += 0.03; m.rotation.x = 0.4; }
      this.add(m, 0.62, { crest: true });
    }
    for (let i = 0; i < H.fins; i++) for (const side of [1, -1]) {
      const m = A.Fin.clone(); m.material = skinMat; m.morphTargetInfluences = [0];
      m.position.set(side * (RX * 0.92), 0.115 - i * 0.045, C.z + 0.01);
      m.scale.x = side; m.rotation.z = side * -0.3 + (side > 0 ? 0 : 0);
      this.add(m, 0.75 - i * 0.12, { fin: true, side, phase: i * 1.3 });
    }
  }

  tick(dt) {
    this.t += dt;
    for (const it of this.items) {
      const m = it.obj;
      if (it.feeler) { m.morphTargetInfluences[0] = 0.35 + 0.3 * Math.sin(this.t * 1.1 + it.phase); m.morphTargetInfluences[1] = 0.6 * Math.sin(this.t * 0.8 + it.phase * 1.3); }
      if (it.fin) m.morphTargetInfluences[0] = 0.35 + 0.35 * Math.sin(this.t * 1.5 + it.phase);
    }
  }
}
