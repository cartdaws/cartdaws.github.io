import * as THREE from 'three';
import { clamp, damp, angleDiff } from '../core/util.js';
import { makeGel } from '../world/materials.js';

// The player's body: a smooth, limbless gel mass that hovers a little above the floor. It has no legs and no trailing appendages;
// the only limbs the creature uses are the two arms (attack and absorb), which live in the first-person view model.
// Seen only when looking down: a ribbed translucent bell with a glowing core, a soft glow on the floor beneath it, and a body that
// leans with acceleration and settles with a slow breathing motion.
export class AlienBody {
  constructor(scene, world, player, geos) {
    this.world = world; this.player = player; this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;
    this.yaw = 0;
    this.vel = new THREE.Vector3(); this.acc = new THREE.Vector3();
    this.pitch = 0; this.roll = 0;

    const bellGel = makeGel({ color: 0x0a4a46, rim: 0x7ff0e0, alpha: 0.3 });
    this.bell = new THREE.Mesh(geos.BodyBell, bellGel);
    this.bell.position.y = -0.18;
    this.bell.renderOrder = 2;
    this.group.add(this.bell);
    const organ = makeGel({ color: 0x0f6a60, rim: 0xc6fff6, alpha: 0.55 });
    this.core = new THREE.Mesh(geos.BodyCore, organ);
    this.core.position.y = 0.05;
    this.group.add(this.core);

    // floor glow: where the hovering body "presses" on the ground
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(120,255,225,0.45)'); gr.addColorStop(0.5, 'rgba(60,200,180,0.18)'); gr.addColorStop(1, 'rgba(60,200,180,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.glow.renderOrder = 1;
    scene.add(this.glow);
  }

  dispose(scene) { scene.remove(this.group); scene.remove(this.glow); }
  setVisible(v) { this.group.visible = v; this.glow.visible = v; }
  reset() { this.yaw = this.player.yaw; this.vel.set(0, 0, 0); this.acc.set(0, 0, 0); }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const p = this.player, t = (this.time += dt);
    const v = new THREE.Vector3(p.vx, 0, p.vz);
    this.acc.lerp(v.clone().sub(this.vel).divideScalar(Math.max(dt, 1e-3)), 1 - Math.exp(-10 * dt));
    this.vel.lerp(v, 1 - Math.exp(-14 * dt));
    this.yaw += angleDiff(this.yaw, p.yaw) * Math.min(1, 6 * dt);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const accF = -(this.acc.x * sy + this.acc.z * cy), accR = this.acc.x * cy - this.acc.z * sy;
    this.pitch = damp(this.pitch, clamp(accF * 0.01, -0.2, 0.2), 7, dt);
    this.roll = damp(this.roll, clamp(-accR * 0.01, -0.2, 0.2), 7, dt);
    const speed = this.vel.length();
    const hover = 0.52 + Math.sin(t * 1.6) * 0.02 + Math.min(1, speed / 7) * Math.sin(t * 5) * 0.01;
    this.group.position.set(p.pos.x, p.pos.y + hover, p.pos.z);
    this.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    const br = 1 + Math.sin(t * 1.8) * 0.025;
    this.bell.scale.set(br, 1 / br, br);
    this.core.scale.setScalar(1 + Math.sin(t * 2.4) * 0.12);
    this.core.rotation.y = t * 0.2;
    this.glow.position.set(p.pos.x, p.pos.y + 0.03, p.pos.z);
    this.glow.material.opacity = 0.7 + Math.sin(t * 1.6) * 0.15;
  }
}
