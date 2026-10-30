"""Small construction helpers for the INTRUDER environment kit (Blender 5.x, run headless).
Units are metres. Blender axes: X right, Y forward, Z up. Every asset's FRONT faces -Y (becomes +Z in three.js),
the origin sits at the centre of the footprint on the floor. Shared material names are mapped to game materials by the loader."""
import bpy, bmesh, math
from mathutils import Vector, Matrix

PALETTE = {  # name: (base colour, emission strength) - previews only; the game substitutes its own world materials
    'PaintStructural': ((0.32, 0.36, 0.40), 0), 'PaintEquipment': ((0.62, 0.65, 0.66), 0), 'PaintDark': ((0.10, 0.11, 0.12), 0),
    'MetalBare': ((0.45, 0.47, 0.48), 0), 'Rubber': ((0.04, 0.04, 0.04), 0), 'Hazard': ((0.78, 0.58, 0.08), 0),
    'SafetyOrange': ((0.70, 0.30, 0.06), 0), 'Screen': ((0.10, 0.45, 0.55), 2.0), 'Status': ((0.1, 0.8, 0.3), 3.0),
    'Glass': ((0.6, 0.8, 0.85), 0), 'Drum': ((0.55, 0.12, 0.08), 0), 'Canister': ((0.30, 0.34, 0.36), 0), 'Fabric': ((0.20, 0.24, 0.30), 0),
}
_mat_cache = {}

def get_mat(name):
    if name in _mat_cache:
        return _mat_cache[name]
    col, em = PALETTE[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Roughness'].default_value = 0.8
    if em:
        b.inputs['Emission Color'].default_value = (*col, 1)
        b.inputs['Emission Strength'].default_value = em
    if name == 'Glass':
        b.inputs['Alpha'].default_value = 0.2
    _mat_cache[name] = m
    return m


class Asset:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.slots = []
        self.bm.loops.layers.uv.verify()

    def _slot(self, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)

    def box(self, c, s, mat, bev=0.012, rot=None):
        """Axis-aligned (optionally rotated) box: centre c, size s, bevelled edges."""
        idx = self._slot(mat)
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = r['verts']
        M = Matrix.Translation(Vector(c)) @ (rot if rot is not None else Matrix.Identity(4)) @ Matrix.Diagonal(Vector((s[0], s[1], s[2], 1)))
        for v in verts:
            v.co = M @ v.co
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = idx
        if bev > 0:
            b = min(bev, min(s) * 0.45)
            edges = list({e for v in verts for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=edges, offset=b, segments=1, affect='EDGES')
        return self

    def cyl(self, c, r, h, mat, axis='z', seg=16, bev=0.0, r2=None, cap=True):
        idx = self._slot(mat)
        rot = {'z': Matrix.Identity(4), 'x': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'y': Matrix.Rotation(math.pi / 2, 4, 'X')}[axis]
        r_ = bmesh.ops.create_cone(self.bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=(r if r2 is None else r2), depth=h, calc_uvs=True,
                                   matrix=Matrix.Translation(Vector(c)) @ rot)
        for f in {f for v in r_['verts'] for f in v.link_faces}:
            f.material_index = idx
        if bev > 0:
            edges = list({e for v in r_['verts'] for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=edges, offset=bev, segments=1, affect='EDGES')
        return self

    def torus_ring(self, c, R, r, mat, axis='z', seg=24, tube=8):
        """Ring built from a swept circle (kept low-poly)."""
        idx = self._slot(mat)
        rot = {'z': Matrix.Identity(4), 'x': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'y': Matrix.Rotation(math.pi / 2, 4, 'X')}[axis]
        M = Matrix.Translation(Vector(c)) @ rot
        rings = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            row = []
            for j in range(tube):
                b = 2 * math.pi * j / tube
                p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
                row.append(self.bm.verts.new(M @ p))
            rings.append(row)
        for i in range(seg):
            for j in range(tube):
                f = self.bm.faces.new((rings[i][j], rings[(i + 1) % seg][j], rings[(i + 1) % seg][(j + 1) % tube], rings[i][(j + 1) % tube]))
                f.material_index = idx
        return self

    def finish(self, smooth_angle=35):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.slots:
            me.materials.append(get_mat(m))
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_angle))
        except Exception:
            for p in me.polygons:
                p.use_smooth = False
        ob.select_set(False)
        return ob


def collider(name, size, center_z=None):
    """Separate, invisible gameplay collider (footprint box) named COL_<asset>; origin matches the asset."""
    w, d, h = size
    a = Asset('COL_' + name)
    a.box((0, 0, h / 2 if center_z is None else center_z), (w, d, h), 'PaintDark', bev=0)
    ob = a.finish()
    ob.display_type = 'WIRE'
    return ob


def uv_quad(name, w, h, c, mat):
    """Single quad facing -Y with 0..1 UVs, used for screens that receive a runtime texture."""
    me = bpy.data.meshes.new(name)
    x, z = w / 2, h / 2
    verts = [(c[0] - x, c[1], c[2] - z), (c[0] + x, c[1], c[2] - z), (c[0] + x, c[1], c[2] + z), (c[0] - x, c[1], c[2] + z)]
    me.from_pydata(verts, [], [(0, 1, 2, 3)])
    me.update()
    layer = me.uv_layers.new(name='UVMap')
    uvs = {0: (0, 0), 1: (1, 0), 2: (1, 1), 3: (0, 1)}
    for poly in me.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[me.loops[li].vertex_index]
    me.materials.append(get_mat(mat))
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob
