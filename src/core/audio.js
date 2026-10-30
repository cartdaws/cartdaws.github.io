import { clamp, rand } from './util.js';

// Fully synthesized sound; the context is only created after the player clicks Play.
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.siren = null;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
  suspend() { if (this.ctx) this.ctx.suspend(); }
  resume() { if (this.ctx) this.ctx.resume(); }

  startAmbience() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    g.connect(this.master);
    for (const f of [48, 72.5]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g);
      o.start();
    }
  }

  out(vol, pan) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      p.connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  tone(o, { type = 'sine', f0 = 440, f1 = f0, dur = 0.2, vol = 0.3, attack = 0.004, delay = 0, filter, q = 1 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (filter) {
      const bq = ctx.createBiquadFilter();
      bq.type = filter.type;
      bq.frequency.value = filter.f;
      bq.Q.value = q;
      osc.connect(bq);
      node = bq;
    }
    node.connect(g);
    g.connect(o);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise(o, { dur = 0.2, vol = 0.3, type = 'lowpass', f0 = 1000, f1 = f0, q = 1, delay = 0, attack = 0.003 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bq = ctx.createBiquadFilter();
    bq.type = type;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t);
    bq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bq);
    bq.connect(g);
    g.connect(o);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  play(name, { vol = 1, pan = 0 } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const o = this.out(vol, pan);
    const p = rand(0.94, 1.06);
    switch (name) {
      case 'shot':
        this.tone(o, { type: 'triangle', f0: 2100 * p, f1: 700 * p, dur: 0.11, vol: 0.28 });
        this.tone(o, { type: 'sine', f0: 3400 * p, f1: 2600 * p, dur: 0.16, vol: 0.12, delay: 0.01 });
        this.tone(o, { type: 'sine', f0: 190, f1: 70, dur: 0.12, vol: 0.3 });
        this.noise(o, { dur: 0.035, vol: 0.18, type: 'highpass', f0: 5000 });
        break;
      case 'impact':
        this.noise(o, { dur: 0.09, vol: 0.14, type: 'bandpass', f0: 5200, f1: 2500, q: 2 });
        this.tone(o, { type: 'sine', f0: 2800 * p, f1: 1800, dur: 0.12, vol: 0.07 });
        break;
      case 'hit':
        this.tone(o, { type: 'square', f0: 1500, f1: 1200, dur: 0.045, vol: 0.09 });
        break;
      case 'kill':
        this.tone(o, { type: 'triangle', f0: 1100, f1: 260, dur: 0.24, vol: 0.2 });
        this.tone(o, { type: 'sine', f0: 1700, f1: 2300, dur: 0.18, vol: 0.1, delay: 0.04 });
        break;
      case 'bugWarn':
        this.tone(o, { type: 'sawtooth', f0: 1000, f1: 2100, dur: 0.5, vol: 0.12, filter: { type: 'bandpass', f: 1800 }, q: 3 });
        this.noise(o, { dur: 0.45, vol: 0.06, type: 'bandpass', f0: 3600, q: 4 });
        break;
      case 'bugLunge':
        this.noise(o, { dur: 0.28, vol: 0.28, type: 'bandpass', f0: 600, f1: 2400, q: 1.5 });
        break;
      case 'enemyDie':
        this.noise(o, { dur: 0.4, vol: 0.3, type: 'lowpass', f0: 3000, f1: 200 });
        this.tone(o, { type: 'sawtooth', f0: 380, f1: 50, dur: 0.35, vol: 0.14 });
        break;
      case 'droneCharge':
        this.tone(o, { type: 'sine', f0: 380, f1: 1700, dur: 0.75, vol: 0.14, attack: 0.3 });
        this.tone(o, { type: 'triangle', f0: 190, f1: 850, dur: 0.75, vol: 0.08, attack: 0.3 });
        break;
      case 'droneShot':
        this.tone(o, { type: 'square', f0: 1000, f1: 240, dur: 0.14, vol: 0.12, filter: { type: 'lowpass', f: 2600 } });
        this.noise(o, { dur: 0.05, vol: 0.1, type: 'highpass', f0: 2500 });
        break;
      case 'explosion':
        this.noise(o, { dur: 1.3, vol: 0.9, type: 'lowpass', f0: 1400, f1: 60, attack: 0.005 });
        this.tone(o, { type: 'sine', f0: 90, f1: 28, dur: 0.9, vol: 0.9 });
        this.noise(o, { dur: 0.25, vol: 0.4, type: 'highpass', f0: 2000 });
        break;
      case 'fuse':
        for (let i = 0; i < 4; i++) this.noise(o, { dur: 0.07, vol: 0.13, type: 'bandpass', f0: 3000 + i * 400, q: 3, delay: i * 0.11 });
        this.tone(o, { type: 'square', f0: 900, f1: 900, dur: 0.05, vol: 0.06, delay: 0.1 });
        this.tone(o, { type: 'square', f0: 1200, f1: 1200, dur: 0.05, vol: 0.06, delay: 0.3 });
        break;
      case 'door':
        this.noise(o, { dur: 0.8, vol: 0.4, type: 'lowpass', f0: 380, f1: 120 });
        this.tone(o, { type: 'square', f0: 60, f1: 50, dur: 0.8, vol: 0.12 });
        this.noise(o, { dur: 0.1, vol: 0.5, type: 'lowpass', f0: 900, f1: 300, delay: 0.7 });
        break;
      case 'lockdown':
        for (let i = 0; i < 3; i++) this.tone(o, { type: 'square', f0: 880, f1: 880, dur: 0.18, vol: 0.14, delay: i * 0.26 });
        break;
      case 'unlock':
        this.tone(o, { type: 'sine', f0: 660, f1: 660, dur: 0.15, vol: 0.2 });
        this.tone(o, { type: 'sine', f0: 990, f1: 990, dur: 0.3, vol: 0.2, delay: 0.14 });
        break;
      case 'dash':
        this.noise(o, { dur: 0.22, vol: 0.28, type: 'bandpass', f0: 500, f1: 2800, q: 1 });
        break;
      case 'jump':
        this.tone(o, { type: 'sine', f0: 150, f1: 80, dur: 0.12, vol: 0.2 });
        break;
      case 'land':
        this.tone(o, { type: 'sine', f0: 100, f1: 45, dur: 0.14, vol: 0.28 });
        break;
      case 'vitals': // heart-monitor tick
        this.tone(o, { type: 'sine', f0: 1040, f1: 1040, dur: 0.09, vol: 0.12 });
        break;
      case 'surge': // electrical overload rising
        this.tone(o, { type: 'sawtooth', f0: 70, f1: 640, dur: 2.4, vol: 0.2, attack: 1.2, filter: { type: 'lowpass', f: 1800 } });
        this.noise(o, { dur: 2.4, vol: 0.18, type: 'bandpass', f0: 800, f1: 5200, q: 1.5, attack: 0.6 });
        break;
      case 'alert': // console alarm double beep
        this.tone(o, { type: 'square', f0: 1320, f1: 1320, dur: 0.1, vol: 0.1 });
        this.tone(o, { type: 'square', f0: 1320, f1: 1320, dur: 0.1, vol: 0.1, delay: 0.16 });
        break;
      case 'crack':
        this.noise(o, { dur: 0.12, vol: 0.5, type: 'highpass', f0: 4000, f1: 2200 });
        this.tone(o, { type: 'triangle', f0: 3400, f1: 900, dur: 0.1, vol: 0.12 });
        break;
      case 'shatter':
        this.noise(o, { dur: 0.9, vol: 0.7, type: 'highpass', f0: 2500, f1: 900, attack: 0.002 });
        this.noise(o, { dur: 0.5, vol: 0.4, type: 'bandpass', f0: 5200, q: 2 });
        this.tone(o, { type: 'sine', f0: 140, f1: 50, dur: 0.5, vol: 0.5 });
        break;
      case 'announce': // ship AI chime
        this.tone(o, { type: 'sine', f0: 660, f1: 660, dur: 0.35, vol: 0.14 });
        this.tone(o, { type: 'sine', f0: 880, f1: 880, dur: 0.5, vol: 0.14, delay: 0.22 });
        break;
      case 'step':
        this.noise(o, { dur: 0.06, vol: 0.2, type: 'lowpass', f0: 500, f1: 200 });
        break;
      case 'pa': // intercom / PA: speaker click and a short wash of line noise, no voiced tone
        this.noise(o, { dur: 0.05, vol: 0.5, type: 'highpass', f0: 1500 });
        this.noise(o, { dur: 0.7, vol: 0.07, type: 'bandpass', f0: 1700, q: 1.2, delay: 0.04 });
        break;
      case 'memory': // reversed swell into a soft airy wash
        this.noise(o, { dur: 1.4, vol: 0.28, type: 'bandpass', f0: 300, f1: 6000, q: 0.8, attack: 1.1 });
        this.tone(o, { type: 'sine', f0: 180, f1: 720, dur: 1.4, vol: 0.12, attack: 1.0 });
        break;
      case 'memoryOut':
        this.noise(o, { dur: 0.9, vol: 0.25, type: 'bandpass', f0: 5000, f1: 200, q: 0.8 });
        this.tone(o, { type: 'sine', f0: 600, f1: 90, dur: 0.9, vol: 0.12 });
        break;
      case 'servo': // motor and rail travel
        this.tone(o, { type: 'sawtooth', f0: 70, f1: 150, dur: 2.2, vol: 0.07, attack: 0.5, filter: { type: 'lowpass', f: 600 } });
        this.noise(o, { dur: 2.2, vol: 0.1, type: 'bandpass', f0: 400, f1: 900, q: 2, attack: 0.4 });
        break;
      case 'scan': // examination probe extending
        this.tone(o, { type: 'sine', f0: 320, f1: 1100, dur: 1.4, vol: 0.1, attack: 0.5 });
        this.noise(o, { dur: 1.4, vol: 0.08, type: 'bandpass', f0: 2000, f1: 6000, q: 3, attack: 0.5 });
        break;
      case 'spark':
        this.noise(o, { dur: 0.35, vol: 0.6, type: 'highpass', f0: 3000, f1: 1200, attack: 0.001 });
        for (let i = 0; i < 4; i++) this.noise(o, { dur: 0.04, vol: 0.3, type: 'highpass', f0: 4000, delay: 0.05 + i * 0.06 });
        break;
      case 'powerdown':
        this.tone(o, { type: 'sine', f0: 420, f1: 38, dur: 1.5, vol: 0.28 });
        this.tone(o, { type: 'sawtooth', f0: 220, f1: 30, dur: 1.2, vol: 0.12, filter: { type: 'lowpass', f: 500 } });
        this.noise(o, { dur: 1.0, vol: 0.15, type: 'lowpass', f0: 900, f1: 60 });
        break;
      case 'groan': // stressed metal
        this.tone(o, { type: 'sawtooth', f0: 90, f1: 62, dur: 1.2, vol: 0.14, attack: 0.3, filter: { type: 'lowpass', f: 400 }, q: 6 });
        this.noise(o, { dur: 1.2, vol: 0.12, type: 'bandpass', f0: 250, f1: 150, q: 5, attack: 0.3 });
        break;
      case 'clatter':
        this.tone(o, { type: 'triangle', f0: 2600, f1: 1500, dur: 0.1, vol: 0.12 });
        this.tone(o, { type: 'triangle', f0: 1900, f1: 1100, dur: 0.12, vol: 0.1, delay: 0.17 });
        this.noise(o, { dur: 0.06, vol: 0.3, type: 'highpass', f0: 3000, delay: 0.17 });
        this.noise(o, { dur: 0.05, vol: 0.2, type: 'highpass', f0: 3000, delay: 0.32 });
        break;
      case 'swallow': // wet pull as gel draws something in
        this.tone(o, { type: 'sine', f0: 210, f1: 70, dur: 0.28, vol: 0.32, filter: { type: 'lowpass', f: 500 } });
        this.noise(o, { dur: 0.22, vol: 0.14, type: 'bandpass', f0: 500, f1: 200, q: 3 });
        break;
      case 'heartbeat':
        this.tone(o, { type: 'sine', f0: 70, f1: 38, dur: 0.16, vol: 0.9 });
        this.tone(o, { type: 'sine', f0: 62, f1: 34, dur: 0.18, vol: 0.7, delay: 0.2 });
        break;
      case 'hurt':
        this.tone(o, { type: 'sawtooth', f0: 220, f1: 60, dur: 0.28, vol: 0.2, filter: { type: 'lowpass', f: 900 } });
        this.noise(o, { dur: 0.15, vol: 0.2, type: 'lowpass', f0: 800 });
        break;
      case 'death':
        this.tone(o, { type: 'sawtooth', f0: 300, f1: 30, dur: 1.2, vol: 0.2, filter: { type: 'lowpass', f: 700 } });
        break;
      case 'gel':
        this.noise(o, { dur: 0.6, vol: 0.2, type: 'bandpass', f0: 250, f1: 900, q: 2 });
        this.tone(o, { type: 'sine', f0: 120, f1: 220, dur: 0.6, vol: 0.2 });
        break;
      case 'absorb':
        this.tone(o, { type: 'sine', f0: 300, f1: 1400, dur: 1.2, vol: 0.14, attack: 0.5 });
        this.noise(o, { dur: 1.2, vol: 0.12, type: 'bandpass', f0: 4000, f1: 800, q: 3 });
        break;
      case 'crystal':
        [0, 4, 7, 12].forEach((s, i) => {
          const f = 523 * Math.pow(2, s / 12);
          this.tone(o, { type: 'sine', f0: f, f1: f, dur: 0.6, vol: 0.12, delay: i * 0.1 });
        });
        break;
    }
  }

  startSiren() {
    if (!this.ctx || this.siren) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 620;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.6;
    const lg = ctx.createGain();
    lg.gain.value = 220;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.linearRampToValueAtTime(0.085, ctx.currentTime + 0.1);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(); lfo.start();
    this.siren = { o, lfo, g };
  }

  stopSiren() {
    if (!this.siren) return;
    const { o, lfo, g } = this.siren;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.4);
    o.stop(t + 0.5); lfo.stop(t + 0.5);
    this.siren = null;
  }
}
