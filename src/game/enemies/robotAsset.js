import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Blender-authored robots (art/build_robots.py -> public/models/robots.glb). Returns the glTF scene; enemies clone the 'Bug' / 'Drone' nodes.
export async function loadRobots() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/robots.glb');
  const out = {};
  for (const n of ['Bug', 'Drone']) {
    out[n] = gltf.scene.getObjectByName(n);
    if (!out[n]) throw new Error('robots.glb is missing ' + n);
  }
  return out;
}

// Clone a robot and give it per-enemy materials, so hit flashes and absorption can change each enemy independently.
// mats maps the glb's material names (RobotBody, RobotPlate, ...) to the enemy's own material instances.
export function instantiateRobot(source, mats) {
  const root = source.clone(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => mats[m.name] || mats.RobotBody;
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    o.frustumCulled = true;
  });
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.set(1, 1, 1);
  return root;
}

// Separable pieces of a robot, in the order they are taken. Each piece lists the nodes that leave together.
export function bugComponents(root) {
  const n = (name) => root.getObjectByName(name);
  const hips = (side) => [0, 1, 2].map((i) => n(`Hip_${side}${i}`));
  return [
    { id: 'limbsL', nodes: [...hips('L'), n('ClawPivot_L')] },
    { id: 'limbsR', nodes: [...hips('R'), n('ClawPivot_R')] },
    { id: 'shell', nodes: [n('Bug_Shell'), n('Bug_Head')] },
    { id: 'core', nodes: [n('Bug_Core')], core: true },
  ];
}

export function droneComponents(root) {
  const n = (name) => root.getObjectByName(name);
  return [
    { id: 'ring', nodes: [n('RingPivot')] },
    { id: 'gun', nodes: [n('Drone_Gun')] },
    { id: 'shell', nodes: [n('Drone_Shell'), n('Drone_Thrusters')] },
    { id: 'core', nodes: [n('Drone_Core')], core: true },
  ];
}

export { THREE };
