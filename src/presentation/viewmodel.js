import * as THREE from 'three';
import { lerp, damp, clamp } from '../core/util.js';
import { makeHandGel, updateHandGels } from './hand.js';

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _d = new THREE.Vector3(), _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ELBOW = new THREE.Vector3(0.5, -0.78, 0.2); // where the reaching arm emerges from (camera space)

// One first-person arm: the Blender-modelled hand (continuous gel skin driven by morph targets), a nerve cord and palm core
// inside it, and for the right arm the Shardcaster organ (barrel, maw, crystal tooth, venom gland).
class HandArm {
  constructor(vm, side, weapon) {
    this.vm = vm; this.side = side; this.weapon = weapon;
    const A = vm.asset;
    this.root = new THREE.Group(); // wrist pivot, model forward is -Z
    this.root.scale.set(side * 0.95, 0.95, 0.95);
    vm.root.add(this.root);

    this.skin = A.Hand.clone();
    this.skin.material = vm.skinGel;
    this.skin.renderOrder = 4;
    this.skin.frustumCulled = false;
    this.root.add(this.skin);
    this.dict = this.skin.morphTargetDictionary;

    const inner = (n, mat, order = 1) => { const m = A[n].clone(); m.material = mat; m.renderOrder = order; m.frustumCulled = false; this.root.add(m); return m; };
    this.cord = inner('Core', vm.coreMat);
    this.palmCore = inner('PalmCore', vm.coreMat);
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
        this.tip.add(m);
      }
    }
  }

  setKey(name, v) { const i = this.dict[name]; if (i !== undefined) this.skin.morphTargetInfluences[i] = v; }

  update(dt, ctx) {
    const vm = this.vm, t = vm.time, side = this.side;
    const f = this.weapon ? vm.form : 0, rec = this.weapon ? vm.recoil : 0;
    const mk = vm.moveK, st = vm.stride, ph = side > 0 ? 0 : Math.PI;
    const idle = 1 - Math.min(1, mk * 1.5);
    // idle fidget: now and then the free hand flexes its fingers
    const fid = this.weapon ? 0 : Math.pow(Math.max(0, Math.sin(t * 0.55 + this.phase * 3)), 14) * idle;
    const curl = this.weapon ? vm.curl : 0.22 + Math.sin(t * 0.9 + this.phase) * 0.04 + 0.3 * mk - 0.2 * fid;

    // ---- pose: hold, restrained, or reaching ----
    const pos = _v.copy(this.hold);
    pos.x += vm.swayX * 0.5 + vm.lagX;
    pos.y += vm.swayY * 0.5 + Math.sin(t * 1.5 + this.phase) * 0.004 - vm.dashK * 0.1;
    pos.z += vm.lagZ + vm.dashK * 0.1 + rec * 0.05;
    // idle: slow breathing rise and fall with a gentle drift
    pos.y += (Math.sin(t * 1.25 + this.phase) * 0.009 + Math.sin(t * 0.53 + this.phase * 1.7) * 0.004) * idle;
    pos.x += Math.sin(t * 0.71 + this.phase) * 0.004 * idle;
    // running: the arms pump alternately and bounce with every step; jumping lifts them, landing dips them
    pos.y += (0.012 - Math.abs(Math.sin(st)) * 0.034) * mk + vm.airK * 0.035 - vm.landK * 0.06;
    pos.x += side * Math.sin(st + ph) * 0.018 * mk;
    pos.z += Math.sin(st + ph) * 0.05 * mk - vm.airK * 0.02;
    const pumpPitch = Math.sin(st + ph) * 0.13 * mk - vm.airK * 0.14 + vm.landK * 0.12;
    _e.set(0.44 + rec * 0.1 + vm.swayY * 0.4 + vm.dashK * 0.1 + pumpPitch, side * -0.1 + vm.swayX * 0.5 - side * vm.dashK * 0.1 + side * 0.05 * mk, side * -0.08 + side * Math.sin(st) * 0.05 * mk + side * Math.sin(t * 0.8 + this.phase) * 0.02 * idle, 'YXZ');
    this.root.quaternion.setFromEuler(_e);
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
    if (this.weapon && vm.reachW > 0) {
      const w = vm.reachW;
      _d.subVectors(vm.reachTarget, ELBOW).normalize();
      _w.copy(vm.reachTarget).addScaledVector(_d, -0.1);
      _m.lookAt(_w, vm.reachTarget, UP);
      _q.setFromRotationMatrix(_m);
      pos.lerp(_w, w);
      this.root.quaternion.slerp(_q, w);
    }
    this.root.position.copy(pos);

    // ---- shape: morph targets drive grip, weapon form, recoil flare ----
    this.setKey('Grip', clamp(curl * (1 - f * 0.9), 0, 1));
    this.setKey('Weapon', clamp(f * (1 - 0.55 * rec), 0, 1));
    this.setKey('Spread', clamp(rec * 1.2 + fid * 0.55, 0, 1));
    this.setKey('Swell', clamp(f * 0.9 + vm.pulse * 0.1 + vm.charge * 0.35 + (this.weapon ? vm.bulge : 0), 0, 1.4));

    this.palmCore.scale.setScalar(1 + vm.pulse * 0.9 + Math.sin(t * 2.4 + this.phase) * 0.1 + vm.charge * 0.6);
    if (!this.weapon) return;
    const sq = 1 - rec * 0.12;
    this.barrel.visible = this.maw.visible = f > 0.02;
    this.barrel.scale.set(1 + rec * 0.1, 1 + rec * 0.1, Math.max(0.001, f) * sq);
    this.maw.scale.copy(this.barrel.scale);
    this.maw.scale.x = this.maw.scale.y = (1 + vm.pulse * 0.35);
    this.tooth.visible = f > 0.25;
    this.tooth.scale.set(Math.max(0.001, f), Math.max(0.001, f), Math.max(0.001, f) * (1 + vm.pulse * 0.2));
    this.gland.visible = f > 0.2;
    this.gland.scale.setScalar(Math.max(0.001, f) * (1 + vm.pulse * 0.3 + vm.charge * 0.2 + Math.sin(t * 2.2) * 0.04));
    this.muzzle.position.z = -0.31 * Math.max(0.001, f);
    this.glow.position.copy(this.muzzle.position);
    vm.glowMat.opacity = vm.pulse * 0.85;
    this.glow.scale.setScalar(0.45 + vm.pulse * 1.3);
    this.light.position.copy(this.muzzle.position);
    this.light.intensity = vm.pulse * 5;

    vm.fragMat.color.setRGB(lerp(0.17, 0.4, vm.crystal), lerp(0.19, 0.95, vm.crystal), lerp(0.21, 1, vm.crystal));
    vm.fragMat.emissive.setRGB(0.05 * vm.crystal, 0.8 * vm.crystal, 0.9 * vm.crystal);
    vm.fragMat.emissiveIntensity = 0.6 + vm.pulse * 1.5;
    for (const fr of this.frags) {
      const m = fr.mesh;
      m.visible = vm.frag > 0.01;
      m.position.lerpVectors(fr.sp, fr.ap, vm.crystal);
      m.quaternion.slerpQuaternions(fr.sq, fr.aq, vm.crystal);
      m.scale.lerpVectors(fr.ss, fr.as, vm.crystal).multiplyScalar(vm.frag * (fr.k ?? 1));
    }
  }

  setVisible(v) { this.root.visible = v; }
}

// First-person view: the arms are rendered in a separate pass so they never clip into level geometry.
export class ViewModel {
  constructor(asset) {
    this.asset = asset;
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.root.add(new THREE.AmbientLight(0x8fb4c4, 1.5));
    const key = new THREE.DirectionalLight(0xe4f8ff, 2.4);
    key.position.set(0.6, 0.9, 0.5);
    this.root.add(key);

    this.skinGel = makeHandGel({ color: 0x0e1c2c, rim: 0x48dccb, alpha: 0.64 });
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

    this.recoil = 0; this.recoilVel = 0; this.pulse = 0;
    this.moveK = 0; this.stride = 0; this.airK = 0; this.landK = 0; this.wasAir = false;
    this.swayX = 0; this.swayY = 0; this.lagX = 0; this.lagZ = 0; this.dashK = 0;
    this.time = 0;

    this.right = new HandArm(this, 1, true);
    this.left = new HandArm(this, -1, false);
  }

  setPistol(group) {
    if (this.pistol) this.root.remove(this.pistol);
    this.pistol = group;
    if (group) this.root.add(group);
  }

  fireKick() { this.recoilVel += 8; this.pulse = 1; }
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
    // locomotion for the arm animation
    const speed = Math.hypot(ctx.velX || 0, ctx.velZ || 0), air = !!ctx.air;
    this.moveK = damp(this.moveK || 0, clamp(speed / 7.2, 0, 1.3) * (air ? 0.25 : 1), 8, dt);
    this.stride = (this.stride || 0) + dt * (1.6 + speed * 1.15) * (air ? 0.2 : 1);
    this.airK = damp(this.airK || 0, air ? 1 : 0, 7, dt);
    if (this.wasAir && !air) this.landK = 1;
    this.wasAir = air;
    this.landK = damp(this.landK || 0, 0, 7, dt);
    updateHandGels(t, this.pulse + this.charge * 0.6, this.charge);
    this.skinGel.uniforms.uAlpha.value = lerp(0.62, 0.16, this.xray);

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
