import * as THREE from 'three';

// The Halcyon goes on without its crew: cameras follow you, pipes vent, broken panels spark, and little maintenance machines go about their rounds until
// you get too close. None of it is aimed at you. It is just a working ship that has noticed you. Everything only runs near the player.
const R = (a, b) => a + Math.random() * (b - a);
const lensMat = new THREE.MeshBasicMaterial({ color: 0xff3a22, toneMapped: false });
lensMat.userData.noSnap = true;
let parts = null;
function geos() {
  if (parts) return parts;
  parts = {
    arm: new THREE.BoxGeometry(0.07, 0.07, 0.34).translate(0, 0, -0.17),
    head: new THREE.BoxGeometry(0.17, 0.15, 0.3),
    lens: new THREE.SphereGeometry(0.05, 10, 8),
    crawl: new THREE.BoxGeometry(0.48, 0.16, 0.62),
    lamp: new THREE.BoxGeometry(0.3, 0.035, 0.05),
    wheel: new THREE.CylinderGeometry(0.075, 0.075, 0.05, 10).rotateZ(Math.PI / 2),
  };
  return parts;
}
const camBody = new THREE.MeshStandardMaterial({ color: 0x6a747c, roughness: 0.5, metalness: 0.4, emissive: 0x14181b });
const crawlBody = new THREE.MeshStandardMaterial({ color: 0x8a6a22, roughness: 0.6, metalness: 0.45 });
const crawlLamp = new THREE.MeshBasicMaterial({ color: 0xffc040 });
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.9 });

export class ShipLife {
  constructor(game) {
    this.g = game; this.group = new THREE.Group(); game.scene.add(this.group);
    this.cams = []; this.vents = []; this.sparks = []; this.crawlers = []; this.t = 0;
    this.small = document.body.classList.contains('touch');
  }

  clear() {
    this.group.clear();
    this.cams.length = this.vents.length = this.sparks.length = this.crawlers.length = 0;
  }

  // Rooms are axis-aligned with bounds and a height. Cameras go high in corners, vents and sparks low and high on walls, clear of the doorways.
  build(rooms) {
    this.clear();
    const G = geos(), W = this.g.world;
    const addCam = (x, y, z) => {
      const root = new THREE.Group(); root.position.set(x, y, z); root.scale.setScalar(1.8);
      const head = new THREE.Group(); root.add(head);
      head.add(new THREE.Mesh(G.head, camBody));
      const lens = new THREE.Mesh(G.lens, lensMat.clone()); lens.position.z = -0.16; head.add(lens);
      this.group.add(root);
      this.cams.push({ root, head, lens, yaw: R(0, 6.28), pitch: -0.4, ph: R(0, 6), watching: false, cool: 0 });
    };
    rooms.forEach((r, i) => {
      const b = r.bounds, h = Math.min(r.h || 4.5, 5.5) - 0.55, inset = 0.5;
      const corners = [[b.minX + inset, b.minZ + inset], [b.maxX - inset, b.maxZ - inset], [b.minX + inset, b.maxZ - inset], [b.maxX - inset, b.minZ + inset]];
      const count = r.kind === 'lift' ? 1 : this.small ? 1 : 2;
      for (let k = 0; k < count; k++) { const c = corners[(i + k * 2) % 4]; addCam(c[0], h, c[1]); }
      if (r.kind === 'lift') return;
      // steam from low on a wall, sparks from high on one
      const wall = () => { const s = Math.floor(R(0, 4)), t = R(0.2, 0.8); return s === 0 ? [b.minX + 0.3, b.minZ + (b.maxZ - b.minZ) * t, 1, 0] : s === 1 ? [b.maxX - 0.3, b.minZ + (b.maxZ - b.minZ) * t, -1, 0] : s === 2 ? [b.minX + (b.maxX - b.minX) * t, b.minZ + 0.3, 0, 1] : [b.minX + (b.maxX - b.minX) * t, b.maxZ - 0.3, 0, -1]; };
      for (let k = 0; k < (this.small ? 1 : 2); k++) { const w = wall(); this.vents.push({ x: w[0], z: w[1], nx: w[2], nz: w[3], y: R(0.3, 2.2), next: R(1, 9), burst: 0 }); }
      { const w = wall(); this.sparks.push({ x: w[0], z: w[1], nx: w[2], nz: w[3], y: R(2.2, 3.6), next: R(1, 8) }); }
      // a maintenance machine on its rounds, in the quiet rooms
      if (r.kind === 'quiet' && !this.small || (r.kind === 'quiet' && i % 2 === 0)) {
        const root = new THREE.Group();
        const body = new THREE.Mesh(G.crawl, crawlBody); body.position.y = 0.17; root.add(body);
        const lamp = new THREE.Mesh(G.lamp, crawlLamp); lamp.position.set(0, 0.2, -0.31); root.add(lamp);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = new THREE.Mesh(G.wheel, wheelMat); wh.position.set(sx * 0.27, 0.075, sz * 0.2); root.add(wh); }
        const x = r.cx ?? (b.minX + b.maxX) / 2, z = r.cz ?? (b.minZ + b.maxZ) / 2;
        root.position.set(x + R(-2, 2), 0, z + R(-2, 2));
        this.group.add(root);
        this.crawlers.push({ root, room: b, yaw: R(0, 6.28), sp: 0, wait: R(0, 2), lampT: R(0, 6), r: 0.42 });
      }
    });
    this.walls = W;
  }

  update(dt) {
    const g = this.g, p = g.player, cp = g.camera.position, fx = g.effects;
    this.t += dt;
    const t = this.t;
    for (const c of this.cams) {
      const dx = cp.x - c.root.position.x, dy = cp.y - c.root.position.y, dz = cp.z - c.root.position.z, d = Math.hypot(dx, dz);
      c.root.visible = d < 34;
      if (!c.root.visible) continue;
      let wy, wp;
      const sees = d < 15 && !g.world.blocked(c.root.position.x, c.root.position.y, c.root.position.z, cp.x, cp.y, cp.z, (b) => b.tag !== 'door');
      if (sees) { wy = Math.atan2(-dx, -dz); wp = Math.atan2(dy, d); }
      else { wy = c.home ?? (c.home = Math.atan2(-dx, -dz)); wy += Math.sin(t * 0.35 + c.ph) * 0.8; wp = -0.5; }
      if (sees && !c.watching && c.cool <= 0) { g.sfxAt('servo', c.root.position, 0.14); c.cool = 4; }
      c.watching = sees; c.cool -= dt;
      const rate = sees ? 3 : 0.8;
      c.yaw += Math.atan2(Math.sin(wy - c.yaw), Math.cos(wy - c.yaw)) * Math.min(1, dt * rate);
      c.pitch += (wp - c.pitch) * Math.min(1, dt * rate);
      c.head.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
      const on = sees ? 0.65 + 0.35 * Math.sin(t * 14) : Math.sin(t * 1.4 + c.ph) > 0.86 ? 1 : 0.12;
      c.lens.material.color.setRGB(on, 0.14 * on, 0.08 * on);
    }
    for (const v of this.vents) {
      const d = Math.hypot(cp.x - v.x, cp.z - v.z);
      if (d > 20) continue;
      v.next -= dt;
      if (v.next <= 0 && v.burst <= 0) { v.burst = R(0.8, 1.8); v.next = R(5, 13); g.sfxAt('hiss', _v3(v), 0.22); }
      if (v.burst > 0) {
        v.burst -= dt;
        if (fx.smokeP && Math.random() < dt * 28) fx.smokeP.emit(v.x, v.y, v.z, v.nx * R(1.8, 3) + R(-0.3, 0.3), R(0.2, 1.1), v.nz * R(1.8, 3) + R(-0.3, 0.3), R(0.7, 1.3), R(0.22, 0.42), 0.62, 0.68, 0.72, -0.4, 0.8, 1.6);
      }
    }
    for (const s of this.sparks) {
      const d = Math.hypot(cp.x - s.x, cp.z - s.z);
      if (d > 22) continue;
      s.next -= dt;
      if (s.next <= 0) {
        s.next = R(2.5, 9);
        const n = Math.floor(R(7, 15));
        for (let i = 0; i < n; i++) fx.glowP.emit(s.x, s.y, s.z, s.nx * R(0.6, 2.4) + R(-1, 1), R(-0.4, 1.5), s.nz * R(0.6, 2.4) + R(-1, 1), R(0.3, 0.75), R(0.018, 0.04), 1, R(0.65, 0.9), 0.4, 12, 0.2);
        g.sfxAt('spark', _v3(s), 0.3);
      }
    }
    for (const c of this.crawlers) {
      const q = c.root.position, dx = q.x - p.pos.x, dz = q.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
      c.root.visible = d < 30;
      if (!c.root.visible) continue;
      c.wait -= dt; c.lampT += dt;
      if (d < 3.2) { c.yaw = Math.atan2(dx, dz) + Math.sin(t * 3) * 0.3; c.sp = 3.2; c.wait = 0.6; }
      else if (c.wait <= 0) { if (c.sp > 0) { c.sp = 0; c.wait = R(0.8, 3); } else { c.sp = R(0.8, 1.6); c.yaw += R(-1.8, 1.8); c.wait = R(1, 3.5); } }
      const x0 = q.x, z0 = q.z;
      q.x += Math.sin(c.yaw) * c.sp * dt; q.z += Math.cos(c.yaw) * c.sp * dt;
      _pos.set(q.x, 0, q.z); g.world.resolveCircle(_pos, c.r, 0.4, 0.05); q.x = _pos.x; q.z = _pos.z;
      const b = c.room; if (q.x < b.minX + 0.5 || q.x > b.maxX - 0.5 || q.z < b.minZ + 0.5 || q.z > b.maxZ - 0.5) { q.x = x0; q.z = z0; c.yaw += 2.4; }
      if (Math.hypot(q.x - x0, q.z - z0) < c.sp * dt * 0.3 && c.sp > 0) c.yaw += R(0.8, 2);
      let dy = c.yaw - c.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.root.rotation.y += dy * Math.min(1, dt * 5);
      c.root.position.y = c.sp > 0 ? Math.abs(Math.sin(c.lampT * 15)) * 0.008 : 0;
    }
    crawlLamp.color.setRGB(0.6 + 0.4 * Math.sin(t * 4), 0.4 + 0.25 * Math.sin(t * 4), 0.12);
  }
}
const _pos = new THREE.Vector3(), _sf = new THREE.Vector3();
const _v3 = (o) => _sf.set(o.x, o.y, o.z);
