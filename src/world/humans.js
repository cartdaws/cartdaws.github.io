import * as THREE from 'three';

// Simple human silhouettes for the opening: the researcher at the console and the security officer who loses his sidearm.
// They are deliberately plain (matte dark bodies, no faces) and share one pose/animation helper.
export function makeHuman(kind) {
  const coat = kind === 'researcher';
  const body = new THREE.MeshStandardMaterial({ color: coat ? 0x9aa4aa : 0x1d2328, roughness: 0.95, metalness: 0 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.95 });
  const g = new THREE.Group();
  const mk = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const torso = mk(box(0.46, coat ? 0.78 : 0.62, 0.26), body, 0, 1.2, 0);
  mk(new THREE.SphereGeometry(0.115, 12, 10), dark, 0, 1.68, 0);
  if (kind === 'officer') { // armour plate and helmet
    mk(box(0.4, 0.34, 0.08), dark, 0, 1.28, -0.15);
    mk(new THREE.SphereGeometry(0.135, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), body, 0, 1.7, 0);
  }
  const limb = (w, h, d, x, y) => { // pivot at the top so rotation swings from the joint
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); g.add(pivot);
    mk(box(w, h, d), kind === 'officer' && h > 0.5 ? dark : body, 0, -h / 2, 0, pivot);
    return pivot;
  };
  g.userData.legL = limb(0.16, 0.82, 0.18, -0.12, 0.84);
  g.userData.legR = limb(0.16, 0.82, 0.18, 0.12, 0.84);
  g.userData.armL = limb(0.12, 0.62, 0.13, -0.3, 1.5);
  g.userData.armR = limb(0.12, 0.62, 0.13, 0.3, 1.5);
  g.userData.hand = new THREE.Object3D();
  g.userData.hand.position.set(0, -0.62, -0.05);
  g.userData.armR.add(g.userData.hand);
  g.userData.torso = torso;
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
