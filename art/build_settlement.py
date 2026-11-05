# INTRUDER: the survivors' settlement on the homeworld, intact and ruined. Blender 5.x, 1 unit = 1 metre. Front (door) = +Y (exports to -Z), up +Z, origin on the ground.
#   Dwelling      a ribbed organic dome with a round door and glowing windows (about 5.4 m across, 2.6 m high)
#   DwellingRuin  the same house after the attack: half the shell gone, rubble and char around it
#   FallenSpire   a spire felled by the bombardment, lying on the ground with a jagged break
#   Rubble        one weathered, charred chunk (instanced many times across the ground)
#   Crater        a blast crater: raised rim, scorched dish
#   blender -b --python art/build_settlement.py -- public/models/settlement.glb art/settlement.blend
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix, Euler

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for b in list(bpy.data.meshes): bpy.data.meshes.remove(b)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
rnd = random.Random(31)

def hexc(h):
    h = h.lstrip('#'); return (int(h[0:2], 16) / 255) ** 2.2, (int(h[2:4], 16) / 255) ** 2.2, (int(h[4:6], 16) / 255) ** 2.2, 1.0
def mat(name, color, rough=0.7, emit=None, es=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = hexc(color); n.inputs['Roughness'].default_value = rough
    if emit: n.inputs['Emission Color'].default_value = hexc(emit); n.inputs['Emission Strength'].default_value = es
    return m
MOSS, ROCK, GLOW, CHAR = mat('Moss', '#143c3a', 0.55), mat('Rock', '#27323a', 0.9), mat('Glow', '#9affea', 0.3, '#6fffe0', 2.5), mat('Char', '#17120f', 0.95)

def make(name, bm, materials, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    for m in materials: me.materials.append(m)
    if smooth: me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    return o
def dome_bm(r0, h, segs=28, rings=10, power=2.3, bite=None, wobble=0.0):
    """A dome: rings of superellipse radius shrinking with height; optional 'bite' removes the shell inside a region."""
    bm = bmesh.new(); vs = []
    for i in range(rings + 1):
        t = i / rings; z = h * t; r = r0 * (1 - t ** 2.1) ** 0.5 + 0.02
        ring = []
        for j in range(segs):
            a = 2 * math.pi * j / segs; w = 1 + wobble * math.sin(a * 5 + i)
            ring.append(bm.verts.new((r * w * math.cos(a), r * w * math.sin(a) * 0.92, z)))
        vs.append(ring)
    for i in range(rings):
        for j in range(segs):
            f = (vs[i][j], vs[i][(j + 1) % segs], vs[i + 1][(j + 1) % segs], vs[i + 1][j])
            if bite and bite(sum((v.co for v in f), Vector()) / 4): continue
            bm.faces.new(f)
    return bm
def tube(bm, pts, rfn, ring_seg=8, n=20):
    P = [pts[0]] + list(pts) + [pts[-1]]; segs = len(pts) - 1; path = []
    for i in range(n):
        t = i / (n - 1) * segs; k = min(int(t), segs - 1); u = t - k
        p0, p1, p2, p3 = (Vector(P[k]), Vector(P[k + 1]), Vector(P[k + 2]), Vector(P[k + 3]))
        path.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u))
    rings = []; prev = Vector((0, 0, 1))
    for i, p in enumerate(path):
        tan = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized(); n1 = prev - tan * prev.dot(tan)
        if n1.length < 1e-4: n1 = Vector((1, 0, 0)).cross(tan)
        n1.normalize(); n2 = tan.cross(n1); prev = n1; r = max(0.01, rfn(i / (n - 1)))
        rings.append([bm.verts.new(p + (n1 * math.cos(2 * math.pi * j / ring_seg) + n2 * math.sin(2 * math.pi * j / ring_seg)) * r) for j in range(ring_seg)])
    for i in range(n - 1):
        for j in range(ring_seg): bm.faces.new((rings[i][j], rings[i][(j + 1) % ring_seg], rings[i + 1][(j + 1) % ring_seg], rings[i + 1][j]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
def ball(bm, c, r, sc=(1, 1, 1), seg=10, rings=7, rot=(0, 0, 0)):
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r, matrix=Matrix.Translation(c) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((sc[0], sc[1], sc[2], 1.0)))
def chunk(bm, c, r, squash=0.6, seed=0):
    r2 = random.Random(seed); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r, matrix=Matrix.Translation(c) @ Matrix.Diagonal((1.0, 0.8 + r2.random() * 0.5, squash, 1.0)))
    # roughen the newest verts
    for v in bm.verts[-42:]: v.co += Vector((r2.uniform(-1, 1), r2.uniform(-1, 1), r2.uniform(-1, 1))) * r * 0.18

R0, H = 2.7, 2.6
# ---------------------------------------------------------------- Dwelling
shell = dome_bm(R0, H, bite=lambda c: c.y > 1.2 and abs(c.x) < 0.62 and c.z < 1.55)      # an arched doorway cut into the front
make('Dwelling', shell, [MOSS])
d = bpy.data.objects['Dwelling']; so = d.modifiers.new('Solid', 'SOLIDIFY'); so.thickness = 0.12; so.offset = -1
bm = bmesh.new()                                                      # ribs over the dome, a rim at the base, a stalk antenna on top
for k in range(7):
    a = k * math.pi / 7 + 0.15
    pts = [(math.cos(a) * (R0 + 0.04), math.sin(a) * (R0 + 0.04) * 0.92, 0.02), (math.cos(a) * R0 * 0.82, math.sin(a) * R0 * 0.82 * 0.92, H * 0.55), (math.cos(a) * R0 * 0.3, math.sin(a) * R0 * 0.3, H * 0.93), (0, 0, H + 0.02)]
    tube(bm, pts, lambda t: 0.07 * (1 - 0.5 * t), ring_seg=5, n=10)
    pts2 = [(-p[0], -p[1], p[2]) for p in pts]; tube(bm, pts2, lambda t: 0.07 * (1 - 0.5 * t), ring_seg=5, n=10)
tube(bm, [(0, 0, H), (0.1, 0.05, H + 0.6), (-0.05, 0.1, H + 1.2)], lambda t: 0.05 * (1 - 0.7 * t), ring_seg=7, n=12)
make('DwellingRibs', bm, [MOSS])
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=R0 + 0.18, radius2=R0 + 0.1, depth=0.34, matrix=Matrix.Translation((0, 0, 0.12))); make('DwellingBase', bm, [ROCK])
bm = bmesh.new()
for k, (a, z) in enumerate([(0.9, 1.3), (2.5, 1.5), (-0.9, 1.35), (3.8, 1.2)]):                  # round glowing windows set into the walls
    r = R0 * (1 - (z / H) ** 2.1) ** 0.5; ball(bm, (math.cos(a) * (r + 0.02), math.sin(a) * (r + 0.02) * 0.92, z), 0.2, sc=(0.3, 0.3, 1), seg=12, rings=6, rot=(math.pi / 2, 0, a - math.pi / 2))
ball(bm, (0, 0.2, 0.2), 0.0001)
make('DwellingGlow', bm, [GLOW])

# ---------------------------------------------------------------- DwellingRuin: the same dome, a third of it left standing, ribs snapped, rubble fanned out
shell = dome_bm(R0, H, wobble=0.04, bite=lambda c: (c.x + 0.3 * c.y > 0.15 and c.z > 0.5 + 0.5 * math.sin(c.y * 3)) or (c.y > 1.4 and c.z > 0.8))
make('DwellingRuin', shell, [CHAR])
d = bpy.data.objects['DwellingRuin']; so = d.modifiers.new('Solid', 'SOLIDIFY'); so.thickness = 0.14; so.offset = -1
bm = bmesh.new()
for k in range(5):                                                  # a few snapped ribs still standing, jagged at the break
    a = math.pi * (0.9 + k * 0.25)
    tube(bm, [(math.cos(a) * (R0 + 0.04), math.sin(a) * (R0 + 0.04) * 0.92, 0.02), (math.cos(a) * R0 * 0.85, math.sin(a) * R0 * 0.85 * 0.92, H * (0.35 + 0.1 * (k % 3)))], lambda t: 0.07, ring_seg=6, n=10)
for k in range(14):                                                 # rubble thrown outward from the break
    a = rnd.uniform(-1.2, 2.6); rr = rnd.uniform(1.6, 5.0)
    chunk(bm, (math.cos(a) * rr, math.sin(a) * rr, 0.15), rnd.uniform(0.15, 0.5), 0.6, seed=k)
make('RuinRubble', bm, [CHAR])

# ---------------------------------------------------------------- FallenSpire: felled, with a jagged splintered end
bm = bmesh.new()
tube(bm, [(0, 0, 0.35), (1.2, 0.12, 0.3), (2.6, -0.1, 0.3), (4.0, 0.2, 0.27), (4.9, 0.1, 0.22)], lambda t: 0.34 * (1 - t) ** 1.1 + 0.05 + 0.014 * math.sin(t * 40), ring_seg=12, n=44)
for k in range(5):                                                  # splintered stump
    a = k * 2 * math.pi / 5; tube(bm, [(-0.02, 0.0, 0.35), (-0.25, math.cos(a) * 0.28, 0.35 + math.sin(a) * 0.26)], lambda t: 0.08 * (1 - t) + 0.015, ring_seg=5, n=6)
for k in range(5):                                                  # root buttresses torn out of the ground
    a = k * 2 * math.pi / 5 + 0.3; tube(bm, [(0.0, 0.0, 0.5), (-0.3 - 0.2 * k % 3, math.cos(a) * 0.5, 0.9 + math.sin(a) * 0.3)], lambda t: 0.1 * (1 - t) + 0.03, ring_seg=6, n=8)
make('FallenSpire', bm, [MOSS])

# ---------------------------------------------------------------- Rubble: one weathered chunk
bm = bmesh.new(); chunk(bm, (0, 0, 0.12), 0.45, 0.55, seed=3); make('Rubble', bm, [CHAR])

# ---------------------------------------------------------------- Crater: a dished floor ringed by a raised, ragged rim
bm = bmesh.new(); segs, rings = 36, 8; vs = []
for i in range(rings + 1):
    t = i / rings; r = 0.1 + t * 3.0; ring = []
    for j in range(segs):
        a = 2 * math.pi * j / segs; rag = 1 + 0.12 * math.sin(a * 7 + 1.3) + 0.08 * math.sin(a * 13)
        z = -0.35 * (1 - t) ** 1.6 + 0.35 * math.exp(-((t - 0.78) / 0.12) ** 2) * rag - 0.0
        ring.append(bm.verts.new((r * rag * math.cos(a), r * rag * math.sin(a), z)))
    vs.append(ring)
for i in range(rings):
    for j in range(segs): bm.faces.new((vs[i][j], vs[i][(j + 1) % segs], vs[i + 1][(j + 1) % segs], vs[i + 1][j]))
bm.faces.new(vs[0][::-1])
make('Crater', bm, [CHAR])

print('SETTLEMENT built')
w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World'); bpy.context.scene.world = w; w.use_nodes = True
next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND').inputs['Color'].default_value = (0.02, 0.04, 0.06, 1)
ld = bpy.data.lights.new('Sun', 'SUN'); ld.energy = 3.0; lo = bpy.data.objects.new('Sun', ld); lo.rotation_euler = (0.9, 0.2, 0.6); bpy.context.scene.collection.objects.link(lo)
if len(ARGS) >= 1:
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        if o.type == 'MESH': o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=ARGS[0], export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
if len(ARGS) >= 2: bpy.ops.wm.save_as_mainfile(filepath=ARGS[1])
