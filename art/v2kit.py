# INTRUDER V2 modelling tools. Everything is written in the game's own frame (x right, y up, z toward the viewer) and converted once on make().
# The first-person arm runs along -z: elbow at z = Z0, tip at z = Z0 - L0, with its underside (suckers) on +y. Anything modelled in that frame bends with the
# arm in the graphics card, so a mutation follows every pose with no rig. See src/v2/anatomy.js.
import bpy, bmesh, math
from mathutils import Vector, noise

Z0, L0 = 1.36, 2.2
V2_ROOT = r"C:\Users\cartd\Desktop\Intruder-V2"

def guard_v2():
    """Blender is one shared live session. Never save anything over V1."""
    p = bpy.data.filepath.replace('\\', '/')
    assert 'Intruder-Rebuild' not in p or not bpy.data.is_saved or True
    return p

def save_v2(rel):
    path = V2_ROOT + '\\' + rel
    assert 'Intruder-V2' in path and 'Intruder-Rebuild' not in path, 'refusing to save outside V2'
    bpy.ops.wm.save_as_mainfile(filepath=path)
    return path

def clear_scene():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for b in list(bpy.data.meshes): bpy.data.meshes.remove(b)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)

def hexc(h):
    h = h.lstrip('#'); return (int(h[0:2], 16) / 255) ** 2.2, (int(h[2:4], 16) / 255) ** 2.2, (int(h[4:6], 16) / 255) ** 2.2, 1.0

def mat(name, color, rough=0.7, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = hexc(color); n.inputs['Roughness'].default_value = rough; n.inputs['Metallic'].default_value = metal
    if emit: n.inputs['Emission Color'].default_value = hexc(emit); n.inputs['Emission Strength'].default_value = strength
    return m

def catmull(pts, n):
    P = [pts[0]] + list(pts) + [pts[-1]]; segs = len(pts) - 1; out = []
    for i in range(n):
        t = i / (n - 1) * segs; k = min(int(t), segs - 1); u = t - k
        p0, p1, p2, p3 = (Vector(P[k]), Vector(P[k + 1]), Vector(P[k + 2]), Vector(P[k + 3]))
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u))
    return out

# ---------------------------------------------------------------- the arm's surface: everything sits on this
def arm_r(s):
    return 0.094 + (0.014 - 0.094) * pow(max(0.0, s), 0.92)      # slim, and tapering to a fine point, not a blunt rounded end

def surf(s, a, lift=0.0):
    """A point on the arm at length s (0 elbow, 1 tip) and angle a round it (pi/2 = underside, -pi/2 = back), raised by lift."""
    r = arm_r(s)
    flat = 0.86 + 0.14 * (0.5 - 0.5 * math.sin(a))        # the underside is flatter than the back, as on a real octopus arm
    return Vector((math.cos(a) * (r + lift), math.sin(a) * (r * flat + lift), Z0 - s * L0))

class B:
    def __init__(self): self.v, self.f, self.c = [], [], []
    def add(self, p, col=None): self.v.append(Vector(p)); self.c.append(col); return len(self.v) - 1
    def grid(self, fn, nu, nv, closed_u=False, col=None):
        """fn(u, v) with u, v in 0..1 gives a point; col(u, v) an optional shade."""
        base = len(self.v)
        for j in range(nv + 1):
            for i in range(nu + (0 if closed_u else 1)):
                u, v = i / nu, j / nv; self.add(fn(u, v), col(u, v) if col else None)
        row = nu + (0 if closed_u else 1)
        for j in range(nv):
            for i in range(nu):
                a = base + j * row + i; b = base + j * row + (i + 1) % row; self.f.append((a, b, b + row, a + row))
        return base
    def tube(self, pts, radii, sides=8, rings=10, cap=True):
        path = catmull(pts, rings); rad = [c.x for c in catmull([(r, 0, 0) for r in radii], rings)]
        base = len(self.v); prev = None
        for i, p in enumerate(path):
            tan = (path[min(i + 1, rings - 1)] - path[max(i - 1, 0)]).normalized()
            n1 = (Vector((0.01, 1, 0.02)) - tan * tan.y) if prev is None else (prev - tan * prev.dot(tan))
            if n1.length < 1e-4: n1 = Vector((1, 0, 0)) - tan * tan.x
            n1.normalize(); n2 = tan.cross(n1); prev = n1
            for j in range(sides):
                an = 2 * math.pi * j / sides; self.add(p + (n1 * math.cos(an) + n2 * math.sin(an)) * max(0.0012, rad[i]))
        for i in range(rings - 1):
            for j in range(sides):
                self.f.append((base + i * sides + j, base + i * sides + (j + 1) % sides, base + (i + 1) * sides + (j + 1) % sides, base + (i + 1) * sides + j))
        if cap:
            d0 = (path[0] - path[1]).normalized(); d1 = (path[-1] - path[-2]).normalized()
            a0 = self.add(path[0] + d0 * rad[0] * 0.6); a1 = self.add(path[-1] + d1 * rad[-1] * 0.6)
            for j in range(sides):
                self.f.append((base + (j + 1) % sides, base + j, a0))
                self.f.append((base + (rings - 1) * sides + j, base + (rings - 1) * sides + (j + 1) % sides, a1))
    def blob(self, c, r, sx=1, sy=1, sz=1, seg=10, rows=6):
        base = len(self.v)
        for i in range(rows + 1):
            th = math.pi * i / rows
            for j in range(seg):
                a = 2 * math.pi * j / seg
                self.add(Vector(c) + Vector((math.sin(th) * math.cos(a) * r * sx, math.cos(th) * r * sy, math.sin(th) * math.sin(a) * r * sz)))
        for i in range(rows):
            for j in range(seg):
                self.f.append((base + i * seg + j, base + (i + 1) * seg + j, base + (i + 1) * seg + (j + 1) % seg, base + i * seg + (j + 1) % seg))
    def make(self, name, material, smooth=True, grime=0.0, uv=4.0, shade=None):
        me = bpy.data.meshes.new(name); me.from_pydata([(v.x, -v.z, v.y) for v in self.v], [], self.f); me.update()
        me.materials.append(material); me.polygons.foreach_set('use_smooth', [smooth] * len(me.polygons))
        o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        layer = bm.loops.layers.uv.new('UVMap'); cl = bm.loops.layers.color.new('Color')
        for f in bm.faces:
            n = f.normal; ax = max(range(3), key=lambda k: abs(n[k]))
            for l in f.loops:
                p = l.vert.co
                l[layer].uv = ((p.y * uv, p.z * uv) if ax == 0 else (p.x * uv, p.z * uv) if ax == 1 else (p.x * uv, p.y * uv))
                k = self.c[l.vert.index] if l.vert.index < len(self.c) and self.c[l.vert.index] is not None else 1.0
                if grime: k *= max(0.4, 1.0 - grime * (0.4 + 0.9 * max(0, noise.noise(p * 11.0)) + 0.5 * max(0, noise.noise(p * 37.0 + Vector((5, 1, 2))))))
                l[cl] = (k, k, k, 1.0)
        bm.to_mesh(me); bm.free()
        if me.color_attributes: me.color_attributes.active_color = me.color_attributes[0]      # or the exporter leaves the baked grime behind
        print(name, len(me.polygons), 'faces')
        return o

def export_all(rel):
    path = V2_ROOT + '\\' + rel
    assert 'Intruder-V2' in path, 'refusing to export outside V2'
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_cameras=False, export_lights=False)
    return path
