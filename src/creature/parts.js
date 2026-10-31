import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HOVER } from './shape.js';
import { CAMERA } from './definition.js';

// Sensory and surface-feature modules (art/build_creature_parts.py -> creature_parts.glb): eyes, feelers, crests, fins.
// They are seated on the sampled, deformed body surface, so they follow every body slider; every module is checked against the
// camera keep-out so nothing can enter the view or sit across the crosshair.
export async function loadParts() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/creature_parts.glb');
  const a = {};
  gltf.scene.traverse((o) => { if (o.isMesh) a[o.name] = o; });
  for (const n of ['Eye', 'Pupil', 'Feeler', 'CrestRidge', 'CrestFan', 'Fin']) if (!a[n]) throw new Error('creature_parts.glb is missing ' + n);
  return a;
}

const UP = new THREE.Vector3(0, 1, 0), BACK = new THREE.Vector3(0, 0, -1), RIGHT = new THREE.Vector3(1, 0, 0);
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _d = new THREE.Vector3();

const EYES = {
  pair: [[0.87, 0.5, 1], [0.87, -0.5, 1]],
  trio: [[0.85, 0.66, 0.85], [0.85, -0.66, 0.85], [0.935, 0, 0.8]],
  cyclops: [[0.88, 0, 1.5]],
  cluster: [[0.93, 0.32, 0.75], [0.93, -0.32, 0.75], [0.86, 0.78, 0.7], [0.86, -0.78, 0.7], [0.83, 0, 0.8]],
};
const FEELERS = { 1: [0], 2: [0.55, -0.55], 3: [0.85, 0, -0.85], 4: [0.95, 0.35, -0.35, -0.95] };

export class HeadParts {
  constructor(body, asset) {
    this.body = body; this.asset = asset;
    this.group = new THREE.Group(); body.group.add(this.group);
    this.items = [];
    this.irisMat = new THREE.MeshBasicMaterial({ color: 0xbaff5a });
    this.pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.t = 0;
  }

  clear() { for (const it of this.items) it.obj.removeFromParent(); this.items = []; }

  // group-local point -> would it be in the camera's way?
  blocks(p) {
    const y = HOVER + p.y, fwd = -p.z;
    if (y > CAMERA.eye - 0.2) return true;
    return fwd > 0.02 && (CAMERA.eye - y) / fwd < Math.tan(THREE.MathUtils.degToRad(46));
  }

  add(obj, scale, tip, extra = {}) {
    // shrink until the module's farthest point is clear of the view; drop it if it never can be
    let s = scale;
    const world = new THREE.Vector3();
    while (s > 0.45) {
      world.copy(tip).multiplyScalar(s).add(obj.position);
      if (!this.blocks(world) && !this.blocks(obj.position)) break;
      s *= 0.88;
    }
    if (s <= 0.45 && (this.blocks(obj.position))) return false;
    const sign = obj.scale.x < 0 ? -1 : 1;
    obj.scale.set(sign * s, s, s);
    this.group.add(obj);
    this.items.push({ obj, ...extra });
    return true;
  }

  apply(def, skinMat) {
    this.clear();
    const H = def.head, S = this.body.shape, A = this.asset;
    this.dropped = 0;
    if (!H.enabled) return;
    const size = H.size * (0.85 + 0.15 * Math.min(S.scale.x, S.scale.z));
    this.irisMat.color.set(H.eyeColor);
    // eyes
    for (const [t, dphi, k] of EYES[H.eyes] || []) {
      S.surface(t, Math.PI / 2 + dphi, _p, _n);
      const g = new THREE.Group();
      const eye = A.Eye.clone(); eye.material = this.irisMat; const pu = A.Pupil.clone(); pu.material = this.pupilMat;
      g.add(eye, pu);
      g.position.copy(_p).addScaledVector(_n, -0.004);
      // face outward, tilted a little upward so the eyes read from the front
      _d.copy(_n).addScaledVector(UP, 0.25).normalize();
      g.quaternion.setFromUnitVectors(BACK, _d);
      if (!this.add(g, size * H.eyeSize * k * 0.9, new THREE.Vector3(0, 0, -0.02), { eye: true })) this.dropped++;
    }
    // feelers
    const fl = FEELERS[H.feelers] || [];
    fl.forEach((dphi, i) => {
      S.surface(0.965, Math.PI / 2 + dphi, _p, _n);
      const m = A.Feeler.clone(); m.material = skinMat; m.morphTargetInfluences = [0, 0];
      m.position.copy(_p).addScaledVector(_n, -0.01); m.position.y -= 0.01;
      _d.copy(UP).addScaledVector(_n, 0.45).normalize();
      m.quaternion.setFromUnitVectors(UP, _d);
      if (!this.add(m, size * 0.95, new THREE.Vector3(0, 0.3, -0.12).applyQuaternion(m.quaternion), { feeler: true, phase: i * 1.7 })) this.dropped++;
    });
    // crest
    if (H.crest !== 'none') {
      const m = (H.crest === 'ridge' ? A.CrestRidge : A.CrestFan).clone(); m.material = skinMat;
      S.surface(0.985, Math.PI / 2, _p, _n);
      m.position.set(0, S.top - 0.035 * size, _p.z + 0.01);
      if (H.crest === 'fan') { m.position.z += 0.05; m.rotation.x = 0.35; }
      if (!this.add(m, size * (0.8 + 0.25 * Math.min(S.scale.y, 1.4)), new THREE.Vector3(0, 0.1, -0.1), { crest: true })) this.dropped++;
    }
    // fins: soft pairs on the shoulders of the head
    for (let i = 0; i < H.fins; i++) {
      for (const side of [1, -1]) {
        S.surface(0.80 - i * 0.1, side > 0 ? -0.1 : Math.PI + 0.1, _p, _n);
        const m = A.Fin.clone(); m.material = skinMat; m.morphTargetInfluences = [0];
        m.position.copy(_p).addScaledVector(_n, -0.012);
        m.scale.x = side; m.rotation.z = side * -0.35; m.rotation.y = 0.0;
        if (!this.add(m, size * (1 - i * 0.15), new THREE.Vector3(side * 0.12, 0.04, 0), { fin: true, side, phase: i * 1.3 })) this.dropped++;
      }
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
