import * as THREE from 'three';
import { M, kitMaterial } from '../world/materials.js';
import { rand } from '../core/util.js';

const BLAST_RADIUS = 6.5;
const FUSE_TIME = 0.5;
const CHAIN_FUSE = 0.28;

// Explosive drum: shot -> sparking fuse -> blast that respects cover and chains to neighbours.
export class Barrel {
  constructor(game, x, z) {
    this.game = game;
    this.x = x; this.z = z;
    this.state = 'alive';
    this.hp = 25;
    this.fuse = 0;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    game.scene.add(this.group);
    this.hitSpheres = [{ c: new THREE.Vector3(x, 0.55, z), r: 0.6 }];

    this.mat = M.drum.clone();
    this.mat.emissive = new THREE.Color(0xff6a10);
    this.mat.emissiveIntensity = 0;
    // body and fittings come from the environment kit; the drum surface keeps the hazard-label material so it can flash
    const kit = game.kit;
    for (const part of kit.parts.barrel_explosive) {
      const m = new THREE.Mesh(part.geometry, part.matName === 'Drum' ? this.mat : kitMaterial(part.matName));
      this.group.add(m);
      if (part.matName === 'Drum') this.body = m;
    }
    this.box = game.world.addCentered(x, 0.55, z, 0.84, 1.1, 0.84, { tag: 'barrel' });
    this.remnant = null;
  }

  takeDamage(amount) {
    if (this.state !== 'alive') return;
    this.hp -= amount;
    this.mat.emissiveIntensity = 1.2;
    if (this.hp <= 0) this.ignite(FUSE_TIME);
  }

  ignite(time) {
    if (this.state !== 'alive') return;
    this.state = 'fuse';
    this.fuse = time;
    this.game.sfxAt('fuse', this.group.position, 1);
  }

  center() { return new THREE.Vector3(this.x, 0.6, this.z); }

  update(dt) {
    if (this.state === 'alive') {
      this.mat.emissiveIntensity = Math.max(0, this.mat.emissiveIntensity - dt * 8);
    } else if (this.state === 'fuse') {
      this.fuse -= dt;
      const flick = Math.sin(this.fuse * 70) > 0 ? 1 : 0.2;
      this.mat.emissiveIntensity = 1.5 * flick + 0.6;
      this.group.position.x = this.x + rand(-0.012, 0.012);
      const c = this.center();
      c.y = 1.2;
      this.game.effects.glowP.emit(c.x + rand(-0.2, 0.2), c.y, c.z + rand(-0.2, 0.2), rand(-2, 2), rand(2, 5), rand(-2, 2), rand(0.2, 0.4), 0.05, 1, 0.8, 0.3, 9, 1);
      if (this.fuse <= 0) this.explode();
    }
  }

  explode() {
    const g = this.game;
    this.state = 'destroyed';
    g.world.remove(this.box);
    this.group.visible = false;
    const c = this.center();
    g.effects.explosion(c, BLAST_RADIUS);
    g.sfxAt('explosion', c, 1.6);
    g.addShake(0.15 + Math.max(0, 1 - g.player.pos.distanceTo(c) / 20) * 0.5);

    // Charred shell left behind.
    const rem = new THREE.Group();
    rem.position.set(this.x, 0, this.z);
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.9, metalness: 0.3 });
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.22, 14, 1, true), dark);
    stump.material.side = THREE.DoubleSide;
    stump.position.y = 0.11;
    rem.add(stump);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + rand(-0.2, 0.2), h = rand(0.25, 0.55);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.18), dark);
      fin.position.set(Math.cos(a) * 0.43, h / 2, Math.sin(a) * 0.43);
      fin.rotation.set(0, -a, rand(-0.3, 0.3));
      rem.add(fin);
    }
    const ember = new THREE.Mesh(new THREE.CircleGeometry(0.34, 12), new THREE.MeshBasicMaterial({ color: 0xff5a14 }));
    ember.rotation.x = -Math.PI / 2; ember.position.y = 0.04;
    rem.add(ember);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.02, 4, 14, 3), new THREE.MeshStandardMaterial({ color: 0xa81810 }));
    stripe.rotation.x = Math.PI / 2; stripe.position.y = 0.12;
    rem.add(stripe);
    g.scene.add(rem);
    this.remnant = rem;
    this.ember = ember;

    // Damage everything in range that is not shielded by solid cover.
    const ignoreBarrels = (b) => b.tag !== 'barrel' && b.tag !== 'glass';
    const shielded = (px, py, pz) => g.world.blocked(c.x, c.y, c.z, px, py, pz, ignoreBarrels);
    const fall = (d) => 1 - Math.min(1, d / BLAST_RADIUS);

    for (const e of g.enemies) {
      if (!e.alive) continue;
      const p = e.hitSpheres[0].c;
      const d = p.distanceTo(c);
      if (d > BLAST_RADIUS || shielded(p.x, p.y, p.z)) continue;
      g.damageEnemy(e, 22 + 80 * fall(d), p);
    }
    const pp = g.player.pos;
    const pc = new THREE.Vector3(pp.x, pp.y + 0.9, pp.z);
    const pd = pc.distanceTo(c);
    if (pd <= BLAST_RADIUS && !shielded(pc.x, pc.y, pc.z)) {
      g.damagePlayer(14 + 40 * fall(pd), c);
      const k = new THREE.Vector3(pp.x - c.x, 0, pp.z - c.z).normalize();
      g.player.knock(k.x * 6 * fall(pd), k.z * 6 * fall(pd));
    }
    for (const b of g.barrels) {
      if (b === this || b.state !== 'alive') continue;
      const bc = b.center();
      const d = bc.distanceTo(c);
      if (d <= BLAST_RADIUS && !shielded(bc.x, bc.y, bc.z)) b.ignite(CHAIN_FUSE);
    }
  }

  dispose() {
    this.game.scene.remove(this.group);
    if (this.remnant) this.game.scene.remove(this.remnant);
    this.game.world.remove(this.box);
  }
}
