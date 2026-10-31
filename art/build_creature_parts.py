"""Sensory and surface-feature modules for the creature creator: eyes, feelers, crests and fins.
Run: blender -b --python art/build_creature_parts.py -- <out.glb> <out.blend>

Frame (Blender): Z up, +Y forward. Every part has its origin at the point where it joins the body and points along +Z (feelers, crest) or +X
(fins, mirrored by the game for the other side), so the game can seat it on the sampled body surface and orient it by the surface normal.
  Eye (iris dome) + Pupil (slit): two materials the game recolours.   Feeler: tapered tube with shape keys Curl and Sway.
  CrestRidge: a soft blade along the crown.   CrestFan: five soft petals.   Fin: a soft flat fin with shape key Flap.
All are small smooth-shaded meshes sharing the creature's gel shader in the game.
"""
import bpy, bmesh, sys, math
from math import pi, sin, cos
from mathutils import Vector, Matrix

OUT_GLB, OUT_BLEND = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)

gel = bpy.data.materials.new('Gel'); gel.use_nodes = True
iris = bpy.data.materials.new('EyeIris'); iris.use_nodes = True
pupil = bpy.data.materials.new('EyePupil'); pupil.use_nodes = True
pupil.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0, 0, 0, 1)


def link(me, name, mat):
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def blob(bm, c, r, seg=14, rings=8):
    res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in res['verts']:
        v.co = Vector((c[0] + v.co.x * r[0], c[1] + v.co.y * r[1], c[2] + v.co.z * r[2]))
    return res['verts']


# ---- Eye: iris dome seated on the surface (normal = +Y in Blender), with a slit pupil
bm = bmesh.new()
verts = blob(bm, (0, 0.0, 0), (0.03, 0.017, 0.03), 18, 10)
me = bpy.data.meshes.new('Eye'); bm.to_mesh(me); bm.free()
eye = link(me, 'Eye', iris)
bm = bmesh.new()
blob(bm, (0, 0.0145, 0), (0.0075, 0.007, 0.021), 12, 8)
me = bpy.data.meshes.new('Pupil'); bm.to_mesh(me); bm.free()
pup = link(me, 'Pupil', pupil)


# ---- lofted tube helper along a point list (+Z axis), radius function of s
def tube(name, pts, rad, seg=8, mat=gel):
    bm = bmesh.new()
    rows = []
    for i, p in enumerate(pts):
        tan = (pts[min(len(pts) - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        up = Vector((1, 0, 0)) if abs(tan.x) < 0.9 else Vector((0, 1, 0))
        nx = tan.cross(up).normalized(); ny = nx.cross(tan).normalized()
        r = rad(i / (len(pts) - 1))
        rows.append([bm.verts.new(p + (nx * cos(2 * pi * j / seg) + ny * sin(2 * pi * j / seg)) * r) for j in range(seg)])
    for i in range(len(rows) - 1):
        for j in range(seg):
            bm.faces.new((rows[i][j], rows[i][(j + 1) % seg], rows[i + 1][(j + 1) % seg], rows[i + 1][j]))
    tip = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * rad(1.0) * 1.2)
    for j in range(seg):
        bm.faces.new((rows[-1][j], rows[-1][(j + 1) % seg], tip))
    base = bm.verts.new(pts[0] - (pts[1] - pts[0]).normalized() * 0.01)
    for j in range(seg):
        bm.faces.new((rows[0][(j + 1) % seg], rows[0][j], base))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return link(me, name, mat)


def feeler_pts(curl=0.0, sway=0.0):
    pts = []
    N = 12
    for i in range(N):
        s = i / (N - 1)
        pts.append(Vector((sway * 0.1 * s * s, (0.03 + 0.16 * curl) * s * s + 0.02 * s, 0.30 * s - 0.08 * curl * s * s)))
    return pts


feeler = tube('Feeler', feeler_pts(), lambda s: 0.0125 * (1 - s) ** 1.1 + 0.0025)
feeler.shape_key_add(name='Basis', from_mix=False)
for key, kw in (('Curl', dict(curl=1.0)), ('Sway', dict(sway=1.0))):
    sk = feeler.shape_key_add(name=key, from_mix=False)
    # same topology: recompute positions from the same parametrisation
    pts = feeler_pts(**kw)
    N, seg = 12, 8
    idx = 0
    for i, p in enumerate(pts):
        tan = (pts[min(N - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        up = Vector((1, 0, 0)) if abs(tan.x) < 0.9 else Vector((0, 1, 0))
        nx = tan.cross(up).normalized(); ny = nx.cross(tan).normalized()
        r = 0.0125 * (1 - i / (N - 1)) ** 1.1 + 0.0025
        for j in range(seg):
            sk.data[idx].co = p + (nx * cos(2 * pi * j / seg) + ny * sin(2 * pi * j / seg)) * r
            idx += 1
    sk.data[idx].co = pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.0025 * 1.2
    sk.data[idx + 1].co = pts[0] - (pts[1] - pts[0]).normalized() * 0.01
    sk.value = 0
    sk.slider_min, sk.slider_max = -1, 1

# ---- Crest ridge: a soft blade along the crown (length along Y), rooted at the origin
bm = bmesh.new()
for k in range(5):
    s = k / 4
    blob(bm, (0, (s - 0.5) * 0.17, 0.03 * sin(pi * s) + 0.01), (0.011, 0.045, 0.03 + 0.05 * sin(pi * s) ** 0.8), 10, 6)
me = bpy.data.meshes.new('CrestRidge'); bm.to_mesh(me); bm.free()
ridge = link(me, 'CrestRidge', gel)

# ---- Crest fan: five soft petals fanning in the YZ plane
bm = bmesh.new()
for k in range(5):
    a = (k - 2) * 0.42
    c = Vector((0, sin(a) * 0.05, cos(a) * 0.05 + 0.01))
    vs = blob(bm, (0, 0, 0), (0.008, 0.016, 0.07), 10, 6)
    M = Matrix.Translation(c + Vector((0, sin(a) * 0.04, cos(a) * 0.04))) @ Matrix.Rotation(-a, 4, 'X')
    bmesh.ops.transform(bm, matrix=M, verts=vs)
me = bpy.data.meshes.new('CrestFan'); bm.to_mesh(me); bm.free()
fan = link(me, 'CrestFan', gel)

# ---- Fin: a soft flat fin extending along +X from the body, key Flap bends its tip
bm = bmesh.new()
rows = []
NU, NV = 8, 6
for i in range(NU):
    u = i / (NU - 1)
    row = []
    for j in range(NV):
        v = j / (NV - 1) * 2 - 1
        w = (1 - u * 0.75) * 0.075 * (1 - v * v) ** 0.7
        row.append(bm.verts.new((u * 0.12, -0.02 + v * 0.05 * (1 - 0.3 * u), w * 0.0 + 0.012 * sin(pi * u) * (1 - v * v))))
    rows.append(row)
for i in range(NU - 1):
    for j in range(NV - 1):
        bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
solid = bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.008)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new('Fin'); bm.to_mesh(me); bm.free()
fin = link(me, 'Fin', gel)
fin.shape_key_add(name='Basis', from_mix=False)
sk = fin.shape_key_add(name='Flap', from_mix=False)
for i, v in enumerate(fin.data.vertices):
    k = max(0.0, v.co.x / 0.12)
    sk.data[i].co = Vector((v.co.x, v.co.y, v.co.z + 0.06 * k * k)) + Vector((0, 0, 0))
sk.value = 0; sk.slider_min, sk.slider_max = -1, 1

for ob in (eye, pup, feeler, ridge, fan, fin):
    ob.select_set(False)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_yup=True, export_materials='EXPORT',
                          export_normals=True, export_texcoords=True, export_morph=True, export_morph_normal=True)
print('PARTS', [o.name for o in bpy.data.objects], 'EXPORTED', OUT_GLB)
