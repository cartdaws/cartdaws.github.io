// THE MUTATIONS. One record each, and a record is not finished unless it says what you absorb to get it, what it looks like on your body, what it does, and what it costs you.
//   sources   what you absorb to discover it
//   nodes     the Blender meshes that grow on the limb carrying it
//   trunk     the Blender meshes it grows on the body itself, so the outline changes
//   limbK     how much thicker the limb carrying it becomes; massK how much it adds to the trunk's bulk
//   style     how the arm holds itself with it: rim colour, curl, how far the arm rolls to show its back, weapon = the arm's firing pose
//   attack    what the trigger does (melee, shard, arc, hook, blast, rail, seek, slam). Every number is [stage 1, stage 2, stage 3]
//   mods      what it does to your body wherever you carry it
//   move      how you move while it is the arm you have raised
//   role, plus, minus   the same thing in words, for the wheel and the lab
export const SLOTS = 8;            // the wheel holds eight, and so does the body: eight limbs
export const ENERGY_MAX = 100;
export const ENERGY_REGEN = 15;    // per second
export const STACK_BONUS = 0.12;   // past stage 3, every further absorb of its enemy makes the mutation this much stronger

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
    id: 'shard', name: 'SHARD SIPHON', kind: 'tech', sources: ['trooper'], nodes: ['Mut_Shard', 'Mut_ShardDark', 'Mut_ShardGlow', 'Mut_ShardFlesh', 'Mut_ShardRings'], infect: 0.85,
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
  hook: {
    id: 'hook', name: 'TENDON HOOK', kind: 'tech', sources: ['scout'], nodes: ['Mut_Hook', 'Mut_HookDark', 'Mut_HookCable', 'Mut_HookFlesh'], infect: 0.7,
    trunk: ['Tor_Hook', 'Tor_HookDark', 'Tor_HookCable', 'Tor_HookFlesh'], limbK: 0.0, massK: 0.025, hud: '#b0b4b8',
    note: 'THE ARM SHOOTS OUT AND TAKES HOLD. LIGHT MACHINES COME TO YOU. YOU GO TO HEAVY ONES, AND TO ANY SURFACE.',
    role: 'CONTROL AND MOVEMENT', plus: 'YANKS MACHINES OFF THEIR FEET. CARRIES YOU ANYWHERE YOU CAN SEE. RAISED, YOU ARE AGILE', minus: 'BARELY HURTS. ONE TARGET. BRINGS THEM INTO YOUR FACE. YOU CANNOT STEER WHILE PULLED',
    style: { rim: 0xc8d0d8, suck: 0x000000, suckI: 0, grip: 0, spread: 0, swell: 0.05, weapon: 0.85, noMouth: true, roll: 2.3 },
    attack: { type: 'hook', dmg: [8, 11, 14], range: [17, 20, 23], stun: [0.6, 0.75, 0.9], rate: [0.95, 0.8, 0.65], cost: [12, 12, 12] },
    mods: () => ({ dmgTaken: 1.05 }),
    move: () => ({ accel: 1.35 }),
    moveNote: () => 'AGILE',
  },
  blast: {
    id: 'blast', name: 'BLAST BLADDER', kind: 'organic', sources: ['bug'], nodes: ['Mut_Blast', 'Mut_BlastBone'], infect: 0.4,
    trunk: ['Tor_Blast', 'Tor_BlastBone'], limbK: 0.14, massK: 0.05, hud: '#d8c0ae',
    note: 'THE ARM FILLS, THEN VENTS. A CONE OF PRESSURE THAT THROWS EVERYTHING IN FRONT OF YOU BACK. WORST AT A DISTANCE.',
    role: 'CLOSE AND CROWDED', plus: 'HITS EVERYTHING IN A WIDE CONE AT ONCE. HURLS MACHINES BACK AND OFF THEIR AIM. LOOSES THE ONES CLOSING ON YOU', minus: 'HALF THE POWER BY THE EDGE OF ITS REACH. SHORT RANGE. KICKS YOU BACK A STEP',
    style: { rim: 0xe4d0c0, suck: 0x000000, suckI: 0, grip: 0, spread: 0, swell: 0.4, weapon: 0.9, noMouth: true, roll: 2.2 },
    attack: { type: 'blast', dmg: [26, 34, 42], range: [8.5, 9.5, 10.5], cone: 0.62, knock: [3.2, 3.8, 4.4], stun: [0.45, 0.55, 0.65], rate: [0.95, 0.88, 0.8], cost: [20, 20, 20] },
    mods: () => ({}),
    move: () => ({}),
  },
  rail: {
    id: 'rail', name: 'RAIL SPIKE', kind: 'tech', sources: ['drone'], nodes: ['Mut_Rail', 'Mut_RailDark', 'Mut_RailGlow'], infect: 0.9,
    trunk: ['Tor_Rail', 'Tor_RailDark', 'Tor_RailGlow'], limbK: 0.0, massK: 0.03, hud: '#ffb060',
    note: 'ONE NEEDLE, ANY DISTANCE, THROUGH EVERYTHING IN ITS LINE. SLOW TO RECOVER. LINE THEM UP.',
    role: 'ONE PERFECT SHOT', plus: 'NEVER MISSES, NEVER FADES, PASSES THROUGH EVERY MACHINE IN A LINE. HEAVY ARMOUR DOES NOT STOP IT', minus: 'ONE SHOT, THEN A LONG WAIT. EXPENSIVE. NOTHING IF YOU MISS YOUR AIM. USELESS WHEN SURROUNDED',
    style: { rim: 0xffc890, suck: 0x2a1408, suckI: 0.7, grip: 0, spread: 0, swell: 0.05, weapon: 1, noMouth: true, roll: 2.5 },
    attack: { type: 'rail', dmg: [56, 72, 90], range: 80, width: 0.22, rate: [1.5, 1.35, 1.2], cost: [32, 32, 32] },
    mods: () => ({ regen: 0.92 }),
    move: () => ({ speed: 0.97 }),
    moveNote: () => 'STEADY',
  },
  seek: {
    id: 'seek', name: 'SEEKER', kind: 'tech', sources: ['armored'], nodes: ['Mut_Seek', 'Mut_SeekSteel', 'Mut_SeekGlow'], infect: 0.85,
    trunk: ['Tor_Seek', 'Tor_SeekSteel', 'Tor_SeekGlow'], limbK: 0.04, massK: 0.04, hud: '#ff6a50',
    note: 'A SLOW MISSILE THAT CHOOSES ITS OWN WAY AROUND COVER. MORE OF THEM AS IT DEEPENS. DODGEABLE, BUT SO ARE YOU.',
    role: 'AROUND CORNERS', plus: 'HOMES IN ON THE NEAREST MACHINE YOU WERE LOOKING AT. BLASTS EVERYTHING AROUND IT. STAGE 2 AND 3 LAUNCH MORE', minus: 'SLOW TO ARRIVE. A FAST MACHINE CAN OUTRUN IT. THE BLAST HURTS YOU TOO',
    style: { rim: 0xff9078, suck: 0x300c08, suckI: 0.8, grip: 0, spread: 0, swell: 0.1, weapon: 0.9, noMouth: true, roll: 2.4 },
    attack: { type: 'seek', dmg: [30, 36, 42], radius: [3.0, 3.3, 3.6], count: [1, 2, 3], speed: 11, turn: 2.6, life: 4.5, rate: [1.15, 1.1, 1.05], cost: [24, 24, 24] },
    mods: () => ({ dmgTaken: 1.04 }),
    move: () => ({}),
  },
  slam: {
    id: 'slam', name: 'SEISMIC FIST', kind: 'organic', sources: ['brute'], nodes: ['Mut_Slam', 'Mut_SlamSteel', 'Mut_SlamGlow'], infect: 0.6,
    trunk: ['Tor_Slam', 'Tor_SlamSteel', 'Tor_SlamGlow'], limbK: 0.2, massK: 0.06, hud: '#d88848',
    note: 'THE FIST COMES DOWN AND THE FLOOR ANSWERS. A WAVE RUNS ALONG THE GROUND, THROWING THEM OFF THEIR FEET.',
    role: 'CONTROLLING THE FLOOR', plus: 'A GROUND WAVE ALONG THE FLOOR, THROUGH COVER AND OVER LOW WALLS. STAGGERS EVERYTHING IT TOUCHES. YOU ARE HARD TO KNOCK DOWN', minus: 'ONLY HITS WHAT STANDS ON THE FLOOR. TELLS THEM IT IS COMING. SLOWS YOU WHILE RAISED',
    style: { rim: 0xe0a060, suck: 0x000000, suckI: 0, grip: 0, spread: 0, swell: 0.6, weapon: 0.8, noMouth: true, roll: 2.2 },
    attack: { type: 'slam', dmg: [30, 40, 52], range: [13, 15, 17], width: 1.5, stagger: [0.7, 0.85, 1.0], rate: [1.0, 0.92, 0.85], cost: [18, 18, 18], hitAt: 0.2, dur: 0.6 },
    mods: (t) => ({ dmgTaken: 1 - (0.08 + t * 0.02) }),
    move: () => ({ speed: 0.94, accel: 0.7, jump: 0.92 }),
    moveNote: () => '6% SLOWER, PLANTED',
  },
};

// How far up the limb a mutation has spread, per stage: absorb more of its source and it takes more of you.
export const TIER_GROW = [0.52, 0.78, 1.0];
export const MAX_TIER = 3;
