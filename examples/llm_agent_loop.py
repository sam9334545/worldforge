"""Drive the simulation the way an LLM agent would: over the JSON API.

Spawns `wfbench serve` as a subprocess and talks line-delimited JSON to it.
The policy here is deliberately trivial -- the point is the protocol, which is
the same one a model-backed agent would use as a tool.

    python examples/llm_agent_loop.py
"""

import json
import subprocess
import sys


class Client:
    def __init__(self, seed=42, years=3):
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "worldforge_bench.cli", "serve",
             "--seed", str(seed), "--years", str(years)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        print("server:", self.send_raw(None))

    def send_raw(self, req):
        if req is not None:
            self.proc.stdin.write(json.dumps(req) + "\n")
            self.proc.stdin.flush()
        return json.loads(self.proc.stdout.readline())

    def __call__(self, **req):
        return self.send_raw(req)

    def close(self):
        try:
            self(op="quit")
        except Exception:
            pass
        self.proc.terminate()


c = Client(seed=42, years=3)

c(op="advance", ticks=12)
obs = c(op="observe", include_grid=False)["observation"]
print(f"\ntick {obs['tick']}  {obs['clock']['season']}  "
      f"price ${obs['market']['price']}/MWh  cash ${obs['finance']['cash']:,.0f}")
print("capex right now:", obs["market"]["capex_now"])

# Ask the world what a machine would produce before paying for it.
zone = obs["grid"]["zones"][0]
zx, zy = zone["centre"]
print(f"\nprobing sites near the {zone['tier']} zone at ({zx},{zy}):")
best = None
for dx in range(-4, 5):
    for dy in range(-4, 5):
        x, y = zx + dx, zy + dy
        legal = c(op="can_place", kind="wind", x=x, y=y)
        if not legal.get("valid"):
            continue
        p = c(op="predict", kind="wind", x=x, y=y)
        kw = p["data"]["actual_kw"]
        if best is None or kw > best[0]:
            best = (kw, x, y)

if best:
    kw, x, y = best
    print(f"  best probed site: ({x},{y}) at {kw:.1f} kW")
    r = c(op="act", action={"type": "PLACE", "kind": "wind", "x": x, "y": y,
                            "debt_fraction": 0.4})
    print("  place:", r["message"])

    path, cx, cy = [[x, y]], x, y
    while cx != zx:
        cx += 1 if zx > cx else -1
        path.append([cx, cy])
    while cy != zy:
        cy += 1 if zy > cy else -1
        path.append([cx, cy])
    r = c(op="act", action={"type": "PLACE_CABLE", "path": path,
                            "debt_fraction": 0.4})
    print("  cable:", r["message"])

print("\nadvancing a year ...")
c(op="advance", ticks=24 * 360)
score = c(op="score")["score"]
print(f"\nscore {score['score']:.1f}/100   "
      f"equity ${score['terminal_equity']:,.0f}   "
      f"delivered {score['mwh_delivered']:,.0f} MWh")
c.close()
