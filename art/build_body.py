"""The player's own body, seen when looking down: a compact ridged gel bell with a soft crest and a glowing core.
Run: blender -b --python art/build_body.py -- <out.glb> <out.blend>

"BodyBell": one continuous surface (lathe with 10 shallow ribs and a flared skirt), origin at the base centre, 0.5 m tall, 0.42 m wide.
"BodyCore": the luminous organ inside, origin at its centre. The six legs are procedural in the game (they have to step on the world).
"""
import bpy, bmesh, sys, math
from math import pi, sin, cos
from mathutils import Vector

OUT_GLB, OUT_BLEND = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)

gel = bpy.data.materials.new('Gel')
gel.use_nodes = True
b = gel.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.06, 0.42, 0.38, 1)
b.inputs['Roughness'].default_value = 0.25
core_m = bpy.data.materials.new('GelCore')
core_m.use_nodes = True
core_m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.5, 1.0, 0.9, 1)

H, RIB, SEGS, RINGS = 0.5, 10, 40, 36


def profile(t):
    """Radius at height fraction t (0 base .. 1 crown): flared skirt, full shoulder, rounded crown with a small crest."""
    skirt = 0.21 + 0.03 * math.exp(-t * 12)
    dome = math.sqrt(max(0.0, 1 - ((t - 0.35) / 0.65) ** 2)) if t > 0.35 else 1.0
    r = skirt * (0.55 + 0.45 * dome) * (1 - 0.05 * math.sin(t * 5))
    crest = 0.012 * math.exp(-((t - 0.97) / 0.03) ** 2)
    return max(0.004, r + crest) if t < 0.999 else 0.004


bm = bmesh.new()
rows = []
for r in range(RINGS + 1):
    t = r / RINGS
    rad = profile(t)
    rib = 0.028 * (1 - t ** 3)                                      # ribs fade toward the crown
    row = []
    for k in range(SEGS):
        a = k / SEGS * 2 * pi
        rr = rad * (1 + rib * cos(a * RIB))
        row.append(bm.verts.new((cos(a) * rr, sin(a) * rr, t * H)))
    rows.append(row)
for r in range(RINGS):
    for k in range(SEGS):
        k2 = (k + 1) % SEGS
        bm.faces.new((rows[r][k], rows[r][k2], rows[r + 1][k2], rows[r + 1][k]))
top = bm.verts.new((0, 0, H + 0.004))
for k in range(SEGS):
    bm.faces.new((rows[-1][k], rows[-1][(k + 1) % SEGS], top))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
for f in bm.faces:
    f.smooth = True
me = bpy.data.meshes.new('BodyBell'); bm.to_mesh(me); me.materials.append(gel)
bell = bpy.data.objects.new('BodyBell', me); bpy.context.collection.objects.link(bell)

bm2 = bmesh.new()
res = bmesh.ops.create_uvsphere(bm2, u_segments=20, v_segments=12, radius=0.07)
for f in bm2.faces:
    f.smooth = True
me2 = bpy.data.meshes.new('BodyCore'); bm2.to_mesh(me2); me2.materials.append(core_m)
core = bpy.data.objects.new('BodyCore', me2); bpy.context.collection.objects.link(core)

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_yup=True, export_materials='EXPORT', export_normals=True)
print('BODY faces', len(me.polygons), 'EXPORTED', OUT_GLB)
