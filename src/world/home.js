import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeSkin, skinParams } from '../creature/skin.js';
import { makeShifter } from '../creature/palette.js';
import { defaults } from '../creature/definition.js';
import { buildElder, stepElder } from './elder.js';
import { cloneWarship } from '../game/flight.js';

// The homeworld memory: a small, composed place built from Blender assets (art/build_home.py -> public/models/home.glb).
// It sits far from the ship (HOME) with its own sky, light and fog, which are swapped in while the memory plays.
export const HOME = { x: 1400, z: 0 };   // far beyond the view distance from the ship, so the ship is never drawn from here (or this from there)
export const HOME_START = { x: 0, z: 7, yaw: 0.9 };      // local to HOME: the player wakes here, facing away from the one who waits
import { HomeLife, addWind, bodyRadius } from './homeLife.js';
export const ELDER_AT = { x: 1.2, z: -9.5 };
export const WRECK_AT = { x: -10, z: -19 };            // the downed human lander, local to the homeworld
export const PISTOL_AT = { x: -6.2, z: -15.4 };        // the dead pilot's sidearm
const HOUSES = [[-9, -5], [10, -8], [-16, -9], [6, -19], [-4, -27], [15, -20]];
const FALLEN = [[3, -4, 0.7], [-1, -21, 5.4], [11, -14, 4.0], [-12, -2, 5.2]];
// Scenery keeps out of what stands here: a tree must never grow through a house, the wreck or the sidearm.
const keepClear = (x, z, r = 0) => HOUSES.some(([a, b]) => Math.hypot(x - a, z - b) < 3.6 + r) || Math.hypot(x - WRECK_AT.x, z - WRECK_AT.z) < 8.5 + r || Math.hypot(x - PISTOL_AT.x, z - PISTOL_AT.z) < 2.5 + r || FALLEN.some(([a, b, t]) => { for (let k = 0.5; k < 5.5; k += 1) if (Math.hypot(x - (a + Math.cos(t) * k * 1.1), z - (b - Math.sin(t) * k * 1.1)) < 1 + r) return true; return false; });

export async function loadHome() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/home.glb');
  // the redesigned flora and rock (art/build_flora.py): the same node names and scale, so only the geometry is swapped
  try {
    const fl = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/flora.glb');
    for (const name of ['Spire', 'SpireTip', 'Stalk', 'StalkBulb', 'Rock']) {
      const src = fl.scene.getObjectByName(name), dst = gltf.scene.getObjectByName(name);
      if (src && src.geometry && dst) dst.geometry = src.geometry;
    }
  } catch (e) { /* the original flora stays */ }
  try {
    const vl = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/valley_life.glb');
    const life = {}; vl.scene.traverse((o) => { if (o.isMesh) life[o.name] = o; });
    gltf.scene.userData.life = life;
  } catch (e) { /* the valley keeps its older plants */ }
  try {
    const st = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/settlement.glb');
    st.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    gltf.scene.userData.settlement = st.scene;
  } catch (e) { /* no settlement */ }
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
    { const load = (n, srgb) => { const t = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'textures/' + n + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(16, 16); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
      ground.material.normalMap = load('aerial_rocks_02_n'); ground.material.normalScale = new THREE.Vector2(1.1, 1.1); ground.material.roughness = 0.92; ground.material.needsUpdate = true; }
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
    this.colliders = []; this.collidersIntact = []; this.collidersRuin = [];   // circles, local to the homeworld: what you bump into when walking here
    const smallV = document.body.classList.contains('touch');
    const NS = smallV ? 26 : 40, spires = mk(node('Spire').geometry, spireMat, NS), tips = mk(node('SpireTip').geometry, this.tipMat, NS);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0, k = 0; k < NS && i < 400; i++) {
      const a = R() * Math.PI * 2, d = 9 + R() * 50, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (path(x, z) || Math.hypot(x - ELDER_AT.x, z - ELDER_AT.z) < 4 || keepClear(x, z)) continue;
      const s = 0.9 + R() * 1.4;
      this.colliders.push({ x, z, r: bodyRadius(node('Spire').geometry) * s });
      e.set((R() - 0.5) * 0.12, R() * 6.28, (R() - 0.5) * 0.12); q.setFromEuler(e);
      m4.compose(v.set(x, 0, z), q, sc.set(s, s, s)); spires.setMatrixAt(k, m4); tips.setMatrixAt(k, m4); k++;
    }
    const stalkGeo = node('Stalk').geometry, bulbGeo = node('StalkBulb').geometry;
    const NK = 700, stalks = mk(stalkGeo, spireMat, NK), bulbs = mk(bulbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.5, 0.5) }), NK);
    const col = new THREE.Color();
    const small = document.body.classList.contains('touch');            // phones get half the undergrowth
    let stalkN = 0;
    for (let c = 0, k = 0; c < (small ? 26 : 60) && k < NK; c++) {
      const a = R() * Math.PI * 2, d = 4 + R() * 38, cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      for (let j = 0; j < 7 && k < NK; j++) {
        const x = cx + (R() - 0.5) * 2.2, z = cz + (R() - 0.5) * 2.2;
        if ((path(x, z) && R() < 0.8) || keepClear(x, z)) continue;
        const s = 0.7 + R() * 1.3;
        e.set((R() - 0.5) * 0.25, R() * 6.28, (R() - 0.5) * 0.25); q.setFromEuler(e);
        m4.compose(v.set(x, 0, z), q, sc.set(s, s, s)); stalks.setMatrixAt(k, m4); bulbs.setMatrixAt(k, m4);
        bulbs.setColorAt(k, col.set(R() < 0.65 ? S.hex(0x9affea) : S.hex(0xd9a8ff))); k++; stalkN = k;
      }
    }
    stalks.count = bulbs.count = stalkN;
    addWind(spireMat, 0.0035); addWind(this.tipMat, 0.0035); addWind(bulbs.material, 0.07);
    this.lifePending = () => { this.life = new HomeLife(this.group, asset.userData.life, (x, z, r) => path(x, z) || Math.hypot(x - ELDER_AT.x, z - ELDER_AT.z) < 4 + r || keepClear(x, z, r) || this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r), this.colliders, [spireMat]); };
    const rockMat = new THREE.MeshStandardMaterial({ color: S.hex(0x27363e), roughness: 0.95, emissive: S.hex(0x06141a), emissiveIntensity: 0.8 });
    const rocks = mk(node('Rock').geometry, rockMat, 20);
    for (let i = 0; i < 20; i++) {
      const a = R() * Math.PI * 2, d = 6 + R() * 45, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const s = 0.8 + R() * 2.2; e.set(0, R() * 6.28, 0); q.setFromEuler(e);
      let rx = path(x, z) ? x + 6 : x, rz = z;
      for (let tries = 0; tries < 8 && keepClear(rx, rz, 0.6 * s); tries++) { rx += 5; rz += 3; }      // never in a house, the wreck or the sidearm
      m4.compose(v.set(rx, 0, rz), q, sc.set(s, s * (0.6 + R() * 0.6), s)); rocks.setMatrixAt(i, m4);
      this.colliders.push({ x: rx, z: rz, r: bodyRadius(node('Rock').geometry, 0.2) * s });
    }
    this.flora = [spires, tips, stalks, bulbs, rocks];
    this.lifePending();

    // ---- drifting spores and low mist: the air feels alive
    const NP = 260, pp = new Float32Array(NP * 3);
    for (let i = 0; i < NP; i++) { pp[i * 3] = (R() - 0.5) * 50; pp[i * 3 + 1] = 0.3 + R() * 5; pp[i * 3 + 2] = (R() - 0.5) * 50 - 4; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.spores = new THREE.Points(pg, new THREE.PointsMaterial({ color: S.hex(0xbfffe8), size: 0.13, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })() }));
    this.spores.frustumCulled = false; this.group.add(this.spores); this.sporeBase = pp.slice();
    const mistTex = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(150,255,230,0.35)'); gr.addColorStop(1, 'rgba(150,255,230,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const mistMat = new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const [x, z, sz] of [[-6, -2, 9], [6, -8, 11], [-2, -14, 12], [0, 3, 8], [11, -2, 9], [-12, -9, 10]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz).rotateX(-Math.PI / 2), mistMat); m.position.set(x, 0.35, z); this.group.add(m); }

    // ---- the one who waits
    const gel = makeSkin({ ...skinParams(def, 'body'), pattern: 'none' });
    const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.skin.glow).lerp(new THREE.Color(0xffffff), 0.7), transparent: true, opacity: 0.92 });
    const swap = (o) => { o.traverse((m) => { if (m.isMesh) { const nm = (m.material && m.material.name) || ''; m.material = nm === 'GelCore' ? core : gel; m.frustumCulled = false; } }); return o; };
    if (kit && kit.geos && kit.hand) {
      // an elder of the player's own kind: the same body, skin, legs, arm and hand, with small differences of age
      const E = buildElder(scene, kit.geos, kit.hand);
      this.elderKit = E; this.elder = E.anchor; this.elderArm = E.arm; this.elderArmL = E.armL; this.elderTip = E.tipLocal; this.elderNew = true;
      this.elderBody = E.ab.group; this.elderCore = { opacity: 0 };
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
    this.buildSettlement(asset && asset.userData && asset.userData.settlement, S);

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
    // ---- fires for the attack and its aftermath: a fixed pool of flickering flames, each with its own light (the count never changes)
    this.fires = [];
    const scorch = canvasTex(128, 128, (g, w, hh) => { const gr = g.createRadialGradient(w / 2, hh / 2, 4, w / 2, hh / 2, w / 2); gr.addColorStop(0, 'rgba(8,4,2,0.92)'); gr.addColorStop(0.55, 'rgba(18,8,4,0.6)'); gr.addColorStop(1, 'rgba(18,8,4,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, hh); });
    { const ft = canvasTex(64, 64, (g, w, hh) => { const gr = g.createRadialGradient(w / 2, hh * 0.6, 2, w / 2, hh * 0.55, w / 2); gr.addColorStop(0, 'rgba(255,240,170,1)'); gr.addColorStop(0.35, 'rgba(255,140,40,0.8)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, hh); });
      for (let i = 0; i < 7; i++) {
        const spr = [0, 1, 2].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); s.visible = false; this.group.add(s); return s; });
        const light = new THREE.PointLight(0xff7a2a, 0, 14, 2); light.userData.fire = true; this.group.add(light);
        const decal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: scorch, transparent: true, depthWrite: false, fog: true }));
        decal.visible = false; decal.renderOrder = 1; this.group.add(decal);
        this.fires.push({ spr, light, decal, on: false, x: 0, z: 0, s: 1, ph: Math.random() * 6, t0: 0 });
      } }
    this.ship = new THREE.Group();
    const hull = new THREE.MeshStandardMaterial({ color: 0x1c2228, roughness: 0.55, metalness: 0.7 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), hull); body.scale.set(34, 3.5, 9); this.ship.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(26, 2.4, 5), hull); top.position.y = 3; this.ship.add(top);
    for (const x of [-30, 30]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: x < 0 ? 0xff3322 : 0xffffff })); l.position.set(x, 0, 0); this.ship.add(l); }
    for (let i = -3; i <= 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 0.9), new THREE.MeshBasicMaterial({ color: 0xffb040 })); l.position.set(i * 7, -3.1, 0); this.ship.add(l); }
    {  // the attacker is the same authored warship that later leaves orbit in the flight scene (scaled to about 90 m here)
      const wm = cloneWarship();
      if (wm) {
        for (const c of this.ship.children) c.visible = false;
        wm.rotation.y = -Math.PI / 2; wm.scale.setScalar(0.3); this.ship.add(wm);                 // it travels toward +X, nose first
        const eng = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(64, 64, (gg, w, hh) => { const gr = gg.createRadialGradient(w / 2, hh / 2, 1, w / 2, hh / 2, w / 2); gr.addColorStop(0, 'rgba(160,230,255,1)'); gr.addColorStop(1, 'rgba(160,230,255,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, w, hh); }), color: 0x8fe0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
        eng.position.set(-54, 0.6, 0); eng.scale.setScalar(30); this.ship.add(eng);
      }
    }
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
  dispose() { if (this.elderKit) this.elderKit.ab.dispose(this.scene); this.scene.remove(this.group, this.hemi, this.sun, this.sky, this.spot, this.spot.target, this.cone); }

  show(v) {
    const s = this.scene;
    if (v && !this.shown) { this.saved = { bg: s.background, fog: s.fog }; s.background = this.bg; s.fog = this.fog; }
    if (!v && this.shown) { s.background = this.saved.bg; s.fog = this.saved.fog; }
    this.shown = v;
    if (this.elderKit) this.elderKit.ab.setVisible(v);
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
    if (!this.elderNew) this.elderBody.scale.set(1 / Math.sqrt(br), br, 1 / Math.sqrt(br));
    if (!this.elderNew) {
      this.elderBody.rotation.z = Math.sin(E.breath * 0.6) * 0.012 - E.fear * 0.12;
      this.elderBody.rotation.x = -E.fear * 0.18;                       // flinches back when the shadow comes
    } else { this.elderKit.visible = this.shown; stepElder(this.elderKit, dt, E); }
    el.position.y = 0;
    // arm: hangs, then rises to offer an open palm as the player nears
    const r = E.reach;
    this.elderArm.rotation.x = -(1 - r) * 1.15 + Math.sin(E.breath * 1.4 + 1) * 0.015 - E.fear * 0.5;
    this.elderArm.rotation.y = (1 - r) * -0.25;
    if (this.elderNew) {
      this.elderArm.position.y = this.elderKit.armBaseY + Math.sin(E.breath * 1.4) * 0.01;
      this.elderArmL.rotation.x = -1.3 + Math.sin(E.breath * 1.1) * 0.03 - E.fear * 0.35;
      this.elderArmL.rotation.z = 0.1;
    } else this.elderArm.position.y = 1.78 + Math.sin(E.breath * 1.4) * 0.01;
    if (!this.elderNew) this.elderCore.opacity = 0.7 + 0.2 * Math.sin(E.breath * 1.8) + E.pulse * 0.3;
    E.pulse = Math.max(0, E.pulse - dt * 1.4);
    return dist;
  }

  palmWorld(out) {
    this.elder.updateMatrixWorld(true);
    return this.elderArm.localToWorld(this.elderTip ? out.copy(this.elderTip) : out.set(0, 0.04, -0.98));
  }

  // The settlement: dome houses around the hollow, and the same place after the attack (broken houses, felled spires, craters, rubble).
  buildSettlement(src, S) {
    this.settleIntact = new THREE.Group(); this.settleRuin = new THREE.Group();
    this.group.add(this.settleIntact, this.settleRuin); this.settleRuin.visible = false;
    if (!src) return;
    const hx = (c) => (S ? S.hex(c) : c);
    const mats = {
      Moss: new THREE.MeshStandardMaterial({ color: hx(0x1a4a46), roughness: 0.55, emissive: hx(0x04201e), emissiveIntensity: 0.9 }),
      Rock: new THREE.MeshStandardMaterial({ color: hx(0x2a343c), roughness: 0.9 }),
      Char: new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.95 }),
      Glow: new THREE.MeshBasicMaterial({ color: hx(0x9affea) }),
    };
    const part = (name) => { const o = src.getObjectByName(name); if (!o || !o.isMesh) return null; const m = new THREE.Mesh(o.geometry, mats[(o.material && o.material.name) || 'Moss'] || mats.Moss); m.frustumCulled = false; return m; };
    const face = (x, z) => Math.atan2(-(1.2 - x), -(-9.5 - z));            // doors face the hollow where the elder waits
    for (const [x, z] of HOUSES) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = face(x, z); g.scale.setScalar(0.9 + ((x * 7 + z * 3) % 5) * 0.04);
      for (const n of ['Dwelling', 'DwellingRibs', 'DwellingBase', 'DwellingGlow']) { const m = part(n); if (m) g.add(m); }
      this.settleIntact.add(g);
      this.collidersIntact.push({ x, z, r: bodyRadius(part('Dwelling').geometry) * g.scale.x });
      const r = new THREE.Group(); r.position.set(x, 0, z); r.rotation.y = face(x, z) + 0.5; r.scale.copy(g.scale);
      for (const n of ['DwellingRuin', 'RuinRubble']) { const m = part(n); if (m) r.add(m); }
      this.settleRuin.add(r);
      this.collidersRuin.push({ x, z, r: 2.6 * g.scale.x });
    }
    for (const [x, z, a] of FALLEN) {
      const m = part('FallenSpire'); if (!m) continue; m.position.set(x, 0, z); m.rotation.y = a; m.scale.setScalar(1.1); this.settleRuin.add(m);
      for (let k = 0.3; k < 5.4; k += 0.75) this.collidersRuin.push({ x: x + Math.cos(a) * k * 1.1, z: z - Math.sin(a) * k * 1.1, r: 0.42 - 0.05 * k });
    }
    for (const [x, z, s] of [[-4, -3, 1.0], [8, -6, 0.9], [-12, -11, 1.1], [2, -14, 0.9], [-6, -24, 0.8], [-14, -17, 1.0], [5, -22, 0.9]]) {
      const m = part('Crater'); if (!m) continue; m.position.set(x, 0.02, z); m.scale.setScalar(s * 1.3); this.settleRuin.add(m);
    }
    let sd = 99; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const rub = part('Rubble');
    if (rub) {                                                            // one draw call for all of it
      const inst = new THREE.InstancedMesh(rub.geometry, rub.material, 70), dummy = new THREE.Object3D();
      for (let i = 0; i < 70; i++) {
        const a = rr() * 6.28, d = 3 + rr() * 24;
        dummy.position.set(Math.cos(a) * d, 0, -9 + Math.sin(a) * d); dummy.rotation.set(0, rr() * 6.28, 0); dummy.scale.setScalar(0.5 + rr() * 1.1); dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.frustumCulled = false; this.settleRuin.add(inst);
    }
  }
  // Slide a walker out of whatever stands here. Circles, so nothing snags, and they follow the state of the settlement.
  pushOut(pos, radius = 0.4, extra = null) {
    let x = pos.x - HOME.x, z = pos.z - HOME.z;
    const ring = (list) => { for (const c of list) { const dx = x - c.x, dz = z - c.z, R = c.r + radius, d2 = dx * dx + dz * dz; if (d2 >= R * R) continue; const d = Math.sqrt(d2) || 1e-4; x = c.x + (dx / d) * R; z = c.z + (dz / d) * R; } };
    for (let it = 0; it < 2; it++) { ring(this.colliders); ring(this.ruined ? this.collidersRuin : this.collidersIntact); if (extra) ring(extra); }
    pos.x = HOME.x + x; pos.z = HOME.z + z;
  }
  setRuined(r) { this.ruined = !!r; this.life.setRuined(r); if (this.settleIntact) { this.settleIntact.visible = !r; this.settleRuin.visible = !!r; } }

  // Light a fire at a local position; the pool recycles the oldest.
  addFire(x, z, s = 1) {
    const f = this.fires.find((q) => !q.on) || this.fires.reduce((a, b) => (a.t0 < b.t0 ? a : b));
    f.on = true; f.x = x; f.z = z; f.s = s; f.t0 = performance.now();
    f.light.position.set(x, 1.4 * s, z); f.spr.forEach((p) => { p.visible = true; p.position.set(x, 0.9 * s, z); });
    f.decal.visible = true; f.decal.position.set(x, 0.045 + 0.003 * this.fires.indexOf(f), z); f.decal.scale.setScalar(5.2 * s); f.decal.rotation.y = Math.random() * 6;
    return f;
  }
  clearFires() { for (const f of this.fires) { f.on = false; f.light.intensity = 0; f.spr.forEach((p) => { p.visible = false; }); f.decal.visible = false; } }

  update(dt, t, camPos) {
    if (!this.shown) return;
    this.life.update(dt, camPos.x - HOME.x, camPos.z - HOME.z, this.colliders);
    for (const f of this.fires) {
      if (!f.on) continue;
      const fl = 0.75 + 0.25 * Math.sin(t * 13 + f.ph) + 0.15 * Math.sin(t * 31 + f.ph * 2);
      f.light.intensity = 26 * f.s * fl;
      f.spr.forEach((p, i) => { const k = (0.8 + i * 0.5) * f.s * (1.5 + 0.35 * Math.sin(t * (9 + i * 4) + f.ph + i)); p.scale.set(k * 0.9, k * 1.5, 1); p.position.y = (0.7 + i * 0.5) * f.s * fl; p.material.opacity = 0.9 - i * 0.22; });
    }
    this.sky.position.copy(camPos);
    { const a = this.spores.geometry.attributes.position, b = this.sporeBase; for (let i = 0; i < a.count; i++) { a.array[i * 3] = b[i * 3] + Math.sin(t * 0.3 + i) * 0.6; a.array[i * 3 + 1] = b[i * 3 + 1] + ((t * 0.12 + i * 0.37) % 1) * 0.8 + Math.sin(t * 0.7 + i * 2) * 0.15; a.array[i * 3 + 2] = b[i * 3 + 2] + Math.cos(t * 0.25 + i) * 0.6; } a.needsUpdate = true; }
    this.tipMat.color.setScalar(0.8 + 0.2 * Math.sin(t * 1.3)).multiply(this.tipBase).addScalar(0.15);
  }
}
