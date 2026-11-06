import * as THREE from 'three';
import { BARE, MUTATIONS, SLOTS, ENERGY_MAX, ENERGY_REGEN, TIER_GROW, MAX_TIER, STACK_BONUS } from './mutations.js';
import { Inspect } from './inspect.js';
import { Abilities } from './abilities.js';
import { v2node } from './assets.js';
import { makeV2Skin, makeGrowthMaterial } from './armskin.js';
import { MutationWheel } from './wheel.js';

// EVOLUTION. Absorbing something changes your body, your body decides what you can do, and the wheel only ever shows what is actually on you.
//   Temporary, lost with this body: what is grown, how far, energy.
//   Permanent, kept across lives: which mutations you have ever discovered, so they can come back from more sources.
// There are eight limbs, and each slot on the wheel is one of them. What grows on a limb stays on it. Choosing a mutation raises the limb that carries it; the one you raised before stays up on your left; the other six walk.
const CODEX = 'intruderv2-codex';
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Evolution {
  constructor(game) {
    this.g = game;
    try { this.codex = new Set(JSON.parse(localStorage.getItem(CODEX) || '[]')); } catch (e) { this.codex = new Set(); }
    this.equipped = []; this.selected = -1; this.lastSelected = -1; this.offers = []; this.qBlock = false;
    this.energy = ENERGY_MAX; this.cool = 0; this.pending = null; this.dryT = 0; this.qT = -1; this.timeScale = 1; this.beat = null; this.swap = null; this.mods = { dmgTaken: 1, speed: 1, regen: 1 };
    this.wheel = new MutationWheel(this); this.inspect = new Inspect(game); this.abilities = new Abilities(game); this.chargeHit = new Set(); this.regenHold = 0; this.stats = {};
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
        const front = { value: 1.2 }, meshes = m.nodes.map((n) => { const src = v2node(n), me = new THREE.Mesh(src.geometry, makeGrowthMaterial(src.material, vm.skinShared, arm.U, front, arm.own.uWound)); me.frustumCulled = false; me.renderOrder = 5; me.visible = false; arm.root.add(me); return me; });
        arm.growths[m.id] = { front, meshes };
      }
    }
  }

  buildHud() {
    const w = document.getElementById('weapon');
    const en = document.createElement('div'); en.id = 'v2-energy'; en.innerHTML = '<span class="label">ENERGY</span><div class="bar"><i></i></div>'; w?.appendChild(en); this.enEl = en; this.enFill = en.querySelector('i');
    // your eight limbs, from above: what each carries, and which are up
    const lb = document.createElement('div'); lb.id = 'v2-limbs'; lb.innerHTML = '<u></u>' + Array.from({ length: SLOTS }, (_, k) => { const a = (22.5 + k * 45) * Math.PI / 180; return `<i style="left:${(50 + Math.sin(a) * 40).toFixed(1)}%;top:${(50 - Math.cos(a) * 40).toFixed(1)}%"></i>`; }).join(''); w?.appendChild(lb); this.limbEls = [...lb.querySelectorAll('i')];
    const st = document.createElement('style'); st.textContent = '#v2-limbs{position:relative;width:62px;height:62px;margin:10px 0 0 auto}#v2-limbs u{position:absolute;left:50%;top:50%;width:13px;height:13px;margin:-6.5px;border-radius:50%;background:rgba(214,190,190,.3)}#v2-limbs i{position:absolute;width:9px;height:9px;margin:-4.5px;border-radius:50%;background:rgba(214,208,200,.13);border:1px solid rgba(214,208,200,.3);transition:transform .15s}#v2-limbs i.up{transform:scale(1.5);border-color:#fff}body.v2-inspect #hud #weapon{opacity:.35}'; document.head.appendChild(st);
    const t = document.createElement('div'); t.id = 'v2-toast'; t.innerHTML = '<em></em><b></b><small></small>'; document.body.appendChild(t); this.toastEl = t;
  }
  toast(em, title, note, dur = 3.4) { const [a, b, c] = this.toastEl.children; a.textContent = em; b.textContent = title; c.textContent = note; this.toastEl.classList.add('on'); this.toastT = dur; }

  // ---------------------------------------------------------------- state
  get current() { return this.selected >= 0 ? this.equipped[this.selected] : null; }
  get active() { const c = this.current; return c ? c.m : BARE; }
  get tierI() { const c = this.current; return c ? c.tier - 1 : 0; }
  has(id) { return this.equipped.some((q) => q.m.id === id); }
  // Every mutation holds one limb and deepens every time you absorb its enemy. Stages 1 to 3 spread it over the limb and the body; after that it simply keeps getting stronger and bigger.
  powerK(q) { return q ? 1 + STACK_BONUS * Math.max(0, q.n - MAX_TIER) : 1; }
  // Which two limbs are up. With nothing chosen the arms that come up are free ones, if you have any.
  raisedSlots() {
    const free = (no) => { for (let i = 0; i < SLOTS; i++) if (i !== no && !this.equipped[i]) return i; return -1; };
    let r = this.selected; if (r < 0) { r = free(-1); if (r < 0) r = 0; }
    let l = this.lastSelected; if (l < 0 || l === r || !this.equipped[l]) { l = free(r); if (l < 0) l = (r + 1) % SLOTS; }
    return [r, l];
  }

  // A new body. What you know, you still know.
  resetRun() {
    this.abilities.reset();
    this.equipped = []; this.selected = -1; this.lastSelected = -1; this.offers = []; this.energy = ENERGY_MAX; this.cool = 0; this.pending = null; this.beat = null; this.swap = null; this.timeScale = 1; this.wheel.cancel();
    const vm = this.g.viewmodel;
    for (const arm of [vm.right, vm.left]) { for (const g of Object.values(arm.growths)) { g.front.value = 1.2; for (const me of g.meshes) me.visible = false; } arm.showing = null; arm.own.uFront.value = 1.2; arm.own.uInfect.value = 0; arm.own.uWound.value = 0; }
    this.applyLook(true); this.recompute();
  }

  recompute() {
    const M = { dmgTaken: 1, regen: 1, absorbHeal: 1 };
    // what a mutation does for your body it does wherever you carry it
    for (const q of this.equipped) { const d = q.m.mods ? q.m.mods(q.tier) : {}; for (const k in d) M[k] *= d[k]; }
    // how you move is decided by the arm you have raised
    const c = this.current, mv = c && c.m.move ? c.m.move(c.tier) : {}, P = this.g.player;
    P.evoSpeed = mv.speed ?? 1; P.evoAccel = mv.accel ?? 1; P.evoJump = mv.jump ?? 1; P.evoDash = mv.dash ?? 1; P.evoDashT = mv.dashT ?? 1;
    M.speed = P.evoSpeed; this.mods = M;
  }

  // ---------------------------------------------------------------- absorbing
  // What you get from what you absorbed: the mutation that enemy gives. The first time it grows on a free limb. Every time after that it gets stronger.
  onAbsorbed(e) {
    const src = e.kind === 'android' ? e.variant : (e.sourceId || e.kind);
    const m = Object.values(MUTATIONS).find((x) => x.sources.includes(src));
    if (!m) return null;
    const q = this.equipped.find((x) => x.m.id === m.id);
    if (q) { this.deepen(q); return m; }
    this.grow(m); return m;
  }

  grow(m) {
    const first = !this.codex.has(m.id);
    if (first) { this.codex.add(m.id); try { localStorage.setItem(CODEX, JSON.stringify([...this.codex])); } catch (e) { /* optional */ } }
    // Every limb is taken: nothing is ever overwritten. You are asked, and what you absorbed has already healed and fed you, whichever you choose.
    if (this.equipped.length >= SLOTS) { this.askNinth(m, first); return; }
    const slot = this.equipped.length;
    this.equipped.push({ m, tier: 1, n: 1, grow: first ? 0.3 : 0.45 });
    this.recompute(); this.wheel.render();
    this.startBeat(first ? 'A NEW THING GROWS' : 'YOUR BODY REMEMBERS', m.name, m.note + (this.selected >= 0 ? '  ·  Q TO USE IT' : ''), first);
    // bare arms take the first thing that grows. After that it never takes your weapon out of your hand: it grows on another limb while you fight, and the wheel has it.
    if (this.selected < 0) { this.selected = slot; this.recompute(); }
    this.applyLook(false);
    this.g.body.v2?.showLimb(slot);
  }
  askNinth(m, first) {
    if (this.wheel.offering) { this.offers.push([m, first]); return; }
    this.answerT = 0.25;            // a moment to read it: the press that was already going down must not answer a question you have not seen
    this.g.audio.play('gel', { vol: 0.6 }); this.g.audio.play('crack', { vol: 0.35 });
    this.wheel.offer(m, (k) => {
      if (k < 0) this.toast('YOU KEEP YOUR BODY', m.name, 'It fed you anyway. It can grow later, if a limb comes free.', 1.8);
      else {
        const old = this.equipped[k], up = k === this.selected;
        this.equipped[k] = { m, tier: 1, n: 1, grow: 0.3 }; this.g.body.v2?.showLimb(k);
        this.startBeat(first ? 'A NEW THING GROWS' : 'YOUR BODY REMEMBERS', m.name, old.m.name + ' is gone. ' + m.note, false);
        this.recompute(); this.wheel.render(); this.applyLook(false);
      }
      this.qBlock = true;
      const next = this.offers.shift(); if (next) this.askNinth(next[0], next[1]);
    });
  }
  deepen(q) {
    q.n++; q.tier = Math.min(MAX_TIER, q.n); this.recompute(); this.wheel.render();
    this.nameHud(); this.g.body.v2?.showLimb(this.equipped.indexOf(q));
    this.g.ui.rewardNote(`${q.m.name}  ·  ×${q.n}` + (q.n > MAX_TIER ? `  ·  +${Math.round((this.powerK(q) - 1) * 100)}%` : `  ·  STAGE ${q.tier}`)); this.g.audio.play('gel', { vol: 0.5 }); this.g.audio.play('crack', { vol: 0.35 }); this.g.addShake(0.05);
  }

  // The moment it happens. The first time you ever find a mutation the world catches its breath, briefly. After that you just feel it, and keep going.
  startBeat(em, title, note, first) {
    const g = this.g;
    if (first) this.beat = { t: 0 };
    this.toast(em, title, note, first ? 2.6 : 1.8);
    g.audio.play('gel', { vol: 0.8 }); g.audio.play('crack', { vol: 0.5 }); g.audio.play('groan', { vol: 0.2 }); g.addShake(0.12);
  }

  // Change which arm is up. The arm drops out of view, and rises with the other thing on it.
  select(i) {
    if (i === this.selected || (i >= 0 && !this.equipped[i])) return;
    this.lastSelected = this.selected; this.selected = i; this.g.audio.play('gel', { vol: 0.35 }); this.recompute(); this.applyLook(false);
  }
  cycle() { const n = this.equipped.length; if (!n) return; this.select(((this.selected + 1) % n)); }

  // What each limb should be carrying now.
  applyLook(instant) {
    const vm = this.g.viewmodel;
    this.nameHud();
    const [r, l] = this.raisedSlots(); this.upR = r; this.upL = l;
    this.wantR = this.equipped[r] || null; this.wantL = this.equipped[l] || null;
    this.g.body.setLimbs?.(this.equipped, [r, l]); this.renderLimbs();
    if (instant) { this.setArm(vm.right, this.wantR); this.setArm(vm.left, this.wantL); vm.setStyleObj(this.active.style); return; }
    this.swap = { t: 0, done: false };
  }
  nameHud() { const el = document.getElementById('weaponName'), c = this.current; if (el) el.textContent = this.active.name + (c && c.m.moveNote ? '  ·  ' + c.m.moveNote(c.tier) : ''); }
  renderLimbs() { this.limbEls?.forEach((el, k) => { const q = this.equipped[k]; el.style.background = q ? q.m.hud : ''; el.classList.toggle('up', k === this.upR || k === this.upL); }); }
  setArm(arm, q) {
    const id = q ? q.m.id : null;
    for (const [k, g] of Object.entries(arm.growths)) { const on = k === id; for (const me of g.meshes) me.visible = on; }
    arm.showing = q;
    arm.own.uInfect.value = q ? q.m.infect : 0;
  }

  // ---------------------------------------------------------------- every frame
  step(dt, trigger, enabled, latched) {
    const g = this.g, input = g.input, vm = g.viewmodel, weapon = g.weapon;
    const live = g.state === 'playing' && !g.player.dead;
    if (live) {
      if (this.wheel.offering) {
        // the question: the mouse steers, a click answers. Q, E or the other button keep what you have
        this.answerT -= dt;
        if (this.answerT <= 0) {
          for (let i = 0; i < SLOTS; i++) if (input.was('Digit' + (i + 1))) { this.wheel.resolve(i); break; }
          if (this.answerT <= 0 && this.wheel.offering) { if (input.clicked(0)) this.wheel.resolve(this.wheel.hi); else if (input.was('KeyQ') || input.was('KeyE') || input.clicked(2)) this.wheel.resolve(-1); }
        }
        this.qT = -1;
      } else if (this.qBlock) { if (!input.down('KeyQ')) this.qBlock = false; }        // the Q that answered must not also change your arm when it lifts
      else {
        for (let i = 0; i < SLOTS; i++) if (input.was('Digit' + (i + 1))) this.select(i);
        if (input.was('Digit0')) this.select(-1);
        if (input.down('KeyQ')) { if (this.qT < 0) this.qT = 0; else { this.qT += dt; if (this.qT > 0.18 && !this.wheel.open) this.wheel.show(); } }
        else if (this.qT >= 0) { if (this.wheel.open) this.wheel.close(); else this.cycle(); this.qT = -1; }
      }
    } else { if (this.wheel.open) this.wheel.cancel(); this.qT = -1; }

    this.regenHold = Math.max(0, this.regenHold - dt);
    if (this.regenHold <= 0) this.energy = Math.min(ENERGY_MAX, this.energy + ENERGY_REGEN * this.mods.regen * dt);
    this.cool = Math.max(0, this.cool - dt);
    this.enFill.style.width = this.energy + '%';
    this.dryT = Math.max(0, this.dryT - dt); this.enEl.classList.toggle('dry', this.dryT > 0);
    g.arsenal.updateFx(dt);

    // a blow lands a moment after the arm starts to move
    if (this.pending) { this.pending.t -= dt; if (this.pending.t <= 0) { this.land(this.pending.a); this.pending = null; } }
    const swapping = this.swap && !this.swap.done;
    this.abilities.update(dt);
    const a = this.active.attack, ti = this.tierI, want = enabled && live && !this.wheel.open && !swapping && !g.absorber.drawing && !this.abilities.busy;
    const kc = this.powerK(this.current);
    g.player.evoFire = 1;
    if (a.type === 'shard') {
      weapon.damage = a.dmg[ti] * kc; weapon.interval = a.interval[ti]; weapon.bloomK = a.bloom ? a.bloom[ti] : undefined;
      const can = this.energy >= a.cost[ti], before = weapon.shots;
      weapon.step(dt, trigger, want && can);
      if (weapon.shots > before) this.energy -= a.cost[ti];
      if (want && can && (trigger || latched)) g.player.evoFire = a.fireSpeed ?? 1;
      if (want && !can && (trigger || latched)) this.dry();
    } else {
      if (want && (trigger || latched) && this.cool <= 0) {
        if (this.energy < a.cost[ti]) this.dry();
        else {
          this.energy -= a.cost[ti]; this.cool = a.rate[ti];
          if (a.type === 'melee') { vm.strike(a.dur, a.heavy); this.pending = { t: a.hitAt, a }; g.audio.play('dash', { vol: a.heavy ? 0.7 : 0.45 }); }
          else if (a.type === 'arc') { g.arsenal.arcV2({ range: a.range[ti], links: a.links[ti], radius: a.radius, dmg: a.dmg[ti] * kc, stun: a.stun[ti] }); this.regenHold = a.regenHold; }
          else if (a.type === 'hook') this.abilities.hook(a, ti, kc);
          else if (a.type === 'acid') this.abilities.acid(a, ti, kc);
        }
      }
      weapon.step(dt, false, false);
      weapon.pressLatch = false;
    }
    // a dash with the husk raised is a charge: whatever is in the way takes all of it
    { const c = this.current, ch = c && c.m.charge, P = g.player;
      if (P.justDashed) this.chargeHit.clear();
      if (ch && P.dashing && live) for (const e of g.enemies) {
        if (!e.alive || e.absorbing || this.chargeHit.has(e) || !e.hitSpheres?.[0]) continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz); if (d > 1.35) continue;
        this.chargeHit.add(e); g.onPlayerHit(e, ch.dmg[ti] * kc, e.hitSpheres[0].c.clone()); e.stagger?.(ch.stagger);
        if (e.alive && d > 0.01) { e.pos.x += (dx / d) * ch.knock; e.pos.z += (dz / d) * ch.knock; }
        g.audio.play('hit', { vol: 1 }); g.addShake(0.3); g.hitStop = 0.07;
      } }
  }

  // What a hit from the raised arm really does, and a record of it for the lab.
  hitDamage(e, dmg) {
    const a = this.active.attack;
    if (e.corrodeT > 0) dmg *= 1.4;      // the acid leaves it soft
    if (a.armour && e.variant === 'heavy' && e.facing && e.facing(this.g.player.pos.x, this.g.player.pos.z) > 0.15) { dmg *= a.armour; this.g.audio.play('clatter', { vol: 0.2 }); }
    this.noteHit(this.active.id, dmg);
    return dmg;
  }

  noteHit(id, dmg) { this.g.lab?.gym?.onHit(id, dmg); }

  dry() { if (this.dryT <= 0) this.g.audio.play('clatter', { vol: 0.25 }); this.dryT = 0.35; }

  // The blow arrives. Every machine in reach and in front of you.
  land(a) {
    const g = this.g, cam = g.camera; cam.getWorldDirection(_d); _o.copy(cam.position);
    let hits = 0; const dmg = (a.dmg[this.tierI] ?? a.dmg[0]) * this.powerK(this.current);
    for (const e of g.enemies) {
      if (!e.alive || e.absorbing || !e.hitSpheres?.[0]) continue;
      const c = e.hitSpheres[0].c; _a.subVectors(c, _o); const d = _a.length(); if (d > a.range || d < 0.05) continue;
      if (_a.divideScalar(d).dot(_d) < a.cone) continue;
      if (g.world.blocked(_o.x, _o.y, _o.z, c.x, c.y, c.z, (b) => b.tag !== 'barrel')) continue;
      g.onPlayerHit(e, dmg, c.clone()); hits++; if (a.stagger) e.stagger?.(a.stagger);
      if (a.heavy && e.alive) { const l = Math.hypot(_a.x, _a.z) || 1, kb = e.variant === 'heavy' ? 0.25 : 0.9; e.pos.x += (_a.x / l) * kb; e.pos.z += (_a.z / l) * kb; }
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
      if (s.t >= 0.5 && !s.done && !g.absorber.drawing) { s.done = true; this.setArm(vm.right, this.wantR); this.setArm(vm.left, this.wantL); vm.setStyleObj(this.active.style); }
      if (s.t >= 1 && s.done) this.swap = null;
    }
    vm.swapK = swapK;
    // the first discovery: a moment's slowing, nothing more
    this.inspect.update(g.time);
    let slow = this.wheel.open ? 0.22 : this.inspect.active ? 0.35 : 1;
    if (this.beat) { this.beat.t += dt; const T = this.beat.t; slow = Math.min(slow, 0.45 + 0.55 * clamp((T - 0.18) / 0.3, 0, 1)); if (T > 0.5) this.beat = null; }
    this.timeScale = slow;
    // growth lives on the mutation, and spreads wherever that mutation is being carried
    for (const q of this.equipped) { const want = TIER_GROW[q.tier - 1]; q.moving = q.grow < want; if (q.moving) q.grow = Math.min(want, q.grow + dt * 0.5); q.wound = Math.max(q.moving ? 1 : 0, (q.wound || 0) - dt * 1.6); }
    for (const arm of [vm.right, vm.left]) {
      const q = arm.showing;
      if (q) {
        const G = arm.growths[q.m.id], front = 1.03 - q.grow * 1.03; if (G) G.front.value = front; arm.own.uFront.value = front; arm.own.uWound.value = q.wound;
        if (q.moving && Math.random() < dt * 12) { arm.root.updateWorldMatrix(true, false); const p = arm.root.localToWorld(arm.pointLocal(clamp(front + 0.02, 0.45, 1), _a)); g.effects.glowP.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 1.2, -Math.random() * 0.6, (Math.random() - 0.5) * 1.2, 0.24, 0.009, 0.2, 0.03, 0.025, 6, 0.3); }
      } else { arm.own.uFront.value = 1.2; arm.own.uWound.value = 0; }
    }
  }

  // development: fill the wheel, to prove eight limbs work without having to absorb eight things
  devFill() {
    const ids = Object.values(MUTATIONS), fill = [];
    for (let i = 0; i < SLOTS; i++) { const t = 1 + (i % 3); fill.push({ m: ids[i % ids.length], tier: t, n: t, grow: 1 }); }
    this.equipped = fill; this.selected = 0; this.lastSelected = 1; this.recompute(); this.applyLook(true); this.wheel.render();
  }
}
