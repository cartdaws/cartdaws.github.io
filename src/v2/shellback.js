import * as THREE from 'three';
import { Enemy } from '../game/enemies/enemy.js';
import { v2node } from './assets.js';

// It goes soft when it is absorbed: cracks open across it, it darkens and wets, and it sags and spreads as it empties.
function meltable(src, uMelt) {
  const m = src.clone();
  m.onBeforeCompile = function (shader) {
    THREE.Material.prototype.onBeforeCompile.call(this, shader);
    shader.uniforms.uMelt = uMelt;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uMelt; varying vec3 vMeltP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vMeltP = position;
        { float n = sin(position.x * 23.0 + position.z * 19.0) * sin(position.z * 31.0 - position.x * 13.0);
          float low = 1.0 - smoothstep(0.0, 0.5, position.y);
          transformed.y *= 1.0 - 0.72 * uMelt; transformed.xz *= 1.0 + 0.2 * uMelt * low; transformed += normal * (-0.07 * uMelt * (0.5 + 0.5 * n)); }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uMelt; varying vec3 vMeltP;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        { float c = abs(sin(vMeltP.x * 17.0 + sin(vMeltP.z * 11.0) * 2.2)) * abs(sin(vMeltP.z * 15.0 + sin(vMeltP.x * 13.0) * 2.0));
          float crack = (1.0 - smoothstep(0.0, 0.03 + 0.1 * uMelt, c)) * smoothstep(0.02, 0.2, uMelt);
          gl_FragColor.rgb *= (1.0 - 0.55 * uMelt) * (1.0 - 0.92 * crack); }`);
  };
  m.customProgramCacheKey = () => 'v2-melt-' + (m.map ? 'm' : '') + (m.normalMap ? 'n' : '');
  return m;
}

// A slow, harmless grazer. It cannot be shot and it does not fight. Walk up and absorb it: this is how the body learns what it can do.
export class Shellback extends Enemy {
  constructor(game, x, z) {
    super(game, x, 0, z);
    this.kind = 'creature'; this.organic = true; this.sourceId = 'shellback'; this.heal = 26; this.radius = 0.7;
    this.home = [x, z]; this.goal = null; this.wait = Math.random() * 2; this.t = Math.random() * 9; this.yaw = Math.random() * 6.28;
    this.hitSpheres = [{ c: new THREE.Vector3(x, 0.35, z), r: 0.62 }]; this.uMelt = { value: 0 };
    const G = this.body = new THREE.Group(); this.group.add(G);
    const add = (n, parent = G) => { const s = v2node(n), m = new THREE.Mesh(s.geometry, meltable(s.material, this.uMelt)); m.castShadow = true; parent.add(m); return m; };
    const shellMat = meltable(v2node('Shell').material, this.uMelt); shellMat.emissive = new THREE.Color(0, 0, 0); this.trackFlash(shellMat);
    this.shell = add('Shell'); this.shell.material = shellMat; add('ShellFoot'); add('ShellPores');
    this.stalks = [['ShellStalkL', -0.1], ['ShellStalkR', 0.1]].map(([n, x0]) => { const p = new THREE.Group(); p.position.set(x0, 0.13, -1.0); G.add(p); add(n, p); add(n + 'Eye', p); return p; });
    this.group.rotation.y = this.yaw;
    this.group.scale.setScalar(this.baseScale = 0.82 + Math.random() * 0.25);
    this.active = true;
  }
  get absorbable() { return this.alive && !this.absorbing; }
  get weak() { return false; }
  update(dt) {
    this.t += dt; const t = this.t, g = this.game, p = g.player.pos;
    let moving = 0;
    const dx = this.pos.x - p.x, dz = this.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d < 3 && !this.goal) { const l = d || 1; this.goal = [this.pos.x + (dx / l) * 2.5, this.pos.z + (dz / l) * 2.5]; }   // it edges away from you, not very fast
    this.wait -= dt;
    if (!this.goal && this.wait <= 0) { const a = Math.random() * 6.28, r = Math.random() * 2.4; this.goal = [this.home[0] + Math.cos(a) * r, this.home[1] + Math.sin(a) * r]; }
    if (this.goal) {
      const gx = this.goal[0] - this.pos.x, gz = this.goal[1] - this.pos.z, l = Math.hypot(gx, gz);
      if (l < 0.25 || g.world.blocked(this.pos.x, 0.4, this.pos.z, this.pos.x + (gx / l), 0.4, this.pos.z + (gz / l))) { this.goal = null; this.wait = 1 + Math.random() * 3; }
      else {
        const want = Math.atan2(-gx, -gz); let da = want - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); this.yaw += da * Math.min(1, dt * 1.6);
        if (Math.abs(da) < 0.7) { this.pos.x += (gx / l) * 0.42 * dt; this.pos.z += (gz / l) * 0.42 * dt; moving = 1; }
      }
    }
    this.group.rotation.y = this.yaw;
    // it moves the way a snail does: a wave down the foot, the shell rocking on top of it
    this.shell.rotation.x = Math.sin(t * 1.9) * 0.022 * (0.3 + moving); this.shell.rotation.z = Math.sin(t * 1.3) * 0.018; this.shell.position.y = 0.012 * Math.sin(t * 1.9) * moving;
    this.body.scale.set(1 + 0.018 * Math.sin(t * 1.9) * moving, 1, 1 - 0.03 * Math.sin(t * 1.9) * moving);
    for (const [i, s] of this.stalks.entries()) { s.rotation.x = Math.sin(t * 0.8 + i) * 0.22 + (d < 4 ? -0.3 : 0); s.rotation.y = Math.sin(t * 0.53 + i * 2) * 0.35; }
    this.hitSpheres[0].c.set(this.pos.x, this.pos.y + 0.38 * this.group.scale.y, this.pos.z);
  }
}
