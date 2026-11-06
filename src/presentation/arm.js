import * as THREE from 'three';

// THE ARM. One thick, soft, round-tipped tube with cup suckers along the side that faces the player, built straight and bent in the
// vertex shader by integrating curvature along its length. So a curl is a real curl: it keeps its thickness, spirals tighter toward the
// tip like an octopus arm, and uncoils through every shape in between. Every pose (rest, weapon, reach, coil) is just a few numbers.
//
// The tube runs along -z: the elbow at z = +1.36, the tip at 1.36 - L0. s is 0 at the elbow and 1 at the tip.
export const L0 = 2.2;
const Z0 = 1.36;
const CURL_START = 0.35;
const STEPS = 12;

const radiusAt = (s) => {
  const r = 0.098 + (0.046 - 0.098) * Math.pow(s, 1.25);
  return s > 0.972 ? r * Math.sqrt(Math.max(0, 1 - ((s - 0.972) / 0.028) ** 2)) : r;       // a round end, never a point
};

export function buildTentacleGeometry() {
  // ---- skin: rings packed closer toward the tip, where it bends hardest
  const RINGS = 104, SIDES = 18, pos = [], nor = [], idx = [];
  const sAt = (i) => 1 - Math.pow(1 - i / (RINGS - 1), 1.3);
  for (let i = 0; i < RINGS; i++) {
    const s = sAt(i), r = radiusAt(s), slope = s > 0.972 ? 0.9 * (s - 0.972) / 0.028 : 0.03;
    for (let j = 0; j < SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      pos.push(ca * r, sa * r, Z0 - s * L0);
      const nl = Math.hypot(1, slope); nor.push(ca / nl, sa / nl, -slope / nl);
    }
  }
  const apex = pos.length / 3; pos.push(0, 0, Z0 - L0); nor.push(0, 0, -1);
  for (let i = 0; i < RINGS - 1; i++) for (let j = 0; j < SIDES; j++) {
    const a = i * SIDES + j, b = i * SIDES + (j + 1) % SIDES, c = (i + 1) * SIDES + j, d = (i + 1) * SIDES + (j + 1) % SIDES;
    idx.push(a, c, b, b, c, d);
  }
  for (let j = 0; j < SIDES; j++) idx.push((RINGS - 1) * SIDES + j, apex, (RINGS - 1) * SIDES + (j + 1) % SIDES);
  const skin = new THREE.BufferGeometry();
  skin.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  skin.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  skin.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  skin.setIndex(idx);

  // ---- suckers: two staggered rows of little cups, a raised rim around a hollow, shrinking toward the tip
  const P = [], N = [], I = [], SEG = 10, PROFILE = [[0, -0.16], [0.42, -0.1], [0.72, 0.3], [0.95, 0.36], [1.1, -0.1]];
  let row = 0;
  for (let s = 0.2; s < 0.955;) {
    const r = radiusAt(s), ang = row % 2 ? 0.56 : -0.56, q = r * 0.36;
    const ox = Math.sin(ang), oy = Math.cos(ang);         // "out": around the +y side of the tube
    const base = P.length / 3, cx = ox * r * 0.94, cy = oy * r * 0.94, cz = Z0 - s * L0;
    for (let k = 0; k < PROFILE.length; k++) for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2, rho = PROFILE[k][0] * q, h = PROFILE[k][1] * q, sx = Math.cos(a) * rho, sz = Math.sin(a) * rho;
      // tangent in the tube's cross-section, and along the tube
      P.push(cx + oy * sx + ox * h, cy - ox * sx + oy * h, cz + sz);
      const inner = PROFILE[k][0] < 0.7 ? -1 : 1, nx = Math.cos(a) * inner * 0.5, nz = Math.sin(a) * inner * 0.5;
      const nl = Math.hypot(nx, nz, 1); N.push((oy * nx + ox) / nl, (-ox * nx + oy) / nl, nz / nl);
    }
    for (let k = 0; k < PROFILE.length - 1; k++) for (let j = 0; j < SEG; j++) {
      const a = base + k * SEG + j, b = base + k * SEG + (j + 1) % SEG, c = base + (k + 1) * SEG + j, d = base + (k + 1) * SEG + (j + 1) % SEG;
      I.push(a, b, c, b, d, c);
    }
    for (let j = 1; j < SEG - 1; j++) I.push(base, base + j + 1, base + j);       // close the bottom of the cup
    s += (r * 0.72) / L0; row++;
  }
  const suckers = new THREE.BufferGeometry();
  suckers.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  suckers.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  suckers.setIndex(I);
  return { skin, suckers };
}

// ---------------------------------------------------------------- the bend
const POSE_GLSL = `
  uniform float tTime, uCurl, uSide, uBend, uLen, uThick, uMouth, uWave, uPhase, uPump, uGain;
  // walks along the arm from the elbow to s, turning as it goes: returns the point on the centre line and the frame there
  void tentacleFrame(float s, out vec3 c, out vec3 T, out vec3 N1, out vec3 N2) {
    float ds = s / ${STEPS}.0, pitch = 0.0, yaw = 0.0, ph = uPhase;
    c = vec3(0.0, 0.0, ${Z0.toFixed(2)});
    for (int i = 0; i < ${STEPS}; i++) {
      float u = (float(i) + 0.5) * ds, f = max(0.0, (u - ${CURL_START.toFixed(2)}) / ${(1 - CURL_START).toFixed(2)});
      pitch += (uBend + uCurl * 3.0 * f * f / ${(1 - CURL_START).toFixed(2)} + sin(u * 8.5 - tTime * 1.15 + ph) * uWave * u * 2.2) * ds;
      yaw += (uSide * 2.0 * u + sin(u * 6.5 + tTime * 0.83 + ph * 1.7) * uWave * u * 1.8) * ds;
      float cp = cos(pitch), sp = sin(pitch), cy = cos(yaw), sy = sin(yaw);
      c += vec3(sy * cp, sp, -cy * cp) * ds * ${L0.toFixed(2)} * uLen;
    }
    float cp = cos(pitch), sp = sin(pitch), cy = cos(yaw), sy = sin(yaw);
    T = vec3(sy * cp, sp, -cy * cp); N1 = vec3(-sy * sp, cp, cy * sp); N2 = vec3(cy, 0.0, sy);
  }
  float tentacleS(float z) {
    float s = clamp((${Z0.toFixed(2)} - z) / ${L0.toFixed(2)}, 0.0, 1.0);
    return s > 0.972 ? mix(s, 0.972 - (s - 0.972) * 5.0, uMouth) : s;     // armed: the round end folds inward into a soft mouth
  }
  vec3 tentacleNormal(vec3 p, vec3 n) {
    vec3 c, T, N1, N2; tentacleFrame(tentacleS(p.z), c, T, N1, N2);
    return normalize(N2 * n.x + N1 * n.y - T * n.z);
  }
  vec3 tentaclePoint(vec3 p, vec3 n, out float band) {
    float s0 = clamp((${Z0.toFixed(2)} - p.z) / ${L0.toFixed(2)}, 0.0, 1.0), s = tentacleS(p.z);
    vec3 c, T, N1, N2; tentacleFrame(s, c, T, N1, N2);
    float m = uThick * (1.0 + uMouth * 1.3 * smoothstep(0.62, 0.93, s0));
    float d = (s0 - uPump) / 0.05; band = exp(-d * d) * uGain;
    vec3 N = N2 * n.x + N1 * n.y - T * n.z;
    return c + (N2 * p.x + N1 * p.y) * m + N * 0.024 * band;
  }`;

// the same walk in JavaScript, so shots and tongues leave from where the arm really is
const _c = new THREE.Vector3();
export function tentaclePointJS(U, t, s, out) {
  const ds = s / STEPS; let pitch = 0, yaw = 0; const ph = U.uPhase.value, w = U.uWave.value;
  _c.set(0, 0, Z0);
  for (let i = 0; i < STEPS; i++) {
    const u = (i + 0.5) * ds, f = Math.max(0, (u - CURL_START) / (1 - CURL_START));
    pitch += (U.uBend.value + U.uCurl.value * 3 * f * f / (1 - CURL_START) + Math.sin(u * 8.5 - t * 1.15 + ph) * w * u * 2.2) * ds;
    yaw += (U.uSide.value * 2 * u + Math.sin(u * 6.5 + t * 0.83 + ph * 1.7) * w * u * 1.8) * ds;
    const cp = Math.cos(pitch);
    _c.x += Math.sin(yaw) * cp * ds * L0 * U.uLen.value; _c.y += Math.sin(pitch) * ds * L0 * U.uLen.value; _c.z += -Math.cos(yaw) * cp * ds * L0 * U.uLen.value;
  }
  return out.copy(_c);
}

export function makeArmUniforms(phase) {
  return { uCurl: { value: 3 }, uSide: { value: 0 }, uBend: { value: 0 }, uLen: { value: 1 }, uThick: { value: 1 }, uMouth: { value: 0 }, uWave: { value: 1 }, uPhase: { value: phase }, uPump: { value: 2 }, uGain: { value: 1 } };
}

// Skin shared across arms: colours and time. Each arm has its own pose numbers.
export function makeSharedSkin() {
  return { tTime: { value: 0 }, uColor: { value: new THREE.Color(0x0d1a29) }, uRim: { value: new THREE.Color(0x48dccb) }, uAlpha: { value: 0.97 }, uGlow: { value: 0 }, uMachine: { value: 0 }, uEnv: { value: new THREE.Color(1, 1, 1) }, uHeat: { value: 0 } };
}

export function makeSkinMaterial(shared, U) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: { ...shared, ...U },
    vertexShader: `
      ${POSE_GLSL}
      varying vec3 vN, vV; varying float vBand, vVent, vS, vAng;
      void main() {
        vAng = atan(position.y, position.x);
        float band; vec3 q = tentaclePoint(position, normal, band);
        vec4 mv = modelViewMatrix * vec4(q, 1.0);
        vN = normalize(normalMatrix * tentacleNormal(position, normal));
        vV = normalize(-mv.xyz); vBand = band;
        vVent = position.y / max(0.001, length(position.xy));         // +1 on the sucker side
        vS = clamp((${Z0.toFixed(2)} - position.z) / ${L0.toFixed(2)}, 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor, uRim, uEnv; uniform float uAlpha, uGlow, uHeat, tTime, uMachine;
      varying vec3 vN, vV; varying float vBand, vVent, vS, vAng;
      void main() {
        vec3 n = normalize(vN), v = normalize(vV);
        float ndv = abs(dot(n, v)), f = pow(1.0 - ndv, 1.7);
        vec3 L = normalize(vec3(0.35, 0.8, 0.5));
        float lam = clamp((dot(n, L) + 0.45) / 1.45, 0.0, 1.0);           // light wraps softly round the body
        float spec = pow(max(dot(reflect(-v, n), L), 0.0), 22.0);
        // paler on the sucker side and faint rings along the length, like skin
        float vent = smoothstep(0.1, 0.95, vVent), rings = 0.5 + 0.5 * sin(vS * 150.0);
        vec3 body = mix(uColor, uColor * 2.1 + vec3(0.03, 0.05, 0.06), vent) * (0.94 + 0.06 * rings);
        vec3 c = body * (0.55 + 0.95 * lam) + uRim * f * 0.3 + vec3(spec * 0.22);
        c *= uEnv;
        // what you have absorbed shows: dull plates and thin live seams creep up the arm from the tip, the more machines you have kept
        if (uMachine > 0.001) {
          float reach = smoothstep(1.02 - uMachine * 0.8, 1.0 - uMachine * 0.8 + 0.1, vS);
          float back = 1.0 - smoothstep(0.1, 0.5, vVent);
          float cells = abs(sin(vS * 46.0 + floor(vAng * 2.6) * 1.7)) * abs(sin(vAng * 5.0));
          float plate = smoothstep(0.12, 0.3, cells) * reach * back;
          float seam = (1.0 - smoothstep(0.02, 0.12, cells)) * reach * back;
          c = mix(c, vec3(0.2, 0.235, 0.27) * (0.4 + 1.0 * lam) * uEnv + vec3(spec * 0.5), plate * 0.72);
          c += uRim * seam * (0.75 + 0.25 * sin(tTime * 2.0 - vS * 9.0));
        }
        c += uRim * (uGlow * 0.08 + uHeat * 0.1 + vBand * 0.5);
        gl_FragColor = vec4(pow(c, vec3(2.2)), uAlpha);
      }`,
  });
}

export function makeSuckerMaterial(shared, U) {
  const m = new THREE.MeshStandardMaterial({ color: 0x3a4f64, roughness: 0.42, metalness: 0.02, emissive: 0x0a2a2c, emissiveIntensity: 0.6 });
  m.onBeforeCompile = function (shader) {
    THREE.Material.prototype.onBeforeCompile.call(this, shader);        // keeps the retro vertex snapping hook
    Object.assign(shader.uniforms, { tTime: shared.tTime }, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + POSE_GLSL)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal = tentacleNormal(position, objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  float tb; transformed = tentaclePoint(position, normal, tb);');
  };
  m.customProgramCacheKey = () => 'tentacle-suckers-v1';
  return m;
}
