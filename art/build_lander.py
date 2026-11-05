# INTRUDER: the human lander (hero model), v2: ONE fused airframe. Blender 5.x. Nose points +Y (exports to -Z in glTF), up is +Z. About 8 m long.
# The hull parts (fuselage, blended wings, nacelles, twin tail fins) overlap on purpose and are merged with a voxel remesh into a single
# connected, smooth body; details (panels, stripes, vents, nozzles, glass, cockpit) are then embedded into it so nothing floats.
# Run inside Blender (MCP: exec(open(path).read())) or headless:
#   blender -b --python art/build_lander.py -- public/models/lander.glb art/lander.blend
import bpy, bmesh, math, sys
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for b in list(bpy.data.meshes): bpy.data.meshes.remove(b)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
root = bpy.data.collections.new('Lander'); bpy.context.scene.collection.children.link(root)

def hexc(h, a=1.0):
    h = h.lstrip('#'); return (int(h[0:2], 16) / 255) ** 2.2, (int(h[2:4], 16) / 255) ** 2.2, (int(h[4:6], 16) / 255) ** 2.2, a

def mat(name, color, metal=0.0, rough=0.5, emit=None, emit_strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = hexc(color)
    n.inputs['Metallic'].default_value = metal; n.inputs['Roughness'].default_value = rough
    if emit:
        n.inputs['Emission Color'].default_value = hexc(emit); n.inputs['Emission Strength'].default_value = emit_strength
    if alpha < 1.0:
        n.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    return m

M = {
    'Hull': mat('Hull', '#aeb7bc', 0.5, 0.4),
    'HullDark': mat('HullDark', '#2b3238', 0.5, 0.6),
    'Panel': mat('Panel', '#14181c', 0.4, 0.7),
    'Trim': mat('Trim', '#d9a21b', 0.2, 0.55),
    'Red': mat('Red', '#c93a2a', 0.2, 0.5),
    'Glass': mat('Glass', '#6fd9e8', 0.0, 0.05, emit='#0a3a44', emit_strength=0.4, alpha=0.32),
    'ScreenCyan': mat('EmissiveCyan', '#6fe8ff', 0.0, 0.3, emit='#6fe8ff', emit_strength=2.4),
    'ScreenAmber': mat('EmissiveAmber', '#ffb040', 0.0, 0.3, emit='#ffb040', emit_strength=2.2),
    'NavRed': mat('EmissiveRed', '#ff3a2a', 0.0, 0.3, emit='#ff3a2a', emit_strength=3.0),
    'NavGreen': mat('EmissiveGreen', '#3affa0', 0.0, 0.3, emit='#3affa0', emit_strength=3.0),
    'Engine': mat('EngineGlow', '#8fe8ff', 0.0, 0.3, emit='#8fe8ff', emit_strength=5.0),
    'Seat': mat('Seat', '#3a4650', 0.0, 0.85),
}

# ------------------------------------------------------------------ helpers
def link(obj, col=root):
    col.objects.link(obj); return obj

def new_obj(name, me, material=None, smooth=True, col=None):
    o = bpy.data.objects.new(name, me); link(o, col or root)
    if material: o.data.materials.append(material)
    if smooth: me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    return o

def loft(name, stations, segs=32, power=2.6, material=None, col=None):
    """stations: (y, half_width, half_height, centre_z). Superellipse rings joined into one smooth body."""
    me = bpy.data.meshes.new(name); bm = bmesh.new(); rings = []
    for (y, rx, rz, cz) in stations:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs; c, s = math.cos(a), math.sin(a)
            ring.append(bm.verts.new((rx * math.copysign(abs(c) ** (2 / power), c), y, rz * math.copysign(abs(s) ** (2 / power), s) + cz)))
        rings.append(ring)
    for r in range(len(rings) - 1):
        for i in range(segs):
            bm.faces.new((rings[r][i], rings[r][(i + 1) % segs], rings[r + 1][(i + 1) % segs], rings[r + 1][i]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    return new_obj(name, me, material, col=col)

def slab(name, secs, side, material=None, col=None):
    """A swept wing from sections (x, y_front, y_back, z_low, z_high); mirrored by `side`."""
    me = bpy.data.meshes.new(name); bm = bmesh.new(); rings = []
    for (x, yf, yb, z0, z1) in secs:
        rings.append([bm.verts.new((side * x, yf, z1)), bm.verts.new((side * x, yb, z1)), bm.verts.new((side * x, yb, z0)), bm.verts.new((side * x, yf, z0))])
    for r in range(len(secs) - 1):
        for i in range(4):
            a, b = rings[r], rings[r + 1]; bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    return new_obj(name, me, material, smooth=False, col=col)

def cyl(name, r, depth, loc, material=None, axis='Y', verts=28, r2=None, col=None, smooth=True):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=(r if r2 is None else r2), depth=depth); bm.to_mesh(me); bm.free()
    o = new_obj(name, me, material, smooth, col)
    if axis == 'Y': o.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == 'X': o.rotation_euler = (0, math.pi / 2, 0)
    o.location = loc; return o

def sphere(name, r, loc, material=None, scale=(1, 1, 1), seg=28, rings=16, col=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r); bm.to_mesh(me); bm.free()
    o = new_obj(name, me, material, col=col); o.location = loc; o.scale = scale; return o

def block(name, size, loc, material, rot=(0, 0, 0), bevel=0.0, col=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    o = new_obj(name, me, material, smooth=False, col=col); o.scale = size; o.location = loc; o.rotation_euler = rot
    if bevel:
        md = o.modifiers.new('Bevel', 'BEVEL'); md.width = bevel; md.segments = 2; md.limit_method = 'ANGLE'
    return o

def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for md in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=md.name)

# ------------------------------------------------------------------ 1. the hull parts: they overlap so the remesh fuses them into one body
parts = []
fus = loft('H_Fuselage', [
    (-3.9, 0.55, 0.46, 0.00), (-3.4, 0.80, 0.62, 0.02), (-2.4, 0.98, 0.74, 0.04), (-1.0, 1.02, 0.80, 0.06),
    (0.4, 0.92, 0.76, 0.12), (1.3, 0.78, 0.66, 0.18), (2.3, 0.54, 0.44, 0.08), (3.1, 0.30, 0.26, -0.02), (3.6, 0.10, 0.10, -0.10),
], segs=36, power=2.8)
parts.append(fus)

# blended wings: thick at the root where they flow out of the fuselage, long leading-edge extension forward along the body, thin at the tip
for sx in (-1, 1):
    parts.append(slab(f'H_Wing{sx}', [
        (0.4, 1.9, -3.2, -0.22, 0.26), (1.6, 0.6, -3.3, -0.14, 0.18), (3.2, -0.9, -3.4, -0.08, 0.10), (4.9, -2.3, -3.3, -0.04, 0.05)], sx))
    # tail fin: canted outward, rooted deep in the nacelle, tapering as it rises
    fm = bpy.data.meshes.new(f'FinMesh{sx}'); bm = bmesh.new()
    def rect(x0, x1, y0, y1, z): return [bm.verts.new((sx * x0, y0, z)), bm.verts.new((sx * x1, y0, z)), bm.verts.new((sx * x1, y1, z)), bm.verts.new((sx * x0, y1, z))]
    vb = rect(1.15, 1.55, -1.9, -3.95, 0.0); vt = rect(1.75, 1.95, -3.0, -3.85, 1.75)
    for i in range(4): bm.faces.new((vb[i], vb[(i + 1) % 4], vt[(i + 1) % 4], vt[i]))
    bm.faces.new(vb[::-1]); bm.faces.new(vt)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(fm); bm.free()
    parts.append(new_obj(f'H_Fin{sx}', fm, None, smooth=False))
    # engine nacelle, buried in the wing root so it grows out of it
    nac = cyl(f'H_Nacelle{sx}', 0.40, 3.0, (sx * 1.35, -2.8, 0.03), None, axis='Y', verts=32, r2=0.34)
    parts.append(nac)
    # intake lip blends into the nacelle nose
    parts.append(sphere(f'H_NacNose{sx}', 0.40, (sx * 1.35, -1.35, 0.03), None, scale=(1, 1.1, 1)))
    # a short stub boom ties the wing pod to the wing
    parts.append(cyl(f'H_Pod{sx}', 0.15, 1.5, (sx * 3.4, -1.9, -0.06), None, axis='Y', verts=16, r2=0.1))
# dorsal fairing: a long, low ridge growing out of the canopy back to the tail
parts.append(loft('H_Dorsal', [(-3.4, 0.2, 0.12, 0.62), (-2.0, 0.34, 0.2, 0.78), (-0.6, 0.4, 0.22, 0.84), (0.3, 0.3, 0.16, 0.86)], segs=20, power=2.4))

bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = fus
bpy.ops.object.join()
hull = bpy.context.view_layer.objects.active; hull.name = 'Hull'
hull.data.materials.clear(); hull.data.materials.append(M['Hull'])

# fuse everything into one welded, watertight body
rm = hull.modifiers.new('Fuse', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.065; rm.adaptivity = 0.0
apply_all(hull)
sm = hull.modifiers.new('Smooth', 'SMOOTH'); sm.factor = 0.55; sm.iterations = 6
apply_all(hull)
dc = hull.modifiers.new('Decimate', 'DECIMATE'); dc.decimate_type = 'COLLAPSE'; dc.ratio = 0.2
apply_all(hull)
hull.data.polygons.foreach_set('use_smooth', [True] * len(hull.data.polygons))
print('HULL faces', len(hull.data.polygons))

# ------------------------------------------------------------------ 2. the cockpit tub, cut into the hull (so there is a real inside)
tub = sphere('CockpitCut', 1.0, (0, 1.15, 0.52), None, scale=(0.56, 1.15, 0.5)); tub.display_type = 'WIRE'
bm_mod = hull.modifiers.new('CutCockpit', 'BOOLEAN'); bm_mod.operation = 'DIFFERENCE'; bm_mod.object = tub; bm_mod.solver = 'EXACT'
apply_all(hull)
bpy.data.objects.remove(tub, do_unlink=True)

# ------------------------------------------------------------------ 3. details, all embedded in (or overlapping) the hull
def emb(o): return o
# canopy glass: a dome that sits on the cut, same footprint, slightly proud
canopy = sphere('Canopy', 1.0, (0, 1.15, 0.5), M['Glass'], scale=(0.6, 1.22, 0.6))
# the glass should only be the upper half, otherwise it sits inside the hull; clip below the hull line with a bisect
bm = bmesh.new(); bm.from_mesh(canopy.data)
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0.42), plane_no=(0, 0, 1), clear_inner=True)
bm.to_mesh(canopy.data); bm.free()
block('CanopySpine', (0.07, 2.1, 0.07), (0, 1.15, 1.06), M['HullDark'], bevel=0.01)
# cockpit furnishing, sitting in the tub
block('Seat', (0.5, 0.5, 0.14), (0, 0.8, 0.28), M['Seat'], bevel=0.04)
block('SeatBack', (0.5, 0.1, 0.55), (0, 0.55, 0.58), M['Seat'], rot=(-0.12, 0, 0), bevel=0.04)
block('Dash', (1.0, 0.4, 0.16), (0, 1.95, 0.3), M['HullDark'], rot=(-0.4, 0, 0), bevel=0.03)
for i, (sx, w, m) in enumerate([(-0.3, 0.3, 'ScreenCyan'), (0.0, 0.34, 'ScreenAmber'), (0.3, 0.26, 'ScreenCyan')]):
    block(f'Screen{i}', (w, 0.02, 0.15), (sx, 1.88, 0.42), M[m], rot=(-0.4, 0, 0))
cyl('Yoke', 0.025, 0.28, (0, 1.55, 0.4), M['HullDark'], axis='Z', verts=10)

# nozzles and exhausts: a dark cone is pressed into the back of each nacelle; the glow disc is recessed inside it
for sx in (-1, 1):
    cyl(f'Nozzle{sx}', 0.34, 0.5, (sx * 1.35, -4.2, 0.03), M['HullDark'], axis='Y', verts=32, r2=0.4)
    cyl(f'Exhaust{sx}', 0.3, 0.05, (sx * 1.35, -4.48, 0.03), M['Engine'], axis='Y', verts=32)
    # intake: a dark mouth set into the nacelle nose, with an amber lip
    cyl(f'Intake{sx}', 0.33, 0.1, (sx * 1.35, -0.99, 0.03), M['Panel'], axis='Y', verts=32)
    cyl(f'IntakeLip{sx}', 0.39, 0.05, (sx * 1.35, -1.02, 0.03), M['Trim'], axis='Y', verts=32, r2=0.37)
cyl('CentreNozzle', 0.26, 0.4, (0, -4.0, 0.05), M['HullDark'], axis='Y', verts=28, r2=0.33)
cyl('CentreExhaust', 0.22, 0.05, (0, -4.23, 0.05), M['Engine'], axis='Y', verts=28)

# surface markings: every one is placed by ray-casting onto the hull, so it sits ON the skin (slightly pressed in) instead of floating
def hit(origin, direction):
    ok, loc, nrm, idx = hull.ray_cast(Vector(origin), Vector(direction), distance=30.0)
    return (loc, nrm) if ok else (None, None)
def on_top(name, size, x, y, material, sink=0.012, rot=(0, 0, 0)):
    loc, n = hit((x, y, 6.0), (0, 0, -1))
    if loc is None: print('no hit', name); return None
    return block(name, size, (x, y, loc.z + size[2] / 2 - sink), material, rot=rot)
def on_side(name, size, y, z, sx, material, sink=0.012):
    loc, n = hit((sx * 8.0, y, z), (-sx, 0, 0))
    if loc is None: print('no hit', name); return None
    return block(name, size, (loc.x - sx * (size[0] / 2 - sink), y, z), material)
for sx in (-1, 1):
    on_top(f'WingStripe{sx}', (1.5, 0.15, 0.03), sx * 3.0, -2.75, M['Trim'])
    on_top(f'WingStripe2{sx}', (1.1, 0.15, 0.03), sx * 3.5, -3.05, M['Trim'])
    on_side(f'FinStripe{sx}', (0.05, 0.55, 0.14), -3.4, 0.95, sx, M['Trim'])
    on_side(f'FinTip{sx}', (0.06, 0.5, 0.1), -3.4, 1.62, sx, M['Red'] if sx < 0 else M['Trim'])
    for i, y in enumerate([-2.4, -1.75, -1.1]):
        on_side(f'Vent{sx}{i}', (0.05, 0.3, 0.16), y, 0.32, sx, M['Panel'])
    loc, n = hit((sx * 9.0, -3.0, 0.0), (-sx, 0, 0))
    if loc: sphere(f'Nav{sx}', 0.09, (loc.x - sx * 0.03, -3.0, loc.z), M['NavRed'] if sx < 0 else M['NavGreen'])
    loc, n = hit((sx * 0.2, 8.0, -0.04), (0, -1, 0))
    if loc: block(f'NoseLight{sx}', (0.14, 0.05, 0.05), (sx * 0.2, loc.y - 0.015, -0.04), M['ScreenAmber'])
loc, n = hit((0, -3.6, 6.0), (0, 0, -1))
if loc: sphere('BeaconTop', 0.06, (0, -3.6, loc.z + 0.02), M['NavRed'])
loc, n = hit((0, -0.4, 6.0), (0, 0, -1))
if loc: sphere('SensorDome', 0.2, (0, -0.4, loc.z - 0.02), M['HullDark'], scale=(1, 1, 0.6))
loc, n = hit((0.3, -2.3, 6.0), (0, 0, -1))
if loc: cyl('Antenna', 0.014, 1.0, (0.3, -2.3, loc.z + 0.45), M['HullDark'], axis='Z', verts=8)
loc, n = hit((0, 2.2, -6.0), (0, 0, 1))
if loc: sphere('BellyLight', 0.1, (0, 2.2, loc.z + 0.02), M['ScreenCyan'], scale=(1, 1, 0.5))

# ------------------------------------------------------------------ 4. landing gear: struts run up into the hull; in their own collection so the game can hide it in flight
gear = bpy.data.collections.new('Gear'); root.children.link(gear)
def leg(name, x, y, splay=0.0):
    cyl(name + 'Strut', 0.075, 1.1, (x, y, -0.85), M['HullDark'], axis='Z', verts=14, col=gear).rotation_euler = (0, splay, 0)
    cyl(name + 'Piston', 0.045, 0.7, (x + math.sin(splay) * 0.12, y, -0.95), M['Trim'], axis='Z', verts=10, col=gear).rotation_euler = (0, splay, 0)
    cyl(name + 'Pad', 0.3, 0.08, (x + math.sin(splay) * 0.5, y, -1.45), M['Hull'], axis='Z', verts=22, col=gear)
leg('GearL', -1.55, -1.7, -0.16); leg('GearR', 1.55, -1.7, 0.16); leg('GearN', 0.0, 2.0, 0.0)

# ------------------------------------------------------------------ studio
bpy.ops.object.select_all(action='DESELECT')
world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World'); bpy.context.scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = hexc('#0b1118'); bg.inputs['Strength'].default_value = 0.6
for name, loc, energy, colr in [('Key', (6, -5, 6), 700, '#fff0dd'), ('Fill', (-6, 4, 3), 220, '#9fb8e8'), ('Rim', (0, 7, 4), 300, '#b8ecff')]:
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.color = hexc(colr)[:3]; ld.size = 5
    lo = bpy.data.objects.new(name, ld); lo.location = loc; link(lo, bpy.context.scene.collection)
    lo.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

tris = sum(max(1, len(p.vertices) - 2) for o in root.all_objects if o.type == 'MESH' for p in o.data.polygons)
print('LANDER v2 built:', len([o for o in root.all_objects if o.type == 'MESH']), 'meshes, ~', tris, 'faces')

if len(ARGS) >= 1:
    bpy.ops.object.select_all(action='DESELECT')
    for o in root.all_objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=ARGS[0], export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
    print('EXPORTED', ARGS[0])
if len(ARGS) >= 2:
    bpy.ops.wm.save_as_mainfile(filepath=ARGS[1])
