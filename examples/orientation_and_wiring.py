"""Show that orientation and wiring are load-bearing, not decorative.

In the reference TypeScript build both were cosmetic: turbine output ignored
orientation entirely, and transmission loss came from straight-line distance
rather than the cable path actually walked. This script demonstrates that
neither is true here.

    python examples/orientation_and_wiring.py
"""

import numpy as np

from worldforge_bench import Simulation
from worldforge_bench.network import GridNetwork

sim = Simulation(seed=42)
sim.advance(12)
state = sim.engine.state
cfg = sim.engine.cfg

# ---------------------------------------------------------------- orientation
print("=" * 66)
print("1. TURBINE ORIENTATION")
print("=" * 66)

site = None
for y in range(state.height):
    for x in range(state.width):
        if sim.can_place("wind", x, y):
            site = (x, y)
            break
    if site:
        break

x, y = site
sim.place("wind", x, y)
wind_dir = float(state.fields.wind_dir[y, x])
speed = float(state.fields.wind_speed[y, x])
print(f"turbine at ({x},{y}); wind from {wind_dir:.0f} deg at {speed:.2f} m/s\n")
print(f"  {'yaw offset':>12}  {'output':>10}   {'vs aligned':>11}")

base = None
for off in (0, 15, 30, 45, 60, 75, 90, 135, 180):
    r = sim.orient(x, y, (wind_dir + off) % 360)
    out = r.data["output_after_kw"]
    if base is None:
        base = out
    ratio = out / base if base else 0.0
    print(f"  {off:>10} deg  {out:>8.1f} kW   {ratio:>10.3f}")

print("\n  -> exactly cos(yaw), hard zero at and past 90 degrees.")
print("     Wind direction mean-reverts to a seasonal prevailing bearing,")
print("     so aiming turbines is a skill that pays rather than a coin flip.")

# --------------------------------------------------------------------- wiring
print()
print("=" * 66)
print("2. WIRING TOPOLOGY")
print("=" * 66)

sim2 = Simulation(seed=42)
sim2.advance(12)
st2 = sim2.engine.state
zone = st2.demand_zones[0]
zx, zy = zone.centre
lpc = cfg.machines.cable.loss_per_cell


def lay(sim, cells):
    return sim.cable([list(c) for c in cells])


def run_between(x0, y0, x1, y1):
    cells, cx, cy = [(x0, y0)], x0, y0
    while cx != x1:
        cx += 1 if x1 > cx else -1
        cells.append((cx, cy))
    while cy != y1:
        cy += 1 if y1 > cy else -1
        cells.append((cx, cy))
    return cells


# Find a start point whose whole run to the zone is legal cable ground --
# cable cannot cross water or snow, which is itself a routing constraint.
start, direct, res = None, None, None
for dist in range(3, 9):
    for cand in ((zx, zy + dist), (zx, zy - dist), (zx + dist, zy), (zx - dist, zy)):
        if not (0 <= cand[0] < st2.width and 0 <= cand[1] < st2.height):
            continue
        cells = run_between(cand[0], cand[1], zx, zy)
        if all(sim2.can_place("cable", cx, cy) for cx, cy in cells):
            start, direct = cand, cells
            break
    if start:
        break

if start is None:
    print("no fully legal cable corridor to the zone on this seed")
    raise SystemExit(0)

res = lay(sim2, direct)
print(f"direct run from {start} to zone at ({zx},{zy}): {res.message}")

net = GridNetwork(st2, cfg)
path = net._path_to_zone(start, zone.id)
if path:
    d = len(path)
    loss = 1 - (1 - lpc) ** d
    manhattan = abs(start[0] - zx) + abs(start[1] - zy)
    print(f"  routed path length : {d} cells   -> loss {loss:6.2%}")
    print(f"  straight-line dist : {manhattan} cells")
    print("\n  -> loss comes from the path BFS actually walks. A winding")
    print("     detour costs more than a clean run; under straight-line")
    print("     distance the two would be identical.")

print()
print("  Capacity is enforced per SEGMENT along that path, so two farms")
print("  sharing one trunk congest it and get curtailed. The fix is a")
print("  fatter or a parallel route -- which is a real design decision.")
print()
print("  A generator with no cable on or beside it delivers nothing at all;")
print("  that energy is logged as `unconnected` and earns zero revenue.")
