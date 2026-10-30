import * as THREE from 'three';
import { kitMaterial } from './materials.js';

const cache = new Map();

// Functional signage in one house style: dark panel, off-white lettering, a coloured tab (amber = hazard, teal = information, red = restricted).
export function signMaterial(lines, { accent = '#d99a1c', arrow = '', w = 1024, h = 256, small = false } = {}) {
  const key = lines.join('|') + accent + arrow + w + h;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#12171b'; g.fillRect(0, 0, w, h);
  g.fillStyle = accent; g.fillRect(0, 0, h * 0.16, h);
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 4; g.strokeRect(h * 0.16 + 6, 6, w - h * 0.16 - 12, h - 12);
  g.fillStyle = '#e9eef0'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const tx = h * 0.16 + 28, avail = w - tx - (arrow ? h * 0.8 : 28);
  let px = lines.length > 1 ? h * 0.3 : h * 0.4;
  g.font = `bold ${px}px "Segoe UI", Arial, sans-serif`;
  const widest = Math.max(...lines.map((t) => g.measureText(t).width));
  if (widest > avail) { px *= avail / widest; g.font = `bold ${px}px "Segoe UI", Arial, sans-serif`; }
  lines.forEach((t, i) => g.fillText(t, tx, h / 2 + (i - (lines.length - 1) / 2) * px * 1.15));
  if (arrow) {
    g.fillStyle = accent; g.font = `bold ${h * 0.7}px Arial, sans-serif`; g.textAlign = 'center';
    g.fillText(arrow, w - h * 0.45, h / 2 + 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map: t });
  m.userData.noSnap = true;
  cache.set(key, m);
  return m;
}

// A flat sign with a thin dark bezel. width in metres; faces +Z (rotate with rotY).
export function addSign(parent, lines, width, x, y, z, rotY = 0, opts = {}) {
  const mat = signMaterial(lines, opts);
  const h = width * ((opts.h || 256) / (opts.w || 1024));
  const grp = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(width, h), mat);
  plate.position.z = 0.032;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(width + 0.06, h + 0.06, 0.05), kitMaterial('PaintDark'));
  bezel.position.z = 0.0;
  grp.add(bezel, plate);
  grp.position.set(x, y, z);
  grp.rotation.y = rotY;
  grp.userData.keep = true;
  parent.add(grp);
  return grp;
}
