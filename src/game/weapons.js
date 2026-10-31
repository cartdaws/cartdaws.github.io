import { save } from '../core/save.js';

// The arsenal: nine weapons carried on eight arms. The player starts with two arms (the Shardcaster arm on the right, the absorbing arm on the left).
// Every other arm grows out when a weapon that lives on it is absorbed, so the screen never shows more than two arms until the player earns more.
// Arm numbers: 0 right (Shardcaster), 1 left (absorber), 2..7 the six extra arms (left/right pairs, lowest at the screen edge).
// One arm carries two weapons: arm 0 holds weapon 0 and weapon 8, and arm 1 holds weapon 7. Only the Shardcaster has behaviour yet; the rest are slots
// for the weapons the ship will teach the creature later.
export const LIMB_COUNT = 8;
export const WEAPONS = [
  { id: 'shardcaster', name: 'SHARDCASTER', limb: 0, fires: true, note: 'Crystalline bolts' },
  { id: 'arm2', name: 'UNKNOWN', limb: 2, note: 'Absorb a weapon to learn it' },
  { id: 'arm3', name: 'UNKNOWN', limb: 3, note: 'Absorb a weapon to learn it' },
  { id: 'arm4', name: 'UNKNOWN', limb: 4, note: 'Absorb a weapon to learn it' },
  { id: 'arm5', name: 'UNKNOWN', limb: 5, note: 'Absorb a weapon to learn it' },
  { id: 'arm6', name: 'UNKNOWN', limb: 6, note: 'Absorb a weapon to learn it' },
  { id: 'arm7', name: 'UNKNOWN', limb: 7, note: 'Absorb a weapon to learn it' },
  { id: 'arm1', name: 'UNKNOWN', limb: 1, note: 'Absorb a weapon to learn it' },
  { id: 'arm0b', name: 'UNKNOWN', limb: 0, note: 'Absorb a weapon to learn it' },
];

export class Loadout {
  constructor(game) {
    this.g = game;
    this.unlocked = new Set(save.weapons);
    this.selected = 0;
    this.preview = false;            // the creator can show all eight arms without unlocking anything
  }

  has(i) { return this.unlocked.has(i); }
  get active() { return WEAPONS[this.selected]; }
  selectedLimb() { return WEAPONS[this.selected].limb; }

  // Is this arm on screen? The two starting arms always are; the others only once a weapon that lives on them is learned.
  shown(limb) {
    if (this.preview) return true;
    return limb < 2 || WEAPONS.some((w, i) => w.limb === limb && this.unlocked.has(i));
  }

  unlock(i) {
    if (!WEAPONS[i] || this.unlocked.has(i)) return false;
    this.unlocked.add(i);
    save.unlockWeapon(i);
    if (this.g.ui) this.g.ui.hint('NEW ARM — ' + WEAPONS[i].name, 3.5);
    return true;
  }

  select(i) {
    if (!this.has(i) || !WEAPONS[i]) return false;
    this.selected = i;
    const el = document.getElementById('weaponName');
    if (el) el.textContent = WEAPONS[i].name;
    return true;
  }

  // next unlocked weapon (a quick tap of the weapon button)
  cycle() {
    for (let k = 1; k <= WEAPONS.length; k++) { const i = (this.selected + k) % WEAPONS.length; if (this.has(i)) return this.select(i); }
    return false;
  }
}
