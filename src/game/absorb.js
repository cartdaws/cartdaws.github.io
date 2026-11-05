import * as THREE from 'three';
import { clamp, lerp, smooth, rand } from '../core/util.js';
import { progress } from './progress.js';

const RANGE = 4.4;          // metres from the eye
const CONE = 0.9;           // cosine of the aiming cone
const HEAL = { bug: 14, drone: 24 };

// Timeline of one absorption, in seconds from the tap.
const LOCK = 0.3;           // the arm reaches out, scan rings close in, the machine shudders and brightens
const MELT0 = 0.3, MELT1 = 1.05;   // the body liquefies into a glowing puddle
const DRAW0 = 0.5, DRAW1 = 1.75;   // energy is drawn from it in a spiralling stream into the hand
const GULP = 1.8;           // final swallow: a ripple up the arm, flash and ring
const TOTAL = 2.05;

const UP = new THREE.Vector3(0, 1, 0);
const BLUE = [0.15, 0.6, 1];
const ICE = [0.55, 0.9, 1];
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _m = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3();

// Absorb shut-down enemies: tap right click (or E, or the ABSORB button) while looking at a powered-down one.
// The machine is scanned, melts into a puddle of light and is drawn into the weapon arm; the player recovers health
// and grows permanently sturdier, and the kill counts for the room.
export class Absorber {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.progress = 0;
    this.drawing = null; // { e, t, from, ... }
    this.hinted = false;
    this.env = 0;        // travelling swell in the forearm, driven by energy arriving
    // the puddle the machine melts into
    this.puddle = new THREE.Mesh(
      new THREE.CircleGeometry(1, 36),
      new THREE.MeshBasicMaterial({ color: 0x2a9bff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    this.puddle.rotation.x = -Math.PI / 2;
    this.puddle.visible = false;
    this.puddle.material.userData.noSnap = true;
    game.scene.add(this.puddle);
    this.core = new THREE.Mesh(
      new THREE.CircleGeometry(1, 28),
      new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    this.core.rotation.x = -Math.PI / 2;
    this.core.visible = false;
    this.core.material.userData.noSnap = true;
    game.scene.add(this.core);
  }

  reset() {
    const g = this.game;
    if (this.drawing) { const e = this.drawing.e; e.absorbing = false; e.group.scale.setScalar(e.baseScale); }
    this.target = null; this.progress = 0; this.drawing = null; this.env = 0;
    this.puddle.visible = false; this.core.visible = false;
    g.absorbFov = 0;
    g.viewmodel.reachW = 0;
    g.viewmodel.bulge = 0;
    g.ui.setPrompt('');
    g.ui.setHold(null);
    if (g.touchUI) g.touchUI.setAbsorb(false);
  }

  // Best powered-down machine in front of the player, or null.
  pick() {
    const g = this.game;
    g.camera.getWorldDirection(_d);
    const cp = g.camera.position;
    let best = null, bestDot = CONE;
    for (const e of g.enemies) {
      if (!e.absorbable) continue;
      const c = e.hitSpheres[0].c;
      _t.subVectors(c, cp);
      const dist = _t.length();
      if (dist > RANGE || dist < 0.3) continue;
      const dot = _t.divideScalar(dist).dot(_d);
      if (dot < bestDot) continue;
      if (g.world.blocked(cp.x, cp.y, cp.z, c.x, c.y, c.z, (b) => b.tag !== 'barrel')) continue;
      best = e; bestDot = dot;
    }
    return best;
  }

  update(dt) {
    const g = this.game, vm = g.viewmodel, input = g.input, ui = g.ui;
    const tap = input.clicked(2) || input.was('KeyE') || input.absorbTap;
    input.absorbTap = false;
    if (this.drawing) { this.run(dt); return; }
    g.absorbFov = lerp(g.absorbFov || 0, 0, Math.min(1, dt * 8));

    const target = this.pick();
    this.target = target;
    if (g.touchUI) g.touchUI.setAbsorb(!!target);
    vm.reachW = Math.max(0, vm.reachW - dt * 5);
    vm.bulge = Math.max(0, vm.bulge - dt * 4);

    if (!target) { ui.setPrompt(''); return; }
    if (!this.hinted) { this.hinted = true; ui.hint(g.touchMode ? 'TAP ABSORB ON DISABLED ROBOTS' : 'RIGHT CLICK TO ABSORB DISABLED ROBOTS', 4); }
    ui.setPrompt(g.touchMode ? 'ABSORB' : 'RIGHT CLICK — ABSORB');
    const c = target.hitSpheres[0].c;
    if (Math.random() < 0.5) g.effects.glowP.emit(c.x + rand(-0.25, 0.25), c.y + rand(-0.2, 0.2), c.z + rand(-0.25, 0.25), 0, 0.6, 0, 0.3, 0.04, 0.15, 0.6, 1);
    if (tap) this.begin(target);
  }

  begin(e) {
    const g = this.game;
    e.absorbing = true;
    e.flashT = 0;
    const c = e.hitSpheres[0].c;
    this.drawing = {
      e, t: 0, from: e.pos.clone(), center: c.clone(), r: e.hitSpheres[0].r,
      rings: 0, gel: false, gulp: false, drawSfx: false, emitAcc: 0, fovK: 0,
    };
    this.env = 0;
    this.puddle.position.set(e.pos.x, 0.025, e.pos.z);
    this.puddle.scale.setScalar(0.01);
    this.puddle.material.opacity = 0;
    this.puddle.visible = true;
    this.core.position.set(e.pos.x, 0.03, e.pos.z);
    this.core.scale.setScalar(0.01);
    this.core.visible = true;
    g.audio.play('absorb', { vol: 0.7 });
    g.ui.setPrompt('');
    g.ui.setHold(null);
  }

  run(dt) {
    const g = this.game, vm = g.viewmodel, fx = g.effects, D = this.drawing, e = D.e;
    D.t += dt;
    const t = D.t;
    // the mouth of the weapon arm, in world space
    const mouth = vm.right.muzzle.getWorldPosition(_m);
    g.camera.updateMatrixWorld();

    // ---- reach: the arm stretches out to the machine and stays on it
    vm.reachTarget.copy(g.camera.worldToLocal(_p.copy(D.center)));
    vm.reachW = 0.3 * smooth(t / LOCK) * (1 - smooth((t - GULP) / 0.25));

    // ---- lock: three scan rings close around the machine, which shudders and brightens
    while (D.rings < 3 && t >= D.rings * 0.1) {
      D.rings++;
      _n.set(0, 1, 0);
      _p.set(e.pos.x, 0.03, e.pos.z);
      fx.ring(_p, _n, 0x4aa8ff, D.r * (1.5 + D.rings * 0.45), 0.5);
    }
    const lock = smooth(t / LOCK);
    const shake = (1 - smooth((t - MELT0) / 0.5)) * 0.03 * lock;
    // ---- melt: flatten and sink into a puddle of light
    const m = smooth((t - MELT0) / (MELT1 - MELT0));
    const out = smooth((t - DRAW0 - 0.2) / (DRAW1 - DRAW0 - 0.2)); // how much of the body has gone into the stream
    const base = e.baseScale;
    const sx = base * (1 + 0.38 * m) * (1 - out), sy = base * Math.max(0.02, 1 - 0.88 * m) * (1 - 0.6 * out);
    e.group.scale.set(Math.max(0.001, sx), Math.max(0.001, sy), Math.max(0.001, sx));
    e.pos.set(D.from.x + rand(-1, 1) * shake, lerp(D.from.y, e.kind === 'drone' ? 0.1 : D.from.y - 0.05, m), D.from.z + rand(-1, 1) * shake);
    e.group.rotation.y += dt * (3 + 10 * m);
    // glow climbs from blue to white-hot
    const heat = clamp(lock * 0.6 + m * 0.6, 0, 1.2);
    for (const { mat } of e.flashMats) {
      mat.emissive.setRGB(lerp(0.04, 0.7, heat), lerp(0.38, 0.92, heat), 1);
      mat.emissiveIntensity = 0.9 + 2.6 * heat * (0.8 + 0.2 * Math.sin(t * 40));
    }
    if (!D.gel && t >= MELT0) { D.gel = true; g.audio.play('gel', { vol: 0.5 }); fx.hitSparks(D.center, ICE, 14); }

    // drips and the puddle
    if (t >= MELT0 && t < DRAW1) {
      const n = Math.round(rand(1, 3));
      for (let i = 0; i < n; i++) fx.glowP.emit(D.center.x + rand(-1, 1) * D.r * 0.7, D.center.y * (1 - 0.5 * m), D.center.z + rand(-1, 1) * D.r * 0.7, rand(-0.4, 0.4), rand(0.2, 1.2), rand(-0.4, 0.4), rand(0.35, 0.6), rand(0.04, 0.08), BLUE[0], BLUE[1], BLUE[2], 10, 0.4);
    }
    const pr = D.r * (0.2 + 1.5 * m) * (1 - 0.7 * smooth((t - DRAW1 + 0.2) / 0.5));
    this.puddle.scale.setScalar(Math.max(0.01, pr * (1 + 0.05 * Math.sin(t * 9))));
    this.puddle.material.opacity = 0.55 * m * (1 - smooth((t - DRAW1) / 0.3));
    this.core.scale.setScalar(Math.max(0.01, pr * 0.55));
    this.core.material.opacity = 0.7 * m * (1 - smooth((t - DRAW1 + 0.1) / 0.3));
    this.puddle.position.set(e.pos.x, 0.025, e.pos.z);
    this.core.position.set(e.pos.x, 0.03, e.pos.z);

    // ---- draw: a spiralling stream of energy from the machine into the hand
    if (t >= DRAW0 && t < DRAW1) {
      if (!D.drawSfx) { D.drawSfx = true; g.audio.play('swallow', { vol: 0.9 }); }
      D.emitAcc += dt * (140 + 260 * smooth((t - DRAW0) / 0.5));
      while (D.emitAcc >= 1) {
        D.emitAcc -= 1;
        const a = rand(0, Math.PI * 2), rr = rand(0.1, 1) * D.r * (1 - 0.5 * m);
        fx.streamP.emit(
          D.center.x + Math.cos(a) * rr, D.center.y * (1 - 0.6 * m) + rand(-0.1, 0.2), D.center.z + Math.sin(a) * rr,
          rand(-1.0, 1.0), rand(0.6, 1.8), rand(-1.0, 1.0),
          rand(1.3, 1.8), rand(0.05, 0.1), ICE[0], ICE[1], ICE[2], 0, 0.5,
        );
      }
    }
    const arrived = fx.streamP.attract(mouth.x, mouth.y, mouth.z, 6.5, 2.5, dt, 0.3);
    this.env = Math.min(1, this.env + arrived * 0.05);
    this.env *= Math.exp(-4.5 * dt);
    // the swallowing travels up the forearm; the hand pulses with every arrival
    vm.bulge = this.env * 0.95;
    vm.pulseGlow(0.2 + this.env * 0.55);
    if (arrived) g.addShake(0.004 * arrived);
    // the view is drawn in a little as the energy flows
    const flow = smooth((t - DRAW0) / 0.5) * (1 - smooth((t - GULP) / 0.25));
    g.absorbFov = -4.5 * flow;

    // ---- gulp: one big swallow, flash and ring from the hand
    if (!D.gulp && t >= GULP) {
      D.gulp = true;
      vm.pulseGlow(1);
      vm.recoilVel += 6;
      this.env = 1;
      fx.flashLight(mouth, 0x4aa8ff, 70, 0.35);
      fx.hitSparks(mouth, ICE, 14);
      g.addShake(0.12);
      g.audio.play('crystal', { vol: 0.6 });
    }
    if (t >= TOTAL) this.finish(e);
  }

  finish(e) {
    const g = this.game, p = g.player;
    this.drawing = null; this.target = null; this.progress = 0;
    this.puddle.visible = false; this.core.visible = false;
    g.absorbFov = 0;
    g.viewmodel.reachW = 0;
    e.group.scale.setScalar(e.baseScale);
    e.die(true); // counts for the encounter, no explosion
    // every absorbed machine makes the body permanently sturdier
    progress.addMaxHp();
    p.maxHealth += 1;
    p.health = Math.min(p.maxHealth, p.health + (e.heal ?? HEAL[e.kind] ?? 14) + 1);
    g.ui.setHealth(p.health, p.maxHealth);
    g.ui.rewardNote('MAX HP +1');
    g.ui.hitMarker(true);
    g.viewmodel.pulseGlow(0.8);
    g.addShake(0.05);
  }
}
