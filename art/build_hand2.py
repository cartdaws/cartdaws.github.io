# INTRUDER: the survivor's first-person arm, v4: ONE seamless tentacle. No hand, no fingers, no separate parts: a single tube from the elbow to a fine tip,
# tapering smoothly, with staggered suckers along the side that faces the player. Matches the creature's third-person tentacles.
# Same coordinate frame and shape keys as the old hand.glb, so the game code still fits. Coordinates below are the game frame: x right, y up, z toward the camera.
#   Grip    the tip coils into a tight curl
#   Weapon  the tentacle shortens and thickens into a muscular siphon with an open mouth at z = -0.33, around the weapon organs
#   Spread  the tip whips out to the side and lifts (recoil, idle flexing)
#   Swell   the whole tentacle thickens
#   Reach   the tentacle straightens and stretches far forward: touching the elder, the sidearm, the mark
#   blender -b --python art/build_hand2.py -- public/models/hand2.glb art/hand2.blend
# No subdivision modifier: applying one on export discards the shape keys, and the game then silently keeps the old hand. Set every key value to 0 before exporting.
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

RSEG, RINGS = 20, 84                # one tube: rings along it, sides around it
UP = Vector((0, 1, 0))

# sucker template: a flattened dome, always the same vertex order so it morphs with the pose
_tb = bmesh.new(); bmesh.ops.create_uvsphere(_tb, u_segments=10, v_segments=5, radius=1.0)
TEMPLATE = [v.co.copy() for v in _tb.verts]; TFACES = [tuple(v.index for v in f.verts) for f in _tb.faces]; _tb.free()

POSES = {
    #          the centre line, elbow to tip                                                                                     radius at each of those points                 how the end closes
    # x is outward for each arm (the game mirrors the left one), so negative x curls in toward the middle of the screen, where the shape can actually be seen
    'basis':  ([(0, 0, 1.36), (.02, -.03, .92), (-.015, -.045, .48), (.01, -.03, .08), (-.03, 0, -.2), (-.1, .06, -.4), (-.16, .17, -.52), (-.11, .29, -.56), (0, .33, -.52), (.08, .27, -.48)],
               [.094, .08, .068, .058, .052, .044, .034, .024, .014, .005], 'tip'),
    'grip':   ([(0, 0, 1.36), (.02, -.03, .92), (-.015, -.045, .48), (.01, -.03, .08), (-.03, 0, -.14), (-.1, .05, -.27), (-.16, .15, -.3), (-.12, .25, -.26), (-.04, .25, -.22), (-.03, .17, -.24)],
               [.094, .08, .068, .058, .052, .044, .034, .024, .014, .005], 'tip'),
    'weapon': ([(0, 0, 1.36), (.01, -.03, .92), (-.008, -.04, .48), (.004, -.025, .1), (.002, -.012, -.02), (0, -.005, -.1), (0, 0, -.18), (0, 0, -.26), (0, 0, -.33)],
               [.094, .08, .07, .064, .066, .068, .066, .062, .066], 'mouth'),
    'reach':  ([(0, 0, 1.36), (.01, -.02, .9), (0, -.03, .46), (0, -.02, .06), (0, 0, -.28), (0, .02, -.58), (0, .05, -.84), (0, .08, -1.06), (0, .1, -1.22), (0, .11, -1.34)],
               [.094, .08, .068, .058, .05, .042, .034, .025, .015, .006], 'tip'),
    'spread': ([(0, 0, 1.36), (.03, -.03, .92), (.01, -.045, .48), (.05, -.03, .08), (.1, 0, -.2), (.16, .05, -.4), (.24, .13, -.52), (.32, .22, -.56), (.4, .28, -.52), (.46, .28, -.44)],
               [.094, .08, .068, .058, .052, .044, .034, .024, .014, .005], 'tip'),
}

def build(pose):
    """every vertex of the skin and of the suckers for a pose, in a fixed order"""
    name = 'basis' if pose == 'swell' else pose
    pts, radii, end = POSES[name]
    k = 1.3 if pose == 'swell' else 1.0
    path = catmull(pts, RINGS); rad = [max(0.004, v.x) * k for v in catmull([(r, 0, 0) for r in radii], RINGS)]
    skin, frames, prev = [], [], None
    for i, p in enumerate(path):
        tan = (path[min(i + 1, RINGS - 1)] - path[max(i - 1, 0)]).normalized()
        # parallel transport: the cross-section is carried along the curve and can never flip, however tightly it coils
        n1 = (UP - tan * UP.dot(tan)) if prev is None else (prev - tan * prev.dot(tan))
        if n1.length < 1e-4: n1 = Vector((1, 0, 0)) - tan * tan.x
        n1.normalize(); n2 = tan.cross(n1); prev = n1; frames.append((tan, n1, n2))
        for j in range(RSEG):
            a = 2 * math.pi * j / RSEG; skin.append(p + (n1 * math.cos(a) + n2 * math.sin(a)) * rad[i])
    # the end: a rounded point, or (weapon) drawn back inside so the tube ends in an open mouth
    d = (path[-1] - path[-2]).normalized()
    skin.append(path[-1] + d * rad[-1] * 0.9 if end == 'tip' else path[-1] - d * 0.09)
    # staggered suckers along the +n1 side (that faces up at the player), shrinking toward the tip
    suck = []
    for s, i in enumerate(range(24, RINGS - 4, 2)):
        tan, n1, n2 = frames[i]; r = rad[i]; a = 0.52 if s % 2 else -0.52
        out = (n1 * math.cos(a) + n2 * math.sin(a)).normalized()
        side = tan.cross(out).normalized(); c = path[i] + out * r * 0.9; q = r * 0.3
        suck.append([c + tan * (v.x * q) + side * (v.y * q) + out * (v.z * q * 0.42) for v in TEMPLATE])
    return skin, suck

def conv(v):
    """the game frame to Blender's (+Y forward, +Z up); the glTF exporter turns it back"""
    return Vector((v[0], -v[2], v[1]))

faces = []
for i in range(RINGS - 1):
    for j in range(RSEG):
        faces.append((i * RSEG + j, i * RSEG + (j + 1) % RSEG, (i + 1) * RSEG + (j + 1) % RSEG, (i + 1) * RSEG + j))
apex = RINGS * RSEG
for j in range(RSEG): faces.append(((RINGS - 1) * RSEG + j, (RINGS - 1) * RSEG + (j + 1) % RSEG, apex))
faces.append(tuple(range(RSEG))[::-1])                 # the elbow end is off screen
skin0, suck0 = build('basis')
sfaces = []
for b in range(len(suck0)):
    for f in TFACES: sfaces.append(tuple(b * len(TEMPLATE) + i for i in f))

def make(name, verts, fcs, material):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(conv(v)) for v in verts], [], fcs); me.update(); me.materials.append(material)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o
hand = make('Hand', skin0, faces, SKIN)
sucks = make('HandSuckers', [v for s in suck0 for v in s], sfaces, SUCK)
# consistent outward normals: a tube built by hand can come out inside-out, which a transparent gel shows immediately
bpy.context.view_layer.objects.active = hand
for obj, idx in ((hand, 0), (sucks, 1)):
    obj.shape_key_add(name='Basis', from_mix=False)
    for name, pose in (('Grip', 'grip'), ('Weapon', 'weapon'), ('Spread', 'spread'), ('Swell', 'swell'), ('Reach', 'reach')):
        sk = obj.shape_key_add(name=name, from_mix=False)
        data = build(pose)[idx]
        flat = data if idx == 0 else [v for s in data for v in s]
        for i, v in enumerate(flat): sk.data[i].co = conv(v)
    for k in obj.data.shape_keys.key_blocks: k.value = 0.0
print('ARM v4 built:', len(hand.data.vertices), 'skin verts,', len(sucks.data.vertices), 'sucker verts, keys', [k.name for k in hand.data.shape_keys.key_blocks])

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
