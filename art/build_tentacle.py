"""Alien absorption tentacle: one continuous tapered gel mesh skinned to a 12-bone chain, plus the collar that blends it into the forearm.
Run: blender -b --python art/build_tentacle.py -- <out.glb> <out.blend>

Conventions (also used by src/presentation/tentacles.js):
  * Rig "TentRig": bones T00 (root) .. T11 (tip), straight along +Y in Blender (exports to -Z), 0.1 m apart.
    The game drives the bones in world space, so only each bone's rest position and the chain direction matter.
  * "Tentacle": one skinned mesh, radius tapers from the flared root to a fine tip, weights blend linearly between neighbouring bones,
    so stretching the chain stretches the surface evenly.
  * "Collar": the swelling where the tentacle leaves the forearm. Same Gel material; its +Y axis is the tentacle's outward direction.
  * Actions: "Idle" (slow restrained sway, loops) and "Coil" (relaxed curl) are exported for reuse.
"""
import bpy, bmesh, sys, math
from math import pi, sin, cos
from mathutils import Vector, Matrix

OUT_GLB, OUT_BLEND = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)

NB, SEG = 12, 0.1                      # bones, bone spacing (m)
RINGS_PER, RADIAL = 6, 14


def radius(t):                          # t 0 root .. 1 tip
    flare = 0.011 * math.exp(-t * 13)  # the swelling at the root, blends into the collar
    return 0.0045 + 0.0105 * (1 - t) ** 1.3 + flare + 0.0012 * sin(t * 18) * (1 - t)


gel = bpy.data.materials.new('Gel')
gel.use_nodes = True
b = gel.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.06, 0.42, 0.38, 1)
b.inputs['Roughness'].default_value = 0.25

# ---- armature
arm_data = bpy.data.armatures.new('TentRig')
rig = bpy.data.objects.new('TentRig', arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for i in range(NB):
    eb = arm_data.edit_bones.new('T%02d' % i)
    eb.head = (0, i * SEG, 0)
    eb.tail = (0, (i + 1) * SEG, 0)
    eb.roll = 0
    if i:
        eb.parent = arm_data.edit_bones['T%02d' % (i - 1)]
        eb.use_connect = True
bpy.ops.object.mode_set(mode='OBJECT')

# ---- skinned mesh
bm = bmesh.new()
total = NB * SEG
rows = []
n_rows = (NB * RINGS_PER) + 1
for r in range(n_rows):
    t = r / (n_rows - 1)
    y = t * total
    rad = radius(t)
    row = []
    for k in range(RADIAL):
        a = k / RADIAL * 2 * pi
        row.append(bm.verts.new((cos(a) * rad, y, sin(a) * rad)))
    rows.append(row)
for r in range(n_rows - 1):
    for k in range(RADIAL):
        k2 = (k + 1) % RADIAL
        bm.faces.new((rows[r][k], rows[r][k2], rows[r + 1][k2], rows[r + 1][k]))
cap0 = bm.verts.new((0, -0.004, 0)); cap1 = bm.verts.new((0, total + 0.012, 0))
for k in range(RADIAL):
    k2 = (k + 1) % RADIAL
    bm.faces.new((rows[0][k2], rows[0][k], cap0))
    bm.faces.new((rows[-1][k], rows[-1][k2], cap1))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
for f in bm.faces:
    f.smooth = True
me = bpy.data.meshes.new('Tentacle')
bm.to_mesh(me)
me.materials.append(gel)
ob = bpy.data.objects.new('Tentacle', me)
bpy.context.collection.objects.link(ob)
for i in range(NB):
    ob.vertex_groups.new(name='T%02d' % i)
for v in me.vertices:
    u = max(0.0, min(NB - 1e-4, v.co.y / SEG))          # position in bone units
    i = int(u); f = u - i
    if i == 0 and f < 0:
        f = 0
    # head of bone i is at i*SEG: blend (i-th bone to the next) over the span between joints
    if i + 1 < NB:
        ob.vertex_groups['T%02d' % i].add([v.index], 1 - f, 'REPLACE')
        ob.vertex_groups['T%02d' % (i + 1)].add([v.index], f, 'REPLACE')
    else:
        ob.vertex_groups['T%02d' % i].add([v.index], 1.0, 'REPLACE')
mod = ob.modifiers.new('Armature', 'ARMATURE')
mod.object = rig
ob.parent = rig

# ---- collar: a flattened swelling, +Y outward
bm2 = bmesh.new()
res = bmesh.ops.create_uvsphere(bm2, u_segments=24, v_segments=12, radius=1.0)
for v in res['verts']:
    x, y, z = v.co
    # y axis outward: squash into a dome that is mostly embedded in the forearm
    v.co = Vector((x * 0.04, (y * 0.5 + 0.2) * 0.04 if y > -0.2 else -0.015, z * 0.04))
bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces)
for f in bm2.faces:
    f.smooth = True
me2 = bpy.data.meshes.new('Collar')
bm2.to_mesh(me2)
me2.materials.append(gel)
collar = bpy.data.objects.new('Collar', me2)
bpy.context.collection.objects.link(collar)

# ---- reusable actions on the rig
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
for pb in rig.pose.bones:
    pb.rotation_mode = 'XYZ'


def make_action(name, frames, fn):
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    for fr in frames:
        for i, pb in enumerate(rig.pose.bones):
            pb.rotation_euler = fn(i, fr)
            pb.keyframe_insert('rotation_euler', frame=fr)
    return act


idle = make_action('Idle', [1, 31, 61, 91, 121], lambda i, f: (0.05 * sin(f / 120 * 2 * pi + i * 0.5) * (i / NB + 0.3), 0, 0.07 * sin(f / 120 * 2 * pi + i * 0.4 + 1.2) * (i / NB + 0.3)))
coil = make_action('Coil', [1, 20], lambda i, f: (0.0, 0.0, 0.0) if f == 1 else (0.0, 0.22 * (i / NB), 0.30))
bpy.ops.object.mode_set(mode='OBJECT')
rig.animation_data.action = idle
for a in (idle, coil):
    a.use_fake_user = True
# push both actions to NLA tracks so the exporter keeps them
for a in (idle, coil):
    tr = rig.animation_data.nla_tracks.new()
    tr.name = a.name
    tr.strips.new(a.name, 1, a)
rig.animation_data.action = None

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_yup=True, export_materials='EXPORT',
                          export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_normals=True)
print('TENTACLE bones', [b.name for b in arm_data.bones][:3], '...', NB, 'verts', len(me.vertices), 'EXPORTED', OUT_GLB)
