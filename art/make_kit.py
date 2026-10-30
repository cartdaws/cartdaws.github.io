"""INTRUDER environment kit. Run:  blender -b --python art/make_kit.py -- <out.glb> <out.blend>
One design language: matte painted structural metal, off-white equipment housings, dark service hardware, orange/yellow safety marks.
Front of every asset faces -Y (+Z in three.js). Origin = footprint centre on the floor unless noted."""
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_lib import *
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)

S, E, D, B, R, H, O, SC, ST = 'PaintStructural', 'PaintEquipment', 'PaintDark', 'MetalBare', 'Rubber', 'Hazard', 'SafetyOrange', 'Screen', 'Status'
Rz = lambda a: Matrix.Rotation(a, 4, 'Z')
Rx = lambda a: Matrix.Rotation(a, 4, 'X')

# ---------------------------------------------------------------- structure
a = Asset('door_frame')  # 3.0 x 3.0 opening, 0.7 deep (the wall is 0.5)
a.box((-1.625, 0, 1.5), (0.25, 0.7, 3.0), S).box((1.625, 0, 1.5), (0.25, 0.7, 3.0), S)
a.box((0, 0, 3.25), (3.5, 0.7, 0.5), S)
a.box((0, -0.355, 3.25), (3.0, 0.03, 0.2), H, bev=0).box((0, 0.355, 3.25), (3.0, 0.03, 0.2), H, bev=0)
# status lamps are part of the Door entity (they change colour with the lock state)
a.box((0, 0, 0.02), (3.0, 0.7, 0.04), D, bev=0.005)
a.finish()

a = Asset('door_leaf')  # 3.0 x 3.0 x 0.3, origin at the slab centre (it slides vertically)
a.box((0, 0, 0), (3.0, 0.3, 3.0), E, bev=0.02)
a.box((0, 0, 0), (0.06, 0.32, 3.02), D, bev=0)
for sx in (-0.75, 0.75):
    a.box((sx, -0.155, 0.1), (1.2, 0.02, 2.2), S, bev=0.01).box((sx, 0.155, 0.1), (1.2, 0.02, 2.2), S, bev=0.01)
a.box((0, -0.16, -1.36), (3.0, 0.02, 0.28), H, bev=0).box((0, 0.16, -1.36), (3.0, 0.02, 0.28), H, bev=0)
a.box((-0.2, -0.17, 0.0), (0.05, 0.03, 0.6), B).box((0.2, -0.17, 0.0), (0.05, 0.03, 0.6), B)
a.finish()

a = Asset('window_frame')  # 7.0 x 2.7 opening, sill at z=0.9; glass is placed separately
a.box((0, 0, 0.85), (7.5, 0.76, 0.12), S).box((0, 0, 3.65), (7.5, 0.76, 0.12), S)
for sx in (-3.6, 3.6):
    a.box((sx, 0, 2.25), (0.2, 0.7, 2.7), S)
for sx in (-1.17, 1.17):
    a.box((sx, 0, 2.25), (0.12, 0.26, 2.7), D)
a.box((0, -0.36, 0.76), (7.0, 0.1, 0.08), H, bev=0).box((0, 0.36, 0.76), (7.0, 0.1, 0.08), H, bev=0)
a.finish()

for nm, hgt in (('wall_rib_45', 4.5), ('wall_rib_65', 6.5)):
    a = Asset(nm)  # pilaster against a wall (back at +Y), 0.5 wide, 0.28 proud
    a.box((0, 0.0, hgt / 2), (0.5, 0.28, hgt), S, bev=0.015)
    a.box((0, -0.02, 0.18), (0.62, 0.34, 0.36), D).box((0, -0.02, hgt - 0.14), (0.62, 0.34, 0.28), D)
    a.box((0, -0.16, hgt * 0.55), (0.22, 0.04, 0.9), D, bev=0)
    a.finish()

a = Asset('pillar')  # 0.9 x 0.9 x 6.5
a.box((0, 0, 3.25), (0.8, 0.8, 6.5), S, bev=0.03).box((0, 0, 0.3), (0.98, 0.98, 0.6), D, bev=0.03)
a.box((0, 0, 0.45), (0.86, 0.86, 0.22), H, bev=0.01)
a.box((0, 0, 6.3), (0.98, 0.98, 0.3), D, bev=0.03)
a.box((0.41, 0.0, 3.5), (0.05, 0.14, 2.6), D, bev=0).box((-0.41, 0.0, 3.0), (0.05, 0.14, 2.2), D, bev=0)
a.finish(); collider('pillar', (0.9, 0.9, 6.5))

# ---------------------------------------------------------------- specimen containment
a = Asset('cell_frame')  # containment cell: plinth, six posts, emitter crown, service spine, restraint arms
a.cyl((0, 0, 0.15), 1.5, 0.3, D, seg=12, bev=0.03)
a.cyl((0, 0, 0.34), 1.22, 0.08, B, seg=12)
for k in range(6):  # posts sit on the panel seams, so a clear glass panel is centred on the front
    th = -math.pi / 2 + math.pi / 6 + k * math.pi / 3
    a.box((math.cos(th) * 1.18, math.sin(th) * 1.18, 1.85), (0.13, 0.13, 3.1), E, bev=0.015, rot=Rz(th))
a.cyl((0, 0, 3.5), 1.42, 0.26, E, seg=12, bev=0.02)
a.cyl((0, 0, 3.7), 1.1, 0.14, D, seg=12)
for k in range(6):
    th = k * math.pi / 3 + 0.5
    a.box((math.cos(th) * 1.3, math.sin(th) * 1.3, 3.5), (0.18, 0.18, 0.34), D, rot=Rz(th))
    a.box((math.cos(th) * 1.3, math.sin(th) * 1.3, 3.5), (0.08, 0.2, 0.1), ST, bev=0, rot=Rz(th))
a.box((0, 1.62, 2.35), (0.55, 0.45, 4.1), S, bev=0.02)  # service spine rises to the ceiling
a.box((0, 1.62, 4.35), (0.85, 0.7, 0.3), D)
for z in (0.8, 1.9, 3.0):
    a.box((0, 1.38, z), (0.62, 0.06, 0.2), D, bev=0.01)
for sx in (-1, 1):  # restraint arms: base post, articulated link, open clamp ring
    a.box((sx * 0.95, 0.35, 0.65), (0.16, 0.16, 0.7), D, bev=0.015)
    a.cyl((sx * 0.95, 0.35, 1.05), 0.1, 0.18, B, axis='x', seg=12)
    a.box((sx * 0.75, 0.1, 1.2), (0.55, 0.1, 0.1), E, bev=0.01, rot=Rz(sx * 0.5))
    a.torus_ring((sx * 0.55, -0.1, 1.28), 0.14, 0.035, D, axis='y', seg=16, tube=6)
    a.box((sx * 0.95, 0.35, 1.5), (0.14, 0.14, 0.5), D, bev=0.015)
    a.torus_ring((sx * 0.62, 0.05, 1.7), 0.12, 0.03, D, axis='y', seg=16, tube=6)
for k in range(3):  # feed lines on the plinth
    a.box((1.15 + k * 0.13, -0.2 + k * 0.5, 0.06), (0.7, 0.1, 0.1), R, bev=0.02, rot=Rz(0.5 * k))
a.finish(); collider('cell', (2.9, 2.9, 4.5))
g = Asset('cell_glass')  # five fixed panels
for k in range(1, 6):
    th = -math.pi / 2 + k * math.pi / 3
    g.box((math.cos(th) * 0.996, math.sin(th) * 0.996, 1.85), (1.14, 0.03, 3.0), 'Glass', bev=0, rot=Rz(th + math.pi / 2))
g.finish()
g = Asset('cell_front')  # the door panel that shatters in the opening
g.box((0, -0.996, 1.85), (1.14, 0.03, 3.0), 'Glass', bev=0)
g.finish()

a = Asset('scanner_arm')  # ceiling rail, carriage, two-link arm, ring scanner head (origin on the rail, hangs down)
a.box((0, 0, 0), (0.34, 4.2, 0.2), D, bev=0.015).box((0, 0, 0.12), (0.12, 4.2, 0.06), B, bev=0)
a.box((0, 0, -0.22), (0.5, 0.7, 0.3), E, bev=0.02)
a.cyl((0, 0, -0.55), 0.13, 0.5, D, seg=10)
a.box((0, -0.55, -0.95), (0.18, 1.2, 0.18), E, bev=0.02, rot=Rx(0.35))
a.cyl((0, -1.05, -1.15), 0.14, 0.26, D, axis='x', seg=10)
a.box((0, -1.1, -1.6), (0.14, 0.14, 0.95), E, bev=0.015)
a.torus_ring((0, -1.1, -2.2), 0.46, 0.06, E, axis='z', seg=24, tube=6)
a.cyl((0, -1.1, -2.2), 0.12, 0.2, D, seg=10)
a.box((0, -1.1, -2.2), (0.06, 0.06, 0.1), ST, bev=0)
a.finish()

a = Asset('restraint_bed')  # examination table with cuffs, 2.2 x 0.8 x 0.85
a.cyl((0, 0, 0.3), 0.18, 0.6, D, seg=10).box((0, 0, 0.04), (0.9, 0.7, 0.08), D)
a.box((0, 0, 0.72), (2.2, 0.8, 0.12), E, bev=0.03).box((0, 0, 0.8), (2.1, 0.7, 0.06), R, bev=0.03)
for sx in (-0.5, 0.5):
    for sy in (-1, 1):
        a.torus_ring((sx, sy * 0.38, 0.86), 0.09, 0.02, D, axis='x', seg=12, tube=5)
a.box((1.0, 0, 0.9), (0.3, 0.5, 0.1), R, bev=0.03)
a.box((-1.4, 0.0, 0.5), (0.5, 0.3, 0.35), D)
a.finish(); collider('restraint_bed', (2.8, 0.98, 0.97))

# ---------------------------------------------------------------- monitoring / analysis
a = Asset('monitor_station')  # operator desk with three displays, 2.4 x 0.9
a.box((0, 0, 0.74), (2.4, 0.9, 0.05), E, bev=0.015)
for sx in (-1.15, 1.15):
    a.box((sx, 0, 0.36), (0.07, 0.86, 0.72), D, bev=0.01)
a.box((0, 0.38, 0.4), (2.2, 0.06, 0.62), D, bev=0.01)
a.box((0.85, -0.05, 0.4), (0.5, 0.7, 0.62), S, bev=0.01).box((0.85, -0.4, 0.5), (0.4, 0.02, 0.1), D, bev=0)
a.cyl((0, 0.3, 1.0), 0.04, 0.55, D, seg=8)
for x, z, r in ((-0.78, 1.1, 0.25), (0, 1.15, 0), (0.78, 1.1, -0.25)):
    a.box((x, 0.3, z), (0.72, 0.05, 0.46), D, bev=0.012, rot=Rz(r))
    a.box((x + math.sin(-r) * -0.028, 0.268, z), (0.62, 0.02, 0.36), SC, bev=0, rot=Rz(r))
a.box((0, -0.12, 0.775), (0.62, 0.2, 0.02), D, bev=0.005)
a.finish(); collider('monitor_station', (2.4, 0.9, 1.4))

a = Asset('display_hanging')  # ceiling-suspended information display above the containment cell approach; origin on the floor below, front -Y
for sx in (-1.45, 1.45):
    a.box((sx, 0.0, 4.15), (0.1, 0.1, 0.7), D, bev=0.01)       # drop rods to the ceiling at z=4.5
a.box((0, 0.0, 4.45), (3.4, 0.4, 0.1), D, bev=0.01)             # ceiling rail
a.box((0, 0.0, 3.4), (3.5, 0.16, 2.0), D, bev=0.025)             # housing
a.box((0, 0.08, 3.4), (3.3, 0.04, 1.8), S, bev=0.01)
a.box((0, -0.075, 2.38), (3.5, 0.06, 0.06), H, bev=0)
a.box((1.5, 0.12, 3.4), (0.14, 0.14, 1.9), D, bev=0.01)          # service riser at the back
for z in (3.0, 3.6):
    a.box((1.5, 0.12, z), (0.22, 0.2, 0.1), E, bev=0.01)
a.finish()
uv_quad('SCREEN_display_hanging', 3.1, 1.7, (0, -0.09, 3.4), SC)

a = Asset('server_rack')  # 0.8 x 0.9 x 2.1
a.box((0, 0, 1.05), (0.8, 0.9, 2.1), D, bev=0.02).box((0, -0.455, 1.05), (0.72, 0.03, 2.0), E, bev=0.01)
for k in range(5):
    a.box((0, -0.475, 0.3 + k * 0.38), (0.6, 0.015, 0.22), D, bev=0)
    a.box((0.22, -0.485, 0.3 + k * 0.38), (0.05, 0.01, 0.05), ST, bev=0)
a.box((0, 0, 2.12), (0.8, 0.9, 0.04), B, bev=0.005)
a.finish(); collider('server_rack', (0.8, 0.9, 2.1))

a = Asset('analysis_bench')  # sample-analysis bench with centrifuge, scope and racks, 3.0 x 0.9 x 0.95
a.box((0, 0, 0.45), (3.0, 0.86, 0.86), E, bev=0.02)
a.box((0, 0, 0.9), (3.04, 0.9, 0.06), D, bev=0.015)
for k in range(-1, 2):
    a.box((k * 0.98, -0.435, 0.42), (0.9, 0.02, 0.7), S, bev=0.01).box((k * 0.98 + 0.34, -0.455, 0.45), (0.04, 0.02, 0.18), B, bev=0)
a.cyl((-1.0, 0.0, 1.07), 0.26, 0.22, E, seg=16, bev=0.015).cyl((-1.0, 0, 1.2), 0.2, 0.06, D, seg=16)
a.box((-1.0, -0.26, 1.0), (0.2, 0.04, 0.08), ST, bev=0)
a.box((0.0, 0.18, 1.03), (0.3, 0.2, 0.12), D, bev=0.01).box((0.0, 0.18, 1.2), (0.08, 0.1, 0.34), E, bev=0.01).cyl((0, 0.05, 1.3), 0.05, 0.22, D, axis='y', seg=8)
a.box((0.9, -0.05, 1.0), (0.7, 0.34, 0.1), D, bev=0.01)
for k in range(6):
    a.cyl((0.65 + k * 0.1, -0.05, 1.1), 0.02, 0.14, B, seg=6)
a.box((1.2, 0.3, 1.45), (0.42, 0.04, 0.3), D, bev=0.01).box((1.2, 0.27, 1.45), (0.36, 0.02, 0.24), SC, bev=0)
a.cyl((1.2, 0.34, 1.2), 0.025, 0.55, D, seg=6)
a.finish(); collider('analysis_bench', (3.04, 0.92, 1.6))

a = Asset('storage_cabinet')  # 1.0 x 0.5 x 2.0
a.box((0, 0, 1.0), (1.0, 0.5, 2.0), E, bev=0.02).box((0, 0, 0.05), (1.04, 0.54, 0.1), D)
for sx in (-0.245, 0.245):
    a.box((sx, -0.255, 1.05), (0.46, 0.015, 1.78), S, bev=0.01)
a.box((-0.06, -0.27, 1.0), (0.03, 0.03, 0.2), B, bev=0).box((0.06, -0.27, 1.0), (0.03, 0.03, 0.2), B, bev=0)
a.box((0.25, -0.265, 1.7), (0.18, 0.01, 0.1), O, bev=0)
a.finish(); collider('storage_cabinet', (1.0, 0.5, 2.0))

a = Asset('storage_rack')  # open shelving with sealed containers, 2.0 x 0.6 x 2.2
for sx in (-0.97, 0.97):
    for sy in (-0.27, 0.27):
        a.box((sx, sy, 1.1), (0.06, 0.06, 2.2), D, bev=0.005)
for k in range(4):
    a.box((0, 0, 0.2 + k * 0.62), (2.0, 0.6, 0.04), E, bev=0.005)
for k in range(4):
    x0 = -0.8
    for j in range(3):
        w = 0.4 + 0.1 * ((k + j) % 3)
        a.box((x0 + w / 2, 0, 0.22 + k * 0.62 + 0.15 + (0.04 if (j + k) % 2 else 0)), (w, 0.42, 0.26 + 0.05 * ((j + k) % 2)), S if (j + k) % 2 else O, bev=0.012)
        x0 += w + 0.1
a.finish(); collider('storage_rack', (2.0, 0.6, 2.2))

a = Asset('instrument_cart')  # 0.9 x 0.6 x 0.9
a.box((0, 0, 0.82), (0.9, 0.6, 0.04), E, bev=0.01).box((0, 0, 0.35), (0.86, 0.56, 0.04), E, bev=0.01)
for sx in (-0.4, 0.4):
    for sy in (-0.25, 0.25):
        a.box((sx, sy, 0.42), (0.04, 0.04, 0.84), D, bev=0)
        a.cyl((sx, sy, 0.05), 0.05, 0.04, R, axis='x', seg=8)
a.box((0, 0.3, 1.0), (0.9, 0.03, 0.2), D, bev=0)
for k in range(3):
    a.box((-0.25 + k * 0.25, 0, 0.9), (0.16, 0.2, 0.14), B if k % 2 else S, bev=0.01)
a.finish(); collider('instrument_cart', (0.9, 0.6, 1.0))

a = Asset('chair')  # 0.6 x 0.6 x 1.0
a.cyl((0, 0, 0.05), 0.28, 0.06, D, seg=5, bev=0.005).cyl((0, 0, 0.3), 0.04, 0.5, D, seg=8)
a.box((0, 0, 0.55), (0.46, 0.46, 0.08), 'Fabric', bev=0.025).box((0, 0.22, 0.85), (0.44, 0.06, 0.5), 'Fabric', bev=0.025)
a.finish()

# ---------------------------------------------------------------- robotics security workshop
def cabinet(name, w, d, h):
    a = Asset(name)
    a.box((0, 0, 0.09), (w, d, 0.18), D, bev=0.015)
    a.box((0, 0, 0.18 + (h - 0.18) / 2), (w - 0.06, d - 0.06, h - 0.18), E, bev=0.025)
    n = max(2, int(w // 1.2))
    pw = (w - 0.3) / n
    for i in range(n):
        cx = -w / 2 + 0.15 + pw * (i + 0.5)
        a.box((cx, -d / 2 + 0.02, 0.18 + (h - 0.7) * 0.5 + 0.45), (pw - 0.12, 0.02, h - 0.9), S, bev=0.01)
        a.box((cx + pw * 0.32, -d / 2 - 0.005, 0.18 + (h - 0.7) * 0.5 + 0.45), (0.04, 0.03, 0.2), B, bev=0)
    for k in range(5):  # louvres high on the front
        a.box((0, -d / 2 + 0.015, h - 0.22 - k * 0.05), (w * 0.55, 0.02, 0.025), D, bev=0)
    a.box((w / 2 - 0.35, -d / 2 - 0.01, 0.9), (0.4, 0.03, 0.3), D, bev=0.01)
    for k in range(3):
        a.box((w / 2 - 0.45 + k * 0.1, -d / 2 - 0.03, 0.9), (0.04, 0.02, 0.04), ST if k != 1 else O, bev=0)
    a.box((-w / 2 + 0.4, -d / 2 - 0.005, 0.3), (0.6, 0.02, 0.12), H, bev=0)
    a.box((0, 0, h + 0.07), (w * 0.5, d * 0.6, 0.14), D, bev=0.02)
    a.cyl((w * 0.28, 0, h + 0.28), 0.12, 0.3, D, seg=10)
    a.box((-w / 2 - 0.02, 0, h * 0.5), (0.05, 0.6, 0.5), D, bev=0.01)
    a.finish(); collider(name, (w, d, h))
cabinet('equip_cabinet_A', 3.6, 2.0, 2.2)
cabinet('equip_cabinet_B', 2.8, 2.4, 3.0)
cabinet('equip_cabinet_C', 3.4, 2.2, 2.5)
cabinet('equip_cabinet_D', 3.0, 2.0, 2.8)

a = Asset('charging_dock')  # alcove for a security robot, 2.0 wide x 1.6 deep x 2.4
a.box((0, 0.7, 1.2), (2.0, 0.2, 2.4), D, bev=0.015)
for sx in (-0.95, 0.95):
    a.box((sx, 0, 1.2), (0.1, 1.6, 2.4), S, bev=0.015)
a.box((0, 0, 2.35), (2.0, 1.6, 0.1), E, bev=0.02).box((0, -0.3, 2.2), (1.7, 0.9, 0.2), D, bev=0.015)
a.box((0, 0, 0.06), (1.8, 1.5, 0.12), D, bev=0.01).box((0, -0.1, 0.14), (1.1, 1.0, 0.05), B, bev=0.005)
for sx in (-0.25, 0.25):
    a.box((sx, 0.55, 0.6), (0.08, 0.1, 0.5), B, bev=0.005)
a.cyl((0, 0.55, 1.3), 0.06, 0.6, R, axis='z', seg=8)
a.box((0.7, 0.58, 1.3), (0.25, 0.06, 0.55), D, bev=0.01).box((0.7, 0.545, 1.4), (0.1, 0.02, 0.1), ST, bev=0).box((0.7, 0.545, 1.2), (0.1, 0.02, 0.1), O, bev=0)
a.box((0, -0.78, 0.02), (1.9, 0.08, 0.03), H, bev=0)
a.finish(); collider('charging_dock', (2.0, 1.6, 2.4))

a = Asset('workstation')  # service workstation with parts drawers, 2.4 x 1.6 x 1.0
a.box((0, 0.0, 0.94), (2.4, 1.2, 0.06), D, bev=0.015)
a.box((-0.9, 0.0, 0.46), (0.6, 1.1, 0.9), E, bev=0.015).box((0.9, 0.0, 0.46), (0.6, 1.1, 0.9), E, bev=0.015)
for k in range(3):
    a.box((-0.9, -0.56, 0.2 + k * 0.28), (0.5, 0.02, 0.22), S, bev=0.01).box((-0.9, -0.58, 0.2 + k * 0.28), (0.2, 0.02, 0.03), B, bev=0)
a.box((0, 0.5, 0.42), (1.2, 0.1, 0.8), S, bev=0.01)
a.cyl((0.0, 0.55, 1.35), 0.035, 0.8, D, seg=8)
a.box((-0.45, 0.5, 1.45), (0.62, 0.05, 0.4), D, bev=0.012).box((-0.45, 0.47, 1.45), (0.54, 0.02, 0.32), SC, bev=0)
a.box((0.45, 0.5, 1.4), (0.5, 0.05, 0.34), D, bev=0.012).box((0.45, 0.47, 1.4), (0.42, 0.02, 0.26), SC, bev=0)
a.box((0, -0.25, 0.985), (0.5, 0.2, 0.02), D, bev=0)
a.box((0.85, -0.2, 1.02), (0.5, 0.4, 0.07), B, bev=0.01)
a.finish(); collider('workstation', (2.4, 1.2, 1.74))

a = Asset('robot_test_cell')  # enclosed assembly and test cell for security robots, 6.0 x 3.0 x 2.4
a.box((0, 0, 0.55), (6.0, 3.0, 1.1), E, bev=0.03)
for k in range(5):
    a.box((-2.4 + k * 1.2, -1.505, 0.55), (1.0, 0.02, 0.8), S, bev=0.01)
a.box((0, 0, 1.15), (6.04, 3.04, 0.1), D, bev=0.02)
for sx in (-2.95, 2.95):
    for sy in (-1.45, 1.45):
        a.box((sx, sy, 1.78), (0.14, 0.14, 1.3), S, bev=0.015)
a.box((0, 0, 2.35), (6.04, 3.04, 0.1), D, bev=0.02)
for sx in (-1.45, 1.45):  # tinted viewing panels in the long face
    a.box((sx, -1.5, 1.8), (2.7, 0.04, 1.0), 'Glass', bev=0)
a.box((0, -1.5, 1.8), (0.1, 0.1, 1.1), S, bev=0.01)
a.box((0, 1.5, 1.75), (5.8, 0.06, 1.1), S, bev=0.01)
a.box((2.1, -1.52, 0.55), (0.6, 0.04, 0.4), D, bev=0.01).box((2.1, -1.545, 0.55), (0.5, 0.01, 0.3), SC, bev=0)
a.box((-0.8, 0.3, 1.45), (0.5, 1.4, 0.2), D, bev=0.02)
a.box((0.0, -1.52, 1.1), (6.0, 0.03, 0.12), H, bev=0)
a.finish(); collider('robot_test_cell', (6.0, 3.0, 2.4))

for nm, L in (('barrier_26', 2.6), ('barrier_22', 2.2)):
    a = Asset(nm)  # steel security barrier, L x 0.9 x 1.1
    a.box((0, 0, 0.45), (L, 0.9, 0.9), S, bev=0.06).box((0, 0, 1.0), (L - 0.1, 0.5, 0.2), E, bev=0.04)
    a.box((0, -0.452, 0.55), (L - 0.3, 0.02, 0.18), H, bev=0)
    a.box((0, 0.452, 0.55), (L - 0.3, 0.02, 0.18), H, bev=0)
    a.box((0, 0, 0.04), (L + 0.04, 0.94, 0.08), D, bev=0.01)
    a.finish(); collider(nm, (L, 0.9, 1.1))

for nm, (w, d, h) in (('crate_A', (1.4, 1.4, 1.4)), ('crate_top', (1.2, 1.0, 1.0)), ('crate_B', (1.6, 0.8, 1.2))):
    a = Asset(nm)  # sealed supply crate: painted steel, corner protectors, lid strap
    a.box((0, 0, h / 2), (w, d, h), S, bev=0.03)
    for sx in (-1, 1):
        for sy in (-1, 1):
            a.box((sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), h / 2), (0.1, 0.1, h + 0.02), D, bev=0.01)
    a.box((0, 0, h - 0.04), (w + 0.02, 0.18, 0.1), D, bev=0.01)
    a.box((0, -d / 2 - 0.005, h * 0.5), (0.34, 0.02, 0.22), O, bev=0)
    a.finish(); collider(nm, (w, d, h))

a = Asset('barrel_explosive')  # 0.84 diameter footprint x 1.05; the game maps the Drum material to its hazard label texture
a.cyl((0, 0, 0.525), 0.4, 1.05, 'Drum', seg=20, bev=0.0)
for z in (0.14, 0.52, 0.92):
    a.torus_ring((0, 0, z), 0.4, 0.014, B, axis='z', seg=20, tube=5)
a.cyl((0, 0, 1.065), 0.34, 0.03, D, seg=16)
a.cyl((0.14, 0.1, 1.09), 0.05, 0.04, B, seg=8)
a.finish(); collider('barrel_explosive', (0.84, 0.84, 1.1))

a = Asset('canister')  # inert grey gas canister 0.8 x 0.8 x 1.0, distinct from the red drums
a.cyl((0, 0, 0.5), 0.36, 1.0, 'Canister', seg=16, bev=0.0)
a.torus_ring((0, 0, 0.9), 0.36, 0.015, D, axis='z', seg=16, tube=5)
a.cyl((0, 0, 1.04), 0.14, 0.12, B, seg=8).box((0, 0, 1.1), (0.22, 0.05, 0.05), D, bev=0)
a.cyl((0, 0, 0.04), 0.4, 0.08, D, seg=16)
a.finish(); collider('canister', (0.8, 0.8, 1.1))

a = Asset('beacon')  # lockdown beacon; the lens is a separate mesh so the game can switch its emission
a.cyl((0, 0, 0.04), 0.16, 0.08, D, seg=12).cyl((0, 0, 0.12), 0.1, 0.08, E, seg=12)
a.finish()
l = Asset('LENS_beacon')
l.cyl((0, 0, 0.26), 0.11, 0.22, 'SafetyOrange', seg=12, r2=0.09)
l.finish()

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_normals=True, export_texcoords=True)
tri = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('KIT', len(bpy.data.objects), 'objects', tri, 'faces')
