import * as THREE from 'three';
import { clamp, lerp, smooth, rand } from '../core/util.js';
import { progress } from './progress.js';
import { Tongue, makeTongueMaterial } from '../presentation/tongues.js';

const RANGE = 4.4;          // metres from the eye
const CONE = 0.9;           // cosine of the aiming cone
const HEAL = { bug: 14, drone: 24 };

// Timeline of one absorption, in seconds from the tap.
const EXT_T = 0.55;                // butterfly tongues uncoil out of both arms and reach the machine
const STICK = 0.62;                // the tips latch on
const MELT0 = 0.7, MELT1 = 1.5;    // the machine dissolves into a glowing puddle
const FEED0 = 0.8, FEED1 = 1.85;   // pulses of dissolved matter run back down the tongues into the arms
const RETRACT0 = 1.7, RETRACT1 = 2.35; // the tongues curl back up
const GULP = 2.4;                  // final swallow: flash, ring and a ripple up the arm
const TOTAL = 2.7;

const ICE = [0.55, 0.9, 1];
const BLUE = [0.15, 0.6, 1];
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _m = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Vector3();

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
    // six butterfly tongues, three from each arm, living in the first-person scene so they draw over the world
    const mat = makeTongueMaterial();
    this.tongues = Array.from({ length: 6 }, () => new Tongue(game.viewmodel.scene, mat));
  }

  hideTongues() { for (const tg of this.tongues) { tg.setVisible(false); tg.pulses.length = 0; } }

  reset() {
    const g = this.game;
    if (this.drawing) { const e = this.drawing.e; e.absorbing = false; e.group.scale.setScalar(e.baseScale); }
    this.target = null; this.progress = 0; this.drawing = null; this.env = 0;
    this.puddle.visible = false; this.core.visible = false;
    this.hideTongues();
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
    if (!this.hinted) { this.hinted = true; ui.hintOnce('absorb', g.touchMode ? 'TAP ABSORB ON SHUT-DOWN ROBOTS' : 'RIGHT CLICK SHUT-DOWN ROBOTS TO ABSORB', 3); }
    ui.setPrompt(g.touchMode ? 'ABSORB' : 'ABSORB  ·  RMB');
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
    {
      const D = this.drawing;
      D.tips = this.tongues.map((tg, i) => {
        const dir = _q.set(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize();
        tg.bow.set(rand(-1, 1), rand(0.2, 1), rand(-1, 1)).normalize();
        tg.turns = 2.2 + Math.random() * 1.6; tg.spin = Math.random() < 0.5 ? -1 : 1;
        tg.ext = 0; tg.uncoil = 0; tg.stuck = 0; tg.pulses.length = 0; tg.setVisible(true);
        return { off: dir.multiplyScalar(D.r * 0.55).clone(), delay: 0.05 * i, nextPulse: FEED0 + 0.05 * i + Math.random() * 0.1 };
      });
    }
    this.puddle.position.set(e.pos.x, 0.025, e.pos.z);
    this.puddle.scale.setScalar(0.01);
    this.puddle.material.opacity = 0;
    this.puddle.visible = true;
    this.core.position.set(e.pos.x, 0.03, e.pos.z);
    this.core.scale.setScalar(0.01);
    this.core.visible = true;
    g.audio.play('absorb', { vol: 0.7 });
    g.audio.play('servo', { vol: 0.3 });
    g.ui.setPrompt('');
    g.ui.setHold(null);
  }

  run(dt) {
    const g = this.game, vm = g.viewmodel, fx = g.effects, D = this.drawing, e = D.e, cam = g.camera;
    D.t += dt;
    const t = D.t;
    cam.updateMatrixWorld();

    // ---- the hands lean toward the machine while the tongues work
    vm.reachTarget.copy(cam.worldToLocal(_p.copy(D.center)));
    vm.reachW = 0.22 * smooth(t / 0.4) * (1 - smooth((t - RETRACT1) / 0.3));

    // ---- melt: the machine shudders, then flattens and sinks into a puddle of light
    const m = smooth((t - MELT0) / (MELT1 - MELT0));
    const out = smooth((t - FEED0 - 0.35) / (FEED1 - FEED0 - 0.35));   // how much of the body is gone
    const shudder = smooth((t - STICK) / 0.15) * (1 - smooth((t - MELT0) / 0.5)) * 0.035;
    const base = e.baseScale;
    const sx = base * (1 + 0.38 * m) * (1 - out), sy = base * Math.max(0.02, 1 - 0.88 * m) * (1 - 0.6 * out);
    e.group.scale.set(Math.max(0.001, sx), Math.max(0.001, sy), Math.max(0.001, sx));
    e.pos.set(D.from.x + rand(-1, 1) * shudder, lerp(D.from.y, e.kind === 'drone' ? 0.1 : D.from.y - 0.05, m), D.from.z + rand(-1, 1) * shudder);
    e.group.rotation.y += dt * (2 + 9 * m);
    const heat = clamp(smooth((t - STICK) / 0.5) * 0.6 + m * 0.6, 0, 1.2);
    for (const { mat } of e.flashMats) {
      mat.emissive.setRGB(lerp(0.04, 0.55, heat), lerp(0.38, 0.95, heat), lerp(1, 0.9, heat));
      mat.emissiveIntensity = 0.9 + 2.4 * heat * (0.8 + 0.2 * Math.sin(t * 40));
    }
    if (!D.gel && t >= STICK) {
      D.gel = true;
      g.audio.play('gel', { vol: 0.6 });
      fx.hitSparks(D.center, ICE, 16);
      for (let i = 0; i < 2; i++) { _n.set(0, 1, 0); _p.set(e.pos.x, 0.03, e.pos.z); fx.ring(_p, _n, 0x4aa8ff, D.r * (1.6 + i * 0.5), 0.5); }
    }
    // drips and the puddle
    if (t >= MELT0 && t < FEED1) {
      const n = Math.round(rand(1, 3));
      for (let i = 0; i < n; i++) fx.glowP.emit(D.center.x + rand(-1, 1) * D.r * 0.7, D.center.y * (1 - 0.5 * m), D.center.z + rand(-1, 1) * D.r * 0.7, rand(-0.4, 0.4), rand(0.2, 1.2), rand(-0.4, 0.4), rand(0.35, 0.6), rand(0.04, 0.08), BLUE[0], BLUE[1], BLUE[2], 10, 0.4);
    }
    const pr = D.r * (0.2 + 1.5 * m) * (1 - 0.7 * smooth((t - FEED1 + 0.2) / 0.5));
    this.puddle.scale.setScalar(Math.max(0.01, pr * (1 + 0.05 * Math.sin(t * 9))));
    this.puddle.material.opacity = 0.55 * m * (1 - smooth((t - FEED1) / 0.35));
    this.core.scale.setScalar(Math.max(0.01, pr * 0.55));
    this.core.material.opacity = 0.7 * m * (1 - smooth((t - FEED1 + 0.1) / 0.35));
    this.puddle.position.set(e.pos.x, 0.025, e.pos.z);
    this.core.position.set(e.pos.x, 0.03, e.pos.z);

    // ---- the tongues: uncoil from the arms, latch on, carry the dissolved machine back, curl up again
    const retract = smooth((t - RETRACT0) / (RETRACT1 - RETRACT0));
    let arrived = 0;
    this.tongues.forEach((tg, i) => {
      const tip = D.tips[i], te = t - tip.delay, side = i < 3 ? 1 : -1, k = i % 3;
      tg.ext = smooth(te / EXT_T) * (1 - retract);
      tg.uncoil = smooth(te / (EXT_T + 0.1)) * (1 - smooth((t - RETRACT0) / (RETRACT1 - RETRACT0) * 1.15));
      tg.stuck = smooth((t - STICK - tip.delay) / 0.2) * (1 - smooth((t - RETRACT0) / 0.2));
      // base: on the arm, in front of the eye
      tg.o.copy(cam.localToWorld(_p.set(side * (0.26 + 0.04 * k), -0.3 + 0.05 * k, -0.6 - 0.03 * k)));
      // tip: a point on the machine, sinking with it
      tg.t.set(D.center.x + tip.off.x, D.center.y * (1 - 0.55 * m) + tip.off.y * (1 - 0.6 * m), D.center.z + tip.off.z);
      // matter flows back toward the arm
      if (t >= tip.nextPulse && t < FEED1 && tg.ext > 0.95) { tg.pulses.push(1); tip.nextPulse = t + rand(0.12, 0.2); }
      for (let j = tg.pulses.length - 1; j >= 0; j--) {
        tg.pulses[j] -= dt * 1.7;
        if (tg.pulses[j] < 0.03) { tg.pulses.splice(j, 1); arrived++; }
      }
      tg.update(g.time);
      // acid fizz where a tip is latched on
      if (tg.stuck > 0.5 && t < FEED1 + 0.1 && Math.random() < 0.7) {
        tg.point(1, _p);
        fx.glowP.emit(_p.x, _p.y, _p.z, rand(-0.8, 0.8), rand(0.2, 1.4), rand(-0.8, 0.8), rand(0.2, 0.45), rand(0.03, 0.06), ICE[0], ICE[1], ICE[2], 6, 0.5);
      }
    });
    this.env = Math.min(1, this.env + arrived * 0.12);
    this.env *= Math.exp(-4 * dt);
    // the swallowing travels up the forearms; the hands pulse with every arrival
    vm.bulge = this.env * 0.95;
    vm.pulseGlow(0.2 + this.env * 0.5);
    if (arrived) { g.addShake(0.004 * arrived); if (!D.drawSfx || Math.random() < 0.3) { D.drawSfx = true; g.audio.play('swallow', { vol: 0.5 }); } }
    // the view tightens a little while it feeds
    const flow = smooth((t - FEED0) / 0.4) * (1 - smooth((t - GULP) / 0.25));
    g.absorbFov = -4 * flow;

    // ---- gulp: one big swallow, flash and ring from the hands
    if (!D.gulp && t >= GULP) {
      D.gulp = true;
      vm.pulseGlow(1);
      vm.recoilVel += 6;
      this.env = 1;
      vm.right.muzzle.getWorldPosition(_m);
      fx.flashLight(_m, 0x4aa8ff, 70, 0.35);
      fx.hitSparks(_m, ICE, 16);
      g.addShake(0.12);
      g.audio.play('crystal', { vol: 0.6 });
    }
    if (t >= TOTAL) this.finish(e);
  }

  finish(e) {
    const g = this.game, p = g.player;
    this.drawing = null; this.target = null; this.progress = 0;
    this.puddle.visible = false; this.core.visible = false;
    this.hideTongues();
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
