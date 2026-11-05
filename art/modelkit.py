# Shared tools for the procedural models: tubes with folds, blobs with displacement, per-face box UVs so real textures fit, and grime baked into a vertex-colour layer.
import bpy, bmesh, math
from mathutils import Vector, noise

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

class B:
    # coordinates here: x right, y up, z toward the viewer (glTF); converted on make()
    def __init__(self): self.v, self.f = [], []
    def tube(self, pts, radii, sides=8, rings=10, flat=1.0, cap=True, fold=0.0, folds=9, knob=0.0, knobs=5.0, ribs=0.0, ribN=6.0, rough=0.0):
        """fold: vertical pleats growing toward the far end. ribs: rings along the length. knob: bumps. rough: noise on the surface."""
        path = catmull(pts, rings); rad = [c.x for c in catmull([(r, 0, 0) for r in radii], rings)]
        base = len(self.v); prev = None
        for i, p in enumerate(path):
            tan = (path[min(i + 1, rings - 1)] - path[max(i - 1, 0)]).normalized()
            n1 = (Vector((0, 0.01, 1)) - tan * tan.z) if prev is None else (prev - tan * prev.dot(tan))
            if n1.length < 1e-4: n1 = Vector((1, 0, 0)) - tan * tan.x
            n1.normalize(); n2 = tan.cross(n1); prev = n1; t = i / (rings - 1)
            for j in range(sides):
                a = 2 * math.pi * j / sides; r = max(0.003, rad[i])
                r *= 1 + fold * t * math.sin(a * folds + t * 1.2) + ribs * math.sin(t * ribN * 6.283) + knob * math.sin(a * knobs) * math.sin(t * knobs * 3.14)
                q = p + (n1 * math.cos(a) * flat + n2 * math.sin(a)) * r
                if rough: q += (q - p).normalized() * (noise.noise(q * 5.0) * rough * r)
                self.v.append(q)
        for i in range(rings - 1):
            for j in range(sides):
                self.f.append((base + i * sides + j, base + i * sides + (j + 1) % sides, base + (i + 1) * sides + (j + 1) % sides, base + (i + 1) * sides + j))
        if cap:
            d = (path[-1] - path[-2]).normalized(); self.v.append(path[-1] + d * rad[-1] * 0.7); apex = len(self.v) - 1
            for j in range(sides): self.f.append((base + (rings - 1) * sides + j, base + (rings - 1) * sides + (j + 1) % sides, apex))
            self.f.append(tuple(base + j for j in range(sides))[::-1])
    def blob(self, c, r, sx=1, sy=1, sz=1, seg=12, rows=8, top=1.0, rough=0.0, plates=0.0, pn=6.0, rib=0.0, ribN=8.0):
        """plates: raised facets like a shell. rib: meridian ribs."""
        base = len(self.v)
        for i in range(rows + 1):
            th = math.pi * (i / rows) * top
            for j in range(seg):
                a = 2 * math.pi * j / seg; k = 1.0
                if plates: k += plates * (abs(math.sin(a * pn) * math.sin(th * pn)) ** 0.5 - 0.5)
                if rib: k += rib * math.sin(a * ribN)
                q = Vector((math.sin(th) * math.cos(a) * r * sx, math.cos(th) * r * sy, math.sin(th) * math.sin(a) * r * sz)) * k
                if rough: q = q * (1 + noise.noise(q * 3.0 + Vector(c)) * rough)
                self.v.append(Vector(c) + q)
        for i in range(rows):
            for j in range(seg):
                self.f.append((base + i * seg + j, base + (i + 1) * seg + j, base + (i + 1) * seg + (j + 1) % seg, base + i * seg + (j + 1) % seg))
    def box(self, c, s, yaw=0.0):
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2; base = len(self.v); cx, cy, cz = c; ca, sa = math.cos(yaw), math.sin(yaw)
        for x in (-hx, hx):
            for y in (-hy, hy):
                for z in (-hz, hz): self.v.append(Vector((cx + x * ca + z * sa, cy + y, cz - x * sa + z * ca)))
        for q in [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]: self.f.append(tuple(base + i for i in q))
    def cyl(self, c, r0, r1, h, seg=16):
        base = len(self.v); cx, cy, cz = c
        for y, r in ((0, r0), (h, r1)):
            for j in range(seg):
                a = 2 * math.pi * j / seg; self.v.append(Vector((cx + math.cos(a) * r, cy + y, cz + math.sin(a) * r)))
        for j in range(seg): self.f.append((base + j, base + (j + 1) % seg, base + seg + (j + 1) % seg, base + seg + j))
        self.f.append(tuple(base + seg + j for j in range(seg)))
    def make(self, name, material, smooth=True, grime=0.34, uv=0.5, bevel=0.0, sharp=False):
        me = bpy.data.meshes.new(name); me.from_pydata([(v.x, -v.z, v.y) for v in self.v], [], self.f); me.update()
        me.materials.append(material); me.polygons.foreach_set('use_smooth', [smooth] * len(me.polygons))
        o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bevel: bmesh.ops.bevel(bm, geom=bm.edges[:] , offset=bevel, segments=1, profile=0.5, affect='EDGES')
        # box UVs so tiling textures sit straight on every surface
        layer = bm.loops.layers.uv.new('UVMap')
        for f in bm.faces:
            n = f.normal; ax = max(range(3), key=lambda k: abs(n[k]))
            for l in f.loops:
                p = l.vert.co
                l[layer].uv = ((p.y, p.z) if ax == 0 else (p.x, p.z) if ax == 1 else (p.x, p.y))
                l[layer].uv = (l[layer].uv[0] * uv, l[layer].uv[1] * uv)
        # grime: dirt toward the ground and in patches, soot in hollows
        cl = bm.loops.layers.color.new('Color')
        for f in bm.faces:
            for l in f.loops:
                p = l.vert.co; n1 = noise.noise(p * 0.9); n2 = noise.noise(p * 3.1 + Vector((5, 1, 2)))
                k = 1.0 - grime * (0.5 + 0.9 * max(0, n1) + 0.5 * max(0, n2)) - grime * 0.32 * max(0.0, 1.0 - p.z * 0.75)
                k = max(0.42, min(1.0, k + 0.12 * n2)); l[cl] = (k, k, k, 1.0)
        bm.to_mesh(me); bm.free()
        return o

def export_all(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_vertex_color='ACTIVE', export_all_vertex_colors=False)
