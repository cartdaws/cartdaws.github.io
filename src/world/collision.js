import { clamp } from '../core/util.js';

const EPS = 1e-7;
const hitOut = { t: 0, nx: 0, ny: 0, nz: 0 };

function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0, tmax = maxT, nx = 0, ny = 0, nz = 0;
  if (Math.abs(dx) < EPS) { if (ox < b.minX || ox > b.maxX) return false; }
  else {
    let t1 = (b.minX - ox) / dx, t2 = (b.maxX - ox) / dx, s = -1;
    if (t1 > t2) { const k = t1; t1 = t2; t2 = k; s = 1; }
    if (t1 > tmin) { tmin = t1; nx = s; ny = 0; nz = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (Math.abs(dy) < EPS) { if (oy < b.minY || oy > b.maxY) return false; }
  else {
    let t1 = (b.minY - oy) / dy, t2 = (b.maxY - oy) / dy, s = -1;
    if (t1 > t2) { const k = t1; t1 = t2; t2 = k; s = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = s; nz = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < EPS) { if (oz < b.minZ || oz > b.maxZ) return false; }
  else {
    let t1 = (b.minZ - oz) / dz, t2 = (b.maxZ - oz) / dz, s = -1;
    if (t1 > t2) { const k = t1; t1 = t2; t2 = k; s = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  hitOut.t = tmin; hitOut.nx = nx; hitOut.ny = ny; hitOut.nz = nz;
  return true;
}

// Axis-aligned solids plus an implicit floor plane at y = 0.
export class CollisionWorld {
  constructor() { this.boxes = []; }

  add(minX, minY, minZ, maxX, maxY, maxZ, opts = {}) {
    const b = { minX, minY, minZ, maxX, maxY, maxZ, enabled: true, tag: '', ...opts };
    this.boxes.push(b);
    return b;
  }

  addCentered(cx, cy, cz, w, h, d, opts) {
    return this.add(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2, opts);
  }

  remove(b) {
    const i = this.boxes.indexOf(b);
    if (i >= 0) this.boxes.splice(i, 1);
  }

  // Push a vertical cylinder (feet at pos.y) out of every solid it overlaps. Slides along surfaces.
  resolveCircle(pos, radius, height, stepUp = 0.3) {
    let hit = false;
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const b of this.boxes) {
        if (!b.enabled) continue;
        if (pos.y + height <= b.minY + 0.001) continue;
        // noStand: a thin row of screens on a desk blocks you, but is not a floor to be walked on
        if (!b.noStand && (pos.y >= b.maxY - 0.001 || b.maxY <= pos.y + stepUp)) continue;
        const cx = clamp(pos.x, b.minX, b.maxX), cz = clamp(pos.z, b.minZ, b.maxZ);
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2), push = radius - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          const l = pos.x - b.minX, r = b.maxX - pos.x, f = pos.z - b.minZ, k = b.maxZ - pos.z;
          const m = Math.min(l, r, f, k);
          if (m === l) pos.x = b.minX - radius;
          else if (m === r) pos.x = b.maxX + radius;
          else if (m === f) pos.z = b.minZ - radius;
          else pos.z = b.maxZ + radius;
        }
        moved = hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  groundHeight(x, z, feetY, radius, stepUp = 0.3) {
    let h = 0;
    for (const b of this.boxes) {
      if (!b.enabled || b.noStand || b.maxY > feetY + stepUp || b.maxY <= h) continue;
      // you stay on a surface until almost all of you is past its edge, so you step off cleanly instead of being shoved sideways
      const m = radius * 0.85;
      if (x < b.minX - m || x > b.maxX + m || z < b.minZ - m || z > b.maxZ + m) continue;
      h = b.maxY;
    }
    return h;
  }

  // The lowest thing overhead: nothing may push a head up through it (it would shove the player sideways through walls instead).
  ceilingHeight(x, z, feetY, radius) {
    let h = Infinity;
    for (const b of this.boxes) {
      if (!b.enabled || b.minY < feetY + 1 || b.minY >= h) continue;
      const dx = x - clamp(x, b.minX, b.maxX), dz = z - clamp(z, b.minZ, b.maxZ);
      if (dx * dx + dz * dz < radius * radius) h = b.minY;
    }
    return h;
  }

  // A ledge you are pressing into and could pull yourself onto: how far above your feet its top is, or 0.
  ledgeRise(x, z, feetY, radius, dirX, dirZ, maxRise, height) {
    let best = 0;
    for (const b of this.boxes) {
      if (!b.enabled || b.noStand) continue;
      const rise = b.maxY - feetY;
      if (rise <= 0 || rise > maxRise || (best && rise >= best)) continue;
      const cx = clamp(x, b.minX, b.maxX), cz = clamp(z, b.minZ, b.maxZ), dx = cx - x, dz = cz - z;
      if (dx * dx + dz * dz > radius * radius || dx * dirX + dz * dirZ <= 0) continue;
      if (this.ceilingHeight(cx + dirX * 0.3, cz + dirZ * 0.3, b.maxY, radius * 0.6) - b.maxY < height) continue;    // no room to stand up there
      best = rise;
    }
    return best;
  }

  // Nearest hit along a unit-length ray. filter(box) -> false ignores that solid.
  raycast(ox, oy, oz, dx, dy, dz, maxT, filter) {
    let best = null, bt = maxT;
    for (const b of this.boxes) {
      if (!b.enabled || (filter && !filter(b))) continue;
      if (rayBox(ox, oy, oz, dx, dy, dz, b, bt) && hitOut.t < bt) {
        bt = hitOut.t;
        best = { t: bt, box: b, nx: hitOut.nx, ny: hitOut.ny, nz: hitOut.nz };
      }
    }
    if (dy < -EPS && oy > 0) {
      const t = -oy / dy;
      if (t < bt) { bt = t; best = { t, box: null, nx: 0, ny: 1, nz: 0 }; }
    }
    return best;
  }

  // True when a solid lies between two points.
  blocked(ax, ay, az, bx, by, bz, filter) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return false;
    const hit = this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.02, filter);
    return !!(hit && hit.box);
  }

  // Would a disc of the given radius slide freely between two ground points?
  clearPath(ax, az, bx, bz, y, radius, filter) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < 1e-4) return true;
    const px = -dz / len * radius, pz = dx / len * radius;
    for (const k of [-1, 0, 1]) {
      if (this.blocked(ax + px * k, y, az + pz * k, bx + px * k, y, bz + pz * k, filter)) return false;
    }
    return true;
  }
}
