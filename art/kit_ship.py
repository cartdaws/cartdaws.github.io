# INTRUDER environment kit: ship features. Executed by build_kit.py (shares its Part API, materials and design language):
# matte painted structural metal, off-white equipment housings, dark service hardware, rubber hoses, orange and yellow safety marks.
# Every asset faces -Y, stands on z = 0, and carries the same corner radii and panel gaps as the rest of the kit.
#   cryo_pod       a containment pod: glass over a lit core, hoses to the ceiling, a control plinth. Laboratories.
#   pipe_bank      three pipe runs on wall brackets with a valve wheel, a gauge and a riser. Foundries, workshops, anywhere a ship has plumbing.
#   assembly_arm   the arm that builds the androids: turret, two stages on rams, a gripper. Robotics.
#   fuel_tank      a horizontal tank in two cradles, banded, with a filler and a gauge. Cargo and foundry.
#   cable_swag     overhead cable trays with slack loops. No collider; hangs from z = 0 downward.

# ------------------------------------------------------------------ CRYO POD
p = Part('cryo_pod')
p.rbox((0, 0, 0.14), (1.2, 1.2, 0.28), D, r=0.03, seg=2)
p.rbox((0, -0.04, 0.34), (1.0, 1.0, 0.12), E, r=0.025, seg=2)
p.rbox((0, -0.601, 0.14), (1.0, 0.012, 0.06), H, r=0.004, seg=1)                       # the hazard line along the plinth
# the control plinth face: a recessed panel, a small screen, three status lamps
p.rbox((0, -0.52, 0.28), (0.5, 0.04, 0.16), S, r=0.01, seg=1)
p.rbox((-0.08, -0.545, 0.285), (0.28, 0.012, 0.1), SC, r=0.006, seg=1)
for i, m in enumerate((ST, ST, O)):
    p.rbox((0.12 + i * 0.05, -0.545, 0.285), (0.026, 0.012, 0.026), m, r=0.004, seg=1)
# the vessel: a glass cylinder between two collars, the lit core standing inside it
p.cyl((0, 0, 0.42), 0.5, 0.1, D, seg=32, bev=0.012)
p.lathe((0, 0, 0.46), [(0.44, 0.0), (0.44, 1.7), (0.4, 1.78), (0.3, 1.8)], G, seg=32, closed=False)
p.cyl((0, 0, 0.62), 0.26, 0.08, D, seg=24, bev=0.01)
p.cyl((0, 0, 1.3), 0.075, 1.35, SC, seg=14)                                           # the core
for z in (0.9, 1.3, 1.7): p.cyl((0, 0, z), 0.12, 0.03, D, seg=20)
for a in (pi / 4, 3 * pi / 4, 5 * pi / 4, 7 * pi / 4):
    p.rbox((cos(a) * 0.47, sin(a) * 0.47, 1.3), (0.045, 0.045, 1.75), B, r=0.01, seg=1)       # four struts hold the glass
p.cyl((0, 0, 2.28), 0.5, 0.16, D, seg=32, bev=0.015)
p.cyl((0, 0, 2.4), 0.36, 0.12, E, seg=28, bev=0.012)
p.cyl((0, 0, 2.48), 0.1, 0.06, B, seg=14)
for sx in (-1, 1):
    p.tube([(sx * 0.2, 0.0, 2.45), (sx * 0.34, 0.1, 2.52), (sx * 0.3, 0.45, 2.48), (sx * 0.26, 0.58, 2.2), (sx * 0.26, 0.58, 1.3)], 0.035, R, seg=8)   # hoses go back to the wall
    p.cyl((sx * 0.2, 0.0, 2.45), 0.05, 0.05, B, seg=10)
finish(p, col=(1.2, 1.2, 2.55))

# ------------------------------------------------------------------ PIPE BANK (mounted on a wall behind it: y = +0.2)
p = Part('pipe_bank')
for x in (-1.0, 0.0, 1.0):
    p.rbox((x, 0.3, 1.3), (0.14, 0.06, 2.5), D, r=0.012, seg=1)                          # three uprights bolted to the wall
RUNS = [(0.6, 0.12, S), (1.3, 0.09, B), (2.0, 0.14, D)]
for z, r, m in RUNS:
    p.cyl((0, 0.12, z), r, 2.5, m, axis='x', seg=20, bev=0.006)
    for x in (-1.0, 0.0, 1.0):
        p.rbox((x, 0.19, z), (0.16, 0.12, r * 2 + 0.06), D, r=0.015, seg=1)               # the saddle on each upright
    for x in (-0.55, 0.65):
        p.cyl((x, 0.12, z), r + 0.03, 0.06, B, axis='x', seg=20)                           # flanges, with their bolt heads
        for k in range(8):
            a = k * pi / 4
            p.cyl((x, 0.12 + cos(a) * (r + 0.02), z + sin(a) * (r + 0.02)), 0.009, 0.05, D, axis='x', seg=6)
p.cyl((-1.1, 0.12, 1.2), 0.07, 2.3, B, seg=14)                                           # the riser
p.rbox((-1.1, 0.12, 2.42), (0.22, 0.22, 0.1), D, r=0.02, seg=1)
# the valve wheel on the middle run: a stem, a boss, a hand wheel in safety orange
p.cyl((0.1, 0.0, 1.3), 0.03, 0.2, B, axis='y', seg=10)
p.tube([(0.1 + 0.18 * cos(a), -0.12, 1.3 + 0.18 * sin(a)) for a in [k * pi / 8 for k in range(17)]], 0.016, O, seg=8)
for k in range(4):
    a = k * pi / 2
    p.tube([(0.1, -0.12, 1.3), (0.1 + 0.18 * cos(a), -0.12, 1.3 + 0.18 * sin(a))], 0.012, O, seg=6)
# the gauge on the top run
p.cyl((-0.4, -0.04, 2.0), 0.12, 0.06, B, axis='y', seg=22, bev=0.008)
p.cyl((-0.4, -0.075, 2.0), 0.095, 0.016, SC, axis='y', seg=22)
p.rbox((-0.4, -0.085, 2.025), (0.012, 0.01, 0.07), O, r=0.002, seg=1)
p.rbox((-0.4, 0.05, 1.86), (0.05, 0.1, 0.3), D, r=0.01, seg=1)
# hazard banding on the largest run
for x in (-0.9, -0.75, 0.9, 1.05):
    p.cyl((x, 0.12, 2.0), 0.147, 0.06, H, axis='x', seg=20)
finish(p, col=(2.6, 0.45, 2.7))

# ------------------------------------------------------------------ ASSEMBLY ARM
p = Part('assembly_arm')
p.cyl((0, 0, 0.1), 0.72, 0.2, D, seg=32, bev=0.02)
p.cyl((0, 0, 0.21), 0.62, 0.03, H, seg=32)
p.cyl((0, 0, 0.38), 0.42, 0.32, E, seg=28, bev=0.02)                                    # the turret
p.cyl((0, 0, 0.58), 0.46, 0.08, D, seg=28, bev=0.01)
p.rbox((0, 0.0, 0.8), (0.5, 0.5, 0.36), S, r=0.04, seg=2)
# lower arm, leaning forward on a ram
p.rbox((0, -0.25, 1.35), (0.26, 0.3, 1.2), E, r=0.04, seg=2, rot=Rx(-0.34))
p.cyl((0, -0.1, 0.95), 0.07, 0.1, B, axis='x', seg=14)
p.cyl((0, 0.12, 0.9), 0.06, 0.6, D, seg=12, rot=Rx(0.38))                              # the ram: housing
p.cyl((0, -0.02, 1.24), 0.032, 0.5, B, seg=10, rot=Rx(0.38))                            # the ram: rod
# elbow and the second stage reaching out and down
p.cyl((0, -0.52, 1.85), 0.15, 0.4, D, axis='x', seg=18, bev=0.015)
p.rbox((0, -0.95, 1.85), (0.2, 1.0, 0.22), E, r=0.035, seg=2, rot=Rx(0.1))
p.rbox((0, -0.95, 1.99), (0.12, 0.8, 0.06), S, r=0.015, seg=1, rot=Rx(0.1))
p.cyl((0, -1.42, 1.74), 0.11, 0.3, B, axis='x', seg=14)
# wrist and a two-fingered gripper, open
p.cyl((0, -1.44, 1.52), 0.07, 0.3, D, seg=12)
p.rbox((0, -1.44, 1.34), (0.26, 0.1, 0.07), B, r=0.015, seg=1)
for sx in (-1, 1):
    p.rbox((sx * 0.11, -1.44, 1.2), (0.05, 0.08, 0.26), D, r=0.012, seg=1, rot=Ry(sx * 0.18))
    p.rbox((sx * 0.07, -1.44, 1.05), (0.04, 0.07, 0.1), R, r=0.01, seg=1)
# cables from the turret over both joints, and the status lamp
p.tube([(0.14, 0.18, 0.82), (0.2, 0.0, 1.7), (0.18, -0.55, 2.05), (0.12, -1.2, 1.95), (0.07, -1.44, 1.6)], 0.022, R, seg=8)
p.rbox((0.2, -0.28, 0.5), (0.05, 0.03, 0.06), ST, r=0.006, seg=1)
p.rbox((-0.2, -0.28, 0.5), (0.05, 0.03, 0.06), O, r=0.006, seg=1)
finish(p, col=(1.5, 1.5, 2.55))

# ------------------------------------------------------------------ FUEL TANK
p = Part('fuel_tank')
for x in (-0.85, 0.85):
    p.rbox((x, 0, 0.3), (0.28, 1.3, 0.6), D, r=0.03, seg=2)
    p.rbox((x, 0, 0.62), (0.3, 1.1, 0.06), S, r=0.015, seg=1)
p.cyl((0, 0, 0.98), 0.6, 2.2, E, axis='x', seg=32, bev=0.02)
for sx in (-1, 1):
    p.sphere((sx * 1.1, 0, 0.98), 0.6, E, scale=(0.32, 1.0, 1.0), seg=24)                # the domed ends
for x in (-0.85, 0.85):
    p.cyl((x, 0, 0.98), 0.625, 0.14, S, axis='x', seg=32)                                 # straps over the cradles
for x in (-0.5, -0.38, 0.38, 0.5):
    p.cyl((x, 0, 0.98), 0.612, 0.05, H, axis='x', seg=32)                                 # hazard banding
p.cyl((0.0, 0.0, 1.62), 0.17, 0.12, D, seg=20, bev=0.01)                                  # the filler and its cap
p.cyl((0.0, 0.0, 1.7), 0.12, 0.05, B, seg=16)
p.rbox((0.0, 0.0, 1.74), (0.2, 0.04, 0.03), D, r=0.006, seg=1)
p.rbox((-0.5, -0.6, 1.1), (0.4, 0.02, 0.2), O, r=0.006, seg=1)                            # the marking plate
p.cyl((0.55, -0.55, 1.35), 0.07, 0.04, B, axis='y', seg=16)
p.cyl((0.55, -0.575, 1.35), 0.055, 0.012, SC, axis='y', seg=16)                           # the gauge
p.tube([(1.0, 0.1, 0.5), (1.4, 0.3, 0.4), (1.5, 0.5, 0.15)], 0.045, R, seg=8)             # drain hose
p.cyl((1.0, 0.1, 0.5), 0.07, 0.1, B, axis='x', seg=12)
finish(p, col=(2.8, 1.3, 1.75))

# ------------------------------------------------------------------ CABLE SWAG: overhead. z = 0 is the ceiling; everything hangs down.
p = Part('cable_swag')
p.rbox((0, 0, -0.05), (3.4, 0.4, 0.1), D, r=0.02, seg=2)                                 # the tray
for x in (-1.5, -0.5, 0.5, 1.5):
    p.rbox((x, 0, -0.14), (0.06, 0.46, 0.1), S, r=0.01, seg=1)
for k, (y, sag) in enumerate(((-0.12, 0.5), (0.0, 0.7), (0.12, 0.42))):
    p.tube([(-1.6, y, -0.12), (-1.0, y, -0.12 - sag), (-0.2, y, -0.12 - sag * 0.6), (0.6, y, -0.12 - sag * 1.1), (1.6, y, -0.12)], 0.028, R if k != 1 else D, seg=8)
p.rbox((0.0, 0, -0.3), (0.34, 0.3, 0.24), E, r=0.03, seg=2)                              # a junction box
p.rbox((0.0, -0.152, -0.3), (0.2, 0.012, 0.1), S, r=0.006, seg=1)
p.rbox((0.07, -0.158, -0.3), (0.026, 0.01, 0.026), ST, r=0.004, seg=1)
finish(p)
