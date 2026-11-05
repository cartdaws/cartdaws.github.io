// What the machines remember. One line plays each time you absorb a machine, in order: this is how the player learns what happened aboard the Halcyon.
// See STORY.md. The position survives death and restarts, and goes back to the start on New Game.
const KEY = 'intruder-memory';

export const MACHINE_MEMORIES = [
  'All crew transferred to the Meridian. The machines will run the Halcyon from here.',
  'Survey note: they keep nothing written. Every memory passes by touch, from one body to the next.',
  'Seven specimens taken from this valley for study. None of them will speak to us. None of them can.',
  'Trial twenty-seven. The subject touched the scanner, and the scanner stopped being ours.',
  'Command is very interested. A soldier that learns any weapon by holding it.',
  'Order from the Meridian: bring the old ones first. They have kept the most.',
  'Specimen Eight secured. Meridian cleared to load all specimens for transfer.',
  'Harvest complete. Forty-one thousand live specimens in the fleet holds. Departing for Earth.',
  'Note added by Halcyon: it is reading these. Stop letting it touch the units.',
];

function load() {
  try { const n = Math.floor(Number(localStorage.getItem(KEY))); return Number.isFinite(n) && n > 0 ? n : 0; } catch (e) { return 0; }
}
let index = load();

// the next memory, or null once they have all been read
export function nextMemory() {
  if (index >= MACHINE_MEMORIES.length) return null;
  const line = MACHINE_MEMORIES[index++];
  try { localStorage.setItem(KEY, String(index)); } catch (e) { /* storage is optional */ }
  return line;
}
export function resetMemories() {
  index = 0;
  try { localStorage.removeItem(KEY); } catch (e) { /* storage is optional */ }
}
