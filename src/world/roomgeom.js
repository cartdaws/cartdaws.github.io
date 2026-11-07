// Small shared geometry for generated rooms: where a door on a given side sits, and the clear approach in front of it.
// A room's doors may sit anywhere along their wall (r.doorT[side] is the x of a north/south door or the z of an east/west one); rooms without one use the centre line.
export const WALL_T = 0.5;
export const DOOR_HALF = 1.5;           // the opening is 3 m wide
export const LANE_W = 4.4, LANE_D = 4.2;  // the approach in front of a door that nothing may stand in

export const doorT = (r, side) => (r.doorT && r.doorT[side] != null ? r.doorT[side] : side[0] === 'z' ? r.cx : r.cz);

export function doorPos(r, side) {
  const t = doorT(r, side);
  if (side === 'zmin') return { x: t, z: r.z0 - WALL_T / 2, axis: 'z' };
  if (side === 'zmax') return { x: t, z: r.z1 + WALL_T / 2, axis: 'z' };
  if (side === 'xmin') return { x: r.x0 - WALL_T / 2, z: t, axis: 'x' };
  return { x: r.x1 + WALL_T / 2, z: t, axis: 'x' };
}

// The rectangle in front of a door, inside the room, that stays clear: [x0, x1, z0, z1]
export function laneRect(r, side, pad = 0) {
  const t = doorT(r, side), w = LANE_W / 2 + pad, d = LANE_D + pad;
  if (side === 'zmin') return [t - w, t + w, r.z0, r.z0 + d];
  if (side === 'zmax') return [t - w, t + w, r.z1 - d, r.z1];
  if (side === 'xmin') return [r.x0, r.x0 + d, t - w, t + w];
  return [r.x1 - d, r.x1, t - w, t + w];
}

export const roomSides = (r) => [r.inSide, r.outSide, ...(r.extraSides || [])].filter(Boolean);
