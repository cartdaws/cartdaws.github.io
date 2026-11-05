# The survivor's kind: design brief (v2, "stranger")

The old body was a bell on rope legs. This is a creature no Earth animal resembles.

## Silhouette
- **Mantle**: a tall, narrow teardrop of translucent gel, widest at the shoulders, tapering to a waist. Not a bell, not a torso.
- **Crown, not a face**: five sensory pits in an arc across the upper dome (they glow when it senses), and three long feeler whips that fan up and back like a lyrebird's tail and tremble when it listens.
- **Collar**: a thick ring at the shoulders. The two arms leave it; it is also where the absorb tongues come from.
- **Frill**: a skirt of pointed membrane flaps hanging from the waist. It hides the leg roots and ripples when it walks.
- **Inside** (visible through the gel): a spine of glowing nodes, a central core that pulses, two dark organ sacs.
- **Legs**: six jointed stilts in a tripod gait. Each has a swollen knee, a long calf and a three-toed paddle foot, a luminous seam down the front. They are *not* ropes: they bend at the knee like an insect's, and the feet never stretch (two-bone IK, planted feet).
- **Arms** (first person): long, double-jointed, ending in a hand of four fine tentacle-fingers around a glowing palm lens.

## Elder variant
Same anatomy, 1.28x, paler violet-tinted gel, longer feelers, a second ring on the collar, slower breathing.

## Colour (see STYLE.md)
Gel `#0d6560` to `#7fe8da`, glow `#c6fff6`; sensory pits and core amber-white; elder accents violet `#b99cff`.

## Technical
- Y-up in game; nose/face toward -Z. Blender: +Y forward, Z up (exports correctly).
- Anchor empties for the game: `Hip0..Hip5`, `ShoulderL`, `ShoulderR`, `Crown`, `Core`.
- Gel materials are swapped for the game's own gel shader at load (by material name): `GelBody`, `GelLimb`, `GlowCore`, `GlowNode`, `Sensor`, `Feeler`.
