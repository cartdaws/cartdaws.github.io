// THE MUTATIONS. One record each, and a record is not finished unless it says what you absorb to get it, what it looks like on your body, what it does, and what it costs you.
//   sources   what you absorb to discover it
//   nodes     the Blender meshes that grow on the limb carrying it
//   style     how the arm holds itself with it: rim colour, curl, how far the arm rolls to show its back, weapon = the arm's firing pose
//   attack    what the trigger does. Every number is [tier 1, tier 2, tier 3]
//   mods      the trade-off, applied while it is equipped
export const SLOTS = 8;            // the wheel holds eight, and so does the body: eight limbs
export const ENERGY_MAX = 100;
export const ENERGY_REGEN = 15;    // per second

// Your own arms, always available, costing nothing. Not a mutation and does not take a slot.
export const BARE = {
  id: 'bare', name: 'BARE ARMS', kind: 'none', nodes: [],
  style: { rim: 0x8a6a70, suck: 0x000000, suckI: 0, grip: 0, spread: 0, swell: 0, weapon: 0, roll: 0 },
  attack: { type: 'melee', dmg: [17], range: 3.5, cone: 0.55, rate: [0.4], cost: [0], hitAt: 0.11, dur: 0.42, heavy: false },
};

export const MUTATIONS = {
  husk: {
    id: 'husk', name: 'CHITIN HUSK', kind: 'organic', sources: ['shellback'], nodes: ['Mut_Carapace', 'Mut_CarapaceFlesh'], infect: 0.5,
    note: 'HEAVY BLOWS. ALWAYS ARMOURS YOU. SLOWS YOU WHILE IT IS RAISED.',
    style: { rim: 0xc09a70, suck: 0x000000, suckI: 0, grip: 0, spread: 0, swell: 0.55, weapon: 0.8, noMouth: true, roll: 2.2 },
    attack: { type: 'melee', dmg: [36, 46, 58], range: 4.0, cone: 0.42, rate: [0.8, 0.75, 0.7], cost: [10, 10, 10], hitAt: 0.17, dur: 0.62, heavy: true },
    mods: (t) => ({ dmgTaken: 1 - (0.2 + t * 0.07), speed: 1 - (0.07 + t * 0.03) }), slowNote: (t) => `${Math.round((0.07 + t * 0.03) * 100)}% SLOWER RAISED`,
  },
  shard: {
    id: 'shard', name: 'SHARD SIPHON', kind: 'tech', sources: ['trooper', 'scout'], nodes: ['Mut_Shard', 'Mut_ShardDark', 'Mut_ShardGlow', 'Mut_ShardFlesh', 'Mut_ShardRings'], infect: 0.85,
    note: 'FAST RANGED FIRE. EVERY SHOT DRINKS ENERGY.',
    style: { rim: 0x8ff5d8, suck: 0x08261e, suckI: 0.6, grip: 0, spread: 0, swell: 0.1, weapon: 1, roll: 2.6 },
    attack: { type: 'shard', dmg: [14, 18, 23], interval: [0.17, 0.15, 0.13], cost: [4.5, 4.5, 4.5] },
    mods: () => ({ regen: 0.85 }),
  },
  arc: {
    id: 'arc', name: 'ARC NERVES', kind: 'tech', sources: ['heavy'], nodes: ['Mut_Arc', 'Mut_ArcCeramic', 'Mut_ArcCable', 'Mut_ArcGlow', 'Mut_ArcFlesh'], infect: 0.95,
    note: 'CURRENT CHAINS BETWEEN MACHINES. HUGE ENERGY COST. EXPOSED NERVES TAKE MORE DAMAGE.',
    style: { rim: 0xa8d8ff, suck: 0x10306a, suckI: 1.0, grip: 0, spread: 0, swell: 0.1, weapon: 0.85, noMouth: true, roll: 2.4 },
    attack: { type: 'arc', dmgK: [1.2, 1.6, 2.1], rate: [0.42, 0.38, 0.34], cost: [24, 24, 24] },
    mods: (t) => ({ dmgTaken: 1 + 0.12 - t * 0.02 }),
  },
};

// How far up the limb a mutation has spread, per tier: absorb more of its source and it takes more of you.
export const TIER_GROW = [0.52, 0.78, 1.0];
export const MAX_TIER = 3;
