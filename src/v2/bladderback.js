import * as THREE from 'three';
import { Enemy } from '../game/enemies/enemy.js';
import { v2node } from './assets.js';
import { meltable } from './shellback.js';

// A second harmless grazer: a soft fat thing carrying its stomach on the outside, in swollen sacs that pulse with its breathing. It cannot be shot and it does not fight. Absorbing it is how the body learns to make acid.
export class Bladderback extends Enemy {
  constructor(game, x, z) {
    super(game, x, 0, z);
    this.kind = 'creature'; this.organic = true; this.sourceId = 'bladder'; this.heal = 26; this.radius = 0.65;
    this.home = [x, z]; this.goal = null; this.wait = Math.random() * 2; this.t = Math.random() * 9; this.yaw = Math.random() * 6.28;
    this.hitSpheres = [{ c: new THREE.Vector3(x, 0.46, z), r: 0.6 }]; this.uMelt = { value: 0 };
    const G = this.body = new THREE.Group(); this.group.add(G);
    const add = (n, parent = G) => { const s = v2node(n), m = new THREE.Mesh(s.geometry, meltable(s.material, this.uMelt)); m.castShadow = true; parent.add(m); return m; };
    this.shell = add('Bladder'); this.trackFlash(this.shell.material); add('BladderFoot');
    this.sacs = new THREE.Group(); G.add(this.sacs); add('BladderSacs', this.sacs); add('BladderDucts', this.sacs); this.sacs.position.y = 0.42; for (const c of this.sacs.children) c.position.y = -0.42;
    this.group.rotation.y = this.yaw;
    this.group.scale.setScalar(this.baseScale = 0.86 + Math.random() * 0.2);
    this.active = true;
  }
  get absorbable() { return this.alive && !this.absorbing; }
  get weak() { return false; }
  update(dt) {
    this.t += dt; const t = this.t, g = this.game, p = g.player.pos; let moving = 0;
    const dx = this.pos.x - p.x, dz = this.pos.z - p.z, d = Math.hypot(dx, dz);
    this.wait -= dt;
    if (d < 3 && !this.goal) { const l = d || 1; this.goal = [this.pos.x + (dx / l) * 2, this.pos.z + (dz / l) * 2]; }
    if (!this.goal && this.wait <= 0) { const a = Math.random() * 6.28, r = Math.random() * 2; this.goal = [this.home[0] + Math.cos(a) * r, this.home[1] + Math.sin(a) * r]; }
    if (this.goal) {
      const gx = this.goal[0] - this.pos.x, gz = this.goal[1] - this.pos.z, l = Math.hypot(gx, gz);
      if (l < 0.25 || g.world.blocked(this.pos.x, 0.4, this.pos.z, this.pos.x + gx / l, 0.4, this.pos.z + gz / l)) { this.goal = null; this.wait = 1 + Math.random() * 3; }
      else {
        const want = Math.atan2(-gx, -gz); let da = want - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); this.yaw += da * Math.min(1, dt * 1.4);
        if (Math.abs(da) < 0.8) { this.pos.x += (gx / l) * 0.34 * dt; this.pos.z += (gz / l) * 0.34 * dt; moving = 1; }
      }
    }
    this.group.rotation.y = this.yaw;
    const b = Math.sin(t * 1.6), w = Math.sin(t * 2.4) * moving;
    this.sacs.scale.set(1 + 0.05 * b, 1 + 0.07 * b, 1 + 0.05 * b);
    this.body.scale.set(1 + 0.02 * w, 1 - 0.02 * w, 1 - 0.015 * w);
    this.hitSpheres[0].c.set(this.pos.x, this.pos.y + 0.46 * this.group.scale.y, this.pos.z);
  }
}
