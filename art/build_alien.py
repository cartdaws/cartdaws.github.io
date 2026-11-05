# INTRUDER: the survivor's kind, v4 ("abyssal"): a dark, soft, organic deep-sea cephalopod that walks. No spikes, no armour, nothing hard-edged.
# Blender 5.x. Faces +Y (exports to -Z in glTF), up is +Z, feet at z=0. See art/ALIEN_DESIGN.md.
#   blender -b --python art/build_alien.py -- public/models/alien.glb art/alien.blend
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix, Euler

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for b in list(bpy.data.meshes): bpy.data.meshes.remove(b)
for c in list(bpy.data.curves): bpy.data.curves.remove(c)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
root = bpy.data.collections.new('Alien'); bpy.context.scene.collection.children.link(root)
rnd = random.Random(7)

def hexc(h, a=1.0):
    h = h.lstrip('#'); return (int(h[0:2], 16) / 255) ** 2.2, (int(h[2:4], 16) / 255) ** 2.2, (int(h[4:6], 16) / 255) ** 2.2, a

def plain(name, color, rough=0.3, metal=0.0, emit=None, emit_strength=0.0, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = hexc(color); n.inputs['Roughness'].default_value = rough; n.inputs['Metallic'].default_value = metal
    if coat and 'Coat Weight' in n.inputs: n.inputs['Coat Weight'].default_value = coat
    if emit: n.inputs['Emission Color'].default_value = hexc(emit); n.inputs['Emission Strength'].default_value = emit_strength
    return m

def skin(name, deep, base, spot, glow, spot_scale=22.0, wet=0.85):
    """Wet, dark, living skin: indigo-black with soft chromatophore mottling, fine wrinkles, a faint teal sheen at grazing angles."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); L = nt.links.new
    out = nt.nodes.new('ShaderNodeOutputMaterial'); pr = nt.nodes.new('ShaderNodeBsdfPrincipled')
    tc = nt.nodes.new('ShaderNodeTexCoord'); lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.4
    vor = nt.nodes.new('ShaderNodeTexVoronoi'); vor.feature = 'SMOOTH_F1'; vor.inputs['Scale'].default_value = spot_scale; vor.inputs['Smoothness'].default_value = 0.9
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0; nz.inputs['Detail'].default_value = 5.0
    cr = nt.nodes.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].position = 0.35; cr.color_ramp.elements[1].position = 0.75
    cr.color_ramp.elements[0].color = hexc(deep); cr.color_ramp.elements[1].color = hexc(base)
    mot = nt.nodes.new('ShaderNodeMix'); mot.data_type = 'RGBA'; mot.blend_type = 'MIX'; mot.inputs['Factor'].default_value = 0.45
    spotc = nt.nodes.new('ShaderNodeRGB'); spotc.outputs[0].default_value = hexc(spot)
    wr = nt.nodes.new('ShaderNodeTexNoise'); wr.inputs['Scale'].default_value = 38.0; wr.inputs['Detail'].default_value = 6.0; wr.inputs['Roughness'].default_value = 0.7
    bmp = nt.nodes.new('ShaderNodeBump'); bmp.inputs['Strength'].default_value = 0.18; bmp.inputs['Distance'].default_value = 0.02
    sh = nt.nodes.new('ShaderNodeMix'); sh.data_type = 'RGBA'; sh.blend_type = 'MULTIPLY'; sh.inputs['Factor'].default_value = 1.0
    shc = nt.nodes.new('ShaderNodeRGB'); shc.outputs[0].default_value = hexc(glow)
    shm = nt.nodes.new('ShaderNodeMath'); shm.operation = 'MULTIPLY'; shm.inputs[1].default_value = 0.22
    L(tc.outputs['Object'], vor.inputs['Vector']); L(tc.outputs['Object'], nz.inputs['Vector']); L(tc.outputs['Object'], wr.inputs['Vector'])
    L(nz.outputs['Fac'], cr.inputs['Fac']); L(cr.outputs['Color'], mot.inputs['A']); L(spotc.outputs['Color'], mot.inputs['B'])
    L(vor.outputs['Distance'], mot.inputs['Factor']); L(mot.outputs['Result'], pr.inputs['Base Color'])
    L(wr.outputs['Fac'], bmp.inputs['Height']); L(bmp.outputs['Normal'], pr.inputs['Normal'])
    L(lw.outputs['Fresnel'], shm.inputs[0]); L(shc.outputs['Color'], sh.inputs['A']); L(shm.outputs['Value'], sh.inputs['B'])
    L(sh.outputs['Result'], pr.inputs['Emission Color']); pr.inputs['Emission Strength'].default_value = 1.0
    pr.inputs['Roughness'].default_value = 0.2
    for k, v in (('Coat Weight', wet), ('Coat Roughness', 0.08), ('Subsurface Weight', 0.35), ('Specular IOR Level', 0.9)):
        if k in pr.inputs: pr.inputs[k].default_value = v
    if 'Subsurface Radius' in pr.inputs: pr.inputs['Subsurface Radius'].default_value = (0.5, 0.9, 1.0)
    if 'Subsurface Scale' in pr.inputs: pr.inputs['Subsurface Scale'].default_value = 0.06
    L(pr.outputs['BSDF'], out.inputs['Surface'])
    return m

M = {
    'SkinBody': skin('SkinBody', '#03060c', '#0b1522', '#0d2230', '#2fb8a8'),
    'SkinLimb': skin('SkinLimb', '#04070d', '#0e1a28', '#102838', '#2fb8a8', spot_scale=30.0),
    'Underside': skin('Underside', '#0a0f18', '#1c2a3c', '#24384c', '#4fd0c0', spot_scale=16.0),
    'Eye': plain('Eye', '#010203', 0.04, coat=1.0),
    'Pupil': plain('Pupil', '#ffb347', 0.3, emit='#ff9a2a', emit_strength=2.6),
    'Brow': plain('Brow', '#05080e', 0.25, coat=0.7),
    'Sucker': plain('Sucker', '#2a3a4a', 0.2, coat=0.9),
    'Photo': plain('Photophore', '#7fe8da', 0.3, emit='#5fe0cc', emit_strength=2.4),
    'PhotoV': plain('PhotophoreViolet', '#b99cff', 0.3, emit='#9c7cf0', emit_strength=2.0),
    'Core': plain('Core', '#7fe8da', 0.3, emit='#4fd8c4', emit_strength=1.4),
}

def put(name, me, material, smooth=True, col=None):
    o = bpy.data.objects.new(name, me); (col or root).objects.link(o)
    if material: o.data.materials.append(material)
    if smooth: me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    return o

def loft(name, stations, segs=48, power=2.0, material=None, subsurf=2):
    """Rings stacked up Z: (z, half_width_x, half_depth_y, y_offset). Smooth, soft, closed."""
    me = bpy.data.meshes.new(name); bm = bmesh.new(); rings = []
    for (z, rx, ry, oy) in stations:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs; c, s = math.cos(a), math.sin(a)
            ring.append(bm.verts.new((rx * math.copysign(abs(c) ** (2 / power), c), oy + ry * math.copysign(abs(s) ** (2 / power), s), z)))
        rings.append(ring)
    for r in range(len(rings) - 1):
        for i in range(segs):
            bm.faces.new((rings[r][i], rings[r][(i + 1) % segs], rings[r + 1][(i + 1) % segs], rings[r + 1][i]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    o = put(name, me, material)
    if subsurf:
        s = o.modifiers.new('S', 'SUBSURF'); s.levels = subsurf; s.render_levels = subsurf
    return o

def ellipsoid(name, centre, radii, material, rot=(0, 0, 0), seg=32, rings=18):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0, matrix=Matrix.Translation(centre) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((radii[0], radii[1], radii[2], 1.0)))
    bm.to_mesh(me); bm.free(); return put(name, me, material)

def sample(pts, n):
    """Catmull-Rom through the points, n samples."""
    out = []
    P = [pts[0]] + list(pts) + [pts[-1]]
    segs = len(pts) - 1
    for i in range(n):
        t = i / (n - 1) * segs; k = min(int(t), segs - 1); u = t - k
        p0, p1, p2, p3 = (Vector(P[k]), Vector(P[k + 1]), Vector(P[k + 2]), Vector(P[k + 3]))
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u))
    return out

def organic_tube(name, pts, radii, material, ring_seg=14, samples=26):
    """A smooth, tapering tube following a curve of points (radius interpolated), capped round at the tip."""
    path = sample(pts, samples); rad = sample([(r, 0, 0) for r in radii], samples)
    me = bpy.data.meshes.new(name); bm = bmesh.new(); rings = []
    prev_n = Vector((0, 0, 1))
    for i, p in enumerate(path):
        tan = (path[min(i + 1, samples - 1)] - path[max(i - 1, 0)]).normalized()
        n1 = prev_n - tan * prev_n.dot(tan)
        if n1.length < 1e-4: n1 = Vector((1, 0, 0)).cross(tan)
        n1.normalize(); n2 = tan.cross(n1); prev_n = n1
        r = max(0.004, rad[i].x)
        rings.append([bm.verts.new(p + (n1 * math.cos(2 * math.pi * j / ring_seg) + n2 * math.sin(2 * math.pi * j / ring_seg)) * r) for j in range(ring_seg)])
    for i in range(samples - 1):
        for j in range(ring_seg):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % ring_seg], rings[i + 1][(j + 1) % ring_seg], rings[i + 1][j]))
    bm.faces.new(rings[0][::-1])
    tip = bm.verts.new(path[-1] + (path[-1] - path[-2]).normalized() * rad[-1].x * 0.9)
    for j in range(ring_seg): bm.faces.new((rings[-1][j], rings[-1][(j + 1) % ring_seg], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    o = put(name, me, material)
    s = o.modifiers.new('S', 'SUBSURF'); s.levels = 1; s.render_levels = 2
    return o, path, rad

def blobs(name, items, material, col=None):
    """items: (centre, radii, rot). Many small ellipsoids in one mesh."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    for (c, r, rot) in items:
        bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=1.0, matrix=Matrix.Translation(c) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((r[0], r[1], r[2], 1.0)))
    bm.to_mesh(me); bm.free(); return put(name, me, material, col=col)

# ---------------------------------------------------------------- mantle: a large soft sac, tilted back, heavy and rounded
mantle = loft('Mantle', [
    (0.58, 0.18, 0.2, -0.02), (0.74, 0.32, 0.36, -0.04), (0.98, 0.43, 0.5, -0.08), (1.24, 0.43, 0.52, -0.15),
    (1.5, 0.33, 0.42, -0.24), (1.7, 0.2, 0.28, -0.32), (1.82, 0.08, 0.12, -0.36),
], material=M['SkinBody'])
# a temporary copy of the finished (subdivided) mantle, only used to find where its skin really is, so everything attached is rooted ON it
_dg = bpy.context.evaluated_depsgraph_get()
_mtmp = bpy.data.meshes.new_from_object(mantle.evaluated_get(_dg)); mt = bpy.data.objects.new('SkinProbe', _mtmp); root.objects.link(mt)
def skin_hit(origin, direction):
    ok, loc, nrm, idx = mt.ray_cast(Vector(origin), Vector(direction), distance=8.0)
    return (loc, nrm) if ok else (None, None)

# soft fins along the flanks: ribbons whose inner edge lies exactly on the mantle's skin and flows outward and back from there
for sx in (-1, 1):
    N, W = 22, 6; rows = []
    for i in range(N):
        t = i / (N - 1); z = 0.82 + t * 0.72
        # the inner edge: ray cast from outside at this height, aimed at the mantle's axis, so it is on the surface (pushed a hair inside)
        cy = -0.04 - 0.2 * t
        loc, nrm = skin_hit((sx * 3.0, cy, z), (-sx, 0, 0))
        if loc is None: continue
        base = loc + Vector((-sx * 0.012, 0.0, 0.0))
        span = 0.03 + 0.24 * math.sin(math.pi * (0.06 + 0.88 * t)) ** 1.1          # how far it stands off the body at this height
        row = []
        for j in range(W):
            w = j / (W - 1)
            ripple = 0.035 * math.sin(i * 0.9 + w * 2.4) * w
            row.append(base + Vector((sx * span * w, -span * 0.55 * w * w + ripple * 0.4, ripple)))
        rows.append(row)
    me = bpy.data.meshes.new(f'FinMesh{sx}'); bm = bmesh.new(); vg = [[bm.verts.new(p) for p in row] for row in rows]
    for i in range(len(vg) - 1):
        for j in range(W - 1): bm.faces.new((vg[i][j], vg[i][j + 1], vg[i + 1][j + 1], vg[i + 1][j]))
    bm.to_mesh(me); bm.free()
    f = put(f'Fin{sx}', me, M['SkinBody'])
    so = f.modifiers.new('So', 'SOLIDIFY'); so.thickness = 0.02; so.offset = 0.0
    sb = f.modifiers.new('S', 'SUBSURF'); sb.levels = 1; sb.render_levels = 1

# ---------------------------------------------------------------- head: a heavy rounded mass hanging forward below the mantle; the mantle sits on it like a hood
ellipsoid('Head', (0, 0.3, 0.98), (0.34, 0.36, 0.32), M['SkinBody'])
ellipsoid('Chin', (0, 0.46, 0.8), (0.24, 0.24, 0.2), M['SkinBody'])
# eyes: deep-set, glossy, black, with a thin amber horizontal slit; a heavy soft brow pushes down over each (unwelcoming, but organic)
for sx in (-1, 1):
    ellipsoid(f'Socket{sx}', (sx * 0.2, 0.52, 1.02), (0.13, 0.1, 0.1), M['SkinBody'])
    ellipsoid(f'Eye{sx}', (sx * 0.2, 0.58, 1.02), (0.095, 0.06, 0.08), M['Eye'])
    ellipsoid(f'Pupil{sx}', (sx * 0.2, 0.635, 1.01), (0.05, 0.012, 0.011), M['Pupil'])
    ellipsoid(f'Brow{sx}', (sx * 0.2, 0.56, 1.1), (0.15, 0.1, 0.045), M['SkinBody'], rot=(0.35, 0, sx * -0.28))
# a ring of short, soft feeding tentacles around the mouth
mouth = Vector((0, 0.62, 0.74))
for k in range(8):
    a = 2 * math.pi * k / 8
    d = Vector((math.cos(a) * 0.1, 0.0, math.sin(a) * 0.1))
    pts = [mouth + d * 0.5, mouth + d * 1.3 + Vector((0, 0.1, -0.02)), mouth + d * 1.9 + Vector((0, 0.2, -0.1 - 0.05 * math.sin(a))), mouth + d * 1.9 + Vector((0, 0.27, -0.2))]
    organic_tube(f'MouthArm{k}', pts, [0.03, 0.026, 0.016, 0.006], M['SkinLimb'], ring_seg=8, samples=10)

# ---------------------------------------------------------------- legs: six thick, muscular tentacle-legs that arch out and down, with rows of suckers underneath and a soft flat tip
LEGS = [(-0.66, 2.5), (0.66, 2.5), (-1.57, 1.9), (1.57, 1.9), (-2.55, 2.0), (2.55, 2.0)]
legcol = bpy.data.collections.new('Legs'); root.children.link(legcol)
for idx, (ang, reach) in enumerate(LEGS):
    dx, dy = math.sin(ang), math.cos(ang)
    P = lambda r, z, side=0.0: (dx * r - dy * side, dy * r + dx * side, z)
    pts = [P(0.28, 0.66), P(0.6, 0.86, 0.04), P(0.95, 0.66, 0.1), P(1.2, 0.3, 0.06), P(1.32, 0.07, 0.0), P(1.48, 0.03, -0.1)]
    leg, path, rad = organic_tube(f'Leg{idx}', pts, [0.17, 0.135, 0.1, 0.072, 0.05, 0.03], M['SkinLimb'], ring_seg=18, samples=30)
    legcol.objects.link(leg); root.objects.unlink(leg)
    # suckers: two rows along the inner/underside of the lower half
    items = []
    for i in range(8, 29, 2):
        p, r = path[i], rad[i].x
        tan = (path[min(i + 1, 29)] - path[max(i - 1, 0)]).normalized()
        down = Vector((0, 0, -1)); side = tan.cross(down).normalized()
        for s in (-0.5, 0.5):
            c = p + down * r * 0.82 + side * r * s * 0.55
            items.append((c, (r * 0.3, r * 0.3, r * 0.1), (0, 0, 0)))
    blobs(f'Suckers{idx}', items, M['Sucker'], col=legcol)
    e = bpy.data.objects.new(f'Hip{idx}', None); e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 0.05; e.location = Vector(pts[0]); root.objects.link(e)

# ---------------------------------------------------------------- two long arms from the sides of the head (the first-person arms are built from the same design)
for sx in (-1, 1):
    pts = [(sx * 0.3, 0.3, 1.1), (sx * 0.55, 0.5, 1.0), (sx * 0.75, 0.85, 0.82), (sx * 0.8, 1.25, 0.78), (sx * 0.7, 1.55, 0.88)]
    arm, path, rad = organic_tube(f'Arm{sx}', pts, [0.1, 0.085, 0.065, 0.045, 0.022], M['SkinLimb'], ring_seg=16, samples=26)
    items = []
    for i in range(6, 25, 2):
        p, r = path[i], rad[i].x
        items.append((p + Vector((0, 0, -r * 0.8)), (r * 0.28, r * 0.28, r * 0.1), (0, 0, 0)))
    blobs(f'ArmSuckers{sx}', items, M['Sucker'])
    e = bpy.data.objects.new('ShoulderL' if sx < 0 else 'ShoulderR', None); e.empty_display_type = 'ARROWS'; e.empty_display_size = 0.08; e.location = Vector(pts[0]); root.objects.link(e)

# ---------------------------------------------------------------- photophores: constellations of faint glowing spots, placed on the actual skin by ray casting
def scatter(target, n, region, mat_name, size=(0.012, 0.026)):
    items = []; tries = 0
    while len(items) < n and tries < n * 30:
        tries += 1
        z = rnd.uniform(*region[0]); a = rnd.uniform(*region[1])
        origin = Vector((math.sin(a) * 2.0, math.cos(a) * 2.0 - 0.1, z)); direction = (Vector((0, -0.1, z)) - origin).normalized()
        ok, loc, nrm, idx = target.ray_cast(origin, direction, distance=6.0)
        if ok:
            s = rnd.uniform(*size); rot = nrm.to_track_quat('Z', 'Y').to_euler()
            items.append((loc + nrm * 0.002, (s, s, s * 0.35), rot))
    return items
spots = scatter(mt, 70, ((0.75, 1.7), (-3.0, 0.4)), 'Photo') + scatter(mt, 36, ((0.8, 1.6), (2.2, 3.6)), 'Photo')    # along the back and flanks, none on the face side
blobs('Photophores', spots[::2], M['Photo']); blobs('PhotophoresViolet', spots[1::2], M['PhotoV'])
blobs('CoreGlow', [((0, -0.1, 0.9), (0.07, 0.07, 0.07), (0, 0, 0))], M['Core'])

bpy.data.objects.remove(mt, do_unlink=True); bpy.data.meshes.remove(_mtmp)

# ---------------------------------------------------------------- anchors for the game
for name, loc in [('Head', (0, 0.3, 1.0)), ('Crown', (0, 0.1, 1.75)), ('CoreAnchor', (0, -0.1, 0.9))]:
    e = bpy.data.objects.new(name, None); e.empty_display_type = 'ARROWS'; e.empty_display_size = 0.08; e.location = loc; root.objects.link(e)

# ---------------------------------------------------------------- studio: dark, cold rim light so the dark skin reads
world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World'); bpy.context.scene.world = world; world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = hexc('#04070a'); bg.inputs['Strength'].default_value = 0.25
for name, loc, energy, colr in [('Key', (3, -4, 4), 900, '#cfe0ff'), ('Fill', (-4, 3, 2), 200, '#6f90c0'), ('Rim', (0, 4, 3), 900, '#7fe8da'), ('Rim2', (-4, 3.5, 2.5), 700, '#80e8d8'), ('Kick', (0, -3, 0.3), 350, '#b0c8ff')]:
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.color = hexc(colr)[:3]; ld.size = 3
    lo = bpy.data.objects.new(name, ld); lo.location = loc; bpy.context.scene.collection.objects.link(lo)
    lo.rotation_euler = (Vector((0, 0, 0.9)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
print('ALIEN v4 built:', len([o for o in root.all_objects if o.type == 'MESH']), 'meshes')

if len(ARGS) >= 1:
    bpy.ops.object.select_all(action='DESELECT')
    for o in root.all_objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=ARGS[0], export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
if len(ARGS) >= 2: bpy.ops.wm.save_as_mainfile(filepath=ARGS[1])
