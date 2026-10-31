import { sanitize, defaults, VERSION } from '../creature/definition.js';

// Permanent progress. Stored as one small record so it survives death, retries and reloads.
const KEY = 'intruder-progress';
export const BASE_MAX_HP = 100;

function read() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    const n = Math.floor(Number(o.maxHpBonus));
    return { maxHpBonus: Number.isFinite(n) ? Math.min(Math.max(n, 0), 9999) : 0 };
  } catch (e) { return { maxHpBonus: 0 }; }
}

let state = read();

const INTRO_KEY = 'intruder-intro';
let introDone = false;
try { introDone = localStorage.getItem(INTRO_KEY) === '1'; } catch (e) { /* none */ }

// The confirmed creature design: one versioned record. Saves made before the creator existed have none and get the original creature.
const CKEY = 'intruder-creature';
function readCreature() {
  try { const o = JSON.parse(localStorage.getItem(CKEY) || 'null'); return o && o.version <= VERSION ? sanitize(o) : defaults(); } catch (e) { return defaults(); }
}
let creature = readCreature();

export const save = {
  get creature() { return creature; },
  setCreature(def) {
    creature = sanitize(def);
    try { localStorage.setItem(CKEY, JSON.stringify(creature)); } catch (e) { /* storage unavailable: applies this session */ }
    return creature;
  },
  // The checkpoint after acquiring the Shardcaster: later sessions start at the first room's approach, not at home.
  get introDone() { return introDone; },
  setIntroDone(v) { introDone = !!v; try { localStorage.setItem(INTRO_KEY, v ? '1' : '0'); } catch (e) { /* none */ } },
  get maxHpBonus() { return state.maxHpBonus; },
  // Called once per absorbed enemy; returns the new bonus.
  addMaxHp() {
    state.maxHpBonus += 1;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable: still applies this session */ }
    return state.maxHpBonus;
  },
};
