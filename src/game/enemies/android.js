import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { clamp, damp, yawTo, angleDiff, lerp, smooth, rand } from '../../core/util.js';

const SHOT_SPEED = 16;
const _dir = { x: 0, z: 0 };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// Ship security androids. They keep their distance, strafe, telegraph with visor and cannon glow, then fire a short dodgeable burst.
//  trooper - the standard unit
//  scout   - light and quick, short bursts
//  heavy   - armoured, slow, long bursts
export const ANDROID_VARIANTS = {
  trooper: { hp: 50, scale: 1, speed: 3.2, burst: 3, dmg: 8, heal: 16, body: 0x3a4148, trim: 0xd9a21b, keep: [6, 12], aimT: 0.65, gap: 0.2 },
  scout: { hp: 30, scale: 0.92, speed: 5.0, burst: 2, dmg: 6, heal: 10, body: 0x4d565c, trim: 0x2aa8b0, keep: [5, 10], aimT: 0.5, gap: 0.16, slim: true },
  heavy: { hp: 110, scale: 1.18, speed: 2.2, burst: 5, dmg: 9, heal: 32, body: 0x22282d, trim: 0xa8281c, keep: [7, 14], aimT: 0.85, gap: 0.14, bulky: true },
};

export class SecurityAndroid extends Enemy {
  constructor(game, x, z, variant = 'trooper') {
    super(game, x, 0, z);
    this.kind = 'android';
    this.variant = ANDROID_VARIANTS[variant] ? variant : 'trooper';
    this.v = ANDROID_VARIANTS[this.variant];
    this.heal = this.v.heal;
    this.radius = 0.38;
    this.hp = this.maxHp = this.v.hp;
    this.state = 'dormant';
    this.timer = 0;
    this.shots = 0;
    this.walk = Math.random() * 6;
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.charge = 0;
    this.flinch = 0;
    this.aimK = 0;
    this.hitSpheres = [{ c: new THREE.Vector3(), r: 0.36 }, { c: new THREE.Vector3(), r: 0.3 }];
    this.build();
    this.setScale(this.v.scale);
    this.group.rotation.y = this.yaw = Math.random() * 6.28;
    this.syncSpheres();
  }

  build() {
    const v = this.v, w = v.slim ? 0.85 : v.bulky ? 1.18 : 1;
    const body = this.trackFlash(new THREE.MeshStandardMaterial({ color: v.body, roughness: 0.42, metalness: 0.7, emissive: 0x000000 }));
    const trim = this.trackFlash(new THREE.MeshStandardMaterial({ color: v.trim, roughness: 0.5, metalness: 0.4, emissive: 0x000000 }));
    const joint = this.trackFlash(new THREE.MeshStandardMaterial({ color: 0x15191c, roughness: 0.6, metalness: 0.5, emissive: 0x000000 }));
    this.visorMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2a10, emissiveIntensity: 0.3 });
    this.gunMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5a20, emissiveIntensity: 0.2 });
    const box = (parent, sx, sy, sz, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); parent.add(m); return m; };
    const pivot = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    // pelvis and torso
    this.hips = pivot(this.group, 0, 0.95, 0);
    box(this.hips, 0.34 * w, 0.14, 0.2, 0, 0, 0, joint);
    this.torso = pivot(this.hips, 0, 0.08, 0);
    box(this.torso, 0.32 * w, 0.22, 0.22, 0, 0.12, 0, joint);                       // abdomen
    box(this.torso, 0.5 * w, 0.42, 0.3, 0, 0.42, 0, body);                           // chest
    box(this.torso, 0.4 * w, 0.16, 0.04, 0, 0.5, -0.16, trim);                       // chest plate
    box(this.torso, 0.34 * w, 0.36, 0.14, 0, 0.42, 0.21, joint);                     // backpack
    if (v.bulky) for (const s of [-1, 1]) box(this.torso, 0.22, 0.14, 0.32, s * 0.33 * w, 0.62, 0, trim); // pauldrons
    // head
    this.head = pivot(this.torso, 0, 0.7, 0);
    box(this.head, 0.06, 0.08, 0.06, 0, -0.04, 0, joint);
    box(this.head, 0.22, 0.24, 0.24, 0, 0.1, 0, body);
    this.visor = box(this.head, 0.19, 0.055, 0.02, 0, 0.12, -0.125, this.visorMat);
    box(this.head, 0.03, 0.12, 0.03, 0.08, 0.27, 0.05, joint);                       // antenna

    // arms: shoulder -> upper arm -> elbow -> forearm; the right forearm carries the cannon
    this.arms = [-1, 1].map((s) => {
      const sh = pivot(this.torso, s * 0.31 * w, 0.56, 0);
      box(sh, 0.12, 0.12, 0.12, 0, 0, 0, joint);
      box(sh, 0.1, 0.3, 0.1, 0, -0.17, 0, body);
      const el = pivot(sh, 0, -0.33, 0);
      box(el, 0.09, 0.28, 0.09, 0, -0.14, 0, body);
      let muzzle = null;
      if (s === 1) {
        const gun = pivot(el, 0, -0.26, 0);
        box(gun, 0.11 * (v.bulky ? 1.4 : 1), 0.11, 0.36, 0, 0, -0.08, joint);
        box(gun, 0.05, 0.05, 0.12, 0, 0, -0.3, this.gunMat);
        if (v.bulky) box(gun, 0.05, 0.05, 0.12, 0.06, 0, -0.3, this.gunMat);
        muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, -0.38); gun.add(muzzle);
      } else box(el, 0.08, 0.08, 0.08, 0, -0.3, 0, joint);
      return { s, sh, el, muzzle };
    });
    this.muzzle = this.arms[1].muzzle;

    // legs: hip -> thigh -> knee -> shin -> foot
    this.legs = [-1, 1].map((s) => {
      const hp = pivot(this.hips, s * 0.12 * w, -0.04, 0);
      box(hp, 0.14, 0.44, 0.16, 0, -0.22, 0, body);
      const kn = pivot(hp, 0, -0.45, 0);
      box(kn, 0.1, 0.1, 0.12, 0, 0, -0.03, joint);
      box(kn, 0.12, 0.42, 0.13, 0, -0.22, 0, body);
      const ft = pivot(kn, 0, -0.45, 0);
      box(ft, 0.13, 0.06, 0.26, 0, -0.02, -0.05, joint);
      return { s, hp, kn, ft };
    });
  }

  syncSpheres() {
    this.group.updateMatrixWorld(true);
    this.torso.localToWorld(this.hitSpheres[0].c.set(0, 0.42, 0));
    this.hips.localToWorld(this.hitSpheres[1].c.set(0, -0.35, 0));
  }

  centerPoint() { return this.hitSpheres[0].c.clone(); }

  activate() {
    super.activate();
    this.state = 'move';
    this.timer = rand(0.6, 1.4);
  }

  // shots make it flinch and give ground
  hitReact(dx, dz, dmg) {
    this.flinch = Math.min(1, this.flinch + 0.35 + dmg / 60);
    const l = Math.hypot(dx, dz) || 1;
    this.vx += (dx / l) * 2.2; this.vz += (dz / l) * 2.2;
    if (this.state === 'aim' && Math.random() < 0.35) { this.state = 'move'; this.timer = 0.5; } // knocked off its aim
  }

  canSee() {
    const p = this.game.player.pos, c = this.hitSpheres[0].c;
    return !this.game.world.blocked(c.x, c.y + 0.25, c.z, p.x, p.y + 1.2, p.z);
  }

  update(dt) {
    this.updateFlash(dt);
    const g = this.game;
    if (this.disabled) { this.powerDown(dt); this.syncSpheres(); return; }
    let move = 0, aiming = 0;
    this.flinch = Math.max(0, this.flinch - dt * 3);
    if (this.active && this.alive) {
      const p = g.player.pos;
      const dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
      const face = (rate) => { this.yaw += angleDiff(this.yaw, yawTo(dx, dz)) * Math.min(1, rate * dt); };
      this.timer -= dt;
      if (this.state === 'move') {
        face(6);
        const los = this.canSee();
        const [near, far] = this.v.keep;
        let tx = 0, tz = 0;
        if (!los || dist > far) {
          if (g.nav && g.nav.dir(this.pos.x, this.pos.z, _dir)) { tx = _dir.x; tz = _dir.z; } else { tx = dx / dist; tz = dz / dist; }
        } else if (dist < near) { tx = -dx / dist + (-dz / dist) * this.strafe * 0.5; tz = -dz / dist + (dx / dist) * this.strafe * 0.5; }
        else { tx = (-dz / dist) * this.strafe; tz = (dx / dist) * this.strafe; }
        if (Math.random() < dt * 0.4) this.strafe *= -1;
        const l = Math.hypot(tx, tz) || 1, sp = this.v.speed * (1 - 0.6 * this.flinch);
        this.vx = damp(this.vx, (tx / l) * sp, 8, dt);
        this.vz = damp(this.vz, (tz / l) * sp, 8, dt);
        if (los && this.timer <= 0 && dist < 20) { this.state = 'aim'; this.timer = this.v.aimT; g.sfxAt('droneCharge', this.pos, 1.0); }
      } else if (this.state === 'aim') {
        face(10);
        aiming = 1;
        this.vx = damp(this.vx, 0, 10, dt); this.vz = damp(this.vz, 0, 10, dt);
        this.charge = clamp(1 - this.timer / this.v.aimT, 0, 1);
        if (this.timer <= 0) {
          if (this.canSee()) { this.state = 'burst'; this.shots = 0; this.timer = 0; }
          else { this.state = 'move'; this.timer = 0.4; }
        }
      } else if (this.state === 'burst') {
        face(12);
        aiming = 1;
        this.vx = damp(this.vx, 0, 10, dt); this.vz = damp(this.vz, 0, 10, dt);
        if (this.timer <= 0) {
          if (this.shots < this.v.burst) { this.fire(); this.shots++; this.timer = this.v.gap; }
          else { this.state = 'move'; this.timer = rand(1.4, 2.6); this.strafe = Math.random() < 0.5 ? -1 : 1; }
        }
      }
      move = Math.hypot(this.vx, this.vz);
      this.pos.x += this.vx * dt; this.pos.z += this.vz * dt;
      this.separate(this.radius, dt);
      g.world.resolveCircle(this.pos, this.radius, 1.8, 0.3);
      const a = g.arena;
      this.pos.x = clamp(this.pos.x, a.minX + 0.5, a.maxX - 0.5);
      this.pos.z = clamp(this.pos.z, a.minZ + 0.5, a.maxZ - 0.5);
    }
    if (this.state !== 'aim') this.charge = damp(this.charge, 0, 8, dt);
    this.aimK = damp(this.aimK, aiming, 12, dt);
    this.pose(dt, move);
    this.group.rotation.y = this.yaw;
    const vis = this.active ? 1.6 + this.charge * 3 : this.warning ? 1.2 : 0.3;
    this.visorMat.emissiveIntensity = vis;
    this.gunMat.emissiveIntensity = 0.2 + this.charge * 4 + (this.state === 'burst' ? 1.5 : 0);
    this.syncSpheres();
  }

  // walk cycle, aiming arms and hit flinch
  pose(dt, move) {
    const m = clamp(move / 3, 0, 1);
    this.walk += dt * (2 + move * 2.4);
    for (const l of this.legs) {
      const ph = this.walk + (l.s > 0 ? Math.PI : 0);
      l.hp.rotation.x = Math.sin(ph) * 0.55 * m;
      l.kn.rotation.x = Math.max(0, Math.sin(ph + 1.4)) * 0.8 * m;
      l.ft.rotation.x = -l.kn.rotation.x * 0.3;
    }
    this.hips.position.y = 0.95 - Math.abs(Math.sin(this.walk)) * 0.03 * m;
    const p = this.game.player.pos, c = this.hitSpheres[0].c;
    const pitch = Math.atan2(p.y + 1.2 - c.y, Math.hypot(p.x - c.x, p.z - c.z) || 1);
    for (const a of this.arms) {
      const swing = Math.sin(this.walk + (a.s > 0 ? 0 : Math.PI)) * 0.4 * m;
      if (a.s > 0) { // cannon arm
        a.sh.rotation.x = lerp(swing * 0.5 - 0.15, -Math.PI / 2 + pitch, this.aimK);
        a.el.rotation.x = lerp(-0.35, 0, this.aimK);
        a.sh.rotation.z = lerp(0, 0.08, this.aimK);
      } else {
        a.sh.rotation.x = lerp(swing, -1.1, this.aimK);
        a.sh.rotation.z = lerp(0, -0.45, this.aimK);
        a.el.rotation.x = lerp(-0.25, -0.8, this.aimK);
      }
    }
    this.torso.rotation.x = -0.35 * this.flinch + 0.04 * m;
    this.head.rotation.x = -0.25 * this.flinch;
    this.torso.rotation.y = Math.sin(this.walk * 0.5) * 0.05 * m;
  }

  fire() {
    const g = this.game, p = g.player.pos;
    this.group.updateMatrixWorld(true);
    const from = this.muzzle.getWorldPosition(_v);
    const to = _w.set(p.x + rand(-0.25, 0.25), p.y + 1.1 + rand(-0.2, 0.2), p.z + rand(-0.25, 0.25));
    const dir = to.sub(from).normalize();
    g.projectiles.spawnEnemy(from.clone(), dir.clone(), SHOT_SPEED, this.v.dmg);
    g.sfxAt('droneShot', this.pos, 1.1);
    g.effects.flashLight(from, 0xff4020, 10, 0.07);
  }

  onDisable() {
    this.state = 'down';
    this.fx = {};
    this.charge = 0;
    this.aimK = 0;
    this.visorMat.emissive.setRGB(0.1, 0.55, 1);
    this.gunMat.emissive.setRGB(0.1, 0.55, 1);
    this.fallDir = Math.random() < 0.5 ? -1 : 1;
    this.game.sfxAt(this.variant === 'heavy' ? 'groan' : 'powerdown', this.pos, 1.3);
  }

  limp(k) { // arms hang loose
    for (const a of this.arms) { a.sh.rotation.x = lerp(a.sh.rotation.x, 0.15, k); a.sh.rotation.z = lerp(a.sh.rotation.z, a.s * 0.15, k); a.el.rotation.x = lerp(a.el.rotation.x, -0.2, k); }
  }

  // Each android shuts down in its own way:
  //  trooper - visor flickers, the cannon arm drops, knees buckle to a kneel, then it topples forward onto its face
  //  scout   - spun by its own momentum, its legs give out and it falls backward, limbs twitching
  //  heavy   - staggers back, the cannon arm clangs down, it sinks to its knees and stays there, head hanging, venting steam
  powerDown(dt) {
    const g = this.game, fx = g.effects;
    this.downT += dt;
    const t = this.downT;
    this.vx = damp(this.vx, 0, 5, dt); this.vz = damp(this.vz, 0, 5, dt);
    this.pos.x += this.vx * dt; this.pos.z += this.vz * dt;
    g.world.resolveCircle(this.pos, this.radius, 1.8, 0.3);
    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    const flick = t < 0.5 ? (Math.random() < 0.5 ? 1.6 : 0.1) : Math.max(0, 0.5 * (1 - (t - 0.5) / 0.5));
    this.visorMat.emissiveIntensity = flick;
    this.gunMat.emissiveIntensity = flick * 0.6;
    let D, rx = 0, rz = 0, gy = 0;
    if (this.variant === 'scout') {
      D = 1.4;
      this.yaw += dt * 7 * this.fallDir * (1 - smooth(t / 0.6));
      const fall = smooth((t - 0.25) / 0.55);
      for (const l of this.legs) { l.hp.rotation.x = lerp(0, -0.9, fall) + Math.sin(t * 30 + l.s) * 0.3 * (1 - smooth((t - 0.6) / 0.7)); l.kn.rotation.x = 0.4 * fall; }
      for (const a of this.arms) { a.sh.rotation.x = lerp(0, -2.4, fall) + Math.sin(t * 26 + a.s * 2) * 0.35 * (1 - smooth((t - 0.6) / 0.7)); a.sh.rotation.z = a.s * 0.6 * fall; }
      rx = 1.42 * fall; gy = 0.18 * fall;
      this.head.rotation.x = 0.3 * fall;
      if (!this.fx.a && t > 0.8) { this.fx.a = true; g.sfxAt('clatter', this.pos, 1); fx.hitSparks(this.hitSpheres[0].c, [1, 0.75, 0.3], 8); }
    } else if (this.variant === 'heavy') {
      D = 2.0;
      const back = smooth(t / 0.6);
      if (t < 0.6) { this.pos.x -= fwdX * dt * 0.9 * (1 - back); this.pos.z -= fwdZ * dt * 0.9 * (1 - back); }
      const drop = smooth((t - 0.35) / 0.25);
      const kneel = smooth((t - 0.8) / 0.8);
      for (const a of this.arms) {
        a.sh.rotation.x = a.s > 0 ? lerp(-1.2, 0.2, drop) : lerp(-0.6, 0.1, kneel);
        a.sh.rotation.z = a.s * 0.2 * kneel; a.el.rotation.x = -0.15;
      }
      for (const l of this.legs) { l.hp.rotation.x = lerp(0, -1.45, kneel); l.kn.rotation.x = lerp(0, 1.55, kneel); l.ft.rotation.x = lerp(0, -0.2, kneel); }
      this.hips.position.y = lerp(0.95, 0.47, kneel);
      this.torso.rotation.x = lerp(0, -0.5, smooth((t - 1.2) / 0.6));
      this.head.rotation.x = lerp(0, -0.6, smooth((t - 1.3) / 0.6));
      rz = Math.sin(t * 30) * 0.03 * (1 - back);
      if (!this.fx.a && t > 0.45) { this.fx.a = true; g.sfxAt('clatter', this.pos, 1.3); }
      if (!this.fx.b && t > 1.55) {
        this.fx.b = true;
        g.sfxAt('clatter', this.pos, 1.6);
        g.addShake(0.2 * clamp(1 - this.pos.distanceTo(g.player.pos) / 18, 0, 1));
        for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; fx.smokeP.emit(this.pos.x, 0.1, this.pos.z, Math.cos(a) * 1.5, rand(0.2, 0.8), Math.sin(a) * 1.5, rand(0.7, 1.2), rand(0.4, 0.7), 0.12, 0.12, 0.13, -0.2, 1, 1.2); }
      }
      if (t > 1.0 && Math.random() < 0.15) { // steam from the backpack
        this.torso.localToWorld(_v.set(0, 0.6, 0.28));
        fx.smokeP.emit(_v.x, _v.y, _v.z, rand(-0.2, 0.2), rand(0.6, 1.2), rand(-0.2, 0.2), rand(0.8, 1.4), rand(0.15, 0.3), 0.5, 0.55, 0.58, -0.6, 0.5, 2);
      }
    } else {
      D = 1.6;
      const drop = smooth(t / 0.3);
      const kneel = smooth((t - 0.2) / 0.55);
      const topple = smooth((t - 0.85) / 0.6);
      this.limp(drop);
      for (const l of this.legs) { l.hp.rotation.x = lerp(0, -1.3, kneel) * (1 - 0.6 * topple); l.kn.rotation.x = lerp(0, 1.5, kneel) * (1 - 0.5 * topple); }
      this.hips.position.y = lerp(0.95, 0.5, kneel) - 0.25 * topple;
      rx = -1.35 * topple; gy = 0.05 * topple;
      this.head.rotation.x = -0.3 * kneel;
      if (!this.fx.a && t > 0.5) { this.fx.a = true; g.sfxAt('clatter', this.pos, 0.9); }
      if (!this.fx.b && t > 1.4) { this.fx.b = true; g.sfxAt('clatter', this.pos, 1.2); g.addShake(0.08 * clamp(1 - this.pos.distanceTo(g.player.pos) / 15, 0, 1)); fx.hitSparks(this.hitSpheres[0].c, [1, 0.75, 0.3], 10); }
    }
    this.group.position.y = gy;
    this.group.rotation.set(rx, this.yaw, rz);
    if (t >= D) this.downDone = true;
  }
}
