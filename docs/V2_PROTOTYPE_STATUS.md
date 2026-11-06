# INTRUDER V2: evolution prototype status

**Run it:** `npm run dev` in this folder, then http://localhost:5174. The menu has **EVOLUTION LAB** (the test room) and **TEST CHAPTER**. Add `?legacy` to the address to run the inherited game, which stays working for regression tests.

**Controls:** WASD move, Space jump, Shift dash, left click attack, right click or E absorb. Q tap: next mutation. Q hold: the wheel. 1 to 8: raise that limb. 0: bare arms. **Hold V: see your whole body.** In the lab, E on a floor pad.

**Checkpoint before Evolution 2.0:** tag `v2-checkpoint-pre-evolution2`, and `Desktop/Intruder-Backups/intruder-v2-127c929-pre-evolution2.bundle`.

## Implemented

| Area | What exists | Where |
|---|---|---|
| Separation | The prototype runs by default; `?legacy` runs the old game | `src/v2/flags.js` |
| Eight limbs | Eight real limbs, one per wheel slot at a fixed place round the body. A mutation stays on its limb. Choosing it raises that limb; the rest walk | `src/v2/limbs.js`, `src/v2/evolution.js` |
| Wheel | A plan of your body from above: each sector sits where its limb is. Shows role, strengths and limits. Hold Q, world slows, mouse steers | `src/v2/wheel.js` |
| Ninth mutation | When all eight are taken and you absorb something you do not carry, the wheel asks: replace a limb or keep your body. Nothing is ever overwritten. Something you already carry does not ask | `src/v2/wheel.js`, `src/v2/evolution.js` |
| Silhouette | Each mutation also grows on the trunk, climbing from the limb roots as it deepens: a humped shell; tanks, spine housing and exhaust stacks; a coil and insulated prongs. The trunk bulks up, and limbs carrying husk thicken | `art/build_v2_arm.py`, `src/v2/limbs.js` |
| Transformation | The arm swells in lumps ahead of a raw dark edge, convulses, and parts force out and settle. A walking limb lifts into the corner of your view while it changes. It never stops you moving | `src/v2/armskin.js`, `src/v2/limbs.js` |
| Absorption: machine | Arms coil round it and haul it up. Each real part is wrenched off in turn, outermost first, and dragged into the coils; each sends a metal-grey lump up the arm. Sparks and clatter. Its blue power drains. Nothing is left. Gives more energy, less healing | `src/v2/absorbfx.js` |
| Absorption: living | Too heavy to lift: the arms squeeze it on the floor. The shell cracks, darkens and sags, dark drips fall, and slow wide swallows run up the arms. The empty shell stays behind. Gives more healing, less energy | `src/v2/absorbfx.js`, `src/v2/shellback.js` |
| Machines go down first | A machine that is awake always goes down before it can die, however hard the blow, so there is something to absorb. Finishing it off is a choice | `src/game/enemies/enemy.js` |
| See yourself | Hold V: the camera steps out and the mouse orbits it, with the world slowed | `src/v2/inspect.js` |
| Evolution Lab | One compact room: four specimens that come back, inert machines to measure against, two ledges and a dash lane, pads to wake a squad / grow every limb / start a new body, and a live comparison panel | `src/v2/gym.js` |
| Test chapter | Short generated deck, androids only, harmless shellbacks to absorb | `src/v2/lab.js`, `src/v2/shellback.js` |
| Death | New body, new layout, chapter restarts. Discoveries persist; no permanent stats. In the lab you return with your build | `src/v2/lab.js`, `src/v2/gym.js` |

## The three mutations

Measured at stage 3 unless noted. Baseline with bare arms or Shard raised: 7.2 m/s, 0.17 s to reach speed, no slide, dash 18 m/s for 3.2 m, jump 1.73 m (test figures; the panel shows the calculated peak).

| | **Chitin Husk** (organic) | **Shard Siphon** (biomechanical gun) | **Arc Nerves** (biomechanical) |
|---|---|---|---|
| Source | Shellback | Trooper, scout | Heavy |
| Purpose | Close and brutal | At a distance | Against many |
| Strength | Armour wherever carried (damage taken 59%). Blows stagger. Dash becomes a charge that damages, knocks back and stuns | Hits at any range | Finds its own target. Conducts through nearby machines, +25% per machine, and stops them firing. Raised, you are quicker |
| Limit | No reach. Raised: slow, slides, jumps low | Drinks energy. Spreads as you hold it. Slows you 16% while firing. Half damage to heavies. Slower energy recovery | Weak on one target. Huge cost. You take 6 to 10% more damage. Burns out downed machines you could have absorbed |
| Top speed, raised | 6.05 | 7.2 | 7.63 |
| Time to reach speed | 0.37 s | 0.17 s | 0.13 s |
| Slide after stopping | 0.39 m | none | none |
| Dash | 13 m/s for 0.3 s, 3.8 m, a charge | 18 m/s, 3.2 m | 18 m/s, 3.2 m |
| Jump (test figure) | 1.24 m | 1.73 m | 1.91 m |
| The 2.25 m ledge | **Cannot reach** | Can | Can |
| Inert trooper | 0.2 s, only within 4 m | 0.3-0.37 s at any range | 0.73 s |
| Inert heavy | 0.9 s, only within 4 m | 1.5 s | 3.17 s, and all its energy |
| Four machines at once | One at a time | One at a time | All four: 32 damage each, all stopped firing |

Further limbs: once a mutation reaches stage 3, absorbing its source grows it on another free limb, and each extra limb makes that mutation 10% stronger. Passive armour and costs do not stack.

## Machines

| | Health | Speed | Shot speed | Damage | Aim time | Rest after burst |
|---|---|---|---|---|---|---|
| Trooper | 40 | 4.2 | 26 | 9 | 0.5 | 0.9-1.7 |
| Scout | 22 | 6.4 | 34 | 5 | 0.36 | same |
| Heavy | 85 | 2.8 | 15 | 16 | 0.7 | same |

A machine left down for 6.5 seconds gets up at 45 percent, with a warning. Lab specimens do not.

## Verified, realistic mode

- **Limb assignment:** changing arms leaves every mutation on the same limb.
- **Clipping and ground contact, measured:** 2808 samples on walking limbs, twice: none inside anything solid, 1.2 cm into the floor at worst, 8 cm above it at worst.
- **The lab through real input:** the pads with the E key; specimens absorbed through the real absorb and respawned; the eight-limb question reached by the fill pad and a real absorb; keeping, replacing limb 3, and no question for something already carried; a new body; a squad awake and lethal with real damage; dying and returning with the build kept; leaving for the test chapter, which cleans up.
- **Ninth-mutation routes:** Q, E, right click, number keys and mouse with click. Only the chosen limb changes. Healing and energy apply either way. The trigger is off while it asks. Several queue.
- **Absorb:** 1.07 seconds, you keep moving, nothing slows. All three android types from every side at 3.4 m.
- **Test chapter, a bot with real damage, 6 layouts:** 3 clears in 63 to 68 seconds, 3 deaths in 27 to 57 seconds. It reached eight limbs in normal play. The bot aims perfectly and cannot dodge, so this shows direction, not difficulty for a person.
- **Inherited game via `?legacy`:** three playthroughs won with nothing stuck, the journey script and the road test complete. The script audit's `board` step reports false, as it did before this work.
- **Cost, worst case, every limb mutated:** 128 draw calls, 504k triangles, 0.11 ms to update the body. Measured on a software renderer, so the frame rate on real hardware is unknown. `v2_arm.glb` grew from 2.5 to 4.1 MB.

## Experimental, not proven

- **How it feels.** No person has played this. Every number is a measured first guess.
- **Further limbs of the same mutation** were added so eight limbs can be reached with only three mutations. Whether this is the right rule is a design question.
- **The limb lifting into view** can pass partly behind a raised arm on the same side.
- **Seen from outside,** the raised arms hold one pose; they do not strike or fire. Their mutation plates face away from you while absorbing, because the underside faces you.
- **Long-range grabs** stretch the arm, and the suckers elongate near the far end. A kneeling heavy gives the least tidy coils.
- **Phone and Retro mode:** not tested. On a phone there is no way to hold V or press E on a pad yet.
- **Androids, rooms:** still V1 art. The android redesign and new mutations wait for approval.
- **Rigging:** nothing uses a skeleton.
