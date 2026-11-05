import * as THREE from 'three';

const N = 34;   // rings along a tongue
const M = 8;    // sides around it
const _t = new THREE.Vector3(), _n1 = new THREE.Vector3(), _n2 = new THREE.Vector3(), _ref = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// One butterfly-style tongue: a translucent gel proboscis that rests as a tight coil and uncurls as it reaches for a target.
// ext (0..1) is how far it has reached; uncoil (0..1) is how straight it is. Pulses are bulges of absorbed matter that travel
// from the tip back to the base.
export class Tongue {
  constructor(parent, material) {
    this.o = new THREE.Vector3();      // base (on the arm)
    this.t = new THREE.Vector3();      // tip target
    this.bow = new THREE.Vector3();    // sideways bend
    this.ext = 0; this.uncoil = 0; this.turns = 3; this.phase = Math.random() * 6; this.spin = 1;
    this.stuck = 0;                    // tip latched on (suction)
    this.pulses = [];                  // positions along the tongue, 1 = tip, 0 = base
    this.pts = Array.from({ length: N }, () => new THREE.Vector3());
    this.pos = new Float32Array(N * M * 3);
    this.col = new Float32Array(N * M * 3);
    const idx = [];
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < M; j++) {
      const a = i * M + j, b = i * M + ((j + 1) % M), c = (i + 1) * M + j, d = (i + 1) * M + ((j + 1) % M);
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  setVisible(v) { this.mesh.visible = v; }

  update(time) {
    const span = _a.subVectors(this.t, this.o);
    const len = span.length() || 1e-4;
    _t.copy(span).divideScalar(len);
    // frame for the sideways helix and bend
    _ref.set(0, 1, 0);
    if (Math.abs(_t.y) > 0.95) _ref.set(1, 0, 0);
    _n1.crossVectors(_t, _ref).normalize();
    _n2.crossVectors(_t, _n1).normalize();
    const ext = this.ext, un = this.uncoil, coil = 1 - un;
    const R = 0.085 * Math.pow(coil, 1.1);
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);
      const p = this.pts[i];
      // along the reach
      p.copy(this.o).addScaledVector(span, s * ext);
      // sideways bow while reaching, settling as it straightens
      const bow = Math.sin(Math.PI * s) * (0.16 + 0.1 * coil) * len * ext * (1 - 0.55 * this.stuck);
      p.addScaledVector(this.bow, bow);
      // butterfly coil: a helix around the reach that unwinds as the tongue straightens
      const th = Math.PI * 2 * this.turns * s + this.phase + time * 2.2 * this.spin * (0.4 + coil);
      const rr = R * (0.3 + 0.7 * s) * (0.35 + 0.65 * Math.min(1, ext * 3));
      p.addScaledVector(_n1, Math.cos(th) * rr).addScaledVector(_n2, Math.sin(th) * rr);
      // living wobble
      const w = Math.sin(time * 7 + s * 9 + this.phase) * 0.012 * ext * (0.4 + un) * Math.sin(Math.PI * s);
      p.addScaledVector(_n1, w).addScaledVector(_n2, w * 0.6);
    }
    // pulses of swallowed matter run from the tip to the base
    const rad = (s) => {
      let r = 0.04 - 0.024 * Math.pow(s, 0.8);
      r += 0.012 * smooth((s - 0.9) / 0.07) * (1 - 0.35 * this.stuck); // sucker bulb at the tip
      if (s > 0.97) r *= Math.sqrt(Math.max(0.01, 1 - ((s - 0.97) / 0.03) ** 2));    // closed and rounded, never an open tube end
      for (const sp of this.pulses) { const d = (s - sp) / 0.07; r *= 1 + 0.75 * Math.exp(-d * d); }
      return r;
    };
    for (let i = 0; i < N; i++) {
      const prev = this.pts[Math.max(0, i - 1)], next = this.pts[Math.min(N - 1, i + 1)];
      _b.subVectors(next, prev);
      if (_b.lengthSq() < 1e-10) _b.copy(_t);
      _b.normalize();
      _ref.set(0, 1, 0);
      if (Math.abs(_b.y) > 0.95) _ref.set(1, 0, 0);
      _c.crossVectors(_b, _ref).normalize();
      const n2 = _ref.crossVectors(_b, _c).normalize();
      const s = i / (N - 1), r = rad(s);
      let glow = 0;
      for (const sp of this.pulses) { const d = (s - sp) / 0.08; glow += Math.exp(-d * d); }
      glow = Math.min(1, glow);
      const base = this.pts[i];
      for (let j = 0; j < M; j++) {
        const a = (j / M) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), k = (i * M + j) * 3;
        this.pos[k] = base.x + (_c.x * ca + n2.x * sa) * r;
        this.pos[k + 1] = base.y + (_c.y * ca + n2.y * sa) * r;
        this.pos[k + 2] = base.z + (_c.z * ca + n2.z * sa) * r;
        // translucent teal skin, lightening toward the tip, flaring white-blue where matter passes
        // the same dark skin as the arms; only the swallowed matter travelling along it glows
        this.col[k] = 0.05 + 0.03 * s + 0.65 * glow;
        this.col[k + 1] = 0.1 + 0.08 * s + 0.85 * glow;
        this.col[k + 2] = 0.15 + 0.08 * s + 0.8 * glow;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  // world position of the point s along the tongue (for effects at the tip)
  point(s, out) { return out.copy(this.pts[Math.round(Math.min(1, Math.max(0, s)) * (N - 1))]); }
}

export function makeTongueMaterial() {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, emissive: 0x0b3a38, emissiveIntensity: 0.45,
    roughness: 0.3, metalness: 0, side: THREE.DoubleSide,
  });
  m.userData.noSnap = true;
  return m;
}
