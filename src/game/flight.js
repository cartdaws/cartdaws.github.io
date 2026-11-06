import { WORLDS } from '../world/surface.js';
import { PARTS } from './campaign.js';
import * as THREE from 'three';
import { clamp, damp, lerp, smooth, seg } from '../core/util.js';
import { FlightCombat } from './flightCombat.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// FREE FLIGHT. After the humans burn the homeworld, the survivor takes the human lander and flies it out of orbit, across open space, to the research
// vessel where the humans keep their captives. Everything here lives in its own group far from the facility; entering swaps the sky and fog, leaving
// restores them. Units are metres. The vessel is about a kilometre long.
const OFFSET = new THREE.Vector3(8000, 0, 0);       // the space group sits well away from the facility and the homeworld
const VESSEL = new THREE.Vector3(700, 120, -5600);  // the research vessel, relative to the start
const BAY = new THREE.Vector3(700, 72, -5862);      // the docking bay mouth in the underside of the bow (relative to the start)
const DOCK = new THREE.Vector3(700, 40, -5700);     // the approach point under the hull: fly through here, slowly, to be drawn in
const CROSSING = new THREE.Vector3(-900, 1500, -8200);   // beyond the Halcyon, where the fleet's burn starts
const _wp = new THREE.Vector3();
const PLANET = new THREE.Vector3(-300, -1500, 900); // the homeworld, below and behind the launch point

const _m4 = new THREE.Matrix4();
const q = new THREE.Quaternion(), e = new THREE.Euler(), _v = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();

const _glowCache = new Map();
function glowTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  if (_glowCache.has(inner + outer)) return _glowCache.get(inner + outer);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; _glowCache.set(inner + outer, t); return t;
}

// The sky: a deep field with a Milky Way band and soft nebulae in the game's own teal and violet. Painted once on a canvas.
function skyTexture(small = false) {
  const W = 4096, H = 2048, k = small ? 0.5 : 1, c = document.createElement('canvas'); c.width = W * k; c.height = H * k;
  const g = c.getContext('2d'); g.scale(k, k);        // painted in the same coordinates at either size; a phone gets a quarter of the texture memory
  g.fillStyle = '#03050c'; g.fillRect(0, 0, W, H);
  let sd = 4242; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  g.globalCompositeOperation = 'lighter';
  // the galactic band: a tilted ribbon of faint light with dust lanes
  for (let i = 0; i < 700; i++) {
    const x = R() * W, band = H * 0.5 + Math.sin(x / W * 6.283 * 1.0 + 0.6) * H * 0.16 + (R() - 0.5) * H * 0.22 * (0.4 + R());
    const r = 80 + R() * 300, a = 0.008 + R() * 0.018;
    for (const dx of [-W, 0, W]) { const gr = g.createRadialGradient(x + dx, band, 0, x + dx, band, r); gr.addColorStop(0, `rgba(150,170,220,${a})`); gr.addColorStop(1, 'rgba(150,170,220,0)'); g.fillStyle = gr; g.fillRect(x + dx - r, band - r, r * 2, r * 2); }
  }
  // coloured nebulae
  const cols = [[40, 170, 160], [120, 80, 200], [60, 120, 210], [190, 80, 170], [30, 140, 120]];
  for (let n = 0; n < 9; n++) {
    const cx = R() * W, cy = H * (0.2 + R() * 0.6), col = cols[n % cols.length];
    for (let i = 0; i < 46; i++) {
      const x = cx + (R() - 0.5) * 760, y = cy + (R() - 0.5) * 380, r = 100 + R() * 260, a = 0.006 + R() * 0.016;
      for (const dx of [-W, 0, W]) { const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, r); gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`); gr.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`); g.fillStyle = gr; g.fillRect(x + dx - r, y - r, r * 2, r * 2); }
    }
  }
  // a fine dusting of faint far stars in the band
  for (let i = 0; i < 11000; i++) { const x = R() * W, band = H * 0.5 + Math.sin(x / W * 6.283 + 0.6) * H * 0.16, y = band + (R() - 0.5) * H * 0.34 * (R() + 0.2); g.fillStyle = `rgba(210,225,255,${0.12 + R() * 0.3})`; g.fillRect(x, y, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function bandTexture(stops, bands = 40, seed = 3) {
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); let sd = seed; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < H; y++) { const k = (Math.sin(y / H * bands + R() * 0.05) * 0.5 + 0.5), i = Math.min(stops.length - 1, Math.floor(k * stops.length)); g.fillStyle = stops[i]; g.fillRect(0, y, W, 1); }
  for (let i = 0; i < 70; i++) { const x = R() * W, y = R() * H, r = 6 + R() * 26; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
function craterTexture() {
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.fillStyle = '#6a6470'; g.fillRect(0, 0, W, H); let sd = 9; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 160; i++) { const x = R() * W, y = R() * H, r = 3 + R() * 22; const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r); gr.addColorStop(0, 'rgba(40,36,48,0.55)'); gr.addColorStop(0.85, 'rgba(40,36,48,0.2)'); gr.addColorStop(1, 'rgba(200,196,210,0.18)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// The homeworld seen from orbit: oceans and violet continents, a thin atmosphere. Canvas painted, seamless enough at this distance.
function planetTexture() {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0b3b4a'; g.fillRect(0, 0, W, H);
  let s = 77; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {
    const x = R() * W, y = H * 0.12 + R() * H * 0.76, r = 18 + R() * 70;
    for (const dx of [-W, 0, W]) { const gr = g.createRadialGradient(x + dx, y, 2, x + dx, y, r); gr.addColorStop(0, i % 3 ? 'rgba(104,70,160,0.95)' : 'rgba(40,150,130,0.9)'); gr.addColorStop(1, 'rgba(10,60,70,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x + dx, y, r, r * 0.6, R() * 3, 0, 6.3); g.fill(); }
  }
  for (let i = 0; i < 70; i++) { const x = R() * W, y = R() * H, r = 30 + R() * 90; const gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, 'rgba(210,235,245,0.22)'); gr.addColorStop(1, 'rgba(210,235,245,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  for (const top of [true, false]) { const gr = g.createLinearGradient(0, top ? 0 : H, 0, top ? H * 0.16 : H * 0.84); gr.addColorStop(0, 'rgba(205,235,240,1)'); gr.addColorStop(1, 'rgba(205,235,240,0)'); g.fillStyle = gr; g.fillRect(0, top ? 0 : H * 0.84, W, H * 0.16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}

// The human lander: used both as the wreck on the planet and as the player's ship in flight. Length about 7 m, nose along -Z.
// The authored lander (art/build_lander.py -> public/models/lander.glb). Nose along -Z. If the model is unavailable the procedural stand-in below is used.
let LANDER = null;
export async function loadLander() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/lander.glb');
  LANDER = gltf.scene;
  LANDER.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
}
// A copy of the authored warship for other scenes (the attack on the homeworld), so the ship in the cutscene is the very ship you see leaving orbit.
export function cloneWarship() { return WARSHIP_ASSET ? WARSHIP_ASSET.clone(true) : null; }
function landerFromAsset() {
  const g = new THREE.Group();
  const model = LANDER.clone(true); g.add(model);
  g.userData.screens = []; g.userData.gear = []; g.userData.engines = [];
  const exhausts = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material && !o.name.startsWith('Screen')) o.material = o.material.clone();
    if (/^Screen/.test(o.name)) { const c = o.material.emissive ? o.material.emissive.clone() : new THREE.Color(0x6fe8ff); o.material = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35 }); g.userData.screens.push(o); }
    if (/^Gear/.test(o.name)) g.userData.gear.push(o);
    if (/Exhaust/.test(o.name)) exhausts.push(o);
  });
  // the canopy hinges open at its rear edge so the pilot can climb in (the boarding scene drives g.userData.canopyPivot.rotation.x)
  { const nodes = []; model.traverse((o) => { if (o.isMesh && (o.name === 'Canopy' || o.name === 'CanopySpine')) nodes.push(o); });
    if (nodes.length) { const pivot = new THREE.Group(); pivot.position.set(0, 0.55, 0.05); model.add(pivot); for (const n of nodes) { pivot.add(n); n.position.set(0, -0.55, -0.05); } g.userData.canopyPivot = pivot; } }
  // the engine glow: a soft additive flare on each exhaust, the same device the placeholder used
  for (const e of exhausts) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(150,230,255,1)'), color: 0x8fe8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(e.position).add(new THREE.Vector3(0, 0, 0.35)); s.scale.setScalar(1.6); g.add(s); g.userData.engines.push(s);
  }
  return g;
}
export function makeLander() {
  if (LANDER) return landerFromAsset();
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x8d979c, roughness: 0.55, metalness: 0.65 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 0.7, metalness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: 0.6, metalness: 0.3, emissive: 0x3a2a00 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x6fd9e8, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.65, emissive: 0x0a3a44 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.2, 0.95, 5.2, 8).rotateX(-Math.PI / 2), hull, 0, 0, -0.6);                  // fuselage, tapering to the nose
  add(new THREE.BoxGeometry(1.7, 0.9, 2.4), hull, 0, 0.05, 1.7);                                                   // engine block
  add(new THREE.SphereGeometry(0.62, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.4, -1.1).scale.set(1, 0.8, 1.7); // canopy
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(3.2, 0.14, 1.8), hull, sx * 2.2, -0.05, 0.9, 0, sx * -0.25, sx * 0.08);            // swept wing
    add(new THREE.BoxGeometry(0.16, 0.9, 1.0), dark, sx * 3.7, 0.25, 1.4);                                          // wingtip fin
    add(new THREE.BoxGeometry(0.5, 0.3, 1.6), dark, sx * 0.9, -0.3, 1.6);                                           // nacelle
    add(new THREE.BoxGeometry(0.1, 0.06, 1.3), trim, sx * 2.0, 0.04, 0.5);                                          // trim stripe
  }
  add(new THREE.BoxGeometry(0.12, 1.1, 1.4), dark, 0, 0.85, 2.0);                                                    // tail fin
  // the cockpit: seen from inside when boarding; a console with softly glowing screens, a seat and a yoke
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x6fe8ff, transparent: true, opacity: 0.35 });
  g.userData.screens = [];
  const con = add(new THREE.BoxGeometry(1.2, 0.34, 0.7), dark, 0, 0.18, -1.55); con.rotation.x = -0.35;
  for (const [sx, w] of [[-0.36, 0.36], [0, 0.4], [0.38, 0.3]]) { const sc = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.2), screenMat.clone()); sc.position.set(sx, 0.36, -1.5); sc.rotation.x = -0.35 - Math.PI * 0.0; g.add(sc); g.userData.screens.push(sc); }
  add(new THREE.BoxGeometry(0.6, 0.18, 0.5), dark, 0, -0.1, -0.3);                                                  // seat
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), dark, 0, 0.12, -1.1);                                         // yoke
  g.userData.engines = [-0.9, 0.9].map((x) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(150,230,255,1)'), color: 0x8fe8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.position.set(x, -0.1, 2.9); s.scale.setScalar(1.6); g.add(s); return s; });
  return g;
}

// The research vessel: a long spine, a rotating habitat ring, lit decks, antennae, and a brightly lit bay mouth on the underside of the bow.
// The authored research vessel (art/build_vessel.py -> public/models/vessel.glb): fused hull, a separate spinning ring, lit windows, engines.
let WARSHIP_ASSET = null;
export async function loadWarship() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/warship.glb');
  WARSHIP_ASSET = gltf.scene; WARSHIP_ASSET.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
}
let VESSEL_ASSET = null;
export async function loadVessel() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/vessel.glb');
  VESSEL_ASSET = gltf.scene;
  VESSEL_ASSET.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
}
function vesselFromAsset() {
  const g = new THREE.Group(); const m = VESSEL_ASSET.clone(true); g.add(m);
  g.userData.ring = m.getObjectByName('Ring');
  // the lit bay mouth set into the recess under the bow, with its glow and the approach lights leading in
  const bay = new THREE.Mesh(new THREE.PlaneGeometry(92, 54), new THREE.MeshBasicMaterial({ color: 0x9fcde8, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
  bay.position.set(0, -47, -262); bay.rotation.x = Math.PI / 2; g.add(bay); g.userData.bay = bay;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(190,235,255,1)'), color: 0xaadfff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.position.set(0, -62, -262); glow.scale.setScalar(110); glow.material.opacity = 0.45; g.add(glow);
  g.userData.lights = [];
  for (let i = 1; i <= 12; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,200,90,1)'), color: 0xffc05a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.position.set(0, -60, -262 + i * 24); sp.scale.setScalar(14); g.add(sp); g.userData.lights.push(sp);
  }
  return g;
}
function makeVessel() {
  if (VESSEL_ASSET) return vesselFromAsset();
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x9aa4a8, roughness: 0.6, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x353d42, roughness: 0.7, metalness: 0.5 });
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#10161a'; x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 90; i++) { x.fillStyle = Math.random() < 0.8 ? '#ffd88a' : '#9fe8ff'; x.fillRect((i * 29) % 256, 4 + ((i * 17) % 7) * 8, 6, 3); }
  const lit = new THREE.CanvasTexture(c); lit.colorSpace = THREE.SRGBColorSpace; lit.wrapS = lit.wrapT = THREE.RepeatWrapping; lit.repeat.set(6, 2);
  const win = new THREE.MeshStandardMaterial({ color: 0x222a2f, roughness: 0.6, metalness: 0.4, emissive: 0xffffff, emissiveMap: lit, emissiveIntensity: 1.1 });
  const add = (geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  add(new THREE.CylinderGeometry(34, 46, 700, 12).rotateX(Math.PI / 2), win, 0, 0, 0);                                // main spine (lit decks)
  add(new THREE.CylinderGeometry(20, 34, 120, 12).rotateX(-Math.PI / 2), hull, 0, 0, -400);                          // bow
  add(new THREE.BoxGeometry(150, 24, 220), hull, 0, -30, -280);                                                       // bay housing
  const ring = add(new THREE.TorusGeometry(130, 14, 10, 48), win, 0, 0, 80); ring.userData.spin = true; g.userData.ring = ring;
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; add(new THREE.BoxGeometry(6, 130, 6), dark, Math.sin(a) * 0, 0, 80, 0, 0, a); }
  add(new THREE.BoxGeometry(240, 6, 90), dark, 0, 60, 280);                                                           // radiator wings
  add(new THREE.CylinderGeometry(1.5, 1.5, 200, 6), dark, 0, 140, 120);                                               // antenna mast
  add(new THREE.CylinderGeometry(30, 52, 60, 12).rotateX(Math.PI / 2), dark, 0, 0, 380);                              // engine bells
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(18, 70, 18), dark, sx * 60, 0, 330);
  // the bay: a glowing rectangle in the underside of the bow, with approach lights
  const bay = new THREE.Mesh(new THREE.PlaneGeometry(90, 50), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
  bay.position.set(0, -42, -280); bay.rotation.x = Math.PI / 2; g.add(bay); g.userData.bay = bay;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(190,235,255,1)'), color: 0xaadfff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.position.set(0, -60, -280); glow.scale.setScalar(260); g.add(glow);
  // approach lights leading to the bay
  g.userData.lights = [];
  for (let i = 1; i <= 12; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,200,90,1)'), color: 0xffc05a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.set(0, -52, -280 + i * 24); s.scale.setScalar(14); g.add(s); g.userData.lights.push(s);
  }
  return g;
}

// A rocky or icy world seen from orbit, painted to match what you find on the ground.
function worldTexture(base, patches, polar) {
  const c = document.createElement('canvas'); c.width = 768; c.height = 384; const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 768, 384);
  for (let i = 0; i < 300; i++) { const px = Math.random() * 768, py = Math.random() * 384, r = 4 + Math.random() * 52, col = patches[i % patches.length], g2 = x.createRadialGradient(px, py, 0, px, py, r); g2.addColorStop(0, col); g2.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g2; x.fillRect(px - r, py - r, r * 2, r * 2); }
  if (polar) { const g2 = x.createLinearGradient(0, 0, 0, 384); g2.addColorStop(0, polar); g2.addColorStop(0.16, 'rgba(0,0,0,0)'); g2.addColorStop(0.84, 'rgba(0,0,0,0)'); g2.addColorStop(1, polar); x.fillStyle = g2; x.fillRect(0, 0, 768, 384); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
// Where something solid is, as points on a grid: the surface of its triangles, sampled. Works on any model, so nothing is hand-guessed.
export function solidCells(root, cell, skip = null) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), out = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3(), m = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || o.material.blending === THREE.AdditiveBlending || o.material.transparent) return;
    for (let q = o; q && q !== root; q = q.parent) if (skip && skip(q)) return;
    m.multiplyMatrices(inv, o.matrixWorld); const P = o.geometry.attributes.position, I = o.geometry.index, n = I ? I.count : P.count;
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(P, I ? I.getX(i) : i).applyMatrix4(m); b.fromBufferAttribute(P, I ? I.getX(i + 1) : i + 1).applyMatrix4(m); c.fromBufferAttribute(P, I ? I.getX(i + 2) : i + 2).applyMatrix4(m);
      const long = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)), S = Math.min(30, Math.ceil(long / (cell * 0.7)));
      for (let u = 0; u <= S; u++) for (let v = 0; v <= S - u; v++) { const w = S ? u / S : 0, y = S ? v / S : 0, z = 1 - w - y; p.set(a.x * w + b.x * y + c.x * z, a.y * w + b.y * y + c.y * z, a.z * w + b.z * y + c.z * z); const k = Math.round(p.x / cell) + ',' + Math.round(p.y / cell) + ',' + Math.round(p.z / cell); if (!out.has(k)) out.set(k, [Math.round(p.x / cell) * cell, Math.round(p.y / cell) * cell, Math.round(p.z / cell) * cell]); }
    }
  });
  return [...out.values()];
}

export class Flight {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.group = new THREE.Group(); this.group.position.copy(OFFSET); this.group.visible = false;
    game.scene.add(this.group);

    // the sky sphere and the stars follow the camera so they never get closer
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(7600, 48, 24), new THREE.MeshBasicMaterial({ map: skyTexture(game.touchMode), side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, color: 0x8c96ac }));
    this.sky.frustumCulled = false; this.sky.rotation.set(0.4, 1.2, 0.2); this.sky.renderOrder = -10; this.group.add(this.sky);
    const N = game.touchMode ? 2200 : 4200, p = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), br = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, an = Math.random() * 6.283, r = Math.sqrt(1 - u * u), d = 7000;
      p[i * 3] = Math.cos(an) * r * d; p[i * 3 + 1] = u * d; p[i * 3 + 2] = Math.sin(an) * r * d;
      const tint = Math.random(), hot = Math.random() < 0.12;
      col[i * 3] = hot ? 1 : 0.72 + 0.28 * tint; col[i * 3 + 1] = hot ? 0.85 : 0.82 + 0.18 * (1 - tint); col[i * 3 + 2] = hot ? 0.7 : 1;
      const m = Math.pow(Math.random(), 4.5);                        // a few bright stars, many faint ones
      size[i] = 1.1 + m * 4.2; br[i] = 0.22 + m * 0.7;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3)); sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); sg.setAttribute('aBright', new THREE.BufferAttribute(br, 1));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: { value: game.renderer.getPixelRatio() }, uTime: { value: 0 } },
      vertexShader: 'attribute float aSize; attribute float aBright; attribute vec3 color; uniform float uScale; uniform float uTime; varying vec3 vC; varying float vB; void main(){ vC = color; vB = aBright * (0.88 + 0.12 * sin(uTime * 1.3 + position.x * 0.013 + position.z * 0.007)); gl_PointSize = aSize * uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vC; varying float vB; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2); gl_FragColor = vec4(vC * vB, a * vB); }',
    });
    this.stars = new THREE.Points(sg, this.starMat); this.stars.frustumCulled = false; this.group.add(this.stars);

    // drifting dust close to the ship: it streams past and gives the speed its feel
    const ND = 520; this.dustPos = new Float32Array(ND * 3);
    for (let i = 0; i < ND; i++) { this.dustPos[i * 3] = (Math.random() - 0.5) * 360; this.dustPos[i * 3 + 1] = (Math.random() - 0.5) * 360; this.dustPos[i * 3 + 2] = (Math.random() - 0.5) * 360; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ND * 3), 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xb8d8e8, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.33, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTex() }));
    this.dust.frustumCulled = false; this.group.add(this.dust);

    // a ringed gas giant far off, a cratered moon near the homeworld
    const gas = new THREE.Mesh(new THREE.SphereGeometry(520, 48, 32), new THREE.MeshStandardMaterial({ map: bandTexture(['#2a4660', '#375a74', '#5a8898', '#86aeb4', '#445c7a', '#58487a'], 20, 5), roughness: 0.9, emissive: 0x0a1624, emissiveIntensity: 0.5 }));
    gas.position.set(-3300, 700, -3000); gas.rotation.z = 0.35; this.group.add(gas);
    const rg = new THREE.RingGeometry(700, 1150, 96, 1), rp = rg.attributes.position, ruv = rg.attributes.uv;
    for (let i = 0; i < rp.count; i++) { const rr = Math.hypot(rp.getX(i), rp.getY(i)); ruv.setXY(i, (rr - 700) / 450, 0.5); }
    const rc = document.createElement('canvas'); rc.width = 256; rc.height = 4; { const x = rc.getContext('2d'); for (let i = 0; i < 256; i++) { const k = i / 255, a = (0.12 + 0.5 * Math.abs(Math.sin(k * 23)) * Math.abs(Math.sin(k * 7 + 1))) * Math.sin(k * 3.14); x.fillStyle = `rgba(200,225,235,${a})`; x.fillRect(i, 0, 1, 4); } }
    const ringMesh = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(rc), side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: 0.8 }));
    ringMesh.position.copy(gas.position); ringMesh.rotation.set(Math.PI / 2 - 0.3, 0, 0.35); this.group.add(ringMesh);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(110, 40, 28), new THREE.MeshStandardMaterial({ map: craterTexture(), roughness: 1, metalness: 0 }));
    moon.position.set(1100, -150, -900); this.group.add(moon); this.moon = moon;

    // an asteroid belt drifting beside the route: rough low-poly boulders, purely scenery
    const rockGeo = new THREE.IcosahedronGeometry(1, 1), rpos = rockGeo.attributes.position;
    for (let i = 0; i < rpos.count; i++) { const k = 0.72 + Math.random() * 0.5; rpos.setXYZ(i, rpos.getX(i) * k, rpos.getY(i) * k, rpos.getZ(i) * k); }
    rockGeo.computeVertexNormals();
    this.beltRocks = [];
    this.belt = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.95, metalness: 0.1, flatShading: true }), 340);
    { const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler();
      for (let i = 0; i < 340; i++) {
        const an = Math.random() * 6.283, rad = 500 + Math.random() * 700, sc = 3 + Math.pow(Math.random(), 3) * 60;
        const center = new THREE.Vector3(-1300, 200, -2600);
        const pos = new THREE.Vector3(Math.cos(an) * rad, (Math.random() - 0.5) * 140, Math.sin(an) * rad * 0.55).add(center);
        ee.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); qq.setFromEuler(ee);
        m4.compose(pos, qq, new THREE.Vector3(sc, sc * (0.6 + Math.random() * 0.6), sc)); this.belt.setMatrixAt(i, m4);
        this.beltRocks.push({ x: pos.x, y: pos.y, z: pos.z, r: sc * 0.92 });
      } }
    this.group.add(this.belt);

    // the homeworld, with a thin atmosphere and a night-side glow
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1200, 64, 40), new THREE.MeshStandardMaterial({ map: planetTexture(), roughness: 0.9, metalness: 0, emissive: 0x0a2a30, emissiveIntensity: 0.6 }));
    this.planet.position.copy(PLANET); this.group.add(this.planet);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(1245, 48, 32), new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.16, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    atm.position.copy(PLANET); this.group.add(atm);
    { const rg2 = new THREE.RingGeometry(1500, 2480, 128, 1), rp2 = rg2.attributes.position, ru2 = rg2.attributes.uv; for (let i = 0; i < rp2.count; i++) ru2.setXY(i, (Math.hypot(rp2.getX(i), rp2.getY(i)) - 1500) / 980, 0.5);
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 4; const x2 = cv.getContext('2d'); for (let i = 0; i < 256; i++) { const k = i / 255, band = 0.5 + 0.5 * Math.sin(k * 44 + Math.sin(k * 9) * 3); x2.fillStyle = `rgba(214,196,226,${(0.18 + 0.4 * band) * Math.sin(k * 3.14)})`; x2.fillRect(i, 0, 1, 4); }
      const tx2 = new THREE.CanvasTexture(cv); tx2.colorSpace = THREE.SRGBColorSpace;
      const homeRing = new THREE.Mesh(rg2, new THREE.MeshBasicMaterial({ map: tx2, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.7 })); homeRing.position.copy(PLANET); homeRing.rotation.set(Math.PI / 2 - 0.42, 0, 0.3); this.group.add(homeRing);
      this.ember = new THREE.Mesh(new THREE.SphereGeometry(46, 28, 20), new THREE.MeshStandardMaterial({ color: 0xd98a44, roughness: 0.95 })); this.ember.position.set(PLANET.x - 2000, PLANET.y + 1500, PLANET.z - 1200); this.group.add(this.ember); }
    // burning settlements on the night side: pinpricks of orange
    const fp = new Float32Array(60 * 3);
    for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, b = 0.2 + Math.random() * 1.0, r = 1203; fp[i * 3] = PLANET.x + Math.cos(a) * Math.sin(b) * r; fp[i * 3 + 1] = PLANET.y + Math.cos(b) * r; fp[i * 3 + 2] = PLANET.z + Math.sin(a) * Math.sin(b) * r; }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    this.fires = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xff7a2a, size: 8, sizeAttenuation: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(this.fires);

    this.sun = new THREE.DirectionalLight(0xfff0dd, 2.4); this.sun.position.set(2000, 1200, 800).add(OFFSET); this.sun.target.position.copy(OFFSET); this.sun.userData.keepOn = true;
    this.fill = new THREE.HemisphereLight(0x6f86b0, 0x10141c, 0.6);
    game.scene.add(this.sun, this.sun.target, this.fill); this.sun.visible = this.fill.visible = false;
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,244,220,1)'), color: 0xfff0d0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    sunGlow.position.set(2000, 1200, 800).multiplyScalar(2.2); sunGlow.scale.setScalar(1400); this.group.add(sunGlow);

    // the worlds you can land on: fly into any atmosphere
    const planet2 = (id, pos, r, tex2, atmCol) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshStandardMaterial({ map: tex2, roughness: 0.92, metalness: 0 })); m.position.copy(pos); m.rotation.y = Math.random() * 6; this.group.add(m);
      const a2 = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 36, 24), new THREE.MeshBasicMaterial({ color: atmCol, transparent: true, opacity: 0.17, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending })); a2.position.copy(pos); this.group.add(a2);
      return m;
    };
    const ochre = new THREE.Vector3(2600, 450, -3500), skarn = new THREE.Vector3(-1900, -350, -4700);       // near the star, hot; out by the giant, frozen
    planet2('ochre', ochre, 300, worldTexture('#b87840', ['rgba(226,170,106,.5)', 'rgba(120,70,40,.5)', 'rgba(90,50,30,.4)']), 0xffb070);
    planet2('skarn', skarn, 240, worldTexture('#b8d4e4', ['rgba(255,255,255,.55)', 'rgba(90,140,170,.45)', 'rgba(60,100,130,.3)'], 'rgba(255,255,255,.95)'), 0x9fe8ff);
    this.crossMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,210,150,1)'), color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); this.crossMark.position.copy(CROSSING); this.crossMark.visible = false; this.group.add(this.crossMark);
    this.worlds = [
      { id: 'vael', pos: moon.position.clone(), r: 110, land: 140 },
      { id: 'ochre', pos: ochre, r: 300, land: 345 },
      { id: 'skarn', pos: skarn, r: 240, land: 280 },
      { id: 'thule', pos: gas.position.clone(), r: 520, land: 570 },
      { id: 'ash', pos: PLANET.clone(), r: 1200, land: 1262 },
    ];

    // the research vessel
    this.vessel = makeVessel(); this.vessel.position.copy(VESSEL); this.group.add(this.vessel);
    // what you can hit of it, measured from its model. The ring turns, so it is handled as a ring.
    { const ring = this.vessel.userData.ring, skip = (q) => q === ring;
      this.hullCells = solidCells(this.vessel, 22, skip).map((c) => new THREE.Vector3(c[0], c[1], c[2]).add(VESSEL));
      this.ringInfo = null;
      if (ring) { ring.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(ring), s = bb.getSize(new THREE.Vector3()), c2 = bb.getCenter(new THREE.Vector3()).sub(OFFSET); this.ringInfo = { c: c2, R: Math.max(s.x, s.y) * 0.46, t: Math.max(10, Math.min(s.z, 26)) }; }
      // the way in stays open: a clear channel under the keel, along the line the approach and the bay share
      this.hullCells = this.hullCells.filter((c) => !(Math.abs(c.x - DOCK.x) < 46 && c.y < DOCK.y + 34));
      this.hullFar = 0; for (const c of this.hullCells) this.hullFar = Math.max(this.hullFar, c.distanceTo(VESSEL));
      if (this.ringInfo) this.hullFar = Math.max(this.hullFar, this.ringInfo.c.distanceTo(VESSEL) + this.ringInfo.R + this.ringInfo.t);
      this.hullFar += 60; }

    // the human warship that attacked the planet, leaving orbit with the survivors
    this.warship = new THREE.Group();
    { const hull = new THREE.MeshStandardMaterial({ color: 0x7c868c, roughness: 0.55, metalness: 0.6 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), hull); body.scale.set(150, 16, 40); this.warship.add(body);
      const top = new THREE.Mesh(new THREE.BoxGeometry(110, 10, 22), hull); top.position.y = 14; this.warship.add(top);
      for (let i = -3; i <= 3; i++) { const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,180,60,1)'), color: 0xffb040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); l.position.set(i * 30, -10, 0); l.scale.setScalar(10); this.warship.add(l); }
      const eng = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(150,220,255,1)'), color: 0x8fe0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); eng.position.set(150, 0, 0); eng.scale.setScalar(120); this.warship.add(eng); this.warshipGlow = eng; }
    this.warship.position.set(-500, -150, -200); this.group.add(this.warship);
    if (WARSHIP_ASSET) {                       // the authored warship replaces the stand-in shapes; its nose points along -X as it leaves orbit
      for (const c of this.warship.children) c.visible = false;
      const wm = WARSHIP_ASSET.clone(true); wm.rotation.y = Math.PI / 2; this.warship.add(wm);
      this.warshipGlow.visible = true; this.warshipGlow.position.set(172, 2, 0);
    }

    // wreckage of the attack: tumbling plates and spars around the launch path and the first stretch of the way
    const geoms = [new THREE.BoxGeometry(1, 0.15, 1), new THREE.BoxGeometry(0.2, 0.2, 1), new THREE.TetrahedronGeometry(0.7), new THREE.IcosahedronGeometry(0.6, 0)];
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x4b525a, roughness: 0.85, metalness: 0.4, flatShading: true });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x8d979c, roughness: 0.5, metalness: 0.7, flatShading: true });
    this.debris = [];
    for (let i = 0; i < 190; i++) {
      const gm = geoms[i % 4], m = new THREE.Mesh(gm, i % 3 ? rockMat : metalMat);
      const t = Math.pow(Math.random(), 1.6), z = -420 - t * 3300;
      const spread = 40 + t * 260, a = Math.random() * 6.28;
      m.position.set(Math.cos(a) * spread * Math.random() + t * 400, Math.sin(a) * spread * Math.random() * 0.7, z);
      const s = 2 + Math.random() * (i % 5 === 0 ? 40 : 9); m.scale.setScalar(s);
      m.userData = { r: s * 0.9, spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5) };
      this.group.add(m); this.debris.push(m);
    }

    // the player's ship
    this.ship = makeLander(); this.ship.scale.setScalar(1); this.group.add(this.ship);
    for (const n of this.ship.userData.gear || []) n.visible = false;      // the gear is up in flight
    this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.speed = 0; this.throttle = 0.5;
    this.yawRate = 0; this.pitchRate = 0; this.roll = 0; this.camPos = new THREE.Vector3(); this.camQuat = new THREE.Quaternion();
    this.shake = 0; this.t = 0; this.phase = 'off'; this.docking = null; this.hull = 100;
    this.speedLines = null; this.cine = new THREE.Camera(); this.qs = new THREE.Quaternion();

    // flight HUD
    const hud = document.createElement('div'); hud.id = 'flight-hud'; hud.className = 'hidden';
    hud.innerHTML = '<div class="fh-ret"></div><div class="fh-l"><b id="fh-spd">0</b><small>M/S</small><i><u id="fh-thr"></u></i><span id="fh-boost">BOOST</span></div><div class="fh-r"><small>RESEARCH VESSEL</small><b id="fh-dist">--</b><small>KM</small></div><div class="fh-hull"><u id="fh-hull"></u></div><div class="fh-keys"><span><kbd>MOUSE</kbd>STEER</span><span><kbd>W</kbd><kbd>S</kbd>THROTTLE</span><span><kbd>A</kbd><kbd>D</kbd>BANK</span><span><kbd>SHIFT</kbd>BOOST</span><span><kbd>SPACE</kbd>BRAKE</span><span><kbd>LMB</kbd>FIRE</span><span><kbd>RMB</kbd>BARBS</span></div>';
    document.body.appendChild(hud); this.hud = hud;
    const st = document.createElement('style');
    st.textContent = '#flight-hud{position:fixed;inset:0;pointer-events:none;z-index:6;font-family:inherit;color:rgba(168,235,226,.72)}#flight-hud.hidden{display:none}'
      + '.fh-ret{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border:1px solid rgba(168,235,226,.28);border-radius:50%}.fh-ret:after{content:"";position:absolute;left:50%;top:50%;width:3px;height:3px;margin:-1.5px;background:rgba(168,235,226,.7);border-radius:50%}'
      + '.fh-l{position:absolute;left:34px;bottom:34px;display:flex;flex-direction:column;gap:3px;opacity:.78}.fh-l b,.fh-r b{font-size:24px;font-weight:500;letter-spacing:.05em}.fh-l small,.fh-r small{font-size:10px;letter-spacing:.3em;opacity:.6}'
      + '.fh-l i{display:block;width:140px;height:3px;background:rgba(10,30,34,.25);border:1px solid rgba(168,235,226,.22)}.fh-l u{display:block;height:100%;width:50%;background:rgba(168,235,226,.7)}#fh-boost{font-size:10px;letter-spacing:.3em;opacity:.2}#fh-boost.on{opacity:.9;color:#ffd9a0}'
      + '.fh-r{position:absolute;right:34px;bottom:34px;text-align:right;display:flex;flex-direction:column;gap:2px;opacity:.78}.fh-hull{position:absolute;left:50%;bottom:22px;width:150px;margin-left:-75px;height:3px;background:rgba(10,30,34,.25);border:1px solid rgba(168,235,226,.2)}.fh-hull u{display:block;height:100%;background:rgba(122,255,196,.6)}'
      + '.fh-keys{position:absolute;left:50%;top:16px;transform:translateX(-50%);display:flex;gap:16px;padding:6px 14px;background:rgba(6,16,20,.16);border:1px solid rgba(168,235,226,.12);font-size:10px;letter-spacing:.2em;white-space:nowrap;opacity:.7}.fh-keys span{display:flex;align-items:center;gap:6px}.fh-keys kbd{font:inherit;padding:1px 5px;border:1px solid rgba(168,235,226,.32);background:rgba(168,235,226,.06);color:rgba(214,250,244,.9);letter-spacing:.1em}@media(max-width:700px){.fh-keys{flex-wrap:wrap;justify-content:center;gap:6px 10px;width:92vw;font-size:9px}}'
      + 'body.in-flight #subtitle{background:rgba(6,16,20,.22)!important;border-color:transparent!important;text-shadow:0 1px 6px rgba(0,0,0,.8)}body.in-flight #objective{opacity:.55}body.in-flight #hint{background:rgba(6,16,20,.2)!important;opacity:.8}';
    document.head.appendChild(st);
    // nebula clouds drifting beside the route: big soft additive sprites in the game's teal, violet and blue
    { const cc = document.createElement('canvas'); cc.width = cc.height = 128; const x = cc.getContext('2d');
      for (let i = 0; i < 26; i++) { const px = 64 + (Math.random() - 0.5) * 70, py = 64 + (Math.random() - 0.5) * 70, r = 18 + Math.random() * 36; const gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); }
      const tex = new THREE.CanvasTexture(cc); tex.colorSpace = THREE.SRGBColorSpace;
      const cols = [0x2aa89a, 0x7850c8, 0x3c78d2, 0xbe50aa, 0x30c0b0];
      this.clouds = new THREE.Group(); this.group.add(this.clouds);
      for (let i = 0; i < (game.touchMode ? 16 : 46); i++) {          // huge transparent sprites are the costliest thing a phone GPU can draw
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: cols[i % 5], transparent: true, opacity: 0.05 + Math.random() * 0.09, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        const z = -250 - Math.random() * 5700, side = Math.random() < 0.5 ? -1 : 1;
        sp.position.set(700 * (z / -5700) * 0.9 + side * (600 + Math.random() * 1800), (Math.random() - 0.5) * 1500, z);
        sp.scale.setScalar(600 + Math.random() * 1700); sp.material.rotation = Math.random() * 6.28; this.clouds.add(sp);
      } }
    // speed streaks: thin lines streaming past the ship, stronger the faster it goes
    { this.slGroup = new THREE.Group(); this.group.add(this.slGroup);
      const NL = 150; this.slN = NL; this.slData = Array.from({ length: NL }, () => ({ x: 0, y: 0, z: 0 }));
      this.slGeo = new THREE.BufferGeometry(); this.slGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NL * 6), 3));
      this.slMat = new THREE.LineBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const sl = new THREE.LineSegments(this.slGeo, this.slMat); sl.frustumCulled = false; this.slGroup.add(sl);
      for (const d of this.slData) { const a = Math.random() * 6.28, r = 8 + Math.random() * 55; d.x = Math.cos(a) * r; d.y = Math.sin(a) * r; d.z = -150 + Math.random() * 165; } }
    this.trailT = 0; this.flash = 0; this.hitMark = 0;
    { const wp = document.createElement('div'); wp.id = 'fh-wp'; const wl = document.createElement('div'); wl.id = 'fh-wpl'; this.hud.append(wp, wl); this.wpEl = wp; this.wplEl = wl;
      const pip = document.createElement('div'); pip.id = 'fh-pip'; this.hud.appendChild(pip); this.pip = pip;
      const fl = document.createElement('div'); fl.id = 'fh-flash'; this.hud.appendChild(fl); this.flashEl = fl;
      const st2 = document.createElement('style');
      st2.textContent = '#fh-pip{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border:1px solid rgba(168,235,226,.55);border-radius:50%;opacity:.8}#fh-pip:after{content:"";position:absolute;left:50%;top:50%;width:2px;height:2px;margin:-1px;background:rgba(168,235,226,.8)}'
        + '#fh-flash{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(255,60,40,0) 40%,rgba(255,50,30,.5) 100%);opacity:0}'
        + '.fh-ret.hit{border-color:rgba(255,215,140,.95);transform:scale(1.35);transition:transform .08s}.fh-ret{transition:transform .15s,border-color .15s}';
      document.head.appendChild(st2); }
    this.combat = new FlightCombat(this);
    this.dying = null;
  }

  // The main menu's backdrop: the lander drifting above the burning homeworld, slow and quiet, with the planet and the sun behind it.
  showMenu() {
    if (this.menuActive) return;
    const g = this.g, s = g.scene, c = g.camera;
    this.menuSaved = { bg: s.background, fog: s.fog, far: c.far, fov: c.fov };
    s.background = new THREE.Color(0x02040a); s.fog = null; c.far = 16000; c.fov = 50; c.updateProjectionMatrix();
    this.group.visible = this.sun.visible = this.fill.visible = true;
    this.menuActive = true; this.t = 0; this.warship.visible = false; this.dust.visible = false;
    this.pos.set(0, 0, 0); this.quat.identity(); this.ship.position.set(0, 0, 0); this.ship.rotation.set(0, 0, 0);
    for (const sp of this.ship.userData.engines) sp.scale.setScalar(1.5);
    g.viewmodel.root.visible = false; g.body.setVisible(false);
  }
  hideMenu() {
    if (!this.menuActive) return;
    const g = this.g, s = g.scene, c = g.camera;
    s.background = this.menuSaved.bg; s.fog = this.menuSaved.fog; c.far = this.menuSaved.far; c.fov = this.menuSaved.fov; c.updateProjectionMatrix(); g.post.applyFog(s);
    if (!this.active) this.group.visible = this.sun.visible = this.fill.visible = false;
    this.menuActive = false; this.dust.visible = true; this.warship.visible = true;
    g.viewmodel.root.visible = true;
  }
  updateMenu(dt) {
    this.t += dt;
    const t = this.t;
    this.camPos.set(2 + Math.sin(t * 0.07) * 5, 2.2 + Math.sin(t * 0.05) * 1.2, -15.5 + Math.cos(t * 0.06) * 2);
    this.camQuat.setFromRotationMatrix(_m4.lookAt(this.camPos, _v.set(6 + Math.sin(t * 0.04) * 1.5, -1.2 + Math.sin(t * 0.09) * 0.5, 0), _u.set(0, 1, 0)));
    this.ship.position.set(0, Math.sin(t * 0.6) * 0.25, 0); this.ship.rotation.set(Math.sin(t * 0.4) * 0.03, 0.18 + Math.sin(t * 0.13) * 0.08, Math.sin(t * 0.5) * 0.05);
    this.stars.position.copy(this.camPos); this.sky.position.copy(this.camPos); this.starMat.uniforms.uTime.value = t;
    this.starMat.uniforms.uScale.value = this.g.renderer.getPixelRatio();
    if (!this.vesselHurt) this.vessel.userData.ring.rotation.z += dt * 0.05; this.fires.material.opacity = 0.6 + 0.3 * Math.sin(t * 3);
    for (const sp of this.ship.userData.engines) sp.scale.setScalar(1.4 + Math.sin(t * 9) * 0.1);
  }

  // Enter flight just after liftoff: the ship hangs over the burning world, pointed at the research vessel.
  start() {
    const g = this.g, s = g.scene, c = g.camera;
    this.saved = { bg: s.background, fog: s.fog, far: c.far, exp: g.renderer.toneMappingExposure };
    s.background = new THREE.Color(0x02040a); s.fog = null;
    c.far = 16000; c.updateProjectionMatrix();
    this.group.visible = this.sun.visible = this.fill.visible = true;
    g.trauma = 0; g.hitFlash = 0;                        // start flight with a steady camera, whatever the cutscene left behind
    this.active = true; this.t = 0; this.phase = 'launch'; this.docking = null; this.hull = 100; this.shake = 0.4;
    this.pos.set(0, 0, 0); this.speed = 20; this.throttle = 0.45; this.roll = 0;
    if (this.free) { this.pos.copy(DOCK).add(_v.set(0, -70, 60)); this.speed = 90; this.phase = 'cruise'; this.warship.visible = false; this.vesselDamaged(); this.g.campaign.refresh(); }
    const look = this.free ? _v.copy(PLANET).sub(this.pos).normalize() : _v.copy(DOCK).sub(this.pos).normalize();
    this.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), look);
    this.camPos.copy(this.pos).addScaledVector(_f.set(0, 0, 1).applyQuaternion(this.quat), 18).add(_u.set(0, 5, 0)); this.camQuat.copy(this.quat);
    this.warship.position.set(-500, -150, -200); this.warship.visible = !this.free; this.warshipT = 0;
    for (const d of this.debris) d.userData.hit = false;
    g.viewmodel.root.visible = false; g.body.setVisible(false);
    g.ui.showHud(true); g.ui.setObjective(this.free ? g.campaign.roadObjective() : 'FLY TO THE HALCYON'); g.ui.setPrompt(''); this.armor = (() => { try { return localStorage.getItem('intruder-armor') === '1' ? 0.5 : 1; } catch (e) { return 1; } })();
    document.body.classList.add('intro', 'in-flight'); // hides the on-foot crosshair, health and weapon readouts; softens the shared UI
    this.hud.classList.remove('hidden');
    g.audio.stopSiren?.(); g.audio.scene('space');
    g.ui.fade(0);
    if (!this.free) g.ui.subtitle('That great ship has the elder. Find them. Make them pay. Whatever it costs.', '', 3.8, true);
    else { this.t = 16; g.ui.subtitle(g.campaign.beat === 'home' ? 'You will find nothing there, Specimen Nine.' : 'You are still leaving a trail, Specimen Nine.', 'HALCYON', 3.4); g.audio.play('pa', { vol: 0.5 }); }
    this.f = this.free ? { a: 1, a2: 1, w: 1, b: 1, c: 1, homeLine: g.campaign.beat === 'home' ? 4 : 0 } : {};
    this.dying = null; this.combat.reset();
  }

  // Per-frame flourishes: streaks, engine trails, smoke from a damaged hull, the gun pip, hit and damage feedback.
  visuals(dt, boost) {
    const f = this.f || {};
    this.slGroup.position.copy(this.pos); this.slGroup.quaternion.copy(this.quat);
    const sp = this.speed, pa = this.slGeo.attributes.position.array, len = clamp(sp * 0.05, 0, 26);
    for (let i = 0; i < this.slN; i++) {
      const d = this.slData[i]; d.z += sp * dt * 0.8;
      if (d.z > 16) { d.z -= 170; const a = Math.random() * 6.28, r = 8 + Math.random() * 55; d.x = Math.cos(a) * r; d.y = Math.sin(a) * r; }
      pa[i * 6] = d.x; pa[i * 6 + 1] = d.y; pa[i * 6 + 2] = d.z; pa[i * 6 + 3] = d.x; pa[i * 6 + 4] = d.y; pa[i * 6 + 5] = d.z - len;
    }
    this.slGeo.attributes.position.needsUpdate = true;
    this.slMat.opacity = smooth(clamp((sp - 90) / 280, 0, 1)) * 0.55;
    // engine trails
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = (boost ? 0.02 : 0.05) * (this.g.touchMode ? 2.5 : 1);
      for (const e of this.ship.userData.engines) {
        _v.copy(e.position).applyQuaternion(this.ship.quaternion).add(this.ship.position);
        this.combat.burst(_v, boost ? 0xb8f4ff : 0x8fe8ff, 1, 0, boost ? 0.95 : 0.55, 0.3, -0.6);
      }
    }
    // a damaged ship smokes and sparks
    if (this.hull < 45 && Math.random() < dt * 16) {
      _u.set((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 1.2, (Math.random() - 0.2) * 3).applyQuaternion(this.quat).add(this.pos);
      this.combat.burst(_u, Math.random() < 0.5 ? 0xff7a2a : 0x4a5560, 1, 6, 2.2 + Math.random() * 2, 0.7, 1.2);
    }
    // the gun pip: where the cannons converge, 260 m ahead of the nose, projected onto the screen
    _r.set(0, 0, -260).applyQuaternion(this.quat).add(this.pos).add(OFFSET).project(this.g.camera);
    if (_r.z < 1 && Math.abs(_r.x) < 1 && Math.abs(_r.y) < 1) { this.pip.style.display = 'block'; this.pip.style.left = ((_r.x * 0.5 + 0.5) * window.innerWidth) + 'px'; this.pip.style.top = ((-_r.y * 0.5 + 0.5) * window.innerHeight) + 'px'; } else this.pip.style.display = 'none';
    this.flash = Math.max(0, this.flash - dt * 2.2); this.flashEl.style.opacity = (this.flash * 0.55).toFixed(3);
    this.hitMark = Math.max(0, this.hitMark - dt); this.hud.querySelector('.fh-ret').classList.toggle('hit', this.hitMark > 0);
  }

  // Damage to the ship from enemy fire and collisions. At zero the hull fails and the ship is rebuilt at the start of the run.
  damage(n) {
    if (this.dying || this.docking) return;
    this.hull = Math.max(0, this.hull - n * (this.armor ?? 1)); this.shake = Math.max(this.shake, 0.55); this.flash = 0.6; this.g.audio.play('hurt', { vol: 0.6 });
    if (this.hull <= 0) { this.dying = { t: 0 }; this.g.ui.subtitle('Hull breach. Emergency power. Rerouting.', 'LANDER', 3); this.g.audio.play('explosion', { vol: 0.8 }); }
  }

  // You did this: its ring has stopped, and the bay lights are red.
  vesselDamaged() { if (this.vesselHurt) return; this.vesselHurt = true; for (const sp of this.vessel.userData.lights || []) { if (sp.material) { sp.material = sp.material.clone(); sp.material.color.set(0xff3a22); } } }

  stop() {
    if (!this.active) return;
    this.entry = null; this.knock = null;
    const g = this.g, s = g.scene, c = g.camera;
    s.background = this.saved.bg; s.fog = this.saved.fog; c.far = this.saved.far; c.updateProjectionMatrix(); g.post.applyFog(s);
    this.group.visible = this.sun.visible = this.fill.visible = false;
    this.active = false; this.phase = 'off';
    g.viewmodel.root.visible = true;
    document.body.classList.remove('intro', 'in-flight');
    this.hud.classList.add('hidden');
  }

  distance() { return this.pos.distanceTo(DOCK); }

  // The end of the chapter, from outside: the warship leaving with your people, and then, out of the bay behind it, a stolen ship.
  playEnding(done) {
    const g = this.g, s = g.scene, c = g.camera;
    this.saved = { bg: s.background, fog: s.fog, far: c.far, exp: g.renderer.toneMappingExposure };
    s.background = new THREE.Color(0x02040a); s.fog = null;
    c.far = 16000; c.updateProjectionMatrix();
    this.group.visible = this.sun.visible = this.fill.visible = true;
    this.active = true; this.phase = 'cut'; this.t = 0; this.docking = null; this.combat.reset(); this.dust.visible = false;
    g.state = 'flight'; g.cinePose = null; g.trauma = 0; g.ui.showHud(false); g.ui.clearTransient?.();
    g.viewmodel.root.visible = false; g.body.setVisible(false);
    document.body.classList.add('intro', 'in-flight');
    this.hud.classList.add('hidden');
    this.warship.visible = true; this.warship.position.copy(BAY).add(_v.set(-150, 10, -420)); this.warshipT = 0;
    this.ship.visible = true; this.ship.position.copy(BAY).add(_v.set(0, 2, 6)); this.ship.quaternion.identity();
    this.cut = { T: 0, done, look: new THREE.Vector3().copy(BAY), shipV: 0 };
    g.audio.scene('ending');
  }

  updateCut(dt) {
    const g = this.g, C = this.cut, T = (C.T += dt), ui = g.ui;
    this.t += dt;
    ui.fade(Math.max(1 - clamp(T / 1.4, 0, 1), clamp((T - 12.4) / 1.8, 0, 1)));
    // the warship goes first, and keeps gaining
    this.warship.position.z -= Math.min(150, 40 + T * T * 8) * dt; this.warship.position.y += 3 * dt;
    if (this.warshipGlow) { this.warshipGlow.visible = true; this.warshipGlow.scale.setScalar(150 + 60 * Math.sin(T * 5)); }
    if (!this.vesselHurt) this.vessel.userData.ring.rotation.z += dt * 0.05;
    if (T > 0.8 && !C.a) { C.a = 1; ui.subtitle('You are too late, Specimen Nine. Nothing is left aboard for you.', 'HALCYON', 3.4); g.audio.play('pa', { vol: 0.5 }); }
    // then, out of the bay
    const launch = clamp((T - 5.2) / 7, 0, 1);
    if (T > 5.0 && !C.b) { C.b = 1; ui.subtitle('Nothing but a hangar full of ships.', '', 3.2, true); g.audio.play('door', { vol: 0.8 }); }
    if (T > 5.4) {
      C.shipV = Math.min(205, C.shipV + dt * (16 + 90 * launch));
      this.ship.position.z -= C.shipV * dt; this.ship.position.y -= dt * 6 * (1 - launch);
      for (const sp of this.ship.userData.engines) { sp.visible = true; sp.scale.setScalar((T > 8.3 ? 2.1 : 2 + launch * 9) + Math.sin(T * 40) * 0.2); }
    }
    if (T > 5.8 && !C.c) { C.c = 1; g.audio.play('flyby', { vol: 0.8 }); g.audio.play('surge', { vol: 0.4 }); }
    if (T > 8.8 && !C.d) { C.d = 1; ui.subtitle('They burned our world. I will take theirs. Whatever it costs.', '', 3.6, true); }
    // first the whole ship, the warship pulling away from its bow; then a cut to under the bay as the lander drops out and passes over you, and you turn to watch it go after them
    if (T < 5.2) {
      this.camPos.copy(VESSEL).add(_v.set(760 - T * 7, -170 + T, -640 + T * 5));
      _f.copy(VESSEL).add(_u.set(0, -10, -360)).lerp(this.warship.position, 0.22);
      C.look.copy(_f);
    } else if (T < 8.3) {
      this.camPos.copy(BAY).add(_v.set(24, -40, -112 + (T - 5.2) * 1.6));
      _f.copy(this.ship.position).add(_u.set(0, 1, 0));
      if (!C.cutDone) { C.cutDone = 1; C.look.copy(_f); }
      C.look.lerp(_f, 1 - Math.exp(-5 * dt));
    } else {
      // right behind it, the great ship ahead of you: this is the rest of the game
      const k = clamp((T - 8.3) / 6, 0, 1);
      this.camPos.copy(this.ship.position).add(_v.set(3.4 + Math.sin(T * 0.7) * 0.5, 3.0 + Math.sin(T * 1.1) * 0.25, 15 - k * 2));
      _f.copy(this.warship.position).lerp(this.ship.position, 0.04);
      C.look.copy(_f);
      if (this.warshipGlow) this.warshipGlow.scale.setScalar(70 + 18 * Math.sin(T * 6));
    }
    _r.copy(C.look).sub(this.camPos).normalize();
    this.camQuat.setFromRotationMatrix(this._m4 = (this._m4 || new THREE.Matrix4()).lookAt(_v.set(0, 0, 0), _r, _u.set(0, 1, 0)));
    if (T > 14.4) { const fin = C.done; this.cut = null; this.dust.visible = true; this.stop(); fin(); }
  }

  // Everything solid you can fly into. Hits push you out, kill most of your speed, turn your nose away and cost hull according to how fast you were going.
  bump(nx, ny, nz, pen, hard = 1) {
    if (this.docking || this.dying || this.entry) return;
    const g = this.g, n = _v.set(nx, ny, nz).normalize();
    this.pos.addScaledVector(n, pen + 0.6);
    this.knock = this.knock || new THREE.Vector3(); const fast = this.speed;
    this.knock.addScaledVector(n, Math.min(60, 12 + fast * 0.28));
    this.speed *= 0.42;
    _f.set(0, 0, -1).applyQuaternion(this.quat);
    const into = _f.dot(n);
    if (into < 0) { _r.copy(_f).addScaledVector(n, -into * 1.35).normalize(); q.setFromUnitVectors(_f, _r); this.quat.premultiply(q); }
    if ((this.hitCool || 0) <= 0) {
      this.hitCool = 0.45; this.damage(Math.min(26, (3 + fast * 0.085) * hard));
      this.shake = Math.max(this.shake, 0.85); g.audio.play('clatter', { vol: 0.9 }); g.audio.play('impact', { vol: 0.6 });
      this.combat.burst(this.pos.clone().addScaledVector(n, -2), 0xffc070, 12, 40, 2.4, 0.4, 2);
    }
  }

  solidHits(dt) {
    const SHIP = 3.6, P = this.pos, g = this.g;
    this.hitCool = (this.hitCool || 0) - dt;
    if (this.knock) { P.addScaledVector(this.knock, dt); this.knock.multiplyScalar(Math.exp(-3 * dt)); }
    if (this.docking || this.entry) return;
    // the vessel's hull
    if (P.distanceTo(VESSEL) < this.hullFar) {
      const rr = 22 * 0.62 + SHIP; let best = null, bd = rr;
      for (const c of this.hullCells) { const dx = P.x - c.x; if (dx > rr || dx < -rr) continue; const dz = P.z - c.z; if (dz > rr || dz < -rr) continue; const d = P.distanceTo(c); if (d < bd) { bd = d; best = c; } }
      if (best) this.bump(P.x - best.x, P.y - best.y, P.z - best.z, rr - bd);
      const Rg = this.ringInfo;
      if (Rg) { const dx = P.x - Rg.c.x, dy = P.y - Rg.c.y, dz = P.z - Rg.c.z, rad = Math.hypot(dx, dy), off = rad - Rg.R, d = Math.hypot(off, dz), lim = Rg.t + SHIP; if (d < lim && rad > 1) { const ox = (dx / rad) * off, oy = (dy / rad) * off; this.bump(ox, oy, dz, lim - d); } }
    }
    // the small moon
    if (this.ember) { const d = P.distanceTo(this.ember.position), lim = 46 + SHIP; if (d < lim) this.bump(P.x - this.ember.position.x, P.y - this.ember.position.y, P.z - this.ember.position.z, lim - d); }
    // the warship while it is still here
    if (this.warship.visible && this.phase === 'launch') {
      const W = this.warship.position;
      for (let i = -2; i <= 2; i++) { const cx = W.x + i * 72, d = Math.hypot(P.x - cx, P.y - W.y, P.z - W.z), lim = 58 + SHIP; if (d < lim) { this.bump(P.x - cx, P.y - W.y, P.z - W.z, lim - d, 1.4); break; } }
    }
    // the asteroid belt turns slowly about the origin
    if (this.beltRocks) {
      const a = this.belt.rotation.y, ca = Math.cos(a), sa = Math.sin(a);
      for (const b of this.beltRocks) { const bx = b.x * ca + b.z * sa, bz = -b.x * sa + b.z * ca, dx = P.x - bx; if (dx > b.r + SHIP || dx < -b.r - SHIP) continue; const dz = P.z - bz, dy = P.y - b.y, d = Math.hypot(dx, dy, dz), lim = b.r + SHIP; if (d < lim) { this.bump(dx, dy, dz, lim - d); break; } }
    }
    // the fighters
    for (const e of this.combat.enemies) { const d = e.mesh.position.distanceTo(P); if (d < 7.5 && e.hp > 0) { this.bump(P.x - e.mesh.position.x, P.y - e.mesh.position.y, P.z - e.mesh.position.z, 7.5 - d, 0.8); this.combat.hit(e, 30, e.mesh.position); } }
    // the warship's hangar deck, and the gas giant's rings: flying through a ring is fine; everything else in space that can be hit is a world, and you land on those
  }

  // ---- other worlds: names you can read from a long way off, and flying into an atmosphere lands you
  // Where the journey wants you to point the ship. The world itself is the waypoint: it is there, you can see it, this says which one.
  navPoint() {
    const id = this.g.campaign.flightTarget();
    if (id === null) return { pos: _wp.copy(DOCK), label: 'HALCYON' };
    if (id === 'none') return null;
    if (id === 'crossing') return { pos: _wp.copy(CROSSING), label: 'CROSSING POINT' };
    const w = this.worlds.find((o) => o.id === id); return { pos: _wp.copy(w.pos), label: WORLDS[id].name + ' · ' + (PARTS[id] || 'THE WALL') };
  }
  updateWaypoint() {
    const n = this.navPoint(), el = this.wpEl, lb = this.wplEl;
    if (!n || this.entry) { el.style.display = lb.style.display = 'none'; return Infinity; }
    const d = this.pos.distanceTo(n.pos); _r.copy(n.pos).add(OFFSET).project(this.g.camera);
    let x = _r.x, y = _r.y; const behind = _r.z > 1; if (behind) { x = -x; y = -y; }
    const off = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.86;
    if (off) { const k = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.86, 0.0001); x /= k; y /= k; if (behind && Math.hypot(x, y) < 0.5) { y = -0.86; } }
    const px = (x * 0.5 + 0.5) * window.innerWidth, py = (-y * 0.5 + 0.5) * window.innerHeight;
    el.style.display = lb.style.display = 'block'; el.style.left = lb.style.left = px + 'px'; el.style.top = lb.style.top = py + 'px';
    el.className = off ? 'off' : ''; lb.textContent = n.label + '  ' + (d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m');
    return d;
  }

  updateWorldLabels() {
    const g = this.g, c = g.camera;
    this.updateWaypoint();
    if (!this.worldEls) { this.worldEls = {}; for (const w of this.worlds) { const el = document.createElement('div'); el.className = 'fh-world'; this.hud.appendChild(el); this.worldEls[w.id] = el; } }
    for (const w of this.worlds) {
      const el = this.worldEls[w.id], d = this.pos.distanceTo(w.pos) - w.r;
      _v.copy(w.pos).add(OFFSET).project(c);
      const on = _v.z < 1 && Math.abs(_v.x) < 0.95 && Math.abs(_v.y) < 0.92;
      el.style.display = on ? 'block' : 'none';
      if (on) { el.style.left = ((_v.x * 0.5 + 0.5) * 100).toFixed(1) + '%'; el.style.top = ((-_v.y * 0.5 + 0.5) * 100).toFixed(1) + '%'; const W = WORLDS[w.id], done = g.surface.done[w.id]; el.textContent = W.name + (done ? ' ✓' : '') + (PARTS[w.id] && this.free && !done ? ' · ' + PARTS[w.id] : '') + '  ' + (d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.max(0, Math.round(d)) + ' m'); }
    }
  }
  checkWorlds() {
    const g = this.g; let near = null;
    for (const w of this.worlds) {
      const d = this.pos.distanceTo(w.pos);
      if (d < w.land) { this.beginEntry(w); return; }
      if (d < w.land + 420) near = w;
    }
    if (near && near !== this.nearWorld && !this.docking) { const W = WORLDS[near.id]; g.ui.hint(W.name + ' · ' + W.sub + '  ·  FLY INTO THE AIR TO LAND', 4); }
    this.nearWorld = near;
  }
  // The way out of the system. Only there when the ship is ready.
  updateCrossing(dt) {
    const g = this.g, ready = g.campaign.beat === 'crossing';
    this.crossMark.visible = ready || g.campaign.s.crossed; this.crossMark.scale.setScalar(120 + Math.sin(this.t * 1.6) * 14);
    if (ready && !this.crossing && this.pos.distanceTo(CROSSING) < 220) { this.crossing = { t: 0 }; g.ui.subtitle('Plating holds. Coolant holds. I have the heading. Crossing now.', 'LANDER', 3.4); g.audio.play('surge', { vol: 0.9 }); g.audio.play('flyby', { vol: 0.8 }); }
    if (this.crossing) {
      const C = this.crossing; C.t += dt; this.speed = 200 + C.t * C.t * 120; this.shake = Math.max(this.shake, Math.min(0.9, C.t * 0.25));
      if (C.t > 1.8) this.once2('c1', () => g.ui.subtitle('Forty-one thousand of us. I am coming.', '', 3, true));
      g.ui.fade(Math.max(0, (C.t - 3.6) / 1.4));
      if (C.t > 5) { this.crossing = null; this.stop(); g.finishCrossing(); }
    }
  }
  once2(k, fn) { this.f[k] || (this.f[k] = 1, fn()); }

  beginEntry(w) {
    if (this.dying || this.docking || this.entry || this.crossing) return;
    const g = this.g; this.entry = { t: 0, w }; this.knock = null;
    for (const e of this.combat.enemies) e.mesh.removeFromParent(); this.combat.enemies.length = 0;
    g.ui.subtitle('Atmosphere. Hold on.', 'LANDER', 2.2); g.audio.play('surge', { vol: 0.7 }); g.audio.play('flyby', { vol: 0.8 });
  }
  updateEntry(dt) {
    const g = this.g, E = this.entry; E.t += dt; const k = E.t / 2.4;
    _v.copy(E.w.pos).sub(this.pos).normalize();
    _f.set(0, 0, -1).applyQuaternion(this.quat); q.setFromUnitVectors(_f, _r.copy(_f).lerp(_v, Math.min(1, dt * 2)).normalize()); this.quat.premultiply(q);
    this.speed = 160; this.shake = Math.max(this.shake, 0.4 + k * 0.5);
    // the air catches fire around the ship
    if (Math.random() < 0.8) this.combat.burst(this.pos.clone().addScaledVector(_v, 2 + Math.random() * 6).add(_u.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(5)), 0xffa050, 2, 14, 3 + k * 4, 0.5, 2);
    g.ui.fade(Math.min(1, k * k * 1.1));
    if (E.t >= 2.4) {
      const w = E.w; this.entry = null; this.lastEntry = this.pos.clone(); this.stop();
      this.saved = null; g.ui.setPrompt('');
      if (!g.surface.start(w.id)) { g.state = 'flight'; this.start(); }
    }
  }
  // Coming back from a world: above it, climbing away, with everything else as it was.
  resumeFrom(id) {
    const g = this.g, s = g.scene, c = g.camera, w = this.worlds.find((o) => o.id === id);
    this.saved = { bg: s.background, fog: s.fog, far: c.far, exp: g.renderer.toneMappingExposure };
    s.background = new THREE.Color(0x02040a); s.fog = null; c.far = 16000; c.updateProjectionMatrix(); g.post.applyFog(s);
    this.group.visible = this.sun.visible = this.fill.visible = true;
    const up = _v.copy(this.lastEntry || this.pos).sub(w.pos).normalize();
    this.pos.copy(w.pos).addScaledVector(up, w.land + 150); this.speed = 110; this.throttle = 0.6; this.roll = 0; this.knock = null; this.nearWorld = w;
    this.quat.setFromUnitVectors(_f.set(0, 0, -1), up);
    this.camPos.copy(this.pos).addScaledVector(up, -18); this.camQuat.copy(this.quat);
    this.active = true; g.state = 'flight'; g.cinePose = null; g.viewmodel.root.visible = false; g.body.setVisible(false); g.trauma = 0;
    g.ui.showHud(true); g.ui.setObjective(this.free ? g.campaign.roadObjective() : 'FLY TO THE HALCYON'); g.ui.setPrompt('');
    document.body.classList.add('intro', 'in-flight'); this.hud.classList.remove('hidden');
    g.audio.scene('space'); this.resumeFade = 1;
    if (this.saveArmor === undefined) this.saveArmor = 1;
  }

  update(dt, input, lx, ly) {
    if (!this.active) return;
    if (this.resumeFade > 0) { this.resumeFade = Math.max(0, this.resumeFade - dt / 1.2); this.g.ui.fade(this.resumeFade); }
    if (this.cut) { this.updateCut(dt); return; }
    const g = this.g;
    this.t += dt;
    this.stars.position.copy(this.camPos); this.sky.position.copy(this.camPos); this.starMat.uniforms.uTime.value = this.t;
    this.starMat.uniforms.uScale.value = this.g.renderer.getPixelRatio();
    this.belt.rotation.y += dt * 0.004; if (this.moon) this.moon.rotation.y += dt * 0.02;
    const live = input.locked && this.phase !== 'docked' && !this.docking && !this.dying;

    // ---- steering: the mouse points the nose, A and D bank and yaw, W and S set the throttle, Shift boosts, Space brakes
    const sens = (g.sens || 0.0022) * 0.9;
    const GAIN = 0.4;                                     // overall steering gain (the earlier 1.4 felt twitchy)
    let yawIn = 0, pitchIn = 0, rollIn = 0;
    // touch: the stick sets throttle (up/down) and bank (left/right); DASH boosts for a moment, JUMP brakes for a moment
    this.boostT = Math.max(0, (this.boostT || 0) - dt); this.brakeT = Math.max(0, (this.brakeT || 0) - dt);
    if (input.touch) { if (input.was('ShiftLeft')) this.boostT = 1.6; if (input.was('Space')) this.brakeT = 1.2; }
    if (live) {
      if (input.touch) { rollIn += -input.axisX; if (input.axisY > 0.25) this.throttle = Math.min(1, this.throttle + dt * 0.5 * input.axisY); if (input.axisY < -0.25) this.throttle = Math.max(0.1, this.throttle + dt * 0.5 * input.axisY); }
      yawIn = -lx * sens * GAIN; pitchIn = -ly * sens * GAIN;
      if (input.down('KeyA')) rollIn += 1; if (input.down('KeyD')) rollIn -= 1;
      if (input.down('KeyW')) this.throttle = Math.min(1, this.throttle + dt * 0.5);
      if (input.down('KeyS')) this.throttle = Math.max(0.1, this.throttle - dt * 0.5);
    }
    this.yawRate = damp(this.yawRate, clamp(yawIn / Math.max(dt, 1e-3), -0.95, 0.95) + rollIn * -0.55, 5, dt);
    this.pitchRate = damp(this.pitchRate, clamp(pitchIn / Math.max(dt, 1e-3), -0.8, 0.8), 5, dt);
    this.roll = damp(this.roll, rollIn * 0.6 + clamp(this.yawRate * 0.25, -0.5, 0.5), 5, dt);
    if (!this.docking) {
      e.set(this.pitchRate * dt, this.yawRate * dt, 0, 'YXZ'); q.setFromEuler(e);
      this.quat.multiply(q).normalize();
    }
    const boost = live && (input.down('ShiftLeft') || input.down('ShiftRight') || this.boostT > 0);
    const brake = live && (input.down('Space') || this.brakeT > 0);
    const target = this.docking ? 14 : (boost ? (this.g.campaign.s.worlds.vael ? 460 : 360) : 40 + this.throttle * 120) * (brake ? 0.25 : 1);
    this.speed = damp(this.speed, target, boost ? 1.6 : 1.1, dt);
    _f.set(0, 0, -1).applyQuaternion(this.quat);
    this.pos.addScaledVector(_f, this.speed * dt);

    // ---- a destroyed ship is rebuilt at the start of the run
    if (this.dying) {
      this.dying.t += dt; g.ui.fade(smooth(clamp(this.dying.t / 1.2, 0, 1)));
      if (this.dying.t > 1.6) { this.pos.set(0, 0, 0); this.speed = 40; this.hull = 100; this.dying = null; this.t = 7; this.combat.reset(); this.quat.setFromUnitVectors(_v.set(0, 0, -1), _f.copy(DOCK).sub(this.pos).normalize()); this.camPos.copy(this.pos); this.camQuat.copy(this.quat); this.phase = 'cruise'; this.warship.visible = false; g.ui.fade(0); }
    }
    // ---- wreckage: a glancing hit costs hull and shoves the ship; the field thins out toward the vessel
    for (const d of this.debris) {
      d.rotation.x += d.userData.spin.x * dt; d.rotation.y += d.userData.spin.y * dt; d.rotation.z += d.userData.spin.z * dt;
      const dist = d.position.distanceTo(this.pos);
      if (dist < d.userData.r + 3.5 && !this.docking) {
        if (!d.userData.hit) { d.userData.hit = true; this.hull = Math.max(8, this.hull - (this.speed > 150 ? 14 : 7)); this.shake = 0.5; g.audio.play('hurt', { vol: 0.5 }); g.audio.play('clatter', { vol: 0.7 }); }
        _v.copy(this.pos).sub(d.position).normalize(); this.pos.addScaledVector(_v, (d.userData.r + 3.5 - dist) + 0.5); this.speed *= 0.55;
      } else if (dist > d.userData.r + 40) d.userData.hit = false;
    }
    this.solidHits(dt);
    this.hull = Math.min(100, this.hull + dt * 0.4);
    this.updateWorldLabels(dt);
    if (this.entry) { this.updateEntry(dt); return; }
    this.checkWorlds(dt);
    if (this.free) this.updateCrossing(dt);

    // ---- the launch: the warship leaves orbit with a flash of its drive
    if (this.phase === 'launch') {
      this.warshipT += dt;
      this.warship.position.x -= (30 + this.warshipT * this.warshipT * 18) * dt; this.warship.position.z -= (40 + this.warshipT * 55) * dt; this.warship.position.y += 8 * dt;
      this.warshipGlow.scale.setScalar(120 + 80 * Math.sin(this.warshipT * 3));
      if (this.warshipT > 9) { this.warship.visible = false; this.phase = 'cruise'; }
    }

    this.combat.update(dt, input, live);
    this.visuals(dt, boost);

    // ---- story beats along the way
    const dist = this.distance();
    if (this.t > 4.4 && !this.f.a) { this.f.a = true; g.ui.subtitle('Pilot not responding. Returning to research vessel Halcyon.', 'LANDER', 3.8); g.audio.play('pa', { vol: 0.4 }); }
    if (this.t > 8.6 && !this.f.a2) { this.f.a2 = true; g.ui.subtitle('Then take me there.', '', 2.6, true); }
    this.combat.standDown = dist < 900;             // it wants you alive
    if (!this.free && dist < 3000 && !this.f.c) { this.f.c = true; g.ui.subtitle('Lander Four, your pilot has no vital signs. Who is flying that ship?', 'HALCYON', 4.2); g.audio.play('alert', { vol: 0.4 }); }
    if (this.f.homeLine > 0) { this.f.homeLine -= dt; if (this.f.homeLine <= 0) g.ui.subtitle('Home first. If anyone got away, they would have gone to the wall.', '', 3.6, true); }
    if (this.t > 15 && !this.f.w) { this.f.w = true; g.ui.subtitle('Other worlds on scanner. Fly into any atmosphere to set down.', 'LANDER', 4); g.audio.play('pa', { vol: 0.3 }); }
    if (!this.free && dist < 900 && !this.f.d) { this.f.d = true; g.ui.setObjective('ENTER THE DOCKING BAY'); g.ui.hint('FLY TOWARD THE LIT BAY', 5); g.ui.subtitle('All fighters stand down. Something is alive in that cockpit. Let it dock.', 'HALCYON', 4.6); g.audio.play('pa', { vol: 0.5 }); }

    // ---- docking: steer into the glowing mouth of the bay at a safe speed and the ship is pulled in
    // docking assist: near the bay the ship's computer takes over the throttle and draws the lander in; no precise flying needed
    if (!this.free && !this.docking && dist < 260 && this.speed > 120) this.speed = damp(this.speed, 110, 1.6, dt);
    if (!this.free && !this.docking && dist < 130) {
      this.docking = { t: 0 }; g.ui.setPrompt(''); g.audio.play('door', { vol: 0.8 }); g.ui.subtitle('Docking clamps engaged. Welcome aboard.', 'HALCYON', 3.2);
    } else if (!this.free && !this.docking && dist < 330) g.ui.setPrompt('DOCKING ASSIST');
    else if (!this.docking) g.ui.setPrompt('');
    if (this.docking) {
      this.docking.t += dt;
      const k = smooth(clamp(this.docking.t / 3.2, 0, 1));
      _v.copy(BAY).add(_u.set(0, -4, -20)).sub(this.pos); this.pos.addScaledVector(_v, 1 - Math.exp(-1.4 * dt));
      q.setFromUnitVectors(_f.set(0, 0, -1).applyQuaternion(this.quat), _u.set(0, 0, -1)); this.quat.premultiply(this.qs.identity().slerp(q, 1 - Math.exp(-2 * dt)));
      if (this.docking.t > 1.8) g.ui.fade(smooth(seg(this.docking.t, 1.8, 3.2)));
      if (this.docking.t > 3.4) { this.phase = 'docked'; g.arriveAtVessel(); return; }
    }

    // ---- ship model, chase camera, effects
    this.ship.position.copy(this.pos);
    e.set(0, 0, this.roll, 'XYZ'); q.setFromEuler(e); this.ship.quaternion.copy(this.quat).multiply(q);
    const thr = 0.5 + 0.5 * (this.speed / 360) + (boost ? 0.7 : 0);
    for (const s of this.ship.userData.engines) s.scale.setScalar(1.3 + thr * 1.6 + Math.sin(this.t * 40) * 0.12);
    const back = _r.set(0, 0, 1).applyQuaternion(this.quat), up = _u.set(0, 1, 0).applyQuaternion(this.quat);
    const dolly = 15 + this.speed * 0.025;
    const wantPos = _v.copy(this.pos).addScaledVector(back, dolly).addScaledVector(up, 4.5);
    this.camPos.lerp(wantPos, 1 - Math.exp(-9 * dt));
    this.camQuat.slerp(this.quat, 1 - Math.exp(-8 * dt));
    // the opening shot: the camera hangs off the wing looking back over the burning world and the warship leaving orbit, then swings in behind the ship
    if (this.t < 6.5) {
      const k = smooth(seg(this.t, 3.6, 6.4));
      const cp = _r.copy(this.pos).add(_u.set(-34, 7, 58).applyQuaternion(this.quat));
      const aim = _f.copy(this.warship.position).lerp(PLANET, 0.35).add(_u.set(0, 160, 0));
      this.cine.position.copy(cp); this.cine.lookAt(aim);
      this.camPos.lerpVectors(cp, this.camPos, k); this.camQuat.copy(this.cine.quaternion).slerp(this.camQuat, k);
    }
    this.shake = Math.max(0, this.shake - dt * 1.4);
    if (!this.vesselHurt) this.vessel.userData.ring.rotation.z += dt * 0.05;
    for (let i = 0; i < this.vessel.userData.lights.length; i++) this.vessel.userData.lights[i].material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(this.t * 4 - i * 0.7));
    this.fires.material.opacity = 0.6 + 0.3 * Math.sin(this.t * 3);

    // ---- HUD
    { const dp = this.dust.geometry.attributes.position.array, base = this.dustPos, cx = this.camPos.x, cy = this.camPos.y, cz = this.camPos.z;
      for (let i = 0; i < base.length; i += 3) {
        dp[i] = ((base[i] - cx + 180) % 360 + 360) % 360 - 180 + cx; dp[i + 1] = ((base[i + 1] - cy + 180) % 360 + 360) % 360 - 180 + cy; dp[i + 2] = ((base[i + 2] - cz + 180) % 360 + 360) % 360 - 180 + cz;
      }
      this.dust.geometry.attributes.position.needsUpdate = true; this.dust.material.size = 1.2 + this.speed / 120; }
    document.getElementById('fh-spd').textContent = Math.round(this.speed);
    document.getElementById('fh-thr').style.width = Math.round((this.speed / 360) * 100) + '%';
    document.getElementById('fh-dist').textContent = (dist / 1000).toFixed(2);
    document.getElementById('fh-hull').style.width = this.hull + '%';
    document.getElementById('fh-boost').classList.toggle('on', !!boost);
    g.camera.fov = damp(g.camera.fov, 62 + (boost ? 12 : 0) + this.speed * 0.02, 6, dt); g.camera.updateProjectionMatrix();
    if (this.hull <= 8 && !this.f.low) { this.f.low = true; g.ui.hint('HULL CRITICAL  ·  AVOID THE WRECKAGE', 4); }
  }

  // Place the render camera (called after the game's own camera pose, so shake and fov still apply on top).
  pose(c) {
    c.position.copy(this.camPos).add(OFFSET);
    c.quaternion.copy(this.camQuat);
    const s = this.shake * this.shake;
    if (s > 0.001) { c.rotation.x += Math.sin(this.t * 53) * 0.02 * s; c.rotation.y += Math.sin(this.t * 61 + 1) * 0.02 * s; }
    c.updateMatrixWorld();
  }
}
