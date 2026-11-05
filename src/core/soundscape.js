// What a place sounds like when nothing is happening. Every scene has a bed (wind, machinery, a low pad) and small things that happen on their own
// (creatures calling, the hull creaking). A short melody, the valley's theme, comes back through the game; combat adds a pulse underneath.
// Everything is synthesized. Beds crossfade, so moving between places never cuts.

const N = { D3: 146.83, F3: 174.61, G3: 196, A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, C5: 523.25, D5: 587.33 };
const THEME = [N.D4, N.A4, N.G4, N.F4, N.D4, N.C4, N.D4];     // the valley's song. It is heard whole only while there is a valley.
const r = (a, b) => a + Math.random() * (b - a);

const SCENES = {
  home: { noise: [['lowpass', 480, 0.7, 0.05, 0.09, 240]], drone: [[73.4, 'sine', 0.022], [110, 'sine', 0.016], [146.8, 'triangle', 0.006]], every: [1.6, 4], theme: [9, 15, 1, 0.9] },
  attack: { noise: [['lowpass', 130, 0.8, 0.24, 0.3, 40]], drone: [[46, 'sawtooth', 0.03, 240], [46.7, 'sawtooth', 0.03, 240], [92.5, 'sine', 0.03], [659, 'sine', 0.005], [698.5, 'sine', 0.005]], every: [2, 4] },
  ruin: { noise: [['lowpass', 360, 0.7, 0.07, 0.07, 170], ['bandpass', 1900, 1.4, 0.006, 0.5, 700]], drone: [[55, 'sine', 0.03], [82.4, 'sine', 0.014]], every: [0.5, 1.6], theme: [12, 18, 0.5, 1.5] },
  space: { noise: [['lowpass', 200, 0.5, 0.025, 0.05, 80]], drone: [[38, 'sine', 0.04], [55, 'sine', 0.012], [82.4, 'sine', 0.009], [164.8, 'triangle', 0.003]], every: [6, 13], theme: [18, 26, 0.5, 1.3] },
  desert: { noise: [['bandpass', 720, 0.5, 0.075, 0.13, 330], ['highpass', 3400, 0.3, 0.006, 0.3, 700]], drone: [[61.7, 'sine', 0.02], [92.5, 'sine', 0.012]], every: [2.5, 6], theme: [16, 24, 0.75, 1.1] },
  ice: { noise: [['bandpass', 1300, 0.7, 0.05, 0.2, 800], ['lowpass', 240, 0.6, 0.06, 0.08, 90]], drone: [[73.4, 'sine', 0.014], [220, 'sine', 0.003], [329.6, 'sine', 0.002]], every: [3, 8], theme: [18, 26, 1.5, 1.2] },
  reef: { noise: [['lowpass', 520, 0.5, 0.05, 0.05, 200]], drone: [[82.4, 'sine', 0.016], [123.5, 'sine', 0.012], [164.8, 'triangle', 0.005], [493.9, 'sine', 0.0025]], every: [1.6, 4], theme: [9, 14, 2, 1.0] },
  ship: { noise: [['bandpass', 420, 0.6, 0.04, 0.11, 150], ['highpass', 3800, 0.4, 0.002, 0.2, 500]], drone: [[60, 'sine', 0.022], [120, 'sine', 0.008], [180, 'triangle', 0.002]], every: [2.5, 7] },
  ending: { noise: [['lowpass', 300, 0.6, 0.03, 0.06, 90]], drone: [[55, 'sine', 0.03], [82.4, 'sine', 0.018], [110, 'sine', 0.012]], every: [99, 99], theme: [0.5, 6, 0.5, 1.25] },
};

export class Soundscape {
  constructor(audio) {
    this.a = audio;
    const ctx = audio.ctx;
    this.verb = ctx.createConvolver();
    { // a large metal room: decaying noise
      const len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      this.verb.buffer = ir;
    }
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.6;
    this.verb.connect(this.verbGain); this.verbGain.connect(audio.master);
    this.current = null; this.name = null; this.nextEvent = 2; this.nextTheme = 3; this.themeI = -1; this.themeT = 0;
    this.combat = 0; this.combatWant = 0; this.seqT = 0; this.step = 0; this.bar = 0;
  }

  // an output for one short sound: dry, and into the room
  send(vol, pan = 0, wet = 0.5) {
    const ctx = this.a.ctx, g = ctx.createGain(); g.gain.value = vol;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.a.master); p.connect(this.wetIn(wet)); } else { g.connect(this.a.master); g.connect(this.wetIn(wet)); }
    return g;
  }
  wetIn(amount) { const w = this.a.ctx.createGain(); w.gain.value = amount; w.connect(this.verb); return w; }

  setScene(name) {
    if (name === this.name || !SCENES[name]) return;
    this.name = name;
    const ctx = this.a.ctx, t = ctx.currentTime, S = SCENES[name];
    if (this.current) { const old = this.current; old.gain.gain.cancelScheduledValues(t); old.gain.gain.setValueAtTime(old.gain.gain.value, t); old.gain.gain.linearRampToValueAtTime(0.0001, t + 2.4); setTimeout(() => { for (const n of old.nodes) { try { n.stop(); } catch (e) { /* done */ } } old.gain.disconnect(); }, 2800); }
    const gain = ctx.createGain(); gain.gain.value = 0.0001; gain.gain.linearRampToValueAtTime(1.7, t + 2.2); gain.connect(this.a.master);
    const nodes = [];
    for (const [type, f, q, vol, lfoRate, lfoDepth] of S.noise) {
      const src = ctx.createBufferSource(); src.buffer = this.a.noiseBuf; src.loop = true; src.playbackRate.value = r(0.92, 1.08);
      const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const lfo = ctx.createOscillator(); lfo.frequency.value = lfoRate; const lg = ctx.createGain(); lg.gain.value = lfoDepth; lfo.connect(lg); lg.connect(flt.frequency);
      const g = ctx.createGain(); g.gain.value = vol; src.connect(flt); flt.connect(g); g.connect(gain); src.start(); lfo.start(); nodes.push(src, lfo);
    }
    for (const [f, type, vol, lp] of S.drone) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = r(-5, 5);
      const g = ctx.createGain(); g.gain.value = vol;
      const trem = ctx.createOscillator(); trem.frequency.value = r(0.06, 0.2); const tg = ctx.createGain(); tg.gain.value = vol * 0.35; trem.connect(tg); tg.connect(g.gain);
      if (lp) { const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = lp; o.connect(flt); flt.connect(g); } else o.connect(g);
      g.connect(gain); o.start(); trem.start(); nodes.push(o, trem);
    }
    this.current = { gain, nodes };
    this.nextEvent = r(S.every[0], S.every[1]);
    this.themeI = -1; this.nextTheme = S.theme ? r(S.theme[0] * 0.3, S.theme[1] * 0.4) : Infinity;
  }

  setCombat(on) { this.combatWant = on ? 1 : 0; if (on && this.combat < 0.01) { this.step = 0; this.bar = 0; this.seqT = 0; } }

  update(dt) {
    const ctx = this.a.ctx; if (!ctx || !this.name) return;
    const S = SCENES[this.name];
    this.nextEvent -= dt;
    if (this.nextEvent <= 0) { this.nextEvent = r(S.every[0], S.every[1]); this.event(this.name); }
    this.nextTheme -= dt;
    if (S.theme && this.nextTheme <= 0) { this.themeI = 0; this.themeT = 0; this.nextTheme = r(S.theme[0], S.theme[1]) + THEME.length * 1.1 * S.theme[3]; }
    if (S.theme && this.themeI >= 0) {
      this.themeT -= dt;
      if (this.themeT <= 0) {
        const f = THEME[this.themeI] * S.theme[2], tail = this.themeI === THEME.length - 1;
        const pan = r(-0.25, 0.25);
        this.a.tone(this.send(0.06, pan, 0.9), { type: 'sine', f0: f, dur: tail ? 3 : 2, vol: 0.5, attack: 0.012 });
        this.a.tone(this.send(0.02, pan, 0.9), { type: 'triangle', f0: f * 2, dur: 0.5, vol: 0.5, attack: 0.006 });
        this.themeI = tail ? -1 : this.themeI + 1;
        this.themeT = (this.themeI === 3 ? 1.5 : 0.95) * S.theme[3];
      }
    }
    // the fight's pulse
    this.combat += (this.combatWant - this.combat) * Math.min(1, dt * (this.combatWant ? 1.6 : 0.9));
    if (this.combat > 0.02) {
      const stepDur = 60 / 118 / 4, now = ctx.currentTime;
      this.seqT -= dt;
      while (this.seqT <= 0) { this.seqT += stepDur; this.pulseStep(now, this.combat); }
    }
  }

  pulseStep(now, k) {
    const A = this.a, s = this.step, root = this.bar % 4 === 3 ? 58.27 : 55;
    if (s === 0 || s === 8) A.tone(this.send(0.2 * k, 0, 0.1), { type: 'sine', f0: 140, f1: 44, dur: 0.16, vol: 1, attack: 0.002 });
    if ([0, 3, 6, 8, 11, 14].includes(s)) { A.tone(this.send(0.085 * k, 0, 0.1), { type: 'sawtooth', f0: root, dur: 0.11, vol: 1, attack: 0.004 }); A.tone(this.send(0.05 * k, 0, 0), { type: 'sine', f0: root, dur: 0.13, vol: 1, attack: 0.004 }); }
    if (s % 4 === 2) A.noise(this.send(0.04 * k, r(-0.2, 0.2), 0.2), { dur: 0.03, vol: 1, type: 'highpass', f0: 6500 });
    if (s === 4 || s === 12) A.noise(this.send(0.055 * k, 0, 0.5), { dur: 0.07, vol: 1, type: 'bandpass', f0: 1700, q: 0.8 });
    if (s === 0 && this.bar % 2 === 0) for (const f of [N.A3, N.C4, N.E4]) A.tone(this.send(0.012 * k, r(-0.4, 0.4), 0.9), { type: 'triangle', f0: f * (this.bar % 4 === 2 ? 0.94387 : 1), dur: 1.4, vol: 1, attack: 0.09 });
    this.step = (s + 1) % 16; if (this.step === 0) this.bar++;
  }

  event(name) {
    const A = this.a, pan = r(-0.8, 0.8);
    if (name === 'home') {
      const kind = Math.random();
      if (kind < 0.5) { const f = r(1200, 2400), n = 2 + Math.floor(r(0, 3)); for (let i = 0; i < n; i++) A.tone(this.send(0.012, pan, 1), { type: 'sine', f0: f, f1: f * r(1.15, 1.5), dur: 0.09, vol: 1, delay: i * 0.13, attack: 0.008 }); }
      else if (kind < 0.8) { const f = r(150, 260); A.tone(this.send(0.018, pan, 1), { type: 'triangle', f0: f, f1: f * r(1.3, 1.8), dur: 0.7, vol: 1, attack: 0.12 }); }
      else for (let i = 0; i < 14; i++) A.tone(this.send(0.004, pan, 0.7), { type: 'sine', f0: 3900, dur: 0.018, vol: 1, delay: i * 0.042, attack: 0.002 });
    } else if (name === 'attack') {
      A.noise(this.send(0.16, pan, 0.9), { dur: 1.1, vol: 1, type: 'lowpass', f0: 180, f1: 50 });
    } else if (name === 'ruin') {
      if (Math.random() < 0.82) A.noise(this.send(0.03, pan, 0.2), { dur: 0.03, vol: 1, type: 'highpass', f0: r(1800, 4500) });
      else A.noise(this.send(0.1, pan, 1), { dur: 1.6, vol: 1, type: 'lowpass', f0: 150, f1: 40 });       // another valley, far off
    } else if (name === 'desert' || name === 'reef') {
      const f = r(name === 'reef' ? 500 : 180, name === 'reef' ? 1100 : 340); A.tone(this.send(0.012, pan, 1), { type: 'sine', f0: f, f1: f * r(0.7, 1.5), dur: r(0.5, 1.1), vol: 1, attack: 0.15 });
    } else if (name === 'ice') {
      A.noise(this.send(0.03, pan, 1), { dur: 0.05, vol: 1, type: 'bandpass', f0: r(1800, 3600), q: 3 }); A.tone(this.send(0.008, pan, 1), { type: 'triangle', f0: r(120, 240), dur: 0.2, vol: 1 });
    } else if (name === 'space') {
      A.tone(this.send(0.006, pan, 1), { type: 'sine', f0: 880, f1: 660, dur: 0.14, vol: 1, attack: 0.01 });
    } else if (name === 'ship') {
      const kind = Math.random();
      if (kind < 0.35) A.tone(this.send(0.02, pan, 0.8), { type: 'sawtooth', f0: r(60, 92), f1: r(44, 60), dur: r(0.4, 0.9), vol: 1, attack: 0.1 });              // the hull working
      else if (kind < 0.65) { const f = r(300, 620); A.noise(this.send(0.03, pan, 1), { dur: 0.05, vol: 1, type: 'bandpass', f0: f * 3, q: 2 }); A.tone(this.send(0.012, pan, 1), { type: 'triangle', f0: f, f1: f * 0.92, dur: 0.3, vol: 1, attack: 0.002 }); }    // something dropped, decks away
      else if (kind < 0.85) for (let i = 0; i < 3; i++) A.tone(this.send(0.006, pan, 0.8), { type: 'square', f0: r(900, 1600), dur: 0.03, vol: 1, delay: i * 0.1, attack: 0.002 });       // relays
      else A.noise(this.send(0.07, pan, 1), { dur: 1.3, vol: 1, type: 'lowpass', f0: 110, f1: 40 });
    }
  }
}
