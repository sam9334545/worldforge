"""Build a small portfolio and see what it is worth.

    python examples/quickstart.py
"""

from worldforge_bench import Simulation

sim = Simulation(seed=42)
sim.advance(12)                       # get to daylight so the fields are live

print(sim.map())
print()

# Rank every legal wind site by the wind that actually reaches it -- after
# roughness, elevation exposure and wind shadow. Terrain type is never consulted.
state = sim.engine.state
sites = []
for y in range(state.height):
    for x in range(state.width):
        if sim.can_place("wind", x, y):
            sites.append((float(state.fields.wind_speed[y, x]), x, y))
sites.sort(reverse=True)

print("best wind sites by delivered resource, not by terrain name:")
for v, x, y in sites[:5]:
    print(f"  ({x:2d},{y:2d})  {state.terrain_at(x, y).name:<12} {v:5.2f} m/s")
print()

zone = state.demand_zones[0]
built = 0
for v, x, y in sites:
    if built >= 4:
        break
    r = sim.place("wind", x, y,
                  orientation=sim.best_orientation("wind", x, y),
                  debt_fraction=0.45)
    if not r.ok:
        continue
    built += 1
    print(f"  {r.message}   (${r.cost:,.0f})")

    # Wire it to the zone with an L-shaped run.
    zx, zy = zone.centre
    path, cx, cy = [(x, y)], x, y
    while cx != zx:
        cx += 1 if zx > cx else -1
        path.append((cx, cy))
    while cy != zy:
        cy += 1 if zy > cy else -1
        path.append((cx, cy))
    c = sim.cable(path, debt_fraction=0.45)
    print(f"    wiring: {c.message}" if c.ok else f"    wiring failed: {c.message}")

print("\nrunning three years ...")
sim.advance(24 * 360 * 3)
print()
print(sim.report())
