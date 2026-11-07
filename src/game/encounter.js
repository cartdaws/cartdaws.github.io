import * as THREE from 'three';
import { LAB } from '../v2/flags.js';
import { HALCYON_LINES, YOUR_LINES } from './taunts.js';
export const EncounterState = Object.freeze({ WAITING: 'waiting', SEALING: 'sealing', COMBAT: 'combat', CLEARED: 'cleared' });

const SEAL_WARNING = LAB ? 1.0 : 2.2;   // door slam + readable alarm before enemies wake
const WAVE_WARNING = LAB ? 0.9 : 1.7;   // reinforcements power up before they attack

// Walks the player through the run, one room at a time. Combat rooms seal behind the player and open when cleared;
// quiet rooms are free to explore. The state is that of the room the player is about to enter or is fighting in.
export class Encounter {
  constructor(game) {
    this.game = game;
    this.rooms = [];
    this.i = 0;
    this.state = EncounterState.WAITING;
    this.timer = 0;
    this.won = false;
    this.hasKey = false;
    this.lockHintT = 0;
    this.pending = null; // reinforcements waiting to power up
    this.told = { drums: false }; this.taunt = 0; this.answer = 0; this.lineAfter = null;
  }

  get room() { return this.rooms[this.i]; }

  // A brand-new run on a freshly generated facility.
  start(rooms) {
    const g = this.game;
    this.rooms = rooms;
    this.i = 0;
    this.won = false;
    this.hasKey = false;
    this.told = { drums: false };
    this.cleanup();
    for (const r of rooms) { r.cleared = false; r.prepared = false; }
    this.state = EncounterState.WAITING;
    this.timer = 0;
    this.pending = null;
    this.prepare(rooms[0]);
    g.ui.setObjective(this.baseObjective());
  }

  // what is next on the deck, whichever room you are in
  baseObjective() { if (LAB) return ''; const g = this.game; return g.run && this.room === g.run.navRoom && !g.campaign.s.chart ? 'TOUCH THE CHART' : 'REACH THE HANGAR'; }

  cleanup() {
    const g = this.game;
    g.level.alarm = false;
    g.audio.stopSiren();
  }

  // Put the player back at the entrance of the room they are working on and reset that room.
  restartRoom() {
    const g = this.game, r = this.room;
    this.cleanup();
    this.pending = null;
    this.timer = 0;
    this.state = EncounterState.WAITING;
    // never respawn beyond a door that is still locked
    const prev = this.rooms[this.i - 1];
    const cp = (prev && prev.doors.out && prev.doors.out.locked ? prev : r).restart;
    g.player.reset(cp.x, cp.z, cp.yaw);
    if (r.kind === 'combat' || r.kind === 'finale') {
      r.prepared = false;
      this.prepare(r);
      r.doors.in.open(true);
      r.doors.out.close(true);
      for (const d of r.sideDoors || []) d.close(true);
    }
    g.ui.setObjective(this.baseObjective());
  }

  prepare(r) {
    if (!r || r.prepared) return;
    r.prepared = true;
    const g = this.game;
    g.spawnRoom(r);
    g.pickups.reveal(r, 'start');
  }

  advance() {
    this.i++;
    // a shortcut between two rooms comes alive once both are behind you
    const run = this.game.run;
    if (run && run.loops) for (const Lp of run.loops) if (!Lp.live && this.i > Lp.after + 1) { Lp.live = true; for (const d of Lp.doors) { d.unlock(); d.open(); } this.game.ui.rewardNote('SERVICE POWER RESTORED  ·  A SHORTCUT'); this.game.audio.play('unlock', { vol: 0.8 }); }
    this.state = EncounterState.WAITING;
    this.prepare(this.room);
  }

  inside(r) {
    const p = this.game.player.pos, b = r.bounds;
    if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) return false;
    const need = r.kind === 'lift' ? 1.8 : 1.9;
    switch (r.inSide) {
      case 'zmax': return b.maxZ - p.z >= need;
      case 'zmin': return p.z - b.minZ >= need;
      case 'xmin': return p.x - b.minX >= need;
      default: return b.maxX - p.x >= need;
    }
  }

  update(dt) {
    const g = this.game;
    this.updateLocks(dt);
    if (this.lineAfter) { this.lineAfter.t -= dt; if (this.lineAfter.t <= 0) { if (g.ui.subT <= 0.3) g.ui.subtitle(this.lineAfter.text, '', 2.4, true); this.lineAfter = null; } }
    if (this.lineT > 0) { this.lineT -= dt; if (this.lineT <= 0) g.ui.subtitle('Intruder. It calls me that.', '', 2.6, true); }
    const r = this.room;
    if (!r || this.won) return;
    switch (this.state) {
      case EncounterState.WAITING:
        if (!g.player.dead && this.inside(r)) this.enter(r);
        break;
      case EncounterState.SEALING:
        this.timer -= dt;
        if (this.timer <= 0) this.beginCombat(r);
        break;
      case EncounterState.COMBAT:
        this.combat(r, dt);
        break;
      default:
    }
  }

  label(r) { return `${String(r.id + 1).padStart(2, '0')}/${String(this.rooms.length - 1).padStart(2, '0')}`; }

  enter(r) {
    const g = this.game;
    if (r.kind === 'lift') {
      this.won = true;
      g.audio.play('unlock', { vol: 1 });
      g.ui.setObjective('HANGAR LIFT');
      return;
    }
    g.ui.setObjective(LAB ? `ROOM ${this.label(r)}` : r === g.run?.navRoom && !g.campaign.s.chart ? 'TOUCH THE CHART' : `REACH THE HANGAR  ·  ${this.label(r)}`);
    if (r === g.run?.navRoom && !g.campaign.s.chart && g.ui.subT <= 0.3) g.ui.subtitle('Their charts. Every world they have ever burned, and the way back to mine.', '', 3.6, true);
    if (r.id > 0 && r.kind === 'combat') g.ui.hintOnce('highground', g.touchMode ? 'TAP JUMP INTO CRATES AND DESKS TO CLIMB: HIGH GROUND' : 'JUMP INTO CRATES AND DESKS TO CLIMB: HIGH GROUND', 4);
    if (r.kind === 'quiet') {
      g.pickups.reveal(r, 'start');
      this.advance();
    } else {
      this.beginSealing(r);
    }
  }

  beginSealing(r) {
    const g = this.game;
    this.state = EncounterState.SEALING;
    this.timer = SEAL_WARNING;
    g.arena = r.bounds;
    g.nav = r.nav || (r.nav = g.makeNav(r.bounds));
    g.waypoints = r.waypoints || (r.waypoints = g.buildWaypoints(r.bounds));
    g.nav.forceRefresh();
    r.doors.in.close();
    for (const d of r.sideDoors || []) d.close();
    g.level.alarm = true;
    g.audio.play('door', { vol: 0.9 });
    g.audio.play('lockdown', { vol: 0.9 });
    g.audio.startSiren();
    g.ui.banner(r.kind === 'finale' ? 'FINAL LOCKDOWN' : 'LOCKDOWN', 'red', 1.5);
    g.audio.play('announce', { vol: 0.8 });
    // the ship AI speaks at the first lockdown only; after that the alarm says enough
    if (!LAB && (r.id === 0 || r.kind === 'finale')) g.ui.subtitle(r.id === 0 ? 'Intruder in the Robotics Deck. Sealing the workshop.' : 'You will not reach the Meridian. All units to the hangar lift.', 'HALCYON', 2.6);
    if (LAB) { /* no story yet */ }
    else if (r.id === 0 && !this.told.intruder) { this.told.intruder = true; this.lineT = 2.9; }
    else if (this.taunt < HALCYON_LINES.length) g.ui.subtitle(HALCYON_LINES[this.taunt++], 'HALCYON', 3.4);
    if (!this.told.drums && r.barrels.length) { this.told.drums = true; g.ui.hintOnce('drums', 'RED DRUMS EXPLODE', 2.5); }
    g.addShake(0.25);
    for (const e of g.enemies) e.warn?.();
  }

  beginCombat(r) {
    const g = this.game;
    this.state = EncounterState.COMBAT;
    g.audio.combatMusic(true);
    for (const e of g.enemies) if (e.alive) e.activate();
  }

  combat(r, dt) {
    const g = this.game;
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) { for (const e of this.pending.list) if (e.alive) e.activate(); this.pending = null; }
    }
    // Failsafe: anything that escaped the room or fell out of the world cannot hold the lockdown.
    const a = r.bounds;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const p = e.pos;
      if (p.y < -2 || p.x < a.minX - 1 || p.x > a.maxX + 1 || p.z < a.minZ - 1 || p.z > a.maxZ + 1) e.die(true);
    }
    const left = g.enemies.filter((e) => e.alive).length;
    const wavesLeft = r.waves.length - 1 - (r.waveIdx || 0);
    g.ui.setObjective(wavesLeft > 0 && left <= 2 ? `HOSTILES ${left}  ·  MORE INBOUND` : `HOSTILES ${left}`);
    if (left === 0) {
      if (wavesLeft > 0) this.nextWave(r);
      else this.clear(r);
    }
  }

  nextWave(r) {
    const g = this.game;
    r.waveIdx = (r.waveIdx || 0) + 1;
    const list = g.spawnWave(r, r.waveIdx);
    for (const e of list) e.warn?.();
    this.pending = { t: WAVE_WARNING, list };
    g.ui.banner('REINFORCEMENTS', 'red', 1.3);
    g.audio.play('lockdown', { vol: 0.7 });
    g.addShake(0.2);
  }

  clear(r) {
    const g = this.game;
    r.cleared = true;
    this.state = EncounterState.CLEARED;
    g.audio.combatMusic(false);
    if (!LAB && r.id > 0 && r.kind !== 'finale') this.lineAfter = { t: 1.6, text: YOUR_LINES[this.answer++ % YOUR_LINES.length] };
    g.level.alarm = false;
    g.audio.stopSiren();
    const locked = r.doors.out.locked;
    r.doors.out.open();
    for (const d of r.sideDoors || []) d.open();
    g.audio.play('unlock', { vol: 1 });
    g.audio.play('door', { vol: 0.8 });
    g.ui.banner(r.kind === 'finale' ? 'LIFT UNLOCKED' : locked ? 'SECTOR CLEAR' : 'EXIT UNLOCKED', 'green', 1.4);
    g.ui.setObjective(LAB ? '' : locked ? 'FIND A WAY THROUGH THE DEAD DOOR' : 'REACH THE HANGAR');
    g.pickups.reveal(r, 'clear');
    g.clearEnemies();
    this.advance();
  }

  hasKeyRoom() { return this.game.run && this.game.run.keyRoom; }

  gotKey() {
    const g = this.game;
    if (this.hasKey) return;
    this.hasKey = true;
    g.audio.play('unlock', { vol: 0.9 });
    g.ui.rewardNote('HANDLER PASS  ·  A DEAD MAN\'S ACCESS');
    g.ui.setObjective('THE DEAD DOOR AHEAD WILL TAKE THIS');
  }

  // Keycard doors: the door answers when the player stands at it.
  updateLocks(dt) {
    const g = this.game, p = g.player.pos;
    this.lockHintT = Math.max(0, this.lockHintT - dt);
    const run = g.run;
    if (!run || !run.lockRoom) return;
    const r = run.lockRoom, d = r.doors.out;
    if (!d.locked) return;
    if (Math.hypot(p.x - d.x, p.z - d.z) > 3.6) return;
    const arc = g.arsenal.unlocked.has('arc');
    if (this.hasKey || arc) {
      if (arc && !this.hasKey) { g.effects.hitSparks(new THREE.Vector3(d.x, 1.3, d.z), [0.5, 0.9, 1], 22); g.viewmodel.pulseGlow(1); g.ui.subtitle('No power. It has mine now.', '', 2.4, true); }
      d.unlock();
      if (r.kind === 'quiet' || r.cleared) d.open();
      g.audio.play('unlock', { vol: 0.9 });
      g.audio.play('door', { vol: 0.8 });
      g.ui.setObjective('REACH THE HANGAR');
    } else if (this.lockHintT <= 0) {
      this.lockHintT = 15;
      g.ui.subtitle('A dead door. It wants a pass, or a current. The machines carry both.', '', 3.2, true);
    }
  }
}
