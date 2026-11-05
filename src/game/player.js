import * as THREE from 'three';
import { clamp, damp } from '../core/util.js';
import { progress } from './progress.js';

const RADIUS = 0.4;
const HEIGHT = 1.8;
const EYE = 1.6;
const SPEED = 7.2;
const GRAVITY = 27;
const JUMP_V = 9.9;           // a jump clears about 1.8 m: high enough to be a real way of getting around the room
const MANTLE = 0.72;         // and you pull yourself up onto a ledge this far above your feet
const DASH_SPEED = 18;
const DASH_TIME = 0.17;
const DASH_COOLDOWN = 1.3;

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.yaw = 0; this.pitch = 0;
    this.maxHealth = 100 + progress.maxHpBonus;
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

  get eye() { return this.pos.y + EYE + (this.stepOff || 0); }
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
    const A = this.game.admin;
    if (A && A.infDash) this.dashCd = 0;

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
    const SP = SPEED * (A ? A.speed : 1) * (this.speedMul ?? 1);

    // admin noclip: free flight straight through everything
    if (A && A.noclip && controllable) {
      const up = (input.down('Space') ? 1 : 0) - (input.down('KeyC') || input.down('ControlLeft') ? 1 : 0);
      const fly = SP * 1.8;
      this.vx = damp(this.vx, wx * fly, 10, dt); this.vz = damp(this.vz, wz * fly, 10, dt); this.vy = damp(this.vy, up * fly, 10, dt);
      this.pos.x += this.vx * dt; this.pos.y = Math.max(0, this.pos.y + this.vy * dt); this.pos.z += this.vz * dt;
      this.grounded = this.pos.y <= 0.01; this.dashing = false;
      return;
    }

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
        this.vx = this.dashDir.x * SP * 1.1;
        this.vz = this.dashDir.y * SP * 1.1;
      }
    } else {
      const lambda = this.grounded ? (l > 0.01 ? 16 : 19) : (l > 0.01 ? 7 : 11);       // enough air control to actually land on what you jumped at
      this.vx = damp(this.vx, wx * SP, lambda, dt);
      this.vz = damp(this.vz, wz * SP, lambda, dt);
    }

    // Coyote time and buffered jump.
    this.coyote = this.grounded ? 0.1 : Math.max(0, this.coyote - dt);
    if (this.jumpBuf > 0 && this.coyote > 0 && !this.dashing) {
      this.vy = JUMP_V * (A ? A.jump : 1);
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuf = 0;
      this.game.audio.play('jump', { vol: 0.8 });
    }
    if (!this.grounded || this.vy > 0) this.vy -= GRAVITY * (A ? A.grav : 1) * dt;

    // Horizontal motion in small increments so thin walls and doors cannot be tunnelled.
    const dx = this.vx * dt, dz = this.vz * dt;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.18));
    for (let i = 0; i < n; i++) {
      this.pos.x += dx / n;
      this.pos.z += dz / n;
      this.game.world.resolveCircle(this.pos, RADIUS, HEIGHT);
      if (this.extraSolid) this.extraSolid(this.pos);      // solids outside the box world: the homeworld's houses, trees and rocks
    }

    // Pressing into a ledge in the air: haul yourself up onto it.
    if (!this.grounded && controllable && l > 0.01 && !this.dashing && this.vy < 4.5) {
      const rise = this.game.world.ledgeRise(this.pos.x, this.pos.z, this.pos.y, RADIUS + 0.12, wx, wz, MANTLE, HEIGHT);
      if (rise > 0) this.vy = Math.max(this.vy, Math.sqrt(2 * GRAVITY * (rise + 0.08)));
    }

    // Vertical motion and ground.
    const wasGrounded = this.grounded, y0 = this.pos.y;
    this.pos.y += this.vy * dt;
    const ceil = this.game.world.ceilingHeight(this.pos.x, this.pos.z, Math.min(y0, this.pos.y), RADIUS - 0.02);
    if (this.pos.y + HEIGHT > ceil) { this.pos.y = ceil - HEIGHT; this.vy = Math.min(0, this.vy); }
    this.stepOff = damp(this.stepOff || 0, 0, 13, dt);
    const ground = this.game.world.groundHeight(this.pos.x, this.pos.z, this.pos.y, RADIUS);
    if (this.pos.y <= ground + 0.001 && this.vy <= 0) {
      if (!wasGrounded && this.vy < -6) this.game.audio.play('land', { vol: clamp(-this.vy / 14, 0.3, 1) });
      if (wasGrounded && ground > y0 + 0.01) this.stepOff -= ground - y0;      // up a step: the feet pop, the view glides
      this.pos.y = ground;
      this.vy = 0;
      this.grounded = true;
    } else if (wasGrounded && this.vy <= 0 && this.pos.y - ground <= 0.32) {
      this.stepOff += y0 - ground;                                              // down a small step: stay on your feet
      this.pos.y = ground; this.vy = 0;
    } else if (this.pos.y > ground + 0.02) {
      this.grounded = false;
    }
    // footsteps: you are a heavy wet thing on a metal deck, and now you can hear it
    if (this.grounded && !this.dashing) {
      this.stepAcc = (this.stepAcc || 0) + Math.hypot(this.vx, this.vz) * dt;
      if (this.stepAcc > 2.3) { this.stepAcc = 0; this.game.audio.play('step', { vol: 0.14 + 0.1 * clamp(Math.hypot(this.vx, this.vz) / SPEED, 0, 1) }); }
    }
    if (this.pos.y + HEIGHT > 6.3) { this.pos.y = 6.3 - HEIGHT; this.vy = Math.min(0, this.vy); }
    if (this.pos.y < -2) { this.pos.set(0, 0, REPLAY_SAFE.z); } // never fall out of the world
  }

  speed() { return Math.hypot(this.vx, this.vz); }
}

const REPLAY_SAFE = { z: -4 };
