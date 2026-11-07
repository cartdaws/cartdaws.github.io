import { LAB } from '../v2/flags.js';
import * as THREE from 'three';
import { FaceGuard } from './coplanar.js';
import { M, boxGeo, kitMaterial } from './materials.js';
import { Door } from './door.js';
import { mergeStatic } from './merge.js';
import { addSign } from './signs.js';
import { ARENA, HALL_ANCHOR } from './level.js';
import { rand } from '../core/util.js';
import { validateRun } from './validate.js';
import { designRoom, pickArch, sizeFor, DECK_H, RISE } from './layouts.js';
import { doorT, doorPos as geomDoorPos, laneRect, roomSides } from './roomgeom.js';

// Procedural facility: a winding chain of rooms joined by straight hallways, built from the same Blender kit,
// materials, doors and signage as the hand-made workshop. Every run is different.
//
// Layout: rooms sit on a coarse grid, one per cell, centred in it. A walk over the grid (south / east / west, never back)
// decides the order. Consecutive rooms are joined by a straight hallway between door openings that sit on the room's
// centre lines, so geometry can never overlap and every route is guaranteed to connect.

const PI = Math.PI;
const SPACING = 30;
const T = 0.5;            // wall thickness
const HALL_H = 3.5;
const FLOOR_Y = 0.0;
const SIDES = {
  zmin: { dir: [0, 1], rot: 0 },    // wall at the low-z edge; stepping into the room means moving +z
  zmax: { dir: [0, -1], rot: PI },
  xmin: { dir: [1, 0], rot: PI / 2 },
  xmax: { dir: [-1, 0], rot: -PI / 2 },
};

const irand = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffled = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const yawOf = (dx, dz) => Math.atan2(-dx, -dz);

const COMBAT_THEMES = [
  { id: 'assembly', name: ['ROBOTICS', 'ASSEMBLY LINE'], accent: '#d99a1c' },
  { id: 'cargo', name: ['CARGO HANDLING', 'BAY'], accent: '#d99a1c' },
  { id: 'foundry', name: ['FABRICATION', 'HALL'], accent: '#c9402a' },
  { id: 'range', name: ['SECURITY', 'TEST RANGE'], accent: '#3aa7b8' },
  { id: 'engineering', name: ['ENGINEERING', 'AUXILIARY PLANT'], accent: '#c9402a' },
];
const QUIET_THEMES = [
  { id: 'lab', name: ['SAMPLE ANALYSIS', 'LAB'], accent: '#3aa7b8' },
  { id: 'server', name: ['DATA CORE', 'ACCESS'], accent: '#3aa7b8' },
  { id: 'storage', name: ['EQUIPMENT', 'STORES'], accent: '#d99a1c' },
  { id: 'control', name: ['ROBOTICS', 'CONTROL ROOM'], accent: '#3aa7b8' },
  { id: 'containment', name: ['ISOLATION', 'CONTAINMENT'], accent: '#c9402a' },
  { id: 'crew', name: ['CREW DECK', 'QUARTERS AND MESS'], accent: '#d99a1c' },
];

// ---------------------------------------------------------------- layout

function walkGrid(n) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const cells = [{ gx: 0, gz: 0 }];
    const used = new Set(['0,0']);
    let horiz = 0, ok = true;
    while (cells.length < n) {
      const l = cells[cells.length - 1];
      const opts = [{ dx: 0, dz: 1, w: 3 }];
      if (horiz < 2) opts.push({ dx: 1, dz: 0, w: 1.6 }, { dx: -1, dz: 0, w: 1.6 });
      const free = opts.filter((o) => !used.has(`${l.gx + o.dx},${l.gz + o.dz}`));
      if (!free.length) { ok = false; break; }
      let r = Math.random() * free.reduce((s, o) => s + o.w, 0), c = free[0];
      for (const o of free) { r -= o.w; if (r <= 0) { c = o; break; } }
      horiz = c.dx ? horiz + 1 : 0;
      const nc = { gx: l.gx + c.dx, gz: l.gz + c.dz, from: c };
      cells.push(nc);
      used.add(`${nc.gx},${nc.gz}`);
    }
    if (ok) return cells;
  }
  return Array.from({ length: n }, (_, i) => ({ gx: 0, gz: i, from: { dx: 0, dz: 1 } }));
}

function planKinds(n) {
  const k = [];
  for (let i = 0; i < n; i++) {
    if (i === n - 1) k.push('finale');
    else if (i === 0 || i === n - 2) k.push('quiet');
    else {
      let t = Math.random() < 0.62 ? 'combat' : 'quiet';
      if (k[i - 1] === 'combat' && k[i - 2] === 'combat') t = 'quiet';
      if (k[i - 1] === 'quiet' && k[i - 2] === 'quiet') t = 'combat';
      k.push(t);
    }
  }
  return k;
}

function composeWave(depth, finale, wave) {
  const out = [];
  const add = (type, variant, n = 1) => { for (let i = 0; i < n; i++) out.push({ type, variant }); };
  if (LAB) {                     // V2: security androids, each kind teaching something different
    if (finale) { if (wave === 0) { add('android', 'trooper', 3); add('android', 'heavy', 1); } else { add('android', 'scout', 3); add('android', 'trooper', 1); add('android', 'heavy', 1); } return out; }
    add('android', 'trooper', 2); add('android', 'scout', 1); if (depth >= 1) add('android', 'heavy', 1);
    return out;
  }
  if (finale) {
    if (wave === 0) { add('android', 'trooper', 3); add('android', 'scout', 2); add('drone', 'std', 1); }
    else { add('android', 'heavy', 2); add('android', 'scout', 2); add('drone', 'armored', 1); }
    return out;
  }
  const total = Math.min(6, 3 + Math.floor(depth * 0.45) + irand(0, 1));
  let drones = depth >= 1 ? 1 : 0;
  if (depth >= 3 && Math.random() < 0.7) drones++;
  if (depth >= 6 && Math.random() < 0.5) drones++;
  drones = Math.min(drones, 3);
  for (let i = 0; i < drones; i++) add('drone', depth >= 4 && Math.random() < 0.45 ? 'armored' : 'std');
  while (out.length < total) {
    let v = 'trooper';
    const r = Math.random();
    if (depth >= 3 && r < 0.25) v = 'heavy';
    else if (depth >= 1 && r < 0.55) v = 'scout';
    add('android', v);
  }
  return out;
}

// ---------------------------------------------------------------- builder helpers

function makeBuilder(group, world, kit, boxes, lights) {
  const W = { add: (...a) => { const b = world.add(...a); boxes.push(b); return b; } };
  const guard = new FaceGuard(); (typeof scene !== "undefined" ? scene : group).userData.faceGuard = guard;
  const blk = (x0, x1, y0, y1, z0, z1, mat, solid = true, tag = '') => {
    const [a0, a1, b0, b1, c0, c1] = guard.fit([x0, x1, y0, y1, z0, z1]);
    const m = new THREE.Mesh(boxGeo(a1 - a0, b1 - b0, c1 - c0, 2, x0 * 3.1 + z0 * 1.7 + y0 * 0.9), mat);
    m.position.set((a0 + a1) / 2, (b0 + b1) / 2, (c0 + c1) / 2);
    group.add(m);
    if (solid) W.add(x0, y0, z0, x1, y1, z1, { tag });
    return m;
  };
  const deco = (x0, x1, y0, y1, z0, z1, mat) => blk(x0, x1, y0, y1, z0, z1, mat, false);
  const light = (x, y, z, color, intensity, dist = 22) => {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, y, z);
    group.add(l);
    lights.push(l);
    return l;
  };
  return { group, W, blk, deco, light, kit };
}

// A coarse floor plan of a room as it is furnished. A prop may only go where the doors can still reach one another through a passage a body fits in, and a spawn
// or pickup only where that space reaches it: so no arrangement of props can wall a door in, make a squeeze of a corridor, or strand something in a corner.
class RoomGrid {
  constructor(r) {
    // the validator asks for 0.85 m clear on each side: this asks for 2.3 m, so nothing is ever built near the limit and the two cannot disagree
    this.r = r; this.res = 0.4; this.R = 1.15;
    this.nx = Math.ceil(r.w / this.res); this.nz = Math.ceil(r.d / this.res); this.blocked = new Uint8Array(this.nx * this.nz); this.ver = 0; this.cache = null;
    const gaps = roomSides(r).map((side) => ({ side, t: doorT(r, side) }));
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const x = r.x0 + (i + 0.5) * this.res, z = r.z0 + (j + 0.5) * this.res; let b = x < r.x0 + this.R || x > r.x1 - this.R || z < r.z0 + this.R || z > r.z1 - this.R;
      if (b) for (const g of gaps) {      // the wall is dilated like any other, except through the doorway
        const along = g.side[0] === 'z' ? x : z, near = g.side === 'zmin' ? z < r.z0 + this.R : g.side === 'zmax' ? z > r.z1 - this.R : g.side === 'xmin' ? x < r.x0 + this.R : x > r.x1 - this.R;
        const other = g.side[0] === 'z' ? (x < r.x0 + this.R || x > r.x1 - this.R) : (z < r.z0 + this.R || z > r.z1 - this.R);
        if (near && !other && Math.abs(along - g.t) <= 1.52 - this.R) { b = false; break; }
      }
      this.blocked[j * this.nx + i] = b ? 1 : 0;
    }
    // the points a person stands at just inside each door
    this.starts = gaps.map(({ side, t }) => { const d = { zmin: [0, 1], zmax: [0, -1], xmin: [1, 0], xmax: [-1, 0] }[side]; const p = geomDoorPos(r, side); return [p.x + d[0] * 2.4, p.z + d[1] * 2.4]; });
  }
  cell(x, z) { const i = Math.floor((x - this.r.x0) / this.res), j = Math.floor((z - this.r.z0) / this.res); return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i; }
  cells(x0, x1, z0, z1) {
    const out = [], R = this.R, i0 = Math.max(0, Math.floor((x0 - R - this.r.x0) / this.res)), i1 = Math.min(this.nx - 1, Math.floor((x1 + R - this.r.x0) / this.res)), j0 = Math.max(0, Math.floor((z0 - R - this.r.z0) / this.res)), j1 = Math.min(this.nz - 1, Math.floor((z1 + R - this.r.z0) / this.res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.r.x0 + (i + 0.5) * this.res, z = this.r.z0 + (j + 0.5) * this.res, cx = Math.max(x0, Math.min(x, x1)), cz = Math.max(z0, Math.min(z, z1));
      if ((x - cx) ** 2 + (z - cz) ** 2 < R * R) out.push(j * this.nx + i);
    }
    return out;
  }
  flood() {
    const seen = new Uint8Array(this.blocked.length), q = []; const { nx, nz, blocked } = this;
    for (const [x, z] of this.starts) { const c = this.cell(x, z); if (c >= 0 && !blocked[c] && !seen[c]) { seen[c] = 1; q.push(c); break; } }
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], ci = c % nx, cj = (c / nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue; const n = nj * nx + ni; if (blocked[n] || seen[n]) continue; seen[n] = 1; q.push(n); }
    }
    return seen;
  }
  allReached(seen) { return this.starts.every(([x, z]) => { const c = this.cell(x, z); return c >= 0 && seen[c]; }); }
  commit(x0, x1, z0, z1) { for (const c of this.cells(x0, x1, z0, z1)) this.blocked[c] = 1; this.ver++; this.cache = null; }
  // would the doors still reach each other if this were put down?
  keepsOpen(x0, x1, z0, z1) {
    const cs = this.cells(x0, x1, z0, z1), was = cs.filter((c) => !this.blocked[c]); if (!was.length) return true;
    for (const c of was) this.blocked[c] = 1;
    const ok = this.allReached(this.flood());
    for (const c of was) this.blocked[c] = 0;
    return ok;
  }
  reach(x, z) { if (!this.cache) this.cache = this.flood(); const c = this.cell(x, z); return c >= 0 && !!this.cache[c]; }
}

// Keeps props from colliding with each other and from clogging door approaches.
class Placer {
  constructor() { this.rects = []; this.grid = null; }
  add(x0, x1, z0, z1, obstacle = false) { this.rects.push({ x0, x1, z0, z1 }); if (obstacle && this.grid) this.grid.commit(x0, x1, z0, z1); }
  free(x0, x1, z0, z1, pad) {
    for (const r of this.rects) if (!(x1 + pad < r.x0 || x0 - pad > r.x1 || z1 + pad < r.z0 || z0 - pad > r.z1)) return false;
    return this.grid ? this.grid.keepsOpen(x0, x1, z0, z1) : true;
  }
}

// ---------------------------------------------------------------- rooms

function makeRoomShell(B, r, mats) {
  const { x0, x1, z0, z1, h, cx, cz } = r;
  const { blk, deco } = B;
  const dark = mats.dark;
  const has = (s) => roomSides(r).includes(s);
  const cut = (a, b, c, door) => (door ? [[a, c - 1.52], [c + 1.52, b]] : [[a, b]]);        // 2 cm wider than the door frame's opening: the frame hides it, and its faces and the wall's no longer share a plane

  deco(x0 - T, x1 + T, -0.2, FLOOR_Y, z0 - T, z1 + T, M.floor);
  blk(x0 - T, x1 + T, h, h + 0.4, z0 - T, z1 + T, M.wall);
  for (const side of ['zmin', 'zmax']) {
    const za = side === 'zmin' ? z0 - T : z1, zb = side === 'zmin' ? z0 : z1 + T;
    for (const [a, b] of cut(x0 - T, x1 + T, doorT(r, side), has(side))) blk(a, b, 0, h, za, zb, M.wall);
    if (has(side)) blk(doorT(r, side) - 1.52, doorT(r, side) + 1.52, 3.03, h, za, zb, M.wall);
    const pz = side === 'zmin' ? z0 : z1 - 0.04;
    for (const [a, b] of cut(x0, x1, doorT(r, side), has(side))) deco(a, b, 0, 0.3, pz, pz + 0.04, dark);
  }
  for (const side of ['xmin', 'xmax']) {
    const xa = side === 'xmin' ? x0 - T : x1, xb = side === 'xmin' ? x0 : x1 + T;
    for (const [a, b] of cut(z0, z1, doorT(r, side), has(side))) blk(xa, xb, 0, h, a, b, M.wall);
    if (has(side)) blk(xa, xb, 3.03, h, doorT(r, side) - 1.52, doorT(r, side) + 1.52, M.wall);
    const px = side === 'xmin' ? x0 : x1 - 0.04;
    for (const [a, b] of cut(z0, z1, doorT(r, side), has(side))) deco(px, px + 0.04, 0, 0.3, a, b, dark);
  }

  // structural ribs along the walls, kept clear of doorways
  const ribName = h > 5 ? 'wall_rib_65' : 'wall_rib_45';
  const ribs = (side, from, to, step) => {
    const n = Math.max(1, Math.floor((to - from) / step));
    for (let i = 0; i < n; i++) {
      const t = from + ((i + 0.5) * (to - from)) / n;
      const along = doorT(r, side);
      if (has(side) && Math.abs(t - along) < 2.4) continue;
      const rot = SIDES[side].rot;
      if (side === 'zmin') B.kit.place(B.group, ribName, { x: t, z: z0 + 0.14, rotY: rot });
      else if (side === 'zmax') B.kit.place(B.group, ribName, { x: t, z: z1 - 0.14, rotY: rot });
      else if (side === 'xmin') B.kit.place(B.group, ribName, { x: x0 + 0.14, z: t, rotY: rot });
      else B.kit.place(B.group, ribName, { x: x1 - 0.14, z: t, rotY: rot });
    }
  };
  const step = h > 5 ? 5.4 : 4.6;
  ribs('zmin', x0 + 1, x1 - 1, step); ribs('zmax', x0 + 1, x1 - 1, step);
  ribs('xmin', z0 + 1, z1 - 1, step); ribs('xmax', z0 + 1, z1 - 1, step);

  // overhead structure
  if (h > 5) {
    const longX = r.w >= r.d;
    const struct = kitMaterial('PaintStructural');
    if (longX) for (const f of [0.28, 0.72]) { const z = z0 + r.d * f; deco(x0 + 0.2, x1 - 0.2, h - 0.9, h - 0.4, z - 0.25, z + 0.25, struct); }
    else for (const f of [0.28, 0.72]) { const x = x0 + r.w * f; deco(x - 0.25, x + 0.25, h - 0.9, h - 0.4, z0 + 0.2, z1 - 0.2, struct); }
    for (const f of [0.25, 0.5, 0.75]) {
      if (longX) { const x = x0 + r.w * f; deco(x - 0.2, x + 0.2, h - 0.6, h - 0.3, z0 + 0.2, z1 - 0.2, dark); }
      else { const z = z0 + r.d * f; deco(x0 + 0.2, x1 - 0.2, h - 0.6, h - 0.3, z - 0.2, z + 0.2, dark); }
    }
  } else {
    for (const f of [0.33, 0.67]) { const z = z0 + r.d * f; deco(x0, x1, h - 0.16, h, z - 0.16, z + 0.16, dark); }
  }
}

function roomLighting(B, r, L, mats) {
  const { x0, z0, w, d, h } = r;
  const nx = w >= 18 ? 2 : 1, nz = d >= 18 ? 2 : 1;
  const cool = r.theme.id === 'foundry' ? 0xd8cdb8 : r.theme.id === 'server' ? 0xa8d0e0 : 0xc4d8ee;
  const base = r.kind === 'quiet' ? 70 : h > 5 ? 120 : 80;
  const dist = r.kind === 'quiet' ? 17 : 24;
  let n = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = x0 + ((i + 0.5) * w) / nx, z = z0 + ((j + 0.5) * d) / nz;
    B.deco(x - 1.2, x + 1.2, h - 0.06, h, z - 0.4, z + 0.4, mats.lamp);
    const lt = B.light(x, h - 0.5, z, cool, nx * nz === 1 ? base * 1.4 : base, dist);
    L.flicker.push({ l: lt, base: lt.intensity, broken: n === 0 && Math.random() < 0.22, ph: Math.random() * 9 });
    n++;
  }
  for (const f of [0.5]) B.deco(x0 + w * f - 0.7, x0 + w * f + 0.7, h - 0.06, h, z0 + d * 0.5 - 0.3, z0 + d * 0.5 + 0.3, mats.lamp);
  // lockdown lamps
  if (r.kind === 'combat' || r.kind === 'finale') {
    const a = B.light(x0 + 1.5, h - 1.2, r.cz, 0xff1a10, 0, 20);
    const b = B.light(r.x1 - 1.5, h - 1.2, r.cz, 0xff1a10, 0, 20);
    L.alarmLights.push(a, b);
  }
}

// ---------------------------------------------------------------- furnishing

// What a room's structure is built from, then what stands in it. Structure comes from the plan (layouts.js); here it is made solid, and furnished by the room's purpose.
function buildPlan(B, r, mats) {
  const plan = r.plan; if (!plan) return;
  const { blk, deco } = B, h = r.h;
  const struct = kitMaterial('PaintStructural'), equip = kitMaterial('PaintEquipment'), dark = mats.dark;
  for (const b of plan.blocks) {
    if (b.kind === 'wall') {
      blk(b.x0, b.x1, 0, h, b.z0, b.z1, M.wall);
      deco(b.x0 - 0.04, b.x1 + 0.04, 0, 0.3, b.z0 - 0.04, b.z1 + 0.04, dark);                                      // the skirting, as on the outer walls
    } else if (b.kind === 'cell') {
      blk(b.x0, b.x1, 0, 1.0, b.z0, b.z1, M.wall);
      blk(b.x0, b.x1, 1.0, 3.2, b.z0, b.z1, M.glass, true, 'glass');                                                 // a sample cell: a low wall under glass
      deco(b.x0 - 0.03, b.x1 + 0.03, 3.2, 3.32, b.z0 - 0.03, b.z1 + 0.03, dark);
    } else if (b.kind === 'cover') {
      blk(b.x0, b.x1, 0, 1.1, b.z0, b.z1, struct);
      deco(b.x0 - 0.03, b.x1 + 0.03, 1.1, 1.14, b.z0 - 0.03, b.z1 + 0.03, M.hazard);
      deco(b.x0 - 0.03, b.x1 + 0.03, 0, 0.12, b.z0 - 0.03, b.z1 + 0.03, dark);
    } else if (b.kind === 'deck') {
      blk(b.x0, b.x1, 0, b.top - 0.12, b.z0, b.z1, dark);
      blk(b.x0, b.x1, b.top - 0.12, b.top, b.z0, b.z1, equip);
      // a hazard edge along the side that faces the room
      const alongX = (b.x1 - b.x0) >= (b.z1 - b.z0), nearLow = alongX ? (b.z0 - r.z0) < (r.z1 - b.z1) : (b.x0 - r.x0) < (r.x1 - b.x1);
      if (alongX) { const z = nearLow ? b.z1 - 0.3 : b.z0; deco(b.x0, b.x1, b.top, b.top + 0.012, z, z + 0.3, M.hazard); }
      else { const x = nearLow ? b.x1 - 0.3 : b.x0; deco(x, x + 0.3, b.top, b.top + 0.012, b.z0, b.z1, M.hazard); }
    } else if (b.kind === 'stairs') {
      const n = 4, d = b.dir, alongX = d[1] === 'x', up = d[0] === '+';
      for (let k = 0; k < n; k++) {
        const top = (k + 1) * RISE, a0 = alongX ? b.x0 : b.z0, a1 = alongX ? b.x1 : b.z1, len = (a1 - a0) / n;
        const lo = up ? a0 + k * len : a1 - (k + 1) * len, hi = lo + len;
        const box = alongX ? [lo, hi, b.z0, b.z1] : [b.x0, b.x1, lo, hi];
        blk(box[0], box[1], 0, top - 0.04, box[2], box[3], dark);
        blk(box[0], box[1], top - 0.04, top, box[2], box[3], equip);
      }
    } else if (b.kind === 'dais') {
      blk(b.x0, b.x1, 0, b.top - 0.03, b.z0, b.z1, dark);
      blk(b.x0, b.x1, b.top - 0.03, b.top, b.z0, b.z1, equip);
    }
  }
}

function furnish(B, r, placer, L) {
  const kit = B.kit;
  const { x0, x1, z0, z1, cx, cz } = r;
  const plan = r.plan || { blocks: [], shape: 'open' };
  const solid = (name, x, z, rot = 0, y = 0) => {
    kit.solid(B.group, B.W, name, x, z, rot, y);
    const f = kit.footprint(name, rot);
    placer.add(x - f.w / 2, x + f.w / 2, z - f.d / 2, z + f.d / 2, y < 0.3);
    (r.props || (r.props = [])).push({ name, x0: x - f.w / 2, x1: x + f.w / 2, z0: z - f.d / 2, z1: z + f.d / 2, y0: y, y1: y + f.h });
    return f;
  };
  // the kit has no collider for a chair: a small box, so you bump into it like everything else in the room
  const chair = (x, z, rot = 0) => { kit.place(B.group, 'chair', { x, z, rotY: rot }); B.W.add(x - 0.26, 0, z - 0.26, x + 0.26, 0.61, z + 0.26); placer.add(x - 0.3, x + 0.3, z - 0.3, z + 0.3, true); };
  const hasDoor = (s) => roomSides(r).includes(s);

  // what is already there is reserved first: the approach to every door, then the room's own structure
  placer.grid = new RoomGrid(r);
  for (const s of roomSides(r)) { const [a, b, c, d] = laneRect(r, s); placer.add(a, b, c, d); }
  for (const b of plan.blocks) placer.add(b.x0, b.x1, b.z0, b.z1, b.kind !== 'dais');
  if (plan.stairs) { const s = plan.stairs, e = 1.6, d = s.dir; if (d === '+x') placer.add(s.x0 - e, s.x0, s.z0, s.z1); else if (d === '-x') placer.add(s.x1, s.x1 + e, s.z0, s.z1); else if (d === '+z') placer.add(s.x0, s.x1, s.z0 - e, s.z0); else placer.add(s.x0, s.x1, s.z1, s.z1 + e); }

  const sides = shuffled(['zmin', 'zmax', 'xmin', 'xmax']);
  const wallsFree = sides.filter((s) => !hasDoor(s));
  const beaconed = [];

  // pieces standing against an outer wall, in a row, never in front of a door
  const line = (name, side, count, gap = 0.12) => {
    const rot = SIDES[side].rot;
    const f = kit.footprint(name, rot);
    const zs = side[0] === 'z';
    const lo = zs ? x0 : z0, hi = zs ? x1 : z1, ctr = doorT(r, side);
    const len = zs ? f.w : f.d;
    let placed = 0;
    for (let tries = 0; tries < 40 && placed < count; tries++) {
      const a = rand(lo + len / 2 + 0.7, hi - len / 2 - 0.7);
      if (hasDoor(side) && Math.abs(a - ctr) < len / 2 + 2.3) continue;
      const x = zs ? a : side === 'xmin' ? x0 + f.w / 2 + gap : x1 - f.w / 2 - gap;
      const z = zs ? (side === 'zmin' ? z0 + f.d / 2 + gap : z1 - f.d / 2 - gap) : a;
      if (!placer.free(x - f.w / 2, x + f.w / 2, z - f.d / 2, z + f.d / 2, 0.25)) continue;
      solid(name, x, z, rot);
      placed++;
    }
    return placed;
  };
  const scatter = (name, count, pad = 1.5, rots = [0, PI / 2, PI, -PI / 2], y = 0) => {
    let placed = 0;
    for (let tries = 0; tries < 60 && placed < count; tries++) {
      const rot = pick(rots);
      const f = kit.footprint(name, rot);
      const x = rand(x0 + 1.6 + f.w / 2, x1 - 1.6 - f.w / 2), z = rand(z0 + 1.6 + f.d / 2, z1 - 1.6 - f.d / 2);
      if (!placer.free(x - f.w / 2, x + f.w / 2, z - f.d / 2, z + f.d / 2, pad)) continue;
      solid(name, x, z, rot, y);
      placed++;
      r._last = { x, z, f, rot };
    }
    return placed;
  };
  // the same inside a rectangle (the sample cell, a deck)
  const scatterIn = (rc, name, count, pad = 0.3, y = 0, rots = [0, PI / 2, PI, -PI / 2]) => {
    let placed = 0;
    for (let tries = 0; tries < 50 && placed < count; tries++) {
      const rot = pick(rots), f = kit.footprint(name, rot);
      if (rc.x1 - rc.x0 < f.w + 0.8 || rc.z1 - rc.z0 < f.d + 0.8) continue;
      const x = rand(rc.x0 + 0.4 + f.w / 2, rc.x1 - 0.4 - f.w / 2), z = rand(rc.z0 + 0.4 + f.d / 2, rc.z1 - 0.4 - f.d / 2);
      if (!placer.free(x - f.w / 2, x + f.w / 2, z - f.d / 2, z + f.d / 2, pad)) continue;
      solid(name, x, z, rot, y); placed++; r._last = { x, z, f, rot };
    }
    return placed;
  };
  // equipment against the faces of the room's own inner walls: they are walls too
  const innerFaces = () => {
    const out = [];
    for (const b of plan.blocks) {
      if (b.kind !== 'wall') continue;
      for (const f of [{ n: [0, 1], ax: 'x', c: b.z1, lo: b.x0, hi: b.x1 }, { n: [0, -1], ax: 'x', c: b.z0, lo: b.x0, hi: b.x1 }, { n: [1, 0], ax: 'z', c: b.x1, lo: b.z0, hi: b.z1 }, { n: [-1, 0], ax: 'z', c: b.x0, lo: b.z0, hi: b.z1 }]) {
        const mx = f.ax === 'x' ? (f.lo + f.hi) / 2 : f.c + f.n[0] * 0.6, mz = f.ax === 'x' ? f.c + f.n[1] * 0.6 : (f.lo + f.hi) / 2;
        if (mx < x0 + 0.3 || mx > x1 - 0.3 || mz < z0 + 0.3 || mz > z1 - 0.3) continue;            // that is an outer wall: line() covers those
        if (plan.blocks.some((o) => o !== b && mx > o.x0 && mx < o.x1 && mz > o.z0 && mz < o.z1)) continue;
        out.push({ ...f });
      }
    }
    return out;
  };
  const inner = (name, count, gap = 0.1) => {
    let placed = 0;
    for (const f of shuffled(innerFaces())) {
      if (placed >= count) break;
      const rot = f.n[1] === 1 ? 0 : f.n[1] === -1 ? PI : f.n[0] === 1 ? PI / 2 : -PI / 2, fp = kit.footprint(name, rot), len = f.ax === 'x' ? fp.w : fp.d;
      if (f.hi - f.lo < len + 1.4) continue;
      for (let t = 0; t < 12 && placed < count; t++) {
        const a = rand(f.lo + len / 2 + 0.5, f.hi - len / 2 - 0.5);
        const x = f.ax === 'x' ? a : f.c + f.n[0] * (fp.w / 2 + gap), z = f.ax === 'x' ? f.c + f.n[1] * (fp.d / 2 + gap) : a;
        if (!placer.free(x - fp.w / 2, x + fp.w / 2, z - fp.d / 2, z + fp.d / 2, 0)) continue;
        solid(name, x, z, rot); placed++; r._last = { x, z, f: fp, rot };
      }
    }
    return placed;
  };
  // rows of the same fixture in the aisles plan, facing the aisle, with a gap in the middle to cross
  const fillRows = (name) => {
    for (const row of plan.rows || []) {
      const alongX = row.axis === 'x', mid = alongX ? (row.z0 + row.z1) / 2 : (row.x0 + row.x1) / 2;
      const rot = alongX ? (mid < cz ? 0 : PI) : (mid < cx ? PI / 2 : -PI / 2), fp = kit.footprint(name, rot), step = (alongX ? fp.w : fp.d) + 0.04;
      const lo = alongX ? row.x0 : row.z0, hi = alongX ? row.x1 : row.z1, c = (lo + hi) / 2;
      for (let p = lo + step / 2; p + step / 2 <= hi + 0.01; p += step) {
        if (hi - lo > 8 && Math.abs(p - c) < 1.4 + step / 2 - 0.02) continue;
        const x = alongX ? p : mid, z = alongX ? mid : p;
        if (placer.free(x - fp.w / 2, x + fp.w / 2, z - fp.d / 2, z + fp.d / 2, 0)) solid(name, x, z, rot);
      }
    }
  };

  const theme = r.theme.id;
  const big = r.w >= 20 && r.d >= 18;
  const bare = plan.shape === 'open' || plan.shape === 'islands';
  if (r.kind !== 'quiet') {
    if (theme === 'assembly' || r.kind === 'finale') {
      if (big && bare) { const rot = Math.random() < 0.5 ? 0 : PI / 2, f = kit.footprint('robot_test_cell', rot); if (placer.free(cx - f.w / 2, cx + f.w / 2, cz - f.d / 2, cz + f.d / 2, 1.6)) solid('robot_test_cell', cx, cz, rot); }
      scatter('pillar', big ? 2 : 3, 2.8);
      for (const n of shuffled(['equip_cabinet_A', 'equip_cabinet_B', 'equip_cabinet_C', 'equip_cabinet_D']).slice(0, 2)) { if (scatter(n, 1, 1.9)) beaconed.push([n, r._last]); }
      line('charging_dock', wallsFree[0] || 'zmin', irand(2, 4));
      scatter('assembly_arm', big ? 2 : 1, 2.4);
      inner('equip_cabinet_C', 1);
      scatter('barrier_26', 2); scatter('barrier_22', 2); scatter('canister', 2, 1.2);
    } else if (theme === 'cargo') {
      for (let i = 0; i < irand(3, 4); i++) { if (scatter('crate_A', 1, 1.7)) solid('crate_top', r._last.x, r._last.z, 0, 1.4); }
      scatter('crate_B', 3, 1.5); scatter('barrier_26', 3);
      line('storage_rack', wallsFree[0] || 'zmin', irand(2, 3)); line('storage_rack', wallsFree[1] || 'xmin', irand(1, 3)); inner('storage_rack', 2);
      scatter('canister', 3, 1.2); scatter('fuel_tank', 1, 2.0, [0, PI]); line('pipe_bank', wallsFree[2] || 'xmax', 1);
      if (scatter('equip_cabinet_C', 1, 1.9)) beaconed.push(['equip_cabinet_C', r._last]);
    } else if (theme === 'foundry') {
      scatter('pillar', irand(3, 5), 2.6);
      line('workstation', wallsFree[0] || 'zmin', irand(2, 3)); line('workstation', wallsFree[1] || 'xmin', irand(1, 2)); inner('workstation', 1);
      scatter('barrier_22', 3); scatter('canister', 2, 1.2); line('pipe_bank', wallsFree[2] || 'xmax', irand(1, 2)); scatter('fuel_tank', 1, 2.0, [0, PI]);
      if (scatter('equip_cabinet_D', 1, 1.9)) beaconed.push(['equip_cabinet_D', r._last]);
      if (scatter('equip_cabinet_A', 1, 1.9)) beaconed.push(['equip_cabinet_A', r._last]);
    } else if (theme === 'engineering') {
      scatter('generator', bare && big ? 2 : 1, 3.0);
      line('pipe_bank', wallsFree[0] || 'zmin', irand(2, 3)); line('pipe_bank', wallsFree[1] || 'xmax', 1); inner('pipe_bank', 2);
      scatter('fuel_tank', 1, 2.0, [0, PI]); scatter('barrier_22', 2); scatter('canister', 2, 1.2); inner('equip_cabinet_B', 1);
      if (scatter('equip_cabinet_B', 1, 1.9)) beaconed.push(['equip_cabinet_B', r._last]);
    } else { // range
      scatter('barrier_26', 5, 1.7); scatter('pillar', 2, 2.8); scatter('crate_B', 2, 1.5);
      line('workstation', wallsFree[0] || 'zmin', irand(2, 3)); line('charging_dock', wallsFree[1] || 'xmin', irand(1, 2)); line('pipe_bank', wallsFree[2] || 'xmax', 1); inner('barrier_26', 1);
    }
    // a gallery's deck is somewhere to hold: cover on it, and a console that could be anything
    if (plan.deck) { const D = plan.deck; scatterIn(D, 'barrier_22', 1, 0.2, DECK_H, [0, PI / 2]); scatterIn(D, 'crate_B', 1, 0.2, DECK_H, [0, PI / 2]); }
    for (const [name, p] of beaconed) {
      const f = p.f;
      kit.place(B.group, 'beacon', { x: p.x, y: f.h + 0.14, z: p.z });
      for (const m of kit.place(B.group, 'LENS_beacon', { x: p.x, y: f.h + 0.14, z: p.z })) m.material = L.beaconMat;
    }
    // explosive drums on a marked pad
    const pairs = irand(1, 2);
    for (let i = 0; i < pairs; i++) {
      for (let t = 0; t < 40; t++) {
        const x = rand(x0 + 3, x1 - 3), z = rand(z0 + 3, z1 - 3);
        if (!placer.free(x - 1.4, x + 1.4, z - 1.0, z + 1.0, 0.9)) continue;
        placer.add(x - 1.4, x + 1.4, z - 1.0, z + 1.0, true);
        r.barrels.push({ x: x - 0.45, z }, { x: x + 0.5, z: z + rand(-0.3, 0.3) });
        const th = 0.12;
        for (const [a, b, c, d] of [[x - 1.3, x + 1.3, z - 0.95, z - 0.95 + th], [x - 1.3, x + 1.3, z + 0.95 - th, z + 0.95], [x - 1.3, x - 1.3 + th, z - 0.95, z + 0.95], [x + 1.3 - th, x + 1.3, z - 0.95, z + 0.95]]) B.deco(a, b, 0.012, 0.05, c, d, M.hazard);
        break;
      }
    }
  } else {
    if (theme === 'lab') {
      if (plan.cell) { scatterIn(plan.cell, 'cryo_pod', irand(1, 2), 0.3); scatterIn(plan.cell, 'instrument_cart', 1, 0.3); }
      line('storage_cabinet', wallsFree[0] || 'zmin', irand(3, 5)); line('storage_cabinet', wallsFree[1] || 'xmin', irand(2, 3)); inner('storage_cabinet', 2);
      for (let i = 0; i < irand(2, 3); i++) { if (scatter('analysis_bench', 1, 1.5, [0, PI / 2])) chair(r._last.x + 0.1, r._last.z + (r._last.rot === 0 ? 1.0 : 0), 0.3 * i); }
      scatter('instrument_cart', 2, 1.1); scatter('restraint_bed', 1, 1.8, [0, PI / 2]); scatter('cryo_pod', irand(1, 2), 1.7);
    } else if (theme === 'server') {
      fillRows('server_rack');
      line('server_rack', wallsFree[0] || 'zmin', irand(3, 5)); line('server_rack', wallsFree[1] || 'xmax', irand(1, 3)); line('pipe_bank', wallsFree[2] || 'xmin', 1);
      inner('server_rack', 2);
      for (let i = 0; i < 2; i++) { if (scatter('monitor_station', 1, 1.6, [0, PI])) chair(r._last.x, r._last.z + (r._last.rot === 0 ? 1.1 : -1.1), r._last.rot + PI); }
    } else if (theme === 'storage') {
      fillRows('storage_rack');
      line('storage_rack', wallsFree[0] || 'zmin', irand(2, 4)); line('storage_rack', wallsFree[1] || 'xmin', irand(2, 3)); inner('storage_rack', 2);
      scatter('crate_A', 2, 1.6); scatter('crate_B', 3, 1.5); scatter('canister', 3, 1.2); scatter('barrier_22', 1);
    } else if (theme === 'containment') {
      if (plan.cell) scatterIn(plan.cell, 'cryo_pod', 2, 0.3);
      line('cryo_pod', wallsFree[0] || 'zmin', irand(3, 4)); scatter('restraint_bed', irand(1, 2), 1.8, [0, PI / 2]);
      line('storage_cabinet', wallsFree[1] || 'xmin', 2); inner('cryo_pod', 1); scatter('instrument_cart', 1, 1.1);
    } else if (theme === 'crew') {
      line('bunk_bed', wallsFree[0] || 'zmin', irand(3, 4)); line('bunk_bed', wallsFree[1] || 'xmin', irand(1, 2)); inner('bunk_bed', 1);
      line('storage_cabinet', wallsFree[2] || 'xmax', irand(2, 3)); scatter('mess_table', irand(1, 2), 1.8, [0, PI / 2]); scatter('canister', 1, 1.2);
    } else {          // control rooms, and the chart room
      if (plan.dais) solid('monitor_station', (plan.dais.x0 + plan.dais.x1) / 2, (plan.dais.z0 + plan.dais.z1) / 2, 0, RISE);
      line('workstation', wallsFree[0] || 'zmin', irand(3, 4));
      for (let i = 0; i < 2; i++) { if (scatter('monitor_station', 1, 1.6, [0, PI])) chair(r._last.x, r._last.z + (r._last.rot === 0 ? 1.1 : -1.1), r._last.rot + PI); }
      line('server_rack', wallsFree[1] || 'xmax', 2); scatter('instrument_cart', 1, 1.1);
    }
  }
  // cable trays overhead, with slack: a ship has wiring, and it is never taut. Spaced so no two lie on each other.
  const swags = [];
  for (let t = 0, n = Math.round(r.w * r.d / 80) + 1; t < 30 && swags.length < n; t++) {
    const x = rand(x0 + 2.5, x1 - 2.5), z = rand(z0 + 2.5, z1 - 2.5);
    if (swags.some((s) => Math.hypot(s.x - x, s.z - z) < 4.2)) continue;
    swags.push({ x, z }); kit.place(B.group, 'cable_swag', { x, y: r.h - 0.02 - swags.length * 0.004, z, rotY: pick([0, PI / 2]) });
  }
}

function freeSpot(r, placer, { pad = 1.0, minFromIn = 0, avoid = [], tries = 120 } = {}) {
  const ip = r.inPoint;
  // Crowded rooms relax the spacing step by step; a final scan takes any open spot so nothing ever lands inside a prop.
  for (const k of [1, 0.8, 0.65]) {
    for (let t = 0; t < tries; t++) {
      const x = rand(r.x0 + 1.8, r.x1 - 1.8), z = rand(r.z0 + 1.8, r.z1 - 1.8);
      if (!placer.free(x - 0.3, x + 0.3, z - 0.3, z + 0.3, Math.max(0.7, pad * k))) continue;
      if (placer.grid && !placer.grid.reach(x, z)) continue;
      if (k === 1 && ip && Math.hypot(x - ip.x, z - ip.z) < minFromIn) continue;
      if (k < 1 ? false : avoid.some((a) => Math.hypot(a.x - x, a.z - z) < 2.4)) continue;
      return { x, z };
    }
  }
  for (let x = r.x0 + 1.8; x <= r.x1 - 1.8; x += 0.6) for (let z = r.z0 + 1.8; z <= r.z1 - 1.8; z += 0.6) {
    if (placer.free(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0.7) && (!placer.grid || placer.grid.reach(x, z))) return { x, z };
  }
  return { x: r.cx, z: r.cz };
}

// ---------------------------------------------------------------- halls

function buildHall(B, L, axis, fixed, t0, t1, mats, label, flicker) {
  const { blk, deco, light } = B;
  const hb = (uA, uB, y0, y1, tA, tB, mat, solid) => (axis === 'z' ? blk(fixed + uA, fixed + uB, y0, y1, tA, tB, mat, solid) : blk(tA, tB, y0, y1, fixed + uA, fixed + uB, mat, solid));
  const hd = (uA, uB, y0, y1, tA, tB, mat) => hb(uA, uB, y0, y1, tA, tB, mat, false);
  const len = t1 - t0;
  hd(-2, 2, -0.2, FLOOR_Y, t0, t1, M.floor);
  hb(-2, -1.52, 0, HALL_H, t0, t1, M.wall, true); hb(1.52, 2, 0, HALL_H, t0, t1, M.wall, true);
  hb(-2, 2, HALL_H, HALL_H + 0.4, t0, t1, M.wall, true);
  hd(-1.5, -1.46, 0, 0.2, t0, t1, mats.dark); hd(1.46, 1.5, 0, 0.2, t0, t1, mats.dark);
  hd(-1.3, -1.2, 0.012, 0.03, t0, t1, M.hazard); hd(1.2, 1.3, 0.012, 0.03, t0, t1, M.hazard);
  // overhead cable runs
  hd(-1.1, -0.9, HALL_H - 0.12, HALL_H, t0, t1, mats.rubber); hd(0.9, 1.1, HALL_H - 0.12, HALL_H, t0, t1, mats.rubber);
  const n = Math.max(1, Math.round(len / 5.5));
  for (let i = 0; i < n; i++) {
    const t = t0 + ((i + 0.5) * len) / n;
    hd(-0.6, 0.6, HALL_H - 0.06, HALL_H, t - 0.35, t + 0.35, mats.lamp);
    if (i % 2 === 0 || n === 1) {
      const p = axis === 'z' ? [fixed, HALL_H - 0.5, t] : [t, HALL_H - 0.5, fixed];
      const lt = light(p[0], p[1], p[2], 0xc8dcf0, 34, 10);
      L.flicker.push({ l: lt, base: 34, broken: flicker && i === 0, ph: Math.random() * 9 });
    }
  }
  if (label && len > 5) {
    const t = t0 + len * 0.5;
    const o = { accent: label.accent, arrow: label.arrow || '', w: 1024, h: 256 };
    if (axis === 'z') addSign(B.group, label.lines, 1.7, fixed - 1.43, 2.2, t, PI / 2, o);
    else addSign(B.group, label.lines, 1.7, t, 2.2, fixed - 1.43, 0, o);
  }
}

// A sign hangs on a wall where nothing built against it hides it
const signHidden = (r, side, b) => (side === 'zmin' ? b.z0 <= r.z0 + 0.6 && b.x1 > r.x0 + 4 && b.x0 < r.x1 - 4 && (b.x1 - b.x0) > r.w * 0.5 : side === 'zmax' ? b.z1 >= r.z1 - 0.6 && (b.x1 - b.x0) > r.w * 0.5 : side === 'xmin' ? b.x0 <= r.x0 + 0.6 && (b.z1 - b.z0) > r.d * 0.5 : b.x1 >= r.x1 - 0.6 && (b.z1 - b.z0) > r.d * 0.5);

// ---------------------------------------------------------------- the run

// A small seeded generator, so any layout can be reproduced and tested from its number.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Builds a facility, checks it, and builds another from the next seed if the check fails: a layout that cannot be walked never reaches the player.
// opts.seed fixes the first attempt; opts.retries is how many more may be tried (0 for a measurement).
export function generateRun(game, opts = {}) {
  const seed = (opts.seed ?? Math.floor(Math.random() * 4294967296)) >>> 0, retries = opts.retries ?? 6, rejected = [];
  let run = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const s = (seed + attempt * 7919) >>> 0, orig = Math.random;
    Math.random = seededRandom(s);
    try { run = buildRun(game); } finally { Math.random = orig; }
    run.seed = s; run.attempt = attempt;
    run.issues = validateRun(game, run);
    if (!run.issues.length || attempt === retries) break;
    rejected.push({ seed: s, issues: run.issues.slice(0, 4) });
    disposeRun(game, run);
  }
  run.rejected = rejected;
  if (run.issues.length) console.warn('generated run still has issues', run.seed, run.issues);
  return run;
}

function buildRun(game) {
  const { scene, world, kit } = game;
  const L = game.level;
  const group = new THREE.Group();
  scene.add(group);
  const boxes = [], lights = [];
  const B = makeBuilder(group, world, kit, boxes, lights);
  const lampMat = M.white.clone(); lampMat.userData.noSnap = true;
  const mats = { dark: kitMaterial('PaintDark'), rubber: kitMaterial('Rubber'), lamp: lampMat };
  const run = { group, boxes, lights, alarmLights: [], flicker: [], rooms: [], merged: [], hasKey: false, keyRoom: null, lockRoom: null };
  const Lr = { flicker: run.flicker, alarmLights: run.alarmLights, beaconMat: L.beaconMat };

  // ---- plan
  const N = LAB ? 5 : irand(9, 11);
  const cells = walkGrid(N);
  const kinds = LAB ? ['quiet', 'combat', 'combat', 'quiet', 'finale'] : planKinds(N);
  // the key lives in a combat room, the locked door in a quiet room beyond it
  let keyIdx = kinds.map((k, i) => (k === 'combat' && i >= 1 && i <= N - 4 ? i : -1)).filter((i) => i >= 0);
  if (!keyIdx.length) { kinds[2] = 'combat'; keyIdx = [2]; }
  keyIdx = pick(keyIdx);
  // the room before the last fight is always the chart room, so the door there has its own reason; the pass-locked door is another room, when there is one
  const lockCands = kinds.map((k, i) => (k === 'quiet' && i >= keyIdx + 2 && i < N - 2 ? i : -1)).filter((i) => i >= 0);
  const lockIdx = !LAB && lockCands.length ? pick(lockCands) : -1;

  const rooms = [];
  let depth = 0;
  for (let i = 0; i < N; i++) {
    const kind = kinds[i];
    const finale = kind === 'finale', isChart = !LAB && i === N - 2;
    const theme = finale ? COMBAT_THEMES[0] : isChart ? { ...QUIET_THEMES[3], name: ['NAVIGATION', 'CHART ROOM'], accent: '#35c06a' } : pick(kind === 'quiet' ? QUIET_THEMES : COMBAT_THEMES);
    const arch = pickArch(isChart ? 'chart' : theme.id, finale), sz = sizeFor(arch, finale);
    rooms.push({ id: i + 1, kind, arch, w: sz.w, d: sz.d, h: finale ? Math.max(sz.h, 7) : sz.h, theme, cell: cells[i], waves: [], barrels: [], pickups: [], doorT: {}, depth: kind === 'quiet' ? 0 : depth++ });
  }
  // positions
  const first = rooms[0];
  const cz0 = HALL_ANCHOR.z - 8 - T - first.d / 2;
  for (const r of rooms) {
    r.cx = HALL_ANCHOR.x + r.cell.gx * SPACING;
    r.cz = cz0 - r.cell.gz * SPACING;
    r.x0 = r.cx - r.w / 2; r.x1 = r.cx + r.w / 2; r.z0 = r.cz - r.d / 2; r.z1 = r.cz + r.d / 2;
    r.bounds = { minX: r.x0, maxX: r.x1, minZ: r.z0, maxZ: r.z1 };
  }
  // connections
  rooms[0].inSide = 'zmax';
  for (let i = 0; i < N - 1; i++) {
    const m = rooms[i + 1].cell.from;
    const out = m.dz ? 'zmin' : m.dx > 0 ? 'xmax' : 'xmin';
    const inn = m.dz ? 'zmax' : m.dx > 0 ? 'xmin' : 'xmax';
    rooms[i].outSide = out; rooms[i + 1].inSide = inn;
  }
  rooms[0].doorT.zmax = HALL_ANCHOR.x;
  for (let i = 0; i < N - 1; i++) {
    const A = rooms[i], Bm = rooms[i + 1], zl = A.outSide[0] === 'z';
    const lo = Math.max(zl ? A.x0 : A.z0, zl ? Bm.x0 : Bm.z0) + 4.5, hi = Math.min(zl ? A.x1 : A.z1, zl ? Bm.x1 : Bm.z1) - 4.5;
    const t = hi > lo ? rand(lo, hi) : zl ? A.cx : A.cz;
    A.doorT[A.outSide] = t; Bm.doorT[Bm.inSide] = t;
  }
  const fin = rooms[N - 1];
  fin.outSide = 'zmin'; fin.doorT.zmin = rand(fin.x0 + 5, fin.x1 - 5);

  // the lift the finale leads to
  const lz1 = fin.z0 - T - 6 - T;
  const lift = { id: N + 1, kind: 'lift', w: 8, d: 8, h: 4.5, theme: { id: 'lift', name: ['HANGAR LIFT', 'DECK 9'], accent: '#35c06a' }, cx: fin.doorT.zmin, z1: lz1, z0: lz1 - 8, waves: [], barrels: [], pickups: [], inSide: 'zmax', outSide: 'zmin' };
  lift.cz = (lift.z0 + lift.z1) / 2; lift.x0 = lift.cx - 4; lift.x1 = lift.cx + 4;
  lift.bounds = { minX: lift.x0, maxX: lift.x1, minZ: lift.z0, maxZ: lift.z1 };
  rooms.push(lift);

  // ---- build every room
  const doorPos = geomDoorPos;
  for (const r of rooms) {
    r.doors = {};
    if (r.kind !== 'lift') { r.plan = designRoom(r); r.shape = r.plan.shape; }
    makeRoomShell(B, r, mats);
    buildPlan(B, r, mats);
    for (const [key, side] of [['in', r.inSide], ['out', r.outSide]]) {
      if (!side) continue;
      const p = doorPos(r, side);
      kit.place(group, 'door_frame', { x: p.x, z: p.z, rotY: p.axis === 'x' ? PI / 2 : 0 });
      const shut = key === 'out' && r.kind !== 'quiet';
      r.doors[key] = new Door(group, B.W, { x: p.x, z: p.z, closed: shut, kit, axis: p.axis });
    }
    // where the player stands when a checkpoint restarts this room
    const [dx, dz] = SIDES[r.inSide].dir;
    const dp = doorPos(r, r.inSide);
    r.restart = { x: dp.x - dx * 2.6, z: dp.z - dz * 2.6, yaw: yawOf(dx, dz) };
    r.inPoint = { x: dp.x + dx * 0.5, z: dp.z + dz * 0.5 };
    roomLighting(B, r, Lr, mats);
    if (r.kind === 'lift') continue;
    const placer = new Placer();
    r.placer = placer;
    furnish(B, r, placer, Lr);
  }

  // ---- halls between rooms
  const hallTo = (A, Bm, label) => {
    const s = A.outSide;
    if (s === 'zmin') buildHall(B, Lr, 'z', doorT(A, s), Bm.z1 + T, A.z0 - T, mats, label, Math.random() < 0.25);
    else if (s === 'xmax') buildHall(B, Lr, 'x', doorT(A, s), A.x1 + T, Bm.x0 - T, mats, label, Math.random() < 0.25);
    else buildHall(B, Lr, 'x', doorT(A, s), Bm.x1 + T, A.x0 - T, mats, label, Math.random() < 0.25);
  };
  // lobby -> first room
  buildHall(B, Lr, 'z', HALL_ANCHOR.x, rooms[0].z1 + T, HALL_ANCHOR.z, mats, { lines: ['DECK 9', 'SERVICE ROUTE'], accent: '#35c06a', arrow: '▼' }, false);
  for (let i = 0; i < rooms.length - 1; i++) {
    const A = rooms[i], Bm = rooms[i + 1];
    const label = Bm.kind === 'lift' ? { lines: ['HANGAR LIFT 2'], accent: '#35c06a', arrow: '▼' } : { lines: [`SECTOR ${String(Bm.id).padStart(2, '0')}`, Bm.theme.name[0]], accent: Bm.theme.accent };
    hallTo(A, Bm, label);
  }

  // ---- room signs, spawns, rewards
  let comb = 0;
  let quietN = 0;
  for (const r of rooms) {
    if (r.kind === 'lift') continue;
    const sideForSign = shuffled(['zmin', 'zmax', 'xmin', 'xmax']).find((s) => !roomSides(r).includes(s) && !(r.plan && r.plan.blocks.some((b) => signHidden(r, s, b)))) || shuffled(['zmin', 'zmax', 'xmin', 'xmax']).find((s) => !roomSides(r).includes(s)) || 'zmin';
    const y = r.h > 5 ? 4.9 : 3.5, wd = r.h > 5 ? 3.3 : 2.5;
    const sn = [`SECTOR ${String(r.id).padStart(2, '0')}`, ...r.theme.name];
    const opt = { accent: r.theme.accent };
    if (sideForSign === 'zmin') addSign(B.group, r.theme.name.length > 1 ? r.theme.name : sn, wd, r.cx + rand(-r.w * 0.2, r.w * 0.2), y, r.z0 + 0.03, 0, opt);
    else if (sideForSign === 'zmax') addSign(B.group, r.theme.name, wd, r.cx + rand(-r.w * 0.2, r.w * 0.2), y, r.z1 - 0.03, PI, opt);
    else if (sideForSign === 'xmin') addSign(B.group, r.theme.name, wd, r.x0 + 0.03, y, r.cz + rand(-r.d * 0.2, r.d * 0.2), PI / 2, opt);
    else addSign(B.group, r.theme.name, wd, r.x1 - 0.03, y, r.cz + rand(-r.d * 0.2, r.d * 0.2), -PI / 2, opt);

    const pl = r.placer;
    const taken = [];
    if (r.kind === 'quiet') {
      const n = r.theme.id === 'storage' || r.theme.id === 'lab' ? 2 : 1;
      if (!LAB && r === rooms[N - 2]) { const s = freeSpot(r, pl, { pad: 2.2, avoid: taken }); taken.push(s); r.navSpot = s; pl.add(s.x - 1.4, s.x + 1.4, s.z - 1, s.z + 1, true); }
      else {
        const s = freeSpot(r, pl, { pad: 1.5, avoid: taken }); taken.push(s); pl.add(s.x - 1, s.x + 1, s.z - 1, s.z + 1, !LAB && (quietN + 1) % 2 === 0 && r.h > 4.4);
        // every second jar sits up on a stack of cases: too high for a jump, not for arms that grip
        quietN++;
        if (!LAB && quietN % 2 === 0 && r.h > 4.4) { const H = 2.65; B.blk(s.x - 0.8, s.x + 0.8, 0, H, s.z - 0.8, s.z + 0.8, mats.dark); r.voiceSpot = { x: s.x, y: H, z: s.z }; }
        else r.voiceSpot = { x: s.x, y: 0, z: s.z };
      }
      for (let i = 0; i < n; i++) { const s = freeSpot(r, pl, { pad: 1.0, avoid: taken }); taken.push(s); r.pickups.push({ type: 'health', ...s, reveal: 'start' }); }
    } else {
      const finale = r.kind === 'finale';
      const waves = finale ? 2 : 1;
      for (let w = 0; w < waves; w++) {
        const comp = composeWave(r.depth, finale, w);
        const wave = [];
        for (const c of comp) {
          const s = freeSpot(r, pl, { pad: 1.1, minFromIn: w === 0 ? 8 : 5, avoid: taken });
          taken.push(s);
          wave.push({ type: c.type, variant: c.variant, x: s.x, z: s.z });
        }
        r.waves.push(wave);
      }
      if (Math.random() < 0.55 || finale) { const s = freeSpot(r, pl, { pad: 1.0, avoid: taken }); r.pickups.push({ type: 'health', ...s, reveal: 'clear' }); }
      comb++;
    }
  }
  // key card + locked door
  if (!LAB) { run.navRoom = rooms[N - 2]; run.navRoom.doors.out.lock(); }
  if (lockIdx >= 0) {
  const keyRoom = rooms[keyIdx], lockRoom = rooms[lockIdx];
  const ks = freeSpot(keyRoom, keyRoom.placer, { pad: 1.2, avoid: keyRoom.pickups });
  keyRoom.pickups.push({ type: 'key', ...ks, reveal: 'clear' });
  run.keyRoom = keyRoom; run.lockRoom = lockRoom;
  lockRoom.doors.out.lock();
    const r = lockRoom, o = { accent: '#c9402a', w: 768, h: 192 }, L2 = ['NO POWER', 'HANDLER PASS OR CURRENT'];
    if (r.outSide === 'zmin') addSign(group, L2, 1.6, doorT(r, r.outSide) + 2.5, 1.9, r.z0 + 0.03, 0, o);
    else if (r.outSide === 'zmax') addSign(group, L2, 1.6, doorT(r, r.outSide) + 2.5, 1.9, r.z1 - 0.03, PI, o);
    else if (r.outSide === 'xmin') addSign(group, L2, 1.6, r.x0 + 0.03, 1.9, doorT(r, r.outSide) + 2.5, PI / 2, o);
    else addSign(group, L2, 1.6, r.x1 - 0.03, 1.9, doorT(r, r.outSide) + 2.5, -PI / 2, o);
  }

  // ---- lift interior
  {
    const r = lift;
    const green = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x35ff7a, emissiveIntensity: 1.6 });
    green.userData.noSnap = true;
    B.deco(r.cx - 1.5, r.cx + 1.5, 0.012, 0.03, r.cz - 1.5, r.cz + 1.5, green);
    B.deco(r.cx - 2.2, r.cx + 2.2, 0.0, 0.01, r.cz - 2.2, r.cz + 2.2, mats.dark);
    addSign(group, ['HANGAR LIFT 2', 'DECK 9'], 2.6, r.x0 + 0.03, 2.5, r.cz - 0.5, PI / 2, { accent: '#35c06a' });
    kit.solid(group, B.W, 'storage_cabinet', r.x0 + 0.6, r.cz + 1.5, PI / 2);
    kit.solid(group, B.W, 'storage_cabinet', r.x1 - 0.6, r.cz + 1.5, -PI / 2);
  }

  run.rooms = rooms;
  run.lift = lift;
  run.doors = rooms.flatMap((r) => Object.values(r.doors));
  run.merged = mergeStatic(group);
  return run;
}

export function disposeRun(game, run) {
  if (!run) return;
  game.scene.remove(run.group);
  for (const m of run.merged) m.geometry.dispose();
  for (const b of run.boxes) game.world.remove(b);
}

// First room of the run: the hand-built workshop, described the same way as generated rooms.
export function workshopRoom(L) {
  return {
    id: 0, kind: 'combat', depth: -1, theme: { id: 'workshop', name: ['ROBOTICS', 'SECURITY WORKSHOP'], accent: '#3aa7b8' },
    bounds: ARENA, x0: ARENA.minX, x1: ARENA.maxX, z0: ARENA.minZ, z1: ARENA.maxZ,
    cx: 0, cz: (ARENA.minZ + ARENA.maxZ) / 2, inSide: 'zmax', outSide: 'zmin',
    doors: { in: L.doors.entrance, out: L.doors.exit },
    waves: [L.enemySpawns], barrels: L.barrelSpawns, pickups: [],
    restart: { x: 0, z: -4, yaw: 0 }, inPoint: { x: 0, z: -8.25 },
  };
}

export { SIDES };
