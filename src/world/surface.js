import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HomeLife, addWind } from './homeLife.js';
import { NavGrid } from './nav.js';
import { makeLander } from '../game/flight.js';
import { addCockpit, SEAT_EYE, YOKE_GRIP } from '../game/cockpit.js';
import { progress } from '../game/progress.js';
import { WORLD_VOICE } from '../game/campaign.js';

// THE OTHER WORLDS. Everything you see from orbit can be landed on. Each world is a walkable surface around one settlement: terrain you stand on, its own sky and
// weather, plants and animals, and the people who live there. The humans have been here too. Models: art/build_worlds.py, art/build_valley_life.py. Textures: Poly Haven, CC0.
export const ORIGIN = new THREE.Vector3(-7000, 0, 0);          // far beyond the view from the ship, the valley and space
const FLAT = 58, WALL = 178;                                    // the settlement stands on level ground; the land rises and closes in beyond it
const ease = (t, a, b) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
const R = (a, b) => a + Math.random() * (b - a);

// --------------------------------------------------------------------- the worlds
export const WORLDS = {
  vael: {
    name: 'VAEL', sub: 'HUMAN MINING MOON', tex: 'rocky_terrain_02', rock: 'rusty_metal_02', tint: 0xd0cfd8, rockTint: 0x8a8480, repeat: 28, amp: 7, rim: 34,
    env: 0xf4f2ff, sky: { top: 0x010207, hor: 0x161a24, sun: 0xfff6ea, sunI: 5.0, hemi: 0.5, fill: 0x5fb8b0, dir: [0.62, 0.36, -0.5], fog: 0.0009, stars: 1, disc: 1500, halo: 0.12 }, body: { kind: 'home', size: 340, at: [-0.5, 0.42, -0.72] }, gravity: 0.46, scene: 'space', wx: { type: 'dust', color: 0x8d8d90, n: 90, v: [0.2, 0.05, 0.1], size: 0.05 },
    obj: 'THE POST HAS FUEL. WAKE ITS TERMINAL', early: 'A post with machines on it. They keep moving their cargo through here.', flora: null, animals: null,
    intro: 'Their machines dig here. They have left a post running.',
  },
  ochre: {
    name: 'OCHRE', sub: 'KESSITH TRADERS', tex: 'coast_sand_01', rock: 'aerial_rocks_02', tint: 0xffcf98, rockTint: 0xb87850, repeat: 22, amp: 15, rim: 46,
    env: 0xffd8a8, sky: { top: 0x4a3060, hor: 0xeaa060, sun: 0xffdcae, sunI: 3.6, hemi: 0.78, dir: [-0.42, 0.56, 0.5], fog: 0.0026, disc: 520, halo: 0.5 }, body: { color: '#e8d0c0', size: 70, at: [0.5, 0.45, -0.7] }, gravity: 1, scene: 'desert', wx: { type: 'sand', color: 0xe0b080, n: 260, v: [3.6, 0.05, 1.2], size: 0.07 },
    obj: 'THE SPEAKER SELLS PLATING', early: 'Not the elder. Not yet.', flora: { frond: 0xc09a60, leaf: 0xd8a848, cap: 0xb06a3a, curl: 0xc89a50, glow: 0xffc070 }, animals: { striders: 2, skin: 0x5a3f2a },
    intro: 'A settlement. Not theirs. Lamps, cloth, and something tall in robes.',
  },
  skarn: {
    name: 'SKARN', sub: 'GROLM ICE DIGS', tex: 'snow_02', rock: 'aerial_rocks_02', tint: 0xffffff, tintK: 1.45, rockTint: 0x6a8498, repeat: 18, amp: 13, rim: 42,
    env: 0xd6ecff, sky: { top: 0x0e3048, hor: 0xbfe2ea, sun: 0xeaf4ff, sunI: 2.5, hemi: 1.05, dir: [0.34, 0.3, 0.62], fog: 0.0036, disc: 2800, halo: 0.34 }, body: { kind: 'giant', size: 300, at: [-0.62, 0.34, -0.5] }, gravity: 1, scene: 'ice', wx: { type: 'snow', color: 0xffffff, n: 420, v: [1.3, -2.1, 0.5], size: 0.07 },
    obj: 'THE DIG HAS COOLANT. CLEAR ITS SHAFTS', early: 'Not the elder. Not yet.', flora: { frond: 0x6a8aa6, leaf: 0x86c0d8, cap: 0x5a8ab8, curl: 0x70a8c0, glow: 0x7fe8ff }, animals: { striders: 0, skin: 0x2a3a4a },
    intro: 'Cold. Something is breaking the ice with its hands, and something is hunting it.',
  },
  thule: {
    name: 'THULE', sub: 'UMMARI CLOUD REEF', tex: 'aerial_rocks_02', rock: 'rocky_terrain_02', tint: 0xd8b0d4, rockTint: 0x8a6a98, repeat: 16, amp: 5, rim: 0, islands: true,
    env: 0xffd2e4, sky: { top: 0x1a2868, hor: 0xf0a6a0, sun: 0xffe6c0, sunI: 2.5, hemi: 0.9, dir: [0.2, 0.24, -0.9], fog: 0.0024, disc: 2400, halo: 0.42, ring: [0xe8d0e8, 0.3, 0.92, 0.2] }, body: { color: '#eef4f8', size: 28, at: [-0.5, 0.5, 0.4] }, gravity: 0.72, scene: 'reef', wx: { type: 'spore', color: 0xffd8ff, n: 200, v: [0.6, 0.35, 0.3], size: 0.075 },
    obj: 'THE UMMARI HEARD THE FLEET PASS', early: 'Not the elder. Not yet.', flora: { frond: 0x7a56a0, leaf: 0xc884d8, cap: 0x9050b8, curl: 0xb878d8, glow: 0xffb0f0 }, animals: { striders: 0, skin: 0x3a2a4a },
    intro: 'A reef in the sky. There is nothing under it but cloud.',
  },
  ash: {
    name: 'HOME', sub: 'WHAT IS LEFT', tex: 'rocky_terrain_02', rock: 'rocky_terrain_02', tint: 0xa8948a, rockTint: 0x5a4a44, repeat: 24, amp: 9, rim: 36,
    env: 0xffa684, sky: { top: 0x12090c, hor: 0x8a3a26, sun: 0xff9c68, sunI: 2.2, hemi: 0.7, dir: [0.2, 0.17, -0.8], fog: 0.0062, disc: 760, halo: 0.6, ring: [0x70483e, 0.42, 0.86, -0.3] }, body: { color: '#b89a90', size: 150, at: [-0.5, 0.5, -0.65] }, gravity: 1, scene: 'ruin', wx: { type: 'ash', color: 0x9a9a9a, n: 300, v: [1.3, -0.55, 0.5], size: 0.06 },
    obj: 'FIND THE WALL OF HANDS', early: 'Another valley. The same fires.', burnt: true, flora: { frond: 0x0c0a0a, leaf: 0x000000, cap: 0x000000, curl: 0x000000, glow: 0x000000 }, animals: null,
    intro: 'Another valley. They did this one first.',
  },
};

// What they say. You understand them because you have touched enough machines that speak every human language, and they all learned those the hard way.
const TALK = {
  ochre: { who: 'KESSITH SPEAKER', gift: 'hull', note: 'HULL PLATING FITTED  ·  SHIP DAMAGE HALVED', early: 'You smell of burning, and you are chasing a ship you cannot catch. Come back when you know what you are buying.', after: 'Tell them who sold it to you.', lines: [
    'You smell of their metal. And of something older. Sit, burned one. Nobody here will sell you to them.',
    'They came for our water eleven years ago. They left us this market, and a tax.',
    'Forty-one thousand of your kind in their holds. Every world on this road knows the number. Nobody will say it to them.',
    'You will burn up crossing to Earth in that hull. Take this plating. If you burn their world, tell them who sold it to you.',
  ] },
  skarn: { who: 'GROLM FOREMAN', gift: 'hp', note: 'ICE MARROW  ·  VITALITY +10  ·  COOLANT: SHIP GUNS FIRE FASTER', needsClear: true, early: 'A small burned thing, in a hurry. Go on. They will still be here when you are finished being angry.', after: 'We will dig under their Earth. Tell them nothing.', waiting: 'Their machines nest in our shafts. Kill them, small one, and then we talk.', lines: [
    'You did not run. Nothing that small ever has the sense to. Good.',
    'We keep what we dig. They have taken nine of our digs for the fuel ice. They will come for this one when the fleet comes back through.',
    'Eat. It is ice marrow. It makes you harder to kill. The rest is coolant: your drive will want it for the crossing. When you get to their Earth, the Grolm will come and dig under it.',
  ] },
  thule: { who: 'UMMARI', gift: 'gel', note: 'THE FLEET\'S HEADING', early: 'We feel you burning. You are not ready to hear what we heard.', after: 'We still hear them. Go.', lines: [
    'We felt your ships pass under the reef. All of you, singing in the dark. They do not know you are singing.',
    'Follow the song and you have their heading. It goes where they said it goes. It goes to Earth.',
    'We do not fight. We drift. Everything that falls through our clouds, we keep. This fell from one of theirs. It clings. It burns. Touch it, and keep it. Then go and be terrible.',
  ] },
};

// --------------------------------------------------------------------- loading
let NODES = null;
const texCache = {};
const TEX_NAMES = ['aerial_rocks_02', 'coast_sand_01', 'corrugated_iron', 'metal_plate', 'rocky_terrain_02', 'rusty_metal_02', 'snow_02'];
export async function loadWorlds() {
  // every surface is in memory before the game starts: nothing can land on untextured ground
  const L = new THREE.TextureLoader();
  await Promise.all(TEX_NAMES.flatMap((n) => [n, n + '_n']).map(async (key) => {
    const t = await L.loadAsync(import.meta.env.BASE_URL + 'textures/' + key + '.jpg');
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (!key.endsWith('_n')) t.colorSpace = THREE.SRGBColorSpace; texCache[key] = t;
  }));
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/worlds.glb');
  NODES = {}; const mats = new Set(); gltf.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = true; NODES[o.name] = o; mats.add(o.material); } });
  // real surfaces on everything built: the models carry box UVs for this
  const SURF = { Clay: ['coast_sand_01', 1.5], ClayDark: ['coast_sand_01', 0.9], Steel: ['rusty_metal_02', 1], Hazard: ['rusty_metal_02', 1], Dark: ['metal_plate', 0.9], Stone: ['rocky_terrain_02', 1.4], HandWall: ['rocky_terrain_02', 0.9], Wood: ['corrugated_iron', 0.8] };
  const NORMAL = { Coral: 'aerial_rocks_02', GrolShell: 'rocky_terrain_02', IceBlock: 'snow_02', KessRobe: 'coast_sand_01', Cloth: 'coast_sand_01', KessMantle: 'coast_sand_01' };
  for (const m of mats) {
    if (m.emissive && m.emissiveIntensity > 1) m.emissiveIntensity = Math.min(m.emissiveIntensity, 1.4);
    const s = SURF[m.name];
    if (s) { m.map = tex(s[0], false, 1); m.normalMap = tex(s[0], true, 1); m.color.multiplyScalar(s[1]); m.needsUpdate = true; }
    else if (NORMAL[m.name]) { m.normalMap = tex(NORMAL[m.name], true, 1); m.normalScale = new THREE.Vector2(0.7, 0.7); m.needsUpdate = true; }
  }
}
function tex(name, normal, repeat) {
  const key = name + (normal ? '_n' : '');
  const c = texCache[key].clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c;
}

// value noise for the land
const hash2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) { const i = Math.floor(x), j = Math.floor(z), f = x - i, g = z - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g); return lerp(lerp(hash2(i, j), hash2(i + 1, j), u), lerp(hash2(i, j + 1), hash2(i + 1, j + 1), u), v); }
const fbm = (x, z, n = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < n; i++) { s += a * vnoise(x * f, z * f); a *= 0.5; f *= 2.07; } return s; };

// --------------------------------------------------------------------- the people
class Npc {
  constructor(kind, x, z, opts = {}) {
    this.kind = kind; this.x = x; this.z = z; this.yaw = R(0, 6.28); this.t = R(0, 9); this.home = [x, z]; this.wander = opts.wander ?? 7; this.goal = null; this.wait = R(0, 3);
    this.speed = kind === 'kess' ? 0.85 : kind === 'grol' ? 0.6 : 0.5; this.walk = 0; this.look = 0; this.talker = !!opts.talker; this.r = kind === 'grol' ? 0.95 : 0.55; this.moving = 0;
    const g = this.group = new THREE.Group(), add = (name, parent, px, py, pz, flip) => { const m = NODES[name].clone(); m.position.set(px, py, pz); m.rotation.set(0, 0, 0); if (flip) m.scale.x = -1; if (flip) m.material = this.flipMat(m.material); parent.add(m); m.frustumCulled = true; return m; };
    const piv = (parent, px, py, pz) => { const p = new THREE.Group(); p.position.set(px, py, pz); parent.add(p); return p; };
    if (kind === 'kess') {
      const s = opts.scale || R(0.93, 1.1); g.scale.setScalar(s);
      this.torso = piv(g, 0, 1.15, 0); add('Kess_Body', this.torso, 0, 0, 0); add('Kess_Robe', this.torso, 0, 0, 0); add('Kess_Mantle', this.torso, 0, 0, 0); add('Kess_Trim', this.torso, 0, 0, 0);
      this.head = piv(this.torso, 0, 1.2, 0); add('Kess_Head', this.head, 0, 0, 0); add('Kess_Eyes', this.head, 0, 0, 0);
      this.armR = piv(this.torso, 0.25, 0.98, 0); add('Kess_Arm', this.armR, 0, 0, 0); add('Kess_Sleeve', this.armR, 0, 0, 0); this.armL = piv(this.torso, -0.25, 0.98, 0); add('Kess_Arm', this.armL, 0, 0, 0, true); add('Kess_Sleeve', this.armL, 0, 0, 0, true);
    } else if (kind === 'grol') {
      g.scale.setScalar(opts.scale || R(1.05, 1.35));
      this.torso = piv(g, 0, 0.62, 0); add('Grol_Body', this.torso, 0, 0, 0); add('Grol_Shell', this.torso, 0, 0, 0); add('Grol_Belt', this.torso, 0, 0, 0); this.head = piv(this.torso, 0, 0, 0); add('Grol_Eyes', this.head, 0, 0, 0); add('Grol_Tusks', this.head, 0, 0, 0);
      this.armR = piv(this.torso, 0.62, 0.1, -0.34); add('Grol_Arm', this.armR, 0, 0, 0); this.armL = piv(this.torso, -0.62, 0.1, -0.34); add('Grol_Arm', this.armL, 0, 0, 0, true);
      this.legs = [[0.42, -0.36], [-0.42, -0.36], [0.42, 0.42], [-0.42, 0.42]].map(([lx, lz], i) => { const l = piv(g, lx, 0.5, lz); add('Grol_Leg', l, 0, 0, 0); return { l, ph: i === 0 || i === 3 ? 0 : Math.PI }; });
    } else {
      g.scale.setScalar(opts.scale || R(0.9, 1.25));
      this.torso = piv(g, 0, 2.5, 0); this.bell = piv(this.torso, 0, 0, 0); add('Umma_Bell', this.bell, 0, 0, 0); add('Umma_Veins', this.bell, 0, 0, 0); add('Umma_Core', this.torso, 0, 0, 0); this.head = this.torso;
      this.threads = add('Umma_Threads', this.torso, 0, 0, 0);
      this.armR = piv(this.torso, 0.5, -0.1, -0.25); add('Umma_Arm', this.armR, 0, 0, 0); this.armL = piv(this.torso, -0.5, -0.1, -0.25); add('Umma_Arm', this.armL, 0, 0, 0, true);
      this.bell.children[0].material = this.bell.children[0].material.clone(); this.bell.children[0].material.transparent = true; this.bell.children[0].material.opacity = 0.74; this.bell.children[0].material.side = THREE.DoubleSide;
    }
    g.position.set(x, 0, z);
  }
  flipMat(m) { const c = m.clone(); c.side = THREE.DoubleSide; return c; }     // a mirrored mesh turns inside out

  update(dt, px, pz, ground) {
    this.t += dt; const t = this.t, dx = px - this.x, dz = pz - this.z, d = Math.hypot(dx, dz);
    const near = d < 7.5;
    let want = this.yaw, mv = 0;
    if (near) { want = Math.atan2(-dx, -dz); this.goal = null; this.wait = 1.5; }
    else {
      this.wait -= dt;
      if (this.goal) {
        const gx = this.goal[0] - this.x, gz = this.goal[1] - this.z, gd = Math.hypot(gx, gz);
        if (gd < 0.5) { this.goal = null; this.wait = R(1.5, 5); } else { want = Math.atan2(-gx, -gz); mv = 1; this.x += (gx / gd) * this.speed * dt; this.z += (gz / gd) * this.speed * dt; }
      } else if (this.wait <= 0 && this.wander > 0) { const a = R(0, 6.283), rr = R(1, this.wander); this.goal = [this.home[0] + Math.cos(a) * rr, this.home[1] + Math.sin(a) * rr]; }
    }
    this.moving = lerp(this.moving, mv, Math.min(1, dt * 4));
    let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += dy * Math.min(1, dt * (near ? 3.2 : 2));
    this.walk += dt * (1.1 + this.moving * 5);
    const g = this.group; g.position.set(this.x, ground(this.x, this.z), this.z); g.rotation.y = this.yaw;
    const gest = near ? Math.max(0, Math.sin(t * 1.4)) : 0;
    if (this.kind === 'kess') {
      this.torso.position.y = 1.15 + Math.abs(Math.sin(this.walk)) * 0.05 * this.moving + Math.sin(t * 1.2) * 0.012;
      this.torso.rotation.x = 0.05 * this.moving + (near ? 0.08 : 0); this.torso.rotation.z = Math.sin(this.walk) * 0.05 * this.moving;
      this.head.rotation.y = near ? 0 : Math.sin(t * 0.47) * 0.5; this.head.rotation.x = (near ? 0.12 : 0) + Math.sin(t * 0.8) * 0.04;
      this.armR.rotation.x = Math.sin(this.walk) * 0.3 * this.moving - 0.95 * gest; this.armR.rotation.z = -0.1; this.armL.rotation.x = -Math.sin(this.walk) * 0.3 * this.moving - 0.14; this.armL.rotation.z = 0.1;
    } else if (this.kind === 'grol') {
      this.torso.position.y = 0.62 + Math.abs(Math.sin(this.walk)) * 0.03 * this.moving + Math.sin(t * 1.1) * 0.015;
      this.torso.rotation.z = Math.sin(this.walk) * 0.07 * this.moving; this.torso.rotation.x = near ? -0.14 : 0.03;
      for (const l of this.legs) l.l.rotation.x = Math.sin(this.walk + l.ph) * 0.5 * this.moving;
      // when not walking it digs: both hands chop at the ice
      const dig = (1 - this.moving) * (near ? 0 : 1), ch = Math.pow(Math.max(0, Math.sin(t * 2.3)), 3);
      this.armR.rotation.x = Math.sin(this.walk + Math.PI) * 0.5 * this.moving - (1.1 - ch * 1.5) * dig - 0.9 * gest; this.armL.rotation.x = Math.sin(this.walk) * 0.5 * this.moving - (1.1 - Math.pow(Math.max(0, Math.sin(t * 2.3 + 1.6)), 3) * 1.5) * dig;
    } else {
      const pulse = Math.sin(t * 1.6), up = Math.max(0, pulse);
      this.torso.position.y = 2.5 + Math.sin(t * 0.6) * 0.14 + up * 0.08;
      this.bell.scale.set(1 - 0.12 * pulse, 1 + 0.15 * pulse, 1 - 0.12 * pulse); this.threads.scale.set(1 - 0.1 * pulse, 1 + 0.08 * Math.sin(t * 1.6 - 1), 1 - 0.1 * pulse);
      this.threads.rotation.y = t * 0.2; this.torso.rotation.z = Math.sin(t * 0.7) * 0.05; this.torso.rotation.x = Math.sin(t * 0.53) * 0.05;
      this.armR.rotation.x = Math.sin(t * 1.3) * 0.2 - 0.5 * gest; this.armL.rotation.x = Math.sin(t * 1.3 + 1) * 0.2 - 0.2 * gest;
    }
  }
}

// --------------------------------------------------------------------- one world's place
class Place {
  constructor(game, id) {
    this.g = game; this.id = id; const W = this.w = WORLDS[id];
    const G = this.group = new THREE.Group(); G.position.copy(ORIGIN); game.scene.add(G);
    this.boxes = []; this.circles = []; this.npcs = []; this.lamps = [];
    const small = game.touchMode;

    // ---- land: the mesh and the height you stand on are the same numbers
    const SIZE = 560, SEG = small ? 110 : 170, N = SEG + 1, H = this.H = new Float32Array(N * N); this.SIZE = SIZE; this.N = N;
    const seed = id.charCodeAt(0) * 3.7 + id.charCodeAt(1) * 1.3;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG).rotateX(-Math.PI / 2), P = geo.attributes.position;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -SIZE / 2 + (i / SEG) * SIZE, z = -SIZE / 2 + (j / SEG) * SIZE, d = Math.hypot(x, z);
      const flat = ease(d, FLAT - 10, FLAT + 42), n = fbm(x * 0.012 + seed, z * 0.012 - seed), fine = fbm(x * 0.09 - seed, z * 0.09 + seed, 3) - 0.45;
      let h = flat * ((n - 0.45) * W.amp * 2.1 + fine * 1.2);
      if (W.islands) { const edge = ease(d + (n - 0.5) * 34, 92, 125); h = h * 0.5 - edge * edge * 90; const di = Math.hypot(x - 118, z + 62); h = Math.max(h, 2.2 - Math.pow(ease(di, 15, 27), 2) * 92); }
      else h += ease(d, WALL - 45, WALL + 26) * W.rim * (0.65 + 0.7 * n) + ease(d, 210, 280) * W.rim * 0.8;
      if (id === 'vael') { for (const [cx, cz, cr] of [[-92, -60, 24], [96, 40, 30], [30, 118, 22], [-60, 108, 18]]) { const q = Math.hypot(x - cx, z - cz) / cr; if (q < 1.3) h += q < 1 ? (q * q - 1) * 5.4 + 1 : 1 * (1 - (q - 1) / 0.3); } }
      H[j * N + i] = h; P.setY(j * N + i, h);
    }
    geo.computeVertexNormals();
    const nor = geo.attributes.normal, slope = new Float32Array(P.count), col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      slope[i] = Math.min(1, Math.max(0, (0.97 - nor.getY(i)) * 6.5));
      const m = 0.8 + 0.34 * fbm(P.getX(i) * 0.03, P.getZ(i) * 0.03, 3); col[i * 3] = m; col[i * 3 + 1] = m; col[i * 3 + 2] = m;
    }
    geo.setAttribute('aSlope', new THREE.BufferAttribute(slope, 1)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ map: tex(W.tex, false, W.repeat), normalMap: tex(W.tex, true, W.repeat), color: W.tint, roughness: 0.95, metalness: 0, vertexColors: true, normalScale: new THREE.Vector2(1.2, 1.2) });
    if (W.tintK) mat.color.multiplyScalar(W.tintK);
    const rockMap = tex(W.rock, false, W.repeat * 0.7), rockTint = new THREE.Color(W.rockTint), baseTint = new THREE.Color(W.tint);
    mat.onBeforeCompile = function (shader) {
      THREE.Material.prototype.onBeforeCompile.call(this, shader);
      shader.uniforms.tRock = { value: rockMap }; shader.uniforms.uRockT = { value: rockTint.clone().multiply(new THREE.Color(1 / baseTint.r, 1 / baseTint.g, 1 / baseTint.b)) }; shader.uniforms.uRockM = { value: rockMap.matrix };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSlope; varying float vSlope; varying vec2 vRockUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlope = aSlope; vRockUv = uv * ' + (W.repeat * 0.7).toFixed(2) + ';');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tRock; uniform vec3 uRockT; varying float vSlope; varying vec2 vRockUv;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n  { vec4 rk = texture2D(tRock, vRockUv); float sl = smoothstep(0.2, 0.75, vSlope + (rk.r - 0.5) * 0.5); diffuseColor.rgb = mix(diffuseColor.rgb, rk.rgb * uRockT, sl); }');
    };
    mat.customProgramCacheKey = () => 'terrain-' + id;
    this.terrain = new THREE.Mesh(geo, mat); this.terrain.receiveShadow = true; G.add(this.terrain);

    // ---- sky: gradient, sun, what hangs in it
    this.skyG = new THREE.Group(); G.add(this.skyG);
    const sunDir = new THREE.Vector3(...W.sky.dir).normalize();
    const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uTop: { value: new THREE.Color(W.sky.top) }, uHor: { value: new THREE.Color(W.sky.hor) }, uSun: { value: new THREE.Color(W.sky.sun) }, uDir: { value: sunDir }, uStars: { value: W.sky.stars || 0 }, uDisc: { value: W.sky.disc || 1000 }, uHalo: { value: W.sky.halo ?? 0.3 }, uRingC: { value: new THREE.Color((W.sky.ring || [0])[0]) }, uRingN: { value: new THREE.Vector3(W.sky.ring ? W.sky.ring[1] : 0, W.sky.ring ? W.sky.ring[2] : 1, W.sky.ring ? W.sky.ring[3] : 0).normalize() }, uRing: { value: W.sky.ring ? 1 : 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop, uHor, uSun, uDir, uRingC, uRingN; uniform float uStars, uDisc, uHalo, uRing; varying vec3 vD;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9, 78.2, 37.7))) * 43758.5); }
        void main(){ vec3 d = normalize(vD); float y = max(d.y, 0.0); vec3 c = mix(uHor, uTop, pow(y, 0.55)); float s = max(dot(d, uDir), 0.0);
          if (uRing > 0.0) { float q = abs(dot(d, uRingN)); float band = smoothstep(0.075, 0.03, q) * (0.55 + 0.45 * sin(q * 340.0)) * (1.0 - smoothstep(0.02, 0.0, q) * 0.7); c = mix(c, uRingC, band * 0.72 * smoothstep(-0.02, 0.1, d.y)); }
          c += uSun * (smoothstep(1.0 - 1.6 / uDisc, 1.0 - 0.9 / uDisc, s) * 4.0 + pow(s, uDisc * 0.06) * uHalo + pow(s, 4.0) * uHalo * 0.36);
          if (uStars > 0.0) { vec3 q = floor(d * 240.0); float st = step(0.9965, h(q)); c += vec3(st * h(q + 1.0) * 0.9) * smoothstep(0.0, 0.25, d.y); }
          gl_FragColor = vec4(c, 1.0); }` });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 18), skyMat); this.sky.renderOrder = -10; this.sky.frustumCulled = false; this.skyG.add(this.sky);
    if (W.body) {
      const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), cx = 128, rad = 118;
      x.beginPath(); x.arc(cx, cx, rad, 0, 7); x.clip(); x.fillStyle = W.body.kind === 'home' ? '#1d6a66' : W.body.kind === 'giant' ? '#5a8898' : W.body.color; x.fillRect(0, 0, 256, 256);
      if (W.body.kind === 'giant') for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(${40 + i * 5},${70 + i * 4},${90 + i * 3},${0.12 + Math.random() * 0.3})`; x.fillRect(0, i * 10 + Math.random() * 4, 256, 4 + Math.random() * 8); }
      else if (W.body.kind === 'home') { for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(${60 + Math.random() * 60},${40 + Math.random() * 40},${120 + Math.random() * 60},0.3)`; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 30, 0, 7); x.fill(); } for (let i = 0; i < 26; i++) { x.fillStyle = 'rgba(255,130,50,0.95)'; x.fillRect(30 + Math.random() * 180, 70 + Math.random() * 150, 2.4, 2.4); } }
      else for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(30,20,20,${0.05 + Math.random() * 0.12})`; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 26, 0, 7); x.fill(); }
      const sh = x.createRadialGradient(cx - 50, cx - 45, 28, cx - 20, cx - 20, 210); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.95)'); x.fillStyle = sh; x.fillRect(0, 0, 256, 256);
      const m = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false }); m.map.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(m); sp.scale.setScalar(W.body.size); sp.position.set(...W.body.at).normalize().multiplyScalar(900); sp.renderOrder = -9; this.skyG.add(sp);
    }
    this.sun = new THREE.DirectionalLight(W.sky.sun, W.sky.sunI); this.sun.position.copy(sunDir).multiplyScalar(300); this.sun.userData.keepOn = true; G.add(this.sun, this.sun.target);
    // what fills the shadows: the sky, plus light thrown back up from the ground. On airless Vael there is no sky: only the homeworld's glow.
    this.hemi = new THREE.HemisphereLight(W.sky.fill || W.sky.hor, new THREE.Color(W.tint).multiplyScalar(W.sky.fill ? 0.2 : 0.55), W.sky.hemi * 1.5);
    this.sunDir = sunDir; game.setupSun(this.sun); this.hemi.userData.keepOn = true; G.add(this.hemi);
    this.fog = new THREE.FogExp2(W.sky.hor, W.sky.fog); this.bg = new THREE.Color(W.sky.hor);

    if (W.islands) {  // the cloud deck, far below, and other reefs hanging in the air
      const cc = document.createElement('canvas'); cc.width = cc.height = 256; const x = cc.getContext('2d'); x.fillStyle = '#e8a8a8'; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 90; i++) { const px = Math.random() * 256, py = Math.random() * 256, rr = 10 + Math.random() * 50, gg = x.createRadialGradient(px, py, 0, px, py, rr); gg.addColorStop(0, `rgba(255,232,214,${0.28 + Math.random() * 0.3})`); gg.addColorStop(1, 'rgba(255,220,200,0)'); x.fillStyle = gg; x.fillRect(px - rr, py - rr, rr * 2, rr * 2); }
      const ct = new THREE.CanvasTexture(cc); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(16, 16); ct.colorSpace = THREE.SRGBColorSpace;
      this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ct, fog: true })); this.clouds.position.y = -70; G.add(this.clouds);
      const rg = new THREE.IcosahedronGeometry(1, 1), rp = rg.attributes.position; for (let i = 0; i < rp.count; i++) { const y = rp.getY(i); rp.setXYZ(i, rp.getX(i) * (0.8 + Math.random() * 0.4), y > 0 ? y * 0.28 : y * (1 + Math.random() * 0.6), rp.getZ(i) * (0.8 + Math.random() * 0.4)); } rg.computeVertexNormals();
      const isl = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: W.rockTint, roughness: 0.95, flatShading: true }), 18), m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion();
      for (let i = 0; i < 18; i++) { const a = R(0, 6.283), d = R(170, 460), s = R(8, 34); m4.compose(v.set(Math.cos(a) * d, R(-30, 42), Math.sin(a) * d), q.setFromEuler(new THREE.Euler(0, R(0, 6), 0)), new THREE.Vector3(s, s, s)); isl.setMatrixAt(i, m4); } isl.frustumCulled = false; G.add(isl);
    }

    // ---- weather: drifting specks that wrap around you
    { const n = small ? Math.round(W.wx.n * 0.55) : W.wx.n, pos = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) pos[i] = R(-22, 22);
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
      const pm = new THREE.PointsMaterial({ color: W.wx.color, size: W.wx.size * 3, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.8, depthWrite: false, sizeAttenuation: true, fog: false }); pm.userData.noSnap = true;
      this.wx = new THREE.Points(pg, pm); this.wx.frustumCulled = false; G.add(this.wx); this.wxP = pos; this.wxPh = new Float32Array(n).map(() => R(0, 6.28)); }

    // ---- ground things and life
    this.pad = this.part(['Pad', 'PadLamp'], 0, 0, 0, 1);
    { const m = this.pad.children[0]; m.material = m.material.clone(); m.material.color.setRGB(0.85, 0.87, 0.9); m.material.metalness = 0.25; }
    // where you need to go stands out from a long way off: a pale column over it, gone once it has served
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.7, 90, 10, 1, true), new THREE.MeshBasicMaterial({ color: W.env, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, map: (() => { const c = document.createElement('canvas'); c.width = 2; c.height = 64; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = gr; x.fillRect(0, 0, 2, 64); return new THREE.CanvasTexture(c); })() })); this.beacon.material.userData.noSnap = true; this.beacon.visible = false; G.add(this.beacon);
    const taken = (x, z, r) => Math.hypot(x, z) < 11 + r || this.circles.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r) || this.boxes.some((b) => x > b.minX - ORIGIN.x - r && x < b.maxX - ORIGIN.x + r && z > b.minZ - ORIGIN.z - r && z < b.maxZ - ORIGIN.z + r);
    this.buildSettlement();
    this.scatterRocks(small ? 26 : 46, taken);
    const life = game.homeAsset && game.homeAsset.userData.life;
    if (life) this.life = new HomeLife(G, life, (x, z, r) => taken(x, z, r) || this.h(x, z) < -1.5 || this.h(x, z) > 18, this.circles, [], { flora: W.flora, burnt: W.burnt, drifters: W.scene === 'reef', crawlers: !!W.animals, striders: W.animals ? W.animals.striders : 0, skin: W.animals && W.animals.skin, ground: (x, z) => this.h(x, z), small, radius: W.islands ? 76 : 150, burnable: false });
    if (id === 'ash') this.buildWall();
    this.lander = makeLander(); this.lander.scale.setScalar(1.1); addCockpit(this.lander); this.lander.userData.cockpit.visible = true;
    this.lander.traverse((m) => { if (m.isMesh && m.material && m.material.emissive && !m.material.isMeshBasicMaterial) { m.material = m.material.clone(); m.material.emissive.lerp(new THREE.Color(0x3a5560), 0.4); } });
    this.lander.traverse((m) => { if (m.isMesh && m.material.blending !== THREE.AdditiveBlending) m.castShadow = true; });
    G.add(this.lander);
    // enemies walk this grid
    const bx = new THREE.Vector3(ORIGIN.x, 0, ORIGIN.z);
    this.arena = { minX: bx.x - 62, maxX: bx.x + 62, minZ: bx.z - 62, maxZ: bx.z + 62 };
    G.visible = false;
    this.show(false);
  }

  // the height of the land in this place's own coordinates
  h(x, z) {
    const S = this.SIZE, N = this.N, fx = Math.min(N - 1.001, Math.max(0, ((x + S / 2) / S) * (N - 1))), fz = Math.min(N - 1.001, Math.max(0, ((z + S / 2) / S) * (N - 1)));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, H = this.H, a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    // the same triangles the mesh draws
    return u + v < 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  part(names, x, z, yaw, s = 1, y0 = null) {
    const g = new THREE.Group(); for (const n of names) if (NODES[n]) { const m = NODES[n].clone(); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); m.castShadow = m.receiveShadow = !/Lamp|Screen|Glow|Eyes/.test(n); g.add(m); }
    g.position.set(x, y0 === null ? this.h(x, z) : y0, z); g.rotation.y = yaw; g.scale.setScalar(s); this.group.add(g); return g;
  }
  circle(x, z, r) { this.circles.push({ x, z, r }); }
  box(x, z, w, d, h, yaw = 0, y0 = 0) {        // a solid: rotated footprints use their bounds
    const q = Math.abs(Math.round(yaw / (Math.PI / 2))) % 2 === 1, hw = (q ? d : w) / 2, hd = (q ? w : d) / 2;
    const b = this.g.world.add(ORIGIN.x + x - hw, y0, ORIGIN.z + z - hd, ORIGIN.x + x + hw, y0 + h, ORIGIN.z + z + hd, { tag: 'surface' }); b.enabled = false; this.boxes.push(b); return b;
  }

  buildSettlement() {
    const id = this.id, Q = Math.PI / 2;
    if (id === 'ochre') {
      for (const [x, z, yaw, s] of [[-24, -16, 0.9, 1.15], [24, -22, -0.8, 1.3], [-34, 12, 2.1, 1.0], [34, 14, 4.3, 1.1], [0, -40, 0.1, 1.5], [-14, 36, 3, 0.95], [18, 38, 3.5, 1.05]]) { this.part(['Kess_Hut', 'Kess_HutBand', 'Kess_HutDoor', 'Kess_HutLamp'], x, z, yaw, s); this.circle(x, z, 3.05 * s); }
      this.part(['Kess_Spire', 'Kess_SpireLamp'], -5, -24, 0, 1.25); this.circle(-5, -24, 1.65);
      this.part(['Kess_Spire', 'Kess_SpireLamp'], 12, -30, 0, 0.9); this.circle(12, -30, 1.2);
      for (const [x, z, yaw] of [[-13, -8, Q], [13, -8, Q], [-7, 15, 0], [8, 18, 0], [20, 3, Q], [-22, 2, Q]]) { const a = this.part(['Kess_Stall', 'Kess_Awning', 'Kess_Goods'], x, z, yaw, 1); a.children[1].material = a.children[1].material.clone(); a.children[1].material.side = THREE.DoubleSide; a.children[1].material.color.setHSL(Math.random(), 0.55, 0.32); this.box(x, z, 3.2, 1.5, 0.98, yaw); }
      for (let i = 0; i < 11; i++) { const a = R(0, 6.283), d = R(12, 42), x = Math.cos(a) * d, z = Math.sin(a) * d; if (this.hitsAny(x, z, 1.5)) continue; this.part(['Crate'], x, z, R(0, 3), R(0.8, 1.1)); this.box(x, z, 1.1, 1.1, 1); }
      this.npcs.push(new Npc('kess', -3, -14, { talker: true, wander: 0, scale: 1.2 }));
      for (const [x, z] of [[-11, -5], [11, -5], [-5, 12], [7, 15], [18, 0], [-20, 5], [0, 22], [-26, -6]]) this.npcs.push(new Npc('kess', x, z, { wander: 6 }));
    } else if (id === 'vael') {
      for (const [x, z, yaw] of [[-18, -18, 0], [-10, -18, 0], [16, -16, Q], [16, -8, Q], [-22, 10, Q], [10, 22, 0], [20, 22, 0], [-8, 26, 0]]) { this.part(['Hum_Container', 'Hum_ContainerLamp', 'Hum_ContainerDoor'], x, z, yaw, 1); this.box(x, z, 6.3, 2.8, 2.6, yaw); }
      for (const [x, z] of [[-30, -6], [-30, -14], [28, 6]]) { this.part(['Hum_Tank', 'Hum_TankStripe'], x, z, R(0, 6), 1.1); this.circle(x, z, 1.7); }
      this.part(['Hum_DishBase', 'Hum_Dish'], 2, -30, 0.6, 1.4); this.circle(2, -30, 1.2);
      this.part(['Hum_Crane', 'Hum_CraneLamp'], -36, 20, 1.2, 1.3); this.circle(-36, 20, 0.7); this.part(['Hum_Crane', 'Hum_CraneLamp'], 34, -24, 3.6, 1.1); this.circle(34, -24, 0.6);
      this.terminal = this.part(['Hum_Terminal', 'Hum_TerminalScreen'], 0, -24, 3.14, 1.3); this.box(0, -24, 1.5, 0.8, 1.6); this.terminalAt = [0, -24];
      for (let i = 0; i < 14; i++) { const a = R(0, 6.283), d = R(12, 40), x = Math.cos(a) * d, z = Math.sin(a) * d; if (this.hitsAny(x, z, 1.5)) continue; this.part(['Crate'], x, z, R(0, 3), R(0.8, 1.2)); this.box(x, z, 1.15, 1.15, 1.05); }
      this.spawns = [['android', 'trooper', -6, -12], ['android', 'trooper', 7, -14], ['android', 'scout', -14, 2], ['android', 'heavy', 4, -20], ['android', 'scout', 14, 6], ['drone', 'std', -8, 12], ['drone', 'std', 10, 14]];
    } else if (id === 'skarn') {
      for (const [x, z, yaw, s] of [[-14, -20, 0.6, 1.3], [-8, -28, 1.7, 1.5], [10, -24, 2.4, 1.2], [20, -14, 0.3, 1.4], [-26, -6, 1, 1.1], [26, 6, 2, 1.2], [-20, 18, 0.2, 1.25], [14, 26, 1, 1.1], [-2, 32, 1.9, 1.35]]) { this.part(['Grol_Ice'], x, z, yaw * 0 + Math.round(yaw / Q) * Q, s); this.box(x, z, 2.3 * s, 1.7 * s, 1.6 * s, Math.round(yaw / Q) * Q); }
      this.part(['Grol_Arch', 'Grol_ArchLamp'], 0, -14, 0, 1.3); this.circle(-3.3, -14, 1.0); this.circle(3.3, -14, 1.0);
      this.part(['Grol_Rig'], -16, 4, 0, 1.25); this.circle(-16, 4, 0.5); this.part(['Grol_Rig'], 15, -2, 1, 1.1); this.circle(15, -2, 0.5); this.part(['Grol_Rig'], 2, 22, 2, 1); this.circle(2, 22, 0.5);
      this.npcs.push(new Npc('grol', 0, -8, { talker: true, wander: 0, scale: 1.6 }));
      for (const [x, z] of [[-11, -14], [14, -16], [-22, 12], [20, 14], [6, 18]]) this.npcs.push(new Npc('grol', x, z, { wander: 4 }));
      this.spawns = [['bug', 'std', -14, 10], ['bug', 'std', 14, 10], ['bug', 'std', 0, 20], ['bug', 'std', -24, 0], ['bug', 'std', 24, -4], ['bug', 'std', 8, 28], ['bug', 'std', -8, 28], ['android', 'trooper', 0, 30]];
    } else if (id === 'thule') {
      for (const [x, z, s] of [[-18, -18, 1.25], [18, -22, 1.5], [-32, 8, 1.1], [30, 12, 1.3], [0, -38, 1.7], [-12, 34, 1.2], [14, 36, 1]]) { this.part(['Umma_Coral', 'Umma_CoralGlow'], x, z, R(0, 6), s); this.circle(x, z, 1.15 * s); }
      this.npcs.push(new Npc('umma', 0, -15, { talker: true, wander: 0, scale: 1.45 }));
      for (const [x, z] of [[-12, -10], [12, -12], [-20, 6], [20, 8], [-6, 20], [10, 24], [28, -6], [-28, -8]]) this.npcs.push(new Npc('umma', x, z, { wander: 9 }));
    }
    for (const n of this.npcs) { this.group.add(n.group); n.group.traverse((o) => { if (o.isMesh) o.castShadow = true; }); }
  }
  hitsAny(x, z, r) { return Math.hypot(x, z) < 12 || this.circles.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r) || this.boxes.some((b) => x > b.minX - ORIGIN.x - r && x < b.maxX - ORIGIN.x + r && z > b.minZ - ORIGIN.z - r && z < b.maxZ - ORIGIN.z + r); }

  buildWall() {
    const z = -30;
    this.part(['HandWall'], 0, z, 0, 1.3); for (let x = -12; x <= 12; x += 1.8) this.circle(x, z, 1.05);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d'); x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 62; i++) { const px = Math.random() * 1024, py = 40 + Math.random() * 196, s = 5 + Math.random() * 7, a = 0.35 + Math.random() * 0.6; x.fillStyle = `rgba(90,255,225,${a})`; x.beginPath(); x.arc(px, py, s, 0, 7); x.fill(); for (let k = 0; k < 9; k++) { const t = (k / 9) * 6.283; x.beginPath(); x.arc(px + Math.cos(t) * s * 1.8, py + Math.sin(t) * s * 1.8, s * 0.26, 0, 7); x.fill(); } }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.4), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); m.material.userData.noSnap = true; m.position.set(0, 2.5 + this.h(0, z), z + 1.2); this.group.add(m); this.handGlow = m;
    this.terminalAt = [0, z + 3];
    const fl = new THREE.PointLight(0x7ff0e0, 18, 22, 2); fl.position.set(0, 3, z + 4); fl.userData.keepOn = true; this.group.add(fl);
  }

  scatterRocks(n, taken) {
    const rg = new THREE.IcosahedronGeometry(1, 2), rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), k = 0.72 + 0.6 * fbm(x * 2 + 9, z * 2 + y * 2, 3); rp.setXYZ(i, x * k, y * k * 0.72, z * k); } rg.computeVertexNormals();
    const W = this.w, mat = new THREE.MeshStandardMaterial({ map: tex(W.rock, false, 1.5), normalMap: tex(W.rock, true, 1.5), color: W.rockTint, roughness: 0.95 });
    const mesh = new THREE.InstancedMesh(rg, mat, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(); let k = 0;
    for (let i = 0; i < n * 6 && k < n; i++) {
      const a = R(0, 6.283), d = R(14, W.islands ? 80 : 165), x = Math.cos(a) * d, z = Math.sin(a) * d, s = R(0.5, d > 60 ? 4.6 : 1.8);
      if (taken(x, z, s)) continue; const y = this.h(x, z); if (y < -2) continue;
      m4.compose(v.set(x, y + s * 0.1, z), q.setFromEuler(new THREE.Euler(R(-0.3, 0.3), R(0, 6), R(-0.3, 0.3))), sc.set(s, s * R(0.6, 1), s)); mesh.setMatrixAt(k++, m4);
      if (s > 0.55) this.circle(x, z, s * 0.82);
    }
    mesh.count = k; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true; this.group.add(mesh);
  }

  show(v) { this.group.visible = v; for (const b of this.boxes) b.enabled = v; }

  // lander's footprint measured from the mesh, so walking into any part of it stops you
  measureLander() {
    if (this.landerCircles) return;
    this.lander.position.set(0, 1.25, 0); this.lander.rotation.set(0, 0, 0); this.lander.updateMatrixWorld(true);
    this.landerCircles = this.g.opening.solidFootprint(this.lander, 0.1 + 0, 2.3).map((c) => ({ x: c.x - ORIGIN.x, z: c.z - ORIGIN.z, r: c.r }));
  }
}

// --------------------------------------------------------------------- the visit
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _x = new THREE.Vector3(1, 0, 0), _e = new THREE.Euler();
export class Surface {
  constructor(game) { this.g = game; this.places = {}; this.active = false; this.sunTarget = new THREE.Vector3(); }
  get done() { return this.g.campaign.s.worlds; }

  start(id) {
    const g = this.g, s = g.scene, c = g.camera;
    if (!NODES) return false;
    const P = this.place = this.places[id] || (this.places[id] = new Place(g, id)); this.id = id; g.lightList = null;
    const W = P.w;
    g.viewmodel.setEnv(W.env); this.early = !g.flight.free && !g.campaign.s.chart;
    this.saved = { bg: s.background, fog: s.fog, far: c.far, enemies: g.enemies, nav: g.nav, arena: g.arena, barrels: g.barrels, obj: document.getElementById('objective')?.textContent };
    s.background = P.bg; s.fog = P.fog; c.far = 1600; c.updateProjectionMatrix(); g.post.applyFog(s);
    P.show(true); P.measureLander();
    g.world.terrain = (x, z) => P.h(x - ORIGIN.x, z - ORIGIN.z);
    g.enemies = []; g.barrels = [];
    g.arena = P.arena; if (!P.nav) P.nav = new NavGrid(g.world, P.arena, 0.8, 0.55); g.nav = P.nav; P.nav.forceRefresh?.();
    this.active = true; this.step = 'land'; this.T = 0; this.talkI = 0; this.talkT = 0; this.alarm = false; this.h = 0; this.awayT = 0; this.woken = false; this.f = {};
    g.state = 'playing'; g.opening.moveLocked = true; g.opening.hideBody = true; g.weaponAcquired = true; g.player.gravMul = W.gravity; g.viewmodel.root.visible = true;
    g.player.reset(ORIGIN.x + 4, ORIGIN.z + 4, 0); g.player.pos.y = 0; g.player.extraSolid = (q) => this.solid(q);
    g.ui.showHud(true); g.ui.setObjective(''); g.ui.clearTransient(); g.audio.scene(W.scene); g.audio.combatMusic(false);
    // this world's machines
    this.placeVoice(P);
    if (!this.done[id] && P.spawns) for (const [type, variant, x, z] of P.spawns) { const e = g.makeEnemy({ type, variant: variant === 'std' ? undefined : variant, x: ORIGIN.x + x, z: ORIGIN.z + z }); g.enemies.push(e); }
    const L = P.lander; L.visible = true; L.userData.engines.forEach((e) => { e.visible = true; }); for (const m of L.userData.screens || []) m.material.opacity = 0.9;
    if (L.userData.canopyPivot) L.userData.canopyPivot.rotation.x = 0;
    this.fromX = R(-1, 1) * 80; this.fromZ = 240;
    g.ui.fade(1);
    return true;
  }

  // the voice this world holds, if it holds one
  placeVoice(P) {
    const g = this.g, n = WORLD_VOICE[this.id]; g.campaign.removeTouch('world');
    if (n === undefined || g.campaign.s.voices.includes(n) || P.jarDone) return;
    const at = { vael: [-34, 21], skarn: [-8, -28], thule: [118, -62] }[this.id], base = P.h(at[0], at[1]) + (this.id === 'skarn' ? 3.85 : 0);
    if (!P.jar) P.jar = g.campaign.addVoiceAt(P.group, n, at[0], base, at[1], 'world'); else g.campaign.addTouch({ tag: 'world', x: ORIGIN.x + at[0], y: base + 0.8, z: ORIGIN.z + at[1], label: 'TOUCH', prompt: 'TOUCH WHAT THEY KEPT', fn: () => { g.campaign.takeVoice(n); P.jarDone = true; P.jar.userData.flesh.visible = false; P.jar.userData.light.intensity = 0.6; } });
    const t = g.campaign.touchables[g.campaign.touchables.length - 1]; if (t) { t.x = ORIGIN.x + at[0]; t.z = ORIGIN.z + at[1]; t.y = base + 0.8; }
  }

  solid(q) {
    const P = this.place; let x = q.x - ORIGIN.x, z = q.z - ORIGIN.z; const rad = 0.42;
    const ring = (list) => { for (const c of list) { const dx = x - c.x, dz = z - c.z, r = c.r + rad, d2 = dx * dx + dz * dz; if (d2 >= r * r) continue; const d = Math.sqrt(d2) || 1e-4; x = c.x + (dx / d) * r; z = c.z + (dz / d) * r; } };
    ring(P.circles); if (this.step !== 'seated') ring(P.landerCircles);
    for (const n of P.npcs) { const dx = x - n.x, dz = z - n.z, r = n.r + rad, d2 = dx * dx + dz * dz; if (d2 < r * r) { const d = Math.sqrt(d2) || 1e-4; x = n.x + (dx / d) * r; z = n.z + (dz / d) * r; } }
    const d = Math.hypot(x, z), lim = P.w.islands ? 1e9 : WALL; if (d > lim) { x = (x / d) * lim; z = (z / d) * lim; }
    q.x = x + ORIGIN.x; q.z = z + ORIGIN.z;
  }

  // the ship's seat, held exactly
  seat(L, pitch = -0.12) {
    const g = this.g, pose = this.pose || (this.pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, q: new THREE.Quaternion() });
    L.updateMatrixWorld(true); _v.copy(SEAT_EYE).applyMatrix4(L.matrixWorld); L.getWorldQuaternion(_q);
    pose.x = _v.x; pose.y = _v.y; pose.z = _v.z; pose.q.copy(_q).multiply(_q2.setFromAxisAngle(_x, pitch)); g.cinePose = pose;
    return pose;
  }

  update(dt) {
    const g = this.g, P = this.place, W = P.w, L = P.lander, ui = g.ui, p = g.player, vm = g.viewmodel;
    this.T += dt; const T = this.T, cx = g.camera.position.x - ORIGIN.x, cz = g.camera.position.z - ORIGIN.z;
    P.skyG.position.set(cx, g.camera.position.y, cz);
    // weather
    { const a = P.wxP, ph = P.wxPh, wv = W.wx.v; P.wx.position.set(cx, g.camera.position.y, cz);
      for (let i = 0; i < ph.length; i++) { a[i * 3] += (wv[0] + Math.sin(T * 0.7 + ph[i]) * 0.2) * dt; a[i * 3 + 1] += (wv[1] + Math.cos(T * 0.9 + ph[i]) * 0.12) * dt; a[i * 3 + 2] += wv[2] * dt; for (let k = 0; k < 3; k++) { const v = a[i * 3 + k]; if (v > 22) a[i * 3 + k] -= 44; else if (v < -22) a[i * 3 + k] += 44; } }
      P.wx.geometry.attributes.position.needsUpdate = true; }
    const px = p.pos.x - ORIGIN.x, pz = p.pos.z - ORIGIN.z;
    for (const n of P.npcs) n.update(dt, px, pz, (x, z) => P.h(x, z));
    if (P.life) P.life.update(dt, px, pz, P.circles);
    g.aimSun(P.sun, this.sunTarget.set(p.pos.x, p.pos.y, p.pos.z), P.sunDir);
    this.updateBeacon(P);
    if (this.step === 'land') this.landing(dt, T, P, L, W);
    else if (this.step === 'hop') this.hop(dt, T, P, L, W);
    else if (this.step === 'free') this.free(dt, T, P, L, W);
    else if (this.step === 'climb') this.climb(dt, T, P, L, W);
    else if (this.step === 'seated') this.liftoff(dt, T, P, L, W);
  }

  updateBeacon(P) {
    const b = P.beacon, W = P.w, t = this.step === 'free' && !this.done[this.id] && !this.early;
    if (!t) { b.visible = false; return; }
    const talker = P.npcs.find((q) => q.talker), blocked = TALK[this.id]?.needsClear && this.g.enemies.some((e) => e.alive);
    const at = blocked ? null : talker ? [talker.x, talker.z] : P.terminalAt;
    b.visible = !!at; if (at) { b.position.set(at[0], P.h(at[0], at[1]) + 45, at[1]); const d = Math.hypot(this.g.player.pos.x - ORIGIN.x - at[0], this.g.player.pos.z - ORIGIN.z - at[1]); b.material.opacity = (0.2 + 0.05 * Math.sin(this.T * 2)) * ease(d, 6, 26); }
  }

  landing(dt, T, P, L, W) {
    const g = this.g, ui = g.ui, vm = g.viewmodel, fx = g.effects, DUR = 7.6;
    ui.fade(1 - ease(T, 0, 1.1));
    const k = Math.min(1, T / DUR), e = 1 - Math.pow(1 - k, 2.6), y = lerp(170, 1.25, e), xz = 1 - e;
    L.position.set(this.fromX * xz, y, this.fromZ * xz);
    L.rotation.set(lerp(-0.42, 0.04, ease(T, 0.5, DUR - 0.8)) * (k < 1 ? 1 : 0), Math.atan2(this.fromX, this.fromZ) * xz, Math.sin(T * 1.7) * 0.04 * (1 - k));
    L.userData.engines.forEach((sp) => sp.scale.setScalar(1 + 2 * (1 - k) + Math.sin(T * 40) * 0.1));
    this.seat(L, -0.1);
    vm.limp = 0.22; g.opening.reachAt(_v.copy(YOKE_GRIP).applyMatrix4(L.matrixWorld), 0.45);
    g.trauma = Math.max(g.trauma, 0.1 + 0.35 * (1 - k)); g.shakeAmp = 1.4;
    if (T > 0.8 && !this.f.a) { this.f.a = 1; ui.subtitle(W.name + '. ' + W.sub + '. Setting down.', 'LANDER', 3.2); g.audio.play('surge', { vol: 0.5 }); }
    // the blast of the engines raises the ground
    if (y < 34) { const n = y < 10 ? 5 : 2; const c = g.effects.smokeP; if (c) for (let i = 0; i < n; i++) { const an = R(0, 6.283), sp = R(4, 12); c.emit(ORIGIN.x + L.position.x + Math.cos(an) * R(1, 5), P.h(L.position.x, L.position.z) + 0.4, ORIGIN.z + L.position.z + Math.sin(an) * R(1, 5), Math.cos(an) * sp, 0.6, Math.sin(an) * sp, 1.6, R(1, 2.2), 0.28, 0.25, 0.24, 0, 0.5, 2); } }
    if (T >= DUR && !this.f.b) { this.f.b = 1; g.audio.play('land', { vol: 1 }); g.audio.play('door', { vol: 0.7 }); g.addShake(0.5); L.userData.engines.forEach((sp) => { sp.visible = false; }); }
    if (L.userData.canopyPivot) L.userData.canopyPivot.rotation.x = 1.15 * ease(T, DUR + 0.5, DUR + 1.6);
    if (T > DUR + 0.7 && !this.f.c) { this.f.c = 1; g.audio.play('hiss', { vol: 0.5 }); if (!this.early) ui.subtitle(W.intro, '', 3.6, true); }
    if (T > DUR + 1.4) { this.step = 'hop'; this.T = 0; vm.limp = 0; g.shakeAmp = 0; vm.reachW = 0; L.updateMatrixWorld(true); const pose = this.pose; this.hopA = new THREE.Vector3(pose.x, pose.y, pose.z); this.hopQ = pose.q.clone(); }
  }

  hop(dt, T, P, L, W) {
    const g = this.g, p = g.player, DUR = 1.9;
    // over the sill, onto the wing, down to the ground: then it is your body again
    const k = ease(T, 0, DUR), to = _v.set(ORIGIN.x + 6.4, P.h(6.4, 4.6) + p.constructor.EYE_H, ORIGIN.z + 4.6), pose = this.pose;
    pose.x = lerp(this.hopA.x, to.x, k); pose.z = lerp(this.hopA.z, to.z, k);
    pose.y = lerp(this.hopA.y, to.y, k) + Math.sin(k * Math.PI) * 0.75 - Math.pow(k, 8) * 0;
    _q.setFromEuler(_e.set(-0.05, -0.75, 0, 'YXZ')); pose.q.copy(this.hopQ).slerp(_q, k);
    if (T > DUR * 0.8 && !this.f.d) { this.f.d = 1; g.audio.play('land', { vol: 0.8 }); g.viewmodel.landK = 1; }
    if (T >= DUR) {
      this.step = 'free'; this.T = 0;
      g.cinePose = null; g.opening.moveLocked = false; g.opening.hideBody = false;
      p.pos.set(to.x, P.h(6.4, 4.6), to.z); p.vx = p.vz = p.vy = 0; p.yaw = -0.75; p.pitch = -0.05; p.grounded = true; g.body.reset();
      g.ui.setObjective(this.early ? 'THE HALCYON IS GETTING AWAY' : this.done[this.id] ? g.campaign.roadObjective() : W.obj);
      if (this.early && W.early) g.ui.subtitle(W.early, '', 3, true);
    }
  }

  free(dt, T, P, L, W) {
    const g = this.g, ui = g.ui, p = g.player, px = p.pos.x - ORIGIN.x, pz = p.pos.z - ORIGIN.z, input = g.input;
    // fell off the reef
    if (p.pos.y < -24) { ui.fade(1); this.placeAtShip(); ui.subtitle('Not that way.', '', 2, true); this.T = -1; }
    if (this.T < -0.5) ui.fade(0);
    // the machines wake when you come close
    if (!this.woken && g.enemies.length && Math.min(...g.enemies.map((e) => Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z))) < 26) {
      this.woken = true; for (const e of g.enemies) e.warn?.(); this.wakeAt = T + 1.6; g.ui.banner('HOSTILES', 'red', 1.3); g.audio.play('alert', { vol: 0.6 }); g.audio.combatMusic(true);
    }
    if (this.wakeAt && T > this.wakeAt) { this.wakeAt = 0; for (const e of g.enemies) if (e.alive) e.activate(); }
    const left = g.enemies.filter((e) => e.alive).length;
    if (this.woken && left === 0 && !this.f.cleared && this.f.resetObj !== 1) { this.f.cleared = 1; g.audio.combatMusic(false); g.audio.play('unlock', { vol: 0.7 }); ui.banner('CLEAR', 'green', 1.3); this.afterClear(); }
    else if (this.woken && left > 0) ui.setObjective('HOSTILES ' + left);
    // people
    const talk = TALK[this.id];
    if (talk) {
      const n = P.npcs.find((q) => q.talker), d = Math.hypot(n.x - px, n.z - pz);
      if (d < 4.6 && (this.early || this.done[this.id])) { this.talkT -= dt; if (this.talkT <= 0) { ui.subtitle(this.early ? talk.early : talk.after, talk.who, 4.2); this.talkT = 11; g.audio.play('groan', { vol: 0.2 }); } }
      else if (d < 4.6) {
        const blocked = talk.needsClear && g.enemies.some((e) => e.alive);
        this.talkT -= dt;
        if (blocked) { if (this.talkT <= 0) { ui.subtitle(talk.waiting, talk.who, 4.2); this.talkT = 9; g.audio.play('groan', { vol: 0.25 }); } }
        else if (this.talkT <= 0) {
          if (this.talkI < talk.lines.length) { ui.subtitle(talk.lines[this.talkI], talk.who, 4.6); this.talkI++; this.talkT = 5; g.audio.play('groan', { vol: 0.18 }); }
          else this.reward(talk);
        }
      }
    } else if (P.terminalAt && !this.done[this.id]) {
      const d = Math.hypot(P.terminalAt[0] - px, P.terminalAt[1] - pz);
      if (this.id === 'vael' && d < 4 && !this.early) this.vaelTerminal(dt);
      if (this.id === 'ash' && d < 7) this.ashWall(T);
    }
    // back to the ship
    const dShip = Math.hypot(px, pz); if (dShip > 9) this.awayT = 1;
    const near = dShip < 6.6 && (this.awayT || T > 6);
    if (near) {
      g.storyAct = 'LIFT OFF'; ui.setPrompt(g.touchMode ? 'HOLD THE BUTTON TO LIFT OFF' : 'HOLD RIGHT CLICK TO LIFT OFF'); this.f.liftPrompt = true;
      this.h = Math.min(1, Math.max(0, this.h + (input.interactDown() ? dt / 0.8 : -dt * 1.5))); ui.setHold(this.h);
      if (this.h >= 1) { this.h = 0; ui.setHold(null); ui.setPrompt(''); g.storyAct = null; this.beginClimb(); }
    } else if (this.f.liftPrompt) { this.f.liftPrompt = false; g.storyAct = null; ui.setPrompt(''); ui.setHold(null); this.h = 0; }
  }

  afterClear() {
    const g = this.g, ui = g.ui;
    if (this.id === 'vael' && !this.early) ui.setObjective('WAKE THE TERMINAL');
    if (this.id === 'skarn' && !this.early) { ui.setObjective('THE FOREMAN IS WAITING'); ui.subtitle('You. Small one. Come here.', 'GROLM FOREMAN', 3); }
    if (this.early) ui.setObjective('THE HALCYON IS GETTING AWAY');
  }
  // Dead until something with current in it touches it. That is what you learned from their machines.
  vaelTerminal(dt) {
    const g = this.g, ui = g.ui, f = this.f;
    if (g.enemies.some((e) => e.alive)) { if (!f.vb) { f.vb = 1; ui.subtitle('Not while they are still moving.', '', 2.4, true); } return; }
    if (g.arsenal.unlocked.has('arc')) f.vt = 1;
    else { f.vh = (f.vh || 0) + dt; if (!f.vl) { f.vl = 1; ui.subtitle('Dead. It wants current, and I never kept one of their walkers. I can force it. Slowly.', '', 3.6, true); } if (f.vh > 6) f.vt = 1; }
    if (!f.vt) return;
    g.effects.hitSparks(new THREE.Vector3(ORIGIN.x + this.place.terminalAt[0], 1.4, ORIGIN.z + this.place.terminalAt[1]), [0.5, 0.9, 1], 22);
    ui.subtitle('Fleet refuel stop. Next: the crossing to Earth. Forty-one thousand units, live. Fuel cells at this post.', 'MEMORY', 5);
    g.viewmodel.pulseGlow(1); g.audio.play('crystal', { vol: 0.5 }); ui.rewardNote('FUEL CELLS LOADED  ·  SHIP BOOSTS HARDER');
    ui.setObjective(g.campaign.worldDone('vael'));
  }
  ashWall(T) {
    const g = this.g, ui = g.ui, f = this.f;
    if (this.early) { if (!f.w1) { f.w1 = 1; ui.subtitle('Hands. Every one of us. Not now. The elder first.', '', 3.2, true); } return; }
    if (this.done.ash) { if (!f.w1) { f.w1 = 1; ui.subtitle('When this is over, I will come back and put their hands on this wall.', '', 3.6, true); } return; }
    if (!f.w1) { f.w1 = 1; f.wAt = T; ui.subtitle('Home. There is nothing left of it. But the wall stands. Every one of us who ever stood here.', '', 4.4, true); g.audio.play('heartbeat', { vol: 0.5 }); }
    if (T > f.wAt + 4.6 && !f.w2) { f.w2 = 1; ui.subtitle('Still warm. A hand stays warm while the one who made it lives. All of them. Forty-one thousand of them.', '', 4.4, true); g.viewmodel.pulseGlow(1); g.audio.play('crystal', { vol: 0.4 }); }
    if (T > f.wAt + 9.2 && !f.w3) { f.w3 = 1; this.gainHp(5); ui.subtitle('Home is not here any more. It is wherever they are. So that is where I am going.', '', 3.8, true); }
    if (T > f.wAt + 13.2 && !f.w4) { f.w4 = 1; ui.subtitle('Crossing to Earth needs fuel, heat plating, coolant and a heading. Vael. Ochre. Skarn. Thule.', 'LANDER', 5); g.audio.play('pa', { vol: 0.4 }); ui.setObjective(g.campaign.worldDone('ash')); ui.rewardNote('THE ROAD TO EARTH'); }
  }
  gainHp(n) { const g = this.g, p = g.player; for (let i = 0; i < n; i++) progress.addMaxHp(); p.maxHealth += n; p.health = Math.min(p.maxHealth, p.health + n); g.ui.setHealth(p.health, p.maxHealth); }
  reward(talk) {
    const g = this.g, ui = g.ui;
    if (talk.gift === 'hp' || talk.gift === 'hull') ui.rewardNote(talk.note);      // a new form announces itself when it unlocks
    g.audio.play('crystal', { vol: 0.6 }); g.viewmodel.pulseGlow(1); g.addShake(0.08);
    if (talk.gift === 'hp') this.gainHp(10); else if (talk.gift === 'hull') { try { localStorage.setItem('intruderv2-armor', '1'); } catch (e) { /* optional */ } g.flight.armor = 0.5; } else { g.arsenal.unlock(talk.gift); ui.rewardNote(talk.note); }
    ui.setObjective(g.campaign.worldDone(this.id));
  }

  placeAtShip() { const g = this.g, P = this.place, p = g.player; p.pos.set(ORIGIN.x + 5, P.h(5, 3) + 0.5, ORIGIN.z + 3); p.vx = p.vy = p.vz = 0; g.body.reset(); }

  beginClimb() {
    const g = this.g, P = this.place, p = g.player, L = P.lander;
    this.step = 'climb'; this.T = 0; g.opening.moveLocked = true; g.opening.hideBody = true; g.audio.combatMusic(false);
    g.input.keys.clear();
    const pose = this.pose; L.updateMatrixWorld(true);
    this.hopA = new THREE.Vector3(p.pos.x, p.eye, p.pos.z);
    pose.x = this.hopA.x; pose.y = this.hopA.y; pose.z = this.hopA.z; pose.q.setFromEuler(_e.set(p.pitch, p.yaw, 0, 'YXZ')); this.hopQ = pose.q.clone(); g.cinePose = pose;
    g.audio.play('hiss', { vol: 0.4 }); g.audio.play('gel', { vol: 0.5 });
    if (L.userData.canopyPivot) L.userData.canopyPivot.rotation.x = 1.15;
  }
  climb(dt, T, P, L, W) {
    const g = this.g, DUR = 2.3, pose = this.pose, k = ease(T, 0, DUR);
    _v.copy(SEAT_EYE).applyMatrix4(L.matrixWorld);
    pose.x = lerp(this.hopA.x, _v.x, k); pose.z = lerp(this.hopA.z, _v.z, k); pose.y = lerp(this.hopA.y, _v.y, k) + Math.sin(k * Math.PI) * 1.05;
    L.getWorldQuaternion(_q); _q.multiply(_q2.setFromAxisAngle(_x, -0.14)); pose.q.copy(this.hopQ).slerp(_q, ease(T, 0.3, DUR));
    if (L.userData.canopyPivot) L.userData.canopyPivot.rotation.x = 1.15 * (1 - ease(T, DUR - 0.5, DUR + 0.4));
    if (T > DUR - 0.2 && !this.f.e) { this.f.e = 1; g.audio.play('land', { vol: 0.5 }); g.audio.play('door', { vol: 0.7 }); }
    if (T > DUR + 0.5) { this.step = 'seated'; this.T = 0; g.audio.play('surge', { vol: 0.7 }); L.userData.engines.forEach((sp) => { sp.visible = true; }); }
  }
  liftoff(dt, T, P, L, W) {
    const g = this.g, DUR = 5.2, k = Math.pow(Math.min(1, T / DUR), 2.2);
    L.position.y = 1.25 + 230 * k; L.rotation.x = 0.3 * ease(T, 0.4, 2.2);
    L.userData.engines.forEach((sp) => sp.scale.setScalar(1.5 + 2.5 * ease(T, 0, 2) + Math.sin(T * 40) * 0.1));
    this.seat(L, -0.14); g.viewmodel.limp = 0.22; g.opening.reachAt(_v.copy(YOKE_GRIP).applyMatrix4(L.matrixWorld), 0.45);
    g.trauma = Math.max(g.trauma, 0.32); g.shakeAmp = 1.5;
    if (T < 1.8) { const c = g.effects.smokeP; if (c) for (let i = 0; i < 3; i++) { const an = R(0, 6.283), sp = R(4, 11); c.emit(ORIGIN.x + Math.cos(an) * R(1, 4), 0.4 + P.h(0, 0), ORIGIN.z + Math.sin(an) * R(1, 4), Math.cos(an) * sp, 0.6, Math.sin(an) * sp, 1.6, R(1, 2), 0.28, 0.25, 0.24, 0, 0.5, 2); } }
    g.ui.fade(ease(T, DUR - 1.3, DUR - 0.1));
    if (T >= DUR) this.leave(true);
  }

  // end the visit. back=true returns to flight.
  leave(back) {
    if (!this.active) return;
    const g = this.g, s = g.scene, c = g.camera, S = this.saved, P = this.place;
    for (const e of g.enemies) e.dispose?.();
    g.enemies = S.enemies; g.barrels = S.barrels; g.nav = S.nav; g.arena = S.arena;
    s.background = S.bg; s.fog = S.fog; c.far = S.far; c.updateProjectionMatrix(); g.post.applyFog(s);
    P.show(false); g.world.terrain = null; g.lightList = null; this.active = false; this.step = 'off'; g.campaign.removeTouch('world'); g.viewmodel.setEnv(0xffffff);
    g.player.extraSolid = null; g.player.gravMul = 1; g.cinePose = null; g.shakeAmp = 0; g.storyAct = null; g.viewmodel.limp = 0; g.viewmodel.reachW = 0; g.opening.moveLocked = false; g.opening.hideBody = false; g.ui.setPrompt(''); g.ui.setHold(null);
    if (back) g.flight.resumeFrom(this.id);
  }

  // death: back beside the ship, machines still where they were, a little healed
  respawn() {
    const g = this.g, p = g.player;
    p.dead = false; p.health = p.maxHealth; this.step = 'free'; this.T = 3; g.state = 'playing'; g.cinePose = null; g.opening.moveLocked = false; g.opening.hideBody = false;
    this.placeAtShip(); g.projectiles.clear(); g.absorber.reset(); g.viewmodel.limp = 0; g.ui.hideMenus(); g.ui.showHud(true); g.ui.fade(0);
    g.trauma = 0; g.hitFlash = 0; g.deathT = 0; g.deathMenu = false; g.deathPuddle.visible = false; g.body.deathK = 0; g.body.reset(); g.paused = false; g.lockRetries = 0; g.input.lock();
  }
}
