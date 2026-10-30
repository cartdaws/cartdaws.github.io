"""blender -b art/robots.blend --python art/preview_robots.py -- <outPrefix>"""
import bpy, sys, math
from mathutils import Vector
prefix = sys.argv[sys.argv.index('--') + 1]
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
sc.render.resolution_x = 760; sc.render.resolution_y = 560
sc.world = bpy.data.worlds.new('w'); sc.world.color = (0.15, 0.17, 0.2)
cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
cam.type = 'ORTHO'; cam.ortho_scale = 1.9
def shot(name, hide, loc, rot, scale=1.9, centre=(0, 0, 0.4)):
    for o in bpy.data.objects:
        if o.type == 'MESH':
            top = o
            while top.parent: top = top.parent
            o.hide_render = top.name in hide
    cam.ortho_scale = scale
    co.location = loc; co.rotation_euler = rot
    sc.render.filepath = f'{prefix}_{name}.png'
    bpy.ops.render.render(write_still=True)
# game-forward is +Y in Blender. side view looks along +X; 3/4 view
side = (math.radians(90), 0, math.radians(90)); q = (math.radians(65), 0, math.radians(35))
shot('bug_side', ['Drone'], (4, 0.1, 0.4), side)
shot('bug_34', ['Drone'], (2.4, -2.8, 2.2), (math.radians(60), 0, math.radians(40)))
shot('drone_side', ['Bug'], (4, 0, 0), side, 1.6)
shot('drone_34', ['Bug'], (2.2, -2.6, 1.8), (math.radians(65), 0, math.radians(40)), 1.6)
