import * as THREE from 'three';
import { rand } from '../../core/util.js';
import { LAB } from '../../v2/flags.js';

// Shared behaviour for all enemies: hit spheres, damage flash, death bookkeeping.
// Hurt badly enough (below DISABLE_AT of max health) a machine powers down, helpless but intact: it can be absorbed, or finished off.
const DISABLE_AT = 0.2;
const BLUE = [0.04, 0.38, 1];
const AMBER = [1, 0.72, 0.28];
const WHITE = [1, 0.95, 0.85];
const ARC = [0.55, 0.85, 1];
export class Enemy {
  constructor(game, x, y, z) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    game.scene.add(this.group);
    this.pos = this.group.position;
    this.alive = true;
    this.active = false;
    this.hp = this.maxHp = 1;
    this.yaw = 0;
    this.flashT = 0;
    this.flashMats = [];
    this.hitSpheres = [];
    this.vx = 0;
    this.vz = 0;
    this.baseScale = 1;
    this.disabled = false;
    this.downDone = false;
    this.downT = 0;
  }

  setScale(s) {
    this.baseScale = s;
    this.group.scale.setScalar(s);
    this.radius *= s;
    for (const h of this.hitSpheres) h.r *= s;
  }

  // A spray of sparks thrown out of the machine: arcing, falling and bouncing on the floor.
  sparks(p, n, color, speed = 5, size = 0.085) {
    const fx = this.game.effects;
    for (let i = 0; i < n; i++) {
      fx.glowP.emit(p.x, p.y, p.z, rand(-speed, speed), rand(0.3, speed * 1.15), rand(-speed, speed), rand(0.25, 0.75), rand(size * 0.6, size * 1.5), color[0], color[1], color[2], 10, 0.6);
    }
  }

  trackFlash(mat) { this.flashMats.push({ mat, base: mat.emissive.clone(), baseI: mat.emissiveIntensity }); return mat; }

  warn() { this.warning = true; }

  activate() { this.active = true; }

  takeDamage(amount, point) {
    if (!this.alive || this.absorbing) return false;
    this.hp -= amount;
    this.flashT = 0.1;
    if (this.hp <= 0) {
      if (LAB && this.active && !this.disabled && this.onDisable) { this.hp = 1; this.disable(); return false; }
      this.die(false); return true;
    }
    // every hit knocks sparks out of the hull, more for harder hits
    const at = point || this.centerPoint();
    this.sparks(at, Math.min(24, 9 + Math.round(amount / 3)), AMBER, 5.5);
    this.sparks(at, 4, WHITE, 3, 0.11);
    if (this.active && !this.disabled && this.hp <= this.maxHp * DISABLE_AT) this.disable();
    return false;
  }

  // pushed back by a hit, in the direction the shot travelled
  hitReact(dx, dz, dmg) {
    const l = Math.hypot(dx, dz) || 1, k = 1 + dmg / 20;
    this.vx += (dx / l) * k; this.vz += (dz / l) * k;
  }

  disable() {
    if (this.disabled) return;
    this.disabled = true;
    this.downDone = false;
    this.downT = 0;
    this.flashT = 0; // no white hit-flash: it goes straight to blue
    this.vx = this.vz = 0;
    this.group.rotation.order = 'YXZ';
    // the instant it shuts down the whole machine turns blue
    for (const { mat } of this.flashMats) { mat.emissive.setRGB(BLUE[0], BLUE[1], BLUE[2]); mat.emissiveIntensity = 0.9; }
    // shutdown: a big electrical burst out of the whole body
    const c = this.centerPoint();
    this.sparks(c, 46, ARC, 8.5, 0.11);
    this.sparks(c, 28, AMBER, 7, 0.09);
    this.sparks(c, 10, WHITE, 4, 0.15);
    this.game.effects.flashLight(c, 0x4aa8ff, 60, 0.3);
    this.crackle = 0;
    this.onDisable?.();
  }

  die(silent) {
    if (!this.alive) return;
    this.alive = false;
    this.group.visible = false;
    if (!silent) {
      this.game.effects.enemyDeath(this.centerPoint(), this.big);
      this.game.sfxAt('enemyDie', this.pos);
    }
    this.game.onEnemyDied(this, silent);
  }

  centerPoint() { return new THREE.Vector3(this.pos.x, this.pos.y + 0.4, this.pos.z); }

  // Shut down: the body glows and can be absorbed (once its power-down has finished).
  get weak() { return this.alive && this.disabled; }
  get absorbable() { return this.alive && this.disabled && this.downDone && !this.absorbing; }

  updateFlash(dt) {
    // a dying machine keeps shorting out: heavy at first, then now and then until it is absorbed or destroyed
    if (this.disabled && this.alive && !this.absorbing) {
      this.crackle -= dt;
      if (this.crackle <= 0) {
        const early = this.downT < 1.4, s = this.hitSpheres[0];
        this.crackle = early ? rand(0.04, 0.1) : rand(0.6, 1.5);
        const p = this.tmpP || (this.tmpP = new THREE.Vector3());
        p.set(s.c.x + rand(-s.r, s.r) * 0.8, s.c.y + rand(-s.r, s.r) * 0.6, s.c.z + rand(-s.r, s.r) * 0.8);
        this.sparks(p, early ? 5 : 3, Math.random() < 0.6 ? ARC : AMBER, early ? 4.5 : 3, 0.075);
      }
    }
    if (this.flashT > 0) this.flashT -= dt;
    const f = this.flashT > 0 ? 1 : 0;
    const weak = !f && this.weak && !this.absorbing;
    const wp = 0.55 + 0.45 * Math.sin(performance.now() * 0.008);
    for (const { mat, base, baseI } of this.flashMats) {
      if (f) { mat.emissive.setRGB(1, 0.9, 0.8); mat.emissiveIntensity = 1.2; }
      else if (weak) { mat.emissive.setRGB(BLUE[0], BLUE[1], BLUE[2]); mat.emissiveIntensity = 0.45 + 0.6 * wp; }
      else { mat.emissive.copy(base); mat.emissiveIntensity = baseI; }
    }
  }

  // Push apart from other living enemies so they never stack into one mass.
  separate(radius, dt) {
    for (const o of this.game.enemies) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz), min = radius + o.radius;
      if (d < min && d > 1e-4) {
        const push = (min - d) * Math.min(1, 8 * dt);
        this.pos.x += (dx / d) * push * 0.5;
        this.pos.z += (dz / d) * push * 0.5;
      }
    }
  }

  dispose() { this.game.scene.remove(this.group); }
}
