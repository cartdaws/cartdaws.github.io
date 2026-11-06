import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { kitMaterial } from './materials.js';

// Loads the Blender-authored environment kit (art/make_kit.py -> public/models/kit.glb).
// Every asset is a list of meshes sharing the game's own materials. COL_<name> objects are gameplay colliders, never rendered.
// The real height of the surface on top of each prop, measured from its mesh. Mixed shapes get a second box for the tall part.
// upper: boxes of [x0, x1, z0, z1, height] in the part's own coordinates, one for each thing that really stands on the desk, measured from the triangles above the desk-top. Keyboards and low clutter are stepped over.
const TOPS = {
  analysis_bench: { top: 0.95, upper: [[0.88, 1.48, -0.36, -0.16, 1.71], [-0.12, 0.08, -0.36, 0.04, 1.71], [-1.32, -0.72, -0.26, 0.34, 1.4]] },
  workstation: { top: 0.96, upper: [[-1.2, 1.2, -0.6, -0.4, 1.85], [0.0, 1.0, -0.4, 0.1, 1.85]] },
  monitor_station: { top: 0.8, upper: [[-1.2, 1.2, -0.45, -0.05, 1.41]] },
  barrier_22: { top: 1.07 }, barrier_26: { top: 1.07 },
  canister: { top: 1.0 }, instrument_cart: { top: 0.88 }, restraint_bed: { top: 0.92 },
  charging_dock: { top: 2.41 }, robot_test_cell: { top: 2.43 },
  crate_B: { top: 1.18 }, crate_top: { top: 1.0 }, crate_A: { top: 1.39 },
  equip_cabinet_B: { top: 3.12 }, server_rack: { top: 2.15 }, storage_cabinet: { top: 2.05 }, storage_rack: { top: 2.39 },
};

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
    const f = this.footprint(name, rotY), T = TOPS[name];
    world.add(x - f.w / 2, y, z - f.d / 2, x + f.w / 2, y + (T ? T.top : f.h), z + f.d / 2, { tag });
    if (T && T.upper) for (const [x0, x1, z0, z1, h] of T.upper) {          // a desk with screens: the desk is what you stand on, the screens stand on it
      const turn = ((Math.round(rotY / (Math.PI / 2)) % 4) + 4) % 4;
      const corners = [[x0, z0], [x1, z1]].map(([a, b]) => (turn === 0 ? [a, b] : turn === 1 ? [b, -a] : turn === 2 ? [-a, -b] : [-b, a]));
      world.add(x + Math.min(corners[0][0], corners[1][0]), y, z + Math.min(corners[0][1], corners[1][1]), x + Math.max(corners[0][0], corners[1][0]), y + h, z + Math.max(corners[0][1], corners[1][1]), { tag, noStand: true });
    }
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
