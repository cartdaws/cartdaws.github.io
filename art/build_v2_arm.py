# INTRUDER V2: the protagonist's arm, and what it can become. An ordinary, soft octopus-like arm first; then chitin, then machinery growing out of it.
# Modelled along the straight arm in the game's frame (art/v2kit.py); the game bends all of it together. Exports to public/models/v2_arm.glb.
# Run inside Blender with exec(open(path).read()).
import bpy, math, random, sys, importlib
from mathutils import Vector, noise
sys.path.insert(0, r"C:\Users\cartd\Desktop\Intruder-V2\art")
import v2kit; importlib.reload(v2kit)
from v2kit import B, mat, surf, arm_r, catmull, clear_scene, export_all, save_v2, Z0, L0

clear_scene()
save_v2(r"art\v2_arm.blend")          # the session now points at V2's own file before anything else happens
R = random.Random(7)
PI = math.pi; BACK = -PI / 2; UNDER = PI / 2

M = {
  'skin': mat('ArmSkin', '#6b4a57', 0.45),
  'sucker': mat('ArmSucker', '#b58f8c', 0.34),
  'chitin': mat('Chitin', '#6b6157', 0.42, 0.0),
  'flesh': mat('MutFlesh', '#4a1e22', 0.32, 0.0),
  'black': mat('BlackMetal', '#0e1012', 0.36, 0.9),
  'mantle': mat('Mantle', '#1e1518', 0.36),
  'bone': mat('ChitinPale', '#b8a58a', 0.5, 0.0),
  'steel': mat('Steel', '#6f7a84', 0.42, 0.85),
  'dark': mat('SteelDark', '#23292f', 0.55, 0.7),
  'copper': mat('Copper', '#b4683a', 0.38, 0.95),
  'ceramic': mat('Ceramic', '#6f6a62', 0.34, 0.0),
  'shardglow': mat('ShardGlow', '#8ff5d8', 0.2, 0.0, '#7ff5d0', 3.5),
  'arcglow': mat('ArcGlow', '#a8d8ff', 0.2, 0.0, '#8fc8ff', 4.0),
}

# ================================================================ THE SKIN
def skin_point(u, v):
    a = u * 2 * PI
    s = 1 - pow(1 - v, 1.3)               # rings packed toward the tip, where it bends hardest
    r = arm_r(s)
    if s > 0.972: r *= math.sqrt(max(0.0, 1 - ((s - 0.972) / 0.028) ** 2))
    flat = 0.86 + 0.14 * (0.5 - 0.5 * math.sin(a))
    d = Vector((math.cos(a) * 1.4, math.sin(a) * 1.4, s * 11.0))
    muscle = noise.noise(d) * 0.05 + noise.noise(d * 3.1 + Vector((3, 7, 1))) * 0.016          # long muscle under loose skin
    dorsal = max(0.0, -math.sin(a))
    fold = math.sin(s * 150.0 + noise.noise(d * 0.7) * 3.0) * 0.006 * dorsal * min(1.0, s * 5)  # fine rings across the back
    k = r * (1 + muscle + fold)
    return Vector((math.cos(a) * k, math.sin(a) * k * flat, Z0 - s * L0))
b = B(); b.grid(skin_point, 28, 118, closed_u=True); ap = b.add((0, 0, Z0 - L0))
row = 28; last = 118 * row
for i in range(row): b.f.append((last + i, last + (i + 1) % row, ap))
b.make('ArmSkin', M['skin'], uv=3.0)

# ================================================================ THE SUCKERS: two staggered rows, fleshy rims, dark hollows, shrinking to almost nothing at the tip
PROFILE = [(0.0, -0.42, 0.16), (0.3, -0.34, 0.2), (0.5, -0.1, 0.42), (0.68, 0.12, 0.8), (0.86, 0.2, 0.96), (1.04, 0.15, 0.86), (1.28, -0.04, 0.66)]
b = B(); s = 0.13; n = 0
while s < 0.955:
    r = arm_r(s); side = 0.56 if n % 2 else -0.56; q = r * (0.37 - 0.08 * s)
    a0 = UNDER + side; c = surf(s, a0, -r * 0.03)
    out = Vector((math.cos(a0), math.sin(a0), 0)); tan = Vector((-math.sin(a0), math.cos(a0), 0)); seg = 16; base = len(b.v)
    jx = 1 + R.uniform(-0.05, 0.05)
    for rho, h, shade in PROFILE:
        for j in range(seg):
            t = 2 * PI * j / seg
            b.add(c + tan * (math.cos(t) * rho * q * jx) + Vector((0, 0, 1)) * (math.sin(t) * rho * q) + out * h * q, shade)
    for k in range(len(PROFILE) - 1):
        for j in range(seg):
            b.f.append((base + k * seg + j, base + k * seg + (j + 1) % seg, base + (k + 1) * seg + (j + 1) % seg, base + (k + 1) * seg + j))
    b.f.append(tuple(base + j for j in range(seg))[::-1])
    s += (r * 0.58) / L0; n += 1
print('suckers', n)
b.make('ArmSuckers', M['sucker'], uv=8.0)

# ================================================================ CARAPACE: organic. Overlapping rounded scutes growing down the back of the arm, heavier toward the elbow
def scute(bld, s0, ds, a0, da, h, ridge=0.25, nu=10, nv=9):
    def fn(u, v):
        U, V = u * 2 - 1, v * 2 - 1
        fall = pow(max(0.0, 1 - U * U), 0.55) * pow(max(0.0, 1 - V * V), 0.5)
        tilt = 1.0 + 0.55 * V                                            # the far edge stands proud, so they overlap like a shell
        lift = -0.006 + h * fall * tilt * (1 + ridge * math.exp(-U * U * 9)) + noise.noise(Vector((U * 2 + s0 * 40, V * 2, a0))) * h * 0.09
        return surf(s0 + V * ds, a0 + U * da, lift)
    def col(u, v):
        U, V = u * 2 - 1, v * 2 - 1
        return min(1.0, 0.1 + 0.8 * math.exp(-U * U * 22) * (0.55 + 0.45 * V) + 0.7 * pow(max(0.0, V), 6) + 0.25 * pow(abs(U), 8))    # paler along the ridge and the worn far edge
    bld.grid(fn, nu, nv, col=col)
ch = B(); s = 0.1; i = 0
while s < 0.93:
    k = 1 - s
    ds = 0.03 + 0.022 * k; h = 0.016 + 0.034 * k
    scute(ch, s, ds * 1.25, BACK, 1.02 - 0.2 * s, h)
    scute(ch, s + ds * 0.7, ds * 0.95, BACK - 1.05 + 0.18 * s, 0.56, h * 0.62, ridge=0.1, nu=7, nv=7)
    scute(ch, s + ds * 0.7, ds * 0.95, BACK + 1.05 - 0.18 * s, 0.56, h * 0.62, ridge=0.1, nu=7, nv=7)
    s += ds * 1.5; i += 1
print('scute rows', i)
ch.make('Mut_Carapace', M['chitin'], grime=0.28, uv=9.0)

# ================================================================ SHARD SIPHON: biomechanical. Armour plates bolted down the back, a heavy feed housing, thick hoses, crystals growing through the mouth collar
st = B(); dk = B(); gl = B()
def plate(bld, s0, ds, a0, da, h, nu=12, nv=8, edge=0.16):
    """A machined plate lying on the arm: flat top, hard bevelled edge dropping into the flesh."""
    def fn(u, v):
        U, V = u * 2 - 1, v * 2 - 1
        fall = pow(max(0.0, 1 - abs(U) ** 6), edge * 3) * pow(max(0.0, 1 - abs(V) ** 6), edge * 3)
        lift = -0.008 + h * fall + 0.25 * h * fall * (1 - abs(U))
        return surf(s0 + V * ds, a0 + U * da, lift)
    bld.grid(fn, nu, nv)
def screw(bld, s, a, lift, r):
    bld.blob(surf(s, a, lift), r, sy=1, sz=1, seg=8, rows=5)
s = 0.27; i = 0
while s < 0.87:
    k = (s - 0.27) / 0.6
    ds = 0.03 - 0.009 * k; da = 1.22 - 0.22 * k; h = 0.018 - 0.006 * k
    plate(st, s, ds, BACK, da, h)
    # side plates, staggered, leaving flesh showing in between
    for sg in (-1, 1): plate(dk, s + ds * 1.15, ds * 0.72, BACK + sg * (da + 0.52), 0.34, h * 0.7, nu=7, nv=6)
    for sg in (-1, 1):
        for sz in (-1, 1): screw(dk, s + sz * ds * 0.7, BACK + sg * da * 0.84, h + 0.001, 0.0048 - 0.0014 * k)
    s += ds * 2.62; i += 1
print('shard plates', i)
# the feed housing: a thick spine sitting proud of the plates, stepped and tapering, with lit channels let into it
hs = [surf(0.3 + 0.58 * j / 10, BACK, 0.034 - 0.012 * j / 10) for j in range(11)]
st.tube(hs, [0.026, 0.025, 0.021, 0.017, 0.013], sides=10, rings=34)
for j in range(7):
    s0 = 0.325 + j * 0.076
    gl.tube([surf(s0, BACK, 0.061 - 0.024 * j / 7), surf(s0 + 0.052, BACK, 0.06 - 0.024 * j / 7)], [0.0062, 0.0062], sides=6, rings=5)
    dk.tube([surf(s0 + 0.064, BACK, 0.05 - 0.02 * j / 7), surf(s0 + 0.071, BACK, 0.05 - 0.02 * j / 7)], [0.024 - 0.012 * j / 7] * 2, sides=10, rings=3)   # clamp rings round the housing
# thick hoses leaving the housing and plunging into the flesh, the way a bad surgeon would do it
for sg in (-1, 1):
    for s0, s1 in ((0.32, 0.47), (0.5, 0.64), (0.67, 0.8)):
        a0, a1 = BACK + sg * 0.06, BACK + sg * 1.42
        p = [surf(s0, a0, 0.032), surf((s0 * 2 + s1) / 3, BACK + sg * 0.85, 0.042), surf((s0 + s1 * 2) / 3, BACK + sg * 1.25, 0.024), surf(s1, a1, -0.01)]
        dk.tube(p, [0.0088, 0.0082, 0.0074, 0.0068], sides=7, rings=16)
        # it leaves the housing through a threaded port, not out of nowhere
        port0 = surf(s0, BACK + sg * 0.1, 0.034); port1 = surf(s0 + 0.004, BACK + sg * 0.3, 0.036)
        st.tube([port0, port1], [0.0125, 0.0115], sides=9, rings=4)
# the mouth collar: two heavy rings, and a cluster of crystal growing out from under them
for s0, th in ((0.895, 0.0135), (0.922, 0.0105)):
    n = 34; pts = [surf(s0, BACK + (-PI * 0.96) + (2 * PI * 0.96) * q / (n - 1), 0.005) for q in range(n)]
    st.tube(pts, [th, th], sides=8, rings=n)
for j in range(11):
    a = BACK + (j - 5) * 0.56; sc = 0.5 + 0.5 * R.random()
    p0 = surf(0.902, a, 0.004); p1 = surf(0.94 + 0.03 * sc, a * 0.97 + BACK * 0.03, 0.016 + 0.014 * sc); m = (p0 + p1) * 0.5 + Vector((math.cos(a), math.sin(a), 0)) * 0.004
    gl.tube([p0, m, p1], [0.0088 * sc + 0.002, 0.0072 * sc + 0.002, 0.0016], sides=5, rings=5)
st.make('Mut_Shard', M['steel'], grime=0.26, uv=9.0)
dk.make('Mut_ShardDark', M['dark'], grime=0.24, uv=9.0)
gl.make('Mut_ShardGlow', M['shardglow'], uv=1.0)

# ================================================================ ARC NERVES: biomechanical. Three dense packs of copper winding, ceramic stacks, bright exposed nerve bundles swelling between them
cu = B(); ce = B(); ag = B(); cb = B()
for s0, s1, turns, th in ((0.3, 0.42, 11, 0.0098), (0.53, 0.63, 10, 0.0082), (0.74, 0.82, 9, 0.0066)):
    N = turns * 26; pts = []
    for q in range(N):
        t = q / (N - 1); s = s0 + (s1 - s0) * t
        swell = math.sin(t * PI) ** 0.5 * th * 0.9                                    # wound fatter in the middle, tapering off at each end
        pts.append(surf(s, BACK + t * turns * 2 * PI, 0.004 + swell))
    cu.tube(pts, [th, th], sides=6, rings=N)
    for sx in (s0 - 0.012, s1 + 0.012):                                               # a dark clamp at each end of the pack
        n = 30; rg = [surf(sx, BACK + 2 * PI * q / (n - 1), 0.004) for q in range(n)]
        cb.tube(rg, [th * 0.85, th * 0.85], sides=6, rings=n, cap=False)
# ceramic stacks standing off the back between the packs
for s0, sc in ((0.475, 0.62), (0.685, 0.56), (0.86, 0.5)):
    for sg in (-1, 1):
        a = BACK + sg * 0.52; c = surf(s0, a, 0.006); out = Vector((math.cos(a), math.sin(a), 0))
        for j in range(4):
            ce.tube([c + out * ((j * 0.0145) * sc), c + out * ((j * 0.0145 + 0.0098) * sc)], [(0.0225 - j * 0.0024) * sc] * 2, sides=12, rings=3)
        ag.blob(c + out * 0.066 * sc, 0.0098 * sc, seg=9, rows=6)
# the nerves: round, thick, uneven, running the length of the arm
for sg, ph in ((-1, 0.4), (1, 1.9), (0, 3.1)):
    pts = [surf(0.25 + 0.68 * q / 22, BACK + sg * 0.95 + math.sin(q * 0.9 + ph) * 0.13, 0.008 + 0.004 * math.sin(q * 1.7 + ph) ** 2) for q in range(23)]
    rr = [0.0046 * (1 + 0.45 * math.sin(q * 1.3 + ph) ** 2) * (1 - 0.35 * q / 22) for q in range(23)]
    ag.tube(pts, rr, sides=7, rings=70)
# heavy cable looms on either side
for sg in (-1, 1):
    pts = [surf(0.25 + 0.66 * q / 12, BACK + sg * 1.55 + math.sin(q * 2.1) * 0.07, 0.01) for q in range(13)]
    cb.tube(pts, [0.0105, 0.0105, 0.0072], sides=7, rings=38)
# two blunt prongs at the end: where it all discharges
for sg in (-1, 1):
    p0 = surf(0.84, BACK + sg * 0.42, 0.004); p1 = surf(0.905, BACK + sg * 0.35, 0.03)
    cb.tube([p0, (p0 + p1) * 0.5, p1], [0.0115, 0.0095, 0.0065], sides=8, rings=8)
    ag.blob(p1, 0.0088, seg=9, rows=6)
cu.make('Mut_Arc', M['copper'], grime=0.18, uv=20.0)
ce.make('Mut_ArcCeramic', M['ceramic'], grime=0.25, uv=8.0)
cb.make('Mut_ArcCable', M['dark'], grime=0.12, uv=10.0)
ag.make('Mut_ArcGlow', M['arcglow'], uv=1.0)

# ================================================================ WHERE THE FLESH MEETS THE MACHINE. Nothing here sits on the arm: every ring cuts in and the flesh swells either side, every hose goes in through a raw puckered socket, every plate has a welt round it.
fl = B()      # shard
fa = B()      # arc
fc = B()      # husk
rg = B()      # black rings on the shard arm
def flesh_ring(bld, s, lift, th, n=34):
    pts = [surf(s, 2 * PI * q / (n - 1), lift + noise.noise(Vector((q * 0.4, s * 30, 1))) * th * 0.35) for q in range(n)]
    bld.tube(pts, [th, th], sides=7, rings=n, cap=False)
def socket(bld, s, a, r):
    """a raw puckered hole in the skin, where something goes in"""
    c = surf(s, a, -0.002); out = Vector((math.cos(a), math.sin(a), 0)); tan = Vector((-math.sin(a), math.cos(a), 0)); zz = Vector((0, 0, 1)); seg = 12; base = len(bld.v)
    for rho, h in ((0.5, -0.4), (0.82, 0.26), (1.05, 0.42), (1.45, 0.2), (1.95, -0.2)):
        for j in range(seg):
            t = 2 * PI * j / seg; pk = 1 + 0.12 * math.sin(t * 5)
            bld.add(c + tan * (math.cos(t) * rho * r * pk) + zz * (math.sin(t) * rho * r * pk) + out * h * r)
    for k in range(4):
        for j in range(seg): bld.f.append((base + k * seg + j, base + k * seg + (j + 1) % seg, base + (k + 1) * seg + (j + 1) % seg, base + (k + 1) * seg + j))
# --- shard: a welt round every plate, a black ring cinched into the arm between plates with flesh bulging either side, a socket for every hose
s = 0.27
while s < 0.87:
    k = (s - 0.27) / 0.6; ds = 0.03 - 0.009 * k; da = 1.22 - 0.22 * k; h = 0.018 - 0.006 * k
    scute(fl, s, ds * 1.32, BACK, da * 1.1, h * 0.62, ridge=0.0, nu=12, nv=8)
    ring_s = s + ds * 1.31
    n = 34; pts = [surf(ring_s, 2 * PI * q / (n - 1), 0.0035) for q in range(n)]
    rg.tube(pts, [0.0075 - 0.002 * k] * 2, sides=7, rings=n, cap=False)
    flesh_ring(fl, ring_s - 0.011, 0.0, 0.0068 - 0.002 * k); flesh_ring(fl, ring_s + 0.011, 0.0, 0.0068 - 0.002 * k)
    s += ds * 2.62
for sg in (-1, 1):
    for s0, s1 in ((0.32, 0.47), (0.5, 0.64), (0.67, 0.8)):
        socket(fl, s1, BACK + sg * 1.42, 0.0105)
# --- arc: flesh forced up either side of each coil pack, sockets at the insulators and where the nerves surface
for s0, s1, th in ((0.3, 0.42, 0.0098), (0.53, 0.63, 0.0082), (0.74, 0.82, 0.0066)):
    flesh_ring(fa, s0 - 0.024, 0.0, th * 0.95); flesh_ring(fa, s1 + 0.024, 0.0, th * 0.95)
for s0 in (0.475, 0.685, 0.86):
    for sg in (-1, 1): socket(fa, s0, BACK + sg * 0.52, 0.013)
for sg in (-1, 1, 0): socket(fa, 0.25, BACK + sg * 0.95, 0.0085)
# --- husk: raw flesh in the seams, where the shell is forcing its way out
s = 0.1
while s < 0.93:
    k = 1 - s; ds = 0.03 + 0.022 * k; h = 0.016 + 0.034 * k
    scute(fc, s - ds * 0.4, ds * 0.9, BACK, 1.15 - 0.2 * s, h * 0.42, ridge=0.0, nu=10, nv=6)
    s += ds * 1.5
fl.make('Mut_ShardFlesh', M['flesh'], uv=8.0); rg.make('Mut_ShardRings', M['black'], grime=0.1, uv=10.0)
fa.make('Mut_ArcFlesh', M['flesh'], uv=8.0); fc.make('Mut_CarapaceFlesh', M['flesh'], uv=8.0)

# ================================================================ THE TORSO: what you see of yourself looking down. A heavy soft column from under your line of sight to the floor, folding out into the roots of the six limbs on the ground. Its top is out of view; there are no eyes on it, because you are looking out of them.
ROOTS = [-1.18, 1.18, -1.96, 1.96, -2.75, 2.75, -0.39, 0.39]       # the limbs' angles in the game: x = sin(a), z = -cos(a)
TOP, BOT = 1.42, 0.3
def torso(u, v):
    a = u * 2 * PI - PI                                             # a = 0 points forward (-z)
    y = TOP + (BOT - TOP) * v
    prof = catmull([(0.13, 0, 0), (0.25, 0, 0), (0.31, 0, 0), (0.36, 0, 0), (0.42, 0, 0), (0.5, 0, 0), (0.46, 0, 0)], 61)[min(60, int(v * 60))].x
    lobe = 0.0
    for i, r in enumerate(ROOTS):
        d = math.atan2(math.sin(a - r), math.cos(a - r)); lobe += math.exp(-d * d / (0.075 if i < 6 else 0.05)) * (1.0 if i < 6 else 0.45)
    low = pow(v, 2.3)
    k = 1 + lobe * 0.34 * low - (1 - min(1.0, lobe)) * 0.14 * low
    d3 = Vector((math.sin(a) * 1.5, math.cos(a) * 1.5, v * 3.2))
    k *= 1 + noise.noise(d3) * 0.07 + noise.noise(d3 * 2.8) * 0.024                                       # muscle under loose skin
    k *= 1 + 0.018 * math.sin(a * 14 + noise.noise(d3) * 3) * (1 - low) * min(1.0, v * 3)                 # long vertical folds in the chest
    k *= 1 + math.sin(v * 58 + noise.noise(d3) * 4) * 0.005                                               # fine rings across them
    back = 1 + 0.2 * max(0.0, -math.cos(a)) * (1 - low)                                                   # the sac swells toward the rear, behind you
    r = prof * k
    return Vector((math.sin(a) * r, y + low * lobe * 0.04, -math.cos(a) * r * back + 0.2))
tb = B(); tb.grid(torso, 96, 60, closed_u=True)
base = len(tb.v) - 96; cc = tb.add(Vector((0, BOT + 0.08, 0.2)))
for i in range(96): tb.f.append((base + (i + 1) % 96, base + i, cc))
tb.make('V2Torso', M['skin'], uv=3.0)

save_v2(r"art\v2_arm.blend")
export_all(r"public\models\v2_arm.glb")
print('RESULT faces', sum(len(o.data.polygons) for o in bpy.data.objects), 'file', bpy.data.filepath)
