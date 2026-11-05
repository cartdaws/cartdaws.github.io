import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { clamp, damp, yawTo, angleDiff, rand, lerp, smooth } from '../../core/util.js';

const SHOT_SPEED = 15;

// std: the workshop sentry. armored: bigger, slower, longer bursts, takes a lot of punishment.
export const DRONE_VARIANTS = {
  std: { hp: 60, scale: 1, speed: 4.6, burst: 3, heal: 24, dmg: 10, body: 0x343c44, trim: 0xd9a21b, shot: 'orb', shotSpeed: 15 },
  armored: { hp: 130, scale: 1.3, speed: 3.6, burst: 3, heal: 40, dmg: 12, body: 0x20262b, trim: 0xa8281c, shot: 'seeker', shotSpeed: 9 },
};

// Hovering turret: relocates between waypoints, lights its lens, then fires a short dodgeable burst.
export class SentryDrone extends Enemy {
  constructor(game, x, z, variant = 'std') {
    super(game, x, 2.3, z);
    this.kind = 'drone';
    this.variant = variant;
    this.v = DRONE_VARIANTS[variant] || DRONE_VARIANTS.std;
    this.heal = this.v.heal;
    this.big = true;
    this.radius = 0.55;
    this.hp = this.maxHp = this.v.hp;
    this.baseY = 2.3;
    this.state = 'dormant';
    this.timer = 0;
    this.shots = 0;
    this.bob = Math.random() * 6;
    this.wp = null;
    this.charge = 0;
    this.hitSpheres = [{ c: new THREE.Vector3(), r: 0.6 }];
    this.build();
    this.setScale(this.v.scale);
    this.pos.y = this.baseY - 0.5; // sagging while powered down
  }

  build() {
    const g = this.group, v = this.v, armored = this.variant === 'armored';
    const body = this.trackFlash(new THREE.MeshStandardMaterial({ color: v.body, roughness: 0.38, metalness: 0.55, emissive: 0x000000 }));
    const shell = this.trackFlash(new THREE.MeshStandardMaterial({ color: armored ? 0x4a5258 : 0x9aa5ad, roughness: 0.32, metalness: 0.35, emissive: 0x000000 }));
    const trim = this.trackFlash(new THREE.MeshStandardMaterial({ color: v.trim, roughness: 0.5, metalness: 0.4, emissive: 0x000000 }));
    const dark = this.trackFlash(new THREE.MeshStandardMaterial({ color: 0x15191c, roughness: 0.55, metalness: 0.5, emissive: 0x000000 }));
    this.lensMat = new THREE.MeshStandardMaterial({ color: 0x120404, emissive: 0xff2a10, emissiveIntensity: 0.1 });
    const glow = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffa030, emissiveIntensity: 2 });
    this.glowMat = glow;
    const put = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; };

    // hull: two armoured half-shells around a dark core, joined by a trim seam
    put(new THREE.SphereGeometry(0.3, 22, 16), dark, 0, 0, 0);
    put(new THREE.SphereGeometry(0.34, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), shell, 0, 0.02, 0);
    put(new THREE.SphereGeometry(0.33, 24, 12, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44), body, 0, -0.02, 0);
    put(new THREE.TorusGeometry(0.335, 0.022, 8, 36), trim, 0, 0, 0, Math.PI / 2);
    // eye: recessed socket, iris ring and the glowing lens
    put(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 22), dark, 0, 0, -0.3, Math.PI / 2);
    put(new THREE.TorusGeometry(0.15, 0.018, 8, 26), trim, 0, 0, -0.36);
    const lens = put(new THREE.CircleGeometry(0.12, 22), this.lensMat, 0, 0, -0.365, 0, Math.PI);
    lens.renderOrder = 2;
    this.lensLight = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.lensLight.position.set(0, 0, -0.42);
    g.add(this.lensLight);
    // sensor mast and side stabilisers
    put(new THREE.CylinderGeometry(0.012, 0.018, 0.34, 6), dark, 0.09, 0.42, 0.06);
    put(new THREE.SphereGeometry(0.03, 8, 6), this.lensMat, 0.09, 0.6, 0.06);
    put(new THREE.CylinderGeometry(0.01, 0.014, 0.22, 6), dark, -0.08, 0.38, 0.1);
    for (const s of [-1, 1]) {
      put(new THREE.BoxGeometry(0.04, 0.2, 0.32), shell, s * 0.36, -0.02, 0.08, 0, 0, s * 0.35);
      put(new THREE.BoxGeometry(0.045, 0.05, 0.2), trim, s * 0.39, 0.06, 0.08, 0, 0, s * 0.35);
    }
    // spinning ring: segmented, with running lights
    this.ring = new THREE.Group();
    g.add(this.ring);
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2;
      const seg = put(new THREE.BoxGeometry(0.2, 0.05, 0.06), i % 2 ? body : trim, Math.cos(an) * 0.52, 0, Math.sin(an) * 0.52, 0, -an + Math.PI / 2, 0, this.ring);
      seg.rotation.y = -an;
      if (i % 2 === 0) put(new THREE.SphereGeometry(0.03, 8, 6), glow, Math.cos(an) * 0.555, 0.03, Math.sin(an) * 0.555, 0, 0, 0, this.ring);
    }
    for (let i = 0; i < 4; i++) {
      const an = i * Math.PI / 2;
      put(new THREE.BoxGeometry(0.16, 0.025, 0.03), dark, Math.cos(an) * 0.42, 0, Math.sin(an) * 0.42, 0, -an, 0, this.ring);
    }
    // thruster pods underneath, glowing nozzles
    for (let i = 0; i < 3; i++) {
      const an = i * 2.09 + 0.5;
      const x = Math.cos(an) * 0.2, z = Math.sin(an) * 0.2 + 0.04;
      put(new THREE.CylinderGeometry(0.06, 0.075, 0.14, 12), body, x, -0.3, z);
      put(new THREE.CylinderGeometry(0.045, 0.03, 0.05, 12), dark, x, -0.39, z);
      put(new THREE.CircleGeometry(0.04, 12), glow, x, -0.416, z, Math.PI / 2);
    }
    // armoured variant: heavier plating and a crown of spikes
    if (armored) {
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * Math.PI * 2;
        put(new THREE.BoxGeometry(0.16, 0.06, 0.2), shell, Math.cos(an) * 0.26, 0.24, Math.sin(an) * 0.26, 0.5 * Math.sin(an), -an, 0.5 * Math.cos(an));
        put(new THREE.ConeGeometry(0.03, 0.14, 6), trim, Math.cos(an) * 0.18, 0.36, Math.sin(an) * 0.18, Math.sin(an) * 0.6, 0, -Math.cos(an) * 0.6);
      }
      put(new THREE.TorusGeometry(0.2, 0.03, 8, 24), shell, 0, 0, -0.33);
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
    if (this.disabled) {
      this.powerDown(dt);
      this.hitSpheres[0].c.set(this.pos.x, this.pos.y, this.pos.z);
      this.lensLight.material.opacity = 0;
      return;
    }
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
          this.vx = damp(this.vx, (wx / l) * this.v.speed, 3.5, dt);
          this.vz = damp(this.vz, (wz / l) * this.v.speed, 3.5, dt);
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
          if (this.shots < this.v.burst) {
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

  onDisable() {
    this.state = 'down';
    this.fx = {};
    this.vy = 0;
    this.bounced = false;
    this.landed = false;
    this.tiltSign = Math.random() < 0.5 ? -1 : 1;
    this.charge = 0;
    this.lensMat.emissive.setRGB(0.1, 0.55, 1);
    this.glowMat.emissive.setRGB(0.1, 0.55, 1);
    this.game.sfxAt('powerdown', this.pos, this.variant === 'armored' ? 1.8 : 1.4);
  }

  impact(size) {
    const g = this.game, c = this.hitSpheres[0].c;
    g.sfxAt('clatter', this.pos, 1.2 * size);
    g.effects.hitSparks(c, [1, 0.7, 0.25], Math.round(8 * size));
    for (let i = 0; i < 4 * size; i++) g.effects.smokeP.emit(this.pos.x, 0.15, this.pos.z, rand(-1.4, 1.4), rand(0.3, 1), rand(-1.4, 1.4), rand(0.7, 1.2), rand(0.4, 0.7), 0.12, 0.12, 0.13, -0.2, 1, 1.2);
    g.addShake(0.1 * size * clamp(1 - this.pos.distanceTo(g.player.pos) / 18, 0, 1));
  }

  // Each sentry shuts down in its own way:
  //  std     - thrusters sputter and cut, it drops, bounces once and settles tilted with its ring spinning down
  //  armored - grinds down in stages with spark showers, then crashes hard and rocks to a stop
  powerDown(dt) {
    const g = this.game, fx = g.effects, s = this.baseScale;
    this.downT += dt;
    const t = this.downT, floorY = 0.34 * s;
    this.vx = damp(this.vx, 0, 2.5, dt); this.vz = damp(this.vz, 0, 2.5, dt);
    this.pos.x += this.vx * dt; this.pos.z += this.vz * dt;
    const a = g.arena;
    this.pos.x = clamp(this.pos.x, a.minX + 0.7, a.maxX - 0.7);
    this.pos.z = clamp(this.pos.z, a.minZ + 0.7, a.maxZ - 0.7);
    let rz = 0, rx = 0, lens = 0;
    if (this.variant === 'armored') {
      const h0 = this.baseY;
      let y;
      if (t < 0.5) y = lerp(h0, h0 - 0.4, smooth(t / 0.5)) + Math.sin(t * 70) * 0.02;
      else if (t < 0.9) y = h0 - 0.4;
      else if (t < 1.5) y = lerp(h0 - 0.4, h0 - 1.3, smooth((t - 0.9) / 0.6));
      else {
        if (!this.fx.crash) { this.fx.crash = true; this.vy = -2; }
        if (!this.landed) {
          this.vy -= 26 * dt;
          y = this.pos.y + this.vy * dt;
          if (y <= floorY) {
            y = floorY;
            if (!this.bounced) { this.bounced = true; this.vy = 3; this.impact(2); } else { this.vy = 0; this.landed = true; }
          }
        } else y = floorY;
      }
      if (t >= 0.5 && t < 1.5 && Math.random() < 0.35) fx.hitSparks(this.hitSpheres[0].c, [1, 0.6, 0.2], 2);
      this.pos.y = y;
      const rock = this.fx.crash ? Math.sin((t - 1.6) * 12) * 0.12 * Math.exp(-Math.max(0, t - 1.6) * 3) : 0;
      rz = this.tiltSign * 0.5 * smooth((t - 1.4) / 0.5) + rock;
      rx = 0.12 * smooth((t - 1.4) / 0.5);
      this.ring.rotation.y += dt * 2.4 * Math.max(0, 1 - t / 1.8);
      this.ring.rotation.x = Math.sin(t * 9) * 0.12 * Math.max(0, 1 - t / 2);
      lens = 2.5 * Math.max(0, 1 - t / 1.7) * (0.6 + 0.4 * Math.sin(t * 18));
      this.glowMat.emissiveIntensity = t < 1.5 ? 2 * Math.max(0, 1 - t / 1.5) : 0;
      if (this.landed && t > 2.1) this.downDone = true;
    } else {
      let y = this.pos.y;
      if (t < 0.55) {
        y = lerp(this.baseY, this.baseY - 0.35, smooth(t / 0.55)) + (Math.random() - 0.5) * 0.06;
        this.glowMat.emissiveIntensity = Math.random() < 0.5 ? 2 : 0.2;
        lens = Math.random() < 0.4 ? 3 : 0.1;
        this.ring.rotation.y += dt * 2.4 * (1 - 0.6 * (t / 0.55));
        if (!this.fx.a && t > 0.2) { this.fx.a = true; fx.hitSparks(this.hitSpheres[0].c, [1, 0.75, 0.3], 6); }
      } else {
        this.glowMat.emissiveIntensity = 0;
        if (!this.fx.fall) { this.fx.fall = true; this.vy = -1; }
        if (!this.landed) {
          this.vy -= 22 * dt;
          y = this.pos.y + this.vy * dt;
          if (y <= floorY) {
            y = floorY;
            if (!this.bounced && this.vy < -3) { this.vy = -this.vy * 0.3; this.bounced = true; this.impact(1); } else { this.vy = 0; this.landed = true; }
          }
        } else y = floorY;
        this.ring.rotation.y += dt * 1.5 * Math.max(0, 1 - t / 1.4);
        const tilt = smooth((t - 0.4) / 0.6);
        rz = this.tiltSign * 0.7 * tilt;
        rx = 0.25 * tilt;
      }
      this.pos.y = y;
      if (this.landed && t > 1.3) this.downDone = true;
    }
    this.lensMat.emissiveIntensity = lens;
    this.group.rotation.set(rx, this.yaw, rz);
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
    g.projectiles.spawnEnemy(lensPos, dir, this.v.shotSpeed || SHOT_SPEED, this.v.dmg, this.v.shot);
    g.sfxAt('droneShot', this.pos, 1.2);
    g.effects.flashLight(lensPos, 0xff4020, 12, 0.08);
  }
}
