"""NiceIdeas logo round 3: balanced, symmetric flower marks in NiceNote petal colours.

Every concept keeps the 8-petal flower the user liked (round-2 concept C without its stem)
and ties it to the platform through one idea only, so the mark stays calm and symmetric.
"""
import math

# NiceNote icon petal colours, clockwise from top.
NN = ["#D94F33", "#FF5A58", "#C78612", "#F8CF5B", "#4E8C5D", "#009975", "#2B78C0", "#646AD8"]
C = 256  # canvas centre (512 x 512)

def place(d, deg, scale, fill):
    return f'<path d="{d}" fill="{fill}" transform="translate({C} {C}) rotate({deg:.2f}) scale({scale})"/>'

def spark(r, fill="#FFFFFF", deg=0):
    """Four-point sparkle (an idea lighting up), concave sides."""
    k = 0.22
    d = f"M0 -1 Q{k} -{k} 1 0 Q{k} {k} 0 1 Q-{k} {k} -1 0 Q-{k} -{k} 0 -1Z"
    return f'<path d="{d}" fill="{fill}" transform="translate({C} {C}) rotate({deg}) scale({r})"/>'

# G — Bloom: round-2 flower (pinwheel teardrops) with a white idea-sparkle at the heart.
TEAR = ("M0 -0.24 C-0.10 -0.40 -0.27 -0.60 -0.31 -0.80 C-0.36 -1.02 0.18 -1.10 0.33 -0.88 "
        "C0.46 -0.68 0.10 -0.42 0 -0.24Z")
def bloom(scale=232):
    body = "".join(place(TEAR, i * 45 + 8, scale, c) for i, c in enumerate(NN))
    return body + spark(0.25 * scale, fill="#7C3AED")

# H — Voices: eight round speech bubbles, tails pointing to the centre, form one flower.
def bubble(ring=0.62, r=0.22, tip=(0, -0.27), a_l=250, a_r=290):
    # circle centre (0,-ring); tail leaves the circle on its inner side and points at the centre.
    def on(a):
        t = math.radians(a)
        return r * math.cos(t), -ring - r * math.sin(t)
    (lx, ly), (rx, ry) = on(a_l), on(a_r)
    tx, ty = tip
    return (f"M{rx:.4f} {ry:.4f} A{r} {r} 0 1 0 {lx:.4f} {ly:.4f} "
            f"Q{lx + 0.03:.4f} {ly + 0.09:.4f} {tx} {ty} Q{rx - 0.005:.4f} {ry + 0.05:.4f} {rx:.4f} {ry:.4f}Z")
def voices(scale=262):
    d = bubble()
    body = "".join(place(d, i * 45, scale, c) for i, c in enumerate(NN))
    return body + spark(0.15 * scale, fill="#7C3AED")

# I — Spark bloom: mirror-symmetric petals radiating from a white sparkle (an idea spreading out).
PETAL = ("M0 -0.20 C0.15 -0.32 0.24 -0.55 0.20 -0.74 C0.16 -0.90 -0.16 -0.90 -0.20 -0.74 "
         "C-0.24 -0.55 -0.15 -0.32 0 -0.20Z")
def spark_bloom(scale=246):
    body = "".join(place(PETAL, i * 45, scale, c) for i, c in enumerate(NN))
    return body + spark(0.27 * scale, fill="#7C3AED")

def svg(body, bg=None, rx=0, pad=1.0):
    rect = f'<rect width="512" height="512" rx="{rx}" fill="{bg}"/>' if bg else ""
    off = 256 * (1 - pad)
    inner = body if pad == 1.0 else f'<g transform="translate({off:.1f} {off:.1f}) scale({pad})">{body}</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{rect}{inner}</svg>'

CONCEPTS = {"g-bloom": bloom(), "h-voices": voices(), "i-spark-bloom": spark_bloom()}

if __name__ == "__main__":
    for name, body in CONCEPTS.items():
        open(f"logo-{name}.svg", "w").write(svg(body))
        open(f"icon-{name}.svg", "w").write(svg(body, bg="#ffffff", rx=112, pad=0.80))
        open(f"icon-{name}-dark.svg", "w").write(svg(body, bg="#111827", rx=112, pad=0.80))
    print("ok")
