import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Collapse static opaque level meshes into one mesh per material so the many small details stay cheap to draw.
export function mergeStatic(scene) {
  const groups = new Map();
  for (const o of [...scene.children]) {
    if (!o.isMesh || o.userData.keep || o.material.transparent || Array.isArray(o.material)) continue;
    o.updateMatrixWorld(true);
    let g = o.geometry;
    if (g.index) g = g.toNonIndexed(); else g = g.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const key = o.material.uuid;
    if (!groups.has(key)) groups.set(key, { mat: o.material, geos: [] });
    groups.get(key).geos.push(g);
    scene.remove(o);
  }
  for (const { mat, geos } of groups.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.matrixAutoUpdate = false;
    scene.add(m);
  }
}
