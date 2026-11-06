import * as THREE from 'three';
import { addSign } from '../world/signs.js';

// THE CAMPAIGN. The one place that knows where the journey has got to. Every system reports what happened here, and this decides what follows from it: what the tracker says,
// how the ship reacts, what your body has become. It holds no mechanics of its own. See STORY.md.
const KEY = 'intruderv2-campaign';
const fresh = () => ({ beat: 'valley', absorbed: { android: 0, bug: 0, drone: 0 }, total: 0, voices: [], worlds: {}, alert: 0, chart: false, crossed: false });

// the two lines of the tracker: why you are doing all this, and what is next
const GOALS = {
  valley: '',
  chase: 'GET THE ELDER BACK',
  trial: 'GET OUT. GET HOME.',
  deck: 'ESCAPE THE HALCYON. GET HOME.',
  chart: 'TAKE A SHIP. GET HOME.',
  home: 'GET HOME',
  road: 'CROSS TO EARTH. FIND OUR PEOPLE.',
  crossing: 'CROSS TO EARTH. FIND OUR PEOPLE.',
  crossed: 'FIND OUR PEOPLE. TAKE EARTH.',
};

// What the crossing to Earth needs, and which world has it. All four are worn or carried, so a ship keeps them.
export const PARTS = { vael: 'FUEL', ochre: 'PLATING', skarn: 'COOLANT', thule: 'HEADING' };

// The seven who went before you. Each one left something a machine kept in a jar: touch it and you keep them too.
export const VOICES = [
  'One. I went first. I told them nothing, so they took the arm instead and kept it here. Take it back.',
  'Two. They fed me a rifle for nine days to see what I would become. I became a rifle. Then they stopped asking.',
  'Three. They divided me to see if the parts remember. We do. I am in four jars. Do not stop for the others.',
  'Four. We sang through the hull. They sent someone to check the pumps.',
  'Five. They sent me to Vael to dig. A body that learns any tool does not need paying.',
  'Six. I got as far as the ice. The Grolm fed me until the machines came. Tell them I did not talk.',
  'Seven. I fell. Everything that falls through these clouds, they keep. I was kept gently. It was more than I expected.',
];
// the numbers: which voices live on the ship (the first is the Bay Three cache) and which on other worlds
export const SHIP_VOICES = [1, 2, 3];
export const WORLD_VOICE = { vael: 4, skarn: 5, thule: 6 };

// the crew's own paperwork, on the walls of the deck. What happened here, in the words of the people who did it.
const LOGS = [
  ['TRIAL 03  ·  SPECIMEN 01', 'REFUSED ALL STIMULI. ARM REMOVED FOR STUDY.'],
  ['SECURITY STANDING ORDER', 'SPECIMEN OUT OF CELL: TAKE ALIVE IF POSSIBLE.'],
  ['TRIAL 09  ·  SPECIMEN 02', 'ABSORBED SERVICE RIFLE. RETAINED IT AFTER NINE DAYS.'],
  ['NOTICE TO ALL CREW', 'DO NOT LET THEM TOUCH EACH OTHER. HOLD SEPARATELY.'],
  ['TRIAL 14  ·  SPECIMEN 03', 'DIVIDED FOR STORAGE. SAMPLES STILL RESPOND TO TOUCH.'],
  ['HULL NOISE  ·  TICKET 211', 'PUMPS CHECKED. NOT THE PUMPS. NOISE FOLLOWS SPECIMENS.'],
  ['SPECIMEN 05  ·  TRANSFER', 'TO VAEL MINING POST. LABOUR TRIAL. NO WAGES.'],
  ['SPECIMEN 06  ·  INCIDENT', 'LOST AT SKARN WITH TWO UNITS. COST WRITTEN OFF.'],
  ['TRIAL 26  ·  SPECIMEN 09', 'FED UNDER SEDATION. HIGHEST ABSORPTION ON RECORD.'],
  ['CREW TRANSFER COMPLETE', 'HALCYON HAS THE SHIP. ALL UNITS ON STANDBY.'],
];

const smearTexture = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
    x.globalCompositeOperation = 'lighter';
    const dot = (px, py, r, a) => { const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(120,255,225,${a})`); g.addColorStop(1, 'rgba(120,255,225,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); };
    dot(92, 118, 34, 0.85);
    for (let k = 0; k < 8; k++) { const a = -2.5 + k * 0.62; dot(92 + Math.cos(a) * 52, 118 + Math.sin(a) * 50, 9, 0.65); }      // one soft palm, eight arm-tips
    for (let i = 0; i < 80; i++) { const k = i / 80; dot(112 + k * 136, 118 + Math.sin(k * 5) * 12 + k * 46, 18 * (1 - k * 0.8), 0.12 * (1 - k)); }  // dragged along the wall by something being carried
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
})();

// A jar on a stand, a dark curled piece of someone in it, softly lit. Same in every location.
function makeJar(parent, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.72, 14), new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.6, metalness: 0.5 })); base.position.y = 0.36;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.07, 14), base.material); cap.position.y = 1.24;
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 12 }, (_, i) => { const a = i * 0.95, r = 0.1 - i * 0.004; return new THREE.Vector3(Math.cos(a) * r, 0.78 + i * 0.03, Math.sin(a) * r); }));
  const flesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 44, 0.032, 8), new THREE.MeshStandardMaterial({ color: 0x10202c, roughness: 0.35, emissive: 0x0a3a38, emissiveIntensity: 0.9 }));
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0x7ff0e0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })); glass.position.y = 0.97; glass.material.userData.noSnap = true;
  const light = new THREE.PointLight(0x7ff0e0, 3.4, 5.5, 2); light.position.y = 1.0;
  g.add(base, cap, flesh, glass, light);
  parent.add(g);
  g.userData.light = light; g.userData.flesh = flesh;
  return g;
}

export class Campaign {
  constructor(game) {
    this.g = game; this.s = this.load(); this.touchables = []; this.heldBy = null; this.h = 0; this.f = {};
  }
  load() {
    try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.absorbed) return { ...fresh(), ...o }; } catch (e) { /* first run */ }
    const n = fresh();
    try { Object.assign(n.worlds, JSON.parse(localStorage.getItem('intruderv2-worlds') || '{}')); } catch (e) { /* none */ }      // a save from before the campaign existed keeps what it did
    return n;
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch (e) { /* storage is optional */ } }

  // New Game: nobody remembers anything, including your body
  reset() {
    this.s = fresh(); this.save(); this.f = {};
    try { localStorage.removeItem('intruderv2-armor'); localStorage.removeItem('intruderv2-worlds'); } catch (e) { /* optional */ }
    const g = this.g; g.viewmodel.setMachine(0); g.flight.armor = 1;
  }

  get beat() { return this.s.beat; }
  setBeat(b) { this.s.beat = b; this.save(); this.refresh(); }
  refresh() { this.g.ui.setGoal(GOALS[this.s.beat] || ''); this.g.viewmodel.setMachine(Math.min(1, this.s.total / 14)); }

  // ---- what the tracker says while you are in space and on the worlds
  missing() { return Object.keys(PARTS).filter((id) => !this.s.worlds[id]); }
  roadObjective() {
    const s = this.s;
    if (s.crossed) return 'EXPLORE  ·  THE ROAD IS BEHIND YOU';
    if (s.beat === 'home') return 'LAND ON HOME';
    if (s.beat === 'crossing') return 'FLY TO THE CROSSING POINT';
    const left = this.missing();
    return 'THE CROSSING NEEDS  ' + left.map((id) => PARTS[id] + ' (' + id.toUpperCase() + ')').join('  ·  ');
  }
  // where the ship should be pointing: a world id, 'crossing', or null for the Halcyon
  flightTarget() {
    const s = this.s, F = this.g.flight;
    if (!F.free) return null;
    if (s.crossed) return 'none';
    if (s.beat === 'home') return 'ash';
    if (s.beat === 'crossing') return 'crossing';
    const left = this.missing(); if (!left.length) return 'crossing';
    let best = left[0], bd = 1e12;
    for (const id of left) { const w = F.worlds.find((o) => o.id === id), d = F.pos.distanceTo(w.pos); if (d < bd) { bd = d; best = id; } }
    return best;
  }

  // A world has given what it had. Everything that follows from that is here, so no world has to know about any other.
  worldDone(id) {
    const g = this.g, s = this.s;
    s.worlds[id] = 1; this.save();
    if (id === 'ash' && (s.beat === 'home')) s.beat = 'road';
    if (s.beat === 'road' && !this.missing().length && s.worlds.ash) { s.beat = 'crossing'; g.ui.subtitle('Fuel, plating, coolant, heading. The crossing is possible. Point me at it.', 'LANDER', 4.4); }
    this.save(); this.refresh();
    return this.roadObjective();
  }

  // ---- the alert level: how hard the ship is looking for you
  raiseAlert(n) {
    const s = this.s, g = this.g; if (n <= s.alert) return;
    s.alert = n; this.save();
    this.applyAlert();
  }
  // Reading the charts is what brings the whole ship down on you: the power goes to security, what is left of the deck turns red, and the last fight is worse.
  applyAlert() {
    const g = this.g, run = g.run; if (!run || this.s.alert < 2 || run.alertApplied) return;
    run.alertApplied = true;
    const col = new THREE.Color(0xff5a3a);
    for (const l of run.lights) { if (l.intensity <= 0) continue; l.color.lerp(col, 0.72); l.intensity *= 0.72; }
    const fin = run.rooms.find((r) => r.kind === 'finale');
    if (fin && fin.waves.length && !fin.cleared) fin.waves.push(fin.waves[0].slice(0, 2));
  }

  // ---- what absorbing does. Your body heals on it, hardens on it, and slowly stops being only yours.
  onAbsorb(e) {
    const g = this.g, s = this.s, ui = g.ui;
    const kind = e.kind === 'bug' || e.kind === 'drone' ? e.kind : 'android';
    const first = !s.absorbed[kind];
    s.absorbed[kind]++; s.total++; this.save();
    g.viewmodel.setMachine(Math.min(1, s.total / 14));
    const reply = (t) => { this.f.reply = t; this.f.replyT = 5.2; };     // after the machine's own memory has played
    if (first && kind === 'android') reply(['You are eating my security staff. I will note the rate.', 'HALCYON']);
    else if (first && kind === 'bug') reply(['That unit cost less than your meal. Continue.', 'HALCYON']);
    else if (first && kind === 'drone') reply(['Interesting. Then this is trial twenty-eight.', 'HALCYON']);
    else if (s.total === 5) reply(['Command wanted to know how much you could keep. So do I.', 'HALCYON']);
    else if (s.total === 7) reply(['Less of me than there was. Enough.', '']);
    else if (s.total === 14) reply(['I cannot feel where I stop and they start. Good.', '']);
  }

  // ---- things you touch to keep: voices in jars, the chart. One rule, one button, in every place.
  addTouch(t) { this.touchables.push({ r: 2.3, time: 0.8, on: () => true, ...t }); return t; }
  removeTouch(tag) { this.touchables = this.touchables.filter((t) => t.tag !== tag); }

  addVoiceAt(parent, n, x, y, z, tag) {
    if (this.s.voices.includes(n)) return null;
    const jar = makeJar(parent, x, y, z);
    this.addTouch({ tag, jar, x, y: y + 0.8, z, label: 'TOUCH', prompt: 'TOUCH WHAT THEY KEPT', fn: () => { this.takeVoice(n); jar.userData.light.intensity = 0.6; jar.userData.flesh.visible = false; } });
    return jar;
  }
  takeVoice(n) {
    const g = this.g, s = this.s, p = g.player;
    if (s.voices.includes(n)) return;
    s.voices.push(n); this.save();
    g.ui.subtitle(VOICES[n], 'SPECIMEN', 5.6);
    g.audio.play('crystal', { vol: 0.45 }); g.audio.play('heartbeat', { vol: 0.35 }); g.viewmodel.pulseGlow(1);
    g.progressAdd(5); p.health = Math.min(p.maxHealth, p.health + 25); g.ui.setHealth(p.health, p.maxHealth);
    g.ui.rewardNote(`KEPT  ·  ${s.voices.length} OF 7 VOICES  ·  VITALITY +5`);
  }

  update(dt) {
    const g = this.g, p = g.player, ui = g.ui;
    if (this.f.replyT > 0) { this.f.replyT -= dt; if (this.f.replyT <= 0 && ui.subT <= 0.3) { const [t, who] = this.f.reply; ui.subtitle(t, who, 3.4, !who); if (who) g.audio.play('pa', { vol: 0.5 }); } }
    this.updateTrail();
    if (this.holo && g.camera) this.holo.rotation.y = Math.atan2(g.camera.position.x - this.holo.position.x, g.camera.position.z - this.holo.position.z);
    if (g.state !== 'playing' || p.dead || (g.opening.active && g.opening.phase !== 'route') || g.absorber.busy) { if (this.heldBy) this.release(); return; }
    let best = null, bd = 1e9;
    for (const t of this.touchables) { if (!t.on() || t.used) continue; const d = Math.hypot(p.pos.x - t.x, p.pos.y + 1.4 - t.y, p.pos.z - t.z); if (d < t.r && d < bd) { best = t; bd = d; } }
    if (!best) { if (this.heldBy) this.release(); return; }
    if (this.heldBy !== best) { this.heldBy = best; this.h = 0; }
    g.storyAct = best.label; ui.setPrompt((g.touchMode ? 'HOLD THE BUTTON  ·  ' : 'HOLD RIGHT CLICK  ·  ') + best.prompt);
    this.h = Math.min(1, Math.max(0, this.h + (g.input.interactDown() ? dt / best.time : -dt * 1.5))); ui.setHold(this.h);
    g.opening.reachAt(new THREE.Vector3(best.x, best.y, best.z), 0.42 * this.h);
    if (this.h >= 1) { best.used = true; this.release(); g.viewmodel.reachW = 0; best.fn(); }
  }
  release() { const g = this.g; this.heldBy = null; this.h = 0; g.storyAct = null; g.ui.setPrompt(''); g.ui.setHold(null); g.viewmodel.reachW = 0; }

  // The first time you stand by one of the smears, you know what it is: this is the way they carried the elder.
  updateTrail() {
    const g = this.g, run = g.run; if (!run || !run.smears || this.f.smearSaid || g.state !== 'playing' || g.opening.active || g.surface.active) return;
    const p = g.player.pos;
    for (const m of run.smears) if (Math.hypot(p.x - m.position.x, p.z - m.position.z) < 6) { this.f.smearSaid = true; if (g.ui.subT <= 0.3) g.ui.subtitle('The same hand, dragged along the wall. They carried the elder this way.', '', 3.6, true); return; }
  }

  // ---- dressing the deck: the trail, the crew's paperwork, the jars and the chart. Called on every new layout.
  dressRun(run, rooms) {
    const g = this.g; this.removeTouch('run');
    run.smears = [];
    const smearMat = new THREE.MeshBasicMaterial({ map: smearTexture(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }); smearMat.userData.noSnap = true;
    const geo = new THREE.PlaneGeometry(1.3, 1.3);
    const onWall = (r, side, lateral) => {
      if (side === 'zmin') return { x: r.cx + lateral, z: r.z0 + 0.05, ry: 0 };
      if (side === 'zmax') return { x: r.cx - lateral, z: r.z1 - 0.05, ry: Math.PI };
      if (side === 'xmin') return { x: r.x0 + 0.05, z: r.cz - lateral, ry: Math.PI / 2 };
      return { x: r.x1 - 0.05, z: r.cz + lateral, ry: -Math.PI / 2 };
    };
    let log = 0;
    for (const r of rooms) {
      if (r.kind === 'lift' || !r.outSide) continue;
      const a = onWall(r, r.outSide, 2.15), m = new THREE.Mesh(geo, smearMat);
      m.position.set(a.x, 1.5, a.z); m.rotation.y = a.ry; run.group.add(m); run.smears.push(m);
      const b = onWall(r, r.outSide, -3.4);
      if (log < LOGS.length) addSign(run.group, LOGS[log++], 2.3, b.x, 1.75, b.z, b.ry, { accent: '#d99a1c', w: 1024, h: 200 });
    }
    // the voices that live on this deck go to the deck's quiet rooms, in order, skipping any you already have
    const slots = rooms.filter((r) => r.voiceSpot), free = SHIP_VOICES.filter((n) => !this.s.voices.includes(n));
    slots.forEach((r, i) => { if (i >= free.length) return; const q = r.voiceSpot; const jar = this.addVoiceAt(run.group, free[i], q.x, q.y || 0, q.z, 'run'); if (jar && q.y) { const t = this.touchables[this.touchables.length - 1]; t.high = true; } });
    if (run.navRoom) this.buildChart(run);
    this.applyAlert();
  }

  buildChart(run) {
    const g = this.g, r = run.navRoom, q = r.navSpot, F = g.flight;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 768; const x = c.getContext('2d');
    const draw = (read) => {
      x.fillStyle = '#04141a'; x.fillRect(0, 0, 1024, 768);
      x.strokeStyle = 'rgba(120,230,220,0.09)'; for (let i = 0; i < 1024; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 768); x.stroke(); } for (let i = 0; i < 768; i += 64) { x.beginPath(); x.moveTo(0, i); x.lineTo(1024, i); x.stroke(); }
      const px = (v) => 512 + v.x * 0.075, py = (v) => 430 + v.z * 0.062;
      x.font = '600 26px "Segoe UI", Arial, sans-serif'; x.textAlign = 'center';
      x.fillStyle = '#9fe8f2'; x.textAlign = 'left'; x.fillText('HALCYON  ·  SYSTEM CHART', 28, 42); x.textAlign = 'center';
      const NAMES = { vael: 'VAEL', ochre: 'OCHRE', skarn: 'SKARN', thule: 'THULE', ash: read ? 'HOME' : 'ORIGIN WORLD' };
      for (const w of F.worlds) { const X = px(w.pos), Y = py(w.pos), rad = 8 + w.r * 0.018; x.beginPath(); x.arc(X, Y, rad, 0, 7); x.fillStyle = w.id === 'ash' ? '#ff7a4a' : '#7fb8c8'; x.fill(); x.fillStyle = '#d9f4f4'; x.fillText(NAMES[w.id], X, Y - rad - 8); }
      const V = F.vessel.position, vx = px(V), vy = py(V); x.fillStyle = '#ffe08a'; x.fillRect(vx - 7, vy - 7, 14, 14); x.fillText('YOU ARE HERE', vx, vy + 34);
      // the fleet's line, off the edge of the chart
      x.strokeStyle = 'rgba(255,120,90,0.9)'; x.lineWidth = 3; x.setLineDash([14, 10]); const v2 = F.worlds[0].pos; x.beginPath(); x.moveTo(px(v2), py(v2)); x.lineTo(1024, 40); x.stroke(); x.setLineDash([]); x.lineWidth = 1;
      x.fillStyle = '#ff9a7a'; x.textAlign = 'right'; x.fillText('FLEET ROUTE  ·  EARTH', 1000, 76);
    };
    draw(false);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const grp = new THREE.Group(); grp.position.set(q.x, 0, q.z); run.group.add(grp);
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.55, metalness: 0.5 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.5), metal); table.position.y = 0.45; grp.add(table);
    const scrMat = new THREE.MeshBasicMaterial({ map: tx, toneMapped: false }); scrMat.userData.noSnap = true;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.4), scrMat); top.rotation.x = -Math.PI / 2; top.position.y = 0.915; grp.add(top);
    const holoMat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }); holoMat.userData.noSnap = true;
    this.holo = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.25), holoMat); this.holo.position.set(q.x, 2.3, q.z); run.group.add(this.holo);
    for (const f of run.flicker) { const l = f.l.position; if (l.x > r.x0 && l.x < r.x1 && l.z > r.z0 && l.z < r.z1) f.broken = false; }
    const glow = new THREE.PointLight(0x7ff0e0, 14, 9, 2); glow.position.y = 1.7; glow.userData.keepOn = true; grp.add(glow);
    const box = g.world.add(q.x - 1.2, 0, q.z - 0.75, q.x + 1.2, 0.92, q.z + 0.75, { tag: 'chart' }); run.boxes.push(box);
    if (this.s.chart) { const d = r.doors.out; d.unlock(); d.open(true); draw(true); tx.needsUpdate = true; glow.color.set(0xff6a4a); }
    this.addTouch({ tag: 'run', x: q.x, y: 1.0, z: q.z, r: 3.1, time: 1.1, label: 'TOUCH', prompt: 'TOUCH THE CHART', on: () => !this.s.chart, fn: () => { draw(true); tx.needsUpdate = true; glow.color.set(0xff6a4a); this.readChart(); } });
  }

  // One touch and you know the way home, and the ship knows you know.
  readChart() {
    const g = this.g, s = this.s, ui = g.ui, run = g.run;
    if (s.chart && run && run.navRoom && !run.navRoom.doors.out.locked) return;
    s.chart = true; this.save();
    g.audio.play('gel', { vol: 0.7 }); g.audio.play('crystal', { vol: 0.4 }); g.viewmodel.pulseGlow(1); g.addShake(0.08);
    const say = (at, text, who) => this.f.chartLines.push({ at, text, who });
    this.f.chartLines = []; this.f.chartT = 0;
    say(0.2, 'Origin world: scorched, survey closed. A few hours out.', 'MEMORY');
    say(4.2, 'Home. I can get there from here.', '');
    say(7.0, 'Fleet route: refuel at Vael, then the crossing to Earth.', 'MEMORY');
    say(11.0, 'The specimen has the charts. Meridian, undock now. All power to security.', 'HALCYON');
    say(15.0, 'Deck nine. A ship. Then home.', '');
    this.setBeat('chart'); this.raiseAlert(2);
    ui.setObjective('REACH THE HANGAR');
    g.level.alarm = false;
    if (run && run.navRoom) { const d = run.navRoom.doors.out; d.unlock(); d.open(); g.audio.play('unlock', { vol: 0.9 }); g.audio.play('door', { vol: 0.8 }); }
    g.audio.play('lockdown', { vol: 0.6 });
  }
  updateChartLines(dt) {
    const f = this.f; if (!f.chartLines || !f.chartLines.length) return;
    f.chartT += dt;
    while (f.chartLines.length && f.chartT >= f.chartLines[0].at) { const l = f.chartLines.shift(); this.g.ui.subtitle(l.text, l.who, 3.6, !l.who); if (l.who === 'HALCYON') this.g.audio.play('pa', { vol: 0.7 }); }
  }

  // ---- the pause screen: what you know, in your own words
  journal() {
    const s = this.s, g = this.g, forms = g.arsenal.unlocked.size;
    const rows = [];
    rows.push(['NOW', g.ui.objectiveText() || (GOALS[s.beat] || '')]);
    rows.push(['WHY', {
      valley: 'The others walked out one by one. Only the elder stayed.',
      chase: 'They took the elder. One of their ships fell, and it is flying home.',
      trial: 'They caught me. Twenty-six trials while I slept. Out first.',
      deck: 'The elder was carried to the hangar on deck nine. Every ship there can take me home.',
      chart: 'The way home is on the chart. The ship knows I know. Deck nine, now.',
      home: 'If anyone got away, they would have gone to the wall of hands. Home first.',
      road: 'Forty-one thousand of us are alive, on the road to Earth. This ship cannot make the crossing yet.',
      crossing: 'The ship can make the crossing. Nothing keeps me here.',
      crossed: 'Earth is next. They burned our home, so theirs will do.',
    }[s.beat] || '']);
    rows.push(['BODY', `${s.total} machine${s.total === 1 ? "" : "s"} kept  ·  ${forms} of 5 forms  ·  ${s.voices.length} of 7 voices`]);
    return rows;
  }
}
