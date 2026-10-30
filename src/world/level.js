import * as THREE from 'three';
import { M, boxGeo } from './materials.js';
import { Door } from './door.js';
import { mergeStatic } from './merge.js';

export const ARENA = { minX: -15, maxX: 15, minZ: -36.5, maxZ: -8.5 };
export const PLAYER_START = { x: 0, z: 7.4 };
export const REPLAY_START = { x: 0, z: -4 };
export const PISTOL_POS = new THREE.Vector3(1.2, 0.05, 5.7);

export function makePistol(scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.35, metalness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x1b1f23, emissive: 0x2a8cff, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.6 });
  const mk = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  // Pointing along -z, resting on its side's grip.
  const parts = [
    mk(0.042, 0.05, 0.22, 0, 0.04, -0.02, body), // slide
    mk(0.02, 0.02, 0.07, 0, 0.035, -0.17, accent), // barrel
    mk(0.04, 0.1, 0.05, 0, -0.03, 0.06, body), // grip
    mk(0.012, 0.03, 0.07, 0, 0.0, -0.03, body), // trigger guard
    mk(0.034, 0.04, 0.04, 0, -0.09, 0.065, accent), // magazine
  ];
  g.scale.setScalar(scale);
  g.userData.parts = parts;
  return g;
}

function labelTexture(lines, color, bg = '#0c1116') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  let px = lines.length > 1 ? 44 : 52;
  g.font = `bold ${px}px sans-serif`;
  const widest = Math.max(...lines.map((t) => g.measureText(t).width));
  if (widest > 440) { px = Math.floor(px * 440 / widest); g.font = `bold ${px}px sans-serif`; }
  lines.forEach((t, i) => g.fillText(t, 256, lines.length > 1 ? 44 + i * 44 : 64));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t });
}

export function buildLevel(scene, world) {
  const L = { lights: [], doors: {}, alarmLights: [], sparkPoints: [], flicker: [] };
  const lamps = [];

  const blk = (x0, x1, y0, y1, z0, z1, mat, opts = {}) => {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const m = new THREE.Mesh(boxGeo(w, h, d, 2, x0 * 3.1 + z0 * 1.7 + y0 * 0.9), mat);
    m.position.set(x0 + w / 2, y0 + h / 2, z0 + d / 2);
    scene.add(m);
    if (opts.solid !== false) world.add(x0, y0, z0, x1, y1, z1, { tag: opts.tag || '' });
    return m;
  };
  const deco = (x0, x1, y0, y1, z0, z1, mat) => blk(x0, x1, y0, y1, z0, z1, mat, { solid: false });
  const cyl = (r, h, x, y, z, mat, seg = 20, rt = r) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, r, h, seg), mat);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };
  const light = (x, y, z, color, intensity, dist = 22) => {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, y, z);
    scene.add(l);
    L.lights.push(l);
    return l;
  };

  // ---- Floor ----
  const floor = new THREE.Mesh(boxGeo(70, 0.2, 90, 2), M.floor);
  floor.position.set(-5, -0.11, -14);
  scene.add(floor);

  // ---- Containment chamber: x[-6,6] z[0,11] h4.5 ----
  blk(-6.5, 6.5, 4.5, 4.9, -0.5, 11.5, M.wall);
  blk(-6.5, 6.5, 0, 4.5, 11, 11.5, M.wall);
  blk(-6.5, -1.5, 0, 4.5, -0.5, 0, M.wall);
  blk(1.5, 6.5, 0, 4.5, -0.5, 0, M.wall);
  blk(-1.5, 1.5, 3, 4.5, -0.5, 0, M.wall);
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -6.5 : 6, x1 = s < 0 ? -6 : 6.5;
    blk(x0, x1, 0, 4.5, -0.5, 2, M.wall);
    blk(x0, x1, 0, 4.5, 9, 11.5, M.wall);
    blk(x0, x1, 0, 0.9, 2, 9, M.wall);
    blk(x0, x1, 3.6, 4.5, 2, 9, M.wall);
    const cx = s * 6.25;
    blk(cx - 0.05, cx + 0.05, 0.9, 3.6, 2, 9, M.glass, { tag: 'glass' });
    for (const z of [4.33, 6.67]) blk(cx - 0.12, cx + 0.12, 0.9, 3.6, z - 0.06, z + 0.06, M.dark);
  }
  // Wall trims and ceiling lights.
  deco(-5.98, -5.9, 0.0, 0.25, 0, 11, M.hazard);
  deco(5.9, 5.98, 0.0, 0.25, 0, 11, M.hazard);
  deco(-2.5, 2.5, 4.42, 4.5, 3, 4, M.white);
  deco(-2.5, 2.5, 4.42, 4.5, 8, 9, M.white);
  light(0, 4.1, 3.5, 0xbfe0ff, 45, 16);
  light(0, 4.1, 8.5, 0x9fd8ff, 40, 14);
  L.emergency = light(0, 3.8, 1.2, 0xff2a1a, 0, 10);
  L.emergencyMat = M.red;

  // Breached containment pod.
  const pod = new THREE.Group();
  pod.position.set(0, 0, 10);
  scene.add(pod);
  const podBase = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.35, 32), M.dark);
  podBase.position.y = 0.175;
  pod.add(podBase);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.1, 32, 1, true, Math.PI + 0.65, Math.PI * 2 - 1.3), M.glass);
  tube.position.y = 1.9;
  pod.add(tube);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.1, 0.45, 32), M.dark);
  cap.position.y = 3.65;
  pod.add(cap);
  for (const a of [0.9, 2.2, 4.1, 5.3]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.1, 0.1), M.mid);
    rib.position.set(Math.sin(a) * 1.12, 1.9, Math.cos(a) * 1.12);
    pod.add(rib);
  }
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(2.1, 28), M.fluid);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(0, 0.03, 8.9);
  puddle.scale.set(1, 0.8, 1);
  scene.add(puddle);
  const podGlow = light(0, 1.2, 9.2, 0x35e0c0, 28, 9);
  L.podGlow = podGlow;
  world.add(-1.35, 0, 8.65, 1.35, 4, 11.35, { tag: 'pod' });
  for (let i = 0; i < 9; i++) { // shards on the floor
    const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.06 + Math.random() * 0.1), M.glass);
    const a = Math.random() * 6.28, r = 1.4 + Math.random() * 1.6;
    s.position.set(Math.sin(a) * r, 0.04, 8.4 + Math.cos(a) * r * 0.7);
    s.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    scene.add(s);
  }
  L.sparkPoints.push(new THREE.Vector3(0.9, 3.4, 9.1), new THREE.Vector3(-4.2, 2.8, 0.6), new THREE.Vector3(4.6, 1.4, 10.4));
  // Consoles flanking the pod.
  for (const s of [-1, 1]) {
    blk(s * 4.2 - 0.9, s * 4.2 + 0.9, 0, 1.1, 9.6, 10.9, M.machine);
    deco(s * 4.2 - 0.7, s * 4.2 + 0.7, 1.1, 1.8, 10.5, 10.7, M.dark);
    deco(s * 4.2 - 0.6, s * 4.2 + 0.6, 1.2, 1.7, 10.38, 10.5, s < 0 ? M.screen : M.screenWarm);
  }
  // Cables from the pod.
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(1.6 + i * 0.5, 0.04, 6, 28, 1.6), M.rubber);
    c.position.set(0, 0.04, 10.3);
    c.rotation.set(Math.PI / 2, 0, 0.3 + i * 0.5);
    scene.add(c);
  }
  // Security door lintel sign.
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), labelTexture(['SECURITY CHECKPOINT'], '#ffb030'));
  warn.position.set(0, 3.6, 0.02);
  warn.rotation.y = 0;
  scene.add(warn);

  // Pistol on the floor beside the pod.
  L.pistol = makePistol(1.25);
  L.pistol.position.copy(PISTOL_POS);
  L.pistol.rotation.set(0, 0.7, 1.45);
  L.pistol.position.y = 0.07;
  scene.add(L.pistol);
  L.pistolLight = light(1.2, 0.5, 5.7, 0x4aa0ff, 6, 3);

  // ---- East: research lab seen through the glass ----
  deco(6.5, 24, 4.5, 4.9, -2, 13, M.wall);
  blk(23.5, 24, 0, 4.9, -2, 13, M.wall, { solid: false });
  blk(6.5, 24, 0, 4.9, 12.5, 13, M.wall, { solid: false });
  blk(6.5, 24, 0, 4.9, -2.5, -2, M.wall, { solid: false });
  light(12, 4.1, 5.5, 0xcfe8ff, 80, 16);
  for (let i = 0; i < 3; i++) {
    deco(9 + i * 4.4, 11.6 + i * 4.4, 0, 0.95, 3, 4.6, M.machine);
    deco(9.3 + i * 4.4, 10.7 + i * 4.4, 0.95, 1.5, 3.3, 3.4, M.dark);
    deco(9.4 + i * 4.4, 10.6 + i * 4.4, 1.0, 1.45, 3.25, 3.3, i % 2 ? M.screenWarm : M.screen);
    deco(9 + i * 4.4, 11.6 + i * 4.4, 0, 0.95, 7.4, 9, M.machine);
    cyl(0.3, 0.12, 10.2 + i * 4.4, 1.0, 8.2, M.light);
  }
  for (const [x, z] of [[8.2, 1], [8.2, 11], [20, 1.5], [20, 11]]) { // specimen tanks
    cyl(0.85, 3.4, x, 1.7, z, M.glass, 24);
    cyl(0.78, 3.0, x, 1.55, z, M.fluid, 24);
    cyl(0.95, 0.3, x, 0.15, z, M.dark, 24);
    cyl(0.95, 0.3, x, 3.45, z, M.dark, 24);
  }
  const arm = new THREE.Group();
  arm.position.set(15.5, 4.5, 6);
  scene.add(arm);
  const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.2, 12), M.mid); a1.position.y = -1.1; arm.add(a1);
  const a2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 3), M.light); a2.position.set(0, -2.2, 1.4); arm.add(a2);
  const a3 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 8), M.dark); a3.position.set(0, -2.6, 2.8); a3.rotation.x = Math.PI; arm.add(a3);
  deco(23, 23.5, 1.2, 3.4, 4, 9, M.screen);

  // ---- West: gantry hangar with a viewport to space ----
  deco(-31, -6.5, 6.5, 7, -4, 16, M.wall);
  blk(-31, -6.5, 0, 6.5, 16, 16.5, M.wall, { solid: false });
  blk(-31, -6.5, 0, 6.5, -4.5, -4, M.wall, { solid: false });
  blk(-31.5, -31, 0, 1.2, -4, 16, M.wall, { solid: false });
  blk(-31.5, -31, 5.2, 6.5, -4, 16, M.wall, { solid: false });
  deco(-31.1, -31, 1.2, 5.2, -4, 16, M.glass);
  light(-14, 6, 6, 0x8fb8ff, 160, 30);
  for (let i = 0; i < 5; i++) {
    const x = -10 - i * 4.8;
    deco(x - 0.25, x + 0.25, 0, 6.5, -3.8, -3.2, M.mid);
    deco(x - 0.25, x + 0.25, 0, 6.5, 15.2, 15.8, M.mid);
    deco(x - 0.25, x + 0.25, 6.0, 6.5, -3.8, 15.8, M.mid);
  }
  deco(-30, -8, 2.2, 2.6, 1.5, 3.0, M.dark); // catwalk
  deco(-30, -8, 2.6, 3.1, 1.4, 1.5, M.cyan);
  for (let i = 0; i < 6; i++) deco(-28 + i * 3.6, -26.4 + i * 3.6, 0, 1.8, 9, 11, M.machine);
  // Space beyond the viewport.
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const u = Math.random() * 6.283, v = Math.acos(2 * Math.random() - 1), r = 350;
    sp[i * 3] = Math.sin(v) * Math.cos(u) * r - 40;
    sp[i * 3 + 1] = Math.cos(v) * r * 0.6 + 40;
    sp[i * 3 + 2] = Math.sin(v) * Math.sin(u) * r + 6;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.4, sizeAttenuation: false, fog: false })));
  const pc = document.createElement('canvas'); pc.width = 256; pc.height = 256;
  const pg = pc.getContext('2d');
  const grad = pg.createRadialGradient(100, 90, 20, 128, 128, 128);
  grad.addColorStop(0, '#9fe0ff'); grad.addColorStop(0.5, '#2a6aa8'); grad.addColorStop(1, '#06132a');
  pg.fillStyle = grad; pg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) { pg.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; pg.fillRect(0, Math.random() * 256, 256, 3 + Math.random() * 8); }
  const planet = new THREE.Mesh(new THREE.SphereGeometry(70, 40, 28), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc), fog: false }));
  planet.position.set(-190, 30, 20);
  scene.add(planet);

  // ---- Corridor: x[-1.5,1.5] z[-8,-0.5] h3.5 ----
  blk(-2, -1.5, 0, 3.5, -8.5, -0.5, M.wall);
  blk(1.5, 2, 0, 3.5, -8.5, -0.5, M.wall);
  blk(-2, 2, 3.5, 3.9, -8.5, -0.5, M.wall);
  deco(-1.45, 1.45, 3.42, 3.5, -4.5, -3.5, M.white);
  deco(-1.48, -1.4, 0, 0.2, -8, -0.5, M.hazard);
  deco(1.4, 1.48, 0, 0.2, -8, -0.5, M.hazard);
  light(0, 3.2, -4, 0xbfdcff, 40, 10);
  for (const z of [-2, -6]) { deco(-1.5, -1.35, 2.3, 2.5, z - 0.4, z + 0.4, M.amber); deco(1.35, 1.5, 2.3, 2.5, z - 0.4, z + 0.4, M.amber); }

  // ---- Arena: x[-15,15] z[-36.5,-8.5] h6.5 ----
  blk(-15.5, -1.5, 0, 6.5, -8.5, -8, M.wall);
  blk(1.5, 15.5, 0, 6.5, -8.5, -8, M.wall);
  blk(-1.5, 1.5, 3, 6.5, -8.5, -8, M.wall);
  blk(-15.5, -15, 0, 6.5, -37, -8, M.wall);
  blk(15, 15.5, 0, 6.5, -37, -8, M.wall);
  blk(-15.5, -1.5, 0, 6.5, -37, -36.5, M.wall);
  blk(1.5, 15.5, 0, 6.5, -37, -36.5, M.wall);
  blk(-1.5, 1.5, 3, 6.5, -37, -36.5, M.wall);
  blk(-15.5, 15.5, 6.5, 6.9, -37, -8, M.wall);
  // Alarm-capable wall strips (cyan normally, red on lockdown).
  L.stripMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x35e6ff, emissiveIntensity: 1.6 });
  deco(-14.9, 14.9, 4.6, 4.8, -8.56, -8.5, L.stripMat);
  deco(-14.9, 14.9, 4.6, 4.8, -36.5, -36.44, L.stripMat);
  deco(-14.98, -14.9, 4.6, 4.8, -36.5, -8.5, L.stripMat);
  deco(14.9, 14.98, 4.6, 4.8, -36.5, -8.5, L.stripMat);
  // Hazard base trim and lane markings.
  deco(-14.9, 14.9, 0, 0.18, -36.4, -36.2, M.hazard);
  deco(-14.9, 14.9, 0, 0.18, -8.8, -8.6, M.hazard);
  deco(-3, 3, 0.005, 0.02, -11.5, -9.0, M.hazard);
  deco(-3, 3, 0.005, 0.02, -36.2, -33.8, M.hazard);
  for (const z of [-14, -22.5, -31]) { deco(-12, -11.8, 0.005, 0.02, z - 1.5, z + 1.5, M.amber); deco(11.8, 12, 0.005, 0.02, z - 1.5, z + 1.5, M.amber); }
  // Signage.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), labelTexture(['ROBOTICS', 'SECURITY WORKSHOP'], '#59e6ff'));
  sign.position.set(0, 5.4, -36.45);
  sign.rotation.y = 0;
  scene.add(sign);
  const entSign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), labelTexture(['ENTRY'], '#ffb030'));
  entSign.position.set(0, 3.7, -8.02);
  entSign.rotation.y = Math.PI;
  scene.add(entSign);
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), labelTexture(['EXIT'], '#35ff7a'));
  exitSign.position.set(0, 3.7, -36.45);
  scene.add(exitSign);

  // Lights.
  for (const [x, z] of [[-8, -14], [8, -14], [-8, -30], [8, -30], [0, -22.5]]) {
    deco(x - 1.2, x + 1.2, 6.4, 6.5, z - 0.4, z + 0.4, M.white);
    const lt = light(x, 6, z, 0xc4d8ee, 140, 24);
    L.flicker.push({ l: lt, base: 140, broken: x === 8 && z === -30, ph: Math.random() * 9 });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 6.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xaac4dd, transparent: true, opacity: 0.016, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    cone.position.set(x, 3.2, z);
    scene.add(cone);
  }
  L.alarmLights = [light(-12, 5, -22.5, 0xff1a10, 0, 22), light(12, 5, -22.5, 0xff1a10, 0, 22)];
  // Overhead gantry (decor only).
  for (const x of [-7, 7]) deco(x - 0.25, x + 0.25, 5.6, 6.1, -36, -9, M.mid);
  for (let z = -12; z > -36; z -= 6) deco(-14.8, 14.8, 5.9, 6.2, z - 0.2, z + 0.2, M.dark);
  for (const [x, z] of [[-11, -10], [11, -35]]) cyl(0.25, 4, x, 4.4, z, M.mid, 10);
  for (const z of [-12, -19, -26, -33]) { // pipes along walls
    cyl(0.18, 28, 14.6, 5.3, z, M.dark, 8).rotation.x = Math.PI / 2;
  }

  // Solid cover.
  blk(-3, 3, 0, 2.4, -24, -21, M.machine); // central island
  deco(-2.5, 2.5, 2.4, 2.6, -23.5, -21.5, M.dark);
  deco(-1.2, 1.2, 2.6, 3.4, -23.2, -22, M.machine);
  deco(-2.4, -1.2, 1.0, 1.9, -20.95, -20.9, M.screen);
  deco(1.2, 2.4, 1.0, 1.9, -20.95, -20.9, M.screenWarm);
  deco(-1.0, 1.0, 1.2, 1.5, -24.05, -24, M.amber);
  L.machines = [];
  for (const [x, z, w, h, d, mat] of [
    [-9.5, -14.5, 3.6, 2.2, 2.0, M.machine],
    [9.5, -14.5, 2.8, 3.0, 2.4, M.machineB],
    [-9.5, -30.5, 3.4, 2.5, 2.2, M.machineC],
    [9.2, -30.5, 3.0, 2.8, 2.0, M.machine],
  ]) { // machine blocks, each a different size and finish
    blk(x - w / 2, x + w / 2, 0, h, z - d / 2, z + d / 2, mat);
    deco(x - w / 2 + 0.3, x + w / 2 - 0.3, h, h + 0.25, z - d / 2 + 0.3, z + d / 2 - 0.3, M.dark);
    deco(x - 0.9, x + 0.9, 0.9, 1.7, z + d / 2, z + d / 2 + 0.04, x < 0 ? M.screen : M.screenWarm);
    deco(x - 0.9, x + 0.9, 0.9, 1.7, z - d / 2 - 0.04, z - d / 2, x < 0 ? M.screenWarm : M.screen);
    L.machines.push({ x, z, w, h, d });
  }
  for (const x of [-6.8, 6.8]) { // pillars
    blk(x - 0.45, x + 0.45, 0, 6.5, -23, -22, M.mid);
    deco(x - 0.5, x + 0.5, 0, 0.5, -23.05, -21.95, M.hazard);
  }
  for (const [x, z, w] of [[-5.5, -27, 2.6], [4.5, -28.5, 2.6], [-4, -15.5, 2.2]]) { // low barriers
    blk(x - w / 2, x + w / 2, 0, 1.1, z - 0.45, z + 0.45, M.mid);
    deco(x - w / 2, x + w / 2, 1.1, 1.18, z - 0.5, z + 0.5, M.hazard);
  }
  // Charging docks on the west wall.
  for (const z of [-13, -18, -27, -32]) {
    blk(-15, -13.4, 0, 2.4, z - 1, z + 1, M.machine);
    deco(-13.4, -13.3, 0.3, 0.6, z - 0.7, z + 0.7, M.green);
    deco(-13.45, -13.38, 1.2, 1.9, z - 0.6, z + 0.6, M.dark);
    deco(-13.4, -13.33, 1.3, 1.8, z - 0.5, z + 0.5, M.cyan);
    light(-12.6, 1.2, z, 0x35ff9a, 5, 4);
  }
  // Workstations on the east wall.
  for (const z of [-11.5, -25.5, -33.5]) {
    blk(13.4, 15, 0, 1.0, z - 1.2, z + 1.2, M.machine);
    deco(13.7, 14.0, 1.0, 1.7, z - 0.5, z + 0.5, M.dark);
    deco(13.64, 13.7, 1.05, 1.65, z - 0.45, z + 0.45, M.screen);
    cyl(0.28, 0.08, 13.9, 1.04, z + 0.9, M.light);
  }
  // Harmless scenery: crates and gray canisters (visually distinct from the red drums).
  blk(-14.2, -12.8, 0, 1.4, -35.6, -34.2, M.crate);
  blk(-14.2, -13, 1.4, 2.4, -35.4, -34.4, M.crate);
  blk(12.8, 14.4, 0, 1.2, -9.6, -8.8, M.crate);
  for (const [x, z] of [[-13.4, -22.2], [-12.7, -23.5], [-13.5, -24.5], [13.5, -18.5]]) {
    const c = cyl(0.42, 1.0, x, 0.5, z, M.grayDrum, 16);
    world.addCentered(x, 0.5, z, 0.8, 1.0, 0.8);
    cyl(0.43, 0.08, x, 0.9, z, M.dark, 16);
    c.userData.scenery = true;
  }

  // Door entities.
  L.doors.containment = new Door(scene, world, { x: 0, z: -0.25, closed: false });
  L.doors.entrance = new Door(scene, world, { x: 0, z: -8.25, closed: false });
  L.doors.exit = new Door(scene, world, { x: 0, z: -36.75, closed: true });

  // ---- Safe room: x[-4,4] z[-46,-37] h3.5 ----
  blk(-4.5, -4, 0, 3.5, -46.5, -37, M.wall);
  blk(4, 4.5, 0, 3.5, -46.5, -37, M.wall);
  blk(-4.5, 4.5, 0, 3.5, -46.5, -46, M.wall);
  blk(-4.5, 4.5, 3.5, 3.9, -46.5, -37, M.wall);
  deco(-2, 2, 3.42, 3.5, -43, -40, M.white);
  light(0, 3.1, -41.5, 0xb9ffd8, 70, 12);
  const done = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), labelTexture(['FIRST ENCOUNTER', 'COMPLETE'], '#35ff7a'));
  done.position.set(0, 2.2, -45.9);
  scene.add(done);
  deco(-3.9, 3.9, 0, 0.2, -45.9, -45.7, M.hazard);
  blk(-3.9, -2.4, 0, 0.9, -45.5, -44, M.machine);
  blk(2.4, 3.9, 0, 0.9, -45.5, -44, M.machine);

  mergeStatic(scene);

  // Per-frame ambience: flickering emergency lighting, pod glow, alarm strobe.
  L.alarm = false;
  L.update = (t) => {
    for (const f of L.flicker) {
      let k = 0.94 + 0.06 * Math.sin(t * 13 + f.ph);
      if (f.broken) k = Math.sin(t * 40 + f.ph) > 0.55 && Math.sin(t * 3.1) > 0.2 ? 0.1 : 0.85;
      f.l.intensity = f.base * k;
    }
    L.podGlow.intensity = 24 + Math.sin(t * 3.1) * 6 + (Math.random() < 0.04 ? 14 : 0);
    if (L.emergencyOn) {
      L.emergency.intensity = 26 * (0.5 + 0.5 * Math.sin(t * 5));
    } else L.emergency.intensity = 0;
    if (L.alarm) {
      const k = 0.5 + 0.5 * Math.sin(t * 7);
      L.stripMat.emissive.setHex(0xff2010);
      L.stripMat.emissiveIntensity = 0.8 + k * 2.4;
      for (const l of L.alarmLights) l.intensity = 40 + k * 260;
    } else {
      L.stripMat.emissive.setHex(0x35e6ff);
      L.stripMat.emissiveIntensity = 1.6;
      for (const l of L.alarmLights) l.intensity = 0;
    }
  };
  L.updateDoors = (dt) => { for (const d of Object.values(L.doors)) d.update(dt); };

  // Encounter layout.
  L.enemySpawns = [
    { type: 'bug', x: -7, z: -19 },
    { type: 'bug', x: 0, z: -32 },
    { type: 'bug', x: 8, z: -26 },
    { type: 'drone', x: -11, z: -24 },
    { type: 'drone', x: 11, z: -31.5 },
  ];
  L.barrelSpawns = [{ x: 5.5, z: -19 }, { x: 8.8, z: -21.5 }];
  L.world = world;
  return L;
}
