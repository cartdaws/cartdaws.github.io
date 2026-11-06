import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Everything V2 modelled in Blender (art/build_v2_arm.py, art/build_v2_creatures.py), found by node name.
const NODES = {};
export const v2node = (n) => NODES[n];

export async function loadV2Assets() {
  const base = import.meta.env.BASE_URL, L = new GLTFLoader(), T = new THREE.TextureLoader();
  const [arm, cre] = await Promise.all([L.loadAsync(base + 'models/v2_arm.glb'), L.loadAsync(base + 'models/v2_creatures.glb')]);
  for (const g of [arm, cre]) g.scene.traverse((o) => { if (o.isMesh) NODES[o.name] = o; });
  // real surface detail on the metal and the chitin; the models carry UVs for it
  const tex = async (n, srgb) => { const t = await T.loadAsync(base + 'textures/' + n + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const [plate, plateN, rust, rustN, rockN] = await Promise.all([tex('metal_plate', true), tex('metal_plate_n'), tex('rusty_metal_02', true), tex('rusty_metal_02_n'), tex('rocky_terrain_02_n')]);
  const dress = (node, map, normal, ns = 0.8) => { const m = NODES[node]?.material; if (!m) return; if (map) { m.map = map; m.color.multiplyScalar(1.7); } if (normal) { m.normalMap = normal; m.normalScale = new THREE.Vector2(ns, ns); } m.needsUpdate = true; };
  for (const n of ['Mut_ShardGlow', 'Mut_ArcGlow', 'ShellPores']) { const m = NODES[n].material; m.emissiveIntensity = 0.62; m.color.multiplyScalar(0.3); }
  NODES.ArmSuckers.material.color.multiplyScalar(0.62);
  { const c = NODES.Mut_Carapace.material; c.color.multiplyScalar(0.62); c.roughness = 0.58; }
  dress('Mut_Shard', plate, plateN); dress('Mut_ShardDark', rust, rustN); dress('Mut_ArcCable', null, rustN, 0.5);
  dress('Mut_Carapace', null, rockN, 0.55); dress('Mut_ShardRings', null, plateN, 0.6); dress('Shell', null, rockN, 0.8);
}
