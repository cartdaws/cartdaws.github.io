import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAMERA } from './definition.js';

// CPU side of the Blender body (art/build_creature.py -> creature.glb). The GPU draws the shape-keyed mesh; this class evaluates the very same
// morph targets on the CPU for the few things gameplay needs to know: where the arms leave the surface, how high the body reaches, and
// whether any part of it could enter the camera's view. The grid layout is documented in build_creature.py.
export const HOVER = 0.52;           // body-group height above the player's feet (unchanged from the original bell)
export const BASE_DROP = -0.18;      // mesh origin offset inside the group (unchanged)
const NR = 40, SEG = 48, H = 0.5;
const ARM_ANGLE = -0.26;             // arm roots sit slightly behind the beam
const T_LOW = 0.3, T_HIGH = 0.72;

export async function loadCreatureAsset() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/creature.glb');
  let mesh = null;
  gltf.scene.traverse((o) => { if (o.isMesh && o.name === 'Body') mesh = o; });
  if (!mesh || !mesh.morphTargetDictionary) throw new Error('creature.glb is missing the Body shape keys');
  const g = mesh.geometry;
  const need = ['Taper', 'UpperBroad', 'Boxy', 'Soft', 'Curve', 'Lean', 'Shoulders', 'Root0', 'Root1', 'Root2', 'Ribs', 'Head', 'HeadWide', 'HeadLong'];
  for (const n of need) if (mesh.morphTargetDictionary[n] === undefined) throw new Error('creature.glb is missing shape key ' + n);
  return { mesh, geometry: g, dict: mesh.morphTargetDictionary, base: g.attributes.position.array, targets: g.morphAttributes.position.map((a) => a.array), relative: g.morphTargetsRelative };
}

// Shape-key influences for a definition (the Blender key names).
export function influencesOf(def) {
  const b = def.body, h = def.head, rh = b.armRootHeight;
  return {
    Taper: b.taper, UpperBroad: b.upperWidth, Boxy: 1 - b.roundness, Soft: b.softness, Curve: b.curve, Lean: b.lean, Shoulders: b.shoulderWidth,
    Root0: Math.max(0, 1 - rh * 2), Root1: 1 - Math.abs(rh - 0.5) * 2, Root2: Math.max(0, rh * 2 - 1), Ribs: b.ribs,
    Head: h.enabled ? h.size : 0, HeadWide: h.enabled ? h.width : 0, HeadLong: h.enabled ? h.length : 0,
  };
}

export class Shape {
  constructor(asset) {
    this.a = asset;
    this.pos = new Float32Array(asset.base.length);
    this.infl = {};
    this.scale = new THREE.Vector3(1, 1, 1);
    this.sockets = { L: { p: new THREE.Vector3(), n: new THREE.Vector3() }, R: { p: new THREE.Vector3(), n: new THREE.Vector3() } };
    this.top = 0.5; this.headTop = null;
    this.notes = [];
  }

  // Evaluate the morphs on the CPU (vertex positions in mesh space, before the scale).
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

  // Is the evaluated surface sound? Rings must keep a radius and keep stacking upward (no inverted or collapsed bands).
  sound() {
    const p = this.pos;
    for (let i = 1; i < NR; i++) {
      let cx = 0, cz = 0, cy = 0;
      for (let k = 0; k < SEG; k++) { const j = ((i - 1) * SEG + k) * 3; cx += p[j]; cy += p[j + 1]; cz += p[j + 2]; }
      cx /= SEG; cz /= SEG; cy /= SEG;
      let minR = 9;
      for (let k = 0; k < SEG; k++) { const j = ((i - 1) * SEG + k) * 3; minR = Math.min(minR, Math.hypot(p[j] - cx, p[j + 2] - cz)); }
      if (minR < 0.045 && i > 2 && i < NR - 2) return false;
      if (i > 1) { let py = 0; for (let k = 0; k < SEG; k++) py += p[((i - 2) * SEG + k) * 3 + 1]; if (cy < py / SEG - 1e-4) return false; }
    }
    return true;
  }

  // Lower-bound a world-space keep-out against the player's camera: nothing that could be seen while looking straight ahead.
  clearanceOk(s) {
    const p = this.pos, eye = CAMERA.eye;
    const tanDown = Math.tan(THREE.MathUtils.degToRad(44));                 // a few degrees below the lowest visible ray at a 78 degree FOV
    for (let i = 0; i < p.length; i += 3) {
      const y = HOVER + BASE_DROP + p[i + 1] * s.y, fwd = -p[i + 2] * s.z;
      if (y > eye - CAMERA.clearance + 0.001) return false;
      if (fwd > 0.02 && (eye - y) / fwd < tanDown) return false;
    }
    return true;
  }

  // Resolve a definition into a safe shape: keys that would fold the mesh are eased back, and the height is lowered if any part of the
  // body could enter the camera's view. Returns notes the editor shows in plain language.
  resolve(def) {
    const notes = [];
    const b = def.body;
    let infl = influencesOf(def);
    const raw = { ...infl };
    let k = 1;
    this.evaluate(infl);
    for (let it = 0; it < 16 && !this.sound(); it++) {
      k *= 0.88;
      for (const n of ['Taper', 'UpperBroad', 'Shoulders', 'Curve', 'Soft', 'Boxy', 'Lean']) infl[n] = raw[n] * k;
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

  // Surface point at height fraction t and angle phi (0 = the creature's right, pi/2 = forward) in group-local space.
  surface(t, phi, out, nrm) {
    const ring = THREE.MathUtils.clamp(Math.round(t * NR), 1, NR - 1);
    const k = Math.round((((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * SEG);
    this.vertex(ring, k, out);
    out.y += BASE_DROP;
    if (nrm) {
      const c = new THREE.Vector3(); this.ringCentre(ring, c);
      nrm.set(out.x - c.x, 0, out.z - c.z).normalize();
    }
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
    this.socketT = t;
    let top = -9;
    for (let i = 1; i < this.pos.length; i += 3) top = Math.max(top, this.pos[i] * this.scale.y);
    this.top = top + BASE_DROP;
    // head anchor: a point on the bulb at the front of the crown
    this.surface(0.9, Math.PI / 2, (this.headFront = this.headFront || new THREE.Vector3()), (this.headNormal = this.headNormal || new THREE.Vector3()));
  }
}

export const GRID = { NR, SEG, H, ARM_ANGLE, T_LOW, T_HIGH };
