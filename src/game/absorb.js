import { nextMemory } from './memories.js';
import { LAB } from '../v2/flags.js';
import { beginV2, runV2, endV2, tickV2, clearResidue } from '../v2/absorbfx.js';
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
const MELT0 = 0.7, MELT1 = 2.0;    // the machine is hauled up off the floor toward you, crumpling
const FEED0 = 0.8, FEED1 = 1.85;   // pulses of dissolved matter run back down the tongues into the arms
const RETRACT0 = 1.7, RETRACT1 = 2.35; // the tongues curl back up
const GULP = 2.4;                  // final swallow: flash, ring and a ripple up the arm
const TOTAL = 2.7;

const ICE = [0.55, 0.9, 1];
const BLUE = [0.15, 0.6, 1];
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _m = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Vector3();

// Absorb shut-down enemies: tap right click (or E, or the ABSORB button) while looking at a powered-down one.
// The tongues latch on and haul the machine up off the floor toward you; it crumples and is torn apart, and the pieces are dragged along
// the tongues into your arms. The player recovers health
// and grows permanently sturdier, and the kill counts for the room.
export class Absorber {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.progress = 0;
    this.drawing = null; // { e, t, from, ... }
    this.hinted = false;
    this.env = 0;        // travelling swell in the forearm, driven by energy arriving
    // pieces of the machine, torn off and dragged along the tongues
    const shardMat = this.shardMat = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.55, metalness: 0.6, emissive: 0x124a66, emissiveIntensity: 1.1 });
    shardMat.userData.noSnap = true;
    const shardGeo = new THREE.DodecahedronGeometry(1, 0);
    this.shards = Array.from({ length: 16 }, () => { const m = new THREE.Mesh(shardGeo, shardMat); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; game.viewmodel.scene.add(m); return { m, t: -1, tg: 0, spin: new THREE.Vector3(), size: 0.03 }; });
    // one long feeding tongue from inside each arm, living in the first-person scene so they draw over the world
    const mat = makeTongueMaterial();
    this.tongues = Array.from({ length: 2 }, () => new Tongue(game.viewmodel.scene, mat));
  }

  hideTongues() { for (const tg of this.tongues) { tg.setVisible(false); tg.pulses.length = 0; } for (const s of this.shards) { s.m.visible = false; s.t = -1; } }

  reset() {
    const g = this.game;
    if (LAB) { endV2(this); clearResidue(this); }
    if (this.drawing) { const e = this.drawing.e; e.absorbing = false; e.group.scale.setScalar(e.baseScale); e.group.rotation.x = 0; e.group.rotation.z = 0; }
    this.target = null; this.progress = 0; this.drawing = null; this.env = 0;
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
    for (const e of LAB ? g.enemies.concat(g.critters) : g.enemies) {
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
    if (LAB) tickV2(this, dt);
    if (this.drawing) { if (LAB) runV2(this, dt); else this.run(dt); return; }
    if (LAB && g.evolution.wheel.open) { ui.setPrompt(''); return; }
    g.absorbFov = lerp(g.absorbFov || 0, 0, Math.min(1, dt * 8));

    const target = this.pick();
    this.target = target;
    if (g.touchUI) g.touchUI.setAbsorb(!!target || !!g.storyAct, target ? 'ABSORB' : (g.storyAct || 'ABSORB'));   // story moments borrow the same button
    if (!vm.reachHeld) vm.reachW = Math.max(0, vm.reachW - dt * 5);      // a story beat holding the reach keeps it
    vm.reachHeld = false;
    vm.bulge = Math.max(0, vm.bulge - dt * 4);

    if (!target) { if (!g.storyAct && !g.opening.routePrompt) ui.setPrompt(''); return; }      // never wipe a prompt something else is showing
    if (!this.hinted) { this.hinted = true; ui.hintOnce('absorb', LAB ? (g.touchMode ? 'TAP ABSORB' : 'RIGHT CLICK TO ABSORB') : (g.touchMode ? 'TAP ABSORB ON SHUT-DOWN ROBOTS' : 'RIGHT CLICK SHUT-DOWN ROBOTS TO ABSORB'), 3); }
    ui.setPrompt(g.touchMode ? 'ABSORB' : 'ABSORB  ·  RMB');
    const c = target.hitSpheres[0].c;
    if (Math.random() < 0.5) g.effects.glowP.emit(c.x + rand(-0.25, 0.25), c.y + rand(-0.2, 0.2), c.z + rand(-0.25, 0.25), 0, 0.6, 0, 0.3, 0.04, 0.15, 0.6, 1);
    if (tap) { if (LAB) beginV2(this, target); else this.begin(target); }
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
    this.drawing.nextShard = MELT0 + 0.08; this.drawing.cur = this.drawing.center.clone();
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

    // ---- the haul: it strains against the tongues, comes up off the floor and is dragged in toward you, crumpling as it comes
    const m = smooth((t - MELT0) / (MELT1 - MELT0));
    const out = smooth((t - FEED0 - 0.5) / (FEED1 + 0.35 - FEED0 - 0.5));   // how much of it is gone
    const shudder = smooth((t - STICK) / 0.15) * (1 - smooth((t - MELT1) / 0.3)) * 0.04;
    const base = e.baseScale, crumple = Math.sin(t * 19) * 0.07 * (1 - out) * smooth((t - MELT0) / 0.3);
    const sx = base * (1 - 0.93 * out) * (1 + crumple), sy = base * (1 - 0.9 * out) * (1 - crumple), sz = base * (1 - 0.93 * out) * (1 + crumple * 0.6);
    e.group.scale.set(Math.max(0.001, sx), Math.max(0.001, sy), Math.max(0.001, sz));
    // toward a point in front of you at chest height
    cam.getWorldDirection(_n);
    _q.copy(cam.position).addScaledVector(_n, 1.25); _q.y = Math.max(0.5, cam.position.y - 0.55);
    const heave = m * m * (3 - 2 * m), cy = lerp(D.center.y, _q.y, heave);
    const dx = (_q.x - D.center.x) * heave, dz = (_q.z - D.center.z) * heave;
    e.pos.set(D.from.x + dx + rand(-1, 1) * shudder, Math.max(0, D.from.y + (cy - D.center.y)), D.from.z + dz + rand(-1, 1) * shudder);
    D.cur.set(D.center.x + dx, cy, D.center.z + dz);
    e.group.rotation.z = Math.sin(t * 3.1) * 0.22 * m; e.group.rotation.x = -0.35 * m;      // hanging from the tongues, swinging a little
    const heat = clamp(smooth((t - STICK) / 0.5) * 0.6 + m * 0.6, 0, 1.2);
    for (const { mat } of e.flashMats) {
      mat.emissive.setRGB(lerp(0.02, 0.1, heat), lerp(0.2, 0.5, heat), lerp(0.7, 0.9, heat));
      mat.emissiveIntensity = 0.5 + 0.55 * heat * (0.75 + 0.25 * Math.sin(t * 34));
    }
    if (!D.gel && t >= STICK) {
      D.gel = true;
      g.audio.play('gel', { vol: 0.6 });
      fx.hitSparks(D.cur, ICE, 18);
      g.addShake(0.1);
    }
    // pieces tear off, sparks follow them toward you
    if (t >= D.nextShard && t < FEED1 + 0.25) {
      D.nextShard = t + rand(0.09, 0.16);
      const sh = this.shards.find((q) => q.t < 0);
      if (sh) { sh.t = 0; sh.tg = Math.random() < 0.5 ? 0 : 1; sh.size = rand(0.03, 0.07); sh.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9)); sh.m.visible = true; g.audio.play('spark', { vol: 0.14 }); }
    }
    if (t >= MELT0 && t < FEED1) {
      _t.subVectors(cam.position, D.cur).normalize();
      for (let i = 0; i < 2; i++) fx.glowP.emit(D.cur.x + rand(-1, 1) * D.r * 0.5, D.cur.y + rand(-1, 1) * D.r * 0.5, D.cur.z + rand(-1, 1) * D.r * 0.5, _t.x * 2 + rand(-0.5, 0.5), _t.y * 2 + rand(-0.5, 0.5), _t.z * 2 + rand(-0.5, 0.5), rand(0.25, 0.5), rand(0.03, 0.06), BLUE[0], BLUE[1], BLUE[2], 0, 0.4);
    }

    // ---- the tongues: uncoil from the arms, latch on, carry the dissolved machine back, curl up again
    const retract = smooth((t - RETRACT0) / (RETRACT1 - RETRACT0));
    let arrived = 0;
    this.tongues.forEach((tg, i) => {
      const tip = D.tips[i], te = t - tip.delay, arm = i ? vm.left : vm.right;
      tg.ext = smooth(te / EXT_T) * (1 - retract);
      tg.uncoil = smooth(te / (EXT_T + 0.1)) * (1 - smooth((t - RETRACT0) / (RETRACT1 - RETRACT0) * 1.15));
      tg.stuck = smooth((t - STICK - tip.delay) / 0.2) * (1 - smooth((t - RETRACT0) / 0.2));
      // base: inside the arm itself, so the tongue grows out of the tentacle with no visible join
      arm.root.updateWorldMatrix(true, false);
      tg.o.copy(arm.root.localToWorld(arm.pointLocal(0.66, _p)));
      // tip: a point on the machine, sinking with it
      tg.t.set(D.cur.x + tip.off.x * (1 - 0.8 * out), D.cur.y + tip.off.y * (1 - 0.8 * out), D.cur.z + tip.off.z * (1 - 0.8 * out));
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
    // the pieces run back along their tongue, faster as they near the arm
    for (const sh of this.shards) {
      if (sh.t < 0) continue;
      sh.t += dt / 0.5;
      if (sh.t >= 1 || this.tongues[sh.tg].ext < 0.3) { sh.t = -1; sh.m.visible = false; continue; }
      const along = 1 - sh.t * sh.t;
      this.tongues[sh.tg].point(along, sh.m.position);
      sh.m.scale.setScalar(sh.size * (0.5 + 0.5 * along));
      sh.m.rotation.x += sh.spin.x * dt; sh.m.rotation.y += sh.spin.y * dt; sh.m.rotation.z += sh.spin.z * dt;
    }
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
    this.hideTongues();
    g.absorbFov = 0;
    g.viewmodel.reachW = 0;
    e.group.scale.setScalar(e.baseScale); e.group.rotation.x = 0; e.group.rotation.z = 0;
    if (LAB) {
      e.die(true);
      // what it was made of decides what it gives: flesh mends you, metal and current feed the arms
      p.health = Math.min(p.maxHealth, p.health + (e.heal ?? HEAL[e.kind] ?? 14) * (e.organic ? 1 : 0.6));
      g.evolution.energy = Math.min(100, g.evolution.energy + (e.organic ? 15 : 45));
      g.evolution.onAbsorbed(e);
      g.ui.setHealth(p.health, p.maxHealth); g.ui.hitMarker(true); g.addShake(0.05);
      return;
    }
    g.arsenal.onAbsorbed(e);
    e.die(true); // counts for the encounter, no explosion
    // every absorbed machine makes the body permanently sturdier
    progress.addMaxHp();
    g.opening.onAbsorbed?.();
    p.maxHealth += 1;
    p.health = Math.min(p.maxHealth, p.health + (e.heal ?? HEAL[e.kind] ?? 14) + 1);
    g.ui.setHealth(p.health, p.maxHealth);
    g.campaign.onAbsorb(e);
    if (!g.ui.noteFresh?.()) g.ui.rewardNote('YOUR HIDE THICKENS  ·  +1');
    const memory = nextMemory();                      // what we touch, we keep: the machine gives up what it remembers
    if (memory) { g.ui.subtitle(memory, 'MEMORY', 4.6); g.audio.play('crystal', { vol: 0.25 }); }
    g.ui.hitMarker(true);
    g.viewmodel.pulseGlow(0.8);
    g.addShake(0.05);
  }
}
