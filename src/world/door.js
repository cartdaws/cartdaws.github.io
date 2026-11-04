import * as THREE from 'three';
import { M, boxGeo, kitMaterial } from './materials.js';

const LAMP = { red: 0xff2a1a, green: 0x35ff7a, amber: 0xffa030 };

// Vertical sliding security door. Retracts upward into the lintel above the opening.
export class Door {
  constructor(scene, world, { x, z, w = 3, h = 3, d = 0.3, closed = false, kit = null, axis = 'z' }) {
    this.h = h;
    this.x = x; this.z = z;
    this.locked = false;
    const rot = axis === 'x' ? Math.PI / 2 : 0;
    if (kit && kit.has('door_leaf')) {
      this.mesh = new THREE.Group(); // the leaf from the environment kit (several materials, one moving piece)
      for (const p of kit.parts.door_leaf) this.mesh.add(new THREE.Mesh(p.geometry, kitMaterial(p.matName)));
    } else {
      this.mesh = new THREE.Mesh(boxGeo(w, h, d), M.machine);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d + 0.04), M.hazard);
      stripe.position.y = -h / 2 + 0.14;
      this.mesh.add(stripe);
    }
    this.mesh.userData.keep = true;
    this.mesh.rotation.y = rot;
    this.mesh.position.set(x, h / 2, z);
    scene.add(this.mesh);

    this.lampMat = new THREE.MeshStandardMaterial({ color: 0, emissive: LAMP.green, emissiveIntensity: 2.4 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.03), this.lampMat);
      if (axis === 'z') lamp.position.set(x + sx * (w / 2 + 0.13), 2.1, z + sz * 0.41);
      else { lamp.position.set(x + sz * 0.41, 2.1, z + sx * (w / 2 + 0.13)); lamp.rotation.y = rot; }
      scene.add(lamp);
    }

    this.box = axis === 'z' ? world.add(x - w / 2, 0, z - d / 2, x + w / 2, h * 2, z + d / 2, { tag: 'door' }) : world.add(x - d / 2, 0, z - w / 2, x + d / 2, h * 2, z + w / 2, { tag: 'door' });
    this.baseY = h / 2;
    this.closeness = closed ? 1 : 0; // 1 = fully shut
    this.target = this.closeness;
    this.speed = 1 / 0.7;
    this.apply();
    this.setLamp(closed ? 'red' : 'green');
  }

  get isClosed() { return this.closeness >= 1; }
  get isOpen() { return this.closeness <= 0; }

  close(instant = false) { this.target = 1; if (instant) this.closeness = 1; this.apply(); this.setLamp(this.locked ? 'amber' : 'red'); }
  lock() { this.locked = true; this.close(true); this.setLamp('amber'); }
  unlock() { this.locked = false; }
  open(instant = false) {
    if (this.locked) { this.setLamp('amber'); return; }
    this.target = 0; if (instant) this.closeness = 0; this.apply(); this.setLamp('green');
  }
  setLamp(c) { this.lampMat.emissive.setHex(LAMP[c]); }

  apply() {
    const bottom = (1 - this.closeness) * this.h;
    this.mesh.position.y = bottom + this.h / 2;
    this.box.minY = bottom;
    // Closing blocks immediately; opening only releases once the player can walk under.
    this.box.enabled = this.target > 0.5 || bottom < 2.2;
  }

  update(dt) {
    if (this.closeness === this.target) return;
    const step = this.speed * dt;
    this.closeness = this.closeness < this.target ? Math.min(this.target, this.closeness + step) : Math.max(this.target, this.closeness - step);
    this.apply();
  }
}
