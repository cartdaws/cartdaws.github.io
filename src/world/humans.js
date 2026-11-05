import * as THREE from 'three';
import { buildCharacter } from './continuityHuman.js';

// Simple human silhouettes for the opening: the researcher at the console and the security officer who loses his sidearm.
// They are deliberately plain (matte dark bodies, no faces) and share one pose/animation helper.
// Researcher and officer are built by the Continuity character builder (modelled faces, hair, clothing) and driven through the same
// limb handles as before: userData.legL/legR/armL/armR (rotation.x / rotation.z), userData.hand, userData.torso.
function limb(joint, sign, elbow = null) {
  const o = { rotation: {} };
  Object.defineProperty(o.rotation, 'x', { get: () => joint.rotation.x * sign, set: (v) => { joint.rotation.x = v * sign; if (elbow) elbow.rotation.x = -0.18 - Math.max(0, Math.abs(v) - 0.6) * 0.45; } });
  Object.defineProperty(o.rotation, 'z', { get: () => joint.rotation.z, set: (v) => { joint.rotation.z = v; } });
  return o;
}
export function makeHuman(kind) {
  const coat = kind === 'researcher';
  const rig = buildCharacter(coat
    ? { id: 'researcher', seed: 31, height: 1.74, skin: '#c9a184', bottom: '#2c3138', shoes: '#1c1b1b', hair: { style: 'side', color: '#3a2a1e' }, top: { color: '#e6eaec', style: 'shirt', blazer: '#dfe4e6' } }
    : { id: 'officer', seed: 9, height: 1.84, build: 1.12, skin: '#a97d62', bottom: '#14181c', shoes: '#0c0d0e', hair: { style: 'buzz', color: '#1a1511' }, top: { color: '#222b33', style: 'polo' } });
  const g = new THREE.Group();
  rig.root.rotation.y = Math.PI;          // the builder faces +Z; the game faces -Z
  g.add(rig.root);
  const J = rig.J;
  g.userData.legL = limb(J.leftHip, -1, J.leftKnee); g.userData.legR = limb(J.rightHip, -1, J.rightKnee);
  g.userData.armL = limb(J.leftShoulder, -1, J.leftElbow); g.userData.armR = limb(J.rightShoulder, -1, J.rightElbow);
  g.userData.hand = new THREE.Object3D(); g.userData.hand.position.set(0, -0.12, 0.05); J.rightWrist.add(g.userData.hand);
  g.userData.torso = J.spine;
  g.userData.rig = rig;
  g.visible = false;
  return g;
}

// phase advances the stride; speed 0 = standing. Arms swing opposite the legs.
// Seated at a console, seen from behind: thighs forward, forearms typing. t drives the finger rhythm; lean tilts the torso (0 = upright).
export function seatHuman(h, t, lean = 0.1) {
  h.userData.legL.rotation.x = -1.5; h.userData.legR.rotation.x = -1.5;
  h.userData.armL.rotation.x = -1.15 + Math.sin(t * 9) * 0.06; h.userData.armR.rotation.x = -1.15 + Math.sin(t * 11 + 1) * 0.07;
  h.userData.armL.rotation.z = 0.12; h.userData.armR.rotation.z = -0.12;
  h.rotation.x = lean;
  h.position.y = -0.2;
}

export function poseHuman(h, phase, speed, lean = 0, armsUp = 0) {
  const s = Math.sin(phase) * speed;
  h.userData.legL.rotation.x = s * 0.9; h.userData.legR.rotation.x = -s * 0.9;
  h.userData.armL.rotation.x = -s * 0.7 - armsUp * 2.4; h.userData.armR.rotation.x = s * 0.7 - armsUp * 2.4;
  h.userData.armL.rotation.z = armsUp * 0.5; h.userData.armR.rotation.z = -armsUp * 0.5;
  h.rotation.x = lean;
}
