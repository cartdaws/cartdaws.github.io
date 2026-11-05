import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeSkin, skinParams } from '../creature/skin.js';
import { makeShifter } from '../creature/palette.js';
import { defaults } from '../creature/definition.js';
import { buildElder } from './elder.js';

// The homeworld memory: a small, composed place built from Blender assets (art/build_home.py -> public/models/home.glb).
// It sits far from the ship (HOME) with its own sky, light and fog, which are swapped in while the memory plays.
export const HOME = { x: 500, z: 0 };
export const HOME_START = { x: 0, z: 7, yaw: 0.9 };      // local to HOME: the player wakes here, facing away from the one who waits
export const ELDER_AT = { x: 1.2, z: -9.5 };

export async function loadHome() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/home.glb');
  return gltf.scene;
}

const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const hash = (x) => Math.sin(x * 127.1 + 311.7) * 43758.5453 % 1;

let SHIFT = null;                       // while the homeworld is built, every painted colour is rotated into the creature's palette
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g0 = c.getContext('2d');
  draw(SHIFT ? SHIFT.ctx(g0) : g0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 4;
  return t;
}

export class HomeWorld {
  constructor(scene, asset, def = defaults(), kit = null) {
    this.scene = scene;
    const S = SHIFT = makeShifter(def);
    const R = rng(4242);
    this.group = new THREE.Group();
    this.group.position.set(HOME.x, 0, HOME.z);
    this.group.visible = false;
    scene.add(this.group);
    const node = (n) => asset.getObjectByName(n);

    // ---- light and air
    this.hemi = new THREE.HemisphereLight(S.hex(0x9fe6dc), S.hex(0x1a2a3a), 1.15);
    this.sun = new THREE.DirectionalLight(S.hex(0xd6e4ff), 0.9);
    this.sun.position.set(HOME.x - 60, 90, HOME.z - 40);
    this.hemi.visible = this.sun.visible = false;
    scene.add(this.hemi, this.sun);
    this.fog = new THREE.FogExp2(S.hex(0x1d3a56), 0.011);
    this.bg = new THREE.Color(S.hex(0x120c36));

    // ---- ground and pools
    const groundTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#23665c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const x = R() * w, y = R() * h, r = 4 + R() * 26, a = 0.05 + R() * 0.12;
        g.fillStyle = R() < 0.5 ? `rgba(120,230,200,${a})` : `rgba(10,40,52,${a * 1.6})`;
        g.beginPath(); g.ellipse(x, y, r, r * (0.4 + R() * 0.6), R() * 3, 0, 7); g.fill();
      }
      g.strokeStyle = 'rgba(170,255,230,0.12)'; g.lineWidth = 1;
      for (let i = 0; i < 220; i++) { const x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + R() * 30 - 15, y + R() * 30 - 15, x + R() * 40 - 20, y + R() * 40 - 20); g.stroke(); }
    }, 22);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(95, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.92, emissive: S.hex(0x0b2a28), emissiveIntensity: 0.6 }));
    this.group.add(ground);
    const poolMat = new THREE.MeshStandardMaterial({ color: S.hex(0x1a8f9a), emissive: S.hex(0x0a4a55), emissiveIntensity: 0.7, roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.86 });
    for (const [x, z, r] of [[-9, -2, 4.5], [10, -14, 6], [-12, -16, 3.5], [8, 6, 2.8]]) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(r, 36).rotateX(-Math.PI / 2), poolMat);
      p.position.set(x, 0.025, z); this.group.add(p);
    }
    // soft hills closing the horizon
    const hillMat = new THREE.MeshStandardMaterial({ color: S.hex(0x143c46), roughness: 1, emissive: S.hex(0x08202a), emissiveIntensity: 0.8 });
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2 + R() * 0.3, d = 62 + R() * 18;
      const h = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), hillMat);
      h.scale.set(14 + R() * 12, 3 + R() * 6, 10 + R() * 8); h.position.set(Math.cos(a) * d, -0.5, Math.sin(a) * d); this.group.add(h);
    }

    // ---- flora and stone, kept clear of the walking line from the start to the one who waits
    const path = (x, z) => { const t = Math.max(0, Math.min(1, (HOME_START.z - z) / (HOME_START.z - ELDER_AT.z))); const px = HOME_START.x + (ELDER_AT.x - HOME_START.x) * t; return Math.hypot(x - px, 0) < 3.2 && z < HOME_START.z + 3 && z > ELDER_AT.z - 4; };
    const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; this.group.add(m); return m; };
    const spireMat = new THREE.MeshStandardMaterial({ color: S.hex(0x1f6a64), roughness: 0.5, emissive: S.hex(0x0b3b3a), emissiveIntensity: 0.9 });
    this.tipMat = new THREE.MeshBasicMaterial({ color: S.hex(0xb8ffe6), fog: true });
    const NS = 60, spires = mk(node('Spire').geometry, spireMat, NS), tips = mk(node('SpireTip').geometry, this.tipMat, NS);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0, k = 0; k < NS && i < 400; i++) {
      const a = R() * Math.PI * 2, d = 9 + R() * 50, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (path(x, z) || Math.hypot(x - ELDER_AT.x, z - ELDER_AT.z) < 4) continue;
      const s = 0.9 + R() * 1.4;
      e.set((R() - 0.5) * 0.12, R() * 6.28, (R() - 0.5) * 0.12); q.setFromEuler(e);
      m4.compose(v.set(x, 0, z), q, sc.set(s, s, s)); spires.setMatrixAt(k, m4); tips.setMatrixAt(k, m4); k++;
    }
    const stalkGeo = node('Stalk').geometry, bulbGeo = node('StalkBulb').geometry;
    const NK = 700, stalks = mk(stalkGeo, spireMat, NK), bulbs = mk(bulbGeo, new THREE.MeshBasicMaterial({ color: S.hex(0xffffff) }), NK);
    const col = new THREE.Color();
    for (let c = 0, k = 0; c < 90 && k < NK; c++) {
      const a = R() * Math.PI * 2, d = 4 + R() * 38, cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      for (let j = 0; j < 7 && k < NK; j++) {
        const x = cx + (R() - 0.5) * 2.2, z = cz + (R() - 0.5) * 2.2;
        if (path(x, z) && R() < 0.8) continue;
        const s = 0.7 + R() * 1.3;
        e.set((R() - 0.5) * 0.25, R() * 6.28, (R() - 0.5) * 0.25); q.setFromEuler(e);
        m4.compose(v.set(x, 0, z), q, sc.set(s, s, s)); stalks.setMatrixAt(k, m4); bulbs.setMatrixAt(k, m4);
        bulbs.setColorAt(k, col.set(R() < 0.65 ? S.hex(0x9affea) : S.hex(0xd9a8ff))); k++;
      }
    }
    const rockMat = new THREE.MeshStandardMaterial({ color: S.hex(0x27363e), roughness: 0.95, emissive: S.hex(0x06141a), emissiveIntensity: 0.8 });
    const rocks = mk(node('Rock').geometry, rockMat, 20);
    for (let i = 0; i < 20; i++) {
      const a = R() * Math.PI * 2, d = 6 + R() * 45, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const s = 0.8 + R() * 2.2; e.set(0, R() * 6.28, 0); q.setFromEuler(e);
      m4.compose(v.set(path(x, z) ? x + 6 : x, 0, z), q, sc.set(s, s * (0.6 + R() * 0.6), s)); rocks.setMatrixAt(i, m4);
    }
    this.flora = [spires, tips, stalks, bulbs, rocks];

    // ---- drifting spores and low mist: the air feels alive
    const NP = 260, pp = new Float32Array(NP * 3);
    for (let i = 0; i < NP; i++) { pp[i * 3] = (R() - 0.5) * 50; pp[i * 3 + 1] = 0.3 + R() * 5; pp[i * 3 + 2] = (R() - 0.5) * 50 - 4; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.spores = new THREE.Points(pg, new THREE.PointsMaterial({ color: S.hex(0xbfffe8), size: 0.09, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.spores.frustumCulled = false; this.group.add(this.spores); this.sporeBase = pp.slice();
    const mistTex = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(150,255,230,0.35)'); gr.addColorStop(1, 'rgba(150,255,230,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const mistMat = new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const [x, z, sz] of [[-6, -2, 9], [6, -8, 11], [-2, -14, 12], [0, 3, 8], [11, -2, 9], [-12, -9, 10]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz).rotateX(-Math.PI / 2), mistMat); m.position.set(x, 0.35, z); this.group.add(m); }

    // ---- the one who waits
    const gel = makeSkin({ ...skinParams(def, 'body'), pattern: 'none' });
    const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.skin.glow).lerp(new THREE.Color(0xffffff), 0.7), transparent: true, opacity: 0.92 });
    const swap = (o) => { o.traverse((m) => { if (m.isMesh) { const nm = (m.material && m.material.name) || ''; m.material = nm === 'GelCore' ? core : gel; m.frustumCulled = false; } }); return o; };
    if (kit && kit.creature && kit.hand) {
      // an elder of the player's own kind: the same body, skin, legs, arm and hand, with small differences of age
      const E = buildElder(kit.creature, kit.hand, def);
      this.elder = E.root; this.elderBody = E.body; this.elderArm = E.arm; this.elderArmL = E.armL; this.elderCore = E.core; this.elderTip = E.tipLocal; this.elderNew = true;
    } else {
      this.elder = new THREE.Group();
      this.elderBody = swap(node('Elder_Body').clone(true));
      this.elderArm = swap(node('Elder_Arm').clone(true));
      this.elder.add(this.elderBody, this.elderArm);
      this.elderCore = core;
    }
    this.elder.position.set(ELDER_AT.x, 0, ELDER_AT.z);
    this.group.add(this.elder);
    this.eState = { yaw: 0, reach: 0, step: 0, breath: 0, alert: 0, pulse: 0, fear: 0 };

    // ---- sky: gradient dome with stars, a ring overhead, two moons
    this.sky = new THREE.Group();
    scene.add(this.sky);
    const skyTex = canvasTex(1024, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#07041e'); gr.addColorStop(0.45, '#2d1f6e'); gr.addColorStop(0.7, '#2d6f98'); gr.addColorStop(0.86, '#58cdb8'); gr.addColorStop(1, '#58cdb8');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 380; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.6})`; const s = R() < 0.1 ? 2 : 1; g.fillRect(R() * w, R() * h * 0.55, s, s); }
      for (let k = 0; k < 3; k++) { const ag = g.createLinearGradient(0, h * 0.15, 0, h * 0.5); ag.addColorStop(0, 'rgba(120,255,220,0)'); ag.addColorStop(0.5, `rgba(${120 + k * 40},255,${215 - k * 30},0.13)`); ag.addColorStop(1, 'rgba(120,255,220,0)'); g.fillStyle = ag; g.beginPath(); g.moveTo(0, h * 0.5); for (let x = 0; x <= w; x += 32) g.lineTo(x, h * (0.27 + k * 0.05) + Math.sin(x * 0.012 + k * 2) * 24); g.lineTo(w, h * 0.5); g.fill(); }
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.dome.renderOrder = -10;
    this.sky.add(this.dome);
    const ringTex = canvasTex(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (const [a, b, al, c] of [[0.46, 0.56, 0.5, '190,235,215'], [0.58, 0.7, 0.38, '215,200,235'], [0.72, 0.8, 0.45, '175,225,230'], [0.83, 0.9, 0.3, '200,220,240'], [0.92, 0.98, 0.35, '210,200,225']]) {
        g.strokeStyle = `rgba(${c},${al})`; g.lineWidth = (b - a) * w * 0.5; g.beginPath(); g.arc(w / 2, h / 2, (a + b) / 2 * w * 0.5, 0, 7); g.stroke();
      }
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(120, 330, 96), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    // RingGeometry UVs are planar, so the texture's concentric bands map straight onto the annulus
    this.ring.rotation.set(-Math.PI / 2 + 0.55, 0, 0.3); this.ring.position.set(0, 150, -150); this.ring.renderOrder = -9;
    this.sky.add(this.ring);
    this.moonBig = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), new THREE.MeshBasicMaterial({ color: 0xdde4ff, fog: false })); this.moonBig.position.set(-170, 160, -330);
    this.moonSmall = new THREE.Mesh(new THREE.SphereGeometry(14, 20, 12), new THREE.MeshBasicMaterial({ color: 0xf0a050, fog: false })); this.moonSmall.position.set(130, 105, -350);
    this.sky.add(this.moonBig, this.moonSmall);
    this.sky.visible = false;

    SHIFT = null;                      // the human ship keeps its own colours
    this.tipBase = new THREE.Color(S.hex(0xb8ffe6));

    // ---- the human ship, its shadow and its searchlight
    this.ship = new THREE.Group();
    const hull = new THREE.MeshStandardMaterial({ color: 0x1c2228, roughness: 0.55, metalness: 0.7 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), hull); body.scale.set(34, 3.5, 9); this.ship.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(26, 2.4, 5), hull); top.position.y = 3; this.ship.add(top);
    for (const x of [-30, 30]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: x < 0 ? 0xff3322 : 0xffffff })); l.position.set(x, 0, 0); this.ship.add(l); }
    for (let i = -3; i <= 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 0.9), new THREE.MeshBasicMaterial({ color: 0xffb040 })); l.position.set(i * 7, -3.1, 0); this.ship.add(l); }
    this.ship.position.set(-400, 48, -8);
    this.group.add(this.ship);
    const shTex = canvasTex(128, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, fog: false }));
    this.shadow.scale.set(90, 1, 30); this.shadow.position.y = 0.06; this.shadow.renderOrder = 2; this.shadow.visible = false;
    this.group.add(this.shadow);
    this.spot = new THREE.SpotLight(0xe8f4ff, 0, 90, 0.2, 0.6, 1.2);
    this.spot.visible = false; scene.add(this.spot, this.spot.target);
    this.cone = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 2.4, 1, 24, 1, true).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.cone.visible = false; scene.add(this.cone);

    // ---- the capture device: a hazard-striped collar with clamps
    const stripe = canvasTex(256, 32, (g, w, h) => { g.fillStyle = '#1b1d20'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9a21b'; for (let x = -h; x < w; x += 40) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 20, h); g.lineTo(x + 20 + h, 0); g.lineTo(x + h, 0); g.fill(); } }, 1);
    stripe.wrapS = THREE.RepeatWrapping; stripe.repeat.set(4, 1);
    this.collar = new THREE.Group();
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.11, 12, 48).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.5, metalness: 0.5 }));
    this.collar.add(ringMesh);
    this.clamps = [];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.7), new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.4, metalness: 0.8 }));
      const pivot = new THREE.Group(); pivot.position.set(Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05); pivot.rotation.y = -a + Math.PI / 2;
      arm.position.z = -0.35; pivot.add(arm);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3322 })); lamp.position.set(0, 0.1, -0.1); pivot.add(lamp);
      this.collar.add(pivot); this.clamps.push({ pivot, a });
    }
    this.collar.visible = false;
    this.group.add(this.collar);
  }

  // Swap the sky, light and fog in or out (the ship's own scene is restored on hide).
  dispose() { this.scene.remove(this.group, this.hemi, this.sun, this.sky, this.spot, this.spot.target, this.cone); }

  show(v) {
    const s = this.scene;
    if (v && !this.shown) { this.saved = { bg: s.background, fog: s.fog }; s.background = this.bg; s.fog = this.fog; }
    if (!v && this.shown) { s.background = this.saved.bg; s.fog = this.saved.fog; }
    this.shown = v;
    this.group.visible = this.hemi.visible = this.sun.visible = this.sky.visible = v;
    if (!v) { this.spot.visible = false; this.cone.visible = false; this.collar.visible = false; this.shadow.visible = false; }
  }

  // The elder's pose for this frame. target is the player's world position.
  updateElder(dt, t, target) {
    const E = this.eState, el = this.elder;
    const dx = target.x - (HOME.x + el.position.x), dz = target.z - (HOME.z + el.position.z);
    const want = Math.atan2(-dx, -dz);                                // front is -Z
    const dist = Math.hypot(dx, dz);
    const aware = Math.max(E.alert, dist < 15 ? 1 : 0);
    let da = want - E.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
    E.yaw += da * Math.min(1, dt * (E.fear > 0 ? 6 : 1.6 + (dist < 8 ? 1.4 : 0))) * (aware ? 1 : 0.15);
    el.rotation.y = E.yaw;
    E.breath += dt;
    const br = 1 + Math.sin(E.breath * 1.4) * 0.014;
    this.elderBody.scale.set(1 / Math.sqrt(br), br, 1 / Math.sqrt(br));
    if (this.elderNew) this.elderBody.scale.multiplyScalar(1);
    this.elderBody.rotation.z = Math.sin(E.breath * 0.6) * 0.012 - E.fear * 0.12;
    this.elderBody.rotation.x = -E.fear * 0.18;                       // flinches back when the shadow comes
    el.position.y = 0;
    // arm: hangs, then rises to offer an open palm as the player nears
    const r = E.reach;
    this.elderArm.rotation.x = -(1 - r) * 1.15 + Math.sin(E.breath * 1.4 + 1) * 0.015 - E.fear * 0.5;
    this.elderArm.rotation.y = (1 - r) * -0.25;
    if (this.elderNew) {
      this.elderArm.position.y = this.elderArm.userData.y0 + Math.sin(E.breath * 1.4) * 0.01;
      this.elderArmL.rotation.x = -1.3 + Math.sin(E.breath * 1.1) * 0.03 - E.fear * 0.35;
      this.elderArmL.rotation.z = 0.1;
    } else this.elderArm.position.y = 1.78 + Math.sin(E.breath * 1.4) * 0.01;
    this.elderCore.opacity = 0.7 + 0.2 * Math.sin(E.breath * 1.8) + E.pulse * 0.3;
    E.pulse = Math.max(0, E.pulse - dt * 1.4);
    return dist;
  }

  palmWorld(out) {
    this.elder.updateMatrixWorld(true);
    return this.elderArm.localToWorld(this.elderTip ? out.copy(this.elderTip) : out.set(0, 0.04, -0.98));
  }

  update(dt, t, camPos) {
    if (!this.shown) return;
    this.sky.position.copy(camPos);
    { const a = this.spores.geometry.attributes.position, b = this.sporeBase; for (let i = 0; i < a.count; i++) { a.array[i * 3] = b[i * 3] + Math.sin(t * 0.3 + i) * 0.6; a.array[i * 3 + 1] = b[i * 3 + 1] + ((t * 0.12 + i * 0.37) % 1) * 0.8 + Math.sin(t * 0.7 + i * 2) * 0.15; a.array[i * 3 + 2] = b[i * 3 + 2] + Math.cos(t * 0.25 + i) * 0.6; } a.needsUpdate = true; }
    this.tipMat.color.setScalar(0.8 + 0.2 * Math.sin(t * 1.3)).multiply(this.tipBase).addScalar(0.15);
  }
}
