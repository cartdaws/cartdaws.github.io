# How the ship is generated

One run builds one ship. It is generated once, when the run starts, and every room, door and prop stays exactly as it is for the rest of the run.
The generator is seeded (`generateRun(game, { seed })`; `game.nextSeed = n` before `newRun()` picks one), so any layout can be reproduced from its number.
Every layout is checked before the player sees it; one that fails is thrown away and the next seed is tried.

## The route

`walkGrid` lays the rooms on a 30 m grid: south, east or west, never back onto a used cell. It turns often, so the route doubles back on itself.
The route is a chain: room 1, 2, 3 ... then the finale and the hangar lift. The encounter system walks that chain in order, so the chain is always the critical path.
Things that are **not** on the chain never change who you fight or in what order:

* **Side rooms** are small dead ends on a room's spare wall (1 to 4 a run). They hold health. Off a quiet room they are open; off a fight they stay shut until the fight is won.
* **Loops.** When a side room's cell also touches a room that is not next to its parent in the route, a second door joins them. It is locked and dead until both rooms are behind you, then it comes alive ("SERVICE POWER RESTORED"). A loop is a shortcut for going back, never a way to skip ahead. There are also direct shortcuts between two chain rooms that sit side by side.

## A room

`layouts.js` decides what a room is made of. A room's purpose picks which structures it may have; the structure picks its size and ceiling height.

| structure | what it is | used by |
|---|---|---|
| open | a plain hall | any |
| ring | a solid core with a way round it on every side: a loop to run, a flank | assembly, foundry, engineering, containment |
| corner | one, two or four corners filled in: L, U and cross-shaped rooms | assembly, cargo, foundry, engineering |
| chicane | staggered walls: a zig-zag through tight passages | range, foundry, engineering |
| gallery | a raised deck (1.08 m) along a wall with its own stairs: height to hold, and a way to drop in | assembly, cargo, range |
| islands | free-standing cover walls | cargo, range |
| divided | one wall across the room with an opening | quiet rooms |
| annex | a walled sample cell in a corner with a doorway | labs, containment |
| aisles | parallel rows of racks or shelves with cross-aisles | data halls, stores |
| dais | a low raised platform in the middle | control rooms |

A candidate structure is accepted only if every door still reaches every other door through gaps of at least 2 m, nothing stands in a door's approach, and most of the floor is open and connected. Otherwise a fresh attempt is made, then simpler structures, ending at "open".

Purposes: robotics (assembly), cargo, fabrication (foundry), security range, engineering, and, for quiet rooms, laboratory, data core, stores, control, containment, crew quarters.

## What stands in a room

`furnish()` in `procgen.js`. Equipment goes **against walls**: the room's outer walls, and the faces of its own inner walls. Fixtures in rows follow the aisle plan.
Every prop is placed through a floor plan (`RoomGrid`) that knows what is already there. A prop is refused if putting it down would leave the doors unable to reach each other through a passage 2.3 m wide, and spawns and pickups only go where that space reaches. So no arrangement can wall a door in, squeeze a corridor or strand something.
Approaches to doors are reserved first. Doors sit anywhere along their wall (not just the middle); both ends of a hall agree where.

## The check

`validate.js`, run on every generated layout:

* **reach**: the lift can be walked to from the first door.
* **items**: every pickup, spawn, jar, chart and side-room reward can be walked to.
* **doors**: the approach to every door is clear.
* **narrow**: the way between a room's doors, and every spawn, are in space wider than a body (1.7 m).
* **overlap**: no two props stand in the same place.
* **nav**: the enemies' own navigation reaches every spawn.

`art/layouts.js` runs it over many seeds from the page and prints how varied the layouts were. `art/playthrough.js` plays a run through: enters every room, wins every fight, and checks the encounter advances, side doors open and loops come alive.
