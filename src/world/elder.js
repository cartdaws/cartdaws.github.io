import * as THREE from 'three';
import { Shape } from '../creature/shape.js';
import { defaults } from '../creature/definition.js';
import { makeSkin, skinParams } from '../creature/skin.js';
import { makeHandGel } from '../presentation/hand.js';

// The one who waits, built from the very same parts as the player: the Blender humanoid torso and head (creature.glb, driven by the same
// shape keys), the same gel skin, the same stepping legs and the same gel arm and hand (hand.glb). An elder is the player's own kind,
// so the differences are small and read as age: taller, stooped, a fuller belly, broader shoulders, violet veins and a slow inner light.
export function elderDefinition(base = defaults()) {
  const d = JSON.parse(JSON.stringify(base));
  d.body.height = 1.0; d.body.width = 1.08; d.body.depth = 1.04;
  d.body.shoulderWidth = Math.min(0.8, d.body.shoulderWidth + 0.22);
  d.body.lean = 0.3; d.body.curve = 0.35;
  d.head.size = (d.head.size || 1) * 1.08;
  d.skin.pattern = 'veins';
  d.skin.primary = '#16807a'; d.skin.secondary = '#6fe0c8';      // the player's own teal, a little paler with age
  d.skin.marking = '#e0d0ff'; d.skin.glow = '#b99cff'; d.skin.glowIntensity = 0.7;
  return d;
}

const ELDER_SCALE = 1.34;        // the elder stands well above the player

function tube(mat, r0, r1, len) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 14, 6).translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 2;
  return m;
}

export function buildElder(creature, hand, playerDef) {
  const def = elderDefinition(playerDef);
  const root = new THREE.Group();
  const body = new THREE.Group();              // breathes and flinches as one
  root.add(body);

  const shape = new Shape(creature);
  const r = shape.resolve(def), S = r.scale;
  const skin = makeSkin({ ...skinParams(def, 'body') });
  const bell = new THREE.Mesh(creature.geometry, skin);
  bell.morphTargetDictionary = { ...creature.dict };
  bell.morphTargetInfluences = new Array(Object.keys(creature.dict).length).fill(0);
  for (const [n, w] of Object.entries(r.infl)) bell.morphTargetInfluences[bell.morphTargetDictionary[n]] = w;
  bell.scale.copy(S); bell.frustumCulled = false; bell.renderOrder = 2;
  body.add(bell);

  const H = def.head, hs = H.size * (0.92 + 0.08 * S.y);
  const head = new THREE.Mesh(creature.head.geometry, skin);
  head.morphTargetDictionary = { ...creature.head.dict };
  head.morphTargetInfluences = new Array(Object.keys(creature.head.dict).length).fill(0);
  head.frustumCulled = false; head.renderOrder = 2;
  const headGroup = new THREE.Group(); headGroup.add(head); body.add(headGroup);
  headGroup.position.copy(shape.neck).multiplyScalar(1).add(new THREE.Vector3(0, -0.012, 0));
  headGroup.scale.set(hs * (1 + 0.25 * H.width) * (0.9 + 0.1 * S.x), hs, hs * (1 + 0.2 * H.length) * (0.9 + 0.1 * S.z));
  headGroup.position.y = shape.neck.y * S.y - 0.012 + 0.0;

  // legs: tapered gel tubes under the hips, ending in rounded, flattened feet, as the player's body has
  const hipY = 0.8 * S.y;
  for (const sx of [-1, 1]) {
    const leg = tube(skin, 0.085, 0.04, hipY);
    leg.position.set(sx * 0.12 * S.x, hipY, 0.0); body.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), skin);
    foot.scale.set(0.06, 0.036, 0.11); foot.position.set(sx * 0.12 * S.x, 0.03, -0.04); foot.frustumCulled = false; foot.renderOrder = 2; body.add(foot);
  }

  // inner light: a slow violet-white core in the chest, the same device the player's body carries
  const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.skin.glow).lerp(new THREE.Color(0xffffff), 0.6), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), core);
  coreMesh.position.set(0, 1.12 * S.y, 0); coreMesh.scale.setScalar(0.42 * Math.min(S.x, S.z)); body.add(coreMesh);
  const light = new THREE.PointLight(0xb99cff, 1.6, 7, 2); light.position.set(0, 1.2 * S.y, -0.5); light.userData.keepOn = true; body.add(light);

  // arms: the player's own gel arm and hand (hand.glb), here at the shoulders. The right arm reaches; the left hangs.
  const gel = makeHandGel({ color: new THREE.Color(def.skin.primary).getHex(), rim: new THREE.Color(def.skin.marking).getHex(), alpha: 0.62 });
  const sh = shape.sockets;
  hand.Hand.geometry.computeBoundingBox();
  const HB = hand.Hand.geometry.boundingBox, LEN = HB.max.z - HB.min.z;
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    const m = hand.Hand.clone(); m.material = gel; m.frustumCulled = false; m.renderOrder = 4;
    m.position.z = -HB.max.z;                    // the forearm's elbow end sits on the shoulder pivot; the hand points along -Z
    const inner = new THREE.Group(); inner.scale.set(side, 1, 1); inner.add(m);
    pivot.add(inner);
    return { pivot, inner, mesh: m };
  };
  const R = makeArm(1), L = makeArm(-1);
  const shoulderX = Math.max(0.2, Math.abs(sh.R.p.x)) * S.x;
  const shoulderY = Math.max(1.0, sh.R.p.y * S.y);
  R.pivot.position.set(-shoulderX, shoulderY, sh.R.p.z * S.z);
  L.pivot.position.set(shoulderX, shoulderY, sh.L.p.z * S.z);
  R.pivot.userData.y0 = shoulderY;
  body.add(R.pivot, L.pivot);

  // measure the hand so the arm reaches a fixed length however the asset is scaled
  const armScale = 0.95 / LEN;
  for (const a of [R, L]) a.pivot.scale.setScalar(armScale);

  root.scale.setScalar(ELDER_SCALE);
  return { root, body, arm: R.pivot, armL: L.pivot, core, headGroup, def, tipLocal: new THREE.Vector3(0, 0.04 / armScale, -LEN * 0.98) };
}
