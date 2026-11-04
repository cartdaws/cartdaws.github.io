import * as THREE from 'three';
import { M, boxGeo, kitMaterial } from './materials.js';
import { Door } from './door.js';
import { mergeStatic } from './merge.js';
import { addSign } from './signs.js';
import { ARENA, HALL_ANCHOR } from './level.js';
import { rand } from '../core/util.js';

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
];
const QUIET_THEMES = [
  { id: 'lab', name: ['SAMPLE ANALYSIS', 'LAB'], accent: '#3aa7b8' },
  { id: 'server', name: ['DATA CORE', 'ACCESS'], accent: '#3aa7b8' },
  { id: 'storage', name: ['EQUIPMENT', 'STORES'], accent: '#d99a1c' },
  { id: 'control', name: ['ROBOTICS', 'CONTROL ROOM'], accent: '#3aa7b8' },
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
  if (finale) {
    if (wave === 0) { add('bug', 'std', 2); add('bug', 'swarm', 3); add('drone', 'std', 2); }
    else { add('bug', 'brute', 2); add('bug', 'swarm', 2); add('drone', 'armored', 1); add('drone', 'std', 1); }
    return out;
  }
  const total = Math.min(7, 3 + Math.floor(depth * 0.5) + irand(0, 1));
  let drones = depth >= 1 ? 1 : 0;
  if (depth >= 3 && Math.random() < 0.7) drones++;
  if (depth >= 6 && Math.random() < 0.5) drones++;
  drones = Math.min(drones, 3);
  for (let i = 0; i < drones; i++) add('drone', depth >= 4 && Math.random() < 0.45 ? 'armored' : 'std');
  while (out.length < total) {
    let v = 'std';
    const r = Math.random();
    if (depth >= 3 && r < 0.22) v = 'brute';
    else if (depth >= 1 && r < 0.55) v = 'swarm';
    add('bug', v);
  }
  return out;
}

// ---------------------------------------------------------------- builder helpers

function makeBuilder(group, world, kit, boxes, lights) {
  const W = { add: (...a) => { const b = world.add(...a); boxes.push(b); return b; } };
  const blk = (x0, x1, y0, y1, z0, z1, mat, solid = true, tag = '') => {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const m = new THREE.Mesh(boxGeo(w, h, d, 2, x0 * 3.1 + z0 * 1.7 + y0 * 0.9), mat);
    m.position.set(x0 + w / 2, y0 + h / 2, z0 + d / 2);
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

// Keeps props from colliding with each other and from clogging door approaches.
class Placer {
  constructor() { this.rects = []; }
  add(x0, x1, z0, z1) { this.rects.push({ x0, x1, z0, z1 }); }
  free(x0, x1, z0, z1, pad) {
    for (const r of this.rects) if (!(x1 + pad < r.x0 || x0 - pad > r.x1 || z1 + pad < r.z0 || z0 - pad > r.z1)) return false;
    return true;
  }
}

// ---------------------------------------------------------------- rooms

function makeRoomShell(B, r, mats) {
  const { x0, x1, z0, z1, h, cx, cz } = r;
  const { blk, deco } = B;
  const dark = mats.dark;
  const has = (s) => r.inSide === s || r.outSide === s;
  const cut = (a, b, c, door) => (door ? [[a, c - 1.5], [c + 1.5, b]] : [[a, b]]);

  deco(x0 - T, x1 + T, -0.2, FLOOR_Y, z0 - T, z1 + T, M.floor);
  blk(x0 - T, x1 + T, h, h + 0.4, z0 - T, z1 + T, M.wall);
  for (const side of ['zmin', 'zmax']) {
    const za = side === 'zmin' ? z0 - T : z1, zb = side === 'zmin' ? z0 : z1 + T;
    for (const [a, b] of cut(x0 - T, x1 + T, cx, has(side))) blk(a, b, 0, h, za, zb, M.wall);
    if (has(side)) blk(cx - 1.5, cx + 1.5, 3, h, za, zb, M.wall);
    const pz = side === 'zmin' ? z0 : z1 - 0.04;
    for (const [a, b] of cut(x0, x1, cx, has(side))) deco(a, b, 0, 0.3, pz, pz + 0.04, dark);
  }
  for (const side of ['xmin', 'xmax']) {
    const xa = side === 'xmin' ? x0 - T : x1, xb = side === 'xmin' ? x0 : x1 + T;
    for (const [a, b] of cut(z0, z1, cz, has(side))) blk(xa, xb, 0, h, a, b, M.wall);
    if (has(side)) blk(xa, xb, 3, h, cz - 1.5, cz + 1.5, M.wall);
    const px = side === 'xmin' ? x0 : x1 - 0.04;
    for (const [a, b] of cut(z0, z1, cz, has(side))) deco(px, px + 0.04, 0, 0.3, a, b, dark);
  }

  // structural ribs along the walls, kept clear of doorways
  const ribName = h > 5 ? 'wall_rib_65' : 'wall_rib_45';
  const ribs = (side, from, to, step) => {
    const n = Math.max(1, Math.floor((to - from) / step));
    for (let i = 0; i < n; i++) {
      const t = from + ((i + 0.5) * (to - from)) / n;
      const along = side[0] === 'z' ? cx : cz;
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

function furnish(B, r, placer, L) {
  const kit = B.kit;
  const { x0, x1, z0, z1, cx, cz } = r;
  const solid = (name, x, z, rot = 0, y = 0) => {
    kit.solid(B.group, B.W, name, x, z, rot, y);
    const f = kit.footprint(name, rot);
    placer.add(x - f.w / 2, x + f.w / 2, z - f.d / 2, z + f.d / 2);
    return f;
  };
  const cosmetic = (name, x, z, rot = 0) => kit.place(B.group, name, { x, z, rotY: rot });
  const hasDoor = (s) => r.inSide === s || r.outSide === s;

  // approach lanes in front of each doorway stay clear
  const lane = (side) => {
    if (side === 'zmin') placer.add(cx - 2.2, cx + 2.2, z0, z0 + 4.2);
    else if (side === 'zmax') placer.add(cx - 2.2, cx + 2.2, z1 - 4.2, z1);
    else if (side === 'xmin') placer.add(x0, x0 + 4.2, cz - 2.2, cz + 2.2);
    else placer.add(x1 - 4.2, x1, cz - 2.2, cz + 2.2);
  };

  const line = (name, side, count, gap = 0.12) => {
    const rot = SIDES[side].rot;
    const f = kit.footprint(name, rot);
    const zs = side[0] === 'z';
    const lo = zs ? x0 : z0, hi = zs ? x1 : z1, ctr = zs ? cx : cz;
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
  const sides = shuffled(['zmin', 'zmax', 'xmin', 'xmax']);
  const wallsFree = sides.filter((s) => !hasDoor(s));
  const beaconed = [];

  const theme = r.theme.id;
  const big = r.w >= 20 && r.d >= 18;
  if (r.kind !== 'quiet') {
    if (theme === 'assembly' || r.kind === 'finale') {
      if (big) { const rot = Math.random() < 0.5 ? 0 : PI / 2; solid('robot_test_cell', cx, cz, rot); }
      for (const side of ['zmin', 'zmax', 'xmin', 'xmax']) if (hasDoor(side)) lane(side);
      scatter('pillar', big ? 2 : 3, 2.8);
      for (const n of shuffled(['equip_cabinet_A', 'equip_cabinet_B', 'equip_cabinet_C', 'equip_cabinet_D']).slice(0, 2)) { if (scatter(n, 1, 1.9)) beaconed.push([n, r._last]); }
      line('charging_dock', wallsFree[0] || 'zmin', irand(2, 4));
      scatter('barrier_26', 2); scatter('barrier_22', 2); scatter('canister', 2, 1.2);
    } else if (theme === 'cargo') {
      for (const side of ['zmin', 'zmax', 'xmin', 'xmax']) if (hasDoor(side)) lane(side);
      for (let i = 0; i < irand(3, 4); i++) { if (scatter('crate_A', 1, 1.7)) solid('crate_top', r._last.x, r._last.z, 0, 1.4); }
      scatter('crate_B', 3, 1.5); scatter('barrier_26', 3);
      line('storage_rack', wallsFree[0] || 'zmin', irand(2, 3)); line('storage_rack', wallsFree[1] || 'xmin', irand(1, 3));
      scatter('canister', 3, 1.2);
      if (scatter('equip_cabinet_C', 1, 1.9)) beaconed.push(['equip_cabinet_C', r._last]);
    } else if (theme === 'foundry') {
      for (const side of ['zmin', 'zmax', 'xmin', 'xmax']) if (hasDoor(side)) lane(side);
      scatter('pillar', irand(4, 6), 2.6);
      line('workstation', wallsFree[0] || 'zmin', irand(2, 3)); line('workstation', wallsFree[1] || 'xmin', irand(1, 2));
      scatter('barrier_22', 3); scatter('canister', 2, 1.2);
      if (scatter('equip_cabinet_D', 1, 1.9)) beaconed.push(['equip_cabinet_D', r._last]);
      if (scatter('equip_cabinet_A', 1, 1.9)) beaconed.push(['equip_cabinet_A', r._last]);
    } else { // range
      for (const side of ['zmin', 'zmax', 'xmin', 'xmax']) if (hasDoor(side)) lane(side);
      scatter('barrier_26', 5, 1.7); scatter('pillar', 2, 2.8); scatter('crate_B', 2, 1.5);
      line('workstation', wallsFree[0] || 'zmin', irand(2, 3)); line('charging_dock', wallsFree[1] || 'xmin', irand(1, 2));
    }
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
        placer.add(x - 1.4, x + 1.4, z - 1.0, z + 1.0);
        r.barrels.push({ x: x - 0.45, z }, { x: x + 0.5, z: z + rand(-0.3, 0.3) });
        const th = 0.12;
        for (const [a, b, c, d] of [[x - 1.3, x + 1.3, z - 0.95, z - 0.95 + th], [x - 1.3, x + 1.3, z + 0.95 - th, z + 0.95], [x - 1.3, x - 1.3 + th, z - 0.95, z + 0.95], [x + 1.3 - th, x + 1.3, z - 0.95, z + 0.95]]) B.deco(a, b, 0.012, 0.03, c, d, M.hazard);
        break;
      }
    }
  } else {
    for (const side of ['zmin', 'zmax', 'xmin', 'xmax']) if (hasDoor(side)) lane(side);
    if (theme === 'lab') {
      line('storage_cabinet', wallsFree[0] || 'zmin', irand(3, 5)); line('storage_cabinet', wallsFree[1] || 'xmin', irand(2, 3));
      for (let i = 0; i < irand(2, 3); i++) { if (scatter('analysis_bench', 1, 1.5, [0, PI / 2])) cosmetic('chair', r._last.x + 0.1, r._last.z + (r._last.rot === 0 ? 1.0 : 0), 0.3 * i); }
      scatter('instrument_cart', 2, 1.1); scatter('restraint_bed', 1, 1.8, [0, PI / 2]);
    } else if (theme === 'server') {
      line('server_rack', wallsFree[0] || 'zmin', irand(4, 6)); line('server_rack', wallsFree[1] || 'xmax', irand(2, 4));
      for (let i = 0; i < 2; i++) { if (scatter('monitor_station', 1, 1.6, [0, PI])) cosmetic('chair', r._last.x, r._last.z + (r._last.rot === 0 ? 1.1 : -1.1), r._last.rot + PI); }
      line('storage_cabinet', wallsFree[1] || 'zmax', 2);
    } else if (theme === 'storage') {
      line('storage_rack', wallsFree[0] || 'zmin', irand(3, 4)); line('storage_rack', wallsFree[1] || 'xmin', irand(2, 3));
      scatter('crate_A', 2, 1.6); scatter('crate_B', 3, 1.5); scatter('canister', 3, 1.2); scatter('barrier_22', 1);
    } else {
      line('workstation', wallsFree[0] || 'zmin', irand(3, 4));
      for (let i = 0; i < 2; i++) { if (scatter('monitor_station', 1, 1.6, [0, PI])) cosmetic('chair', r._last.x, r._last.z + (r._last.rot === 0 ? 1.1 : -1.1), r._last.rot + PI); }
      line('server_rack', wallsFree[1] || 'xmax', 2); scatter('instrument_cart', 1, 1.1);
    }
  }
}

function freeSpot(r, placer, { pad = 1.0, minFromIn = 0, avoid = [], tries = 120 } = {}) {
  const ip = r.inPoint;
  // Crowded rooms relax the spacing step by step; a final scan takes any open spot so nothing ever lands inside a prop.
  for (const k of [1, 0.8, 0.65]) {
    for (let t = 0; t < tries; t++) {
      const x = rand(r.x0 + 1.8, r.x1 - 1.8), z = rand(r.z0 + 1.8, r.z1 - 1.8);
      if (!placer.free(x - 0.3, x + 0.3, z - 0.3, z + 0.3, Math.max(0.7, pad * k))) continue;
      if (k === 1 && ip && Math.hypot(x - ip.x, z - ip.z) < minFromIn) continue;
      if (k < 1 ? false : avoid.some((a) => Math.hypot(a.x - x, a.z - z) < 2.4)) continue;
      return { x, z };
    }
  }
  for (let x = r.x0 + 1.8; x <= r.x1 - 1.8; x += 0.6) for (let z = r.z0 + 1.8; z <= r.z1 - 1.8; z += 0.6) {
    if (placer.free(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0.7)) return { x, z };
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
  hb(-2, -1.5, 0, HALL_H, t0, t1, M.wall, true); hb(1.5, 2, 0, HALL_H, t0, t1, M.wall, true);
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

// ---------------------------------------------------------------- the run

export function generateRun(game) {
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
  const N = irand(9, 11);
  const cells = walkGrid(N);
  const kinds = planKinds(N);
  // the key lives in a combat room, the locked door in a quiet room beyond it
  let keyIdx = kinds.map((k, i) => (k === 'combat' && i >= 1 && i <= N - 4 ? i : -1)).filter((i) => i >= 0);
  if (!keyIdx.length) { kinds[2] = 'combat'; keyIdx = [2]; }
  keyIdx = pick(keyIdx);
  const lockCands = kinds.map((k, i) => (k === 'quiet' && i >= keyIdx + 2 ? i : -1)).filter((i) => i >= 0);
  const lockIdx = lockCands.length ? pick(lockCands) : N - 2;

  const rooms = [];
  let depth = 0;
  for (let i = 0; i < N; i++) {
    const kind = kinds[i];
    const w = kind === 'quiet' ? 2 * irand(6, 9) : kind === 'finale' ? 2 * irand(12, 13) : 2 * irand(8, 12);
    const d = kind === 'quiet' ? 2 * irand(6, 9) : kind === 'finale' ? 2 * irand(12, 13) : 2 * irand(8, 12);
    const theme = kind === 'finale' ? COMBAT_THEMES[0] : pick(kind === 'quiet' ? QUIET_THEMES : COMBAT_THEMES);
    rooms.push({ id: i + 1, kind, w, d, h: kind === 'quiet' ? 4.5 : 6.5, theme, cell: cells[i], waves: [], barrels: [], pickups: [], depth: kind === 'quiet' ? 0 : depth++ });
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
  const fin = rooms[N - 1];
  fin.outSide = 'zmin';

  // the lift the finale leads to
  const lz1 = fin.z0 - T - 6 - T;
  const lift = { id: N + 1, kind: 'lift', w: 8, d: 8, h: 4.5, theme: { id: 'lift', name: ['HANGAR LIFT', 'DECK 9'], accent: '#35c06a' }, cx: fin.cx, z1: lz1, z0: lz1 - 8, waves: [], barrels: [], pickups: [], inSide: 'zmax', outSide: 'zmin' };
  lift.cz = (lift.z0 + lift.z1) / 2; lift.x0 = lift.cx - 4; lift.x1 = lift.cx + 4;
  lift.bounds = { minX: lift.x0, maxX: lift.x1, minZ: lift.z0, maxZ: lift.z1 };
  rooms.push(lift);

  // ---- build every room
  const doorPos = (r, side) => {
    if (side === 'zmin') return { x: r.cx, z: r.z0 - T / 2, axis: 'z' };
    if (side === 'zmax') return { x: r.cx, z: r.z1 + T / 2, axis: 'z' };
    if (side === 'xmin') return { x: r.x0 - T / 2, z: r.cz, axis: 'x' };
    return { x: r.x1 + T / 2, z: r.cz, axis: 'x' };
  };
  for (const r of rooms) {
    r.doors = {};
    makeRoomShell(B, r, mats);
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
    if (s === 'zmin') buildHall(B, Lr, 'z', A.cx, Bm.z1 + T, A.z0 - T, mats, label, Math.random() < 0.25);
    else if (s === 'xmax') buildHall(B, Lr, 'x', A.cz, A.x1 + T, Bm.x0 - T, mats, label, Math.random() < 0.25);
    else buildHall(B, Lr, 'x', A.cz, Bm.x1 + T, A.x0 - T, mats, label, Math.random() < 0.25);
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
  for (const r of rooms) {
    if (r.kind === 'lift') continue;
    const sideForSign = shuffled(['zmin', 'zmax', 'xmin', 'xmax']).find((s) => s !== r.inSide && s !== r.outSide) || 'zmin';
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
  const keyRoom = rooms[keyIdx], lockRoom = rooms[lockIdx];
  const ks = freeSpot(keyRoom, keyRoom.placer, { pad: 1.2, avoid: keyRoom.pickups });
  keyRoom.pickups.push({ type: 'key', ...ks, reveal: 'clear' });
  run.keyRoom = keyRoom; run.lockRoom = lockRoom;
  lockRoom.doors.out.lock();
  {
    const r = lockRoom, o = { accent: '#c9402a', w: 768, h: 192 }, L2 = ['KEYCARD REQUIRED'];
    if (r.outSide === 'zmin') addSign(group, L2, 1.6, r.cx + 2.5, 1.9, r.z0 + 0.03, 0, o);
    else if (r.outSide === 'zmax') addSign(group, L2, 1.6, r.cx + 2.5, 1.9, r.z1 - 0.03, PI, o);
    else if (r.outSide === 'xmin') addSign(group, L2, 1.6, r.x0 + 0.03, 1.9, r.cz + 2.5, PI / 2, o);
    else addSign(group, L2, 1.6, r.x1 - 0.03, 1.9, r.cz + 2.5, -PI / 2, o);
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
