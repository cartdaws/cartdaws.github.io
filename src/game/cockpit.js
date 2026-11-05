import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// The lander's cockpit, seen from the seat during boarding and lift-off: a pilot's seat you actually sit in, a dash of instruments,
// a yoke, side consoles. Built to the same local coordinates as the hull, so it moves with the ship as one piece.
export const SEAT_EYE = new THREE.Vector3(0, 0.68, -0.86);
export const YOKE_GRIP = new THREE.Vector3(0.2, 0.34, -1.26);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const panel = (x, w, h, title) => {
  x.fillStyle = '#03141a'; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(120,235,255,0.06)'; for (let y = 0; y < h; y += 4) x.fillRect(0, y, w, 1);
  x.fillStyle = '#6fe8ff'; x.font = 'bold 15px monospace'; x.fillText(title, 10, 20);
  x.strokeStyle = '#2b7f8f'; x.lineWidth = 2; x.strokeRect(2, 2, w - 4, h - 4);
};

export function addCockpit(lander) {
  const g = new THREE.Group(); g.name = 'Cockpit';
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f262c, roughness: 0.75, metalness: 0.35, emissive: 0x05090c });
  const mid = new THREE.MeshStandardMaterial({ color: 0x38434c, roughness: 0.6, metalness: 0.45, emissive: 0x070b0e });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 0.95, metalness: 0, emissive: 0x060504 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xc8921a, roughness: 0.55, metalness: 0.4, emissive: 0x2a1c02 });
  const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0, rad = 0.025) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(rad, w / 2.1, h / 2.1, d / 2.1)), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
  };

  // ---- the tub
  box(1.1, 0.06, 2.1, dark, 0, -0.16, -0.75);                                 // floor
  for (const s of [-1, 1]) {
    box(0.07, 0.7, 2.1, mid, s * 0.56, 0.18, -0.75);                          // side wall
    box(0.11, 0.05, 2.1, trim, s * 0.55, 0.54, -0.75);                        // sill, the edge you climbed over
    box(0.22, 0.12, 0.72, dark, s * 0.43, 0.27, -0.92, 0, 0, s * -0.1);       // side console
  }
  box(1.1, 0.7, 0.07, mid, 0, 0.18, 0.28);                                    // rear bulkhead

  // ---- the seat you sit in
  box(0.56, 0.13, 0.56, cloth, 0, 0.1, -0.72, 0.05, 0, 0, 0.05);              // cushion
  box(0.54, 0.86, 0.13, cloth, 0, 0.56, -0.38, -0.14, 0, 0, 0.05);            // back
  box(0.34, 0.2, 0.11, cloth, 0, 1.06, -0.3, -0.14, 0, 0, 0.04);              // headrest
  box(0.6, 0.05, 0.6, mid, 0, 0.02, -0.72);                                   // pan
  box(0.12, 0.17, 0.12, dark, 0, -0.07, -0.72);                               // post
  for (const s of [-1, 1]) {
    box(0.07, 0.72, 0.016, trim, s * 0.15, 0.62, -0.47, -0.2);                // harness, still hanging open
    box(0.07, 0.05, 0.5, dark, s * 0.31, 0.3, -0.68);                         // armrest
  }

  // ---- the dash
  box(1.06, 0.42, 0.34, dark, 0, 0.25, -1.68, -0.42);                         // body
  box(1.06, 0.07, 0.34, mid, 0, 0.53, -1.74, 0.1, 0, 0, 0.03);                // glare shield
  box(0.24, 0.26, 0.7, dark, 0, -0.03, -1.45);                                // centre pedestal

  // ---- instruments: dark when the ship is dead, they wake during the lift-off
  const screens = [];
  const screen = (w, h, x, y, z, rx, ry, tex) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.25, toneMapped: false }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.renderOrder = 3; m.material.userData.noSnap = true; g.add(m); screens.push(m); return m;
  };
  const radar = canvasTex(256, 192, (x, w, h) => {
    panel(x, w, h, 'NAV');
    x.strokeStyle = '#2fb5c9'; x.lineWidth = 1.5; for (const r of [24, 48, 72]) { x.beginPath(); x.arc(w / 2, h / 2 + 10, r, 0, 7); x.stroke(); }
    x.beginPath(); x.moveTo(w / 2, h / 2 + 10); x.lineTo(w / 2 + 52, h / 2 - 42); x.stroke();
    x.fillStyle = '#ffd36a'; x.beginPath(); x.arc(w / 2 + 40, h / 2 - 28, 4, 0, 7); x.fill();
    x.font = '11px monospace'; x.fillText('HALCYON', w / 2 + 46, h / 2 - 28);
  });
  const status = canvasTex(320, 192, (x, w, h) => {
    panel(x, w, h, 'LANDER FOUR');
    x.font = 'bold 15px monospace'; x.fillStyle = '#ff6a4a'; x.fillText('PILOT: NO RESPONSE', 12, 54);
    x.fillStyle = '#ffd36a'; x.fillText('HULL BREACH  AFT', 12, 80);
    x.fillStyle = '#6fe8ff'; x.fillText('DRIVE CORE    41%', 12, 106); x.fillText('AUTORETURN    ON', 12, 132);
    x.fillStyle = '#8fffb0'; x.fillText('> HALCYON', 12, 164);
  });
  const horizon = canvasTex(256, 192, (x, w, h) => {
    panel(x, w, h, 'ATT');
    x.strokeStyle = '#8fffb0'; x.lineWidth = 2; x.beginPath(); x.moveTo(26, h / 2 + 22); x.lineTo(w - 26, h / 2 + 6); x.stroke();
    x.strokeStyle = '#6fe8ff'; for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(w / 2 - 26, h / 2 + 14 + i * 24); x.lineTo(w / 2 + 26, h / 2 + 14 + i * 24); x.stroke(); }
  });
  const buttons = canvasTex(128, 256, (x, w, h) => {
    x.fillStyle = '#101519'; x.fillRect(0, 0, w, h);
    const cols = ['#ff5a3a', '#ffd36a', '#6fe8ff', '#8fffb0', '#2b3a44'];
    for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) { x.fillStyle = cols[(i * 3 + j * 2 + (i * j) % 3) % cols.length]; x.fillRect(12 + i * 28, 14 + j * 30, 18, 16); }
  });
  screen(0.32, 0.24, -0.34, 0.31, -1.51, -0.42, 0.14, radar);
  screen(0.34, 0.24, 0, 0.31, -1.53, -0.42, 0, status);
  screen(0.32, 0.24, 0.34, 0.31, -1.51, -0.42, -0.14, horizon);
  screen(0.16, 0.56, -0.43, 0.34, -0.92, -Math.PI / 2 + 0.1, 0, buttons).rotation.set(-Math.PI / 2, 0, 0);
  screen(0.16, 0.56, 0.43, 0.34, -0.92, -Math.PI / 2 + 0.1, 0, buttons).rotation.set(-Math.PI / 2, 0, 0);
  lander.userData.screens = (lander.userData.screens || []).concat(screens);

  // ---- the yoke
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.038, 0.42, 10), dark);
  column.position.set(0, 0.14, -1.3); column.rotation.x = 0.28; g.add(column);
  box(0.46, 0.05, 0.05, mid, 0, 0.34, -1.25, 0, 0, 0, 0.02);
  for (const s of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.1, 4, 10), cloth);
    grip.position.set(s * 0.23, 0.34, -1.25); g.add(grip);
    box(0.03, 0.02, 0.03, trim, s * 0.23, 0.42, -1.25, 0, 0, 0, 0.008);
  }

  // ---- the canopy frame: it rides on the canopy's hinge, so it lifts with the glass and closes around you
  const pivot = lander.userData.canopyPivot, frameMat = new THREE.MeshStandardMaterial({ color: 0x2a3238, roughness: 0.7, metalness: 0.4, emissive: 0x05080a });
  if (pivot) {
    const bar = (a, b, w) => {
      const A = new THREE.Vector3(...a).sub(pivot.position), B = new THREE.Vector3(...b).sub(pivot.position), len = A.distanceTo(B);
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, w, len, 2, w * 0.3), frameMat);
      m.position.copy(A).add(B).multiplyScalar(0.5); m.lookAt(pivot.localToWorld(B.clone())); pivot.add(m); return m;
    };
    pivot.updateMatrixWorld(true);
    for (const s of [-1, 1]) {
      bar([s * 0.52, 0.56, -1.66], [s * 0.2, 1.16, -0.98], 0.05);        // front pillar
      bar([s * 0.2, 1.16, -0.98], [s * 0.34, 1.0, -0.12], 0.05);         // over your head
      bar([s * 0.34, 1.0, -0.12], [s * 0.54, 0.56, 0.02], 0.05);         // rear pillar
    }
    bar([-0.2, 1.16, -0.98], [0.2, 1.16, -0.98], 0.04); bar([-0.34, 1.0, -0.12], [0.34, 1.0, -0.12], 0.04);
  }

  g.visible = false;
  lander.add(g);
  lander.userData.cockpit = g;
  return g;
}
