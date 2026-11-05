import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Loads the Blender-authored alien hand (art/build_hand.py -> public/models/hand.glb): one continuous gel skin with morph targets,
// inner structures, and the weapon organ. Returns the nodes by name.
export async function loadHand() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/hand.glb');
  const nodes = {};
  gltf.scene.traverse((o) => { if (o.isMesh) nodes[o.name] = o; });
  for (const n of ['Hand', 'Core', 'PalmCore', 'Gland', 'Barrel', 'Maw', 'Tooth']) if (!nodes[n]) throw new Error('hand.glb is missing ' + n);
  // the survivor's redesigned arm and hand (art/build_hand2.py): same frame and same four shape keys, so the weapon organs and the code still fit
  try {
    const g2 = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/hand2.glb');
    let mesh = null; g2.scene.traverse((o) => { if (o.isMesh && o.name === 'Hand') mesh = o; });
    const d = mesh && mesh.morphTargetDictionary;
    let sk = null; g2.scene.traverse((o) => { if (o.isMesh && o.name === 'HandSuckers') sk = o; });
    if (mesh && d && d.Grip !== undefined && d.Weapon !== undefined && d.Spread !== undefined && d.Swell !== undefined) { nodes.Hand = mesh; if (sk && sk.morphTargetDictionary) nodes.HandSuckers = sk; }
  } catch (e) { /* the original hand stays */ }
  return nodes;
}

const gels = [];

// Shared by the skin and the suckers so they always move as one piece. In model space z runs from the elbow (+1.36) to the tip.
export const TENT = { tTime: { value: 0 }, tWave: { value: 0 }, tPump: { value: 2 }, tAim: { value: 0 }, tGain: { value: 1 } };
export const TENT_GLSL = `
  uniform float tTime, tWave, tPump, tAim, tGain;
  vec3 tentacleLive(vec3 p, vec3 n, out float band) {
    float side = determinant(mat3(modelMatrix)) >= 0.0 ? 1.0 : -1.0;     // the left arm is the right one mirrored
    float s = clamp((1.15 - p.z) / 1.9, 0.0, 1.0), a = s * s, ph = side * 1.7;
    if (side > 0.0) a *= 1.0 - tAim;                                     // the firing arm holds steady so the shots leave where you aim
    p.x += (sin(p.z * 4.2 + tWave * 1.35 + ph) * 0.03 + sin(p.z * 9.0 - tTime * 0.9 + ph) * 0.007) * a;
    p.y += sin(p.z * 3.4 - tWave * 1.05 + ph * 0.6) * 0.034 * a;
    float d = (s - tPump) / 0.05;
    band = side > 0.0 ? exp(-d * d) * tGain : 0.0;
    return p + n * 0.024 * band;
  }`;

// Smooth gel skin: view-dependent rim, a soft lambert term so the form reads, restrained inner glow. Morph-target aware.
export function makeHandGel({ color = 0x0b5a58, rim = 0x8ff5e6, alpha = 0.34 } = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) }, uAlpha: { value: alpha },
      uTime: { value: 0 }, uGlow: { value: 0 }, uHeat: { value: 0 }, ...TENT,
    },
    vertexShader: `
      #include <common>
      #include <morphtarget_pars_vertex>
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec2 vUv; varying float vBand;
      ${TENT_GLSL}
      void main(){
        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        float tb; vec3 rest = transformed; transformed = tentacleLive(transformed, objectNormal, tb); vBand = tb;
        vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
        vN = normalize(normalMatrix * objectNormal);
        vV = normalize(-mv.xyz);
        vP = transformed; vUv = uv;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uRim; uniform float uAlpha, uTime, uGlow, uHeat;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec2 vUv; varying float vBand;
      void main(){
        vec3 n = normalize(vN), v = normalize(vV);
        float f = pow(1.0 - abs(dot(n, v)), 2.4);
        vec3 L = normalize(vec3(0.35, 0.8, 0.5));
        float lam = max(dot(n, L), 0.0);
        float spec = pow(max(dot(reflect(-v, n), L), 0.0), 36.0);
        // slow pulse running along the limb (y is the limb axis in model space; -z in view after export)
        float flow = 0.5 + 0.5 * sin(vP.z * 18.0 + uTime * 1.6);
        vec3 c = uColor * (0.5 + 0.9 * lam) + uRim * f * 0.7 + vec3(spec * 0.55);
        c += uRim * (flow * 0.04 + uGlow * 0.1 + uHeat * 0.1 + vBand * 0.5);     // firing lights the muscle pulse, not the whole limb
        float a = clamp(uAlpha + f * 0.5 + spec * 0.4 + uGlow * 0.04 + uHeat * 0.04 + vBand * 0.1, 0.0, 0.9);
        gl_FragColor = vec4(pow(c, vec3(2.2)), a);
      }`,
  });
  gels.push(m);
  return m;
}

export function updateHandGels(t, glow, heat = 0) {
  for (const m of gels) { m.uniforms.uTime.value = t; m.uniforms.uGlow.value = glow; m.uniforms.uHeat.value = heat; }
}
