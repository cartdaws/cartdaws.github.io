# INTRUDER: the survivor's first-person arm and hand, v3: a true tentacle. A long arm that tapers smoothly, rows of suckers along its underside, and a hand of four
# long, sinuous tentacle-fingers (also with suckers) that curl, splay and converge. Matches the creature's third-person tentacles.
# Same coordinate frame and shape keys as the old hand.glb (Grip, Weapon, Spread, Swell): the arm runs along +Z from the elbow (z=1.36) to the wrist (z=0),
# the fingers point -Z (to about -0.4). Two meshes share the keys: Hand (skin) and HandSuckers (a lighter material).
#   blender -b --python art/build_hand2.py -- public/models/hand2.glb art/hand2.blend
import bpy, bmesh, math, sys
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for b in list(bpy.data.meshes): bpy.data.meshes.remove(b)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)

def hexc(h):
    h = h.lstrip('#'); return (int(h[0:2], 16) / 255) ** 2.2, (int(h[2:4], 16) / 255) ** 2.2, (int(h[4:6], 16) / 255) ** 2.2, 1.0
def mat(name, color, rough, coat=0.8):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = hexc(color); n.inputs['Roughness'].default_value = rough
    for k, v in (('Coat Weight', coat), ('Specular IOR Level', 0.9)):
        if k in n.inputs: n.inputs[k].default_value = v
    return m
SKIN, SUCK = mat('Skin', '#0c1826', 0.3), mat('Sucker', '#3b5368', 0.28)

def catmull(pts, n):
    P = [pts[0]] + list(pts) + [pts[-1]]; segs = len(pts) - 1; out = []
    for i in range(n):
        t = i / (n - 1) * segs; k = min(int(t), segs - 1); u = t - k
        p0, p1, p2, p3 = (Vector(P[k]), Vector(P[k + 1]), Vector(P[k + 2]), Vector(P[k + 3]))
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u))
    return out

UP = Vector((0, 1, 0))
def tube(pts, radii, ring_seg, samples):
    """ring vertices along a smooth path (fixed-reference frames so every pose shares a vertex order) + the apex; also returns path, radii and frames for placing suckers"""
    path = catmull(pts, samples); rad = [v.x for v in catmull([(r, 0, 0) for r in radii], samples)]; verts = []; frames = []
    for i, p in enumerate(path):
        tan = (path[min(i + 1, samples - 1)] - path[max(i - 1, 0)]).normalized()
        n1 = UP - tan * UP.dot(tan)
        if n1.length < 1e-3: n1 = Vector((1, 0, 0))
        n1.normalize(); n2 = tan.cross(n1); r = max(0.004, rad[i]); frames.append((n1, n2))
        for j in range(ring_seg):
            a = 2 * math.pi * j / ring_seg; verts.append(p + (n1 * math.cos(a) + n2 * math.sin(a)) * r)
    verts.append(path[-1] + (path[-1] - path[-2]).normalized() * rad[-1] * 0.9)
    return verts, path, rad, frames

def tube_faces(ring_seg, samples, base):
    faces = []
    for i in range(samples - 1):
        for j in range(ring_seg):
            faces.append((base + i * ring_seg + j, base + i * ring_seg + (j + 1) % ring_seg, base + (i + 1) * ring_seg + (j + 1) % ring_seg, base + (i + 1) * ring_seg + j))
    apex = base + samples * ring_seg
    for j in range(ring_seg): faces.append((base + (samples - 1) * ring_seg + j, base + (samples - 1) * ring_seg + (j + 1) % ring_seg, apex))
    return faces

# a sucker is a small flattened ball; the template gives one fixed vertex order, so suckers morph with the pose like everything else
_tb = bmesh.new(); bmesh.ops.create_uvsphere(_tb, u_segments=8, v_segments=5, radius=1.0)
TEMPLATE = [v.co.copy() for v in _tb.verts]; TFACES = [tuple(v.index for v in f.verts) for f in _tb.faces]; _tb.free()
def sucker_verts(c, r, flat_axis):
    out = []
    for v in TEMPLATE:
        q = Vector((v.x * r, v.y * r, v.z * r * 0.45))               # flattened along its own z, which we then align with the surface normal
        # build a basis whose z is flat_axis
        z = flat_axis.normalized(); x = z.cross(Vector((0, 0, 1)))
        if x.length < 1e-3: x = z.cross(Vector((1, 0, 0)))
        x.normalize(); y = z.cross(x)
        out.append(c + x * q.x + y * q.y + z * q.z)
    return out

FX = [-0.06, -0.02, 0.02, 0.06]; FY = [-0.012, 0.012, 0.012, -0.012]
ARM_SEG, ARM_N, F_SEG, F_N = 22, 40, 12, 24

def build(pose='basis'):
    """vertex positions for the skin (forearm + four fingers) and for the suckers, in fixed orders"""
    swell = 1.28 if pose == 'swell' else 1.0
    arm_pts = [(0, 0.0, 1.36), (0.025, -0.03, 0.95), (-0.02, -0.045, 0.5), (0.012, -0.03, 0.1), (0, -0.01, -0.03), (0, 0.0, -0.075)]
    arm_r = [0.088 * swell, 0.066 * swell, 0.05 * swell, 0.039 * swell, 0.058 * (1 + 0.1 * (swell - 1)), 0.044]
    skin, path, rad, frames = tube(arm_pts, arm_r, ARM_SEG, ARM_N)
    suck = []
    # two rows of suckers down the underside of the arm, getting smaller toward the wrist
    for i in range(6, ARM_N - 6, 3):
        n1, n2 = frames[i]; r = rad[i]
        for side in (-0.55, 0.55):
            c = path[i] + Vector((0, -1, 0)) * r * 0.9 + Vector((1, 0, 0)) * r * side
            suck.append(sucker_verts(c, r * 0.3, Vector((0, -1, 0)) + Vector((1, 0, 0)) * side * 0.6))
    for k in range(4):
        x0, y0 = FX[k], FY[k]; wv = 0.035 * (1 if k % 2 else -1); r = [0.064, 0.053, 0.038, 0.016]
        if pose == 'grip':      # curled tightly into a coil under the wrist
            p = [(x0 * 0.85, y0, -0.05), (x0 * 0.9, y0 - 0.05, -0.2), (x0 * 0.7, y0 - 0.17, -0.28), (x0 * 0.45, y0 - 0.25, -0.18), (x0 * 0.3, y0 - 0.2, -0.07)]
        elif pose == 'weapon':  # the tentacles wind together into one long tapering spear
            p = [(x0 * 0.5, y0 * 0.5, -0.05), (x0 * 0.3, y0 * 0.4, -0.18), (x0 * 0.17, y0 * 0.3, -0.3), (x0 * 0.08, y0 * 0.2, -0.42)]; r = [0.07, 0.06, 0.044, 0.02]
        elif pose == 'spread':  # a wide fan, the tips lifting
            p = [(x0 * 0.85, y0, -0.05), (x0 * 1.9, y0 + 0.01, -0.16), (x0 * 3.0, y0 + 0.05, -0.28), (x0 * 3.9, y0 + 0.16, -0.36)]
        else:                   # relaxed: reach forward, then curl UP toward you so the suckers on the inner curve face the camera
            p = [(x0 * 0.9, y0, -0.05), (x0 * 1.4 + wv, y0, -0.2), (x0 * 1.7 - wv, y0 + 0.07, -0.37), (x0 * 1.9 + wv * 0.6, y0 + 0.2, -0.48), (x0 * 1.8, y0 + 0.36, -0.44)]
        p = [(q[0] * 1.3, q[1] * 1.25, q[2] * 1.55) for q in p]; r = [v * 0.78 for v in r]      # bigger: from your own eyes the hand is foreshortened, so it needs real length and bulk to read as tentacles
        fv, fpath, frad, fframes = tube(p, [v * swell ** 0.4 for v in r], F_SEG, F_N)
        skin += fv
        for i in range(3, F_N - 2, 2):                                # a row of suckers on the INNER side of each tentacle's curve, so they show
            prev, nxt = fpath[max(i - 1, 0)], fpath[min(i + 1, F_N - 1)]
            inner = ((prev + nxt) / 2 - fpath[i])
            if inner.length < 1e-5: inner = Vector((0, -1, 0))
            inner.normalize(); rr = frad[i]
            if pose == 'basis': inner = (inner * 0.7 + Vector((0, 1, 0)) * 0.5).normalized()   # at rest the curl faces up: keep them facing the viewer
            suck.append(sucker_verts(fpath[i] + inner * rr * 0.92, rr * 0.5, inner))
    return skin, suck

faces = tube_faces(ARM_SEG, ARM_N, 0)
ring_end = ARM_SEG * ARM_N + 1
for k in range(4): faces += tube_faces(F_SEG, F_N, ring_end + k * (F_SEG * F_N + 1))
faces.append(tuple(range(ARM_SEG))[::-1])
skin0, suck0 = build('basis')
sfaces = []
for bi in range(len(suck0)):
    for f in TFACES: sfaces.append(tuple(bi * len(TEMPLATE) + i for i in f))

def conv(v):
    """my coordinates are the game frame (x right, y up, z toward the camera); Blender wants +Y forward and +Z up, and the exporter turns that into the game frame"""
    return Vector((v[0], -v[2], v[1]))

def make(name, verts, fcs, material):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(conv(v)) for v in verts], [], fcs); me.update(); me.materials.append(material)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o
hand = make('Hand', skin0, faces, SKIN)
sucks = make('HandSuckers', [v for s in suck0 for v in s], sfaces, SUCK)
for obj, idx in ((hand, 0), (sucks, 1)):
    obj.shape_key_add(name='Basis', from_mix=False)
    for name, pose in (('Grip', 'grip'), ('Weapon', 'weapon'), ('Spread', 'spread'), ('Swell', 'swell')):
        sk = obj.shape_key_add(name=name, from_mix=False)
        data = build(pose)[idx]
        flat = data if idx == 0 else [v for s in data for v in s]
        for i, v in enumerate(flat): sk.data[i].co = conv(v)
bpy.context.view_layer.objects.active = hand
# (no subdivision modifier: applying one on export would discard the shape keys)
print('HAND v3 built:', len(hand.data.vertices), 'skin verts,', len(sucks.data.vertices), 'sucker verts, keys', [k.name for k in hand.data.shape_keys.key_blocks])

world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World'); bpy.context.scene.world = world; world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = hexc('#04070a'); bg.inputs['Strength'].default_value = 0.3
for name, loc, energy, col in [('Key', (2, 1.2, 2), 600, (0.8, 0.88, 1.0)), ('Rim', (-2, -1, 1.5), 600, (0.5, 0.9, 0.85))]:
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.color = col; ld.size = 2
    lo = bpy.data.objects.new(name, ld); lo.location = loc; bpy.context.scene.collection.objects.link(lo)
    lo.rotation_euler = (Vector((0, 0, 0.3)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

if len(ARGS) >= 1:
    bpy.ops.object.select_all(action='DESELECT'); hand.select_set(True); sucks.select_set(True)
    bpy.ops.export_scene.gltf(filepath=ARGS[0], export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_morph=True)
if len(ARGS) >= 2: bpy.ops.wm.save_as_mainfile(filepath=ARGS[1])
