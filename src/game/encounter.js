import { ARENA } from '../world/level.js';

export const EncounterState = Object.freeze({ WAITING: 'waiting', SEALING: 'sealing', COMBAT: 'combat', CLEARED: 'cleared' });

const SEAL_WARNING = 2.2; // door slam + readable alarm before enemies wake

// Explicit state machine for the arena fight. Each transition can happen exactly once per reset.
export class Encounter {
  constructor(game) {
    this.game = game;
    this.state = EncounterState.WAITING;
    this.timer = 0;
  }

  reset() {
    this.state = EncounterState.WAITING;
    this.timer = 0;
    const g = this.game;
    g.level.alarm = false;
    g.audio.stopSiren();
    g.level.doors.entrance.open(true);
    g.level.doors.exit.close(true);
    g.ui.setObjective('REACH THE HANGAR');
  }

  playerInside() {
    const p = this.game.player.pos;
    // "Fully" inside: well past the doorway plane, not merely touching it.
    return p.z < ARENA.maxZ - 1.9 && p.x > ARENA.minX && p.x < ARENA.maxX && p.z > ARENA.minZ;
  }

  update(dt) {
    const g = this.game;
    switch (this.state) {
      case EncounterState.WAITING:
        if (!g.player.dead && this.playerInside()) this.beginSealing();
        break;
      case EncounterState.SEALING:
        this.timer -= dt;
        if (this.timer <= 0) this.beginCombat();
        break;
      case EncounterState.COMBAT: {
        // Failsafe: anything that escaped the arena or fell out of the world cannot hold the lockdown.
        for (const e of g.enemies) {
          if (!e.alive) continue;
          const p = e.pos;
          if (p.y < -2 || p.x < ARENA.minX - 1 || p.x > ARENA.maxX + 1 || p.z < ARENA.minZ - 1 || p.z > ARENA.maxZ + 1) e.die(true);
        }
        const left = g.enemies.filter((e) => e.alive).length;
        g.ui.setObjective(`HOSTILES ${left}`);
        if (left === 0) this.clear();
        break;
      }
      default:
    }
  }

  beginSealing() {
    const g = this.game;
    this.state = EncounterState.SEALING;
    this.timer = SEAL_WARNING;
    g.level.doors.entrance.close();
    g.level.alarm = true;
    g.audio.play('door', { vol: 0.9 });
    g.audio.play('lockdown', { vol: 0.9 });
    g.audio.startSiren();
    g.ui.banner('LOCKDOWN', 'red', 2.4);
    g.audio.play('announce', { vol: 0.8 });
    g.ui.subtitle('Intruder in the Robotics Deck. Sealing the workshop.', 'SHIP AI', 3.2);
    g.ui.hint('Red drums are explosive', 4);
    g.addShake(0.25);
    // Enemies visibly power up during the warning.
    for (const e of g.enemies) e.warn?.();
  }

  beginCombat() {
    const g = this.game;
    this.state = EncounterState.COMBAT;
    for (const e of g.enemies) if (e.alive) e.activate();
  }

  clear() {
    const g = this.game;
    this.state = EncounterState.CLEARED;
    g.level.alarm = false;
    g.audio.stopSiren();
    g.level.doors.exit.open();
    g.audio.play('unlock', { vol: 1 });
    g.audio.play('door', { vol: 0.8 });
    g.ui.banner('EXIT UNLOCKED', 'green', 2.6);
    g.ui.setObjective('REACH THE HANGAR');
  }
}
