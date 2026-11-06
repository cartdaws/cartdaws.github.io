import { sanitize, defaults, VERSION } from '../creature/definition.js';

// Permanent progress. Stored as one small record so it survives death, retries and reloads.
const KEY = 'intruderv2-progress';
export const BASE_MAX_HP = 100;

function read() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    const n = Math.floor(Number(o.maxHpBonus));
    return { maxHpBonus: Number.isFinite(n) ? Math.min(Math.max(n, 0), 9999) : 0 };
  } catch (e) { return { maxHpBonus: 0 }; }
}

let state = read();

const INTRO_KEY = 'intruderv2-intro';
let introDone = false;
try { introDone = localStorage.getItem(INTRO_KEY) === '1'; } catch (e) { /* none */ }

// The confirmed creature design: one versioned record. Saves made before the creator existed have none and get the original creature.
const CKEY = 'intruderv2-creature';
function readCreature() {
  try { const o = JSON.parse(localStorage.getItem(CKEY) || 'null'); return o && o.version <= VERSION ? sanitize(o) : defaults(); } catch (e) { return defaults(); }
}
let creature = readCreature();

// The arsenal: which arm slots have grown (0..7) and which weapon forms are learned (0..8). Kept apart from the creature's appearance and from
// permanent max HP, so editing the creature or retrying never touches progression. Older saves have neither: they start with two arms and the
// Shardcaster; a save from the first weapon-wheel build ('intruderv2-weapons') is migrated by growing the arm each learned form lives on.
const AKEY = 'intruderv2-arsenal';
const clampList = (a, max) => [...new Set((Array.isArray(a) ? a : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= max))];
let arsenal = { arms: [0, 1], learned: [0] };
try {
  const o = JSON.parse(localStorage.getItem(AKEY) || 'null');
  if (o) arsenal = { arms: [...new Set([0, 1, ...clampList(o.arms, 7)])], learned: [...new Set([0, ...clampList(o.learned, 8)])] };
  else {
    const old = JSON.parse(localStorage.getItem('intruderv2-weapons') || 'null');
    if (old) arsenal = { arms: [0, 1], learned: [...new Set([0, ...clampList(old, 8)])] };
  }
} catch (e) { /* defaults */ }

export const save = {
  get arsenal() { return { arms: arsenal.arms.slice(), learned: arsenal.learned.slice() }; },
  saveArsenal(arms, learned) {
    arsenal = { arms: [...new Set([0, 1, ...clampList(arms, 7)])], learned: [...new Set([0, ...clampList(learned, 8)])] };
    try { localStorage.setItem(AKEY, JSON.stringify(arsenal)); } catch (e) { /* session only */ }
  },
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
