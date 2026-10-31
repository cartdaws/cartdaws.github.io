import * as THREE from 'three';

// The creature's palette as the world's palette. The homeworld, the memory screen, the soft light the creature gives off and the HUD all take
// their colour from the chosen design: the world's hues are rotated from the original teal to the creature's own hue, keeping every
// light/dark relationship the art was balanced with.
const REF_HUE = 172;                       // the hue the homeworld was painted in
const _c = new THREE.Color(), _h = { h: 0, s: 0, l: 0 };

// the creature's dominant hue: its skin colour, or its accent when the skin is near-black or grey
export function worldHue(def) {
  for (const hex of [def.skin.primary, def.skin.secondary, def.skin.glow]) {
    _c.set(hex).getHSL(_h);
    if (_h.s > 0.22 && _h.l > 0.06) return _h.h * 360;
  }
  return REF_HUE;
}

export function makeShifter(def) {
  const delta = (worldHue(def) - REF_HUE) / 360;
  const shiftColor = (c) => { c.getHSL(_h); c.setHSL(((_h.h + delta) % 1 + 1) % 1, _h.s, _h.l); return c; };
  const hex = (n) => shiftColor(new THREE.Color(n)).getHex();
  // 'rgba(r,g,b,a)' and '#rrggbb' strings, as used by the canvas painters
  const css = (str) => {
    if (typeof str !== 'string') return str;
    if (str[0] === '#' && (str.length === 7 || str.length === 4)) return '#' + shiftColor(new THREE.Color(str)).getHexString();
    return str.replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g, (m, r, g, b, a) => {
      const c = shiftColor(_c.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace));
      const o = c.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
      return `rgba(${Math.round(o.r * 255)},${Math.round(o.g * 255)},${Math.round(o.b * 255)},${a ?? 1})`;
    });
  };
  // wrap a 2D canvas context so every colour painted through it is rotated
  const ctx = (g) => new Proxy(g, {
    get(t, p) {
      const v = t[p];
      if (p === 'createLinearGradient' || p === 'createRadialGradient') {
        return (...a) => { const gr = t[p](...a), add = gr.addColorStop.bind(gr); gr.addColorStop = (o, col) => add(o, css(col)); return gr; };
      }
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set(t, p, v) { t[p] = (p === 'fillStyle' || p === 'strokeStyle' || p === 'shadowColor') && typeof v === 'string' ? css(v) : v; return true; },
  });
  return { hex, css, ctx, delta };
}

// colours the interface borrows from the creature
export function uiColors(def) {
  const g = new THREE.Color(def.skin.glow), m = new THREE.Color(def.skin.marking), p = new THREE.Color(def.skin.secondary);
  return { acc: '#' + g.clone().lerp(new THREE.Color(0xffffff), 0.25).getHexString(), accLight: '#' + m.clone().lerp(new THREE.Color(0xffffff), 0.35).getHexString(),
    accDark: '#' + p.clone().multiplyScalar(0.7).getHexString(), accMid: '#' + g.clone().lerp(new THREE.Color(0x6a8fa0), 0.55).getHexString() };
}
