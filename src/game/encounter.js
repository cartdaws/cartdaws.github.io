export const EncounterState = Object.freeze({ WAITING: 'waiting', SEALING: 'sealing', COMBAT: 'combat', CLEARED: 'cleared' });

const SEAL_WARNING = 2.2;   // door slam + readable alarm before enemies wake
const WAVE_WARNING = 1.7;   // reinforcements power up before they attack

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
    this.told = { drums: false };
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
    g.ui.setObjective('REACH THE HANGAR');
  }

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
    }
    g.ui.setObjective('REACH THE HANGAR');
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
    g.ui.setObjective(`REACH THE HANGAR  ·  ${this.label(r)}`);
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
    g.level.alarm = true;
    g.audio.play('door', { vol: 0.9 });
    g.audio.play('lockdown', { vol: 0.9 });
    g.audio.startSiren();
    g.ui.banner(r.kind === 'finale' ? 'FINAL LOCKDOWN' : 'LOCKDOWN', 'red', 1.5);
    g.audio.play('announce', { vol: 0.8 });
    // the ship AI speaks at the first lockdown only; after that the alarm says enough
    if (r.id === 0 || r.kind === 'finale') g.ui.subtitle(r.id === 0 ? 'Intruder in the Robotics Deck. Sealing the workshop.' : 'Final lockdown. All units to the hangar lift.', 'HALCYON', 2.6);
    if (r.id === 0 && !this.told.intruder) { this.told.intruder = true; this.lineT = 2.9; }
    if (!this.told.drums && r.barrels.length) { this.told.drums = true; g.ui.hintOnce('drums', 'RED DRUMS EXPLODE', 2.5); }
    g.addShake(0.25);
    for (const e of g.enemies) e.warn?.();
  }

  beginCombat(r) {
    const g = this.game;
    this.state = EncounterState.COMBAT;
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
    g.level.alarm = false;
    g.audio.stopSiren();
    const locked = r.doors.out.locked;
    r.doors.out.open();
    g.audio.play('unlock', { vol: 1 });
    g.audio.play('door', { vol: 0.8 });
    g.ui.banner(r.kind === 'finale' ? 'LIFT UNLOCKED' : locked ? 'SECTOR CLEAR' : 'EXIT UNLOCKED', 'green', 1.4);
    g.ui.setObjective(locked ? 'FIND THE KEYCARD' : 'REACH THE HANGAR');
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
    g.ui.rewardNote('KEYCARD ACQUIRED');
    g.ui.setObjective('USE THE KEYCARD ON THE SEALED DOOR');
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
    if (this.hasKey) {
      d.unlock();
      if (r.kind === 'quiet' || r.cleared) d.open();
      g.audio.play('unlock', { vol: 0.9 });
      g.audio.play('door', { vol: 0.8 });
      g.ui.rewardNote('ACCESS GRANTED');
      g.ui.setObjective('REACH THE HANGAR');
    } else if (this.lockHintT <= 0) {
      this.lockHintT = 15;
      g.ui.hint('KEYCARD REQUIRED', 2);
    }
  }
}
