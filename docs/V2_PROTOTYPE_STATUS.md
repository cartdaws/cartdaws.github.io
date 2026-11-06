# INTRUDER V2: evolution prototype status

**Run it:** `npm run dev` in this folder, then http://localhost:5174. The menu has **EVOLUTION LAB** (the test room) and **TEST CHAPTER**. Add `?legacy` to the address to run the inherited game, which stays working for regression tests.

**Controls:** WASD move, Space jump, Shift dash, left click attack, right click or E absorb. Q tap: next mutation. Q hold: the wheel. 1 to 8: raise that limb. 0: bare arms. **Hold V: see your whole body.** In the lab, E on a floor pad.

**Checkpoints:** tags `v2-checkpoint-pre-evolution2` and `v2-checkpoint-pre-androids`, with bundles in `Desktop/Intruder-Backups`.

## Implemented

| Area | What exists | Where |
|---|---|---|
| Eight limbs | One real limb per wheel slot, at a fixed place round the body. A mutation holds one limb and stays on it. Choosing it raises that limb; the rest walk | `src/v2/limbs.js`, `src/v2/evolution.js` |
| Stacking | No multiples of a mutation. Each enemy gives one mutation. Absorbs 1 to 3 are stages that spread it over the limb and body; every absorb after that adds 12% power with no cap, and the limb and body keep getting bigger | `src/v2/evolution.js` |
| Wheel | A plan of your body from above. Shows stage, absorb count, role, strengths and limits | `src/v2/wheel.js` |
| Eight-limb choice | With all eight taken, absorbing something you do not carry asks: replace a limb or keep your body. Absorbing something you carry just strengthens it | `src/v2/wheel.js`, `src/v2/evolution.js` |
| Silhouette | Each mutation grows on the trunk, from the limb roots up: shell, machinery and stacks, coil and prongs, side reels, bloated sacs | `art/build_v2_arm.py`, `src/v2/limbs.js` |
| Transformation | Lumpy swelling ahead of a raw edge, convulsion, parts forcing out. A walking limb lifts into view while it changes. You never stop moving | `src/v2/armskin.js`, `src/v2/limbs.js` |
| Absorption | Machines are hauled up and stripped part by part. Living things are squeezed where they lie, crack, sag and leave a shell. Different healing and energy | `src/v2/absorbfx.js` |
| Androids | Three Blender machines: plates over frame over cables and a lit core, with 46 to 49 pieces each | `art/build_v2_androids.py`, `src/game/enemies/android.js` |
| Behaviour | See below | `src/game/enemies/android.js` |
| Evolution Lab | Five specimens that come back, inert machines to measure against, ledges and a dash lane, cover pillars, pads to wake a squad / try the eight-limb choice / start a new body, and a live comparison panel | `src/v2/gym.js` |
| See yourself | Hold V: the camera steps out, the mouse orbits it, the world slows | `src/v2/inspect.js` |
| Test chapter, death | Short generated deck; death restarts it. Discoveries persist; no permanent stats. In the lab you return with your build | `src/v2/lab.js` |

## The five mutations

| | **Chitin Husk** | **Shard Siphon** | **Arc Nerves** | **Tendon Hook** | **Acid Gland** |
|---|---|---|---|---|---|
| Nature | Organic | Biomechanical | Biomechanical | Biomechanical | Organic |
| Absorb to get it | Shellback | Trooper | Heavy | Scout | Bladderback |
| Purpose | Close and brutal | At a distance | Against many | Control and movement | Controlling ground |
| Strength | Armour wherever carried. Blows stagger. Dash becomes a charge | Hits at any range | Finds its own target, conducts through machines, stops them firing. Raised, you are quick | Yanks light machines to you. Pulls you to heavies and any surface, up and over ledges. Raised, you are agile | Pool damages, slows, and makes machines take 40% more from everything. Absorbing heals 30% more |
| Limit | No reach. Raised: slow, slides, jumps low | Uses energy. Spreads as held. Slows you firing. Half damage to a heavy's front | Weak on one target. Huge cost. You take more damage. Burns out downed machines | Barely hurts. One target. Brings them into your face. You cannot steer while pulled. You take 5% more damage | Slow arc. Little damage at once. The pool burns you too |

Measured, stage 3: Husk 6.05 m/s and cannot reach the 2.25 m ledge; Shard 7.2 m/s; Arc 7.63 m/s. Inert trooper: Husk 0.2 s within 4 m, Shard 0.3-0.37 s at any range, Arc 0.73 s. Inert heavy: Husk 0.9 s, Shard 1.5 s, Arc 3.17 s and all its energy. Arc on four machines: 32 damage each, all stopped. Hook: dragged a trooper 10.3 m, hauled the player 8.9 m to a heavy that did not move, carried the player onto the 2.25 m ledge. Acid: lands within 0.5 m at 4 to 16 m, flight 0.3 to 1.07 s; 19 on impact and 16 per second at stage 3; burns you 8 per second.

Stacking, measured: Shard stage 3 does 15 per shot; at 8 absorbs, 24. Still one limb.

## How machines fight

| | Health | Speed | Shot speed | Damage | Behaviour, measured |
|---|---|---|---|---|---|
| Trooper | 40 | 4.2 | 26 | 9 | Fires, then ducks into cover nearby (32% of its time, hidden from you 33%) and comes out elsewhere. If you hide it keeps firing at where you were (8 shots while hidden 81% of the time) |
| Scout | 22 | 6.4 | 34 | 5 | Never stops: 86% of its time moving, circled 201 degrees in 8 seconds, shoots on the run, dodges when your aim is on it (4 dodges in 8 seconds) |
| Heavy | 85 | 2.8 | 15 | 16 | Marches straight at you, firing as it comes (20.9 m to 2.2 m in 12 seconds). Its plating halves shard hits from the front only. Ignores small hits. Close up, it stomps: 0.6 s warning, up to 22 damage and knockback |

All: never more than two lining up shots at once (measured), go down before they can die, and get back up after 6.5 seconds if left alone. Lab specimens do not.

## Verified, realistic mode

- **Limb assignment and clipping:** changing arms leaves every mutation in place. 2808 samples on walking limbs: none inside anything solid.
- **The lab through real input:** pads, specimens absorbed through the real absorb and respawned, the eight-limb question via stand-ins, keeping, replacing, stacking at a full body with no question, new body, live squad, dying and returning, leaving for the chapter.
- **Choice routes:** Q, E, right click, number keys, mouse with click. Only the chosen limb changes. Benefits apply either way.
- **Downed machines:** troopers and heavies absorbable from 3.4 m on every side, 12 of 12. Scouts fall away from you, so 6 of 12 needed one more step.
- **Test chapter, a bot with real damage, 12 layouts:** 4 clears in 60 to 95 seconds, 8 deaths in 26 to 56 seconds. Harder than the previous round (10 clears in 17). The bot aims perfectly, but cannot dodge or use cover, and uses only Shard, Husk and Arc. It shows direction, not difficulty for a person.
- **Inherited game via `?legacy`:** three playthroughs won, journey script and road test complete. The audit's `board` step reports false, as it did before.
- **Cost, worst case:** all five mutations and six machines awake: 959 draw calls, 742k triangles, 0.24 ms for the body, 0.04 ms per machine per step. Measured on a software renderer, so the frame rate on real hardware is unknown.

## Experimental, not proven

- **How it feels.** No person has played this round. Every number is a measured first guess.
- **The eight-limb choice cannot happen in normal play.** With no multiples, five mutations can never fill eight limbs. It needs nine. In the lab, stand-ins hold the empty limbs so it can be tried.
- **Stacking has no cap.** In the lab specimens respawn, so numbers can get very large.
- **Draw calls** are still high with many machines (about 49 per android, down from about 70). They could be merged further until torn apart.
- **Acid** has no trajectory marker. **The lifting limb** can pass behind a raised arm. **From outside**, raised arms hold one pose.
- **Long-range grabs** stretch the arm; a kneeling heavy gives the least tidy coils.
- **Phone and Retro mode:** not tested. On a phone there is no way to hold V or press E on a pad yet.
- **Rooms** are still V1 art. **Rigging:** nothing uses a skeleton.
