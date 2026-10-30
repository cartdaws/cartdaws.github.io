import * as THREE from 'three';

const _m = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

// Primary weapon: accurate, fast crystalline bolts, held-trigger cadence.
export class Shardcaster {
  constructor(game) {
    this.game = game;
    this.name = 'SHARDCASTER';
    this.interval = 0.135; // seconds between shots while held
    this.damage = 10;
    this.speed = 95;
    this.cooldown = 0;
    this.heldTime = 0;
    this.pressLatch = false;
    this.shots = 0;
  }

  reset() { this.cooldown = 0; this.heldTime = 0; this.pressLatch = false; }

  // A click that lands between simulation steps still produces a shot.
  latch() { this.pressLatch = true; }

  step(dt, trigger, enabled) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!enabled) { this.heldTime = 0; this.pressLatch = false; return; }
    const want = trigger || this.pressLatch;
    this.heldTime = trigger ? this.heldTime + dt : 0;
    if (want && this.cooldown <= 0) {
      this.fire();
      this.cooldown = this.interval;
      this.pressLatch = false;
    }
    if (!want) this.pressLatch = false;
  }

  fire() {
    this.shots++;
    const g = this.game;
    const cam = g.camera;
    cam.updateMatrixWorld();
    g.viewmodel.syncToCamera(cam);
    g.viewmodel.muzzleWorld(_m);

    // Aim at what the crosshair sees (world, enemies, barrels), then shoot from the muzzle toward it.
    cam.getWorldDirection(_d);
    const aim = g.pickAim(cam.position, _d, 120);
    _o.copy(aim).sub(_m);
    if (_o.lengthSq() < 0.04) _o.copy(_d);
    _o.normalize();

    // Slight bloom while the trigger stays held, none on the first shot.
    const bloom = Math.min(this.heldTime / 1.2, 1) * 0.006;
    if (bloom > 0) {
      _right.crossVectors(_o, cam.up).normalize();
      _up.crossVectors(_right, _o).normalize();
      _o.addScaledVector(_right, (Math.random() - 0.5) * bloom).addScaledVector(_up, (Math.random() - 0.5) * bloom).normalize();
    }

    // If the muzzle itself is inside geometry (hugging a wall) resolve the shot instantly.
    const toMuzzle = _m.clone().sub(cam.position);
    const len = toMuzzle.length();
    toMuzzle.divideScalar(len || 1);
    const wall = g.world.raycast(cam.position.x, cam.position.y, cam.position.z, toMuzzle.x, toMuzzle.y, toMuzzle.z, len);
    if (wall) {
      const p = cam.position.clone().addScaledVector(toMuzzle, wall.t);
      g.effects.impact(p, new THREE.Vector3(wall.nx, wall.ny, wall.nz));
    } else {
      g.projectiles.spawnPlayer(_m.clone(), _o.clone(), this.speed, this.damage);
    }
    g.viewmodel.fireKick();
    g.effects.muzzle(_m);
    g.effects.glowP.emit(_m.x, _m.y, _m.z, 0, 0, 0, 0.08, 0.28, 0.6, 1, 1);
    g.audio.play('shot', { vol: 0.85 });
    g.addShake(0.035);
  }
}
