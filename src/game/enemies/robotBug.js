import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { M } from '../../world/materials.js';
import { clamp, damp, yawTo, angleDiff, lerp } from '../../core/util.js';

const _dir = { x: 0, z: 0 };
const BODY = { color: 0x2d343b, roughness: 0.4, metalness: 0.75, emissive: 0x000000 };

// Small mechanical insect: runs in, raises its front legs, lunges once, then recovers.
export class RobotBug extends Enemy {
  constructor(game, x, z) {
    super(game, x, 0, z);
    this.kind = 'bug';
    this.radius = 0.42;
    this.hp = this.maxHp = 30;
    this.state = 'dormant';
    this.timer = 0;
    this.attackCd = 0;
    this.lungeDir = new THREE.Vector3();
    this.lungeHit = false;
    this.walk = Math.random() * 6;
    this.hitSpheres = [{ c: new THREE.Vector3(), r: 0.5 }];
    this.raise = 0;
    this.build();
    this.group.rotation.y = this.yaw = Math.random() * 6.28;
  }

  build() {
    const g = this.group;
    const body = this.trackFlash(new THREE.MeshStandardMaterial(BODY));
    const plate = this.trackFlash(new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: 0.5, metalness: 0.4, emissive: 0x000000 }));
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
    this.hitSpheres[0].c.set(this.pos.x, this.pos.y + 0.38, this.pos.z);
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
        const speed = 5.2;
        this.vx = damp(this.vx, dirx * speed, 10, dt);
        this.vz = damp(this.vz, dirz * speed, 10, dt);
        move = Math.hypot(this.vx, this.vz);
        if (dist < 3.4 && los && this.attackCd <= 0) {
          this.state = 'windup';
          this.timer = 0.65;
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
        if (!this.lungeHit && dist < 0.95 && p.y < this.pos.y + 1.1 && !g.player.dead) {
          this.lungeHit = true;
          g.damagePlayer(12, this.pos);
        }
        if (this.timer <= 0) { this.state = 'recover'; this.timer = 1.15; }
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

  clampToArena() {
    const a = this.game.arena;
    this.pos.x = clamp(this.pos.x, a.minX + 0.5, a.maxX - 0.5);
    this.pos.z = clamp(this.pos.z, a.minZ + 0.5, a.maxZ - 0.5);
  }
}
