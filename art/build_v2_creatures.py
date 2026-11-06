# INTRUDER V2: the first organic thing you ever absorb. A shellback: a slow, harmless grazer about the size of a large dog, a domed ribbed shell over a soft frilled foot, two eye stalks.
# Parts are split at their joints so the game can animate them. Exports to public/models/v2_creatures.glb. Run inside Blender with exec(open(path).read()).
import bpy, math, random, sys, importlib
from mathutils import Vector, noise
sys.path.insert(0, r"C:\Users\cartd\Desktop\Intruder-V2\art")
import v2kit; importlib.reload(v2kit)
from v2kit import B, mat, clear_scene, export_all, save_v2

clear_scene()
save_v2(r"art\v2_creatures.blend")
R = random.Random(4); PI = math.pi
M = {
  'shell': mat('ShellChitin', '#4e3b2b', 0.4), 'foot': mat('ShellFoot', '#8c6a68', 0.42), 'under': mat('ShellUnder', '#c2a093', 0.5),
  'eye': mat('ShellEye', '#14100c', 0.12), 'lamp': mat('ShellPhoto', '#ffd7a0', 0.4, 0.0, '#ffc488', 1.6),
}
# the shell: a dome, ribbed along its length, knobbed at the crown, its rim overhanging the foot. The chitin on your own arm comes from this.
sh = B()
def dome(u, v):
    a = u * 2 * PI; th = v * PI * 0.56
    rib = 1 + 0.045 * math.cos(a * 11) * pow(math.sin(th), 0.8)
    grow = 1 + 0.024 * math.sin(v * 44) * v
    lump = 1 + noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, v * 3))) * 0.06
    k = rib * grow * lump
    return Vector((math.sin(th) * math.cos(a) * 0.62 * k, math.cos(th) * 0.44 * k + 0.1, math.sin(th) * math.sin(a) * 0.86 * k))
def dome_col(u, v):
    a = u * 2 * PI
    return min(1.0, 0.42 + 0.5 * max(0.0, math.cos(a * 11)) * v + 0.5 * pow(v, 3))
sh.grid(dome, 66, 22, closed_u=True, col=dome_col)
sh.make('Shell', M['shell'], grime=0.18, uv=2.0)
# the foot: soft, wide, wrinkled, with a frill that ripples as it moves
ft = B()
def foot(u, v):
    a = u * 2 * PI; rad = pow(v, 0.55)
    fr = 1 + 0.05 * math.sin(a * 17) * pow(v, 4)
    return Vector((math.cos(a) * 0.72 * rad * fr, 0.08 - 0.09 * pow(v, 2.5) + 0.018 * math.sin(a * 17) * pow(v, 5), math.sin(a) * 0.96 * rad * fr))
ft.grid(foot, 54, 14, closed_u=True)
ft.tube([(0, 0.08, -0.72), (0, 0.15, -0.97), (0, 0.13, -1.14), (0, 0.09, -1.24)], [0.2, 0.17, 0.12, 0.05], sides=14, rings=14)     # the soft head
ft.make('ShellFoot', M['foot'], uv=3.0)
# eye stalks: origin at the base so they can look about
for sg, name in ((-1, 'ShellStalkL'), (1, 'ShellStalkR')):
    st = B(); st.tube([(0, 0, 0), (sg * 0.03, 0.14, -0.03), (sg * 0.06, 0.26, -0.03)], [0.034, 0.024, 0.02], sides=9, rings=8); st.make(name, M['foot'], uv=4.0)
    ey = B(); ey.blob((sg * 0.065, 0.285, -0.035), 0.036, seg=12, rows=8); ey.make(name + 'Eye', M['eye'], uv=4.0)
# small lit pores along the rim: it is alive, and it is easy to see in a dark room
pr = B()
for i in range(18):
    a = i / 18 * 2 * PI; pr.blob((math.cos(a) * 0.6, 0.0 + 0.012 * math.sin(a * 5), math.sin(a) * 0.82), 0.016, seg=7, rows=4)
pr.make('ShellPores', M['lamp'], uv=4.0)
# ================================================================ THE BLADDERBACK: a second harmless grazer. A soft fat body carrying its stomach on the outside: swollen, faintly lit sacs on a low wet crawl of stubby feet.
M.update({'blskin': mat('BladderSkin', '#3b2a22', 0.42), 'blsac': mat('BladderSac', '#26280f', 0.18, 0.0, '#4c5812', 0.32), 'blfoot': mat('BladderFoot', '#5a4238', 0.5), 'blglow': mat('BladderDuct', '#6c7a22', 0.3, 0.0, '#a8c030', 1.6)})
bb = B()
def bbody(u, v):
    a = u * 2 * PI; th = v * PI
    lump = 1 + noise.noise(Vector((math.cos(a) * 1.6, math.sin(a) * 1.6, v * 2.6))) * 0.13 + noise.noise(Vector((math.cos(a) * 4, math.sin(a) * 4, v * 7))) * 0.035
    y = math.cos(th) * 0.3 * lump + 0.36
    return Vector((math.sin(th) * math.cos(a) * 0.5 * lump, max(0.06, y), math.sin(th) * math.sin(a) * 0.72 * lump))
bb.grid(bbody, 44, 26, closed_u=True); bb.make('Bladder', M['blskin'], grime=0.2, uv=2.5)
bs = B(); bd = B()
for x, y, z, r0 in ((0.0, 0.66, 0.06, 0.26), (0.25, 0.56, -0.2, 0.17), (-0.26, 0.56, -0.16, 0.18), (0.26, 0.55, 0.3, 0.16), (-0.24, 0.56, 0.32, 0.17), (0.0, 0.62, -0.42, 0.13), (0.0, 0.54, 0.54, 0.12)):
    bs.blob((x, y, z), r0, sx=1.0, sy=0.86, sz=1.1, seg=20, rows=14)
    for q in range(3):
        an = q * 2.1 + x * 9; p0 = Vector((x + math.cos(an) * r0 * 0.95, y - r0 * 0.1, z + math.sin(an) * r0 * 0.95)); pm = Vector((x + math.cos(an) * r0 * 1.0, y - r0 * 0.62, z + math.sin(an) * r0 * 1.02)); p1 = Vector((x * 0.96 + math.cos(an) * r0 * 0.92, y - r0 * 1.05, z * 0.98 + math.sin(an) * r0 * 0.92))
        bd.tube([p0, pm, p1], [0.008, 0.007, 0.004], sides=5, rings=7)
bs.make('BladderSacs', M['blsac'], uv=3.0); bd.make('BladderDucts', M['blglow'], uv=1.0)
bf = B()
for i in range(8):
    a = (i + 0.5) / 8 * 2 * PI; x, z = math.cos(a) * 0.42, math.sin(a) * 0.6
    bf.tube([(x * 0.8, 0.16, z * 0.8), (x * 1.12, 0.08, z * 1.12), (x * 1.26, 0.03, z * 1.26)], [0.075, 0.06, 0.038], sides=9, rings=8)
bf.tube([(0, 0.3, -0.62), (0, 0.27, -0.78), (0, 0.2, -0.88)], [0.14, 0.11, 0.07], sides=12, rings=10)     # the blunt wet head
bf.make('BladderFoot', M['blfoot'], uv=3.0)
save_v2(r"art\v2_creatures.blend")
export_all(r"public\models\v2_creatures.glb")
print('RESULT', sum(len(o.data.polygons) for o in bpy.data.objects), 'faces', bpy.data.filepath)
