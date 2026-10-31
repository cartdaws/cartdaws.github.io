"""Alien feeding appendages. Two skinned meshes, each on its own 12-bone chain, plus the collar that blends them into the forearm.
Run: blender -b --python art/build_tentacle.py -- <out.glb> <out.blend>

  * "Tentacle" (rig TentRig, bones T00..T11): the thicker gel limb used for the pistol grab in the intro.
  * "Proboscis" (rig ProbRig, bones P00..P11): a thin, long feeding tongue with ridged segments and a flared, sponge-like tip (the labellum).
    Six of them sit around the left forearm, coiled tight when idle, and uncoil to probe, dissolve and drink the robot.
  * "Collar": the swelling where an appendage leaves the forearm. +Y is the outward direction.
Conventions: chain straight along +Y in Blender (exports to -Z), 0.1 m between bones; the game drives bones in world space, so only the rest
positions and chain direction matter. Weights blend linearly between neighbouring bones, so stretching the chain stretches the surface evenly.
Actions "Idle" and "Coil" are exported on the Tentacle rig for reuse.
"""
import bpy, bmesh, sys, math
from math import pi, sin, cos
from mathutils import Vector, Matrix

OUT_GLB, OUT_BLEND = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)

NB, SEG = 12, 0.1
RINGS_PER, RADIAL = 6, 14


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def radius_tentacle(t):
    flare = 0.011 * math.exp(-t * 13)
    return 0.0045 + 0.0105 * (1 - t) ** 1.3 + flare + 0.0012 * sin(t * 18) * (1 - t)


def radius_proboscis(t):
    flare = 0.006 * math.exp(-t * 14)
    body = 0.0028 + 0.0042 * (1 - t) ** 1.2
    rings = 0.0006 * sin(t * 150) * (1 - 0.6 * t)                 # the segmented, ridged look of a proboscis
    pad = 0.0085 * smooth(0.90, 0.955, t) * (1 - smooth(0.985, 1.0, t))      # the sponge-like labellum at the tip
    pad_ridges = 0.0012 * sin(t * 900) * smooth(0.93, 0.96, t)
    return body + flare + rings + pad + pad_ridges


def radius_proboscis_smooth(t):
    """The same feeding tongue with smooth skin: no segment rings, no ridges on the pad."""
    flare = 0.006 * math.exp(-t * 14)
    body = 0.0028 + 0.0042 * (1 - t) ** 1.2
    pad = 0.0085 * smooth(0.90, 0.955, t) * (1 - smooth(0.985, 1.0, t))
    return body + flare + pad


gel = bpy.data.materials.new('Gel')
gel.use_nodes = True
b = gel.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.06, 0.42, 0.38, 1)
b.inputs['Roughness'].default_value = 0.25


def make_rig(rig_name, bone_prefix):
    arm_data = bpy.data.armatures.new(rig_name)
    rig = bpy.data.objects.new(rig_name, arm_data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for i in range(NB):
        eb = arm_data.edit_bones.new('%s%02d' % (bone_prefix, i))
        eb.head = (0, i * SEG, 0)
        eb.tail = (0, (i + 1) * SEG, 0)
        eb.roll = 0
        if i:
            eb.parent = arm_data.edit_bones['%s%02d' % (bone_prefix, i - 1)]
            eb.use_connect = True
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def make_mesh(name, rig, bone_prefix, radius):
    bm = bmesh.new()
    total = NB * SEG
    rows = []
    n_rows = (NB * RINGS_PER) + 1 if name == 'Tentacle' else (NB * 12) + 1
    for r in range(n_rows):
        t = r / (n_rows - 1)
        rad = radius(t)
        rows.append([bm.verts.new((cos(k / RADIAL * 2 * pi) * rad, t * total, sin(k / RADIAL * 2 * pi) * rad)) for k in range(RADIAL)])
    for r in range(n_rows - 1):
        for k in range(RADIAL):
            k2 = (k + 1) % RADIAL
            bm.faces.new((rows[r][k], rows[r][k2], rows[r + 1][k2], rows[r + 1][k]))
    cap0 = bm.verts.new((0, -0.004, 0)); cap1 = bm.verts.new((0, total + 0.006, 0))
    for k in range(RADIAL):
        k2 = (k + 1) % RADIAL
        bm.faces.new((rows[0][k2], rows[0][k], cap0))
        bm.faces.new((rows[-1][k], rows[-1][k2], cap1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    me.materials.append(gel)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    for i in range(NB):
        ob.vertex_groups.new(name='%s%02d' % (bone_prefix, i))
    for v in me.vertices:
        u = max(0.0, min(NB - 1e-4, v.co.y / SEG))
        i = int(u); f = u - i
        if i + 1 < NB:
            ob.vertex_groups['%s%02d' % (bone_prefix, i)].add([v.index], 1 - f, 'REPLACE')
            ob.vertex_groups['%s%02d' % (bone_prefix, i + 1)].add([v.index], f, 'REPLACE')
        else:
            ob.vertex_groups['%s%02d' % (bone_prefix, i)].add([v.index], 1.0, 'REPLACE')
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    ob.parent = rig
    return ob


rig_t = make_rig('TentRig', 'T')
tent = make_mesh('Tentacle', rig_t, 'T', radius_tentacle)
rig_p = make_rig('ProbRig', 'P')
prob = make_mesh('Proboscis', rig_p, 'P', radius_proboscis)
rig_s = make_rig('SmoothRig', 'Q')
smooth_prob = make_mesh('ProboscisSmooth', rig_s, 'Q', radius_proboscis_smooth)

# ---- collar: a flattened swelling, +Y outward
bm2 = bmesh.new()
res = bmesh.ops.create_uvsphere(bm2, u_segments=24, v_segments=12, radius=1.0)
for v in res['verts']:
    x, y, z = v.co
    v.co = Vector((x * 0.04, (y * 0.5 + 0.2) * 0.04 if y > -0.2 else -0.015, z * 0.04))
bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces)
for f in bm2.faces:
    f.smooth = True
me2 = bpy.data.meshes.new('Collar')
bm2.to_mesh(me2)
me2.materials.append(gel)
collar = bpy.data.objects.new('Collar', me2)
bpy.context.collection.objects.link(collar)

# ---- reusable actions on the Tentacle rig
bpy.context.view_layer.objects.active = rig_t
bpy.ops.object.mode_set(mode='POSE')
for pb in rig_t.pose.bones:
    pb.rotation_mode = 'XYZ'


def make_action(name, frames, fn):
    act = bpy.data.actions.new(name)
    rig_t.animation_data_create()
    rig_t.animation_data.action = act
    for fr in frames:
        for i, pb in enumerate(rig_t.pose.bones):
            pb.rotation_euler = fn(i, fr)
            pb.keyframe_insert('rotation_euler', frame=fr)
    return act


idle = make_action('Idle', [1, 31, 61, 91, 121], lambda i, f: (0.05 * sin(f / 120 * 2 * pi + i * 0.5) * (i / NB + 0.3), 0, 0.07 * sin(f / 120 * 2 * pi + i * 0.4 + 1.2) * (i / NB + 0.3)))
coil = make_action('Coil', [1, 20], lambda i, f: (0.0, 0.0, 0.0) if f == 1 else (0.0, 0.22 * (i / NB), 0.30))
bpy.ops.object.mode_set(mode='OBJECT')
for a in (idle, coil):
    a.use_fake_user = True
    tr = rig_t.animation_data.nla_tracks.new()
    tr.name = a.name
    tr.strips.new(a.name, 1, a)
rig_t.animation_data.action = None

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_yup=True, export_materials='EXPORT',
                          export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_normals=True)
print('TENTACLE meshes', [o.name for o in bpy.data.objects if o.type == 'MESH'], 'tongue verts', len(prob.data.vertices), 'EXPORTED', OUT_GLB)
