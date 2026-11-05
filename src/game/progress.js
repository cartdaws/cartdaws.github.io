// Progress that survives between sessions: whether the opening has been seen, and the permanent max-health bonus earned by absorbing.
const BONUS_KEY = 'intruder-progress';
const INTRO_KEY = 'intruder-intro';

function loadBonus() {
  try {
    const n = Math.floor(Number(JSON.parse(localStorage.getItem(BONUS_KEY) || '{}').maxHpBonus));
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 9999) : 0;
  } catch (e) { return 0; }
}
function loadIntro() {
  try { return localStorage.getItem(INTRO_KEY) === '1'; } catch (e) { return false; }
}

let bonus = loadBonus();
let intro = loadIntro();
let chapter = (() => { try { return localStorage.getItem('intruder-chapter') === '1'; } catch (e) { return false; } })();

export const progress = {
  get chapterDone() { return chapter; },
  setChapterDone() { chapter = true; try { localStorage.setItem('intruder-chapter', '1'); } catch (e) { /* storage is optional */ } },
  get introDone() { return intro; },
  setIntroDone(v) { intro = !!v; try { localStorage.setItem(INTRO_KEY, v ? '1' : '0'); } catch (e) { /* storage is optional */ } },
  get maxHpBonus() { return bonus; },
  addMaxHp() {
    bonus += 1;
    try { localStorage.setItem(BONUS_KEY, JSON.stringify({ maxHpBonus: bonus })); } catch (e) { /* storage is optional */ }
    return bonus;
  },
};
