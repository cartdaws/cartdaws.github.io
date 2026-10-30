import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Loads the Blender-authored alien hand (art/build_hand.py -> public/models/hand.glb): one continuous gel skin with morph targets,
// inner structures, and the weapon organ. Returns the nodes by name.
export async function loadHand() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/hand.glb');
  const nodes = {};
  gltf.scene.traverse((o) => { if (o.isMesh) nodes[o.name] = o; });
  for (const n of ['Hand', 'Core', 'PalmCore', 'Gland', 'Barrel', 'Maw', 'Tooth']) if (!nodes[n]) throw new Error('hand.glb is missing ' + n);
  return nodes;
}

const gels = [];

// Smooth gel skin: view-dependent rim, a soft lambert term so the form reads, restrained inner glow. Morph-target aware.
export function makeHandGel({ color = 0x0b5a58, rim = 0x8ff5e6, alpha = 0.34 } = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) }, uAlpha: { value: alpha },
      uTime: { value: 0 }, uGlow: { value: 0 }, uHeat: { value: 0 },
    },
    vertexShader: `
      #include <common>
      #include <morphtarget_pars_vertex>
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec2 vUv;
      void main(){
        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
        vN = normalize(normalMatrix * objectNormal);
        vV = normalize(-mv.xyz);
        vP = transformed; vUv = uv;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uRim; uniform float uAlpha, uTime, uGlow, uHeat;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec2 vUv;
      void main(){
        vec3 n = normalize(vN), v = normalize(vV);
        float f = pow(1.0 - abs(dot(n, v)), 2.4);
        vec3 L = normalize(vec3(0.35, 0.8, 0.5));
        float lam = max(dot(n, L), 0.0);
        float spec = pow(max(dot(reflect(-v, n), L), 0.0), 36.0);
        // slow pulse running along the limb (y is the limb axis in model space; -z in view after export)
        float flow = 0.5 + 0.5 * sin(vP.z * 18.0 + uTime * 1.6);
        vec3 c = uColor * (0.5 + 0.9 * lam) + uRim * f * 0.7 + vec3(spec * 0.55);
        c += uRim * (flow * 0.04 + uGlow * 0.5 + uHeat * 0.25);
        float a = clamp(uAlpha + f * 0.5 + spec * 0.4 + uGlow * 0.2 + uHeat * 0.12, 0.0, 0.9);
        gl_FragColor = vec4(pow(c, vec3(2.2)), a);
      }`,
  });
  gels.push(m);
  return m;
}

export function updateHandGels(t, glow, heat = 0) {
  for (const m of gels) { m.uniforms.uTime.value = t; m.uniforms.uGlow.value = glow; m.uniforms.uHeat.value = heat; }
}
