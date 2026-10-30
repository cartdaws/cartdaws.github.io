import * as THREE from 'three';
import { clamp, damp } from '../core/util.js';

const RADIUS = 0.4;
const HEIGHT = 1.8;
const EYE = 1.6;
const SPEED = 7.2;
const GRAVITY = 24;
const JUMP_V = 7.6;
const DASH_SPEED = 18;
const DASH_TIME = 0.17;
const DASH_COOLDOWN = 1.3;

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.yaw = 0; this.pitch = 0;
    this.maxHealth = 100;
    this.reset(0, 0, 0);
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vx = this.vz = this.vy = 0;
    this.yaw = yaw; this.pitch = 0;
    this.health = this.maxHealth;
    this.dead = false;
    this.grounded = true;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.dashBuf = 0;
    this.dashT = 0;
    this.dashCd = 0;
    this.dashDir = new THREE.Vector2(0, -1);
    this.dashing = false;
    this.justDashed = false;
  }

  get eye() { return this.pos.y + EYE; }
  get dashReady() { return 1 - clamp(this.dashCd / DASH_COOLDOWN, 0, 1); }

  look(dx, dy, sens) {
    const k = 0.0022 * sens;
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch - dy * k, -1.52, 1.52);
  }

  knock(x, z) { this.vx += x; this.vz += z; }

  // Called once per rendered frame: latches presses so short taps are never lost between sim steps.
  latch(input) {
    if (input.was('Space')) this.jumpBuf = 0.14;
    if (input.was('ShiftLeft') || input.was('ShiftRight')) this.dashBuf = 0.18;
  }

  step(dt, input, controllable) {
    this.justDashed = false;
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.dashBuf = Math.max(0, this.dashBuf - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);

    let mx = 0, mz = 0;
    if (controllable) {
      mz = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
      mx = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
      if (input.touch && (input.axisX || input.axisY)) { mx = input.axisX; mz = input.axisY; }
    } else { this.jumpBuf = 0; this.dashBuf = 0; }
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const wx = -sin * mz + cos * mx, wz = -cos * mz - sin * mx;

    if (this.dashBuf > 0 && this.dashCd <= 0 && !this.dashing) {
      this.dashBuf = 0;
      this.dashing = true;
      this.dashT = DASH_TIME;
      this.dashCd = DASH_COOLDOWN;
      this.justDashed = true;
      if (l > 0.01) this.dashDir.set(wx, wz).normalize();
      else this.dashDir.set(-sin, -cos);
    }

    if (this.dashing) {
      this.vx = this.dashDir.x * DASH_SPEED;
      this.vz = this.dashDir.y * DASH_SPEED;
      this.dashT -= dt;
      if (this.dashT <= 0) {
        this.dashing = false;
        this.vx = this.dashDir.x * SPEED * 1.1;
        this.vz = this.dashDir.y * SPEED * 1.1;
      }
    } else {
      const lambda = this.grounded ? (l > 0.01 ? 16 : 13) : 3.2;
      this.vx = damp(this.vx, wx * SPEED, lambda, dt);
      this.vz = damp(this.vz, wz * SPEED, lambda, dt);
    }

    // Coyote time and buffered jump.
    this.coyote = this.grounded ? 0.1 : Math.max(0, this.coyote - dt);
    if (this.jumpBuf > 0 && this.coyote > 0 && !this.dashing) {
      this.vy = JUMP_V;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuf = 0;
      this.game.audio.play('jump', { vol: 0.8 });
    }
    if (!this.grounded || this.vy > 0) this.vy -= GRAVITY * dt;

    // Horizontal motion in small increments so thin walls and doors cannot be tunnelled.
    const dx = this.vx * dt, dz = this.vz * dt;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.18));
    for (let i = 0; i < n; i++) {
      this.pos.x += dx / n;
      this.pos.z += dz / n;
      this.game.world.resolveCircle(this.pos, RADIUS, HEIGHT);
    }

    // Vertical motion and ground.
    const wasGrounded = this.grounded;
    this.pos.y += this.vy * dt;
    const ground = this.game.world.groundHeight(this.pos.x, this.pos.z, this.pos.y, RADIUS);
    if (this.pos.y <= ground + 0.001 && this.vy <= 0) {
      if (!wasGrounded && this.vy < -6) this.game.audio.play('land', { vol: clamp(-this.vy / 14, 0.3, 1) });
      this.pos.y = ground;
      this.vy = 0;
      this.grounded = true;
    } else if (this.pos.y > ground + 0.02) {
      this.grounded = false;
    }
    if (this.pos.y + HEIGHT > 6.3) { this.pos.y = 6.3 - HEIGHT; this.vy = Math.min(0, this.vy); }
    if (this.pos.y < -2) { this.pos.set(0, 0, REPLAY_SAFE.z); } // never fall out of the world
  }

  speed() { return Math.hypot(this.vx, this.vz); }
}

const REPLAY_SAFE = { z: -4 };
