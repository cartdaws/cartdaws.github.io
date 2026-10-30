import * as THREE from 'three';
import { lerp, damp, clamp } from '../core/util.js';
import { makeGel, updateGels } from '../world/materials.js';
import { TentacleMesh, makeTentacleGel, updateTentacleGels, bezier, SpringChain } from './tentacle.js';

const CYAN = 0x45b8ae;
const _v = new THREE.Vector3();
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

// One first-person tentacle: a spring-driven spine, a gel mesh with an inner nerve cord, and a claw of small tendrils at the tip.
// The right one can also grow the organic Shardcaster out of its tip.
class Arm {
  constructor(vm, side, weapon) {
    this.vm = vm; this.side = side; this.weapon = weapon;
    this.N = 12;
    this.anchor = new THREE.Vector3(side * 0.5, -0.9, 0.1);
    this.hold = new THREE.Vector3(side * 0.3, -0.2, -0.55);
    this.chain = new SpringChain(this.N, 520, 90, 0.85);
    this.ideal = Array.from({ length: this.N }, () => new THREE.Vector3());
    this.p1 = new THREE.Vector3(); this.p2 = new THREE.Vector3(); this.tipT = new THREE.Vector3();
    this.endDir = new THREE.Vector3(); this.dir0 = new THREE.Vector3();
    this.phase = side > 0 ? 0 : 2.1;

    this.mesh = new TentacleMesh({ rings: 34, radial: 18, radius: (t) => lerp(0.14, 0.038, Math.pow(t, 0.8)) * (1 + 0.08 * Math.sin(t * 9)), material: vm.tgel });
    this.mesh.mesh.renderOrder = 2;
    this.cord = new TentacleMesh({ rings: 24, radial: 6, radius: (t) => 0.02 * (1 - t * 0.7), material: vm.coreMat });
    this.cord.mesh.renderOrder = 1;
    vm.root.add(this.cord.mesh, this.mesh.mesh);

    this.tip = new THREE.Object3D();
    vm.root.add(this.tip);

    this.tendrils = [];
    for (let k = 0; k < 4; k++) {
      const tm = new TentacleMesh({ rings: 12, radial: 8, radius: (t) => 0.024 * Math.pow(1 - t, 0.8) + 0.002, material: vm.tgelThin });
      tm.mesh.renderOrder = 3;
      vm.root.add(tm.mesh);
      this.tendrils.push({ tm, pts: Array.from({ length: 7 }, () => new THREE.Vector3()) });
    }

    this.frags = [];
    if (weapon) this.buildOrgan();
  }

  buildOrgan() {
    const vm = this.vm, G = vm.G, tip = this.tip;
    // The Shardcaster is a living organ: a swollen veined gland, a ribbed muscular barrel, and six fleshy lips around the maw
    // that flex open to reveal a crystal tooth growing in the throat.
    this.gland = new THREE.Mesh(G.Gland, vm.glandGel);
    this.gland.renderOrder = 3;
    tip.add(this.gland);
    this.coreBall = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), vm.coreMat);
    tip.add(this.coreBall);
    this.throat = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), vm.coreMat);
    tip.add(this.throat);
    this.crystal = new THREE.Mesh(G.Crystal, vm.crystalMat);
    tip.add(this.crystal);
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), vm.glowMat);
    tip.add(this.glow);
    this.lips = [];
    for (let k = 0; k < 6; k++) {
      const holder = new THREE.Group();
      holder.rotation.z = (k / 6) * Math.PI * 2;
      const lip = new THREE.Mesh(G.Lip, vm.lipGel);
      lip.position.set(0.038, 0, 0);
      lip.renderOrder = 4;
      holder.add(lip);
      tip.add(holder);
      this.lips.push({ holder, lip });
    }
    this.spines = [];
    for (let k = 0; k < 4; k++) {
      const holder = new THREE.Group();
      holder.rotation.z = (k / 4) * Math.PI * 2 + 0.6;
      const spine = new THREE.Mesh(G.Spine, vm.spineGel);
      spine.position.set(0.045, 0, -0.12);
      spine.rotation.x = Math.PI - 0.5 - (k % 2) * 0.3;
      spine.scale.setScalar(0.85);
      spine.renderOrder = 3;
      holder.add(spine);
      tip.add(holder);
      this.spines.push(spine);
    }
    this.light = new THREE.PointLight(0x6ff0ff, 0, 1.6, 2);
    tip.add(this.light);
    this.muzzle = new THREE.Object3D();
    tip.add(this.muzzle);

    // Fragments of the absorbed pistol drift inside the bulb until they crystallise along the barrel.
    for (let i = 0; i < 11; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), vm.fragMat);
      const a = Math.random() * 6.28, r = Math.random() * 0.03;
      const aa = i * 2.4;
      this.frags.push({
        mesh: m,
        sp: new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, -0.05 - Math.random() * 0.14),
        sq: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3)),
        ss: new THREE.Vector3(0.008 + Math.random() * 0.016, 0.008 + Math.random() * 0.014, 0.012 + Math.random() * 0.022),
        ap: new THREE.Vector3(Math.cos(aa) * 0.02, Math.sin(aa) * 0.02, -0.08 - i * 0.02),
        aq: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, aa)),
        as: new THREE.Vector3(0.004, 0.016, 0.01),
      });
      tip.add(m);
    }
  }

  update(dt, ctx) {
    const vm = this.vm, t = vm.time, side = this.side, N = this.N;
    const weapon = this.weapon;
    const form = weapon ? vm.form : 0;
    const rec = weapon ? vm.recoil : 0;

    // Where the tip wants to be.
    const tt = this.tipT.copy(this.hold);
    tt.x += vm.swayX * 0.6 + vm.lagX;
    tt.y += vm.swayY * 0.6 + Math.sin(t * 1.5 + this.phase) * 0.004 - vm.dashK * 0.1;
    tt.z += vm.lagZ + vm.dashK * 0.1 + rec * 0.08;
    tt.y += rec * 0.014;
    const reach = weapon ? vm.reachW : 0;
    if (reach > 0) tt.lerp(vm.reachTarget, reach);

    this.endDir.set(-side * 0.1, 0.05, -1).normalize();
    if (reach > 0) this.endDir.lerp(_v.copy(vm.reachTarget).sub(this.anchor).normalize(), reach).normalize();
    this.dir0.set(-side * 0.25, 0.9, -0.3).normalize();
    const L = this.anchor.distanceTo(tt);
    this.p1.copy(this.anchor).addScaledVector(this.dir0, L * 0.46);
    this.p2.copy(tt).addScaledVector(this.endDir, -L * 0.34);
    for (let i = 0; i < N; i++) bezier(this.anchor, this.p1, this.p2, tt, i / (N - 1), this.ideal[i]);

    // Travelling undulation; stronger while moving or turning.
    const amp = 0.006 + 0.02 * ctx.moveK + 0.012 * ctx.lookK + 0.01 * rec;
    for (let i = 1; i < N; i++) {
      const w = i / (N - 1), a = amp * w * (0.4 + 0.6 * w);
      this.ideal[i].x += Math.sin(t * 2.2 - w * 6.0 + this.phase) * a;
      this.ideal[i].y += Math.sin(t * 1.8 - w * 5.0 + this.phase + 1.3) * a * 0.85;
    }
    this.chain.step(this.ideal, dt);
    this.mesh.update(this.chain.p);
    this.cord.update(this.chain.p);

    // Tip frame follows the end of the (lagging) spine.
    const last = this.chain.p[N - 1], prev = this.chain.p[N - 3];
    _f.subVectors(last, prev).normalize();
    _r.crossVectors(_f, UP).normalize();
    _u.crossVectors(_r, _f);
    _m.makeBasis(_r, _u, _v.copy(_f).negate());
    this.tip.position.copy(last);
    this.tip.quaternion.setFromRotationMatrix(_m);

    // Claw of tendrils: spread open for a hand, wrapping when gripping, converging into petals around the muzzle.
    const curl = weapon ? vm.curl : 0.18;
    const baseOff = form * 0.02;
    const ringR = lerp(0.03, 0.05, form);
    const len = lerp(0.17, 0.2, form);
    const splay = lerp(0.6, 0.08, form) - curl * 0.35 + rec * 0.25;
    const rate = (lerp(0.7, 6.0, curl) * (1 - form * 0.4) + form * 3.2) * (1 - rec * 0.4);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const ca = Math.cos(a), sa = Math.sin(a);
      const rx = _r.x * ca + _u.x * sa, ry = _r.y * ca + _u.y * sa, rz = _r.z * ca + _u.z * sa;
      const pts = this.tendrils[k].pts;
      pts[0].set(last.x + _f.x * baseOff + rx * ringR, last.y + _f.y * baseOff + ry * ringR, last.z + _f.z * baseOff + rz * ringR);
      let dx = _f.x * Math.cos(splay) + rx * Math.sin(splay), dy = _f.y * Math.cos(splay) + ry * Math.sin(splay), dz = _f.z * Math.cos(splay) + rz * Math.sin(splay);
      const step = len / (pts.length - 1);
      for (let m = 1; m < pts.length; m++) {
        const k2 = rate * step;
        dx -= rx * k2; dy -= ry * k2; dz -= rz * k2;
        const wob = 0.07 * (m / pts.length), s1 = Math.sin(t * 3.1 + k + m * 0.8), c1 = Math.cos(t * 2.6 + k * 2 + m);
        dx += (_u.x * s1 + _r.x * c1) * wob; dy += (_u.y * s1 + _r.y * c1) * wob; dz += (_u.z * s1 + _r.z * c1) * wob;
        const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
        pts[m].set(pts[m - 1].x + dx * step, pts[m - 1].y + dy * step, pts[m - 1].z + dz * step);
      }
      this.tendrils[k].tm.update(pts);
    }

    if (!weapon) return;
    const SC = 1.35, sq = 1 - rec * 0.14, wd = 1 + rec * 0.2, f = Math.max(0.001, form) * SC;
    this.gland.visible = form > 0.02;
    this.gland.scale.set(f * wd, f * wd, f * sq * (1 + Math.sin(t * 2.4) * 0.012));
    this.coreBall.visible = form > 0.02;
    this.coreBall.position.z = -0.12 * f;
    this.coreBall.scale.setScalar(f * (1 + vm.pulse * 0.9 + Math.sin(t * 3) * 0.08));
    this.throat.visible = form > 0.02;
    this.throat.position.z = -0.31 * f;
    this.throat.scale.setScalar(f * (0.8 + vm.pulse * 1.2));
    this.crystal.visible = form > 0.05;
    this.crystal.position.z = -0.26 * f;
    this.crystal.scale.setScalar(f * (1 + vm.pulse * 0.25));
    this.muzzle.position.z = -0.46 * f - 0.02;
    this.glow.position.z = this.muzzle.position.z;
    vm.glowMat.opacity = vm.pulse * 0.9;
    this.glow.scale.setScalar(0.5 + vm.pulse * 1.3);
    this.light.position.z = this.muzzle.position.z;
    this.light.intensity = vm.pulse * 5;
    // lips: closed bud at rest, flex open on every shot
    const open = 0.08 + vm.pulse * 0.75 + rec * 0.35 + Math.sin(t * 2 + 1) * 0.03;
    for (let i = 0; i < this.lips.length; i++) {
      const L = this.lips[i];
      L.holder.visible = form > 0.05;
      L.holder.position.z = -0.4 * f;
      L.holder.scale.setScalar(f);
      L.lip.rotation.y = -(open + Math.sin(t * 2.6 + i * 1.1) * 0.025);
    }
    for (const sp of this.spines) { sp.visible = form > 0.05; sp.parent.scale.setScalar(f * (1 + vm.pulse * 0.15)); }

    vm.fragMat.color.setRGB(lerp(0.17, 0.4, vm.crystal), lerp(0.19, 0.95, vm.crystal), lerp(0.21, 1, vm.crystal));
    vm.fragMat.emissive.setRGB(0.05 * vm.crystal, 0.8 * vm.crystal, 0.9 * vm.crystal);
    vm.fragMat.emissiveIntensity = 0.6 + vm.pulse * 1.5;
    for (const fr of this.frags) {
      const m = fr.mesh;
      m.visible = vm.frag > 0.01;
      m.position.lerpVectors(fr.sp, fr.ap, vm.crystal);
      m.quaternion.slerpQuaternions(fr.sq, fr.aq, vm.crystal);
      m.scale.lerpVectors(fr.ss, fr.as, vm.crystal).multiplyScalar(vm.frag);
    }
  }

  setVisible(v) {
    this.mesh.mesh.visible = v; this.cord.mesh.visible = v;
    for (const t of this.tendrils) t.tm.mesh.visible = v;
  }
}

// Short idle tentacle curling at the screen edge; makes the player read as many-limbed.
class Feeler {
  constructor(vm, side) {
    this.vm = vm; this.side = side;
    this.N = 8;
    this.anchor = new THREE.Vector3(side * 1.1, -0.9, -0.1);
    this.base = new THREE.Vector3(side * 1.0, -0.05, -0.95);
    this.chain = new SpringChain(this.N, 160, 40, 0.7);
    this.ideal = Array.from({ length: this.N }, () => new THREE.Vector3());
    this.c1 = new THREE.Vector3(); this.c2 = new THREE.Vector3(); this.tipP = new THREE.Vector3();
    this.mesh = new TentacleMesh({ rings: 22, radial: 12, radius: (t) => lerp(0.035, 0.005, Math.pow(t, 0.8)), material: vm.tgelFeeler });
    this.mesh.mesh.renderOrder = 2;
    vm.root.add(this.mesh.mesh);
    this.phase = side * 1.3;
  }

  update(dt, ctx) {
    const t = this.vm.time, s = this.side, vm = this.vm;
    this.tipP.copy(this.base);
    this.tipP.x += Math.sin(t * 0.9 + this.phase) * 0.04 + vm.lagX * 1.5 - s * vm.dashK * 0.1;
    this.tipP.y += Math.sin(t * 1.3 + this.phase) * 0.05 + vm.swayY * 0.8;
    this.tipP.z += vm.lagZ;
    this.c1.copy(this.anchor).lerp(this.tipP, 0.35).y += 0.25;
    this.c2.copy(this.tipP).add(_v.set(-s * 0.18, -0.1 + Math.sin(t * 1.1 + this.phase) * 0.06, 0.2));
    for (let i = 0; i < this.N; i++) bezier(this.anchor, this.c1, this.c2, this.tipP, i / (this.N - 1), this.ideal[i]);
    for (let i = 2; i < this.N; i++) {
      const w = i / (this.N - 1);
      this.ideal[i].x += Math.sin(t * 2.4 - w * 5 + this.phase) * 0.02 * w * (1 + ctx.moveK * 1.5);
      this.ideal[i].y += Math.sin(t * 2.0 - w * 4 + this.phase) * 0.02 * w * (1 + ctx.moveK * 1.5);
    }
    this.chain.step(this.ideal, dt);
    this.mesh.update(this.chain.p);
  }
}

// First-person view: tentacle arms rendered in a separate pass so they never clip into level geometry.
export class ViewModel {
  constructor(geos) {
    this.G = geos;
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.root.add(new THREE.AmbientLight(0x8fb4c4, 1.5));
    const key = new THREE.DirectionalLight(0xe4f8ff, 2.4);
    key.position.set(0.6, 0.9, 0.5);
    this.root.add(key);

    this.tgel = makeTentacleGel({ color: 0x0a4a46, rim: 0x7ff0e0, alpha: 0.5, length: 1.3, r0: 0.14, r1: 0.038 });
    this.tgelThin = makeTentacleGel({ color: 0x0c5a54, rim: 0x9ff4e8, alpha: 0.42, length: 0.2, r0: 0.024, r1: 0.002, suckers: 0 });
    this.tgelFeeler = makeTentacleGel({ color: 0x0a4a46, rim: 0x7ff0e0, alpha: 0.42, length: 1.1, r0: 0.035, r1: 0.005 });
    this.glandGel = makeTentacleGel({ color: 0x0b4c46, rim: 0x9ff4e8, alpha: 0.48, length: 0.45, r0: 0.07, r1: 0.06, suckers: 0 });
    this.lipGel = makeTentacleGel({ color: 0x0f6a60, rim: 0xc6fff6, alpha: 0.5, length: 0.13, r0: 0.03, r1: 0.01, suckers: 0, side: THREE.DoubleSide });
    this.spineGel = makeGel({ color: 0x1a7a74, rim: 0xc6fff6, alpha: 0.5 });
    this.coreMat = new THREE.MeshBasicMaterial({ color: CYAN });
    this.crystalMat = new THREE.MeshBasicMaterial({ color: 0xa6fbf4 });
    this.fragMat = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.35, metalness: 0.85, emissive: 0x000000 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xbffcff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

    this.form = 1; // 0 = bare tentacle tip, 1 = Shardcaster grown
    this.curl = 0; // tendril curl for gripping
    this.frag = 1; // absorbed fragments present
    this.crystal = 1; // fragments aligned/crystallised
    this.cineW = 0; // > 0 while the opening owns the arms
    this.reachW = 0; // right tip pulled toward reachTarget (camera-local)
    this.reachTarget = new THREE.Vector3();
    this.pistol = null;

    this.recoil = 0; this.recoilVel = 0; this.pulse = 0;
    this.swayX = 0; this.swayY = 0; this.lagX = 0; this.lagZ = 0; this.dashK = 0;
    this.time = 0;

    this.right = new Arm(this, 1, true);
    this.left = new Arm(this, -1, false);
    this.feelers = [new Feeler(this, 1), new Feeler(this, -1)];
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
    updateGels(t, this.pulse);
    updateTentacleGels(t, this.pulse);

    this.swayX = damp(this.swayX, clamp(-ctx.lookX * 0.0012, -0.06, 0.06), 7, dt);
    this.swayY = damp(this.swayY, clamp(ctx.lookY * 0.0012, -0.06, 0.06), 7, dt);
    this.lagX = damp(this.lagX, -ctx.velX * 0.003, 6, dt);
    this.lagZ = damp(this.lagZ, ctx.velZ * 0.002, 6, dt);
    this.dashK = damp(this.dashK, ctx.dashing ? 1 : 0, ctx.dashing ? 30 : 9, dt);
    const c = {
      moveK: clamp(Math.hypot(ctx.velX, ctx.velZ) / 7.2, 0, 1),
      lookK: clamp((Math.abs(ctx.lookX) + Math.abs(ctx.lookY)) / 60, 0, 1),
    };
    const cine = this.cineW > 0;
    this.right.update(dt, c);
    this.left.update(dt, c);
    this.left.setVisible(!cine);
    for (const f of this.feelers) { f.update(dt, c); f.mesh.mesh.visible = !cine; }
  }

  render(renderer, camera) {
    renderer.clearDepth();
    renderer.render(this.scene, camera);
  }
}
