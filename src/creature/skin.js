import * as THREE from 'three';

// One gel shader for the whole creature: body, hands, tentacles and the weapon organ all use it, so a colour, pattern or glow chosen in the
// creator reads identically everywhere. It understands morph targets and skinning (the includes below), so the same material works on the
// shape-keyed body, the morphing hand and the skinned tentacles.
const skins = [];

const PATTERN = { none: 0, bands: 1, spots: 2, stripes: 3, veins: 4 };

export function skinParams(def, role = 'body') {
  const s = def.skin;
  const alpha = s.translucency - (role === 'weapon' ? 0.08 : 0) + (role === 'tentacle' ? 0.28 : 0);
  const isT = role === 'tentacle';
  return {
    color: isT ? def.tentacles.color : s.primary,
    color2: isT ? def.tentacles.color : s.secondary,
    mark: s.marking,
    rim: isT ? def.tentacles.glow : s.glow,
    glowColor: isT ? def.tentacles.glow : s.glow,
    alpha: Math.min(0.92, alpha),
    gradient: isT ? 0.25 : s.gradient,
    pattern: isT ? 'none' : s.pattern,
    patternScale: s.patternScale,
    rough: s.roughness,
    ridge: s.ridge,
    glow: s.glowIntensity,
    role,
  };
}

export function makeSkin(p = {}) {
  p = { color: '#0d6560', color2: '#2fb89a', mark: '#b8fff4', rim: '#7fe8da', glowColor: '#6ff0e0', alpha: 0.58, gradient: 0, pattern: 'none', patternScale: 1, rough: 0.3, ridge: 0.2, glow: 0.3, ...p };
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      uColor: { value: new THREE.Color(p.color) }, uColor2: { value: new THREE.Color(p.color2) }, uMark: { value: new THREE.Color(p.mark) },
      uRim: { value: new THREE.Color(p.rim) }, uGlowCol: { value: new THREE.Color(p.glowColor) },
      uAlpha: { value: p.alpha }, uGrad: { value: p.gradient }, uPattern: { value: PATTERN[p.pattern] || 0 }, uPScale: { value: p.patternScale },
      uRough: { value: p.rough }, uRidge: { value: p.ridge }, uBase: { value: p.glow },
      uTime: { value: 0 }, uGlow: { value: 0 }, uHeat: { value: 0 }, uAxis: { value: 1 }, uLimb: { value: p.role === 'body' ? 0 : 1 },
      uThick: { value: 1 }, uTaper: { value: 0 }, uSeg: { value: 0 },
    },
    vertexShader: `
      #include <common>
      #include <morphtarget_pars_vertex>
      #include <skinning_pars_vertex>
      uniform float uThick, uTaper, uSeg;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec2 vUv;
      void main(){
        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        // tentacle girth: thickness and taper are applied to the rest shape (chain along -z, 1.2 m) before skinning
        #ifdef USE_SKINNING
          float s = clamp(-position.z / 1.2, 0.0, 1.0);
          float g = uThick * (1.0 - uTaper * 0.55 * s) ;
          transformed.xy *= g;
        #endif
        // segmented limb: vertebra-like rings along the forearm, a thick collar at the wrist, a slimmer neck behind the claw
        #ifndef USE_SKINNING
          if (uSeg > 0.0) {
            float k = smoothstep(0.05, 0.32, position.z);
            float ring = sin(position.z * 22.0) * 0.5;
            float collar = exp(-pow((position.z - 0.115) / 0.05, 2.0));
            transformed.xy *= 1.0 + uSeg * (k * ring * 0.2 + 0.2 * collar);
          }
        #endif
        #include <skinning_vertex>
        vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
        vN = normalize(normalMatrix * objectNormal);
        vV = normalize(-mv.xyz);
        vP = transformed; vUv = uv;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor, uColor2, uMark, uRim, uGlowCol; uniform float uAlpha, uGrad, uPScale, uRough, uRidge, uBase, uTime, uGlow, uHeat, uLimb, uSeg; uniform int uPattern;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec2 vUv;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec3 n = normalize(vN), v = normalize(vV);
        float along = uLimb > 0.5 ? vUv.y : vUv.y;
        // fine surface ridges: shading only, no geometry
        float rid = sin(vUv.y * 140.0 + vn(vUv * 9.0) * 3.0) * 0.5 + 0.5;
        n = normalize(n + (uRidge * 0.28 * (rid - 0.5)) * normalize(cross(n, vec3(0.0, 1.0, 0.2)) + 1e-4));
        float f = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), 2.4);
        vec3 L = normalize(vec3(0.35, 0.8, 0.5));
        float lam = max(dot(n, L), 0.0);
        float sp = mix(70.0, 7.0, uRough);
        float spec = pow(max(dot(reflect(-v, n), L), 0.0), sp) * mix(0.8, 0.12, uRough);
        // colour: base to secondary along the form, then the marking pattern on top
        float gm = smoothstep(0.0, 1.0, clamp(along, 0.0, 1.0));
        vec3 base = mix(uColor, uColor2, gm * uGrad);
        float pat = 0.0;
        vec2 q = vUv * vec2(12.0, 5.0) * uPScale;
        if (uPattern == 1) pat = smoothstep(0.35, 0.5, abs(sin(vUv.y * 16.0 * uPScale)));
        else if (uPattern == 2) { vec2 id = floor(q * vec2(1.0, 1.3)); vec2 fq = fract(q * vec2(1.0, 1.3)) - 0.5; float r = 0.16 + 0.2 * h21(id); pat = (h21(id + 7.0) > 0.45 ? 1.0 : 0.0) * (1.0 - smoothstep(r - 0.05, r, length(fq))); }
        else if (uPattern == 3) pat = smoothstep(0.45, 0.6, abs(sin(vUv.x * 6.2831 * 6.0 * uPScale + vn(vUv * 6.0) * 1.6)));
        else if (uPattern == 4) { float w = abs(vn(q * 0.8 + vn(q * 1.7) * 1.5) - 0.5); pat = 1.0 - smoothstep(0.0, 0.07, w); }
        float segS = abs(sin(vP.z * 40.0));
        float groove = uSeg > 0.0 ? (1.0 - smoothstep(0.0, 0.42, segS)) * smoothstep(0.05, 0.3, vP.z) : 0.0;
        float edgeL = uSeg > 0.0 ? smoothstep(0.55, 0.85, segS) * (1.0 - smoothstep(0.85, 1.0, segS)) * smoothstep(0.05, 0.3, vP.z) : 0.0;
        float collarBand = uSeg > 0.0 ? exp(-pow((vP.z - 0.115) / 0.05, 2.0)) : 0.0;
        vec3 c = base * (0.45 + 0.75 * lam) * (1.0 - 0.62 * groove * min(uSeg, 1.0)) + uRim * f * 0.6 + vec3(spec) * (1.0 + 1.2 * collarBand);
        c += uRim * (collarBand * 0.18 + edgeL * 0.22) * min(uSeg, 1.0);
        c = mix(c, uMark * (0.4 + 0.35 * lam), pat * 0.8);
        // inner light: strongest where the skin is thick toward the viewer, patchy rather than uniform
        float inner = (0.35 + 0.65 * vn(vUv * vec2(7.0, 4.0) + 3.0)) * (1.0 - f);
        float flow = 0.5 + 0.5 * sin(vP.z * 18.0 + uTime * 1.6);
        c += uGlowCol * (uBase * inner * 0.3 + flow * 0.03 * uBase + uGlow * 0.5 + uHeat * 0.25);
        float a = clamp(uAlpha + pat * 0.2 + f * 0.5 + spec * 0.4 + uGlow * 0.2 + uHeat * 0.12, 0.0, 0.94);
        gl_FragColor = vec4(pow(c, vec3(2.2)), a);
      }`,
  });
  skins.push(m);
  return m;
}

// Same driver the old gel used: time for the slow pulse, glow for discharge/overload, heat for the experiment overload.
export function updateSkins(t, glow, heat = 0) {
  for (const m of skins) { m.uniforms.uTime.value = t; m.uniforms.uGlow.value = glow; m.uniforms.uHeat.value = heat; }
}

// Apply a (possibly new) definition to an existing material in place, so live editing never recompiles shaders.
export function restyle(m, def, role) {
  const p = skinParams(def, role), u = m.uniforms;
  u.uColor.value.set(p.color); u.uColor2.value.set(p.color2); u.uMark.value.set(p.mark); u.uRim.value.set(p.rim); u.uGlowCol.value.set(p.glowColor);
  u.uAlpha.value = p.alpha; u.uGrad.value = p.gradient; u.uPattern.value = PATTERN[p.pattern] || 0; u.uPScale.value = p.patternScale;
  u.uRough.value = p.rough; u.uRidge.value = p.ridge; u.uBase.value = p.glow;
  if (role === 'tentacle') { u.uThick.value = def.tentacles.thickness; u.uTaper.value = def.tentacles.taper; }
}
