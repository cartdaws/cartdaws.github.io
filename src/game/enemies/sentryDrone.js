import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { instantiateRobot, droneComponents } from './robotAsset.js';
import { clamp, damp, yawTo, angleDiff, rand } from '../../core/util.js';

const SHOT_SPEED = 15;

// Hovering turret: relocates between waypoints, lights its lens, then fires a short dodgeable burst.
export class SentryDrone extends Enemy {
  constructor(game, x, z) {
    super(game, x, 2.3, z);
    this.kind = 'drone';
    this.big = true;
    this.radius = 0.55;
    this.hp = this.maxHp = 60;
    this.baseY = 2.3;
    this.state = 'dormant';
    this.timer = 0;
    this.shots = 0;
    this.bob = Math.random() * 6;
    this.wp = null;
    this.charge = 0;
    this.hitSpheres = [{ c: new THREE.Vector3(), r: 0.6 }];
    this.build();
    this.pos.y = this.baseY - 0.5; // sagging while powered down
  }

  build() {
    const g = this.group;
    const body = this.trackFlash(new THREE.MeshStandardMaterial({ color: 0x343c44, roughness: 0.35, metalness: 0.8, emissive: 0x000000 }));
    const trim = this.trackFlash(new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: 0.5, metalness: 0.4, emissive: 0x000000 }));
    const dark = this.trackFlash(new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55, metalness: 0.7, emissive: 0x000000 }));
    this.lensMat = new THREE.MeshStandardMaterial({ color: 0x120404, emissive: 0xff2a10, emissiveIntensity: 0.1 });
    const eye = new THREE.MeshStandardMaterial({ color: 0x120404, emissive: 0xff2a10, emissiveIntensity: 1.2 });
    const glow = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffa030, emissiveIntensity: 2 });
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffb84a, emissiveIntensity: 1.8 });
    // The modelled drone (art/build_robots.py): shell, spinning ring, firing assembly with emitter lens, core, thrusters.
    this.model = instantiateRobot(this.game.robots.Drone, { RobotBody: body, RobotPlate: trim, RobotDark: dark, RobotEye: eye, RobotGlow: glow, RobotCore: this.coreMat, RobotLens: this.lensMat });
    g.add(this.model);
    this.ring = this.model.getObjectByName('RingPivot');
    this.lensLight = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.lensLight.position.set(0, 0, -0.5);
    g.add(this.lensLight);
    this.parts = droneComponents(this.model);
  }

  activate() {
    super.activate();
    this.state = 'move';
    this.timer = 0.2;
    this.pickWaypoint();
  }

  pickWaypoint() {
    const g = this.game, p = g.player.pos;
    let best = null, bestScore = -1e9;
    for (const w of g.waypoints) {
      const d = Math.hypot(w.x - this.pos.x, w.z - this.pos.z);
      if (d < 4 || d > 15) continue;
      if (!g.world.clearPath(this.pos.x, this.pos.z, w.x, w.z, this.baseY, 0.5)) continue;
      const toP = Math.hypot(w.x - p.x, w.z - p.z);
      const sight = !g.world.blocked(w.x, this.baseY, w.z, p.x, p.y + 1.1, p.z);
      let score = Math.random() * 3 + (sight ? 3 : 0) - Math.abs(toP - 10) * 0.2;
      for (const o of g.enemies) if (o !== this && o.alive && o.kind === 'drone' && o.wp === w) score -= 6;
      if (score > bestScore) { bestScore = score; best = w; }
    }
    this.wp = best;
  }

  canSee() {
    const p = this.game.player.pos;
    return !this.game.world.blocked(this.pos.x, this.pos.y, this.pos.z, p.x, p.y + 1.0, p.z);
  }

  update(dt) {
    this.updateFlash(dt);
    const g = this.game;
    this.bob += dt;
    const p = g.player.pos;
    let lens = 0.1;
    let targetY = this.baseY;
    if (!this.active) targetY = this.baseY - (this.warning ? 0.2 : 0.5);
    else if (this.alive) {
      const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
      const targetYaw = yawTo(dx, dz);
      const face = (rate) => { this.yaw += angleDiff(this.yaw, targetYaw) * Math.min(1, rate * dt); };
      this.timer -= dt;

      if (this.state === 'move') {
        face(4);
        if (!this.wp || Math.hypot(this.wp.x - this.pos.x, this.wp.z - this.pos.z) < 0.5) {
          this.vx = damp(this.vx, 0, 5, dt);
          this.vz = damp(this.vz, 0, 5, dt);
          if (this.timer <= 0) this.startAim();
        } else {
          const wx = this.wp.x - this.pos.x, wz = this.wp.z - this.pos.z, l = Math.hypot(wx, wz);
          this.vx = damp(this.vx, (wx / l) * 4.6, 3.5, dt);
          this.vz = damp(this.vz, (wz / l) * 4.6, 3.5, dt);
          if (this.timer <= -1.2 && this.canSee()) this.startAim();
          else if (this.timer <= -4) { this.pickWaypoint(); this.timer = 0; }
        }
      } else if (this.state === 'aim') {
        face(7);
        this.vx = damp(this.vx, 0, 4, dt);
        this.vz = damp(this.vz, 0, 4, dt);
        this.charge = clamp(1 - this.timer / 0.8, 0, 1);
        lens = 0.1 + this.charge * 4;
        if (this.timer <= 0) {
          if (this.canSee()) { this.state = 'burst'; this.shots = 0; this.timer = 0; }
          else { this.state = 'move'; this.timer = 0.4; this.pickWaypoint(); } // cover broke the shot
        }
      } else if (this.state === 'burst') {
        face(9);
        lens = 3.5;
        this.vx = damp(this.vx, 0, 6, dt);
        this.vz = damp(this.vz, 0, 6, dt);
        if (this.timer <= 0) {
          if (this.shots < 3) {
            this.fire();
            this.shots++;
            this.timer = 0.17;
          } else {
            this.state = 'cooldown';
            this.timer = rand(1.3, 2.1);
            this.pickWaypoint();
          }
        }
      } else if (this.state === 'cooldown') {
        face(3);
        if (this.timer > 0.4 || !this.wp) { this.vx = damp(this.vx, 0, 3, dt); this.vz = damp(this.vz, 0, 3, dt); }
        if (this.timer <= 0) { this.state = 'move'; this.timer = 0; }
      }

      this.pos.x += this.vx * dt;
      this.pos.z += this.vz * dt;
      this.separate(this.radius, dt);
      // Hover body: blocked by anything reaching up to its altitude.
      const lowY = this.baseY - 0.4;
      const tmp = { x: this.pos.x, y: lowY, z: this.pos.z };
      g.world.resolveCircle(tmp, 0.5, 0.8, 0);
      this.pos.x = tmp.x; this.pos.z = tmp.z;
      const a = g.arena;
      this.pos.x = clamp(this.pos.x, a.minX + 0.7, a.maxX - 0.7);
      this.pos.z = clamp(this.pos.z, a.minZ + 0.7, a.maxZ - 0.7);
    }

    this.pos.y = damp(this.pos.y, targetY + Math.sin(this.bob * 2.2) * 0.07, 4, dt);
    this.group.rotation.y = this.yaw;
    this.group.rotation.z = clamp(-this.vx * 0.03, -0.2, 0.2) * Math.cos(this.yaw) + clamp(this.vz * 0.03, -0.2, 0.2) * Math.sin(this.yaw);
    this.ring.rotation.y += dt * (this.active ? 2.4 : 0.4);
    this.lensMat.emissiveIntensity = this.active ? lens : (this.warning ? 0.9 : 0.05);
    this.lensLight.material.opacity = clamp((lens - 0.5) / 3.5, 0, 1) * 0.8;
    this.lensLight.scale.setScalar(0.6 + this.charge * 0.8);
    if (this.state !== 'aim') this.charge = damp(this.charge, 0, 10, dt);
    this.hitSpheres[0].c.set(this.pos.x, this.pos.y, this.pos.z);
  }

  startAim() {
    this.state = 'aim';
    this.timer = 0.8;
    this.game.sfxAt('droneCharge', this.pos, 1.3);
  }

  fire() {
    const g = this.game;
    const p = g.player.pos;
    this.group.updateMatrixWorld(true);
    const lensPos = new THREE.Vector3(0, 0, -0.5).applyMatrix4(this.group.matrixWorld);
    const target = new THREE.Vector3(p.x, p.y + 1.0, p.z);
    const dir = target.sub(lensPos).normalize();
    g.projectiles.spawnEnemy(lensPos, dir, SHOT_SPEED, 10);
    g.sfxAt('droneShot', this.pos, 1.2);
    g.effects.flashLight(lensPos, 0xff4020, 12, 0.08);
  }
}
