import { save } from '../core/save.js';

// The arsenal: nine weapon forms carried on eight arms. Four things are kept apart on purpose:
//   arms      – which anatomical arm slots have grown (the player starts with two)
//   learned   – which weapon forms have been absorbed
//   carrier   – which arm carries each form (one arm can carry several forms and reshapes between them)
//   selected  – the form currently in hand
// Arm numbers: 0 right (Shardcaster), 1 left (absorber), 2..7 the extra arms (left/right pairs, lowest at the screen edge).
// Nine forms on eight arms: arm 0 can carry two forms (0 and 8) and arm 1 one (7); no form is dropped and no ninth arm exists.
// `ready` marks forms that actually work in the game. Only the Shardcaster does today; the rest are slots the ship will fill in later,
// and they never appear as selectable until they are both learned and ready.
export const LIMB_COUNT = 8;
export const WEAPONS = [
  { id: 'shardcaster', name: 'SHARDCASTER', arm: 0, ready: true, fires: true, note: 'Crystalline bolts' },
  { id: 'form2', name: 'FORM 2', arm: 2, ready: false, note: '' },
  { id: 'form3', name: 'FORM 3', arm: 3, ready: false, note: '' },
  { id: 'form4', name: 'FORM 4', arm: 4, ready: false, note: '' },
  { id: 'form5', name: 'FORM 5', arm: 5, ready: false, note: '' },
  { id: 'form6', name: 'FORM 6', arm: 6, ready: false, note: '' },
  { id: 'form7', name: 'FORM 7', arm: 7, ready: false, note: '' },
  { id: 'form8', name: 'FORM 8', arm: 1, ready: false, note: '' },
  { id: 'form9', name: 'FORM 9', arm: 0, ready: false, note: '' },
];

export class Loadout {
  constructor(game) {
    this.g = game;
    const a = save.arsenal;
    this.arms = new Set(a.arms);
    this.learned = new Set(a.learned);
    this.carrier = WEAPONS.map((w) => w.arm);           // form -> arm; a later reassignment only changes this table
    for (const i of this.learned) this.arms.add(this.carrier[i]);   // an arm always exists for every learned form (migrates older saves)
    this.selected = 0;
    this.preview = false;       // creator only: "Preview fully evolved" shows all eight arms and changes nothing
    this.devArms = 0;           // development only (?debug): force the first N arms on without touching the save
    this.devForms = false;      // development only: let learned placeholder forms be selected, to test cycling and the wheel
  }

  armShown(i) {
    if (this.preview) return true;
    if (this.devArms) return i < this.devArms;
    return this.arms.has(i);
  }
  shown(i) { return this.armShown(i); }
  get active() { return WEAPONS[this.selected]; }
  selectedLimb() { return this.carrier[this.selected]; }
  shownCount() { let n = 0; for (let i = 0; i < LIMB_COUNT; i++) if (this.armShown(i)) n++; return n; }

  // forms that can be chosen: learned, and either working or (development only) forced on
  selectable() {
    const out = [];
    WEAPONS.forEach((w, i) => { if (this.learned.has(i) && (w.ready || this.devForms)) out.push(i); });
    return out;
  }

  // Learning a form grows the arm that carries it, and keeps both facts in the save.
  learn(i) {
    if (!WEAPONS[i] || this.learned.has(i)) return false;
    this.learned.add(i); this.arms.add(this.carrier[i]);
    save.saveArsenal([...this.arms], [...this.learned]);
    if (this.g.ui && WEAPONS[i].ready) this.g.ui.hint('NEW WEAPON — ' + WEAPONS[i].name, 3.5);
    return true;
  }
  unlock(i) { return this.learn(i); }

  select(i) {
    if (!this.selectable().includes(i)) return false;
    if (i !== this.selected) {
      const reshape = this.carrier[i] === this.carrier[this.selected];        // the same arm reshapes between forms
      this.selected = i;
      if (this.g.viewmodel) this.g.viewmodel.pulseGlow(reshape ? 1 : 0.5);
    }
    const el = document.getElementById('weaponName');
    if (el) el.textContent = WEAPONS[i].name;
    return true;
  }

  // a quick tap: the next selectable form
  cycle() {
    const list = this.selectable();
    if (list.length < 2) return false;
    return this.select(list[(list.indexOf(this.selected) + 1) % list.length]);
  }
}
