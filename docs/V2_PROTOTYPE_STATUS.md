# INTRUDER V2: evolution prototype status

**Run it:** `npm run dev` in this folder, then http://localhost:5174. Add `?legacy` to the address to run the inherited game, which stays working for regression tests.

**Controls:** WASD move, Space jump, Shift dash, left click attack, right click or E absorb. Q tap: next mutation. Q hold: the wheel. 1 to 8: choose a limb. 0: bare arms.

## Implemented

| Area | What exists | Where |
|---|---|---|
| Separation | The prototype runs by default; `?legacy` runs the old game | `src/v2/flags.js` |
| Arms | New Blender arm and suckers, new mottled skin, darker and more natural | `art/build_v2_arm.py`, `src/v2/armskin.js` |
| Body | Eight limbs in all: two raised arms and six walking, plus a Blender mantle seen when looking down | `art/build_v2_arm.py`, `src/game/body.js` |
| Mutations | Data-driven registry. Three real mutations, each with source, anatomy, attack and trade-off | `src/v2/mutations.js` |
| Anatomy | Blender meshes bend with the arm with no rig. Growth spreads with a raw edge and bruised flesh. Stages 1 to 3 cover more of the limb | `src/v2/armskin.js`, `src/v2/evolution.js` |
| All limbs | Selected mutation on the right arm, previous on the left, the rest on the walking limbs, so everything equipped is visible | `src/v2/evolution.js`, `src/v2/limbgrowth.js` |
| Loop | Absorb, discover or deepen, watch it happen, use it. Energy resource. Absorbing heals and refills energy | `src/v2/evolution.js`, `src/game/absorb.js` |
| Wheel | Eight fixed sectors, hold Q, world slows, mouse steers | `src/v2/wheel.js` |
| Test chapter | Short generated deck, androids only, harmless shellbacks to absorb | `src/v2/lab.js`, `src/v2/shellback.js` |
| Death | New body, new layout, chapter restarts. Discoveries persist; no permanent stats | `src/v2/lab.js`, `src/v2/evolution.js` |

## The three mutations

| | Source | Looks like | Does | Costs |
|---|---|---|---|---|
| **Chitin Husk** (organic) | Shellback | Overlapping scutes down the arm | Heavy melee with knockback | Slower. Takes less damage |
| **Shard Siphon** (biomechanical) | Trooper, scout | Armour plates, feed housing, hoses into the flesh, crystal teeth | Fast ranged fire | Every shot drinks energy; slower energy recovery |
| **Arc Nerves** (biomechanical) | Heavy | Copper coil packs, insulators, exposed nerves, prongs | Lightning chains between machines | Huge energy cost; take more damage |

Knowledge across lives: once discovered, a mutation can also come from other sources of the same nature, so a later life can get Arc Nerves from an ordinary trooper.

## Verified, realistic mode

- **The loop, with real damage:** a bot cleared the chapter in 62 seconds, lowest health 43, ending at Husk 3, Shard 3, Arc 2. It aims perfectly and skips walking between rooms, so this does not measure difficulty for a person.
- **Death:** the chapter restarts with a new layout, nothing equipped, 100 health, discoveries kept.
- **Trade-offs:** Husk measurably cut speed to 0.90 and damage to 73 percent.
- **Wheel, through its input path:** tap, hold, steer, release, empty sector, number keys, eight filled.
- **Inherited game via `?legacy`:** film to chapter end, three facility playthroughs, full journey. All pass.
- **Cost, fully mutated, worst case:** 108 draw calls, 319k triangles, 1.2 ms to update the body. Measured on a software renderer, so the frame rate on real hardware is still unknown.

## Experimental, not proven

- **How it feels.** No person has played this. Damage, energy costs and timings are first guesses.
- **Phone and Retro mode:** not tested. On a phone the ARMS button only cycles; the wheel cannot be opened.
- **Eight limbs at once** has only been tested with the three mutations repeated.
- **A ninth mutation:** the oldest gives way automatically. A temporary rule; a real choice should replace it.
- **Walking limb growths** step between rings rather than bending smoothly, and only update while looking down.
- **Tongues** of the absorb animation, the androids, the rooms: all still V1 art, not redesigned.
- **No third-person view.** The full creature cannot be seen from outside yet.
- **Rigging:** nothing here uses a skeleton. The arms bend in the graphics card and the legs on the CPU, and mutations follow both. That meets "deform naturally" so far; a skeleton would still be needed for cutscenes or a third-person body.

## Needs approval before going further

See the report that came with this build.
