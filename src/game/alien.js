import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The survivor's kind (art/build_alien.py -> public/models/alien.glb): a dark, soft, abyssal cephalopod. The game keeps its own procedural legs
// (so the feet plant and step); everything else comes from the model. Materials are swapped by name for ones that read well in the game's light.
let ASSET = null;
export async function loadAlien() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/alien.glb');
  ASSET = gltf.scene;
  ASSET.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return ASSET;
}
export const alienReady = () => !!ASSET;

const PALETTE = {
  player: { skin: 0x0b1522, limb: 0x0d1a28, sheen: 0x2fb8a8, photo: 0x7fe8da, photoV: 0xb99cff, pupil: 0xff9a2a },
  elder: { skin: 0x151228, limb: 0x181430, sheen: 0x9c7cf0, photo: 0xb99cff, photoV: 0xe0d0ff, pupil: 0xd8c0ff },
};

// A fresh copy of the body (no legs; those are procedural). opts.arms: keep the two long arms (the elder shows them; the player's arms are first person).
export function buildAlien({ tint = 'player', arms = false } = {}) {
  const P = PALETTE[tint] || PALETTE.player;
  const root = ASSET.clone(true);
  const skin = new THREE.MeshPhysicalMaterial({ color: P.skin, roughness: 0.3, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.14, sheen: 1, sheenColor: new THREE.Color(P.sheen), sheenRoughness: 0.45, emissive: new THREE.Color(P.sheen).multiplyScalar(0.05) });
  const limb = skin.clone(); limb.color.set(P.limb);
  const mats = {
    skin, limb,
    eye: new THREE.MeshPhysicalMaterial({ color: 0x010203, roughness: 0.05, clearcoat: 1 }),
    pupil: new THREE.MeshBasicMaterial({ color: P.pupil }),
    photo: new THREE.MeshBasicMaterial({ color: P.photo }),
    photoV: new THREE.MeshBasicMaterial({ color: P.photoV }),
    core: new THREE.MeshBasicMaterial({ color: P.photo, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    sucker: new THREE.MeshPhysicalMaterial({ color: 0x1a2634, roughness: 0.25, clearcoat: 0.9 }),
  };
  const byName = { SkinBody: skin, SkinLimb: limb, Underside: limb, Eye: mats.eye, Pupil: mats.pupil, Brow: skin, Sucker: mats.sucker, Photophore: mats.photo, PhotophoreViolet: mats.photoV, Core: mats.core };
  const drop = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (/^(Leg\d|Suckers\d)/.test(o.name) || (!arms && /^Arm/.test(o.name))) { drop.push(o); return; }
    const nm = o.material && o.material.name;
    if (byName[nm]) o.material = byName[nm];
    o.frustumCulled = false; o.renderOrder = 2;
  });
  for (const o of drop) o.removeFromParent();
  const fadeable = [skin, limb, mats.eye, mats.sucker];
  for (const m of fadeable) m.transparent = true;
  const api = {
    root, mats,
    // 0 = invisible, 1 = fully drawn (the body fades in only when the player looks down at it)
    setOpacity(a) {
      root.visible = a > 0.01;
      for (const m of fadeable) m.opacity = a;
      mats.pupil.opacity = a; mats.pupil.transparent = true; mats.photo.opacity = a; mats.photo.transparent = true; mats.photoV.opacity = a; mats.photoV.transparent = true;
    },
    node(name) { return root.getObjectByName(name); },
  };
  return api;
}
