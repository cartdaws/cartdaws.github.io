// THE MUTATIONS. One record each, and a record is not finished unless it says what you absorb to get it, what it looks like on your body, what it does, and what it costs you.
//   sources   what you absorb to discover it
//   nodes     the Blender meshes that grow on the limb carrying it
//   trunk     the Blender meshes it grows on the body itself, so the outline changes
//   limbK     how much thicker the limb carrying it becomes; massK how much it adds to the trunk's bulk
//   style     how the arm holds itself with it: rim colour, curl, how far the arm rolls to show its back, weapon = the arm's firing pose
//   attack    what the trigger does. Every number is [stage 1, stage 2, stage 3]
//   mods      what it does to your body wherever you carry it. The strongest copy counts; copies do not stack
//   move      how you move while it is the arm you have raised
//   role, plus, minus   the same thing in words, for the wheel and the lab
export const SLOTS = 8;            // the wheel holds eight, and so does the body: eight limbs
export const ENERGY_MAX = 100;
export const ENERGY_REGEN = 15;    // per second
export const COPY_BONUS = 0.1;     // each further limb committed to the same mutation strengthens it by this much

// Your own arms, always available, costing nothing. Not a mutation and does not take a slot.
export const BARE = {
  id: 'bare', name: 'BARE ARMS', kind: 'none', nodes: [], role: 'YOUR OWN ARMS', plus: 'COSTS NOTHING', minus: 'WEAK AND SHORT',
  style: { rim: 0x8a6a70, suck: 0x000000, suckI: 0, grip: 0, spread: 0, swell: 0, weapon: 0, roll: 0 },
  attack: { type: 'melee', dmg: [12], range: 3.5, cone: 0.55, rate: [0.4], cost: [0], hitAt: 0.11, dur: 0.42, heavy: false },
};

export const MUTATIONS = {
  husk: {
    id: 'husk', name: 'CHITIN HUSK', kind: 'organic', sources: ['shellback'], nodes: ['Mut_Carapace', 'Mut_CarapaceFlesh'], infect: 0.5,
    trunk: ['Tor_Husk', 'Tor_HuskFlesh'], limbK: 0.22, massK: 0.05, hud: '#8a6f52',
    note: 'HEAVY BLOWS. ALWAYS ARMOURS YOU. RAISED, YOU BECOME SLOW AND HEAVY.',
    role: 'CLOSE AND BRUTAL', plus: 'ARMOUR WHEREVER YOU CARRY IT. BLOWS STAGGER. DASH BECOMES A CHARGE', minus: 'RAISED: SLOW, SLIDES, JUMPS LOW. NO REACH',
    style: { rim: 0xc09a70, suck: 0x000000, suckI: 0, grip: 0, spread: 0, swell: 0.55, weapon: 0.8, noMouth: true, roll: 2.2 },
    attack: { type: 'melee', dmg: [36, 46, 58], range: 4.0, cone: 0.42, rate: [0.8, 0.75, 0.7], cost: [10, 10, 10], hitAt: 0.17, dur: 0.62, heavy: true, stagger: 0.55 },
    charge: { dmg: [28, 38, 50], stagger: 0.8, knock: 1.6 },
    mods: (t) => ({ dmgTaken: 1 - (0.2 + t * 0.07) }),
    move: (t) => ({ speed: 1 - (0.07 + t * 0.03), accel: 0.42, jump: 0.85, dash: 0.72, dashT: 1.7 }),
    moveNote: (t) => `${Math.round((0.07 + t * 0.03) * 100)}% SLOWER, HEAVY`,
  },
  shard: {
    id: 'shard', name: 'SHARD SIPHON', kind: 'tech', sources: ['trooper', 'scout'], nodes: ['Mut_Shard', 'Mut_ShardDark', 'Mut_ShardGlow', 'Mut_ShardFlesh', 'Mut_ShardRings'], infect: 0.85,
    trunk: ['Tor_Shard', 'Tor_ShardDark', 'Tor_ShardRings', 'Tor_ShardFlesh', 'Tor_ShardGlow'], limbK: 0.06, massK: 0.035, hud: '#7fb8a8',
    note: 'FAST RANGED FIRE. EVERY SHOT DRINKS ENERGY. WEAK AGAINST HEAVY ARMOUR.',
    role: 'AT A DISTANCE', plus: 'HITS AT ANY RANGE. CONSTANT PRESSURE', minus: 'DRINKS ENERGY. SPREADS AS YOU HOLD IT. SLOWS YOU FIRING. HALF DAMAGE TO HEAVIES',
    style: { rim: 0x8ff5d8, suck: 0x08261e, suckI: 0.6, grip: 0, spread: 0, swell: 0.1, weapon: 1, roll: 2.6 },
    attack: { type: 'shard', dmg: [9, 12, 15], interval: [0.17, 0.15, 0.13], cost: [4.5, 4.5, 4.5], bloom: [0.05, 0.04, 0.03], fireSpeed: 0.84, armour: 0.5 },
    mods: () => ({ regen: 0.85 }),
    move: () => ({}),
  },
  arc: {
    id: 'arc', name: 'ARC NERVES', kind: 'tech', sources: ['heavy'], nodes: ['Mut_Arc', 'Mut_ArcCeramic', 'Mut_ArcCable', 'Mut_ArcGlow', 'Mut_ArcFlesh'], infect: 0.95,
    trunk: ['Tor_Arc', 'Tor_ArcCeramic', 'Tor_ArcDark', 'Tor_ArcGlow', 'Tor_ArcFlesh'], limbK: -0.04, massK: 0.03, hud: '#8fc0e8',
    note: 'CURRENT CONDUCTS THROUGH NEARBY MACHINES AND FREEZES THEM. HUGE ENERGY COST. EXPOSED NERVES TAKE MORE DAMAGE.',
    role: 'AGAINST MANY', plus: 'FINDS ITS OWN TARGET. JUMPS MACHINE TO MACHINE, STRONGER WITH EACH. STOPS THEM FIRING. RAISED, YOU ARE QUICK', minus: 'WEAK ON ONE TARGET. HUGE ENERGY COST. YOU TAKE MORE DAMAGE. BURNS OUT MACHINES YOU COULD ABSORB',
    style: { rim: 0xa8d8ff, suck: 0x10306a, suckI: 1.0, grip: 0, spread: 0, swell: 0.1, weapon: 0.85, noMouth: true, roll: 2.4 },
    attack: { type: 'arc', dmg: [11, 14, 18], range: [13, 14, 15], links: [3, 4, 5], radius: 7, stun: [0.35, 0.5, 0.65], rate: [0.42, 0.38, 0.34], cost: [24, 24, 24], regenHold: 0.5 },
    mods: (t) => ({ dmgTaken: 1 + 0.12 - t * 0.02 }),
    move: () => ({ speed: 1.06, accel: 1.15, jump: 1.05 }),
    moveNote: () => '6% FASTER, EXPOSED',
  },
};

// How far up the limb a mutation has spread, per stage: absorb more of its source and it takes more of you.
export const TIER_GROW = [0.52, 0.78, 1.0];
export const MAX_TIER = 3;
