import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAMERA } from './definition.js';

// CPU side of the Blender humanoid torso (art/build_creature.py -> creature.glb). The GPU draws the shape-keyed mesh; this class evaluates the
// very same morph targets on the CPU for what gameplay needs: where the arms leave the shoulders, how high the body reaches, and whether any
// part of it could enter the camera's view. The head is a separate mesh and is never drawn in first person.
export const HOVER = 0;              // the creature stands: the body group sits on the floor
export const BASE_DROP = 0;
const NR = 44, SEG = 48, Z0 = 0.78, Z1 = 1.38;
const ARM_ANGLE = -0.16;             // shoulders sit just behind the beam
const T_LOW = 0.55, T_HIGH = 0.8;

export async function loadCreatureAsset() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/creature.glb');
  let mesh = null, head = null;
  gltf.scene.traverse((o) => { if (o.isMesh && o.name === 'Body') mesh = o; if (o.isMesh && o.name === 'Head') head = o; });
  if (!mesh || !mesh.morphTargetDictionary || !head) throw new Error('creature.glb is missing the Body or Head');
  for (const n of ['Broad', 'Heavy', 'Lean', 'Belly']) if (mesh.morphTargetDictionary[n] === undefined) throw new Error('creature.glb is missing shape key ' + n);
  const g = mesh.geometry;
  return { mesh, geometry: g, dict: mesh.morphTargetDictionary, base: g.attributes.position.array, targets: g.morphAttributes.position.map((a) => a.array), relative: g.morphTargetsRelative,
    head: { geometry: head.geometry, dict: head.morphTargetDictionary } };
}

// Shape-key influences for a definition (the Blender key names).
export function influencesOf(def) {
  const b = def.body;
  return { Broad: b.shoulderWidth, Heavy: 0, Lean: b.lean, Belly: b.curve };
}

export class Shape {
  constructor(asset) {
    this.a = asset;
    this.pos = new Float32Array(asset.base.length);
    this.infl = {};
    this.scale = new THREE.Vector3(1, 1, 1);
    this.sockets = { L: { p: new THREE.Vector3(), n: new THREE.Vector3() }, R: { p: new THREE.Vector3(), n: new THREE.Vector3() } };
    this.top = Z1; this.neck = new THREE.Vector3(0, Z1, 0);
    this.notes = [];
  }

  evaluate(infl) {
    const { base, targets, relative, dict } = this.a, pos = this.pos;
    pos.set(base);
    for (const [name, w] of Object.entries(infl)) {
      if (!w) continue;
      const t = targets[dict[name]];
      if (relative) for (let i = 0; i < pos.length; i++) pos[i] += t[i] * w;
      else for (let i = 0; i < pos.length; i++) pos[i] += (t[i] - base[i]) * w;
    }
  }

  // Rings must keep a radius and keep stacking upward (no inverted or collapsed bands).
  sound() {
    const p = this.pos;
    for (let i = 3; i < NR - 3; i++) {
      let cx = 0, cz = 0, cy = 0;
      for (let k = 0; k < SEG; k++) { const j = ((i - 1) * SEG + k) * 3; cx += p[j]; cy += p[j + 1]; cz += p[j + 2]; }
      cx /= SEG; cz /= SEG; cy /= SEG;
      let minR = 9;
      for (let k = 0; k < SEG; k++) { const j = ((i - 1) * SEG + k) * 3; minR = Math.min(minR, Math.hypot(p[j] - cx, p[j + 2] - cz)); }
      if (minR < 0.03) return false;
      let py = 0; for (let k = 0; k < SEG; k++) py += p[((i - 2) * SEG + k) * 3 + 1];
      if (cy < py / SEG - 1e-4) return false;
    }
    return true;
  }

  // Nothing of the torso may enter the view of a player looking straight ahead (the head is hidden in first person, so it is not part of this).
  clearanceOk(s) {
    const p = this.pos, eye = CAMERA.eye;
    const tanDown = Math.tan(THREE.MathUtils.degToRad(44));
    for (let i = 0; i < p.length; i += 3) {
      const y = p[i + 1] * s.y, fwd = -p[i + 2] * s.z;
      if (y > eye - CAMERA.clearance + 0.001) return false;
      if (fwd > 0.02 && (eye - y) / fwd < tanDown) return false;
    }
    return true;
  }

  resolve(def) {
    const notes = [], b = def.body;
    const infl = influencesOf(def), raw = { ...infl };
    let k = 1;
    this.evaluate(infl);
    for (let it = 0; it < 16 && !this.sound(); it++) {
      k *= 0.88;
      for (const n of Object.keys(infl)) infl[n] = raw[n] * k;
      this.evaluate(infl);
    }
    if (k < 1) notes.push('Some sliders were eased so the body keeps its shape.');
    const s = new THREE.Vector3(b.width, b.height, b.depth);
    let tries = 0;
    while (!this.clearanceOk(s) && tries++ < 60) s.y -= 0.02;
    if (s.y < b.height - 1e-3) notes.push('Height was limited so the body never blocks your view.');
    this.infl = infl; this.scale.copy(s); this.notes = notes;
    this.measure(def);
    return { infl, scale: s, notes };
  }

  vertex(ring, k, out) {
    const j = ((ring - 1) * SEG + ((k % SEG) + SEG) % SEG) * 3;
    return out.set(this.pos[j] * this.scale.x, this.pos[j + 1] * this.scale.y, this.pos[j + 2] * this.scale.z);
  }

  // Surface point at height fraction t (0 pelvis .. 1 neck) and angle phi (0 = the creature's right, pi/2 = forward), in group space.
  surface(t, phi, out, nrm) {
    const ring = THREE.MathUtils.clamp(Math.round(t * NR), 1, NR - 1);
    const k = Math.round((((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * SEG);
    this.vertex(ring, k, out);
    if (nrm) { const c = new THREE.Vector3(); this.ringCentre(ring, c); nrm.set(out.x - c.x, 0, out.z - c.z).normalize(); }
    return out;
  }

  ringCentre(ring, out) {
    out.set(0, 0, 0); const v = new THREE.Vector3();
    for (let k = 0; k < SEG; k++) out.add(this.vertex(ring, k, v));
    return out.multiplyScalar(1 / SEG);
  }

  measure(def) {
    const t = THREE.MathUtils.lerp(T_LOW, T_HIGH, def.body.armRootHeight);
    this.surface(t, ARM_ANGLE, this.sockets.R.p, this.sockets.R.n);
    this.surface(t, Math.PI - ARM_ANGLE, this.sockets.L.p, this.sockets.L.n);
    let top = -9;
    for (let i = 1; i < this.pos.length; i += 3) top = Math.max(top, this.pos[i] * this.scale.y);
    this.top = top;
    // the neck top (head seat) follows the lean of the top pole
    const j = ((NR - 1) * SEG + 1) * 3;
    this.neck.set(this.pos[j] * this.scale.x, this.pos[j + 1] * this.scale.y, this.pos[j + 2] * this.scale.z);
  }
}

export const GRID = { NR, SEG, Z0, Z1, ARM_ANGLE, T_LOW, T_HIGH };
