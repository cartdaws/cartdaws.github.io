// Coarse walkable grid over the arena with a flow field toward the player.
export class NavGrid {
  constructor(world, bounds, cell = 0.6, radius = 0.5) {
    this.b = bounds;
    this.cell = cell;
    this.w = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.h = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
    this.dist = new Int16Array(this.w * this.h).fill(-1);
    this.queue = new Int32Array(this.w * this.h);
    this.lastKey = -2;
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = bounds.minX + (i + 0.5) * cell, z = bounds.minZ + (j + 0.5) * cell;
        let blk = x < bounds.minX + radius || x > bounds.maxX - radius || z < bounds.minZ + radius || z > bounds.maxZ - radius;
        if (!blk) {
          for (const bx of world.boxes) {
            if (bx.tag === 'door' || bx.tag === 'barrel' || bx.minY > 1 || bx.maxY <= 0.35) continue;
            const cx = Math.max(bx.minX, Math.min(x, bx.maxX)), cz = Math.max(bx.minZ, Math.min(z, bx.maxZ));
            if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) { blk = true; break; }
          }
        }
        this.blocked[j * this.w + i] = blk ? 1 : 0;
      }
    }
  }

  cellOf(x, z) {
    const i = Math.min(this.w - 1, Math.max(0, Math.floor((x - this.b.minX) / this.cell)));
    const j = Math.min(this.h - 1, Math.max(0, Math.floor((z - this.b.minZ) / this.cell)));
    return j * this.w + i;
  }

  setTarget(x, z) {
    const key = this.cellOf(x, z);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const { w, h, dist, queue, blocked } = this;
    dist.fill(-1);
    let start = key;
    if (blocked[start]) { // snap to nearest open cell
      const si = start % w, sj = (start / w) | 0;
      let bestD = 1e9;
      for (let r = 1; r < 8 && bestD === 1e9; r++) {
        for (let j = sj - r; j <= sj + r; j++) for (let i = si - r; i <= si + r; i++) {
          if (i < 0 || j < 0 || i >= w || j >= h || blocked[j * w + i]) continue;
          const d = (i - si) ** 2 + (j - sj) ** 2;
          if (d < bestD) { bestD = d; start = j * w + i; }
        }
      }
    }
    let qh = 0, qt = 0;
    dist[start] = 0;
    queue[qt++] = start;
    while (qh < qt) {
      const c = queue[qh++], ci = c % w, cj = (c / w) | 0, d = dist[c] + 1;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const n = nj * w + ni;
        if (blocked[n] || dist[n] >= 0) continue;
        if (di && dj && (blocked[cj * w + ni] || blocked[nj * w + ci])) continue;
        dist[n] = d;
        queue[qt++] = n;
      }
    }
  }

  // Writes the unit direction toward the player into out ({x,z}); returns false when no route exists.
  dir(x, z, out) {
    const { w, h, dist, blocked } = this;
    const c = this.cellOf(x, z), ci = c % w, cj = (c / w) | 0;
    let best = dist[c] < 0 ? 1e9 : dist[c], bi = -1, bj = -1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const n = nj * w + ni;
      if (blocked[n] || dist[n] < 0) continue;
      if (di && dj && (blocked[cj * w + ni] || blocked[nj * w + ci])) continue;
      if (dist[n] < best) { best = dist[n]; bi = ni; bj = nj; }
    }
    if (bi < 0) return false;
    const tx = this.b.minX + (bi + 0.5) * this.cell, tz = this.b.minZ + (bj + 0.5) * this.cell;
    const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz) || 1;
    out.x = dx / l; out.z = dz / l;
    return true;
  }

  forceRefresh() { this.lastKey = -2; }
}
