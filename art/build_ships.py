# INTRUDER: the human interceptor (~6 m) and the human warship (~300 m). Blender 5.x, 1 unit = 1 metre. Nose +Y (exports to -Z), up +Z.
# Both are one fused hull (voxel remesh of overlapping parts) with details ray-cast onto the skin, like the lander.
#   blender -b --python art/build_ships.py -- public/models/interceptor.glb public/models/warship.glb art/ships.blend
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix, Euler

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for b in list(bpy.data.meshes): bpy.data.meshes.remove(b)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
rnd = random.Random(5)

def hexc(h, a=1.0):
    h = h.lstrip('#'); return (int(h[0:2], 16) / 255) ** 2.2, (int(h[2:4], 16) / 255) ** 2.2, (int(h[4:6], 16) / 255) ** 2.2, a
def mat(name, color, metal=0.5, rough=0.5, emit=None, es=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = hexc(color); n.inputs['Metallic'].default_value = metal; n.inputs['Roughness'].default_value = rough
    if emit: n.inputs['Emission Color'].default_value = hexc(emit); n.inputs['Emission Strength'].default_value = es
    if alpha < 1.0:
        n.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    return m
M = {
    'Hull': mat('Hull', '#b4bcc0', 0.5, 0.45), 'HullDark': mat('HullDark', '#2f363c', 0.5, 0.6), 'Panel': mat('Panel', '#14181c', 0.4, 0.7),
    'Trim': mat('Trim', '#d9a21b', 0.2, 0.55), 'Red': mat('Red', '#c93a2a', 0.2, 0.5, emit='#401008', es=0.5),
    'Glass': mat('Glass', '#6fd9e8', 0.0, 0.05, emit='#0a3a44', es=0.4, alpha=0.4),
    'Engine': mat('EngineGlow', '#ff8a5a', 0.0, 0.3, emit='#ff6a3a', es=6.0), 'EngineBlue': mat('EngineBlue', '#8fe8ff', 0.0, 0.3, emit='#8fe8ff', es=6.0),
    'WindowAmber': mat('WindowAmber', '#ffd88a', 0.0, 0.4, emit='#ffc860', es=3.0), 'WindowCyan': mat('WindowCyan', '#9fe8ff', 0.0, 0.4, emit='#6fe8ff', es=3.0),
    'NavRed': mat('NavRed', '#ff3a2a', 0.0, 0.3, emit='#ff3a2a', es=4.0), 'NavGreen': mat('NavGreen', '#3affa0', 0.0, 0.3, emit='#3affa0', es=4.0),
}

def new_col(name):
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c
def put(name, me, material, smooth, col):
    o = bpy.data.objects.new(name, me); col.objects.link(o)
    if material: me.materials.append(material)
    if smooth: me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    return o
def loft_y(col, name, stations, segs=24, power=2.4, material=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); rings = []
    for (y, rx, rz, cz) in stations:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs; c, s = math.cos(a), math.sin(a)
            ring.append(bm.verts.new((rx * math.copysign(abs(c) ** (2 / power), c), y, cz + rz * math.copysign(abs(s) ** (2 / power), s))))
        rings.append(ring)
    for r in range(len(rings) - 1):
        for i in range(segs): bm.faces.new((rings[r][i], rings[r][(i + 1) % segs], rings[r + 1][(i + 1) % segs], rings[r + 1][i]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    return put(name, me, material, True, col)
def prism(col, name, bot, top, material=None):
    """a prism from a bottom loop of 4 points to a top loop of 4 points (each (x,y,z)) """
    me = bpy.data.meshes.new(name); bm = bmesh.new(); vb = [bm.verts.new(p) for p in bot]; vt = [bm.verts.new(p) for p in top]
    for i in range(4): bm.faces.new((vb[i], vb[(i + 1) % 4], vt[(i + 1) % 4], vt[i]))
    bm.faces.new(vb[::-1]); bm.faces.new(vt)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    return put(name, me, material, False, col)
def slab(col, name, secs, side, material=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); rings = []
    for (x, yf, yb, z0, z1) in secs:
        rings.append([bm.verts.new((side * x, yf, z1)), bm.verts.new((side * x, yb, z1)), bm.verts.new((side * x, yb, z0)), bm.verts.new((side * x, yf, z0))])
    for r in range(len(secs) - 1):
        for i in range(4):
            a, b = rings[r], rings[r + 1]; bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    return put(name, me, material, False, col)
def box(col, name, size, loc, material, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    o = put(name, me, material, False, col); o.scale = size; o.location = loc; o.rotation_euler = rot; return o
def cyl(col, name, r, depth, loc, material, axis='Y', verts=28, r2=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=(r if r2 is None else r2), depth=depth); bm.to_mesh(me); bm.free()
    o = put(name, me, material, True, col); o.location = loc
    if axis == 'Y': o.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == 'X': o.rotation_euler = (0, math.pi / 2, 0)
    return o
def sphere(col, name, r, loc, material, scale=(1, 1, 1)):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=r); bm.to_mesh(me); bm.free()
    o = put(name, me, material, True, col); o.location = loc; o.scale = scale; return o
def active(o): bpy.context.view_layer.objects.active = o
def apply(o):
    active(o)
    for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
def fuse(parts, name, voxel, ratio, material, smooth_iter=5):
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    active(parts[0]); bpy.ops.object.join(); h = bpy.context.view_layer.objects.active; h.name = name
    h.data.materials.clear(); h.data.materials.append(material)
    r = h.modifiers.new('Fuse', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = voxel; r.adaptivity = 0.0; apply(h)
    s = h.modifiers.new('Sm', 'SMOOTH'); s.factor = 0.5; s.iterations = smooth_iter; apply(h)
    d = h.modifiers.new('Dec', 'DECIMATE'); d.decimate_type = 'COLLAPSE'; d.ratio = ratio; apply(h)
    h.data.polygons.foreach_set('use_smooth', [True] * len(h.data.polygons)); return h
def hit_fn(hull):
    def hit(origin, direction):
        ok, loc, n, i = hull.ray_cast(Vector(origin), Vector(direction), distance=1000.0); return (loc, n) if ok else (None, None)
    return hit

# ================================================================== INTERCEPTOR
ci = new_col('Interceptor'); P = []
P.append(loft_y(ci, 'H_Fus', [(-2.4, 0.5, 0.42, 0), (-1.8, 0.62, 0.5, 0.02), (-0.4, 0.66, 0.54, 0.05), (1.0, 0.56, 0.46, 0.04), (2.2, 0.32, 0.26, 0), (3.0, 0.1, 0.09, -0.04)], segs=28, power=2.7))
for sx in (-1, 1):
    P.append(slab(ci, f'H_Wing{sx}', [(0.4, 1.2, -1.9, -0.12, 0.14), (1.8, -0.1, -2.1, -0.07, 0.08), (3.2, -1.3, -2.1, -0.04, 0.04)], sx))
    P.append(prism(ci, f'H_Fin{sx}', [(sx * 0.5, -1.2, 0.0), (sx * 0.8, -1.2, 0.0), (sx * 0.8, -2.3, 0.0), (sx * 0.5, -2.3, 0.0)], [(sx * 0.95, -1.7, 1.0), (sx * 1.1, -1.7, 1.0), (sx * 1.1, -2.2, 1.0), (sx * 0.95, -2.2, 1.0)]))
    P.append(cyl(ci, f'H_Pod{sx}', 0.2, 1.6, (sx * 1.7, -0.9, -0.05), None, axis='Y', verts=16, r2=0.14))        # guns under the wings
P.append(sphere(ci, 'H_Hump', 0.45, (0, 0.5, 0.35), None, scale=(0.85, 1.7, 0.85)))
hull_i = fuse(P, 'Hull', 0.07, 0.3, M['Hull'])
hit = hit_fn(hull_i)
canopy = sphere(ci, 'Canopy', 1.0, (0, 0.7, 0.55), M['Glass'], scale=(0.34, 0.72, 0.3))
cyl(ci, 'Nozzle', 0.34, 0.45, (0, -2.65, 0.02), M['HullDark'], axis='Y', verts=24, r2=0.42)
cyl(ci, 'Exhaust', 0.3, 0.05, (0, -2.9, 0.02), M['Engine'], axis='Y', verts=24)
for sx in (-1, 1):
    loc, n = hit((sx * 8, -2.0, 0.0), (-sx, 0, 0))
    if loc: sphere(ci, f'Nav{sx}', 0.07, (loc.x - sx * 0.02, -2.0, loc.z), M['NavRed'] if sx < 0 else M['NavGreen'])
    loc, n = hit((sx * 8, -1.95, 0.8), (-sx, 0, 0))
    for (y, w) in ((-1.55, 0.5),):
        l2, n2 = hit((sx * 8, y, 0.6), (-sx, 0, 0))
        if l2: box(ci, f'FinStripe{sx}', (0.05, w, 0.12), (l2.x - sx * 0.02, y, 0.6), M['Red'])
    loc, n = hit((sx * 3.6, -1.7, 6), (0, 0, -1))
    if loc: box(ci, f'WingTip{sx}', (0.5, 0.55, 0.06), (sx * 3.0, -1.7, 0.0), M['Red'])
loc, n = hit((0, -1.0, 6), (0, 0, -1))
if loc: box(ci, 'DorsalPlate', (0.5, 0.9, 0.04), (0, -1.0, loc.z), M['HullDark'])

# ================================================================== WARSHIP (~300 m): a long armoured wedge with a bridge tower and engine array
cw = new_col('Warship'); W = []
W.append(loft_y(cw, 'H_Hull', [(-150, 28, 20, 0), (-110, 42, 26, 0), (0, 48, 30, 2), (90, 44, 26, 0), (130, 30, 18, -2), (152, 9, 7, -4)], segs=24, power=3.0))
W.append(loft_y(cw, 'H_Prow', [(100, 30, 16, 14), (135, 22, 12, 12), (155, 6, 5, 8)], segs=20, power=2.6))
W.append(loft_y(cw, 'H_Tower', [(-60, 14, 26, 36), (-30, 20, 34, 48), (10, 18, 30, 50), (40, 10, 18, 44)], segs=20, power=3.0))
for sx in (-1, 1):
    W.append(loft_y(cw, f'H_Pontoon{sx}', [(-120, 12, 12, 0), (-60, 18, 14, 0), (60, 18, 14, 0), (110, 8, 8, 0)], segs=16, power=3.0)); W[-1].location = (sx * 56, 0, -6)
    W.append(box(cw, f'H_Strut{sx}', (30, 80, 8), (sx * 38, 0, -4), None))
    W.append(slab(cw, f'H_Fin{sx}', [(30, -70, -150, 8, 14), (70, -100, -150, 10, 12)], sx))
for ex in (-26, -9, 9, 26):
    W.append(cyl(cw, f'H_Bell{ex}', 9, 24, (ex, -158, 2), None, axis='Y', verts=22, r2=12))
hull_w = fuse(W, 'Hull', 2.0, 0.12, M['Hull'])
hitw = hit_fn(hull_w)
for ex in (-26, -9, 9, 26):
    cyl(cw, f'EngineGlow{ex}', 8.5, 1.0, (ex, -171, 2), M['EngineBlue'], axis='Y', verts=22)
# lit windows, hangar slits and nav lights placed on the real hull
amber = bmesh.new(); cyan = bmesh.new()
for k in range(520):
    y = rnd.uniform(-140, 140); ang = rnd.uniform(0, 2 * math.pi)
    o = Vector((math.cos(ang) * 160, y, 20 + math.sin(ang) * 120)); d = (Vector((0, y, 20)) - o).normalized()
    loc, n = hitw(o, d)
    if not loc: continue
    tgt = amber if rnd.random() < 0.8 else cyan
    rot = n.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bmesh.ops.create_cube(tgt, size=1.0, matrix=Matrix.Translation(loc - n * 0.25) @ rot @ Matrix.Diagonal((rnd.choice([2.0, 3.5, 6.0]), 1.3, 0.8, 1.0)))
for nm, b2, m2 in (('WindowsAmber', amber, M['WindowAmber']), ('WindowsCyan', cyan, M['WindowCyan'])):
    me2 = bpy.data.meshes.new(nm); b2.to_mesh(me2); b2.free(); put(nm, me2, m2, False, cw)
for sx in (-1, 1):
    for y in (-100, 0, 100):
        loc, n = hitw((sx * 200, y, 4), (-sx, 0, 0))
        if loc: box(cw, f'HangarStrip{sx}{y}', (0.6, 40, 3), (loc.x - sx * 0.3, y, 4), M['Trim'])
    loc, n = hitw((sx * 200, -100, 14), (-sx, 0, 0))
    if loc: sphere(cw, f'Nav{sx}', 2.0, (loc.x - sx * 0.5, -100, 14), M['NavRed'] if sx < 0 else M['NavGreen'])
loc, n = hitw((0, 20, 300), (0, 0, -1))
if loc: sphere(cw, 'BridgeLight', 2.5, (0, 20, loc.z + 0.5), M['NavRed'])
loc, n = hitw((0, 40, 300), (0, 0, -1))
if loc: box(cw, 'BridgeGlass', (22, 3, 6), (0, 52, loc.z - 24), M['Glass'])

# a quick studio, then export
world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World'); bpy.context.scene.world = world; world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = hexc('#02040a'); bg.inputs['Strength'].default_value = 0.4
ld = bpy.data.lights.new('Sun', 'SUN'); ld.energy = 3.0; lo = bpy.data.objects.new('Sun', ld); lo.rotation_euler = (math.radians(55), 0, math.radians(35)); bpy.context.scene.collection.objects.link(lo)
for o in bpy.data.collections['Warship'].all_objects: o.location += Vector((60, 0, 0)) if False else Vector((0, 0, 0))

def export(path, colname):
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.collections[colname].all_objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
if len(ARGS) >= 2:
    export(ARGS[0], 'Interceptor'); export(ARGS[1], 'Warship')
if len(ARGS) >= 3: bpy.ops.wm.save_as_mainfile(filepath=ARGS[2])
print('SHIPS built')
