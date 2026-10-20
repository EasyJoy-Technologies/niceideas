"""Generates NiceIdeas logo concept SVGs (colors from the NiceNote app icon)."""
import math

# NiceNote icon petal colours (clockwise from top).
NN = {"red": "#D94F33", "coral": "#FF5A58", "ochre": "#C78612", "yellow": "#F8CF5B",
      "sage": "#4E8C5D", "teal": "#009975", "blue": "#2E78C0", "indigo": "#646AD8"}
INK = "#1F2937"
VIOLET = "#7C3AED"

def petal(cx, cy, ang, r, color, gap=0.06):
    """Asymmetric teardrop petal pointing away from (cx,cy) at angle `ang` (0 = up)."""
    g = gap
    d = (f"M0 {-g} C-0.08 -0.30 -0.27 -0.60 -0.31 -0.80 "
         f"C-0.36 -1.02 0.18 -1.10 0.33 -0.88 C0.46 -0.68 0.12 -0.32 0 {-g}Z")
    return (f'<path d="{d}" fill="{color}" '
            f'transform="translate({cx} {cy}) rotate({ang}) scale({r})"/>')

def svg(body, size=512, bg=None, rx=0):
    rect = f'<rect width="{size}" height="{size}" rx="{rx}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">{rect}{body}</svg>'

# A — Idea Bloom: petals radiate like light from a bulb; ink base below.
def bloom():
    order = ["teal", "blue", "indigo", "red", "coral", "ochre", "yellow"]
    angles = [-135, -90, -45, 0, 45, 90, 135]
    cx, cy, r = 256, 236, 150
    body = "".join(petal(cx, cy, a, r, NN[c], 0.12) for a, c in zip(angles, order))
    body += f'<rect x="214" y="372" width="84" height="22" rx="11" fill="{INK}"/>'
    body += f'<rect x="230" y="406" width="52" height="20" rx="10" fill="{INK}"/>'
    return body

# B — Spark Bubble: a speech bubble holding a four-petal spark.
def spark_bubble():
    bubble = (f'<path d="M136 96h240a72 72 0 0 1 72 72v150a72 72 0 0 1-72 72H226l-74 58a8 8 0 0 1-13-7l6-51'
              f'a72 72 0 0 1-81-71V168a72 72 0 0 1 72-72Z" fill="#fff" stroke="{INK}" stroke-width="22" '
              f'stroke-linejoin="round"/>')
    cx, cy, r = 256, 243, 118
    spark = ""
    for a, c in zip([0, 90, 180, 270], ["coral", "ochre", "teal", "indigo"]):
        spark += (f'<path d="M0 -0.10 C0.16 -0.38 0.16 -0.70 0 -1 C-0.16 -0.70 -0.16 -0.38 0 -0.10Z" '
                  f'fill="{NN[c]}" transform="translate({cx} {cy}) rotate({a}) scale({r})"/>')
    for a, c in zip([45, 135, 225, 315], ["red", "yellow", "sage", "blue"]):
        spark += (f'<path d="M0 -0.12 C0.10 -0.30 0.10 -0.46 0 -0.62 C-0.10 -0.46 -0.10 -0.30 0 -0.12Z" '
                  f'fill="{NN[c]}" transform="translate({cx} {cy}) rotate({a}) scale({r})"/>')
    return bubble + spark

# C — Petal i: lowercase "i" whose dot is a NiceNote-style pinwheel flower.
def flower(cx, cy, r, gap=0.10):
    order = ["red", "coral", "ochre", "yellow", "sage", "teal", "blue", "indigo"]
    return "".join(petal(cx, cy, i * 45 + 8, r * 0.92, NN[c], gap) for i, c in enumerate(order))

def petal_i():
    return flower(256, 150, 104) + f'<rect x="212" y="292" width="88" height="176" rx="44" fill="{INK}"/>'

CONCEPTS = {"a-bloom": bloom(), "b-spark-bubble": spark_bubble(), "c-petal-i": petal_i()}

if __name__ == "__main__":
    for name, body in CONCEPTS.items():
        open(f"logo-{name}.svg", "w").write(svg(body))
        open(f"icon-{name}.svg", "w").write(svg(f'<g transform="translate(51 51) scale(0.8)">{body}</g>', bg="#ffffff", rx=112))
    # Small flower used as the dots of the "niceideas" wordmark.
    open("flower.svg", "w").write(svg(flower(256, 256, 240, 0.06)))
    print("ok")
