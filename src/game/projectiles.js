import * as THREE from 'three';

const boltGeo = new THREE.OctahedronGeometry(0.5);
const haloGeo = new THREE.SphereGeometry(0.5, 10, 8);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xcffcff });
const haloMat = new THREE.MeshBasicMaterial({ color: 0x35e6ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
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
    const core = new THREE.Mesh(boltGeo, boltMat);
    core.scale.set(0.07, 0.07, 0.6);
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.scale.set(0.2, 0.2, 0.9);
    mesh.add(core, halo);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.group.add(mesh);
    this.list.push({ mesh, pos: origin.clone(), dir: dir.clone(), speed, damage, life: 1.4, enemy: false });
  }

  spawnEnemy(origin, dir, speed, damage) {
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(shotGeo, shotMat));
    const halo = new THREE.Mesh(shotGeo, shotHaloMat);
    halo.scale.setScalar(2.2);
    mesh.add(halo);
    mesh.position.copy(origin);
    this.group.add(mesh);
    this.list.push({ mesh, pos: origin.clone(), dir: dir.clone(), speed, damage, life: 5, enemy: true });
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
          if (p.enemy) g.effects.hitSparks(hp, [1, 0.5, 0.2], 8);
          else { g.effects.impact(hp, n); g.sfxAt('impact', hp, 0.8); }
        } else if (hit.type === 'enemy') g.onPlayerHit(hit.target, p.damage, hp);
        else if (hit.type === 'barrel') g.onPlayerHitBarrel(hit.target, p.damage, hp);
        else if (hit.type === 'player') g.damagePlayer(p.damage, hp);
        continue;
      }
      p.pos.set(ox + dx * step, oy + dy * step, oz + dz * step);
      p.mesh.position.copy(p.pos);
      if (p.life <= 0 || p.pos.y < -1 || p.pos.y > 20) { this.list.splice(i, 1); this.group.remove(p.mesh); }
    }
  }
}
