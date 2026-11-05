# INTRUDER: the valley's plants and animals, in detail. Soft, organic, tentacle-related shapes, to belong to the same world as the survivor. Uses art/modelkit.py.
# Each node is one mesh with one material, so the game can draw hundreds of them as instances and tint and light them itself.
import bpy, math, random, sys
from mathutils import Vector
sys.path.insert(0, r"C:\Users\cartd\Desktop\Intruder-Rebuild\art")
import importlib, modelkit; importlib.reload(modelkit)
from modelkit import B, export_all
import modelkit as _mk
def mat(n, c, r=0.7, e=None, s=0.0): return _mk.mat(n, c, r, 0.0, e, s)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for b in list(bpy.data.meshes): bpy.data.meshes.remove(b)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
R = random.Random(11)
M = {
    'bark': mat('Bark', '#1c4a4c', 0.8, '#072a2c', 0.3), 'frond': mat('Frond', '#1f7468', 0.55, '#0a3f3a', 0.45), 'glow': mat('Glow', '#b8ffe6', 0.4, '#8fffe0', 2.5),
    'cap': mat('CapSkin', '#46307a', 0.5, '#1a1040', 0.45), 'gill': mat('CapGlow', '#d9a8ff', 0.5, '#c58aff', 2.2), 'stem': mat('CapStem', '#26505a', 0.7),
    'curl': mat('CurlSkin', '#1b5e58', 0.55, '#08302c', 0.4), 'pod': mat('PodSkin', '#7ff0ff', 0.25, '#3fd8ff', 1.6),
    'drift': mat('DriftBell', '#8ff5e6', 0.3, '#6ff5dc', 1.2), 'skit': mat('SkitShell', '#16303c', 0.45), 'eye': mat('SkitEye', '#9ffff0', 0.3, '#9ffff0', 3),
    'strid': mat('StriderSkin', '#22394a', 0.7, '#071a22', 0.3), 'stridglow': mat('StriderGlow', '#ffd9a8', 0.4, '#ffb870', 2.5),
}

# ---- Frond: a thick flared ringed trunk leaning a little, crowned with drooping feathered fronds ending in glowing bulbs
tr, fr, gl = B(), B(), B()
tr.tube([(0, -0.1, 0), (0.05, 0.6, 0.02), (0.22, 2.2, -0.05), (0.2, 3.9, 0.1), (0.05, 5.0, 0.12)], [0.62, 0.34, 0.2, 0.17, 0.12], sides=14, rings=26, ribs=0.05, ribN=9, rough=0.1)
for i in range(6):
    a = i * 1.047 + 0.5; tr.tube([(math.cos(a) * 0.15, 0.6, math.sin(a) * 0.15), (math.cos(a) * 0.55, 0.16, math.sin(a) * 0.55), (math.cos(a) * 1.2, -0.08, math.sin(a) * 1.2)], [0.16, 0.11, 0.025], sides=7, rings=8, rough=0.1)
top = Vector((0.05, 4.95, 0.12))
for i in range(10):
    a = i * 0.628 + R.random() * 0.3; ln = 2.0 + R.random() * 0.9; dx, dz = math.cos(a), math.sin(a)
    p0, p1, p2 = top, top + Vector((dx * ln * 0.34, 0.75, dz * ln * 0.34)), top + Vector((dx * ln * 0.72, 0.2, dz * ln * 0.72))
    end = top + Vector((dx * ln, -1.1 - R.random() * 1.1, dz * ln))
    fr.tube([p0, p1, p2, end], [0.08, 0.09, 0.06, 0.02], sides=5, rings=12, flat=0.5)
    # leaflets along the spine
    from modelkit import catmull
    sp = catmull([p0, p1, p2, end], 14)
    for k in range(2, 13):
        for s in (-1, 1):
            base = sp[k]; side = Vector((-dz, 0, dx)) * s; w = (0.42 - 0.02 * k) * (0.6 + 0.4 * math.sin(k * 0.45))
            tip = base + side * w + Vector((dx, -0.28, dz)) * w * 0.65; mid = base + side * w * 0.5 + Vector((dx, 0.03, dz)) * w * 0.16
            b0 = len(fr.v); fr.v += [base, mid + Vector((dx, 0, dz)) * 0.055, tip, mid - Vector((dx, 0, dz)) * 0.055]; fr.f.append((b0, b0 + 1, b0 + 2, b0 + 3))
    gl.blob(sp[-1] + Vector((0, -0.14, 0)), 0.14, sy=1.35, seg=8, rows=6)
tr.make('FrondTrunk', M['bark'], grime=0.4, uv=0.7); fr.make('FrondLeaf', M['frond'], grime=0.2); gl.make('FrondGlow', M['glow'], grime=0)

# ---- Cap: a soft stem carrying overlapping fungal shelves, ribbed gills glowing beneath, spots on top
st, ca, gi = B(), B(), B()
st.tube([(0, -0.05, 0), (0.07, 0.6, 0), (-0.03, 1.2, 0.04), (0.02, 1.85, 0)], [0.3, 0.17, 0.13, 0.1], sides=10, rings=14, rough=0.1, ribs=0.03, ribN=5)
for y, r, ox in [(1.95, 0.72, 0.0), (1.28, 0.54, 0.14), (0.72, 0.42, -0.12)]:
    ca.blob((ox, y, 0), r, sy=0.42, seg=22, rows=8, top=0.52, rib=0.022, ribN=11, rough=0.05)
    gi.blob((ox, y + 0.01, 0), r * 0.94, sy=0.12, seg=30, rows=4, rib=0.08, ribN=15)
    for i in range(9):
        a = i * 2.4; rr = r * (0.2 + 0.08 * i); gi.blob((ox + math.cos(a) * rr, y + r * 0.42 * math.sqrt(max(0.02, 1 - (rr / r) ** 2)), math.sin(a) * rr), 0.032 + 0.012 * (i % 3), sy=0.5, seg=6, rows=3)
st.make('CapStem', M['stem'], grime=0.35); ca.make('CapHead', M['cap'], grime=0.25); gi.make('CapGills', M['gill'], grime=0)

# ---- Curl: tentacle grass with little suckers
cu, ct = B(), B()
for i in range(9):
    a = i * 0.7 + R.random(); d = 0.08 + R.random() * 0.24; x, z = math.cos(a) * d, math.sin(a) * d; h = 0.7 + R.random() * 0.8; dx, dz = math.cos(a), math.sin(a)
    tip = Vector((x + dx * 0.34, h + 0.1, z + dz * 0.34))
    cu.tube([(x, -0.03, z), (x + dx * 0.03, h * 0.5, z + dz * 0.03), (x + dx * 0.05, h, z + dz * 0.05), (x + dx * 0.22, h + 0.22, z + dz * 0.22), tip], [0.06, 0.05, 0.035, 0.025, 0.012], sides=6, rings=13, ribs=0.09, ribN=6)
    ct.blob(tip, 0.032, seg=6, rows=4)
cu.make('CurlBlade', M['curl'], grime=0.2); ct.make('CurlTip', M['glow'], grime=0)

# ---- Pod: veined sacs on short stalks, with a root mat
po = B()
for x, z, r in [(0, 0, 0.3), (0.42, 0.14, 0.2), (-0.28, 0.3, 0.17), (0.1, -0.36, 0.13)]:
    po.tube([(x, -0.03, z), (x, r * 0.6, z)], [r * 0.5, r * 0.2], sides=6, rings=3, cap=False)
    po.blob((x, r * 1.28, z), r, sy=1.18, seg=14, rows=9, rib=0.06, ribN=7)
po.make('Pod', M['pod'], grime=0)

# ---- Drifter: a soft bell with a frilled edge, frilled mouth-arms and long threads
dr = B()
seg, rows = 22, 9
for i in range(rows + 1):
    th = (math.pi * 0.6) * i / rows
    for j in range(seg):
        a = 2 * math.pi * j / seg; f = 1 + (0.1 * math.sin(a * 9) * (i / rows) ** 2)
        dr.v.append(Vector((math.sin(th) * math.cos(a) * f, math.cos(th) * 0.82 - (0.1 * math.sin(a * 9) * (i / rows) ** 3), math.sin(th) * math.sin(a) * f)))
for i in range(rows):
    for j in range(seg): dr.f.append((i * seg + j, (i + 1) * seg + j, (i + 1) * seg + (j + 1) % seg, i * seg + (j + 1) % seg))
for i in range(11):
    a = i * 0.571; x, z = math.cos(a) * 0.6, math.sin(a) * 0.6
    dr.tube([(x, -0.1, z), (x * 1.1, -0.9, z * 1.1), (x * 0.8, -1.7, z * 0.8), (x * 1.05, -2.6, z * 1.05)], [0.04, 0.03, 0.016, 0.005], sides=4, rings=9, cap=False)
for i in range(4):
    a = i * 1.57; x, z = math.cos(a) * 0.17, math.sin(a) * 0.17
    dr.tube([(x, -0.1, z), (x * 1.3, -0.6, z * 1.3), (x * 0.8, -1.2, z * 0.8)], [0.05, 0.09, 0.012], sides=10, rings=10, cap=False, fold=0.4, folds=4, flat=0.5)
dr.make('Drifter', M['drift'], grime=0)

# ---- Skitter: segmented shell, jointed legs, antennae
sk, sy_ = B(), B()
for i in range(4): sk.blob((0, 0.17 + 0.01 * i, -0.16 + i * 0.12), 0.165 - 0.012 * abs(i - 1), sy=0.58, sz=0.62, seg=12, rows=6)
sk.blob((0, 0.2, -0.26), 0.1, sy=0.62, seg=9, rows=5)
for s in (-1, 1):
    for i in range(3):
        z = -0.13 + i * 0.13
        sk.tube([(s * 0.13, 0.17, z), (s * 0.3, 0.29, z + (i - 1) * 0.05), (s * 0.42, 0.01, z + (i - 1) * 0.1)], [0.024, 0.019, 0.005], sides=5, rings=7)
    sk.tube([(s * 0.05, 0.26, -0.3), (s * 0.13, 0.36, -0.42), (s * 0.2, 0.34, -0.56)], [0.012, 0.008, 0.002], sides=4, rings=6)
    sy_.blob((s * 0.05, 0.25, -0.31), 0.022, seg=6, rows=4)
sk.make('Skitter', M['skit'], grime=0.2); sy_.make('SkitterEyes', M['eye'], grime=0)

# ---- Strider: a tall, slow, gentle thing on stilts. Body hangs low between its legs. One leg model, walked by the game (origin at the hip).
bo, gw, le = B(), B(), B()
bo.blob((0, 0, 0), 1.0, sx=0.95, sy=0.7, sz=1.7, seg=22, rows=12, rough=0.06, rib=0.025, ribN=14)
bo.tube([(0, 0.15, -1.3), (0, 0.7, -2.3), (0, 0.6, -3.1), (0, 0.1, -3.7)], [0.42, 0.3, 0.22, 0.14], sides=12, rings=16, ribs=0.05, ribN=8)
for i in range(7): bo.blob((0, 0.62, -1.2 + i * 0.5), 0.14 - 0.008 * abs(i - 3), sy=1.4, sz=0.5, seg=7, rows=5)     # a ridge down its back
for s in (-1, 1): bo.tube([(s * 0.09, 0.15, -3.6), (s * 0.2, -0.3, -3.95), (s * 0.14, -0.75, -4.05)], [0.05, 0.03, 0.006], sides=6, rings=7)    # feelers it grazes with
for i in range(7): gw.blob((0, -0.58, -1.3 + i * 0.44), 0.11, seg=8, rows=5)
gw.blob((0.09, 0.08, -3.75), 0.05, seg=7, rows=4); gw.blob((-0.09, 0.08, -3.75), 0.05, seg=7, rows=4)
le.tube([(0, 0, 0), (0.7, 1.25, 0), (1.5, 0.9, 0), (2.05, -2.6, 0), (2.25, -6.1, 0)], [0.16, 0.14, 0.11, 0.075, 0.03], sides=8, rings=22, ribs=0.05, ribN=8)
bo.make('StriderBody', M['strid'], grime=0.28); gw.make('StriderGlow', M['stridglow'], grime=0); le.make('StriderLeg', M['strid'], grime=0.2)

print('VALLEY LIFE', {o.name: len(o.data.polygons) for o in bpy.data.objects})
if len(ARGS) >= 1: export_all(ARGS[0])
if len(ARGS) >= 2: bpy.ops.wm.save_as_mainfile(filepath=ARGS[1])
