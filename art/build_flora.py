# INTRUDER: homeworld flora and rock, v2. Same node names and scale as the old home.glb (Spire ~5 m, Stalk ~1 m, Rock ~1 m), so the game swaps the geometry in place.
#   blender -b --python art/build_flora.py -- public/models/flora.glb art/flora.blend
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix, Euler

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for b in list(bpy.data.meshes): bpy.data.meshes.remove(b)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
rnd = random.Random(21)

def hexc(h):
    h = h.lstrip('#'); return (int(h[0:2], 16) / 255) ** 2.2, (int(h[2:4], 16) / 255) ** 2.2, (int(h[4:6], 16) / 255) ** 2.2, 1.0
def mat(name, color, rough=0.7, emit=None, es=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = hexc(color); n.inputs['Roughness'].default_value = rough
    if emit: n.inputs['Emission Color'].default_value = hexc(emit); n.inputs['Emission Strength'].default_value = es
    return m
MOSS, ROCK, GLOW = mat('Moss', '#143c3a', 0.6), mat('Rock', '#243038', 0.9), mat('Glow', '#9affea', 0.3, '#6fffe0', 2.5)

def sample(pts, n):
    out = []; P = [pts[0]] + list(pts) + [pts[-1]]; segs = len(pts) - 1
    for i in range(n):
        t = i / (n - 1) * segs; k = min(int(t), segs - 1); u = t - k
        p0, p1, p2, p3 = (Vector(P[k]), Vector(P[k + 1]), Vector(P[k + 2]), Vector(P[k + 3]))
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u))
    return out
def tube(bm, pts, radius_fn, ring_seg=10, samples=40, cap_tip=True):
    path = sample(pts, samples); rings = []; prev = Vector((1, 0, 0))
    for i, p in enumerate(path):
        tan = (path[min(i + 1, samples - 1)] - path[max(i - 1, 0)]).normalized()
        n1 = prev - tan * prev.dot(tan)
        if n1.length < 1e-4: n1 = Vector((0, 1, 0)).cross(tan)
        n1.normalize(); n2 = tan.cross(n1); prev = n1; r = max(0.003, radius_fn(i / (samples - 1)))
        rings.append([bm.verts.new(p + (n1 * math.cos(2 * math.pi * j / ring_seg) + n2 * math.sin(2 * math.pi * j / ring_seg)) * r) for j in range(ring_seg)])
    for i in range(samples - 1):
        for j in range(ring_seg): bm.faces.new((rings[i][j], rings[i][(j + 1) % ring_seg], rings[i + 1][(j + 1) % ring_seg], rings[i + 1][j]))
    bm.faces.new(rings[0][::-1])
    if cap_tip:
        tip = bm.verts.new(path[-1] + (path[-1] - path[-2]).normalized() * radius_fn(1.0) * 0.8)
        for j in range(ring_seg): bm.faces.new((rings[-1][j], rings[-1][(j + 1) % ring_seg], tip))
    return path
def ball(bm, c, r, sc=(1, 1, 1), seg=10, rings=7):
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r, matrix=Matrix.Translation(c) @ Matrix.Diagonal((sc[0], sc[1], sc[2], 1.0)))
def make(name, bm, material, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    me.materials.append(material)
    if smooth: me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    return o

# ---------------------------------------------------------------- Spire: a living tower, ribbed, curving, with splayed roots at the base and a few small side branches near the top
bm = bmesh.new()
trunk = [(0, 0, 0), (0.07, 0.03, 1.2), (-0.06, 0.1, 2.6), (0.09, 0.05, 4.0), (0.02, -0.04, 5.2)]
tube(bm, trunk, lambda t: 0.34 * (1 - t) ** 1.25 + 0.03 + 0.016 * math.sin(t * 46) * (1 - t) + 0.05 * max(0, 0.18 - t) * 6, ring_seg=8, samples=26)
for k in range(5):                                           # root buttresses spreading across the ground and growing into the trunk
    a = k * 2 * math.pi / 5 + 0.3
    tube(bm, [(math.cos(a) * 0.62, math.sin(a) * 0.62, 0.0), (math.cos(a) * 0.4, math.sin(a) * 0.4, 0.18), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.6), (0.04, 0.02, 1.1)],
         lambda t: 0.1 * (1 - t) ** 0.8 + 0.025, ring_seg=6, samples=6, cap_tip=False)
for h, a, ln in [(3.3, 0.4, 0.8), (3.9, 2.9, 0.65), (4.5, 5.0, 0.5)]:                 # side branches
    ox, oy = 0.06 * math.sin(h), 0.07
    d = Vector((math.cos(a), math.sin(a), 0.55)).normalized()
    p0 = Vector((ox, oy, h)); tube(bm, [p0, p0 + d * ln * 0.5 + Vector((0, 0, 0.12)), p0 + d * ln + Vector((0, 0, 0.3))], lambda t: 0.05 * (1 - t) + 0.01, ring_seg=5, samples=5)
make('Spire', bm, MOSS)
bm = bmesh.new(); ball(bm, (0.02, -0.04, 5.25), 0.1, sc=(1, 1, 1.6), seg=8, rings=6)
for h, a, ln in [(3.3, 0.4, 0.8), (3.9, 2.9, 0.65), (4.5, 5.0, 0.5)]:
    d = Vector((math.cos(a), math.sin(a), 0.55)).normalized(); p0 = Vector((0.06 * math.sin(h), 0.07, h)); ball(bm, p0 + d * ln + Vector((0, 0, 0.32)), 0.045, seg=5, rings=4)
make('SpireTip', bm, GLOW)

# ---------------------------------------------------------------- Stalk: a stem with three curling fronds and a glowing bulb ringed by small beads
bm = bmesh.new()
tube(bm, [(0, 0, 0), (0.05, 0.02, 0.35), (0.02, 0.06, 0.7), (-0.04, 0.05, 0.95)], lambda t: 0.02 * (1 - t * 0.6), ring_seg=5, samples=8)
for k in range(3):
    a = k * 2 * math.pi / 3 + 0.5
    tube(bm, [(0.02, 0.02, 0.25), (math.cos(a) * 0.14, math.sin(a) * 0.14, 0.4), (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.42), (math.cos(a) * 0.42, math.sin(a) * 0.42, 0.3)], lambda t: 0.012 * (1 - t) + 0.003, ring_seg=3, samples=5)
make('Stalk', bm, MOSS)
bm = bmesh.new(); ball(bm, (-0.04, 0.05, 1.0), 0.058, sc=(1, 1, 1.15), seg=8, rings=5)
for k in range(6):
    a = k * math.pi / 3; ball(bm, (-0.04 + math.cos(a) * 0.085, 0.05 + math.sin(a) * 0.085, 0.96), 0.016, seg=4, rings=3)
make('StalkBulb', bm, GLOW)

# ---------------------------------------------------------------- Rock: a weathered boulder, flat at the bottom, with fissures and a couple of low ledges
bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.5)
for v in bm.verts:
    p = v.co
    n = (math.sin(p.x * 9 + 1.3) + math.sin(p.y * 7 + 0.4) + math.sin(p.z * 11) + 0.6 * math.sin(p.x * 23 + p.y * 17) + 0.4 * math.sin(p.z * 31 + p.x * 13)) * 0.04
    ledge = 0.05 * (1 if math.sin(p.z * 14) > 0.7 else 0)
    v.co = p * (1 + n + ledge)
    v.co.x *= 1.3; v.co.z = max(v.co.z * 0.7, -0.12)
make('Rock', bm, ROCK)

print('FLORA built')
if len(ARGS) >= 1:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=ARGS[0], export_format='GLB', use_selection=False, export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
if len(ARGS) >= 2: bpy.ops.wm.save_as_mainfile(filepath=ARGS[1])
