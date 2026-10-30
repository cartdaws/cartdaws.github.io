"""The homeworld set: unfamiliar flora, rock, and another member of the player's species.
Run: blender -b --python art/build_home.py -- <out.glb> <out.blend>

Assets (Blender z-up; exports y-up, front = -Z):
  Spire        tall curved living tower with a slender glowing tip ("SpireTip" is a separate mesh so the game can light it)
  Stalk        thin luminous stalk with a bulb ("StalkBulb"); scattered in clumps
  Rock         low weathered boulder (noise-displaced, flat-bottomed)
  Elder_Body   the other alien: ridged translucent column, crest, six fine skirt tendrils. Origin at the floor.
  Elder_Arm    shoulder-to-hand limb with the same four-digit hand as the player. Origin at the shoulder, reaches along -Z.
Materials are named (Gel, GelCore, Moss, Rock, Glow); the game substitutes its own gel shader for Gel and GelCore.
"""
import bpy, bmesh, sys, os, math, random
from math import pi, sin, cos
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modeling
from modeling import Part
from mathutils import Vector, Matrix

OUT_GLB, OUT_BLEND = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(7)
modeling.PALETTE.update({'Moss': (0.08, 0.3, 0.28, 0), 'Rock': (0.14, 0.17, 0.2, 0), 'Glow': (0.6, 1.0, 0.9, 2.0)})

# ---------------------------------------------------------------- Spire
p = Part('Spire')
pts = [(0, 0, 0), (0.06, 0.02, 1.2), (-0.05, 0.1, 2.6), (0.08, 0.05, 4.0), (0.02, -0.04, 5.2)]
p.tube(pts, lambda t: 0.34 * (1 - t) ** 1.3 + 0.03 + 0.012 * sin(t * 40), 'Moss', seg=10, samples=60)
spire = p.build()
tip = Part('SpireTip')
tip.sphere((0.02, -0.04, 5.2), 0.09, 'Glow', scale=(1, 1, 1.5), seg=12)
tip.build()

# ---------------------------------------------------------------- Stalk
s = Part('Stalk')
s.tube([(0, 0, 0), (0.05, 0.02, 0.35), (0.02, 0.06, 0.7), (-0.04, 0.05, 0.95)], lambda t: 0.018 * (1 - t * 0.6), 'Moss', seg=6, samples=20)
s.build()
b = Part('StalkBulb')
b.sphere((-0.04, 0.05, 1.0), 0.055, 'Glow', scale=(1, 1, 1.1), seg=10)
b.build()

# ---------------------------------------------------------------- Rock
bm = bmesh.new()
res = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.5)
for v in bm.verts:
    n = (sin(v.co.x * 9 + 1.3) + sin(v.co.y * 7 + 0.4) + sin(v.co.z * 11)) * 0.045
    v.co *= (1 + n)
    v.co.x *= 1.3; v.co.z = max(v.co.z * 0.7, -0.12)
for f in bm.faces:
    f.smooth = True
me = bpy.data.meshes.new('Rock'); bm.to_mesh(me); me.materials.append(modeling.get_mat('Rock'))
bpy.context.collection.objects.link(bpy.data.objects.new('Rock', me))

# ---------------------------------------------------------------- Elder
H = 2.3
body = Part('Elder_Body')
prof = [(0.0, 0.85), (0.30, 0.85), (0.36, 1.05), (0.34, 1.5), (0.27, 1.95), (0.17, 2.25), (0.09, 2.4), (0.0, 2.44)]
body.lathe((0, 0, 0), prof, 'Gel', seg=28)
for i in range(8):                                   # ridged bands
    z = 1.0 + i * 0.16
    r = 0.355 - i * 0.012
    body.cyl((0, 0, z), r, 0.018, 'Gel', axis='z', seg=28)
body.sphere((0, 0, 2.42), 0.1, 'GelCore', scale=(1, 1, 1.3), seg=14)             # crest
for a in (0.0, 2.1, 4.2):                                                         # three short crest fronds
    body.tube([(0, 0, 2.44), (cos(a) * 0.07, sin(a) * 0.07, 2.6), (cos(a) * 0.15, sin(a) * 0.15, 2.7)], lambda t: 0.014 * (1 - t * 0.7), 'GelCore', seg=6, samples=10)
body.sphere((0, 0, 1.55), 0.12, 'GelCore', seg=12)                                # chest nucleus
for i in range(6):                                                                # skirt tendrils
    a = i / 6 * 2 * pi + 0.3
    body.tube([(cos(a) * 0.2, sin(a) * 0.2, 0.9), (cos(a) * 0.42, sin(a) * 0.42, 0.55), (cos(a) * 0.62, sin(a) * 0.62, 0.05)], lambda t: 0.04 * (1 - t * 0.8) + 0.008, 'Gel', seg=8, samples=16)
body.build()

arm_root = (-0.0, 0.0, 1.78)
arm = Part('Elder_Arm')
# shoulder (origin) to wrist along +Y (exports to -Z); a slight elbow droop
arm.sphere((0, 0, 0), 0.085, 'Gel', seg=12)
arm.tube([(0, 0, 0), (0.0, 0.3, -0.06), (0.0, 0.62, -0.02), (0.0, 0.9, 0.04)], lambda t: 0.07 - 0.032 * t, 'Gel', seg=10, samples=20)
arm.tube([(0, 0.05, 0), (0, 0.5, -0.03), (0, 0.9, 0.04)], 0.014, 'GelCore', seg=6, samples=14)    # nerve cord
arm.sphere((0, 0.93, 0.04), 0.05, 'Gel', seg=10)                                                    # palm
for k, ang in enumerate((pi * 0.25, pi * 0.75, pi * 1.25, pi * 1.75)):                             # four digits, radial
    dx, dz = cos(ang), sin(ang)
    L = 0.19 - 0.02 * (k // 2)
    arm.tube([(dx * 0.03, 0.95, 0.04 + dz * 0.03), (dx * 0.07, 1.04, 0.04 + dz * 0.07), (dx * 0.08, 1.04 + L, 0.04 + dz * 0.08)], lambda t: 0.017 * (1 - t * 0.6), 'Gel', seg=7, samples=12)
    arm.sphere((dx * 0.08, 1.04 + L, 0.04 + dz * 0.08), 0.014, 'GelCore', seg=6)
arm.build(loc=arm_root)

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_yup=True, export_materials='EXPORT', export_normals=True)
print('HOME', [o.name for o in bpy.data.objects], 'EXPORTED', OUT_GLB)
