import * as THREE from 'three';
import { lerp, damp, clamp } from '../core/util.js';
import { TentacleSet } from './tentacles.js';
import { updateHandGels } from './hand.js';
import { makeSkin, skinParams, restyle, updateSkins } from '../creature/skin.js';

const _el = new THREE.Vector3(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _d = new THREE.Vector3(), _w = new THREE.Vector3();
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
    // feeding-action overrides, driven by AbsorbFX (all zero at rest)
    this.rw = 0; this.rt = new THREE.Vector3(); this.fxSpread = 0; this.fxCurl = 0; this.fxBulge = 0;
    this.hold = new THREE.Vector3(side * 0.3, -0.17, -0.6);
    this.restrainPos = new THREE.Vector3(side * 0.58, -0.41, -0.3);

    if (weapon) {
      this.gland = inner('Gland', vm.coreMat, 2);
      this.barrel = A.Barrel.clone(); this.barrel.material = vm.barrelGel; this.barrel.renderOrder = 5; this.barrel.frustumCulled = false; this.root.add(this.barrel);
      this.maw = inner('Maw', vm.maw, 3);
      this.tooth = inner('Tooth', vm.crystalMat, 3);
      this.glow = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), vm.glowMat);
      this.root.add(this.glow);
      this.light = new THREE.PointLight(0x6ff0ff, 0, 0.7, 2);
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
    const rk = Math.min(rec, 0.32);                   // capped, so sustained fire never accumulates displacement
    const whip = this.weapon ? clamp(vm.recoil - vm.flex, -0.2, 0.2) : 0; // the wrist lags the arm, then catches up
    const fp = Math.max(vm.firePulse, vm.pulse);       // light for the weapon's own channel
    const curl = this.weapon ? vm.curl : 0.22 + Math.sin(t * 0.9 + this.phase) * 0.04;

    // ---- pose: hold, restrained, or reaching ----
    const pos = _v.copy(this.hold);
    pos.x += vm.swayX * 0.5 + vm.lagX;
    pos.y += vm.swayY * 0.5 + Math.sin(t * 1.5 + this.phase) * 0.004 - vm.dashK * 0.1;
    pos.z += vm.lagZ + vm.dashK * 0.1 + (this.weapon ? rk * 0.34 : vm.recoil * 0.05);   // backward impulse through the firing hand, a flinch in the other
    if (this.weapon) pos.y += rk * 0.1; else pos.y += vm.recoil * 0.012;
    _e.set(0.44 + rk * 0.62 + whip * 1.5 + vm.swayY * 0.4 + vm.dashK * 0.1, side * -0.1 + vm.swayX * 0.5 - side * vm.dashK * 0.1, side * -0.08 + (this.weapon ? rk * 0.35 : 0), 'YXZ');
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
    const w = this.weapon ? vm.reachW : this.rw, rtgt = this.weapon ? vm.reachTarget : this.rt;
    if (w > 0) {
      _d.subVectors(rtgt, _el.set(side * 0.5, -0.78, 0.2)).normalize();
      _w.copy(rtgt).addScaledVector(_d, -0.1);
      if (_w.length() > 0.78) _w.setLength(0.78); // a hand only reaches so far; tentacles do the rest
      _m.lookAt(_w, rtgt, UP);
      _q.setFromRotationMatrix(_m);
      pos.lerp(_w, w);
      this.root.quaternion.slerp(_q, w);
    }
    if (vm.tremor > 0) { // an unsteady hand: fine, slightly irregular shake
      const k = vm.tremor * 0.006;
      pos.x += (Math.sin(t * 37 + this.phase) + Math.sin(t * 23 + 1.3)) * k;
      pos.y += (Math.sin(t * 31 + this.phase * 2) + Math.sin(t * 19)) * k;
    }
    this.root.position.copy(pos);

    // ---- shape: morph targets drive grip, weapon form, recoil flare ----
    this.setKey('Grip', clamp(Math.max(curl, this.fxCurl) * (1 - f * 0.9), 0, 1));
    this.setKey('Weapon', clamp(f * (1 - 0.55 * rec), 0, 1));
    this.setKey('Spread', clamp(rk * 2.2 + Math.abs(whip) * 2 + this.fxSpread, 0, 1));
    this.setKey('Swell', clamp(f * 0.9 + vm.pulse * 0.1 + Math.abs(whip) * 1.6 + vm.charge * 0.35 + (this.weapon ? vm.bulge : 0) + this.fxBulge, 0, 1.4));

    this.palmCore.scale.setScalar(1 + vm.pulse * 0.9 + Math.sin(t * 2.4 + this.phase) * 0.1 + vm.charge * 0.6);
    if (!this.weapon) return;
    const sq = 1 - rec * 0.12;
    this.barrel.visible = this.maw.visible = f > 0.02;
    const sqz = vm.squeeze; // internal compression just before the discharge
    this.barrel.scale.set(1 + rec * 0.1 - sqz * 0.14, 1 + rec * 0.1 - sqz * 0.14, Math.max(0.001, f) * sq * (1 - 0.1 * sqz));
    this.maw.scale.copy(this.barrel.scale);
    this.maw.scale.x = this.maw.scale.y = (1 + fp * 0.3);
    this.tooth.visible = f > 0.25;
    this.tooth.scale.set(Math.max(0.001, f), Math.max(0.001, f), Math.max(0.001, f) * (1 + fp * 0.2));
    this.gland.visible = f > 0.2;
    this.gland.scale.setScalar(Math.max(0.001, f) * (1 + fp * 0.3 + vm.charge * 0.2 + Math.sin(t * 2.2) * 0.04));
    this.muzzle.position.z = -0.31 * Math.max(0.001, f);
    // the discharge pulse travels from the gland to the muzzle in about 70 ms
    this.glow.position.copy(this.muzzle.position);
    this.glow.position.z = lerp(-0.06 * f, this.muzzle.position.z, Math.min(1, vm.pulseAge / 0.07));
    vm.glowMat.opacity = fp * 0.55;
    this.glow.scale.setScalar(0.4 + fp * 0.8);
    this.light.position.copy(this.muzzle.position);
    this.light.intensity = fp * 1.6;                 // small and close: it lights the barrel, not the whole player

    vm.fragMat.color.setRGB(lerp(0.17, 0.4, vm.crystal), lerp(0.19, 0.95, vm.crystal), lerp(0.21, 1, vm.crystal));
    vm.fragMat.emissive.setRGB(0.05 * vm.crystal, 0.8 * vm.crystal, 0.9 * vm.crystal);
    vm.fragMat.emissiveIntensity = 0.6 + fp * 1.5;
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
  constructor(asset, tentacleAsset, def) {
    this.asset = asset;
    this.def = def;
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.root.add(new THREE.AmbientLight(0x8fb4c4, 1.5));
    const key = new THREE.DirectionalLight(0xe4f8ff, 2.4);
    key.position.set(0.6, 0.9, 0.5);
    this.root.add(key);

    this.skinGel = makeSkin(skinParams(def, 'body'));
    this.barrelGel = makeSkin(skinParams(def, 'weapon'));
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

    this.recoil = 0; this.recoilVel = 0; this.pulse = 0; this.firePulse = 0; this.flex = 0; this.squeeze = 0; this.pulseAge = 1;
    this.swayX = 0; this.swayY = 0; this.lagX = 0; this.lagZ = 0; this.dashK = 0;
    this.time = 0;

    this.right = new HandArm(this, 1, true);
    this.left = new HandArm(this, -1, false);
    this.tentacles = new TentacleSet(this, tentacleAsset, def);
    this.tremor = 0; // 0..1 shake of both hands (the first moments of the intro)
  }

  // Re-skin every part of the view model (hands, weapon, tentacles) from a creature definition. Materials are updated in place.
  setCreature(def) {
    this.def = def;
    restyle(this.skinGel, def, 'body'); restyle(this.barrelGel, def, 'weapon');
    this.tentacles.setCreature(def);
  }

  // palm of either hand, camera space
  palmLocalOf(arm, out) {
    out.set(0, 0, -0.14);
    arm.root.localToWorld(out);
    return this.root.worldToLocal(out);
  }

  // the right palm / weapon mouth in camera-local space
  palmLocal(out) {
    this.right.muzzle.getWorldPosition(out);
    return this.root.worldToLocal(out);
  }

  setPistol(group) {
    if (this.pistol) this.root.remove(this.pistol);
    this.pistol = group;
    if (group) this.root.add(group);
  }

  // Shots add to the recoil spring (capped) instead of restarting a pose, so sustained fire blends and settles smoothly.
  fireKick() { this.recoilVel = Math.min(this.recoilVel + 7, 15); this.firePulse = 1; this.squeeze = 1; this.pulseAge = 0; }
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
    this.firePulse = Math.max(0, this.firePulse - dt * 11);
    this.flex += (this.recoil - this.flex) * Math.min(1, dt * 16);
    this.squeeze = Math.max(0, this.squeeze - dt * 16);
    this.pulseAge += dt;
    updateHandGels(t, this.pulse + this.charge * 0.6, this.charge);
    updateSkins(t, this.pulse + this.charge * 0.6, this.charge);
    this.skinGel.uniforms.uAlpha.value = lerp(skinParams(this.def, 'body').alpha, 0.16, this.xray);

    this.swayX = damp(this.swayX, clamp(-ctx.lookX * 0.0012, -0.06, 0.06), 7, dt);
    this.swayY = damp(this.swayY, clamp(ctx.lookY * 0.0012, -0.06, 0.06), 7, dt);
    this.lagX = damp(this.lagX, -ctx.velX * 0.003, 6, dt);
    this.lagZ = damp(this.lagZ, ctx.velZ * 0.002, 6, dt);
    this.dashK = damp(this.dashK, ctx.dashing ? 1 : 0, ctx.dashing ? 30 : 9, dt);
    this.camYaw = ctx.yaw || 0; this.camPitch = ctx.pitch || 0;
    this.right.update(dt, ctx);
    this.left.update(dt, ctx);
    this.tentacles.update(dt);
    this.left.setVisible(!this.leftHidden);
  }

  render(renderer, camera) {
    renderer.clearDepth();
    renderer.render(this.scene, camera);
  }
}
