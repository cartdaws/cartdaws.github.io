# INTRUDER V2: the service crawler. A low tracked maintenance machine about the size of a large dog: a painted chassis on two rubber tracks, a front brush roller,
# a sensor mast with an amber lens, a folded manipulator on its back and a parts bin behind. It trundles about the ship, harmless, and edges away from you.
# Parts are split at their joints so the game can swivel the mast and arm, and tear it apart piece by piece when it is absorbed.
# Builder space: y up, the machine faces -z. Exports to public/models/v2_creatures.glb. Run inside Blender with exec(open(path).read()).
import bpy, math, sys, importlib
from mathutils import Vector, Euler
sys.path.insert(0, r"C:\Users\cartd\Desktop\Intruder-V2\art")
import v2kit; importlib.reload(v2kit)
from v2kit import B, mat, clear_scene, export_all, save_v2

clear_scene()
save_v2(r"art\v2_creatures.blend")
PI = math.pi
M = {
  'paint': mat('CrawlPaint', '#b4b9b6', 0.46, 0.15), 'dark': mat('CrawlDark', '#23282c', 0.55, 0.5), 'rubber': mat('CrawlRubber', '#101214', 0.9, 0.0),
  'orange': mat('CrawlOrange', '#cf7424', 0.5, 0.1), 'steel': mat('CrawlSteel', '#7c868e', 0.4, 0.85),
  'lens': mat('CrawlLens', '#ffb868', 0.2, 0.0, '#ffa040', 2.6),
}

def sb(b, c, s, e=0.22, taper=(1, 1), rot=(0, 0, 0), seg=14, rows=9):
    """A machined block with soft edges: half-sizes s about centre c; taper narrows the +y end (x, z)."""
    base = len(b.v); eu = Euler(rot, 'XYZ'); C = Vector(c)
    sp = lambda x: (1 if x >= 0 else -1) * pow(abs(x), e)
    for i in range(rows + 1):
        v = -PI / 2 + PI * i / rows; cv, sv = sp(math.cos(v)), sp(math.sin(v)); k = (sv + 1) / 2
        tx, tz = 1 + (taper[0] - 1) * k, 1 + (taper[1] - 1) * k
        for j in range(seg):
            u = 2 * PI * j / seg
            p = Vector((s[0] * cv * sp(math.cos(u)) * tx, s[1] * sv, s[2] * cv * sp(math.sin(u)) * tz)); p.rotate(eu); b.add(p + C)
    for i in range(rows):
        for j in range(seg):
            b.f.append((base + i * seg + j, base + i * seg + (j + 1) % seg, base + (i + 1) * seg + (j + 1) % seg, base + (i + 1) * seg + j))

def cyl_x(b, x0, x1, y, z, r, sides=14):
    b.tube([(x0, y, z), (x1, y, z)], [r, r], sides=sides, rings=4)

# ---- the chassis: a rounded body, a little narrower at the nose, with a raised painted deck
ch = B(); sb(ch, (0, 0.36, 0.02), (0.4, 0.17, 0.66), e=0.3, taper=(1.0, 1.0)); sb(ch, (0, 0.18, -0.02), (0.34, 0.08, 0.6), e=0.3)
ch.make('CrawlChassis', M['paint'], grime=0.3, uv=3.0)
pl = B(); sb(pl, (0, 0.545, -0.16), (0.33, 0.03, 0.36), e=0.2); sb(pl, (0, 0.38, -0.69), (0.3, 0.1, 0.03), e=0.2)      # the deck plate and the nose guard
pl.make('CrawlPlate', M['orange'], grime=0.25, uv=4.0)
# ---- two tracks with wheels, and the dark mudguards over them
for sg, nm in ((-1, 'L'), (1, 'R')):
    tr = B(); sb(tr, (sg * 0.52, 0.2, 0.0), (0.1, 0.2, 0.74), e=0.38); tr.make('CrawlTread' + nm, M['rubber'], grime=0.35, uv=3.0)
    wh = B(); sb(wh, (sg * 0.46, 0.42, 0.0), (0.16, 0.025, 0.7), e=0.2)
    for z in (-0.5, -0.17, 0.17, 0.5):
        wh.tube([(sg * 0.62, 0.2, z), (sg * 0.66, 0.2, z)], [0.15, 0.15], sides=16, rings=3)
        wh.tube([(sg * 0.665, 0.2, z), (sg * 0.68, 0.2, z)], [0.06, 0.05], sides=10, rings=3)
    wh.make('CrawlWheels' + nm, M['dark'], grime=0.2, uv=3.0)
# ---- the brush roller across the nose
br = B(); cyl_x(br, -0.34, 0.34, 0.11, -0.8, 0.1, 14)
for sg in (-1, 1): br.tube([(sg * 0.31, 0.11, -0.8), (sg * 0.31, 0.3, -0.72)], [0.025, 0.025], sides=8, rings=4)
br.make('CrawlBrush', M['dark'], grime=0.25, uv=3.0)
# ---- the parts bin on the back, with a lid
bn = B(); sb(bn, (0, 0.62, 0.42), (0.3, 0.1, 0.22), e=0.25); sb(bn, (0, 0.74, 0.42), (0.32, 0.02, 0.24), e=0.2)
bn.make('CrawlBin', M['orange'], grime=0.3, uv=4.0)
# ---- the front lamp bar, lit
lp = B(); sb(lp, (0, 0.38, -0.715), (0.22, 0.022, 0.012), e=0.2); lp.make('CrawlLamp', M['lens'], uv=1.0)
# ---- the sensor mast: pivots at its base (the origin), so the head can look about. Built around the origin; the game puts the origin on the deck.
mt = B(); mt.tube([(0, 0, 0), (0.0, 0.16, 0.0), (0.0, 0.3, 0.0)], [0.04, 0.032, 0.03], sides=12, rings=10)
sb(mt, (0, 0.38, -0.03), (0.12, 0.075, 0.1), e=0.28); mt.tube([(0, 0.46, -0.02), (0, 0.52, -0.02)], [0.012, 0.012], sides=6, rings=3)
mt.make('CrawlMast', M['steel'], grime=0.25, uv=3.0)
ln = B(); ln.blob((0, 0.38, -0.12), 0.05, sx=1, sy=1, sz=0.8, seg=14, rows=9); ln.make('CrawlLens', M['lens'], uv=1.0)
# ---- the folded manipulator: its origin is the shoulder, so it can fidget
ar = B(); ar.blob((0, 0, 0), 0.06, seg=12, rows=8)
ar.tube([(0, 0, 0), (0, 0.22, 0.1), (0, 0.4, 0.02)], [0.036, 0.03, 0.028], sides=10, rings=10); ar.blob((0, 0.4, 0.02), 0.04, seg=10, rows=7)
ar.tube([(0, 0.4, 0.02), (0, 0.42, -0.2), (0, 0.3, -0.34)], [0.028, 0.024, 0.02], sides=10, rings=10)
for sg in (-1, 1): ar.tube([(sg * 0.02, 0.3, -0.34), (sg * 0.05, 0.25, -0.42), (sg * 0.02, 0.2, -0.46)], [0.014, 0.011, 0.005], sides=6, rings=6)      # the claw
ar.make('CrawlArm', M['steel'], grime=0.25, uv=3.0)

save_v2(r"art\v2_creatures.blend")
export_all(r"public\models\v2_creatures.glb")
print('RESULT', sum(len(o.data.polygons) for o in bpy.data.objects), 'faces', bpy.data.filepath)
