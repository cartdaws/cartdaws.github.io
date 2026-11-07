import * as THREE from 'three';
import { Enemy } from '../game/enemies/enemy.js';
import { v2node } from './assets.js';

// A service crawler: a tracked maintenance machine that trundles about the ship. It is harmless, it cannot be shot, and it edges away from you. Walk up and absorb it:
// this is how the body learns the Piston Ram. It is a machine, so it comes apart part by part when it is taken.
const PARTS = ['CrawlChassis', 'CrawlPlate', 'CrawlTreadL', 'CrawlTreadR', 'CrawlWheelsL', 'CrawlWheelsR', 'CrawlBrush', 'CrawlBin', 'CrawlLamp'];

export class Crawler extends Enemy {
  constructor(game, x, z) {
    super(game, x, 0, z);
    this.kind = 'creature'; this.organic = false; this.sourceId = 'crawler'; this.heal = 34; this.radius = 0.7;
    this.home = [x, z]; this.goal = null; this.wait = Math.random() * 2; this.t = Math.random() * 9; this.yaw = Math.random() * 6.28;
    this.hitSpheres = [{ c: new THREE.Vector3(x, 0.4, z), r: 0.66 }];
    const G = this.body = new THREE.Group(); this.group.add(G);
    const mats = new Map();
    const add = (n, parent = G) => {
      const s = v2node(n); if (!s) return null;
      let mat = mats.get(s.material); if (!mat) { mat = s.material.clone(); mats.set(s.material, mat); if (mat.emissiveIntensity === undefined || mat.emissive.getHex() === 0) this.trackFlash(mat); }
      const m = new THREE.Mesh(s.geometry, mat); m.castShadow = true; parent.add(m); return m;
    };
    for (const n of PARTS) add(n);
    // the mast and the arm each turn about their own origin
    this.mast = new THREE.Group(); this.mast.position.set(0, 0.55, -0.5); G.add(this.mast); add('CrawlMast', this.mast); this.lens = add('CrawlLens', this.mast);
    this.arm = new THREE.Group(); this.arm.position.set(0.2, 0.6, 0.3); G.add(this.arm); add('CrawlArm', this.arm);
    this.group.rotation.y = this.yaw;
    this.group.scale.setScalar(this.baseScale = 0.92 + Math.random() * 0.2);
    this.active = true;
  }
  get absorbable() { return this.alive && !this.absorbing; }
  get weak() { return false; }
  update(dt) {
    this.t += dt; const t = this.t, g = this.game, p = g.player.pos;
    let moving = 0;
    const dx = this.pos.x - p.x, dz = this.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d < 3.4 && !this.goal) { const l = d || 1; this.goal = [this.pos.x + (dx / l) * 3, this.pos.z + (dz / l) * 3]; }        // it trundles away from you
    this.wait -= dt;
    if (!this.goal && this.wait <= 0) { const a = Math.random() * 6.28, r = Math.random() * 2.6; this.goal = [this.home[0] + Math.cos(a) * r, this.home[1] + Math.sin(a) * r]; }
    if (this.goal) {
      const gx = this.goal[0] - this.pos.x, gz = this.goal[1] - this.pos.z, l = Math.hypot(gx, gz);
      if (l < 0.25 || g.world.blocked(this.pos.x, 0.4, this.pos.z, this.pos.x + (gx / l), 0.4, this.pos.z + (gz / l))) { this.goal = null; this.wait = 1 + Math.random() * 3; }
      else {
        const want = Math.atan2(-gx, -gz); let da = want - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); this.yaw += da * Math.min(1, dt * 2.2);
        if (Math.abs(da) < 0.5) { this.pos.x += (gx / l) * 0.75 * dt; this.pos.z += (gz / l) * 0.75 * dt; moving = 1; }
      }
    }
    this.group.rotation.y = this.yaw;
    // it rocks on its tracks as it goes, the mast looks about, the arm fidgets, and the lens breathes
    this.body.position.y = 0.012 * Math.abs(Math.sin(t * 7)) * moving; this.body.rotation.z = Math.sin(t * 5) * 0.012 * moving;
    this.mast.rotation.y = Math.sin(t * 0.7) * 0.8 + (d < 5 ? Math.atan2(-dx, -dz) - this.yaw : 0) * 0.15; this.mast.rotation.x = Math.sin(t * 0.9) * 0.08;
    this.arm.rotation.y = Math.sin(t * 0.45) * 0.25; this.arm.rotation.x = Math.sin(t * 1.3) * 0.06;
    if (this.lens) this.lens.material.emissiveIntensity = 2.0 + 0.8 * Math.sin(t * 2.4);
    this.hitSpheres[0].c.set(this.pos.x, this.pos.y + 0.42 * this.group.scale.y, this.pos.z);
  }
}
