import * as THREE from 'three';

// The arm's ammunition is grown, not made: a barbed bone spine wrapped in glowing gel.
const spineGeo = new THREE.ConeGeometry(0.5, 1, 7).rotateX(-Math.PI / 2); // points along -z after lookAt
const barbGeo = new THREE.ConeGeometry(0.5, 1, 4).rotateX(-Math.PI / 2);
const sheathGeo = new THREE.SphereGeometry(0.5, 12, 9);
const spineMat = new THREE.MeshBasicMaterial({ color: 0xe9f0d8 });
const sheathMat = new THREE.MeshBasicMaterial({ color: 0x4dff9a, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending });
const GOO = [0.4, 1, 0.55];

// Enemy projectiles: each kind of machine fires something you can tell apart at a glance.
const add = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const ENEMY_SHOTS = {
  orb: { core: 0xffe0b0, halo: 0xff3a14, size: 0.15, halo2: 2.2, trail: [1, 0.35, 0.15] },               // sentry drone
  bolt: { core: 0xfff0c0, halo: 0xffa020, size: 0.07, stretch: 6, halo2: 2.6, trail: [1, 0.65, 0.2] },    // trooper: amber tracer
  needle: { core: 0xeaffff, halo: 0x30d8ff, size: 0.035, stretch: 10, halo2: 3, trail: [0.4, 0.9, 1] },   // scout: fast thin needles
  plasma: { core: 0xffd0a0, halo: 0xff4a10, size: 0.26, halo2: 2.0, trail: [1, 0.4, 0.1], splash: 1.9 }, // heavy: slow splashing orb
  seeker: { core: 0xf0d0ff, halo: 0xa040ff, size: 0.17, halo2: 2.4, trail: [0.7, 0.35, 1], homing: 1.9 }, // armoured drone: curving seeker
};
const SHOT_MATS = {};
for (const [k, d] of Object.entries(ENEMY_SHOTS)) SHOT_MATS[k] = { core: new THREE.MeshBasicMaterial({ color: d.core }), halo: add(d.halo) };
for (const m of Object.values(SHOT_MATS)) { m.halo.opacity = 0.55; m.core.userData.noSnap = m.halo.userData.noSnap = true; }
const _aim = new THREE.Vector3();
const shotGeo = new THREE.SphereGeometry(0.15, 12, 10);
const shotMat = new THREE.MeshBasicMaterial({ color: 0xffe0b0 });
const shotHaloMat = new THREE.MeshBasicMaterial({ color: 0xff3a14, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });

// Returns distance along the unit ray to the first intersection with a sphere, or -1.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
  const mx = cx - ox, my = cy - oy, mz = cz - oz;
  const t = mx * dx + my * dy + mz * dz;
  const d2 = mx * mx + my * my + mz * mz - t * t;
  if (d2 > r * r) return -1;
  const h = Math.sqrt(r * r - d2);
  let t0 = t - h;
  if (t0 < 0) t0 = t + h < 0 ? -1 : 0;
  return t0 >= 0 && t0 <= maxT ? t0 : -1;
}

// Swept projectiles: every step tests the whole segment travelled, so speed never causes tunnelling.
export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
  }

  spawnPlayer(origin, dir, speed = 95, damage = 10) {
    const mesh = new THREE.Group();
    const spine = new THREE.Mesh(spineGeo, spineMat);
    spine.scale.set(0.07, 0.07, 0.55);
    spine.position.z = 0.05;
    mesh.add(spine);
    for (const [z, a] of [[0.12, 0.6], [0.2, 2.6], [0.27, 4.4]]) { // little barbs swept back along the shaft
      const b = new THREE.Mesh(barbGeo, spineMat);
      b.scale.set(0.03, 0.03, 0.09);
      b.position.set(Math.cos(a) * 0.035, Math.sin(a) * 0.035, z);
      b.rotation.set(Math.sin(a) * 0.5, -Math.cos(a) * 0.5, 0);
      mesh.add(b);
    }
    const sheath = new THREE.Mesh(sheathGeo, sheathMat);
    sheath.scale.set(0.2, 0.2, 0.75);
    sheath.position.z = 0.08;
    mesh.add(sheath);
    mesh.userData.sheath = sheath;
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.group.add(mesh);
    this.list.push({ mesh, pos: origin.clone(), dir: dir.clone(), speed, damage, life: 1.4, enemy: false, age: 0 });
  }

  spawnEnemy(origin, dir, speed, damage, kind = 'orb') {
    const d = ENEMY_SHOTS[kind] || ENEMY_SHOTS.orb, mats = SHOT_MATS[kind] || SHOT_MATS.orb;
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(shotGeo, mats.core);
    const halo = new THREE.Mesh(shotGeo, mats.halo);
    const s = d.size / 0.15, st = d.stretch || 1;
    core.scale.set(s, s, s * st);
    halo.scale.set(s * d.halo2, s * d.halo2, s * d.halo2 * Math.max(1, st * 0.5));
    mesh.add(core, halo);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.group.add(mesh);
    this.list.push({ mesh, pos: origin.clone(), dir: dir.clone(), speed, damage, life: 5, enemy: true, kind, def: d, age: 0, halo });
  }

  // a heavy plasma orb bursts: everything close to the blast takes a share of the damage
  splash(p, at) {
    const g = this.game, r = p.def.splash;
    g.effects.fireball(at, 0.9, 0.3, 0xff6a20);
    g.effects.hitSparks(at, [1, 0.5, 0.15], 18);
    g.sfxAt('explosion', at, 0.5);
    const pp = g.player.pos;
    const d = Math.hypot(pp.x - at.x, pp.y + 0.9 - at.y, pp.z - at.z);
    if (d < r && !g.player.dead) g.damagePlayer(Math.round(p.damage * 0.6 * (1 - d / r)), at);
  }

  clear() {
    for (const p of this.list) this.group.remove(p.mesh);
    this.list.length = 0;
  }

  update(dt) {
    const g = this.game;
    const { world } = g;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.enemy) {
        p.age += dt;
        // seekers bend toward the player for a moment after launch
        if (p.def.homing && p.age < 1.6 && !g.player.dead) {
          _aim.set(g.player.pos.x - p.pos.x, g.player.pos.y + 1.0 - p.pos.y, g.player.pos.z - p.pos.z).normalize();
          const k = Math.min(1, p.def.homing * dt);
          p.dir.lerp(_aim, k).normalize();
          p.mesh.lookAt(p.pos.clone().add(p.dir));
        }
        const tr = p.def.trail;
        if (Math.random() < 0.6) g.effects.glowP.emit(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0.2, p.def.size * 0.5, tr[0], tr[1], tr[2], 0, 2);
        const pulse = 1 + 0.15 * Math.sin(p.age * 40);
        p.halo.scale.multiplyScalar(pulse / (p.lastPulse || 1)); p.lastPulse = pulse;
      }
      const step = p.speed * dt;
      const { x: ox, y: oy, z: oz } = p.pos;
      const { x: dx, y: dy, z: dz } = p.dir;
      let bestT = step, hit = null;

      const wh = world.raycast(ox, oy, oz, dx, dy, dz, step);
      if (wh && wh.t <= bestT) { bestT = wh.t; hit = { type: 'world', n: wh }; }

      if (!p.enemy) {
        for (const e of g.enemies) {
          if (!e.alive) continue;
          for (const s of e.hitSpheres) {
            const t = raySphere(ox, oy, oz, dx, dy, dz, s.c.x, s.c.y, s.c.z, s.r, bestT);
            if (t >= 0 && t <= bestT) { bestT = t; hit = { type: 'enemy', target: e }; }
          }
        }
        const it = g.opening.target; // the maintenance lock in the opening
        if (it && it.alive) {
          const t = raySphere(ox, oy, oz, dx, dy, dz, it.c.x, it.c.y, it.c.z, it.r, bestT);
          if (t >= 0 && t <= bestT) { bestT = t; hit = { type: 'intro' }; }
        }
        for (const b of g.barrels) {
          if (b.state === 'destroyed') continue;
          for (const s of b.hitSpheres) {
            const t = raySphere(ox, oy, oz, dx, dy, dz, s.c.x, s.c.y, s.c.z, s.r, bestT);
            if (t >= 0 && t <= bestT) { bestT = t; hit = { type: 'barrel', target: b }; }
          }
        }
      } else if (!g.player.dead) {
        const pp = g.player.pos;
        for (const h of [0.45, 0.95, 1.45]) {
          const t = raySphere(ox, oy, oz, dx, dy, dz, pp.x, pp.y + h, pp.z, 0.42, bestT);
          if (t >= 0 && t <= bestT) { bestT = t; hit = { type: 'player' }; }
        }
      }

      const hp = new THREE.Vector3(ox + dx * bestT, oy + dy * bestT, oz + dz * bestT);
      if (hit) {
        this.list.splice(i, 1);
        this.group.remove(p.mesh);
        if (hit.type === 'world') {
          const n = new THREE.Vector3(hit.n.nx, hit.n.ny, hit.n.nz);
          if (p.enemy) { g.effects.hitSparks(hp, p.def.trail, 10); if (p.def.splash) this.splash(p, hp); }
          else { g.effects.goo(hp, n); g.sfxAt('impact', hp, 0.8); }
        } else if (hit.type === 'enemy') g.onPlayerHit(hit.target, p.damage, hp);
        else if (hit.type === 'barrel') g.onPlayerHitBarrel(hit.target, p.damage, hp);
        else if (hit.type === 'intro') g.opening.hitTarget(hp);
        else if (hit.type === 'player') { g.damagePlayer(p.damage, hp); if (p.def.splash) g.effects.fireball(hp, 0.7, 0.25, 0xff6a20); }
        continue;
      }
      p.pos.set(ox + dx * step, oy + dy * step, oz + dz * step);
      p.mesh.position.copy(p.pos);
      if (!p.enemy) {
        // the gel sheath throbs and sheds droplets as it flies
        p.age += dt;
        const s = p.mesh.userData.sheath;
        if (s) { const k = 1 + 0.18 * Math.sin(p.age * 60); s.scale.set(0.2 * k, 0.2 * k, 0.75 / k); }
        if (Math.random() < 0.7) g.effects.glowP.emit(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.22, 0.035, GOO[0], GOO[1], GOO[2], 6, 1);
      }
      if (p.life <= 0 || p.pos.y < -1 || p.pos.y > 20) { this.list.splice(i, 1); this.group.remove(p.mesh); }
    }
  }
}
