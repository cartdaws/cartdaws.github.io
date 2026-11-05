import * as THREE from 'three';
import { clamp, damp, lerp, smooth, seg } from '../core/util.js';

// FREE FLIGHT. After the humans burn the homeworld, the survivor takes the human lander and flies it out of orbit, across open space, to the research
// vessel where the humans keep their captives. Everything here lives in its own group far from the facility; entering swaps the sky and fog, leaving
// restores them. Units are metres. The vessel is about a kilometre long.
const OFFSET = new THREE.Vector3(8000, 0, 0);       // the space group sits well away from the facility and the homeworld
const VESSEL = new THREE.Vector3(700, 120, -5600);  // the research vessel, relative to the start
const BAY = new THREE.Vector3(700, 78, -5880);      // the docking bay mouth in the underside of the bow (relative to the start)
const DOCK = new THREE.Vector3(700, 52, -5700);     // the approach point under the hull: fly through here, slowly, to be drawn in
const PLANET = new THREE.Vector3(-300, -1500, 900); // the homeworld, below and behind the launch point

const q = new THREE.Quaternion(), e = new THREE.Euler(), _v = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();

function glowTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
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
  // night-side glow of the burning settlements is added in the shader by emissive map
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}

// The human lander: used both as the wreck on the planet and as the player's ship in flight. Length about 7 m, nose along -Z.
export function makeLander() {
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
  g.userData.engines = [-0.9, 0.9].map((x) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(150,230,255,1)'), color: 0x8fe8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.position.set(x, -0.1, 2.9); s.scale.setScalar(1.6); g.add(s); return s; });
  return g;
}

// The research vessel: a long spine, a rotating habitat ring, lit decks, antennae, and a brightly lit bay mouth on the underside of the bow.
function makeVessel() {
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

export class Flight {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.group = new THREE.Group(); this.group.position.copy(OFFSET); this.group.visible = false;
    game.scene.add(this.group);

    // stars follow the camera so they never get closer
    const N = 3200, p = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - u * u), d = 7000;
      p[i * 3] = Math.cos(a) * r * d; p[i * 3 + 1] = u * d; p[i * 3 + 2] = Math.sin(a) * r * d;
      const tint = Math.random(); col[i * 3] = 0.7 + 0.3 * tint; col[i * 3 + 1] = 0.8 + 0.2 * (1 - tint); col[i * 3 + 2] = 1;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 9, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false; this.group.add(this.stars);
    this.stars.material.size = 2.2;

    // the homeworld, with a thin atmosphere and a night-side glow
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1200, 64, 40), new THREE.MeshStandardMaterial({ map: planetTexture(), roughness: 0.9, metalness: 0, emissive: 0x0a2a30, emissiveIntensity: 0.6 }));
    this.planet.position.copy(PLANET); this.group.add(this.planet);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(1245, 48, 32), new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.16, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    atm.position.copy(PLANET); this.group.add(atm);
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

    // the research vessel
    this.vessel = makeVessel(); this.vessel.position.copy(VESSEL); this.group.add(this.vessel);

    // the human warship that attacked the planet, leaving orbit with the survivors
    this.warship = new THREE.Group();
    { const hull = new THREE.MeshStandardMaterial({ color: 0x7c868c, roughness: 0.55, metalness: 0.6 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), hull); body.scale.set(150, 16, 40); this.warship.add(body);
      const top = new THREE.Mesh(new THREE.BoxGeometry(110, 10, 22), hull); top.position.y = 14; this.warship.add(top);
      for (let i = -3; i <= 3; i++) { const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,180,60,1)'), color: 0xffb040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); l.position.set(i * 30, -10, 0); l.scale.setScalar(10); this.warship.add(l); }
      const eng = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(150,220,255,1)'), color: 0x8fe0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); eng.position.set(150, 0, 0); eng.scale.setScalar(120); this.warship.add(eng); this.warshipGlow = eng; }
    this.warship.position.set(-500, -150, -200); this.group.add(this.warship);

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
    this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.speed = 0; this.throttle = 0.5;
    this.yawRate = 0; this.pitchRate = 0; this.roll = 0; this.camPos = new THREE.Vector3(); this.camQuat = new THREE.Quaternion();
    this.shake = 0; this.t = 0; this.phase = 'off'; this.docking = null; this.hull = 100;
    this.speedLines = null; this.cine = new THREE.Camera(); this.qs = new THREE.Quaternion();

    // flight HUD
    const hud = document.createElement('div'); hud.id = 'flight-hud'; hud.className = 'hidden';
    hud.innerHTML = '<div class="fh-ret"></div><div class="fh-l"><b id="fh-spd">0</b><small>M/S</small><i><u id="fh-thr"></u></i><span id="fh-boost">BOOST</span></div><div class="fh-r"><small>RESEARCH VESSEL</small><b id="fh-dist">--</b><small>KM</small></div><div class="fh-hull"><u id="fh-hull"></u></div><div class="fh-keys"><span><kbd>MOUSE</kbd>STEER</span><span><kbd>W</kbd><kbd>S</kbd>THROTTLE</span><span><kbd>A</kbd><kbd>D</kbd>BANK</span><span><kbd>SHIFT</kbd>BOOST</span><span><kbd>SPACE</kbd>BRAKE</span></div>';
    document.body.appendChild(hud); this.hud = hud;
    const st = document.createElement('style');
    st.textContent = '#flight-hud{position:fixed;inset:0;pointer-events:none;z-index:6;font-family:inherit;color:#9ff5ea;text-shadow:0 0 8px rgba(80,255,230,.5)}#flight-hud.hidden{display:none}'
      + '.fh-ret{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border:1px solid rgba(159,245,234,.55);border-radius:50%}.fh-ret:after{content:"";position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;background:#9ff5ea;border-radius:50%}'
      + '.fh-l{position:absolute;left:36px;bottom:40px;display:flex;flex-direction:column;gap:4px}.fh-l b,.fh-r b{font-size:34px;font-weight:600;letter-spacing:.04em}.fh-l small,.fh-r small{font-size:11px;letter-spacing:.3em;opacity:.7}'
      + '.fh-l i{display:block;width:160px;height:5px;background:rgba(10,30,34,.6);border:1px solid rgba(159,245,234,.45)}.fh-l u{display:block;height:100%;width:50%;background:#9ff5ea}#fh-boost{font-size:11px;letter-spacing:.3em;opacity:.25}#fh-boost.on{opacity:1;color:#ffd27a}'
      + '.fh-r{position:absolute;right:36px;bottom:40px;text-align:right;display:flex;flex-direction:column;gap:2px}.fh-hull{position:absolute;left:50%;bottom:22px;width:180px;margin-left:-90px;height:4px;background:rgba(10,30,34,.6);border:1px solid rgba(159,245,234,.35)}.fh-hull u{display:block;height:100%;background:#7affc4}';
    st.textContent += '.fh-keys{position:absolute;left:50%;top:18px;transform:translateX(-50%);display:flex;gap:18px;padding:8px 16px;background:rgba(6,16,20,.55);border:1px solid rgba(159,245,234,.3);font-size:11px;letter-spacing:.22em;white-space:nowrap}.fh-keys span{display:flex;align-items:center;gap:6px;opacity:.9}.fh-keys kbd{font:inherit;padding:2px 6px;border:1px solid rgba(159,245,234,.6);background:rgba(159,245,234,.12);color:#d8fff8;letter-spacing:.12em}@media(max-width:700px){.fh-keys{flex-wrap:wrap;justify-content:center;gap:8px 12px;width:92vw;font-size:9px}}';
    document.head.appendChild(st);
  }

  // Enter flight just after liftoff: the ship hangs over the burning world, pointed at the research vessel.
  start() {
    const g = this.g, s = g.scene, c = g.camera;
    this.saved = { bg: s.background, fog: s.fog, far: c.far, exp: g.renderer.toneMappingExposure };
    s.background = new THREE.Color(0x02040a); s.fog = null;
    c.far = 16000; c.updateProjectionMatrix();
    this.group.visible = this.sun.visible = this.fill.visible = true;
    this.active = true; this.t = 0; this.phase = 'launch'; this.docking = null; this.hull = 100; this.shake = 0.4;
    this.pos.set(0, 0, 0); this.speed = 20; this.throttle = 0.45; this.roll = 0;
    const look = _v.copy(DOCK).sub(this.pos).normalize();
    this.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), look);
    this.camPos.copy(this.pos).addScaledVector(_f.set(0, 0, 1).applyQuaternion(this.quat), 18).add(_u.set(0, 5, 0)); this.camQuat.copy(this.quat);
    this.warship.position.set(-500, -150, -200); this.warship.visible = true; this.warshipT = 0;
    for (const d of this.debris) d.userData.hit = false;
    g.viewmodel.root.visible = false; g.body.setVisible(false);
    g.ui.showHud(true); g.ui.setObjective('FLY TO THE RESEARCH VESSEL'); g.ui.setPrompt('');
    document.body.classList.add('intro'); // hides the on-foot crosshair, health and weapon readouts
    this.hud.classList.remove('hidden');
    g.audio.stopSiren?.();
    g.ui.fade(0);
    g.ui.subtitle('The elder... they took the elder. And the others.', '', 3.4, true);
    this.f = {};
  }

  stop() {
    if (!this.active) return;
    const g = this.g, s = g.scene, c = g.camera;
    s.background = this.saved.bg; s.fog = this.saved.fog; c.far = this.saved.far; c.updateProjectionMatrix();
    this.group.visible = this.sun.visible = this.fill.visible = false;
    this.active = false; this.phase = 'off';
    g.viewmodel.root.visible = true;
    document.body.classList.remove('intro');
    this.hud.classList.add('hidden');
  }

  distance() { return this.pos.distanceTo(DOCK); }

  update(dt, input, lx, ly) {
    if (!this.active) return;
    const g = this.g;
    this.t += dt;
    this.stars.position.copy(this.camPos);
    const live = input.locked && this.phase !== 'docked' && !this.docking;

    // ---- steering: the mouse points the nose, A and D bank and yaw, W and S set the throttle, Shift boosts, Space brakes
    const sens = (g.sens || 0.0022) * 0.9;
    let yawIn = 0, pitchIn = 0, rollIn = 0;
    if (live) {
      yawIn = -lx * sens * 1.4; pitchIn = -ly * sens * 1.4;
      if (input.down('KeyA')) rollIn += 1; if (input.down('KeyD')) rollIn -= 1;
      if (input.down('KeyW')) this.throttle = Math.min(1, this.throttle + dt * 0.5);
      if (input.down('KeyS')) this.throttle = Math.max(0.1, this.throttle - dt * 0.5);
    }
    this.yawRate = damp(this.yawRate, clamp(yawIn / Math.max(dt, 1e-3), -1.6, 1.6) + rollIn * -0.7, 7, dt);
    this.pitchRate = damp(this.pitchRate, clamp(pitchIn / Math.max(dt, 1e-3), -1.4, 1.4), 7, dt);
    this.roll = damp(this.roll, rollIn * 0.6 + clamp(this.yawRate * 0.25, -0.5, 0.5), 5, dt);
    if (!this.docking) {
      e.set(this.pitchRate * dt, this.yawRate * dt, 0, 'YXZ'); q.setFromEuler(e);
      this.quat.multiply(q).normalize();
    }
    const boost = live && (input.down('ShiftLeft') || input.down('ShiftRight'));
    const brake = live && input.down('Space');
    const target = this.docking ? 14 : (boost ? 360 : 40 + this.throttle * 120) * (brake ? 0.25 : 1);
    this.speed = damp(this.speed, target, boost ? 1.6 : 1.1, dt);
    _f.set(0, 0, -1).applyQuaternion(this.quat);
    this.pos.addScaledVector(_f, this.speed * dt);

    // ---- wreckage: a glancing hit costs hull and shoves the ship; the field thins out toward the vessel
    for (const d of this.debris) {
      d.rotation.x += d.userData.spin.x * dt; d.rotation.y += d.userData.spin.y * dt; d.rotation.z += d.userData.spin.z * dt;
      const dist = d.position.distanceTo(this.pos);
      if (dist < d.userData.r + 3.5 && !this.docking) {
        if (!d.userData.hit) { d.userData.hit = true; this.hull = Math.max(8, this.hull - (this.speed > 150 ? 14 : 7)); this.shake = 0.5; g.audio.play('hurt', { vol: 0.5 }); g.audio.play('clatter', { vol: 0.7 }); }
        _v.copy(this.pos).sub(d.position).normalize(); this.pos.addScaledVector(_v, (d.userData.r + 3.5 - dist) + 0.5); this.speed *= 0.55;
      } else if (dist > d.userData.r + 40) d.userData.hit = false;
    }
    this.hull = Math.min(100, this.hull + dt * 0.4);

    // ---- the launch: the warship leaves orbit with a flash of its drive
    if (this.phase === 'launch') {
      this.warshipT += dt;
      this.warship.position.x -= (30 + this.warshipT * this.warshipT * 18) * dt; this.warship.position.z -= (40 + this.warshipT * 55) * dt; this.warship.position.y += 8 * dt;
      this.warshipGlow.scale.setScalar(120 + 80 * Math.sin(this.warshipT * 3));
      if (this.warshipT > 9) { this.warship.visible = false; this.phase = 'cruise'; }
    }

    // ---- story beats along the way
    const dist = this.distance();
    if (dist < 4200 && !this.f.b) { this.f.b = true; g.ui.subtitle('Their ship is headed there. The vessel. Whatever they took, it is aboard.', '', 4, true); g.audio.play('pa', { vol: 0.4 }); }
    if (dist < 2300 && !this.f.c) { this.f.c = true; g.ui.subtitle('Unidentified craft. You are approaching a restricted vessel. Turn back.', 'SHIP AI', 4.4); g.audio.play('alert', { vol: 0.4 }); }
    if (dist < 900 && !this.f.d) { this.f.d = true; g.ui.setObjective('ENTER THE DOCKING BAY'); g.ui.hint('FLY INTO THE LIT BAY  ·  SLOW DOWN TO DOCK', 5); }

    // ---- docking: steer into the glowing mouth of the bay at a safe speed and the ship is pulled in
    if (!this.docking && dist < 70 && this.speed < 150) {
      this.docking = { t: 0 }; g.ui.setPrompt(''); g.audio.play('door', { vol: 0.8 }); g.ui.subtitle('Docking clamps engaged.', 'SHIP AI', 2.6);
    } else if (!this.docking && dist < 70 && this.speed >= 150) {
      g.ui.setPrompt('TOO FAST TO DOCK  ·  SLOW DOWN');
    } else if (!this.docking && dist >= 70) g.ui.setPrompt('');
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
    this.vessel.userData.ring.rotation.z += dt * 0.05;
    for (let i = 0; i < this.vessel.userData.lights.length; i++) this.vessel.userData.lights[i].material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(this.t * 4 - i * 0.7));
    this.fires.material.opacity = 0.6 + 0.3 * Math.sin(this.t * 3);

    // ---- HUD
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
