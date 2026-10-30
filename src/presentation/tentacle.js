import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _bn = new THREE.Vector3();

// ------------------------------------------------------------------ gel material with suckers and pulsing chromatophores
const tentacleGels = [];

export function makeTentacleGel({ color = 0x0a4a46, rim = 0x7ff0e0, alpha = 0.5, length = 1, r0 = 0.1, r1 = 0.01, suckers = 1, veins = 1, side = THREE.FrontSide } = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side,
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) },
      uAlpha: { value: alpha }, uTime: { value: 0 }, uGlow: { value: 0 },
      uLen: { value: length }, uR0: { value: r0 }, uR1: { value: r1 }, uSucker: { value: suckers }, uVein: { value: veins },
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vUv = uv; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uRim; uniform float uAlpha, uTime, uGlow, uLen, uR0, uR1, uSucker, uVein;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float cup(vec2 uv, float cnt, float vOff, float stag, float r){
        float fu = fract(uv.x * cnt + stag) - 0.5;
        float vv = fract(uv.y - vOff + 0.5) - 0.5;
        vec2 d = vec2(fu * uLen / cnt, vv * 6.2832 * r);
        float sr = 0.40 * uLen / cnt * clamp(r / uR0 * 2.2, 0.35, 1.0);
        float dist = length(d);
        float ring = smoothstep(sr, sr * 0.82, dist) - smoothstep(sr * 0.66, sr * 0.4, dist);
        float hole = smoothstep(sr * 0.5, 0.0, dist);
        return ring * 0.9 - hole * 0.7;
      }
      float vein(vec2 uv){
        float a = sin(uv.y * 18.85 + sin(uv.x * 14.0 + uTime * 0.25) * 1.5 + uv.x * 9.0);
        float b = sin(uv.y * 31.4 - uv.x * 17.0 + sin(uv.x * 23.0) * 1.2);
        float c = sin(uv.y * 12.57 + uv.x * 6.0 - sin(uv.x * 9.0) * 2.0);
        return smoothstep(0.07, 0.0, abs(a)) + smoothstep(0.045, 0.0, abs(b)) * 0.6 + smoothstep(0.05, 0.0, abs(c)) * 0.5;
      }
      void main(){
        vec3 n = normalize(vN), v = normalize(vV);
        float f = pow(1.0 - abs(dot(n, v)), 2.2);
        float t = vUv.x;
        float r = mix(uR0, uR1, pow(t, 0.8));
        float cnt = max(5.0, uLen * 26.0);
        float s = 0.0;
        if (uSucker > 0.5) s = cup(vUv, cnt, 0.0, 0.0, r) + cup(vUv, cnt, 0.075, 0.5, r) * 0.9 + cup(vUv, cnt, -0.075, 0.5, r) * 0.9;
        float spots = step(0.9, hash(floor(vec2(vUv.x * 70.0, vUv.y * 16.0)))) * (0.4 + 0.6 * sin(uTime * 1.6 + hash(floor(vec2(vUv.x * 70.0, vUv.y * 16.0))) * 50.0));
        vec3 l = normalize(vec3(0.4, 0.8, 0.5));
        float spec = pow(max(dot(reflect(-v, n), l), 0.0), 32.0);
        float vn = uVein > 0.5 ? vein(vUv) * (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 2.2 - vUv.x * 7.0))) : 0.0;
        vec3 c = mix(uColor, uRim, f) + vec3(spec * 0.9) + uRim * (spots * 0.55 + uGlow * 0.5 + vn * 0.7);
        c = mix(c, c * 0.45, clamp(-s, 0.0, 1.0));
        c += uRim * clamp(s, 0.0, 1.0) * 0.35;
        float a = clamp(uAlpha + f * 0.45 + spec * 0.5 + s * 0.18 + spots * 0.25 + vn * 0.25 + uGlow * 0.2, 0.0, 0.95);
        gl_FragColor = vec4(pow(c, vec3(2.2)), a);
      }`,
  });
  tentacleGels.push(m);
  return m;
}

export function updateTentacleGels(t, glow) {
  for (const m of tentacleGels) { m.uniforms.uTime.value = t; m.uniforms.uGlow.value = glow; }
}

// ------------------------------------------------------------------ geometry
export class TentacleMesh {
  // radius(t): radius at fraction t along the length (0 = root, 1 = tip)
  constructor({ rings = 26, radial = 14, radius, material, upHint = new THREE.Vector3(0, -1, 0) }) {
    this.rings = rings; this.radial = radial; this.radius = radius; this.upHint = upHint.clone();
    const count = (rings + 1) * (radial + 1);
    this.pos = new Float32Array(count * 3);
    this.nor = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const idx = [];
    for (let i = 0; i <= rings; i++) {
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        uv[k * 2] = i / rings; uv[k * 2 + 1] = j / radial;
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.samples = Array.from({ length: rings + 1 }, () => new THREE.Vector3());
    this.nrm = new THREE.Vector3();
    this.twist = 0;
  }

  // pts: array of Vector3 control points (any count >= 2) describing the spine
  update(pts, scale = 1) {
    const R = this.rings, S = this.samples;
    const n = pts.length;
    for (let i = 0; i <= R; i++) catmull(pts, (i / R) * (n - 1), S[i]);
    // parallel transport frames
    _t.subVectors(S[1], S[0]).normalize();
    _n.copy(this.upHint).addScaledVector(_t, -this.upHint.dot(_t));
    if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0).addScaledVector(_t, -_t.x);
    _n.normalize();
    for (let i = 0; i <= R; i++) {
      const p = S[i];
      if (i > 0) {
        const prev = _a.copy(_t);
        const nx = S[Math.min(R, i + 1)], pv = S[i - 1];
        _t.subVectors(nx, pv).normalize();
        // rotate normal by the change in tangent
        _b.crossVectors(prev, _t);
        const s = _b.length();
        if (s > 1e-5) {
          _b.divideScalar(s);
          const ang = Math.asin(Math.min(1, s));
          _n.applyAxisAngle(_b, ang);
        }
        _n.addScaledVector(_t, -_n.dot(_t)).normalize();
      }
      _bn.crossVectors(_t, _n);
      const r = this.radius(i / R) * scale;
      const tw = this.twist * (i / R);
      for (let j = 0; j <= this.radial; j++) {
        const a = (j / this.radial) * Math.PI * 2 + tw;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nxv = _n.x * ca + _bn.x * sa, nyv = _n.y * ca + _bn.y * sa, nzv = _n.z * ca + _bn.z * sa;
        const k = (i * (this.radial + 1) + j) * 3;
        this.pos[k] = p.x + nxv * r; this.pos[k + 1] = p.y + nyv * r; this.pos[k + 2] = p.z + nzv * r;
        this.nor[k] = nxv; this.nor[k + 1] = nyv; this.nor[k + 2] = nzv;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}

// uniform Catmull-Rom through pts at parameter u in [0, n-1]
function catmull(pts, u, out) {
  const n = pts.length;
  const i = Math.min(n - 2, Math.floor(u)), f = u - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
  const f2 = f * f, f3 = f2 * f;
  out.x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * f + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * f2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * f3);
  out.y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * f + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * f2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * f3);
  out.z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * f + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * f2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * f3);
  return out;
}

export function bezier(p0, p1, p2, p3, t, out) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  out.x = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
  out.y = a * p0.y + b * p1.y + c * p2.y + d * p3.y;
  out.z = a * p0.z + b * p1.z + c * p2.z + d * p3.z;
  return out;
}

// Spring-damped follower chain: each joint chases its ideal position, softer toward the tip so the limb trails and whips.
export class SpringChain {
  constructor(n, kRoot = 420, kTip = 70, damp = 0.9) {
    this.n = n; this.p = Array.from({ length: n }, () => new THREE.Vector3()); this.v = Array.from({ length: n }, () => new THREE.Vector3());
    this.kRoot = kRoot; this.kTip = kTip; this.damp = damp; this.ready = false;
  }

  snap(ideal) { for (let i = 0; i < this.n; i++) { this.p[i].copy(ideal[i]); this.v[i].set(0, 0, 0); } this.ready = true; }

  step(ideal, dt) {
    if (!this.ready) { this.snap(ideal); return; }
    const sub = Math.max(1, Math.ceil(dt / 0.008)), h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < this.n; i++) {
        if (i === 0) { this.p[0].copy(ideal[0]); continue; }
        const k = this.kRoot + (this.kTip - this.kRoot) * (i / (this.n - 1));
        const c = 2 * Math.sqrt(k) * this.damp;
        const p = this.p[i], v = this.v[i], q = ideal[i];
        v.x += ((q.x - p.x) * k - v.x * c) * h; v.y += ((q.y - p.y) * k - v.y * c) * h; v.z += ((q.z - p.z) * k - v.z * c) * h;
        p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;
      }
    }
  }
}
