"""The humanoid creature body, in two clean pieces.
Run: blender -b --python art/build_creature.py -- <out.glb> <out.blend>

Frame (Blender): Z up, +Y forward (exports to -Z, the game's forward), +X is the creature's right. Origin on the floor under the feet.

"Body": ONE continuous gel torso, hips to neck, built from a smooth anatomical profile (pelvis, waist, ribcage, shoulder girdle, trapezius slope, neck)
with a superellipse cross-section that squares off toward the shoulders. Closed at the pelvis and at the neck. Z runs 0.78 .. 1.38 m.
   Vertex index of ring i (1..NR-1), segment k = (i-1)*SEG + k; bottom pole = (NR-1)*SEG, top pole = (NR-1)*SEG+1. The game samples this grid
   (after morphing) for the shoulder sockets, the camera keep-out and the soft-shadow footprint.
   Shape keys: Broad (shoulder girdle), Heavy (overall mass, belly), Lean (forward shear), Belly (front curve, +/-).
"Head": a separate skull/jaw mesh with a short neck stub, origin at the top of the neck, z up. Shape key: Chin. The game seats it on the neck
   and hides it in first person (the camera is inside it); legs and arms are built in the game from the same skin.
"""
import bpy, bmesh, sys, math
from math import pi, sin, cos, exp, sqrt
from mathutils import Vector

OUT_GLB, OUT_BLEND = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)

NR, SEG = 44, 48
Z0, Z1 = 0.78, 1.38

# (z, half-width, half-depth, superellipse exponent)
PROFILE = [
    (0.78, 0.112, 0.082, 2.0), (0.86, 0.165, 0.116, 2.0), (0.98, 0.140, 0.104, 2.1), (1.10, 0.168, 0.124, 2.4),
    (1.22, 0.226, 0.114, 2.8), (1.31, 0.150, 0.092, 2.3), (1.355, 0.064, 0.060, 2.0), (1.38, 0.056, 0.056, 2.0),
]


def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def bump(x, c, w):
    return exp(-((x - c) / w) ** 2)


def prof(z):
    """Smoothly interpolated (Catmull-Rom on the control rows) half-width, half-depth, exponent at height z."""
    P = PROFILE
    if z <= P[0][0]:
        return P[0][1:]
    if z >= P[-1][0]:
        return P[-1][1:]
    for i in range(len(P) - 1):
        if P[i][0] <= z <= P[i + 1][0]:
            break
    a, b = P[i], P[i + 1]
    t = (z - a[0]) / (b[0] - a[0])
    t = t * t * (3 - 2 * t)                                  # ease between rows: no kinks at the control heights
    return tuple(a[k] + (b[k] - a[k]) * t for k in (1, 2, 3))


def closing(t):
    """Round the pelvis underside and the neck cap into poles."""
    lo = sqrt(max(0.0, 1 - ((0.06 - t) / 0.06) ** 2)) if t < 0.06 else 1.0
    hi = sqrt(max(0.0, 1 - ((t - 0.965) / 0.035) ** 2)) if t > 0.965 else 1.0
    return lo * hi


def se(c, n):
    return math.copysign(abs(c) ** (2.0 / n), c)


def pos(t, phi, wide=0.0, heavy=0.0, lean=0.0, belly=0.0):
    z = Z0 + t * (Z1 - Z0)
    rw, rd, n = prof(z)
    rw *= 1 + wide * (0.28 * bump(z, 1.22, 0.09) + 0.10 * bump(z, 1.1, 0.1)) + heavy * 0.2 * (sstep(0.78, 0.88, z) * (1 - sstep(1.28, 1.34, z)))
    rd *= 1 + heavy * 0.2 * (sstep(0.78, 0.88, z) * (1 - sstep(1.28, 1.34, z)))
    k = closing(t)
    c, s = cos(phi), sin(phi)
    x, y = rw * se(c, n) * k, rd * se(s, n) * k
    y += 0.010 * bump(z, 1.12, 0.09) * max(0.0, s)                  # a soft chest
    y -= 0.008 * bump(z, 1.12, 0.09) * max(0.0, -s)
    y += heavy * 0.025 * bump(z, 1.0, 0.1) * max(0.0, s)           # belly
    y += belly * 0.05 * bump(z, 1.0, 0.12) * max(0.0, s)
    y += lean * 0.12 * t ** 1.5
    return Vector((x, y, z))


KEYS = [('Broad', dict(wide=1.0)), ('Heavy', dict(heavy=1.0)), ('Lean', dict(lean=1.0)), ('Belly', dict(belly=1.0))]

bm = bmesh.new()
rows = []
for i in range(1, NR):
    t = i / NR
    rows.append([bm.verts.new(pos(t, 2 * pi * k / SEG)) for k in range(SEG)])
bot = bm.verts.new((0, 0.0, Z0))
top = bm.verts.new((0, 0.0, Z1))
uvl = bm.loops.layers.uv.new('UVMap')
for i in range(NR - 2):
    for k in range(SEG):
        k2 = (k + 1) % SEG
        bm.faces.new((rows[i][k], rows[i][k2], rows[i + 1][k2], rows[i + 1][k]))
for k in range(SEG):
    k2 = (k + 1) % SEG
    bm.faces.new((rows[0][k2], rows[0][k], bot))
    bm.faces.new((rows[-1][k], rows[-1][k2], top))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
for f in bm.faces:
    f.smooth = True
    for l in f.loops:
        v = l.vert.co
        l[uvl].uv = ((math.atan2(v.y, v.x) / (2 * pi)) % 1.0, (v.z - Z0) / (Z1 - Z0))
me = bpy.data.meshes.new('Body'); bm.to_mesh(me); bm.free()
assert len(me.vertices) == (NR - 1) * SEG + 2

gel = bpy.data.materials.new('Gel'); gel.use_nodes = True
gel.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.06, 0.42, 0.38, 1)
me.materials.append(gel)
body = bpy.data.objects.new('Body', me)
bpy.context.collection.objects.link(body)
body.shape_key_add(name='Basis', from_mix=False)
for name, kw in KEYS:
    sk = body.shape_key_add(name=name, from_mix=False)
    sk.slider_min, sk.slider_max = -1.0, 1.0
    for i in range(1, NR):
        t = i / NR
        for k in range(SEG):
            sk.data[(i - 1) * SEG + k].co = pos(t, 2 * pi * k / SEG, **kw)
    for pole, ring, zz in (((NR - 1) * SEG, range(0, SEG), Z0), ((NR - 1) * SEG + 1, range((NR - 2) * SEG, (NR - 1) * SEG), Z1)):
        ctr = sum((sk.data[j].co for j in ring), Vector()) / SEG
        rest = sum((me.vertices[j].co for j in ring), Vector()) / SEG
        sk.data[pole].co = me.vertices[pole].co + (ctr - rest)
    sk.value = 0.0
body['grid'] = [NR, SEG, Z0, Z1]

# ---------------------------------------------------------------- head
HR, HS = 26, 32
HZ0, HZ1 = -0.022, 0.215
RX, RY = 0.076, 0.088


def head_pos(t, phi, chin=0.0):
    z = HZ0 + t * (HZ1 - HZ0)
    zc = 0.108
    e = sqrt(max(0.0, 1 - ((z - zc) / 0.108) ** 2))
    jaw = 0.58 + 0.42 * sstep(0.0, 0.13, z)                      # narrower toward the chin
    jaw *= 1 - chin * 0.28 * (1 - sstep(0.0, 0.1, z))
    neck = 0.05 * (1 - sstep(0.0, 0.05, z))                      # short neck stub that meets the torso
    r = max(neck, e * jaw)
    rx, ry = RX * r, RY * r
    if z < 0.0:
        rx, ry = 0.052 * (1 - sstep(-0.022, 0.0, z) * 0), 0.052
    c, s = cos(phi), sin(phi)
    y = ry * s + 0.012 * sstep(0.0, 0.2, z) + 0.006
    if z < 0.0:
        y = ry * s
    return Vector((rx * c, y, z))


hb = bmesh.new()
hrows = []
for i in range(1, HR):
    t = i / HR
    hrows.append([hb.verts.new(head_pos(t, 2 * pi * k / HS)) for k in range(HS)])
hbot = hb.verts.new((0, 0, HZ0)); htop = hb.verts.new((0, 0.018, HZ1))
huv = hb.loops.layers.uv.new('UVMap')
for i in range(HR - 2):
    for k in range(HS):
        k2 = (k + 1) % HS
        hb.faces.new((hrows[i][k], hrows[i][k2], hrows[i + 1][k2], hrows[i + 1][k]))
for k in range(HS):
    k2 = (k + 1) % HS
    hb.faces.new((hrows[0][k2], hrows[0][k], hbot))
    hb.faces.new((hrows[-1][k], hrows[-1][k2], htop))
bmesh.ops.recalc_face_normals(hb, faces=hb.faces)
for f in hb.faces:
    f.smooth = True
    for l in f.loops:
        v = l.vert.co
        l[huv].uv = ((math.atan2(v.y, v.x) / (2 * pi)) % 1.0, (v.z - HZ0) / (HZ1 - HZ0))
hme = bpy.data.meshes.new('Head'); hb.to_mesh(hme); hb.free()
hme.materials.append(gel)
head = bpy.data.objects.new('Head', hme)
bpy.context.collection.objects.link(head)
head.shape_key_add(name='Basis', from_mix=False)
sk = head.shape_key_add(name='Chin', from_mix=False)
sk.slider_min, sk.slider_max = -1.0, 1.0
for i in range(1, HR):
    t = i / HR
    for k in range(HS):
        sk.data[(i - 1) * HS + k].co = head_pos(t, 2 * pi * k / HS, chin=1.0)
sk.data[(HR - 1) * HS].co = hme.vertices[(HR - 1) * HS].co
sk.data[(HR - 1) * HS + 1].co = hme.vertices[(HR - 1) * HS + 1].co
sk.value = 0.0

print('BODYKEYS', [k.name for k in me.shape_keys.key_blocks], 'verts', len(me.vertices), 'head verts', len(hme.vertices))
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_yup=True, export_materials='EXPORT',
                          export_normals=True, export_texcoords=True, export_morph=True, export_morph_normal=True, export_extras=True)
print('EXPORTED', OUT_GLB)
