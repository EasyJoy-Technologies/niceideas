"""Round 3b: user idea (21:36) — centre is a round dot, so each petal + the dot reads as an "i" (ideas)."""
import math
from build_logo_v3 import NN, C, place, svg

PURPLE = "#7C3AED"

def dot(r, fill=PURPLE):
    return f'<circle cx="{C}" cy="{C}" r="{r:.1f}" fill="{fill}"/>'

# J — Petal i: round-3 "I" petals pulled away from a purple centre dot (the gap = i's tittle gap).
TEAR = ("M0 -0.30 C0.13 -0.38 0.23 -0.58 0.20 -0.76 C0.17 -0.92 -0.17 -0.92 -0.20 -0.76 "
        "C-0.23 -0.58 -0.13 -0.38 0 -0.30Z")
def petal_i(scale=250):
    return "".join(place(TEAR, i * 45, scale, c) for i, c in enumerate(NN)) + dot(0.17 * scale)

# K — Stem i: stem-like petals (rounded, slightly wider outward) so the "i" reads more literally.
# Capsule stems (round both ends), like the stem of the lowercase "i".
STEM = ("M-0.10 -0.40 A0.10 0.10 0 0 0 0.10 -0.40 L0.10 -0.74 A0.10 0.10 0 0 0 -0.10 -0.74 Z")
def stem_i(scale=262):
    return "".join(place(STEM, i * 45, scale, c) for i, c in enumerate(NN)) + dot(0.20 * scale)

# L — Ring of i: eight literal i's standing outward (stem inside, coloured dot outside), purple dot at centre.
def ring_i(scale=250):
    stem = "M-0.075 -0.28 A0.075 0.075 0 0 0 0.075 -0.28 L0.075 -0.58 A0.075 0.075 0 0 0 -0.075 -0.58 Z"
    body = ""
    for i, c in enumerate(NN):
        body += place(stem, i * 45, scale, c)
        a = math.radians(i * 45)
        body += f'<circle cx="{C + math.sin(a) * 0.80 * scale:.1f}" cy="{C - math.cos(a) * 0.80 * scale:.1f}" r="{0.10 * scale:.1f}" fill="{c}"/>'
    return body + dot(0.11 * scale)

CONCEPTS = {"j-petal-i": petal_i(), "k-stem-i": stem_i(), "l-ring-i": ring_i()}

if __name__ == "__main__":
    for name, body in CONCEPTS.items():
        open(f"logo-{name}.svg", "w").write(svg(body))
        open(f"icon-{name}.svg", "w").write(svg(body, bg="#ffffff", rx=112, pad=0.80))
        open(f"icon-{name}-dark.svg", "w").write(svg(body, bg="#111827", rx=112, pad=0.80))
    print("ok")
