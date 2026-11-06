import * as THREE from 'three';
import { lerp, damp, clamp } from '../core/util.js';
import { makeHandGel } from './hand.js';
import { buildTentacleGeometry, makeArmUniforms, makeSharedSkin, makeSkinMaterial, makeSuckerMaterial, tentaclePointJS } from './arm.js';

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _d = new THREE.Vector3(), _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), _zAxis = new THREE.Vector3(0, 0, 1);
const smoother = (k) => k * k * k * (k * (k * 6 - 15) + 10);      // starts and ends at rest: nothing in the arm's movement begins or stops abruptly
const ELBOW = new THREE.Vector3(0.5, -0.78, 0.2); // where the reaching arm emerges from (camera space)

// One first-person arm: a single soft tentacle, bent in its shader (arm.js). Its pose is a handful of numbers set here each frame.
class HandArm {
  constructor(vm, side, weapon) {
    this.vm = vm; this.side = side; this.weapon = weapon;
    const A = vm.asset;
    this.root = new THREE.Group(); // wrist pivot, model forward is -Z
    this.root.scale.set(side * 0.95, 0.95, 0.95);
    vm.root.add(this.root);

    this.U = makeArmUniforms(side > 0 ? 0.6 : 3.7);
    if (!weapon) this.U.uGain.value = 0;      // the firing pulse only runs up the firing arm
    this.skin = new THREE.Mesh(vm.tentGeo.skin, makeSkinMaterial(vm.skinShared, this.U));
    this.skin.renderOrder = 4; this.skin.frustumCulled = false; this.root.add(this.skin);
    this.suckMat = makeSuckerMaterial(vm.skinShared, this.U);
    this.suck = new THREE.Mesh(vm.tentGeo.suckers, this.suckMat);
    this.suck.renderOrder = 5; this.suck.frustumCulled = false; this.root.add(this.suck);
    this.lagSide = 0; this.lagPitch = 0;

    const inner = (n, mat, order = 1) => { const m = A[n].clone(); m.material = mat; m.renderOrder = order; m.frustumCulled = false; this.root.add(m); return m; };
    this.cord = inner('Core', vm.coreMat);
    this.palmCore = inner('PalmCore', vm.coreMat);
    // the arm is one seamless tentacle now: the straight inner cord and the palm organ were built for the old hand and only show as lines inside a curving arm
    this.cord.visible = false; this.palmCore.visible = false;
    this.tip = new THREE.Object3D(); // palm: where the absorbed pistol parts travel
    this.root.add(this.tip);
    this.frags = [];
    this.phase = side > 0 ? 0 : 2.1;
    this.hold = new THREE.Vector3(side * 0.3, -0.17, -0.6);
    this.restrainPos = new THREE.Vector3(side * 0.58, -0.41, -0.3);

    if (weapon) {
      this.gland = inner('Gland', vm.coreMat, 2);
      this.barrel = A.Barrel.clone(); this.barrel.material = vm.barrelGel; this.barrel.renderOrder = 5; this.barrel.frustumCulled = false; this.root.add(this.barrel);
      this.maw = inner('Maw', vm.maw, 3);
      this.tooth = inner('Tooth', vm.crystalMat, 3);
      this.gland.visible = this.barrel.visible = this.maw.visible = this.tooth.visible = false;      // leftovers of the old hand: the arm itself is the weapon
      this.glow = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), vm.glowMat);
      this.root.add(this.glow);
      this.light = new THREE.PointLight(0x6ff0ff, 0, 1.6, 2);
      this.root.add(this.light);
      this.muzzle = new THREE.Object3D();
      this.root.add(this.muzzle);
      // fragments of the absorbed pistol, drifting inside the forearm until they crystallise into an aligned channel
      for (let i = 0; i < 11; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), vm.fragMat);
        const a = Math.random() * 6.28, r = Math.random() * 0.026, aa = i * 2.4;
        this.frags.push({
          mesh: m,
          sp: new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.1 + Math.random() * 0.26),
          sq: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3)),
          ss: new THREE.Vector3(0.01 + Math.random() * 0.016, 0.01 + Math.random() * 0.014, 0.014 + Math.random() * 0.022),
          ap: new THREE.Vector3(Math.cos(aa) * 0.026, Math.sin(aa) * 0.026, 0.06 + i * 0.03),
          aq: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, aa)),
          as: new THREE.Vector3(0.004, 0.017, 0.011),
        });
        m.visible = false;      // the shards inside the old forearm read as loose pieces in a slim tentacle
        this.tip.add(m);
      }
    }
  }

  // a point along the arm as it is bent right now, in the arm's own space
  pointLocal(s, out) { return tentaclePointJS(this.U, this.vm.time, s, out); }

  update(dt, ctx) {
    const vm = this.vm, t = vm.time, side = this.side;
    const armF = this.weapon ? vm.armK : (this.showing ? 0.62 : 0), f = armF, rec = this.weapon ? vm.recoil : 0;    // armK: how far this arm has become a weapon, on one eased timeline
    const mk = vm.moveK, st = vm.stride, ph = side > 0 ? 0 : Math.PI;
    const idle = 1 - Math.min(1, mk * 1.5);

    // ---- pose: hold, restrained, or reaching ----
    const pos = _v.copy(this.hold);
    pos.x += vm.swayX * 0.5 + vm.lagX;
    pos.y += vm.swayY * 0.5 + Math.sin(t * 1.5 + this.phase) * 0.004 - vm.dashK * 0.1;
    pos.z += vm.lagZ + vm.dashK * 0.1 + rec * 0.05;
    // idle: slow breathing rise and fall with a gentle drift
    pos.y += (Math.sin(t * 1.25 + this.phase) * 0.009 + Math.sin(t * 0.53 + this.phase * 1.7) * 0.004) * idle;
    pos.x += Math.sin(t * 0.71 + this.phase) * 0.004 * idle;
    // running: the arms pump alternately and bounce with every step; jumping lifts them, landing dips them
    // a slow, weighted sway with the stride, not a bounce
    pos.y += (0.004 - (0.5 - 0.5 * Math.cos(st * 2)) * 0.012) * mk + vm.airK * 0.035 - vm.landK * 0.06;
    pos.x += side * Math.sin(st + ph) * 0.006 * mk;
    pos.z += Math.sin(st + ph) * 0.018 * mk - vm.airK * 0.02;
    const pumpPitch = Math.sin(st + ph) * 0.035 * mk - vm.airK * 0.14 + vm.landK * 0.12 - 0.16 * (1 - armF);
    { const bare = 1 - armF; pos.x += side * 0.13 * bare; pos.y -= 0.07 * bare; pos.z -= 0.16 * bare; }      // a bare arm rests further out, clear of your aim
    _e.set(0.44 + rec * 0.1 + vm.swayY * 0.4 + vm.dashK * 0.1 + pumpPitch, side * -0.1 + vm.swayX * 0.5 - side * vm.dashK * 0.1 + side * 0.05 * mk, side * -0.08 + side * Math.sin(st) * 0.05 * mk + side * Math.sin(t * 0.8 + this.phase) * 0.02 * idle, 'YXZ');
    // the body is failing or thrown: the arms are not held up by anything
    const limp = vm.limp || 0, fling = vm.fling || 0;
    if (limp > 0) { const sag = limp * (side > 0 ? 1 : 0.9); pos.y -= 0.72 * sag; pos.z += 0.3 * sag; pos.x += side * 0.05 * sag; _e.x -= 0.95 * sag; _e.z += side * 0.25 * sag + Math.sin(t * 2.1 + this.phase) * 0.03 * sag; }
    const bump = this.weapon ? vm.armBump : 0;
    if (bump > 0) { pos.y -= 0.05 * bump; pos.z += 0.03 * bump; _e.x -= 0.1 * bump; _e.z += side * 0.07 * bump; }
    if (fling > 0) { pos.y += 0.26 * fling; pos.x += side * 0.14 * fling; _e.x += 0.55 * fling; _e.z -= side * 0.3 * fling; }
    this.root.quaternion.setFromEuler(_e);
    // V2: the arm rolls to show its back when something has grown there; it drops out of view to change, and comes up in front of you when it is changing
    { const T = this.weapon ? (vm.styleTarget.roll || 0) : ((this.showing && this.showing.m.style.roll) || 0);
      this.rollK = damp(this.rollK || 0, T, 7, dt);
      if (this.rollK > 0.001) this.root.quaternion.multiply(_q.setFromAxisAngle(_zAxis, -side * this.rollK));
      pos.y -= 0.5 * (vm.swapK || 0);
      { const up = Math.min(1, this.rollK); pos.y += 0.075 * up; pos.z -= 0.05 * up; this.root.rotateX(0.11 * up); }
      const insp = (vm.inspectK || 0) * (this.weapon ? 1 : 0);
      if (insp > 0) { pos.x -= 0.1 * insp; pos.y += 0.05 * insp; pos.z -= 0.16 * insp; this.root.rotateZ(Math.sin(t * 2.2) * 0.12 * insp); }
    }
    // V2: a blow. Coiled back, then the whole arm thrown forward and across
    let hit = 0, wind = 0;
    if (this.weapon && vm.strikeT < 1) { const k = vm.strikeT, h = vm.strikeHeavy ? 0.2 : 0.14; wind = k < h ? Math.sin((k / h) * Math.PI * 0.5) : 0; hit = k < h ? 0 : smoother(Math.min(1, (k - h) / 0.2)) * (1 - smoother(Math.max(0, (k - 0.46) / 0.54))); const ext = vm.strikeHeavy ? 1.2 : 1; pos.z -= 0.3 * hit * ext - 0.13 * wind; pos.y += 0.09 * hit * ext - 0.05 * wind; pos.x -= 0.15 * hit + 0.1 * side * wind * -1; }
    if (vm.restrain > 0) {
      // the clamps are fixed in the world, so the held wrists follow them as the head turns and tilts
      const w = vm.restrain, strain = (1 - vm.restrainSlack) * Math.sin(t * 17 + this.phase) * 0.006;
      const qc = _q.setFromEuler(_e.set(vm.camPitch, vm.camYaw, 0, 'YXZ')).invert();
      const held = _d.copy(this.restrainPos).applyQuaternion(qc);
      held.x += strain; held.y += strain * 0.7;
      pos.lerp(held, w);
      const qa = new THREE.Quaternion().setFromEuler(_e.set(-0.18, side * 0.12, 0, 'YXZ'));
      qc.premultiply(new THREE.Quaternion());
      const qloc = qc.clone().multiply(qa);
      this.root.quaternion.slerp(qloc, w);
    }
    this.root.scale.z = 0.95;
    if (this.weapon && vm.reachW > 0) {
      // the arm hinges at a fixed elbow below the view and stretches along the line to the target, so the tip lands on it
      const w = Math.min(1, vm.reachW / 0.45);
      _d.subVectors(vm.reachTarget, ELBOW); const dist = _d.length(); _d.normalize();
      const zs = clamp(dist / 2.565, 0.45, 1.2);
      _w.copy(ELBOW).addScaledVector(_d, 1.36 * 0.95 * zs);
      _m.lookAt(ELBOW, vm.reachTarget, UP);
      _q.setFromRotationMatrix(_m);
      pos.lerp(_w, w);
      this.root.quaternion.slerp(_q, w);
      this.root.scale.z = 0.95 * lerp(1, zs, w);
    }
    this.root.position.copy(pos);

    // ---- the living arm. Slow overlapping rhythms that never quite repeat: it breathes, coils and uncoils, flexes, and now and then flicks.
    const p0 = this.phase, rk = this.weapon ? Math.min(1, (vm.reachW || 0) / 0.45) : 0;
    const drift = Math.sin(t * 0.37 + p0) * 0.5 + Math.sin(t * 0.61 + p0 * 1.3) * 0.3 + Math.sin(t * 1.03 + p0 * 2.1) * 0.2;
    const coil = Math.pow(Math.max(0, Math.sin(t * 0.29 + p0 * 2.7)), 6), flick = Math.pow(Math.max(0, Math.sin(t * 0.71 + p0 * 0.9)), 24);
    // it drags behind when you turn and look, like something with weight
    this.lagSide = damp(this.lagSide, clamp(-(ctx.lookX || 0) * 0.012, -0.9, 0.9), 4.5, dt);
    this.lagPitch = damp(this.lagPitch, clamp((ctx.lookY || 0) * 0.008, -0.6, 0.6) + vm.landK * 0.5 - vm.airK * 0.35, 4.5, dt);
    const tk = vm.threatK || 0, hurt = vm.hurtK || 0;
    const U = this.U, restCurl = 2.9 - 1.0 * tk + (0.65 * drift + 1.5 * coil - 0.8 * flick) * idle * (1 - 0.6 * tk) - 1.5 * mk + (this.weapon ? vm.sGrip * 3.6 - vm.sSpread * 1.3 : 0);
    let curlV = lerp(restCurl, 0.05, f);
    curlV = lerp(curlV, 0.12, rk);
    curlV = lerp(curlV, 1.4, limp);
    U.uCurl.value = curlV + rec * 0.25 * (1 - f);
    U.uSide.value = lerp(lerp(-0.2 + (this.weapon ? vm.sSpread * 1.6 : 0) + 0.1 * drift * idle, 0, f), 0, rk) + this.lagSide * side * (1 - 0.8 * f) + (vm.threatX || 0) * side * 0.85 * tk * (1 - f);       // a free tip leans toward whatever is nearest
    U.uBend.value = (this.lagPitch - limp * 0.7 + (vm.threatY || 0) * 0.5 * tk) * (1 - 0.8 * f);
    U.uWave.value = lerp(0.62 + 0.2 * mk + 0.5 * tk + 0.7 * hurt, 0.08 + 0.2 * hurt, Math.max(f, rk * 0.9)) * (1 - 0.5 * limp);
    U.uLen.value = lerp(lerp(0.84, this.rollK > 0.5 ? 0.9 : 0.77, f), 1.22, rk) * (1 + 0.1 * bump) * (1 - 0.04 * rec);
    U.uThick.value = 0.84 + 0.36 * f + 0.012 * Math.sin(t * 1.25 + p0) + vm.pulse * 0.05 + vm.charge * 0.2 + (this.weapon ? vm.bulge * 0.4 + vm.sSwell * 0.42 : 0);
    if (this.rollK > 0) U.uThick.value *= 1 - 0.2 * Math.min(1, this.rollK);
    U.uMouth.value = (this.weapon && !vm.styleTarget.noMouth ? f * f * f : 0) * (1 - rk) * (1 - 0.7 * limp);
    if (hit > 0 || wind > 0) { U.uCurl.value = lerp(lerp(U.uCurl.value, 4.4, wind), 0.18, hit); U.uLen.value *= 1 + 0.42 * hit * (vm.strikeHeavy ? 1.2 : 1); U.uSide.value += 0.5 * hit - 0.25 * wind; U.uThick.value *= 1 + 0.18 * hit; U.uWave.value *= 1 - 0.8 * hit; }
    if (this.weapon) { U.uPump.value = vm.pump ?? 2; U.uGain.value = vm.pumpGain ?? 1; }

    if (!this.weapon) return;
    this.pointLocal(1, this.tip.position);      // the end of the arm, as it is bent right now

    this.muzzle.position.copy(this.tip.position);
    this.glow.position.copy(this.muzzle.position);
    vm.glowMat.opacity = Math.max(vm.pulse * 0.85 * (0.4 + 0.6 * f), 0.22 * f * f * f * f * (1 - rk));      // the mouth lights last, once it has closed around it
    this.glow.scale.setScalar(0.45 + vm.pulse * 1.3);
    this.light.position.copy(this.muzzle.position);
    this.light.intensity = vm.pulse * 5;

    vm.fragMat.color.setRGB(lerp(0.17, 0.4, vm.crystal), lerp(0.19, 0.95, vm.crystal), lerp(0.21, 1, vm.crystal));
    vm.fragMat.emissive.setRGB(0.05 * vm.crystal, 0.8 * vm.crystal, 0.9 * vm.crystal);
    vm.fragMat.emissiveIntensity = 0.6 + vm.pulse * 1.5;
    for (const fr of this.frags) {
      const m = fr.mesh;
      m.visible = false;                 // the arm is one clean tentacle: no shards inside it
      m.position.lerpVectors(fr.sp, fr.ap, vm.crystal);
      m.quaternion.slerpQuaternions(fr.sq, fr.aq, vm.crystal);
      m.scale.lerpVectors(fr.ss, fr.as, vm.crystal).multiplyScalar(vm.frag * (fr.k ?? 1));
    }
  }

  setVisible(v) { this.root.visible = v; }
}

// First-person view: the arms are rendered in a separate pass so they never clip into level geometry.
const _sc = new THREE.Color();
// arm looks per weapon form: [rim colour, sucker glow colour, sucker glow strength, resting grip / spread / swell of the weapon arm]
const STYLES = {
  shardcaster: { rim: 0x48dccb, suck: 0x0a2a2c, suckI: 0.6, grip: 0, spread: 0, swell: 0, weapon: 1 },        // the siphon, crystal in its mouth
  arc:         { rim: 0x9fd0ff, suck: 0x2a60ff, suckI: 1.6, grip: 0, spread: 0.6, swell: 0.1, weapon: 0 },        // splayed, crackling blue-white
  barb:        { rim: 0xb8e06a, suck: 0x405a10, suckI: 1.0, grip: 0, spread: 0, swell: 0.45, weapon: 0.75 },       // tensed, olive and thorny
  lash:        { rim: 0xd8a0ff, suck: 0x6a30b0, suckI: 1.3, grip: 1, spread: 0, swell: 0.05, weapon: 0 },     // coiled, violet
  gel:         { rim: 0x6dff9a, suck: 0x1a8a40, suckI: 1.5, grip: 0.3, spread: 0, swell: 0.8, weapon: 0.35 },        // bulging and toxic green
};
export class ViewModel {
  // your arms are lit by the place you are standing in
  setEnv(hex) { const c = new THREE.Color(hex); this.skinShared.uEnv.value.copy(c); this.key.color.copy(c); }
  setMachine(k) { this.skinShared.uMachine.value = k; }
  setStyleObj(o) { if (o === this.styleTarget) return; this.styleTarget = o; this.styleT = 0; this.styleFrom = { grip: this.sGrip, spread: this.sSpread, swell: this.sSwell }; }
  strike(dur, heavy) { this.strikeDur = dur; this.strikeT = 0; this.strikeHeavy = heavy; }
  constructor(asset) {
    this.asset = asset;
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.root.add(new THREE.AmbientLight(0x8fb4c4, 1.5));
    const key = new THREE.DirectionalLight(0xe4f8ff, 2.4);
    key.position.set(0.6, 0.9, 0.5);
    this.root.add(key); this.key = key;

    this.tentGeo = buildTentacleGeometry(); this.skinShared = makeSharedSkin();
    // each weapon form gives the arm its own look: skin glow, sucker glow and a resting pose (blended smoothly when the form changes)
    this.sGrip = 0; this.sSpread = 0; this.sSwell = 0;
    this.styleT = 1; this.styleFrom = { grip: 0, spread: 0, swell: 0 };
    this.armK = 1; this.armFrom = 1; this.armTo = 1; this.armT = 1; this.armDur = 0.5; this.armSpan = 0; this.armBump = 0; this.armSlow = 0;
    this.styleTarget = STYLES.shardcaster; this.styleRim = new THREE.Color(0x48dccb); this.styleSuck = new THREE.Color(0x0a2a2c);
    this.barrelGel = makeHandGel({ color: 0x0f2230, rim: 0x6fe8d8, alpha: 0.55 });
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0x2a8f86 });
    this.maw = new THREE.MeshBasicMaterial({ color: 0x8ff5e6 });
    this.crystalMat = new THREE.MeshBasicMaterial({ color: 0xb8fff6 });
    this.fragMat = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.35, metalness: 0.85, emissive: 0x000000 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xbffcff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

    this.form = 1; // 0 = bare hand, 1 = Shardcaster grown
    this.curl = 0; // grip closure for the hand
    this.frag = 1; // absorbed fragments present
    this.crystal = 1; // fragments aligned / crystallised
    this.cineW = 0; // > 0 while the opening owns the arms
    this.reachW = 0; // right hand pulled toward reachTarget (camera space)
    this.reachTarget = new THREE.Vector3();
    this.restrain = 0; // 1 = both wrists held in the cell's clamps
    this.restrainSlack = 0; // 0 = straining, 1 = loose
    this.xray = 0;
    this.bulge = 0; // travelling swelling of the forearm as absorbed pieces pass through // 1 = skin thinned so internal structures read clearly
    this.charge = 0; // experiment overload: inner structures glow harder
    this.leftHidden = false;
    this.camYaw = 0; this.camPitch = 0; // camera orientation, used to keep the clamped wrists fixed in the world
    this.pistol = null;

    this.recoil = 0; this.recoilVel = 0; this.pulse = 0; this.strikeT = 1;
    this.moveK = 0; this.stride = 0; this.airK = 0; this.landK = 0; this.wasAir = false;
    this.swayX = 0; this.swayY = 0; this.lagX = 0; this.lagZ = 0; this.dashK = 0;
    this.time = 0;

    this.right = new HandArm(this, 1, true);
    this.left = new HandArm(this, -1, false);
  }

  setStyle(id) {
    const next = STYLES[id] || STYLES.shardcaster;
    if (next === this.styleTarget) return;
    this.styleTarget = next; this.styleT = 0; this.styleFrom = { grip: this.sGrip, spread: this.sSpread, swell: this.sSwell };
  }
  setPistol(group) {
    if (this.pistol) this.root.remove(this.pistol);
    this.pistol = group;
    if (group) this.root.add(group);
  }

  fireKick() { this.recoilVel += 8; this.pulse = 1; this.pump = 0.42; this.pumpGain = 1; }
  pulseGlow(v) { this.pulse = Math.max(this.pulse, v); }

  syncToCamera(camera) {
    this.root.position.copy(camera.position);
    this.root.quaternion.copy(camera.quaternion);
    this.root.updateMatrixWorld(true);
  }

  muzzleWorld(out) { return this.right.muzzle.getWorldPosition(out); }

  // ctx: { lookX, lookY, velX, velZ, dashing }
  update(dt, ctx) {
    this.time += dt;
    const t = this.time;
    this.recoilVel += (-190 * this.recoil - 17 * this.recoilVel) * dt;
    this.recoil += this.recoilVel * dt;
    this.pulse = Math.max(0, this.pulse - dt * 9);
    if (this.strikeT < 1) this.strikeT = Math.min(1, this.strikeT + dt / (this.strikeDur || 0.4));
    // locomotion for the arm animation
    const speed = Math.hypot(ctx.velX || 0, ctx.velZ || 0), air = !!ctx.air;
    this.moveK = damp(this.moveK || 0, clamp(speed / 7.2, 0, 1.3) * (air ? 0.25 : 1), 8, dt);
    this.stride = (this.stride || 0) + dt * (1.4 + speed * 0.62) * (air ? 0.2 : 1);
    this.airK = damp(this.airK || 0, air ? 1 : 0, 7, dt);
    if (this.wasAir && !air) this.landK = 1;
    this.wasAir = air;
    this.landK = damp(this.landK || 0, 0, 7, dt);
    this.skinShared.tTime.value = t; this.skinShared.uGlow.value = this.pulse + this.charge * 0.6; this.skinShared.uHeat.value = this.charge;
    this.pump = Math.min(2, (this.pump ?? 2) + dt * 2.6);
    this.fling = Math.max(0, (this.fling || 0) - dt * 1.4);
    this.skinShared.uAlpha.value = lerp(0.97, 0.16, this.xray);
    { const T = this.styleTarget, k = Math.min(1, dt * 5);
      this.styleRim.lerp(_sc.set(T.rim), k); this.styleSuck.lerp(_sc.set(T.suck), k);
      this.skinShared.uRim.value.copy(this.styleRim);
      for (const arm of [this.right, this.left]) if (arm) { arm.suckMat.emissive.copy(this.styleSuck); arm.suckMat.emissiveIntensity = T.suckI * 0.6; }
      this.styleT = Math.min(1, this.styleT + dt / 0.5);
      const sk = smoother(this.styleT), F = this.styleFrom;
      this.sGrip = lerp(F.grip, T.grip, sk); this.sSpread = lerp(F.spread, T.spread, sk); this.sSwell = lerp(F.swell, T.swell, sk);
      // armed and unarmed are one continuous movement. A new target starts from wherever the arm is now, so changing your mind mid-way never pops.
      const want = this.form * T.weapon;
      if (Math.abs(want - this.armTo) > 0.001) {
        this.armSpan = Math.abs(want - this.armK); this.armFrom = this.armK; this.armTo = want; this.armT = 0;
        this.armDur = this.armSlow || 0.26 + 0.3 * this.armSpan; this.armSlow = 0;
      }
      this.armT = Math.min(1, this.armT + dt / this.armDur);
      const ak = smoother(this.armT);
      this.armK = lerp(this.armFrom, this.armTo, ak);
      this.armBump = 4 * ak * (1 - ak) * this.armSpan;
      if (this.armT < 1 && this.armSpan > 0.1) { this.pump = lerp(0.52, 0.95, ak); this.pumpGain = 0.32; }     // a bulge of muscle rolls up the arm as it changes
    }

    { const th = ctx.threat; this.threatK = damp(this.threatK || 0, th ? 1 : 0, 2.2, dt); if (th) { this.threatX = damp(this.threatX || 0, th.x, 4, dt); this.threatY = damp(this.threatY || 0, th.y, 4, dt); } this.hurtK = damp(this.hurtK || 0, ctx.hurt || 0, 3, dt); }
    this.swayX = damp(this.swayX, clamp(-ctx.lookX * 0.0012, -0.06, 0.06), 7, dt);
    this.swayY = damp(this.swayY, clamp(ctx.lookY * 0.0012, -0.06, 0.06), 7, dt);
    this.lagX = damp(this.lagX, -ctx.velX * 0.003, 6, dt);
    this.lagZ = damp(this.lagZ, ctx.velZ * 0.002, 6, dt);
    this.dashK = damp(this.dashK, ctx.dashing ? 1 : 0, ctx.dashing ? 30 : 9, dt);
    this.camYaw = ctx.yaw || 0; this.camPitch = ctx.pitch || 0;
    this.right.update(dt, ctx);
    this.left.update(dt, ctx);
    this.left.setVisible(!this.leftHidden);
  }

  render(renderer, camera) {
    renderer.clearDepth();
    renderer.render(this.scene, camera);
  }
}
