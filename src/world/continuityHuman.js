// Procedural human builder adapted from the author's earlier office game (Continuity): lathe torso, capsule limbs, modelled face, hair and clothing.
// Only the geometry/rig construction is used here; the office game's animation and scene code are not.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function canvasTexture(canvas, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.userData.shared = true;
  return t;
}

const shared = new Map();
function sharedMat(key, make) {
  if (!shared.has(key)) {
    const m = make();
    m.userData.shared = true;
    shared.set(key, m);
  }
  return shared.get(key);
}

const std = (color, roughness = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function capsule(r, len, cap = 6, radial = 12) {
  return new THREE.CapsuleGeometry(r, len, cap, radial);
}

/** Curly/coily hair texture: dense small loops, good for afros at close range. */
function coilTexture(base) {
  return sharedMat(`coiltex${base}`, () => {
    const S = 256, rand = rng(91);
    const [c, ctx] = makeCanvas(S);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const x = rand() * S, y = rand() * S, r = 1.5 + rand() * 3;
      ctx.strokeStyle = rand() > 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(255,235,210,0.08)';
      ctx.lineWidth = 0.8 + rand();
      ctx.beginPath();
      ctx.arc(x, y, r, rand() * 6, rand() * 6 + 4);
      ctx.stroke();
    }
    const t = canvasTexture(c);
    t.repeat.set(3, 3);
    return t;
  });
}

/** Plaited texture for braids: alternating diagonal segments along the strand. */
function braidTexture(base) {
  return sharedMat(`braidtex${base}`, () => {
    const W = 32, H = 128;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 8) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(W, y + 6); ctx.lineTo(W, y + 8); ctx.lineTo(0, y + 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,220,0.12)';
      ctx.fillRect(0, y + 3, W, 1);
    }
    const t = canvasTexture(c);
    t.repeat.set(1, 18);
    return t;
  });
}

/** Fine strand texture for straight hair (long styles, ponytails). */
function strandTexture() {
  return sharedMat('strandtex', () => {
    const W = 128, H = 128, rand = rng(17);
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const x = rand() * W;
      ctx.strokeStyle = rand() > 0.5 ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 0.6 + rand() * 0.8;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (rand() - 0.5) * 6, H); ctx.stroke();
    }
    return canvasTexture(c);
  });
}

function darken(hex, k) {
  return new THREE.Color(hex).multiplyScalar(k);
}

// ---------------------------------------------------------------- hair & face

/**
 * A rounded volume of hair sculpted back from the face (afros, curls): below the hairline
 * nothing comes forward of the forehead, so the face stays fully visible.
 */
function sculptedVolume({ center, radius, noise = 0.035, hairline = 0.162, minY = 0.07, seed = 1 }) {
  const geo = new THREE.SphereGeometry(1, 64, 48);
  const pos = geo.attributes.position;
  const rand = rng(seed);
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const C = new THREE.Vector3(...center), R = new THREE.Vector3(...radius);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // soft, cloud-like volume: low-frequency puffs plus fine coil noise in the colour
    const n = 1 + Math.sin(v.x * 7 + 1.3) * Math.cos(v.y * 6.5) * Math.sin(v.z * 7.5) * noise + (rand() - 0.5) * 0.012;
    const shade = 0.72 + rand() * 0.38;
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
    const x = C.x + v.x * R.x * n;
    let y = C.y + v.y * R.y * n, z = C.z + v.z * R.z * n;
    if (y < hairline + 0.03 && z > 0.02) {
      const k = Math.min(1, (hairline + 0.03 - y) / 0.06);
      const limit = 0.075 - Math.max(0, hairline - y) * 0.9;
      if (z > limit) z += (limit - z) * k;
    }
    if (y < minY) y = minY + (y - minY) * 0.4; // keep it above the ears' lower half
    pos.setXYZ(i, x, y, z);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildHair(style, mats, seed) {
  const g = new THREE.Group();
  const hairMat = mats.hair;
  if (style === 'bald') return g;

  // A close-fitting cap gives most styles a clean hairline (an afro forms its own).
  const capThickness = { braids: 0.006, buzz: 0.0016, side: 0.006, long: 0.006, ponytail: 0.005, balding: 0.003 }[style] ?? 0.004;
  if (style !== 'afro') g.add(new THREE.Mesh(hairShell(capThickness, { bald: style === 'balding' }), style === 'buzz' ? mats.buzz : hairMat));

  if (style === 'afro') {
    g.add(new THREE.Mesh(sculptedVolume({ center: [0, 0.175, -0.045], radius: [0.178, 0.158, 0.172], seed }), mats.afro));
  } else if (style === 'curly') {
    // close curls: a smaller, bumpier volume over the crown
    g.add(new THREE.Mesh(sculptedVolume({ center: [0, 0.165, -0.03], radius: [0.122, 0.098, 0.124], noise: 0.08, hairline: 0.168, minY: 0.09, seed }), mats.afro));
  } else if (style === 'braids') {
    // Long braids from a ring around the crown, falling past the shoulders.
    const rand = rng(seed);
    const geos = [];
    const count = 30;
    for (let i = 0; i < count; i++) {
      // Leave the face clear: braids start from the sides and back only.
      const a = -Math.PI * 0.62 + (i / (count - 1)) * Math.PI * 1.24 + Math.PI; // around the back
      const ring = 0.098;
      const sx = Math.sin(a) * ring, sz = Math.cos(a) * ring * 1.05 - 0.01;
      const sy = 0.12 + Math.abs(Math.cos(a)) * 0.03;
      const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const len = 0.42 + rand() * 0.1;
      const pts = [
        new THREE.Vector3(sx, sy, sz),
        new THREE.Vector3(sx + out.x * 0.035, sy - 0.07, sz + out.z * 0.04),
        new THREE.Vector3(sx + out.x * 0.06, sy - 0.18, sz + out.z * 0.07 - 0.01),
        new THREE.Vector3(sx + out.x * 0.07 + (rand() - 0.5) * 0.02, sy - len * 0.7, sz + out.z * 0.085 - 0.03),
        new THREE.Vector3(sx + out.x * 0.07 + (rand() - 0.5) * 0.03, sy - len, sz + out.z * 0.08 - 0.05),
      ];
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.0085, 5, false));
    }
    g.add(new THREE.Mesh(mergeGeometries(geos), mats.braid));
    for (const geo of geos) geo.dispose();
  } else if (style === 'bun') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), hairMat);
    bun.position.set(0, 0.2, -0.08);
    g.add(bun);
  } else if (style === 'bob') {
    // open at the front (θ = 0 faces +z) so the face stays clear
    const sides = new THREE.Mesh(new THREE.CylinderGeometry(0.106, 0.116, 0.14, 24, 1, true, Math.PI * 0.32, Math.PI * 1.36), mats.hairDS);
    sides.position.set(0, 0.06, -0.008);
    g.add(sides);
  } else if (style === 'long') {
    // a curtain of hair from the crown to the shoulders, open at the face
    const curtain = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.122, 0.3, 26, 3, true, Math.PI * 0.3, Math.PI * 1.4), mats.strands);
    curtain.position.set(0, 0.045, -0.012);
    g.add(curtain);
  } else if (style === 'ponytail') {
    const tie = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 10), hairMat);
    tie.position.set(0, 0.15, -0.1);
    g.add(tie);
    const tail = new THREE.Mesh(capsule(0.026, 0.16, 4, 10), mats.strands);
    tail.position.set(0, 0.06, -0.125);
    tail.rotation.x = 0.22;
    g.add(tail);
  } else if (style === 'side') {
    // a side parting: a little volume on top, swept to one side
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.094, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
    top.position.set(0.006, 0.172, -0.012);
    top.scale.set(1.02, 0.55, 1.04);
    top.rotation.z = -0.08;
    g.add(top);
  }
  return g;
}

// Head shape shared by the head mesh and the face layout: [radius, height] from chin to crown.
const HEAD_PROFILE = [[0.0, 0.0], [0.03, 0.004], [0.055, 0.02], [0.073, 0.05], [0.086, 0.09], [0.093, 0.13], [0.091, 0.165], [0.078, 0.2], [0.052, 0.222], [0.02, 0.231], [0.0, 0.232]];
const HEAD_DEPTH = 1.1;

function headRadius(y) {
  for (let i = 1; i < HEAD_PROFILE.length; i++) {
    const [r1, y1] = HEAD_PROFILE[i], [r0, y0] = HEAD_PROFILE[i - 1];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

/** Z of the front of the face at height y and sideways offset x. */
function faceZ(y, x = 0, widthScale = 1) {
  const r = headRadius(y);
  const xr = x / widthScale;
  return Math.sqrt(Math.max(0, r * r - xr * xr)) * HEAD_DEPTH + 0.004;
}

/**
 * Hair cap that hugs the head: the head surface pushed outwards by `thickness`, keeping
 * only triangles above a hairline that is high at the forehead and low at the nape.
 * `bald` leaves the crown bare (a fringe around the sides and back).
 */
function hairShell(thickness, { bald = false } = {}) {
  const head = new THREE.LatheGeometry(HEAD_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 36).toNonIndexed();
  const pos = head.attributes.position;
  const keep = [];
  const keepN = [];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let t = 0; t < pos.count; t += 3) {
    let cy = 0, cz = 0, cx = 0;
    for (let k = 0; k < 3; k++) {
      v[k].fromBufferAttribute(pos, t + k);
      cx += v[k].x / 3; cy += v[k].y / 3; cz += v[k].z / 3;
    }
    const front = Math.max(-1, Math.min(1, cz / 0.08));            // +1 at the forehead, −1 at the nape
    const side = Math.min(1, Math.abs(cx) / 0.085);
    let hairline = 0.105 + front * 0.055;                         // forehead ~0.16, nape ~0.05
    if (front > 0.3) hairline += side * 0.02;                     // temples recede slightly
    if (cy < hairline) continue;
    if (bald && cy > 0.168 && front > -0.55) continue;            // bare crown and forehead
    for (let k = 0; k < 3; k++) {
      // smooth radial normal of the lathe (the triangle soup's own normals would be flat)
      const n = new THREE.Vector3(v[k].x, 0, v[k].z);
      const r = n.length();
      const prof = v[k].y > 0.2 ? (v[k].y - 0.2) / 0.032 : 0;
      n.multiplyScalar(r > 1e-5 ? (1 - prof * 0.7) / r : 0);
      n.y = prof * 0.9 + 0.05;
      n.normalize();
      keep.push(v[k].x + n.x * thickness, v[k].y + n.y * thickness, (v[k].z + n.z * thickness) * HEAD_DEPTH + 0.004);
      keepN.push(n.x, n.y, n.z / HEAD_DEPTH);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(keep), 3));
  const nArr = new Float32Array(keepN);
  for (let i = 0; i < nArr.length; i += 3) {
    const l = Math.hypot(nArr[i], nArr[i + 1], nArr[i + 2]) || 1;
    nArr[i] /= l; nArr[i + 1] /= l; nArr[i + 2] /= l;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(nArr, 3));
  head.dispose();
  return geo;
}

const EYE_COLORS = ['#2a1a12', '#3b2414', '#4a3a22', '#2f4a5a', '#3d5a3a', '#55402a'];

/** Face proportions for a person, deterministic from their seed. */
function faceParams(spec) {
  const r = rng((spec.seed ?? 7) * 7919 + 13);
  const pick = (list) => list[Math.floor(r() * list.length)];
  return {
    width: 0.95 + r() * 0.1,
    eyeX: 0.031 + r() * 0.005,
    nose: 0.85 + r() * 0.35,
    noseWidth: 0.9 + r() * 0.3,
    lips: 0.85 + r() * 0.45,
    mouthW: 0.9 + r() * 0.2,
    jaw: 0.9 + r() * 0.25,
    brow: 0.0028 + r() * 0.0016,
    browLift: (r() - 0.5) * 0.004,
    browTilt: (r() - 0.5) * 0.25,
    ear: 0.9 + r() * 0.2,
    eyeColor: spec.eyes ?? pick(EYE_COLORS),
  };
}

function buildFace(spec, mats) {
  const g = new THREE.Group();
  const skin = mats.skin;
  const f = spec.face;
  const ws = (spec.body === 'f' ? 0.96 : 1) * f.width;
  const add = (geo, mat, x, y, z, s = [1, 1, 1], r = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(...s);
    m.rotation.set(...r);
    g.add(m);
    return m;
  };
  const eyeY = 0.122, eyeX = f.eyeX;
  const eyes = [];
  for (const sx of [-1, 1]) {
    // eye sits in a shallow socket: whites just behind the surface, iris on top
    const eye = new THREE.Group();
    eye.position.set(sx * eyeX, eyeY, faceZ(eyeY, eyeX, ws) - 0.009);
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.0125, 14, 10), mats.eyeWhite));
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0074, 12, 8), mats.iris);
    iris.position.z = 0.0082;
    eye.add(iris);
    eye.scale.set(1.15, 0.78, 0.75);
    g.add(eye);
    eyes.push(eye);
    // upper lid / socket shadow and brow
    add(capsule(0.006, 0.02, 4, 8), skin, sx * eyeX, eyeY + 0.011, faceZ(eyeY + 0.011, eyeX, ws) - 0.002, [1, 1, 0.6], [0, 0, Math.PI / 2]);
    add(capsule(f.brow, 0.026, 4, 6), mats.brow, sx * (eyeX + 0.003), 0.146 + f.browLift, faceZ(0.146, eyeX + 0.003, ws) + 0.001, [1, 1, 0.8], [0, 0, Math.PI / 2 + sx * f.browTilt]);
    // cheekbone: a soft swelling that breaks up the egg shape
    add(new THREE.SphereGeometry(0.018, 10, 8), skin, sx * 0.05 * ws, 0.096, faceZ(0.096, 0.05 * ws, ws) - 0.02, [1.3, 0.7, 0.5]);
    // ear
    add(new THREE.SphereGeometry(0.02, 12, 8), skin, sx * (headRadius(0.11) * ws + 0.002), 0.11, -0.004, [0.42, 1.2 * f.ear, 0.8]);
  }
  // nose: bridge, tip and nostrils
  const noseY = 0.094, ns = f.nose;
  add(capsule(0.0065 * ns, 0.026, 4, 8), skin, 0, noseY + 0.016, faceZ(noseY + 0.016) - 0.001, [1, 1, 1], [0.3, 0, 0]);
  add(new THREE.SphereGeometry(0.0105, 12, 10), skin, 0, noseY, faceZ(noseY) + 0.005 * ns, [1.3 * f.noseWidth, 0.85, ns]);
  for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.0068, 8, 6), skin, sx * 0.0105 * f.noseWidth, noseY - 0.002, faceZ(noseY, 0.0105) + 0.0005, [1.2, 0.8, 1]);
  // lips: two slim, slightly flattened rolls set into the face
  const mouthY = 0.062, lf = f.lips;
  add(capsule(0.0042 * lf, 0.024 * f.mouthW, 4, 8), mats.lips, 0, mouthY + 0.0035, faceZ(mouthY + 0.0035) - 0.0025, [1, 1, 0.7], [0, 0, Math.PI / 2]);
  add(capsule(0.0048 * lf, 0.021 * f.mouthW, 4, 8), mats.lips, 0, mouthY - 0.004, faceZ(mouthY - 0.004) - 0.0025, [1, 1, 0.7], [0, 0, Math.PI / 2]);
  // chin
  add(new THREE.SphereGeometry(0.022, 10, 8), skin, 0, 0.026, faceZ(0.026) - 0.016, [1.1 * f.jaw, 0.8, 0.8]);
  // facial hair
  if (spec.facialHair === 'goatee') {
    add(new THREE.SphereGeometry(0.02, 14, 10), mats.hair, 0, 0.03, faceZ(0.03) - 0.009, [1.0, 1.35, 0.7]);
    add(capsule(0.0028, 0.034, 4, 8), mats.hair, 0, mouthY + 0.011, faceZ(mouthY + 0.011) - 0.0005, [1, 1, 0.7], [0, 0, Math.PI / 2]);
    for (const sx of [-1, 1]) add(capsule(0.0028, 0.02, 4, 6), mats.hair, sx * 0.019, mouthY - 0.004, faceZ(mouthY - 0.004, 0.019) - 0.001, [1, 1, 0.7], [0, 0, sx * 0.15]);
  } else if (spec.facialHair === 'beard') {
    add(new THREE.SphereGeometry(0.08, 18, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), mats.hair, 0, 0.085, 0.006, [1.03, 1.12, 1.18]);
  } else if (spec.facialHair === 'stubble') {
    add(new THREE.SphereGeometry(0.08, 18, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.42), mats.stubble, 0, 0.088, 0.004, [1.0, 1.06, 1.12]);
  } else if (spec.facialHair === 'moustache') {
    add(capsule(0.0045, 0.03, 4, 8), mats.hair, 0, mouthY + 0.011, faceZ(mouthY + 0.011) - 0.001, [1, 1, 0.8], [0, 0, Math.PI / 2]);
  }
  if (spec.glasses) {
    const gz = faceZ(eyeY) + 0.01;
    for (const sx of [-1, 1]) add(new THREE.TorusGeometry(0.019, 0.0025, 6, 16), mats.frames, sx * eyeX, eyeY, gz);
    add(new THREE.BoxGeometry(0.02, 0.003, 0.003), mats.frames, 0, eyeY + 0.003, gz);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.003, 0.003, 0.09), mats.frames, sx * (headRadius(eyeY) * ws + 0.004), eyeY + 0.002, gz - 0.05);
  }
  return { group: g, eyes };
}

// ---------------------------------------------------------------- body

/**
 * @param {object} spec
 *  id, height, body ('f'|'m'), build (0.9–1.15 width factor), belly (0–0.2), posture,
 *  skin, eyes, hair { style: short|side|buzz|balding|afro|curly|braids|bun|bob|long|ponytail|bald, color },
 *  facialHair (goatee|beard|stubble|moustache), glasses,
 *  top { color, sleeves: 'long'|'rolled'|'short', style: 'shirt'|'polo'|'sweater'|'blouse',
 *        cardigan?, blazer?, tie? }, bottom, skirt, shoes,
 *  missingHand: null | 'left' | 'right'
 */
function buildCharacter(spec) {
  spec = { ...spec, face: faceParams(spec) };
  const scale = (spec.height ?? 1.72) / 1.72;
  const w = spec.build ?? 1;
  const belly = spec.belly ?? 0;
  const female = spec.body === 'f';
  const top = spec.top ?? { color: '#555555' };
  const style = top.style ?? 'shirt';
  const outerColor = top.blazer ?? top.cardigan ?? null;
  const hairColor = spec.hair?.color ?? '#1b1410';
  const mats = {
    skin: std(spec.skin, 0.62),
    lips: std(darken(spec.skin, 0.8), 0.5),
    hair: std(hairColor, 0.9),
    hairDS: std(hairColor, 0.9, { side: THREE.DoubleSide }),
    brow: std(hairColor, 0.9),
    buzz: std(new THREE.Color(hairColor).lerp(new THREE.Color(spec.skin), 0.35), 0.95),
    stubble: std(new THREE.Color(hairColor).lerp(new THREE.Color(spec.skin), 0.45), 0.95, { transparent: true, opacity: 0.55, depthWrite: false }),
    top: std(top.color, style === 'polo' || style === 'sweater' ? 0.95 : 0.85),
    topTrim: std(new THREE.Color(top.color).lerp(new THREE.Color('#ffffff'), 0.2), 0.8),
    topShade: std(new THREE.Color(top.color).multiplyScalar(0.84), 0.9),
    outer: outerColor ? std(outerColor, top.blazer ? 0.75 : 0.95) : null,
    tie: top.tie ? std(top.tie, 0.55) : null,
    bottom: std(spec.bottom, 0.8),
    shoes: std(spec.shoes ?? '#1d1b1a', 0.45),
    buckle: sharedMat('beltBuckle', () => std('#b9a775', 0.38, { metalness: 0.45 })),
    eyeWhite: sharedMat('eyeWhite', () => std('#e9e4dc', 0.35)),
    iris: sharedMat(`iris${spec.face.eyeColor}`, () => std(spec.face.eyeColor, 0.25)),
    frames: sharedMat('frames', () => std('#222222', 0.4, { metalness: 0.4 })),
    lanyard: sharedMat('lanyard', () => std('#2f5a55', 0.8)),
    badge: sharedMat('badge', () => std('#f1f1ee', 0.4)),
  };
  mats.afro = new THREE.MeshStandardMaterial({ color: hairColor, vertexColors: true, roughness: 1, bumpMap: coilTexture('#808080'), bumpScale: 2.5 });
  mats.braid = new THREE.MeshStandardMaterial({ color: '#ffffff', map: braidTexture(hairColor), roughness: 0.95 });
  mats.strands = new THREE.MeshStandardMaterial({ color: hairColor, map: strandTexture(), roughness: 0.85, side: THREE.DoubleSide });
  const armMat = mats.outer ?? mats.top;

  const J = {};
  const joint = (name, parent, x, y, z) => {
    const j = new THREE.Group();
    j.name = name;
    j.position.set(x, y, z);
    parent.add(j);
    J[name] = j;
    return j;
  };
  const mesh = (parent, geo, mat, x = 0, y = 0, z = 0, s = null, r = null) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (s) m.scale.set(...s);
    if (r) m.rotation.set(...r);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  const root = new THREE.Group();
  root.name = `npc:${spec.id}`;
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);

  const LEG = 0.9;           // hip joint height when standing
  const hips = joint('hips', body, 0, LEG, 0);
  const torsoDepth = (female ? 0.8 : 0.74) * w + belly * 0.35;
  // pelvis (a skirt flares out over the thighs instead)
  mesh(hips, capsule(0.11, 0.12, 6, 14), mats.bottom, 0, 0.02, 0, [female ? 1.12 : 1.02, 0.9, 0.74 * w + belly * 0.3], [0, 0, Math.PI / 2]);
  if (spec.skirt) mesh(hips, new THREE.CylinderGeometry(0.125 * w, 0.17 * w, 0.42, 22, 1, true), std(spec.bottom, 0.85, { side: THREE.DoubleSide }), 0, -0.18, 0, [1, 1, 0.82]);

  // torso: a lathe gives a natural taper from waist to shoulders; a belly widens the middle
  const spine = joint('spine', hips, 0, 0.06, 0);
  const prof = (female
    ? [[0.001, 0], [0.126, 0], [0.118, 0.07], [0.112, 0.14], [0.13, 0.24], [0.14, 0.3], [0.134, 0.36], [0.122, 0.405], [0.09, 0.448], [0.05, 0.468], [0.001, 0.47]]
    : [[0.001, 0], [0.128, 0], [0.13, 0.1], [0.142, 0.22], [0.152, 0.32], [0.148, 0.385], [0.125, 0.43], [0.08, 0.46], [0.045, 0.47], [0.001, 0.47]])
    .map(([r, y]) => [r + belly * Math.max(0, Math.sin(Math.PI * Math.min(1, y / 0.32))) * 0.12, y]);
  const torsoGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  mesh(spine, torsoGeo, mats.outer ?? mats.top, 0, 0, 0, [1.16 * w, 1, torsoDepth]);
  const surfaceZ = (x, y) => {
    let r = prof[0][0];
    for (let i = 1; i < prof.length; i++) {
      if (y <= prof[i][1]) { const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]; r = r0 + ((r1 - r0) * (y - y0)) / (y1 - y0); break; }
    }
    const s = x / (1.16 * w);
    return Math.sqrt(Math.max(0, r * r - s * s)) * torsoDepth;
  };
  const chestZ = torsoDepth * 0.135;
  // an open cardigan or blazer shows the shirt down the middle of the chest
  if (mats.outer) {
    mesh(spine, new THREE.BoxGeometry(0.075, 0.38, 0.01), mats.top, 0, 0.25, surfaceZ(0, 0.25) + 0.002, null, [-0.04, 0, 0]);
    if (top.blazer) for (const sx of [-1, 1]) mesh(spine, new THREE.BoxGeometry(0.03, 0.14, 0.008), mats.outer, sx * 0.042, 0.37, surfaceZ(0.042, 0.37) + 0.006, null, [-0.12, 0, sx * 0.38]);
  }
  // belt line, with a small buckle to break up the trouser waist
  mesh(hips, new THREE.TorusGeometry(0.118, 0.012, 6, 24), mats.bottom, 0, 0.065, 0, [1.12 * w, torsoDepth, 1], [Math.PI / 2, 0, 0]);
  mesh(hips, new THREE.BoxGeometry(0.045, 0.03, 0.008), mats.buckle, 0, 0.066, 0.106 * w + belly * 0.04);
  // neckline: collar points on shirts and polos, a plain crew neck otherwise
  mesh(spine, new THREE.TorusGeometry(0.052, 0.012, 6, 18), mats.top, 0, 0.455, 0.004, [1.05, 1, 0.9], [Math.PI / 2, 0, 0]);
  if (style === 'shirt' || style === 'polo' || top.tie) {
    for (const sx of [-1, 1]) mesh(spine, new THREE.BoxGeometry(0.05, 0.032, 0.006), mats.top, sx * 0.024, 0.45, chestZ * 0.55 + 0.03, null, [-0.5, sx * 0.35, sx * 0.6]);
  }
  // a tailored chest pocket and flap on shirts reads at conversation distance
  if ((style === 'shirt' || style === 'polo') && !mats.outer) {
    const px = 0.073 * w, py = 0.335, pz = surfaceZ(px, py) + 0.005;
    mesh(spine, new THREE.BoxGeometry(0.064, 0.071, 0.008), mats.topShade, px, py, pz);
    mesh(spine, new THREE.BoxGeometry(0.061, 0.012, 0.01), mats.topTrim, px, py + 0.035, pz + 0.005);
  }
  if (mats.tie) {
    mesh(spine, new THREE.BoxGeometry(0.026, 0.02, 0.012), mats.tie, 0, 0.43, chestZ * 0.6 + 0.03);
    mesh(spine, new THREE.BoxGeometry(0.036, 0.3, 0.006), mats.tie, 0, 0.27, surfaceZ(0, 0.27) + 0.008, null, [-0.06, 0, 0]);
  }
  // the company lanyard: two straps from the collar down to a badge
  for (const sx of [-1, 1]) {
    mesh(spine, new THREE.BoxGeometry(0.012, 0.19, 0.003), mats.lanyard, sx * 0.03, 0.36, surfaceZ(0.03, 0.36) + 0.012, null, [-0.32, 0, sx * 0.16]);
  }
  mesh(spine, new THREE.BoxGeometry(0.05, 0.07, 0.004), mats.badge, 0, 0.245, surfaceZ(0, 0.245) + 0.016, null, [-0.1, 0, 0]);

  const neck = joint('neck', spine, 0, 0.462, 0);
  mesh(neck, new THREE.CylinderGeometry(0.046, 0.054, 0.09, 16), mats.skin, 0, 0.035, 0);
  const head = joint('head', neck, 0, 0.03, 0.012);
  // one smooth egg-shaped head: rounded cranium tapering to the jaw and chin
  const ws = (female ? 0.96 : 1) * spec.face.width;
  mesh(head, new THREE.LatheGeometry(HEAD_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 36), mats.skin, 0, 0, 0.004, [ws, 1, HEAD_DEPTH]);
  const face = buildFace(spec, mats);
  head.add(face.group);
  head.add(buildHair(spec.hair?.style ?? 'short', mats, spec.seed ?? 7));

  // arms
  const shoulderY = 0.41, shoulderX = (female ? 0.165 : 0.19) * w;
  const arm = (side) => {
    const sx = side === 'left' ? 1 : -1;  // character's left is +x when facing +z
    const s = joint(`${side}Shoulder`, spine, sx * shoulderX, shoulderY, -0.005);
    // deltoid: a low, flattened cap that blends the arm into the torso
    mesh(s, new THREE.SphereGeometry(0.048, 14, 10), armMat, sx * -0.02, -0.03, 0, [0.9, 0.6, 0.85]);
    mesh(s, capsule(0.043, 0.22), armMat, 0, -0.14, 0);
    const e = joint(`${side}Elbow`, s, 0, -0.28, 0);
    const sleeve = top.sleeves ?? 'long';
    const forearmMat = sleeve === 'long' ? armMat : mats.skin;
    const missing = spec.missingHand === side;
    const foreLen = missing ? 0.16 : 0.2;
    mesh(e, capsule(0.038, foreLen), forearmMat, 0, -foreLen / 2 - 0.02, 0);
    if (sleeve === 'rolled') mesh(e, new THREE.TorusGeometry(0.043, 0.012, 6, 14), armMat, 0, -0.02, 0, null, [Math.PI / 2, 0, 0]);
    if (sleeve === 'long') mesh(e, new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12), mats.outer ? mats.top : armMat, 0, -0.245, 0);
    const wrist = joint(`${side}Wrist`, e, 0, -0.26, 0);
    if (!missing) {
      // palm and loosely curled fingers, thumb forward (palms face the body)
      mesh(wrist, capsule(0.03, 0.045, 4, 10), mats.skin, 0, -0.05, 0.004, [0.45, 1, 1.05], [0, Math.PI / 2, 0]);
      mesh(wrist, capsule(0.026, 0.03, 4, 10), mats.skin, 0, -0.1, 0.012, [0.42, 1, 1], [0.35, Math.PI / 2, 0]);
      mesh(wrist, capsule(0.011, 0.035, 4, 8), mats.skin, 0, -0.045, 0.04, null, [0.6, 0, 0]);
    }
  };
  arm('left');
  arm('right');

  // legs
  const leg = (side) => {
    const sx = side === 'left' ? 1 : -1;
    const hip = joint(`${side}Hip`, hips, sx * 0.09 * w, 0, 0);
    const legMat = spec.skirt ? mats.skin : mats.bottom;
    mesh(hip, capsule(0.068 + belly * 0.05, 0.32), legMat, 0, -0.2, 0, spec.skirt ? [0.75, 1, 0.75] : null);
    const knee = joint(`${side}Knee`, hip, 0, -0.43, 0);
    mesh(knee, capsule(0.055, 0.33), legMat, 0, -0.2, 0, spec.skirt ? [0.8, 1, 0.8] : null);
    const ankle = joint(`${side}Ankle`, knee, 0, -0.42, 0);
    mesh(ankle, new THREE.BoxGeometry(0.09, 0.07, 0.24), mats.shoes, 0, -0.035, 0.05);
  };
  leg('left');
  leg('right');

  mergeChildMeshes(root);
  root.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });

  return { root, body, J, scale };
}

function buildHandProps(wrist, spec) {
  if (spec.missingHand === 'right') return {};
  const make = (geo, color, x, y, z, r = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, sharedMat(`prop${color}`, () => std(color, 0.4)));
    m.position.set(x, y, z);
    m.rotation.set(...r);
    m.visible = false;
    m.castShadow = true;
    wrist.add(m);
    return m;
  };
  const mugColor = ['#3f7c7a', '#8f3a34', '#e8e4da', '#2f4f7a'][(spec.seed ?? 1) % 4];
  return {
    mug: make(new THREE.CylinderGeometry(0.036, 0.033, 0.09, 14), mugColor, 0, -0.085, 0.045, [0, 0, Math.PI / 2]),
    handset: make(new THREE.BoxGeometry(0.045, 0.19, 0.035), '#2a2c2f', 0, -0.07, 0.035, [0.15, 0, 0]),
    paper: make(new THREE.BoxGeometry(0.21, 0.003, 0.28), '#f2f0ea', 0.0, -0.1, 0.08, [0.2, 0, Math.PI / 2]),
  };
}

/**
 * Within every joint, merges sibling meshes that share a material into one mesh.
 * The animated hierarchy is untouched; a character drops from ~70 to ~25 draw calls.
 */
function mergeChildMeshes(root) {
  const nodes = [];
  root.traverse((o) => { if (!o.isMesh) nodes.push(o); });
  for (const node of nodes) {
    const byMat = new Map();
    for (const c of node.children) {
      if (!c.isMesh) continue;
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(c);
    }
    for (const [material, meshes] of byMat) {
      if (meshes.length < 2) continue;
      const geos = meshes.map((m) => {
        m.updateMatrix();
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        return g.applyMatrix4(m.matrix);
      });
      const merged = new THREE.Mesh(mergeGeometries(geos), material);
      for (const g of geos) g.dispose();
      for (const m of meshes) { node.remove(m); m.geometry.dispose(); }
      node.add(merged);
    }
  }
}

// ---------------------------------------------------------------- animation

const tmpV = new THREE.Vector3();
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Which prop each action holds. */
const ACTION_PROP = { phone: 'handset', sip: 'mug', read: 'paper' };

export { buildCharacter };
