"""Pose previews of the hand: blender -b art/hand.blend --python art/preview_hand.py -- <outPrefix>"""
import bpy, sys, math
from mathutils import Vector
prefix = sys.argv[sys.argv.index('--') + 1]
hand = bpy.data.objects['Hand']
keys = hand.data.shape_keys.key_blocks
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'SINGLE'
scene.display.shading.single_color = (0.45, 0.8, 0.75)
scene.render.resolution_x = 700
scene.render.resolution_y = 520
scene.world = bpy.data.worlds.new('w'); scene.world.color = (0.08, 0.1, 0.12)
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = 0.62
co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co); scene.camera = co
poses = {'basis': {}, 'grip': {'Grip': 1}, 'weapon': {'Weapon': 1, 'Swell': 1}}
for name, vals in poses.items():
    for k in keys:
        if k.name != 'Basis':
            k.value = vals.get(k.name, 0)
    show_weapon = name == 'weapon'
    for n in ('Barrel', 'Maw', 'Tooth', 'Gland'):
        bpy.data.objects[n].hide_render = not show_weapon
    # side view and three-quarter from above, looking down +Y toward the fingers
    for view, loc, rot in (('side', (0.9, 0.12, 0.05), (math.radians(90), 0, math.radians(90))), ('top', (0.12, 0.12, 0.9), (0, 0, 0))):
        co.location = (loc[0], loc[1] - 0.2 if view == 'side' else loc[1], loc[2]) if False else Vector(loc)
        co.rotation_euler = rot
        co.location.y = 0.0 if view == 'side' else -0.15
        co.location.z = 0.05 if view == 'side' else 0.9
        scene.render.filepath = f'{prefix}_{name}_{view}.png'
        bpy.ops.render.render(write_still=True)
print('DONE')
