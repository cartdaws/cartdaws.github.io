import * as THREE from 'three';

// ---------------------------------------------------------------- the homeworld, drawn once and reused so the research display and the memory match
// Ringed gas-giant-like world with two moons (one pale, one amber) around a small orange sun.
export function drawHomeworld(g, cx, cy, r, t = 0, glow = 0) {
  g.save();
  // back half of the ring
  const ring = (front) => {
    g.save(); g.translate(cx, cy); g.rotate(-0.38);
    g.lineWidth = r * 0.16;
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = `rgba(${150 + k * 25},${200 - k * 20},${190 + k * 10},${0.55 - k * 0.12})`;
      g.lineWidth = r * (0.15 - k * 0.04);
      g.beginPath(); g.ellipse(0, 0, r * (1.7 + k * 0.17), r * (0.42 + k * 0.04), 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); g.stroke();
    }
    g.restore();
  };
  ring(false);
  // planet body with bands
  const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#9fe4d4'); grad.addColorStop(0.55, '#3a8f94'); grad.addColorStop(1, '#0f2f3d');
  g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  for (let i = 0; i < 9; i++) {
    g.fillStyle = i % 2 ? 'rgba(210,150,230,0.18)' : 'rgba(10,40,60,0.22)';
    g.fillRect(cx - r, cy - r + (i + 0.2) * r * 0.22 + Math.sin(i * 1.7) * r * 0.03, r * 2, r * 0.1);
  }
  const shade = g.createRadialGradient(cx + r * 0.5, cy + r * 0.4, r * 0.2, cx + r * 0.6, cy + r * 0.5, r * 1.3);
  shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,4,10,0.7)');
  g.fillStyle = shade; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.restore();
  ring(true);
  if (glow > 0) { g.strokeStyle = `rgba(120,255,220,${glow})`; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, r * 2.15, 0, Math.PI * 2); g.stroke(); }
  g.restore();
}

// ---------------------------------------------------------------- research display (hangs above the containment approach)
const W = 1536, H = 832;

export class SpecimenDisplay {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false; // the kit screen quad carries glTF-style UVs
    this.texture.anisotropy = 8;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    this.material.userData.noSnap = true;
    this.mode = '';
    this.time = 0;
    this.set('record');
  }

  set(mode) { this.mode = mode; this.draw(); }

  draw(t = this.time) {
    this.time = t;
    const g = this.g;
    const bad = this.mode === 'warning' || this.mode === 'breach';
    g.fillStyle = bad ? '#150607' : '#06141a'; g.fillRect(0, 0, W, H);
    // faint scan lines
    g.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
    const ink = bad ? '#ff6a4a' : '#9fe8f2', dim = bad ? '#7a2a22' : '#2b6672', bright = '#f2fbfd';
    g.fillStyle = dim; g.fillRect(40, 44, W - 80, 4);
    g.fillStyle = ink; g.font = '600 34px "Segoe UI", Arial, sans-serif'; g.textBaseline = 'alphabetic';
    g.fillText('HALCYON RESEARCH VESSEL  ·  SPECIMEN BAY 3', 40, 36);
    g.textAlign = 'right'; g.fillText(bad ? 'ALERT' : 'LIVE', W - 40, 36); g.textAlign = 'left';

    if (this.mode === 'record') {
      g.fillStyle = bright; g.font = '800 118px "Segoe UI", Arial, sans-serif'; g.fillText('SPECIMEN 09', 40, 196);
      g.fillStyle = '#ffd36a'; g.font = '700 74px "Segoe UI", Arial, sans-serif'; g.fillText('EXTRATERRESTRIAL', 40, 286);
      const rows = [['ORIGIN', 'UNCHARTED SYSTEM'], ['STATUS', 'CONTAINED'], ['TRIAL 27', 'TECHNOLOGY ABSORPTION']];
      rows.forEach(([a, b], i) => {
        g.fillStyle = dim; g.font = '600 38px "Segoe UI", Arial, sans-serif'; g.fillText(a, 40, 400 + i * 96);
        g.fillStyle = ink; g.font = '700 58px "Segoe UI", Arial, sans-serif'; g.fillText(b, 40, 452 + i * 96);
      });
      drawHomeworld(g, 1200, 420, 118, this.time, 0);
      g.fillStyle = ink; g.font = '700 42px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.fillText('ORIGIN', 1200, 640); g.textAlign = 'left';
      g.strokeStyle = dim; g.lineWidth = 3; g.strokeRect(940, 170, 520, 520);
    } else if (this.mode === 'orbit') {
      // enlarged origin diagram: star, orbit, ringed world
      g.strokeStyle = dim; g.lineWidth = 3; g.setLineDash([14, 12]);
      g.beginPath(); g.ellipse(560, 440, 440, 250, -0.05, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      const sun = g.createRadialGradient(240, 440, 6, 240, 440, 70); sun.addColorStop(0, '#fff2c0'); sun.addColorStop(1, 'rgba(255,150,40,0)');
      g.fillStyle = sun; g.fillRect(150, 350, 180, 180);
      const a = 0.35 + this.time * 0.15, px = 560 + Math.cos(a) * 440, py = 440 + Math.sin(a) * 250;
      drawHomeworld(g, 1010, 440, 172, this.time, 0.35 + Math.sin(this.time * 4) * 0.2);
      g.fillStyle = bright; g.font = '800 76px "Segoe UI", Arial, sans-serif'; g.fillText('ORIGIN WORLD', 40, 150);
      g.fillStyle = ink; g.font = '600 44px "Segoe UI", Arial, sans-serif'; g.fillText('UNCHARTED SYSTEM  ·  2 MOONS  ·  RINGED', 40, 210);
      g.fillStyle = dim; g.beginPath(); g.arc(px - 260, py - 40, 8, 0, 7); g.fill();
    } else if (this.mode === 'warning') {
      const flash = (Math.sin(this.time * 14) > 0) ? 1 : 0.35;
      g.fillStyle = `rgba(255,70,50,${0.9 * flash})`; g.font = '800 120px "Segoe UI", Arial, sans-serif'; g.fillText('CONTAINMENT', 40, 250); g.fillText('FIELD FAILING', 40, 380);
      g.fillStyle = ink; g.font = '700 54px "Segoe UI", Arial, sans-serif'; g.fillText('TRIAL 27 · POWER SURGE', 40, 480);
      const lvl = Math.max(0.05, 0.62 - (this.time % 100) * 0);
      g.strokeStyle = ink; g.lineWidth = 4; g.strokeRect(40, 540, W - 80, 70);
      g.fillStyle = `rgba(255,90,60,${0.6 + 0.3 * flash})`; g.fillRect(48, 548, (W - 96) * (this.fieldLevel ?? lvl), 54);
      g.fillStyle = dim; g.font = '600 36px "Segoe UI", Arial, sans-serif'; g.fillText('FIELD INTEGRITY', 40, 660);
    } else if (this.mode === 'breach') {
      g.fillStyle = '#ff6a4a'; g.font = '800 128px "Segoe UI", Arial, sans-serif'; g.fillText('CONTAINMENT', 40, 280); g.fillText('FAILURE', 40, 420);
      g.fillStyle = ink; g.font = '700 58px "Segoe UI", Arial, sans-serif'; g.fillText('SPECIMEN 09 · NOT IN CELL', 40, 520);
      g.fillStyle = dim; g.font = '600 44px "Segoe UI", Arial, sans-serif'; g.fillText('AUTOMATED SECURITY DEPLOYING', 40, 600);
    }
    this.texture.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- evacuation / service route display beside the containment door
export function makeEvacMaterial() {
  const w = 768, h = 512;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#071318'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#9fe8f2'; g.font = '700 34px "Segoe UI", Arial, sans-serif'; g.fillText('SERVICE ROUTE · RESEARCH DECKS', 28, 52);
  g.fillStyle = '#1f4852'; g.fillRect(28, 66, w - 56, 3);
  // schematic: containment bay -> corridor -> robotics deck -> hangar
  const room = (x, y, ww, hh, label, on) => {
    g.fillStyle = on ? '#1c5a66' : '#0f2a31'; g.fillRect(x, y, ww, hh);
    g.strokeStyle = on ? '#9fe8f2' : '#2a6470'; g.lineWidth = 3; g.strokeRect(x, y, ww, hh);
    g.fillStyle = on ? '#f2fbfd' : '#7fb8c2'; g.font = '600 24px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.fillText(label, x + ww / 2, y + hh / 2 + 8); g.textAlign = 'left';
  };
  room(70, 330, 190, 120, 'CONTAINMENT', false);
  room(300, 330, 90, 120, 'LINK', false);
  room(430, 200, 270, 250, 'ROBOTICS DECK', false);
  room(430, 100, 270, 70, 'HANGAR', true);
  g.strokeStyle = '#ffd36a'; g.lineWidth = 8; g.setLineDash([16, 10]);
  g.beginPath(); g.moveTo(165, 390); g.lineTo(345, 390); g.lineTo(480, 390); g.lineTo(480, 135); g.lineTo(560, 135); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#ffd36a'; g.beginPath(); g.moveTo(560, 112); g.lineTo(596, 135); g.lineTo(560, 158); g.fill();
  g.fillStyle = '#ff5a3c'; g.beginPath(); g.arc(165, 390, 14, 0, 7); g.fill();
  g.fillStyle = '#f2fbfd'; g.font = '700 26px "Segoe UI", Arial, sans-serif'; g.fillText('YOU ARE HERE', 70, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  m.userData.noSnap = true;
  return m;
}

// ---------------------------------------------------------------- the memory insert: the homeworld sky and terrain, drawn on a 2D canvas overlay
export class MemoryScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.w = canvas.width = 640; this.h = canvas.height = 360;
    this.spires = Array.from({ length: 16 }, (_, i) => ({ x: i * 56 + (i * 37) % 30, h: 60 + ((i * 53) % 90), w: 10 + (i * 11) % 14, layer: i % 3 }));
    this.figures = [{ x: 140, s: 1 }, { x: 330, s: 0.8 }, { x: 470, s: 1.15 }];
  }

  draw(t) {
    const g = this.g, w = this.w, h = this.h;
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#120a2a'); sky.addColorStop(0.45, '#2d1d55'); sky.addColorStop(0.72, '#2f7a86'); sky.addColorStop(1, '#8ed6c6');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    // stars
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 70; i++) g.fillRect((i * 97) % w, (i * 41) % (h * 0.5), 1, 1);
    // the ring arc sweeping across the whole sky (same ring as on the research display)
    g.save(); g.translate(w * 0.55, h * 1.15); g.rotate(-0.38);
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = `rgba(${170 + k * 25},${215 - k * 20},${200},${0.45 - k * 0.1})`; g.lineWidth = 16 - k * 4;
      g.beginPath(); g.ellipse(0, 0, 640 + k * 50, 300 + k * 24, 0, Math.PI, Math.PI * 2); g.stroke();
    }
    g.restore();
    // two moons (pale and amber), drifting slowly
    const mx = w * 0.72 - t * 3;
    const mg = g.createRadialGradient(mx - 10, 78, 6, mx, 82, 54); mg.addColorStop(0, '#f6f6ff'); mg.addColorStop(1, '#8fa0c8');
    g.fillStyle = mg; g.beginPath(); g.arc(mx, 82, 52, 0, 7); g.fill();
    g.fillStyle = '#e8a050'; g.beginPath(); g.arc(mx - 150, 128, 20, 0, 7); g.fill();
    // distant organic towers on three parallax layers: slender stalks that sway and swell at the tip
    for (let layer = 0; layer < 3; layer++) {
      const par = (layer + 1) * 5, shade = 0.22 + layer * 0.28;
      g.fillStyle = `rgba(${10 + layer * 6},${24 + layer * 14},${40 + layer * 18},1)`;
      for (const s of this.spires) {
        if (s.layer !== layer) continue;
        const x = ((s.x - t * par) % (w + 80) + w + 80) % (w + 80) - 40;
        const base = h * (0.7 + layer * 0.07), top = s.h * (1.2 + layer * 0.2), sway = Math.sin(t * 0.4 + s.x) * 5;
        g.beginPath(); g.moveTo(x - s.w * 0.9, base);
        g.bezierCurveTo(x - s.w * 0.3 + sway * 0.3, base - top * 0.4, x - 3 + sway, base - top * 0.8, x + sway, base - top);
        g.bezierCurveTo(x + 4 + sway, base - top * 0.82, x + s.w * 0.3 + sway * 0.3, base - top * 0.4, x + s.w * 0.9, base);
        g.closePath(); g.fill();
        g.beginPath(); g.ellipse(x + sway, base - top, 5 + layer, 8 + layer * 2, 0, 0, 7); g.fill();
      }
      g.fillStyle = `rgba(8,22,34,${shade})`; g.fillRect(0, h * (0.72 + layer * 0.07), w, h);
    }
    // tall, slender walkers far across the plain
    g.fillStyle = '#04101a'; g.strokeStyle = '#04101a';
    for (const f of this.figures) {
      const x = ((f.x - t * 9) % (w + 120) + w + 120) % (w + 120) - 60, y = h * 0.84, s = f.s * 1.35;
      const sw = Math.sin(t * 1.6 + f.x) * 7 * s;
      g.lineWidth = 3 * s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - 2 * s, y - 58 * s); g.lineTo(x - 5 * s + sw * 0.5, y); g.moveTo(x + 2 * s, y - 58 * s); g.lineTo(x + 5 * s - sw * 0.5, y); g.stroke();
      g.beginPath(); g.moveTo(x - 6 * s, y - 56 * s); g.quadraticCurveTo(x - 9 * s, y - 92 * s, x - 3 * s, y - 104 * s); g.lineTo(x + 3 * s, y - 104 * s); g.quadraticCurveTo(x + 9 * s, y - 92 * s, x + 6 * s, y - 56 * s); g.closePath(); g.fill();
      g.lineWidth = 2.2 * s; g.beginPath(); g.moveTo(x - 4 * s, y - 100 * s); g.quadraticCurveTo(x - 20 * s, y - 80 * s, x - 15 * s + sw * 0.3, y - 52 * s); g.moveTo(x + 4 * s, y - 100 * s); g.quadraticCurveTo(x + 20 * s, y - 80 * s, x + 15 * s - sw * 0.3, y - 52 * s); g.stroke();
      g.beginPath(); g.ellipse(x, y - 116 * s, 5 * s, 11 * s, 0, 0, 7); g.fill();
      g.beginPath(); g.moveTo(x - 4 * s, y - 124 * s); g.lineTo(x, y - 140 * s); g.lineTo(x + 4 * s, y - 124 * s); g.fill();
    }
    // drifting luminous spores
    for (let i = 0; i < 26; i++) {
      const x = ((i * 53 + t * (8 + (i % 5) * 3)) % w), y = h * 0.4 + ((i * 29 + Math.sin(t + i) * 14) % (h * 0.55));
      g.fillStyle = `rgba(190,255,235,${0.25 + 0.25 * Math.sin(t * 2 + i)})`; g.fillRect(x, y, 2, 2);
    }
    const vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,10,0.7)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
  }
}
