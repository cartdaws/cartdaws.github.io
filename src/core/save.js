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

export const save = {
  get maxHpBonus() { return state.maxHpBonus; },
  // Called once per absorbed enemy; returns the new bonus.
  addMaxHp() {
    state.maxHpBonus += 1;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable: still applies this session */ }
    return state.maxHpBonus;
  },
};
