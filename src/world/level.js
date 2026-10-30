import * as THREE from 'three';
import { M, boxGeo, kitMaterial } from './materials.js';
import { Door } from './door.js';
import { mergeStatic } from './merge.js';
import { addSign } from './signs.js';
import { SpecimenDisplay, makeEvacMaterial } from './screens.js';
import { makeHuman } from './humans.js';

export const ARENA = { minX: -15, maxX: 15, minZ: -36.5, maxZ: -8.5 };
export const PLAYER_START = { x: 0.45, z: 5.0 };
export const REPLAY_START = { x: 0, z: -4 };
export const PISTOL_POS = new THREE.Vector3(0.85, 0.05, 3.9);
export const CELL = { x: 0, z: 9.2 }; // containment cell centre

export function makePistol(scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.5, metalness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x1b1f23, emissive: 0x2a8cff, emissiveIntensity: 0.9, roughness: 0.5, metalness: 0.4 });
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

// Crack pattern for the cell door as it fails.
function crackTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 640;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(230,248,255,0.95)'; g.lineWidth = 2.2; g.lineCap = 'round';
  const crack = (x, y, a, len, depth) => {
    if (depth > 4 || len < 14) return;
    const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
    g.lineWidth = Math.max(0.8, 2.6 - depth * 0.5);
    g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
    crack(nx, ny, a + (Math.random() - 0.5) * 0.7, len * 0.78, depth + 1);
    if (Math.random() < 0.7) crack(nx, ny, a + (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.8), len * 0.6, depth + 1);
  };
  for (let k = 0; k < 7; k++) crack(128 + (Math.random() - 0.5) * 20, 330 + (Math.random() - 0.5) * 60, (k / 7) * Math.PI * 2 + Math.random() * 0.4, 70 + Math.random() * 40, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  m.userData.noSnap = true;
  return m;
}

export function buildLevel(scene, world, kit) {
  const L = { lights: [], doors: {}, alarmLights: [], flicker: [], cut: {} };
  const PI = Math.PI;

  const blk = (x0, x1, y0, y1, z0, z1, mat, opts = {}) => {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const m = new THREE.Mesh(boxGeo(w, h, d, 2, x0 * 3.1 + z0 * 1.7 + y0 * 0.9), mat);
    m.position.set(x0 + w / 2, y0 + h / 2, z0 + d / 2);
    scene.add(m);
    if (opts.solid !== false) world.add(x0, y0, z0, x1, y1, z1, { tag: opts.tag || '' });
    return m;
  };
  const deco = (x0, x1, y0, y1, z0, z1, mat) => blk(x0, x1, y0, y1, z0, z1, mat, { solid: false });
  const light = (x, y, z, color, intensity, dist = 22) => {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, y, z);
    scene.add(l);
    L.lights.push(l);
    return l;
  };
  const dark = kitMaterial('PaintDark'), equip = kitMaterial('PaintEquipment'), rubber = kitMaterial('Rubber');
  const lampMat = M.white.clone(); // functional ceiling panels; tweakable by the opening
  lampMat.userData.noSnap = true;
  L.lampMat = lampMat;
  const panel = (x, z, y, w = 2.4, d = 0.7, mat = lampMat) => deco(x - w / 2, x + w / 2, y - 0.06, y, z - d / 2, z + d / 2, mat);

  // ---- Floor ----
  const floor = new THREE.Mesh(boxGeo(70, 0.2, 90, 2), M.floor);
  floor.position.set(-5, -0.11, -14);
  scene.add(floor);

  // ---- Specimen containment bay: x[-6,6] z[0,11] h4.5 ----
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
    blk(s * 6.25 - 0.05, s * 6.25 + 0.05, 0.9, 3.6, 2, 9, M.glass, { tag: 'glass' });
    kit.place(scene, 'window_frame', { x: s * 6.25, z: 5.5, rotY: s < 0 ? PI / 2 : -PI / 2 });
  }
  // kick plates keep the base of every wall reading as a single built surface
  deco(-5.98, -5.94, 0, 0.22, 0, 2), deco(-5.98, -5.94, 0, 0.22, 9, 11), deco(5.94, 5.98, 0, 0.22, 0, 2), deco(5.94, 5.98, 0, 0.22, 9, 11);
  deco(-6, 6, 0, 0.22, 10.94, 10.98, dark);

  // structure: pilasters and ceiling beams
  for (const x of [-4.8, 4.8]) { kit.place(scene, 'wall_rib_45', { x, z: 0.14 }); kit.place(scene, 'wall_rib_45', { x, z: 10.86, rotY: PI }); }
  for (const z of [1.0, 10.2]) { kit.place(scene, 'wall_rib_45', { x: -5.86, z, rotY: PI / 2 }); kit.place(scene, 'wall_rib_45', { x: 5.86, z, rotY: -PI / 2 }); }
  for (const z of [3.0, 6.4]) deco(-6, 6, 4.34, 4.5, z - 0.16, z + 0.16, dark);

  // lighting: functional ceiling panels over the work areas; a red emergency lamp for the breach
  const chamberLights = [light(0, 4.1, 2.6, 0xc6dcf0, 56, 16), light(0, 4.1, 6.4, 0xb8d4ec, 52, 15)];
  light(0, 2.4, 5.2, 0x7ab8d4, 26, 7); // spill from the specimen display
  for (const [x, z] of [[-2.8, 2.6], [2.8, 2.6], [-2.8, 6.6], [2.8, 6.6]]) panel(x, z, 4.4, 1.6, 0.5);
  L.cut.chamberLights = chamberLights;
  L.emergency = light(0, 3.8, 4.5, 0xff2a1a, 0, 12);
  L.emergencyMat = M.red;

  // containment cell: plinth, posts, emitter crown, service spine, restraint arms (Blender kit)
  L.cut.cellParts = kit.place(scene, 'cell_frame', { x: CELL.x, z: CELL.z, rotY: PI });
  L.cut.cellGlass = kit.place(scene, 'cell_glass', { x: CELL.x, z: CELL.z, rotY: PI });
  // hinged door: pivot sits on the hinge axis so the cutscene can swing it open about its real hinge
  const hinge = new THREE.Group();
  hinge.position.set(CELL.x - 0.6, 0, CELL.z - 1.04);
  hinge.rotation.y = PI;
  hinge.add(kit.instance('cell_front'));
  scene.add(hinge);
  L.cut.cellDoor = hinge;
  L.cut.cellFront = [hinge];
  hinge.traverse((o) => { if (o.isMesh && o.material === M.glass) L.cut.doorGlass = o; });
  L.cut.setDoorOpen = (a) => { hinge.rotation.y = PI + a; };
  for (const m of L.cut.cellGlass) m.renderOrder = 3;
  hinge.traverse((o) => { if (o.isMesh) o.renderOrder = 3; });
  world.add(CELL.x - 1.45, 0, CELL.z - 1.45, CELL.x + 1.45, 4.5, CELL.z + 1.45, { tag: 'cell' });
  // keep-out marking on the floor around the cell
  for (const [x0, x1, z0, z1] of [[-2.4, 2.4, 6.6, 6.78], [-2.4, 2.4, 10.82, 11], [-2.4, -2.22, 6.6, 11], [2.22, 2.4, 6.6, 11]]) deco(x0, x1, 0.012, 0.03, z0, z1, M.hazard);
  // the fluid that pools after the breach (hidden until then)
  const spill = new THREE.Mesh(new THREE.CircleGeometry(1.9, 28), M.fluid);
  spill.rotation.x = -PI / 2; spill.position.set(0, 0.025, 7.7); spill.scale.set(1, 0.7, 1); spill.visible = false;
  scene.add(spill);
  L.cut.spill = spill;
  // crack overlay on the cell door panel
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 3.0), crackTexture());
  crack.position.set(CELL.x, 1.85, CELL.z - 0.98);
  crack.renderOrder = 4;
  scene.add(crack);
  L.cut.crack = crack;

  // information display hung above the approach to the cell: reads as the specimen record
  const display = new SpecimenDisplay();
  L.cut.display = display;
  for (const m of kit.place(scene, 'display_hanging', { x: 0, z: 4.4 })) m.userData.keep = true;
  for (const m of kit.place(scene, 'SCREEN_display_hanging', { x: 0, z: 4.4 })) m.material = display.material;

  // ceiling-rail scanner: rail -> carriage -> link -> head -> probe, each with its own pivot (driven by the opening)
  const scan = kit.instance('scanner_rail');
  scan.position.set(0, 4.36, 7.7);
  scene.add(scan);
  L.cut.scanner = { root: scan, carriage: scan.getObjectByName('scanner_carriage'), link: scan.getObjectByName('scanner_link'), head: scan.getObjectByName('scanner_head'), probe: scan.getObjectByName('scanner_probe') };
  L.cut.scannerArm = scan;

  // examination table with cuffs against the west wall, instrument cart beside it
  kit.solid(scene, world, 'restraint_bed', -4.7, 5.2, PI / 2);
  kit.solid(scene, world, 'instrument_cart', -3.5, 3.4, 0);
  // operator desk and rack serving the cell; the service trunk leaves the cell and runs through the east wall to the monitoring room
  kit.solid(scene, world, 'monitor_station', 4.4, 8.5, -PI / 2);
  kit.place(scene, 'chair', { x: 3.35, z: 8.55, rotY: PI / 2 + 0.35 });
  kit.solid(scene, world, 'server_rack', 3.0, 10.4, PI);
  kit.solid(scene, world, 'server_rack', 3.9, 10.4, PI);
  kit.solid(scene, world, 'storage_cabinet', -4.9, 10.65, PI);
  kit.solid(scene, world, 'storage_cabinet', -3.85, 10.65, PI);
  deco(1.4, 6.0, 0.0, 0.1, 9.65, 10.15, dark);
  for (let i = 0; i < 3; i++) deco(1.4, 6.0, 0.1, 0.16, 9.75 + i * 0.16, 9.83 + i * 0.16, rubber);
  deco(5.95, 6.5, 0.0, 0.5, 9.5, 10.3, dark); // wall penetration collar

  // signage and the service-route display beside the door
  addSign(scene, ['SPECIMEN CONTAINMENT', 'BAY 3'], 2.6, 0, 3.78, 0.05, 0, { accent: '#d99a1c' });
  addSign(scene, ['MONITORING'], 1.5, 6.04, 3.95, 5.5, -PI / 2, { accent: '#3aa7b8', w: 768, h: 192 });
  addSign(scene, ['SAMPLE ANALYSIS'], 1.9, -6.04, 3.95, 5.5, PI / 2, { accent: '#3aa7b8', w: 768, h: 192 });
  addSign(scene, ['NO ENTRY BEYOND LINE'], 1.7, 0, 0.35, 10.97, PI, { accent: '#c9402a', w: 768, h: 192 });
  const evacMat = makeEvacMaterial();
  const evac = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), evacMat);
  evac.position.set(-3.5, 1.7, 0.06);
  const evacBezel = new THREE.Mesh(new THREE.BoxGeometry(1.58, 1.08, 0.05), dark);
  evacBezel.position.set(-3.5, 1.7, 0.03);
  scene.add(evac, evacBezel);
  L.cut.evacPos = new THREE.Vector3(-3.5, 1.7, 0.06);
  const evacGlow = new THREE.Group();
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  glowMat.userData.noSnap = true;
  for (const [w, h, x, y] of [[1.7, 0.06, 0, 0.58], [1.7, 0.06, 0, -0.58], [0.06, 1.2, -0.82, 0], [0.06, 1.2, 0.82, 0]]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glowMat);
    bar.position.set(x, y, 0);
    evacGlow.add(bar);
  }
  evacGlow.position.set(-3.5, 1.7, 0.09);
  evacGlow.userData.keep = true;
  scene.add(evacGlow);
  L.cut.evacGlow = glowMat;
  L.cut.sealPower = 1; // 1 = containment seal powered, 0 = dead

  // ---- East: monitoring room behind the window (operators watch the cell and the trial telemetry) ----
  deco(6.5, 16.5, 3.34, 3.5, -0.5, 11.5, dark);
  deco(16.4, 16.5, 0, 3.5, -0.5, 11.5, kitMaterial('PaintStructural'));
  deco(6.5, 16.5, 0, 3.5, -0.6, -0.5, kitMaterial('PaintStructural'));
  deco(6.5, 16.5, 0, 3.5, 11.5, 11.6, kitMaterial('PaintStructural'));
  panel(10.5, 3.2, 3.34, 1.8, 0.5); panel(10.5, 8.0, 3.34, 1.8, 0.5);
  light(10.5, 3.0, 5.5, 0xa8c8dc, 38, 12);
  for (const z of [2.8, 8.2]) { kit.solid(scene, world, 'monitor_station', 8.4, z, -PI / 2); kit.place(scene, 'chair', { x: 7.3, z, rotY: PI / 2 }); }
  for (const z of [1.6, 2.5, 3.4]) kit.place(scene, 'server_rack', { x: 15.5, z, rotY: -PI / 2 });
  deco(6.0, 15.2, 0.0, 0.1, 9.65, 10.15, dark); // the trunk continues to the racks
  deco(14.8, 15.2, 0.0, 0.1, 1.2, 10.15, dark);
  for (let i = 0; i < 3; i++) deco(6.0, 14.9, 0.1, 0.16, 9.75 + i * 0.16, 9.83 + i * 0.16, rubber);

  // ---- West: equipment preparation and sample analysis behind the window ----
  deco(-16.5, -6.5, 3.34, 3.5, -0.5, 11.5, dark);
  deco(-16.5, -16.4, 0, 3.5, -0.5, 11.5, kitMaterial('PaintStructural'));
  deco(-16.5, -6.5, 0, 3.5, -0.6, -0.5, kitMaterial('PaintStructural'));
  deco(-16.5, -6.5, 0, 3.5, 11.5, 11.6, kitMaterial('PaintStructural'));
  panel(-11, 3.4, 3.34, 1.8, 0.5); panel(-11, 8.0, 3.34, 1.8, 0.5);
  light(-11, 3.0, 5.5, 0xd8d4c4, 36, 12);
  kit.place(scene, 'analysis_bench', { x: -9.2, z: 3.2, rotY: PI / 2 });
  kit.place(scene, 'analysis_bench', { x: -9.2, z: 7.9, rotY: PI / 2 });
  kit.place(scene, 'instrument_cart', { x: -8.0, z: 5.5, rotY: 0.2 });
  for (let i = 0; i < 4; i++) kit.place(scene, 'storage_cabinet', { x: -16.1, z: 2.2 + i * 1.08, rotY: PI / 2 });
  kit.place(scene, 'storage_rack', { x: -15.9, z: 9.2, rotY: PI / 2 });
  addSign(scene, ['SAMPLE PREP', 'STORAGE'], 1.4, -16.38, 2.6, 8.0, PI / 2, { accent: '#3aa7b8', w: 768, h: 256 });

  // ---- Researcher and officer silhouettes for the opening (hidden in play) ----
  L.cut.researcher = makeHuman('researcher');
  L.cut.officer = makeHuman('officer');
  scene.add(L.cut.researcher, L.cut.officer);

  // Pistol on the floor near the cell (dropped by the officer during the breach)
  L.pistol = makePistol(1.25);
  L.pistol.position.copy(PISTOL_POS);
  L.pistol.rotation.set(0, 0.7, 1.45);
  L.pistol.position.y = 0.07;
  L.pistol.visible = false;
  scene.add(L.pistol);
  L.pistolLight = light(PISTOL_POS.x, 0.5, PISTOL_POS.z, 0x4aa0ff, 0, 3);

  // ---- Security link corridor: x[-1.5,1.5] z[-8,-0.5] h3.5 ----
  blk(-2, -1.5, 0, 3.5, -8.5, -0.5, M.wall);
  blk(1.5, 2, 0, 3.5, -8.5, -0.5, M.wall);
  blk(-2, 2, 3.5, 3.9, -8.5, -0.5, M.wall);
  deco(-1.5, -1.46, 0, 0.2, -8, -0.5, dark); deco(1.46, 1.5, 0, 0.2, -8, -0.5, dark);
  for (const z of [-2.0, -4.2, -6.4]) panel(0, z, 3.5, 1.2, 0.5);
  light(0, 3.2, -4, 0xc8dcf0, 36, 10);
  kit.place(scene, 'door_frame', { x: 0, z: -0.25 });
  kit.place(scene, 'door_frame', { x: 0, z: -8.25 });
  deco(1.46, 1.5, 1.0, 2.2, -4.2, -3.0, dark); // service hatch
  addSign(scene, ['SERVICE ACCESS'], 1.0, 1.43, 1.6, -3.6, -PI / 2, { accent: '#d99a1c', w: 768, h: 192 });
  addSign(scene, ['HANGAR', 'ROBOTICS DECK'], 1.7, -1.43, 2.2, -5.2, PI / 2, { accent: '#3aa7b8', arrow: '▲', w: 1024, h: 256 });
  addSign(scene, ['SECURITY CHECKPOINT'], 2.2, 0, 3.55, -0.56, PI, { accent: '#c9402a', w: 1024, h: 256 });

  // ---- Robotics security workshop: x[-15,15] z[-36.5,-8.5] h6.5 ----
  blk(-15.5, -1.5, 0, 6.5, -8.5, -8, M.wall);
  blk(1.5, 15.5, 0, 6.5, -8.5, -8, M.wall);
  blk(-1.5, 1.5, 3, 6.5, -8.5, -8, M.wall);
  blk(-15.5, -15, 0, 6.5, -37, -8, M.wall);
  blk(15, 15.5, 0, 6.5, -37, -8, M.wall);
  blk(-15.5, -1.5, 0, 6.5, -37, -36.5, M.wall);
  blk(1.5, 15.5, 0, 6.5, -37, -36.5, M.wall);
  blk(-1.5, 1.5, 3, 6.5, -37, -36.5, M.wall);
  blk(-15.5, 15.5, 6.5, 6.9, -37, -8, M.wall);
  kit.place(scene, 'door_frame', { x: 0, z: -36.75 });
  // kick plates and structural ribs
  for (const [x0, x1, z0, z1] of [[-15, -14.96, -36.5, -8.5], [14.96, 15, -36.5, -8.5]]) deco(x0, x1, 0, 0.3, z0, z1, dark);
  deco(-15, 15, 0, 0.3, -36.46, -36.5, dark); deco(-15, -1.5, 0, 0.3, -8.54, -8.5, dark); deco(1.5, 15, 0, 0.3, -8.54, -8.5, dark);
  for (const z of [-10.2, -15.6, -22.5, -29.4, -35.0]) kit.place(scene, 'wall_rib_65', { x: -14.86, z, rotY: PI / 2 });
  for (const z of [-9.6, -15.0, -19.5, -29.2, -35.4]) kit.place(scene, 'wall_rib_65', { x: 14.86, z, rotY: -PI / 2 });
  for (const x of [-9, 9]) { kit.place(scene, 'wall_rib_65', { x, z: -8.64 - 0.0, rotY: PI }); kit.place(scene, 'wall_rib_65', { x, z: -36.36, rotY: 0 }); }
  // overhead gantry
  for (const x of [-7, 7]) deco(x - 0.25, x + 0.25, 5.6, 6.1, -36, -9, kitMaterial('PaintStructural'));
  for (const z of [-14, -22.5, -31]) deco(-14.8, 14.8, 5.9, 6.2, z - 0.2, z + 0.2, dark);
  // lighting: ceiling panels with real lights below, red lockdown lamps
  for (const [x, z] of [[-8, -14], [8, -14], [-8, -30], [8, -30], [0, -22.5]]) {
    panel(x, z, 6.5, 2.4, 0.8);
    const lt = light(x, 6, z, 0xc4d8ee, 135, 24);
    L.flicker.push({ l: lt, base: 135, broken: x === 8 && z === -30, ph: Math.random() * 9 });
  }
  L.alarmLights = [light(-12, 5, -22.5, 0xff1a10, 0, 22), light(12, 5, -22.5, 0xff1a10, 0, 22)];

  // cover and equipment (Blender kit; colliders come from the kit's own collision boxes)
  kit.solid(scene, world, 'robot_test_cell', 0, -22.5);
  for (const [x, z] of [[-6.8, -22.5], [6.8, -22.5]]) kit.solid(scene, world, 'pillar', x, z);
  const cabinets = [['equip_cabinet_A', -9.5, -14.5], ['equip_cabinet_B', 9.5, -14.5], ['equip_cabinet_C', -9.5, -30.5], ['equip_cabinet_D', 9.2, -30.5]];
  L.cut.arenaBeacons = [];
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff4a18, emissiveIntensity: 0.1 });
  beaconMat.userData.noSnap = true;
  L.beaconMat = beaconMat;
  for (const [name, x, z] of cabinets) {
    kit.solid(scene, world, name, x, z);
    const f = kit.footprint(name);
    kit.place(scene, 'beacon', { x, y: f.h + 0.14, z });
    for (const m of kit.place(scene, 'LENS_beacon', { x, y: f.h + 0.14, z })) m.material = beaconMat;
  }
  for (const [name, x, z] of [['barrier_26', -5.5, -27], ['barrier_26', 4.5, -28.5], ['barrier_22', -4, -15.5]]) kit.solid(scene, world, name, x, z);
  for (const z of [-13, -18, -27, -32]) kit.solid(scene, world, 'charging_dock', -14.2, z, PI / 2);
  for (const z of [-11.5, -25.5, -33.5]) kit.solid(scene, world, 'workstation', 14.2, z, -PI / 2);
  kit.solid(scene, world, 'crate_A', -13.5, -34.9);
  kit.solid(scene, world, 'crate_top', -13.5, -34.9, 0, 1.4);
  kit.solid(scene, world, 'crate_B', 13.6, -9.2);
  for (const [x, z] of [[-13.4, -22.2], [-12.7, -23.5], [-13.5, -24.5], [13.5, -18.5]]) kit.solid(scene, world, 'canister', x, z);

  // hazardous storage: the two red drums stand on a marked flammables pad beside the east cabinets
  for (const [x0, x1, z0, z1] of [[4.1, 10.5, -23.4, -23.25], [4.1, 10.5, -17.45, -17.3], [4.1, 4.25, -23.4, -17.3], [10.35, 10.5, -23.4, -17.3]]) deco(x0, x1, 0.012, 0.03, z0, z1, M.hazard);
  addSign(scene, ['FLAMMABLE STORAGE'], 1.6, 10.43, 1.9, -20.4, -PI / 2, { accent: '#c9402a', w: 768, h: 192 });

  // signage: where you are, where the bays are, and the way out
  addSign(scene, ['ROBOTICS', 'SECURITY WORKSHOP'], 3.4, 0, 5.2, -36.42, 0, { accent: '#3aa7b8' });
  addSign(scene, ['HANGAR ACCESS'], 2.4, 0, 3.72, -36.45, 0, { accent: '#35c06a', arrow: '▼', w: 1024, h: 256 });
  addSign(scene, ['ROBOTICS DECK'], 2.2, 0, 3.55, -8.54, 0, { accent: '#d99a1c', w: 1024, h: 256 });
  for (let i = 0; i < 4; i++) addSign(scene, ['CHARGING', `BAY ${i + 1}`], 1.0, -14.93, 3.0, [-13, -18, -27, -32][i], PI / 2, { accent: '#3aa7b8', w: 512, h: 256 });
  for (let i = 0; i < 3; i++) addSign(scene, [`SERVICE ${i + 1}`], 1.0, 14.93, 2.1, [-11.5, -25.5, -33.5][i], -PI / 2, { accent: '#d99a1c', w: 512, h: 192 });

  // ---- Hangar transit room: x[-4,4] z[-46,-37] h3.5 ----
  blk(-4.5, -4, 0, 3.5, -46.5, -37, M.wall);
  blk(4, 4.5, 0, 3.5, -46.5, -37, M.wall);
  blk(-4.5, 4.5, 0, 3.5, -46.5, -46, M.wall);
  blk(-4.5, 4.5, 3.5, 3.9, -46.5, -37, M.wall);
  panel(0, -41.5, 3.5, 2.0, 0.8);
  light(0, 3.1, -41.5, 0xcfe6dc, 55, 12);
  addSign(scene, ['HANGAR TRANSIT', 'LIFT 2 · DECK 9'], 3.0, 0, 2.3, -45.9, 0, { accent: '#35c06a' });
  kit.solid(scene, world, 'storage_cabinet', -3.5, -45.6, 0);
  kit.solid(scene, world, 'storage_cabinet', 3.5, -45.6, 0);

  // ---- Doors ----
  L.doors.containment = new Door(scene, world, { x: 0, z: -0.25, closed: false, kit });
  L.doors.entrance = new Door(scene, world, { x: 0, z: -8.25, closed: false, kit });
  L.doors.exit = new Door(scene, world, { x: 0, z: -36.75, closed: true, kit });

  // Per-frame state: flickering lamps, lockdown strobes
  L.alarm = false;
  L.surge = 0; // opening: electrical overload of the containment system
  L.update = (t) => {
    for (const f of L.flicker) {
      let k = 0.94 + 0.06 * Math.sin(t * 13 + f.ph);
      if (f.broken) k = Math.sin(t * 40 + f.ph) > 0.55 && Math.sin(t * 3.1) > 0.2 ? 0.15 : 0.9;
      f.l.intensity = f.base * k;
    }
    const status = kitMaterial('Status');
    const sp = L.cut.sealPower;
    if (L.surge > 0.01) { // chamber lamps stutter, status lights strobe
      const k = Math.random() < 0.35 * L.surge ? 0.12 : 0.85 + Math.random() * 0.2;
      chamberLights[0].intensity = 56 * k; chamberLights[1].intensity = 52 * (Math.random() < 0.3 * L.surge ? 0.1 : 1);
      lampMat.emissiveIntensity = 1.5 * k;
      status.emissiveIntensity = 1.3 + 2.4 * L.surge * (0.5 + 0.5 * Math.sin(t * 30));
    } else if (sp < 1) {                                                   // seal power gone: status lights die, chamber dims
      status.emissiveIntensity = 1.3 * sp;
      chamberLights[0].intensity = 56 * (0.35 + 0.65 * sp); chamberLights[1].intensity = 52 * (0.35 + 0.65 * sp);
      lampMat.emissiveIntensity = 1.5 * (0.35 + 0.65 * sp);
    } else {
      chamberLights[0].intensity = 56; chamberLights[1].intensity = 52; lampMat.emissiveIntensity = 1.5; status.emissiveIntensity = 1.3;
    }
    const strobe = 0.5 + 0.5 * Math.sin(t * 7);
    if (L.emergencyOn) L.emergency.intensity = 30 * strobe; else L.emergency.intensity = 0;
    if (L.alarm) {
      for (const l of L.alarmLights) l.intensity = 40 + strobe * 240;
      beaconMat.emissiveIntensity = 0.2 + strobe * 3;
    } else {
      for (const l of L.alarmLights) l.intensity = 0;
      beaconMat.emissiveIntensity = L.emergencyOn ? 0.2 + strobe * 3 : 0.1;
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
  mergeStatic(scene);
  return L;
}
