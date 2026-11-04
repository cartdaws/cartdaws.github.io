import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { M } from '../../world/materials.js';
import { clamp, damp, yawTo, angleDiff, lerp, smooth, rand } from '../../core/util.js';

const _dir = { x: 0, z: 0 };
const BODY = { color: 0x2d343b, roughness: 0.4, metalness: 0.75, emissive: 0x000000 };

// std: the workshop bug. swarm: small, fast, fragile. brute: heavy, slow, hits hard and tells you about it.
export const BUG_VARIANTS = {
  std: { hp: 30, speed: 5.2, scale: 1, dmg: 12, heal: 14, plate: 0xd9a21b, wind: 0.65, recover: 1.15 },
  swarm: { hp: 18, speed: 7.6, scale: 0.78, dmg: 8, heal: 9, plate: 0x2aa8b0, wind: 0.5, recover: 0.85 },
  brute: { hp: 80, speed: 4.1, scale: 1.45, dmg: 22, heal: 30, plate: 0xa8281c, wind: 0.85, recover: 1.5 },
};

// Small mechanical insect: runs in, raises its front legs, lunges once, then recovers.
export class RobotBug extends Enemy {
  constructor(game, x, z, variant = 'std') {
    super(game, x, 0, z);
    this.kind = 'bug';
    this.variant = variant;
    this.v = BUG_VARIANTS[variant] || BUG_VARIANTS.std;
    this.heal = this.v.heal;
    this.radius = 0.42;
    this.hp = this.maxHp = this.v.hp;
    this.state = 'dormant';
    this.timer = 0;
    this.attackCd = 0;
    this.lungeDir = new THREE.Vector3();
    this.lungeHit = false;
    this.walk = Math.random() * 6;
    this.hitSpheres = [{ c: new THREE.Vector3(), r: 0.5 }];
    this.raise = 0;
    this.build();
    this.setScale(this.v.scale);
    this.group.rotation.y = this.yaw = Math.random() * 6.28;
  }

  build() {
    const g = this.group;
    const body = this.trackFlash(new THREE.MeshStandardMaterial(BODY));
    const plate = this.trackFlash(new THREE.MeshStandardMaterial({ color: this.v.plate, roughness: 0.5, metalness: 0.4, emissive: 0x000000 }));
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2a10, emissiveIntensity: 0.3 });
    const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, parent = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      parent.add(m);
      return m;
    };
    const sph = new THREE.SphereGeometry(1, 16, 12);
    add(sph, body, 0, 0.36, 0.26, 0.3, 0.24, 0.42); // abdomen
    add(sph, plate, 0, 0.5, 0.26, 0.22, 0.05, 0.3); // warning plate
    add(sph, body, 0, 0.36, -0.08, 0.2, 0.17, 0.22); // thorax
    add(sph, body, 0, 0.34, -0.3, 0.14, 0.12, 0.15); // head
    add(sph, this.eyeMat, -0.07, 0.38, -0.42, 0.045, 0.045, 0.045);
    add(sph, this.eyeMat, 0.07, 0.38, -0.42, 0.045, 0.045, 0.045);
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.008, 0.008, 0.24, 5), body, s * 0.05, 0.5, -0.4, 1, 1, 1).rotation.set(0.9, 0, s * 0.25);

    const legGeo = new THREE.CylinderGeometry(0.022, 0.015, 0.34, 6);
    legGeo.translate(0, -0.17, 0);
    this.legs = [];
    for (const s of [-1, 1]) {
      for (const [z, off] of [[0.0, 0], [0.2, Math.PI]]) {
        const hip = new THREE.Group();
        hip.position.set(s * 0.17, 0.34, z - 0.04);
        g.add(hip);
        const upper = add(legGeo, body, 0, 0, 0, 1, 1, 1, hip);
        upper.rotation.z = s * 1.0;
        const lower = add(legGeo, body, 0, -0.34, 0, 0.8, 0.8, 0.8, upper);
        lower.rotation.z = -s * 1.5;
        this.legs.push({ hip, s, off });
      }
    }
    // Front claws: raised as the attack telegraph.
    const clawGeo = new THREE.CylinderGeometry(0.03, 0.012, 0.36, 6);
    clawGeo.translate(0, 0.18, 0);
    this.claws = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.13, 0.38, -0.2);
      g.add(pivot);
      const c = add(clawGeo, plate, 0, 0, 0, 1, 1, 1, pivot);
      c.rotation.x = 2.2; // folded down and forward
      const tip = add(new THREE.ConeGeometry(0.035, 0.12, 6), this.eyeMat, 0, 0.38, 0, 1, 1, 1, c);
      this.claws.push({ pivot, c, s });
    }
  }

  activate() {
    super.activate();
    this.state = 'chase';
    this.eyeMat.emissiveIntensity = 2.2;
  }

  update(dt) {
    this.updateFlash(dt);
    const g = this.game;
    this.hitSpheres[0].c.set(this.pos.x, this.pos.y + 0.38 * this.baseScale, this.pos.z);
    if (this.disabled) { this.powerDown(dt); return; }
    let move = 0;
    if (this.active && this.alive) {
      const p = g.player.pos;
      const dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz);
      this.attackCd = Math.max(0, this.attackCd - dt);
      const targetYaw = yawTo(dx, dz);
      const turn = (rate) => { this.yaw += angleDiff(this.yaw, targetYaw) * Math.min(1, rate * dt); };

      if (this.state === 'chase') {
        turn(10);
        const los = g.world.clearPath(this.pos.x, this.pos.z, p.x, p.z, 0.5, 0.35, (b) => b.maxY > 0.4);
        let dirx, dirz;
        if (los) { dirx = dx / (dist || 1); dirz = dz / (dist || 1); }
        else if (g.nav.dir(this.pos.x, this.pos.z, _dir)) { dirx = _dir.x; dirz = _dir.z; }
        else { dirx = dx / (dist || 1); dirz = dz / (dist || 1); }
        const speed = this.v.speed;
        this.vx = damp(this.vx, dirx * speed, 10, dt);
        this.vz = damp(this.vz, dirz * speed, 10, dt);
        move = Math.hypot(this.vx, this.vz);
        if (dist < 3.4 * this.baseScale && los && this.attackCd <= 0) {
          this.state = 'windup';
          this.timer = this.v.wind;
          g.sfxAt('bugWarn', this.pos, 1.4);
        }
      } else if (this.state === 'windup') {
        turn(14);
        this.vx = damp(this.vx, 0, 14, dt);
        this.vz = damp(this.vz, 0, 14, dt);
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'lunge';
          this.timer = 0.34;
          this.lungeHit = false;
          const l = Math.hypot(dx, dz) || 1;
          this.lungeDir.set(dx / l, 0, dz / l);
          g.sfxAt('bugLunge', this.pos, 1.2);
        }
      } else if (this.state === 'lunge') {
        this.vx = this.lungeDir.x * 14;
        this.vz = this.lungeDir.z * 14;
        move = 6;
        this.timer -= dt;
        // One-shot damage: only the first contact during a lunge counts.
        if (!this.lungeHit && dist < 0.95 * this.baseScale && p.y < this.pos.y + 1.1 && !g.player.dead) {
          this.lungeHit = true;
          g.damagePlayer(this.v.dmg, this.pos);
        }
        if (this.timer <= 0) { this.state = 'recover'; this.timer = this.v.recover; }
      } else if (this.state === 'recover') {
        this.vx = damp(this.vx, 0, 9, dt);
        this.vz = damp(this.vz, 0, 9, dt);
        this.timer -= dt;
        if (this.timer <= 0) { this.state = 'chase'; this.attackCd = 0.8; }
      }

      this.pos.x += this.vx * dt;
      this.pos.z += this.vz * dt;
      this.separate(this.radius, dt);
      g.world.resolveCircle(this.pos, this.radius, 0.5, 0.3);
      this.clampToArena();
    }
    this.group.rotation.y = this.yaw;

    // Pose: leg cycle and raised claws.
    this.walk += dt * move * 2.6;
    for (const l of this.legs) {
      l.hip.rotation.y = Math.sin(this.walk + l.off) * 0.45 * clamp(move / 5, 0, 1) * l.s;
      l.hip.rotation.x = Math.cos(this.walk + l.off) * 0.2 * clamp(move / 5, 0, 1);
    }
    const target = this.state === 'windup' ? 1 : this.state === 'lunge' ? 0.55 : 0;
    this.raise = damp(this.raise, target, 18, dt);
    for (const cl of this.claws) {
      cl.c.rotation.x = lerp(2.2, -0.35, this.raise);
      cl.pivot.rotation.z = cl.s * -0.35 * this.raise;
    }
    const wind = this.state === 'windup' ? 1 : 0;
    this.eyeMat.emissiveIntensity = this.active ? 2.2 + wind * 3 * (0.5 + 0.5 * Math.sin(performance.now() * 0.03)) : this.warning ? 1.3 : 0.3;
    this.group.position.y = this.state === 'windup' ? -0.03 : 0;
  }

  onDisable() {
    this.state = 'down';
    this.fx = {};
    this.raise = 0;
    const sfx = this.variant === 'brute' ? 'groan' : this.variant === 'swarm' ? 'spark' : 'powerdown';
    this.game.sfxAt(sfx, this.pos, 1.3);
  }

  // Each bug shuts down in its own way:
  //  std   - seizes up, legs buckle and splay, claws droop, slumps nose-down
  //  swarm - hops, flips onto its back and its legs twitch themselves still
  //  brute - rears up, then slams its claws down and drops heavily, shaking the floor
  powerDown(dt) {
    const g = this.game, fx = g.effects, s = this.baseScale, v = this.variant;
    this.downT += dt;
    const t = this.downT;
    this.vx = damp(this.vx, 0, 6, dt); this.vz = damp(this.vz, 0, 6, dt);
    this.pos.x += this.vx * dt; this.pos.z += this.vz * dt;
    g.world.resolveCircle(this.pos, this.radius, 0.5, 0.3);
    this.clampToArena();
    const c = this.hitSpheres[0].c;
    let y = 0, rx = 0, rz = 0, eye = 0, D;
    if (v === 'swarm') {
      D = 1.3;
      const u = clamp((t - 0.12) / 0.55, 0, 1), flip = smooth(u), th = Math.PI * flip;
      rz = th;
      y = 0.36 * s * (1 - Math.cos(th)) + Math.sin(u * Math.PI) * 0.5 * s;
      eye = t < 0.5 ? (Math.random() < 0.5 ? 1.8 : 0.1) : 0.4 * Math.max(0, 1 - (t - 0.5) / 0.4);
      const twitch = 1 - clamp((t - 0.5) / 0.8, 0, 1);
      this.legs.forEach((l, i) => {
        l.hip.rotation.x = -0.9 * flip + Math.sin(t * 30 + i * 1.9) * 0.38 * twitch;
        l.hip.rotation.y = l.s * 0.3 * flip;
      });
      for (const cl of this.claws) { cl.c.rotation.x = lerp(2.2, -0.8, flip) + Math.sin(t * 26) * 0.12 * twitch; cl.pivot.rotation.z = cl.s * 0.2 * flip; }
      if (!this.fx.a && t > 0.05) { this.fx.a = true; fx.hitSparks(c, [0.4, 1, 0.9], 8); }
      if (!this.fx.b && u >= 1) { this.fx.b = true; g.sfxAt('clatter', this.pos, 0.8); fx.hitSparks(c, [1, 0.8, 0.3], 5); }
    } else if (v === 'brute') {
      D = 1.9;
      const ru = smooth(t / 0.55), su = smooth((t - 0.85) / 0.18), sag = smooth((t - 0.15) / 1.0);
      this.legs.forEach((l, i) => {
        const lk = smooth((t - (0.15 + 0.1 * i)) / 0.5);
        l.hip.rotation.x = (i % 2 ? 1 : -1) * 0.8 * lk;
        l.hip.rotation.y = l.s * 0.7 * lk;
      });
      for (const cl of this.claws) {
        cl.c.rotation.x = lerp(lerp(2.2, -0.5, ru), 2.95, su);
        cl.pivot.rotation.z = cl.s * (-0.35 * ru * (1 - su) + 0.5 * su);
      }
      y = -0.22 * s * sag - 0.05 * s * su;
      rx = -0.12 * ru * (1 - su) + 0.38 * su;
      rz = Math.sin(t * 40) * 0.05 * (1 - smooth(t / 1.2));
      eye = 2.4 * (1 - smooth(t / 1.4)) * (0.7 + 0.3 * Math.sin(t * 25));
      if (!this.fx.a && t > 0.85) {
        this.fx.a = true;
        g.sfxAt('clatter', this.pos, 1.5);
        const d = this.pos.distanceTo(g.player.pos);
        g.addShake(0.2 * clamp(1 - d / 18, 0, 1));
        fx.hitSparks(c, [1, 0.7, 0.25], 14);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          fx.smokeP.emit(this.pos.x, 0.1, this.pos.z, Math.cos(a) * 1.6, rand(0.2, 0.8), Math.sin(a) * 1.6, rand(0.7, 1.2), rand(0.4, 0.7), 0.12, 0.12, 0.13, -0.2, 1, 1.2);
        }
      }
    } else {
      D = 1.15;
      const k = smooth(t / D);
      eye = t < 0.4 ? (Math.sin(t * 70) > 0 ? 2.2 : 0.25) : 0.5 * Math.max(0, 1 - (t - 0.4) / 0.6);
      this.legs.forEach((l, i) => {
        l.hip.rotation.x = (i % 2 ? 1 : -1) * 0.65 * k + Math.sin(t * 34 + i * 1.3) * 0.1 * (1 - k);
        l.hip.rotation.y = l.s * (0.55 + 0.25 * (i % 3)) * k;
      });
      for (const cl of this.claws) { cl.c.rotation.x = lerp(2.2, 2.95, k); cl.pivot.rotation.z = cl.s * 0.6 * k + Math.sin(t * 25) * 0.05 * (1 - k); }
      y = -0.13 * s * k; rx = 0.3 * k; rz = Math.sin(t * 22) * 0.06 * (1 - k);
      if (!this.fx.a && t > 0.18) { this.fx.a = true; g.sfxAt('clatter', this.pos, 0.9); fx.hitSparks(c, [1, 0.75, 0.3], 7); }
      if (!this.fx.b && t > 0.65) { this.fx.b = true; fx.hitSparks(c, [0.3, 1, 0.9], 4); }
    }
    this.eyeMat.emissiveIntensity = eye;
    this.group.position.y = y;
    this.group.rotation.set(rx, this.yaw, rz);
    if (t >= D) this.downDone = true;
  }

  clampToArena() {
    const a = this.game.arena;
    this.pos.x = clamp(this.pos.x, a.minX + 0.5, a.maxX - 0.5);
    this.pos.z = clamp(this.pos.z, a.minZ + 0.5, a.maxZ - 0.5);
  }
}
