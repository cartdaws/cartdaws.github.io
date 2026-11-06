import * as THREE from 'three';

// HOLD V: see what you have become. The camera steps out behind you and the mouse moves it round, while the world slows. This is the only place you see your whole outline.
const _d = new THREE.Vector3();
export class Inspect {
  constructor(game) { this.g = game; this.active = false; this.yaw = 0; this.pitch = -0.2; this.pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }; }

  feed(dx, dy) { this.yaw -= dx * 0.004; this.pitch = Math.max(-1.1, Math.min(0.5, this.pitch - dy * 0.003)); }

  enter() {
    const g = this.g; this.active = true; this.yaw = g.player.yaw + 0.55; this.pitch = -0.28;
    g.cinePose = this.pose; g.debugBody = true; g.viewmodel.root.visible = false;
    document.body.classList.add('v2-inspect');
  }
  leave() {
    const g = this.g; this.active = false;
    if (g.cinePose === this.pose) g.cinePose = null;
    g.debugBody = false; g.viewmodel.root.visible = true; g.body.v2?.hideRaised();
    document.body.classList.remove('v2-inspect');
  }

  update(t) {
    const g = this.g, E = g.evolution;
    const can = g.state === 'playing' && !g.player.dead && !E.wheel.open && !g.absorber.drawing;
    const want = can && (g.input.down('KeyV') || this.forced);
    if (want && !this.active) this.enter(); else if (!want && this.active) this.leave();
    if (!this.active) return;
    // behind the body, kept out of the walls
    const P = g.player.pos, cx = P.x, cy = P.y + 0.95, cz = P.z, cp = Math.cos(this.pitch);
    _d.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const hit = g.world.raycast(cx, cy, cz, _d.x, _d.y, _d.z, 3.0);
    const r = hit ? Math.max(1.0, hit.t - 0.3) : 3.0;
    const po = this.pose; po.x = cx + _d.x * r; po.y = Math.max(0.25, cy + _d.y * r); po.z = cz + _d.z * r; po.yaw = this.yaw; po.pitch = this.pitch;
    g.body.v2?.updateRaised(E.wantR, E.wantL, t);
  }
}
