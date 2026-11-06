import * as THREE from 'three';
import { kitMaterial } from '../world/materials.js';

const HEAL = 35;
const REACH = 1.15;

const glow = (hex, i = 1.6) => { const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: hex, emissiveIntensity: i }); m.userData.noSnap = true; return m; };
const ring = (hex, r0, r1) => {
  const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 32), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03;
  m.material.userData.noSnap = true;
  return m;
};

function medkit() {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0xc9d2d4, roughness: 0.55, metalness: 0.15 });
  const trim = kitMaterial('PaintDark');
  const cross = glow(0x35ff9a, 1.8);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.36), shell); g.add(box);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.38), trim); lid.position.y = 0.14; g.add(lid);
  for (const [w, d] of [[0.26, 0.07], [0.07, 0.26]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), cross); c.position.y = 0.166; g.add(c); }
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), trim); handle.position.set(0, 0.13, 0.2); g.add(handle);
  g.position.y = 0.5;
  const root = new THREE.Group();
  root.add(g, ring(0x35ff9a, 0.42, 0.52));
  root.userData.body = g;
  return root;
}

function keycard() {
  const g = new THREE.Group();
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.28), new THREE.MeshStandardMaterial({ color: 0x1b2024, roughness: 0.4, metalness: 0.5 }));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.034, 0.07), glow(0xffa030, 2.2)); stripe.position.z = -0.07;
  const chip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.034, 0.08), glow(0xffd070, 1.4)); chip.position.set(-0.12, 0, 0.06);
  g.add(card, stripe, chip);
  g.position.y = 1.0; g.rotation.x = 0.3;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3.2, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.y = 1.6; beam.material.userData.noSnap = true;
  const root = new THREE.Group();
  root.add(g, beam, ring(0xffa030, 0.5, 0.62));
  root.userData.body = g;
  return root;
}

// Health packs and the keycard. Collected by walking over them.
export class Pickups {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.items = [];
    this.t = 0;
  }

  clear() {
    for (const it of this.items) this.group.remove(it.mesh);
    this.items.length = 0;
  }

  add(type, x, z, room, reveal) {
    const mesh = type === 'key' ? keycard() : medkit();
    mesh.position.set(x, 0, z);
    mesh.userData.keep = true;
    this.group.add(mesh);
    const it = { type, x, z, mesh, room, reveal, taken: false, shown: false, phase: Math.random() * 6 };
    mesh.visible = false;
    this.items.push(it);
    return it;
  }

  // 'start' pickups are out from the beginning, 'clear' ones appear when the room's fight ends.
  reveal(room, when) {
    for (const it of this.items) if (it.room === room && !it.taken && !it.shown && it.reveal === when) { it.shown = true; it.mesh.visible = true; }
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.t += dt;
    for (const it of this.items) {
      if (!it.shown || it.taken) continue;
      const b = it.mesh.userData.body;
      b.rotation.y += dt * (it.type === 'key' ? 1.8 : 1.2);
      b.position.y = (it.type === 'key' ? 1.0 : 0.5) + Math.sin(this.t * 2.2 + it.phase) * 0.06;
      if (p.dead || g.state !== 'playing') continue;
      if (it.pulled) { const dx = p.pos.x - it.x, dz = p.pos.z - it.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, 14 * dt); it.x += (dx / d) * st; it.z += (dz / d) * st; it.mesh.position.set(it.x, 0, it.z); if (d < 1) it.pulled = false; }
      if (Math.hypot(p.pos.x - it.x, p.pos.z - it.z) > REACH || p.pos.y > 1.6) continue;
      if (it.type === 'health') {
        if (p.health >= p.maxHealth) continue;
        p.health = Math.min(p.maxHealth, p.health + HEAL);
        g.ui.rewardNote(`TRIAL FEED  ·  +${HEAL} VITALITY`);
        g.audio.play('crystal', { vol: 0.55 });
      } else {
        g.encounter.gotKey();
      }
      it.taken = true;
      it.mesh.visible = false;
    }
  }
}
