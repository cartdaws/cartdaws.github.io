"""INTRUDER environment kit v2 - modelled, not boxed.
Run: blender -b --python art/build_kit.py -- <out.glb> <out.blend>
Design language: matte painted structural metal, off-white equipment housings with recessed panels, dark service hardware,
rubber seals and hoses, orange/yellow safety marks. Same corner radii and panel gaps everywhere.
Assets face -Y (exported +Z). Hierarchies (scanner, cell door) keep their pivots at the joints so the cutscene can drive them.
"""
import bpy, sys, os, math
from math import pi, sin, cos
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modeling import *
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)

S, E, D, B, R, H, O, SC, ST, G = 'PaintStructural', 'PaintEquipment', 'PaintDark', 'MetalBare', 'Rubber', 'Hazard', 'SafetyOrange', 'Screen', 'Status', 'Glass'
Rz = lambda a: Matrix.Rotation(a, 4, 'Z')
Rx = lambda a: Matrix.Rotation(a, 4, 'X')
Ry = lambda a: Matrix.Rotation(a, 4, 'Y')
FRONT = (0, -1, 0)


# ------------------------------------------------------------------ shared hardware
def bar_handle(p, x, y, z, length, mat=B, axis='z', standoff=0.04, r=0.014):
    """Pull handle: two standoffs and a round bar, mounted on a -Y facing surface at (x, y, z)."""
    if axis == 'z':
        a, b = (x, y - standoff, z - length / 2 + 0.03), (x, y - standoff, z + length / 2 - 0.03)
    else:
        a, b = (x - length / 2 + 0.03, y - standoff, z), (x + length / 2 - 0.03, y - standoff, z)
    p.tube([a, b], r, mat, seg=8)
    for q in (a, b):
        p.cyl((q[0], y - standoff / 2, q[2]), r * 0.9, standoff, D, axis='y', seg=8)


def quarter_turn(p, x, y, z, mat=B):
    p.cyl((x, y - 0.01, z), 0.028, 0.02, D, axis='y', seg=14)
    p.rbox((x, y - 0.026, z), (0.07, 0.012, 0.018), mat, r=0.004, seg=1, rot=Ry(0.5))


def louvres(p, x, y, z, w, h, n, mat=D):
    """A louvred vent: recessed dark backing and n angled slats."""
    p.rbox((x, y + 0.01, z), (w, 0.03, h), D, r=0.006, seg=1)
    step = h / n
    for i in range(n):
        p.rbox((x, y - 0.012, z - h / 2 + step * (i + 0.5)), (w - 0.04, 0.02, step * 0.42), mat, r=0.004, seg=1, rot=Rx(-0.55))


def bolts(p, pts, y, r=0.012, mat=D):
    for (x, z) in pts:
        p.cyl((x, y, z), r, 0.008, mat, axis='y', seg=10)


def gasket(p, pts, r=0.012):
    p.tube(pts, r, R, seg=8)


def status_lamps(p, x, y, z, n=3, gap=0.045, s=0.022):
    p.rbox((x, y + 0.004, z), (gap * n + 0.03, 0.014, s + 0.03), D, r=0.006, seg=1)
    for i in range(n):
        p.rbox((x - gap * (n - 1) / 2 + gap * i, y - 0.006, z), (s, 0.012, s), ST if i != 1 else O, r=0.004, seg=1)


def finish(p, name=None, col=None):
    ob = p.build()
    if col:
        collider(name or p.name, *col)
    return ob


# ------------------------------------------------------------------ structure
# DOOR FRAME: C-channel jambs with a guide slot, lintel with drive housing, threshold with seal. Opening 3.0 x 3.0, 0.7 deep.
p = Part('door_frame')
for sx in (-1, 1):
    prof = [(1.5, -0.35), (1.76, -0.35), (1.76, 0.35), (1.5, 0.35), (1.5, 0.17), (1.57, 0.17), (1.57, -0.17), (1.5, -0.17)]
    prof = [(sx * a, b) for (a, b) in prof]
    if sx < 0:
        prof = prof[::-1]
    p.extrude(prof, 3.0, S, plane='xy', c=(0, 0, 1.5), r=0.012)
    p.rbox((sx * 1.63, -0.37, 1.2), (0.17, 0.05, 1.7), D, r=0.012, seg=1)
    p.rbox((sx * 1.63, 0.37, 1.2), (0.17, 0.05, 1.7), D, r=0.012, seg=1)
    bolts(p, [(sx * 1.63, 0.5), (sx * 1.63, 1.9)], -0.4)
    p.tube([(sx * 1.505, -0.3, 0.1), (sx * 1.505, -0.3, 2.95)], 0.012, R, seg=8)
    p.tube([(sx * 1.505, 0.3, 0.1), (sx * 1.505, 0.3, 2.95)], 0.012, R, seg=8)
p.rbox((0, 0, 3.22), (3.54, 0.74, 0.44), S, r=0.03, panel=(FRONT, 0.06, -0.012))
p.rbox((0, 0, 3.58), (3.2, 0.5, 0.3), E, r=0.025)
p.cyl((1.4, -0.28, 3.58), 0.11, 0.1, D, axis='y', seg=18, bev=0.012)
p.cyl((-1.4, -0.28, 3.58), 0.07, 0.08, B, axis='y', seg=14)
for i in range(7):
    p.rbox((-0.9 + i * 0.3, -0.38, 3.22), (0.22, 0.014, 0.1), H if i % 2 == 0 else D, r=0.004, seg=1)
p.rbox((0, 0, 0.025), (3.0, 0.7, 0.05), D, r=0.01, seg=1)
p.tube([(-1.45, -0.12, 0.06), (1.45, -0.12, 0.06)], 0.014, R, seg=8)
p.tube([(-1.45, 0.12, 0.06), (1.45, 0.12, 0.06)], 0.014, R, seg=8)
finish(p)

# DOOR LEAF: layered slab with a central rubber meeting seal, rack teeth on the top edge and guide shoes. Origin at the slab centre.
p = Part('door_leaf')
p.rbox((0, 0, 0), (2.98, 0.18, 2.98), D, r=0.015, seg=1)
for sx in (-1, 1):
    for sy in (-1, 1):
        p.rbox((sx * 0.745, sy * 0.115, 0.0), (1.46, 0.05, 2.9), E, r=0.02, panel=((0, sy, 0), 0.07, -0.012), panel_mat=S)
        p.rbox((sx * 0.745, sy * 0.145, -1.36), (1.46, 0.012, 0.22), H, r=0.003, seg=1)
        bolts(p, [(sx * 0.2, 1.3), (sx * 1.28, 1.3), (sx * 0.2, -1.0), (sx * 1.28, -1.0)], sy * 0.143, mat=B)
for sy in (-1, 1):
    p.tube([(0, sy * 0.145, -1.45), (0, sy * 0.145, 1.45)], 0.02, R, seg=10)
    p.rbox((0.32, sy * 0.15, 0.1), (0.05, 0.028, 0.5), B, r=0.008, seg=1)
    p.rbox((0.32, sy * 0.16, 0.1), (0.035, 0.018, 0.12), O, r=0.004, seg=1)
for i in range(16):
    p.rbox((-1.4 + i * 0.187, 0, 1.51), (0.1, 0.08, 0.05), B, r=0.008, seg=1)
for sx in (-1, 1):
    for z in (-1.15, 1.15):
        p.rbox((sx * 1.505, 0, z), (0.06, 0.2, 0.32), D, r=0.012, seg=1)
finish(p)

# OBSERVATION WINDOW: heavy frame, glass retaining bead with rubber gasket, bolted mullions, sill shelf. Opening 7.0 x 2.7, sill at z=0.9.
p = Part('window_frame')
p.rbox((0, 0, 0.82), (7.62, 0.8, 0.16), S, r=0.04, seg=3)
p.rbox((0, -0.3, 0.92), (7.2, 0.28, 0.06), E, r=0.015, seg=1)
p.rbox((0, 0, 3.68), (7.62, 0.8, 0.16), S, r=0.04, seg=3)
for sx in (-3.52, 3.52):
    p.rbox((sx, 0, 2.25), (0.26, 0.8, 2.7), S, r=0.035, seg=2, panel=(FRONT, 0.04, -0.01))
for sx in (-1.17, 1.17):
    p.rbox((sx, 0, 2.25), (0.14, 0.34, 2.7), D, r=0.02, seg=2)
    for z in (1.1, 1.8, 2.5, 3.2):
        p.cyl((sx, -0.18, z), 0.022, 0.015, B, axis='y', seg=10)
p.rbox((0, -0.16, 0.99), (6.8, 0.06, 0.07), D, r=0.01, seg=1)
p.rbox((0, -0.16, 3.54), (6.8, 0.06, 0.07), D, r=0.01, seg=1)
p.tube([(-3.4, -0.1, 1.0), (3.4, -0.1, 1.0)], 0.016, R, seg=8)
p.tube([(-3.4, -0.1, 3.56), (3.4, -0.1, 3.56)], 0.016, R, seg=8)
for sx in (-3.36, 3.36):
    p.tube([(sx, -0.1, 0.98), (sx, -0.1, 3.56)], 0.016, R, seg=8)
p.rbox((0, -0.41, 0.76), (7.6, 0.04, 0.1), H, r=0.004, seg=1)
p.tube([(-3.5, -0.3, 3.9), (3.5, -0.3, 3.9)], 0.04, D, seg=10)
for sx in (-2.4, 0.0, 2.4):
    p.rbox((sx, -0.3, 3.85), (0.12, 0.1, 0.14), S, r=0.01, seg=1)
finish(p)

# WALL PILASTER: tapered, with base plate, capital, conduit and bolted joint plates. Back at +Y.
for nm, hgt in (('wall_rib_45', 4.5), ('wall_rib_65', 6.5)):
    p = Part(nm)
    prof = [(-0.25, 0.14), (0.25, 0.14), (0.17, -0.12), (-0.17, -0.12)]
    p.extrude(prof, hgt - 0.5, S, plane='xy', c=(0, 0, hgt / 2), r=0.012)
    p.rbox((0, 0, 0.17), (0.64, 0.34, 0.34), D, r=0.025, seg=2)
    p.rbox((0, 0, hgt - 0.13), (0.64, 0.34, 0.26), D, r=0.025, seg=2)
    p.tube([(0.1, -0.15, 0.4), (0.1, -0.15, hgt - 0.3)], 0.022, D, seg=10)
    for z in (hgt * 0.35, hgt * 0.7):
        p.rbox((0, -0.125, z), (0.3, 0.02, 0.5), E, r=0.008, seg=1)
        bolts(p, [(-0.1, z - 0.2), (0.1, z - 0.2), (-0.1, z + 0.2), (0.1, z + 0.2)], -0.14, r=0.01, mat=B)
    finish(p)

# STRUCTURAL PILLAR 0.9 x 0.9 x 6.5
p = Part('pillar')
oct_ = [(-0.4, -0.3), (-0.3, -0.4), (0.3, -0.4), (0.4, -0.3), (0.4, 0.3), (0.3, 0.4), (-0.3, 0.4), (-0.4, 0.3)]
p.extrude(oct_, 5.9, S, plane='xy', c=(0, 0, 3.25), r=0.02)
p.rbox((0, 0, 0.3), (0.98, 0.98, 0.6), D, r=0.04, seg=2)
p.rbox((0, 0, 0.62), (0.9, 0.9, 0.1), H, r=0.008, seg=1)
p.rbox((0, 0, 6.3), (0.98, 0.98, 0.4), D, r=0.04, seg=2)
for sx, sy in ((0.46, 0), (-0.46, 0), (0, 0.46), (0, -0.46)):
    p.rbox((sx, sy, 3.2), (0.05 if sx else 0.5, 0.5 if sx else 0.05, 0.7), E, r=0.008, seg=1)
p.tube([(0.43, -0.28, 0.7), (0.43, -0.28, 6.1)], 0.026, D, seg=10)
for z in (1.8, 3.6, 5.4):
    p.rbox((0.43, -0.28, z), (0.07, 0.08, 0.14), S, r=0.01, seg=1)
finish(p, col=(0.9, 0.9, 6.5))

# ------------------------------------------------------------------ SPECIMEN CONTAINMENT CELL
R_ = 1.2                                   # hexagon circumradius, apothem 1.04
APO = R_ * cos(pi / 6)
p = Part('cell_frame')
p.lathe((0, 0, 0), [(1.52, 0.0), (1.52, 0.14), (1.46, 0.2), (1.36, 0.24), (1.3, 0.3), (1.28, 0.36), (1.12, 0.36), (1.12, 0.3), (0.0, 0.3)], D, seg=48)
p.tube([(R_ * 1.02 * cos(a * pi / 8), R_ * 1.02 * sin(a * pi / 8), 0.38) for a in range(17)], 0.02, R, seg=8, caps=False)
for k in range(8):
    p.rbox((0, 0, 0.31), (2.0, 0.05, 0.03), B, r=0.006, seg=1, rot=Rz(k * pi / 8))
for k in range(6):
    th = -pi / 2 + pi / 6 + k * pi / 3
    rot = Rz(th - pi / 2)
    c = (cos(th) * R_, sin(th) * R_, 1.95)
    p.rbox(c, (0.2, 0.24, 3.3), E, r=0.03, seg=2, rot=rot, panel=((0, 1, 0), 0.04, -0.012), panel_mat=D)
    p.rbox((cos(th) * (R_ - 0.1), sin(th) * (R_ - 0.1), 1.95), (0.1, 0.06, 3.1), D, r=0.01, seg=1, rot=rot)
    for z in (0.9, 2.1, 3.0):
        p.rbox((cos(th) * (R_ + 0.13), sin(th) * (R_ + 0.13), z), (0.13, 0.05, 0.1), D, r=0.01, seg=1, rot=rot)
    p.cyl((cos(th) * R_, sin(th) * R_, 3.28), 0.07, 0.1, D, seg=14, bev=0.01)
p.lathe((0, 0, 0), [(1.46, 3.3), (1.46, 3.5), (1.34, 3.68), (1.0, 3.74), (1.0, 3.62), (1.22, 3.56), (1.3, 3.4), (1.3, 3.3)], E, seg=48, closed=False)
p.lathe((0, 0, 0), [(1.2, 3.74), (1.2, 3.82), (1.0, 3.82), (1.0, 3.74)], D, seg=48, closed=False)
for k in range(6):
    th = k * pi / 3
    c = (cos(th) * 1.18, sin(th) * 1.18, 3.32)
    p.cyl(c, 0.09, 0.05, D, seg=14)
    p.cyl((c[0], c[1], 3.29), 0.06, 0.02, ST, seg=14)
p.rbox((0, 1.62, 2.4), (0.62, 0.46, 4.2), S, r=0.035, seg=2, panel=(FRONT, 0.06, -0.012), panel_mat=D)
p.rbox((0, 1.62, 4.38), (0.9, 0.7, 0.28), D, r=0.03, seg=2)
p.rbox((0, 1.36, 1.5), (0.5, 0.05, 0.7), E, r=0.012, seg=1)
p.cyl((-0.22, 1.335, 1.5), 0.02, 0.05, B, axis='y', seg=10)
status_lamps(p, 0.0, 1.335, 1.95)
for sx in (-0.18, 0.0, 0.18):
    p.tube([(sx, 1.4, 4.0), (sx, 1.4, 4.4)], 0.032, D, seg=10)
for i, sx in enumerate((-0.2, 0.0, 0.2)):
    p.tube([(sx, 1.4, 0.55), (sx, 1.3, 0.2), (sx + 0.4, 1.0, 0.08), (0.9 + i * 0.1, 1.9, 0.07), (2.5, 2.1 + i * 0.12, 0.07)], 0.032, R, seg=8)
p.rbox((0, 1.45, 1.0), (0.64, 0.12, 0.2), D, r=0.015, seg=1)
for sx in (-0.2, 0.0, 0.2):
    p.cyl((sx, 1.4, 0.52), 0.04, 0.08, B, axis='y', seg=10)
p.rbox((0, 1.35, 3.5), (0.3, 0.7, 0.18), S, r=0.02, seg=1, rot=Rx(0.35))
for sx in (-1, 1):                                                                  # articulated restraint arms with open clamp rings
    p.cyl((sx * 0.98, 0.5, 0.45), 0.09, 0.3, D, seg=14, bev=0.01)
    p.cyl((sx * 0.98, 0.5, 0.62), 0.12, 0.06, B, seg=14)
    p.rbox((sx * 0.98, 0.5, 0.9), (0.13, 0.13, 0.55), E, r=0.025, seg=2)
    p.cyl((sx * 0.98, 0.5, 1.22), 0.08, 0.16, D, axis='x', seg=14, bev=0.008)
    p.rbox((sx * 0.8, 0.12, 1.2), (0.52, 0.11, 0.11), E, r=0.025, seg=2, rot=Rz(-sx * 0.56))
    p.cyl((sx * 0.62, -0.12, 1.2), 0.07, 0.14, D, axis='x', seg=14, bev=0.008)
    p.tube([(sx * 0.62, -0.12, 1.2), (sx * 0.58, -0.28, 1.14)], 0.045, E, seg=10)
    ring_pts = [(sx * 0.58 + 0.13 * cos(a), -0.3, 1.14 + 0.13 * sin(a)) for a in [pi * 0.15 + i * pi * 1.7 / 10 for i in range(11)]]
    p.tube(ring_pts, 0.032, D, seg=10)
    p.tube(ring_pts, 0.02, R, seg=8)
finish(p, name='cell', col=(2.9, 2.9, 4.5))

p = Part('cell_glass')
for k in range(1, 6):
    th = -pi / 2 + k * pi / 3
    c = (cos(th) * APO, sin(th) * APO, 1.95)
    p.rbox(c, (R_ - 0.16, 0.025, 3.04), G, r=0.004, seg=1, rot=Rz(th + pi / 2))
finish(p)

# HINGED DOOR: origin on the hinge axis at x=+0.6, panel extends towards -X. Latch edge carries the failing seal.
p = Part('cell_front')
W = 1.04
p.rbox((-W / 2 - 0.06, 0, 1.95), (W + 0.12, 0.05, 3.04), G, r=0.004, seg=1)
for (cx, cz, w, h) in ((-W / 2 - 0.06, 0.46, W + 0.2, 0.12), (-W / 2 - 0.06, 3.44, W + 0.2, 0.12)):
    p.rbox((cx, 0, cz), (w, 0.1, h), E, r=0.02, seg=2)
p.rbox((0.0, 0, 1.95), (0.12, 0.12, 3.1), E, r=0.025, seg=2)
p.rbox((-W - 0.14, 0, 1.95), (0.12, 0.12, 3.1), E, r=0.025, seg=2)
for z in (0.7, 1.95, 3.2):
    p.cyl((0.0, -0.01, z), 0.045, 0.2, D, seg=14)
p.rbox((-W - 0.14, -0.08, 1.9), (0.1, 0.07, 0.4), D, r=0.015, seg=2)
p.rbox((-W - 0.14, -0.125, 1.9), (0.04, 0.02, 0.1), O, r=0.004, seg=1)
p.tube([(-W - 0.05, -0.04, 0.6), (-W - 0.05, -0.04, 3.3)], 0.016, R, seg=8)
p.tube([(0.0, -0.04, 0.55), (-W - 0.1, -0.04, 0.55)], 0.016, R, seg=8)
p.tube([(0.0, -0.04, 3.35), (-W - 0.1, -0.04, 3.35)], 0.016, R, seg=8)
finish(p)

# SCANNER (hierarchy): rail -> carriage -> link -> head. Origins are the joints.
rail = Part('scanner_rail')
rail.rbox((0, 0, 0), (0.36, 4.4, 0.2), D, r=0.025, seg=2)
rail.rbox((0, 0, 0.13), (0.14, 4.4, 0.06), B, r=0.008, seg=1)
rail.rbox((0, 0, -0.11), (0.1, 4.3, 0.02), B, r=0.004, seg=1)
for y in (-2.1, -0.7, 0.7, 2.1):
    rail.rbox((0, y, 0.16), (0.3, 0.14, 0.2), S, r=0.02, seg=1)
rail_ob = rail.build()
car = Part('scanner_carriage')
car.rbox((0, 0, -0.18), (0.52, 0.72, 0.26), E, r=0.04, seg=2, panel=(FRONT, 0.05, -0.01), panel_mat=D)
car.cyl((0, 0, -0.38), 0.13, 0.16, D, seg=14, bev=0.01)
car.tube([(0.2, 0.2, -0.1), (0.3, 0.4, 0.1), (0.2, 0.9, 0.12)], 0.025, R, seg=8)
car_ob = car.build(parent=rail_ob)
link = Part('scanner_link')
link.cyl((0, 0, 0), 0.1, 0.24, D, axis='x', seg=16, bev=0.01)
link.rbox((0, 0, -0.55), (0.17, 0.22, 1.0), E, r=0.04, seg=2)
link.rbox((0, -0.115, -0.55), (0.06, 0.01, 0.6), D, r=0.004, seg=1)
link.tube([(0.1, 0.08, -0.05), (0.14, 0.14, -0.6), (0.1, 0.1, -1.0)], 0.022, R, seg=8)
link_ob = link.build(parent=car_ob, loc=(0, 0, -0.4))
head = Part('scanner_head')
head.cyl((0, 0, 0), 0.085, 0.2, D, axis='x', seg=14, bev=0.01)
head.rbox((0, 0, -0.2), (0.14, 0.14, 0.3), E, r=0.03, seg=2)
head.lathe((0, 0, -0.5), [(0.5, -0.06), (0.5, 0.06), (0.44, 0.09), (0.38, 0.09), (0.38, 0.0), (0.38, -0.09), (0.44, -0.09)], E, seg=40, closed=False)
head.lathe((0, 0, -0.5), [(0.44, 0.09), (0.38, 0.09)], ST, seg=40, closed=False)
for k in range(4):
    a = k * pi / 2 + pi / 4
    head.rbox((cos(a) * 0.5, sin(a) * 0.5, -0.5), (0.09, 0.09, 0.2), D, r=0.02, seg=1, rot=Rz(a))
    head.cyl((cos(a) * 0.56, sin(a) * 0.56, -0.5), 0.025, 0.04, ST, axis='x', seg=8, rot=Rz(a))
head.tube([(0, 0.1, -0.3), (0.2, 0.3, -0.4), (0.45, 0.35, -0.5)], 0.016, R, seg=8)
head_ob = head.build(parent=link_ob, loc=(0, 0.0, -1.1))
# telescoping examination probe: origin at the ring centre, hangs along -Z, scaled along its length to extend
probe = Part('scanner_probe')
for i, (r0, ln) in enumerate(((0.07, 0.32), (0.055, 0.32), (0.04, 0.32))):
    z0 = -i * 0.28
    probe.cyl((0, 0, z0 - ln / 2), r0, ln, D if i % 2 == 0 else B, seg=14, bev=0.006)
    probe.cyl((0, 0, z0 - 0.02), r0 + 0.012, 0.04, E, seg=14)
probe.sphere((0, 0, -0.98), 0.07, E, seg=16)
probe.sphere((0, 0, -1.04), 0.04, ST, seg=12)
for k in range(3):
    a = k * 2 * pi / 3
    probe.tube([(cos(a) * 0.05, sin(a) * 0.05, -0.9), (cos(a) * 0.1, sin(a) * 0.1, -1.0), (cos(a) * 0.075, sin(a) * 0.075, -1.12)], 0.01, B, seg=6)
probe_ob = probe.build(parent=head_ob, loc=(0, 0, -0.5))

# EXAMINATION TABLE
p = Part('restraint_bed')
p.lathe((0, 0, 0), [(0.46, 0.0), (0.46, 0.06), (0.3, 0.1), (0.14, 0.14), (0.14, 0.55), (0.18, 0.6)], D, seg=20, closed=False)
p.extrude([(-1.1, 0.6), (-1.1, 0.74), (-0.95, 0.8), (0.75, 0.8), (1.0, 0.86), (1.1, 0.84), (1.1, 0.64), (0.0, 0.58)], 0.8, E, plane='xz', r=0.025)
p.rbox((0, 0, 0.86), (2.0, 0.7, 0.05), R, r=0.02, seg=2)
p.rbox((-0.95, 0, 0.9), (0.3, 0.5, 0.1), R, r=0.04, seg=2)
for sy in (-1, 1):
    p.tube([(-1.0, sy * 0.44, 0.8), (1.0, sy * 0.44, 0.8)], 0.02, B, seg=8)
    for x in (-0.5, 0.5):
        p.tube([(x - 0.05, sy * 0.44, 0.82), (x, sy * 0.3, 0.92), (x + 0.05, sy * 0.44, 0.86)], 0.015, R, seg=6)
p.rbox((1.0, 0.0, 0.5), (0.3, 0.34, 0.24), D, r=0.02, seg=2)
p.tube([(1.0, 0.1, 0.45), (1.3, 0.4, 0.2), (1.6, 0.5, 0.06)], 0.025, R, seg=8)
finish(p, col=(2.8, 0.98, 0.97))

# ------------------------------------------------------------------ RESEARCH / MONITORING
p = Part('monitor_station')
p.rbox((0, 0, 0.75), (2.4, 0.9, 0.06), E, r=0.025, seg=2)
p.rbox((0, -0.4, 0.78), (2.4, 0.1, 0.02), R, r=0.01, seg=1)
for sx in (-1, 1):
    p.rbox((sx * 1.15, 0, 0.36), (0.08, 0.84, 0.72), S, r=0.02, seg=2)
p.rbox((0, 0.38, 0.4), (2.2, 0.06, 0.66), S, r=0.015, seg=1)
p.rbox((0.8, -0.02, 0.4), (0.52, 0.72, 0.64), E, r=0.025, seg=2)
louvres(p, 0.8, -0.38, 0.5, 0.4, 0.28, 5)
status_lamps(p, 0.8, -0.395, 0.2)
for i in range(3):
    p.rbox((-0.78, -0.395, 0.18 + i * 0.2), (0.5, 0.025, 0.18), S, r=0.01, seg=1)
    bar_handle(p, -0.78, -0.405, 0.18 + i * 0.2, 0.2, axis='x', standoff=0.02, r=0.01)
p.rbox((0, 0.42, 1.0), (2.3, 0.04, 0.05), D, r=0.01, seg=1)
p.cyl((0, 0.3, 0.84), 0.07, 0.05, D, seg=16, bev=0.008)
p.cyl((0, 0.3, 1.0), 0.028, 0.34, B, seg=10)
p.rbox((0, 0.3, 1.18), (1.9, 0.05, 0.06), D, r=0.015, seg=1)
for x, yaw in ((-0.78, 0.30), (0.0, 0.0), (0.78, -0.30)):
    Rs = Rz(yaw) @ Rx(0.12)
    p.rbox((x, 0.27, 1.18), (0.74, 0.05, 0.47), D, r=0.025, seg=2, rot=Rs)
    p.rbox((x, 0.285, 1.18), (0.08, 0.06, 0.1), S, r=0.01, seg=1, rot=Rs)
    p.rbox((x, 0.27 - 0.032, 1.18), (0.64, 0.012, 0.37), SC, r=0.004, seg=1, rot=Rs)
p.rbox((0.0, -0.17, 0.795), (0.56, 0.2, 0.02), D, r=0.01, seg=1)
for r_ in range(3):
    p.rbox((0.0, -0.215 + r_ * 0.05, 0.808), (0.5, 0.036, 0.008), S, r=0.003, seg=1)
p.sphere((0.55, -0.15, 0.81), 0.035, D, seg=12)
p.rbox((0.55, -0.15, 0.785), (0.12, 0.12, 0.012), D, r=0.006, seg=1)
p.tube([(0.2, -0.05, 0.79), (0.55, 0.2, 0.72), (0.8, 0.0, 0.5)], 0.012, R, seg=6)
finish(p, name='monitor_station', col=(2.4, 0.9, 1.45))

p = Part('display_hanging')
for sx in (-1.45, 1.45):
    p.rbox((sx, 0.0, 4.12), (0.07, 0.07, 0.78), D, r=0.012, seg=1)
p.rbox((0, 0, 4.46), (3.5, 0.5, 0.1), D, r=0.02, seg=1)
p.rbox((0, 0, 3.4), (3.54, 0.18, 2.04), D, r=0.04, seg=3, panel=(FRONT, 0.1, -0.02), panel_mat=S)
p.rbox((0, -0.09, 2.34), (3.54, 0.1, 0.1), H, r=0.004, seg=1)
p.rbox((1.5, 0.15, 3.4), (0.16, 0.14, 1.9), D, r=0.02, seg=1)
for z in (3.0, 3.8):
    p.rbox((1.5, 0.15, z), (0.24, 0.22, 0.12), E, r=0.015, seg=1)
p.tube([(1.5, 0.2, 4.4), (1.5, 0.3, 4.48)], 0.04, D, seg=10)
finish(p)
quad_screen('SCREEN_display_hanging', 3.2, 1.78, (0, -0.1, 3.4))

p = Part('server_rack')
p.rbox((0, 0, 0.06), (0.82, 0.92, 0.12), D, r=0.015, seg=1)
p.rbox((0, 0, 1.08), (0.8, 0.9, 2.04), E, r=0.03, seg=2)
p.rbox((0, -0.45, 1.06), (0.7, 0.04, 1.9), S, r=0.012, seg=1)
for z in [0.3 + i * 0.1 for i in range(14)]:
    p.rbox((-0.05, -0.475, z), (0.5, 0.012, 0.03), D, r=0.004, seg=1)
bar_handle(p, 0.3, -0.475, 1.0, 0.45)
for i in range(5):
    p.rbox((-0.3, -0.478, 0.4 + i * 0.35), (0.026, 0.01, 0.026), ST if i != 3 else O, r=0.004, seg=1)
p.rbox((0, 0, 2.12), (0.84, 0.94, 0.05), D, r=0.015, seg=1)
p.rbox((0, 0.1, 2.2), (0.6, 0.4, 0.12), D, r=0.02, seg=1)
for sx in (-0.2, 0.0, 0.2):
    p.tube([(sx, 0.1, 2.15), (sx, 0.2, 2.35), (sx + 0.1, 0.5, 2.3)], 0.014, R, seg=6)
finish(p, col=(0.8, 0.9, 2.1))

p = Part('analysis_bench')
p.rbox((0, 0, 0.08), (2.96, 0.84, 0.16), D, r=0.012, seg=1)
for i in range(3):
    p.rbox((-0.98 + i * 0.98, 0, 0.5), (0.94, 0.84, 0.72), E, r=0.02, seg=2)
    p.rbox((-0.98 + i * 0.98, -0.425, 0.5), (0.8, 0.02, 0.6), S, r=0.01, seg=1)
    bar_handle(p, -0.98 + i * 0.98 + 0.3, -0.435, 0.5, 0.3, axis='z', r=0.01, standoff=0.03)
p.rbox((0, 0, 0.9), (3.04, 0.92, 0.06), B, r=0.015, seg=2)
p.rbox((0, 0.43, 1.0), (3.04, 0.05, 0.16), B, r=0.012, seg=1)
p.lathe((-1.0, -0.02, 0.93), [(0.3, 0.0), (0.3, 0.14), (0.25, 0.2), (0.25, 0.23), (0.2, 0.23), (0.0, 0.23)], E, seg=24)
p.rbox((-1.0, -0.02, 1.2), (0.52, 0.52, 0.06), D, r=0.02, seg=2)
p.cyl((-1.0, -0.02, 1.25), 0.05, 0.06, S, seg=10)
status_lamps(p, -1.0, -0.345, 1.02, n=3, gap=0.04, s=0.02)
p.extrude([(0.0, 0.0), (0.0, 0.5), (0.14, 0.5), (0.16, 0.18), (0.28, 0.12), (0.28, 0.0)], 0.14, E, plane='yz', c=(0.0, 0.15, 0.93), r=0.008)
p.cyl((0.0, 0.0, 1.15), 0.035, 0.34, D, seg=12, rot=Rx(0.5))
p.rbox((0.0, -0.06, 0.94), (0.3, 0.22, 0.03), D, r=0.01, seg=1)
p.rbox((0.95, -0.05, 0.96), (0.76, 0.36, 0.04), D, r=0.015, seg=1)
for r_ in range(2):
    for c_ in range(6):
        p.cyl((0.62 + c_ * 0.12, -0.12 + r_ * 0.14, 1.03), 0.022, 0.1, G, seg=8)
        p.cyl((0.62 + c_ * 0.12, -0.12 + r_ * 0.14, 1.09), 0.024, 0.03, [O, ST, H, B][(r_ + c_) % 4], seg=8)
p.tube([(1.2, 0.4, 1.1), (1.2, 0.3, 1.5)], 0.025, D, seg=8)
p.rbox((1.2, 0.27, 1.55), (0.46, 0.05, 0.32), D, r=0.02, seg=2)
p.rbox((1.2, 0.243, 1.55), (0.38, 0.012, 0.25), SC, r=0.004, seg=1)
finish(p, col=(3.04, 0.92, 1.6))

p = Part('storage_cabinet')
p.rbox((0, 0, 0.06), (1.04, 0.54, 0.12), D, r=0.012, seg=1)
p.rbox((0, 0, 1.06), (1.0, 0.5, 1.9), E, r=0.025, seg=2)
for sx in (-1, 1):
    p.rbox((sx * 0.245, -0.255, 1.0), (0.465, 0.02, 1.7), S, r=0.012, seg=1, panel=(FRONT, 0.05, -0.008), panel_mat=E)
    bar_handle(p, sx * 0.07, -0.265, 1.0, 0.3, r=0.009, standoff=0.025)
    for z in (0.4, 1.6):
        p.cyl((sx * 0.485, -0.25, z), 0.016, 0.1, B, seg=8)
louvres(p, 0, -0.245, 1.9, 0.7, 0.12, 4)
p.rbox((0, -0.27, 1.82), (0.36, 0.01, 0.07), O, r=0.003, seg=1)
p.rbox((0, 0, 2.03), (1.04, 0.54, 0.04), D, r=0.012, seg=1)
finish(p, col=(1.0, 0.5, 2.0))

p = Part('storage_rack')
for sx in (-0.97, 0.97):
    for sy in (-0.27, 0.27):
        p.extrude([(-0.03, -0.03), (0.03, -0.03), (0.03, -0.02), (-0.02, -0.02), (-0.02, 0.03), (-0.03, 0.03)], 2.2, D, plane='xy', c=(sx, sy, 1.1))
for k in range(4):
    z = 0.2 + k * 0.62
    p.rbox((0, 0, z), (1.96, 0.58, 0.04), E, r=0.01, seg=1)
    p.rbox((0, -0.285, z + 0.03), (1.96, 0.012, 0.06), E, r=0.004, seg=1)
    x0 = -0.82
    for j in range(3):
        w = 0.42 + 0.08 * ((k + j) % 3)
        h = 0.26 + 0.05 * ((j + k) % 2)
        c = (x0 + w / 2, 0, z + 0.02 + h / 2)
        p.rbox(c, (w, 0.44, h), S if (j + k) % 2 else O, r=0.02, seg=2, panel=(FRONT, 0.03, -0.006), panel_mat=E)
        bar_handle(p, c[0], c[1] - 0.22, c[2] + h * 0.15, 0.14, axis='x', r=0.008, standoff=0.015)
        p.rbox((c[0], c[1] - 0.226, c[2] - h * 0.18), (0.12, 0.006, 0.05), E, r=0.002, seg=1)
        x0 += w + 0.08
finish(p, col=(2.0, 0.6, 2.2))

p = Part('instrument_cart')
for sx in (-0.4, 0.4):
    for sy in (-0.25, 0.25):
        p.tube([(sx, sy, 0.12), (sx, sy, 0.86)], 0.016, B, seg=8)
        p.cyl((sx, sy, 0.065), 0.045, 0.04, R, axis='x', seg=14)
        p.rbox((sx, sy, 0.1), (0.05, 0.05, 0.05), D, r=0.01, seg=1)
for z in (0.82, 0.35):
    p.rbox((0, 0, z), (0.88, 0.58, 0.035), E, r=0.012, seg=1)
    p.rbox((0, -0.285, z + 0.02), (0.88, 0.014, 0.04), E, r=0.004, seg=1)
    p.rbox((0, 0.285, z + 0.02), (0.88, 0.014, 0.04), E, r=0.004, seg=1)
p.tube([(-0.4, 0.28, 0.86), (-0.4, 0.34, 1.02), (0.4, 0.34, 1.02), (0.4, 0.28, 0.86)], 0.014, B, seg=8)
p.rbox((-0.2, 0, 0.9), (0.32, 0.22, 0.05), D, r=0.015, seg=1)
for i in range(4):
    p.cyl((-0.28 + i * 0.09, 0, 0.94), 0.012, 0.18, B, axis='x', seg=6)
p.rbox((0.25, -0.05, 0.92), (0.22, 0.2, 0.1), S, r=0.02, seg=2)
p.rbox((0.0, 0.0, 0.44), (0.4, 0.3, 0.14), D, r=0.02, seg=2)
finish(p, col=(0.9, 0.6, 1.1))

p = Part('chair')
for k in range(5):
    a = k * 2 * pi / 5
    p.rbox((cos(a) * 0.16, sin(a) * 0.16, 0.06), (0.32, 0.05, 0.035), D, r=0.01, seg=1, rot=Rz(a))
    p.cyl((cos(a) * 0.3, sin(a) * 0.3, 0.035), 0.03, 0.04, R, axis='x', seg=10)
p.cyl((0, 0, 0.27), 0.04, 0.4, B, seg=10)
p.cyl((0, 0, 0.5), 0.065, 0.06, D, seg=12)
p.rbox((0, 0, 0.56), (0.5, 0.48, 0.09), 'Fabric', r=0.04, seg=3)
p.rbox((0, 0.24, 0.9), (0.46, 0.08, 0.5), 'Fabric', r=0.04, seg=3, rot=Rx(-0.12))
p.rbox((0, 0.27, 0.64), (0.1, 0.06, 0.2), D, r=0.015, seg=1)
for sx in (-1, 1):
    p.tube([(sx * 0.27, 0.05, 0.6), (sx * 0.27, 0.0, 0.78), (sx * 0.27, -0.18, 0.78)], 0.016, D, seg=6)
finish(p)


# ------------------------------------------------------------------ ROBOTICS WORKSHOP
def machine_cabinet(name, w, d, h, style):
    p = Part(name)
    p.rbox((0, 0, 0.1), (w, d, 0.2), D, r=0.02, seg=2)
    for sx in (-w * 0.28, w * 0.28):
        p.rbox((sx, -d / 2 + 0.01, 0.06), (0.4, 0.04, 0.1), S, r=0.01, seg=1)
    p.rbox((0, 0, 0.2 + (h - 0.2) / 2), (w - 0.04, d - 0.04, h - 0.2), E, r=0.035, seg=3)
    p.rbox((0, 0, h - 0.04), (w, d, 0.08), D, r=0.03, seg=2)
    n = max(2, int(w // 1.15))
    dw = (w - 0.3) / n
    for i in range(n):
        cx = -w / 2 + 0.15 + dw * (i + 0.5)
        dh = h - 1.0 if style in ('C', 'D') else h - 0.75
        cz = 0.24 + dh / 2
        p.rbox((cx, -d / 2 + 0.01, cz), (dw - 0.07, 0.04, dh), S, r=0.02, seg=2, panel=(FRONT, 0.07, -0.012), panel_mat=E)
        gasket(p, [(cx - dw / 2 + 0.05, -d / 2 - 0.012, cz - dh / 2 + 0.04), (cx - dw / 2 + 0.05, -d / 2 - 0.012, cz + dh / 2 - 0.04),
                   (cx + dw / 2 - 0.05, -d / 2 - 0.012, cz + dh / 2 - 0.04), (cx + dw / 2 - 0.05, -d / 2 - 0.012, cz - dh / 2 + 0.04),
                   (cx - dw / 2 + 0.05, -d / 2 - 0.012, cz - dh / 2 + 0.04)], 0.007)
        if style in ('A', 'C'):
            bar_handle(p, cx + (dw / 2 - 0.2) * (1 if i % 2 == 0 else -1), -d / 2 - 0.01, cz, 0.35, r=0.011, standoff=0.03)
        else:
            quarter_turn(p, cx + dw / 2 - 0.15, -d / 2 - 0.01, cz + dh / 2 - 0.2)
            quarter_turn(p, cx + dw / 2 - 0.15, -d / 2 - 0.01, cz - dh / 2 + 0.2)
        for z in (cz - dh / 2 + 0.2, cz + dh / 2 - 0.2):
            p.cyl((cx - dw / 2 + 0.03, -d / 2 - 0.008, z), 0.018, 0.1, B, seg=8)
    top = h - 0.42
    if style == 'A':
        louvres(p, 0, -d / 2 + 0.02, top, w * 0.5, 0.28, 6)
        p.tube([(w * 0.42, d / 2 - 0.1, h), (w * 0.42, d / 2 - 0.1, h + 0.4)], 0.04, D, seg=10)
    elif style == 'B':
        p.extrude([(-w / 2, h - 0.08), (-w / 2 + 0.2, h + 0.12), (w / 2 - 0.2, h + 0.12), (w / 2, h - 0.08)], d - 0.1, E, plane='xz', r=0.02)
        for sx in (-w * 0.35, w * 0.35):
            p.tube([(sx - 0.06, 0, h + 0.1), (sx - 0.06, 0, h + 0.28), (sx + 0.06, 0, h + 0.28), (sx + 0.06, 0, h + 0.1)], 0.018, B, seg=8)
        louvres(p, 0, -d / 2 + 0.02, top - 0.05, w * 0.6, 0.3, 6)
    elif style == 'C':
        p.rbox((0, -d / 2 + 0.01, top + 0.05), (w * 0.6, 0.05, 0.36), D, r=0.02, seg=2, panel=(FRONT, 0.03, -0.008), panel_mat=S)
        p.rbox((-w * 0.15, -d / 2 - 0.02, top + 0.05), (0.34, 0.012, 0.2), SC, r=0.004, seg=1)
        for i in range(4):
            p.cyl((w * 0.08 + i * 0.1, -d / 2 - 0.025, top + 0.05), 0.026, 0.03, [ST, O, H, ST][i], axis='y', seg=12)
    else:
        cx, cz = w * 0.18, top + 0.02
        p.cyl((cx, -d / 2 + 0.005, cz), 0.27, 0.05, D, axis='y', seg=28, bev=0.008)
        for rr in (0.08, 0.15, 0.22):
            p.tube([(cx + rr * cos(a * pi / 12), -d / 2 - 0.02, cz + rr * sin(a * pi / 12)) for a in range(25)], 0.007, B, seg=6, caps=False)
        for k in range(6):
            a = k * pi / 3
            p.tube([(cx, -d / 2 - 0.02, cz), (cx + 0.24 * cos(a), -d / 2 - 0.02, cz + 0.24 * sin(a))], 0.007, B, seg=6)
        for sx in (-0.4, -0.25, -0.1):
            p.cyl((sx * w / 3.2, -d / 2 + 0.01, top), 0.04, 0.12, B, axis='y', seg=10)
    p.rbox((-w / 2 + 0.55, -d / 2 - 0.005, 0.32), (0.7, 0.01, 0.12), H, r=0.002, seg=1)
    p.rbox((w / 2 - 0.5, -d / 2 - 0.006, 0.34), (0.4, 0.01, 0.14), O, r=0.002, seg=1)
    status_lamps(p, w / 2 - 0.35, -d / 2 - 0.015, 1.0 if h > 2.3 else 0.9, n=3)
    p.rbox((-w / 2 - 0.03, 0, h * 0.5), (0.06, 0.5, 0.4), D, r=0.015, seg=1)
    finish(p, name=name, col=(w, d, h))


machine_cabinet('equip_cabinet_A', 3.6, 2.0, 2.2, 'A')
machine_cabinet('equip_cabinet_B', 2.8, 2.4, 3.0, 'B')
machine_cabinet('equip_cabinet_C', 3.4, 2.2, 2.5, 'C')
machine_cabinet('equip_cabinet_D', 3.0, 2.0, 2.8, 'D')

# ROBOT SERVICE DOCK: built around the bug-class security robot (six leg locators, dorsal service port, clamp arms) with an articulated probe
p = Part('charging_dock')
p.rbox((0, 0.7, 1.2), (2.0, 0.2, 2.4), D, r=0.03, seg=2)
p.rbox((0, 0.58, 1.3), (1.5, 0.06, 1.3), S, r=0.02, seg=2, panel=(FRONT, 0.06, -0.01), panel_mat=E)
for sx in (-0.95, 0.95):
    p.rbox((sx, 0, 1.2), (0.12, 1.6, 2.4), S, r=0.03, seg=2)
    p.rbox((sx * 0.96, -0.5, 0.9), (0.08, 0.3, 0.5), D, r=0.02, seg=1)
p.rbox((0, 0.0, 2.34), (2.0, 1.6, 0.14), E, r=0.04, seg=2)
p.rbox((0, -0.4, 2.2), (1.7, 0.8, 0.14), D, r=0.04, seg=2)
p.rbox((0, 0, 0.07), (1.84, 1.5, 0.14), D, r=0.025, seg=2)
p.rbox((0, -0.08, 0.17), (1.1, 0.95, 0.06), S, r=0.025, seg=2)
for sx in (-0.4, 0.4):
    for y in (-0.34, -0.08, 0.18):
        p.rbox((sx, y, 0.2), (0.16, 0.12, 0.03), B, r=0.012, seg=2)
        p.cyl((sx, y, 0.22), 0.025, 0.02, D, seg=10)
for sx in (-1, 1):
    p.cyl((sx * 0.7, -0.5, 0.3), 0.06, 0.2, D, seg=12, bev=0.01)
    p.rbox((sx * 0.62, -0.5, 0.36), (0.24, 0.1, 0.07), E, r=0.02, seg=2, rot=Rz(-sx * 0.4))
    p.rbox((sx * 0.5, -0.46, 0.38), (0.1, 0.08, 0.09), R, r=0.02, seg=2)
p.cyl((0, 0.45, 1.1), 0.5, 0.14, D, axis='y', seg=28, bev=0.015)
p.cyl((0, 0.36, 1.1), 0.34, 0.06, S, axis='y', seg=28)
p.cyl((0, 0.32, 1.1), 0.08, 0.06, B, axis='y', seg=12)
p.tube([(0.3, 0.3, 1.1), (0.5, 0.0, 0.9), (0.2, -0.3, 1.5), (0.0, -0.45, 2.0)], 0.035, R, seg=8)
p.tube([(0, -0.45, 2.1), (0, -0.4, 1.75), (0.0, -0.1, 1.05), (0.0, -0.08, 0.5)], 0.03, D, seg=8)
p.cyl((0, -0.4, 2.1), 0.07, 0.12, B, axis='x', seg=12)
p.rbox((0, -0.08, 0.48), (0.16, 0.16, 0.1), B, r=0.02, seg=2)
p.rbox((0.75, 0.58, 1.3), (0.3, 0.05, 0.5), D, r=0.015, seg=1)
p.rbox((0.75, 0.545, 1.4), (0.2, 0.012, 0.16), SC, r=0.003, seg=1)
status_lamps(p, 0.75, 0.555, 1.15)
p.rbox((0, -0.78, 0.02), (1.9, 0.08, 0.03), H, r=0.003, seg=1)
finish(p, col=(2.0, 1.6, 2.4))

p = Part('workstation')
p.rbox((0, 0.0, 0.92), (2.4, 1.1, 0.07), B, r=0.02, seg=2)
for sx in (-0.88, 0.88):
    p.rbox((sx, 0.0, 0.44), (0.62, 1.04, 0.86), E, r=0.025, seg=2)
for i in range(3):
    p.rbox((-0.88, -0.525, 0.18 + i * 0.26), (0.54, 0.02, 0.22), S, r=0.01, seg=1)
    bar_handle(p, -0.88, -0.535, 0.18 + i * 0.26, 0.26, axis='x', r=0.009, standoff=0.02)
p.rbox((0.88, -0.525, 0.45), (0.54, 0.02, 0.72), S, r=0.012, seg=1, panel=(FRONT, 0.04, -0.008), panel_mat=E)
bar_handle(p, 0.7, -0.535, 0.45, 0.3, r=0.009, standoff=0.02)
p.rbox((0, 0.3, 0.45), (1.14, 0.1, 0.84), S, r=0.015, seg=1)
p.rbox((0, 0.55, 1.5), (2.3, 0.06, 0.7), D, r=0.02, seg=2)
for i in range(7):
    x = -0.95 + i * 0.32
    p.tube([(x, 0.5, 1.62), (x, 0.5, 1.3)], 0.014, B if i % 2 else O, seg=6)
    p.cyl((x, 0.5, 1.2), 0.026, 0.14, D, seg=8)
p.rbox((-0.7, -0.05, 1.0), (0.34, 0.24, 0.12), D, r=0.025, seg=2)
p.rbox((-0.7, -0.19, 1.04), (0.3, 0.06, 0.1), B, r=0.015, seg=1)
p.tube([(-0.7, -0.22, 1.04), (-0.7, -0.42, 1.04)], 0.014, B, seg=6)
p.rbox((0.0, 0.05, 1.0), (0.5, 0.36, 0.1), E, r=0.025, seg=2)
status_lamps(p, 0.0, -0.14, 1.0, n=3)
p.tube([(0.0, 0.1, 1.06), (0.2, 0.0, 1.4), (0.4, -0.05, 1.5)], 0.016, D, seg=6)
p.rbox((0.55, 0.05, 1.5), (0.6, 0.06, 0.4), D, r=0.02, seg=2)
p.rbox((0.55, 0.017, 1.5), (0.52, 0.012, 0.32), SC, r=0.004, seg=1)
p.tube([(0.9, 0.3, 1.0), (0.9, 0.4, 1.3), (0.7, 0.2, 1.5)], 0.02, D, seg=6)
finish(p, col=(2.4, 1.2, 1.74))

p = Part('robot_test_cell')
p.rbox((0, 0, 0.1), (6.0, 3.0, 0.2), D, r=0.03, seg=2)
p.rbox((0, 0, 0.62), (5.96, 2.96, 0.84), E, r=0.04, seg=3)
for i in range(5):
    p.rbox((-2.4 + i * 1.2, -1.495, 0.62), (1.04, 0.03, 0.66), S, r=0.02, seg=2, panel=(FRONT, 0.05, -0.008), panel_mat=E)
    quarter_turn(p, -2.4 + i * 1.2 + 0.4, -1.51, 0.82)
p.rbox((0, 0, 1.08), (6.04, 3.04, 0.12), D, r=0.03, seg=2)
for sx in (-2.95, 2.95):
    for sy in (-1.46, 1.46):
        p.rbox((sx, sy, 1.78), (0.13, 0.13, 1.3), S, r=0.025, seg=2)
p.rbox((0, 0, 2.38), (6.04, 3.04, 0.1), D, r=0.03, seg=2)
p.rbox((0, 0, 2.24), (5.9, 2.9, 0.1), S, r=0.02, seg=1)
for sx in (-1.5, 1.5):
    p.rbox((sx, -1.5, 1.72), (2.7, 0.03, 1.1), G, r=0.004, seg=1)
    p.rbox((sx, -1.5, 1.2), (2.74, 0.06, 0.06), D, r=0.01, seg=1)
    p.rbox((sx, -1.5, 2.27), (2.74, 0.06, 0.06), D, r=0.01, seg=1)
p.rbox((0.0, -1.5, 1.72), (0.12, 0.1, 1.18), S, r=0.02, seg=1)
p.rbox((0, 1.5, 1.72), (5.8, 0.06, 1.1), S, r=0.015, seg=1)
p.rbox((2.1, -1.52, 0.62), (0.6, 0.04, 0.5), D, r=0.02, seg=2)
p.rbox((2.1, -1.545, 0.62), (0.46, 0.012, 0.3), SC, r=0.004, seg=1)
p.rbox((-0.9, 0.0, 1.14), (3.8, 0.1, 0.03), H, r=0.003, seg=1)
p.lathe((0.0, 0.0, 1.14), [(0.9, 0.0), (0.9, 0.08), (0.8, 0.12), (0.2, 0.12), (0.2, 0.0)], D, seg=40, closed=False)
p.lathe((0.0, 0.0, 1.26), [(0.8, 0.0), (0.8, 0.04), (0.0, 0.04)], B, seg=40)
for k in range(4):
    a = k * pi / 2 + pi / 4
    p.rbox((cos(a) * 0.55, sin(a) * 0.55, 1.34), (0.16, 0.08, 0.14), D, r=0.02, seg=2, rot=Rz(a))
p.tube([(-2.0, 1.4, 2.2), (-2.0, 0.5, 2.0), (-1.0, 0.1, 1.8), (-0.3, 0.0, 1.5)], 0.04, R, seg=8)
p.rbox((-1.0, 0.0, 2.1), (1.4, 0.2, 0.08), B, r=0.015, seg=1)
finish(p, col=(6.0, 3.0, 2.4))

for nm, L in (('barrier_26', 2.6), ('barrier_22', 2.2)):
    p = Part(nm)
    prof = [(-0.45, 0.0), (0.45, 0.0), (0.45, 0.16), (0.3, 0.9), (0.2, 1.06), (-0.2, 1.06), (-0.3, 0.9), (-0.45, 0.16)]
    p.extrude(prof, L, S, plane='yz', r=0.035)
    p.rbox((0, 0, 1.02), (L - 0.05, 0.42, 0.1), E, r=0.025, seg=2)
    for sy in (-1, 1):
        p.rbox((0, sy * 0.4, 0.5), (L - 0.4, 0.02, 0.2), H, r=0.004, seg=1, rot=Rx(sy * 0.05))
        for x in (-L / 2 + 0.55, L / 2 - 0.55):
            p.rbox((x, sy * 0.46, 0.12), (0.4, 0.04, 0.1), D, r=0.015, seg=1)
    for sx in (-1, 1):
        p.rbox((sx * (L / 2), 0, 0.5), (0.05, 0.84, 0.9), R, r=0.02, seg=2)
    p.rbox((0, 0, 0.03), (L + 0.04, 0.96, 0.06), D, r=0.012, seg=1)
    finish(p, col=(L, 0.9, 1.1))

for nm, (w, d, h) in (('crate_A', (1.4, 1.4, 1.4)), ('crate_top', (1.2, 1.0, 1.0)), ('crate_B', (1.6, 0.8, 1.2))):
    p = Part(nm)
    p.rbox((0, 0, h / 2), (w - 0.06, d - 0.06, h - 0.06), S, r=0.025, seg=2)
    n = int((w - 0.3) / 0.11)
    for i in range(n):
        x = -w / 2 + 0.15 + i * (w - 0.3) / max(1, n - 1)
        for sy in (-1, 1):
            p.rbox((x, sy * (d / 2 - 0.015), h / 2), (0.05, 0.03, h - 0.3), S, r=0.01, seg=1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.rbox((sx * (w / 2 - 0.04), sy * (d / 2 - 0.04), h / 2), (0.08, 0.08, h), D, r=0.015, seg=2)
            for z in (0.05, h - 0.05):
                p.rbox((sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), z), (0.12, 0.12, 0.1), D, r=0.02, seg=2)
    for z in (0.06, h - 0.06):
        p.rbox((0, 0, z), (w, d, 0.07), D, r=0.015, seg=1)
    for sx in (-0.16, 0.16):
        p.tube([(sx, -d / 2 - 0.015, 0.12), (sx, -d / 2 - 0.015, h - 0.12)], 0.012, B, seg=8)
        for z in (0.2, h - 0.2):
            p.rbox((sx, -d / 2 - 0.03, z), (0.07, 0.02, 0.03), B, r=0.006, seg=1)
    bar_handle(p, 0, -d / 2 - 0.02, h * 0.45, 0.16, axis='x', r=0.01, standoff=0.03)
    p.rbox((w * 0.28, -d / 2 - 0.02, h * 0.72), (0.34, 0.012, 0.2), O, r=0.003, seg=1)
    finish(p, col=(w, d, h))

p = Part('barrel_explosive')
p.lathe((0, 0, 0), [(0.36, 0.0), (0.4, 0.03), (0.405, 0.1), (0.4, 0.14), (0.38, 0.17), (0.38, 0.25)], D, seg=28, closed=False)
p.lathe((0, 0, 0), [(0.38, 0.25), (0.38, 0.8), (0.388, 0.9)], 'Drum', seg=28, closed=False)
p.lathe((0, 0, 0), [(0.38, 0.8), (0.4, 0.9), (0.4, 0.96), (0.38, 0.99), (0.34, 1.01), (0.0, 1.0)], D, seg=28)
for z in (0.3, 0.64):
    p.lathe((0, 0, 0), [(0.38, z - 0.03), (0.405, z - 0.015), (0.405, z + 0.015), (0.38, z + 0.03)], D, seg=28, closed=False)
p.lathe((0.14, 0.1, 1.0), [(0.0, 0.0), (0.05, 0.0), (0.05, 0.035), (0.04, 0.045), (0.0, 0.045)], B, seg=14)
p.lathe((-0.13, -0.08, 1.0), [(0.0, 0.0), (0.04, 0.0), (0.04, 0.03), (0.0, 0.03)], 'SafetyOrange', seg=12)
finish(p, col=(0.84, 0.84, 1.1))

p = Part('canister')
p.lathe((0, 0, 0), [(0.3, 0.0), (0.37, 0.03), (0.37, 0.12), (0.34, 0.14)], D, seg=24, closed=False)
p.lathe((0, 0, 0), [(0.34, 0.14), (0.34, 0.74), (0.31, 0.88), (0.22, 0.97), (0.1, 1.01), (0.08, 1.03)], 'Canister', seg=24, closed=False)
p.lathe((0, 0, 0), [(0.355, 0.5), (0.355, 0.56)], D, seg=24, closed=False)
p.lathe((0, 0, 0), [(0.1, 1.02), (0.14, 1.04), (0.14, 1.08), (0.08, 1.1), (0.0, 1.1)], B, seg=16)
p.cyl((0, 0, 1.15), 0.035, 0.08, B, seg=10)
p.cyl((0.0, 0.0, 1.19), 0.1, 0.02, D, seg=16)
p.rbox((0.1, 0, 1.08), (0.1, 0.06, 0.06), B, r=0.012, seg=1)
for a in (0, pi / 2, pi, 3 * pi / 2):
    p.rbox((cos(a) * 0.05, sin(a) * 0.05, 1.19), (0.1, 0.02, 0.02), D, r=0.005, seg=1, rot=Rz(a))
finish(p, col=(0.8, 0.8, 1.1))

p = Part('beacon')
p.cyl((0, 0, 0.03), 0.17, 0.06, D, seg=16, bev=0.01)
p.cyl((0, 0, 0.1), 0.1, 0.1, E, seg=16, bev=0.01)
for k in range(3):
    a = k * 2 * pi / 3
    p.rbox((cos(a) * 0.13, sin(a) * 0.13, 0.1), (0.06, 0.02, 0.1), D, r=0.006, seg=1, rot=Rz(a))
finish(p)
p = Part('LENS_beacon')
p.lathe((0, 0, 0.15), [(0.095, 0.0), (0.105, 0.05), (0.1, 0.12), (0.07, 0.19), (0.0, 0.21)], O, seg=20)
for k in range(6):
    a = k * pi / 3
    p.rbox((cos(a) * 0.1, sin(a) * 0.1, 0.25), (0.012, 0.012, 0.12), D, r=0.002, seg=1, rot=Rz(a))
finish(p)

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_normals=True, export_texcoords=True)
faces = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('KIT', len(bpy.data.objects), 'objects', faces, 'faces')
