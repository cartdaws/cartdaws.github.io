# INTRUDER: the human research vessel (exterior), ~780 m long. Blender 5.x, 1 unit = 1 metre. Nose +Y (exports to -Z), up +Z.
# The hull is one fused body (spine, bow, bay housing, pylons, engines) with a recess cut for the docking bay; the habitat ring is its own node (it spins).
#   blender -b --python art/build_vessel.py -- public/models/vessel.glb art/vessel.blend
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix, Euler

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for b in list(bpy.data.meshes): bpy.data.meshes.remove(b)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
root = bpy.data.collections.new('Vessel'); bpy.context.scene.collection.children.link(root)
rnd = random.Random(11)

def hexc(h, a=1.0):
    h = h.lstrip('#'); return (int(h[0:2], 16) / 255) ** 2.2, (int(h[2:4], 16) / 255) ** 2.2, (int(h[4:6], 16) / 255) ** 2.2, a
def mat(name, color, metal=0.4, rough=0.55, emit=None, es=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = hexc(color); n.inputs['Metallic'].default_value = metal; n.inputs['Roughness'].default_value = rough
    if emit: n.inputs['Emission Color'].default_value = hexc(emit); n.inputs['Emission Strength'].default_value = es
    return m
M = {
    'Hull': mat('Hull', '#9aa4a8', 0.55, 0.5), 'HullDark': mat('HullDark', '#353d42', 0.5, 0.65), 'Panel': mat('Panel', '#171c20', 0.4, 0.7),
    'Trim': mat('Trim', '#d9a21b', 0.2, 0.55), 'Red': mat('Red', '#c93a2a', 0.2, 0.5),
    'WindowAmber': mat('WindowAmber', '#ffd88a', 0.0, 0.4, emit='#ffc860', es=3.0), 'WindowCyan': mat('WindowCyan', '#9fe8ff', 0.0, 0.4, emit='#6fe8ff', es=3.0),
    'Engine': mat('EngineGlow', '#8fe8ff', 0.0, 0.3, emit='#8fe8ff', es=6.0), 'NavRed': mat('NavRed', '#ff3a2a', 0.0, 0.3, emit='#ff3a2a', es=4.0), 'NavGreen': mat('NavGreen', '#3affa0', 0.0, 0.3, emit='#3affa0', es=4.0),
}

def put(name, me, material=None, smooth=True, col=None):
    o = bpy.data.objects.new(name, me); (col or root).objects.link(o)
    if material: o.data.materials.append(material)
    if smooth: me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    return o

def loft_y(name, stations, segs=24, power=2.4, material=None):
    """rings along Y: (y, half_width_x, half_height_z, centre_z); superellipses."""
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
    return put(name, me, material)

def box(name, size, loc, material, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    o = put(name, me, material, smooth=False); o.scale = size; o.location = loc; o.rotation_euler = rot; return o

def cyl(name, r, depth, loc, material, axis='Y', verts=32, r2=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=(r if r2 is None else r2), depth=depth); bm.to_mesh(me); bm.free()
    o = put(name, me, material); o.location = loc
    if axis == 'Y': o.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == 'X': o.rotation_euler = (0, math.pi / 2, 0)
    return o

def active(o): bpy.context.view_layer.objects.active = o
def apply(o):
    active(o)
    for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)

# ---------------------------------------------------------------- hull parts (they overlap; the remesh fuses them)
parts = []
spine = [(-330, 36, 36, 0), (-250, 44, 44, 0), (-120, 46, 46, 0), (60, 44, 44, 0), (200, 42, 42, 0), (300, 36, 36, 0), (345, 24, 24, 0)]
parts.append(loft_y('H_Spine', spine, segs=20, power=2.8))
parts.append(loft_y('H_Bow', [(300, 34, 34, 0), (345, 30, 30, 0), (385, 18, 18, 0), (402, 6, 6, 0)], segs=20, power=2.4))
# the bay housing: a wide, flat block under the bow; the docking bay is cut into its underside later
parts.append(loft_y('H_BayHousing', [(160, 56, 22, -34), (200, 78, 22, -34), (300, 78, 22, -34), (350, 40, 18, -30)], segs=20, power=4.0))
# cargo and lab modules clamped along the spine on both sides, tied to it by short pylons
for y, sx, w, d, h in [(-200, 1, 22, 90, 26), (-200, -1, 22, 90, 26), (-60, 1, 26, 120, 30), (-60, -1, 26, 120, 30), (110, 1, 20, 70, 24), (110, -1, 20, 70, 24), (0, 0, 40, 60, 18)]:
    if sx == 0:
        parts.append(loft_y('H_Dorsal', [(-100, 22, 14, 48), (-30, 34, 16, 50), (60, 28, 14, 48)], segs=16, power=3.0)); continue
    parts.append(loft_y(f'H_Mod{y}{sx}', [(y - d / 2, w * 0.7, h * 0.7, 0), (y - d / 2 + 6, w, h, 0), (y + d / 2 - 6, w, h, 0), (y + d / 2, w * 0.7, h * 0.7, 0)], segs=16, power=3.2))
    parts[-1].location = (sx * (46 + w * 0.55), 0, 6)
    parts.append(box(f'H_Pylon{y}{sx}', (30, 14, 8), (sx * 46, y, 6), None))
# radiators: big thin panels at the stern, on stalks
for sx in (-1, 1):
    parts.append(box(f'H_RadStalk{sx}', (70, 8, 8), (sx * 70, -265, 20), None))
    parts.append(box(f'H_Rad{sx}', (110, 90, 2.5), (sx * 135, -265, 20), None))
# the engine block at the stern and four bells
parts.append(loft_y('H_EngineBlock', [(-330, 36, 36, 0), (-355, 40, 40, 0), (-378, 34, 34, 0)], segs=20, power=2.4))
for ex, ez in [(-18, 18), (18, 18), (-18, -18), (18, -18)]:
    parts.append(cyl(f'H_Bell{ex}{ez}', 11, 30, (ex, -382, ez), None, axis='Y', verts=24, r2=15))
# the habitat ring's hub-spokes tie into the spine (the ring itself is separate)
for k in range(6):
    a = k * math.pi / 3
    parts.append(box(f'H_Spoke{k}', (5, 8, 124), (0, -80, 0), None, rot=(0, a, 0)))
# an antenna mast and sensor dish on the dorsal ridge
parts.append(cyl('H_Mast', 1.8, 90, (0, 100, 108), None, axis='Z', verts=10))

bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
active(parts[0]); bpy.ops.object.join()
hull = bpy.context.view_layer.objects.active; hull.name = 'Hull'
hull.data.materials.clear(); hull.data.materials.append(M['Hull'])
rm = hull.modifiers.new('Fuse', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 2.2; rm.adaptivity = 0.0; apply(hull)
sm = hull.modifiers.new('Sm', 'SMOOTH'); sm.factor = 0.4; sm.iterations = 3; apply(hull)
dc = hull.modifiers.new('Dec', 'DECIMATE'); dc.decimate_type = 'COLLAPSE'; dc.ratio = 0.14; apply(hull)
hull.data.polygons.foreach_set('use_smooth', [True] * len(hull.data.polygons))
# the docking bay: a rectangular recess cut up into the underside of the bow housing
cut = box('BayCut', (96, 58, 26), (0, 262, -58), None); cut.display_type = 'WIRE'
bm_ = hull.modifiers.new('Bay', 'BOOLEAN'); bm_.operation = 'DIFFERENCE'; bm_.object = cut; bm_.solver = 'EXACT'; apply(hull)
bpy.data.objects.remove(cut, do_unlink=True)

# ---------------------------------------------------------------- the habitat ring: separate, centred on its own origin so it can spin about the ship's axis
RR, rr = 130, 15
me = bpy.data.meshes.new('RingMesh'); bm = bmesh.new(); segs, tsegs = 72, 14; vs = []
for i in range(segs):
    a = 2 * math.pi * i / segs; ring = []
    for j in range(tsegs):
        b = 2 * math.pi * j / tsegs; r2 = RR + rr * math.cos(b) * (1.0 if abs(math.cos(b)) < 0.7 else 0.9)
        ring.append(bm.verts.new((r2 * math.cos(a), rr * 1.35 * math.sin(b), r2 * math.sin(a))))
    vs.append(ring)
for i in range(segs):
    for j in range(tsegs): bm.faces.new((vs[i][j], vs[(i + 1) % segs][j], vs[(i + 1) % segs][(j + 1) % tsegs], vs[i][(j + 1) % tsegs]))
bm.to_mesh(me); bm.free()
ring = put('Ring', me, M['Hull']); ring.location = (0, -80, 0)
# window bands and hull plates on the ring (kept as part of the ring node so they spin with it)
def ring_bits():
    out = []
    for i in range(140):
        a = 2 * math.pi * i / 140 + rnd.uniform(-0.01, 0.01)
        if rnd.random() < 0.25: continue
        w = Vector((math.cos(a), 0, math.sin(a)))
        out.append((w * (RR + rr * 0.78), a, rnd.random() < 0.8))
    return out
amber = bmesh.new(); cyan = bmesh.new()
for (p, a, warm) in ring_bits():
    for (bm_t) in ([amber] if warm else [cyan]):
        bmesh.ops.create_cube(bm_t, size=1.0, matrix=Matrix.Translation((p.x, 0, p.z)) @ Euler((0, -a + math.pi / 2, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((1.8, rr * 0.5, 5.0, 1.0)))
for nm, b2, m2 in (('RingWindowsAmber', amber, M['WindowAmber']), ('RingWindowsCyan', cyan, M['WindowCyan'])):
    me2 = bpy.data.meshes.new(nm); b2.to_mesh(me2); b2.free(); o = put(nm, me2, m2, smooth=False); o.location = ring.location; o.parent = ring; o.location = (0, 0, 0)
for k in range(8):                                                       # plates around the ring
    a = k * math.pi / 4
    pb = bmesh.new(); bmesh.ops.create_cube(pb, size=1.0, matrix=Matrix.Translation(((RR + 4) * math.cos(a), 0, (RR + 4) * math.sin(a))) @ Euler((0, -a + math.pi / 2, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((1.0, rr * 1.7, 34.0, 1.0)))
    pm = bpy.data.meshes.new(f'RingPlate{k}'); pb.to_mesh(pm); pb.free(); o = put(f'RingPlate{k}', pm, M['HullDark'], smooth=False); o.parent = ring

# ---------------------------------------------------------------- windows on the spine and modules: lit strips, each placed on the real hull by ray casting
dg = bpy.context.evaluated_depsgraph_get()
def hit(origin, direction):
    ok, loc, n, i = hull.ray_cast(Vector(origin), Vector(direction), distance=500.0); return (loc, n) if ok else (None, None)
amber = bmesh.new(); cyan = bmesh.new()
for k in range(260):
    y = rnd.uniform(-310, 330); ang = rnd.uniform(0, 2 * math.pi)
    o = Vector((math.cos(ang) * 200, y, math.sin(ang) * 200)); loc, n = hit(o, Vector((-math.cos(ang), 0, -math.sin(ang))))
    if not loc or abs(loc.x) > 180: continue
    if loc.z < -20 and abs(y - 262) < 60: continue                      # leave the bay clear
    tgt = amber if rnd.random() < 0.78 else cyan
    rot = n.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bmesh.ops.create_cube(tgt, size=1.0, matrix=Matrix.Translation(loc - n * 0.3) @ rot @ Matrix.Diagonal((rnd.choice([3.0, 5.0, 8.0]), 1.6, 0.9, 1.0)))
for nm, b2, m2 in (('WindowsAmber', amber, M['WindowAmber']), ('WindowsCyan', cyan, M['WindowCyan'])):
    me2 = bpy.data.meshes.new(nm); b2.to_mesh(me2); b2.free(); put(nm, me2, m2, smooth=False)

# engine glows, nav lights
for ex, ez in [(-18, 18), (18, 18), (-18, -18), (18, -18)]:
    cyl(f'EngineGlow{ex}{ez}', 11, 1.2, (ex, -399, ez), M['Engine'], axis='Y', verts=24)
for sx, m2, nm in ((-1, M['NavRed'], 'NavRed'), (1, M['NavGreen'], 'NavGreen')):
    me2 = bpy.data.meshes.new(nm); b2 = bmesh.new(); bmesh.ops.create_uvsphere(b2, u_segments=10, v_segments=8, radius=2.5, matrix=Matrix.Translation((sx * 190, -265, 20))); b2.to_mesh(me2); b2.free(); put(nm, me2, m2)
me2 = bpy.data.meshes.new('MastBeacon'); b2 = bmesh.new(); bmesh.ops.create_uvsphere(b2, u_segments=10, v_segments=8, radius=2.2, matrix=Matrix.Translation((0, 100, 155))); b2.to_mesh(me2); b2.free(); put('MastBeacon', me2, M['NavRed'])

# ---------------------------------------------------------------- hazard stripes at the bay mouth
for sx in (-1, 1):
    loc, n = hit((sx * 60, 262, -200), Vector((0, 0, 1)))
    if loc: box(f'BayStripe{sx}', (6, 58, 1.2), (sx * 52, 262, loc.z - 0.6), M['Trim'])

tri = sum(max(1, len(p.vertices) - 2) for o in root.all_objects if o.type == 'MESH' for p in o.data.polygons)
print('VESSEL built:', len([o for o in root.all_objects if o.type == 'MESH']), 'meshes, ~', tri, 'faces')

world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World'); bpy.context.scene.world = world; world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = hexc('#02040a'); bg.inputs['Strength'].default_value = 0.4
ld = bpy.data.lights.new('Sun', 'SUN'); ld.energy = 3.0; ld.color = (1.0, 0.94, 0.86); lo = bpy.data.objects.new('Sun', ld); lo.rotation_euler = (math.radians(55), 0, math.radians(35)); bpy.context.scene.collection.objects.link(lo)

if len(ARGS) >= 1:
    bpy.ops.object.select_all(action='DESELECT')
    for o in root.all_objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=ARGS[0], export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
if len(ARGS) >= 2: bpy.ops.wm.save_as_mainfile(filepath=ARGS[1])
