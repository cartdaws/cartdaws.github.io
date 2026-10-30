import * as THREE from 'three';

let NEXT_ID = 1;
const RING_GEO = new THREE.RingGeometry(0.62, 0.7, 40).rotateX(-Math.PI / 2);

// Shared behaviour for all enemies: hit spheres, damage flash, death bookkeeping.
export class Enemy {
  constructor(game, x, y, z) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    game.scene.add(this.group);
    this.pos = this.group.position;
    this.uid = NEXT_ID++; // one absorption reward per instance
    this.rewarded = false;
    this.absorbing = false;
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
    if (this.absorbing) return false; // already being consumed
    // A hit that would destroy a healthy enemy instead leaves it disabled: weaken first, then absorb or finish it.
    if (!this.weak && this.hp - amount <= 0) this.hp = Math.max(1, Math.ceil(this.maxHp * 0.2));
    else this.hp -= amount;
    this.flashT = 0.1;
    if (this.hp <= 0) { this.die(false); return true; }
    return false;
  }

  die(silent) {
    if (!this.alive) return;
    this.alive = false;
    this.group.visible = false;
    if (this.absRing) this.absRing.visible = false;
    if (!silent) {
      this.game.effects.enemyDeath(this.centerPoint(), this.big);
      this.game.sfxAt('enemyDie', this.pos);
    }
    this.game.onEnemyDied(this, silent);
  }

  centerPoint() { return new THREE.Vector3(this.pos.x, this.pos.y + 0.4, this.pos.z); }

  // Nearly dead: the body glows and can be absorbed.
  get weak() { return this.alive && this.active && this.hp <= this.maxHp * 0.35; }

  // Disabled: AI is off. The body sags, sparks and flickers, and a faint ring marks it on the floor.
  updateDisabled(dt) {
    this.updateFlash(dt);
    if (this.dis === undefined) {
      this.dis = 0; this.restY = this.kind === 'drone' ? 0.95 : this.pos.y;
      this.cOff = this.hitSpheres[0].c.y - this.pos.y;
      this.tiltSign = Math.random() < 0.5 ? -1 : 1;
      this.game.sfxAt('enemyDie', this.pos, 0.45);
    }
    this.dis += dt;
    const k = Math.min(1, this.dis / 0.5);
    this.vx *= 0.85; this.vz *= 0.85;
    this.pos.y += (this.restY - this.pos.y) * Math.min(1, dt * 4);
    this.group.rotation.z = this.tiltSign * 0.42 * k + Math.sin(this.dis * 23) * 0.025;
    this.group.rotation.x = 0.12 * k * Math.sin(this.dis * 1.7);
    this.hitSpheres[0].c.set(this.pos.x, this.pos.y + this.cOff, this.pos.z);
    const eye = this.eyeMat || this.lensMat;
    if (eye) eye.emissiveIntensity = 0.5 + 0.9 * (Math.sin(this.dis * 13) > 0.6 ? 1 : 0);
    this.sparkT = (this.sparkT || 0) - dt;
    if (this.sparkT <= 0) {
      this.sparkT = 0.35 + Math.random() * 0.4;
      const c = this.hitSpheres[0].c;
      this.game.effects.glowP.emit(c.x, c.y + 0.1, c.z, (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, 0.35, 0.04, 0.5, 1, 0.9, 6, 1);
    }
    if (!this.absRing) {
      this.absRing = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: 0x7fffe8, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.absRing.renderOrder = 2;
      this.game.scene.add(this.absRing);
    }
    this.absRing.visible = !this.absorbing;
    this.absRing.position.set(this.pos.x, 0.05, this.pos.z);
    const target = this.ringBoost ? 0.8 : 0.25;
    this.absRing.material.opacity += (target * (0.8 + 0.2 * Math.sin(this.dis * 5)) - this.absRing.material.opacity) * Math.min(1, dt * 10);
    const s = this.ringBoost ? 1.1 + 0.05 * Math.sin(this.dis * 7) : 1;
    this.absRing.scale.set(s, 1, s);
  }

  updateFlash(dt) {
    if (this.flashT > 0) this.flashT -= dt;
    const f = this.flashT > 0 ? 1 : 0;
    const weak = !f && this.weak && !this.absorbing;
    const wp = 0.55 + 0.45 * Math.sin(performance.now() * 0.008);
    for (const { mat, base, baseI } of this.flashMats) {
      if (f) { mat.emissive.setRGB(1, 0.9, 0.8); mat.emissiveIntensity = 1.2; }
      else if (weak) { mat.emissive.setRGB(0.1, 0.95, 0.8); mat.emissiveIntensity = 0.35 + 0.55 * wp; }
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

  dispose() { this.game.scene.remove(this.group); if (this.absRing) { this.game.scene.remove(this.absRing); this.absRing.material.dispose(); } }
}
