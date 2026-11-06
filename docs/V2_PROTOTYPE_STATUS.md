# INTRUDER V2: evolution prototype status

**Run it:** `npm run dev` in this folder, then http://localhost:5174. Add `?legacy` to the address to run the inherited game, which stays working for regression tests.

**Controls:** WASD move, Space jump, Shift dash, left click attack, right click or E absorb. Q tap: next mutation. Q hold: the wheel. 1 to 8: choose a limb. 0: bare arms.

## Implemented

| Area | What exists | Where |
|---|---|---|
| Separation | The prototype runs by default; `?legacy` runs the old game | `src/v2/flags.js` |
| Arms | Blender arm and suckers, mottled skin | `art/build_v2_arm.py`, `src/v2/armskin.js` |
| Body | Blender torso with no eyes on it, seen when looking down. Six walking limbs built from the same mesh as the raised arms, bent on the graphics card | `src/v2/limbs.js`, `art/build_v2_arm.py` |
| Locomotion | Limbs lie along the ground and haul, a hump rolling down each as it re-grips. They stream behind when running and draw in when airborne. They stop short of walls and props | `src/v2/limbs.js` |
| Absorption | Both arms lash out and coil round the target with real depth, suckers inward, haul it in and crush it. A machine's power drains; a creature only bruises. Swallows travel up the arms | `src/v2/absorbfx.js` |
| Transformation | The arm swells in lumps ahead of a raw dark edge, convulses, and parts force out past their final height and settle. It happens while you keep moving | `src/v2/armskin.js`, `src/presentation/viewmodel.js` |
| Integration | Black rings cinched into the arm with flesh bulging either side, welts round plates, puckered sockets for hoses, threaded ports on the housing, raw flesh in husk seams | `art/build_v2_arm.py` |
| Mutations | Data-driven registry. Three real mutations | `src/v2/mutations.js` |
| All limbs | Selected on the right arm, previous on the left, the rest on the walking limbs. Growth progress belongs to the mutation, so it carries across limbs | `src/v2/evolution.js` |
| Wheel | Eight fixed sectors, hold Q, world slows, mouse steers | `src/v2/wheel.js` |
| Ninth mutation | When all eight limbs are taken the wheel asks: replace a limb, or keep your body. Nothing is overwritten silently | `src/v2/wheel.js`, `src/v2/evolution.js` |
| Combat | Faster shots, shorter rests, moving while aiming, more machines at once, less health each. A machine left down for 6.5 seconds gets up again at 45 percent, with a warning | `src/game/enemies/android.js`, `src/world/procgen.js` |
| Android rig | Arms, elbows, knees and barrels corrected: all were backward | `src/game/enemies/android.js` |
| Lighting | Lamps steady, faulty ones stumble rarely and briefly. Lamps fade through the light limit. Bloom stays local | `src/world/level.js`, `src/game/game.js`, `src/presentation/post.js` |
| Desks | One collider per thing standing on a desk, measured from the triangles | `src/world/kit.js` |
| Test chapter | Short generated deck, androids only, harmless shellbacks to absorb | `src/v2/lab.js`, `src/v2/shellback.js` |
| Death | New body, new layout, chapter restarts. Discoveries persist; no permanent stats | `src/v2/lab.js` |

## The three mutations

| | Source | Looks like | Does | Costs |
|---|---|---|---|---|
| **Chitin Husk** (organic) | Shellback | Overlapping dark scutes, raw flesh in the seams | Heavy melee with knockback. Armours you while carried anywhere | Slower only while it is the raised arm: 10, 13, 16 percent by stage |
| **Shard Siphon** (biomechanical) | Trooper, scout | Plates, feed housing, black rings cinched into the arm, hoses into sockets, crystal teeth | Fast ranged fire | Every shot drinks energy; slower energy recovery |
| **Arc Nerves** (biomechanical) | Heavy | Copper coil packs with flesh forced up either side, insulators, exposed nerves | Lightning chains between machines | Huge energy cost; take more damage |

## Machines, before and after

| | Health | Speed | Shot speed | Damage | Aim time | Rest after burst |
|---|---|---|---|---|---|---|
| Trooper | 50 → 40 | 3.2 → 4.2 | 19 → 26 | 8 → 9 | 0.65 → 0.5 | 1.4-2.6 → 0.9-1.7 |
| Scout | 30 → 22 | 5.0 → 6.4 | 27 → 34 | 5 | 0.5 → 0.36 | same |
| Heavy | 110 → 85 | 2.2 → 2.8 | 10 → 15 | 14 → 16 | 0.85 → 0.7 | same |

Warnings before a fight went from 2.2 to 1.0 seconds, and between waves from 1.7 to 0.9. The first room has two troopers and a scout; deeper rooms add a heavy; the last room is bigger. All of this applies only in the prototype, not under `?legacy`.

## Verified, realistic mode

- **Ground contact and clipping, measured:** 2808 samples of the limbs while moving: 1 cm into the floor at worst, 8 cm above it at worst, none inside anything solid.
- **Absorb, measured:** 1.1 seconds (was 2.7). The player moved 7 metres during one. Repeat absorbs do not slow the game or change the selected weapon.
- **Android arms, measured:** barrels line up with the player at 0.995 to 1.0 (1.0 = exactly at you), muzzle in front of the chest. Confirmed in stills from the side and the front.
- **Flicker, measured:** the worst views went from 8.1 and 13.0 percent of the picture jumping to 0.5 and 0.6. Worst frame-to-frame brightness jump on a walk went from 30 to about 20 of 255. What remains is a bright panel really leaving view.
- **Desks, measured:** walking into each kind stops with your body touching its front, you stand at the height you see, the screens stop you, and the invisible wall across the analysis bench is gone.
- **Husk rule, measured:** raised at stage 1, ground 7.2 to 6.48, dash 18 to 16.2, air 6.9 to 6.21. Raised at stage 3, all 16 percent. Carried but not raised, full speed with the armour still on.
- **Ninth mutation, through real input:** Q, E, right click, number key and mouse with click all answer correctly, and only the chosen limb changes. Healing and energy apply whichever you choose. The world slows, and the trigger does nothing while it asks. Several at once queue. Tested with a stand-in, because only three mutations exist.
- **The loop, with real damage:** a bot played 12 layouts: 5 clears in 31 to 40 seconds, 7 deaths in 24 to 35 seconds. Before this round: 9 clears in 54 to 82 seconds and 2 deaths. The bot aims perfectly but cannot dodge, so this shows direction, not difficulty for a person.
- **Downed machines:** all three kinds can be absorbed and finished off. Trooper and heavy 12 of 12 from 3.4 metres. A scout falls away from you, so from some sides it needs one more step.
- **Inherited game via `?legacy`:** film to chapter end, facility playthroughs, journey. All pass. The script audit's `board` step reports false, and it reports the same on the commit before this round.
- **Cost, fully mutated, worst case:** 123 draw calls, 466k triangles, 0.14 ms to update the body (was 1.2 ms). Measured on a software renderer, so the frame rate on real hardware is unknown.

## Experimental, not proven

- **How it feels.** No person has played this. The combat numbers are a second guess after the first was far too hard for the bot.
- **The ninth mutation cannot happen in normal play yet.** With three mutations you can never fill eight limbs.
- **Fallen machines vary in how well the coils seat on them:** the coil follows the body's axis, and a heavy kneeling is the least tidy.
- **Stretch:** at long range the arm stretches a lot, and the suckers elongate near the far end.
- **Phone and Retro mode:** not tested. On a phone the ARMS button only cycles, and the wheel cannot be opened; the ninth-mutation question can be answered by touch but that is untested.
- **Androids, rooms:** still V1 art. The android redesign waits on approval of this round.
- **No third-person view** in play. The body is only seen from outside in tests.
- **Rigging:** nothing uses a skeleton. A skeleton would be needed for cutscenes showing the whole creature.

## Needs approval before going further

See the report that came with this build.
