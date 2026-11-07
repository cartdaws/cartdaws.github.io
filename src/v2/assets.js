import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Everything V2 modelled in Blender (art/build_v2_arm.py, art/build_v2_creatures.py), found by node name.
const NODES = {};
// Poly Haven maps the androids dress themselves in (filled once the assets load)
export const ENEMY_TEX = {};
export const v2node = (n) => NODES[n];
export const v2prefix = (p) => Object.keys(NODES).filter((n) => n.startsWith(p));

// Trypophobia setting: every dense cluster of bumps, sacs, suckers or pores is a shared geometry, so emptying its draw range removes it everywhere at once, live.
const TRYPO_KEY = 'intruderv2-trypo', CLUSTERS = ['BladderSacs', 'ArmSuckers', 'ShellPores'];
let trypo = false; try { trypo = localStorage.getItem(TRYPO_KEY) === '1'; } catch (e) { /* default off */ }
export const trypoSafe = () => trypo;
export function setTrypoSafe(on) {
  trypo = !!on; try { localStorage.setItem(TRYPO_KEY, trypo ? '1' : '0'); } catch (e) { /* session only */ }
  applyTrypo();
}
function applyTrypo() {
  for (const n of CLUSTERS) { const g = NODES[n]?.geometry; if (!g) continue; g.setDrawRange(0, trypo ? 0 : Infinity); }
}

export async function loadV2Assets() {
  const base = import.meta.env.BASE_URL, L = new GLTFLoader(), T = new THREE.TextureLoader();
  const [arm, cre, and] = await Promise.all([L.loadAsync(base + 'models/v2_arm.glb'), L.loadAsync(base + 'models/v2_creatures.glb'), L.loadAsync(base + 'models/v2_androids.glb')]);
  for (const g of [arm, cre, and]) g.scene.traverse((o) => { if (o.isMesh) NODES[o.name] = o; });
  // real surface detail on the metal and the chitin; the models carry UVs for it
  applyTrypo();
  const tex = async (n, srgb) => { const t = await T.loadAsync(base + 'textures/' + n + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const [plate, plateN, rust, rustN, rockN, armor, armorN, worn, wornN, rock, rockFaceN, skin, skinN] = await Promise.all([tex('metal_plate', true), tex('metal_plate_n'), tex('rusty_metal_02', true), tex('rusty_metal_02_n'), tex('rocky_terrain_02_n'), tex('blue_metal_plate', true), tex('blue_metal_plate_n'), tex('metal_plate_02', true), tex('metal_plate_02_n'), tex('rock_face_03', true), tex('rock_face_03_n'), tex('fabric_leather_02', true), tex('fabric_leather_02_n')]);
  // the maps give wear and grain; each machine's own colour comes from its tint, so they are flattened to grey first
  const grey = (t, filter) => { const im = t.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.filter = filter; x.drawImage(im, 0, 0); const o = new THREE.CanvasTexture(c); o.wrapS = o.wrapT = THREE.RepeatWrapping; o.anisotropy = 4; o.colorSpace = THREE.SRGBColorSpace; return o; };
  Object.assign(ENEMY_TEX, { armor: grey(armor, 'grayscale(1) contrast(1.15) brightness(1.7)'), armorN, worn: grey(worn, 'grayscale(1) contrast(1.1) brightness(1.5)'), wornN });
  const dress = (node, map, normal, ns = 0.8) => { const m = NODES[node]?.material; if (!m) return; if (map) { m.map = map; m.color.multiplyScalar(1.7); } if (normal) { m.normalMap = normal; m.normalScale = new THREE.Vector2(ns, ns); } m.needsUpdate = true; };
  for (const n of ['Mut_ShardGlow', 'Mut_ArcGlow', 'ShellPores']) { const m = NODES[n].material; m.emissiveIntensity = 0.62; m.color.multiplyScalar(0.3); }
  NODES.ArmSuckers.material.color.multiplyScalar(0.62);
  { const c = NODES.Mut_Carapace.material; c.color.multiplyScalar(0.62); c.roughness = 0.58; }
  dress('T__torso__plate__1', null, armorN, 0.8); dress('T__torso__body__1', null, wornN, 0.7);
  dress('Mut_Shard', plate, plateN); dress('Mut_ShardDark', rust, rustN); dress('Mut_ArcCable', null, rustN, 0.5);
  dress('Mut_Carapace', null, rockN, 0.55); dress('Mut_ShardRings', null, plateN, 0.6); dress('Shell', rock, rockFaceN, 1.0); dress('ShellFoot', skin, skinN, 0.8); dress('Bladder', skin, skinN, 0.9); dress('BladderFoot', skin, skinN, 0.8);
}
