import * as THREE from 'three';
import { lerp, damp, clamp, angleDiff } from '../core/util.js';
import { makeGel } from '../world/materials.js';
import { TentacleMesh, makeTentacleGel, updateTentacleGels, bezier, SpringChain } from '../presentation/tentacle.js';

const LEGS = [ // angle from forward (rad), reach (m), gait group
  { a: -0.66, reach: 2.5, g: 0 }, { a: 0.66, reach: 2.5, g: 1 },
  { a: -1.57, reach: 1.9, g: 1 }, { a: 1.57, reach: 1.9, g: 0 },
  { a: -2.55, reach: 2.0, g: 0 }, { a: 2.55, reach: 2.0, g: 1 },
];
const N = 10;
const _o = new THREE.Vector3(), _v = new THREE.Vector3();

// The player's own octopus body: a translucent bell with glowing organs, walking on six independent tentacles.
export class AlienBody {
  constructor(scene, world, player, geos) {
    this.world = world; this.player = player;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.yaw = 0;
    this.time = 0;
    this.lean = new THREE.Vector2();

    const bellGel = makeGel({ color: 0x0a4a46, rim: 0x7ff0e0, alpha: 0.2 });
    this.bell = new THREE.Mesh(geos.Mantle, bellGel);
    this.bell.scale.set(0.95, 1.0, 0.95);
    this.bell.renderOrder = 2;
    this.group.add(this.bell);

    const organ = makeGel({ color: 0x0f6a60, rim: 0xc6fff6, alpha: 0.5 });
    this.core = new THREE.Mesh(geos.Organ, organ);
    this.core.scale.setScalar(0.13);
    this.core.position.y = 0.55;
    this.group.add(this.core);
    this.sats = [];
    for (let i = 0; i < 4; i++) {
      const m = (() => { const o = new THREE.Mesh(geos.Organ, organ); o.scale.setScalar(0.05 + i * 0.01); return o; })();
      this.group.add(m);
      this.sats.push({ m, a: i * 1.6, r: 0.27 + i * 0.03, h: 0.35 + i * 0.12 });
    }

    this.legGel = makeTentacleGel({ color: 0x0a4a46, rim: 0x7ff0e0, alpha: 0.5, length: 2.4, r0: 0.11, r1: 0.012 });
    this.legs = LEGS.map((d) => {
      const leg = {
        d,
        planted: new THREE.Vector3(), foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(),
        stepT: -1, dur: 0.24, init: false,
        chain: new SpringChain(N, 360, 90, 0.8),
        ideal: Array.from({ length: N }, () => new THREE.Vector3()),
        c1: new THREE.Vector3(), c2: new THREE.Vector3(), root: new THREE.Vector3(),
        mesh: new TentacleMesh({ rings: 28, radial: 14, radius: (t) => lerp(0.15, 0.015, Math.pow(t, 0.75)) * (1 + 0.1 * Math.sin(t * 10)), material: this.legGel }),
      };
      leg.mesh.mesh.renderOrder = 2;
      scene.add(leg.mesh.mesh);
      return leg;
    });
  }

  dispose(scene) { scene.remove(this.group); for (const l of this.legs) scene.remove(l.mesh.mesh); }

  home(leg, out, lead) {
    const { a, reach } = leg.d;
    const lx = Math.sin(a) * reach, lz = -Math.cos(a) * reach;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    out.set(this.player.pos.x + lx * cy + lz * sy, 0, this.player.pos.z - lx * sy + lz * cy);
    out.x += this.player.vx * lead; out.z += this.player.vz * lead;
    // keep feet out of walls and props
    const p = this.player.pos;
    _o.set(p.x, p.y + 0.6, p.z);
    const dx = out.x - p.x, dz = out.z - p.z, dist = Math.hypot(dx, dz) || 1;
    const hit = this.world.raycast(_o.x, _o.y, _o.z, dx / dist, 0, dz / dist, dist, (b) => b.tag !== 'door' || b.enabled);
    if (hit && hit.t < dist) { out.x = p.x + (dx / dist) * Math.max(0.5, hit.t - 0.25); out.z = p.z + (dz / dist) * Math.max(0.5, hit.t - 0.25); }
    out.y = this.world.groundHeight(out.x, out.z, p.y + 0.4, 0.2);
    return out;
  }

  setVisible(v) { this.group.visible = v; for (const l of this.legs) l.mesh.mesh.visible = v; }

  update(dt) {
    const p = this.player, t = (this.time += dt);
    const speed = Math.hypot(p.vx, p.vz);
    this.yaw += angleDiff(this.yaw, p.yaw) * Math.min(1, 5 * dt);

    // Bell: follows the player, leans into motion, breathes.
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    const lx = p.vx * cy - p.vz * sy, lz = -(p.vx * -sy + p.vz * -cy);
    this.lean.x = damp(this.lean.x, clamp(lz * 0.02, -0.25, 0.25), 6, dt);
    this.lean.y = damp(this.lean.y, clamp(-lx * 0.02, -0.25, 0.25), 6, dt);
    const breathe = 1 + Math.sin(t * 1.8) * 0.025 + Math.sin(t * 7) * 0.006 * Math.min(1, speed);
    this.group.position.set(p.pos.x, p.pos.y + 0.52, p.pos.z);
    this.group.rotation.set(this.lean.x, this.yaw, this.lean.y, 'YXZ');
    this.bell.scale.set(0.95 * breathe, 1.0 / breathe, 0.95 * breathe);
    this.core.scale.setScalar(0.13 * (1 + Math.sin(t * 2.4) * 0.12));
    this.core.rotation.y = t * 0.2;
    for (const s of this.sats) s.m.position.set(Math.cos(t * 0.7 + s.a) * s.r, s.h + Math.sin(t * 1.3 + s.a) * 0.05, Math.sin(t * 0.7 + s.a) * s.r);

    // Gait: two alternating tripods.
    const stepDist = 0.5 + Math.min(0.45, speed * 0.06);
    let stepping = [false, false];
    for (const leg of this.legs) if (leg.stepT >= 0) stepping[leg.d.g] = true;
    const lead = clamp(0.22 + speed * 0.01, 0.2, 0.32);
    const air = !p.grounded;

    for (const leg of this.legs) {
      this.home(leg, _v, lead);
      if (!leg.init || leg.planted.distanceTo(p.pos) > 5) { leg.planted.copy(_v); leg.foot.copy(_v); leg.init = true; leg.chain.ready = false; }
      if (air) {
        // tuck and splay while airborne
        const tgt = _o.copy(_v); tgt.y = p.pos.y + 0.35 + Math.sin(t * 6 + leg.d.a * 3) * 0.12;
        leg.foot.lerp(tgt, 1 - Math.exp(-10 * dt));
        leg.planted.copy(leg.foot); leg.stepT = -1;
      } else if (leg.stepT >= 0) {
        leg.stepT += dt / leg.dur;
        const k = Math.min(1, leg.stepT), e = k * k * (3 - 2 * k);
        leg.foot.lerpVectors(leg.from, leg.to, e);
        leg.foot.y += Math.sin(k * Math.PI) * (0.28 + speed * 0.025);
        if (leg.stepT >= 1) { leg.stepT = -1; leg.planted.copy(leg.to); leg.foot.copy(leg.to); }
      } else {
        leg.foot.copy(leg.planted);
        const d = Math.hypot(leg.planted.x - _v.x, leg.planted.z - _v.z);
        const other = stepping[1 - leg.d.g];
        if ((d > stepDist && !other) || d > stepDist * 1.8 || Math.abs(leg.planted.y - _v.y) > 0.6) {
          leg.from.copy(leg.planted); leg.to.copy(_v);
          leg.stepT = 0; leg.dur = clamp(0.3 - speed * 0.016, 0.14, 0.3);
          stepping[leg.d.g] = true;
        }
      }

      // Spine of the tentacle: out and up from the bell, arching down to the foot.
      const { a } = leg.d;
      const rx = Math.sin(a) * 0.3, rz = -Math.cos(a) * 0.3;
      const cyb = Math.cos(this.yaw), syb = Math.sin(this.yaw);
      leg.root.set(p.pos.x + rx * cyb + rz * syb, p.pos.y + 0.62, p.pos.z - rx * syb + rz * cyb);
      const dx = leg.foot.x - leg.root.x, dz = leg.foot.z - leg.root.z, hd = Math.hypot(dx, dz) || 1;
      const ox = dx / hd, oz = dz / hd;
      const lift = Math.max(0, leg.foot.y - (this.world.groundHeight(leg.foot.x, leg.foot.z, p.pos.y + 0.4, 0.2)));
      leg.c1.set(leg.root.x + ox * hd * 0.35, leg.root.y + 0.5 + hd * 0.18, leg.root.z + oz * hd * 0.35);
      leg.c2.set(leg.foot.x - ox * hd * 0.2, leg.foot.y + 0.55 + hd * 0.12 + lift * 0.5, leg.foot.z - oz * hd * 0.2);
      for (let i = 0; i < N; i++) bezier(leg.root, leg.c1, leg.c2, leg.foot, i / (N - 1), leg.ideal[i]);
      for (let i = 1; i < N - 1; i++) {
        const w = i / (N - 1), amp = 0.02 * Math.sin(w * Math.PI) * (1 + Math.min(1, speed));
        leg.ideal[i].x += Math.sin(t * 2.0 + leg.d.a * 4 - w * 5) * amp;
        leg.ideal[i].y += Math.sin(t * 1.7 + leg.d.a * 3 - w * 4) * amp;
      }
      leg.chain.step(leg.ideal, dt);
      leg.chain.p[N - 1].copy(leg.foot); // tip stays planted exactly
      leg.mesh.update(leg.chain.p);
    }
    updateTentacleGels(t, 0);
  }

  reset() { for (const l of this.legs) { l.init = false; l.stepT = -1; } this.yaw = this.player.yaw; }
}
