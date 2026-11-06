# INTRUDER V2: the facility's security androids. Three distinct machines, built in separate pieces on the same joints: plates over a frame over cables and a lit power core, so tearing one apart shows machinery coming away.
#   T trooper: the standard unit. Human proportions, slab chest, slit visor.
#   S scout:   light and fast. Reversed legs, thin arms, a low wedge of a head, always leaning forward.
#   H heavy:   a walking wall. No neck, enormous shoulders, twin cannon, vent stacks.
# Every piece is modelled around its own joint and named Variant__part__role__n: the game hangs it on that joint and gives it that role's material. Exports to public/models/v2_androids.glb.
# Run inside Blender with exec(open(path).read()).
import bpy, math, random, sys, importlib
from mathutils import Vector, Euler, noise
sys.path.insert(0, r"C:\Users\cartd\Desktop\Intruder-V2\art")
import v2kit; importlib.reload(v2kit)
from v2kit import B, mat, clear_scene, export_all, save_v2

clear_scene()
save_v2(r"art\v2_androids.blend")
PI = math.pi
M = {
  'plate': mat('AndPlate', '#8a9298', 0.38, 0.35), 'body': mat('AndBody', '#2c3237', 0.46, 0.5), 'trim': mat('AndTrim', '#c0901c', 0.45, 0.45), 'joint': mat('AndJoint', '#1a1e21', 0.5, 0.55),
  'cable': mat('AndCable', '#101214', 0.55, 0.1), 'core': mat('AndCore', '#201408', 0.3, 0.0, '#ff9a3c', 2.2), 'visor': mat('AndVisor', '#000000', 0.2, 0.0, '#ff2a10', 1.0), 'gun': mat('AndGun', '#000000', 0.2, 0.0, '#ff5a20', 1.0), 'light': mat('AndLight', '#000000', 0.3, 0.0, '#c0901c', 1.2),
}
pieces = []
def pc(V, part, role):
    b = B(); pieces.append((V, part, role, b)); return b

def sb(b, c, s, e=0.2, taper=(1, 1), rot=(0, 0, 0), seg=12, rows=8):
    """A machined block with soft edges: half-sizes s about centre c; taper narrows the top (x, z); rot in radians."""
    base = len(b.v); eu = Euler(rot, 'XYZ'); C = Vector(c)
    sp = lambda x: (1 if x >= 0 else -1) * pow(abs(x), e)
    for i in range(rows + 1):
        v = -PI / 2 + PI * i / rows; cv, sv = sp(math.cos(v)), sp(math.sin(v)); k = (sv + 1) / 2
        tx, tz = 1 + (taper[0] - 1) * k, 1 + (taper[1] - 1) * k
        for j in range(seg):
            u = 2 * PI * j / seg
            p = Vector((s[0] * cv * sp(math.cos(u)) * tx, s[1] * sv, s[2] * cv * sp(math.sin(u)) * tz))
            p.rotate(eu); b.add(p + C)
    for i in range(rows):
        for j in range(seg):
            b.f.append((base + i * seg + j, base + i * seg + (j + 1) % seg, base + (i + 1) * seg + (j + 1) % seg, base + (i + 1) * seg + j))
def cyl(b, a, z, r0, r1=None, sides=12):
    b.tube([a, z], [r0, r1 if r1 is not None else r0], sides=sides, rings=3)

# ---------------------------------------------------------------- shared limbs, sized by k
def leg_straight(V, s, side, k, L=0.44):
    h = pc(V, 'hp' + side, 'joint'); h.blob((0, 0, 0), 0.078 * k, seg=12, rows=7); cyl(h, (0, -0.02, 0), (0, -L + 0.03, 0), 0.066 * k, 0.054 * k)
    p = pc(V, 'hp' + side, 'plate'); sb(p, (0, -0.2, -0.062 * k), (0.072 * k, 0.15, 0.034 * k), taper=(1.15, 1.1)); sb(p, (s * 0.062 * k, -0.17, 0), (0.024 * k, 0.11, 0.05 * k))
    q = pc(V, 'hp' + side, 'cable'); cyl(q, (0, -0.07, 0.066 * k), (0, -L + 0.06, 0.05 * k), 0.012, sides=7)
    n = pc(V, 'kn' + side, 'joint'); n.blob((0, 0, 0), 0.064 * k, seg=12, rows=7); cyl(n, (0, -0.03, 0), (0, -L + 0.03, 0), 0.056 * k, 0.044 * k)
    c = pc(V, 'kn' + side, 'trim'); sb(c, (0, 0.012, -0.062 * k), (0.056 * k, 0.058, 0.03 * k))
    p = pc(V, 'kn' + side, 'plate'); sb(p, (0, -0.21, -0.052 * k), (0.062 * k, 0.15, 0.026 * k), taper=(1.2, 1)); sb(p, (0, -0.15, 0.05 * k), (0.052 * k, 0.1, 0.03 * k), taper=(1.2, 1.2))
    f = pc(V, 'ft' + side, 'joint'); f.blob((0, 0, 0), 0.046 * k, seg=10, rows=6); sb(f, (0, -0.016, -0.03 * k), (0.066 * k, 0.028, 0.11 * k))
    p = pc(V, 'ft' + side, 'plate'); sb(p, (0, -0.002, -0.095 * k), (0.058 * k, 0.03, 0.06 * k), taper=(0.85, 0.8))

def leg_reversed(V, s, side):
    # a bird's leg: the knee forward and high, the shank running back, then a long foot down to the ground
    h = pc(V, 'hp' + side, 'joint'); h.blob((0, 0, 0), 0.058, seg=12, rows=7); cyl(h, (0, -0.02, -0.01), (0, -0.36, -0.14), 0.05, 0.04)
    p = pc(V, 'hp' + side, 'plate'); sb(p, (0, -0.16, -0.095), (0.052, 0.12, 0.022), rot=(0.38, 0, 0), taper=(1.2, 1))
    n = pc(V, 'kn' + side, 'joint'); n.blob((0, 0, 0), 0.048, seg=10, rows=6); cyl(n, (0, -0.02, 0.012), (0, -0.32, 0.2), 0.036, 0.026)
    c = pc(V, 'kn' + side, 'trim'); sb(c, (0, 0.012, -0.044), (0.04, 0.04, 0.022))
    p = pc(V, 'kn' + side, 'plate'); sb(p, (0, -0.16, 0.062), (0.04, 0.12, 0.018), rot=(-0.56, 0, 0), taper=(1.15, 1))
    q = pc(V, 'kn' + side, 'cable'); cyl(q, (0, -0.05, -0.022), (0, -0.28, 0.14), 0.009, sides=7)
    f = pc(V, 'ft' + side, 'joint'); f.blob((0, 0, 0), 0.034, seg=10, rows=6); cyl(f, (0, -0.01, 0), (0, -0.2, -0.06), 0.028, 0.022); sb(f, (0, -0.215, -0.09), (0.052, 0.018, 0.1))
    p = pc(V, 'ft' + side, 'plate'); sb(p, (0, -0.2, -0.16), (0.044, 0.018, 0.05), taper=(0.75, 0.75))

def arm_upper(V, s, side, k, pauldron, L=0.33):
    j = pc(V, 'sh' + side, 'joint'); j.blob((0, 0, 0), 0.074 * k, seg=12, rows=7); cyl(j, (0, -0.03, 0), (0, -L + 0.03, 0), 0.05 * k, 0.044 * k)
    p = pc(V, 'sh' + side, pauldron[3] if len(pauldron) > 3 else 'plate'); sb(p, (s * 0.03 * k, 0.045, 0), (pauldron[0], pauldron[1], pauldron[2]), rot=(0, 0, s * -0.22), taper=(0.82, 0.86))
    p = pc(V, 'sh' + side, 'plate'); sb(p, (s * 0.026 * k, -0.17, 0), (0.038 * k, 0.1, 0.056 * k))
    q = pc(V, 'sh' + side, 'cable'); cyl(q, (-s * 0.04 * k, -0.04, 0.03 * k), (-s * 0.035 * k, -L + 0.04, 0.03 * k), 0.01, sides=7)

def arm_lower(V, s, side, k, hand=True, L=0.26):
    j = pc(V, 'el' + side, 'joint'); j.blob((0, 0, 0), 0.054 * k, seg=10, rows=6); cyl(j, (0, -0.02, 0), (0, -L + 0.02, 0), 0.046 * k, 0.04 * k)
    p = pc(V, 'el' + side, 'plate'); sb(p, (0, -0.13, -0.012 * k), (0.056 * k, 0.095, 0.052 * k), taper=(1.12, 1.12))
    if hand:
        h = pc(V, 'el' + side, 'joint'); sb(h, (0, -L - 0.02, 0), (0.042 * k, 0.038, 0.05 * k))
        for f in (-1, 0, 1): cyl(h, (f * 0.028 * k, -L - 0.05, -0.02 * k), (f * 0.03 * k, -L - 0.11, -0.034 * k), 0.011 * k, 0.008 * k, sides=7)

def piston(V, side, k, z, L=0.44):
    """A hydraulic ram down the back of a straight leg: its housing rides the thigh, its rod comes up out of the shin and slides into it as the knee bends."""
    f = L / 0.44
    h = pc(V, 'hp' + side, 'body'); cyl(h, (0, -0.07, z * k), (0, -0.27 * f, z * k), 0.024 * k, sides=10)
    c = pc(V, 'hp' + side, 'trim'); cyl(c, (0, -0.075, z * k), (0, -0.095, z * k), 0.03 * k, sides=10); cyl(c, (0, -0.255 * f, z * k), (0, -0.275 * f, z * k), 0.03 * k, sides=10)
    r = pc(V, 'kn' + side, 'joint'); cyl(r, (0, 0.17 * f, z * k), (0, -0.06, z * k), 0.011 * k, sides=8)
    m = pc(V, 'kn' + side, 'body'); sb(m, (0, -0.06, z * k), (0.018 * k, 0.018, 0.022 * k))
def slack(b, a, c, sag, r, sides=7, rings=11):
    """A cable that is longer than the gap it crosses: it hangs in a loop."""
    mid = ((a[0] + c[0]) / 2, min(a[1], c[1]) - sag, (a[2] + c[2]) / 2); q1 = ((a[0] * 2 + c[0]) / 3, mid[1] + sag * 0.35, (a[2] * 2 + c[2]) / 3); q2 = ((a[0] + c[0] * 2) / 3, mid[1] + sag * 0.35, (a[2] + c[2] * 2) / 3)
    b.tube([a, q1, mid, q2, c], [r, r * 0.95, r, r * 0.95, r], sides=sides, rings=rings)
def spine_core(V, y0, y1, r):
    c = pc(V, 'torso', 'cable')
    for a in (-0.7, 0.7): cyl(c, (a * r, y0, 0.03), (a * r * 0.8, y1, 0.02), 0.012, sides=7)
    j = pc(V, 'torso', 'joint'); cyl(j, (0, y0, 0), (0, y1, 0), r, r * 1.14, sides=14)

# ================================================================ TROOPER
V = 'T'
for s, side in ((-1, 'L'), (1, 'R')):
    leg_straight(V, s, side, 1.0); piston(V, side, 1.0, 0.072)
    q = pc(V, 'hp' + side, 'cable'); slack(q, (s * 0.05, -0.06, 0.07), (s * 0.052, -0.3, 0.066), 0.05, 0.009)
j = pc(V, 'hips', 'joint'); sb(j, (0, 0, 0), (0.15, 0.07, 0.105))
p = pc(V, 'hips', 'plate'); sb(p, (0, -0.04, -0.112), (0.13, 0.06, 0.026), rot=(0.16, 0, 0), taper=(1.2, 1)); sb(p, (0, -0.03, 0.11), (0.12, 0.05, 0.024))
for s in (-1, 1): sb(p, (s * 0.175, -0.05, 0), (0.042, 0.08, 0.1), rot=(0, 0, s * 0.18))
spine_core(V, 0, 0.22, 0.095)
b = pc(V, 'torso', 'body'); sb(b, (0, 0.42, 0.005), (0.2, 0.175, 0.125), taper=(1.1, 1.0))
for i in range(3): sb(b, (0, 0.05 + i * 0.058, -0.012), (0.122 - i * 0.004, 0.024, 0.086))
k = pc(V, 'torso', 'core'); sb(k, (0, 0.41, -0.062), (0.075, 0.075, 0.07))
for s in (-1, 1):
    p = pc(V, 'torso', 'plate'); sb(p, (s * 0.105, 0.48, -0.112), (0.104, 0.105, 0.032), rot=(0.14, s * 0.2, 0), taper=(1.12, 1))
p = pc(V, 'torso', 'plate'); sb(p, (0, 0.285, -0.098), (0.12, 0.05, 0.028), rot=(-0.12, 0, 0), taper=(1.2, 1))
t = pc(V, 'torso', 'trim'); sb(t, (0, 0.352, -0.126), (0.056, 0.016, 0.012)); sb(t, (0, 0.47, -0.142), (0.016, 0.1, 0.012))
j = pc(V, 'torso', 'joint'); cyl(j, (0, 0.6, 0), (0, 0.64, 0), 0.135, 0.095, sides=14)
p = pc(V, 'torso', 'plate'); sb(p, (0, 0.43, 0.178), (0.158, 0.18, 0.058), taper=(0.92, 0.9))
l = pc(V, 'torso', 'light')
for i in range(3): sb(l, (0, 0.34 + i * 0.075, 0.238), (0.105, 0.012, 0.008))
c = pc(V, 'torso', 'cable')
for s in (-1, 1): c.tube([(s * 0.1, 0.56, 0.2), (s * 0.2, 0.63, 0.12), (s * 0.28, 0.6, 0.03)], [0.016, 0.014, 0.012], sides=7, rings=9)
for s in (-1, 1):
    slack(c, (s * 0.07, 0.24, 0.17), (s * 0.06, 0.04, 0.1), 0.07, 0.013, sides=8)      # the harness from pack to hip
    h = pc(V, 'torso', 'body'); cyl(h, (s * 0.11, 0.3, 0.24), (s * 0.11, 0.58, 0.24), 0.016, sides=8); cyl(h, (s * 0.11, 0.3, 0.24), (s * 0.11, 0.32, 0.24), 0.024, sides=8)
j = pc(V, 'head', 'joint'); cyl(j, (0, -0.04, 0), (0, 0.06, 0), 0.05, 0.042, sides=10)
c = pc(V, 'head', 'cable'); [cyl(c, (s * 0.06, -0.05, 0.03), (s * 0.05, 0.05, 0.05), 0.009, sides=6) for s in (-1, 1)]
p = pc(V, 'head', 'plate'); sb(p, (0, 0.135, 0.008), (0.104, 0.118, 0.118), taper=(0.84, 0.88))
b = pc(V, 'head', 'body'); sb(b, (0, 0.1, -0.094), (0.084, 0.074, 0.036), taper=(1.0, 1)); sb(b, (0, 0.05, -0.06), (0.06, 0.03, 0.05))
v = pc(V, 'head', 'visor'); sb(v, (0, 0.128, -0.128), (0.078, 0.016, 0.01), rows=6)
t = pc(V, 'head', 'trim'); sb(t, (0, 0.255, 0.02), (0.016, 0.022, 0.092))
j = pc(V, 'head', 'joint'); [sb(j, (s * 0.108, 0.1, 0.02), (0.016, 0.05, 0.05)) for s in (-1, 1)]
arm_upper(V, -1, 'L', 1.0, (0.088, 0.066, 0.098)); arm_upper(V, 1, 'R', 1.0, (0.088, 0.066, 0.098))
t = pc(V, 'shL', 'trim'); sb(t, (-0.02, 0.09, 0), (0.05, 0.012, 0.09)); t = pc(V, 'shR', 'trim'); sb(t, (0.02, 0.09, 0), (0.05, 0.012, 0.09))
arm_lower(V, -1, 'L', 1.0); arm_lower(V, 1, 'R', 1.0, hand=False)
g = pc(V, 'gun', 'joint'); sb(g, (0, 0, -0.06), (0.062, 0.062, 0.13)); sb(g, (0, -0.06, -0.02), (0.026, 0.05, 0.04))
g = pc(V, 'gun', 'body'); cyl(g, (0, 0, -0.14), (0, 0, -0.385), 0.038, 0.034, sides=14)
g = pc(V, 'gun', 'plate'); sb(g, (0, 0.046, -0.2), (0.03, 0.016, 0.12))
g = pc(V, 'gun', 'trim'); [cyl(g, (0, 0, z), (0, 0, z - 0.016), 0.05, sides=14) for z in (-0.21, -0.3)]
g = pc(V, 'gun', 'gun'); cyl(g, (0, 0, -0.378), (0, 0, -0.392), 0.026, sides=12)
g = pc(V, 'gun', 'light'); sb(g, (0, 0.074, -0.05), (0.014, 0.012, 0.03), rows=6)

# ================================================================ SCOUT: all lean and leg
V = 'S'
for s, side in ((-1, 'L'), (1, 'R')):
    leg_reversed(V, s, side)
    st = pc(V, 'hp' + side, 'joint'); cyl(st, (0, -0.06, 0.03), (0, -0.3, -0.06), 0.012, sides=8)      # the tendon strut
    q = pc(V, 'kn' + side, 'cable'); slack(q, (s * 0.03, -0.04, 0.03), (s * 0.03, -0.28, 0.16), 0.04, 0.007, sides=6)
j = pc(V, 'hips', 'joint'); sb(j, (0, 0, 0), (0.11, 0.058, 0.082))
p = pc(V, 'hips', 'plate'); sb(p, (0, -0.012, 0.09), (0.09, 0.05, 0.05), taper=(0.7, 0.7))
t = pc(V, 'hips', 'trim'); sb(t, (0, 0.03, 0.14), (0.018, 0.012, 0.06))
spine_core(V, 0, 0.2, 0.06)
b = pc(V, 'torso', 'body'); sb(b, (0, 0.36, 0.012), (0.13, 0.13, 0.092), taper=(1.2, 0.95))
for i in range(2): sb(b, (0, 0.06 + i * 0.058, -0.008), (0.078, 0.022, 0.058))
k = pc(V, 'torso', 'core'); sb(k, (0, 0.36, -0.05), (0.05, 0.055, 0.05))
for s in (-1, 1):
    p = pc(V, 'torso', 'plate'); sb(p, (s * 0.07, 0.4, -0.082), (0.066, 0.08, 0.02), rot=(0.2, s * 0.26, 0), taper=(1.22, 1))
j = pc(V, 'torso', 'joint'); cyl(j, (0, 0.48, 0.012), (0, 0.53, -0.004), 0.08, 0.05, sides=12)
p = pc(V, 'torso', 'plate'); sb(p, (0, 0.34, 0.112), (0.09, 0.11, 0.024), taper=(1.1, 1))
l = pc(V, 'torso', 'light'); sb(l, (0, 0.3, 0.138), (0.05, 0.03, 0.008))
t = pc(V, 'torso', 'trim')
for s in (-1, 1): t.tube([(s * 0.06, 0.44, 0.09), (s * 0.08, 0.6, 0.15), (s * 0.075, 0.76, 0.2)], [0.011, 0.008, 0.004], sides=7, rings=9)     # two thin aerials, swept back
j = pc(V, 'head', 'joint'); cyl(j, (0, -0.05, 0.012), (0, 0.02, -0.01), 0.032, 0.026, sides=9)
p = pc(V, 'head', 'plate'); sb(p, (0, 0.05, -0.05), (0.072, 0.048, 0.13), taper=(0.72, 0.74), e=0.26)
b = pc(V, 'head', 'body'); sb(b, (0, 0.02, -0.115), (0.052, 0.024, 0.07))
v = pc(V, 'head', 'visor'); sb(v, (0, 0.06, -0.156), (0.05, 0.012, 0.026), rows=6)
t = pc(V, 'head', 'trim'); sb(t, (0, 0.102, 0.0), (0.012, 0.02, 0.09))
arm_upper(V, -1, 'L', 0.72, (0.05, 0.04, 0.066)); arm_upper(V, 1, 'R', 0.72, (0.05, 0.04, 0.066))
arm_lower(V, -1, 'L', 0.72, L=0.24); arm_lower(V, 1, 'R', 0.72, hand=False, L=0.24)
g = pc(V, 'gun', 'joint'); sb(g, (0, 0, -0.05), (0.038, 0.04, 0.09))
g = pc(V, 'gun', 'body'); cyl(g, (0, 0, -0.1), (0, 0, -0.39), 0.02, 0.014, sides=10)
g = pc(V, 'gun', 'trim'); cyl(g, (0, 0, -0.2), (0, 0, -0.214), 0.028, sides=10)
g = pc(V, 'gun', 'gun'); cyl(g, (0, 0, -0.386), (0, 0, -0.396), 0.012, sides=9)
g = pc(V, 'gun', 'light'); sb(g, (0, 0.048, -0.04), (0.01, 0.008, 0.02), rows=6)

# ================================================================ HEAVY: shoulders first
V = 'H'
for s, side in ((-1, 'L'), (1, 'R')):
    leg_straight(V, s, side, 1.36); piston(V, side, 1.36, 0.075)
    q = pc(V, 'hp' + side, 'cable'); slack(q, (s * 0.08, -0.08, 0.1), (s * 0.085, -0.42, 0.09), 0.09, 0.014, sides=8)
for side in ('L', 'R'):
    t = pc(V, 'kn' + side, 'plate'); sb(t, (0, -0.36, -0.03), (0.09, 0.05, 0.09), taper=(1.2, 1.2))
j = pc(V, 'hips', 'joint'); sb(j, (0, 0, 0), (0.2, 0.09, 0.14))
p = pc(V, 'hips', 'plate'); sb(p, (0, -0.055, -0.15), (0.17, 0.08, 0.034), rot=(0.14, 0, 0), taper=(1.2, 1)); sb(p, (0, -0.05, 0.145), (0.16, 0.07, 0.03))
for s in (-1, 1): sb(p, (s * 0.235, -0.07, 0), (0.05, 0.1, 0.13), rot=(0, 0, s * 0.16))
spine_core(V, 0, 0.2, 0.13)
b = pc(V, 'torso', 'body'); sb(b, (0, 0.42, 0.01), (0.3, 0.21, 0.175), taper=(1.18, 1.0))
for i in range(2): sb(b, (0, 0.07 + i * 0.07, -0.02), (0.17, 0.03, 0.12))
k = pc(V, 'torso', 'core'); sb(k, (0, 0.4, -0.09), (0.1, 0.09, 0.09))
p = pc(V, 'torso', 'plate'); sb(p, (0, 0.51, -0.158), (0.26, 0.12, 0.045), rot=(0.1, 0, 0), taper=(1.12, 1))
for s in (-1, 1): sb(p, (s * 0.16, 0.3, -0.158), (0.12, 0.085, 0.04), rot=(-0.1, s * 0.16, 0), taper=(1.2, 1))
p = pc(V, 'torso', 'plate'); sb(p, (0, 0.46, 0.22), (0.25, 0.18, 0.06), taper=(0.92, 0.9))
t = pc(V, 'torso', 'trim'); sb(t, (0, 0.585, -0.2), (0.15, 0.022, 0.016)); sb(t, (0, 0.36, -0.205), (0.024, 0.09, 0.012))
j = pc(V, 'torso', 'joint'); sb(j, (0, 0.655, 0.03), (0.2, 0.052, 0.14))                 # the collar the head sits down inside
for s in (-1, 1):
    d = pc(V, 'torso', 'body'); cyl(d, (s * 0.15, 0.56, 0.26), (s * 0.17, 0.88, 0.3), 0.05, 0.044, sides=12)    # vent stacks behind the shoulders
    t = pc(V, 'torso', 'joint'); cyl(t, (s * 0.17, 0.86, 0.297), (s * 0.174, 0.9, 0.303), 0.055, sides=12)
    l = pc(V, 'torso', 'light'); cyl(l, (s * 0.174, 0.898, 0.303), (s * 0.174, 0.904, 0.303), 0.038, sides=10)
c = pc(V, 'torso', 'cable')
for s in (-1, 1): c.tube([(s * 0.14, 0.6, 0.26), (s * 0.3, 0.68, 0.16), (s * 0.42, 0.62, 0.04)], [0.022, 0.02, 0.018], sides=8, rings=9)
for s in (-1, 1):
    h = pc(V, 'torso', 'body'); cyl(h, (s * 0.26, 0.6, 0.0), (s * 0.34, 0.45, 0.0), 0.028, 0.024, sides=10)       # shoulder rams
    c2 = pc(V, 'torso', 'cable'); slack(c2, (s * 0.2, 0.3, 0.255), (s * 0.12, 0.05, 0.19), 0.1, 0.018, sides=8)
p = pc(V, 'head', 'plate'); sb(p, (0, 0.07, 0.0), (0.105, 0.085, 0.115), taper=(0.8, 0.84))
b = pc(V, 'head', 'body'); sb(b, (0, 0.04, -0.09), (0.082, 0.05, 0.04))
v = pc(V, 'head', 'visor'); sb(v, (0, 0.075, -0.122), (0.07, 0.012, 0.01), rows=6)
t = pc(V, 'head', 'trim'); sb(t, (0, 0.155, 0.0), (0.02, 0.012, 0.09))
arm_upper(V, -1, 'L', 1.4, (0.17, 0.11, 0.17, 'trim'), L=0.32); arm_upper(V, 1, 'R', 1.4, (0.17, 0.11, 0.17, 'trim'), L=0.32)
for s, side in ((-1, 'L'), (1, 'R')):
    p = pc(V, 'sh' + side, 'plate'); sb(p, (s * 0.1, -0.03, 0), (0.1, 0.05, 0.15), rot=(0, 0, s * -0.48))
arm_lower(V, -1, 'L', 1.4, L=0.26); arm_lower(V, 1, 'R', 1.4, hand=False, L=0.26)
g = pc(V, 'gun', 'joint'); sb(g, (0, 0, -0.08), (0.1, 0.086, 0.17))
g = pc(V, 'gun', 'body')
for x in (-0.048, 0.048): cyl(g, (x, 0, -0.2), (x, 0, -0.39), 0.04, 0.036, sides=12)
g = pc(V, 'gun', 'plate'); sb(g, (0, 0.074, -0.15), (0.08, 0.018, 0.14))
g = pc(V, 'gun', 'trim'); sb(g, (0, 0, -0.28), (0.1, 0.05, 0.016))
g = pc(V, 'gun', 'gun')
for x in (-0.048, 0.048): cyl(g, (x, 0, -0.382), (x, 0, -0.398), 0.026, sides=10)
g = pc(V, 'gun', 'light'); sb(g, (0, 0.098, -0.06), (0.02, 0.01, 0.03), rows=6)

# ---------------------------------------------------------------- made
count = {}
GRIME = {'plate': 0.34, 'body': 0.3, 'trim': 0.3, 'joint': 0.2, 'cable': 0.0, 'core': 0.0, 'visor': 0.0, 'gun': 0.0, 'light': 0.0}
for V, part, role, b in pieces:
    key = (V, part, role); count[key] = count.get(key, 0) + 1
    b.make('%s__%s__%s__%d' % (V, part, role, count[key]), M[role], grime=GRIME[role], uv=7.0)
save_v2(r"art\v2_androids.blend")
export_all(r"public\models\v2_androids.glb")
totals = {}
for o in bpy.data.objects:
    v = o.name[0]; n = totals.setdefault(v, [0, 0]); n[0] += 1; n[1] += len(o.data.polygons)
print('RESULT', totals, bpy.data.filepath)
