"""Contact sheet of the kit for review: blender -b art/kit.blend --python art/preview_kit.py -- <out.png> [cols]"""
import bpy, sys, math
from mathutils import Vector
out = sys.argv[sys.argv.index('--') + 1]
objs = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent is None and not o.name.startswith('COL_') and not o.name.startswith('LENS_') and not o.name.startswith('SCREEN')]
objs.sort(key=lambda o: o.name)
# lay out in a grid in the XY plane, turn each to show its front (-Y) towards the camera
cols = 8
gap = 4.4
for i, o in enumerate(objs):
    o.location = ((i % cols) * gap, -(i // cols) * gap * 1.6, 0)
    if o.name in ('door_leaf',):
        o.location.z = 1.5
    if o.name == 'scanner_arm':
        o.location.z = 4.5
    if o.name.startswith('SCREEN'):
        o.location.z = 0
for o in bpy.data.objects:
    if o.name.startswith('COL_'):
        o.hide_render = True
        o.hide_viewport = True
    if o.name.startswith('LENS_'):
        o.location = (0, 0, 0)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x = 2000
scene.render.resolution_y = 1100
scene.world = bpy.data.worlds.new('w')
scene.world.color = (0.12, 0.13, 0.15)
rows = math.ceil(len(objs) / cols)
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = cols * gap * 0.82
co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co); scene.camera = co
co.location = ((cols - 1) * gap / 2, -(rows - 1) * gap * 0.8 - 40, 1.7 + 4)
co.rotation_euler = (math.radians(78), 0, 0)
# a floor plane gives scale context
bpy.ops.mesh.primitive_plane_add(size=400, location=((cols - 1) * gap / 2, -(rows - 1) * gap * 0.8, -0.01))
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print('PREVIEW', out, len(objs))
