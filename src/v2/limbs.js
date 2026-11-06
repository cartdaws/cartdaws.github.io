import * as THREE from 'three';
import { Z0, L0 } from '../presentation/arm.js';
import { v2node } from './assets.js';
import { SKIN_FRAG, SKIN_VARYINGS } from './armskin.js';
import { clamp, damp, angleDiff } from '../core/util.js';
import { SpringChain } from '../presentation/tentacle.js';
import { MUTATIONS } from './mutations.js';

// THE EIGHT LIMBS. Each slot on the wheel is one limb at one place round the body, and what grows on it stays on it. The two you have raised leave the ground; the rest walk.
// THE WALKING LIMBS. The same Blender arm as the raised ones, laid along a spine the game works out each frame. The graphics card does the bending, so skin, suckers and any mutation all follow it exactly.
// They move the way an octopus does: not stepping on points but lying along the ground, gripping and hauling, a hump rolling down the limb as it re-grips, streaming behind when you run.
const SEG = 16, NSPINE = 14, GRAB_SEG = 32;
const limbGlsl = (seg) => `
  uniform vec3 uC[${seg + 1}], uNn[${seg + 1}], uBn[${seg + 1}]; uniform float uK, uFront, uWound, uPump, uGain;
  void limbFrame(float s, out vec3 C, out vec3 N, out vec3 B) {
    float f = clamp(s, 0.0, 1.0) * ${seg}.0; int i = int(min(floor(f), ${seg - 1}.0)); float u = f - float(i);
    C = mix(uC[i], uC[i + 1], u); N = normalize(mix(uNn[i], uNn[i + 1], u)); B = normalize(mix(uBn[i], uBn[i + 1], u));
  }
  float limbS(float z) { return (${Z0.toFixed(2)} - z) / ${L0.toFixed(2)}; }
  float limbSwell(float s) { float d = (s - uPump) / 0.06, de = (s - uFront + 0.03) / 0.07; return 1.0 + uGain * exp(-d * d) + 0.7 * uWound * exp(-de * de); }
  vec3 limbPoint(vec3 p) { float s = limbS(p.z); vec3 C, N, B; limbFrame(s, C, N, B); return C + (N * p.y + B * p.x) * uK * limbSwell(s); }
  vec3 limbNormal(vec3 p, vec3 n) { vec3 C, N, B; limbFrame(limbS(p.z), C, N, B); vec3 T = normalize(cross(B, N)); return normalize(B * n.x + N * n.y + T * n.z); }`;   // (B, N, T) must stay right-handed, or every triangle turns inside out

function skinMaterial(shared, U, seg = SEG) {
  return new THREE.ShaderMaterial({
    uniforms: { uRim: shared.uRim, uEnv: shared.uEnv, uAlpha: { value: 1 }, uGlow: { value: 0 }, uHeat: { value: 0 }, tTime: shared.tTime, uFront: U.uFront, uInfect: U.uInfect, uWound: U.uWound, uPump: U.uPump, uGain: U.uGain, uC: U.uC, uNn: U.uNn, uBn: U.uBn, uK: U.uK, uTint: U.uTint },
    vertexShader: `${limbGlsl(seg)}\n${SKIN_VARYINGS}
      void main() {
        vec3 q = limbPoint(position);
        vec4 mv = viewMatrix * vec4(q, 1.0);
        vN = normalize(mat3(viewMatrix) * limbNormal(position, normal));
        vV = normalize(-mv.xyz); vP = position;
        vVent = position.y / max(0.001, length(position.xy));
        vS = clamp(limbS(position.z), 0.0, 1.0);
        { float dp = (vS - uPump) / 0.06; vBand = exp(-dp * dp) * uGain; }
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: SKIN_FRAG,
  });
}
function partMaterial(src, U, front, seg = SEG) {
  const m = src.clone();
  m.onBeforeCompile = function (shader) {
    THREE.Material.prototype.onBeforeCompile.call(this, shader);
    Object.assign(shader.uniforms, { uC: U.uC, uNn: U.uNn, uBn: U.uBn, uK: U.uK, uFront: front, uWound: U.uWound, uPump: U.uPump, uGain: U.uGain });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + limbGlsl(seg))
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal = limbNormal(position, objectNormal);')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float gk = smoothstep(uFront, uFront + 0.09, limbS(position.z)); transformed = limbPoint(vec3(position.xy * gk, position.z)); }`)
      .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;')
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = mat3(viewMatrix) * objectNormal; vec3 vNormal0 = transformedNormal;');
  };
  m.customProgramCacheKey = () => 'v2-limbpart-' + seg + (m.map ? 'm' : '') + (m.normalMap ? 'n' : '');
  return m;
}
const spineU = (seg, k) => ({ uC: { value: new Float32Array((seg + 1) * 3) }, uNn: { value: new Float32Array((seg + 1) * 3) }, uBn: { value: new Float32Array((seg + 1) * 3) }, uK: { value: k }, uFront: { value: 1.2 }, uInfect: { value: 0 }, uWound: { value: 0 }, uPump: { value: 2 }, uGain: { value: 0 }, uTint: { value: new THREE.Vector3() } });

// A growth on the trunk comes up out of the flesh from the limb roots toward the top: below the front it is sunk inside the body.
function trunkMaterial(src, front) {
  const m = src.clone();
  m.onBeforeCompile = function (shader) {
    THREE.Material.prototype.onBeforeCompile.call(this, shader);
    shader.uniforms.uFront = front;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFront;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float y01 = clamp((1.98 - position.y) / 1.68, 0.0, 1.0), gk = smoothstep(uFront, uFront + 0.14, y01); vec2 ax = vec2(0.0, 0.2);
          transformed.xz = ax + (position.xz - ax) * mix(0.5, 1.0, gk); transformed.y = mix(min(position.y, 1.15), position.y, gk); }`);
  };
  m.customProgramCacheKey = () => 'v2-trunk-' + (m.map ? 'm' : '') + (m.normalMap ? 'n' : '');
  return m;
}
const _p = new THREE.Vector3(), _c = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Vector3();
const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3();
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const legR = (w) => (0.112 + (0.05 - 0.112) * Math.pow(w, 1.2));       // the arm's own radius; each limb multiplies it by uK

export class V2Limbs {
  constructor(body, scene, shared) {
    this.body = body; this.scene = scene; this.shared = shared; this.visible = true;
    if (body.alien) body.alien.root.visible = false;      // the old body is never drawn
    const G = body.hub;
    G.geometry = new THREE.BufferGeometry(); G.visible = true; G.position.set(0, 0, 0); G.scale.set(1, 1, 1);
    G.frustumCulled = false; G.material.visible = false;
    const src = v2node('V2Torso');
    this.torsoU = { uFront: { value: 1.2 }, uInfect: { value: 0 }, uWound: { value: 0 }, uGlow: { value: 0 }, uHeat: { value: 0 }, uAlpha: { value: 1 } };
    this.torso = new THREE.Mesh(src.geometry, new THREE.ShaderMaterial({
      uniforms: { uRim: shared.uRim, uEnv: shared.uEnv, tTime: shared.tTime, ...this.torsoU },
      vertexShader: `${SKIN_VARYINGS}
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vBand = 0.0; vP = position * vec3(0.42, 0.42, 0.42);
          vVent = -0.4 + 0.6 * smoothstep(0.75, 0.3, position.y); vS = clamp((1.42 - position.y) / 1.12, 0.0, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: SKIN_FRAG,
    }));
    this.torso.frustumCulled = false; G.add(this.torso);
    this.trunk = {};
    for (const m of Object.values(MUTATIONS)) {
      const front = { value: 1.2 }, meshes = (m.trunk || []).map((n) => { const s = v2node(n), me = new THREE.Mesh(s.geometry, trunkMaterial(s.material, front)); me.frustumCulled = false; me.visible = false; this.torso.add(me); return me; });
      this.trunk[m.id] = { front, meshes };
    }
    this.slots = []; this.raisedArms = null; this.inspecting = false;
    this.limbs = body.legs.map((leg, i) => this.makeLimb(leg, i));
    for (const leg of body.legs) leg.mesh.mesh.visible = false;
  }

  makeLimb(leg, i) {
    const U = spineU(SEG, 1.42);
    const skin = new THREE.Mesh(v2node('ArmSkin').geometry, skinMaterial(this.shared, U)); skin.frustumCulled = false;
    const suck = new THREE.Mesh(v2node('ArmSuckers').geometry, partMaterial(v2node('ArmSuckers').material, U, { value: -1 })); suck.frustumCulled = false;
    this.scene.add(skin, suck);
    return { leg, U, skin, suck, parts: {}, q: null, chain: new SpringChain(NSPINE, 260, 26, 1), ideal: Array.from({ length: NSPINE }, () => new THREE.Vector3()), spine: Array.from({ length: SEG + 1 }, () => new THREE.Vector3()), ph: i * 1.37, tip: new THREE.Vector3(), planted: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), stepT: -1, init: false, dur: 0.4, pres: 1, want: 1, on: true, showT: 0, showFor: 1.3 };
  }

  setVisible(v) { this.visible = v; this.torso.visible = v; for (const L of this.limbs) this.applyLimb(L); if (this.raisedArms && !v) for (const a of this.raisedArms) a.setVisible(false); }
  applyLimb(L) {
    const on = this.visible && L.pres > 0.02; L.on = on;
    L.skin.visible = L.suck.visible = on;
    for (const p of Object.values(L.parts)) for (const me of p.meshes) me.visible = on && !!L.q && L.q.m.id === p.id;
  }

  // What every limb carries, in slot order, and which two are raised. Nothing moves between limbs when you change arms: the limb itself comes up.
  set(slots, raised) {
    this.slots = slots;
    this.limbs.forEach((L, i) => {
      const q = slots[i] || null; L.q = q; L.want = raised.includes(i) ? 0 : 1;
      if (!q) { L.U.uInfect.value = 0; L.U.uFront.value = 1.2; L.U.uWound.value = 0; L.part = null; this.applyLimb(L); return; }
      let p = L.parts[q.m.id];
      if (!p) { const front = { value: 1.2 }; p = L.parts[q.m.id] = { id: q.m.id, front, meshes: q.m.nodes.map((n) => { const s = v2node(n), me = new THREE.Mesh(s.geometry, partMaterial(s.material, L.U, front)); me.frustumCulled = false; this.scene.add(me); return me; }) }; }
      L.U.uInfect.value = q.m.infect; L.part = p; this.applyLimb(L);
    });
  }

  // A limb that has just changed lifts into the corner of your view while it happens, so you see it even if it is not the arm in your hand.
  showLimb(i, dur = 1.3) { const L = this.limbs[i]; if (L && L.want > 0.5) { L.showT = dur; L.showFor = dur; } }

  // The body itself carries what the limbs carry: bulk, bruised skin, and each mutation's growths, climbing from the limb roots as it deepens.
  updateTrunk() {
    let mass = 0; const best = {};
    for (const q of this.slots) { if (!q) continue; const g = q.grow ?? 1; mass += g * (q.m.massK || 0) * (1 + 0.14 * Math.max(0, (q.n || 1) - 3)); best[q.m.id] = g; }
    for (const [id, T] of Object.entries(this.trunk)) {
      const g = best[id] || 0, prog = g <= 0 ? 0 : Math.min(1, g * 1.0);
      T.front.value = 1 - prog * 1.16;
      const on = this.visible && prog > 0.02; for (const me of T.meshes) me.visible = on;
    }
    this.mass = Math.min(0.26, mass);
    this.torsoU.uInfect.value = Math.min(0.9, mass * 3); this.torsoU.uFront.value = 1.05 - Math.min(1, mass * 2.4);
  }

  // Only ever needed from outside: the two raised arms, when you look at yourself.
  updateRaised(rq, lq, t) {
    if (!this.raisedArms) { this.raisedArms = [new SpineArm(this.scene, this.shared, GRAB_SEG), new SpineArm(this.scene, this.shared, GRAB_SEG)]; }
    const G = this.body.group; G.updateWorldMatrix(true, false);
    this.raisedArms.forEach((A, i) => {
      const sg = i ? -1 : 1, q = i ? lq : rq;
      if (A.q !== q) A.carry(q);
      A.setVisible(this.visible); A.U.uK.value = 1.05;
      const n = A.seg, pts = [[0.26, 0.98, -0.02], [0.5, 1.12, -0.42], [0.62, 1.34, -0.88], [0.56, 1.62, -1.2], [0.36, 1.76, -1.26]];
      for (let k = 0; k <= n; k++) {
        const f = (k / n) * (pts.length - 1), j = Math.min(pts.length - 2, Math.floor(f)), u = f - j, P0 = pts[j], P1 = pts[j + 1], w = k / n;
        const sw = Math.sin(t * 1.3 + i * 2 - w * 3) * 0.03 * w;
        _q.set((P0[0] + (P1[0] - P0[0]) * u) * sg + sw, P0[1] + (P1[1] - P0[1]) * u + Math.cos(t * 1.1 + i - w * 2) * 0.02 * w, P0[2] + (P1[2] - P0[2]) * u);
        G.localToWorld(A.S[k].copy(_q));
      }
      A.relax(); A.write(); A.tick();
    });
  }
  hideRaised() { if (this.raisedArms) for (const a of this.raisedArms) a.setVisible(false); }

  update(dt) {
    const B = this.body, P = B.player, t = (B.time += dt), world = B.world;
    const speed = Math.hypot(P.vx, P.vz), air = !P.grounded;
    B.yaw += angleDiff(B.yaw, P.yaw) * Math.min(1, 6 * dt);
    const cy = Math.cos(B.yaw), sy = Math.sin(B.yaw);
    // the torso rides on them: it dips and sways with the crawl, and leans into where you are going
    const lx = P.vx * Math.cos(P.yaw) - P.vz * Math.sin(P.yaw), lz = -(P.vx * -Math.sin(P.yaw) + P.vz * -Math.cos(P.yaw));
    B.lean.x = damp(B.lean.x, clamp(lz * 0.018, -0.2, 0.2), 6, dt); B.lean.y = damp(B.lean.y, clamp(-lx * 0.018, -0.2, 0.2), 6, dt);
    const breathe = 1 + Math.sin(t * 1.5) * 0.018;
    B.group.position.copy(P.pos); B.group.rotation.set(B.lean.x * 0.5, B.yaw, B.lean.y * 0.5, 'YXZ');
    this.updateTrunk();
    { const b = 1 + (this.mass || 0); this.torso.scale.set(breathe * b, (1 / Math.sqrt(breathe)) * (1 + (b - 1) * 0.22), breathe * b); }   // never tall enough to swallow your own eye
    this.torso.position.y = -Math.abs(Math.sin(t * (1.2 + speed * 0.6))) * 0.018 * Math.min(1, speed / 4);

    const trail = smooth(2.2, 5.8, speed);                  // slow: gripping and hauling. Fast: streaming behind you
    const stepDist = 0.42 + Math.min(0.4, speed * 0.05);
    const stepping = [false, false];
    for (const L of this.limbs) if (L.stepT >= 0) stepping[L.leg.d.g] = true;
    const rootY = P.pos.y + 0.44;

    for (const L of this.limbs) {
      // a raised limb has left the ground: it draws up under you, and comes back down the same way
      L.pres += clamp(L.want - L.pres, -dt / 0.2, dt / 0.2);
      if ((L.pres > 0.02) !== L.on || (L.on && !this.visible)) this.applyLimb(L);
      if (L.pres <= 0.02) { L.init = false; continue; }
      const d = L.leg.d, sg = Math.sign(d.a) || 1, pres = L.pres;
      { const lk = L.q ? ((L.q.m.limbK || 0) * (L.q.grow ?? 1)) + 0.025 * Math.min(12, Math.max(0, (L.q.n || 1) - 3)) : 0; L.U.uK.value = 1.42 * (1 + lk) * (0.5 + 0.5 * pres); }
      // where this limb wants to lie, in the body's own frame
      const a = d.a + sg * trail * (Math.PI - Math.abs(d.a)) * 0.62;
      const reach = (d.reach * 0.68) * (1 + trail * 0.18) * (1 + 0.5 * (B.deathK || 0));
      const hx0 = Math.sin(a) * reach, hz0 = -Math.cos(a) * reach + 0.2;
      const rx0 = Math.sin(d.a) * 0.34, rz0 = -Math.cos(d.a) * 0.34 + 0.2;
      const Rx = P.pos.x + rx0 * cy + rz0 * sy, Rz = P.pos.z - rx0 * sy + rz0 * cy;
      let hx = P.pos.x + hx0 * cy + hz0 * sy, hz = P.pos.z - hx0 * sy + hz0 * cy;
      // never through a wall or a prop: the limb stops short of it
      { const dx = hx - Rx, dz = hz - Rz, dist = Math.hypot(dx, dz) || 1; const hit = world.raycast(Rx, rootY - 0.15, Rz, dx / dist, 0, dz / dist, dist, (b) => b.tag !== 'door' || b.enabled); if (hit && hit.t < dist) { hx = Rx + (dx / dist) * Math.max(0.25, hit.t - 0.2); hz = Rz + (dz / dist) * Math.max(0.25, hit.t - 0.2); } }
      hx = Rx + (hx - Rx) * pres; hz = Rz + (hz - Rz) * pres;
      const gyHome = world.groundHeight(hx, hz, P.pos.y + 0.4, 0.15);
      if (!L.init || L.tip.distanceTo(P.pos) > 5) { L.tip.set(hx, gyHome, hz); L.planted.copy(L.tip); L.init = true; L.stepT = -1; L.chain.ready = false; }
      let hump = 0;
      if (air) {
        // nothing under you: they hang and trail, drawn in, swaying
        const k = 1 - Math.exp(-8 * dt);
        L.tip.x += (Rx + (hx - Rx) * 0.45 - L.tip.x) * k; L.tip.z += (Rz + (hz - Rz) * 0.45 - L.tip.z) * k;
        L.tip.y += (P.pos.y - 0.32 + Math.sin(t * 3 + L.ph) * 0.1 - Math.min(0, P.vy) * 0.02 - L.tip.y) * k;
        L.planted.copy(L.tip); L.stepT = -1;
      } else if (trail > 0.5 || pres < 0.98) {
        // running: nothing is planted for long, they stream and flick along the floor
        const k = 1 - Math.exp(-11 * dt);
        L.tip.x += (hx - L.tip.x) * k; L.tip.z += (hz - L.tip.z) * k; L.tip.y = gyHome; L.planted.copy(L.tip); L.stepT = -1;
        hump = Math.max(0, Math.sin(t * (3 + speed) + L.ph * 2)) * 0.5;
      } else if (L.stepT >= 0) {
        L.stepT += dt / L.dur;
        const k = Math.min(1, L.stepT), e = k * k * (3 - 2 * k);
        L.tip.lerpVectors(L.from, L.to, e); L.tip.y = L.from.y + (L.to.y - L.from.y) * e + Math.sin(k * Math.PI) * 0.03;      // it slides, it does not lift
        hump = Math.sin(k * Math.PI);
        if (L.stepT >= 1) { L.stepT = -1; L.planted.copy(L.to); L.tip.copy(L.to); }
      } else {
        L.tip.copy(L.planted);
        const dd = Math.hypot(L.planted.x - hx, L.planted.z - hz), other = stepping[1 - d.g];
        if ((dd > stepDist && !other) || dd > stepDist * 1.9 || Math.abs(L.planted.y - gyHome) > 0.5) {
          L.from.copy(L.planted); L.to.set(hx, gyHome, hz); L.stepT = 0; L.dur = clamp(0.42 - speed * 0.04, 0.2, 0.42); stepping[d.g] = true;
        }
      }
      // the spine: down out of the torso, along the ground, curling at the end
      const Tx = L.tip.x, Ty = L.tip.y, Tz = L.tip.z, dx = Tx - Rx, dz = Tz - Rz, hd = Math.hypot(dx, dz) || 0.001, ox = dx / hd, oz = dz / hd, px = -oz, pz = ox;
      const gyMid = air ? Ty : world.groundHeight(Rx + dx * 0.55, Rz + dz * 0.55, P.pos.y + 0.4, 0.15);
      const curl = d.c * (0.72 + 0.28 * Math.sin(t * 0.61 + L.ph)), slack = 0.14 + Math.max(0, 1.05 - hd) * 0.28;     // an arm with nowhere to go lies in an S, it does not bunch
      for (let i = 0; i < NSPINE; i++) {
        const w = i / (NSPINE - 1), q = L.ideal[i];
        const along = Math.pow(w, 0.92);
        const wave = Math.sin(t * (1.1 + speed * 0.5) + L.ph - w * 5) * (0.018 + 0.03 * w) * (1 + trail * 1.2) * Math.min(1, w * 3);
        const s = Math.sin(w * Math.PI * 1.6 + L.ph) * slack * Math.sin(w * Math.PI) * 0.6;
        const tipK = smooth(0.68, 1, w), cu = tipK * tipK * 0.26 * curl;
        q.x = Rx + dx * along + px * (wave + s + cu) - ox * tipK * tipK * 0.1;
        q.z = Rz + dz * along + pz * (wave + s + cu) - oz * tipK * tipK * 0.1;
        const touch = smooth(0.02, 0.4, w), g = gyMid + (Ty - gyMid) * smooth(0.5, 1, w);
        const r = legR(w) * L.U.uK.value * 0.88;
        q.y = rootY + (g + r - rootY) * touch + hump * Math.sin(Math.min(1, w * 1.15) * Math.PI) * 0.17 * (1 - tipK) + tipK * tipK * tipK * 0.05;
      }
      if (L.showT > 0) {
        // lifted into the corner of your view, writhing, while it changes
        L.showT -= dt; const e = L.showFor - L.showT, k = smooth(0, 0.24, e) * smooth(0, 0.32, L.showT), cam = P.game.camera, side = sg;
        _r.setFromMatrixColumn(cam.matrixWorld, 0); _u.setFromMatrixColumn(cam.matrixWorld, 1); cam.getWorldDirection(_f);
        _p.copy(cam.position).addScaledVector(_f, 0.95).addScaledVector(_r, side * 0.92).addScaledVector(_u, -0.3);
        _c.set(Rx, rootY, Rz).lerp(_p, 0.5).addScaledVector(_r, side * 0.24).addScaledVector(_u, -0.22);
        for (let i = 0; i < NSPINE; i++) {
          const w = i / (NSPINE - 1), iw = 1 - w, q = L.ideal[i];
          _q.set(iw * iw * Rx + 2 * iw * w * _c.x + w * w * _p.x, iw * iw * rootY + 2 * iw * w * _c.y + w * w * _p.y, iw * iw * Rz + 2 * iw * w * _c.z + w * w * _p.z);
          _q.addScaledVector(_u, w * w * w * 0.3 + Math.sin(t * 14 + w * 6) * 0.018 * w).addScaledVector(_r, Math.sin(t * 11 - w * 7) * 0.024 * w - side * w * w * w * 0.2);
          q.lerp(_q, k * smooth(0, 0.3, w));
        }
      }
      L.chain.step(L.ideal, dt);
      if (L.showT <= 0) this.keepOut(L.chain.p);
      this.writeFrames(L, Rx, rootY, Rz);
      if (L.q && L.part) { const fr = 1.03 - (L.q.grow ?? 1) * 1.03; L.part.front.value = fr; L.U.uFront.value = fr; L.U.uWound.value = L.q.wound || 0; }
    }
  }

  // A limb lying along the floor must never pass through anything solid. Whatever is close is kept in a short list, and any joint inside a box is pushed out of its nearest side.
  keepOut(P) {
    const W = this.body.world, me = this.body.player.pos;
    if (!this.nearT || --this.nearT <= 0) {
      this.nearT = 10; this.near = [];
      for (const b of W.boxes) { if (b.enabled === false || b.minY > me.y + 1.2 || b.maxY < me.y) continue; if (b.maxX > me.x - 3.2 && b.minX < me.x + 3.2 && b.maxZ > me.z - 3.2 && b.minZ < me.z + 3.2) this.near.push(b); }
    }
    for (let i = 2; i < P.length; i++) {
      const q = P[i];
      for (const b of this.near) {
        if (q.y < b.minY || q.y > b.maxY || q.x < b.minX || q.x > b.maxX || q.z < b.minZ || q.z > b.maxZ) continue;
        const a = q.x - b.minX, c = b.maxX - q.x, d = q.z - b.minZ, e = b.maxZ - q.z, m = Math.min(a, c, d, e), gap = 0.05;
        if (m === a) q.x = b.minX - gap; else if (m === c) q.x = b.maxX + gap; else if (m === d) q.z = b.minZ - gap; else q.z = b.maxZ + gap;
      }
    }
  }

  // chain to smooth spine, then a frame at each sample that never twists: "under" (the suckers' side) stays toward the floor
  writeFrames(L, Rx, Ry, Rz) {
    const P = L.chain.p, n = NSPINE - 1, C = L.U.uC.value, Nn = L.U.uNn.value, Bn = L.U.uBn.value, S = L.spine;
    P[0].set(Rx, Ry, Rz);
    const cat = (a, b, c, d, u) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
    for (let i = 0; i <= SEG; i++) {
      const f = (i / SEG) * n, k = Math.min(n - 1, Math.floor(f)), u = f - k, a = P[Math.max(0, k - 1)], b = P[k], c = P[k + 1], d = P[Math.min(n, k + 2)];
      S[i].set(cat(a.x, b.x, c.x, d.x, u), cat(a.y, b.y, c.y, d.y, u), cat(a.z, b.z, c.z, d.z, u));
    }
    _n.set(0, -1, 0);
    for (let i = 0; i <= SEG; i++) {
      _t.subVectors(S[Math.min(SEG, i + 1)], S[Math.max(0, i - 1)]).normalize();
      _n.addScaledVector(_t, -_n.dot(_t)); if (_n.lengthSq() < 1e-5) _n.set(1, 0, 0).addScaledVector(_t, -_t.x); _n.normalize();
      _b.crossVectors(_t, _n).normalize();
      const q = i * 3;
      C[q] = S[i].x; C[q + 1] = S[i].y; C[q + 2] = S[i].z; Nn[q] = _n.x; Nn[q + 1] = _n.y; Nn[q + 2] = _n.z; Bn[q] = _b.x; Bn[q + 1] = _b.y; Bn[q + 2] = _b.z;
    }
  }
}

// An arm that can take any shape the game gives it, in the world, with real depth: it can go behind and round the thing it holds. The absorb uses two of these.
export class SpineArm {
  constructor(scene, shared, seg = GRAB_SEG) {
    this.scene = scene; this.seg = seg; this.U = spineU(seg, 0.92); this.parts = {}; this.part = null; this.q = null;
    this.skin = new THREE.Mesh(v2node('ArmSkin').geometry, skinMaterial(shared, this.U, seg)); this.skin.frustumCulled = false;
    // the suckers are drawn as skin: lit like the rest of the arm, not by whatever lamp happens to be overhead
    this.suck = new THREE.Mesh(v2node('ArmSuckers').geometry, skinMaterial(shared, this.U, seg)); this.suck.material.defines = { SUCKER: 1 }; this.suck.frustumCulled = false;
    scene.add(this.skin, this.suck);
    const vecs = () => Array.from({ length: seg + 1 }, () => new THREE.Vector3());
    this.S = vecs(); this.G = vecs(); this.want = vecs(); this.wantK = new Float32Array(seg + 1); this.tmp = vecs();
    this.setVisible(false);
  }
  setVisible(v) { this.visible = v; this.skin.visible = this.suck.visible = v; if (this.part) for (const me of this.part.meshes) me.visible = v; }
  carry(q) {
    if (this.part) for (const me of this.part.meshes) me.visible = false;
    this.q = q; this.part = null; this.U.uInfect.value = q ? q.m.infect : 0; this.U.uFront.value = 1.2; this.U.uWound.value = 0;
    if (!q) return;
    let p = this.parts[q.m.id];
    if (!p) { const front = { value: 1.2 }; p = this.parts[q.m.id] = { front, meshes: q.m.nodes.map((n) => { const s = v2node(n), me = new THREE.Mesh(s.geometry, partMaterial(s.material, this.U, front, this.seg)); me.frustumCulled = false; this.scene.add(me); return me; }) }; }
    this.part = p; for (const me of p.meshes) me.visible = this.visible;
  }
  tick() { if (this.q && this.part) { const f = 1.03 - (this.q.grow ?? 1) * 1.03; this.part.front.value = f; this.U.uFront.value = f; this.U.uWound.value = this.q.wound || 0; } }
  // the joins come out soft: nothing organic has a corner
  relax() {
    const S = this.S, T = this.tmp, n = this.seg;
    for (let pass = 0; pass < 2; pass++) { for (let i = 1; i < n; i++) T[i].copy(S[i - 1]).add(S[i + 1]).multiplyScalar(0.25).addScaledVector(S[i], 0.5); for (let i = 1; i < n; i++) S[i].copy(T[i]); }
  }
  write() {
    const S = this.S, n = this.seg, C = this.U.uC.value, Nn = this.U.uNn.value, Bn = this.U.uBn.value;
    _n.set(0, -1, 0);
    for (let i = 0; i <= n; i++) {
      _t.subVectors(S[Math.min(n, i + 1)], S[Math.max(0, i - 1)]); if (_t.lengthSq() < 1e-9) _t.set(0, 0, -1); _t.normalize();
      if (this.wantK[i] > 0) _n.lerp(this.want[i], this.wantK[i]);
      _n.addScaledVector(_t, -_n.dot(_t)); if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0).addScaledVector(_t, -_t.x); _n.normalize();
      _b.crossVectors(_t, _n).normalize();
      const q = i * 3;
      C[q] = S[i].x; C[q + 1] = S[i].y; C[q + 2] = S[i].z; Nn[q] = _n.x; Nn[q + 1] = _n.y; Nn[q + 2] = _n.z; Bn[q] = _b.x; Bn[q + 1] = _b.y; Bn[q + 2] = _b.z;
    }
  }
}
