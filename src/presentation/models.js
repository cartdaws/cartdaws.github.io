import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Loads the arm meshes authored in Blender (public/models/arm.glb) and returns geometries by name.
export async function loadArmModels() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/organs.glb');
  const geos = {};
  gltf.scene.traverse((o) => { if (o.isMesh) geos[o.name] = o.geometry; });
  for (const n of ['Gland', 'Lip', 'Spine', 'Crystal', 'Mantle', 'Organ']) {
    if (!geos[n]) throw new Error('organs.glb is missing ' + n);
  }
  return geos;
}
