// Z-fighting guard for boxes built from overlapping slabs. Two boxes whose faces lie in the same plane and face the same way overlap exactly, so the
// graphics card cannot decide which one is in front and the surface shimmers and flips between them as you move. Each face that shares its plane with
// an overlapping face of an earlier box is drawn a few millimetres back, by the smallest step nobody else overlapping it is using. Collision is not
// touched, and nobody can see 3 mm.
const SAME = 0.0005, STEP = 0.003, MIN_OVERLAP = 0.02;

export class FaceGuard {
  constructor() { this.boxes = []; }
  // box = [x0, x1, y0, y1, z0, z1]; returns the box to draw
  fit(box) {
    const out = box.slice(), steps = [0, 0, 0, 0, 0, 0];
    for (let ax = 0; ax < 3; ax++) {
      const o1 = (ax + 1) % 3, o2 = (ax + 2) % 3;
      for (const hi of [0, 1]) {
        const i = ax * 2 + hi, used = new Set();
        for (const b of this.boxes) {
          if (Math.abs(b.orig[i] - box[i]) > SAME) continue;
          if (Math.min(box[o1 * 2 + 1], b.orig[o1 * 2 + 1]) - Math.max(box[o1 * 2], b.orig[o1 * 2]) < MIN_OVERLAP) continue;
          if (Math.min(box[o2 * 2 + 1], b.orig[o2 * 2 + 1]) - Math.max(box[o2 * 2], b.orig[o2 * 2]) < MIN_OVERLAP) continue;
          used.add(b.steps[i]);
        }
        let k = 0; while (used.has(k)) k++;
        steps[i] = k; out[i] += (hi ? -1 : 1) * k * STEP;        // the top, east and south faces come down or in, the others come up or in
      }
    }
    for (let ax = 0; ax < 3; ax++) if (out[ax * 2 + 1] - out[ax * 2] < 0.01) { out[ax * 2] = box[ax * 2]; out[ax * 2 + 1] = box[ax * 2 + 1]; steps[ax * 2] = steps[ax * 2 + 1] = 0; }     // never collapse a slab
    this.boxes.push({ orig: box.slice(), steps, out });
    return out;
  }
}
