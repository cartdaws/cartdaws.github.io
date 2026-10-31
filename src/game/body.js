import * as THREE from 'three';
import { lerp, damp, clamp, angleDiff } from '../core/util.js';
import { makeGel } from '../world/materials.js';
import { TentacleMesh, makeTentacleGel, updateTentacleGels, bezier, SpringChain } from '../presentation/tentacle.js';

// ---------------------------------------------------------------------------------------------------------------------------------
// The player's body: a translucent bell carried by an improvised arrangement of limbs.
//
//  STRUCTURAL LIMBS (6)   bear weight. Each has an anchor region on the body, a planted world-space contact, a comfort radius, a step
//                         trigger, a raycast-chosen next contact, a curved swing and a planted phase. Movement only BIASES where the
//                         next contact is chosen; it never orients a limb. A planted tip stays fixed in the world while the body moves.
//  MANIPULATION TENTACLES (4)  soft and loose. They trail, droop, sway and occasionally probe a nearby surface.
//  SECONDARY NUBS (4)     short, thick and mostly decorative: slow organic motion under the bell.
//
// Everything is expressed in a body frame (R right, U up, F forward) built from the player's heading and the average normal of the
// surfaces the limbs hold, so the same logic carries over to walls and ceilings. First person is protected by a keep-out wedge: limbs
// choose contacts on the flanks and rear, never in the cone around the view direction.
// ---------------------------------------------------------------------------------------------------------------------------------
const N = 10;
const ROOT_R = 0.2;                                   // limb roots sit on this ring of the body
const KEEP_OUT = 0.95;                                // radians either side of forward that structural contacts avoid
// role, anchor angle from forward, ideal reach, comfort radius before a step, max reach, root height, same-side neighbour index
const LEGS = [
  { a: -1.2, r: 0.95, comfort: 0.34, max: 1.35, h: 0.06 }, { a: 1.2, r: 0.95, comfort: 0.34, max: 1.35, h: 0.06 },
  { a: -1.85, r: 1.1, comfort: 0.4, max: 1.5, h: 0.02 }, { a: 1.85, r: 1.1, comfort: 0.4, max: 1.5, h: 0.02 },
  { a: -2.6, r: 1.0, comfort: 0.36, max: 1.4, h: 0.02 }, { a: 2.6, r: 1.0, comfort: 0.36, max: 1.4, h: 0.02 },
];
const SOFT = [ // manipulation tentacles: root angle, root height, length, droop
  { a: -1.4, h: 0.22, len: 1.15 }, { a: 1.4, h: 0.22, len: 1.15 }, { a: -2.35, h: 0.14, len: 1.0 }, { a: 2.35, h: 0.14, len: 1.0 },
];
const NUBS = [{ a: -0.85, h: -0.04, len: 0.5 }, { a: 0.85, h: -0.04, len: 0.5 }, { a: -2.9, h: -0.02, len: 0.55 }, { a: 2.9, h: -0.02, len: 0.55 }];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const ZERO = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const smooth01 = (k) => k * k * (3 - 2 * k);

export class AlienBody {
  constructor(scene, world, player, geos) {
    this.world = world; this.player = player; this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;
    this.yaw = 0;
    this.rand = rng(90210);

    // ---- bell and core (Blender: art/build_body.py)
    const bellGel = makeGel({ color: 0x0a4a46, rim: 0x7ff0e0, alpha: 0.2 });
    this.bell = new THREE.Mesh(geos.BodyBell, bellGel);
    this.bell.position.y = -0.18;
    this.bell.renderOrder = 2;
    this.group.add(this.bell);
    const organ = makeGel({ color: 0x0f6a60, rim: 0xc6fff6, alpha: 0.5 });
    this.core = new THREE.Mesh(geos.BodyCore, organ);
    this.core.position.y = 0.05;
    this.group.add(this.core);

    // ---- body frame state
    this.pos = new THREE.Vector3();       // body centre (world)
    this.U = new THREE.Vector3(0, 1, 0);  // surface up (smoothed)
    this.F = new THREE.Vector3(0, 0, -1);
    this.R = new THREE.Vector3(1, 0, 0);
    this.vel = new THREE.Vector3();       // smoothed velocity
    this.acc = new THREE.Vector3();       // smoothed acceleration
    this.urgency = 0;                     // 0 calm .. 1 scrambling after an abrupt change
    this.pitch = 0; this.roll = 0; this.comp = 0; this.bob = 0;
    this.idleT = 0; this.checkT = 0;
    this.ready = false;

    // ---- structural limbs
    this.legGel = makeTentacleGel({ color: 0x0a4a46, rim: 0x7ff0e0, alpha: 0.55, length: 1.5, r0: 0.075, r1: 0.04 });
    this.legs = LEGS.map((d, i) => {
      const r = this.rand;
      const leg = {
        d, i, side: Math.sign(d.a),
        foot: new THREE.Vector3(), norm: new THREE.Vector3(0, 1, 0), from: new THREE.Vector3(), to: new THREE.Vector3(), toN: new THREE.Vector3(0, 1, 0),
        swing: -1, dur: 0.25, lift: 0.2, bow: 0.08,
        jitter: 0.85 + r() * 0.3, speedJ: 0.85 + r() * 0.3, liftJ: 0.7 + r() * 0.6, stiff: 0.85 + r() * 0.3, phase: r() * 6.28,
        restPlant: 0, airborne: false, landed: 0,
        root: new THREE.Vector3(), out: new THREE.Vector3(), ideal: Array.from({ length: N }, () => new THREE.Vector3()),
        chain: new SpringChain(N, 260 * (0.85 + r() * 0.3), 110, 0.9),
        c1: new THREE.Vector3(), c2: new THREE.Vector3(),
        mesh: new TentacleMesh({ rings: 24, radial: 12, material: this.legGel, radius: (t) => lerp(0.082, 0.042, Math.pow(t, 0.8)) * (1 + 0.1 * Math.sin(t * 9)) * (t > 0.92 ? Math.sqrt(Math.max(0.3, 1 - (t - 0.92) / 0.08 * 0.7)) : 1) }),
      };
      leg.mesh.mesh.renderOrder = 2;
      scene.add(leg.mesh.mesh);
      return leg;
    });

    // ---- soft tentacles and nubs
    this.softGel = makeTentacleGel({ color: 0x0c5a52, rim: 0x9ff7ea, alpha: 0.5, length: 1.1, r0: 0.05, r1: 0.02, suckers: 1.4 });
    this.soft = SOFT.map((d, i) => this.makeSoft(d, i, 0.05, 0.018, this.softGel, 460 + i * 33, 70, 18, 0.75));
    this.nubGel = makeTentacleGel({ color: 0x0c5a52, rim: 0x9ff7ea, alpha: 0.5, length: 0.55, r0: 0.045, r1: 0.022, suckers: 0.8 });
    this.nubs = NUBS.map((d, i) => this.makeSoft(d, i + 10, 0.048, 0.024, this.nubGel, 320 + i * 17, 140, 40, 0.8));
  }

  makeSoft(d, i, r0, r1, gel, seed, kRoot, kTip, damping) {
    const r = rng(seed);
    const s = {
      d, i, ph: r() * 6.28, f1: 0.7 + r() * 0.8, f2: 0.5 + r() * 0.7, curl: 0.5 + r() * 0.8,
      root: new THREE.Vector3(), ideal: Array.from({ length: N }, () => new THREE.Vector3()), chain: new SpringChain(N, kRoot, kTip, damping),
      probeT: 3 + r() * 6, probe: 0, probePt: new THREE.Vector3(), probeN: new THREE.Vector3(0, 1, 0), probing: false,
      mesh: new TentacleMesh({ rings: 18, radial: 10, material: gel, radius: (t) => lerp(r0, r1, Math.pow(t, 0.85)) * (1 + 0.1 * Math.sin(t * 8 + i)) }),
    };
    s.mesh.mesh.renderOrder = 2;
    this.scene.add(s.mesh.mesh);
    return s;
  }

  dispose(scene) {
    scene.remove(this.group);
    for (const l of [...this.legs, ...this.soft, ...this.nubs]) scene.remove(l.mesh.mesh);
  }

  setVisible(v) {
    this.group.visible = v;
    for (const l of [...this.legs, ...this.soft, ...this.nubs]) l.mesh.mesh.visible = v;
  }

  reset() { this.ready = false; this.yaw = this.player.yaw; }

  // ---------------------------------------------------------------- surface queries
  // Find where a limb can touch near a wanted world point. Casts along -up from above; falls back to an outward cast so a wall can serve
  // as the contact. Returns false when nothing sensible is found.
  contact(want, root, outDir, U, outPos, outN) {
    const w = this.world, p = this.player;
    const filt = (b) => b.tag !== 'door' || b.enabled;
    // never reach through solids: pull the wanted point toward the body until the line from the root is clear
    _a.copy(want);
    for (let k = 0; k < 3; k++) {
      if (!w.blocked(root.x, root.y, root.z, _a.x, _a.y + 0.05, _a.z, filt)) break;
      _a.lerp(root, 0.35);
    }
    _b.copy(_a).addScaledVector(U, 1.3);
    const hit = w.raycast(_b.x, _b.y, _b.z, -U.x, -U.y, -U.z, 2.6, filt);
    if (hit && hit.t < 2.6) {
      outPos.copy(_b).addScaledVector(U, -hit.t); outN.set(hit.nx, hit.ny, hit.nz);
      // a tall solid that sits above the foot height is not floor: use it as a wall contact only when it faces us
      if (outN.dot(U) > -0.2) return true;
    }
    // wall fallback: cast outward from the root
    const hw = w.raycast(root.x, root.y, root.z, outDir.x, outDir.y, outDir.z, 1.3, filt);
    if (hw) { outPos.copy(root).addScaledVector(outDir, hw.t - 0.02); outN.set(hw.nx, hw.ny, hw.nz); return true; }
    const gy = w.groundHeight(_a.x, _a.z, p.pos.y + 0.4, 0.2);
    outPos.set(_a.x, gy, _a.z); outN.copy(U);
    return true;
  }

  // Ideal anchor for a limb at the current body pose (world), optionally shifted by a stride bias along the surface.
  anchor(leg, out, bias) {
    const d = leg.d;
    const x = Math.sin(d.a) * d.r, f = Math.cos(d.a) * d.r;
    out.copy(this.pos).addScaledVector(this.R, x).addScaledVector(this.F, f).addScaledVector(this.U, -0.5);
    out.y = this.groundY(out) ;
    if (bias) out.addScaledVector(bias, 1);
    return out;
  }

  groundY(p) { return this.world.groundHeight(p.x, p.z, this.player.pos.y + 0.4, 0.2); }

  // ---------------------------------------------------------------- stepping
  chooseTarget(leg, bias, outPos, outN) {
    const d = leg.d;
    // local target = anchor + stride bias, expressed relative to the body
    let x = Math.sin(d.a) * d.r + bias.x, f = Math.cos(d.a) * d.r + bias.z;
    // first person keep-out: structural contacts stay on the flanks and rear
    const ang = Math.atan2(x, f), rad = Math.hypot(x, f);
    const limit = KEEP_OUT * (leg.d.a * leg.d.a < 2 ? 1 : 0.6);
    if (Math.abs(ang) < limit && rad > 0.35) { const s = Math.sign(ang || leg.side); x = Math.sin(s * limit) * rad; f = Math.cos(limit) * rad; }
    // slight irregularity in where this limb likes to land
    const j = leg.jitter, ph = this.time * 0.2 + leg.phase;
    x += Math.sin(ph) * 0.06 * j; f += Math.cos(ph * 1.3) * 0.06 * j;
    _c.copy(this.pos).addScaledVector(this.R, x).addScaledVector(this.F, f).addScaledVector(this.U, -0.5);
    _d.copy(this.R).multiplyScalar(Math.sin(d.a)).addScaledVector(this.F, Math.cos(d.a)).normalize();   // outward direction of this limb from the body
    this.contact(_c, leg.root, _d, this.U, outPos, outN);
  }

  beginStep(leg, bias) {
    this.chooseTarget(leg, bias, leg.to, leg.toN);
    leg.from.copy(leg.foot);
    const hd = Math.hypot(leg.to.x - leg.from.x, leg.to.z - leg.from.z);
    const sp = this.vel.length();
    leg.dur = clamp(0.4 - sp * 0.034, 0.13, 0.4) * leg.speedJ * (1 - 0.35 * this.urgency) * (0.75 + Math.min(hd, 1.0) * 0.35);
    leg.lift = (0.1 + Math.min(hd, 0.8) * 0.28) * leg.liftJ + Math.max(0, leg.to.y - leg.from.y) * 1.2;
    leg.bow = 0.05 + 0.09 * leg.liftJ;
    leg.swing = 0;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const p = this.player, t = (this.time += dt);
    // ---- smoothed motion state
    _a.set(p.vx, 0, p.vz);
    _b.copy(_a).sub(this.vel);
    const a2 = _b.divideScalar(Math.max(dt, 1e-3));
    this.acc.lerp(a2, 1 - Math.exp(-10 * dt));
    this.vel.lerp(_a, 1 - Math.exp(-14 * dt));
    const speed = this.vel.length();
    this.urgency = damp(this.urgency, clamp(this.acc.length() / 16, 0, 1), this.urgency < this.acc.length() / 16 ? 12 : 3, dt);
    this.yaw += angleDiff(this.yaw, p.yaw) * Math.min(1, 6 * dt);

    // ---- body frame: heading + surface up from the planted contacts
    if (!this.ready) { this.U.set(0, 1, 0); }
    _a.set(0, 0, 0); let nsup = 0;
    for (const l of this.legs) if (l.swing < 0 && !l.airborne) { _a.add(l.norm); nsup++; }
    if (nsup > 2) { _a.divideScalar(nsup).normalize(); this.U.lerp(_a, 1 - Math.exp(-3 * dt)).normalize(); }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    _b.set(-sy, 0, -cy);
    this.F.copy(_b).addScaledVector(this.U, -_b.dot(this.U)).normalize();
    this.R.crossVectors(this.F, this.U).normalize();

    // ---- body position: follows the player with inertia; sags when limbs are in the air
    const swinging = this.legs.filter((l) => l.swing >= 0).length;
    this.comp = damp(this.comp, swinging * 0.025 + Math.min(1, speed / 8) * 0.03, 10, dt);
    const lagX = clamp(-this.acc.x * 0.012, -0.12, 0.12), lagZ = clamp(-this.acc.z * 0.012, -0.12, 0.12);
    this.pos.set(p.pos.x + lagX, p.pos.y + 0.5 - this.comp, p.pos.z + lagZ).addScaledVector(this.U, 0);
    this.bob = Math.sin(t * 6.2) * 0.012 * Math.min(1, speed / 6) * (p.grounded ? 1 : 0);
    this.pos.y += this.bob;

    // inertia lean: accelerate forward -> nose dips back, strafe -> roll
    const accF = this.acc.dot(this.F), accR = this.acc.dot(this.R);
    this.pitch = damp(this.pitch, clamp(accF * 0.012, -0.22, 0.22) + Math.sin(t * 3.1) * 0.01, 7, dt);
    this.roll = damp(this.roll, clamp(-accR * 0.012, -0.22, 0.22) + Math.sin(t * 2.3 + 1) * 0.012, 7, dt);

    this.idleT = speed < 0.15 ? this.idleT + dt : 0;

    // ---- first frame (or after a teleport): plant every limb under the body at once
    this.computeRoots();
    let teleported = !this.ready;
    for (const l of this.legs) if (l.foot.distanceTo(l.root) > 3.2) teleported = true;
    if (teleported) {
      for (const l of this.legs) { this.chooseTarget(l, ZERO, l.foot, l.norm); l.swing = -1; l.chain.ready = false; l.airborne = false; }
      for (const s of [...this.soft, ...this.nubs]) s.chain.ready = false;
      this.ready = true;
    }

    // ---- stride bias: only shifts WHERE the next contact is chosen
    const stride = clamp(0.1 + speed * 0.115, 0, 0.95);
    const bias = _d.set(0, 0, 0);
    if (speed > 0.2) { bias.copy(this.vel).normalize().multiplyScalar(stride); }
    // express the world bias in the body frame (x right, z forward)
    const biasLocal = new THREE.Vector3(bias.dot(this.R), 0, bias.dot(this.F));

    const air = !p.grounded;
    this.stepLogic(dt, air, biasLocal, speed);

    // ---- apply pose
    _m.makeBasis(this.R, this.U, _b.copy(this.F).negate());
    this.group.quaternion.setFromRotationMatrix(_m);
    this.group.quaternion.multiply(_q.setFromEuler(new THREE.Euler(-this.pitch, 0, this.roll, 'YXZ')));
    this.group.position.copy(this.pos);
    this.bell.scale.set(1 + Math.sin(t * 1.8) * 0.025 + this.comp * 0.6, 1 - Math.sin(t * 1.8) * 0.02 - this.comp * 0.8, 1 + Math.sin(t * 1.8) * 0.025 + this.comp * 0.6);
    this.core.scale.setScalar(1 + Math.sin(t * 2.4) * 0.12);
    this.core.rotation.y = t * 0.2;

    for (const l of this.legs) this.shapeLeg(l, dt, speed, air);
    this.separateLegs();
    for (const l of this.legs) l.mesh.update(l.chain.p);
    this.shapeSoft(dt, speed);
    updateTentacleGels(t, 0);
  }

  computeRoots() {
    for (const l of [...this.legs]) {
      const d = l.d;
      l.out.copy(this.R).multiplyScalar(Math.sin(d.a)).addScaledVector(this.F, Math.cos(d.a)).normalize();
      l.root.copy(this.pos).addScaledVector(l.out, ROOT_R).addScaledVector(this.U, d.h);
    }
  }

  stepLogic(dt, air, biasLocal, speed) {
    // airborne: limbs tuck; landing replants them with staggered steps
    if (air) {
      for (const l of this.legs) { if (!l.airborne) { l.airborne = true; l.swing = -1; } }
    } else {
      for (const l of this.legs) if (l.airborne) { l.airborne = false; l.landed = 1; l.restPlant = 0; this.beginStepDelayed(l); }
    }
    const maxSwing = this.urgency > 0.5 || speed > 5 ? 4 : 3;
    let swingingNow = 0;
    for (const l of this.legs) {
      if (l.airborne) continue;
      if (l.swing >= 0) {
        swingingNow++;
        l.swing += dt / l.dur;
        const k = Math.min(1, l.swing), e = smooth01(k);
        l.foot.lerpVectors(l.from, l.to, e);
        // curved path: lift along the surface normal and bow outward; the leg lifts early and settles late
        const arc = Math.sin(Math.PI * Math.pow(k, 0.85));
        l.foot.addScaledVector(l.norm, l.lift * arc);
        l.foot.addScaledVector(l.out, l.bow * arc);
        if (k >= 1) { l.swing = -1; l.foot.copy(l.to); l.norm.copy(l.toN); l.landed = 1; l.restPlant = (0.06 + Math.random() * 0.1) * (1 - Math.min(0.7, this.vel.length() / 9)); }
      } else {
        l.restPlant = Math.max(0, l.restPlant - dt);
        l.landed = Math.max(0, l.landed - dt * 5);
      }
    }
    if (air) return;
    // gait: pick the most strained planted limb(s); never two neighbours on one side; a short planted phase before moving again
    const cand = [];
    this.checkT -= dt;
    const recheck = this.checkT <= 0;
    if (recheck) this.checkT = 0.3;
    for (const l of this.legs) {
      if (l.swing >= 0 || l.restPlant > 0) continue;
      this.anchor(l, _a, null);
      const off = Math.hypot(l.foot.x - _a.x, l.foot.z - _a.z);
      const reach = l.foot.distanceTo(l.root);
      let strain = off / ((l.d.comfort + Math.min(speed * 0.095, 0.75)) * l.stiff * (1 - 0.3 * this.urgency));
      if (reach > l.d.max * 0.92) strain = Math.max(strain, 1.6);
      { // a planted foot that has ended up in the view cone (e.g. walking backward past it) must be re-placed on the flank
        _b.subVectors(l.foot, this.pos); const fx = _b.dot(this.R), ff = _b.dot(this.F);
        if (ff > 0.25 && Math.abs(Math.atan2(fx, ff)) < KEEP_OUT * 0.85) strain = Math.max(strain, 1.8);
      }
      if (recheck) { // surface change: the floor under a planted foot is no longer where it was
        const gy = this.groundY(l.foot);
        if (Math.abs(gy - l.foot.y) > 0.14 && l.norm.y > 0.8) strain = Math.max(strain, 1.3);
      }
      if (this.idleT > 1.4 + l.jitter && off > 0.1 && Math.random() < dt * 0.6) strain = Math.max(strain, 1.01);   // idle shuffle
      if (strain > 1) cand.push({ l, strain });
    }
    cand.sort((x, y) => y.strain - x.strain);
    for (const c of cand) {
      if (swingingNow >= maxSwing) break;                                  // always keep enough limbs planted to hold the body
      const l = c.l;
      if (this.legs.filter((o) => o.side === l.side && o.swing >= 0).length >= 2) continue;   // never lift a whole side
      const adj = this.legs.some((o) => o !== l && o.side === l.side && Math.abs(o.i - l.i) === 2 && o.swing >= 0);
      if (adj && c.strain < 1.5) continue;
      this.beginStep(l, biasLocal);
      swingingNow++;
    }
  }

  beginStepDelayed(l) { l.swing = -1; l.restPlant = 0; l.foot.copy(l.root).addScaledVector(l.out, 0.5).addScaledVector(this.U, -0.4); l.norm.copy(this.U); l.from.copy(l.foot); this.beginStep(l, ZERO); l.dur *= 0.8; }

  // ---------------------------------------------------------------- shapes
  shapeLeg(l, dt, speed, air) {
    const t = this.time, ideal = l.ideal, U = this.U;
    if (air) {
      // tucked and trailing the fall: loose, curled under the bell, drifting against the velocity (never ahead of it)
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        ideal[i].copy(l.root).addScaledVector(l.out, 0.18 + 0.35 * Math.sin(u * 2.4)).addScaledVector(U, -0.1 - 0.5 * u + 0.12 * Math.sin(u * 5)).addScaledVector(this.vel, -0.025 * u);
        ideal[i].addScaledVector(this.R, Math.sin(t * 2 + u * 4 + l.phase) * 0.04 * u);
      }
      l.foot.copy(ideal[N - 1]); l.norm.copy(U);
      l.chain.step(ideal, dt);
      return;
    }
    const foot = l.foot, n = l.norm, root = l.root;
    _a.subVectors(foot, root);
    const hd = Math.hypot(_a.dot(this.R), _a.dot(this.F));           // horizontal span root -> foot
    const reachK = clamp(_a.length() / l.d.max, 0, 1);               // 0 relaxed .. 1 fully stretched
    const arch = (0.34 + 0.22 * l.liftJ) * (1 - 0.3 * reachK) + 0.12;   // stretched limbs flatten; relaxed limbs arch
    // control points: up and OUT from the body, then down onto the contact along its normal. Never a straight line.
    l.c1.copy(root).addScaledVector(U, arch * 1.1).addScaledVector(l.out, 0.12 + 0.3 * hd * 0.5);
    l.c2.copy(foot).addScaledVector(n, 0.2 + arch * 0.9).addScaledVector(l.out, -0.05);
    for (let i = 0; i < N; i++) bezier(root, l.c1, l.c2, foot, i / (N - 1), ideal[i]);
    // flowing secondary motion: a wave travelling root -> tip, bigger when moving, plus torsion
    const amp = (0.025 + 0.03 * Math.min(1, speed / 6)) * (1 - 0.5 * (l.swing < 0 ? 1 : 0));
    for (let i = 1; i < N - 1; i++) {
      const w = i / (N - 1), s = Math.sin(Math.PI * w);
      ideal[i].addScaledVector(this.R, Math.sin(t * 2.1 + l.phase + w * 5) * amp * s);
      ideal[i].addScaledVector(U, Math.sin(t * 1.7 + l.phase * 1.3 - w * 4) * amp * 0.7 * s);
      // compression: a freshly landed limb squats a little
      ideal[i].addScaledVector(U, -l.landed * 0.05 * s);
    }
    // the contact: last segments meet the surface along its normal (a pad, not a point)
    ideal[N - 1].copy(foot);
    ideal[N - 2].copy(foot).addScaledVector(n, 0.1).addScaledVector(l.out, 0.02);
    for (let i = 1; i < N - 1; i++) this.avoidCenter(ideal[i], l.side);
    l.chain.step(ideal, dt);
    l.chain.p[N - 1].copy(foot);                                     // planted tip stays exactly where it landed
  }

  // First person: nothing but a contact pad may sit in the cone around the view direction. Points inside it are pushed out and down.
  avoidCenter(pt, side) {
    const p = this.player, cp = Math.cos(p.pitch), vx = -Math.sin(p.yaw) * cp, vy = Math.sin(p.pitch), vz = -Math.cos(p.yaw) * cp;
    const ex = pt.x - p.pos.x, ey = pt.y - (p.pos.y + 1.55), ez = pt.z - p.pos.z;
    const along = ex * vx + ey * vy + ez * vz;
    if (along < 0.25) return;
    let px = ex - vx * along, py = ey - vy * along, pz = ez - vz * along;
    const perp = Math.hypot(px, py, pz), need = along * Math.tan(0.62);
    if (perp >= need) return;
    if (perp < 1e-3) { px = -vz * side; py = -0.6; pz = vx * side; } 
    const k = need / Math.max(perp, 1e-3), kk = Math.min(k, 6);
    pt.x = p.pos.x + vx * along + px * kk; pt.y = p.pos.y + 1.55 + vy * along + py * kk; pt.z = p.pos.z + vz * along + pz * kk;
  }

  // limbs are thick; keep neighbours from interpenetrating
  separateLegs() {
    for (let a = 0; a < this.legs.length; a++) for (let b = a + 1; b < this.legs.length; b++) {
      const A = this.legs[a].chain.p, B = this.legs[b].chain.p;
      for (let i = 2; i < N - 2; i++) {
        _a.subVectors(A[i], B[i]);
        const d = _a.length();
        if (d < 0.14 && d > 1e-4) { _a.multiplyScalar((0.14 - d) / d * 0.5); A[i].add(_a); B[i].sub(_a); }
      }
    }
  }

  shapeSoft(dt, speed) {
    const t = this.time, U = this.U;
    const all = [...this.soft.map((s) => ({ s, kind: 'soft' })), ...this.nubs.map((s) => ({ s, kind: 'nub' }))];
    for (const { s, kind } of all) {
      const d = s.d, ideal = s.ideal, len = d.len;
      _a.copy(this.R).multiplyScalar(Math.sin(d.a)).addScaledVector(this.F, Math.cos(d.a)).normalize();      // outward from the body
      s.root.copy(this.pos).addScaledVector(_a, ROOT_R * 0.9).addScaledVector(U, d.h);
      // optional probing of a nearby surface (soft tentacles only, on the flanks): reach, touch, linger, release
      if (kind === 'soft') {
        s.probeT -= dt;
        if (!s.probing && s.probeT <= 0 && speed < 4) {
          _b.copy(s.root).addScaledVector(_a, 0.75 + Math.random() * 0.4).addScaledVector(this.F, (Math.random() - 0.5) * 0.5);
          if (this.contact(_b, s.root, _a, U, s.probePt, s.probeN)) { s.probing = true; s.probe = 0; }
          s.probeT = 5 + Math.random() * 7;
        }
        if (s.probing) { s.probe += dt; if (s.probe > 2.4 || speed > 5) s.probing = false; }
      }
      const pk = s.probing ? Math.sin(Math.PI * clamp(s.probe / 2.4, 0, 1)) ** 0.5 : 0;
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        // resting shape: out from the bell, then a gravity droop, curling at the end; moving drags it BEHIND the body, never ahead
        const out = 0.35 * Math.sin(Math.min(1, u * 1.6) * 1.4) * len, drop = len * (0.05 + 0.75 * u * u) * (kind === 'nub' ? 0.9 : 1);
        ideal[i].copy(s.root).addScaledVector(_a, out).addScaledVector(U, -drop);
        ideal[i].addScaledVector(this.vel, -0.035 * u * u * len);
        const sway = Math.sin(t * s.f1 + s.ph + u * 3) * 0.06 * u * len, sway2 = Math.cos(t * s.f2 + s.ph * 1.7 + u * 2.4) * 0.05 * u * len;
        ideal[i].addScaledVector(this.R, sway).addScaledVector(this.F, sway2);
        const cu = Math.max(0, u - 0.55) / 0.45;                                     // tip curl, irregular per tentacle
        ideal[i].addScaledVector(_a, -Math.sin(cu * 2.2 * s.curl) * 0.07 * len).addScaledVector(U, Math.sin(cu * 2.2 * s.curl) * 0.05 * len);
        if (pk > 0) {                                                                // probing: blend to the surface with a soft curl at the contact
          _c.copy(s.probePt).addScaledVector(s.probeN, 0.03 + 0.08 * (1 - u));
          _d.copy(s.root).lerp(_c, u * u * (3 - 2 * u));
          _d.addScaledVector(U, Math.sin(Math.PI * u) * 0.12);
          ideal[i].lerp(_d, pk);
        }
      }
      for (let i = 1; i < N; i++) this.avoidCenter(ideal[i], Math.sign(d.a) || 1);
      s.chain.step(ideal, dt);
      s.mesh.update(s.chain.p);
    }
  }
}
