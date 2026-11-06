import * as THREE from 'three';
import { POSE_GLSL, Z0, L0 } from '../presentation/arm.js';

// The arm's skin. An ordinary living animal first: mottled plum on the back, pale on the underside, wet. Mutations raise bruised flesh and veins around themselves as they spread.
export function makeV2Skin(shared, U, own) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: true,
    uniforms: { ...shared, ...U, ...own },
    vertexShader: `
      ${POSE_GLSL}
      varying vec3 vN, vV, vP; varying float vBand, vVent, vS;
      void main() {
        float band; vec3 q = tentaclePoint(position, normal, band);
        vec4 mv = modelViewMatrix * vec4(q, 1.0);
        vN = normalize(normalMatrix * tentacleNormal(position, normal));
        vV = normalize(-mv.xyz); vBand = band; vP = position;
        vVent = position.y / max(0.001, length(position.xy));
        vS = clamp((${Z0.toFixed(2)} - position.z) / ${L0.toFixed(2)}, 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uRim, uEnv; uniform float uAlpha, uGlow, uHeat, tTime, uFront, uInfect, uWound;
      varying vec3 vN, vV, vP; varying float vBand, vVent, vS;
      float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main() {
        vec3 n = normalize(vN), v = normalize(vV);
        float f = pow(1.0 - abs(dot(n, v)), 2.4);
        vec3 L = normalize(vec3(0.35, 0.8, 0.5));
        float lam = clamp((dot(n, L) + 0.5) / 1.5, 0.0, 1.0);
        float spec = pow(max(dot(reflect(-v, n), L), 0.0), 34.0) * 0.5 + pow(max(dot(reflect(-v, n), L), 0.0), 7.0) * 0.08;
        // chromatophore mottling: blotches and fine speckle, like a real octopus at rest
        vec3 q = vP * vec3(24.0, 24.0, 8.0);
        float m = n3(q) * 0.62 + n3(q * 2.9 + 3.1) * 0.28 + n3(q * 7.3) * 0.1;
        float blotch = smoothstep(0.5, 0.66, m), speck = smoothstep(0.62, 0.74, n3(vP * vec3(150.0, 150.0, 60.0)));
        vec3 back = mix(vec3(0.2, 0.155, 0.17), vec3(0.09, 0.07, 0.08), blotch);
        back = mix(back, vec3(0.055, 0.045, 0.05), speck * 0.5);
        vec3 belly = vec3(0.36, 0.3, 0.31) * (0.92 + 0.1 * m);
        vec3 body = mix(back, belly, smoothstep(0.05, 0.85, vVent));
        // around a mutation: bruised, thickened flesh, and veins carrying whatever it is
        float zone = smoothstep(uFront - 0.16, uFront + 0.03, vS) * uInfect;
        body = mix(body, body * vec3(0.78, 0.66, 0.68), zone);
        float vein = (1.0 - smoothstep(0.0, 0.035, abs(n3(vP * vec3(34.0, 34.0, 9.0)) - 0.5))) * zone * (1.0 - smoothstep(0.1, 0.9, vVent));
        vec3 c = body * (0.5 + 1.0 * lam) * uEnv + vec3(0.42, 0.32, 0.36) * f * 0.26 * uEnv + vec3(spec * 0.34);
        c += uRim * vein * 0.42;
        // the edge of the growth, while it is growing: raw
        float d = (vS - uFront) / 0.035; c += vec3(1.0, 0.34, 0.2) * exp(-d * d) * uWound;
        c += uRim * (uGlow * 0.05 + uHeat * 0.1 + vBand * 0.32);
        gl_FragColor = vec4(pow(max(c, vec3(0.0)), vec3(2.2)), uAlpha);
      }`,
  });
}

// Any Blender mesh authored along the straight arm, drawn with its own material and bent with the arm. uFront is how far it has spread: anything behind the front stays inside the flesh.
export function makeGrowthMaterial(src, shared, U, front) {
  const m = src.clone();
  m.onBeforeCompile = function (shader) {
    THREE.Material.prototype.onBeforeCompile.call(this, shader);      // keeps the retro vertex snapping hook
    Object.assign(shader.uniforms, { tTime: shared.tTime, uFront: front }, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + POSE_GLSL + '\nuniform float uFront;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal = tentacleNormal(position, objectNormal);')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float tb, gs = clamp((${Z0.toFixed(2)} - position.z) / ${L0.toFixed(2)}, 0.0, 1.0), gk = smoothstep(uFront, uFront + 0.09, gs);
        transformed = tentaclePoint(vec3(position.xy * gk, position.z), normal, tb);`);
  };
  m.customProgramCacheKey = () => 'v2-growth-' + (m.map ? 'm' : '') + (m.normalMap ? 'n' : '');
  return m;
}
