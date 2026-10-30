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
      const power = this.power ?? 0.5, field = this.fieldLevel ?? 0.62;
      g.fillStyle = `rgba(255,90,60,${0.5 + 0.5 * flash})`; g.font = '800 104px "Segoe UI", Arial, sans-serif'; g.fillText('CONTAINMENT', 40, 190); g.fillText('FIELD FAILING', 40, 296);
      const bar = (label, v, y, hot) => {
        g.fillStyle = dim; g.font = '600 38px "Segoe UI", Arial, sans-serif'; g.fillText(label, 40, y);
        g.strokeStyle = ink; g.lineWidth = 4; g.strokeRect(40, y + 14, W - 80, 62);
        g.fillStyle = hot ? `rgba(255,200,90,${0.7 + 0.3 * flash})` : `rgba(255,90,60,${0.6 + 0.3 * flash})`; g.fillRect(48, y + 22, Math.max(0, (W - 96) * v), 46);
        g.fillStyle = bright; g.textAlign = 'right'; g.font = '800 54px "Segoe UI", Arial, sans-serif'; g.fillText(Math.round(v * 100) + '%', W - 56, y - 2); g.textAlign = 'left';
      };
      bar('SCANNER POWER', power, 400, true);
      bar('FIELD INTEGRITY', field, 560, false);
      g.fillStyle = ink; g.font = '700 44px "Segoe UI", Arial, sans-serif'; g.fillText('TRIAL 27 · ABSORPTION RESPONSE RISING', 40, 744);
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

// ---------------------------------------------------------------- the memory: the home world, the people, the taking
// A short painted sequence (about 12.5 s). It begins by pushing into the planet image from the research display, so the
// player sees that this IS the world on the screen, then shows the specimen's people, a ship arriving, and the beam.
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const sm = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (c1, c2, k) => `rgb(${(lerp(c1[0], c2[0], k)) | 0},${(lerp(c1[1], c2[1], k)) | 0},${(lerp(c1[2], c2[2], k)) | 0})`;

export class MemoryScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.w = canvas.width = 1280;
    this.h = canvas.height = 720;
    this.horizon = 470;
    const R = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    this.R = R;
    this.stars = Array.from({ length: 120 }, (_, i) => ({ x: R(i) * 1280, y: R(i + 200) * 380, s: 0.6 + R(i + 400) * 1.4, p: R(i + 600) * 6 }));
    this.spires = Array.from({ length: 22 }, (_, i) => ({ x: R(i + 50) * 1500 - 100, h: 90 + R(i + 80) * 170, w: 10 + R(i + 110) * 16, layer: i % 3, ph: R(i + 140) * 6 }));
    this.flora = Array.from({ length: 34 }, (_, i) => ({ x: R(i + 300) * 1280, y: 520 + R(i + 330) * 170, h: 14 + R(i + 360) * 34, ph: R(i + 390) * 6, hue: R(i + 420) }));
    // the specimen's people: tall bell-bodied walkers on tentacles. #0 is the viewer's own body.
    this.kin = [
      { x: 520, y: 650, s: 1.5, ph: 0, self: true },
      { x: 700, y: 650, s: 0.95, ph: 1.7, child: true },
      { x: 250, y: 600, s: 1.2, ph: 3.1 },
      { x: 930, y: 590, s: 1.05, ph: 4.2 },
      { x: 1100, y: 545, s: 0.72, ph: 2.2 },
      { x: 90, y: 540, s: 0.7, ph: 5.4 },
    ];
    this.motes = Array.from({ length: 70 }, (_, i) => ({ x: R(i + 700) * 1280, y: R(i + 730) * 720, v: 6 + R(i + 760) * 16, ph: R(i + 790) * 6 }));
  }

  // m = seconds since the memory began
  draw(m) {
    const g = this.g, W = this.w, H = this.h, hz = this.horizon;
    const arrive = sm(5.0, 8.4, m);          // ship arrival 0..1
    const threat = sm(4.6, 9.0, m);          // sky darkening
    const beam = sm(8.5, 9.4, m) * (1 - sm(11.0, 11.8, m));
    const lift = sm(9.2, 11.2, m);           // the viewer's body lifting
    const intro = sm(0.5, 1.8, m);           // landscape fades in from the planet image
    g.clearRect(0, 0, W, H);

    // ---- opening: pushing into the world on the research display ----
    if (intro < 1) {
      g.fillStyle = '#04101a'; g.fillRect(0, 0, W, H);
      const zoom = lerp(1.0, 9.0, sm(0, 1.7, m));
      drawWorld(g, W / 2, H / 2 + 20, 118 * zoom, m);
    }
    g.save();
    g.globalAlpha = intro;

    // ---- sky ----
    const sk = g.createLinearGradient(0, 0, 0, hz);
    sk.addColorStop(0, mix([10, 6, 44], [18, 8, 22], threat));
    sk.addColorStop(0.55, mix([58, 40, 128], [70, 28, 52], threat));
    sk.addColorStop(1, mix([70, 196, 180], [170, 90, 74], threat));
    g.fillStyle = sk; g.fillRect(0, 0, W, hz + 2);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (const s of this.stars) { g.globalAlpha = intro * (0.35 + 0.35 * Math.sin(m * 2 + s.p)) * (1 - threat * 0.5); g.fillRect(s.x, s.y, s.s, s.s); }
    g.globalAlpha = intro;
    // aurora curtains
    for (let k = 0; k < 3; k++) {
      const grad = g.createLinearGradient(0, 60, 0, 330);
      grad.addColorStop(0, 'rgba(120,255,220,0)'); grad.addColorStop(0.5, `rgba(${120 + k * 40},255,${210 - k * 30},${0.16 * (1 - threat)})`); grad.addColorStop(1, 'rgba(120,255,220,0)');
      g.fillStyle = grad; g.beginPath(); g.moveTo(0, 330);
      for (let x = 0; x <= W; x += 40) g.lineTo(x, 130 + k * 55 + Math.sin(x * 0.006 + m * 0.5 + k * 2) * 46);
      g.lineTo(W, 330); g.closePath(); g.fill();
    }
    // the ring: the same sweeping bands seen on the research display
    g.save(); g.translate(W * 0.55, H * 1.45); g.rotate(-0.36);
    for (let k = 0; k < 4; k++) {
      g.strokeStyle = `rgba(${176 + k * 22},${216 - k * 18},${204},${(0.5 - k * 0.09) * (1 - threat * 0.4)})`;
      g.lineWidth = 30 - k * 6;
      g.beginPath(); g.ellipse(0, 0, 1060 + k * 90, 600 + k * 52, 0, Math.PI, Math.PI * 2); g.stroke();
    }
    g.restore();
    // two moons
    const mx = W * 0.78 - m * 5;
    const mg = g.createRadialGradient(mx - 22, 120, 8, mx, 130, 100);
    mg.addColorStop(0, '#fbfbff'); mg.addColorStop(0.7, '#a9b4d8'); mg.addColorStop(1, '#6c779e');
    g.fillStyle = mg; g.beginPath(); g.arc(mx, 130, 96, 0, 7); g.fill();
    g.fillStyle = 'rgba(70,80,120,0.25)'; for (const [dx, dy, r] of [[-30, -10, 18], [24, 24, 12], [8, -42, 9]]) { g.beginPath(); g.arc(mx + dx, 130 + dy, r, 0, 7); g.fill(); }
    g.fillStyle = '#eaa45a'; g.beginPath(); g.arc(mx - 280, 210, 36, 0, 7); g.fill();

    // ---- distant living towers, three parallax layers ----
    for (let layer = 0; layer < 3; layer++) {
      const par = (layer + 1) * 3.5, tint = 0.26 + layer * 0.3;
      for (const s of this.spires) {
        if (s.layer !== layer) continue;
        const x = ((s.x - m * par) % 1500 + 1500) % 1500 - 100;
        const base = hz + 6 + layer * 14, top = s.h * (0.9 + layer * 0.3), sway = Math.sin(m * 0.5 + s.ph) * 6;
        g.fillStyle = `rgb(${8 + layer * 8},${26 + layer * 18},${44 + layer * 20})`;
        g.beginPath(); g.moveTo(x - s.w, base);
        g.bezierCurveTo(x - s.w * 0.3 + sway * 0.3, base - top * 0.45, x - 3 + sway, base - top * 0.82, x + sway, base - top);
        g.bezierCurveTo(x + 4 + sway, base - top * 0.84, x + s.w * 0.3 + sway * 0.3, base - top * 0.45, x + s.w, base);
        g.closePath(); g.fill();
        const tip = g.createRadialGradient(x + sway, base - top, 0, x + sway, base - top, 24 + layer * 8);
        tip.addColorStop(0, `rgba(160,255,230,${0.7 * (1 - threat * 0.7)})`); tip.addColorStop(1, 'rgba(160,255,230,0)');
        g.fillStyle = tip; g.fillRect(x + sway - 40, base - top - 40, 80, 80);
      }
      g.fillStyle = `rgba(30,120,130,${0.05 + tint * 0.1})`; g.fillRect(0, hz - 20, W, 70);
    }

    // ---- ground and the still pool that reflects the sky ----
    const gr = g.createLinearGradient(0, hz, 0, H);
    gr.addColorStop(0, mix([26, 92, 98], [60, 40, 46], threat)); gr.addColorStop(0.18, '#0c2a34'); gr.addColorStop(1, '#050f16');
    g.fillStyle = gr; g.fillRect(0, hz, W, H - hz);
    g.save(); g.beginPath(); g.rect(0, hz + 6, W, 150); g.clip();
    g.globalAlpha = intro * 0.45; g.translate(0, hz * 2 + 6); g.scale(1, -1);          // mirrored sky and ring
    g.fillStyle = sk; g.fillRect(0, 0, W, hz);
    g.restore();
    g.globalAlpha = intro;
    for (let i = 0; i < 18; i++) { // ripples
      const rx = (i * 173 + m * 12) % W, ry = hz + 20 + (i * 53) % 120;
      g.strokeStyle = `rgba(190,255,240,${0.08 + 0.06 * Math.sin(m * 2 + i)})`; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(rx, ry, 30 + (i % 4) * 14, 3 + (i % 3), 0, 0, 7); g.stroke();
    }
    // luminous flora
    for (const f of this.flora) {
      const sw = Math.sin(m * 1.1 + f.ph) * 3;
      g.strokeStyle = `rgba(80,220,200,${0.5 * (1 - threat * 0.5)})`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(f.x, f.y); g.quadraticCurveTo(f.x + sw, f.y - f.h * 0.5, f.x + sw * 1.6, f.y - f.h); g.stroke();
      const col = f.hue < 0.5 ? '170,255,230' : '230,170,255';
      const o = g.createRadialGradient(f.x + sw * 1.6, f.y - f.h, 0, f.x + sw * 1.6, f.y - f.h, 12);
      o.addColorStop(0, `rgba(${col},${0.9 * (0.6 + 0.4 * Math.sin(m * 2 + f.ph)) * (1 - threat * 0.6)})`); o.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = o; g.fillRect(f.x + sw * 1.6 - 14, f.y - f.h - 14, 28, 28);
    }

    // ---- the ship and its beam ----
    const shipX = lerp(W * 1.15, 560, arrive) + Math.sin(m * 0.7) * 6, shipY = lerp(70, 150, arrive);
    if (arrive > 0.01) {
      // beam: a bright cone down to the ground, with rising particles
      if (beam > 0.01) {
        const bw = 150 * beam;
        const bg = g.createLinearGradient(0, shipY + 40, 0, H);
        bg.addColorStop(0, `rgba(235,255,255,${0.9 * beam})`); bg.addColorStop(1, `rgba(150,230,255,${0.45 * beam})`);
        g.fillStyle = bg; g.beginPath(); g.moveTo(shipX - 60, shipY + 36); g.lineTo(shipX + 60, shipY + 36); g.lineTo(520 + bw, H); g.lineTo(520 - bw, H); g.closePath(); g.fill();
        g.fillStyle = `rgba(255,255,255,${0.7 * beam})`;
        for (let i = 0; i < 40; i++) { const px = 520 + Math.sin(i * 12.9 + m) * 90 * beam, py = H - ((i * 53 + m * 160) % (H - shipY - 40)); g.fillRect(px, py, 2, 5); }
      }
      // a thin scanning light before the beam
      const scan = sm(6.2, 7.0, m) * (1 - beam);
      if (scan > 0) { g.fillStyle = `rgba(255,200,170,${0.22 * scan})`; g.beginPath(); g.moveTo(shipX - 20, shipY + 40); g.lineTo(shipX + 20, shipY + 40); g.lineTo(560 + 140 * Math.sin(m * 1.7), hz + 160); g.lineTo(480 + 140 * Math.sin(m * 1.7), hz + 160); g.fill(); }
      drawShip(g, shipX, shipY, m);
    }

    // ---- the people ----
    for (const k of this.kin) {
      let x = k.x, y = k.y, ox = 0, flee = 0;
      const look = k.self ? 0.0 : threat;
      if (!k.self) { flee = sm(6.2 + (k.ph % 1.5) * 0.4, 10, m); ox = (k.x < 640 ? -1 : 1) * flee * 520; }
      const walkSpeed = (1 - threat) * 0.7 + flee * 4;
      const moving = !k.self || m < 4.5;
      const gait = k.self && m >= 4.5 ? 0 : 1;
      x += k.self ? Math.sin(m * 0.4) * 10 + sm(0, 4.6, m) * 30 : Math.sin(m * 0.3 + k.ph) * 20 + ox;
      const liftY = k.self ? lift * 330 : 0;
      drawKin(g, x, y - liftY, k.s, m * walkSpeed * gait + k.ph, { look, core: k.self ? 1 : 0.75, self: k.self, threat: k.self ? lift : 0, fear: flee });
    }

    // ---- drifting spores and haze ----
    for (const s of this.motes) {
      const x = (s.x + m * s.v) % W, y = (s.y - m * s.v * 0.4 + 720 * 4) % 720;
      g.fillStyle = `rgba(190,255,235,${(0.18 + 0.2 * Math.sin(m * 2 + s.ph)) * (1 - threat * 0.7)})`; g.fillRect(x, y, 2, 2);
    }
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,10,0)'); vg.addColorStop(1, 'rgba(0,0,12,0.7)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.restore();

    // ---- white-out into the cell ----
    const white = sm(10.4, 12.0, m);
    if (white > 0) { g.fillStyle = `rgba(240,250,255,${white})`; g.fillRect(0, 0, W, H); }
  }
}

// The ringed world exactly as drawn on the research display, used for the zoom-in.
function drawWorld(g, cx, cy, r, m) {
  g.save();
  const ring = (front) => {
    g.save(); g.translate(cx, cy); g.rotate(-0.38);
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = `rgba(${150 + k * 25},${200 - k * 20},${190 + k * 10},${0.55 - k * 0.12})`; g.lineWidth = r * (0.15 - k * 0.04);
      g.beginPath(); g.ellipse(0, 0, r * (1.7 + k * 0.17), r * (0.42 + k * 0.04), 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); g.stroke();
    }
    g.restore();
  };
  ring(false);
  const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#9fe4d4'); grad.addColorStop(0.55, '#3a8f94'); grad.addColorStop(1, '#0f2f3d');
  g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  ring(true);
  g.restore();
}

function drawShip(g, x, y, m) {
  g.save(); g.translate(x, y);
  const hull = g.createLinearGradient(0, -30, 0, 50);
  hull.addColorStop(0, '#2b323a'); hull.addColorStop(1, '#0e1216');
  g.fillStyle = hull;
  g.beginPath(); g.moveTo(-260, 10); g.lineTo(-170, -26); g.lineTo(-40, -44); g.lineTo(60, -44); g.lineTo(180, -22); g.lineTo(270, 12); g.lineTo(190, 40); g.lineTo(60, 52); g.lineTo(-70, 52); g.lineTo(-190, 38); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(150,165,175,0.55)'; g.lineWidth = 2; g.stroke();
  g.strokeStyle = 'rgba(90,105,115,0.8)'; g.lineWidth = 1.5;
  for (const px of [-120, -40, 40, 120]) { g.beginPath(); g.moveTo(px, -40); g.lineTo(px + 10, 50); g.stroke(); }
  g.fillStyle = '#c9d3d8'; g.font = 'bold 14px Arial, sans-serif'; g.fillText('HALCYON', -70, 16);
  g.fillStyle = 'rgba(210,215,220,0.8)'; g.fillRect(-72, 22, 140, 2);
  // running lights
  for (const [lx, col] of [[-250, '#ff3b2a'], [250, '#ffffff'], [-100, '#ffb040'], [100, '#ffb040']]) {
    const on = 0.5 + 0.5 * Math.sin(m * 6 + lx);
    const gl = g.createRadialGradient(lx, 12, 0, lx, 12, 16); gl.addColorStop(0, col); gl.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.5 + 0.5 * on; g.fillStyle = gl; g.fillRect(lx - 16, -4, 32, 32); g.globalAlpha = 1;
  }
  // emitter ring on the underside
  const em = g.createRadialGradient(0, 52, 0, 0, 52, 70); em.addColorStop(0, 'rgba(200,245,255,0.9)'); em.addColorStop(1, 'rgba(200,245,255,0)');
  g.fillStyle = em; g.fillRect(-70, 36, 140, 60);
  g.restore();
}

// One of the specimen's people: a tall luminous bell on tentacle legs. size s scales a 100 px unit.
function drawKin(g, x, y, s, t, o) {
  const u = s * 56;
  const tilt = -o.look * 0.28 - (o.fear || 0) * 0.0;
  const sc = o.self ? 1 : 0.88;
  g.save();
  // glow
  const halo = g.createRadialGradient(x, y - 2.3 * u, 0, x, y - 2.3 * u, 3.4 * u);
  halo.addColorStop(0, `rgba(140,255,225,${0.28 * o.core * (1 - (o.fear || 0) * 0.4)})`); halo.addColorStop(1, 'rgba(140,255,225,0)');
  g.fillStyle = halo; g.fillRect(x - 3.4 * u, y - 5.7 * u, 6.8 * u, 6.8 * u);
  // legs
  const N = 6;
  for (let i = 0; i < N; i++) {
    const rx = x + (i - (N - 1) / 2) * 0.2 * u;
    const ph = t * 2.4 + i * 1.05;
    const step = Math.sin(ph) * 0.26 * u, up = Math.max(0, Math.cos(ph)) * 0.18 * u;
    const tipX = x + (i - (N - 1) / 2) * 0.46 * u + step, tipY = y - up;
    const midX = (rx + tipX) / 2 + (i - 2.5) * 0.12 * u, midY = y - 1.15 * u;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(40,150,150,0.55)'; g.lineWidth = 0.17 * u;
    g.beginPath(); g.moveTo(rx, y - 1.9 * u); g.quadraticCurveTo(midX, midY, tipX, tipY); g.stroke();
    g.strokeStyle = 'rgba(170,255,235,0.55)'; g.lineWidth = 0.05 * u;
    g.beginPath(); g.moveTo(rx, y - 1.9 * u); g.quadraticCurveTo(midX, midY, tipX, tipY); g.stroke();
  }
  // bell
  g.translate(x, y - 3.0 * u); g.rotate(tilt);
  const bell = g.createRadialGradient(-0.2 * u, -0.5 * u, 0.1 * u, 0, 0, 1.4 * u);
  bell.addColorStop(0, 'rgba(190,255,240,0.85)'); bell.addColorStop(0.55, 'rgba(60,180,175,0.6)'); bell.addColorStop(1, 'rgba(14,70,86,0.8)');
  g.fillStyle = bell;
  g.beginPath(); g.moveTo(-0.85 * u * sc, 1.15 * u);
  g.bezierCurveTo(-1.0 * u * sc, -0.5 * u, -0.5 * u * sc, -1.45 * u, 0, -1.5 * u);
  g.bezierCurveTo(0.5 * u * sc, -1.45 * u, 1.0 * u * sc, -0.5 * u, 0.85 * u * sc, 1.15 * u);
  g.quadraticCurveTo(0, 1.4 * u, -0.85 * u * sc, 1.15 * u); g.fill();
  g.strokeStyle = 'rgba(210,255,245,0.7)'; g.lineWidth = 0.04 * u; g.stroke();
  // inner structures: nucleus and small organs
  const pulse = 0.8 + 0.2 * Math.sin(t * 1.6);
  const nu = g.createRadialGradient(0, 0.1 * u, 0, 0, 0.1 * u, 0.55 * u);
  nu.addColorStop(0, `rgba(230,255,250,${0.95 * o.core * pulse})`); nu.addColorStop(1, 'rgba(90,230,210,0)');
  g.fillStyle = nu; g.beginPath(); g.arc(0, 0.1 * u, 0.55 * u, 0, 7); g.fill();
  g.fillStyle = 'rgba(120,235,215,0.6)';
  for (const [dx, dy, r] of [[-0.45, 0.45, 0.13], [0.42, 0.5, 0.1], [0.05, -0.65, 0.12]]) { g.beginPath(); g.arc(dx * u, dy * u, r * u, 0, 7); g.fill(); }
  // two pale eye-spots, turning toward the sky when afraid
  g.fillStyle = 'rgba(10,50,60,0.75)';
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * 0.3 * u, -0.1 * u - o.look * 0.25 * u, 0.06 * u, 0.1 * u, 0, 0, 7); g.fill(); }
  g.restore();
}
