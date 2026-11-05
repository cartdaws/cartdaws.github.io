import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Collapse static opaque level meshes so the many small details stay cheap to draw: one mesh per material per chunk of the map.
// Chunking matters: merging a whole floor into one mesh per material means every triangle of every room is drawn every frame, because a
// mesh that big is always partly in view. With chunks the renderer can skip what is behind the camera or (see Game.cullChunks) far away.
const CELL = 48;           // metres: larger cells mean fewer draw calls, smaller cells mean fewer triangles
export function mergeStatic(scene) {
  const groups = new Map();
  const out = [];
  const box = new THREE.Box3(), c = new THREE.Vector3();
  for (const o of [...scene.children]) {
    if (!o.isMesh || o.userData.keep || o.material.transparent || Array.isArray(o.material)) continue;
    o.updateMatrixWorld(true);
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    // keep the geometry indexed: a non-indexed copy needs a separate vertex for every corner of every triangle, several times the memory
    if (!g.index) { const n = g.attributes.position.count, idx = new Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(idx); }
    box.setFromBufferAttribute(g.attributes.position); box.getCenter(c);
    const key = o.material.uuid + ':' + Math.floor(c.x / CELL) + ':' + Math.floor(c.z / CELL);
    if (!groups.has(key)) groups.set(key, { mat: o.material, geos: [] });
    groups.get(key).geos.push(g);
    scene.remove(o);
  }
  for (const { mat, geos } of groups.values()) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, mat);
    m.matrixAutoUpdate = false;
    scene.add(m);
    out.push(m);
  }
  return out;
}
