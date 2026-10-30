"""Robot bug and sentry drone with separable components and deliberate pivots.
Run: blender -b --python art/build_robots.py -- <out.glb> <out.blend>

Authored in GAME coordinates (x right, y up, -z forward) and converted to Blender (x, -z, y) by g2b(), so the glb exports straight into the game
with the robot facing -Z. Origins of animated parts sit on their joint:
  Bug:   Hip_L0..2 / Hip_R0..2 (hip pivots) -> LegU (origin hip) -> LegL (origin knee);  ClawPivot_L/R -> Claw (origin shoulder).
         Shell, Core, Head are rigid components with origins at their centres.
  Drone: RingPivot (spins) -> Ring;  Shell, Core, Gun (origin at the mount), Thrusters.
Materials are named (RobotBody, RobotPlate, RobotEye, RobotGlow, RobotCore, RobotLens); the game swaps in per-enemy instances so
hit flashes and glows work. Bug and drone keep the old hit spheres, scale and attack points.
"""
import bpy, sys, os, math
from math import pi, sin, cos, atan2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modeling
from modeling import Part, empty
from mathutils import Matrix, Vector

OUT_GLB, OUT_BLEND = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
modeling.PALETTE.update({
    'RobotBody': (0.17, 0.19, 0.22, 0), 'RobotPlate': (0.85, 0.62, 0.10, 0), 'RobotEye': (1.0, 0.16, 0.06, 2.0),
    'RobotGlow': (1.0, 0.63, 0.19, 2.0), 'RobotCore': (1.0, 0.72, 0.28, 2.5), 'RobotLens': (0.5, 0.10, 0.05, 1.5), 'RobotDark': (0.06, 0.065, 0.07, 0),
})
BODY, PLATE, EYE, GLOW, CORE, LENS, DARK = 'RobotBody', 'RobotPlate', 'RobotEye', 'RobotGlow', 'RobotCore', 'RobotLens', 'RobotDark'


def g2b(x, y, z):
    return (x, -z, y)


class RP:
    """A Part authored in game coordinates around a pivot (also game coordinates)."""

    def __init__(self, name, pivot=(0, 0, 0)):
        self.p = Part(name)
        self.pv = pivot

    def loc(self, c):
        return g2b(c[0] - self.pv[0], c[1] - self.pv[1], c[2] - self.pv[2])

    def box(self, c, size, mat, r=0.015, rot=None, **kw):
        self.p.rbox(self.loc(c), (size[0], size[2], size[1]), mat, r=r, rot=rot, **kw)

    def sph(self, c, r, mat, scale=(1, 1, 1), seg=18):
        self.p.sphere(self.loc(c), r, mat, scale=(scale[0], scale[2], scale[1]), seg=seg)

    def cyl(self, c, r, h, mat, axis='y', r2=None, seg=16, bev=0.0):
        self.p.cyl(self.loc(c), r, h, mat, axis={'y': 'z', 'z': 'y', 'x': 'x'}[axis], seg=seg, r2=r2, bev=bev)

    def tube(self, pts, r, mat, seg=8, taper=None):
        self.p.tube([self.loc(p) for p in pts], r, mat, seg=seg, taper=taper)

    def build(self, parent=None, parent_pv=(0, 0, 0)):
        rel = (self.pv[0] - parent_pv[0], self.pv[1] - parent_pv[1], self.pv[2] - parent_pv[2])
        return self.p.build(parent=parent, loc=g2b(*rel))


def node(name, pv, parent=None, parent_pv=(0, 0, 0)):
    rel = (pv[0] - parent_pv[0], pv[1] - parent_pv[1], pv[2] - parent_pv[2])
    return empty(name, g2b(*rel), parent)


# =============================================================================================== BUG
bug = empty('Bug')

shell = RP('Bug_Shell', (0, 0.38, 0.05))
shell.sph((0, 0.36, 0.26), 1.0, BODY, scale=(0.30, 0.24, 0.42), seg=22)                 # abdomen carapace
shell.sph((0, 0.38, -0.08), 1.0, BODY, scale=(0.20, 0.16, 0.22), seg=20)                 # thorax carapace
shell.box((0, 0.495, 0.26), (0.30, 0.04, 0.36), PLATE, r=0.016)                         # warning plate
for i, z in enumerate((0.12, 0.26, 0.40)):                                               # segment ribs
    shell.box((0, 0.462, z), (0.34, 0.02, 0.025), DARK, r=0.008)
shell.box((0, 0.512, 0.15), (0.06, 0.012, 0.2), GLOW, r=0.004)                           # vent over the reactor
for s in (-1, 1):
    shell.box((s * 0.285, 0.34, 0.26), (0.035, 0.1, 0.22), DARK, r=0.01)                 # side vents
    shell.box((s * 0.15, 0.3, -0.08), (0.05, 0.04, 0.10), PLATE, r=0.012)               # collar plates
shell.cyl((0, 0.34, 0.66), 0.055, 0.06, DARK, axis='z', r2=0.04)                         # exhaust
shell.build(bug)

core = RP('Bug_Core', (0, 0.36, 0.22))
core.sph((0, 0.36, 0.22), 0.082, CORE, seg=16)
core.cyl((0, 0.36, 0.22), 0.105, 0.05, DARK, axis='y', seg=18)
core.build(bug)

head = RP('Bug_Head', (0, 0.34, -0.3))
head.sph((0, 0.34, -0.3), 1.0, BODY, scale=(0.14, 0.12, 0.15), seg=18)
for s in (-1, 1):
    head.sph((s * 0.07, 0.38, -0.42), 0.045, EYE, seg=12)
    head.tube([(s * 0.04, 0.29, -0.4), (s * 0.07, 0.24, -0.5), (s * 0.1, 0.19, -0.53)], 0.012, BODY, seg=6)   # mandible
    head.tube([(s * 0.05, 0.44, -0.34), (s * 0.09, 0.56, -0.42), (s * 0.13, 0.66, -0.52)], 0.007, BODY, seg=5)  # antenna
head.box((0, 0.46, -0.28), (0.12, 0.04, 0.1), PLATE, r=0.01)
head.sph((0, 0.3, -0.43), 0.03, EYE, seg=10)
head.build(bug)

for s, side in ((-1, 'L'), (1, 'R')):
    pv = (s * 0.13, 0.38, -0.2)
    piv = node('ClawPivot_' + side, pv, bug)
    cl = RP('Claw_' + side, pv)
    cl.sph(pv, 0.05, BODY, seg=12)                                                       # shoulder joint
    cl.tube([(pv[0], pv[1], pv[2]), (pv[0], pv[1] + 0.18, pv[2]), (pv[0], pv[1] + 0.34, pv[2] - 0.015)], 0.026, BODY, seg=8, taper=lambda t: 1.0 - 0.55 * t)
    cl.box((pv[0], pv[1] + 0.14, pv[2]), (0.07, 0.07, 0.05), PLATE, r=0.012)             # forearm plate
    cl.cyl((pv[0], pv[1] + 0.40, pv[2] - 0.018), 0.032, 0.12, EYE, axis='y', r2=0.002, seg=8)  # tip
    cl.build(piv, pv)

for s, side in ((-1, 'L'), (1, 'R')):
    for i, z in enumerate((-0.14, 0.06, 0.26)):
        hp = (s * 0.17, 0.34, z)
        hip = node('Hip_%s%d' % (side, i), hp, bug)
        dz = (-0.14, 0.0, 0.14)[i]
        knee = (hp[0] + s * 0.21, hp[1] + 0.09, hp[2] + dz * 0.6)
        foot = (knee[0] + s * 0.17, -0.02, knee[2] + dz * 0.8)
        up = RP('LegU', hp)
        up.sph(hp, 0.038, PLATE, seg=10)                                                  # hip joint
        up.tube([hp, (hp[0] + s * 0.1, hp[1] + 0.07, hp[2] + dz * 0.3), knee], 0.02, BODY, seg=8)
        upo = up.build(hip, hp)
        lo = RP('LegL', knee)
        lo.sph(knee, 0.03, PLATE, seg=10)                                                 # knee joint
        lo.tube([knee, (knee[0] + s * 0.08, knee[1] - 0.2, knee[2] + dz * 0.4), foot], 0.016, BODY, seg=8, taper=lambda t: 1.0 - 0.55 * t)
        lo.cyl((foot[0], foot[1] + 0.01, foot[2]), 0.016, 0.04, DARK, axis='y', r2=0.006, seg=8)   # foot
        lo.build(upo, hp)

# =============================================================================================== DRONE
drone = empty('Drone')

dshell = RP('Drone_Shell', (0, 0, 0))
dshell.sph((0, 0, 0), 0.34, BODY, scale=(1, 0.85, 1), seg=28)
dshell.cyl((0, 0, 0), 0.345, 0.035, PLATE, axis='y', seg=28)                             # equator seam band
for z in (-0.02, 0.1):
    dshell.box((0, 0.285, z), (0.22, 0.014, 0.03), GLOW, r=0.004)                        # vents that show the core
dshell.box((0, -0.28, 0.05), (0.3, 0.04, 0.3), DARK, r=0.015)
for s in (-1, 1):
    dshell.box((s * 0.27, -0.12, 0.12), (0.04, 0.3, 0.26), BODY, r=0.01, rot=Matrix.Rotation(-s * 0.4, 4, 'Y'))   # fins
dshell.tube([(0.1, 0.3, 0.1), (0.1, 0.5, 0.1), (0.1, 0.66, 0.1)], 0.01, BODY, seg=5)
dshell.sph((0.1, 0.67, 0.1), 0.03, EYE, seg=8)
dshell.build(drone)

dcore = RP('Drone_Core', (0, 0, 0.02))
dcore.sph((0, 0, 0.02), 0.13, CORE, seg=16)
dcore.cyl((0, 0, 0.02), 0.17, 0.04, DARK, axis='y', seg=18)
dcore.build(drone)

ringpiv = node('RingPivot', (0, 0, 0), drone)
ring = RP('Drone_Ring', (0, 0, 0))
pts = [(cos(a / 28 * 2 * pi) * 0.52, 0, sin(a / 28 * 2 * pi) * 0.52) for a in range(-2, 31)]
ring.tube(pts, 0.05, PLATE, seg=8)
for i in range(4):
    a = i * pi / 2
    ring.box((cos(a) * 0.43, 0, sin(a) * 0.43), (0.2, 0.05, 0.05), BODY, r=0.01, rot=Matrix.Rotation(atan2(-sin(a), cos(a)), 4, 'Z'))
    ring.sph((cos(a) * 0.52, 0, sin(a) * 0.52), 0.045, GLOW, seg=10)
ring.build(ringpiv)

gun_pv = (0, 0, -0.2)
gun = RP('Drone_Gun', gun_pv)
gun.cyl((0, 0, -0.32), 0.2, 0.2, BODY, axis='z', r2=0.17, seg=24)                        # housing
gun.cyl((0, 0, -0.42), 0.13, 0.08, DARK, axis='z', seg=20)                               # barrel shroud
gun.cyl((0, 0, -0.455), 0.115, 0.02, LENS, axis='z', seg=24)                             # emitter lens
for z in (-0.25, -0.38):
    gun.cyl((0, 0, z), 0.215 if z == -0.25 else 0.18, 0.02, PLATE, axis='z', seg=24)    # trim rings
gun.box((0, 0.2, -0.3), (0.12, 0.07, 0.1), DARK, r=0.015)                                # sensor pod
for s in (-1, 1):
    gun.sph((s * 0.03, 0.2, -0.355), 0.02, EYE, seg=8)
    gun.box((s * 0.145, 0, -0.36), (0.04, 0.06, 0.2), DARK, r=0.01)                      # side emitter rails
gun.build(drone, (0, 0, 0))

thr = RP('Drone_Thrusters', (0, -0.34, 0.05))
for i in range(3):
    a = i * 2.09
    c = (cos(a) * 0.2, -0.31, sin(a) * 0.2 + 0.05)
    thr.cyl(c, 0.08, 0.1, DARK, axis='y', seg=12)
    thr.cyl((c[0], -0.4, c[2]), 0.07, 0.14, GLOW, axis='y', r2=0.012, seg=10)
thr.build(drone)

# ---------------------------------------------------------------------------------------------- export
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_yup=True, export_materials='EXPORT', export_normals=True, export_texcoords=True)
print('ROBOTS', len([o for o in bpy.data.objects if o.type == 'MESH']), 'meshes', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'), 'faces EXPORTED', OUT_GLB)
