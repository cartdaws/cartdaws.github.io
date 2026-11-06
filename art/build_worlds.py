# INTRUDER: the other worlds, in detail. Three species and the places they live, plus a human mining post. Uses art/modelkit.py.
#   Species are split at the joints (origin of each part at its joint) so the game can animate them.
#     Kess_*   Kessith: tall, thin desert traders: folded robes, a mantle and sash, mandibled faces, four eyes
#     Grol_*   Grolm: squat ice miners: plated shell, heavy brow and tusks, tool belt, huge hands
#     Umma_*   Ummari: floating lantern people: veined frilled bell, ruffled mouth arms, trailing threads
import bpy, math, random, sys, os
from mathutils import Vector
sys.path.insert(0, r"C:\Users\cartd\Desktop\Intruder-V2\art")
import importlib, modelkit; importlib.reload(modelkit)
from modelkit import B, mat, export_all

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for b in list(bpy.data.meshes): bpy.data.meshes.remove(b)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
R = random.Random(23)
M = {
    'kskin': mat('KessSkin', '#8a6c4e', 0.62), 'krobe': mat('KessRobe', '#92301f', 0.92), 'kmant': mat('KessMantle', '#2c4f5c', 0.85), 'ktrim': mat('KessTrim', '#d6a13a', 0.45, 0.6), 'keye': mat('KessEye', '#ffd080', 0.3, 0, '#ffb040', 3),
    'gskin': mat('GrolSkin', '#6a7f8e', 0.8), 'gshell': mat('GrolShell', '#31435a', 0.42, 0.2), 'gtusk': mat('GrolTusk', '#cfc7ae', 0.5), 'gbelt': mat('GrolBelt', '#3a2e24', 0.85), 'geye': mat('GrolEye', '#7fe8ff', 0.3, 0, '#7fe8ff', 3),
    'ubell': mat('UmmaBell', '#d9a8ff', 0.3, 0, '#a860ff', 0.9), 'uvein': mat('UmmaVein', '#fff0ff', 0.4, 0, '#ffb0ff', 1.8), 'uarm': mat('UmmaArm', '#8a58c0', 0.45, 0, '#40207a', 0.6), 'ucore': mat('UmmaCore', '#fff0c0', 0.3, 0, '#ffd890', 3),
    'clay': mat('Clay', '#c79868', 0.95), 'clay2': mat('ClayDark', '#6e4a30', 0.95), 'wood': mat('Wood', '#4a3424', 0.9), 'cloth': mat('Cloth', '#a33a28', 0.9), 'lamp': mat('Lamp', '#ffd890', 0.4, 0, '#ffb860', 3),
    'steel': mat('Steel', '#7a848c', 0.55, 0.7), 'dark': mat('Dark', '#23292e', 0.7, 0.4), 'hazard': mat('Hazard', '#d0a020', 0.6, 0.2), 'scr': mat('Screen', '#6fe8ff', 0.3, 0, '#6fe8ff', 2.5), 'red': mat('RedLamp', '#ff5030', 0.3, 0, '#ff3a20', 3),
    'ice': mat('IceBlock', '#8cc4dc', 0.2, 0.1, '#14384a', 0.5), 'stone': mat('Stone', '#46525c', 0.92), 'coral': mat('Coral', '#b65fa0', 0.6, 0, '#4a1a4a', 0.5), 'coral2': mat('CoralGlow', '#7fffe0', 0.4, 0, '#60ffd8', 2.5),
    'mark': mat('HandWall', '#2a3034', 0.95),
}

# ================= KESSITH (2.6 m). Faces -z. y = 0 is the hip.
body, robe, mant, trim = B(), B(), B(), B()
body.tube([(0, 0, 0), (0, 0.55, 0.02), (0, 1.0, 0.04), (0, 1.25, 0)], [0.17, 0.14, 0.17, 0.07], sides=12, rings=10, ribs=0.03, ribN=4)
robe.tube([(0, 1.06, 0.02), (0, 0.5, 0.02), (0, -0.4, 0.03), (0, -1.14, 0.06)], [0.23, 0.27, 0.37, 0.48], sides=40, rings=16, flat=0.74, cap=False, fold=0.12, folds=11)
mant.tube([(0, 1.17, 0.03), (0, 1.0, 0.03), (0, 0.72, 0.05)], [0.13, 0.32, 0.36], sides=28, rings=7, flat=0.8, cap=False, fold=0.09, folds=7)
mant.tube([(-0.25, 1.05, -0.12), (-0.05, 0.6, -0.19), (0.2, 0.05, -0.27), (0.27, -0.5, -0.3)], [0.05, 0.075, 0.09, 0.1], sides=7, rings=12, flat=0.28)    # a sash over one shoulder
for y, r, f in [(-1.04, 0.47, 0.76), (0.72, 0.36, 0.8), (0.24, 0.305, 0.74)]: trim.tube([(0, y - 0.03, 0.04), (0, y + 0.03, 0.04)], [r, r], sides=24, rings=3, flat=f, cap=False)
for i in range(5): trim.blob((-0.14 + i * 0.07, 0.25, -0.235), 0.024, seg=7, rows=4)                                                                      # beads on the belt
trim.blob((0.0, 1.1, -0.15), 0.05, sy=1.3, seg=8, rows=5)                                                                                                 # a clasp
body.make('Kess_Body', M['kskin']); robe.make('Kess_Robe', M['krobe'], grime=0.42); mant.make('Kess_Mantle', M['kmant'], grime=0.4); trim.make('Kess_Trim', M['ktrim'], grime=0.15)
head, eyes = B(), B()
head.tube([(0, 0, 0), (0, 0.16, -0.02), (0, 0.34, -0.1), (0, 0.42, -0.28)], [0.05, 0.1, 0.09, 0.03], sides=14, rings=14, ribs=0.015, ribN=7)
head.tube([(0, 0.28, 0.04), (0, 0.5, 0.18), (0, 0.72, 0.3)], [0.05, 0.03, 0.006], sides=7, rings=7)
for s in (-1, 1):
    head.tube([(s * 0.05, 0.3, 0.03), (s * 0.13, 0.47, 0.13), (s * 0.15, 0.62, 0.25)], [0.028, 0.018, 0.004], sides=6, rings=6)                          # side crests
    head.tube([(s * 0.03, 0.27, -0.2), (s * 0.075, 0.17, -0.27), (s * 0.045, 0.09, -0.32)], [0.018, 0.014, 0.004], sides=6, rings=6)                     # mandibles
    eyes.blob((s * 0.072, 0.31, -0.13), 0.026, seg=8, rows=5); eyes.blob((s * 0.052, 0.255, -0.17), 0.018, seg=7, rows=4)
head.make('Kess_Head', M['kskin']); eyes.make('Kess_Eyes', M['keye'], grime=0)
arm, sleeve = B(), B()
arm.tube([(0, 0, 0), (0.05, -0.42, 0.03), (0.04, -0.88, -0.1), (0.03, -1.2, -0.22)], [0.05, 0.04, 0.032, 0.012], sides=8, rings=12)
for i in range(4): arm.tube([(0.03, -1.17, -0.2), (0.03 + (i - 1.5) * 0.04, -1.3, -0.25), (0.03 + (i - 1.5) * 0.07, -1.44, -0.31)], [0.016, 0.012, 0.004], sides=5, rings=5)
sleeve.tube([(0, 0.05, 0), (0.05, -0.3, 0.03), (0.05, -0.68, -0.04)], [0.085, 0.1, 0.13], sides=18, rings=8, cap=False, fold=0.1, folds=7)
arm.make('Kess_Arm', M['kskin']); sleeve.make('Kess_Sleeve', M['krobe'], grime=0.42)

# ================= GROLM (1.5 m tall, 1.7 m wide). Body origin at the belly.
gb, gs, ge, gt, gl2 = B(), B(), B(), B(), B()
gb.blob((0, 0, 0), 0.62, sx=1.05, sy=0.82, sz=1.05, seg=18, rows=10, rough=0.09)
gb.blob((0, 0.2, -0.56), 0.3, sx=1, sy=0.72, sz=0.9, seg=16, rows=8, rough=0.05)
gb.blob((0, 0.36, -0.68), 0.2, sx=1.25, sy=0.42, sz=0.8, seg=12, rows=6)                                                         # heavy brow
gs.blob((0, 0.2, 0.08), 0.8, sx=1.02, sy=0.72, sz=1.12, seg=44, rows=20, top=0.62, plates=0.1, pn=7)
for i in range(11):
    a = i * 0.571; rad = 0.46 + 0.12 * (i % 2); gs.tube([(math.cos(a) * rad, 0.56 - 0.12 * (i % 2), math.sin(a) * rad * 1.1 + 0.08), (math.cos(a) * rad * 1.1, 0.8, math.sin(a) * rad * 1.2 + 0.08), (math.cos(a) * rad * 1.15, 1.0 - 0.14 * (i % 2), math.sin(a) * rad * 1.28 + 0.08)], [0.09, 0.06, 0.012], sides=8, rings=6)
for s in (-1, 1):
    ge.blob((s * 0.14, 0.31, -0.8), 0.04, seg=8, rows=5)
    gt.tube([(s * 0.16, 0.06, -0.72), (s * 0.24, 0.0, -0.86), (s * 0.22, 0.18, -0.96)], [0.05, 0.035, 0.008], sides=7, rings=7)
gl2.tube([(0, -0.3, 0.02), (0, -0.28, 0.02)], [0.66, 0.66], sides=24, rings=2, flat=1.02, cap=False)
for x, z in [(0.5, -0.42), (-0.55, -0.32), (0.62, 0.28)]: gl2.box((x, -0.36, z), (0.2, 0.26, 0.14), yaw=math.atan2(x, z))       # pouches
gb.make('Grol_Body', M['gskin']); gs.make('Grol_Shell', M['gshell'], grime=0.42); ge.make('Grol_Eyes', M['geye'], grime=0); gt.make('Grol_Tusks', M['gtusk']); gl2.make('Grol_Belt', M['gbelt'], grime=0.3)
ga = B()
ga.tube([(0, 0, 0), (0.1, -0.3, -0.05), (0.1, -0.56, -0.14)], [0.15, 0.13, 0.1], sides=12, rings=8, rough=0.08)
ga.blob((0.1, -0.68, -0.18), 0.17, sx=1.1, sy=0.7, sz=1.2, seg=12, rows=7)
for i in range(4): ga.tube([(0.1 + (i - 1.5) * 0.085, -0.7, -0.26), (0.1 + (i - 1.5) * 0.1, -0.8, -0.34), (0.1 + (i - 1.5) * 0.1, -0.92, -0.33)], [0.05, 0.04, 0.014], sides=7, rings=5)
ga.make('Grol_Arm', M['gskin'])
gl = B(); gl.tube([(0, 0, 0), (0, -0.25, 0), (0, -0.5, 0)], [0.17, 0.15, 0.19], sides=12, rings=7, rough=0.07)
for a in (0.4, 2.0, 3.6, 5.2): gl.blob((math.cos(a) * 0.17, -0.5, math.sin(a) * 0.17), 0.05, sy=0.7, seg=6, rows=4)
gl.make('Grol_Leg', M['gskin'])

# ================= UMMARI (2 m). Bell origin at its centre; arms on the rim.
ub, uv_, uc = B(), B(), B()
base = 0; seg, rows = 40, 16
for i in range(rows + 1):
    th = (math.pi * 0.62) * i / rows
    for j in range(seg):
        a = 2 * math.pi * j / seg; t = i / rows; fr = 1 + 0.09 * math.sin(a * 10) * t * t + 0.03 * math.sin(a * 23) * t ** 4
        ub.v.append(Vector((math.sin(th) * math.cos(a) * 0.72 * fr, math.cos(th) * 0.62 + 0.1 - 0.04 * math.sin(a * 10) * t ** 3, math.sin(th) * math.sin(a) * 0.72 * fr)))
for i in range(rows):
    for j in range(seg): ub.f.append((i * seg + j, (i + 1) * seg + j, (i + 1) * seg + (j + 1) % seg, i * seg + (j + 1) % seg))
for i in range(10):                                                                                                               # glowing veins down the bell
    a0 = i * 0.628; pts = [(math.sin(th) * math.cos(a0 + th * 0.2) * 0.735, math.cos(th) * 0.632 + 0.1, math.sin(th) * math.sin(a0 + th * 0.2) * 0.735) for th in (0.12, 0.6, 1.1, 1.75)]
    uv_.tube(pts, [0.008, 0.014, 0.014, 0.006], sides=4, rings=10, cap=False)
uc.blob((0, 0.05, 0), 0.24, sy=1.2, seg=12, rows=8); uc.blob((0, -0.22, 0), 0.13, sy=0.8, seg=8, rows=5)
ub.make('Umma_Bell', M['ubell'], grime=0.08); uv_.make('Umma_Veins', M['uvein'], grime=0); uc.make('Umma_Core', M['ucore'], grime=0)
ut = B()
for i in range(14):
    a = i * 0.449 + 0.2; x, z = math.cos(a) * 0.55, math.sin(a) * 0.55; ln = 0.9 + (i % 4) * 0.33
    ut.tube([(x, -0.1, z), (x * 1.1, -0.1 - ln * 0.4, z * 1.1), (x * 0.8, -0.1 - ln * 0.8, z * 0.8), (x, -0.1 - ln * 1.1, z)], [0.035, 0.026, 0.015, 0.004], sides=5, rings=9, cap=False)
for i in range(5):                                                                                                                # ruffled mouth arms in the middle
    a = i * 1.257; x, z = math.cos(a) * 0.17, math.sin(a) * 0.17
    ut.tube([(x, -0.2, z), (x * 1.3, -0.65, z * 1.3), (x * 0.8, -1.1, z * 0.8), (x * 1.1, -1.5, z * 1.1)], [0.05, 0.08, 0.06, 0.01], sides=14, rings=14, cap=False, fold=0.35, folds=5, flat=0.5)
ut.make('Umma_Threads', M['uarm'], grime=0.1)
ua = B()
ua.tube([(0, 0, 0), (0.1, -0.3, -0.12), (0.12, -0.62, -0.32), (0.08, -0.85, -0.52)], [0.06, 0.05, 0.035, 0.012], sides=8, rings=12, ribs=0.05, ribN=7)
ua.make('Umma_Arm', M['uarm'], grime=0.1)

# ================= KESSITH MARKET
h, hd, hl, hb = B(), B(), B(), B()
h.blob((0, 0, 0), 3.0, sy=1.05, seg=36, rows=16, top=0.52, rough=0.022)
h.tube([(0, 2.7, 0), (0, 4.0, 0), (0.2, 5.0, 0.1)], [0.55, 0.22, 0.05], sides=14, rings=10, rough=0.03)
hb.tube([(0, 0.12, 0), (0, 0.32, 0)], [3.13, 3.1], sides=36, rings=3, cap=False)                                                  # a clay plinth
hb.tube([(0, 1.65, 0), (0, 1.8, 0)], [2.6, 2.5], sides=36, rings=3, cap=False)                                                    # a painted band
hd.box((0, 0.98, -2.72), (1.25, 1.96, 0.9)); hd.tube([(-0.72, 0, -3.02), (-0.72, 1.6, -3.02), (0, 2.42, -3.02), (0.72, 1.6, -3.02), (0.72, 0, -3.02)], [0.18, 0.16, 0.16, 0.16, 0.18], sides=7, rings=20)
for a in (0.8, 2.4, 3.9, 5.5): hd.box((math.cos(a) * 2.68, 1.25, math.sin(a) * 2.68), (0.5, 0.6, 0.5), yaw=-a)
hl.blob((0, 2.3, -3.15), 0.15, seg=9, rows=6)
for a in (0.8, 2.4, 3.9, 5.5): hl.box((math.cos(a) * 2.84, 1.25, math.sin(a) * 2.84), (0.3, 0.42, 0.26), yaw=-a)
h.make('Kess_Hut', M['clay'], uv=0.25, grime=0.42); hb.make('Kess_HutBand', M['clay2'], uv=0.25); hd.make('Kess_HutDoor', M['clay2'], uv=0.5); hl.make('Kess_HutLamp', M['lamp'], grime=0)
st, cl, gd = B(), B(), B()
for x, z in [(-1.8, -1.2), (1.8, -1.2), (-1.8, 1.2), (1.8, 1.2)]: st.cyl((x, 0, z), 0.09, 0.07, 2.6, 8)
st.box((0, 0.5, 0), (3.2, 0.95, 1.5)); st.box((0, 1.0, 0), (3.4, 0.07, 1.65)); st.box((0, 2.62, 1.2), (3.8, 0.09, 0.09)); st.box((0, 2.62, -1.2), (3.8, 0.09, 0.09))
for i in range(14):                                                                                                               # goods on the counter
    px, pz = -1.35 + (i % 7) * 0.45, -0.32 + (i // 7) * 0.62
    if i % 3 == 0: gd.blob((px, 1.14, pz), 0.11, sy=1.15, seg=9, rows=6)
    elif i % 3 == 1: gd.cyl((px, 1.03, pz), 0.08, 0.13, 0.24, 9)
    else: gd.box((px, 1.1, pz), (0.2, 0.15, 0.2), yaw=i)
for ix in range(10):
    x0 = -2.2 + ix * 0.44; sag = lambda k: 0.14 + (k % 2) * 0.14
    cl.v += [Vector((x0, 2.72, -1.55)), Vector((x0 + 0.44, 2.72, -1.55)), Vector((x0 + 0.44, 2.72 - sag(ix + 1), 0)), Vector((x0, 2.72 - sag(ix), 0)), Vector((x0, 2.72, 1.55)), Vector((x0 + 0.44, 2.72, 1.55))]
    b0 = len(cl.v) - 6; cl.f += [(b0, b0 + 1, b0 + 2, b0 + 3), (b0 + 3, b0 + 2, b0 + 5, b0 + 4)]
st.make('Kess_Stall', M['wood'], smooth=False, grime=0.35); cl.make('Kess_Awning', M['cloth'], grime=0.3); gd.make('Kess_Goods', M['ktrim'], grime=0.3)
sp, sl = B(), B()
sp.tube([(0, 0, 0), (0.1, 3, 0), (-0.1, 7, 0.05), (0, 12, 0)], [1.3, 0.7, 0.42, 0.06], sides=20, rings=24, ribs=0.035, ribN=7, rough=0.04)
for y, r in [(2.6, 0.92), (5.6, 0.66), (8.6, 0.42)]: sp.tube([(0, y, 0), (0, y + 0.22, 0)], [r, r], sides=20, rings=2)
sl.blob((0, 9.8, 0), 0.34, seg=12, rows=8); sp.make('Kess_Spire', M['clay'], uv=0.3, grime=0.45); sl.make('Kess_SpireLamp', M['lamp'], grime=0)

# ================= HUMAN MINING POST
c, cs, cr = B(), B(), B()
c.box((0, 1.3, 0), (6.2, 2.6, 2.7))
for i in range(19): c.box((-2.88 + i * 0.32, 1.3, -1.38), (0.13, 2.34, 0.07)); c.box((-2.88 + i * 0.32, 1.3, 1.38), (0.13, 2.34, 0.07))      # corrugation
for y in (0.08, 2.52):
    for z in (-1.3, 1.3): c.box((0, y, z), (6.3, 0.17, 0.17))
for x in (-3.05, 3.05):
    for z in (-1.3, 1.3): c.box((x, 1.3, z), (0.2, 2.6, 0.2))
cr.box((-3.14, 1.3, 0), (0.06, 2.2, 2.3))
for z in (-0.55, 0.55): cr.box((-3.2, 1.3, z), (0.05, 2.1, 0.07))
cs.box((3.17, 1.7, 0.4), (0.06, 0.34, 0.5))
c.make('Hum_Container', M['steel'], smooth=False, grime=0.45); cs.make('Hum_ContainerLamp', M['scr'], grime=0); cr.make('Hum_ContainerDoor', M['hazard'], smooth=False, grime=0.5)
d, ds = B(), B()
d.cyl((0, 0, 0), 0.8, 0.5, 0.4, 12); d.cyl((0, 0.4, 0), 0.22, 0.14, 4.2, 10)
for a in (0.5, 2.6, 4.7): d.tube([(0, 2.4, 0), (math.cos(a) * 1.1, 0.03, math.sin(a) * 1.1)], [0.05, 0.06], sides=6, rings=3)
seg, rows = 28, 8
for i in range(rows + 1):
    rr = 2.6 * i / rows
    for j in range(seg):
        a = 2 * math.pi * j / seg; ds.v.append(Vector((math.cos(a) * rr, 5.0 + 0.12 * rr * rr + math.cos(a) * rr * 0.55, math.sin(a) * rr)))
for i in range(rows):
    for j in range(seg): ds.f.append((i * seg + j, (i + 1) * seg + j, (i + 1) * seg + (j + 1) % seg, i * seg + (j + 1) % seg))
for a in (0, 2.09, 4.19): ds.tube([(math.cos(a) * 2.1, 5.55 + math.cos(a) * 1.15, math.sin(a) * 2.1), (0.8, 6.8, 0)], [0.025, 0.02], sides=5, rings=3)
ds.blob((0.8, 6.85, 0), 0.14, seg=8, rows=5)
d.make('Hum_DishBase', M['dark']); ds.make('Hum_Dish', M['steel'], grime=0.3)
t, ts = B(), B()
t.tube([(0, 0.1, 0), (0, 1.6, 0), (0, 3.2, 0)], [1.5, 1.5, 1.35], sides=24, rings=8, ribs=0.008, ribN=4)
t.blob((0, 3.2, 0), 1.36, sy=0.42, seg=24, rows=7, top=0.5)
for a in range(6): t.tube([(math.cos(a * 1.047) * 1.54, 0, math.sin(a * 1.047) * 1.54), (math.cos(a * 1.047) * 1.54, 3.1, math.sin(a * 1.047) * 1.54)], [0.04, 0.04], sides=5, rings=2)
t.tube([(1.5, 0.5, 0), (2.4, 0.5, 0), (2.8, 0.2, 0.6), (3.6, 0.15, 1.5)], [0.11, 0.11, 0.11, 0.11], sides=8, rings=12)            # a pipe out to the ground
ts.tube([(0, 1.5, 0), (0, 1.8, 0)], [1.52, 1.52], sides=24, rings=2, cap=False)
t.make('Hum_Tank', M['steel'], grime=0.5); ts.make('Hum_TankStripe', M['hazard'], grime=0.4)
m, ml = B(), B()
for sx in (-1, 1):
    for sz in (-1, 1): m.box((sx * 0.28, 5.5, sz * 0.28), (0.09, 11, 0.09))
for y in range(1, 11):
    m.box((0, y, 0.28), (0.64, 0.05, 0.05)); m.box((0, y, -0.28), (0.64, 0.05, 0.05)); m.box((0.28, y, 0), (0.05, 0.05, 0.64)); m.box((-0.28, y, 0), (0.05, 0.05, 0.64))
for k in range(1, 8): m.box((k * 0.95, 10.65, 0), (0.05, 0.42, 0.42))
m.box((3.3, 10.45, 0), (7.4, 0.08, 0.42)); m.box((3.3, 10.85, 0), (7.4, 0.08, 0.42)); m.box((6.5, 8.2, 0), (0.05, 4.4, 0.05)); m.box((6.5, 5.9, 0), (0.42, 0.42, 0.42)); ml.blob((0, 11.3, 0), 0.2, seg=8, rows=5)
m.make('Hum_Crane', M['hazard'], smooth=False, grime=0.55); ml.make('Hum_CraneLamp', M['red'], grime=0)
tm, tm2 = B(), B()
tm.box((0, 0.65, 0), (1.1, 1.3, 0.55)); tm.box((0, 1.4, 0.08), (1.0, 0.5, 0.2)); tm.box((0, 0.96, -0.36), (1.0, 0.05, 0.3))
for i in range(4): tm.box((-0.35 + i * 0.24, 0.5, -0.29), (0.14, 0.42, 0.02))
tm2.box((0, 1.42, -0.04), (0.84, 0.42, 0.03))
tm.make('Hum_Terminal', M['dark'], smooth=False); tm2.make('Hum_TerminalScreen', M['scr'], grime=0)

# ================= GROLM DIG
ib = B()
for x, y, z, s, yw in [(0, 0.8, 0, (2.2, 1.6, 1.6), 0), (0.3, 2.1, 0.1, (1.5, 1.0, 1.2), 0.25), (-1.35, 0.42, 0.5, (0.9, 0.84, 0.8), 0.5)]: ib.box((x, y, z), s, yaw=yw)
ib.make('Grol_Ice', M['ice'], smooth=False, grime=0.25, bevel=0.05)
ar, arl = B(), B()
ar.tube([(-2.6, 0, 0), (-2.5, 2.6, 0), (-1.2, 4.3, 0), (1.2, 4.3, 0), (2.5, 2.6, 0), (2.6, 0, 0)], [0.8, 0.6, 0.5, 0.5, 0.6, 0.8], sides=14, rings=40, rough=0.13, ribs=0.05, ribN=6)
arl.blob((0, 3.6, 0), 0.26, seg=10, rows=7); ar.make('Grol_Arch', M['stone'], uv=0.35, grime=0.42); arl.make('Grol_ArchLamp', M['geye'], grime=0)
dr = B()
for a in (0.5, 2.6, 4.7): dr.tube([(0, 5.4, 0), (math.cos(a) * 1.0, 2.5, math.sin(a) * 1.0), (math.cos(a) * 1.9, 0, math.sin(a) * 1.9)], [0.13, 0.11, 0.15], sides=8, rings=7)
dr.cyl((0, 0, 0), 0.26, 0.2, 5.4, 10)
for k in range(1, 6): dr.tube([(0, k * 0.8, 0), (0, k * 0.8 + 0.14, 0)], [0.35, 0.3], sides=10, rings=2)
dr.blob((0, 5.5, 0), 0.5, sy=0.65, seg=10, rows=6)
dr.make('Grol_Rig', M['dark'], grime=0.45)

# ================= UMMARI REEF
cg, cp = B(), B()
cp.tube([(0, -0.5, 0), (0.3, 2, 0.2), (-0.3, 4.4, 0), (0.1, 6.4, -0.1)], [1.1, 0.7, 0.55, 0.18], sides=20, rings=22, rough=0.12, knob=0.1, knobs=7)
for y, r, ox in [(2.2, 1.6, 0.5), (3.8, 1.25, -0.5), (5.2, 0.9, 0.3), (1.2, 1.05, -0.6)]:
    cp.blob((ox, y, 0), r, sy=0.26, seg=22, rows=6, top=0.55, rib=0.06, ribN=9); cg.blob((ox, y - 0.02, 0), r * 0.9, sy=0.06, seg=18, rows=3)
cp.make('Umma_Coral', M['coral'], uv=0.4, grime=0.38); cg.make('Umma_CoralGlow', M['coral2'], grime=0)

# ================= SHARED
pd, pl = B(), B()
pd.cyl((0, -0.1, 0), 7.4, 7.0, 0.22, 36); pd.tube([(0, 0.1, 0), (0, 0.13, 0)], [5.6, 5.6], sides=36, rings=2, cap=False); pd.tube([(0, 0.1, 0), (0, 0.13, 0)], [2.4, 2.4], sides=28, rings=2, cap=False)
for i in range(8):
    a = i * 0.785; pl.blob((math.cos(a) * 6.2, 0.14, math.sin(a) * 6.2), 0.12, sy=0.6, seg=7, rows=4); pd.box((math.cos(a) * 4, 0.12, math.sin(a) * 4), (3.0, 0.04, 0.16), yaw=-a)
pd.make('Pad', M['dark'], uv=0.25, grime=0.5); pl.make('PadLamp', M['lamp'], grime=0)
cb = B(); cb.box((0, 0.5, 0), (1.05, 1.0, 1.05))
for y in (0.1, 0.9):
    cb.box((0, y, 0.53), (1.09, 0.1, 0.03)); cb.box((0, y, -0.53), (1.09, 0.1, 0.03)); cb.box((0.53, y, 0), (0.03, 0.1, 1.09)); cb.box((-0.53, y, 0), (0.03, 0.1, 1.09))
for sx in (-1, 1):
    for sz in (-1, 1): cb.box((sx * 0.5, 0.5, sz * 0.5), (0.09, 1.02, 0.09))
cb.make('Crate', M['steel'], smooth=False, grime=0.5)
wl = B()
for i in range(13):
    x = -9 + i * 1.5; ht = 1.8 + (R.random() * 1.7 + (1 if i % 4 == 0 else 0))
    wl.tube([(x, -0.2, R.random() * 0.2), (x + R.random() * 0.2 - 0.1, ht * 0.6, 0), (x + R.random() * 0.2 - 0.1, ht, R.random() * 0.1)], [0.82, 0.68, 0.32], sides=12, rings=12, rough=0.16, ribs=0.03)
wl.make('HandWall', M['mark'], uv=0.4, grime=0.5)

print('WORLDS', len(bpy.data.objects), 'objects,', sum(len(o.data.polygons) for o in bpy.data.objects), 'faces')
if len(ARGS) >= 1: export_all(ARGS[0])
if len(ARGS) >= 2: bpy.ops.wm.save_as_mainfile(filepath=ARGS[1])
