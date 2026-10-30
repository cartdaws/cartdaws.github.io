import * as THREE from 'three';

const textures = [];
const R = Math.random;

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  textures.push(t);
  return t;
}

// Retro mode: blocky when magnified, but mip-mapped so distant surfaces don't crawl.
export function setRetroTextures(retro) {
  for (const t of textures) {
    t.minFilter = retro ? THREE.NearestMipmapNearestFilter : THREE.LinearMipmapLinearFilter;
    t.magFilter = retro ? THREE.NearestFilter : THREE.LinearFilter;
    t.anisotropy = retro ? 1 : 8;
    t.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- painting helpers
const rgb = (c, k = 1, a = 1) => `rgba(${Math.max(0, Math.min(255, c[0] * k)) | 0},${Math.max(0, Math.min(255, c[1] * k)) | 0},${Math.max(0, Math.min(255, c[2] * k)) | 0},${a})`;

function speckle(g, s, n, a = 0.09) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = R() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.6})`;
    g.fillRect(R() * s, R() * s, 1 + R() * 2, 1 + R() * 2);
  }
}

// Brushed / rolled-steel grain: thousands of faint long strokes.
function grain(g, s, vertical, a = 0.05) {
  for (let i = 0; i < s * 0.9; i++) {
    const p = R() * s, l = 20 + R() * 120, q = R() * s;
    g.strokeStyle = R() < 0.5 ? `rgba(255,255,255,${a * R()})` : `rgba(0,0,0,${a * 1.6 * R()})`;
    g.lineWidth = 1;
    g.beginPath();
    if (vertical) { g.moveTo(p, q); g.lineTo(p + (R() - 0.5) * 2, q + l); } else { g.moveTo(q, p); g.lineTo(q + l, p + (R() - 0.5) * 2); }
    g.stroke();
  }
}

function dirt(g, s, { streaks = 8, stains = 5, rust = 0.5, scratches = 30, edge = 0.5 } = {}) {
  for (let i = 0; i < streaks; i++) {
    const x = R() * s, w = 2 + R() * 14, y0 = R() * 0.5;
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(y0, 'rgba(10,8,6,0)');
    gr.addColorStop(Math.min(1, y0 + 0.15 + R() * 0.35), `rgba(10,8,6,${0.12 + R() * 0.3})`);
    gr.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, s);
  }
  for (let i = 0; i < stains; i++) {
    const x = R() * s, y = R() * s, r = 12 + R() * s * 0.3;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, R() < rust ? 'rgba(115,56,22,0.42)' : 'rgba(4,4,4,0.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.lineWidth = 1;
  for (let i = 0; i < scratches; i++) {
    const x = R() * s, y = R() * s, a = R() * 6.28, l = 6 + R() * 50;
    g.strokeStyle = R() < 0.6 ? 'rgba(210,214,214,0.15)' : 'rgba(0,0,0,0.28)';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const e = s * 0.09;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 0, e, 0, 0, s, e], [0, s, 0, s - e, 0, s - e, s, e], [0, 0, e, 0, 0, 0, e, s], [s, 0, s - e, 0, s - e, 0, e, s]]) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, `rgba(0,0,0,${edge})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
  }
}

function bolt(g, x, y, r = 3) {
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(x + 1, y + 1.5, r + 1, 0, 7); g.fill();
  g.fillStyle = 'rgba(150,155,150,0.55)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(x - 1, y - 1, r * 0.4, 0, 7); g.fill();
}

function plateSeams(g, s, strength = 1) {
  g.strokeStyle = `rgba(0,0,0,${0.8 * strength})`; g.lineWidth = s * 0.016; g.strokeRect(0, 0, s, s);
  g.strokeStyle = `rgba(255,255,255,${0.14 * strength})`; g.lineWidth = 2; g.strokeRect(s * 0.02, s * 0.02, s * 0.96, s * 0.96);
}

function weld(g, x0, y0, x1, y1) {
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    g.fillStyle = 'rgba(20,18,16,0.55)'; g.beginPath(); g.arc(x, y + 1.5, 4.5, 0, 7); g.fill();
    g.fillStyle = `rgba(${130 + R() * 40},${110 + R() * 30},${90 + R() * 20},0.55)`; g.beginPath(); g.arc(x, y, 3.8, 0, 7); g.fill();
  }
}

function stencil(g, x, y, text, size, col) {
  g.save(); g.font = `bold ${size}px Impact, Arial Black, sans-serif`; g.fillStyle = col; g.textBaseline = 'middle';
  g.fillText(text, x, y); g.restore();
}

function wearOut(g, s, n = 140) { // chip paint away
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + R() * 0.5})`; g.beginPath(); g.arc(R() * s, R() * s, 1 + R() * 5, 0, 7); g.fill(); }
  g.globalCompositeOperation = 'source-over';
}

function codeText() {
  return ['B-12', 'A-07', 'C-31', 'D-04', '44-K', 'AUX', 'LIVE', 'MNT', '07', 'R-2', 'H2', 'SEC 3'][(R() * 12) | 0];
}

// ---------------------------------------------------------------- atlases (16 distinct cells each)
// Each cell is one physical plate; the shader lays them out in a hashed, rotated, tinted pattern in world space so nothing visibly repeats.
const CELLS = 4;

function makeAtlas(cellSize, drawCell) {
  const S = cellSize * CELLS;
  const t = canvasTex(S, (g) => {
    for (let i = 0; i < CELLS * CELLS; i++) {
      g.save();
      g.translate((i % CELLS) * cellSize, Math.floor(i / CELLS) * cellSize);
      g.beginPath(); g.rect(0, 0, cellSize, cellSize); g.clip();
      drawCell(g, cellSize, i);
      g.restore();
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function tone(base, v) { const k = 1 + (R() - 0.5) * v; return [base[0] * k, base[1] * k * (1 + (R() - 0.5) * 0.05), base[2] * k * (1 + (R() - 0.5) * 0.06)]; }

function wallCell(g, s, i) {
  const base = tone([62, 69, 72], 0.2);
  g.fillStyle = rgb(base); g.fillRect(0, 0, s, s);
  grain(g, s, i % 2 === 0, 0.06);
  speckle(g, s, s * 5, 0.07);
  const layout = [6, 10, 12, 13].includes(i % 16) ? 0 : i % 16;
  const inset = s * 0.05;
  switch (layout) {
    case 0: g.fillStyle = rgb(base, 0.82); g.fillRect(inset * 2, inset * 2, s - inset * 4, s - inset * 4); for (const [x, y] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) bolt(g, x * s, y * s); break;
    case 1: g.fillStyle = rgb(base, 0.8); g.fillRect(s * 0.5, 0, s * 0.5, s); g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 5; g.beginPath(); g.moveTo(s * 0.5, 0); g.lineTo(s * 0.5, s); g.stroke(); for (let y = 0.1; y < 1; y += 0.16) { bolt(g, s * 0.46, y * s, 2.5); bolt(g, s * 0.54, y * s, 2.5); } break;
    case 2: for (let k = 0; k < 3; k++) { g.fillStyle = rgb(base, 0.85 + k * 0.1); g.fillRect(0, (s / 3) * k, s, s / 3); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, (s / 3) * k, s, 4); } break;
    case 3: g.fillStyle = rgb(base, 0.6); g.fillRect(s * 0.25, s * 0.2, s * 0.5, s * 0.6); g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 6; g.strokeRect(s * 0.25, s * 0.2, s * 0.5, s * 0.6); g.fillStyle = 'rgba(190,190,180,0.7)'; g.fillRect(s * 0.6, s * 0.46, s * 0.1, s * 0.08); bolt(g, s * 0.3, s * 0.25); bolt(g, s * 0.7, s * 0.25); bolt(g, s * 0.3, s * 0.75); bolt(g, s * 0.7, s * 0.75); break;
    case 4: g.fillStyle = 'rgba(8,9,10,0.9)'; g.fillRect(s * 0.18, s * 0.2, s * 0.64, s * 0.6); for (let k = 0; k < 9; k++) { g.fillStyle = rgb(base, 1.2); g.fillRect(s * 0.2, s * 0.23 + k * s * 0.065, s * 0.6, s * 0.03); } break;
    case 5: weld(g, s * 0.05, s * 0.95, s * 0.95, s * 0.05); weld(g, s * 0.5, s * 0.5, s * 0.95, s * 0.95); break;
    case 6: stencil(g, s * 0.12, s * 0.5, codeText(), s * 0.3, 'rgba(210,205,185,0.82)'); g.fillStyle = 'rgba(190,150,30,0.8)'; g.fillRect(0, s * 0.78, s, s * 0.06); wearOut(g, s, 200); break;
    case 7: for (let x = 0; x < s; x += s / 16) { const gr = g.createLinearGradient(x, 0, x + s / 16, 0); gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.4)'); g.fillStyle = gr; g.fillRect(x, 0, s / 16, s); } break;
    case 8: for (let k = 0; k < 4; k++) { const x = R() * s, y = R() * s, r = s * (0.12 + R() * 0.2); const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.14)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.0)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } break;
    case 9: g.fillStyle = rgb(tone([84, 90, 92], 0.1)); g.fillRect(s * 0.5, s * 0.45, s * 0.5, s * 0.55); g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 4; g.strokeRect(s * 0.5, s * 0.45, s * 0.5, s * 0.55); for (let k = 0; k < 5; k++) bolt(g, s * 0.54 + k * s * 0.1, s * 0.5, 2.5); break;
    case 10: { const gr = g.createRadialGradient(s * 0.5, s * 0.85, 4, s * 0.5, s * 0.6, s * 0.7); gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); for (let k = 0; k < 9; k++) { g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2 + R() * 4; g.beginPath(); const x = s * (0.2 + R() * 0.6); g.moveTo(x, s); g.lineTo(x + (R() - 0.5) * 60, s * (0.3 + R() * 0.4)); g.stroke(); } break; }
    case 11: for (let k = 0; k < 14; k++) { const x = R() * s; const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(120,58,22,0)'); gr.addColorStop(0.4, `rgba(120,58,22,${0.2 + R() * 0.35})`); gr.addColorStop(1, 'rgba(120,58,22,0)'); g.fillStyle = gr; g.fillRect(x, 0, 3 + R() * 14, s); } break;
    case 12: for (let k = 0; k < 14; k++) { const x = s * (0.25 + R() * 0.5) + (R() - 0.5) * 60, y = s * (0.25 + R() * 0.5) + (R() - 0.5) * 60; const gr = g.createRadialGradient(x, y, 0, x, y, 8); gr.addColorStop(0, 'rgba(0,0,0,0.95)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(190,190,180,0.35)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); } break;
    case 13: { const c = [[170, 90, 24], [30, 110, 118], [150, 30, 24], [190, 160, 40]][(R() * 4) | 0]; g.fillStyle = rgb(c, 0.9, 0.95); g.fillRect(0, s * (0.35 + R() * 0.2), s, s * 0.16); wearOut(g, s, 260); break; }
    case 14: for (let k = 0; k < 3; k++) { const y = s * (0.25 + k * 0.22); g.fillStyle = 'rgba(8,8,8,0.9)'; g.fillRect(0, y, s, s * 0.07); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y, s, 2); for (const x of [0.15, 0.55, 0.9]) { g.fillStyle = rgb(base, 1.1); g.fillRect(x * s, y - 4, s * 0.05, s * 0.07 + 8); } } break;
    case 15: g.fillStyle = 'rgba(15,17,18,0.92)'; g.fillRect(s * 0.15, s * 0.15, s * 0.7, s * 0.7); for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) bolt(g, x * s, y * s, 4); g.fillStyle = 'rgba(160,30,24,0.9)'; g.fillRect(s * 0.4, s * 0.42, s * 0.2, s * 0.16); break;
    default:
  }
  dirt(g, s, { streaks: 3 + ((R() * 8) | 0), stains: 2 + ((R() * 5) | 0), rust: R(), scratches: 10 + ((R() * 50) | 0), edge: 0.25 + R() * 0.4 });
  plateSeams(g, s, 0.8 + R() * 0.4);
}

function floorCell(g, s, i) {
  const base = tone([46, 49, 50], 0.3);
  g.fillStyle = rgb(base); g.fillRect(0, 0, s, s);
  grain(g, s, R() < 0.5, 0.05);
  speckle(g, s, s * 7, 0.08);
  const layout = [8, 9, 11, 14].includes(i % 16) ? 0 : i % 16;
  switch (layout) {
    case 0: for (const [x, y] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) bolt(g, x * s, y * s, 4); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.strokeRect(s * 0.06, s * 0.06, s * 0.88, s * 0.88); break;
    case 1: g.strokeStyle = 'rgba(200,205,205,0.2)'; g.lineWidth = 5; for (let y = 0; y < s; y += s / 8) for (let x = 0; x < s; x += s / 8) { const o = ((y / (s / 8)) | 0) % 2 ? s / 16 : 0; g.beginPath(); g.moveTo(x + o + 4, y + s / 10); g.lineTo(x + o + s / 10, y + 4); g.stroke(); g.beginPath(); g.moveTo(x + o + 4, y + 4); g.lineTo(x + o + s / 10, y + s / 10); g.stroke(); } break;
    case 2: g.fillStyle = '#080909'; g.fillRect(s * 0.15, s * 0.15, s * 0.7, s * 0.7); g.fillStyle = 'rgba(70,78,80,1)'; for (let k = 0; k < 12; k++) g.fillRect(s * 0.15, s * 0.15 + k * s * 0.058, s * 0.7, s * 0.02); g.fillStyle = 'rgba(60,66,68,1)'; for (let k = 0; k < 5; k++) g.fillRect(s * 0.15 + k * s * 0.17, s * 0.15, s * 0.02, s * 0.7); break;
    case 3: weld(g, 0, s * 0.5, s, s * 0.5); weld(g, s * 0.5, 0, s * 0.5, s * 0.5); break;
    case 4: g.fillStyle = 'rgba(32,35,36,1)'; g.fillRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6); g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 6; g.strokeRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6); g.fillStyle = 'rgba(160,165,160,0.6)'; g.fillRect(s * 0.44, s * 0.46, s * 0.12, s * 0.08); for (const [x, y] of [[0.24, 0.24], [0.76, 0.24], [0.24, 0.76], [0.76, 0.76]]) bolt(g, x * s, y * s, 3.5); break;
    case 5: g.fillStyle = 'rgba(5,6,6,1)'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.17, 0, 7); g.fill(); g.strokeStyle = 'rgba(120,125,120,0.8)'; g.lineWidth = 5; g.beginPath(); g.arc(s / 2, s / 2, s * 0.17, 0, 7); g.stroke(); for (let k = -2; k <= 2; k++) { g.fillStyle = 'rgba(40,44,45,1)'; g.fillRect(s / 2 - s * 0.15, s / 2 + k * s * 0.05 - 3, s * 0.3, 6); } break;
    case 6: { const gr = g.createRadialGradient(s * 0.4, s * 0.55, 6, s * 0.4, s * 0.55, s * 0.5); gr.addColorStop(0, 'rgba(2,3,4,0.95)'); gr.addColorStop(0.6, 'rgba(8,10,12,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); break; }
    case 7: g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 3; for (let k = 0; k < 3; k++) { let x = s * R(), y = s * R(); g.beginPath(); g.moveTo(x, y); for (let n = 0; n < 12; n++) { x += (R() - 0.5) * s * 0.2; y += (R() - 0.5) * s * 0.2; g.lineTo(x, y); } g.stroke(); } break;
    case 8: g.fillStyle = 'rgba(190,150,30,0.85)'; for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(s * 0.2, s * (0.75 - k * 0.3)); g.lineTo(s * 0.5, s * (0.5 - k * 0.3)); g.lineTo(s * 0.8, s * (0.75 - k * 0.3)); g.lineTo(s * 0.8, s * (0.87 - k * 0.3)); g.lineTo(s * 0.5, s * (0.62 - k * 0.3)); g.lineTo(s * 0.2, s * (0.87 - k * 0.3)); g.fill(); } wearOut(g, s, 260); break;
    case 9: g.fillStyle = 'rgba(180,140,28,0.85)'; g.fillRect(0, s * 0.42, s, s * 0.16); wearOut(g, s, 300); break;
    case 10: g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 9; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(0, s * (0.15 + k * 0.22) + R() * 20); g.bezierCurveTo(s * 0.3, s * R(), s * 0.7, s * R(), s, s * (0.15 + k * 0.22)); g.stroke(); } break;
    case 11: stencil(g, s * 0.08, s * 0.5, codeText(), s * 0.34, 'rgba(210,205,185,0.8)'); wearOut(g, s, 240); break;
    case 12: for (let k = 0; k < 9; k++) { const x = R() * s, y = R() * s, r = s * (0.05 + R() * 0.12); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(110,52,20,0.5)'); gr.addColorStop(1, 'rgba(110,52,20,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } break;
    case 13: g.fillStyle = 'rgba(20,22,22,0.95)'; g.fillRect(0, 0, s, s); g.fillStyle = 'rgba(48,52,53,1)'; for (let y = 0; y < s; y += s / 6) for (let x = 0; x < s; x += s / 6) g.fillRect(x + 4, y + 4, s / 6 - 8, s / 6 - 8); break;
    case 14: g.fillStyle = 'rgba(150,40,30,0.8)'; g.fillRect(0, s * 0.46, s, s * 0.08); g.fillStyle = 'rgba(210,205,190,0.75)'; g.fillRect(0, s * 0.54, s, s * 0.04); wearOut(g, s, 260); break;
    case 15: g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 12; k++) { g.beginPath(); g.ellipse(R() * s, R() * s, 6 + R() * 28, 3 + R() * 10, R() * 3, 0, 7); g.fill(); } break;
    default:
  }
  dirt(g, s, { streaks: 2 + ((R() * 5) | 0), stains: 4 + ((R() * 8) | 0), rust: R() * 0.8, scratches: 20 + ((R() * 80) | 0), edge: 0.35 + R() * 0.3 });
  plateSeams(g, s, 0.9 + R() * 0.4);
}

function machineCell(g, s, i) {
  const base = tone([48, 56, 62], 0.3);
  g.fillStyle = rgb(base); g.fillRect(0, 0, s, s);
  grain(g, s, true, 0.05);
  speckle(g, s, s * 5, 0.07);
  const layout = [6, 10, 13].includes(i % 16) ? 0 : i % 16;
  const vents = (x, y, w, h, n) => { g.fillStyle = 'rgba(6,7,8,0.9)'; g.fillRect(x, y, w, h); for (let k = 0; k < n; k++) { g.fillStyle = rgb(base, 1.25); g.fillRect(x + 3, y + 5 + k * (h - 8) / n, w - 6, (h - 8) / n * 0.45); } };
  switch (layout) {
    case 0: vents(s * 0.12, s * 0.12, s * 0.76, s * 0.4, 8); break;
    case 1: vents(s * 0.1, s * 0.5, s * 0.8, s * 0.38, 6); bolt(g, s * 0.1, s * 0.1); bolt(g, s * 0.9, s * 0.1); break;
    case 2: g.fillStyle = 'rgba(8,10,11,0.95)'; g.beginPath(); g.arc(s * 0.5, s * 0.45, s * 0.26, 0, 7); g.fill(); g.strokeStyle = 'rgba(160,165,160,0.7)'; g.lineWidth = 5; g.beginPath(); g.arc(s * 0.5, s * 0.45, s * 0.26, 0, 7); g.stroke(); g.strokeStyle = 'rgba(210,60,40,0.9)'; g.lineWidth = 4; g.beginPath(); g.moveTo(s * 0.5, s * 0.45); g.lineTo(s * 0.64, s * 0.32); g.stroke(); break;
    case 3: g.fillStyle = 'rgba(10,12,13,0.95)'; g.fillRect(s * 0.15, s * 0.15, s * 0.7, s * 0.7); for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? 'rgba(60,200,120,0.8)' : 'rgba(220,150,40,0.8)'; g.fillRect(s * 0.2 + k * s * 0.11, s * 0.2, s * 0.06, s * 0.06); } break;
    case 4: g.fillStyle = 'rgba(170,130,26,0.85)'; g.fillRect(0, s * 0.82, s, s * 0.1); wearOut(g, s, 200); vents(s * 0.2, s * 0.15, s * 0.6, s * 0.5, 7); break;
    case 5: for (let k = 0; k < 3; k++) { g.fillStyle = rgb(base, 0.8 + k * 0.1); g.fillRect(s * 0.06, s * (0.06 + k * 0.31), s * 0.88, s * 0.28); g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 4; g.strokeRect(s * 0.06, s * (0.06 + k * 0.31), s * 0.88, s * 0.28); bolt(g, s * 0.1, s * (0.1 + k * 0.31), 2.5); bolt(g, s * 0.9, s * (0.1 + k * 0.31), 2.5); } break;
    case 6: stencil(g, s * 0.1, s * 0.3, codeText(), s * 0.26, 'rgba(210,205,185,0.8)'); stencil(g, s * 0.1, s * 0.62, 'HV ' + ((R() * 90) | 0), s * 0.2, 'rgba(210,205,185,0.7)'); wearOut(g, s, 220); break;
    case 7: g.fillStyle = 'rgba(30,34,36,1)'; g.fillRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8); g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 6; g.strokeRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8); g.fillStyle = 'rgba(160,165,160,0.6)'; g.fillRect(s * 0.74, s * 0.44, s * 0.08, s * 0.12); break;
    case 8: for (let k = 0; k < 3; k++) { const y = s * (0.2 + k * 0.25); g.fillStyle = 'rgba(8,8,8,0.9)'; g.fillRect(0, y, s, s * 0.07); } for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(160,60,30,0.8)'; g.fillRect(s * (0.2 + k * 0.25), s * 0.78, s * 0.1, s * 0.07); } break;
    case 9: { const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.1)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); weld(g, 0, s * 0.3, s, s * 0.3); break; }
    case 10: g.fillStyle = 'rgba(25,110,118,0.85)'; g.fillRect(0, s * 0.3, s, s * 0.22); wearOut(g, s, 240); stencil(g, s * 0.1, s * 0.41, codeText(), s * 0.15, 'rgba(230,230,220,0.85)'); break;
    case 11: vents(s * 0.08, s * 0.08, s * 0.38, s * 0.84, 10); vents(s * 0.54, s * 0.08, s * 0.38, s * 0.84, 10); break;
    case 12: for (let k = 0; k < 10; k++) { const x = R() * s, y = R() * s; g.fillStyle = 'rgba(0,0,0,0.75)'; g.beginPath(); g.arc(x, y, 3 + R() * 6, 0, 7); g.fill(); } break;
    case 13: g.fillStyle = 'rgba(180,36,28,0.85)'; g.fillRect(s * 0.1, s * 0.1, s * 0.8, s * 0.1); stencil(g, s * 0.18, s * 0.15, 'DANGER', s * 0.09, 'rgba(235,235,225,0.9)'); wearOut(g, s, 160); break;
    case 14: for (let k = 0; k < 16; k++) bolt(g, s * (0.1 + (k % 4) * 0.27), s * (0.15 + Math.floor(k / 4) * 0.23), 3); break;
    case 15: g.fillStyle = 'rgba(12,14,15,0.95)'; g.fillRect(s * 0.1, s * 0.25, s * 0.8, s * 0.5); g.fillStyle = 'rgba(70,200,230,0.55)'; g.fillRect(s * 0.14, s * 0.3, s * 0.72, s * 0.4); break;
    default:
  }
  dirt(g, s, { streaks: 3 + ((R() * 8) | 0), stains: 3 + ((R() * 6) | 0), rust: R() * 0.7, scratches: 20 + ((R() * 60) | 0), edge: 0.3 + R() * 0.4 });
  plateSeams(g, s, 0.8 + R() * 0.4);
}

const wallAtlas = makeAtlas(256, wallCell);
const floorAtlas = makeAtlas(256, floorCell);
const machineAtlas = makeAtlas(256, machineCell);

const hazardTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#a98313'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#101112';
  for (let i = -s; i < s * 2; i += 64) { g.beginPath(); g.moveTo(i, s); g.lineTo(i + 32, s); g.lineTo(i + s + 32, 0); g.lineTo(i + s, 0); g.fill(); }
  speckle(g, s, 1500, 0.12);
  dirt(g, s, { streaks: 6, stains: 8, rust: 0.2, scratches: 40, edge: 0.3 });
});

const drumTex = canvasTex(512, (g, s) => {
  g.fillStyle = '#8c241b'; g.fillRect(0, 0, s, s);
  speckle(g, s, 2500, 0.1);
  g.fillStyle = '#b8901f'; g.fillRect(0, 20, s, 44); g.fillRect(0, s - 64, s, 44);
  g.fillStyle = '#100d0b';
  for (let x = 0; x < s; x += 48) { g.beginPath(); g.moveTo(x, 20); g.lineTo(x + 24, 20); g.lineTo(x + 48, 64); g.lineTo(x + 24, 64); g.fill(); }
  for (let x = 0; x < s; x += 48) { g.beginPath(); g.moveTo(x, s - 64); g.lineTo(x + 24, s - 64); g.lineTo(x + 48, s - 20); g.lineTo(x + 24, s - 20); g.fill(); }
  g.strokeStyle = '#4e0f0a'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, s * 0.42); g.lineTo(s, s * 0.42); g.moveTo(0, s * 0.62); g.lineTo(s, s * 0.62); g.stroke();
  for (const cx of [s * 0.25, s * 0.75]) {
    g.fillStyle = '#b8901f'; g.beginPath(); g.moveTo(cx, 120); g.lineTo(cx + 68, 320); g.lineTo(cx - 68, 320); g.closePath(); g.fill();
    g.fillStyle = '#100d0b'; g.beginPath(); g.moveTo(cx, 168); g.quadraticCurveTo(cx + 44, 240, cx + 24, 292); g.quadraticCurveTo(cx, 304, cx - 24, 292); g.quadraticCurveTo(cx - 40, 236, cx, 168); g.fill();
    g.fillStyle = '#b8901f'; g.beginPath(); g.moveTo(cx, 232); g.quadraticCurveTo(cx + 16, 268, cx + 6, 288); g.quadraticCurveTo(cx - 12, 288, cx - 12, 268); g.fill();
  }
  dirt(g, s, { streaks: 16, stains: 12, rust: 0.8, scratches: 60, edge: 0.5 });
});

// ---------------------------------------------------------------- shader patch: world-space variation
// Level materials sample their atlas by world position: each tile picks a random plate, orientation and tint,
// then large-scale dirt noise is laid over everything so no two areas look alike.
const GLSL_COMMON = `
varying vec3 vWPos; varying vec3 vWN;
uniform float uTile; uniform float uSeed; uniform float uAtlas; uniform float uDirt;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.07 + 7.1) + 0.2 * vnoise(p * 4.3 + 3.7); }
vec2 orientP(vec2 f, float h){ if (h < 0.125) return f; if (h < 0.25) return vec2(1.0 - f.x, f.y); if (h < 0.375) return vec2(f.x, 1.0 - f.y); if (h < 0.5) return 1.0 - f;
  if (h < 0.625) return f.yx; if (h < 0.75) return vec2(1.0 - f.y, f.x); if (h < 0.875) return vec2(f.y, 1.0 - f.x); return 1.0 - f.yx; }
vec2 orientD(vec2 d, float h){ if (h < 0.125) return d; if (h < 0.25) return vec2(-d.x, d.y); if (h < 0.375) return vec2(d.x, -d.y); if (h < 0.5) return -d;
  if (h < 0.625) return d.yx; if (h < 0.75) return vec2(-d.y, d.x); if (h < 0.875) return vec2(d.y, -d.x); return -d.yx; }
`;

const GLSL_MAP = `
  vec3 an = abs(normalize(vWN));
  vec2 wp = (an.y > an.x && an.y > an.z) ? vWPos.xz : (an.x > an.z ? vWPos.zy : vWPos.xy);
  vec3 albedo = vec3(1.0);
  if (uAtlas > 0.5) {
    vec2 t = wp / uTile;
    vec2 id = floor(t), f = fract(t);
    float hv = h21(id + uSeed), ho = h21(id * 1.713 + uSeed + 5.3);
    float v = floor(hv * 16.0);
    vec2 cell = vec2(mod(v, 4.0), floor(v / 4.0));
    vec2 fo = clamp(orientP(f, ho), 0.006, 0.994);
    vec2 dx = orientD(dFdx(t), ho) * 0.25, dy = orientD(dFdy(t), ho) * 0.25;
    vec3 tex = textureGrad(map, (cell + fo) * 0.25, dx, dy).rgb;
    float tn = 0.82 + 0.36 * h21(id + 9.1);
    vec3 tint = mix(vec3(1.0), vec3(1.1, 1.0, 0.88), h21(id + 4.4)) * mix(vec3(1.0), vec3(0.88, 0.98, 1.1), h21(id + 2.2));
    albedo = tex * tn * tint;
  }
  if (uDirt > 0.5) {
    float m1 = fbm(wp * 0.11 + uSeed), m2 = fbm(wp * 0.42 + uSeed * 1.7 + 11.0), m3 = fbm(wp * 1.7 + 3.0);
    albedo *= 0.62 + 0.62 * m1;
    albedo = mix(albedo, albedo * vec3(0.5, 0.44, 0.4), smoothstep(0.55, 0.85, m2) * 0.65);
    albedo = mix(albedo, albedo * vec3(1.5, 0.95, 0.6), smoothstep(0.72, 0.9, fbm(wp * 0.27 + uSeed + 31.0)) * 0.55);
    albedo *= 0.86 + 0.28 * m3;
  }
  diffuseColor.rgb *= albedo;
`;

function patchMaterial(mat, { atlas = false, tile = 2.4, seed = 1, dirtOn = true } = {}) {
  mat.userData.noSnap = true;
  mat.customProgramCacheKey = () => 'worldvar';
  mat.onBeforeCompile = function (shader) {
    THREE.Material.prototype.onBeforeCompile.call(this, shader); // keeps the retro vertex snapping hook
    shader.uniforms.uTile = { value: tile };
    shader.uniforms.uSeed = { value: seed };
    shader.uniforms.uAtlas = { value: atlas ? 1 : 0 };
    shader.uniforms.uDirt = { value: dirtOn ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON)
      .replace('#include <map_fragment>', GLSL_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor * (0.65 + 0.7 * (1.0 - fbm(wp * 0.9 + uSeed))), 0.15, 1.0);');
  };
  return mat;
}

function worldMat(atlasTex, { tile, seed, roughness = 0.6, metalness = 0.5, color = 0xffffff } = {}) {
  return patchMaterial(new THREE.MeshStandardMaterial({ map: atlasTex, color, roughness, metalness }), { atlas: true, tile, seed });
}

// Untextured level materials still get large-scale dirt and mottling so a shared colour doesn't read as a clone.
function dirtyMat(color, o = {}) {
  return patchMaterial(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.08, map: WHITE, ...o }), { atlas: false, seed: Math.random() * 40 });
}
const WHITE = (() => { const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; })();

const glow = (color, intensity = 1.4) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
const tiled = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0.5, ...o });

// Window and containment glass: unlit tint with a view-angle sheen, so panes read as glass without hot specular spots from nearby lamps.
function makeGlass() {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTint: { value: new THREE.Color(0x7ea6b3) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uTint; varying vec3 vN; varying vec3 vV; void main(){ vec3 n = normalize(vN), v = normalize(vV); float f = pow(1.0 - abs(dot(n, v)), 3.0); float sheen = smoothstep(-0.2, 1.0, n.y) * 0.1; vec3 c = uTint * (0.30 + sheen) + vec3(0.55, 0.72, 0.8) * f * 0.45; gl_FragColor = vec4(pow(c, vec3(2.2)), 0.1 + f * 0.4); }',
  });
  m.userData.noSnap = true;
  return m;
}

export const M = {
  floor: worldMat(floorAtlas, { tile: 1.6, seed: 3.1, roughness: 0.88, metalness: 0.06 }),
  wall: worldMat(wallAtlas, { tile: 2.2, seed: 7.7, roughness: 0.9, metalness: 0.05, color: 0xc2ccd4 }),
  machine: worldMat(machineAtlas, { tile: 1.5, seed: 12.3, roughness: 0.85, metalness: 0.08 }),
  machineB: worldMat(machineAtlas, { tile: 1.5, seed: 21.9, roughness: 0.85, metalness: 0.08, color: 0xd6b57a }),
  machineC: worldMat(machineAtlas, { tile: 1.5, seed: 33.2, roughness: 0.85, metalness: 0.08, color: 0x9db3c4 }),
  hazard: tiled(hazardTex, { roughness: 0.8, metalness: 0.2 }),
  drum: tiled(drumTex, { roughness: 0.5 }),
  grayDrum: dirtyMat(0x3d474b, { roughness: 0.6 }),
  dark: dirtyMat(0x15191b, { roughness: 0.55 }),
  mid: dirtyMat(0x363d40),
  light: dirtyMat(0x6c7578, { roughness: 0.5 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x0e1011, roughness: 0.9, metalness: 0.1 }),
  crate: dirtyMat(0x4a463a, { roughness: 0.85, metalness: 0.15 }),
  glass: makeGlass(),
  cyan: glow(0x35d8f0, 1.5), amber: glow(0xff9a2a, 1.6), red: glow(0xff2a1a, 2.0), green: glow(0x35e87a, 1.5),
  screen: glow(0x2fb8e0, 1.0), screenWarm: glow(0xffa83a, 1.0),
  white: glow(0xdfeeff, 1.5),
  fluid: new THREE.MeshStandardMaterial({ color: 0x0a2a24, emissive: 0x1ab88c, emissiveIntensity: 0.8, transparent: true, opacity: 0.75, roughness: 0.2 }),
  scorch: new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.8, depthWrite: false }),
};

// Materials for the Blender-made environment kit (matched by the material names exported from art/make_kit.py).
const KIT = {};
const kitFlat = (hex, o = {}) => dirtyMat(hex, { roughness: 0.86, metalness: 0.06, ...o });
export function kitMaterial(name) {
  if (KIT[name]) return KIT[name];
  let m;
  switch (name) {
    case 'PaintStructural': m = kitFlat(0x6d7a84); break;
    case 'PaintEquipment': m = kitFlat(0x9aa2a6); break;
    case 'PaintDark': m = kitFlat(0x2a3034); break;
    case 'MetalBare': m = kitFlat(0x868d91, { roughness: 0.6, metalness: 0.35 }); break;
    case 'Rubber': m = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.95, metalness: 0.02 }); break;
    case 'Hazard': m = kitFlat(0xbc9718); break;
    case 'SafetyOrange': m = kitFlat(0xbf571e); break;
    case 'Fabric': m = kitFlat(0x303a4a, { roughness: 0.95 }); break;
    case 'Canister': m = kitFlat(0x556368); break;
    case 'Screen': m = new THREE.MeshStandardMaterial({ color: 0x050809, emissive: 0x2a9fb8, emissiveIntensity: 0.6, roughness: 0.4 }); break;
    case 'Status': m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x35e87a, emissiveIntensity: 1.3 }); break;
    case 'Glass': m = M.glass; break;
    case 'Drum': m = M.drum; break;
    default: m = kitFlat(0x808080);
  }
  m.userData.noSnap = true;
  return (KIT[name] = m);
}

// Large static level surfaces must not vertex-snap: moving a far corner by a pixel swims the whole plane.
for (const k of Object.keys(M)) if (k !== 'drum' && k !== 'grayDrum') M[k].userData.noSnap = true;

// Box with UVs scaled to world size (used by non-atlas materials such as hazard stripes).
export function boxGeo(w, h, d, tile = 2, seed = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const ou = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1, ov = Math.abs(Math.sin(seed * 78.233 + 1.3) * 12345.6789) % 1;
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile + ou, uv.getY(i) * dims[f][1] / tile + ov);
    }
  }
  return g;
}

// Translucent, fresnel-lit gel used for the alien body.
const gels = [];
export function makeGel({ color = 0x0a3c3a, rim = 0x6fe0d0, alpha = 0.24 } = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uRim: { value: new THREE.Color(rim) },
      uAlpha: { value: alpha },
      uTime: { value: 0 },
      uGlow: { value: 0 },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uRim; uniform float uAlpha; uniform float uTime; uniform float uGlow;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vec3 n = normalize(vN); vec3 v = normalize(vV);
        float f = pow(1.0 - abs(dot(n, v)), 2.6);
        vec3 l = normalize(vec3(0.4, 0.8, 0.5));
        float spec = pow(max(dot(reflect(-v, n), l), 0.0), 40.0);
        float band = 0.5 + 0.5 * sin(vP.z * 34.0 - uTime * 2.2);
        vec3 c = mix(uColor, uRim, f) + vec3(spec * 0.9) + uRim * band * 0.04 + uRim * uGlow * 0.6;
        float a = clamp(uAlpha + f * 0.5 + spec * 0.6 + uGlow * 0.25, 0.0, 0.92);
        gl_FragColor = vec4(pow(c, vec3(2.2)), a);
      }`,
  });
  gels.push(m);
  return m;
}

export function updateGels(t, glowAmt) {
  for (const m of gels) { m.uniforms.uTime.value = t; m.uniforms.uGlow.value = glowAmt; }
}
