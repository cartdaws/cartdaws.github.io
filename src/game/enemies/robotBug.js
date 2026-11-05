import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { VARIANTS } from './variants.js';
import { instantiateRobot, bugComponents } from './robotAsset.js';
import { M } from '../../world/materials.js';
import { clamp, damp, yawTo, angleDiff, lerp } from '../../core/util.js';

const _dir = { x: 0, z: 0 };
const BODY = { color: 0x2d343b, roughness: 0.4, metalness: 0.75, emissive: 0x000000 };

// Small mechanical insect: runs in, raises its front legs, lunges once, then recovers.
export class RobotBug extends Enemy {
  constructor(game, x, z, variant = VARIANTS[0]) {
    super(game, x, 0, z);
    this.variant = variant;
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
    const v = this.variant;
    const body = this.trackFlash(new THREE.MeshStandardMaterial({ ...BODY, color: v.body }));
    const plate = this.trackFlash(new THREE.MeshStandardMaterial({ color: v.plate, roughness: 0.5, metalness: 0.4, emissive: 0x000000 }));
    const dark = this.trackFlash(new THREE.MeshStandardMaterial({ color: v.dark, roughness: 0.6, metalness: 0.6, emissive: 0x000000 }));
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2a10, emissiveIntensity: 0.3 });
    this.glowMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: v.glow, emissiveIntensity: 1.2 });
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: v.core, emissiveIntensity: 1.8 });
    // The modelled bug (art/build_robots.py): shell, head, core, six articulated legs, two claws, each on its own pivot.
    this.model = instantiateRobot(this.game.robots.Bug, { RobotBody: body, RobotPlate: plate, RobotDark: dark, RobotEye: this.eyeMat, RobotGlow: this.glowMat, RobotCore: this.coreMat });
    this.model.scale.setScalar(v.scale);
    g.add(this.model);
    this.legs = [];
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      for (let i = 0; i < 3; i++) {
        const hip = this.model.getObjectByName(`Hip_${side}${i}`);
        this.legs.push({ hip, lower: hip.getObjectByName('LegL'), s, off: (i + (s > 0 ? 1 : 0)) % 2 ? Math.PI : 0 });
      }
    }
    this.claws = ['L', 'R'].map((side) => {
      const pivot = this.model.getObjectByName('ClawPivot_' + side);
      const c = pivot.getObjectByName('Claw_' + side);
      c.rotation.x = 2.2; // folded down and forward
      return { pivot, c, s: side === 'L' ? -1 : 1 };
    });
    this.parts = bugComponents(this.model);
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
      if (l.lower) l.lower.rotation.x = Math.max(0, Math.cos(this.walk + l.off)) * 0.35 * clamp(move / 5, 0, 1);
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
