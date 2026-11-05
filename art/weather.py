# INTRUDER: weathering pass. Bakes grime, scorching, panel wear and rain-streaks into a vertex-colour layer on the hulls, then re-exports the GLB.
# The game's glTF loader multiplies COLOR_0 into the material colour, so no shader or texture changes are needed.
# Run inside Blender (MCP): set WEATHER = [(blend_path, glb_path, collection, [hull object names], amount, burn)] and exec this file; see the calls at the bottom.
import bpy, bmesh, math
from mathutils import Vector, noise

def weather_object(o, amount=1.0, burn=0.0, seed=0.0, streak_dir=Vector((0, 0, -1))):
    me = o.data
    if 'Weather' in me.color_attributes: me.color_attributes.remove(me.color_attributes['Weather'])
    attr = me.color_attributes.new('Weather', 'BYTE_COLOR', 'CORNER')
    mw = o.matrix_world
    # curvature-ish: how much a vertex's normal differs from its neighbours' average (edges and seams scuff, flats stay cleaner)
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    curv = {}
    for v in bm.verts:
        if not v.link_edges: curv[v.index] = 0.0; continue
        avg = Vector()
        for e in v.link_edges: avg += e.other_vert(v).normal
        avg /= len(v.link_edges)
        curv[v.index] = max(0.0, 1.0 - avg.normalized().dot(v.normal)) if avg.length > 1e-6 else 0.0
    bm.free()
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            p = mw @ me.vertices[vi].co; n = (mw.to_3x3() @ me.vertices[vi].normal).normalized()
            s = 0.55 * (0.3 + 0.7 / 1.0)
            big = noise.fractal(p * 0.35 + Vector((seed, 0, 0)), 0.5, 2.0, 4)            # broad blotches
            fine = noise.fractal(p * 3.2 + Vector((0, seed, 0)), 0.6, 2.0, 4)             # fine grain
            stre = noise.fractal(Vector((p.x * 2.4, p.y * 2.4, p.z * 0.25)) + Vector((seed, seed, 0)), 0.5, 2.0, 3)   # streaks that run down the surface
            under = max(0.0, -n.z)                                                         # undersides collect grime
            lower = max(0.0, min(1.0, (2.0 - p.z) / 6.0)) if True else 0.0                 # and the lower parts
            dirt = 0.5 * (big + 0.5) + 0.35 * under + 0.25 * max(0.0, stre) * (1.0 - abs(n.z)) + 0.35 * curv[vi] * (0.5 + fine)
            dirt = max(0.0, min(1.0, dirt * amount))
            v = 1.0 - 0.58 * dirt                                                          # darker where dirty
            tint = Vector((1.0, 0.98, 0.94)) * v                                           # warm, slightly brown grime
            # scorching: black-brown soot concentrated by noise and near the back/engines
            soot = max(0.0, min(1.0, (noise.fractal(p * 0.9 + Vector((seed * 2, 3, 1)), 0.5, 2.0, 4) + 0.25) * burn * (0.6 + 0.8 * max(0.0, -n.y if n.y < 0 else 0.0))))
            tint *= (1.0 - 0.8 * soot)
            # bright wear on edges: bare metal showing through
            wear = max(0.0, curv[vi] * 2.0 - 0.25) * (0.5 + fine)
            tint += Vector((0.16, 0.16, 0.15)) * wear * (1.0 - soot)
            attr.data[li].color = (max(0.0, min(1.0, tint.x)) ** (1 / 2.2) * 1.0, max(0.0, min(1.0, tint.y)) ** (1 / 2.2), max(0.0, min(1.0, tint.z)) ** (1 / 2.2), 1.0)
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = list(me.color_attributes).index(attr)
    # make the material show it in Blender too (a Color Attribute multiplied into the base colour)
    for mat in me.materials:
        if mat is None or not mat.use_nodes: continue
        nt = mat.node_tree
        if any(n.type == 'VERTEX_COLOR' for n in nt.nodes): continue
        pr = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if pr is None: continue
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Weather'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
        base = pr.inputs['Base Color']
        if base.links: nt.links.new(base.links[0].from_socket, mix.inputs['A'])
        else: mix.inputs['A'].default_value = base.default_value
        nt.links.new(vc.outputs['Color'], mix.inputs['B']); nt.links.new(mix.outputs['Result'], base)

def export(collection, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.collections[collection].all_objects:
        o.hide_set(False); o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False, export_vertex_color='ACTIVE')
