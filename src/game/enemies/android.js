import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Enemy } from './enemy.js';
import { clamp, damp, yawTo, angleDiff, lerp, smooth, rand } from '../../core/util.js';

const SHOT_SPEED = 16;
const _dir = { x: 0, z: 0 };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// shared geometry: every android of a variant reuses the same shapes
const GEO = new Map();
const geo = (key, make) => { if (!GEO.has(key)) GEO.set(key, make()); return GEO.get(key); };
const rbox = (w, h, d, r = 0.03) => geo(`rb${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)));
const cap = (r, len) => geo(`cp${r}|${len}`, () => new THREE.CapsuleGeometry(r, len, 4, 10));
const ball = (r) => geo(`sp${r}`, () => new THREE.SphereGeometry(r, 14, 10));
const cyl = (r0, r1, h, n = 14) => geo(`cy${r0}|${r1}|${h}|${n}`, () => new THREE.CylinderGeometry(r0, r1, h, n));

// Ship security androids. They keep their distance, strafe, telegraph with visor and cannon glow, then fire a short dodgeable burst.
//  trooper - the standard unit
//  scout   - light and quick, short bursts
//  heavy   - armoured, slow, long bursts
export const ANDROID_VARIANTS = {
  trooper: { hp: 50, scale: 1, speed: 3.2, burst: 3, dmg: 8, heal: 16, shot: 'bolt', shotSpeed: 19, body: 0x2c3237, armor: 0xaab4bb, trim: 0xd9a21b, keep: [6, 12], aimT: 0.65, gap: 0.2 },
  scout: { hp: 30, scale: 0.92, speed: 5.0, burst: 4, dmg: 5, heal: 10, shot: 'needle', shotSpeed: 27, flank: true, body: 0x30373b, armor: 0xd2dad8, trim: 0x2aa8b0, keep: [5, 10], aimT: 0.5, gap: 0.09, slim: true },
  heavy: { hp: 110, scale: 1.18, speed: 2.2, burst: 3, dmg: 14, heal: 32, shot: 'plasma', shotSpeed: 10, body: 0x24292d, armor: 0x5d666d, trim: 0xa8281c, keep: [7, 14], aimT: 0.85, gap: 0.38, bulky: true },
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
    const v = this.v, w = v.slim ? 0.86 : v.bulky ? 1.2 : 1;
    const body = this.trackFlash(new THREE.MeshStandardMaterial({ color: v.body, roughness: 0.45, metalness: 0.45, emissive: 0x000000 }));
    const plate = this.trackFlash(new THREE.MeshStandardMaterial({ color: v.armor, roughness: 0.35, metalness: 0.25, emissive: 0x000000 }));
    const trim = this.trackFlash(new THREE.MeshStandardMaterial({ color: v.trim, roughness: 0.45, metalness: 0.45, emissive: 0x000000 }));
    const joint = this.trackFlash(new THREE.MeshStandardMaterial({ color: 0x1a1e21, roughness: 0.5, metalness: 0.5, emissive: 0x000000 }));
    this.visorMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2a10, emissiveIntensity: 0.3, side: THREE.DoubleSide });
    this.gunMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5a20, emissiveIntensity: 0.2 });
    this.lightMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: v.trim, emissiveIntensity: 1.2 });
    const put = (parent, g, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; };
    const pivot = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    // ---- pelvis: armoured hip block with a short plated skirt
    this.hips = pivot(this.group, 0, 0.95, 0);
    put(this.hips, rbox(0.32 * w, 0.14, 0.22, 0.05), joint, 0, 0, 0);
    put(this.hips, rbox(0.3 * w, 0.12, 0.05, 0.02), plate, 0, -0.03, -0.12, 0.15);
    for (const s of [-1, 1]) put(this.hips, rbox(0.1, 0.16, 0.2, 0.03), plate, s * 0.19 * w, -0.05, 0, 0, 0, s * 0.18);

    // ---- torso: ribbed waist, layered chest armour, collar, backpack with glowing vents
    this.torso = pivot(this.hips, 0, 0.08, 0);
    put(this.torso, cyl(0.11 * w, 0.13 * w, 0.2, 12), joint, 0, 0.1, 0);
    for (let i = 0; i < 3; i++) put(this.torso, rbox(0.27 * w - i * 0.01, 0.045, 0.19, 0.02), body, 0, 0.06 + i * 0.06, -0.01);
    put(this.torso, rbox(0.48 * w, 0.36, 0.28, 0.08), plate, 0, 0.42, 0);
    for (const s of [-1, 1]) put(this.torso, rbox(0.22 * w, 0.2, 0.06, 0.03), plate, s * 0.11 * w, 0.48, -0.15, 0.12, s * 0.12, 0); // chest plates
    put(this.torso, rbox(0.04, 0.26, 0.05, 0.015), joint, 0, 0.45, -0.165);
    put(this.torso, rbox(0.12, 0.05, 0.03, 0.012), trim, 0, 0.35, -0.155);                                                       // sternum badge
    put(this.torso, rbox(0.03, 0.03, 0.02, 0.008), this.lightMat, 0.14 * w, 0.32, -0.15);
    put(this.torso, rbox(0.3 * w, 0.06, 0.24, 0.03), joint, 0, 0.62, 0);                                                          // collar
    put(this.torso, rbox(0.34 * w, 0.38, 0.14, 0.05), plate, 0, 0.42, 0.2);                                                       // backpack
    for (let i = 0; i < 3; i++) put(this.torso, rbox(0.22 * w, 0.025, 0.02, 0.008), this.lightMat, 0, 0.32 + i * 0.07, 0.275);   // vents
    for (const s of [-1, 1]) put(this.torso, cyl(0.025, 0.025, 0.3, 8), joint, s * 0.12 * w, 0.5, 0.29, 0.2, 0, 0);               // coolant lines
    if (v.bulky) for (const s of [-1, 1]) { put(this.torso, rbox(0.26, 0.15, 0.34, 0.06), trim, s * 0.34 * w, 0.64, 0, 0, 0, s * -0.25); put(this.torso, rbox(0.2, 0.06, 0.3, 0.02), plate, s * 0.36 * w, 0.55, 0, 0, 0, s * -0.4); }

    // ---- head: neck cables, rounded helmet, wraparound glowing visor, sensor fin
    this.head = pivot(this.torso, 0, 0.7, 0);
    put(this.head, cyl(0.045, 0.06, 0.09, 10), joint, 0, -0.02, 0);
    put(this.head, rbox(0.22, 0.24, 0.25, 0.08), plate, 0, 0.12, 0.01);
    put(this.head, rbox(0.24, 0.07, 0.2, 0.03), trim, 0, 0.23, 0.03);
    this.visor = put(this.head, geo('visor', () => new THREE.CylinderGeometry(0.118, 0.118, 0.055, 20, 1, true, Math.PI * 0.62, Math.PI * 0.76)), this.visorMat, 0, 0.12, 0.01);
    for (const s of [-1, 1]) put(this.head, rbox(0.03, 0.11, 0.12, 0.012), joint, s * 0.115, 0.1, 0.03);
    put(this.head, rbox(0.02, 0.1, 0.12, 0.01), trim, 0, 0.29, 0.06, -0.3, 0, 0);

    // ---- arms: ball shoulder, armoured upper arm, elbow joint, forearm; the right forearm ends in the cannon
    this.arms = [-1, 1].map((s) => {
      const sh = pivot(this.torso, s * 0.3 * w, 0.56, 0);
      put(sh, ball(0.075), joint, 0, 0, 0);
      put(sh, rbox(0.15, 0.12, 0.17, 0.05), v.bulky ? trim : plate, s * 0.03, 0.04, 0, 0, 0, s * -0.2); // shoulder cap
      put(sh, cap(0.05, 0.2), body, 0, -0.17, 0);
      const el = pivot(sh, 0, -0.33, 0);
      put(el, ball(0.055), joint, 0, 0, 0);
      put(el, cap(0.048, 0.18), body, 0, -0.14, 0);
      put(el, rbox(0.1, 0.14, 0.11, 0.03), plate, 0, -0.15, -0.01);
      let muzzle = null, gun = null;
      if (s === 1) {
        gun = pivot(el, 0, -0.26, 0);
        const gw = v.bulky ? 1.35 : 1;
        put(gun, rbox(0.13 * gw, 0.13, 0.3, 0.04), joint, 0, 0, -0.06);
        put(gun, cyl(0.04, 0.045, 0.22, 12), body, 0, 0, -0.27, Math.PI / 2, 0, 0);
        for (const z of [-0.2, -0.3]) put(gun, cyl(0.052, 0.052, 0.025, 12), trim, 0, 0, z, Math.PI / 2, 0, 0);
        put(gun, cyl(0.028, 0.028, 0.02, 10), this.gunMat, 0, 0, -0.385, Math.PI / 2, 0, 0);
        if (v.bulky) { put(gun, cyl(0.03, 0.035, 0.2, 10), body, 0.07, -0.02, -0.25, Math.PI / 2, 0, 0); put(gun, cyl(0.02, 0.02, 0.02, 8), this.gunMat, 0.07, -0.02, -0.36, Math.PI / 2, 0, 0); }
        put(gun, rbox(0.03, 0.03, 0.06, 0.01), this.lightMat, 0, 0.075, -0.05);
        muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, -0.4); gun.add(muzzle);
      } else {
        put(el, rbox(0.09, 0.08, 0.1, 0.03), joint, 0, -0.29, 0);
        for (const f of [-1, 0, 1]) put(el, rbox(0.022, 0.07, 0.022, 0.008), joint, f * 0.028, -0.35, -0.02);
      }
      return { s, sh, el, muzzle, gun };
    });
    this.muzzle = this.arms[1].muzzle;

    // ---- legs: hip ball, plated thigh, knee pad, armoured shin, two-part foot
    this.legs = [-1, 1].map((s) => {
      const hp = pivot(this.hips, s * 0.12 * w, -0.04, 0);
      put(hp, ball(0.075), joint, 0, 0, 0);
      put(hp, cap(0.07, 0.28), body, 0, -0.22, 0);
      put(hp, rbox(0.13, 0.22, 0.06, 0.025), plate, 0, -0.2, -0.07);
      const kn = pivot(hp, 0, -0.45, 0);
      put(kn, ball(0.062), joint, 0, 0, 0);
      put(kn, rbox(0.1, 0.11, 0.07, 0.03), trim, 0, 0.01, -0.06);
      put(kn, cap(0.058, 0.3), body, 0, -0.22, 0);
      put(kn, rbox(0.11, 0.26, 0.06, 0.025), plate, 0, -0.22, -0.06);
      const ft = pivot(kn, 0, -0.45, 0);
      put(ft, ball(0.045), joint, 0, 0.01, 0);
      put(ft, rbox(0.13, 0.065, 0.18, 0.025), joint, 0, -0.025, -0.02);
      put(ft, rbox(0.12, 0.05, 0.1, 0.02), plate, 0, -0.03, -0.14, 0.15, 0, 0);
      return { s, hp, kn, ft };
    });
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  }

  syncSpheres() {
    this.group.updateMatrixWorld(true);
    this.torso.localToWorld(this.hitSpheres[0].c.set(0, 0.42, 0));
    this.hips.localToWorld(this.hitSpheres[1].c.set(0, -0.35, 0));
  }

  centerPoint() { return this.hitSpheres[0].c.clone(); }

  warn() { if (!this.warning) { this.game.sfxAt('bootup', this.pos, 0.55); this.game.effects.hitSparks(this.hitSpheres[0].c, [1, 0.6, 0.3], 8); } super.warn(); }

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

  // Choose where to fight from: a clear shot at the player, inside its preferred range, close to cover,
  // away from its squadmates, not too far to walk. Scouts like the player's flanks.
  pickSpot() {
    const g = this.game, nav = g.nav, p = g.player.pos, a = g.arena;
    this.goalT = rand(2.5, 4.5);
    if (!nav) { this.goal = null; this.field = null; return; }
    const [near, far] = this.v.keep, mid = (near + far) / 2;
    const pts = (g.waypoints || []).map((w) => ({ x: w.x, z: w.z }));
    for (let i = 0; i < 10; i++) { const an = rand(0, Math.PI * 2), r = rand(near, far); pts.push({ x: p.x + Math.cos(an) * r, z: p.z + Math.sin(an) * r }); }
    const fx = -Math.sin(g.player.yaw), fz = -Math.cos(g.player.yaw);
    let best = null, bs = -1e9;
    for (const q of pts) {
      if (q.x < a.minX + 0.8 || q.x > a.maxX - 0.8 || q.z < a.minZ + 0.8 || q.z > a.maxZ - 0.8 || !nav.open(q.x, q.z)) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z) || 0.01;
      let sc = -Math.abs(d - mid) * 0.35;
      sc += g.world.blocked(q.x, 1.35, q.z, p.x, p.y + 1.2, p.z) ? -2.5 : 3;
      for (const [cx, cz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const h = g.world.raycast(q.x, 0.8, q.z, cx, 0, cz, 1.4, (bx) => bx.maxY >= 1 && bx.tag !== 'door');
        if (h) { sc += 1.1; break; }
      }
      for (const o of g.enemies) {
        if (o === this || !o.alive || o.kind !== 'android') continue;
        if (o.goal && Math.hypot(o.goal.x - q.x, o.goal.z - q.z) < 3) sc -= 3;
        if (Math.hypot(o.pos.x - q.x, o.pos.z - q.z) < 2) sc -= 1.5;
      }
      sc -= Math.hypot(q.x - this.pos.x, q.z - this.pos.z) * 0.12;
      if (this.v.flank) sc += (1 - ((q.x - p.x) / d * fx + (q.z - p.z) / d * fz)) * 1.4;
      sc += Math.random();
      if (sc > bs) { bs = sc; best = q; }
    }
    if (!best) { this.goal = null; this.field = null; return; }
    this.goal = best;
    this.field = nav.field(best.x, best.z);
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
        this.goalT = (this.goalT || 0) - dt;
        // stuck: wanted to move but barely did
        this.chkT = (this.chkT || 0) - dt;
        if (this.chkT <= 0) {
          if (this.goal && this.lastX !== undefined && Math.hypot(this.pos.x - this.lastX, this.pos.z - this.lastZ) < 0.25) this.goalT = 0;
          this.lastX = this.pos.x; this.lastZ = this.pos.z; this.chkT = 0.9;
        }
        if (!this.goal || this.goalT <= 0 || dist < this.v.keep[0] * 0.55) this.pickSpot();
        let tx = 0, tz = 0;
        if (this.goal) {
          const gx = this.goal.x - this.pos.x, gz = this.goal.z - this.pos.z, gd = Math.hypot(gx, gz);
          if (gd > 0.6) {
            if (this.field && g.nav && g.nav.dirIn(this.field, this.pos.x, this.pos.z, _dir)) { tx = _dir.x; tz = _dir.z; } else { tx = gx / gd; tz = gz / gd; }
          } else { tx = (-dz / dist) * this.strafe * 0.35; tz = (dx / dist) * this.strafe * 0.35; } // holding the spot: small sidesteps
        } else if (g.nav && g.nav.dir(this.pos.x, this.pos.z, _dir)) { tx = _dir.x; tz = _dir.z; }
        if (Math.random() < dt * 0.5) this.strafe *= -1;
        const l = Math.hypot(tx, tz) || 1, sp = this.v.speed * (1 - 0.6 * this.flinch) * Math.min(1, Math.hypot(tx, tz) + 0.2);
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
    const stride0 = Math.floor(this.walk / Math.PI);
    this.walk += dt * (2 + move * 2.4);
    if (m > 0.25 && Math.floor(this.walk / Math.PI) !== stride0) this.game.sfxAt('botstep', this.pos, 0.3);
    // standing by: slumped, head down, until the alarm wakes it; then it straightens from the feet up
    this.bootK = damp(this.bootK ?? 0, this.warning || this.active ? 1 : 0, 2.6, dt);
    this.lifeT = (this.lifeT || 0) + dt;
    const asleep = 1 - this.bootK, seedPh = (this.pos.x * 3.1 + this.pos.z * 1.7) % 6.28;
    for (const l of this.legs) {
      const ph = this.walk + (l.s > 0 ? Math.PI : 0);
      l.hp.rotation.x = Math.sin(ph) * 0.55 * m;
      l.kn.rotation.x = -Math.max(0, Math.sin(ph + 1.4)) * 0.8 * m;
      l.ft.rotation.x = -l.kn.rotation.x * 0.3;
    }
    this.hips.position.y = 0.95 - Math.abs(Math.sin(this.walk)) * 0.03 * m - 0.09 * asleep + (1 - m) * Math.sin(this.lifeT * 1.3 + seedPh) * 0.006;
    if (asleep > 0.01) for (const l of this.legs) { l.hp.rotation.x += 0.32 * asleep; l.kn.rotation.x -= 0.6 * asleep; l.ft.rotation.x += 0.26 * asleep; }
    const p = this.game.player.pos, c = this.hitSpheres[0].c;
    const pitch = Math.atan2(p.y + 1.2 - c.y, Math.hypot(p.x - c.x, p.z - c.z) || 1);
    for (const a of this.arms) {
      const swing = Math.sin(this.walk + (a.s > 0 ? 0 : Math.PI)) * 0.4 * m;
      if (a.s > 0) { // cannon arm: the forearm comes up level with the target and the barrel swings into line with it
        const up = 1.22 + pitch * 0.5;
        a.sh.rotation.x = lerp(swing * 0.5 + 0.1, up, this.aimK);
        a.el.rotation.x = lerp(0.42, Math.PI / 2 + pitch - up, this.aimK);
        a.sh.rotation.z = lerp(0, -0.06, this.aimK);
        a.gun.rotation.x = lerp(-0.25, -Math.PI / 2, this.aimK);
      } else { // the free hand comes across to steady it
        a.sh.rotation.x = lerp(swing, 0.82, this.aimK);
        a.sh.rotation.z = lerp(0, 0.42, this.aimK);
        a.el.rotation.x = lerp(0.3, 0.95, this.aimK);
      }
    }
    this.torso.rotation.x = 0.35 * this.flinch - 0.04 * m - 0.42 * asleep;
    this.head.rotation.x = 0.25 * this.flinch - 0.5 * asleep;
    // awake and not firing, it keeps looking about
    this.head.rotation.y = (1 - this.aimK) * this.bootK * (Math.sin(this.lifeT * 0.83 + seedPh) * 0.55 + Math.sin(this.lifeT * 2.1 + seedPh) * 0.1);
    if (asleep > 0.01) for (const a of this.arms) { a.sh.rotation.x -= 0.2 * asleep; a.el.rotation.x += 0.15 * asleep; }
    this.torso.rotation.y = Math.sin(this.walk * 0.5) * 0.05 * m;
  }

  fire() {
    const g = this.game, p = g.player.pos;
    this.group.updateMatrixWorld(true);
    const from = this.muzzle.getWorldPosition(_v);
    const to = _w.set(p.x + rand(-0.25, 0.25), p.y + 1.1 + rand(-0.2, 0.2), p.z + rand(-0.25, 0.25));
    const dir = to.sub(from).normalize();
    g.projectiles.spawnEnemy(from.clone(), dir.clone(), this.v.shotSpeed || SHOT_SPEED, this.v.dmg, this.v.shot);
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
    this.lightMat.emissive.setRGB(0.1, 0.55, 1);
    this.fallDir = Math.random() < 0.5 ? -1 : 1;
    this.game.sfxAt(this.variant === 'heavy' ? 'groan' : 'powerdown', this.pos, 1.3);
  }

  limp(k) { // arms hang loose
    for (const a of this.arms) { a.sh.rotation.x = lerp(a.sh.rotation.x, 0.15, k); a.sh.rotation.z = lerp(a.sh.rotation.z, a.s * 0.15, k); a.el.rotation.x = lerp(a.el.rotation.x, 0.2, k); }
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
    { const gn = this.arms[1].gun; gn.rotation.x = lerp(gn.rotation.x, 0, Math.min(1, dt * 8)); }
    let D, rx = 0, rz = 0, gy = 0;
    if (this.variant === 'scout') {
      D = 1.4;
      this.yaw += dt * 7 * this.fallDir * (1 - smooth(t / 0.6));
      const fall = smooth((t - 0.25) / 0.55);
      for (const l of this.legs) { l.hp.rotation.x = lerp(0, 0.9, fall) + Math.sin(t * 30 + l.s) * 0.3 * (1 - smooth((t - 0.6) / 0.7)); l.kn.rotation.x = -0.4 * fall; }
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
        a.sh.rotation.x = a.s > 0 ? lerp(1.2, 0.1, drop) : lerp(0.6, 0.05, kneel);
        a.sh.rotation.z = a.s * 0.2 * kneel; a.el.rotation.x = 0.15;
      }
      for (const l of this.legs) { l.hp.rotation.x = lerp(0, 1.45, kneel); l.kn.rotation.x = lerp(0, -1.55, kneel); l.ft.rotation.x = lerp(0, 0.2, kneel); }
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
      for (const l of this.legs) { l.hp.rotation.x = lerp(0, 1.3, kneel) * (1 - 0.6 * topple); l.kn.rotation.x = lerp(0, -1.5, kneel) * (1 - 0.5 * topple); }
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
