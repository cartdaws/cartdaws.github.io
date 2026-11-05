"""Alien manipulator and Shardcaster, authored for the first-person view.
Run: blender -b --python art/build_hand.py -- <out.glb> <out.blend>

Model frame (Blender): wrist at the origin, the arm points along +Y (exports to -Z, "forward" in the game), elbow end at y = -0.66.
Z is up, digits are arranged radially around the Y axis (four digits), so the same hand closes into a ring around the weapon barrel.

Exports one continuous gel skin ("Hand") with four morph targets (Grip, Weapon, Spread, Swell), separate inner structures
("Core": nerve cord + palm core, "Gland": venom sac), the weapon organ ("Barrel", "Maw", "Tooth"). All pivots sit at the wrist.
The skin is built as a union of tapered volumes, voxel-remeshed into one watertight surface, smoothed and decimated, so there are
no loose strands or overlapping shells. Morph targets are generated from a real bend model: each digit bends along a constant-curvature arc.
"""
import bpy, bmesh, sys, os, math, random
from math import pi, sin, cos, sqrt
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(11)

DIGITS = [  # (angle about Y from +X toward +Z, length, base radius, tip radius)
    (pi * 0.25, 0.165, 0.021, 0.0075),
    (pi * 0.75, 0.165, 0.021, 0.0075),
    (pi * 1.25, 0.135, 0.024, 0.009),
    (pi * 1.75, 0.135, 0.024, 0.009),
]
RING = 0.045          # radial offset of digit bases from the axis
Y0 = 0.075            # y of the digit bases
PHI0 = 0.30           # resting splay (radians away from the axis)


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def forearm_radius(y):
    t = (y + 1.3) / 1.3                         # 0 at the (off-screen) elbow end, 1 at the wrist
    base = 0.088 - 0.043 * (t ** 1.6)
    belly = 0.011 * math.exp(-((y + 0.3) / 0.11) ** 2)
    wrist = 0.006 * math.exp(-((y + 0.012) / 0.014) ** 2)
    return base + belly + wrist


# ---------------------------------------------------------------- union of volumes -> one remeshed skin
vol = bmesh.new()


def blob(c, rx, ry, rz, seg=14):
    res = bmesh.ops.create_uvsphere(vol, u_segments=seg, v_segments=max(6, seg // 2), radius=1.0)
    for v in res['verts']:
        v.co = Vector((c[0] + v.co.x * rx, c[1] + v.co.y * ry, c[2] + v.co.z * rz))


y = -1.3
while y <= 0.012:                                                       # forearm: slightly flattened oval section
    r = forearm_radius(y)
    blob((0, y, 0), r * 1.08, 0.016, r * 0.94, 12)
    y += 0.012
blob((0, 0.05, 0), 0.066, 0.056, 0.05, 18)                              # palm
for (a, L, r0, r1) in DIGITS:
    rh = Vector((cos(a), 0, sin(a)))
    blob((rh.x * RING * 0.8, Y0 - 0.012, rh.z * RING * 0.8), 0.03, 0.03, 0.03, 12)    # web between palm and digit
    d0 = Vector((0, cos(PHI0), 0)) + rh * sin(PHI0)
    c0 = rh * RING + Vector((0, Y0, 0))
    n = 18
    for i in range(n + 1):
        s = i / n
        r = r0 + (r1 - r0) * (s ** 0.8)
        c = c0 + d0 * (s * L)
        blob(c, r, r, r, 10)
    # knuckle swelling at the first joint
    blob(c0 + d0 * (0.05), r0 * 1.12, r0 * 1.12, r0 * 1.12, 10)

me = bpy.data.meshes.new('Hand')
vol.to_mesh(me)
vol.free()
hand = bpy.data.objects.new('Hand', me)
bpy.context.collection.objects.link(hand)
bpy.context.view_layer.objects.active = hand
hand.select_set(True)
m = hand.modifiers.new('rm', 'REMESH')
m.mode = 'VOXEL'
m.voxel_size = 0.0052
m.adaptivity = 0.0
bpy.ops.object.modifier_apply(modifier='rm')
for name, kind, kw in (('sm', 'SMOOTH', dict(factor=0.9, iterations=14)), ):
    mod = hand.modifiers.new(name, kind)
    mod.factor = kw['factor']
    mod.iterations = kw['iterations']
    bpy.ops.object.modifier_apply(modifier=name)
dec = hand.modifiers.new('dc', 'DECIMATE')
dec.ratio = 0.22
bpy.ops.object.modifier_apply(modifier='dc')
sm2 = hand.modifiers.new('sm2', 'SMOOTH')
sm2.factor = 0.5
sm2.iterations = 4
bpy.ops.object.modifier_apply(modifier='sm2')
for poly in hand.data.polygons:
    poly.use_smooth = True
print('HAND verts', len(hand.data.vertices), 'faces', len(hand.data.polygons))

# UVs: simple cylindrical (u around the axis, v along it) so the game shader can drive veins and bands
bm = bmesh.new()
bm.from_mesh(hand.data)
uvl = bm.loops.layers.uv.verify()
for f in bm.faces:
    for loop in f.loops:
        v = loop.vert.co
        loop[uvl].uv = ((math.atan2(v.z, v.x) / (2 * pi)) % 1.0, (v.y + 1.3) / 1.6)
bm.to_mesh(hand.data)
bm.free()
mat_gel = bpy.data.materials.new('Gel'); mat_gel.use_nodes = True
hand.data.materials.append(mat_gel)

# ---------------------------------------------------------------- morph targets from a digit bend model
verts = [v.co.copy() for v in hand.data.vertices]
basis = hand.shape_key_add(name='Basis', from_mix=False)


def bend_pose(thetas, swell=0.0):
    """Return new vertex positions. thetas: bend (radians) per digit, negative curls towards the axis."""
    out = []
    for p in verts:
        q = p.copy()
        best = None
        for k, (a, L, r0, r1) in enumerate(DIGITS):
            rh = Vector((cos(a), 0, sin(a)))
            tau = Vector((-sin(a), 0, cos(a)))
            d0 = Vector((0, cos(PHI0), 0)) + rh * sin(PHI0)
            n0 = Vector((0, -sin(PHI0), 0)) + rh * cos(PHI0)
            c0 = rh * RING + Vector((0, Y0, 0))
            rel = p - c0
            t = rel.dot(d0)
            if t < 0:
                continue
            qr, qt = rel.dot(n0), rel.dot(tau)
            lat = sqrt(qr * qr + qt * qt)
            if best is None or lat < best[0]:
                best = (lat, k, t, qr, qt, c0, rh, tau, a, L)
        if best is not None and thetas is not None:
            lat, k, t, qr, qt, c0, rh, tau, a, L = best
            w = 1.0 - smoothstep(0.024, 0.036, lat)
            th = thetas[k]
            if w > 0 and abs(th) > 1e-6:
                steps = max(1, int(t / 0.004))
                du = t / steps
                C = c0.copy()
                phi = PHI0
                for i in range(steps):
                    u = (i + 0.5) * du
                    phi = PHI0 + th * min(u, L) / L
                    C += (Vector((0, cos(phi), 0)) + rh * sin(phi)) * du
                phi = PHI0 + th * min(t, L) / L
                nrm = Vector((0, -sin(phi), 0)) + rh * cos(phi)
                newp = C + nrm * qr + tau * qt
                q = p.lerp(newp, w)
        if swell > 0 and -0.5 < p.y < -0.02:
            bump = math.exp(-((p.y + 0.22) / 0.13) ** 2)
            top = 1.0 + 0.55 * max(0.0, p.z / 0.08)
            k = 1.0 + swell * 0.4 * bump * top
            q = Vector((q.x * (1.0 + (k - 1.0) * 0.8), q.y, q.z * k))
        out.append(q)
    return out


def add_key(name, thetas, swell=0.0):
    sk = hand.shape_key_add(name=name, from_mix=False)
    pos = bend_pose(thetas, swell)
    for i, p in enumerate(pos):
        sk.data[i].co = p
    sk.value = 0.0


add_key('Grip', [-1.15, -1.15, -1.25, -1.25])
add_key('Weapon', [-0.55, -0.55, -0.62, -0.62], swell=0.0)
add_key('Spread', [0.6, 0.6, 0.65, 0.65])
add_key('Swell', None, swell=1.0)


# ---------------------------------------------------------------- inner structures (kept few and quiet)
def lofted(name, pts, radius_fn, seg=10):
    pm = bmesh.new()
    rows = []
    frames = []
    for i, p in enumerate(pts):
        tan = (pts[min(len(pts) - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        up = Vector((0, 0, 1)) if abs(tan.z) < 0.9 else Vector((1, 0, 0))
        nx = tan.cross(up).normalized()
        nz = nx.cross(tan).normalized()
        r = radius_fn(i / (len(pts) - 1))
        row = [pm.verts.new(p + (nx * cos(2 * pi * j / seg) + nz * sin(2 * pi * j / seg)) * r) for j in range(seg)]
        rows.append(row)
    for i in range(len(rows) - 1):
        for j in range(seg):
            pm.faces.new((rows[i][j], rows[i][(j + 1) % seg], rows[i + 1][(j + 1) % seg], rows[i + 1][j]))
    for row, flip in ((rows[0], True), (rows[-1], False)):
        c = pm.verts.new(sum((v.co for v in row), Vector()) / seg)
        for j in range(seg):
            pm.faces.new((c, row[(j + 1) % seg], row[j]) if flip else (c, row[j], row[(j + 1) % seg]))
    msh = bpy.data.meshes.new(name)
    pm.to_mesh(msh)
    pm.free()
    for poly in msh.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, msh)
    bpy.context.collection.objects.link(ob)
    return ob


mat_core = bpy.data.materials.new('GelCore'); mat_core.use_nodes = True
cord_pts = [Vector((0.004 * sin(i * 0.9), -1.2 + i * 0.07, 0.006 * cos(i * 0.7))) for i in range(18)]
cord = lofted('Core', cord_pts, lambda t: 0.0075 * (1.0 - 0.3 * t) + 0.0015 * sin(t * 20), seg=8)
cord.data.materials.append(mat_core)
# palm core: a lumpy nucleus in the palm
pb = bmesh.new()
res = bmesh.ops.create_icosphere(pb, subdivisions=2, radius=0.022)
for v in res['verts']:
    n = v.co.normalized()
    v.co = n * 0.022 * (1 + 0.18 * sin(n.x * 7 + n.y * 3) * cos(n.z * 6))
    v.co += Vector((0, 0.052, 0))
core_m = bpy.data.meshes.new('PalmCore')
pb.to_mesh(core_m)
pb.free()
for poly in core_m.polygons:
    poly.use_smooth = True
palm = bpy.data.objects.new('PalmCore', core_m)
bpy.context.collection.objects.link(palm)
palm.data.materials.append(mat_core)

# venom gland sac under the swelling on top of the forearm
gb = bmesh.new()
res = bmesh.ops.create_uvsphere(gb, u_segments=20, v_segments=12, radius=1.0)
for v in res['verts']:
    v.co = Vector((v.co.x * 0.036, -0.22 + v.co.y * 0.1, 0.042 + v.co.z * 0.026))
gl_m = bpy.data.meshes.new('Gland')
gb.to_mesh(gl_m)
gb.free()
for poly in gl_m.polygons:
    poly.use_smooth = True
gland = bpy.data.objects.new('Gland', gl_m)
bpy.context.collection.objects.link(gland)
gland.data.materials.append(mat_core)

# ---------------------------------------------------------------- weapon organ: barrel with bore, muzzle ring (maw), crystal tooth
def lathe_y(name, profile, seg=28, closed_ends=False):
    """Revolve [(radius, y)] about the Y axis."""
    lb = bmesh.new()
    rows = []
    for (r, yy) in profile:
        rows.append([lb.verts.new(Vector((cos(2 * pi * j / seg) * r, yy, sin(2 * pi * j / seg) * r))) for j in range(seg)])
    for i in range(len(rows) - 1):
        for j in range(seg):
            lb.faces.new((rows[i][j], rows[i][(j + 1) % seg], rows[i + 1][(j + 1) % seg], rows[i + 1][j]))
    msh = bpy.data.meshes.new(name)
    lb.to_mesh(msh)
    lb.free()
    for poly in msh.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, msh)
    bpy.context.collection.objects.link(ob)
    return ob


# outer wall (from the palm to the lip), lip rolled over, then the bore walking back inside: one continuous, closed shell
barrel_profile = [(0.034, 0.02), (0.036, 0.07), (0.032, 0.14), (0.03, 0.2), (0.036, 0.25), (0.046, 0.28), (0.05, 0.295), (0.046, 0.308), (0.034, 0.308),
                  (0.022, 0.285), (0.019, 0.2), (0.019, 0.08), (0.0, 0.07)]
barrel = lathe_y('Barrel', barrel_profile, seg=28)
barrel.data.materials.append(mat_gel)
# muzzle maw: thin glowing ring set just inside the lip
maw = lathe_y('Maw', [(0.026, 0.262), (0.031, 0.278), (0.033, 0.286), (0.026, 0.29), (0.021, 0.278)], seg=28)
maw.data.materials.append(mat_core)
# crystal tooth: faceted shard growing from the throat towards the muzzle
cb = bmesh.new()
rings = [(0.0, 0.01), (0.03, 0.016), (0.07, 0.012)]
rv = []
for (yy, r) in rings:
    rv.append([cb.verts.new(Vector((cos(2 * pi * j / 6 + 0.3) * r, 0.12 + yy, sin(2 * pi * j / 6 + 0.3) * r))) for j in range(6)])
apex = cb.verts.new(Vector((0, 0.12 + 0.14, 0)))
back = cb.verts.new(Vector((0, 0.12 - 0.012, 0)))
for k in range(len(rv) - 1):
    for j in range(6):
        cb.faces.new((rv[k][j], rv[k][(j + 1) % 6], rv[k + 1][(j + 1) % 6], rv[k + 1][j]))
for j in range(6):
    cb.faces.new((back, rv[0][(j + 1) % 6], rv[0][j]))
    cb.faces.new((apex, rv[-1][j], rv[-1][(j + 1) % 6]))
bmesh.ops.recalc_face_normals(cb, faces=cb.faces)
tm = bpy.data.meshes.new('Tooth')
cb.to_mesh(tm)
cb.free()
tooth = bpy.data.objects.new('Tooth', tm)
bpy.context.collection.objects.link(tooth)
tooth.data.materials.append(mat_core)

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
                          export_materials='EXPORT', export_normals=True, export_texcoords=True, export_morph=True, export_morph_normal=True)
print('EXPORTED', OUT_GLB, [o.name for o in bpy.data.objects], 'keys', [k.name for k in hand.data.shape_keys.key_blocks])
