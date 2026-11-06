import * as THREE from 'three';
import { BARE, MUTATIONS, SLOTS, ENERGY_MAX, ENERGY_REGEN, TIER_GROW, MAX_TIER } from './mutations.js';
import { v2node } from './assets.js';
import { makeV2Skin, makeGrowthMaterial } from './armskin.js';
import { MutationWheel } from './wheel.js';

// EVOLUTION. Absorbing something changes your body, your body decides what you can do, and the wheel only ever shows what is actually on you.
//   Temporary, lost with this body: what is grown, how far, energy.
//   Permanent, kept across lives: which mutations you have ever discovered, so they can come back from more sources.
// There are eight limbs. The right arm carries what is selected, the left the one before it, and the six walking limbs carry the rest, so everything you have is visible somewhere on you.
const CODEX = 'intruderv2-codex';
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Evolution {
  constructor(game) {
    this.g = game;
    try { this.codex = new Set(JSON.parse(localStorage.getItem(CODEX) || '[]')); } catch (e) { this.codex = new Set(); }
    this.equipped = []; this.selected = -1; this.lastSelected = -1;
    this.energy = ENERGY_MAX; this.cool = 0; this.pending = null; this.dryT = 0; this.qT = -1; this.timeScale = 1; this.beat = null; this.swap = null; this.mods = { dmgTaken: 1, speed: 1, regen: 1 };
    this.wheel = new MutationWheel(this);
    this.installArms();
    game.body.installV2(game.scene, game.viewmodel.skinShared);
    this.buildHud();
    this.applyLook(true);
  }

  // ---------------------------------------------------------------- the arms themselves, and what can grow on them
  installArms() {
    const vm = this.g.viewmodel, skin = v2node('ArmSkin').geometry, suck = v2node('ArmSuckers').geometry;
    for (const arm of [vm.right, vm.left]) {
      arm.own = { uFront: { value: 1.2 }, uInfect: { value: 0 }, uWound: { value: 0 } };
      arm.skin.geometry = skin; arm.skin.material = makeV2Skin(vm.skinShared, arm.U, arm.own);
      arm.suck.geometry = suck; arm.suckMat = makeGrowthMaterial(v2node('ArmSuckers').material, vm.skinShared, arm.U, { value: -1 }); arm.suck.material = arm.suckMat;
      arm.growths = {}; arm.showing = null;
      for (const m of Object.values(MUTATIONS)) {
        const front = { value: 1.2 }, meshes = m.nodes.map((n) => { const src = v2node(n), me = new THREE.Mesh(src.geometry, makeGrowthMaterial(src.material, vm.skinShared, arm.U, front)); me.frustumCulled = false; me.renderOrder = 5; me.visible = false; arm.root.add(me); return me; });
        arm.growths[m.id] = { front, meshes, grow: 0 };
      }
    }
  }

  buildHud() {
    const w = document.getElementById('weapon');
    const en = document.createElement('div'); en.id = 'v2-energy'; en.innerHTML = '<span class="label">ENERGY</span><div class="bar"><i></i></div>'; w?.appendChild(en); this.enEl = en; this.enFill = en.querySelector('i');
    const t = document.createElement('div'); t.id = 'v2-toast'; t.innerHTML = '<em></em><b></b><small></small>'; document.body.appendChild(t); this.toastEl = t;
  }
  toast(em, title, note, dur = 3.4) { const [a, b, c] = this.toastEl.children; a.textContent = em; b.textContent = title; c.textContent = note; this.toastEl.classList.add('on'); this.toastT = dur; }

  // ---------------------------------------------------------------- state
  get current() { return this.selected >= 0 ? this.equipped[this.selected] : null; }
  get active() { const c = this.current; return c ? c.m : BARE; }
  get tierI() { const c = this.current; return c ? c.tier - 1 : 0; }
  has(id) { return this.equipped.some((q) => q.m.id === id); }

  // A new body. What you know, you still know.
  resetRun() {
    this.equipped = []; this.selected = -1; this.lastSelected = -1; this.energy = ENERGY_MAX; this.cool = 0; this.pending = null; this.beat = null; this.swap = null; this.timeScale = 1; this.wheel.cancel();
    const vm = this.g.viewmodel;
    for (const arm of [vm.right, vm.left]) { for (const g of Object.values(arm.growths)) { g.grow = 0; g.front.value = 1.2; for (const me of g.meshes) me.visible = false; } arm.showing = null; arm.own.uFront.value = 1.2; arm.own.uInfect.value = 0; arm.own.uWound.value = 0; }
    this.applyLook(true); this.recompute();
  }

  recompute() {
    const M = { dmgTaken: 1, speed: 1, regen: 1 };
    for (const q of this.equipped) { const d = q.m.mods ? q.m.mods(q.tier) : {}; for (const k in d) M[k] *= d[k]; }
    this.mods = M; this.g.player.evoSpeed = M.speed;
  }

  // ---------------------------------------------------------------- absorbing
  // What you get from what you absorbed. Its own mutation first; failing that, one you already know of the same nature, which is how past lives help; failing that, what you have grows further.
  onAbsorbed(e) {
    const src = e.kind === 'android' ? e.variant : (e.sourceId || e.kind);
    const nature = e.organic ? 'organic' : 'tech', all = Object.values(MUTATIONS);
    const own = all.filter((m) => m.sources.includes(src));
    const known = all.filter((m) => m.kind === nature && this.codex.has(m.id));
    let pick = own.find((m) => !this.has(m.id)) || known.find((m) => !this.has(m.id));
    if (pick) { this.grow(pick); return pick; }
    const up = this.equipped.filter((q) => (q.m.kind === nature) && q.tier < MAX_TIER).sort((a, b) => (own.includes(b.m) ? 1 : 0) - (own.includes(a.m) ? 1 : 0) || a.tier - b.tier)[0];
    if (up) { this.deepen(up); return up.m; }
    this.energy = ENERGY_MAX; this.toast('', 'NOTHING MORE TO TAKE', 'Your body has no use for this. It feeds you anyway.', 2);
    return null;
  }

  grow(m) {
    const first = !this.codex.has(m.id);
    if (first) { this.codex.add(m.id); try { localStorage.setItem(CODEX, JSON.stringify([...this.codex])); } catch (e) { /* optional */ } }
    if (this.equipped.length >= SLOTS) {
      // every limb is taken: for now the oldest gives way. A real choice here is the next thing to design.
      this.equipped.shift(); if (this.selected >= 0) this.selected = Math.max(0, this.selected - 1); if (this.lastSelected >= 0) this.lastSelected = Math.max(-1, this.lastSelected - 1);
    }
    this.equipped.push({ m, tier: 1 });
    this.recompute(); this.wheel.render();
    this.startBeat(first ? 'A NEW THING GROWS' : 'YOUR BODY REMEMBERS', m.name, m.note);
    this.lastSelected = this.selected; this.selected = this.equipped.length - 1;
    this.applyLook(false);
  }
  deepen(q) {
    q.tier++; this.recompute(); this.wheel.render();
    this.startBeat(`IT SPREADS  ·  STAGE ${q.tier}`, q.m.name, q.m.note);
    const i = this.equipped.indexOf(q); if (i !== this.selected) { this.lastSelected = this.selected; this.selected = i; }
    this.applyLook(false);
  }

  // The moment it happens. The world slows, your arm comes up in front of you, and you watch it change.
  startBeat(em, title, note) {
    const g = this.g;
    this.beat = { t: 0 }; this.toast(em, title, note);
    g.audio.play('gel', { vol: 0.9 }); g.audio.play('crystal', { vol: 0.5 }); g.audio.play('groan', { vol: 0.28 }); g.addShake(0.16); g.viewmodel.pulseGlow(1);
  }

  // Change which arm is up. The arm drops out of view, and rises with the other thing on it.
  select(i) {
    if (i === this.selected || (i >= 0 && !this.equipped[i])) return;
    this.lastSelected = this.selected; this.selected = i; this.g.audio.play('gel', { vol: 0.35 }); this.applyLook(false);
    this.g.ui && (document.getElementById('weaponName').textContent = this.active.name);
  }
  cycle() { const n = this.equipped.length; if (!n) return; this.select(((this.selected + 1) % n)); }

  // What each limb should be carrying now.
  applyLook(instant) {
    const vm = this.g.viewmodel;
    document.getElementById('weaponName') && (document.getElementById('weaponName').textContent = this.active.name);
    this.wantR = this.current ? this.current : null;
    this.wantL = this.lastSelected >= 0 && this.lastSelected !== this.selected ? this.equipped[this.lastSelected] : null;
    if (instant) { this.setArm(vm.right, this.wantR); this.setArm(vm.left, this.wantL); vm.setStyleObj(this.active.style); return; }
    this.swap = { t: 0, done: false };
  }
  setArm(arm, q) {
    const id = q ? q.m.id : null;
    for (const [k, g] of Object.entries(arm.growths)) { const on = k === id; for (const me of g.meshes) me.visible = on; if (!on) g.grow = 0; }
    arm.showing = q;
    arm.own.uInfect.value = q ? q.m.infect : 0;
    this.g.body.setLimbs?.(this.limbList());
  }
  limbList() { return this.equipped.filter((q) => q !== this.wantR && q !== this.wantL); }

  // ---------------------------------------------------------------- every frame
  step(dt, trigger, enabled, latched) {
    const g = this.g, input = g.input, vm = g.viewmodel, weapon = g.weapon;
    const live = g.state === 'playing' && !g.player.dead;
    if (live) {
      for (let i = 0; i < SLOTS; i++) if (input.was('Digit' + (i + 1))) this.select(i);
      if (input.was('Digit0')) this.select(-1);
      if (input.down('KeyQ')) { if (this.qT < 0) this.qT = 0; else { this.qT += dt; if (this.qT > 0.18 && !this.wheel.open) this.wheel.show(); } }
      else if (this.qT >= 0) { if (this.wheel.open) this.wheel.close(); else this.cycle(); this.qT = -1; }
    } else { if (this.wheel.open) this.wheel.cancel(); this.qT = -1; }

    this.energy = Math.min(ENERGY_MAX, this.energy + ENERGY_REGEN * this.mods.regen * dt);
    this.cool = Math.max(0, this.cool - dt);
    this.enFill.style.width = this.energy + '%';
    this.dryT = Math.max(0, this.dryT - dt); this.enEl.classList.toggle('dry', this.dryT > 0);
    g.arsenal.updateFx(dt);

    // a blow lands a moment after the arm starts to move
    if (this.pending) { this.pending.t -= dt; if (this.pending.t <= 0) { this.land(this.pending.a); this.pending = null; } }
    const swapping = this.swap && !this.swap.done;
    const a = this.active.attack, ti = this.tierI, want = enabled && live && !this.wheel.open && !swapping && !this.beat;
    if (a.type === 'shard') {
      weapon.damage = a.dmg[ti]; weapon.interval = a.interval[ti];
      const can = this.energy >= a.cost[ti], before = weapon.shots;
      weapon.step(dt, trigger, want && can);
      if (weapon.shots > before) this.energy -= a.cost[ti];
      if (want && !can && (trigger || latched)) this.dry();
    } else {
      if (want && (trigger || latched) && this.cool <= 0) {
        if (this.energy < a.cost[ti]) this.dry();
        else {
          this.energy -= a.cost[ti]; this.cool = a.rate[ti];
          if (a.type === 'melee') { vm.strike(a.dur, a.heavy); this.pending = { t: a.hitAt, a }; g.audio.play('dash', { vol: a.heavy ? 0.7 : 0.45 }); }
          else if (a.type === 'arc') { g.arsenal.dmgK = a.dmgK[ti]; g.arsenal.arc(); }
        }
      }
      weapon.step(dt, false, false);
      weapon.pressLatch = false;
    }
  }

  dry() { if (this.dryT <= 0) this.g.audio.play('clatter', { vol: 0.25 }); this.dryT = 0.35; }

  // The blow arrives. Every machine in reach and in front of you.
  land(a) {
    const g = this.g, cam = g.camera; cam.getWorldDirection(_d); _o.copy(cam.position);
    let hits = 0; const dmg = a.dmg[this.tierI] ?? a.dmg[0];
    for (const e of g.enemies) {
      if (!e.alive || e.absorbing || !e.hitSpheres?.[0]) continue;
      const c = e.hitSpheres[0].c; _a.subVectors(c, _o); const d = _a.length(); if (d > a.range || d < 0.05) continue;
      if (_a.divideScalar(d).dot(_d) < a.cone) continue;
      if (g.world.blocked(_o.x, _o.y, _o.z, c.x, c.y, c.z, (b) => b.tag !== 'barrel')) continue;
      g.onPlayerHit(e, dmg, c.clone()); hits++;
      if (a.heavy && e.alive) { const l = Math.hypot(_a.x, _a.z) || 1; e.pos.x += (_a.x / l) * 0.9; e.pos.z += (_a.z / l) * 0.9; }
    }
    if (hits) { g.audio.play('hit', { vol: a.heavy ? 1 : 0.7 }); g.addShake(a.heavy ? 0.24 : 0.09); g.hitStop = a.heavy ? 0.075 : 0.035; g.kick = Math.min(0.05, (g.kick || 0) + 0.02); }
  }

  // runs in the frame, not the simulation: pure presentation
  update(dt) {
    const g = this.g, vm = g.viewmodel;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('on'); }
    // changing arms
    let swapK = 0;
    if (this.swap) {
      const s = this.swap; s.t += dt / 0.34; swapK = Math.sin(Math.min(1, s.t) * Math.PI);
      if (s.t >= 0.5 && !s.done) { s.done = true; this.setArm(vm.right, this.wantR); this.setArm(vm.left, this.wantL); vm.setStyleObj(this.active.style); }
      if (s.t >= 1) this.swap = null;
    }
    vm.swapK = swapK;
    // the evolving moment
    let insp = 0, slow = this.wheel.open ? 0.22 : 1;
    if (this.beat) {
      const b = this.beat; b.t += dt;
      const T = b.t; insp = Math.min(1, T / 0.35) * (1 - clamp((T - 1.5) / 0.35, 0, 1));
      slow = Math.min(slow, 0.5);
      vm.charge = 0;
      if (T > 1.85) { this.beat = null; vm.charge = 0; }
    }
    this.timeScale = slow;
    vm.inspectK = insp;
    // growth spreads up each arm toward where it has been told to reach, and stays raw while it moves
    for (const arm of [vm.right, vm.left]) {
      const q = arm.showing; let moving = 0;
      if (q) {
        const G = arm.growths[q.m.id], want = TIER_GROW[q.tier - 1], before = G.grow;
        if (G.grow < 0.3) G.grow = 0.3;
        G.grow = Math.min(want, G.grow + dt * 0.42);
        moving = G.grow < want ? 1 : Math.max(0, arm.own.uWound.value - dt * 2);
        const front = 1.03 - G.grow * 1.03; G.front.value = front; arm.own.uFront.value = front;
        if (before < want && Math.random() < dt * 22) { arm.tip && g.audio; }
      } else arm.own.uFront.value = 1.2;
      arm.own.uWound.value = moving;
    }
  }

  // development: fill the wheel, to prove eight limbs work without having to absorb eight things
  devFill() {
    const ids = Object.values(MUTATIONS), fill = [];
    for (let i = 0; i < SLOTS; i++) fill.push({ m: ids[i % ids.length], tier: 1 + (i % 3) });
    this.equipped = fill; this.selected = 0; this.lastSelected = 1; this.recompute(); this.applyLook(true); this.wheel.render();
  }
}
