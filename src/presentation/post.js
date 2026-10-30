import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setRetroTextures } from '../world/materials.js';

// Shared uniforms read by every material (vertex snapping for the retro look).
export const snap = { uSnap: { value: 0 }, uSnapRes: { value: new THREE.Vector2(320, 180) } };

// Patch all materials once: optional vertex snapping to a low-res grid.
THREE.Material.prototype.onBeforeCompile = function (shader) {
  shader.uniforms.uSnap = snap.uSnap;
  shader.uniforms.uSnapRes = snap.uSnapRes;
  shader.uniforms.uSnapOn = { value: this.userData.noSnap ? 0 : 1 };
  if (!shader.vertexShader.includes('#include <project_vertex>')) return;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uSnap; uniform float uSnapOn; uniform vec2 uSnapRes;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      if (uSnap > 0.5 && uSnapOn > 0.5 && gl_Position.w > 1.0) { vec2 g = uSnapRes * 0.5; gl_Position.xy = floor(gl_Position.xy / gl_Position.w * g + 0.5) / g * gl_Position.w; }`);
};

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uMode: { value: 0 }, uHurt: { value: 0 }, uPulse: { value: 0 }, uHit: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uMode; uniform float uHurt; uniform float uPulse; uniform float uHit; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r = dot(d, d);
      vec2 off = d * (r * 0.014 + uHit * 0.02 + uHurt * uPulse * 0.012) * (1.0 - uMode);
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 0.82 - 0.55 * uHurt);   // desaturated, more so when hurt
      c *= vec3(0.96, 1.0, 1.03);                 // cold cast
      c *= 1.0 - smoothstep(0.18 - 0.12 * uHurt, 0.62, r) * (0.75 + 0.2 * uHurt);
      float edge = smoothstep(0.08, 0.5, r);
      c += vec3(0.55, 0.02, 0.0) * edge * (uHit * 0.55 + uHurt * uPulse * 0.6);
      c *= 1.0 - uHit * 0.25;
      c += (hash(vUv * 900.0) - 0.5) * 0.016 * (1.0 - uMode); // film grain
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

const RetroShader = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(320, 180) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; varying vec2 vUv;
    float bayer(vec2 p){
      int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)); int i = x + y * 4;
      float m[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
      return m[i] / 16.0 - 0.5;
    }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c += bayer(floor(vUv * uRes)) / 24.0;
      c = floor(c * 31.0 + 0.5) / 31.0;          // 15-bit colour
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, viewScene, camera) {
    this.renderer = renderer;
    this.mode = 'realistic';
    this.scene = scene; this.viewScene = viewScene; this.camera = camera;
    // Some GPUs (many phones) cannot render to float targets; without them the composer shows black. Fall back to direct rendering.
    const gl2 = renderer.capabilities.isWebGL2;
    this.direct = !(gl2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')));
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    const vm = new RenderPass(viewScene, camera);
    vm.clear = false;
    vm.clearDepth = true;
    this.composer.addPass(vm);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.12, 0.4, 1.0);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.retro = new ShaderPass(RetroShader);
    this.retro.enabled = false;
    this.composer.addPass(this.retro);
  }

  setMode(mode, scene) {
    this.mode = mode;
    const retro = mode === 'retro';
    this.bloom.enabled = !retro;
    this.retro.enabled = retro;
    this.grade.uniforms.uMode.value = retro ? 1 : 0;
    snap.uSnap.value = retro ? 1 : 0;
    setRetroTextures(retro);
    document.body.classList.toggle('retro', retro);
    if (scene) scene.fog.density = retro ? 0.03 : 0.016;
  }

  resize(w, h) {
    const retro = this.mode === 'retro';
    const ratio = retro ? Math.min(1, 270 / h) : Math.min(window.devicePixelRatio, document.body.classList.contains('touch') ? 1.25 : 2);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    snap.uSnapRes.value.set(w * ratio, h * ratio);
    this.retro.uniforms.uRes.value.set(w * ratio, h * ratio);
  }

  render(dt, t) {
    if (this.direct) {
      const r = this.renderer;
      r.autoClear = false; r.clear();
      r.render(this.scene, this.camera);
      r.clearDepth();
      r.render(this.viewScene, this.camera);
      return;
    }
    this.grade.uniforms.uTime.value = t % 10;
    this.composer.render(dt);
  }
}
