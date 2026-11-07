import { laneRect, roomSides, doorT } from './roomgeom.js';
import { rand } from '../core/util.js';

// What a room is made of inside its outer walls. Each archetype is a recipe for structure (walls, low cover, a raised deck with its stairs) and rows
// of fixtures, drawn from the room's size, its doors and a seeded random. A plan is only accepted if the room still works around it: every door
// reaches every other door through gaps of at least two metres, nothing stands in a door's approach, and most of the floor is still open.
//
//   open      nothing: pillars and cover come from the furnishing
//   ring      a solid core with a way round it on every side: a loop to run, and a flank
//   corner    one, two or four corners filled in: L, U and cross-shaped rooms
//   chicane   staggered walls across the room that force a zig-zag through tight passages
//   gallery   a raised deck along one wall with its own stairs: height to hold, and a way to drop in
//   islands   free-standing cover walls with space to move between them
//   divided   one wall across the room with an opening (quiet rooms: a work end and a store end)
//   annex     a walled cell in one corner with a doorway: a sample room inside the room
//   aisles    parallel rows of fixtures with aisles and cross-aisles (data halls, stores)
//   dais      a low raised platform in the middle (control rooms): one step, walkable

export const DECK_H = 1.08, RISE = 0.27, RUN = 0.55;
const T = 0.5;
const U = (a, b) => rand(a, b);
const R5 = (v) => Math.round(v * 2) / 2;
const inter = (a, b, pad = 0) => !(a[1] + pad <= b[0] || b[1] + pad <= a[0] || a[3] + pad <= b[2] || b[3] + pad <= a[2]);
const rect = (b) => [b.x0, b.x1, b.z0, b.z1];

// Which structures a room may have, with weights. Size ranges are for the room's width and depth (metres, even numbers up to 26 so halls fit the grid).
export const ARCH = {
  open: { size: [[12, 24], [12, 24]], h: [5.2, 7.5] },
  ring: { size: [[18, 26], [18, 26]], h: [6.5, 8.0] },
  corner: { size: [[16, 26], [16, 26]], h: [5.5, 7.0] },
  chicane: { size: [[22, 26], [12, 16]], h: [4.6, 5.4], elongated: true },
  gallery: { size: [[20, 26], [16, 22]], h: [6.5, 7.5] },
  islands: { size: [[16, 26], [14, 22]], h: [5.0, 6.8] },
  divided: { size: [[14, 20], [12, 18]], h: [4.2, 5.0] },
  annex: { size: [[16, 20], [14, 18]], h: [4.4, 5.2] },
  aisles: { size: [[16, 22], [12, 18]], h: [4.4, 5.0] },
  dais: { size: [[14, 18], [12, 16]], h: [4.4, 5.2] },
};
const FOR_THEME = {
  assembly: { ring: 3, gallery: 2.5, corner: 2, chicane: 1.5, islands: 1.5, open: 1 },
  cargo: { islands: 2.5, gallery: 2.5, corner: 2, chicane: 1.5, open: 1 },
  foundry: { ring: 3, chicane: 2.5, corner: 2, gallery: 1.5, open: 0.7 },
  range: { chicane: 3, islands: 2.5, gallery: 2, open: 1.5, corner: 1 },
  lab: { annex: 3, divided: 2, open: 1 },
  server: { aisles: 3, divided: 1.5, open: 0.7 },
  storage: { aisles: 3, divided: 2, open: 0.7 },
  control: { dais: 3, divided: 1.5, open: 1 },
  containment: { annex: 2.5, ring: 2, divided: 1.5 },
  engineering: { ring: 3, chicane: 2, aisles: 1.5, corner: 1.5 },
  crew: { divided: 2.5, aisles: 2, open: 1.5, annex: 1 },
  chart: { open: 1, dais: 2 },
  annexroom: { open: 2, divided: 1 },
};
export function pickArch(theme, finale = false) {
  const w = { ...(FOR_THEME[theme] || FOR_THEME.assembly) };
  if (finale) { delete w.chicane; delete w.annex; delete w.divided; w.open = (w.open || 0) * 0.5; }
  const e = Object.entries(w); let r = Math.random() * e.reduce((s, [, v]) => s + v, 0);
  for (const [k, v] of e) { r -= v; if (r <= 0) return k; }
  return e[0][0];
}
export function sizeFor(arch, finale = false) {
  const A = ARCH[arch] || ARCH.open;
  let [[w0, w1], [d0, d1]] = A.size;
  if (finale) { w0 = Math.max(w0, 22); d0 = Math.max(d0, 22); w1 = 26; d1 = 26; }
  const ev = (a, b) => 2 * Math.round(U(a, b) / 2);
  let w = ev(w0, w1), d = ev(d0, d1);
  if (A.elongated && Math.random() < 0.5) [w, d] = [d, w];       // a chicane may run either way
  if (arch === 'gallery' && Math.random() < 0.5) [w, d] = [d, w];
  return { w, d, h: Math.round(U(...A.h) * 4) / 4 };
}

// ---------------------------------------------------------------- recipes
// Each returns { shape, blocks: [{x0,x1,z0,z1,kind}], decks: [{...deck, stairs}], rows: [...] } or null. kinds: wall, cover, cell, deck.
function ring(r) {
  const w = r.w, d = r.d; const lane = 5.2;
  const bw = Math.min(w - 2 * lane, w * U(0.34, 0.5)), bd = Math.min(d - 2 * lane, d * U(0.34, 0.5));
  if (bw < 5 || bd < 5) return null;
  const jx = U(-0.08, 0.08) * w, jz = U(-0.08, 0.08) * d, cx = r.cx + jx, cz = r.cz + jz;
  const blocks = [{ x0: cx - bw / 2, x1: cx + bw / 2, z0: cz - bd / 2, z1: cz + bd / 2, kind: 'wall' }];
  // an opening through the core on one axis sometimes: a way across as well as round
  return { shape: 'ring', blocks };
}
function corner(r) {
  const k = Math.random(); const cuts = [];
  const cw = () => R5(r.w * U(0.26, 0.4)), cd = () => R5(r.d * U(0.26, 0.4));
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
  let pick;
  if (k < 0.45) { pick = [corners[Math.floor(Math.random() * 4)]]; }
  else if (k < 0.8) { const s = Math.floor(Math.random() * 4); pick = [[corners[s], corners[s ^ 1]], [corners[s], corners[s ^ 2]]].map((p) => p)[Math.floor(Math.random() * 2)]; pick = [corners[s], corners[(s ^ 1)]]; }
  else pick = corners;
  const shape = pick.length === 1 ? 'L' : pick.length === 2 ? 'U' : 'cross';
  const w = cw(), d = cd();
  for (const [ix, iz] of pick) cuts.push({ x0: ix ? r.x1 - w : r.x0, x1: ix ? r.x1 : r.x0 + w, z0: iz ? r.z1 - d : r.z0, z1: iz ? r.z1 : r.z0 + d, kind: 'wall' });
  return { shape, blocks: cuts };
}
function chicane(r, n = 2 + (Math.random() < 0.4 ? 1 : 0), gap = U(4.2, 5.4)) {
  const alongZ = r.d >= r.w; const blocks = []; const s = Math.random() < 0.5 ? 1 : -1;
  for (let k = 1; k <= n; k++) {
    const f = k / (n + 1), side = (k % 2 ? s : -s);
    if (alongZ) { const z = r.z0 + r.d * f; const a = side > 0 ? [r.x0, r.x1 - gap] : [r.x0 + gap, r.x1]; blocks.push({ x0: a[0], x1: a[1], z0: z - 0.25, z1: z + 0.25, kind: 'wall' }); }
    else { const x = r.x0 + r.w * f; const a = side > 0 ? [r.z0, r.z1 - gap] : [r.z0 + gap, r.z1]; blocks.push({ x0: x - 0.25, x1: x + 0.25, z0: a[0], z1: a[1], kind: 'wall' }); }
  }
  return { shape: n === 1 ? 'divided' : 'chicane', blocks };
}
function divided(r) { return chicane(r, 1, U(3.2, 4.4)); }
function islands(r) {
  const blocks = []; const n = 3 + Math.floor(Math.random() * 3);
  for (let t = 0; t < 80 && blocks.length < n; t++) {
    const horiz = Math.random() < 0.5, w = horiz ? U(2.6, 3.8) : 0.9, d = horiz ? 0.9 : U(2.6, 3.8);
    const x = U(r.x0 + 4.5, r.x1 - 4.5), z = U(r.z0 + 4.5, r.z1 - 4.5), b = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, kind: 'cover' };
    if (blocks.some((o) => inter(rect(b), rect(o), 3.0))) continue; blocks.push(b);
  }
  return blocks.length >= 3 ? { shape: 'islands', blocks } : null;
}
function gallery(r) {
  const sides = ['zmin', 'zmax', 'xmin', 'xmax'].filter((s) => !roomSides(r).includes(s));
  if (!sides.length) return null;
  const side = sides[Math.floor(Math.random() * sides.length)], alongX = side[0] === 'z';
  const wallLen = alongX ? r.w : r.d, depth = U(4.5, 5.5), len = Math.min(wallLen - 12, wallLen * U(0.45, 0.62));
  if (len < 8) return null;
  const stairW = 3, stairRun = 4 * RUN;
  const span = len + stairRun; const lo = (alongX ? r.x0 : r.z0) + 1, hi = (alongX ? r.x1 : r.z1) - 1;
  if (span > hi - lo) return null;
  const a0 = U(lo, hi - span), flip = Math.random() < 0.5;       // which end the stairs are at
  const d0 = flip ? a0 + stairRun : a0, d1 = d0 + len, s0 = flip ? a0 : d1, s1 = s0 + stairRun;
  const near = side === 'zmin' || side === 'xmin';
  const deck = alongX
    ? { x0: d0, x1: d1, z0: near ? r.z0 : r.z1 - depth, z1: near ? r.z0 + depth : r.z1, kind: 'deck', top: DECK_H }
    : { x0: near ? r.x0 : r.x1 - depth, x1: near ? r.x0 + depth : r.x1, z0: d0, z1: d1, kind: 'deck', top: DECK_H };
  // the stairs climb along the wall toward the deck, 3 m wide, against the same wall
  const st = alongX
    ? { x0: s0, x1: s1, z0: near ? r.z0 : r.z1 - stairW, z1: near ? r.z0 + stairW : r.z1, kind: 'stairs', dir: flip ? '+x' : '-x' }
    : { x0: near ? r.x0 : r.x1 - stairW, x1: near ? r.x0 + stairW : r.x1, z0: s0, z1: s1, kind: 'stairs', dir: flip ? '+z' : '-z' };
  return { shape: 'gallery', blocks: [deck, st], deck, stairs: st };
}
function annex(r) {
  // a sample cell in one corner, its doorway facing the room
  const cw = R5(U(5.5, 7)), cd = R5(U(5, 6.5)), ix = Math.random() < 0.5 ? 0 : 1, iz = Math.random() < 0.5 ? 0 : 1, gap = 2.6, t = 0.3;
  const x0 = ix ? r.x1 - cw : r.x0, x1 = ix ? r.x1 : r.x0 + cw, z0 = iz ? r.z1 - cd : r.z0, z1 = iz ? r.z1 : r.z0 + cd;
  const blocks = [], cell = { x0, x1, z0, z1 };
  const wx = ix ? x0 : x1, wz = iz ? z0 : z1;                    // the two inner faces
  const openX = Math.random() < 0.5;                              // the doorway is in one of them, near the far end
  if (openX) { // the wall across x (face at wx) is whole; the wall along z (face at wz) has the doorway
    blocks.push({ x0: wx - t / 2, x1: wx + t / 2, z0, z1, kind: 'cell' });
    const g0 = ix ? x0 + 0.6 : x1 - 0.6 - gap; blocks.push({ x0: ix ? g0 + gap : x0, x1: ix ? x1 : g0, z0: wz - t / 2, z1: wz + t / 2, kind: 'cell' });
    if (ix) blocks.push({ x0: x0, x1: g0, z0: wz - t / 2, z1: wz + t / 2, kind: 'cell' });
  } else {
    blocks.push({ x0, x1, z0: wz - t / 2, z1: wz + t / 2, kind: 'cell' });
    const g0 = iz ? z0 + 0.6 : z1 - 0.6 - gap; blocks.push({ x0: wx - t / 2, x1: wx + t / 2, z0: iz ? g0 + gap : z0, z1: iz ? z1 : g0, kind: 'cell' });
    if (iz) blocks.push({ x0: wx - t / 2, x1: wx + t / 2, z0, z1: g0, kind: 'cell' });
  }
  return { shape: 'annex', blocks, cell };
}
// rows of fixtures are cut wherever they would cross the approach to a door
function splitRows(r, rows) {
  const lanes = roomSides(r).map((s) => laneRect(r, s, 0.9)), out = [];
  for (const row of rows) {
    const alongX = row.axis === 'x'; let segs = [[alongX ? row.x0 : row.z0, alongX ? row.x1 : row.z1]];
    for (const L of lanes) {
      if (!inter(L, rect(row))) continue;
      const lo = alongX ? L[0] : L[2], hi = alongX ? L[1] : L[3], next = [];
      for (const [a, b] of segs) { if (hi <= a || lo >= b) { next.push([a, b]); continue; } if (lo - a > 0) next.push([a, lo]); if (b - hi > 0) next.push([hi, b]); }
      segs = next;
    }
    for (const [a, b] of segs) if (b - a >= 3.2) out.push(alongX ? { ...row, x0: a, x1: b } : { ...row, z0: a, z1: b });
  }
  return out;
}
function aisles(r) {
  const alongX = r.w >= r.d, n = r.d >= 16 && !alongX || r.w >= 16 && alongX ? 3 : 2; const rows = [];
  const len = (alongX ? r.w : r.d) * 0.62, spread = (alongX ? r.d : r.w), pitch = Math.min(3.6, (spread - 7) / (n - 1 || 1));
  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2) * pitch;
    rows.push(alongX ? { x0: r.cx - len / 2, x1: r.cx + len / 2, z0: r.cz + off - 0.5, z1: r.cz + off + 0.5, axis: 'x' } : { x0: r.cx + off - 0.5, x1: r.cx + off + 0.5, z0: r.cz - len / 2, z1: r.cz + len / 2, axis: 'z' });
  }
  const cut = splitRows(r, rows);
  return cut.length >= 2 ? { shape: 'aisles', blocks: [], rows: cut } : null;
}
function dais(r) {
  const w = R5(r.w * U(0.3, 0.4)), d = R5(r.d * U(0.3, 0.4));
  const b = { x0: r.cx - w / 2, x1: r.cx + w / 2, z0: r.cz - d / 2, z1: r.cz + d / 2, kind: 'dais', top: RISE };
  return { shape: 'dais', blocks: [b], dais: b };
}
const BUILD = { ring, corner, chicane, divided, islands, gallery, annex, aisles, dais, open: () => ({ shape: 'open', blocks: [] }) };

// ---------------------------------------------------------------- acceptance
// A coarse floor plan of the room with every structure blocked out and dilated by the body of something that has to fit through, then asked the questions above.
function accept(r, plan) {
  const res = 0.5, nx = Math.ceil(r.w / res), nz = Math.ceil(r.d / res), wide = 1.0;
  const blocked = new Uint8Array(nx * nz); let solidCells = 0;
  const solids = plan.blocks.filter((b) => b.kind !== 'dais');
  for (const b of solids) if (b.x0 < r.x0 - 0.01 || b.x1 > r.x1 + 0.01 || b.z0 < r.z0 - 0.01 || b.z1 > r.z1 + 0.01) return false;
  const rows = (plan.rows || []).map((o) => ({ ...o }));
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = r.x0 + (i + 0.5) * res, z = r.z0 + (j + 0.5) * res; let blk = 0, raw = 0;
    for (const b of solids) {
      const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1)), d2 = (x - cx) ** 2 + (z - cz) ** 2;
      if (d2 === 0) raw = 1; if (d2 < wide * wide) blk = 1;
    }
    for (const o of rows) { const cx = Math.max(o.x0, Math.min(x, o.x1)), cz = Math.max(o.z0, Math.min(z, o.z1)); if ((x - cx) ** 2 + (z - cz) ** 2 < 0.8 * 0.8) blk = 1; }
    blocked[j * nx + i] = blk; solidCells += raw;
  }
  if (solidCells * res * res > 0.42 * r.w * r.d) return false;
  // lanes in front of every door stay clear of structure, and the doors reach each other
  const starts = [];
  for (const side of roomSides(r)) {
    const L = laneRect(r, side, 0.6); for (const b of solids) if (inter(L, rect(b))) return false;
    for (const o of rows) if (inter(L, rect(o))) return false;
    const t = doorT(r, side), px = side === 'zmin' ? t : side === 'zmax' ? t : side === 'xmin' ? r.x0 + 2.4 : r.x1 - 2.4, pz = side === 'xmin' ? t : side === 'xmax' ? t : side === 'zmin' ? r.z0 + 2.4 : r.z1 - 2.4;
    starts.push([px, pz]);
  }
  const cell = (x, z) => { const i = Math.floor((x - r.x0) / res), j = Math.floor((z - r.z0) / res); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i; };
  const seen = new Uint8Array(nx * nz); const s0 = cell(...starts[0]); if (s0 < 0 || blocked[s0]) return false;
  const q = [s0]; seen[s0] = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi], ci = c % nx, cj = (c / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue; const n = nj * nx + ni; if (blocked[n] || seen[n]) continue; seen[n] = 1; q.push(n); }
  }
  for (const [x, z] of starts) { const c = cell(x, z); if (c < 0 || !seen[c]) return false; }
  // most of the open floor is part of the one connected space: no sealed pockets, no thin dead-end slots
  let open = 0, reach = 0; for (let k = 0; k < blocked.length; k++) { if (!blocked[k]) { open++; if (seen[k]) reach++; } }
  if (open && reach / open < 0.9) return false;
  if (plan.shape === 'annex' && plan.cell) { const c = cell((plan.cell.x0 + plan.cell.x1) / 2, (plan.cell.z0 + plan.cell.z1) / 2); if (c < 0 || !seen[c]) return false; }
  return true;
}

// Designs the room's structure. Tries the intended archetype a few times with fresh numbers, then simpler ones, and always ends with something valid (open).
export function designRoom(r) {
  const order = [r.arch, r.arch, r.arch, r.arch, 'islands', 'open'];
  for (const id of order) {
    const plan = (BUILD[id] || BUILD.open)(r);
    if (plan && accept(r, plan)) { plan.arch = id; return plan; }
  }
  const p = BUILD.open(r); p.arch = 'open'; return p;
}
