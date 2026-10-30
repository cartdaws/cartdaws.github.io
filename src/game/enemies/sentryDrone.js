import * as THREE from 'three';
import { Enemy } from './enemy.js';
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
    this.lensMat = new THREE.MeshStandardMaterial({ color: 0x120404, emissive: 0xff2a10, emissiveIntensity: 0.1 });
    const glow = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffa030, emissiveIntensity: 2 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), body);
    core.scale.set(1, 0.85, 1);
    g.add(core);
    this.ring = new THREE.Group();
    g.add(this.ring);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.05, 8, 32), trim);
    torus.rotation.x = Math.PI / 2;
    this.ring.add(torus);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), body);
      strut.position.set(Math.cos(a) * 0.43, 0, Math.sin(a) * 0.43);
      strut.rotation.y = -a;
      this.ring.add(strut);
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glow);
      node.position.set(Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52);
      this.ring.add(node);
    }
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.2, 16), body);
    housing.rotation.x = Math.PI / 2;
    housing.position.set(0, 0, -0.34);
    g.add(housing);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), this.lensMat);
    lens.position.set(0, 0, -0.445);
    lens.rotation.y = Math.PI;
    g.add(lens);
    this.lensLight = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.lensLight.position.set(0, 0, -0.5);
    g.add(this.lensLight);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 0.4, 5), body);
    ant.position.set(0.1, 0.45, 0.1);
    g.add(ant);
    const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), this.lensMat);
    antTip.position.set(0.1, 0.66, 0.1);
    g.add(antTip);
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.26), body);
      fin.position.set(s * 0.27, -0.12, 0.12);
      fin.rotation.z = s * 0.4;
      g.add(fin);
    }
    for (let i = 0; i < 3; i++) {
      const a = i * 2.09;
      const th = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 8), glow);
      th.position.set(Math.cos(a) * 0.2, -0.34, Math.sin(a) * 0.2 + 0.05);
      th.rotation.x = Math.PI;
      g.add(th);
    }
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
