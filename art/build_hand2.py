# INTRUDER: the survivor's first-person arm and hand, v2: a long muscular arm ending in four soft tentacle-fingers around a bulb of a palm.
# Same coordinate frame and the same four shape keys as the old hand.glb (Grip, Weapon, Spread, Swell), so the weapon organs and the game code still fit:
# the arm runs along +Z from the elbow (z=1.36) to the wrist (z=0), the fingers point -Z (to about -0.3).
#   blender -b --python art/build_hand2.py -- public/models/hand2.glb art/hand2.blend
import bpy, bmesh, math, sys
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for b in list(bpy.data.meshes): bpy.data.meshes.remove(b)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)

def hexc(h):
    h = h.lstrip('#'); return (int(h[0:2], 16) / 255) ** 2.2, (int(h[2:4], 16) / 255) ** 2.2, (int(h[4:6], 16) / 255) ** 2.2, 1.0
skin = bpy.data.materials.new('Skin'); skin.use_nodes = True
pb = next(n for n in skin.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
pb.inputs['Base Color'].default_value = hexc('#0c1826'); pb.inputs['Roughness'].default_value = 0.28
for k, v in (('Coat Weight', 0.8), ('Specular IOR Level', 0.9)):
    if k in pb.inputs: pb.inputs[k].default_value = v

def catmull(pts, n):
    P = [pts[0]] + list(pts) + [pts[-1]]; segs = len(pts) - 1; out = []
    for i in range(n):
        t = i / (n - 1) * segs; k = min(int(t), segs - 1); u = t - k
        p0, p1, p2, p3 = (Vector(P[k]), Vector(P[k + 1]), Vector(P[k + 2]), Vector(P[k + 3]))
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u))
    return out

UP = Vector((0, 1, 0))
def tube_verts(pts, radii, ring_seg, samples):
    """Deterministic ring vertices along a smooth path (frames from a fixed reference so every pose has the same vertex order) + the apex."""
    path = catmull(pts, samples); rad = catmull([(r, 0, 0) for r in radii], samples); verts = []
    for i, p in enumerate(path):
        tan = (path[min(i + 1, samples - 1)] - path[max(i - 1, 0)]).normalized()
        n1 = UP - tan * UP.dot(tan)
        if n1.length < 1e-3: n1 = Vector((1, 0, 0))
        n1.normalize(); n2 = tan.cross(n1); r = max(0.004, rad[i].x)
        for j in range(ring_seg):
            a = 2 * math.pi * j / ring_seg; verts.append(p + (n1 * math.cos(a) + n2 * math.sin(a)) * r)
    verts.append(path[-1] + (path[-1] - path[-2]).normalized() * rad[-1].x * 0.9)
    return verts

def tube_faces(ring_seg, samples, base):
    faces = []
    for i in range(samples - 1):
        for j in range(ring_seg):
            faces.append((base + i * ring_seg + j, base + i * ring_seg + (j + 1) % ring_seg, base + (i + 1) * ring_seg + (j + 1) % ring_seg, base + (i + 1) * ring_seg + j))
    apex = base + samples * ring_seg
    for j in range(ring_seg): faces.append((base + (samples - 1) * ring_seg + j, base + (samples - 1) * ring_seg + (j + 1) % ring_seg, apex))
    return faces

FX = [-0.085, -0.028, 0.028, 0.085]; FY = [-0.015, 0.018, 0.018, -0.015]
ARM_SEG, ARM_N, F_SEG, F_N = 22, 40, 10, 14

def build(pose='basis'):
    """All vertex positions for a pose, in a fixed order: forearm+palm, then the four fingers."""
    swell = 1.28 if pose == 'swell' else 1.0
    arm_pts = [(0, 0.0, 1.36), (0, -0.03, 0.95), (0, -0.045, 0.5), (0, -0.03, 0.1), (0, -0.01, -0.03), (0, 0.0, -0.075)]
    arm_r = [0.2 * swell, 0.15 * swell, 0.105 * swell, 0.078 * swell, 0.125 * (1 + 0.1 * (swell - 1)), 0.075]
    verts = tube_verts(arm_pts, arm_r, ARM_SEG, ARM_N)
    for k in range(4):
        x0, y0 = FX[k], FY[k]; r = [0.042, 0.034, 0.024, 0.011]
        if pose == 'grip':
            p = [(x0 * 0.85, y0, -0.04), (x0 * 0.9, y0 - 0.04, -0.13), (x0 * 0.7, y0 - 0.12, -0.17), (x0 * 0.5, y0 - 0.17, -0.1)]
        elif pose == 'weapon':
            p = [(x0 * 0.5, y0 * 0.5, -0.04), (x0 * 0.3, y0 * 0.4, -0.15), (x0 * 0.18, y0 * 0.3, -0.26), (x0 * 0.1, y0 * 0.2, -0.36)]; r = [0.046, 0.04, 0.03, 0.018]
        elif pose == 'spread':
            p = [(x0 * 0.85, y0, -0.04), (x0 * 1.9, y0, -0.12), (x0 * 3.0, y0 - 0.03, -0.2), (x0 * 3.9, y0 - 0.08, -0.26)]
        else:
            p = [(x0 * 0.85, y0, -0.04), (x0 * 1.25, y0 - 0.01, -0.14), (x0 * 1.6, y0 - 0.03, -0.25), (x0 * 1.9, y0 - 0.07, -0.34)]
        verts += tube_verts(p, [v * swell ** 0.4 for v in r], F_SEG, F_N)
    return verts

faces = tube_faces(ARM_SEG, ARM_N, 0)
ring_end = ARM_SEG * ARM_N + 1
for k in range(4): faces += tube_faces(F_SEG, F_N, ring_end + k * (F_SEG * F_N + 1))
faces.append(tuple(range(ARM_SEG))[::-1])                   # the open elbow end is capped (it is off screen)
basis = build('basis')
me = bpy.data.meshes.new('Hand'); me.from_pydata([tuple(v) for v in basis], [], faces); me.update()
obj = bpy.data.objects.new('Hand', me); bpy.context.scene.collection.objects.link(obj)
me.materials.append(skin)
me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
obj.shape_key_add(name='Basis', from_mix=False)
for name, pose in (('Grip', 'grip'), ('Weapon', 'weapon'), ('Spread', 'spread'), ('Swell', 'swell')):
    sk = obj.shape_key_add(name=name, from_mix=False)
    pos = build(pose)
    for i, v in enumerate(pos): sk.data[i].co = v
bpy.context.view_layer.objects.active = obj
sub = obj.modifiers.new('S', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
print('HAND built:', len(me.vertices), 'verts', len(me.polygons), 'faces, keys', [k.name for k in me.shape_keys.key_blocks])

# a quick studio to view it in
world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World'); bpy.context.scene.world = world; world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = hexc('#04070a'); bg.inputs['Strength'].default_value = 0.3
for name, loc, energy, col in [('Key', (2, 1.2, 2), 500, (0.8, 0.88, 1.0)), ('Rim', (-2, -1, 1.5), 500, (0.5, 0.9, 0.85))]:
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.color = col; ld.size = 2
    lo = bpy.data.objects.new(name, ld); lo.location = loc; bpy.context.scene.collection.objects.link(lo)
    lo.rotation_euler = (Vector((0, 0, 0.3)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

if len(ARGS) >= 1:
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=ARGS[0], export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_morph=True)
if len(ARGS) >= 2: bpy.ops.wm.save_as_mainfile(filepath=ARGS[1])
