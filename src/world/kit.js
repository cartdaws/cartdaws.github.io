import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { kitMaterial } from './materials.js';

// Loads the Blender-authored environment kit (art/make_kit.py -> public/models/kit.glb).
// Every asset is a list of meshes sharing the game's own materials. COL_<name> objects are gameplay colliders, never rendered.
export class Kit {
  constructor(parts, colliders, nodes) {
    this.nodes = nodes || {};
    this.parts = parts; // name -> [{ geometry, matName }]
    this.colliders = colliders; // name -> { w, d, h } footprint
  }

  has(name) { return !!this.parts[name]; }

  // Instantiate an asset as flat top-level meshes (so static ones can be merged). Returns the meshes.
  place(parent, name, { x = 0, y = 0, z = 0, rotY = 0, keep = false } = {}) {
    const parts = this.parts[name];
    if (!parts) throw new Error('kit asset missing: ' + name);
    const out = [];
    for (const p of parts) {
      const m = new THREE.Mesh(p.geometry, kitMaterial(p.matName));
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      if (keep || name.startsWith('SCREEN_') || name.startsWith('LENS_') || name === 'cell_front' || name === 'cell_glass') m.userData.keep = true;
      m.name = name;
      parent.add(m);
      out.push(m);
    }
    return out;
  }

  // Clone of a whole glTF node with its child hierarchy and pivots intact (scanner arm, hinged door). Materials come from the game.
  instance(name) {
    const src = this.nodes[name];
    if (!src) throw new Error('kit node missing: ' + name);
    const g = src.clone(true);
    g.traverse((o) => { if (o.isMesh) { o.material = kitMaterial((o.material && o.material.name) || 'PaintStructural'); o.userData.keep = true; } });
    return g;
  }

  // Footprint of the gameplay collider after a quarter-turn rotation.
  footprint(name, rotY = 0) {
    const c = this.colliders[name];
    if (!c) throw new Error('kit collider missing: ' + name);
    const quarter = Math.abs(Math.round(rotY / (Math.PI / 2))) % 2 === 1;
    return quarter ? { w: c.d, d: c.w, h: c.h } : { w: c.w, d: c.d, h: c.h };
  }

  // Place an asset and register its collider with the collision world.
  solid(parent, world, name, x, z, rotY = 0, y = 0, tag = '') {
    const f = this.footprint(name, rotY);
    world.add(x - f.w / 2, y, z - f.d / 2, x + f.w / 2, y + f.h, z + f.d / 2, { tag });
    return this.place(parent, name, { x, y, z, rotY });
  }
}

export async function loadKit() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/kit.glb');
  const parts = {}, colliders = {}, nodes = {};
  gltf.scene.updateMatrixWorld(true);
  const roots = [];
  gltf.scene.traverse((o) => { if (o.parent === gltf.scene) roots.push(o); });
  for (const node of roots) {
    nodes[node.name] = node;
    const meshes = [];
    node.traverse((o) => { if (o.isMesh) meshes.push(o); });
    if (!meshes.length) continue;
    if (node.name.startsWith('COL_')) {
      const box = new THREE.Box3().setFromObject(node);
      const s = box.getSize(new THREE.Vector3());
      colliders[node.name.slice(4)] = { w: +s.x.toFixed(3), d: +s.z.toFixed(3), h: +s.y.toFixed(3) };
      continue;
    }
    parts[node.name] = meshes.map((m) => ({ geometry: m.geometry, matName: (m.material && m.material.name) || 'PaintStructural' }));
  }
  return new Kit(parts, colliders, nodes);
}
