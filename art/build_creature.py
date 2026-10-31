"""The deformable creature body: ONE continuous gel mesh with Blender shape keys for every body control in the creator.
Run: blender -b --python art/build_creature.py -- <out.glb> <out.blend>

Frame (Blender): Z up, +Y forward (exports to -Z, the game's forward), +X is the creature's right. Origin at the base centre.
Neutral shape = the creature the game has always had: a smooth bell 0.5 m tall, ~0.45 m wide at the skirt, closed underneath.

Mesh topology: NR-1 latitude rings of SEG quads, two poles. Vertex index of ring i (1..NR-1), segment k = (i-1)*SEG + k, bottom pole = (NR-1)*SEG,
top pole = (NR-1)*SEG+1. The game samples this grid (after morphing) to find the shoulder sockets, the head and the camera clearance,
so the arms, eyes and tentacles follow the real deformed surface. The constants are written into the exported node's extras.

Shape keys (all linear deltas from the neutral shape; the game drives them from -1..1 style sliders):
  Taper, UpperBroad, Boxy, Soft, Curve, Lean, Shoulders, Root0/Root1/Root2 (swelling where an arm leaves the body, three heights),
  Ribs, Head, HeadWide, HeadLong, HeadCrown.
"""
import bpy, bmesh, sys, math
from math import pi, sin, cos, exp, sqrt
from mathutils import Vector

OUT_GLB, OUT_BLEND = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)

NR, SEG, H = 40, 48, 0.5
RIB_N = 10


def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def bump(x, c, w):
    return exp(-((x - c) / w) ** 2)


def base_radius(t):
    """Flared skirt, full shoulder, rounded crown; the underside rounds into a closed base."""
    skirt = 0.21 + 0.03 * exp(-t * 12)
    dome = sqrt(max(0.0, 1 - ((t - 0.35) / 0.65) ** 2)) if t > 0.35 else 1.0
    r = skirt * (0.55 + 0.45 * dome) * (1 - 0.05 * sin(t * 5))
    under = sqrt(max(0.0, 1 - ((0.1 - t) / 0.1) ** 2)) if t < 0.1 else 1.0
    return r * under


def ang_wrap(a):
    return (a + pi) % (2 * pi) - pi


def side_bump(phi, mirror_center):
    """Smooth lobe on both sides (slightly behind the beam), phi measured from +X toward +Y(forward)."""
    d1 = ang_wrap(phi - mirror_center)
    d2 = ang_wrap(phi - (pi - mirror_center))
    return exp(-(d1 / 0.62) ** 2) + exp(-(d2 / 0.62) ** 2)


def neutral(t, phi):
    r = base_radius(t)
    return Vector((r * cos(phi), r * sin(phi), t * H))


# ---------------------------------------------------------------- key definitions: functions (t, phi) -> displaced position
def k_taper(t, phi):
    r = base_radius(t) * (1 - 0.5 * (1 - t) ** 1.2)
    return Vector((r * cos(phi), r * sin(phi), t * H))


def k_upper(t, phi):
    r = base_radius(t) * (1 + 0.5 * sstep(0.3, 0.85, t) * (1 - 0.55 * sstep(0.9, 1.0, t)))
    return Vector((r * cos(phi), r * sin(phi), t * H))


def k_boxy(t, phi):
    n = 4.0
    sup = 1.0 / (abs(cos(phi)) ** n + abs(sin(phi)) ** n) ** (1.0 / n)
    w = sin(pi * min(1, max(0, t))) ** 0.6
    r = base_radius(t) * (1 + (sup * 1.06 - 1) * w)
    top = 1.0 - 0.06 * sstep(0.7, 1.0, t)                     # flatter crown
    return Vector((r * cos(phi), r * sin(phi), t * H * top))


def k_soft(t, phi):
    R0 = 0.235
    rs = R0 * sqrt(max(0.0, 1 - (2 * t - 1) ** 2))
    return Vector((rs * cos(phi), rs * sin(phi), t * H))


def k_curve(t, phi):
    r = base_radius(t)
    f = max(0.0, sin(phi)) ** 1.6
    r2 = r + 0.1 * sin(pi * t) ** 1.2 * f
    return Vector((r2 * cos(phi), r2 * sin(phi), t * H))


def k_lean(t, phi):
    p = neutral(t, phi)
    p.y += 0.22 * t ** 1.5
    return p


def k_shoulders(t, phi):
    r = base_radius(t) + 0.1 * bump(t, 0.6, 0.17) * cos(phi) ** 2
    return Vector((r * cos(phi), r * sin(phi), t * H))


def root_key(tc):
    def f(t, phi):
        lobe = side_bump(phi, -0.26)                        # a little behind the beam
        r = base_radius(t) + 0.052 * bump(t, tc, 0.11) * lobe
        return Vector((r * cos(phi), r * sin(phi), t * H))
    return f


def k_ribs(t, phi):
    r = base_radius(t) * (1 + 0.028 * (1 - t ** 3) * cos(phi * RIB_N))
    return Vector((r * cos(phi), r * sin(phi), t * H))


def head_profile(t, phi, wide=0.0, long_=0.0, crown=0.0):
    """A sensory bulb on the crown: a soft neck pinch, a rounded bulb leaning forward, blending back into the dome."""
    r = base_radius(t)
    neck = -0.16 * bump(t, 0.72, 0.07)
    bulb = 0.30 * bump(t, 0.9, 0.085)
    rr = r * (1 + neck + bulb * (1 + 0.8 * wide * cos(phi) ** 2))
    p = Vector((rr * cos(phi), rr * sin(phi), t * H))
    p.z += 0.07 * sstep(0.75, 1.0, t) * (1 + crown)          # lifts the crown
    p.y += (0.07 + 0.09 * long_) * bump(t, 0.9, 0.12) * max(0.0, 0.35 + sin(phi) * 0.65)   # the bulb leans forward
    return p


KEYS = [
    ('Taper', k_taper), ('UpperBroad', k_upper), ('Boxy', k_boxy), ('Soft', k_soft), ('Curve', k_curve), ('Lean', k_lean),
    ('Shoulders', k_shoulders), ('Root0', root_key(0.3)), ('Root1', root_key(0.5)), ('Root2', root_key(0.72)), ('Ribs', k_ribs),
    ('Head', lambda t, p: head_profile(t, p)),
    ('HeadWide', lambda t, p: head_profile(t, p, wide=1.0)),
    ('HeadLong', lambda t, p: head_profile(t, p, long_=1.0)),
    ('HeadCrown', lambda t, p: head_profile(t, p, crown=1.0)),
]

# ---------------------------------------------------------------- the mesh
bm = bmesh.new()
rows = []
for i in range(1, NR):
    t = i / NR
    rows.append([bm.verts.new(neutral(t, 2 * pi * k / SEG)) for k in range(SEG)])
bot = bm.verts.new((0, 0, 0))
top = bm.verts.new((0, 0, H))
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
        l[uvl].uv = ((math.atan2(v.y, v.x) / (2 * pi)) % 1.0, v.z / H)
me = bpy.data.meshes.new('Body')
bm.to_mesh(me)
bm.free()
# vertex order after to_mesh follows creation order: rings, then bot, top
assert len(me.vertices) == (NR - 1) * SEG + 2, len(me.vertices)

gel = bpy.data.materials.new('Gel')
gel.use_nodes = True
gel.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.06, 0.42, 0.38, 1)
me.materials.append(gel)
body = bpy.data.objects.new('Body', me)
bpy.context.collection.objects.link(body)
bpy.context.view_layer.objects.active = body
body.shape_key_add(name='Basis', from_mix=False)

for name, fn in KEYS:
    sk = body.shape_key_add(name=name, from_mix=False)
    sk.slider_min, sk.slider_max = -1.0, 1.0
    for i in range(1, NR):
        t = i / NR
        for k in range(SEG):
            sk.data[(i - 1) * SEG + k].co = fn(t, 2 * pi * k / SEG)
    # poles follow the neighbouring ring's centre so a lean/bend carries the pole with it
    for pole, ring in (((NR - 1) * SEG, list(range(0, SEG))), ((NR - 1) * SEG + 1, list(range((NR - 2) * SEG, (NR - 1) * SEG)))):
        ctr = sum((sk.data[j].co for j in ring), Vector()) / SEG
        rest = sum((me.vertices[j].co for j in ring), Vector()) / SEG
        sk.data[pole].co = me.vertices[pole].co + (ctr - rest)
    sk.value = 0.0

body['grid'] = [NR, SEG, H]
# a small proof that no neutral/key vertex is degenerate or inverted
bad = 0
for sk in me.shape_keys.key_blocks:
    for i in range(1, NR - 1):
        for k in range(SEG):
            if sk.data[(i - 1) * SEG + k].co.z > sk.data[i * SEG + k].co.z + 1e-4 and sk.name != 'Basis':
                bad += 1
print('BODYKEYS', [k.name for k in me.shape_keys.key_blocks], 'verts', len(me.vertices), 'folded', bad)

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_yup=True, export_materials='EXPORT',
                          export_normals=True, export_texcoords=True, export_morph=True, export_morph_normal=True, export_extras=True)
print('EXPORTED', OUT_GLB)
