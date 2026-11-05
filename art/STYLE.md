# INTRUDER art style guide

One look across the homeworld, space, the research vessel and the facility. Every model and material follows this.

## The two kinds of things

| | Alien (the survivor's kind) | Human (the invaders) |
|---|---|---|
| Shape | soft, rounded, flowing; no hard edges; tapering limbs | hard-edged, panelled, symmetrical, utilitarian |
| Surface | translucent gel, inner glow, veins | painted metal, matte plastic, scuffed, labelled |
| Light | glows from within (bioluminescent) | lit by strips, status lights, screens |
| Motion | breathing, pulsing, undulating | mechanical, servo-driven |

## Palette

| Role | Colour | Hex |
|---|---|---|
| Alien gel base | deep teal | `#0d6560` |
| Alien gel rim / glow | pale aqua | `#7fe8da`, `#c6fff6` |
| Elder accent | soft violet | `#b99cff`, `#e0d0ff` |
| Homeworld ground | teal-green | `#2c6a60` |
| Homeworld sky | indigo to teal horizon | `#07041e` to `#58cdb8` |
| Human hull | cool gunmetal | `#8d979c` (light), `#2b3238` (dark) |
| Human trim / safety | amber | `#d9a21b` |
| Human alert / hostile | warning red | `#c93a2a`, `#ff4a2a` |
| Human screens | cyan | `#6fe8ff` |
| Space | near-black navy | `#02040a` |
| Nebula | teal, violet, blue, faint magenta | `#2aa89a`, `#7850c8`, `#3c78d2`, `#be50aa` |
| Fire / ruin | ember orange | `#ff7a2a`, `#ffd9a0` |

Rules: no pure white or pure black. Emissive colours stay in the cyan, amber, red and violet families. Hostile things lean red and amber; the survivor's things lean teal and aqua.

## Lighting

- Space: one hard warm sun (`#fff0dd`), cool blue fill from the nebula. Ships read as lit from one side with deep shadow on the other.
- Homeworld: cool indigo ambient with teal ground bounce; fires add warm orange pools.
- Vessel interior: cold neutral light, red during alert.

## Proportions and scale (game metres)

- Survivor body about 1.6 m tall including tentacle stance; elder 1.28x.
- Human lander about 7 m long, 7.4 m span; research vessel about 1.1 km long; warship about 300 m.
- Interceptor about 5 m long.

## Build rules

- Blender sources live in `art/*.blend`, build scripts in `art/build_*.py`, game-ready exports in `public/models/*.glb` (glTF, Y-up).
- Every object has a clear name; materials are named by role (`Hull`, `HullDark`, `Trim`, `Glass`, `Emissive*`).
- Keep polycounts modest: hero ship under 30k triangles, props under 5k.
- Use Principled BSDF with plain values (the glTF exporter reads them); emissive via the Emission inputs.
