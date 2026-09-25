#!/usr/bin/env python3
"""
Turns the OpenStreetMap footprint of St Paul's (way 369161987, rotated into the cathedral frame:
x east along the nave axis, z south, origin on the dome axis) into a clean, mirror-symmetric
plan polygon with tagged segments, written to src/world/cathedral/plan.data.ts.

Usage: python3 tools/plan/make_plan.py tools/osm/raw/detail.json   (or any file containing the way)
"""
import json, math, sys

LAT0, LON0 = 51.51385, -0.09835
R = 6378137.0
# frame parameters measured from the 32 peristyle columns and the tower finials (see dims.ts)
CX, CZ, AXIS_DEG = 2.681952714039366, 7.085980902737184, -6.201362100796389

def local(lat, lon):
    x = math.radians(lon - LON0) * R * math.cos(math.radians(LAT0)) - CX
    z = -math.radians(lat - LAT0) * R - CZ
    a = math.radians(-AXIS_DEG)
    c, s = math.cos(a), math.sin(a)
    return (x * c - z * s, x * s + z * c)

def load_outline(path):
    d = json.load(open(path))
    for e in d['elements']:
        if e.get('id') == 369161987 and e['type'] == 'way':
            return [local(p['lat'], p['lon']) for p in e['geometry']][:-1]
    raise SystemExit('way 369161987 not found')

def main():
    pts = load_outline(sys.argv[1])
    # north half: z <= 0, ordered west -> east along the loop
    # find index of the westmost point near z=0 on the portico line
    n = len(pts)
    # the loop in OSM order goes (-53.4,22.7)... i.e. south side first. Collect north half in loop order.
    north = [p for p in pts if p[1] <= 0.3]
    south = [(p[0], -p[1]) for p in pts if p[1] >= -0.3]
    # order north half from west to east following the loop direction
    # OSM loop: indices where z<0 are contiguous; rotate so it starts at the portico
    idx = [i for i, p in enumerate(pts) if p[1] <= 0.3]
    # contiguous run
    runs = []
    cur = [idx[0]]
    for a, b in zip(idx, idx[1:]):
        if b == a + 1: cur.append(b)
        else: runs.append(cur); cur = [b]
    runs.append(cur)
    if len(runs) > 1 and runs[0][0] == 0 and runs[-1][-1] == n - 1:
        runs[0] = runs[-1] + runs[0]; runs.pop()
    seq = max(runs, key=len)
    north = [pts[i] for i in seq]
    # OSM runs the other way round (south side first): make north go west -> east
    if north[0][0] > north[-1][0]: north.reverse()
    # --- symmetrise with the mirrored south half
    southm = [(p[0], -p[1]) for p in pts if p[1] >= -0.3]
    sym = []
    for (x, z) in north:
        best = min(southm, key=lambda q: (q[0] - x) ** 2 + (q[1] - z) ** 2)
        d = math.hypot(best[0] - x, best[1] - z)
        sym.append(((x + best[0]) / 2, (z + best[1]) / 2) if d < 0.9 else (x, z))
    # --- replace the portico front (x ~ -86.1, |z| < 17.2) by the wall behind the portico
    k = next(i for i, p in enumerate(sym) if abs(p[1] + 17.18) < 0.3 and p[0] > -85.0)
    west = [(-83.05, 0.0), (-83.05, -13.45), (-83.72, -13.45)]
    sym = west + sym[k + 1:]
    # --- straighten: nearly axis-aligned segments become exactly axis-aligned
    for it in range(4):
        for i in range(len(sym) - 1):
            (x0, z0), (x1, z1) = sym[i], sym[i + 1]
            if abs(z1 - z0) < 0.35 and abs(x1 - x0) > abs(z1 - z0) * 3:
                zm = (z0 + z1) / 2
                sym[i] = (x0, zm); sym[i + 1] = (x1, zm)
            elif abs(x1 - x0) < 0.35 and abs(z1 - z0) > abs(x1 - x0) * 3:
                xm = (x0 + x1) / 2
                sym[i] = (xm, z0); sym[i + 1] = (xm, z1)
    sym = [(round(x * 20) / 20, round(z * 20) / 20) for x, z in sym]
    # last point must sit on the axis (apse crown)
    sym[-1] = (sym[-1][0], 0.0)
    # --- tag segments
    tags = []
    for i in range(len(sym) - 1):
        (x0, z0), (x1, z1) = sym[i], sym[i + 1]
        L = math.hypot(x1 - x0, z1 - z0)
        axis = abs(x1 - x0) < 1e-6 or abs(z1 - z0) < 1e-6
        if not axis:
            # the transept portico arcs and the apse
            tag = 'portico' if -12 < x0 < 12 and z0 < -30 else ('apse' if x0 > 60 else 'curve')
        elif L < 1.25:
            tag = 'side'
        else:
            tag = 'wall'
        tags.append(tag)
    # pier faces: an axis-aligned wall whose neighbours are both short sides stepping outward
    def outward(i):
        (x0, z0), (x1, z1) = sym[i], sym[i + 1]
        dx, dz = x1 - x0, z1 - z0
        l = math.hypot(dx, dz) or 1
        # the loop runs west->east along the north side, i.e. screen-counter-clockwise in the
        # x-right/z-down plan; outward (north) is (-dz, dx)
        return (-dz / l, dx / l)
    for i, t in enumerate(tags):
        if t != 'wall' or i == 0 or i == len(tags) - 1: continue
        if tags[i - 1] == 'side' and tags[i + 1] == 'side':
            o = outward(i)
            # previous side runs in direction o (stepping out) and the next side against it
            (a0, b0), (a1, b1) = sym[i - 1], sym[i]
            s0 = ((a1 - a0) * o[0] + (b1 - b0) * o[1])
            (c0, d0), (c1, d1) = sym[i + 1], sym[i + 2]
            s1 = ((c1 - c0) * o[0] + (d1 - d0) * o[1])
            if s0 > 0.2 and s1 < -0.2 and math.hypot(sym[i+1][0]-sym[i][0], sym[i+1][1]-sym[i][1]) < 4.6:
                tags[i] = 'pier'
    out = ['// Generated by tools/plan/make_plan.py from OpenStreetMap way 369161987 (ODbL).',
           '// North half of the ground-floor outline, west -> east, in the cathedral frame (m).',
           '// seg[i] describes the wall from pts[i] to pts[i+1]. Mirror in z for the south half.',
           'export const PLAN_NORTH: [number, number][] = [']
    for x, z in sym: out.append('  [%.2f, %.2f],' % (x, z))
    out.append('];')
    out.append('export type SegTag = "wall" | "pier" | "side" | "portico" | "apse" | "curve";')
    out.append('export const PLAN_TAGS: SegTag[] = [' + ', '.join('"%s"' % t for t in tags) + '];')
    open('src/world/cathedral/plan.data.ts', 'w').write('\n'.join(out) + '\n')
    print(len(sym), 'points', file=sys.stderr)
    for (x, z), t in zip(sym, tags + ['-']): print('%7.2f %7.2f %s' % (x, z, t), file=sys.stderr)

main()
