import { doorPos, doorT, WALL_T } from './roomgeom.js';

// Checks a generated run the way the game will use it. Everything here is something that has gone wrong in a procedural level before: a door walled in
// by a prop, an enemy spawned somewhere it can never walk out of, a pickup in a closet, two props through each other, a passage a player cannot fit.
//   reach      the lobby to the lift is one connected walk, through every door, wide enough for you
//   items      every pickup, spawn, key, chart and jar can be walked to from the room's own entrance
//   doors      the approach to every door is clear
//   narrow     inside each room, the way between its doors is wider than a body, not a squeeze between props
//   overlap    no two props occupy the same floor
//   nav        enemies' own navigation can reach every spawn point of every wave
const RES = 0.4;
const WALK_R = 0.5, WIDE_R = 0.85;

class Grid {
  constructor(world, bounds, radius) {
    this.b = bounds; this.w = Math.ceil((bounds.maxX - bounds.minX) / RES); this.h = Math.ceil((bounds.maxZ - bounds.minZ) / RES);
    this.blocked = new Uint8Array(this.w * this.h);
    const boxes = world.boxes.filter((b) => b.enabled !== false && b.tag !== 'door' && b.minY <= 1.7 && b.maxY > 0.32 && b.maxX > bounds.minX && b.minX < bounds.maxX && b.maxZ > bounds.minZ && b.minZ < bounds.maxZ);
    for (const b of boxes) {
      const i0 = Math.max(0, Math.floor((b.minX - radius - bounds.minX) / RES)), i1 = Math.min(this.w - 1, Math.floor((b.maxX + radius - bounds.minX) / RES));
      const j0 = Math.max(0, Math.floor((b.minZ - radius - bounds.minZ) / RES)), j1 = Math.min(this.h - 1, Math.floor((b.maxZ + radius - bounds.minZ) / RES));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = bounds.minX + (i + 0.5) * RES, z = bounds.minZ + (j + 0.5) * RES;
        const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
        if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) this.blocked[j * this.w + i] = 1;
      }
    }
  }
  cell(x, z) { const i = Math.floor((x - this.b.minX) / RES), j = Math.floor((z - this.b.minZ) / RES); return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i; }
  open(x, z) { const c = this.cell(x, z); return c >= 0 && !this.blocked[c]; }
  // flood from a point; snaps to the nearest open cell within 1.2 m
  flood(x, z) {
    const seen = new Uint8Array(this.w * this.h); let s = this.cell(x, z);
    if (s < 0 || this.blocked[s]) { s = -1; for (let r = 1; r <= 3 && s < 0; r++) for (let dz = -r; dz <= r && s < 0; dz++) for (let dx = -r; dx <= r; dx++) { const c = this.cell(x + dx * RES, z + dz * RES); if (c >= 0 && !this.blocked[c]) { s = c; break; } } }
    if (s < 0) return seen;
    const q = [s]; seen[s] = 1; const { w, h, blocked } = this;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], ci = c % w, cj = (c / w) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue; const n = nj * w + ni;
        if (blocked[n] || seen[n]) continue; if (di && dj && (blocked[cj * w + ni] || blocked[nj * w + ci])) continue;
        seen[n] = 1; q.push(n);
      }
    }
    return seen;
  }
  reached(seen, x, z) { const c = this.cell(x, z); return c >= 0 && !!seen[c]; }
}

export function validateRun(game, run) {
  const issues = [], rooms = run.rooms, world = game.world;
  // every room, hall and side room sits inside one rectangle
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const r of rooms.concat(run.sideRooms || [])) { minX = Math.min(minX, r.x0 - 8); maxX = Math.max(maxX, r.x1 + 8); minZ = Math.min(minZ, r.z0 - 8); maxZ = Math.max(maxZ, r.z1 + 8); }
  const bounds = { minX, maxX, minZ, maxZ: maxZ + 12 };
  const walk = new Grid(world, bounds, WALK_R), wide = new Grid(world, bounds, WIDE_R);
  const first = rooms[0], start = doorPos(first, first.inSide), sx = start.x, sz = start.z + 1.2;
  const seen = walk.flood(sx, sz);
  const lift = rooms[rooms.length - 1];
  if (!walk.reached(seen, lift.cx, lift.cz)) issues.push('reach: the lift cannot be walked to from the first door');
  const all = rooms.concat(run.sideRooms || []);
  for (const r of all) {
    if (r.kind === 'lift') continue;
    const items = [];
    for (const p of r.pickups || []) items.push([p.type, p.x, p.z]);
    for (const [wi, w] of (r.waves || []).entries()) for (const s of w) items.push(['spawn' + wi, s.x, s.z]);
    if (r.voiceSpot && !r.voiceSpot.y) items.push(['jar', r.voiceSpot.x, r.voiceSpot.z]);
    if (r.navSpot) items.push(['chart', r.navSpot.x, r.navSpot.z]);
    for (const [what, x, z] of items) {
      if (!walk.reached(seen, x, z)) issues.push(`items: ${what} in room ${r.id} (${r.theme.id}) at ${x.toFixed(1)},${z.toFixed(1)} cannot be walked to`);
    }
    // door approaches
    const sides = [r.inSide, r.outSide, ...(r.extraSides || [])].filter(Boolean);
    for (const side of sides) {
      const p = doorPos(r, side), dir = { zmin: [0, 1], zmax: [0, -1], xmin: [1, 0], xmax: [-1, 0] }[side];
      for (const k of [-1.0, 0.8, 2.0, 3.2]) {
        const x = p.x + dir[0] * k, z = p.z + dir[1] * k;
        if (!walk.reached(seen, x, z)) { issues.push(`doors: ${side} door of room ${r.id} is blocked ${k} m ${k < 0 ? 'outside' : 'inside'}`); break; }
      }
    }
    // the way through the room must be wide, not a squeeze
    if (r.inSide && r.outSide && r.kind !== 'side') {
      const a = doorPos(r, r.inSide), b = doorPos(r, r.outSide), da = { zmin: [0, 1], zmax: [0, -1], xmin: [1, 0], xmax: [-1, 0] }[r.inSide], db = { zmin: [0, 1], zmax: [0, -1], xmin: [1, 0], xmax: [-1, 0] }[r.outSide];
      const fa = wide.flood(a.x + da[0] * 2.4, a.z + da[1] * 2.4);
      if (!wide.reached(fa, b.x + db[0] * 2.4, b.z + db[1] * 2.4)) issues.push(`narrow: the way between the doors of room ${r.id} (${r.theme.id}) is under ${(WIDE_R * 2).toFixed(1)} m wide`);
      // and every spawn stays in the wide space, so a fight is never in a closet
      for (const [wi, w] of (r.waves || []).entries()) for (const s of w) if (!wide.reached(fa, s.x, s.z)) { issues.push(`narrow: a spawn in room ${r.id} sits in a squeeze`); break; }
    }
    // props through each other
    const P = r.props || [];
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j]; if (a.y1 <= b.y0 + 0.02 || b.y1 <= a.y0 + 0.02) continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (ox > 0.05 && oz > 0.05) { issues.push(`overlap: ${a.name} and ${b.name} in room ${r.id} share ${(ox * oz).toFixed(2)} m2`); break; }
    }
    // enemies' own navigation
    if ((r.kind === 'combat' || r.kind === 'finale') && r.waves && r.waves.length) {
      const nav = game.makeNav(r.bounds), dp = doorPos(r, r.inSide), dd = { zmin: [0, 1], zmax: [0, -1], xmin: [1, 0], xmax: [-1, 0] }[r.inSide];
      const f = nav.field(dp.x + dd[0] * 2.4, dp.z + dd[1] * 2.4);
      if (!f) issues.push(`nav: room ${r.id} entrance is not on its navigation grid`);
      else for (const w of r.waves) for (const s of w) { if (f[nav.cellOf(s.x, s.z)] < 0) { issues.push(`nav: a spawn in room ${r.id} cannot reach the entrance`); break; } }
    }
  }
  return issues;
}

export { doorT, WALL_T };
