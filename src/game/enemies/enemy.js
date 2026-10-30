import * as THREE from 'three';

// Shared behaviour for all enemies: hit spheres, damage flash, death bookkeeping.
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
  }

  trackFlash(mat) { this.flashMats.push({ mat, base: mat.emissive.clone(), baseI: mat.emissiveIntensity }); return mat; }

  warn() { this.warning = true; }

  activate() { this.active = true; }

  takeDamage(amount, point) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flashT = 0.1;
    if (this.hp <= 0) { this.die(false); return true; }
    return false;
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

  // Nearly dead: the body glows and can be absorbed.
  get weak() { return this.alive && this.active && this.hp <= this.maxHp * 0.35; }

  updateFlash(dt) {
    if (this.flashT > 0) this.flashT -= dt;
    const f = this.flashT > 0 ? 1 : 0;
    const weak = !f && this.weak && !this.absorbing;
    const wp = 0.55 + 0.45 * Math.sin(performance.now() * 0.008);
    for (const { mat, base, baseI } of this.flashMats) {
      if (f) { mat.emissive.setRGB(1, 0.9, 0.8); mat.emissiveIntensity = 1.2; }
      else if (weak) { mat.emissive.setRGB(0.1, 0.95, 0.8); mat.emissiveIntensity = 0.5 + 1.1 * wp; }
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
