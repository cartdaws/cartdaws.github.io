import * as THREE from 'three';
import { AlienBody } from '../game/body.js';
import { makeHandGel } from '../presentation/hand.js';

// The one who waits is the player's own kind: the same translucent octopus (bell, glowing organs, six walking tentacles and the same
// gel arm and hand), driven by the very same AlienBody code. An elder differs only in small ways that read as age: a larger bell, a paler
// violet-tinged skin, brighter ribs and a slow violet inner light. The body walks and breathes exactly as the player's does.
const SIZE = 1.28;               // slightly larger than the player's body

export function buildElder(scene, geos, hand) {
  // stand-ins for the player and the world: the elder walks on flat ground and nothing blocks its tentacles
  const stub = { pos: new THREE.Vector3(), vx: 0, vz: 0, yaw: 0, pitch: -1.2, grounded: true };
  const flat = { raycast: () => null, groundHeight: () => 0 };
  const ab = new AlienBody(scene, flat, stub, geos);
  ab.reset();

  // age: paler, violet-tinged gel (the same materials, re-tinted)
  const tint = (m, color, rim) => { if (m && m.uniforms) { if (m.uniforms.uColor) m.uniforms.uColor.value.set(color); if (m.uniforms.uRim) m.uniforms.uRim.value.set(rim); } };
  tint(ab.torsoGel, 0x1a6f78, 0xc8b8ff);
  tint(ab.legGel, 0x167078, 0xb9a8ff);
  if (ab.ribMat) { ab.ribMat.color.set(0xd2c2ff); ab.ribMat.opacity = 0.34; }

  // a slow violet inner light
  const light = new THREE.PointLight(0xb99cff, 1.8, 8, 2); light.position.set(0, 0.5, -0.4); light.userData.keepOn = true;
  ab.group.add(light);

  // the player's own gel arm and hand, at the shoulders of the bell. The right arm reaches; the left hangs.
  const gel = makeHandGel({ color: 0x167078, rim: 0xd2c2ff, alpha: 0.6 });
  hand.Hand.geometry.computeBoundingBox();
  const HB = hand.Hand.geometry.boundingBox, LEN = HB.max.z - HB.min.z, armScale = 0.8 / LEN;
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    const m = hand.Hand.clone(); m.material = gel; m.frustumCulled = false; m.renderOrder = 4;
    m.position.z = -HB.max.z;                  // the elbow end sits on the shoulder; the hand points along -Z
    const inner = new THREE.Group(); inner.scale.set(side, 1, 1); inner.add(m); pivot.add(inner);
    pivot.scale.setScalar(armScale);
    pivot.position.set(side * -0.3, 0.38, -0.12);
    ab.group.add(pivot);
    return pivot;
  };
  const arm = makeArm(1), armL = makeArm(-1);
  const armBaseY = arm.position.y;

  const anchor = new THREE.Group();            // the thing the intro moves and turns
  const E = { anchor, ab, arm, armL, armBaseY, stub, SIZE, tipLocal: new THREE.Vector3(0, 0.04 / armScale, -LEN * 0.98), last: new THREE.Vector3(), seen: false };
  return E;
}

// Per frame: put the body where the anchor is (in world space), let AlienBody do its walking and breathing, then pose the arms.
const _p = new THREE.Vector3();
export function stepElder(E, dt, state, lift = 0.12) {
  const { ab, stub, anchor } = E;
  anchor.updateMatrixWorld(true);
  anchor.getWorldPosition(_p);
  if (!E.seen) { E.last.copy(_p); E.seen = true; }
  const d = Math.max(dt, 1e-3);
  stub.vx = (_p.x - E.last.x) / d; stub.vz = (_p.z - E.last.z) / d;
  E.last.copy(_p);
  stub.pos.set(_p.x, lift + (state.rise || 0), _p.z);
  // once the elder leaves the ground its feet must leave with it: the legs dangle from the body rather than staying planted and stretching
  const lifted = (state.rise || 0) > 0.05;
  stub.grounded = !lifted; ab.dangle = lifted;              // a little height gives the elder longer legs than the player
  stub.yaw = state.yaw;
  ab.setVisible(anchor.visible !== false && E.visible !== false && !state.gone);
  ab.update(d);
  ab.group.scale.multiplyScalar(SIZE);
  ab.group.rotation.x += -state.fear * 0.18;
  ab.group.updateMatrixWorld(true);
}
