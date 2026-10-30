"""Modelling toolkit for the INTRUDER kit (Blender 5.x, headless).
Conventions: metres, Blender axes (X right, Y forward, Z up). Assets face -Y (exported to +Z in three.js).
Origin sits on the floor at the footprint centre unless an asset documents a pivot.

Everything here builds real topology through bmesh: rounded boxes (bevel with segments), recessed/raised panels (inset + extrude),
swept tubes along splines (cables, handles, seals), lathes (drums, plinths, lenses) and profile extrusions (consoles, barriers).
"""
import bpy, bmesh, math
from math import pi, sin, cos, sqrt
from mathutils import Vector, Matrix

# Shared palette. The game substitutes its own world materials by NAME, these colours are for Blender previews only.
PALETTE = {
    'PaintStructural': (0.30, 0.34, 0.38, 0), 'PaintEquipment': (0.62, 0.65, 0.66, 0), 'PaintDark': (0.10, 0.11, 0.12, 0),
    'MetalBare': (0.45, 0.47, 0.48, 0), 'Rubber': (0.04, 0.04, 0.04, 0), 'Hazard': (0.78, 0.58, 0.08, 0),
    'SafetyOrange': (0.70, 0.30, 0.06, 0), 'Screen': (0.10, 0.45, 0.55, 1.5), 'Status': (0.1, 0.8, 0.3, 2.0),
    'Glass': (0.6, 0.8, 0.85, 0), 'Drum': (0.55, 0.12, 0.08, 0), 'Canister': (0.30, 0.34, 0.36, 0), 'Fabric': (0.20, 0.24, 0.30, 0),
    'Gel': (0.1, 0.5, 0.45, 0), 'GelCore': (0.3, 0.9, 0.8, 1.0),
}
_mats = {}


def get_mat(name):
    if name in _mats:
        return _mats[name]
    r, g, b, em = PALETTE[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1)
    bsdf.inputs['Roughness'].default_value = 0.85
    if em:
        bsdf.inputs['Emission Color'].default_value = (r, g, b, 1)
        bsdf.inputs['Emission Strength'].default_value = em
    _mats[name] = m
    return m


class Part:
    """One exported mesh object built from many primitives that share the kit materials."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.slots = []
        self.uv = self.bm.loops.layers.uv.new('UVMap')

    def slot(self, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)

    def _tmp(self):
        t = bmesh.new()
        t.loops.layers.uv.new('UVMap')
        return t

    def _emit(self, t, mat, c, rot=None, pre=None):
        """Tag the temp bmesh with the material, move it to c, and append it to this part."""
        mi = self.slot(mat)
        for f in t.faces:
            if f.material_index == 0 and not getattr(f, '_keep', False):
                f.material_index = mi
        M = Matrix.Translation(Vector(c)) @ (rot if rot is not None else Matrix.Identity(4))
        if pre is not None:
            M = M @ pre
        bmesh.ops.transform(t, matrix=M, verts=t.verts)
        me = bpy.data.meshes.new('tmp')
        t.to_mesh(me)
        t.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    # ---- primitives -------------------------------------------------------------
    def rbox(self, c, s, mat, r=0.02, seg=2, rot=None, panel=None, panel_mat=None):
        """Rounded box. panel=(dir, inset, depth): inset the largest face facing dir; depth<0 recesses, >0 raises."""
        t = self._tmp()
        res = bmesh.ops.create_cube(t, size=1.0, calc_uvs=True)
        for v in res['verts']:
            v.co = Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
        if r > 0:
            rr = min(r, min(s) * 0.48)
            bmesh.ops.bevel(t, geom=list(t.edges), offset=rr, segments=seg, profile=0.5, affect='EDGES')
        mi = self.slot(mat)
        for f in t.faces:
            f.material_index = mi
        if panel:
            d, ins, dep = panel
            d = Vector(d)
            best = max((f for f in t.faces if f.normal.dot(d) > 0.95), key=lambda f: f.calc_area(), default=None)
            if best is not None:
                out = bmesh.ops.inset_individual(t, faces=[best], thickness=ins, depth=dep)
                pm = self.slot(panel_mat) if panel_mat else mi
                for f in out.get('faces', []):
                    f.material_index = pm
        self._emit_raw(t, c, rot)
        return self

    def _emit_raw(self, t, c, rot=None, pre=None):
        M = Matrix.Translation(Vector(c)) @ (rot if rot is not None else Matrix.Identity(4))
        if pre is not None:
            M = M @ pre
        bmesh.ops.transform(t, matrix=M, verts=t.verts)
        me = bpy.data.meshes.new('tmp')
        t.to_mesh(me)
        t.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    def cyl(self, c, r, h, mat, axis='z', seg=18, r2=None, bev=0.0, cap=True, rot=None):
        rot_axis = {'z': Matrix.Identity(4), 'x': Matrix.Rotation(pi / 2, 4, 'Y'), 'y': Matrix.Rotation(pi / 2, 4, 'X')}[axis]
        t = self._tmp()
        bmesh.ops.create_cone(t, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=(r if r2 is None else r2), depth=h, calc_uvs=True)
        if bev > 0:
            bmesh.ops.bevel(t, geom=list(t.edges), offset=min(bev, r * 0.45, h * 0.45), segments=2, profile=0.5, affect='EDGES')
        mi = self.slot(mat)
        for f in t.faces:
            f.material_index = mi
        self._emit_raw(t, c, rot, rot_axis)
        return self

    def sphere(self, c, r, mat, scale=(1, 1, 1), seg=16):
        t = self._tmp()
        res = bmesh.ops.create_uvsphere(t, u_segments=seg, v_segments=max(6, seg // 2), radius=1.0, calc_uvs=True)
        for x in res['verts']:
            x.co = Vector((x.co.x * r * scale[0], x.co.y * r * scale[1], x.co.z * r * scale[2]))
        mi = self.slot(mat)
        for f in t.faces:
            f.material_index = mi
        self._emit_raw(t, c)
        return self

    def lathe(self, c, profile, mat, seg=24, closed=True, uv_v=True):
        """Revolve [(radius, z), ...] about the Z axis through c. Profile is listed bottom to top; closed adds axis caps."""
        pts = list(profile)
        rows = []
        for (r, z) in pts:
            row = []
            for j in range(seg):
                a = 2 * pi * j / seg
                v = self.bm.verts.new(Vector((c[0] + cos(a) * r, c[1] + sin(a) * r, c[2] + z)))
                row.append(v)
            rows.append(row)
        zspan = max(1e-6, pts[-1][1] - pts[0][1])
        mi = self.slot(mat)
        for i in range(len(pts) - 1):
            for j in range(seg):
                j2 = (j + 1) % seg
                f = self.bm.faces.new((rows[i][j], rows[i][j2], rows[i + 1][j2], rows[i + 1][j]))
                f.material_index = mi
                for loop, (u, v) in zip(f.loops, ((j / seg, (pts[i][1] - pts[0][1]) / zspan), ((j + 1) / seg, (pts[i][1] - pts[0][1]) / zspan),
                                                   ((j + 1) / seg, (pts[i + 1][1] - pts[0][1]) / zspan), (j / seg, (pts[i + 1][1] - pts[0][1]) / zspan))):
                    loop[self.uv].uv = (u, v)
        if closed:
            for idx, row in ((0, rows[0]), (-1, rows[-1])):
                if pts[idx][0] > 1e-6:
                    ctr = self.bm.verts.new(Vector((c[0], c[1], c[2] + pts[idx][1])))
                    for j in range(seg):
                        j2 = (j + 1) % seg
                        f = self.bm.faces.new((ctr, row[j2], row[j]) if idx == 0 else (ctr, row[j], row[j2]))
                        f.material_index = mi
        return self

    def tube(self, pts, r, mat, seg=8, caps=True, taper=None, samples=None):
        """Swept tube along a Catmull-Rom spline through pts. r may be a float or f(t)->radius."""
        pts = [Vector(p) for p in pts]
        n = samples or max(8, len(pts) * 6)
        path = [_catmull(pts, i / (n - 1) * (len(pts) - 1)) for i in range(n)]
        rf = r if callable(r) else (lambda t, rr=r: rr)
        # parallel-transport frames
        t0 = (path[1] - path[0]).normalized()
        up = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
        nrm = (up - t0 * up.dot(t0)).normalized()
        rows = []
        mi = self.slot(mat)
        prev_t = t0
        for i, p in enumerate(path):
            tan = (path[min(n - 1, i + 1)] - path[max(0, i - 1)]).normalized()
            ax = prev_t.cross(tan)
            if ax.length > 1e-6:
                nrm = Matrix.Rotation(math.asin(min(1.0, ax.length)), 3, ax.normalized()) @ nrm
            nrm = (nrm - tan * nrm.dot(tan)).normalized()
            bn = tan.cross(nrm)
            prev_t = tan
            rad = rf(i / (n - 1))
            row = []
            for j in range(seg):
                a = 2 * pi * j / seg
                row.append(self.bm.verts.new(p + (nrm * cos(a) + bn * sin(a)) * rad))
            rows.append(row)
        for i in range(n - 1):
            for j in range(seg):
                j2 = (j + 1) % seg
                f = self.bm.faces.new((rows[i][j], rows[i][j2], rows[i + 1][j2], rows[i + 1][j]))
                f.material_index = mi
                for loop, (u, v) in zip(f.loops, ((i / n, j / seg), (i / n, (j + 1) / seg), ((i + 1) / n, (j + 1) / seg), ((i + 1) / n, j / seg))):
                    loop[self.uv].uv = (u, v)
        if caps:
            for row, flip in ((rows[0], True), (rows[-1], False)):
                c = sum((v.co for v in row), Vector()) / seg
                cv = self.bm.verts.new(c)
                for j in range(seg):
                    j2 = (j + 1) % seg
                    f = self.bm.faces.new((cv, row[j2], row[j]) if flip else (cv, row[j], row[j2]))
                    f.material_index = mi
        return self

    def extrude(self, outline, depth, mat, plane='xz', c=(0, 0, 0), r=0.0):
        """Extrude a closed 2D outline [(a, b), ...]. plane 'xz' extrudes along Y (front profile); 'yz' along X (side profile); 'xy' along Z (plan profile)."""
        def to3(a, b, d):
            return Vector((a, d, b)) if plane == 'xz' else (Vector((d, a, b)) if plane == 'yz' else Vector((a, b, d)))
        t = self._tmp()
        verts = [t.verts.new(to3(a, b, -depth / 2)) for (a, b) in outline]
        face = t.faces.new(verts)
        res = bmesh.ops.extrude_face_region(t, geom=[face])
        nv = [e for e in res['geom'] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(t, verts=nv, vec=to3(0, 0, depth))
        bmesh.ops.recalc_face_normals(t, faces=list(t.faces))
        if r > 0:
            bmesh.ops.bevel(t, geom=list(t.edges), offset=r, segments=2, profile=0.5, affect='EDGES')
        mi = self.slot(mat)
        for f in t.faces:
            f.material_index = mi
        self._emit_raw(t, c)
        return self

    # ---- finish ------------------------------------------------------------------
    def build(self, sharp_deg=38, parent=None, loc=(0, 0, 0)):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        lim = math.radians(sharp_deg)
        for e in bm.edges:
            e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim)
        for f in bm.faces:
            f.smooth = True
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for m in self.slots:
            me.materials.append(get_mat(m))
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        if parent is not None:
            ob.parent = parent
        ob.location = loc
        return ob


def _catmull(pts, u):
    n = len(pts)
    if n == 2:
        return pts[0].lerp(pts[1], u)
    i = min(n - 2, int(u))
    f = u - i
    p0, p1, p2, p3 = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(n - 1, i + 2)]
    return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3)


def collider(name, w, d, h):
    """Simple separate collision mesh: a footprint box named COL_<asset> (never rendered by the game)."""
    p = Part('COL_' + name)
    p.rbox((0, 0, h / 2), (w, d, h), 'PaintDark', r=0)
    ob = p.build()
    ob.display_type = 'WIRE'
    return ob


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    e.location = loc
    if parent is not None:
        e.parent = parent
    return e


def quad_screen(name, w, h, c, mat='Screen', tilt=0.0):
    """Screen face with 0..1 UVs, facing -Y, optionally tilted back about X."""
    me = bpy.data.meshes.new(name)
    hw, hh = w / 2, h / 2
    pts = [Vector((-hw, 0, -hh)), Vector((hw, 0, -hh)), Vector((hw, 0, hh)), Vector((-hw, 0, hh))]
    R = Matrix.Rotation(tilt, 3, 'X')
    me.from_pydata([R @ p + Vector(c) for p in pts], [], [(0, 1, 2, 3)])
    me.update()
    uvl = me.uv_layers.new(name='UVMap')
    uvs = {0: (0, 0), 1: (1, 0), 2: (1, 1), 3: (0, 1)}
    for poly in me.polygons:
        for li in poly.loop_indices:
            uvl.data[li].uv = uvs[me.loops[li].vertex_index]
    me.materials.append(get_mat(mat))
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob
